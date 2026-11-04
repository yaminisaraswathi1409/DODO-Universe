package postgres

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/uop/backend/internal/domain"
)

type CheckoutRepository struct {
	db *DB
}

func NewCheckoutRepository(db *DB) *CheckoutRepository {
	return &CheckoutRepository{db: db}
}

// hasReservationsTable checks if Migration 000026 tables are present
func (r *CheckoutRepository) hasReservationsTable(ctx context.Context) bool {
	checkQuery := `
		SELECT COUNT(*) 
		FROM information_schema.tables 
		WHERE table_schema = 'public' 
		  AND table_name IN ('inventory_reservations', 'payment_transactions');
	`
	var count int
	if err := r.db.Pool.QueryRow(ctx, checkQuery).Scan(&count); err == nil && count >= 2 {
		return true
	}
	return false
}

// GeneratePaymentSignature creates a verifiable HMAC signature for payment reference
func GeneratePaymentSignature(reference string, amount float64, secret string) string {
	if secret == "" {
		secret = "uop_checkout_secure_signature_salt_2026"
	}
	h := hmac.New(sha256.New, []byte(secret))
	h.Write([]byte(fmt.Sprintf("%s:%.2f", reference, amount)))
	return hex.EncodeToString(h.Sum(nil))
}

// ValidateCartItems validates single-vendor rules, stock availability, MOQ, optional services, and calculates authoritative pricing
func (r *CheckoutRepository) ValidateCartItems(ctx context.Context, req *domain.CartValidationRequest) (*domain.CartValidationResponse, error) {
	if len(req.Items) == 0 {
		return &domain.CartValidationResponse{
			IsValid:         false,
			RejectionReason: "Cart is empty. Add at least one offering to proceed.",
		}, nil
	}

	// 1. Aggregate duplicate item lines
	type aggItem struct {
		Quantity         int
		OptionalServices []string
	}
	itemMap := make(map[uuid.UUID]*aggItem)
	var orderedIDs []uuid.UUID

	for _, it := range req.Items {
		if it.Quantity <= 0 {
			return &domain.CartValidationResponse{
				IsValid:         false,
				RejectionReason: "Item quantity must be a positive number greater than zero.",
			}, nil
		}
		if existing, exists := itemMap[it.CatalogItemID]; exists {
			existing.Quantity += it.Quantity
			// Merge optional services uniquely
			for _, opt := range it.SelectedOptionalServices {
				found := false
				for _, exOpt := range existing.OptionalServices {
					if exOpt == opt {
						found = true
						break
					}
				}
				if !found {
					existing.OptionalServices = append(existing.OptionalServices, opt)
				}
			}
		} else {
			itemMap[it.CatalogItemID] = &aggItem{
				Quantity:         it.Quantity,
				OptionalServices: it.SelectedOptionalServices,
			}
			orderedIDs = append(orderedIDs, it.CatalogItemID)
		}
	}

	// 2. Fetch authoritative catalog items from DB
	query := `
		SELECT ci.id, ci.vendor_user_id, ci.title, ci.unit_price, COALESCE(ci.price_unit, 'PER_PIECE'),
		       ci.stock_quantity, COALESCE(ci.min_order_quantity, 1),
		       COALESCE(ci.node_type, 'BOOKABLE'), COALESCE(ci.price_type, 'FIXED'), COALESCE(ci.status, 'APPROVED'), ci.is_available,
		       COALESCE(ci.optional_services, '[]'::jsonb), COALESCE(ci.attributes, '{}'::jsonb),
		       COALESCE(ci.pickup_address, ''), COALESCE(ST_Y(ci.pickup_location::geometry), 0.0), COALESCE(ST_X(ci.pickup_location::geometry), 0.0),
		       u.id, u.full_name, u.status
		FROM vendor_catalog_items ci
		JOIN users u ON u.id = ci.vendor_user_id
		WHERE ci.id = ANY($1);
	`
	rows, err := r.db.Pool.Query(ctx, query, orderedIDs)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch cart items from database: %w", err)
	}
	defer rows.Close()

	type dbItemRow struct {
		ID               uuid.UUID
		VendorUserID     uuid.UUID
		Title            string
		UnitPrice        float64
		PriceUnit        string
		StockQuantity    int
		MinOrderQuantity int
		NodeType         string
		PriceType        string
		Status           string
		IsAvailable      bool
		OptionalServices []byte
		Attributes       []byte
		PickupAddress    string
		PickupLat        float64
		PickupLng        float64
		UserID           uuid.UUID
		VendorName       string
		UserStatus       string
	}

	dbItems := make(map[uuid.UUID]dbItemRow)
	for rows.Next() {
		var r dbItemRow
		if scanErr := rows.Scan(
			&r.ID, &r.VendorUserID, &r.Title, &r.UnitPrice, &r.PriceUnit,
			&r.StockQuantity, &r.MinOrderQuantity,
			&r.NodeType, &r.PriceType, &r.Status, &r.IsAvailable,
			&r.OptionalServices, &r.Attributes,
			&r.PickupAddress, &r.PickupLat, &r.PickupLng,
			&r.UserID, &r.VendorName, &r.UserStatus,
		); scanErr != nil {
			return nil, fmt.Errorf("scan cart item row failed: %w", scanErr)
		}
		dbItems[r.ID] = r
	}

	// 3. Check single-vendor rule and presence
	var authoritativeVendorID uuid.UUID
	var authoritativeVendorName string
	var firstPickupLat, firstPickupLng float64

	for i, id := range orderedIDs {
		itemRow, exists := dbItems[id]
		if !exists {
			return &domain.CartValidationResponse{
				IsValid:         false,
				RejectionReason: fmt.Sprintf("Offering ID %s was not found in active catalog.", id.String()),
			}, nil
		}

		if i == 0 {
			authoritativeVendorID = itemRow.VendorUserID
			authoritativeVendorName = itemRow.VendorName
			firstPickupLat = itemRow.PickupLat
			firstPickupLng = itemRow.PickupLng
		} else if itemRow.VendorUserID != authoritativeVendorID {
			return &domain.CartValidationResponse{
				IsValid:         false,
				RejectionReason: fmt.Sprintf("Single-vendor cart required: item '%s' belongs to vendor '%s', but current order is with '%s'. Catalog orders must be fulfilled by a single vendor.", itemRow.Title, itemRow.VendorName, authoritativeVendorName),
			}, nil
		}

		// Grouping node check
		if itemRow.NodeType == "GROUPING" {
			return &domain.CartValidationResponse{
				IsValid:         false,
				RejectionReason: fmt.Sprintf("'%s' is an organizational grouping node and cannot be purchased directly.", itemRow.Title),
			}, nil
		}

		// Quotation-based check
		if itemRow.PriceType == "QUOTATION" {
			return &domain.CartValidationResponse{
				IsValid:         false,
				RejectionReason: fmt.Sprintf("Offering '%s' is quotation-based and cannot be purchased directly through instant checkout. Please submit a quotation request.", itemRow.Title),
			}, nil
		}

		// Offering approval and availability check
		if (itemRow.Status != "APPROVED" && itemRow.Status != "ACTIVE_IN_CATALOG") || !itemRow.IsAvailable {
			return &domain.CartValidationResponse{
				IsValid:         false,
				RejectionReason: fmt.Sprintf("Offering '%s' is currently unavailable or not approved for checkout.", itemRow.Title),
			}, nil
		}

		// Vendor status check
		if itemRow.UserStatus == "SUSPENDED" {
			return &domain.CartValidationResponse{
				IsValid:         false,
				RejectionReason: fmt.Sprintf("Vendor '%s' is currently suspended and cannot accept new orders.", itemRow.VendorName),
			}, nil
		} else if itemRow.UserStatus != "ACTIVE" {
			return &domain.CartValidationResponse{
				IsValid:         false,
				RejectionReason: fmt.Sprintf("Vendor '%s' is currently not in active standing.", itemRow.VendorName),
			}, nil
		}
	}

	// 4. Validate MOQ, active inventory reservations, and calculate price breakdown
	var breakdowns []domain.CartItemPriceBreakdown
	var productSubtotal float64
	var optionalServicesSubtotal float64
	hasP5Tables := r.hasReservationsTable(ctx)

	for _, id := range orderedIDs {
		itemRow := dbItems[id]
		agg := itemMap[id]

		// MOQ Validation
		if itemRow.MinOrderQuantity > 1 && agg.Quantity < itemRow.MinOrderQuantity {
			return &domain.CartValidationResponse{
				IsValid:         false,
				RejectionReason: fmt.Sprintf("Requested quantity (%d) for '%s' is below vendor's minimum order quantity (%d %s).", agg.Quantity, itemRow.Title, itemRow.MinOrderQuantity, itemRow.PriceUnit),
			}, nil
		}

		// Check Active Reserved Inventory
		activeReserved := 0
		if hasP5Tables {
			_ = r.db.Pool.QueryRow(ctx, `
				SELECT COALESCE(SUM(quantity), 0)
				FROM inventory_reservations
				WHERE catalog_item_id = $1 AND status = 'RESERVED' AND expires_at > NOW();
			`, id).Scan(&activeReserved)
		}

		availableStock := itemRow.StockQuantity - activeReserved
		if itemRow.StockQuantity > 0 && agg.Quantity > availableStock {
			return &domain.CartValidationResponse{
				IsValid:         false,
				RejectionReason: fmt.Sprintf("Insufficient stock for '%s': requested %d, only %d available (%d currently reserved by checkouts).", itemRow.Title, agg.Quantity, availableStock, activeReserved),
			}, nil
		}

		// Calculate Item Subtotal with strict rounding
		itemSubtotal := math.Round(float64(agg.Quantity)*itemRow.UnitPrice*100.0) / 100.0
		productSubtotal += itemSubtotal

		// Optional Services Calculation
		var selectedServices []domain.AdditionalServiceItem
		var itemOptSubtotal float64

		if len(agg.OptionalServices) > 0 && len(itemRow.OptionalServices) > 0 {
			var availableOpts []domain.AdditionalServiceItem
			if err := json.Unmarshal(itemRow.OptionalServices, &availableOpts); err == nil {
				for _, selID := range agg.OptionalServices {
					for _, avOpt := range availableOpts {
						if avOpt.ID == selID || avOpt.Name == selID {
							selectedServices = append(selectedServices, avOpt)
							itemOptSubtotal += avOpt.Price
							break
						}
					}
				}
			}
		}

		itemOptSubtotal = math.Round(itemOptSubtotal*100.0) / 100.0
		optionalServicesSubtotal += itemOptSubtotal

		breakdowns = append(breakdowns, domain.CartItemPriceBreakdown{
			CatalogItemID:            id,
			Title:                    itemRow.Title,
			VendorUserID:             itemRow.VendorUserID,
			VendorName:               itemRow.VendorName,
			Quantity:                 agg.Quantity,
			PriceUnit:                itemRow.PriceUnit,
			UnitPrice:                itemRow.UnitPrice,
			ProductSubtotal:          itemSubtotal,
			SelectedOptionalServices: selectedServices,
			OptionalServicesSubtotal: itemOptSubtotal,
			MinOrderQuantity:         itemRow.MinOrderQuantity,
			AvailableStock:           availableStock,
		})
	}

	// 5. Calculate Delivery Fee via Haversine distance
	deliveryCharge := 0.0
	distanceKM := 0.0
	if req.DeliveryLat != 0 && req.DeliveryLng != 0 && firstPickupLat != 0 && firstPickupLng != 0 {
		dLat := (req.DeliveryLat - firstPickupLat) * math.Pi / 180.0
		dLng := (req.DeliveryLng - firstPickupLng) * math.Pi / 180.0
		a := math.Sin(dLat/2)*math.Sin(dLat/2) + math.Cos(firstPickupLat*math.Pi/180.0)*math.Cos(req.DeliveryLat*math.Pi/180.0)*math.Sin(dLng/2)*math.Sin(dLng/2)
		c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
		dist := 6371.0 * c
		distanceKM = math.Round(dist*10.0) / 10.0
		if distanceKM < 1.0 {
			distanceKM = 5.0
		}
		// Base transport tier: ₹500 base + ₹25/km after 10km
		deliveryCharge = 500.0
		if distanceKM > 10.0 {
			deliveryCharge += (distanceKM - 10.0) * 25.0
		}
		deliveryCharge = math.Round(deliveryCharge*100.0) / 100.0
	}

	platformFee := 50.00

	// Tax calculation: dynamically check if category or offering specifies an approved tax_rate in attributes
	// Eliminates arbitrary hardcoded 18% assumptions. Defaults to 0.00 if unassessed or tax-inclusive.
	var taxAmount float64
	for _, id := range orderedIDs {
		itemRow := dbItems[id]
		if len(itemRow.Attributes) > 0 {
			var attrMap map[string]interface{}
			if err := json.Unmarshal(itemRow.Attributes, &attrMap); err == nil {
				if tr, ok := attrMap["tax_rate"].(float64); ok && tr > 0 {
					itemTax := math.Round(float64(itemMap[id].Quantity) * itemRow.UnitPrice * (tr / 100.0) * 100.0) / 100.0
					taxAmount += itemTax
				}
			}
		}
	}
	taxAmount = math.Round(taxAmount*100.0) / 100.0
	finalPayable := math.Round((productSubtotal+optionalServicesSubtotal+deliveryCharge+platformFee+taxAmount)*100.0) / 100.0

	// Construct Immutable Price Snapshot
	snapshotItems := make([]domain.PriceSnapshotItem, len(breakdowns))
	for i, b := range breakdowns {
		snapshotItems[i] = domain.PriceSnapshotItem{
			Title:     b.Title,
			Quantity:  float64(b.Quantity),
			UnitPrice: b.UnitPrice,
			Subtotal:  b.ProductSubtotal,
			Unit:      b.PriceUnit,
		}
	}

	snapshot := &domain.PriceSnapshot{
		ItemTitle:       breakdowns[0].Title,
		PricingModel:    breakdowns[0].PriceUnit,
		UnitPrice:       breakdowns[0].UnitPrice,
		Quantity:        float64(breakdowns[0].Quantity),
		Subtotal:        productSubtotal,
		DistanceKM:      distanceKM,
		DeliveryCharge:  deliveryCharge,
		TransportCharge: deliveryCharge,
		ServiceFee:      platformFee,
		TotalCharges:    optionalServicesSubtotal + deliveryCharge + platformFee + taxAmount,
		FinalPayable:    finalPayable,
		Items:           snapshotItems,
		Charges: domain.PriceSnapshotCharges{
			Delivery: deliveryCharge,
			Service:  platformFee,
		},
		CalculatedAt: time.Now(),
	}

	return &domain.CartValidationResponse{
		IsValid:                  true,
		VendorUserID:             authoritativeVendorID,
		VendorName:               authoritativeVendorName,
		Items:                    breakdowns,
		ProductSubtotal:          productSubtotal,
		OptionalServicesSubtotal: optionalServicesSubtotal,
		DeliveryCharge:           deliveryCharge,
		PlatformFee:              platformFee,
		TaxAmount:                taxAmount,
		FinalPayable:             finalPayable,
		PriceSnapshot:            snapshot,
	}, nil
}

// InitiateReservationAndCheckout creates an inventory reservation, order, and payment transaction atomically
func (r *CheckoutRepository) InitiateReservationAndCheckout(ctx context.Context, req *domain.InitiateCheckoutRequest, userID uuid.UUID, validation *domain.CartValidationResponse) (*domain.InitiateCheckoutResponse, error) {
	if !validation.IsValid {
		return nil, fmt.Errorf("checkout rejected: %s", validation.RejectionReason)
	}

	tx, err := r.db.Pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to begin checkout transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// 1. Sort item IDs deterministically by UUID string to avoid deadlocks under concurrent checkouts
	sortedIDs := make([]uuid.UUID, len(validation.Items))
	for i, it := range validation.Items {
		sortedIDs[i] = it.CatalogItemID
	}
	sort.Slice(sortedIDs, func(i, j int) bool {
		return sortedIDs[i].String() < sortedIDs[j].String()
	})

	// 2. Lock inventory rows with SELECT ... FOR UPDATE
	hasP5 := r.hasReservationsTable(ctx)
	if hasP5 {
		lockQuery := `
			SELECT id, stock_quantity 
			FROM vendor_catalog_items 
			WHERE id = ANY($1) 
			ORDER BY id ASC 
			FOR UPDATE;
		`
		lockedRows, lockErr := tx.Query(ctx, lockQuery, sortedIDs)
		if lockErr != nil {
			return nil, fmt.Errorf("failed to lock catalog inventory: %w", lockErr)
		}
		lockedStock := make(map[uuid.UUID]int)
		for lockedRows.Next() {
			var id uuid.UUID
			var stock int
			if sErr := lockedRows.Scan(&id, &stock); sErr == nil {
				lockedStock[id] = stock
			}
		}
		lockedRows.Close()

		// Re-verify stock under lock
		for _, b := range validation.Items {
			currentStock := lockedStock[b.CatalogItemID]
			var activeRes int
			_ = tx.QueryRow(ctx, `
				SELECT COALESCE(SUM(quantity), 0)
				FROM inventory_reservations
				WHERE catalog_item_id = $1 AND status = 'RESERVED' AND expires_at > NOW();
			`, b.CatalogItemID).Scan(&activeRes)

			available := currentStock - activeRes
			if currentStock > 0 && b.Quantity > available {
				return nil, fmt.Errorf("insufficient stock for '%s' under current checkout: %d requested, %d available", b.Title, b.Quantity, available)
			}
		}
	}

	// 3. Create Opportunity (Order) row
	oppID := uuid.New()
	targetVendor := validation.VendorUserID
	title := fmt.Sprintf("Catalog Order: %s", validation.Items[0].Title)
	if len(validation.Items) > 1 {
		title += fmt.Sprintf(" (+%d items)", len(validation.Items)-1)
	}

	metaMap := map[string]interface{}{
		"price_snapshot":             validation.PriceSnapshot,
		"delivery_address":           req.AddressText,
		"delivery_lat":               req.DeliveryLat,
		"delivery_lng":               req.DeliveryLng,
		"cart_breakdown":             validation.Items,
		"single_vendor_confirmed":    true,
		"reservation_status":         "RESERVED",
		"inventory_lifecycle_status": "INVENTORY_RESERVED",
	}
	metaBytes, _ := json.Marshal(metaMap)

	qtyVal := float64(validation.Items[0].Quantity)
	unitPriceVal := validation.Items[0].UnitPrice
	finalTotal := validation.FinalPayable

	oppQuery := `
		INSERT INTO opportunities (
			id, user_id, assigned_user_id, target_vendor_id, catalog_item_id,
			type, order_mode, title, description, workflow_model, status,
			lat, lng, address_text, radius_km, quantity, unit_price, total_price,
			budget_max, price_unit, metadata, created_at, updated_at
		) VALUES (
			$1, $2, $3, $4, $5,
			'NEED', 'CATALOG_ORDER', $6, $7, 'INSTANT', 'INVENTORY_RESERVED',
			$8, $9, $10, 50.0, $11, $12, $13,
			$13, $14, $15, NOW(), NOW()
		);
	`
	_, oppErr := tx.Exec(
		ctx, oppQuery,
		oppID, userID, targetVendor, targetVendor, validation.Items[0].CatalogItemID,
		title, fmt.Sprintf("Direct catalog checkout from %s", validation.VendorName),
		req.DeliveryLat, req.DeliveryLng, req.AddressText,
		qtyVal, unitPriceVal, finalTotal,
		validation.Items[0].PriceUnit, metaBytes,
	)
	if oppErr != nil {
		return nil, fmt.Errorf("failed to create opportunity order: %w", oppErr)
	}

	// 4. Create inventory reservations
	expiresAt := time.Now().Add(15 * time.Minute)
	if hasP5 {
		for _, b := range validation.Items {
			resID := uuid.New()
			idempKey := fmt.Sprintf("%s:%s:%s", req.IdempotencyKey, oppID.String(), b.CatalogItemID.String())
			_, resErr := tx.Exec(ctx, `
				INSERT INTO inventory_reservations (
					id, catalog_item_id, opportunity_id, user_id, quantity,
					status, idempotency_key, expires_at, created_at, updated_at
				) VALUES ($1, $2, $3, $4, $5, 'RESERVED', $6, $7, NOW(), NOW());
			`, resID, b.CatalogItemID, oppID, userID, b.Quantity, idempKey, expiresAt)
			if resErr != nil {
				return nil, fmt.Errorf("failed to insert inventory reservation: %w", resErr)
			}
		}
	}

	// 5. Create Payment Transaction row
	paymentRef := fmt.Sprintf("PAY_UOP_%d_%s", time.Now().Unix(), uuid.New().String()[:8])
	paymentSig := GeneratePaymentSignature(paymentRef, finalTotal, "")
	paymentMethod := req.PaymentMethod
	if paymentMethod == "" {
		paymentMethod = "GATEWAY_SIMULATED"
	}

	if hasP5 {
		_, payErr := tx.Exec(ctx, `
			INSERT INTO payment_transactions (
				id, opportunity_id, user_id, amount, currency,
				payment_method, payment_reference, status, callback_signature, created_at, updated_at
			) VALUES (gen_random_uuid(), $1, $2, $3, 'INR', $4, $5, 'PENDING', $6, NOW(), NOW());
		`, oppID, userID, finalTotal, paymentMethod, paymentRef, paymentSig)
		if payErr != nil {
			return nil, fmt.Errorf("failed to create payment transaction: %w", payErr)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("failed to commit checkout transaction: %w", err)
	}

	return &domain.InitiateCheckoutResponse{
		OpportunityID:      oppID,
		PaymentReference:   paymentRef,
		PaymentSignature:   paymentSig,
		Amount:             finalTotal,
		Currency:           "INR",
		ReservationExpires: expiresAt,
		Validation:         validation,
	}, nil
}

// ProcessPaymentCallback verifies signature, commits inventory, holds escrow, and confirms the order
func (r *CheckoutRepository) ProcessPaymentCallback(ctx context.Context, req *domain.PaymentCallbackRequest) (*domain.PaymentTransaction, error) {
	tx, err := r.db.Pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to start payment transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	hasP5 := r.hasReservationsTable(ctx)
	if !hasP5 {
		_ = tx.Commit(ctx)
		return &domain.PaymentTransaction{
			PaymentReference: req.PaymentReference,
			Status:           domain.PaymentStatus(req.Status),
		}, nil
	}

	// 1. Lock and retrieve payment transaction by reference
	var txn domain.PaymentTransaction
	err = tx.QueryRow(ctx, `
		SELECT id, opportunity_id, user_id, amount, currency, payment_method, payment_reference, status
		FROM payment_transactions
		WHERE payment_reference = $1
		FOR UPDATE;
	`, req.PaymentReference).Scan(
		&txn.ID, &txn.OpportunityID, &txn.UserID, &txn.Amount, &txn.Currency, &txn.PaymentMethod, &txn.PaymentReference, &txn.Status,
	)
	if err != nil {
		return nil, fmt.Errorf("payment transaction not found for reference '%s': %w", req.PaymentReference, err)
	}

	// Idempotency: if already SUCCESS, return without double-processing
	if txn.Status == domain.PaymentSuccess {
		_ = tx.Commit(ctx)
		return &txn, nil
	}

	// Replay / Terminal state protection
	if txn.Status == domain.PaymentFailed || txn.Status == domain.PaymentExpired || txn.Status == domain.PaymentRefunded {
		return nil, fmt.Errorf("payment transaction '%s' is in terminal state '%s'; callback replay rejected", txn.PaymentReference, txn.Status)
	}

	// 2. Cryptographic Constant-Time Signature verification
	if strings.TrimSpace(req.Signature) == "" {
		return nil, fmt.Errorf("missing payment callback signature")
	}
	expectedSig := GeneratePaymentSignature(txn.PaymentReference, txn.Amount, "")
	if !hmac.Equal([]byte(req.Signature), []byte(expectedSig)) {
		return nil, fmt.Errorf("invalid payment callback signature: HMAC verification failed")
	}

	// 3. Amount & Currency Sanity
	if txn.Amount <= 0 {
		return nil, fmt.Errorf("invalid transaction amount: %.2f", txn.Amount)
	}
	if txn.Currency != "INR" {
		return nil, fmt.Errorf("unsupported transaction currency: %s", txn.Currency)
	}

	statusUpper := strings.ToUpper(strings.TrimSpace(req.Status))

	if statusUpper == "SUCCESS" {
		// Verify reservation has not expired
		var expiredCount int
		_ = tx.QueryRow(ctx, `
			SELECT COUNT(*) FROM inventory_reservations
			WHERE opportunity_id = $1 AND status = 'RESERVED' AND expires_at < NOW();
		`, txn.OpportunityID).Scan(&expiredCount)

		if expiredCount > 0 {
			// Reservation expired before payment: mark REFUND_PENDING
			_, _ = tx.Exec(ctx, `
				UPDATE payment_transactions
				SET status = 'REFUNDED', callback_payload = $2, updated_at = NOW()
				WHERE id = $1;
			`, txn.ID, []byte(fmt.Sprintf(`{"reason": "reservation_expired", "gateway_txn_id": "%s"}`, req.GatewayTxnID)))
			_, _ = tx.Exec(ctx, `
				UPDATE opportunities
				SET status = 'EXPIRED', updated_at = NOW()
				WHERE id = $1;
			`, txn.OpportunityID)
			_ = tx.Commit(ctx)
			return nil, fmt.Errorf("checkout reservation expired prior to payment confirmation. Refund initiated.")
		}

		// Commit inventory reservations
		_, _ = tx.Exec(ctx, `
			UPDATE inventory_reservations
			SET status = 'COMMITTED', updated_at = NOW()
			WHERE opportunity_id = $1 AND status = 'RESERVED';
		`, txn.OpportunityID)

		// Deduct permanent physical stock from vendor_catalog_items
		_, _ = tx.Exec(ctx, `
			UPDATE vendor_catalog_items ci
			SET stock_quantity = GREATEST(0, ci.stock_quantity - ir.quantity),
			    updated_at = NOW()
			FROM inventory_reservations ir
			WHERE ir.catalog_item_id = ci.id
			  AND ir.opportunity_id = $1
			  AND ir.status = 'COMMITTED';
		`, txn.OpportunityID)

		// Create Escrow Hold in escrow_ledger idempotently
		var payeeID uuid.UUID
		_ = tx.QueryRow(ctx, `SELECT COALESCE(target_vendor_id, assigned_user_id) FROM opportunities WHERE id = $1;`, txn.OpportunityID).Scan(&payeeID)

		escrowMeta, _ := json.Marshal(map[string]interface{}{
			"payment_reference": txn.PaymentReference,
			"gateway_txn_id":    req.GatewayTxnID,
			"committed_at":      time.Now(),
		})

		_, _ = tx.Exec(ctx, `
			INSERT INTO escrow_ledger (
				id, root_opportunity_id, opportunity_id, payer_id, payee_id,
				amount, escrow_type, status, metadata, created_at, updated_at
			) VALUES (
				gen_random_uuid(), $1, $1, $2, $3,
				$4, 'CATALOG_PURCHASE', 'HELD', $5, NOW(), NOW()
			) ON CONFLICT DO NOTHING;
		`, txn.OpportunityID, txn.UserID, payeeID, txn.Amount, escrowMeta)

		// Confirm Opportunity order
		_, _ = tx.Exec(ctx, `
			UPDATE opportunities
			SET status = 'ORDER_CONFIRMED', updated_at = NOW()
			WHERE id = $1;
		`, txn.OpportunityID)

		// Mark Payment Transaction SUCCESS
		_, _ = tx.Exec(ctx, `
			UPDATE payment_transactions
			SET status = 'SUCCESS', callback_signature = $2, callback_payload = $3, updated_at = NOW()
			WHERE id = $1;
		`, txn.ID, req.Signature, []byte(fmt.Sprintf(`{"gateway_txn_id": "%s"}`, req.GatewayTxnID)))
		txn.Status = domain.PaymentSuccess

	} else {
		// Payment failed: release active reservations
		_, _ = tx.Exec(ctx, `
			UPDATE inventory_reservations
			SET status = 'RELEASED', updated_at = NOW()
			WHERE opportunity_id = $1 AND status = 'RESERVED';
		`, txn.OpportunityID)

		_, _ = tx.Exec(ctx, `
			UPDATE opportunities
			SET status = 'PAYMENT_FAILED', updated_at = NOW()
			WHERE id = $1;
		`, txn.OpportunityID)

		_, _ = tx.Exec(ctx, `
			UPDATE payment_transactions
			SET status = 'FAILED', callback_payload = $2, updated_at = NOW()
			WHERE id = $1;
		`, txn.ID, []byte(fmt.Sprintf(`{"reason": "%s"}`, req.FailureReason)))
		txn.Status = domain.PaymentFailed
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("failed to commit payment callback: %w", err)
	}

	return &txn, nil
}

// CancelCheckoutOrder cancels order and releases any active inventory reservation safely
func (r *CheckoutRepository) CancelCheckoutOrder(ctx context.Context, oppID, userID uuid.UUID) error {
	tx, err := r.db.Pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("failed to start cancellation tx: %w", err)
	}
	defer tx.Rollback(ctx)

	var currentStatus string
	var orderUserID uuid.UUID
	err = tx.QueryRow(ctx, `SELECT status, user_id FROM opportunities WHERE id = $1 FOR UPDATE;`, oppID).Scan(&currentStatus, &orderUserID)
	if err != nil {
		return fmt.Errorf("order not found: %w", err)
	}

	if orderUserID != userID {
		return fmt.Errorf("unauthorized: order belongs to another customer")
	}

	if currentStatus == "COMPLETED" || currentStatus == "SETTLED" {
		return fmt.Errorf("cannot cancel order that is already completed or settled")
	}

	if currentStatus == "CANCELLED" {
		_ = tx.Commit(ctx)
		return nil
	}

	hasP5 := r.hasReservationsTable(ctx)
	if hasP5 {
		// Release any active reserved inventory
		_, _ = tx.Exec(ctx, `
			UPDATE inventory_reservations
			SET status = 'RELEASED', updated_at = NOW()
			WHERE opportunity_id = $1 AND status = 'RESERVED';
		`, oppID)
	}

	// Refund escrow if held
	_, _ = tx.Exec(ctx, `
		UPDATE escrow_ledger
		SET status = 'REFUNDED', updated_at = NOW()
		WHERE root_opportunity_id = $1 AND status = 'HELD';
	`, oppID)

	_, _ = tx.Exec(ctx, `
		UPDATE opportunities
		SET status = 'CANCELLED', updated_at = NOW()
		WHERE id = $1;
	`, oppID)

	return tx.Commit(ctx)
}

// ExpireStaleReservations executes an atomic sweep of expired reservations and updates associated opportunities
func (r *CheckoutRepository) ExpireStaleReservations(ctx context.Context) (int64, error) {
	if !r.hasReservationsTable(ctx) {
		return 0, nil
	}

	tx, err := r.db.Pool.Begin(ctx)
	if err != nil {
		return 0, fmt.Errorf("failed to begin expiry transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// 1. Atomically transition expired active reservations to EXPIRED
	res, err := tx.Exec(ctx, `
		UPDATE inventory_reservations
		SET status = 'EXPIRED', updated_at = NOW()
		WHERE status = 'RESERVED' AND expires_at <= NOW();
	`)
	if err != nil {
		return 0, fmt.Errorf("failed to expire reservations: %w", err)
	}
	expiredCount := res.RowsAffected()

	if expiredCount > 0 {
		// 2. Mark corresponding opportunity as EXPIRED if pending inventory reservation
		_, _ = tx.Exec(ctx, `
			UPDATE opportunities opp
			SET status = 'EXPIRED', updated_at = NOW()
			WHERE opp.status = 'INVENTORY_RESERVED'
			  AND EXISTS (
				SELECT 1 FROM inventory_reservations ir
				WHERE ir.opportunity_id = opp.id AND ir.status = 'EXPIRED'
			  )
			  AND NOT EXISTS (
				SELECT 1 FROM inventory_reservations ir
				WHERE ir.opportunity_id = opp.id AND ir.status = 'RESERVED'
			  );
		`)

		// 3. Mark payment transaction as EXPIRED if still PENDING
		_, _ = tx.Exec(ctx, `
			UPDATE payment_transactions pt
			SET status = 'EXPIRED', updated_at = NOW()
			WHERE pt.status = 'PENDING'
			  AND EXISTS (
				SELECT 1 FROM inventory_reservations ir
				WHERE ir.opportunity_id = pt.opportunity_id AND ir.status = 'EXPIRED'
			  );
		`)
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, fmt.Errorf("failed to commit expiry transaction: %w", err)
	}

	return expiredCount, nil
}

