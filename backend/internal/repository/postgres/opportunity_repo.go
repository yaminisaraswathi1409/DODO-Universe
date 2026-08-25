package postgres

import (
	"context"
	"errors"
	"fmt"

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

func (r *OpportunityRepository) Create(ctx context.Context, opp *domain.Opportunity) (*domain.Opportunity, error) {
	if opp.ID != uuid.Nil {
		query := `
			INSERT INTO opportunities (
				id, user_id, category_id, type, title, description, workflow_model, status,
				location, address_text, radius_km, budget_min, budget_max, price_unit,
				scheduled_start, scheduled_end, parent_opportunity_id, metadata
			) VALUES (
				$1, $2, $3, $4, $5, $6, $7, $8,
				ST_SetSRID(ST_MakePoint($9, $10), 4326)::geography, $11, $12, $13, $14, $15,
				$16, $17, $18, COALESCE($19, '{}'::jsonb)
			)
			RETURNING id, user_id, category_id, type, title, description, workflow_model, status,
			          ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng, COALESCE(address_text, ''),
			          radius_km, budget_min, budget_max, price_unit, scheduled_start, scheduled_end,
			          parent_opportunity_id, metadata, created_at, updated_at;
		`
		row := r.db.Pool.QueryRow(ctx, query,
			opp.ID, opp.UserID, opp.CategoryID, opp.Type, opp.Title, opp.Description, opp.WorkflowModel, opp.Status,
			opp.Lng, opp.Lat, opp.AddressText, opp.RadiusKM, opp.BudgetMin, opp.BudgetMax, opp.PriceUnit,
			opp.ScheduledStart, opp.ScheduledEnd, opp.ParentOpportunityID, opp.Metadata,
		)
		var res domain.Opportunity
		err := row.Scan(
			&res.ID, &res.UserID, &res.CategoryID, &res.Type, &res.Title, &res.Description, &res.WorkflowModel, &res.Status,
			&res.Lat, &res.Lng, &res.AddressText, &res.RadiusKM, &res.BudgetMin, &res.BudgetMax, &res.PriceUnit,
			&res.ScheduledStart, &res.ScheduledEnd, &res.ParentOpportunityID, &res.Metadata, &res.CreatedAt, &res.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to create opportunity with explicit id: %w", err)
		}
		return &res, nil
	}

	query := `
		INSERT INTO opportunities (
			user_id, category_id, type, title, description, workflow_model, status,
			location, address_text, radius_km, budget_min, budget_max, price_unit,
			scheduled_start, scheduled_end, parent_opportunity_id, metadata
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7,
			ST_SetSRID(ST_MakePoint($8, $9), 4326)::geography, $10, $11, $12, $13, $14,
			$15, $16, $17, COALESCE($18, '{}'::jsonb)
		)
		RETURNING id, user_id, category_id, type, title, description, workflow_model, status,
		          ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng, COALESCE(address_text, ''),
		          radius_km, budget_min, budget_max, price_unit, scheduled_start, scheduled_end,
		          parent_opportunity_id, metadata, created_at, updated_at;
	`

	row := r.db.Pool.QueryRow(ctx, query,
		opp.UserID, opp.CategoryID, opp.Type, opp.Title, opp.Description, opp.WorkflowModel, opp.Status,
		opp.Lng, opp.Lat, opp.AddressText, opp.RadiusKM, opp.BudgetMin, opp.BudgetMax, opp.PriceUnit,
		opp.ScheduledStart, opp.ScheduledEnd, opp.ParentOpportunityID, opp.Metadata,
	)

	var res domain.Opportunity
	err := row.Scan(
		&res.ID, &res.UserID, &res.CategoryID, &res.Type, &res.Title, &res.Description, &res.WorkflowModel, &res.Status,
		&res.Lat, &res.Lng, &res.AddressText, &res.RadiusKM, &res.BudgetMin, &res.BudgetMax, &res.PriceUnit,
		&res.ScheduledStart, &res.ScheduledEnd, &res.ParentOpportunityID, &res.Metadata, &res.CreatedAt, &res.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create opportunity: %w", err)
	}

	return &res, nil
}

func (r *OpportunityRepository) GetByID(ctx context.Context, id uuid.UUID) (*domain.Opportunity, error) {
	query := `
		SELECT o.id, o.user_id, o.category_id, o.type, o.title, o.description, o.workflow_model, o.status,
		       ST_Y(o.location::geometry) as lat, ST_X(o.location::geometry) as lng, COALESCE(o.address_text, ''),
		       o.radius_km, o.budget_min, o.budget_max, o.price_unit, o.scheduled_start, o.scheduled_end,
		       o.parent_opportunity_id, COALESCE(o.metadata, '{}'::jsonb), o.created_at, o.updated_at,
		       u.full_name, COALESCE(u.phone, ''), COALESCE(u.avatar_url, ''), u.trust_score
		FROM opportunities o
		JOIN users u ON o.user_id = u.id
		WHERE o.id = $1;
	`

	row := r.db.Pool.QueryRow(ctx, query, id)

	var opp domain.Opportunity
	var u domain.User
	err := row.Scan(
		&opp.ID, &opp.UserID, &opp.CategoryID, &opp.Type, &opp.Title, &opp.Description, &opp.WorkflowModel, &opp.Status,
		&opp.Lat, &opp.Lng, &opp.AddressText, &opp.RadiusKM, &opp.BudgetMin, &opp.BudgetMax, &opp.PriceUnit,
		&opp.ScheduledStart, &opp.ScheduledEnd, &opp.ParentOpportunityID, &opp.Metadata, &opp.CreatedAt, &opp.UpdatedAt,
		&u.FullName, &u.Phone, &u.AvatarURL, &u.TrustScore,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get opportunity by id: %w", err)
	}

	u.ID = opp.UserID
	opp.User = &u
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
		       COALESCE(c.name, ''), COALESCE(c.slug, '')
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
			&cat.Name, &cat.Slug,
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
