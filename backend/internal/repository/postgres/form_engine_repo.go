package postgres

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/uop/backend/internal/domain"
)

type FormEngineRepository struct {
	db *DB
}

func NewFormEngineRepository(db *DB) *FormEngineRepository {
	return &FormEngineRepository{db: db}
}

// CreateSchema creates a new form schema
func (r *FormEngineRepository) CreateSchema(ctx context.Context, schema *domain.FormSchema) error {
	if schema.ID == uuid.Nil {
		schema.ID = uuid.New()
	}
	schema.CreatedAt = time.Now()
	schema.UpdatedAt = time.Now()
	if schema.Version <= 0 {
		schema.Version = 1
	}

	sectionsBytes, _ := json.Marshal(schema.Sections)
	fieldsBytes, _ := json.Marshal(schema.Fields)
	rulesBytes, _ := json.Marshal(schema.Rules)

	query := `
		INSERT INTO form_schemas (
			id, title, description, purpose, category_id, main_service_slug,
			version, is_active, sections, fields, rules, created_by, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
	`
	_, err := r.db.Pool.Exec(
		ctx, query,
		schema.ID, schema.Title, schema.Description, schema.Purpose,
		schema.CategoryID, schema.MainServiceSlug, schema.Version, schema.IsActive,
		sectionsBytes, fieldsBytes, rulesBytes, schema.CreatedBy, schema.CreatedAt, schema.UpdatedAt,
	)
	return err
}

// GetSchemaByID retrieves a form schema by ID
func (r *FormEngineRepository) GetSchemaByID(ctx context.Context, id uuid.UUID) (*domain.FormSchema, error) {
	query := `
		SELECT s.id, s.title, COALESCE(s.description, ''), s.purpose, s.category_id, COALESCE(s.main_service_slug, ''),
		       s.version, s.is_active, s.sections, s.fields, s.rules, s.created_by, s.created_at, s.updated_at,
		       c.id, COALESCE(c.name, ''), COALESCE(c.slug, '')
		FROM form_schemas s
		LEFT JOIN categories c ON s.category_id = c.id
		WHERE s.id = $1
	`
	row := r.db.Pool.QueryRow(ctx, query, id)

	var s domain.FormSchema
	var catID, createdBy *uuid.UUID
	var mainService string
	var desc string
	var sectionsRaw, fieldsRaw, rulesRaw []byte
	var cID *uuid.UUID
	var cName, cSlug string

	err := row.Scan(
		&s.ID, &s.Title, &desc, &s.Purpose, &catID, &mainService,
		&s.Version, &s.IsActive, &sectionsRaw, &fieldsRaw, &rulesRaw, &createdBy,
		&s.CreatedAt, &s.UpdatedAt, &cID, &cName, &cSlug,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}

	s.Description = desc
	s.CategoryID = catID
	s.MainServiceSlug = mainService
	s.CreatedBy = createdBy
	if cID != nil {
		s.Category = &domain.Category{
			ID:   *cID,
			Name: cName,
			Slug: cSlug,
		}
	}

	_ = json.Unmarshal(sectionsRaw, &s.Sections)
	_ = json.Unmarshal(fieldsRaw, &s.Fields)
	_ = json.Unmarshal(rulesRaw, &s.Rules)

	return &s, nil
}

// GetActiveSchemaForCategory finds the active schema for a category and purpose
func (r *FormEngineRepository) GetActiveSchemaForCategory(ctx context.Context, categoryID uuid.UUID, purpose domain.FormPurpose) (*domain.FormSchema, error) {
	query := `
		SELECT s.id, s.title, COALESCE(s.description, ''), s.purpose, s.category_id, COALESCE(s.main_service_slug, ''),
		       s.version, s.is_active, s.sections, s.fields, s.rules, s.created_by, s.created_at, s.updated_at,
		       c.id, COALESCE(c.name, ''), COALESCE(c.slug, '')
		FROM form_schemas s
		LEFT JOIN categories c ON s.category_id = c.id
		WHERE s.category_id = $1 AND s.purpose = $2 AND s.is_active = TRUE
		ORDER BY s.version DESC
		LIMIT 1
	`
	row := r.db.Pool.QueryRow(ctx, query, categoryID, purpose)

	var s domain.FormSchema
	var catID, createdBy *uuid.UUID
	var mainService string
	var desc string
	var sectionsRaw, fieldsRaw, rulesRaw []byte
	var cID *uuid.UUID
	var cName, cSlug string

	err := row.Scan(
		&s.ID, &s.Title, &desc, &s.Purpose, &catID, &mainService,
		&s.Version, &s.IsActive, &sectionsRaw, &fieldsRaw, &rulesRaw, &createdBy,
		&s.CreatedAt, &s.UpdatedAt, &cID, &cName, &cSlug,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}

	s.Description = desc
	s.CategoryID = catID
	s.MainServiceSlug = mainService
	s.CreatedBy = createdBy
	if cID != nil {
		s.Category = &domain.Category{
			ID:   *cID,
			Name: cName,
			Slug: cSlug,
		}
	}

	_ = json.Unmarshal(sectionsRaw, &s.Sections)
	_ = json.Unmarshal(fieldsRaw, &s.Fields)
	_ = json.Unmarshal(rulesRaw, &s.Rules)

	return &s, nil
}

// GetActiveSchemaForService finds the active schema for a main service and purpose
func (r *FormEngineRepository) GetActiveSchemaForService(ctx context.Context, serviceSlug string, purpose domain.FormPurpose) (*domain.FormSchema, error) {
	query := `
		SELECT s.id, s.title, COALESCE(s.description, ''), s.purpose, s.category_id, COALESCE(s.main_service_slug, ''),
		       s.version, s.is_active, s.sections, s.fields, s.rules, s.created_by, s.created_at, s.updated_at,
		       c.id, COALESCE(c.name, ''), COALESCE(c.slug, '')
		FROM form_schemas s
		LEFT JOIN categories c ON s.category_id = c.id
		WHERE s.main_service_slug = $1 AND s.purpose = $2 AND s.is_active = TRUE
		ORDER BY s.version DESC
		LIMIT 1
	`
	row := r.db.Pool.QueryRow(ctx, query, serviceSlug, purpose)

	var s domain.FormSchema
	var catID, createdBy *uuid.UUID
	var mainService string
	var desc string
	var sectionsRaw, fieldsRaw, rulesRaw []byte
	var cID *uuid.UUID
	var cName, cSlug string

	err := row.Scan(
		&s.ID, &s.Title, &desc, &s.Purpose, &catID, &mainService,
		&s.Version, &s.IsActive, &sectionsRaw, &fieldsRaw, &rulesRaw, &createdBy,
		&s.CreatedAt, &s.UpdatedAt, &cID, &cName, &cSlug,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}

	s.Description = desc
	s.CategoryID = catID
	s.MainServiceSlug = mainService
	s.CreatedBy = createdBy
	if cID != nil {
		s.Category = &domain.Category{
			ID:   *cID,
			Name: cName,
			Slug: cSlug,
		}
	}

	_ = json.Unmarshal(sectionsRaw, &s.Sections)
	_ = json.Unmarshal(fieldsRaw, &s.Fields)
	_ = json.Unmarshal(rulesRaw, &s.Rules)

	return &s, nil
}

// ListSchemas lists schemas with optional filters
func (r *FormEngineRepository) ListSchemas(ctx context.Context, purpose *domain.FormPurpose, categoryID *uuid.UUID, activeOnly bool) ([]*domain.FormSchema, error) {
	query := `
		SELECT s.id, s.title, COALESCE(s.description, ''), s.purpose, s.category_id, COALESCE(s.main_service_slug, ''),
		       s.version, s.is_active, s.sections, s.fields, s.rules, s.created_by, s.created_at, s.updated_at,
		       c.id, COALESCE(c.name, ''), COALESCE(c.slug, '')
		FROM form_schemas s
		LEFT JOIN categories c ON s.category_id = c.id
		WHERE 1=1
	`
	var args []interface{}
	argIdx := 1

	if purpose != nil && *purpose != "" {
		query += fmt.Sprintf(" AND s.purpose = $%d", argIdx)
		args = append(args, *purpose)
		argIdx++
	}
	if categoryID != nil && *categoryID != uuid.Nil {
		query += fmt.Sprintf(" AND s.category_id = $%d", argIdx)
		args = append(args, *categoryID)
		argIdx++
	}
	if activeOnly {
		query += " AND s.is_active = TRUE"
	}

	query += " ORDER BY s.created_at DESC"

	rows, err := r.db.Pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var res []*domain.FormSchema
	for rows.Next() {
		var s domain.FormSchema
		var catID, createdBy *uuid.UUID
		var mainService string
		var desc string
		var sectionsRaw, fieldsRaw, rulesRaw []byte
		var cID *uuid.UUID
		var cName, cSlug string

		if err := rows.Scan(
			&s.ID, &s.Title, &desc, &s.Purpose, &catID, &mainService,
			&s.Version, &s.IsActive, &sectionsRaw, &fieldsRaw, &rulesRaw, &createdBy,
			&s.CreatedAt, &s.UpdatedAt, &cID, &cName, &cSlug,
		); err != nil {
			return nil, err
		}

		s.Description = desc
		s.CategoryID = catID
		s.MainServiceSlug = mainService
		s.CreatedBy = createdBy
		if cID != nil {
			s.Category = &domain.Category{
				ID:   *cID,
				Name: cName,
				Slug: cSlug,
			}
		}

		_ = json.Unmarshal(sectionsRaw, &s.Sections)
		_ = json.Unmarshal(fieldsRaw, &s.Fields)
		_ = json.Unmarshal(rulesRaw, &s.Rules)

		res = append(res, &s)
	}

	return res, nil
}

// PublishNewVersion publishes an updated version of a schema while preserving history
func (r *FormEngineRepository) PublishNewVersion(ctx context.Context, prevSchemaID uuid.UUID, newSchema *domain.FormSchema) error {
	prev, err := r.GetSchemaByID(ctx, prevSchemaID)
	if err != nil {
		return err
	}

	// Deactivate previous schema
	_, err = r.db.Pool.Exec(ctx, "UPDATE form_schemas SET is_active = FALSE, updated_at = NOW() WHERE id = $1", prevSchemaID)
	if err != nil {
		return err
	}

	// Create new schema with incremented version
	newSchema.ID = uuid.New()
	newSchema.Version = prev.Version + 1
	newSchema.IsActive = true
	newSchema.Purpose = prev.Purpose
	newSchema.CategoryID = prev.CategoryID
	newSchema.MainServiceSlug = prev.MainServiceSlug
	return r.CreateSchema(ctx, newSchema)
}

// CreateSubmission records a submission
func (r *FormEngineRepository) CreateSubmission(ctx context.Context, sub *domain.FormSubmission) error {
	if sub.ID == uuid.Nil {
		sub.ID = uuid.New()
	}
	sub.CreatedAt = time.Now()
	sub.UpdatedAt = time.Now()
	if sub.Status == "" {
		sub.Status = "SUBMITTED"
	}

	answersBytes, _ := json.Marshal(sub.Answers)

	query := `
		INSERT INTO form_submissions (
			id, schema_id, schema_version, schema_snapshot, user_id,
			entity_id, entity_type, status, answers, review_notes,
			reviewed_by, reviewed_at, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
	`
	_, err := r.db.Pool.Exec(
		ctx, query,
		sub.ID, sub.SchemaID, sub.SchemaVersion, sub.SchemaSnapshot, sub.UserID,
		sub.EntityID, sub.EntityType, sub.Status, answersBytes, sub.ReviewNotes,
		sub.ReviewedBy, sub.ReviewedAt, sub.CreatedAt, sub.UpdatedAt,
	)
	return err
}

// GetSubmissionByID retrieves a submission
func (r *FormEngineRepository) GetSubmissionByID(ctx context.Context, id uuid.UUID) (*domain.FormSubmission, error) {
	query := `
		SELECT s.id, s.schema_id, s.schema_version, s.schema_snapshot, s.user_id,
		       s.entity_id, COALESCE(s.entity_type, ''), s.status, s.answers, COALESCE(s.review_notes, ''),
		       s.reviewed_by, s.reviewed_at, s.created_at, s.updated_at
		FROM form_submissions s
		WHERE s.id = $1
	`
	row := r.db.Pool.QueryRow(ctx, query, id)

	var sub domain.FormSubmission
	var entID, revBy *uuid.UUID
	var entType, revNotes string
	var revAt *time.Time
	var answersRaw []byte

	err := row.Scan(
		&sub.ID, &sub.SchemaID, &sub.SchemaVersion, &sub.SchemaSnapshot, &sub.UserID,
		&entID, &entType, &sub.Status, &answersRaw, &revNotes,
		&revBy, &revAt, &sub.CreatedAt, &sub.UpdatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, domain.ErrNotFound
		}
		return nil, err
	}

	sub.EntityID = entID
	sub.EntityType = entType
	sub.ReviewNotes = revNotes
	sub.ReviewedBy = revBy
	sub.ReviewedAt = revAt

	_ = json.Unmarshal(answersRaw, &sub.Answers)

	return &sub, nil
}

// ListSubmissionsByEntity retrieves submissions for an entity
func (r *FormEngineRepository) ListSubmissionsByEntity(ctx context.Context, entityType string, entityID uuid.UUID) ([]*domain.FormSubmission, error) {
	query := `
		SELECT s.id, s.schema_id, s.schema_version, s.schema_snapshot, s.user_id,
		       s.entity_id, COALESCE(s.entity_type, ''), s.status, s.answers, COALESCE(s.review_notes, ''),
		       s.reviewed_by, s.reviewed_at, s.created_at, s.updated_at
		FROM form_submissions s
		WHERE s.entity_type = $1 AND s.entity_id = $2
		ORDER BY s.created_at DESC
	`
	rows, err := r.db.Pool.Query(ctx, query, entityType, entityID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var res []*domain.FormSubmission
	for rows.Next() {
		var sub domain.FormSubmission
		var entID, revBy *uuid.UUID
		var entType, revNotes string
		var revAt *time.Time
		var answersRaw []byte

		if err := rows.Scan(
			&sub.ID, &sub.SchemaID, &sub.SchemaVersion, &sub.SchemaSnapshot, &sub.UserID,
			&entID, &entType, &sub.Status, &answersRaw, &revNotes,
			&revBy, &revAt, &sub.CreatedAt, &sub.UpdatedAt,
		); err != nil {
			return nil, err
		}

		sub.EntityID = entID
		sub.EntityType = entType
		sub.ReviewNotes = revNotes
		sub.ReviewedBy = revBy
		sub.ReviewedAt = revAt

		_ = json.Unmarshal(answersRaw, &sub.Answers)
		res = append(res, &sub)
	}

	return res, nil
}
