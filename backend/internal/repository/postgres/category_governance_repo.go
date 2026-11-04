package postgres

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/uop/backend/internal/domain"
)

type CategoryGovernanceRepository struct {
	db *DB
}

func NewCategoryGovernanceRepository(db *DB) *CategoryGovernanceRepository {
	return &CategoryGovernanceRepository{db: db}
}

// ----------------------------------------------------------------------------
// A. PLATFORM CATEGORY HIERARCHY
// ----------------------------------------------------------------------------

// ListAllCategories returns all categories with hierarchy fields if present
func (r *CategoryGovernanceRepository) ListAllCategories(ctx context.Context) ([]*domain.Category, error) {
	// Dynamically check if hierarchy columns exist
	hasHierarchy := false
	checkColQuery := `
		SELECT COUNT(*) 
		FROM information_schema.columns 
		WHERE table_schema = 'public' AND table_name = 'categories' 
		  AND column_name IN ('parent_id', 'level', 'path', 'is_selectable');
	`
	var colCount int
	if err := r.db.Pool.QueryRow(ctx, checkColQuery).Scan(&colCount); err == nil && colCount >= 4 {
		hasHierarchy = true
	}

	var query string
	if hasHierarchy {
		query = `
			SELECT id, slug, name, COALESCE(description, ''), COALESCE(icon, ''), default_workflow,
			       parent_id, level, path, display_order, is_selectable,
			       COALESCE(required_documents, '[]'::jsonb),
			       COALESCE(opportunity_fields, '[]'::jsonb),
			       COALESCE(vehicle_fields, '[]'::jsonb),
			       COALESCE(driver_fields, '[]'::jsonb),
			       COALESCE(resource_requirements, '{"vehicle": "OPTIONAL", "driver": "OPTIONAL"}'::jsonb),
			       COALESCE(resources, '[]'::jsonb),
			       COALESCE(related_services, '[]'::jsonb),
			       created_at
			FROM categories
			ORDER BY level ASC, display_order ASC, name ASC;
		`
	} else {
		query = `
			SELECT id, slug, name, COALESCE(description, ''), COALESCE(icon, ''), default_workflow,
			       NULL::uuid AS parent_id, 1 AS level, id::text AS path, 0 AS display_order, true AS is_selectable,
			       COALESCE(required_documents, '[]'::jsonb),
			       COALESCE(opportunity_fields, '[]'::jsonb),
			       COALESCE(vehicle_fields, '[]'::jsonb),
			       COALESCE(driver_fields, '[]'::jsonb),
			       COALESCE(resource_requirements, '{"vehicle": "OPTIONAL", "driver": "OPTIONAL"}'::jsonb),
			       COALESCE(resources, '[]'::jsonb),
			       COALESCE(related_services, '[]'::jsonb),
			       created_at
			FROM categories
			ORDER BY name ASC;
		`
	}

	rows, err := r.db.Pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to query categories: %w", err)
	}
	defer rows.Close()

	var categories []*domain.Category
	for rows.Next() {
		var c domain.Category
		var parentID *uuid.UUID
		if err := rows.Scan(
			&c.ID, &c.Slug, &c.Name, &c.Description, &c.Icon, &c.DefaultWorkflow,
			&parentID, &c.Level, &c.Path, &c.DisplayOrder, &c.IsSelectable,
			&c.RequiredDocuments, &c.OpportunityFields, &c.VehicleFields, &c.DriverFields,
			&c.ResourceRequirements, &c.Resources, &c.RelatedServices, &c.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("failed to scan category: %w", err)
		}
		c.ParentID = parentID
		categories = append(categories, &c)
	}

	return categories, nil
}

// GetCategoryTree returns a hierarchical tree structure of categories
func (r *CategoryGovernanceRepository) GetCategoryTree(ctx context.Context) ([]*domain.Category, error) {
	all, err := r.ListAllCategories(ctx)
	if err != nil {
		return nil, err
	}

	catMap := make(map[uuid.UUID]*domain.Category)
	for _, c := range all {
		c.Children = []*domain.Category{}
		catMap[c.ID] = c
	}

	var roots []*domain.Category
	for _, c := range all {
		if c.ParentID == nil || *c.ParentID == uuid.Nil {
			roots = append(roots, c)
		} else if parent, ok := catMap[*c.ParentID]; ok {
			parent.Children = append(parent.Children, c)
		} else {
			// Orphaned or parent missing in map, treat as root
			roots = append(roots, c)
		}
	}

	return roots, nil
}

// UpdateCategoryParent updates a category's parent, validates cycles, and propagates path/level to descendants
func (r *CategoryGovernanceRepository) UpdateCategoryParent(ctx context.Context, categoryID uuid.UUID, parentID *uuid.UUID, displayOrder int) (*domain.Category, error) {
	if parentID != nil && *parentID == categoryID {
		return nil, fmt.Errorf("a category cannot be its own parent")
	}

	tx, err := r.db.Pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// Fetch current category
	var curLevel int
	var curPath string
	err = tx.QueryRow(ctx, `SELECT level, path FROM categories WHERE id = $1;`, categoryID).Scan(&curLevel, &curPath)
	if err != nil {
		return nil, fmt.Errorf("category %s not found: %w", categoryID, err)
	}

	newLevel := 1
	newPath := categoryID.String()

	if parentID != nil && *parentID != uuid.Nil {
		// Verify parent exists and check cycle
		var pLevel int
		var pPath string
		err = tx.QueryRow(ctx, `SELECT level, path FROM categories WHERE id = $1;`, *parentID).Scan(&pLevel, &pPath)
		if err != nil {
			return nil, fmt.Errorf("parent category %s not found: %w", *parentID, err)
		}

		// Cycle check: parent path must not contain categoryID
		pathParts := strings.Split(pPath, "/")
		for _, part := range pathParts {
			if part == categoryID.String() {
				return nil, fmt.Errorf("cyclic hierarchy detected: %s is an ancestor of proposed parent %s", categoryID, *parentID)
			}
		}

		newLevel = pLevel + 1
		newPath = pPath + "/" + categoryID.String()
	}

	// Update category itself
	_, err = tx.Exec(ctx, `
		UPDATE categories
		SET parent_id = $2, level = $3, path = $4, display_order = $5
		WHERE id = $1;
	`, categoryID, parentID, newLevel, newPath, displayOrder)
	if err != nil {
		return nil, fmt.Errorf("failed to update category parent: %w", err)
	}

	// Propagate new path & level to all descendants atomically
	levelDelta := newLevel - curLevel
	oldPrefix := curPath + "/"
	if curPath != "" && curPath != newPath {
		rows, err := tx.Query(ctx, `
			SELECT id, level, path 
			FROM categories 
			WHERE path LIKE $1;
		`, oldPrefix+"%")
		if err == nil {
			defer rows.Close()
			type descUpdate struct {
				id       uuid.UUID
				newLevel int
				newPath  string
			}
			var toUpdate []descUpdate
			for rows.Next() {
				var dID uuid.UUID
				var dLevel int
				var dPath string
				if err := rows.Scan(&dID, &dLevel, &dPath); err == nil {
					suffix := strings.TrimPrefix(dPath, curPath)
					toUpdate = append(toUpdate, descUpdate{
						id:       dID,
						newLevel: dLevel + levelDelta,
						newPath:  newPath + suffix,
					})
				}
			}
			rows.Close()

			for _, u := range toUpdate {
				_, _ = tx.Exec(ctx, `
					UPDATE categories 
					SET level = $2, path = $3 
					WHERE id = $1;
				`, u.id, u.newLevel, u.newPath)
			}
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("failed to commit category parent update: %w", err)
	}

	// Return updated category
	return r.GetCategoryByID(ctx, categoryID)
}

// SetCategorySelectability updates is_selectable
func (r *CategoryGovernanceRepository) SetCategorySelectability(ctx context.Context, categoryID uuid.UUID, isSelectable bool) (*domain.Category, error) {
	_, err := r.db.Pool.Exec(ctx, `
		UPDATE categories
		SET is_selectable = $2
		WHERE id = $1;
	`, categoryID, isSelectable)
	if err != nil {
		return nil, fmt.Errorf("failed to update selectability: %w", err)
	}

	return r.GetCategoryByID(ctx, categoryID)
}

// GetCategoryByID retrieves single category
func (r *CategoryGovernanceRepository) GetCategoryByID(ctx context.Context, id uuid.UUID) (*domain.Category, error) {
	query := `
		SELECT id, slug, name, COALESCE(description, ''), COALESCE(icon, ''), default_workflow,
		       parent_id, level, path, display_order, is_selectable,
		       COALESCE(required_documents, '[]'::jsonb),
		       COALESCE(opportunity_fields, '[]'::jsonb),
		       COALESCE(vehicle_fields, '[]'::jsonb),
		       COALESCE(driver_fields, '[]'::jsonb),
		       COALESCE(resource_requirements, '{"vehicle": "OPTIONAL", "driver": "OPTIONAL"}'::jsonb),
		       COALESCE(resources, '[]'::jsonb),
		       COALESCE(related_services, '[]'::jsonb),
		       created_at
		FROM categories
		WHERE id = $1;
	`
	var c domain.Category
	var parentID *uuid.UUID
	err := r.db.Pool.QueryRow(ctx, query, id).Scan(
		&c.ID, &c.Slug, &c.Name, &c.Description, &c.Icon, &c.DefaultWorkflow,
		&parentID, &c.Level, &c.Path, &c.DisplayOrder, &c.IsSelectable,
		&c.RequiredDocuments, &c.OpportunityFields, &c.VehicleFields, &c.DriverFields,
		&c.ResourceRequirements, &c.Resources, &c.RelatedServices, &c.CreatedAt,
	)
	if err != nil {
		return nil, err
	}
	c.ParentID = parentID
	return &c, nil
}

// ----------------------------------------------------------------------------
// B. VENDOR CATEGORY GOVERNANCE
// ----------------------------------------------------------------------------

// ApplyForCategory handles vendor application or resubmission for a category
func (r *CategoryGovernanceRepository) ApplyForCategory(ctx context.Context, approval *domain.VendorCategoryApproval) error {
	// 1. Verify asset belongs to vendor
	var assetOwner uuid.UUID
	err := r.db.Pool.QueryRow(ctx, `SELECT user_id FROM user_skills_assets WHERE id = $1;`, approval.AssetID).Scan(&assetOwner)
	if err != nil {
		return fmt.Errorf("selected canonical asset %s not found: %w", approval.AssetID, err)
	}
	if assetOwner != approval.VendorID {
		return fmt.Errorf("asset %s does not belong to vendor %s", approval.AssetID, approval.VendorID)
	}

	// 2. Verify secondary assets belong to vendor
	for _, secID := range approval.SecondaryAssetIDs {
		var secOwner uuid.UUID
		err := r.db.Pool.QueryRow(ctx, `SELECT user_id FROM user_skills_assets WHERE id = $1;`, secID).Scan(&secOwner)
		if err != nil || secOwner != approval.VendorID {
			return fmt.Errorf("secondary asset %s does not belong to vendor %s", secID, approval.VendorID)
		}
	}

	// 3. Check existing approval record
	var existingID uuid.UUID
	var existingStatus string
	var existingHistoryJSON []byte
	checkQuery := `
		SELECT id, status, COALESCE(history, '[]'::jsonb)
		FROM vendor_category_approvals
		WHERE vendor_id = $1 AND category_id = $2;
	`
	err = r.db.Pool.QueryRow(ctx, checkQuery, approval.VendorID, approval.CategoryID).Scan(&existingID, &existingStatus, &existingHistoryJSON)

	action := "SUBMITTED"
	if err == nil {
		if existingStatus == string(domain.CategoryApprovalActive) {
			return fmt.Errorf("category approval is already active for this vendor")
		}
		action = "RESUBMITTED"
		approval.ID = existingID
	} else if err != pgx.ErrNoRows {
		// Table might not exist yet, or other query error
		return fmt.Errorf("failed to check existing approvals: %w", err)
	}

	// Build history entry
	historyEntry := domain.ApprovalHistoryEntry{
		Action:    action,
		ActorID:   approval.VendorID,
		ActorRole: "VENDOR",
		Notes:     approval.ChangeRequestNotes,
		Timestamp: time.Now(),
	}

	var historyList []domain.ApprovalHistoryEntry
	if len(existingHistoryJSON) > 0 {
		_ = json.Unmarshal(existingHistoryJSON, &historyList)
	}
	historyList = append(historyList, historyEntry)
	updatedHistoryJSON, _ := json.Marshal(historyList)

	secIDs := approval.SecondaryAssetIDs
	if secIDs == nil {
		secIDs = []uuid.UUID{}
	}

	if approval.ID != uuid.Nil && existingID != uuid.Nil {
		// Update existing application
		updateQuery := `
			UPDATE vendor_category_approvals
			SET asset_id = $3,
			    secondary_asset_ids = $4,
			    status = 'PENDING_APPROVAL',
			    change_request_notes = $5,
			    history = $6,
			    updated_at = NOW()
			WHERE id = $1 AND vendor_id = $2;
		`
		_, err = r.db.Pool.Exec(ctx, updateQuery, approval.ID, approval.VendorID, approval.AssetID, secIDs, approval.ChangeRequestNotes, updatedHistoryJSON)
		return err
	}

	// Insert new application
	insertQuery := `
		INSERT INTO vendor_category_approvals (
			vendor_id, category_id, status, asset_id, secondary_asset_ids,
			change_request_notes, history, created_at, updated_at
		) VALUES ($1, $2, 'PENDING_APPROVAL', $3, $4, $5, $6, NOW(), NOW())
		RETURNING id;
	`
	return r.db.Pool.QueryRow(ctx, insertQuery,
		approval.VendorID, approval.CategoryID, approval.AssetID, secIDs,
		approval.ChangeRequestNotes, updatedHistoryJSON,
	).Scan(&approval.ID)
}

// AdminReviewCategoryApproval updates approval state
func (r *CategoryGovernanceRepository) AdminReviewCategoryApproval(ctx context.Context, adminID, approvalID uuid.UUID, action string, notes string) (*domain.VendorCategoryApproval, error) {
	var current domain.VendorCategoryApproval
	var historyJSON []byte
	query := `
		SELECT id, vendor_id, category_id, status, asset_id, secondary_asset_ids, COALESCE(history, '[]'::jsonb)
		FROM vendor_category_approvals
		WHERE id = $1;
	`
	err := r.db.Pool.QueryRow(ctx, query, approvalID).Scan(
		&current.ID, &current.VendorID, &current.CategoryID, &current.Status,
		&current.AssetID, &current.SecondaryAssetIDs, &historyJSON,
	)
	if err != nil {
		return nil, fmt.Errorf("approval %s not found: %w", approvalID, err)
	}

	var newStatus domain.VendorCategoryApprovalStatus
	var approvedAt *time.Time
	var approvedBy *uuid.UUID
	var rejectionReason string
	var changeRequestNotes string

	now := time.Now()
	switch strings.ToUpper(action) {
	case "APPROVE":
		newStatus = domain.CategoryApprovalActive
		approvedAt = &now
		approvedBy = &adminID
	case "REJECT":
		newStatus = domain.CategoryApprovalRejected
		rejectionReason = notes
	case "REQUEST_CHANGES":
		newStatus = domain.CategoryApprovalChangesRequested
		changeRequestNotes = notes
	case "SUSPEND":
		newStatus = domain.CategoryApprovalSuspended
		rejectionReason = notes
	default:
		return nil, fmt.Errorf("unsupported review action: %s", action)
	}

	var historyList []domain.ApprovalHistoryEntry
	if len(historyJSON) > 0 {
		_ = json.Unmarshal(historyJSON, &historyList)
	}
	historyList = append(historyList, domain.ApprovalHistoryEntry{
		Action:    strings.ToUpper(action),
		ActorID:   adminID,
		ActorRole: "ADMIN",
		Notes:     notes,
		Timestamp: now,
	})
	updatedHistoryJSON, _ := json.Marshal(historyList)

	updateQuery := `
		UPDATE vendor_category_approvals
		SET status = $2,
		    rejection_reason = $3,
		    change_request_notes = $4,
		    approved_by = $5,
		    approved_at = $6,
		    history = $7,
		    updated_at = NOW()
		WHERE id = $1
		RETURNING id, vendor_id, category_id, status, asset_id, secondary_asset_ids, rejection_reason, change_request_notes, approved_by, approved_at, created_at, updated_at;
	`
	row := r.db.Pool.QueryRow(ctx, updateQuery, approvalID, newStatus, rejectionReason, changeRequestNotes, approvedBy, approvedAt, updatedHistoryJSON)

	var res domain.VendorCategoryApproval
	var rReason, cNotes *string
	err = row.Scan(
		&res.ID, &res.VendorID, &res.CategoryID, &res.Status,
		&res.AssetID, &res.SecondaryAssetIDs, &rReason, &cNotes,
		&res.ApprovedBy, &res.ApprovedAt, &res.CreatedAt, &res.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to scan updated approval: %w", err)
	}
	if rReason != nil {
		res.RejectionReason = *rReason
	}
	if cNotes != nil {
		res.ChangeRequestNotes = *cNotes
	}
	res.History = historyList
	return &res, nil
}

// ListVendorCategoryApprovals returns all approvals for a specific vendor
func (r *CategoryGovernanceRepository) ListVendorCategoryApprovals(ctx context.Context, vendorID uuid.UUID) ([]*domain.VendorCategoryApproval, error) {
	query := `
		SELECT vca.id, vca.vendor_id, vca.category_id, vca.status, vca.asset_id, vca.secondary_asset_ids,
		       COALESCE(vca.rejection_reason, ''), COALESCE(vca.change_request_notes, ''),
		       COALESCE(vca.history, '[]'::jsonb), vca.approved_by, vca.approved_at, vca.created_at, vca.updated_at,
		       c.name AS category_name, c.slug AS category_slug,
		       usa.title AS asset_title, usa.asset_type
		FROM vendor_category_approvals vca
		JOIN categories c ON c.id = vca.category_id
		LEFT JOIN user_skills_assets usa ON usa.id = vca.asset_id
		WHERE vca.vendor_id = $1
		ORDER BY vca.updated_at DESC;
	`
	rows, err := r.db.Pool.Query(ctx, query, vendorID)
	if err != nil {
		// If table doesn't exist yet, return empty list gracefully
		return []*domain.VendorCategoryApproval{}, nil
	}
	defer rows.Close()

	var list []*domain.VendorCategoryApproval
	for rows.Next() {
		var a domain.VendorCategoryApproval
		var historyJSON []byte
		var catName, catSlug, assetTitle, assetType string
		if err := rows.Scan(
			&a.ID, &a.VendorID, &a.CategoryID, &a.Status, &a.AssetID, &a.SecondaryAssetIDs,
			&a.RejectionReason, &a.ChangeRequestNotes, &historyJSON, &a.ApprovedBy, &a.ApprovedAt,
			&a.CreatedAt, &a.UpdatedAt, &catName, &catSlug, &assetTitle, &assetType,
		); err != nil {
			return nil, err
		}
		a.Category = &domain.Category{ID: a.CategoryID, Name: catName, Slug: catSlug}
		a.CanonicalAsset = &domain.UserSkillAsset{ID: a.AssetID, Title: assetTitle, AssetType: assetType}
		if len(historyJSON) > 0 {
			_ = json.Unmarshal(historyJSON, &a.History)
		}
		list = append(list, &a)
	}

	return list, nil
}

// ListAdminCategoryApprovals returns pending or all approvals for admin review
func (r *CategoryGovernanceRepository) ListAdminCategoryApprovals(ctx context.Context, statusFilter string) ([]*domain.VendorCategoryApproval, error) {
	whereClause := ""
	args := []interface{}{}
	if statusFilter != "" && statusFilter != "ALL" {
		whereClause = "WHERE vca.status = $1"
		args = append(args, statusFilter)
	}

	query := fmt.Sprintf(`
		SELECT vca.id, vca.vendor_id, vca.category_id, vca.status, vca.asset_id, vca.secondary_asset_ids,
		       COALESCE(vca.rejection_reason, ''), COALESCE(vca.change_request_notes, ''),
		       COALESCE(vca.history, '[]'::jsonb), vca.approved_by, vca.approved_at, vca.created_at, vca.updated_at,
		       u.full_name, u.phone,
		       c.name AS category_name, c.slug AS category_slug,
		       usa.title AS asset_title, usa.asset_type
		FROM vendor_category_approvals vca
		JOIN users u ON u.id = vca.vendor_id
		JOIN categories c ON c.id = vca.category_id
		LEFT JOIN user_skills_assets usa ON usa.id = vca.asset_id
		%s
		ORDER BY vca.updated_at DESC;
	`, whereClause)

	rows, err := r.db.Pool.Query(ctx, query, args...)
	if err != nil {
		return []*domain.VendorCategoryApproval{}, nil
	}
	defer rows.Close()

	var list []*domain.VendorCategoryApproval
	for rows.Next() {
		var a domain.VendorCategoryApproval
		var historyJSON []byte
		var vendorName, vendorPhone, catName, catSlug, assetTitle, assetType string
		if err := rows.Scan(
			&a.ID, &a.VendorID, &a.CategoryID, &a.Status, &a.AssetID, &a.SecondaryAssetIDs,
			&a.RejectionReason, &a.ChangeRequestNotes, &historyJSON, &a.ApprovedBy, &a.ApprovedAt,
			&a.CreatedAt, &a.UpdatedAt, &vendorName, &vendorPhone, &catName, &catSlug, &assetTitle, &assetType,
		); err != nil {
			return nil, err
		}
		a.Vendor = &domain.User{ID: a.VendorID, FullName: vendorName, Phone: vendorPhone}
		a.Category = &domain.Category{ID: a.CategoryID, Name: catName, Slug: catSlug}
		a.CanonicalAsset = &domain.UserSkillAsset{ID: a.AssetID, Title: assetTitle, AssetType: assetType}
		if len(historyJSON) > 0 {
			_ = json.Unmarshal(historyJSON, &a.History)
		}
		list = append(list, &a)
	}

	return list, nil
}

// IsVendorApprovedForCategory checks whether a vendor is authorized to offer services in category
func (r *CategoryGovernanceRepository) IsVendorApprovedForCategory(ctx context.Context, vendorID, categoryID uuid.UUID) (bool, error) {
	// First check vendor_category_approvals
	var exists bool
	approvalQuery := `
		SELECT EXISTS (
			SELECT 1 FROM vendor_category_approvals
			WHERE vendor_id = $1 AND category_id = $2 AND status = 'ACTIVE'
		);
	`
	err := r.db.Pool.QueryRow(ctx, approvalQuery, vendorID, categoryID).Scan(&exists)
	if err == nil && exists {
		return true, nil
	}

	// Fallback for legacy assets if governance table not yet queried or empty
	fallbackQuery := `
		SELECT EXISTS (
			SELECT 1 FROM user_skills_assets
			WHERE user_id = $1 AND category_id = $2 AND status = 'ACTIVE'
		);
	`
	_ = r.db.Pool.QueryRow(ctx, fallbackQuery, vendorID, categoryID).Scan(&exists)
	return exists, nil
}

// GetVendorCategoryApproval retrieves the current approval record for a vendor and category
func (r *CategoryGovernanceRepository) GetVendorCategoryApproval(ctx context.Context, vendorID, categoryID uuid.UUID) (*domain.VendorCategoryApproval, error) {
	query := `
		SELECT vca.id, vca.vendor_id, vca.category_id, vca.status, vca.asset_id, vca.secondary_asset_ids,
		       COALESCE(vca.rejection_reason, ''), COALESCE(vca.change_request_notes, ''),
		       COALESCE(vca.history, '[]'::jsonb), vca.approved_by, vca.approved_at, vca.created_at, vca.updated_at,
		       c.name AS category_name, c.slug AS category_slug,
		       usa.title AS asset_title, usa.asset_type
		FROM vendor_category_approvals vca
		JOIN categories c ON c.id = vca.category_id
		LEFT JOIN user_skills_assets usa ON usa.id = vca.asset_id
		WHERE vca.vendor_id = $1 AND vca.category_id = $2;
	`
	var a domain.VendorCategoryApproval
	var historyJSON []byte
	var catName, catSlug, assetTitle, assetType string
	err := r.db.Pool.QueryRow(ctx, query, vendorID, categoryID).Scan(
		&a.ID, &a.VendorID, &a.CategoryID, &a.Status, &a.AssetID, &a.SecondaryAssetIDs,
		&a.RejectionReason, &a.ChangeRequestNotes, &historyJSON, &a.ApprovedBy, &a.ApprovedAt,
		&a.CreatedAt, &a.UpdatedAt, &catName, &catSlug, &assetTitle, &assetType,
	)
	if err != nil {
		return nil, err
	}
	a.Category = &domain.Category{ID: a.CategoryID, Name: catName, Slug: catSlug}
	a.CanonicalAsset = &domain.UserSkillAsset{ID: a.AssetID, Title: assetTitle, AssetType: assetType}
	if len(historyJSON) > 0 {
		_ = json.Unmarshal(historyJSON, &a.History)
	}
	return &a, nil
}

