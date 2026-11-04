package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/uop/backend/internal/domain"
	"github.com/uop/backend/internal/spatial"
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

// MaskPhone masks private phone digits for public match previews (e.g. +91 99**** 9999)
func MaskPhone(phone string) string {
	phone = strings.TrimSpace(phone)
	if len(phone) < 6 {
		return phone
	}
	if len(phone) <= 10 {
		return phone[:2] + "****" + phone[len(phone)-4:]
	}
	return phone[:6] + "****" + phone[len(phone)-4:]
}

// parseTimeToMinutes parses times like "08:00 AM", "8:30 PM", or "14:30" into minutes from midnight (0..1439)
func parseTimeToMinutes(timeStr string) (int, bool) {
	timeStr = strings.TrimSpace(strings.ToUpper(timeStr))
	if timeStr == "" {
		return 0, false
	}
	var hour, minute int
	var meridian string
	n, err := fmt.Sscanf(timeStr, "%d:%d %s", &hour, &minute, &meridian)
	if err == nil && n == 3 {
		if meridian == "PM" && hour < 12 {
			hour += 12
		} else if meridian == "AM" && hour == 12 {
			hour = 0
		}
		return hour*60 + minute, true
	}

	n, err = fmt.Sscanf(timeStr, "%d:%d%s", &hour, &minute, &meridian)
	if err == nil && n >= 2 {
		if meridian == "PM" && hour < 12 {
			hour += 12
		} else if meridian == "AM" && hour == 12 {
			hour = 0
		}
		return hour*60 + minute, true
	}

	n, err = fmt.Sscanf(timeStr, "%d:%d", &hour, &minute)
	if err == nil && n == 2 {
		return hour*60 + minute, true
	}

	return 0, false
}

func getFloat(m map[string]interface{}, key string) float64 {
	if m == nil {
		return 0
	}
	val, exists := m[key]
	if !exists || val == nil {
		return 0
	}
	switch v := val.(type) {
	case float64:
		return v
	case float32:
		return float64(v)
	case int:
		return float64(v)
	case int64:
		return float64(v)
	case string:
		v = strings.TrimSpace(v)
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			return f
		}
	}
	return 0
}

func getString(m map[string]interface{}, key string) string {
	if m == nil {
		return ""
	}
	val, exists := m[key]
	if !exists || val == nil {
		return ""
	}
	if s, ok := val.(string); ok {
		return strings.TrimSpace(s)
	}
	return fmt.Sprintf("%v", val)
}

func getStringSlice(m map[string]interface{}, key string) []string {
	if m == nil {
		return nil
	}
	val, exists := m[key]
	if !exists || val == nil {
		return nil
	}
	if rawList, ok := val.([]interface{}); ok {
		var res []string
		for _, item := range rawList {
			if s, ok := item.(string); ok && s != "" {
				res = append(res, strings.ToUpper(strings.TrimSpace(s)))
			}
		}
		return res
	}
	if strList, ok := val.([]string); ok {
		var res []string
		for _, s := range strList {
			if s != "" {
				res = append(res, strings.ToUpper(strings.TrimSpace(s)))
			}
		}
		return res
	}
	return nil
}

func isValidCoord(lat, lng float64) bool {
	if lat < -90.0 || lat > 90.0 || lng < -180.0 || lng > 180.0 {
		return false
	}
	if lat == 0.0 && lng == 0.0 {
		return false
	}
	return true
}

// EvaluateCommuteMatch evaluates whether a candidate journey offer matches a customer delivery need.
// It enforces order mode, directionality, maximum detour tolerances, and schedule constraints.
func EvaluateCommuteMatch(
	need *domain.Opportunity,
	pickupCoord spatial.Coordinates,
	deliveryCoord spatial.Coordinates,
	pickupAddr string,
	deliveryAddr string,
	journey *domain.Opportunity,
	journeyMeta map[string]interface{},
	candidateUser *domain.User,
	radiusMeters float64,
) (*domain.CommuteMatchResult, bool) {
	if need == nil || journey == nil {
		return nil, false
	}

	// 0. Enforce customer need eligibility
	if need.AssignedUserID != nil {
		return nil, false
	}
	if need.Status == domain.StatusCompleted || need.Status == domain.StatusCancelled || need.Status == "EXPIRED" {
		return nil, false
	}
	if !isValidCoord(pickupCoord.Lat, pickupCoord.Lng) || !isValidCoord(deliveryCoord.Lat, deliveryCoord.Lng) {
		return nil, false
	}

	// 1. Match only genuine registered journeys
	if journey.Type != domain.TypeOffer {
		return nil, false
	}
	isJourneyMode := journey.OrderMode == domain.OrderModeJourney || getString(journeyMeta, "is_journey") == "true"
	if !isJourneyMode {
		return nil, false
	}

	// 2. Exclude paused and cancelled journeys
	if journey.Status == domain.StatusPaused || journey.Status == domain.StatusCancelled {
		return nil, false
	}
	if journey.Status != domain.StatusOpen && journey.Status != "PENDING_MATCHING" && journey.Status != "ACTIVE" {
		return nil, false
	}
	if isAct, ok := journeyMeta["is_active"].(bool); ok && !isAct {
		return nil, false
	}
	if getString(journeyMeta, "is_active") == "false" {
		return nil, false
	}

	// Prevent user matching their own need
	if journey.UserID == need.UserID {
		return nil, false
	}

	// 3. Extract and validate journey Origin and Destination coordinates
	originLat := journey.Lat
	originLng := journey.Lng
	if !isValidCoord(originLat, originLng) {
		originLat = getFloat(journeyMeta, "origin_lat")
		originLng = getFloat(journeyMeta, "origin_lng")
	}
	if !isValidCoord(originLat, originLng) {
		return nil, false
	}

	destLat := getFloat(journeyMeta, "destination_lat")
	destLng := getFloat(journeyMeta, "destination_lng")
	if !isValidCoord(destLat, destLng) {
		return nil, false
	}

	originCoord := spatial.Coordinates{Lat: originLat, Lng: originLng}
	destCoord := spatial.Coordinates{Lat: destLat, Lng: destLng}

	// Baseline commute distance
	baselineDist := spatial.HaversineDistance(originCoord, destCoord)
	if baselineDist < 100.0 { // Origin and destination virtually identical
		return nil, false
	}

	// 4. Directionality verification:
	// Delivery must progress forward along the traveller's corridor vector (Origin -> Destination).
	tPickup := spatial.RouteProgressProjection(pickupCoord, originCoord, destCoord)
	tDrop := spatial.RouteProgressProjection(deliveryCoord, originCoord, destCoord)

	// If drop-off projection is behind pickup projection, it's travelling in the wrong / reverse direction.
	if tDrop < tPickup-0.05 {
		return nil, false
	}

	// 5. Corridor Detour and Lateral Offset calculation
	addedDetour, pickupCorridor, dropCorridor := spatial.CalculateCommuteDetour(originCoord, destCoord, pickupCoord, deliveryCoord)

	// Enforce individual journey detour tolerance limit
	maxDetourKM := getFloat(journeyMeta, "max_detour_km")
	if maxDetourKM <= 0 {
		maxDetourKM = journey.RadiusKM
	}
	if maxDetourKM <= 0 {
		maxDetourKM = 5.0 // Default 5 km tolerance
	}
	maxDetourMeters := maxDetourKM * 1000.0

	// If total added detour or corridor offset exceeds tolerance, reject
	if addedDetour > maxDetourMeters {
		return nil, false
	}
	if pickupCorridor > maxDetourMeters || dropCorridor > maxDetourMeters {
		return nil, false
	}

	// 6. Schedule and Timing Window Verification
	if need.ScheduledStart != nil && !need.ScheduledStart.IsZero() {
		ist := time.FixedZone("IST", 5*3600+30*60)
		reqDate := need.ScheduledStart.In(ist)
		reqDay := strings.ToUpper(reqDate.Format("Mon"))

		travelFreq := strings.ToUpper(getString(journeyMeta, "travel_frequency"))
		if travelFreq == "WEEKDAYS" && (reqDay == "SAT" || reqDay == "SUN") {
			return nil, false
		}
		if travelFreq == "WEEKENDS" && (reqDay != "SAT" && reqDay != "SUN") {
			return nil, false
		}

		days := getStringSlice(journeyMeta, "available_days")
		if len(days) > 0 {
			matchedDay := false
			for _, d := range days {
				if strings.EqualFold(d, reqDay) || strings.HasPrefix(strings.ToUpper(d), reqDay) {
					matchedDay = true
					break
				}
			}
			if !matchedDay && travelFreq != "DAILY" {
				return nil, false
			}
		}

		// Departure window check
		depStartStr := getString(journeyMeta, "departure_window_start")
		depEndStr := getString(journeyMeta, "departure_window_end")
		depStartMin, hasStart := parseTimeToMinutes(depStartStr)
		depEndMin, hasEnd := parseTimeToMinutes(depEndStr)

		if hasStart || hasEnd {
			reqMin := reqDate.Hour()*60 + reqDate.Minute()
			// Allow 60-minute window margin
			if hasStart && reqMin < depStartMin-60 {
				return nil, false
			}
			if hasEnd && reqMin > depEndMin+60 {
				return nil, false
			}
		}
	}

	// 7. Format Payout and Estimated Detour Time
	detourMin := int(math.Ceil(addedDetour / 500.0))
	if detourMin < 1 {
		detourMin = 1
	}

	payoutCents := 4000 // Default ₹40.00
	if need.BudgetMax != nil && *need.BudgetMax > 0 {
		payoutCents = int(*need.BudgetMax * 100)
	} else if journey.BudgetMax != nil && *journey.BudgetMax > 0 {
		payoutCents = int(*journey.BudgetMax * 100)
	}

	originAddr := journey.AddressText
	if oaddr := getString(journeyMeta, "origin_address"); oaddr != "" {
		originAddr = oaddr
	}
	destAddr := originAddr
	if daddr := getString(journeyMeta, "destination_address"); daddr != "" {
		destAddr = daddr
	} else if daddr := getString(journeyMeta, "destination"); daddr != "" {
		destAddr = daddr
	}

	travelFreq := "DAILY"
	if tf := getString(journeyMeta, "travel_frequency"); tf != "" {
		travelFreq = tf
	}
	travelMode := "BIKE"
	if tm := getString(journeyMeta, "travel_mode"); tm != "" {
		travelMode = tm
	}

	// Privacy protection: exclude private street address and mask phone number
	var maskedProvider *domain.User
	if candidateUser != nil {
		maskedProvider = &domain.User{
			ID:         candidateUser.ID,
			FullName:   candidateUser.FullName,
			Phone:      MaskPhone(candidateUser.Phone),
			AvatarURL:  candidateUser.AvatarURL,
			TrustScore: candidateUser.TrustScore,
		}
	}

	return &domain.CommuteMatchResult{
		OfferID:              journey.ID,
		NeedID:               need.ID,
		ProviderID:           journey.UserID,
		Provider:             maskedProvider,
		OfferTitle:           journey.Title,
		OriginAddress:        originAddr,
		DestinationAddress:   destAddr,
		PickupAddress:        pickupAddr,
		DeliveryAddress:      deliveryAddr,
		PickupDetourMeters:   pickupCorridor,
		DeliveryDetourMeters: dropCorridor,
		TotalDetourMeters:    addedDetour,
		EstimatedDetourMin:   detourMin,
		EstimatedPayoutCents: payoutCents,
		FormattedPayout:      fmt.Sprintf("₹%.0f", float64(payoutCents)/100.0),
		TravelMode:           travelMode,
		TravelFrequency:      travelFreq,
		CreatedAt:            journey.CreatedAt,
	}, true
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

	// Validate need eligibility
	if need.Type != domain.TypeNeed {
		return []*domain.CommuteMatchResult{}, nil
	}
	if need.AssignedUserID != nil {
		return []*domain.CommuteMatchResult{}, nil
	}
	validStatuses := map[domain.OpportunityStatus]bool{
		domain.StatusOpen:            true,
		domain.StatusOpenNeed:        true,
		domain.StatusPendingMatching: true,
		"ORDER_PLACED":               true,
		domain.StatusInProgress:      true,
	}
	if !validStatuses[need.Status] {
		return []*domain.CommuteMatchResult{}, nil
	}

	// 2. Extract and resolve Need coordinates (Pickup & Delivery)
	pickupLat := need.Lat
	pickupLng := need.Lng
	pickupAddr := need.AddressText

	deliveryLat := need.Lat
	deliveryLng := need.Lng
	deliveryAddr := need.AddressText

	var needMeta map[string]interface{}
	if len(need.Metadata) > 0 {
		_ = json.Unmarshal(need.Metadata, &needMeta)
	}

	if needMeta != nil {
		if plat := getFloat(needMeta, "pickup_lat"); plat != 0 {
			pickupLat = plat
		}
		if plng := getFloat(needMeta, "pickup_lng"); plng != 0 {
			pickupLng = plng
		}
		if paddr := getString(needMeta, "pickup_location"); paddr != "" {
			pickupAddr = paddr
		} else if saddr := getString(needMeta, "source_location"); saddr != "" {
			pickupAddr = saddr
		}

		if dlat := getFloat(needMeta, "delivery_lat"); dlat != 0 {
			deliveryLat = dlat
		}
		if dlng := getFloat(needMeta, "delivery_lng"); dlng != 0 {
			deliveryLng = dlng
		}
		if daddr := getString(needMeta, "delivery_location"); daddr != "" {
			deliveryAddr = daddr
		} else if daddr := getString(needMeta, "delivery_address"); daddr != "" {
			deliveryAddr = daddr
		}
	}

	// Resolve pickup from catalog item if linked and pickup coordinates were not specified
	if need.CatalogItemID != nil && (pickupLat == deliveryLat && pickupLng == deliveryLng) {
		var cLat, cLng float64
		var cAddr string
		catQuery := `SELECT COALESCE(ST_Y(pickup_location::geometry), 0), COALESCE(ST_X(pickup_location::geometry), 0), COALESCE(pickup_address, '') FROM vendor_catalog_items WHERE id = $1`
		if err := r.db.Pool.QueryRow(ctx, catQuery, need.CatalogItemID).Scan(&cLat, &cLng, &cAddr); err == nil && cLat != 0 && cLng != 0 {
			pickupLat = cLat
			pickupLng = cLng
			if cAddr != "" {
				pickupAddr = cAddr
			}
		}
	}

	// Safe coordinate validation
	if !isValidCoord(pickupLat, pickupLng) || !isValidCoord(deliveryLat, deliveryLng) {
		return []*domain.CommuteMatchResult{}, nil
	}

	pickupCoord := spatial.Coordinates{Lat: pickupLat, Lng: pickupLng}
	deliveryCoord := spatial.Coordinates{Lat: deliveryLat, Lng: deliveryLng}

	// 3. Query active genuine journey OFFER listings
	query := `
		SELECT o.id, o.user_id, o.title, COALESCE(o.description, ''), o.status,
		       COALESCE(o.address_text, ''), o.budget_max, o.radius_km, COALESCE(o.metadata, '{}'::jsonb), o.created_at,
		       ST_Y(o.location::geometry) as origin_lat, ST_X(o.location::geometry) as origin_lng,
		       u.full_name, COALESCE(u.phone, ''), COALESCE(u.avatar_url, ''), u.trust_score
		FROM opportunities o
		JOIN users u ON o.user_id = u.id
		WHERE o.type = 'OFFER'
		  AND (o.order_mode = 'JOURNEY' OR o.metadata->>'is_journey' = 'true')
		  AND o.status IN ('OPEN', 'PENDING_MATCHING', 'ACTIVE')
		  AND o.status NOT IN ('PAUSED', 'CANCELLED')
		  AND COALESCE(o.metadata->>'is_active', 'true') != 'false'
		  AND o.user_id != $1;
	`

	rows, err := r.db.Pool.Query(ctx, query, need.UserID)
	if err != nil {
		return nil, fmt.Errorf("failed to query commuter offers: %w", err)
	}
	defer rows.Close()

	var matches []*domain.CommuteMatchResult

	for rows.Next() {
		var offerID, providerID uuid.UUID
		var title, desc, status, addressText, fullName, phone, avatarURL string
		var budgetMax *float64
		var radiusKM, originLat, originLng, trustScore float64
		var metaRaw []byte
		var createdAt time.Time

		err := rows.Scan(
			&offerID, &providerID, &title, &desc, &status,
			&addressText, &budgetMax, &radiusKM, &metaRaw, &createdAt,
			&originLat, &originLng,
			&fullName, &phone, &avatarURL, &trustScore,
		)
		if err != nil {
			return nil, err
		}

		var journeyMeta map[string]interface{}
		if len(metaRaw) > 0 {
			_ = json.Unmarshal(metaRaw, &journeyMeta)
		}

		journeyOpp := &domain.Opportunity{
			ID:          offerID,
			UserID:      providerID,
			Title:       title,
			Description: desc,
			Status:      domain.OpportunityStatus(status),
			AddressText: addressText,
			BudgetMax:   budgetMax,
			RadiusKM:    radiusKM,
			Lat:         originLat,
			Lng:         originLng,
			OrderMode:   domain.OrderModeJourney,
			CreatedAt:   createdAt,
			Metadata:    metaRaw,
		}

		candidateUser := &domain.User{
			ID:         providerID,
			FullName:   fullName,
			Phone:      phone,
			AvatarURL:  avatarURL,
			TrustScore: trustScore,
		}

		if match, ok := EvaluateCommuteMatch(need, pickupCoord, deliveryCoord, pickupAddr, deliveryAddr, journeyOpp, journeyMeta, candidateUser, radiusMeters); ok {
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

// SaveOpportunityMatchWithDetails inserts or updates an opportunity match record with distance, quote, and notes
func (r *OpportunityRepository) SaveOpportunityMatchWithDetails(ctx context.Context, oppID, providerID uuid.UUID, status string, distanceMeters, quoteAmount float64, notes string) error {
	query := `
		INSERT INTO opportunity_matches (id, opportunity_id, matched_user_id, status, distance_meters, quote_amount, notes, updated_at)
		VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, NOW())
		ON CONFLICT (opportunity_id, matched_user_id) DO UPDATE
		SET status = CASE 
				WHEN opportunity_matches.status IN ('ACCEPTED', 'DECLINED', 'EXPIRED') THEN opportunity_matches.status 
				ELSE EXCLUDED.status 
		    END,
		    distance_meters = EXCLUDED.distance_meters,
		    quote_amount = EXCLUDED.quote_amount,
		    notes = EXCLUDED.notes,
		    updated_at = NOW();
	`
	_, err := r.db.Pool.Exec(ctx, query, oppID, providerID, status, distanceMeters, quoteAmount, notes)
	return err
}

// SaveOpportunityMatch inserts or updates an opportunity match record
func (r *OpportunityRepository) SaveOpportunityMatch(ctx context.Context, oppID, providerID uuid.UUID, status string) error {
	return r.SaveOpportunityMatchWithDetails(ctx, oppID, providerID, status, 0, 0, "")
}

// GetMatchingRequestsForProvider gets unaccepted matching requests for a provider's approved services or matched journeys
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
		LEFT JOIN user_skills_assets usa ON (
			usa.user_id = $1
			AND usa.status IN ('APPROVED', 'ACTIVE')
			AND usa.is_available = TRUE
			AND (
				(o.category_id IS NOT NULL AND usa.category_id = o.category_id)
				OR (c.slug IS NOT NULL AND (
					LOWER(usa.asset_type) = REPLACE(LOWER(c.slug), '-', '_')
					OR LOWER(usa.asset_type) LIKE REPLACE(LOWER(c.slug), '-', '_') || '%'
					OR REPLACE(LOWER(c.slug), '-', '_') LIKE LOWER(usa.asset_type) || '%'
					OR LOWER(usa.title) ILIKE '%' || LOWER(c.name) || '%'
				))
			)
		)
		WHERE o.type = 'NEED'
		  AND o.user_id != $1
		  AND o.assigned_user_id IS NULL
		  AND (o.target_vendor_id IS NULL OR o.target_vendor_id = $1)
		  AND o.status IN ('OPEN', 'OPEN_NEED', 'PENDING_MATCHING', 'ORDER_PLACED')
		  AND (o.parent_opportunity_id IS NOT NULL OR NOT EXISTS (SELECT 1 FROM opportunities child WHERE child.parent_opportunity_id = o.id))
		  AND (
		      usa.id IS NOT NULL
		      OR EXISTS (
		          SELECT 1 FROM opportunity_matches om
		          WHERE om.opportunity_id = o.id
		            AND om.matched_user_id = $1
		            AND om.status IN ('PROPOSED', 'NOTIFIED')
		      )
		  )
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

// -----------------------------------------------------------------------------
// JOURNEY REPOSITORY METHODS (Phase A)
// -----------------------------------------------------------------------------

// mapOppToUserJourney parses an opportunity row into a clean domain.UserJourney
func mapOppToUserJourney(id, userID uuid.UUID, title, desc, status, originAddr string, lat, lng, radiusKM float64, metaRaw []byte, createdAt, updatedAt time.Time, user *domain.User) *domain.UserJourney {
	j := &domain.UserJourney{
		ID:                 id,
		UserID:             userID,
		User:               user,
		Title:              title,
		Description:        desc,
		Status:             status,
		OriginAddress:      originAddr,
		OriginLat:          lat,
		OriginLng:          lng,
		MaxDetourKM:        radiusKM,
		MaxDetourMinutes:   15,
		TravelMode:         "BIKE",
		JourneyType:        "ONE_TIME",
		TravelFrequency:    "ONE_TIME",
		IsActive:           (status == string(domain.StatusOpen) || status == "ACTIVE"),
		CreatedAt:          createdAt,
		UpdatedAt:          updatedAt,
	}

	if len(metaRaw) > 0 {
		var meta map[string]interface{}
		if err := json.Unmarshal(metaRaw, &meta); err == nil {
			if dest, ok := meta["destination_address"].(string); ok && dest != "" {
				j.DestinationAddress = dest
			} else if dest, ok := meta["destination"].(string); ok && dest != "" {
				j.DestinationAddress = dest
			}
			if dlat, ok := meta["destination_lat"].(float64); ok {
				j.DestinationLat = dlat
			}
			if dlng, ok := meta["destination_lng"].(float64); ok {
				j.DestinationLng = dlng
			}
			if tm, ok := meta["travel_mode"].(string); ok && tm != "" {
				j.TravelMode = tm
			}
			if jt, ok := meta["journey_type"].(string); ok && jt != "" {
				j.JourneyType = jt
			}
			if tf, ok := meta["travel_frequency"].(string); ok && tf != "" {
				j.TravelFrequency = tf
			}
			if dws, ok := meta["departure_window_start"].(string); ok {
				j.DepartureWindowStart = dws
			}
			if dwe, ok := meta["departure_window_end"].(string); ok {
				j.DepartureWindowEnd = dwe
			}
			if aws, ok := meta["arrival_window_start"].(string); ok {
				j.ArrivalWindowStart = aws
			}
			if awe, ok := meta["arrival_window_end"].(string); ok {
				j.ArrivalWindowEnd = awe
			}
			if mdm, ok := meta["max_detour_minutes"].(float64); ok && mdm > 0 {
				j.MaxDetourMinutes = int(mdm)
			}
			if mdkm, ok := meta["max_detour_km"].(float64); ok && mdkm > 0 {
				j.MaxDetourKM = mdkm
			}
			if daysRaw, ok := meta["available_days"].([]interface{}); ok {
				var days []string
				for _, d := range daysRaw {
					if dStr, ok := d.(string); ok {
						days = append(days, dStr)
					}
				}
				j.AvailableDays = days
			}
			if act, ok := meta["is_active"].(bool); ok {
				j.IsActive = act && (status == string(domain.StatusOpen) || status == "ACTIVE")
			}
		}
	}

	return j
}

// GetUserJourneys returns all journey offers created by the specified user
func (r *OpportunityRepository) GetUserJourneys(ctx context.Context, userID uuid.UUID) ([]*domain.UserJourney, error) {
	query := `
		SELECT o.id, o.user_id, o.title, COALESCE(o.description, ''), o.status,
		       ST_Y(o.location::geometry) as lat, ST_X(o.location::geometry) as lng,
		       COALESCE(o.address_text, ''), o.radius_km, COALESCE(o.metadata, '{}'::jsonb),
		       o.created_at, o.updated_at,
		       u.full_name, COALESCE(u.phone, ''), COALESCE(u.avatar_url, ''), u.trust_score
		FROM opportunities o
		JOIN users u ON o.user_id = u.id
		WHERE o.user_id = $1
		  AND o.type = 'OFFER'
		  AND (o.order_mode = 'JOURNEY' OR (o.metadata->>'is_journey')::boolean = true OR o.metadata ? 'destination_address' OR o.metadata ? 'destination')
		ORDER BY o.created_at DESC;
	`
	rows, err := r.db.Pool.Query(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to query user journeys: %w", err)
	}
	defer rows.Close()

	var journeys []*domain.UserJourney
	for rows.Next() {
		var id, uid uuid.UUID
		var title, desc, status, originAddr, fullName, phone, avatarURL string
		var lat, lng, radiusKM, trustScore float64
		var metaRaw []byte
		var createdAt, updatedAt time.Time

		err := rows.Scan(
			&id, &uid, &title, &desc, &status,
			&lat, &lng, &originAddr, &radiusKM, &metaRaw,
			&createdAt, &updatedAt,
			&fullName, &phone, &avatarURL, &trustScore,
		)
		if err != nil {
			return nil, err
		}

		u := &domain.User{
			ID:         uid,
			FullName:   fullName,
			Phone:      phone,
			AvatarURL:  avatarURL,
			TrustScore: trustScore,
		}

		j := mapOppToUserJourney(id, uid, title, desc, status, originAddr, lat, lng, radiusKM, metaRaw, createdAt, updatedAt, u)
		journeys = append(journeys, j)
	}
	return journeys, nil
}

// GetJourneyByID retrieves a single journey with ownership check
func (r *OpportunityRepository) GetJourneyByID(ctx context.Context, id, userID uuid.UUID) (*domain.UserJourney, error) {
	query := `
		SELECT o.id, o.user_id, o.title, COALESCE(o.description, ''), o.status,
		       ST_Y(o.location::geometry) as lat, ST_X(o.location::geometry) as lng,
		       COALESCE(o.address_text, ''), o.radius_km, COALESCE(o.metadata, '{}'::jsonb),
		       o.created_at, o.updated_at,
		       u.full_name, COALESCE(u.phone, ''), COALESCE(u.avatar_url, ''), u.trust_score
		FROM opportunities o
		JOIN users u ON o.user_id = u.id
		WHERE o.id = $1 AND o.user_id = $2;
	`
	var uid uuid.UUID
	var title, desc, status, originAddr, fullName, phone, avatarURL string
	var lat, lng, radiusKM, trustScore float64
	var metaRaw []byte
	var createdAt, updatedAt time.Time

	err := r.db.Pool.QueryRow(ctx, query, id, userID).Scan(
		&id, &uid, &title, &desc, &status,
		&lat, &lng, &originAddr, &radiusKM, &metaRaw,
		&createdAt, &updatedAt,
		&fullName, &phone, &avatarURL, &trustScore,
	)
	if err != nil {
		return nil, fmt.Errorf("journey not found or unauthorized: %w", err)
	}

	u := &domain.User{
		ID:         uid,
		FullName:   fullName,
		Phone:      phone,
		AvatarURL:  avatarURL,
		TrustScore: trustScore,
	}

	return mapOppToUserJourney(id, uid, title, desc, status, originAddr, lat, lng, radiusKM, metaRaw, createdAt, updatedAt, u), nil
}

// UpdateJourney updates journey fields with strict ownership check
func (r *OpportunityRepository) UpdateJourney(ctx context.Context, id, userID uuid.UUID, title, desc, originAddr string, originLat, originLng, maxDetourKM float64, metadata json.RawMessage) (*domain.UserJourney, error) {
	query := `
		UPDATE opportunities
		SET title = $3,
		    description = $4,
		    address_text = $5,
		    location = ST_SetSRID(ST_MakePoint($6, $7), 4326)::geography,
		    radius_km = $8,
		    metadata = $9,
		    updated_at = NOW()
		WHERE id = $1 AND user_id = $2
		RETURNING id, user_id, title, COALESCE(description, ''), status,
		          ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng,
		          COALESCE(address_text, ''), radius_km, COALESCE(metadata, '{}'::jsonb),
		          created_at, updated_at;
	`
	var uid uuid.UUID
	var status string
	var lat, lng, radius float64
	var metaRaw []byte
	var createdAt, updatedAt time.Time

	err := r.db.Pool.QueryRow(ctx, query, id, userID, title, desc, originAddr, originLng, originLat, maxDetourKM, metadata).Scan(
		&id, &uid, &title, &desc, &status,
		&lat, &lng, &originAddr, &radius, &metaRaw,
		&createdAt, &updatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to update journey: %w", err)
	}

	return mapOppToUserJourney(id, uid, title, desc, status, originAddr, lat, lng, radius, metaRaw, createdAt, updatedAt, nil), nil
}

// UpdateJourneyStatus updates status (OPEN, PAUSED, CANCELLED) and is_active flag with ownership check
func (r *OpportunityRepository) UpdateJourneyStatus(ctx context.Context, id, userID uuid.UUID, status domain.OpportunityStatus, isActive bool) error {
	isActiveJSON, _ := json.Marshal(isActive)
	query := `
		UPDATE opportunities
		SET status = $3,
		    metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{is_active}', $4::jsonb),
		    updated_at = NOW()
		WHERE id = $1 AND user_id = $2;
	`
	cmdTag, err := r.db.Pool.Exec(ctx, query, id, userID, status, isActiveJSON)
	if err != nil {
		return fmt.Errorf("failed to update journey status: %w", err)
	}
	if cmdTag.RowsAffected() == 0 {
		return fmt.Errorf("journey not found or unauthorized")
	}
	return nil
}


