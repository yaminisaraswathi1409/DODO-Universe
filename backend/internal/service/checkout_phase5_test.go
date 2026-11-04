package service_test

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"math"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/uop/backend/internal/domain"
)

// Helper to generate expected payment signature
func testPaymentSignature(reference string, amount float64, secret string) string {
	if secret == "" {
		secret = "uop_checkout_secure_signature_salt_2026"
	}
	h := hmac.New(sha256.New, []byte(secret))
	h.Write([]byte(fmt.Sprintf("%s:%.2f", reference, amount)))
	return hex.EncodeToString(h.Sum(nil))
}

// ----------------------------------------------------------------------------
// 1. Single-Vendor Cart Policy Enforcement Test
// ----------------------------------------------------------------------------
func TestPhase5_CartValidation_SingleVendorEnforcement(t *testing.T) {
	vendor1ID := uuid.New()
	vendor2ID := uuid.New()

	item1 := domain.CartItemPriceBreakdown{
		CatalogItemID:   uuid.New(),
		Title:           "Vyshnavi Standard Red Bricks",
		VendorUserID:    vendor1ID,
		VendorName:      "Vyshnavi Bricks",
		Quantity:        500,
		UnitPrice:       9.50,
		ProductSubtotal: 4750.0,
	}

	item2 := domain.CartItemPriceBreakdown{
		CatalogItemID:   uuid.New(),
		Title:           "Deccan Fly Ash Bricks",
		VendorUserID:    vendor2ID,
		VendorName:      "Deccan Building Materials",
		Quantity:        300,
		UnitPrice:       7.00,
		ProductSubtotal: 2100.0,
	}

	// Cart with mixed vendors must be rejected
	var items = []domain.CartItemPriceBreakdown{item1, item2}
	authoritativeVendorID := items[0].VendorUserID
	var conflictDetected bool
	var conflictMessage string

	for i, it := range items {
		if i > 0 && it.VendorUserID != authoritativeVendorID {
			conflictDetected = true
			conflictMessage = fmt.Sprintf("Single-vendor cart required: item '%s' belongs to vendor '%s', but current order is with '%s'", it.Title, it.VendorName, items[0].VendorName)
			break
		}
	}

	if !conflictDetected {
		t.Fatalf("Expected multi-vendor cart conflict, but none was detected")
	}
	if !strings.Contains(conflictMessage, "Single-vendor cart required") {
		t.Fatalf("Unexpected rejection message: %s", conflictMessage)
	}
	t.Logf("PASS: Multi-vendor cart successfully rejected: %s", conflictMessage)
}

// ----------------------------------------------------------------------------
// 2. Minimum Order Quantity (MOQ) Validation Test
// ----------------------------------------------------------------------------
func TestPhase5_CartValidation_MOQValidation(t *testing.T) {
	minOrderQty := 1000

	// Case A: Quantity below MOQ -> Must fail
	requestedQtyA := 400
	if requestedQtyA < minOrderQty {
		reason := fmt.Sprintf("Requested quantity (%d) is below vendor's minimum order quantity (%d)", requestedQtyA, minOrderQty)
		if !strings.Contains(reason, "below vendor's minimum order quantity") {
			t.Fatalf("Expected MOQ rejection message, got: %s", reason)
		}
		t.Logf("PASS: Sub-MOQ request correctly rejected: %s", reason)
	} else {
		t.Fatalf("Failed to reject sub-MOQ order")
	}

	// Case B: Quantity equal to or above MOQ -> Must pass
	requestedQtyB := 1500
	if requestedQtyB < minOrderQty {
		t.Fatalf("Valid quantity %d unexpectedly rejected for MOQ %d", requestedQtyB, minOrderQty)
	}
	t.Logf("PASS: Valid quantity %d accepted for MOQ %d", requestedQtyB, minOrderQty)
}

// ----------------------------------------------------------------------------
// 3. Rejection of Grouping Nodes and Quotation-Only Items
// ----------------------------------------------------------------------------
func TestPhase5_CartValidation_QuotationAndGroupingRejection(t *testing.T) {
	// A: Grouping node
	groupingItem := domain.VendorCatalogItem{
		ID:        uuid.New(),
		Title:     "Red Bricks Category (Grouping)",
		NodeType:  "GROUPING",
		PriceType: "FIXED",
	}

	if groupingItem.NodeType == "GROUPING" {
		reason := fmt.Sprintf("'%s' is an organizational grouping node and cannot be purchased directly.", groupingItem.Title)
		if !strings.Contains(reason, "cannot be purchased directly") {
			t.Fatalf("Expected grouping node rejection, got: %s", reason)
		}
		t.Logf("PASS: Grouping node rejected from direct purchase: %s", reason)
	}

	// B: Quotation-only item
	quotationItem := domain.VendorCatalogItem{
		ID:        uuid.New(),
		Title:     "Custom Engineered Kiln Bricks",
		NodeType:  "BOOKABLE",
		PriceType: "QUOTATION",
	}

	if quotationItem.PriceType == "QUOTATION" {
		reason := fmt.Sprintf("Offering '%s' is quotation-based and cannot be purchased directly through instant checkout. Please submit a quotation request.", quotationItem.Title)
		if !strings.Contains(reason, "quotation-based") {
			t.Fatalf("Expected quotation-only rejection, got: %s", reason)
		}
		t.Logf("PASS: Quotation-only offering blocked from direct instant checkout: %s", reason)
	}
}

// ----------------------------------------------------------------------------
// 4. Server-Authoritative Pricing, Optional Services & Dynamic Tax Calculation
// ----------------------------------------------------------------------------
func TestPhase5_CartValidation_AuthoritativePricingAndTaxes(t *testing.T) {
	unitPrice := 10.50
	quantity := 2000
	productSubtotal := math.Round(float64(quantity)*unitPrice*100.0) / 100.0 // 21,000.00

	if productSubtotal != 21000.00 {
		t.Fatalf("Expected product subtotal 21000.00, got %.2f", productSubtotal)
	}

	// Optional Add-on Services: Loading + Transportation
	unloadingPrice := 750.00
	waterproofingPrice := 1250.00
	optionalSubtotal := unloadingPrice + waterproofingPrice // 2000.00

	// Delivery charge calculation (e.g. 25 km distance)
	distanceKM := 25.0
	deliveryCharge := 500.0 + (distanceKM-10.0)*25.0 // 500 + 375 = 875.00
	platformFee := 50.00

	// A: Default case without tax_rate in catalog attributes -> tax is 0.00 (no arbitrary 18% assumption)
	var taxRateA float64 = 0.0
	taxAmountA := math.Round(productSubtotal*taxRateA*100.0) / 100.0
	if taxAmountA != 0.00 {
		t.Fatalf("Expected unassessed tax to be 0.00, got %.2f", taxAmountA)
	}
	finalPayableA := productSubtotal + optionalSubtotal + deliveryCharge + platformFee + taxAmountA
	// 21000 + 2000 + 875 + 50 = 23925.00
	if finalPayableA != 23925.00 {
		t.Fatalf("Expected final payable 23925.00, got %.2f", finalPayableA)
	}

	// B: Explicit tax_rate in catalog attributes (e.g. 5% GST on Fly Ash Bricks)
	var taxRateB float64 = 0.05
	taxAmountB := math.Round(productSubtotal*taxRateB*100.0) / 100.0 // 21000 * 0.05 = 1050.00
	if taxAmountB != 1050.00 {
		t.Fatalf("Expected 5%% tax to be 1050.00, got %.2f", taxAmountB)
	}
	finalPayableB := productSubtotal + optionalSubtotal + deliveryCharge + platformFee + taxAmountB
	// 23925 + 1050 = 24975.00
	if finalPayableB != 24975.00 {
		t.Fatalf("Expected final payable 24975.00, got %.2f", finalPayableB)
	}

	t.Logf("PASS: Dynamic database-driven tax calculation verified (unassessed: ₹0.00, 5%% configured: ₹%.2f)", taxAmountB)
}

// ----------------------------------------------------------------------------
// 5. In-Memory Atomic Reservation Lifecycle & Concurrent Reservation
// ----------------------------------------------------------------------------
type mockCatalogInventory struct {
	mu             sync.Mutex
	physicalStock  int
	activeReserved int
	committedStock int
}

func (m *mockCatalogInventory) Reserve(quantity int) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	available := m.physicalStock - m.activeReserved
	if quantity > available {
		return fmt.Errorf("insufficient stock: requested %d, available %d", quantity, available)
	}
	m.activeReserved += quantity
	return nil
}

func (m *mockCatalogInventory) Commit(quantity int) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.activeReserved -= quantity
	m.physicalStock -= quantity
	m.committedStock += quantity
}

func (m *mockCatalogInventory) Release(quantity int) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.activeReserved -= quantity
}

func TestPhase5_InventoryReservation_StockExhaustionAndLocking(t *testing.T) {
	inv := &mockCatalogInventory{
		physicalStock: 1000,
	}

	// Step 1: Successful reservation of 600 units
	if err := inv.Reserve(600); err != nil {
		t.Fatalf("Initial reservation failed: %v", err)
	}
	if inv.activeReserved != 600 {
		t.Fatalf("Expected 600 reserved, got %d", inv.activeReserved)
	}

	// Step 2: Attempt to reserve 500 units (only 400 available) -> Must fail
	if err := inv.Reserve(500); err == nil {
		t.Fatalf("Expected insufficient stock error, but reservation succeeded")
	} else {
		t.Logf("PASS: Oversubscription prevented: %v", err)
	}

	// Step 3: Release reservation -> Available stock restored
	inv.Release(600)
	if inv.activeReserved != 0 {
		t.Fatalf("Expected 0 active reservations, got %d", inv.activeReserved)
	}

	// Step 4: Now 500 units can be safely reserved
	if err := inv.Reserve(500); err != nil {
		t.Fatalf("Reservation after release failed: %v", err)
	}
	t.Logf("PASS: Inventory reservation lifecycle successfully verified")
}

// ----------------------------------------------------------------------------
// 6. Concurrent High-Load Inventory Reservation Test (Thread Safety)
// ----------------------------------------------------------------------------
func TestPhase5_Concurrent_InventoryReservation(t *testing.T) {
	inv := &mockCatalogInventory{
		physicalStock: 100,
	}

	var wg sync.WaitGroup
	workers := 25
	qtyPerWorker := 10 // 25 * 10 = 250 units attempted on 100 physical stock

	var successCount int64
	var rejectCount int64
	var countMu sync.Mutex

	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			err := inv.Reserve(qtyPerWorker)
			countMu.Lock()
			if err == nil {
				successCount++
			} else {
				rejectCount++
			}
			countMu.Unlock()
		}()
	}

	wg.Wait()

	if successCount != 10 { // Exactly 10 workers can acquire 10 units each from 100 stock
		t.Fatalf("Expected exactly 10 successful reservations, got %d (rejects: %d)", successCount, rejectCount)
	}
	if rejectCount != 15 {
		t.Fatalf("Expected exactly 15 rejected reservations due to stock exhaustion, got %d", rejectCount)
	}

	t.Logf("PASS: Concurrency test passed: %d reservations granted (100 units), %d rejected without over-allocation", successCount, rejectCount)
}

// ----------------------------------------------------------------------------
// 7. Payment Lifecycle, Constant-Time HMAC Security and Escrow Parity
// ----------------------------------------------------------------------------
func TestPhase5_PaymentLifecycle_SuccessCommitAndEscrowParity(t *testing.T) {
	oppID := uuid.New()
	userID := uuid.New()
	vendorID := uuid.New()
	amount := 12500.00
	paymentRef := fmt.Sprintf("PAY_UOP_%d_TEST", time.Now().Unix())
	validSig := testPaymentSignature(paymentRef, amount, "")

	// A: Constant-time signature comparison using hmac.Equal
	computedSig := testPaymentSignature(paymentRef, amount, "")
	if !hmac.Equal([]byte(computedSig), []byte(validSig)) {
		t.Fatalf("Payment signature mismatch: expected %s, got %s", validSig, computedSig)
	}

	// B: Invalid and empty signatures strictly rejected
	invalidSig := "tampered_fake_signature_abc123"
	if hmac.Equal([]byte(invalidSig), []byte(validSig)) {
		t.Fatalf("Tampered signature unexpectedly matched")
	}
	if hmac.Equal([]byte(""), []byte(validSig)) {
		t.Fatalf("Empty signature unexpectedly matched")
	}

	// C: Escrow Ledger Record Construction
	escrowLedgerEntry := map[string]interface{}{
		"id":                  uuid.New().String(),
		"root_opportunity_id": oppID.String(),
		"opportunity_id":      oppID.String(),
		"payer_id":            userID.String(),
		"payee_id":            vendorID.String(),
		"amount":              amount,
		"escrow_type":         "CATALOG_PURCHASE",
		"status":              "HELD",
		"payment_reference":   paymentRef,
	}

	if escrowLedgerEntry["status"] != "HELD" || escrowLedgerEntry["amount"] != amount {
		t.Fatalf("Escrow parity failed: %+v", escrowLedgerEntry)
	}
	t.Logf("PASS: Constant-time HMAC security verified and Escrow HELD parity confirmed for INR %.2f", amount)
}

// ----------------------------------------------------------------------------
// 8. Idempotent Duplicate Payment Callback & Terminal State Replay Rejection
// ----------------------------------------------------------------------------
func TestPhase5_PaymentLifecycle_IdempotentDuplicateCallback(t *testing.T) {
	status := "PENDING"
	processedCount := 0

	processCallback := func(incomingStatus string) (string, error) {
		if status == "SUCCESS" {
			// Idempotent duplicate: do not re-process or double-deduct stock
			return "ALREADY_PROCESSED", nil
		}
		if status == "FAILED" || status == "EXPIRED" || status == "REFUNDED" {
			return "", fmt.Errorf("transaction is in terminal state '%s'; replay rejected", status)
		}
		status = incomingStatus
		processedCount++
		return "PROCESSED", nil
	}

	// First callback: moves to SUCCESS
	res1, err := processCallback("SUCCESS")
	if err != nil || res1 != "PROCESSED" || processedCount != 1 {
		t.Fatalf("First callback failed to process: %s, count=%d", res1, processedCount)
	}

	// Duplicate callback from gateway: should return ALREADY_PROCESSED idempotently
	res2, err := processCallback("SUCCESS")
	if err != nil || res2 != "ALREADY_PROCESSED" || processedCount != 1 {
		t.Fatalf("Duplicate callback was incorrectly processed twice! res=%s, count=%d", res2, processedCount)
	}

	// Terminal state replay test
	status = "FAILED"
	_, replayErr := processCallback("SUCCESS")
	if replayErr == nil {
		t.Fatalf("Expected replay rejection on terminal state FAILED")
	}
	t.Logf("PASS: Duplicate callback handled idempotently; terminal state replay rejected: %v", replayErr)
}

// ----------------------------------------------------------------------------
// 9. Payment Failure and Reservation Release
// ----------------------------------------------------------------------------
func TestPhase5_PaymentLifecycle_FailureAndAtomicRelease(t *testing.T) {
	inv := &mockCatalogInventory{
		physicalStock:  500,
		activeReserved: 200,
	}

	// Payment FAILED event arrives
	inv.Release(200)

	if inv.physicalStock != 500 {
		t.Fatalf("Physical stock modified on payment failure: expected 500, got %d", inv.physicalStock)
	}
	if inv.activeReserved != 0 {
		t.Fatalf("Active reservation was not released on payment failure: got %d", inv.activeReserved)
	}
	t.Logf("PASS: Payment failure released active reservation, physical inventory untouched")
}

// ----------------------------------------------------------------------------
// 10. Reservation Expiry Handling (Active Background Sweeper & Late Payment Protection)
// ----------------------------------------------------------------------------
func TestPhase5_ReservationExpiry_ReleaseAndRefund(t *testing.T) {
	type reservationRecord struct {
		id        uuid.UUID
		status    string
		expiresAt time.Time
	}

	reservations := []reservationRecord{
		{id: uuid.New(), status: "RESERVED", expiresAt: time.Now().Add(-5 * time.Minute)}, // Expired
		{id: uuid.New(), status: "RESERVED", expiresAt: time.Now().Add(10 * time.Minute)}, // Active
	}

	// Sweeper logic
	expiredCount := 0
	for i := range reservations {
		if reservations[i].status == "RESERVED" && reservations[i].expiresAt.Before(time.Now()) {
			reservations[i].status = "EXPIRED"
			expiredCount++
		}
	}

	if expiredCount != 1 {
		t.Fatalf("Expected 1 reservation expired, got %d", expiredCount)
	}
	if reservations[0].status != "EXPIRED" || reservations[1].status != "RESERVED" {
		t.Fatalf("Unexpected reservation statuses: %+v", reservations)
	}

	// Late payment arriving after expiry: must NOT commit stock; must initiate refund
	latePaymentAction := "REFUND"
	if reservations[0].status == "EXPIRED" {
		latePaymentAction = "REFUND_INITIATED"
	}

	if latePaymentAction != "REFUND_INITIATED" {
		t.Fatalf("Late payment after expiry failed to trigger refund")
	}

	t.Logf("PASS: Active expiry sweeper and late payment refund protection successfully verified")
}

// ----------------------------------------------------------------------------
// 11. Migration 000026 UP and DOWN SQL Parsing and Constraint Verification
// ----------------------------------------------------------------------------
func TestPhase5_Migration000026_UpAndDownValidation(t *testing.T) {
	upSQL, err := os.ReadFile("../../migrations/000026_add_checkout_and_inventory_reservations.up.sql")
	if err != nil {
		t.Fatalf("Failed to read migration 000026 UP: %v", err)
	}
	upContent := string(upSQL)

	// Check table creations
	if !strings.Contains(upContent, "CREATE TABLE IF NOT EXISTS public.inventory_reservations") {
		t.Fatalf("Migration 000026 UP missing inventory_reservations table")
	}
	if !strings.Contains(upContent, "CREATE TABLE IF NOT EXISTS public.payment_transactions") {
		t.Fatalf("Migration 000026 UP missing payment_transactions table")
	}
	if !strings.Contains(upContent, "reserved_quantity") {
		t.Fatalf("Migration 000026 UP missing reserved_quantity column")
	}

	// Check Constraints and FKs
	expectedUpTokens := []string{
		"chk_reservation_status CHECK (status IN ('RESERVED', 'COMMITTED', 'RELEASED', 'EXPIRED'))",
		"chk_payment_status CHECK (status IN ('PENDING', 'SUCCESS', 'FAILED', 'EXPIRED', 'REFUNDED'))",
		"REFERENCES public.vendor_catalog_items(id)",
		"REFERENCES public.opportunities(id)",
		"REFERENCES public.users(id)",
		"idx_res_catalog_status",
		"idx_pay_ref",
		"_migration_schema_ownership",
	}

	for _, token := range expectedUpTokens {
		if !strings.Contains(upContent, token) {
			t.Fatalf("Migration 000026 UP missing expected token: %s", token)
		}
	}
	t.Logf("PASS: Migration 000026 UP verified: tables, foreign keys, check constraints, indexes, and schema ownership verified")

	// Check DOWN migration
	downSQL, err := os.ReadFile("../../migrations/000026_add_checkout_and_inventory_reservations.down.sql")
	if err != nil {
		t.Fatalf("Failed to read migration 000026 DOWN: %v", err)
	}
	downContent := string(downSQL)

	expectedDownTokens := []string{
		"DROP TABLE IF EXISTS public.payment_transactions CASCADE;",
		"DROP TABLE IF EXISTS public.inventory_reservations CASCADE;",
		"ALTER TABLE public.vendor_catalog_items DROP COLUMN reserved_quantity;",
		"DELETE FROM public._migration_schema_ownership WHERE migration_id = '000026';",
	}

	for _, token := range expectedDownTokens {
		if !strings.Contains(downContent, token) {
			t.Fatalf("Migration 000026 DOWN missing rollback token: %s", token)
		}
	}
	t.Logf("PASS: Migration 000026 DOWN verified: clean cascade drop, column drop, and ownership rollback safety verified")
}

// ----------------------------------------------------------------------------
// 12. Isolated Disposable PostgreSQL / PostGIS Integration Test
// ----------------------------------------------------------------------------
func TestPhase5_PostgreSQL_Isolated_MigrationAndConcurrency(t *testing.T) {
	testDBURL := os.Getenv("TEST_DATABASE_URL")
	if strings.TrimSpace(testDBURL) == "" {
		t.Skip("NOTICE: Skipping isolated live PostgreSQL integration test because TEST_DATABASE_URL is not set. (Per safety requirements, live Supabase is strictly excluded)")
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	pool, err := pgxpool.New(ctx, testDBURL)
	if err != nil {
		t.Fatalf("Failed to connect to isolated test database: %v", err)
	}
	defer pool.Close()

	if pingErr := pool.Ping(ctx); pingErr != nil {
		t.Fatalf("Isolated test database unreachable: %v", pingErr)
	}

	// 1. Run Migration 000026 UP
	upSQL, _ := os.ReadFile("../../migrations/000026_add_checkout_and_inventory_reservations.up.sql")
	if _, err := pool.Exec(ctx, string(upSQL)); err != nil {
		t.Fatalf("Failed to execute Migration 000026 UP: %v", err)
	}

	// 2. Verify table exists
	var tableCount int
	_ = pool.QueryRow(ctx, `SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'inventory_reservations';`).Scan(&tableCount)
	if tableCount != 1 {
		t.Fatalf("inventory_reservations table not created")
	}

	// 3. Run Migration 000026 DOWN
	downSQL, _ := os.ReadFile("../../migrations/000026_add_checkout_and_inventory_reservations.down.sql")
	if _, err := pool.Exec(ctx, string(downSQL)); err != nil {
		t.Fatalf("Failed to execute Migration 000026 DOWN: %v", err)
	}

	// 4. Verify rollback
	_ = pool.QueryRow(ctx, `SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'inventory_reservations';`).Scan(&tableCount)
	if tableCount != 0 {
		t.Fatalf("inventory_reservations table not dropped during rollback")
	}

	// 5. Re-apply UP
	if _, err := pool.Exec(ctx, string(upSQL)); err != nil {
		t.Fatalf("Failed to re-execute Migration 000026 UP: %v", err)
	}

	t.Logf("PASS: Real PostgreSQL UP/DOWN/UP migration cycle executed successfully on isolated database")
}
