package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/uop/backend/internal/domain"
)

type OpportunityRepository struct {
	db *DB
}

func NewOpportunityRepository(db *DB) *OpportunityRepository {
	return &OpportunityRepository{db: db}
}

func (r *OpportunityRepository) GetCategoryByID(ctx context.Context, id uuid.UUID) (*domain.Category, error) {
	query := `
		SELECT id, slug, name, COALESCE(description, ''), COALESCE(icon, ''), default_workflow,
		       COALESCE(required_documents, '[]'::jsonb), COALESCE(opportunity_fields, '[]'::jsonb),
		       COALESCE(vehicle_fields, '[]'::jsonb), COALESCE(driver_fields, '[]'::jsonb),
		       COALESCE(resource_requirements, '{}'::jsonb), COALESCE(resources, '[]'::jsonb),
		       COALESCE(related_services, '[]'::jsonb), created_at
		FROM categories
		WHERE id = $1;
	`
	row := r.db.Pool.QueryRow(ctx, query, id)
	var c domain.Category
	if err := row.Scan(&c.ID, &c.Slug, &c.Name, &c.Description, &c.Icon, &c.DefaultWorkflow, &c.RequiredDocuments, &c.OpportunityFields, &c.VehicleFields, &c.DriverFields, &c.ResourceRequirements, &c.Resources, &c.RelatedServices, &c.CreatedAt); err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *OpportunityRepository) GetCategoryBySlugOrName(ctx context.Context, identifier string) (*domain.Category, error) {
	ident := strings.TrimSpace(identifier)
	if ident == "" {
		return nil, fmt.Errorf("empty category identifier")
	}
	query := `
		SELECT id, slug, name, COALESCE(description, ''), COALESCE(icon, ''), default_workflow,
		       COALESCE(required_documents, '[]'::jsonb), COALESCE(opportunity_fields, '[]'::jsonb),
		       COALESCE(vehicle_fields, '[]'::jsonb), COALESCE(driver_fields, '[]'::jsonb),
		       COALESCE(resource_requirements, '{}'::jsonb), COALESCE(resources, '[]'::jsonb),
		       COALESCE(related_services, '[]'::jsonb), created_at
		FROM categories
		WHERE LOWER(slug) = LOWER($1)
		   OR LOWER(name) = LOWER($1)
		   OR LOWER(slug) = LOWER(REPLACE($1, ' ', '-'))
		   OR LOWER(slug) = LOWER(REPLACE($1, '_', '-'))
		LIMIT 1;
	`
	row := r.db.Pool.QueryRow(ctx, query, ident)
	var c domain.Category
	if err := row.Scan(&c.ID, &c.Slug, &c.Name, &c.Description, &c.Icon, &c.DefaultWorkflow, &c.RequiredDocuments, &c.OpportunityFields, &c.VehicleFields, &c.DriverFields, &c.ResourceRequirements, &c.Resources, &c.RelatedServices, &c.CreatedAt); err != nil {
		return nil, err
	}
	return &c, nil
}

func (r *OpportunityRepository) Create(ctx context.Context, opp *domain.Opportunity) (*domain.Opportunity, error) {
	if opp.OrderMode == "" {
		opp.OrderMode = domain.OrderModeGeneral
	}
	if opp.ID != uuid.Nil {
		query := `
			INSERT INTO opportunities (
				id, user_id, assigned_user_id, target_vendor_id, catalog_item_id, category_id, type, order_mode, title, description, workflow_model, status,
				location, address_text, radius_km, quantity, unit_price, total_price, budget_min, budget_max, price_unit,
				scheduled_start, scheduled_end, parent_opportunity_id, metadata
			) VALUES (
				$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
				ST_SetSRID(ST_MakePoint($13, $14), 4326)::geography, $15, $16, $17, $18, $19, $20, $21, $22,
				$23, $24, $25, COALESCE($26, '{}'::jsonb)
			)
			RETURNING id, user_id, assigned_user_id, target_vendor_id, catalog_item_id, category_id, type, order_mode, title, description, workflow_model, status,
			          ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng, COALESCE(address_text, ''),
			          radius_km, quantity, unit_price, total_price, budget_min, budget_max, price_unit, scheduled_start, scheduled_end,
			          parent_opportunity_id, metadata, created_at, updated_at;
		`
		row := r.db.Pool.QueryRow(ctx, query,
			opp.ID, opp.UserID, opp.AssignedUserID, opp.TargetVendorID, opp.CatalogItemID, opp.CategoryID, opp.Type, opp.OrderMode, opp.Title, opp.Description, opp.WorkflowModel, opp.Status,
			opp.Lng, opp.Lat, opp.AddressText, opp.RadiusKM, opp.Quantity, opp.UnitPrice, opp.TotalPrice, opp.BudgetMin, opp.BudgetMax, opp.PriceUnit,
			opp.ScheduledStart, opp.ScheduledEnd, opp.ParentOpportunityID, opp.Metadata,
		)
		var res domain.Opportunity
		err := row.Scan(
			&res.ID, &res.UserID, &res.AssignedUserID, &res.TargetVendorID, &res.CatalogItemID, &res.CategoryID, &res.Type, &res.OrderMode, &res.Title, &res.Description, &res.WorkflowModel, &res.Status,
			&res.Lat, &res.Lng, &res.AddressText, &res.RadiusKM, &res.Quantity, &res.UnitPrice, &res.TotalPrice, &res.BudgetMin, &res.BudgetMax, &res.PriceUnit,
			&res.ScheduledStart, &res.ScheduledEnd, &res.ParentOpportunityID, &res.Metadata, &res.CreatedAt, &res.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to create opportunity with explicit id: %w", err)
		}
		return &res, nil
	}

	query := `
		INSERT INTO opportunities (
			user_id, assigned_user_id, target_vendor_id, catalog_item_id, category_id, type, order_mode, title, description, workflow_model, status,
			location, address_text, radius_km, quantity, unit_price, total_price, budget_min, budget_max, price_unit,
			scheduled_start, scheduled_end, parent_opportunity_id, metadata
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
			ST_SetSRID(ST_MakePoint($12, $13), 4326)::geography, $14, $15, $16, $17, $18, $19, $20, $21,
			$22, $23, $24, COALESCE($25, '{}'::jsonb)
		)
		RETURNING id, user_id, assigned_user_id, target_vendor_id, catalog_item_id, category_id, type, order_mode, title, description, workflow_model, status,
		          ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng, COALESCE(address_text, ''),
		          radius_km, quantity, unit_price, total_price, budget_min, budget_max, price_unit, scheduled_start, scheduled_end,
		          parent_opportunity_id, metadata, created_at, updated_at;
	`

	row := r.db.Pool.QueryRow(ctx, query,
		opp.UserID, opp.AssignedUserID, opp.TargetVendorID, opp.CatalogItemID, opp.CategoryID, opp.Type, opp.OrderMode, opp.Title, opp.Description, opp.WorkflowModel, opp.Status,
		opp.Lng, opp.Lat, opp.AddressText, opp.RadiusKM, opp.Quantity, opp.UnitPrice, opp.TotalPrice, opp.BudgetMin, opp.BudgetMax, opp.PriceUnit,
		opp.ScheduledStart, opp.ScheduledEnd, opp.ParentOpportunityID, opp.Metadata,
	)

	var res domain.Opportunity
	err := row.Scan(
		&res.ID, &res.UserID, &res.AssignedUserID, &res.TargetVendorID, &res.CatalogItemID, &res.CategoryID, &res.Type, &res.OrderMode, &res.Title, &res.Description, &res.WorkflowModel, &res.Status,
		&res.Lat, &res.Lng, &res.AddressText, &res.RadiusKM, &res.Quantity, &res.UnitPrice, &res.TotalPrice, &res.BudgetMin, &res.BudgetMax, &res.PriceUnit,
		&res.ScheduledStart, &res.ScheduledEnd, &res.ParentOpportunityID, &res.Metadata, &res.CreatedAt, &res.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create opportunity: %w", err)
	}

	return &res, nil
}

func (r *OpportunityRepository) GetByID(ctx context.Context, id uuid.UUID) (*domain.Opportunity, error) {
	query := `
		SELECT o.id, o.user_id, o.assigned_user_id, o.target_vendor_id, o.catalog_item_id, o.category_id, o.type, COALESCE(o.order_mode, 'GENERAL_BROADCAST'), o.title, o.description, o.workflow_model, o.status,
		       ST_Y(o.location::geometry) as lat, ST_X(o.location::geometry) as lng, COALESCE(o.address_text, ''),
		       o.radius_km, o.quantity, o.unit_price, o.total_price, o.budget_min, o.budget_max, o.price_unit, o.scheduled_start, o.scheduled_end,
		       o.parent_opportunity_id, COALESCE(o.metadata, '{}'::jsonb), o.created_at, o.updated_at,
		       u.full_name, COALESCE(u.phone, ''), COALESCE(u.avatar_url, ''), u.trust_score,
		       COALESCE(au.full_name, ''), COALESCE(au.phone, ''), COALESCE(au.avatar_url, ''),
		       COALESCE(tv.full_name, ''), COALESCE(tv.phone, ''), COALESCE(tv.avatar_url, ''),
		       COALESCE(c.name, ''), COALESCE(c.slug, ''), COALESCE(c.resources, '[]'::jsonb), COALESCE(c.resource_requirements, '{}'::jsonb), COALESCE(c.opportunity_fields, '[]'::jsonb)
		FROM opportunities o
		JOIN users u ON o.user_id = u.id
		LEFT JOIN users au ON o.assigned_user_id = au.id
		LEFT JOIN users tv ON o.target_vendor_id = tv.id
		LEFT JOIN categories c ON o.category_id = c.id
		WHERE o.id = $1;
	`

	row := r.db.Pool.QueryRow(ctx, query, id)

	var opp domain.Opportunity
	var u domain.User
	var au domain.User
	var tv domain.User
	var cat domain.Category
	err := row.Scan(
		&opp.ID, &opp.UserID, &opp.AssignedUserID, &opp.TargetVendorID, &opp.CatalogItemID, &opp.CategoryID, &opp.Type, &opp.OrderMode, &opp.Title, &opp.Description, &opp.WorkflowModel, &opp.Status,
		&opp.Lat, &opp.Lng, &opp.AddressText, &opp.RadiusKM, &opp.Quantity, &opp.UnitPrice, &opp.TotalPrice, &opp.BudgetMin, &opp.BudgetMax, &opp.PriceUnit,
		&opp.ScheduledStart, &opp.ScheduledEnd, &opp.ParentOpportunityID, &opp.Metadata, &opp.CreatedAt, &opp.UpdatedAt,
		&u.FullName, &u.Phone, &u.AvatarURL, &u.TrustScore,
		&au.FullName, &au.Phone, &au.AvatarURL,
		&tv.FullName, &tv.Phone, &tv.AvatarURL,
		&cat.Name, &cat.Slug, &cat.Resources, &cat.ResourceRequirements, &cat.OpportunityFields,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get opportunity by id: %w", err)
	}

	u.ID = opp.UserID
	opp.User = &u

	if opp.AssignedUserID != nil {
		au.ID = *opp.AssignedUserID
		opp.AssignedUser = &au
	}
	if opp.TargetVendorID != nil {
		tv.ID = *opp.TargetVendorID
		opp.TargetVendor = &tv
	}
	if opp.CategoryID != nil || cat.Name != "" {
		if opp.CategoryID != nil {
			cat.ID = *opp.CategoryID
		}
		opp.Category = &cat
	}

	return &opp, nil
}

// FindProximityMatches runs PostGIS spatial ST_DWithin query to find matching Needs or Offers within radius
func (r *OpportunityRepository) FindProximityMatches(ctx context.Context, lat, lng float64, targetType domain.OpportunityType, categoryID *uuid.UUID, radiusMeters float64, limit int) ([]*domain.OpportunityMatch, error) {
	if radiusMeters <= 0 {
		radiusMeters = 50000.0 // Default 50km
	}
	if limit <= 0 {
		limit = 20
	}

	query := `
		SELECT o.id, o.user_id, o.title,
		       ST_Distance(o.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) as distance_meters,
		       u.full_name, COALESCE(u.avatar_url, ''), u.trust_score
		FROM opportunities o
		JOIN users u ON o.user_id = u.id
		WHERE o.type = $3
		  AND o.status IN ('OPEN', 'PENDING_MATCHING', 'OPEN_NEED')
		  AND ($4::uuid IS NULL OR o.category_id = $4)
		  AND (ST_DWithin(o.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography, $5) OR $5 >= 500000)
		ORDER BY distance_meters ASC
		LIMIT $6;
	`

	rows, err := r.db.Pool.Query(ctx, query, lng, lat, targetType, categoryID, radiusMeters, limit)
	if err != nil {
		return nil, fmt.Errorf("failed to execute spatial PostGIS query: %w", err)
	}

	var matches []*domain.OpportunityMatch
	for rows.Next() {
		var oppID, userID uuid.UUID
		var title, fullName, avatarURL string
		var dist float64
		var trustScore float64

		if err := rows.Scan(&oppID, &userID, &title, &dist, &fullName, &avatarURL, &trustScore); err != nil {
			rows.Close()
			return nil, err
		}

		score := (trustScore * 20.0) - (dist / 1000.0)
		if score < 0 {
			score = 10.0
		}

		m := &domain.OpportunityMatch{
			ID:             uuid.New(),
			OpportunityID:  oppID,
			MatchedUserID:  userID,
			Status:         "PROPOSED",
			MatchScore:     score,
			DistanceMeters: dist,
			Notes:          title,
			MatchedUser: &domain.User{
				ID:         userID,
				FullName:   fullName,
				AvatarURL:  avatarURL,
				TrustScore: trustScore,
			},
		}
		matches = append(matches, m)
	}
	rows.Close()

	// If no matches found with exact category, fallback to match across all categories of targetType
	if len(matches) == 0 && categoryID != nil {
		return r.FindProximityMatches(ctx, lat, lng, targetType, nil, radiusMeters, limit)
	}

	return matches, nil
}

// ListPublicListings supports fast query for SEO public pages and Flutter feed
func (r *OpportunityRepository) ListPublicListings(ctx context.Context, categorySlug string, oppType string, limit, offset int) ([]*domain.Opportunity, int, error) {
	countQuery := `
		SELECT COUNT(o.id)
		FROM opportunities o
		LEFT JOIN categories c ON o.category_id = c.id
		WHERE o.status != 'REJECTED' AND o.status != 'CANCELLED'
		  AND o.parent_opportunity_id IS NULL
		  AND ($1 = '' OR c.slug = $1)
		  AND ($2 = '' OR o.type = $2);
	`
	var total int
	err := r.db.Pool.QueryRow(ctx, countQuery, categorySlug, oppType).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	dataQuery := `
		SELECT o.id, o.user_id, o.category_id, o.type, o.title, o.description, o.workflow_model, o.status,
		       ST_Y(o.location::geometry) as lat, ST_X(o.location::geometry) as lng, COALESCE(o.address_text, ''),
		       o.radius_km, o.budget_min, o.budget_max, o.price_unit, COALESCE(o.metadata, '{}'::jsonb), o.created_at,
		       u.full_name, COALESCE(u.phone, ''), COALESCE(u.avatar_url, ''), u.trust_score,
		       COALESCE(c.name, ''), COALESCE(c.slug, ''), COALESCE(c.resources, '[]'::jsonb), COALESCE(c.resource_requirements, '{}'::jsonb)
		FROM opportunities o
		JOIN users u ON o.user_id = u.id
		LEFT JOIN categories c ON o.category_id = c.id
		WHERE o.status != 'REJECTED' AND o.status != 'CANCELLED'
		  AND o.parent_opportunity_id IS NULL
		  AND ($1 = '' OR c.slug = $1)
		  AND ($2 = '' OR o.type = $2)
		ORDER BY o.created_at DESC
		LIMIT $3 OFFSET $4;
	`

	rows, err := r.db.Pool.Query(ctx, dataQuery, categorySlug, oppType, limit, offset)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var list []*domain.Opportunity
	for rows.Next() {
		var opp domain.Opportunity
		var u domain.User
		var cat domain.Category

		err := rows.Scan(
			&opp.ID, &opp.UserID, &opp.CategoryID, &opp.Type, &opp.Title, &opp.Description, &opp.WorkflowModel, &opp.Status,
			&opp.Lat, &opp.Lng, &opp.AddressText, &opp.RadiusKM, &opp.BudgetMin, &opp.BudgetMax, &opp.PriceUnit, &opp.Metadata, &opp.CreatedAt,
			&u.FullName, &u.Phone, &u.AvatarURL, &u.TrustScore,
			&cat.Name, &cat.Slug, &cat.Resources, &cat.ResourceRequirements,
		)
		if err != nil {
			return nil, 0, err
		}

		u.ID = opp.UserID
		opp.User = &u
		if opp.CategoryID != nil {
			cat.ID = *opp.CategoryID
			opp.Category = &cat
		}

		list = append(list, &opp)
	}

	return list, total, nil
}

func (r *OpportunityRepository) UpdateStatus(ctx context.Context, id uuid.UUID, status domain.OpportunityStatus) error {
	// Fetch current status before updating
	var oldStatus string
	_ = r.db.Pool.QueryRow(ctx, `SELECT status FROM opportunities WHERE id = $1`, id).Scan(&oldStatus)

	query := `UPDATE opportunities SET status = $1, updated_at = NOW() WHERE id = $2`
	_, err := r.db.Pool.Exec(ctx, query, status, id)
	if err != nil {
		return err
	}

	// Insert history log record
	historyQuery := `
		INSERT INTO opportunity_status_history (opportunity_id, from_status, to_status, notes)
		VALUES ($1, $2, $3, $4)
	`
	_, _ = r.db.Pool.Exec(ctx, historyQuery, id, oldStatus, string(status), "Status transition logged")

	return nil
}

func (r *OpportunityRepository) GetStatusHistory(ctx context.Context, opportunityID uuid.UUID) ([]*domain.OpportunityStatusHistory, error) {
	query := `
		SELECT id, opportunity_id, COALESCE(from_status, ''), to_status, changed_by_user_id, COALESCE(notes, ''), created_at
		FROM opportunity_status_history
		WHERE opportunity_id = $1
		ORDER BY created_at ASC
	`
	rows, err := r.db.Pool.Query(ctx, query, opportunityID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var history []*domain.OpportunityStatusHistory
	for rows.Next() {
		var h domain.OpportunityStatusHistory
		if err := rows.Scan(&h.ID, &h.OpportunityID, &h.FromStatus, &h.ToStatus, &h.ChangedByUserID, &h.Notes, &h.CreatedAt); err != nil {
			return nil, err
		}
		history = append(history, &h)
	}
	return history, nil
}

// FindCommuterRouteMatches finds active commuter Offer listings matching a target customer Need route via PostGIS
func (r *OpportunityRepository) FindCommuterRouteMatches(ctx context.Context, needID uuid.UUID, radiusMeters float64) ([]*domain.CommuteMatchResult, error) {
	if radiusMeters <= 0 {
		radiusMeters = 25000.0 // Default 25km corridor radius
	}

	// 1. Fetch target Need details
	need, err := r.GetByID(ctx, needID)
	if err != nil || need == nil {
		return nil, fmt.Errorf("need opportunity not found: %w", err)
	}

	pickupLat := need.Lat
	pickupLng := need.Lng
	pickupAddr := need.AddressText

	deliveryLat := need.Lat
	deliveryLng := need.Lng
	deliveryAddr := need.AddressText

	// Check if Need metadata specifies custom pickup/delivery points
	var needMeta map[string]interface{}
	if len(need.Metadata) > 0 {
		_ = json.Unmarshal(need.Metadata, &needMeta)
	}

	if needMeta != nil {
		if plat, ok := needMeta["pickup_lat"].(float64); ok {
			pickupLat = plat
		}
		if plng, ok := needMeta["pickup_lng"].(float64); ok {
			pickupLng = plng
		}
		if paddr, ok := needMeta["pickup_location"].(string); ok && paddr != "" {
			pickupAddr = paddr
		}

		if dlat, ok := needMeta["delivery_lat"].(float64); ok {
			deliveryLat = dlat
		}
		if dlng, ok := needMeta["delivery_lng"].(float64); ok {
			deliveryLng = dlng
		}
		if daddr, ok := needMeta["delivery_location"].(string); ok && daddr != "" {
			deliveryAddr = daddr
		}
	}

	// 2. Query active commuter OFFER listings
	query := `
		SELECT o.id, o.user_id, o.title, COALESCE(o.address_text, ''), o.budget_max, o.metadata, o.created_at,
		       ST_Y(o.location::geometry) as offer_lat, ST_X(o.location::geometry) as offer_lng,
		       ST_Distance(o.location, ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography) as dist_pickup,
		       ST_Distance(o.location, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography) as dist_delivery,
		       u.full_name, COALESCE(u.phone, ''), COALESCE(u.avatar_url, ''), u.trust_score
		FROM opportunities o
		JOIN users u ON o.user_id = u.id
		WHERE o.type = 'OFFER'
		  AND o.status IN ('OPEN', 'PENDING_MATCHING')
		  AND o.user_id != $5;
	`

	rows, err := r.db.Pool.Query(ctx, query, pickupLng, pickupLat, deliveryLng, deliveryLat, need.UserID)
	if err != nil {
		return nil, fmt.Errorf("failed to query commuter offers: %w", err)
	}
	defer rows.Close()

	var matches []*domain.CommuteMatchResult

	for rows.Next() {
		var offerID, providerID uuid.UUID
		var title, addressText, fullName, phone, avatarURL string
		var budgetMax *float64
		var metadata map[string]interface{}
		var createdAt time.Time
		var offerLat, offerLng, distPickup, distDelivery, trustScore float64

		err := rows.Scan(
			&offerID, &providerID, &title, &addressText, &budgetMax, &metadata, &createdAt,
			&offerLat, &offerLng, &distPickup, &distDelivery,
			&fullName, &phone, &avatarURL, &trustScore,
		)
		if err != nil {
			return nil, err
		}

		// Extract origin & destination addresses from offer metadata
		originAddr := addressText
		destAddr := addressText
		travelFreq := "DAILY"
		travelMode := "BIKE"

		if metadata != nil {
			if oaddr, ok := metadata["origin_address"].(string); ok && oaddr != "" {
				originAddr = oaddr
			}
			if daddr, ok := metadata["destination_address"].(string); ok && daddr != "" {
				destAddr = daddr
			}
			if tf, ok := metadata["travel_frequency"].(string); ok && tf != "" {
				travelFreq = tf
			}
			if tm, ok := metadata["travel_mode"].(string); ok && tm != "" {
				travelMode = tm
			}
		}

		// Spatial Proximity Matching check:
		// Check if Commuter Origin is near Pickup AND Commuter Destination is near Delivery
		// (OR vice-versa for round-trip commuters)
		// We use originLat/Lng and destLat/Lng calculation or distance threshold
		isMatched := (distPickup <= radiusMeters && distDelivery <= radiusMeters)

		// Calculate total detour meters & estimated detour time
		totalDetour := distPickup + distDelivery
		detourMin := int(totalDetour / 500.0)
		if detourMin < 1 {
			detourMin = 1
		}

		payoutCents := 4000 // Default ₹40 payout for micro-commute delivery
		if need.BudgetMax != nil && *need.BudgetMax > 0 {
			payoutCents = int(*need.BudgetMax * 100)
		} else if budgetMax != nil && *budgetMax > 0 {
			payoutCents = int(*budgetMax * 100)
		}

		if isMatched {
			match := &domain.CommuteMatchResult{
				OfferID:              offerID,
				NeedID:               needID,
				ProviderID:           providerID,
				Provider: &domain.User{
					ID:         providerID,
					FullName:   fullName,
					Phone:      phone,
					AvatarURL:  avatarURL,
					TrustScore: trustScore,
				},
				OfferTitle:           title,
				OriginAddress:        originAddr,
				DestinationAddress:   destAddr,
				PickupAddress:        pickupAddr,
				DeliveryAddress:      deliveryAddr,
				PickupDetourMeters:   distPickup,
				DeliveryDetourMeters: distDelivery,
				TotalDetourMeters:    totalDetour,
				EstimatedDetourMin:   detourMin,
				EstimatedPayoutCents: payoutCents,
				FormattedPayout:      fmt.Sprintf("₹%.0f", float64(payoutCents)/100.0),
				TravelMode:           travelMode,
				TravelFrequency:      travelFreq,
				CreatedAt:            createdAt,
			}
			matches = append(matches, match)
		}
	}

	return matches, nil
}

// FindEligibleProvidersForCategory queries approved/active providers for a given category
func (r *OpportunityRepository) FindEligibleProvidersForCategory(ctx context.Context, categoryID *uuid.UUID) ([]*domain.User, error) {
	if categoryID == nil {
		return []*domain.User{}, nil
	}
	query := `
		SELECT DISTINCT u.id, u.full_name, COALESCE(u.phone, ''), COALESCE(u.email, ''), COALESCE(u.avatar_url, ''), u.trust_score
		FROM user_skills_assets usa
		JOIN users u ON usa.user_id = u.id
		LEFT JOIN categories c ON c.id = $1
		WHERE (
			usa.category_id = $1
			OR (c.slug IS NOT NULL AND (
				LOWER(usa.asset_type) = REPLACE(LOWER(c.slug), '-', '_')
				OR LOWER(usa.asset_type) LIKE REPLACE(LOWER(c.slug), '-', '_') || '%'
				OR REPLACE(LOWER(c.slug), '-', '_') LIKE LOWER(usa.asset_type) || '%'
				OR LOWER(usa.title) ILIKE '%' || LOWER(c.name) || '%'
			))
		)
		  AND usa.status IN ('APPROVED', 'ACTIVE')
		  AND usa.is_available = TRUE;
	`
	rows, err := r.db.Pool.Query(ctx, query, categoryID)
	if err != nil {
		return nil, fmt.Errorf("failed to find eligible providers for category: %w", err)
	}
	defer rows.Close()

	var providers []*domain.User
	for rows.Next() {
		var u domain.User
		if err := rows.Scan(&u.ID, &u.FullName, &u.Phone, &u.Email, &u.AvatarURL, &u.TrustScore); err != nil {
			return nil, err
		}
		providers = append(providers, &u)
	}
	return providers, nil
}

// SaveOpportunityMatch inserts or updates an opportunity match record
func (r *OpportunityRepository) SaveOpportunityMatch(ctx context.Context, oppID, providerID uuid.UUID, status string) error {
	query := `
		INSERT INTO opportunity_matches (id, opportunity_id, matched_user_id, status)
		VALUES (gen_random_uuid(), $1, $2, $3)
		ON CONFLICT (opportunity_id, matched_user_id) DO UPDATE SET status = EXCLUDED.status, updated_at = NOW();
	`
	_, err := r.db.Pool.Exec(ctx, query, oppID, providerID, status)
	return err
}

// GetMatchingRequestsForProvider gets unaccepted matching requests for a provider's approved services
func (r *OpportunityRepository) GetMatchingRequestsForProvider(ctx context.Context, providerID uuid.UUID) ([]*domain.Opportunity, error) {
	query := `
		SELECT DISTINCT o.id, o.user_id, o.assigned_user_id, o.category_id, o.type, COALESCE(o.order_mode, 'GENERAL_BROADCAST'), o.title, o.description, o.workflow_model, o.status,
		       ST_Y(o.location::geometry) as lat, ST_X(o.location::geometry) as lng, COALESCE(o.address_text, ''),
		       o.radius_km, o.quantity, o.unit_price, o.total_price, o.budget_min, o.budget_max, o.price_unit, o.scheduled_start, o.scheduled_end,
		       o.parent_opportunity_id, o.target_vendor_id, o.catalog_item_id, COALESCE(o.metadata, '{}'::jsonb), o.created_at, o.updated_at,
		       u.full_name, COALESCE(u.phone, ''), COALESCE(u.avatar_url, ''), u.trust_score,
		       COALESCE(c.name, ''), COALESCE(c.slug, ''), COALESCE(c.resources, '[]'::jsonb), COALESCE(c.resource_requirements, '{}'::jsonb), COALESCE(c.opportunity_fields, '[]'::jsonb)
		FROM opportunities o
		JOIN users u ON o.user_id = u.id
		LEFT JOIN categories c ON o.category_id = c.id
		JOIN user_skills_assets usa ON (
			(o.category_id IS NOT NULL AND usa.category_id = o.category_id)
			OR (c.slug IS NOT NULL AND (
				LOWER(usa.asset_type) = REPLACE(LOWER(c.slug), '-', '_')
				OR LOWER(usa.asset_type) LIKE REPLACE(LOWER(c.slug), '-', '_') || '%'
				OR REPLACE(LOWER(c.slug), '-', '_') LIKE LOWER(usa.asset_type) || '%'
				OR LOWER(usa.title) ILIKE '%' || LOWER(c.name) || '%'
			))
			OR EXISTS (SELECT 1 FROM opportunity_matches om WHERE om.opportunity_id = o.id AND om.matched_user_id = $1)
		)
		WHERE usa.user_id = $1
		  AND usa.status IN ('APPROVED', 'ACTIVE')
		  AND usa.is_available = TRUE
		  AND o.type = 'NEED'
		  AND o.user_id != $1
		  AND o.assigned_user_id IS NULL
		  AND (o.target_vendor_id IS NULL OR o.target_vendor_id = $1)
		  AND o.status IN ('OPEN', 'OPEN_NEED', 'PENDING_MATCHING', 'ORDER_PLACED')
		  AND (o.parent_opportunity_id IS NOT NULL OR NOT EXISTS (SELECT 1 FROM opportunities child WHERE child.parent_opportunity_id = o.id))
		ORDER BY o.created_at DESC;
	`
	rows, err := r.db.Pool.Query(ctx, query, providerID)
	if err != nil {
		return nil, fmt.Errorf("failed to query matching requests for provider: %w", err)
	}
	defer rows.Close()

	var opps []*domain.Opportunity
	for rows.Next() {
		var opp domain.Opportunity
		var u domain.User
		var cat domain.Category
		err := rows.Scan(
			&opp.ID, &opp.UserID, &opp.AssignedUserID, &opp.CategoryID, &opp.Type, &opp.OrderMode, &opp.Title, &opp.Description, &opp.WorkflowModel, &opp.Status,
			&opp.Lat, &opp.Lng, &opp.AddressText, &opp.RadiusKM, &opp.Quantity, &opp.UnitPrice, &opp.TotalPrice, &opp.BudgetMin, &opp.BudgetMax, &opp.PriceUnit,
			&opp.ScheduledStart, &opp.ScheduledEnd, &opp.ParentOpportunityID, &opp.TargetVendorID, &opp.CatalogItemID, &opp.Metadata, &opp.CreatedAt, &opp.UpdatedAt,
			&u.FullName, &u.Phone, &u.AvatarURL, &u.TrustScore,
			&cat.Name, &cat.Slug, &cat.Resources, &cat.ResourceRequirements, &cat.OpportunityFields,
		)
		if err != nil {
			return nil, err
		}
		u.ID = opp.UserID
		opp.User = &u
		if opp.CategoryID != nil || cat.Name != "" {
			if opp.CategoryID != nil {
				cat.ID = *opp.CategoryID
			}
			opp.Category = &cat
		}
		opps = append(opps, &opp)
	}
	return opps, nil
}

// GetAcceptedOrdersForProvider gets orders assigned to and accepted by this provider
func (r *OpportunityRepository) GetAcceptedOrdersForProvider(ctx context.Context, providerID uuid.UUID) ([]*domain.Opportunity, error) {
	query := `
		SELECT o.id, o.user_id, o.assigned_user_id, o.category_id, o.type, COALESCE(o.order_mode, 'GENERAL_BROADCAST'), o.title, o.description, o.workflow_model, o.status,
		       ST_Y(o.location::geometry) as lat, ST_X(o.location::geometry) as lng, COALESCE(o.address_text, ''),
		       o.radius_km, o.quantity, o.unit_price, o.total_price, o.budget_min, o.budget_max, o.price_unit, o.scheduled_start, o.scheduled_end,
		       o.parent_opportunity_id, o.target_vendor_id, o.catalog_item_id, COALESCE(o.metadata, '{}'::jsonb), o.created_at, o.updated_at,
		       u.full_name, COALESCE(u.phone, ''), COALESCE(u.avatar_url, ''), u.trust_score,
		       COALESCE(c.name, ''), COALESCE(c.slug, ''), COALESCE(c.resources, '[]'::jsonb), COALESCE(c.resource_requirements, '{}'::jsonb), COALESCE(c.opportunity_fields, '[]'::jsonb)
		FROM opportunities o
		JOIN users u ON o.user_id = u.id
		LEFT JOIN categories c ON o.category_id = c.id
		WHERE (o.assigned_user_id = $1 OR (o.target_vendor_id = $1 AND o.status NOT IN ('OPEN', 'OPEN_NEED', 'PENDING_MATCHING', 'ORDER_PLACED', 'CANCELLED', 'REJECTED')))
		  AND (o.parent_opportunity_id IS NOT NULL OR NOT EXISTS (SELECT 1 FROM opportunities child WHERE child.parent_opportunity_id = o.id))
		ORDER BY o.updated_at DESC;
	`
	rows, err := r.db.Pool.Query(ctx, query, providerID)
	if err != nil {
		return nil, fmt.Errorf("failed to query accepted orders for provider: %w", err)
	}
	defer rows.Close()

	var opps []*domain.Opportunity
	for rows.Next() {
		var opp domain.Opportunity
		var u domain.User
		var cat domain.Category
		err := rows.Scan(
			&opp.ID, &opp.UserID, &opp.AssignedUserID, &opp.CategoryID, &opp.Type, &opp.OrderMode, &opp.Title, &opp.Description, &opp.WorkflowModel, &opp.Status,
			&opp.Lat, &opp.Lng, &opp.AddressText, &opp.RadiusKM, &opp.Quantity, &opp.UnitPrice, &opp.TotalPrice, &opp.BudgetMin, &opp.BudgetMax, &opp.PriceUnit,
			&opp.ScheduledStart, &opp.ScheduledEnd, &opp.ParentOpportunityID, &opp.TargetVendorID, &opp.CatalogItemID, &opp.Metadata, &opp.CreatedAt, &opp.UpdatedAt,
			&u.FullName, &u.Phone, &u.AvatarURL, &u.TrustScore,
			&cat.Name, &cat.Slug, &cat.Resources, &cat.ResourceRequirements, &cat.OpportunityFields,
		)
		if err != nil {
			return nil, err
		}
		u.ID = opp.UserID
		opp.User = &u
		if opp.CategoryID != nil || cat.Name != "" {
			if opp.CategoryID != nil {
				cat.ID = *opp.CategoryID
			}
			opp.Category = &cat
		}
		opps = append(opps, &opp)
	}
	return opps, nil
}

// AssignProviderAtomically assigns an opportunity to a provider if it is not already assigned
func (r *OpportunityRepository) AssignProviderAtomically(ctx context.Context, oppID uuid.UUID, providerID uuid.UUID) error {
	query := `
		UPDATE opportunities
		SET assigned_user_id = $1, status = 'ACCEPTED', updated_at = NOW()
		WHERE id = $2
		  AND (assigned_user_id IS NULL OR assigned_user_id = $1)
		  AND status IN ('OPEN', 'OPEN_NEED', 'PENDING_MATCHING', 'ORDER_PLACED');

	`
	tag, err := r.db.Pool.Exec(ctx, query, providerID, oppID)
	if err != nil {
		return fmt.Errorf("database error assigning provider: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("order has already been accepted by another provider or is no longer open")
	}

	// Update opportunity_matches status
	_, _ = r.db.Pool.Exec(ctx, `
		UPDATE opportunity_matches
		SET status = CASE WHEN matched_user_id = $1 THEN 'ACCEPTED' ELSE 'EXPIRED' END,
		    updated_at = NOW()
		WHERE opportunity_id = $2;
	`, providerID, oppID)

	// Log history
	historyQuery := `
		INSERT INTO opportunity_status_history (opportunity_id, from_status, to_status, changed_by_user_id, notes)
		VALUES ($1, 'OPEN', 'ACCEPTED', $2, 'Provider accepted order')
	`
	_, _ = r.db.Pool.Exec(ctx, historyQuery, oppID, providerID)

	return nil
}

func (r *OpportunityRepository) UpdateMetadata(ctx context.Context, id uuid.UUID, metadata json.RawMessage) error {
	query := `UPDATE opportunities SET metadata = $1, updated_at = NOW() WHERE id = $2`
	_, err := r.db.Pool.Exec(ctx, query, metadata, id)
	return err
}

// GetUserOpportunities gets orders created by the specified customer (user_id = $1)
func (r *OpportunityRepository) GetUserOpportunities(ctx context.Context, userID uuid.UUID) ([]*domain.Opportunity, error) {
	query := `
		SELECT o.id, o.user_id, o.assigned_user_id, o.category_id, o.type, COALESCE(o.order_mode, 'GENERAL_BROADCAST'), o.title, o.description, o.workflow_model, o.status,
		       ST_Y(o.location::geometry) as lat, ST_X(o.location::geometry) as lng, COALESCE(o.address_text, ''),
		       o.radius_km, o.quantity, o.unit_price, o.total_price, o.budget_min, o.budget_max, o.price_unit, o.scheduled_start, o.scheduled_end,
		       o.parent_opportunity_id, o.target_vendor_id, o.catalog_item_id, COALESCE(o.metadata, '{}'::jsonb), o.created_at, o.updated_at,
		       u.full_name, COALESCE(u.phone, ''), COALESCE(u.avatar_url, ''), u.trust_score,
		       COALESCE(au.full_name, ''), COALESCE(au.phone, ''), COALESCE(au.avatar_url, ''),
		       COALESCE(c.name, ''), COALESCE(c.slug, ''), COALESCE(c.resources, '[]'::jsonb), COALESCE(c.resource_requirements, '{}'::jsonb), COALESCE(c.opportunity_fields, '[]'::jsonb)
		FROM opportunities o
		JOIN users u ON o.user_id = u.id
		LEFT JOIN users au ON o.assigned_user_id = au.id
		LEFT JOIN categories c ON o.category_id = c.id
		WHERE o.user_id = $1
		ORDER BY o.created_at DESC;
	`
	rows, err := r.db.Pool.Query(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to query customer user opportunities: %w", err)
	}
	defer rows.Close()

	var opps []*domain.Opportunity
	for rows.Next() {
		var opp domain.Opportunity
		var u domain.User
		var au domain.User
		var cat domain.Category
		err := rows.Scan(
			&opp.ID, &opp.UserID, &opp.AssignedUserID, &opp.CategoryID, &opp.Type, &opp.OrderMode, &opp.Title, &opp.Description, &opp.WorkflowModel, &opp.Status,
			&opp.Lat, &opp.Lng, &opp.AddressText, &opp.RadiusKM, &opp.Quantity, &opp.UnitPrice, &opp.TotalPrice, &opp.BudgetMin, &opp.BudgetMax, &opp.PriceUnit,
			&opp.ScheduledStart, &opp.ScheduledEnd, &opp.ParentOpportunityID, &opp.TargetVendorID, &opp.CatalogItemID, &opp.Metadata, &opp.CreatedAt, &opp.UpdatedAt,
			&u.FullName, &u.Phone, &u.AvatarURL, &u.TrustScore,
			&au.FullName, &au.Phone, &au.AvatarURL,
			&cat.Name, &cat.Slug, &cat.Resources, &cat.ResourceRequirements, &cat.OpportunityFields,
		)
		if err != nil {
			return nil, err
		}
		u.ID = opp.UserID
		opp.User = &u
		if opp.AssignedUserID != nil && *opp.AssignedUserID != uuid.Nil {
			au.ID = *opp.AssignedUserID
			opp.AssignedUser = &au
		}
		if opp.CategoryID != nil || cat.Name != "" {
			if opp.CategoryID != nil {
				cat.ID = *opp.CategoryID
			}
			opp.Category = &cat
		}
		opps = append(opps, &opp)
	}
	return opps, nil
}

// GetChildrenByParentID retrieves all direct child opportunities of a parent opportunity
func (r *OpportunityRepository) GetChildrenByParentID(ctx context.Context, parentID uuid.UUID) ([]*domain.Opportunity, error) {
	query := `
		SELECT id, user_id, category_id, type, title, description, workflow_model, status,
		       ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng, COALESCE(address_text, ''),
		       radius_km, budget_min, budget_max, price_unit, scheduled_start, scheduled_end,
		       parent_opportunity_id, COALESCE(metadata, '{}'::jsonb), created_at, updated_at
		FROM opportunities
		WHERE parent_opportunity_id = $1
		ORDER BY created_at ASC;
	`
	rows, err := r.db.Pool.Query(ctx, query, parentID)
	if err != nil {
		return nil, fmt.Errorf("failed to query child opportunities: %w", err)
	}
	defer rows.Close()

	var children []*domain.Opportunity
	for rows.Next() {
		var child domain.Opportunity
		if err := rows.Scan(
			&child.ID, &child.UserID, &child.CategoryID, &child.Type, &child.Title, &child.Description, &child.WorkflowModel, &child.Status,
			&child.Lat, &child.Lng, &child.AddressText, &child.RadiusKM, &child.BudgetMin, &child.BudgetMax, &child.PriceUnit,
			&child.ScheduledStart, &child.ScheduledEnd, &child.ParentOpportunityID, &child.Metadata, &child.CreatedAt, &child.UpdatedAt,
		); err != nil {
			return nil, err
		}
		children = append(children, &child)
	}
	return children, nil
}

// CreateChainLink records a parent-child relationship in opportunity_chains table
func (r *OpportunityRepository) CreateChainLink(ctx context.Context, parentID, childID uuid.UUID, relType string) error {
	query := `
		INSERT INTO opportunity_chains (parent_opportunity_id, child_opportunity_id, relationship_type)
		VALUES ($1, $2, $3)
		ON CONFLICT (parent_opportunity_id, child_opportunity_id) DO NOTHING;
	`
	_, err := r.db.Pool.Exec(ctx, query, parentID, childID, relType)
	return err
}


