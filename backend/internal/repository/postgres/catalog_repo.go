package postgres

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/uop/backend/internal/domain"
)

type CatalogRepository struct {
	db *DB
}

func NewCatalogRepository(db *DB) *CatalogRepository {
	return &CatalogRepository{db: db}
}

// hasPhase2Columns checks if Migration 000024 columns are available
func (r *CatalogRepository) hasPhase2Columns(ctx context.Context) bool {
	checkQuery := `
		SELECT COUNT(*) 
		FROM information_schema.columns 
		WHERE table_schema = 'public' AND table_name = 'vendor_catalog_items'
		  AND column_name IN ('parent_id', 'node_type', 'level', 'path', 'price_type');
	`
	var count int
	if err := r.db.Pool.QueryRow(ctx, checkQuery).Scan(&count); err == nil && count >= 5 {
		return true
	}
	return false
}

func (r *CatalogRepository) CreateCatalogItem(ctx context.Context, item *domain.VendorCatalogItem) error {
	if item.ID == uuid.Nil {
		item.ID = uuid.New()
	}

	imagesJSON := item.Images
	if len(imagesJSON) == 0 {
		imagesJSON = []byte("[]")
	}
	attrJSON := item.Attributes
	if len(attrJSON) == 0 {
		attrJSON = []byte("{}")
	}
	incServicesJSON := item.IncludedServices
	if len(incServicesJSON) == 0 {
		incServicesJSON = []byte("[]")
	}
	optServicesJSON := item.OptionalServices
	if len(optServicesJSON) == 0 {
		optServicesJSON = []byte("[]")
	}
	fulfilmentJSON := item.FulfilmentInfo
	if len(fulfilmentJSON) == 0 {
		fulfilmentJSON = []byte("{}")
	}
	revHistJSON := item.ReviewHistory
	if len(revHistJSON) == 0 {
		revHistJSON = []byte("[]")
	}

	nodeType := item.NodeType
	if nodeType == "" {
		nodeType = "BOOKABLE"
	}
	item.NodeType = nodeType

	priceType := item.PriceType
	if priceType == "" {
		priceType = "FIXED"
	}
	item.PriceType = priceType

	statusVal := item.Status
	if statusVal == "" {
		if nodeType == "GROUPING" {
			statusVal = "APPROVED"
		} else {
			statusVal = "PENDING_ADMIN_APPROVAL"
		}
	}
	item.Status = statusVal

	// Hierarchy resolution and cycle/vendor validation
	hasP2 := r.hasPhase2Columns(ctx)
	if hasP2 {
		if item.ParentID != nil && *item.ParentID != uuid.Nil {
			var pVendorID uuid.UUID
			var pCatID *uuid.UUID
			var pLevel int
			var pPath string

			err := r.db.Pool.QueryRow(ctx, `
				SELECT vendor_user_id, category_id, level, path 
				FROM vendor_catalog_items 
				WHERE id = $1;
			`, *item.ParentID).Scan(&pVendorID, &pCatID, &pLevel, &pPath)

			if err != nil {
				return fmt.Errorf("parent catalog node %s not found: %w", *item.ParentID, err)
			}

			// Prevent cross-vendor assignment
			if pVendorID != item.VendorUserID {
				return fmt.Errorf("cross-vendor parent assignment violation: parent belongs to vendor %s, not %s", pVendorID, item.VendorUserID)
			}

			// Prevent cyclic hierarchy
			if item.ID != uuid.Nil && strings.Contains(pPath, item.ID.String()) {
				return fmt.Errorf("cyclic hierarchy violation: proposed parent is already a descendant of this node")
			}

			item.Level = pLevel + 1
			item.Path = pPath + "/" + item.ID.String()

			if item.CategoryID == nil && pCatID != nil {
				item.CategoryID = pCatID
			}
		} else {
			item.Level = 0
			item.Path = item.ID.String()
		}

		query := `
			INSERT INTO vendor_catalog_items (
				id, vendor_asset_id, vendor_user_id, category_id, parent_id, node_type,
				level, path, display_order, title, description, sku,
				price_type, unit_price, price_unit, stock_quantity, min_order_quantity,
				images, attributes, included_services, optional_services, fulfilment_info,
				status, rejection_reason, change_request_notes, review_history,
				pickup_location, pickup_address, is_available
			) VALUES (
				$1, $2, $3, $4, $5, $6,
				$7, $8, $9, $10, $11, $12,
				$13, $14, $15, $16, $17,
				$18, $19, $20, $21, $22,
				$23, $24, $25, $26,
				CASE WHEN $27::float = 0 AND $28::float = 0 THEN NULL ELSE ST_SetSRID(ST_MakePoint($28, $27), 4326)::geography END,
				$29, $30
			)
			RETURNING created_at, updated_at;
		`
		err := r.db.Pool.QueryRow(
			ctx, query,
			item.ID, item.VendorAssetID, item.VendorUserID, item.CategoryID, item.ParentID, item.NodeType,
			item.Level, item.Path, item.DisplayOrder, item.Title, item.Description, item.SKU,
			item.PriceType, item.UnitPrice, item.PriceUnit, item.StockQuantity, item.MinOrderQuantity,
			imagesJSON, attrJSON, incServicesJSON, optServicesJSON, fulfilmentJSON,
			item.Status, item.RejectionReason, item.ChangeRequestNotes, revHistJSON,
			item.PickupLat, item.PickupLng, item.PickupAddress, item.IsAvailable,
		).Scan(&item.CreatedAt, &item.UpdatedAt)

		if err != nil {
			return fmt.Errorf("failed to insert vendor catalog item with hierarchy: %w", err)
		}
		return nil
	}

	// Fallback for Phase 1 schema
	query := `
		INSERT INTO vendor_catalog_items (
			id, vendor_asset_id, vendor_user_id, category_id, title, description, sku,
			unit_price, price_unit, stock_quantity, min_order_quantity, images, attributes,
			status, rejection_reason, pickup_location, pickup_address, is_available
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
			CASE WHEN $16::float = 0 AND $17::float = 0 THEN NULL ELSE ST_SetSRID(ST_MakePoint($17, $16), 4326)::geography END,
			$18, $19
		)
		RETURNING created_at, updated_at;
	`
	err := r.db.Pool.QueryRow(
		ctx, query,
		item.ID, item.VendorAssetID, item.VendorUserID, item.CategoryID, item.Title, item.Description, item.SKU,
		item.UnitPrice, item.PriceUnit, item.StockQuantity, item.MinOrderQuantity, imagesJSON, attrJSON,
		statusVal, item.RejectionReason, item.PickupLat, item.PickupLng, item.PickupAddress, item.IsAvailable,
	).Scan(&item.CreatedAt, &item.UpdatedAt)

	if err != nil {
		return fmt.Errorf("failed to insert vendor catalog item: %w", err)
	}
	return nil
}

func (r *CatalogRepository) GetCatalogItemByID(ctx context.Context, id uuid.UUID) (*domain.VendorCatalogItem, error) {
	hasP2 := r.hasPhase2Columns(ctx)
	var query string
	if hasP2 {
		query = `
			SELECT 
				ci.id, ci.vendor_asset_id, ci.vendor_user_id, ci.category_id,
				ci.parent_id, COALESCE(ci.node_type, 'BOOKABLE'), COALESCE(ci.level, 0), COALESCE(ci.path, ci.id::text), COALESCE(ci.display_order, 0),
				ci.title, COALESCE(ci.description, ''), COALESCE(ci.sku, ''), COALESCE(ci.price_type, 'FIXED'),
				ci.unit_price, COALESCE(ci.price_unit, 'PER_PIECE'), ci.stock_quantity, ci.min_order_quantity,
				COALESCE(ci.images, '[]'::jsonb), COALESCE(ci.attributes, '{}'::jsonb),
				COALESCE(ci.included_services, '[]'::jsonb), COALESCE(ci.optional_services, '[]'::jsonb), COALESCE(ci.fulfilment_info, '{}'::jsonb),
				COALESCE(ci.status, 'ACTIVE_IN_CATALOG'), COALESCE(ci.rejection_reason, ''), COALESCE(ci.change_request_notes, ''), COALESCE(ci.review_history, '[]'::jsonb),
				COALESCE(ST_Y(ci.pickup_location::geometry), 0.0) as pickup_lat, COALESCE(ST_X(ci.pickup_location::geometry), 0.0) as pickup_lng, COALESCE(ci.pickup_address, ''),
				ci.is_available, ci.created_at, ci.updated_at,
				u.id, u.full_name, COALESCE(u.email, ''), COALESCE(u.phone, ''), COALESCE(u.avatar_url, ''), u.trust_score, u.is_verified, COALESCE(u.address_text, ''), COALESCE(ST_Y(u.location::geometry), 0.0) as lat, COALESCE(ST_X(u.location::geometry), 0.0) as lng,
				c.id, COALESCE(c.slug, ''), COALESCE(c.name, ''), COALESCE(c.icon, '')
			FROM vendor_catalog_items ci
			JOIN users u ON u.id = ci.vendor_user_id
			LEFT JOIN categories c ON c.id = ci.category_id
			WHERE ci.id = $1;
		`
	} else {
		query = `
			SELECT 
				ci.id, ci.vendor_asset_id, ci.vendor_user_id, ci.category_id,
				NULL::uuid AS parent_id, 'BOOKABLE' AS node_type, 0 AS level, ci.id::text AS path, 0 AS display_order,
				ci.title, COALESCE(ci.description, ''), COALESCE(ci.sku, ''), 'FIXED' AS price_type,
				ci.unit_price, COALESCE(ci.price_unit, 'PER_PIECE'), ci.stock_quantity, ci.min_order_quantity,
				COALESCE(ci.images, '[]'::jsonb), COALESCE(ci.attributes, '{}'::jsonb),
				'[]'::jsonb AS included_services, '[]'::jsonb AS optional_services, '{}'::jsonb AS fulfilment_info,
				COALESCE(ci.status, 'ACTIVE_IN_CATALOG'), COALESCE(ci.rejection_reason, ''), '' AS change_request_notes, '[]'::jsonb AS review_history,
				COALESCE(ST_Y(ci.pickup_location::geometry), 0.0) as pickup_lat, COALESCE(ST_X(ci.pickup_location::geometry), 0.0) as pickup_lng, COALESCE(ci.pickup_address, ''),
				ci.is_available, ci.created_at, ci.updated_at,
				u.id, u.full_name, COALESCE(u.email, ''), COALESCE(u.phone, ''), COALESCE(u.avatar_url, ''), u.trust_score, u.is_verified, COALESCE(u.address_text, ''), COALESCE(ST_Y(u.location::geometry), 0.0) as lat, COALESCE(ST_X(u.location::geometry), 0.0) as lng,
				c.id, COALESCE(c.slug, ''), COALESCE(c.name, ''), COALESCE(c.icon, '')
			FROM vendor_catalog_items ci
			JOIN users u ON u.id = ci.vendor_user_id
			LEFT JOIN categories c ON c.id = ci.category_id
			WHERE ci.id = $1;
		`
	}

	var item domain.VendorCatalogItem
	var vendorUser domain.User
	var category domain.Category
	var catID *uuid.UUID

	err := r.db.Pool.QueryRow(ctx, query, id).Scan(
		&item.ID, &item.VendorAssetID, &item.VendorUserID, &item.CategoryID,
		&item.ParentID, &item.NodeType, &item.Level, &item.Path, &item.DisplayOrder,
		&item.Title, &item.Description, &item.SKU, &item.PriceType,
		&item.UnitPrice, &item.PriceUnit, &item.StockQuantity, &item.MinOrderQuantity,
		&item.Images, &item.Attributes,
		&item.IncludedServices, &item.OptionalServices, &item.FulfilmentInfo,
		&item.Status, &item.RejectionReason, &item.ChangeRequestNotes, &item.ReviewHistory,
		&item.PickupLat, &item.PickupLng, &item.PickupAddress,
		&item.IsAvailable, &item.CreatedAt, &item.UpdatedAt,
		&vendorUser.ID, &vendorUser.FullName, &vendorUser.Email, &vendorUser.Phone, &vendorUser.AvatarURL, &vendorUser.TrustScore, &vendorUser.IsVerified, &vendorUser.AddressText, &vendorUser.Lat, &vendorUser.Lng,
		&catID, &category.Slug, &category.Name, &category.Icon,
	)

	if err != nil {
		return nil, fmt.Errorf("failed to get vendor catalog item: %w", err)
	}

	item.VendorUser = &vendorUser
	if catID != nil {
		category.ID = *catID
		item.Category = &category
	}

	return &item, nil
}

func (r *CatalogRepository) ListCatalogItemsByVendor(ctx context.Context, vendorUserID uuid.UUID) ([]*domain.VendorCatalogItem, error) {
	hasP2 := r.hasPhase2Columns(ctx)
	var query string
	if hasP2 {
		query = `
			SELECT 
				ci.id, ci.vendor_asset_id, ci.vendor_user_id, ci.category_id,
				ci.parent_id, COALESCE(ci.node_type, 'BOOKABLE'), COALESCE(ci.level, 0), COALESCE(ci.path, ci.id::text), COALESCE(ci.display_order, 0),
				ci.title, COALESCE(ci.description, ''), COALESCE(ci.sku, ''), COALESCE(ci.price_type, 'FIXED'),
				ci.unit_price, COALESCE(ci.price_unit, 'PER_PIECE'), ci.stock_quantity, ci.min_order_quantity,
				COALESCE(ci.images, '[]'::jsonb), COALESCE(ci.attributes, '{}'::jsonb),
				COALESCE(ci.included_services, '[]'::jsonb), COALESCE(ci.optional_services, '[]'::jsonb), COALESCE(ci.fulfilment_info, '{}'::jsonb),
				COALESCE(ci.status, 'ACTIVE_IN_CATALOG'), COALESCE(ci.rejection_reason, ''), COALESCE(ci.change_request_notes, ''), COALESCE(ci.review_history, '[]'::jsonb),
				COALESCE(ST_Y(ci.pickup_location::geometry), 0.0) as pickup_lat, COALESCE(ST_X(ci.pickup_location::geometry), 0.0) as pickup_lng, COALESCE(ci.pickup_address, ''),
				ci.is_available, ci.created_at, ci.updated_at,
				c.id, COALESCE(c.slug, ''), COALESCE(c.name, ''), COALESCE(c.icon, '')
			FROM vendor_catalog_items ci
			LEFT JOIN categories c ON c.id = ci.category_id
			WHERE ci.vendor_user_id = $1
			ORDER BY ci.level ASC, ci.display_order ASC, ci.created_at DESC;
		`
	} else {
		query = `
			SELECT 
				ci.id, ci.vendor_asset_id, ci.vendor_user_id, ci.category_id,
				NULL::uuid AS parent_id, 'BOOKABLE' AS node_type, 0 AS level, ci.id::text AS path, 0 AS display_order,
				ci.title, COALESCE(ci.description, ''), COALESCE(ci.sku, ''), 'FIXED' AS price_type,
				ci.unit_price, COALESCE(ci.price_unit, 'PER_PIECE'), ci.stock_quantity, ci.min_order_quantity,
				COALESCE(ci.images, '[]'::jsonb), COALESCE(ci.attributes, '{}'::jsonb),
				'[]'::jsonb AS included_services, '[]'::jsonb AS optional_services, '{}'::jsonb AS fulfilment_info,
				COALESCE(ci.status, 'ACTIVE_IN_CATALOG'), COALESCE(ci.rejection_reason, ''), '' AS change_request_notes, '[]'::jsonb AS review_history,
				COALESCE(ST_Y(ci.pickup_location::geometry), 0.0) as pickup_lat, COALESCE(ST_X(ci.pickup_location::geometry), 0.0) as pickup_lng, COALESCE(ci.pickup_address, ''),
				ci.is_available, ci.created_at, ci.updated_at,
				c.id, COALESCE(c.slug, ''), COALESCE(c.name, ''), COALESCE(c.icon, '')
			FROM vendor_catalog_items ci
			LEFT JOIN categories c ON c.id = ci.category_id
			WHERE ci.vendor_user_id = $1
			ORDER BY ci.created_at DESC;
		`
	}

	rows, err := r.db.Pool.Query(ctx, query, vendorUserID)
	if err != nil {
		return nil, fmt.Errorf("failed to list vendor catalog items: %w", err)
	}
	defer rows.Close()

	var items []*domain.VendorCatalogItem
	for rows.Next() {
		var item domain.VendorCatalogItem
		var category domain.Category
		var catID *uuid.UUID

		if err := rows.Scan(
			&item.ID, &item.VendorAssetID, &item.VendorUserID, &item.CategoryID,
			&item.ParentID, &item.NodeType, &item.Level, &item.Path, &item.DisplayOrder,
			&item.Title, &item.Description, &item.SKU, &item.PriceType,
			&item.UnitPrice, &item.PriceUnit, &item.StockQuantity, &item.MinOrderQuantity,
			&item.Images, &item.Attributes,
			&item.IncludedServices, &item.OptionalServices, &item.FulfilmentInfo,
			&item.Status, &item.RejectionReason, &item.ChangeRequestNotes, &item.ReviewHistory,
			&item.PickupLat, &item.PickupLng, &item.PickupAddress,
			&item.IsAvailable, &item.CreatedAt, &item.UpdatedAt,
			&catID, &category.Slug, &category.Name, &category.Icon,
		); err != nil {
			return nil, fmt.Errorf("scan vendor catalog item error: %w", err)
		}

		if catID != nil {
			category.ID = *catID
			item.Category = &category
		}
		items = append(items, &item)
	}

	return items, nil
}

// GetVendorCatalogTree builds a recursive nested tree of catalog items for a vendor
func (r *CatalogRepository) GetVendorCatalogTree(ctx context.Context, vendorUserID uuid.UUID, categoryID *uuid.UUID, includeUnapproved bool) ([]*domain.VendorCatalogItem, error) {
	items, err := r.ListCatalogItemsByVendor(ctx, vendorUserID)
	if err != nil {
		return nil, err
	}

	itemMap := make(map[uuid.UUID]*domain.VendorCatalogItem)
	for _, it := range items {
		// Category filter if specified
		if categoryID != nil && *categoryID != uuid.Nil {
			if it.CategoryID != nil && *it.CategoryID != *categoryID {
				continue
			}
		}
		// Approval filter: unapproved items hidden if requested (grouping nodes can remain)
		if !includeUnapproved && it.NodeType == "BOOKABLE" && it.Status != "ACTIVE_IN_CATALOG" && it.Status != "APPROVED" {
			continue
		}
		it.Children = []*domain.VendorCatalogItem{}
		itemMap[it.ID] = it
	}

	var roots []*domain.VendorCatalogItem
	for _, it := range items {
		node, exists := itemMap[it.ID]
		if !exists {
			continue
		}
		if node.ParentID == nil || *node.ParentID == uuid.Nil {
			roots = append(roots, node)
		} else if parent, pExists := itemMap[*node.ParentID]; pExists {
			parent.Children = append(parent.Children, node)
		} else {
			// Orphan or parent excluded by filter, treat as root in visible view
			roots = append(roots, node)
		}
	}

	return roots, nil
}

// MoveCatalogNode changes a catalog node's parent, validates cycle/vendor integrity, and updates descendant paths
func (r *CatalogRepository) MoveCatalogNode(ctx context.Context, id uuid.UUID, vendorUserID uuid.UUID, newParentID *uuid.UUID, newDisplayOrder int) error {
	if newParentID != nil && *newParentID == id {
		return fmt.Errorf("a catalog node cannot be its own parent")
	}

	tx, err := r.db.Pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// Fetch current node
	var curVendorID uuid.UUID
	var curLevel int
	var curPath string
	err = tx.QueryRow(ctx, `
		SELECT vendor_user_id, level, path 
		FROM vendor_catalog_items 
		WHERE id = $1;
	`, id).Scan(&curVendorID, &curLevel, &curPath)
	if err != nil {
		return fmt.Errorf("catalog node %s not found: %w", id, err)
	}

	if curVendorID != vendorUserID {
		return fmt.Errorf("unauthorized: catalog node does not belong to vendor %s", vendorUserID)
	}

	newLevel := 0
	newPath := id.String()

	if newParentID != nil && *newParentID != uuid.Nil {
		var pVendorID uuid.UUID
		var pLevel int
		var pPath string

		err = tx.QueryRow(ctx, `
			SELECT vendor_user_id, level, path 
			FROM vendor_catalog_items 
			WHERE id = $1;
		`, *newParentID).Scan(&pVendorID, &pLevel, &pPath)
		if err != nil {
			return fmt.Errorf("proposed parent %s not found: %w", *newParentID, err)
		}

		if pVendorID != vendorUserID {
			return fmt.Errorf("cross-vendor hierarchy assignment: parent belongs to %s, node belongs to %s", pVendorID, vendorUserID)
		}

		// Cycle check: parent path cannot contain node ID
		if strings.Contains(pPath, id.String()) {
			return fmt.Errorf("cyclic hierarchy error: proposed parent %s is already a descendant of %s", *newParentID, id)
		}

		newLevel = pLevel + 1
		newPath = pPath + "/" + id.String()
	}

	// Update the node itself
	_, err = tx.Exec(ctx, `
		UPDATE vendor_catalog_items
		SET parent_id = $1, level = $2, path = $3, display_order = $4, updated_at = NOW()
		WHERE id = $5 AND vendor_user_id = $6;
	`, newParentID, newLevel, newPath, newDisplayOrder, id, vendorUserID)
	if err != nil {
		return fmt.Errorf("failed to update node parent: %w", err)
	}

	// Atomically propagate new path and level to all descendants
	if curPath != "" && curPath != newPath {
		levelDelta := newLevel - curLevel
		oldPrefix := curPath + "/"
		newPrefix := newPath + "/"

		_, err = tx.Exec(ctx, `
			UPDATE vendor_catalog_items
			SET level = level + $1,
			    path = $2 || SUBSTRING(path FROM $3),
			    updated_at = NOW()
			WHERE path LIKE $4;
		`, levelDelta, newPrefix, len(oldPrefix)+1, oldPrefix+"%")
		if err != nil {
			return fmt.Errorf("failed to cascade hierarchy update to descendants: %w", err)
		}
	}

	return tx.Commit(ctx)
}

// ReorderCatalogNodes updates the display order for a list of node IDs under the same parent
func (r *CatalogRepository) ReorderCatalogNodes(ctx context.Context, vendorUserID uuid.UUID, parentID *uuid.UUID, nodeIDsInOrder []uuid.UUID) error {
	tx, err := r.db.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	for idx, nodeID := range nodeIDsInOrder {
		_, err := tx.Exec(ctx, `
			UPDATE vendor_catalog_items
			SET display_order = $1, updated_at = NOW()
			WHERE id = $2 AND vendor_user_id = $3;
		`, idx, nodeID, vendorUserID)
		if err != nil {
			return fmt.Errorf("failed to update display order for node %s: %w", nodeID, err)
		}
	}

	return tx.Commit(ctx)
}

// SearchCatalogItems performs dynamic search across approved bookable vendor catalog items (grouping nodes excluded)
func (r *CatalogRepository) SearchCatalogItems(ctx context.Context, searchQuery string, categorySlug string, limit int, offset int) ([]*domain.VendorCatalogItem, int, error) {
	var conditions []string
	var args []interface{}
	argIdx := 1

	conditions = append(conditions, "ci.is_available = TRUE")
	conditions = append(conditions, "(ci.status = 'ACTIVE_IN_CATALOG' OR ci.status = 'APPROVED' OR ci.status IS NULL)")
	// Crucial rule: Grouping nodes must NEVER be purchasable or returned in customer catalog search!
	conditions = append(conditions, "(ci.node_type = 'BOOKABLE' OR ci.node_type IS NULL)")

	if strings.TrimSpace(searchQuery) != "" {
		conditions = append(conditions, fmt.Sprintf("(ci.title ILIKE $%d OR ci.description ILIKE $%d OR u.full_name ILIKE $%d OR c.name ILIKE $%d)", argIdx, argIdx, argIdx, argIdx))
		args = append(args, "%"+strings.TrimSpace(searchQuery)+"%")
		argIdx++
	}

	if strings.TrimSpace(categorySlug) != "" && categorySlug != "ALL" {
		conditions = append(conditions, fmt.Sprintf("c.slug = $%d", argIdx))
		args = append(args, categorySlug)
		argIdx++
	}

	whereClause := ""
	if len(conditions) > 0 {
		whereClause = "WHERE " + strings.Join(conditions, " AND ")
	}

	countQuery := fmt.Sprintf(`
		SELECT COUNT(ci.id)
		FROM vendor_catalog_items ci
		JOIN users u ON u.id = ci.vendor_user_id
		LEFT JOIN categories c ON c.id = ci.category_id
		%s;
	`, whereClause)

	var total int
	if err := r.db.Pool.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("failed to count catalog search results: %w", err)
	}

	if limit <= 0 {
		limit = 50
	}

	hasP2 := r.hasPhase2Columns(ctx)
	var dataQuery string
	if hasP2 {
		dataQuery = fmt.Sprintf(`
			SELECT 
				ci.id, ci.vendor_asset_id, ci.vendor_user_id, ci.category_id,
				ci.parent_id, COALESCE(ci.node_type, 'BOOKABLE'), COALESCE(ci.level, 0), COALESCE(ci.path, ci.id::text), COALESCE(ci.display_order, 0),
				ci.title, COALESCE(ci.description, ''), COALESCE(ci.sku, ''), COALESCE(ci.price_type, 'FIXED'),
				ci.unit_price, COALESCE(ci.price_unit, 'PER_PIECE'), ci.stock_quantity, ci.min_order_quantity,
				COALESCE(ci.images, '[]'::jsonb), COALESCE(ci.attributes, '{}'::jsonb),
				COALESCE(ci.included_services, '[]'::jsonb), COALESCE(ci.optional_services, '[]'::jsonb), COALESCE(ci.fulfilment_info, '{}'::jsonb),
				COALESCE(ci.status, 'ACTIVE_IN_CATALOG'), COALESCE(ci.rejection_reason, ''), COALESCE(ci.change_request_notes, ''), COALESCE(ci.review_history, '[]'::jsonb),
				COALESCE(ST_Y(ci.pickup_location::geometry), 0.0) as pickup_lat, COALESCE(ST_X(ci.pickup_location::geometry), 0.0) as pickup_lng, COALESCE(ci.pickup_address, ''),
				ci.is_available, ci.created_at, ci.updated_at,
				u.id, u.full_name, COALESCE(u.email, ''), COALESCE(u.phone, ''), COALESCE(u.avatar_url, ''), u.trust_score, u.is_verified, COALESCE(u.address_text, ''), COALESCE(ST_Y(u.location::geometry), 0.0) as lat, COALESCE(ST_X(u.location::geometry), 0.0) as lng,
				c.id, COALESCE(c.slug, ''), COALESCE(c.name, ''), COALESCE(c.icon, '')
			FROM vendor_catalog_items ci
			JOIN users u ON u.id = ci.vendor_user_id
			LEFT JOIN categories c ON c.id = ci.category_id
			%s
			ORDER BY u.trust_score DESC, ci.created_at DESC
			LIMIT $%d OFFSET $%d;
		`, whereClause, argIdx, argIdx+1)
	} else {
		dataQuery = fmt.Sprintf(`
			SELECT 
				ci.id, ci.vendor_asset_id, ci.vendor_user_id, ci.category_id,
				NULL::uuid AS parent_id, 'BOOKABLE' AS node_type, 0 AS level, ci.id::text AS path, 0 AS display_order,
				ci.title, COALESCE(ci.description, ''), COALESCE(ci.sku, ''), 'FIXED' AS price_type,
				ci.unit_price, COALESCE(ci.price_unit, 'PER_PIECE'), ci.stock_quantity, ci.min_order_quantity,
				COALESCE(ci.images, '[]'::jsonb), COALESCE(ci.attributes, '{}'::jsonb),
				'[]'::jsonb AS included_services, '[]'::jsonb AS optional_services, '{}'::jsonb AS fulfilment_info,
				COALESCE(ci.status, 'ACTIVE_IN_CATALOG'), COALESCE(ci.rejection_reason, ''), '' AS change_request_notes, '[]'::jsonb AS review_history,
				COALESCE(ST_Y(ci.pickup_location::geometry), 0.0) as pickup_lat, COALESCE(ST_X(ci.pickup_location::geometry), 0.0) as pickup_lng, COALESCE(ci.pickup_address, ''),
				ci.is_available, ci.created_at, ci.updated_at,
				u.id, u.full_name, COALESCE(u.email, ''), COALESCE(u.phone, ''), COALESCE(u.avatar_url, ''), u.trust_score, u.is_verified, COALESCE(u.address_text, ''), COALESCE(ST_Y(u.location::geometry), 0.0) as lat, COALESCE(ST_X(u.location::geometry), 0.0) as lng,
				c.id, COALESCE(c.slug, ''), COALESCE(c.name, ''), COALESCE(c.icon, '')
			FROM vendor_catalog_items ci
			JOIN users u ON u.id = ci.vendor_user_id
			LEFT JOIN categories c ON c.id = ci.category_id
			%s
			ORDER BY u.trust_score DESC, ci.created_at DESC
			LIMIT $%d OFFSET $%d;
		`, whereClause, argIdx, argIdx+1)
	}

	args = append(args, limit, offset)

	rows, err := r.db.Pool.Query(ctx, dataQuery, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to query search catalog items: %w", err)
	}
	defer rows.Close()

	var items []*domain.VendorCatalogItem
	for rows.Next() {
		var item domain.VendorCatalogItem
		var vendorUser domain.User
		var category domain.Category
		var catID *uuid.UUID

		if err := rows.Scan(
			&item.ID, &item.VendorAssetID, &item.VendorUserID, &item.CategoryID,
			&item.ParentID, &item.NodeType, &item.Level, &item.Path, &item.DisplayOrder,
			&item.Title, &item.Description, &item.SKU, &item.PriceType,
			&item.UnitPrice, &item.PriceUnit, &item.StockQuantity, &item.MinOrderQuantity,
			&item.Images, &item.Attributes,
			&item.IncludedServices, &item.OptionalServices, &item.FulfilmentInfo,
			&item.Status, &item.RejectionReason, &item.ChangeRequestNotes, &item.ReviewHistory,
			&item.PickupLat, &item.PickupLng, &item.PickupAddress,
			&item.IsAvailable, &item.CreatedAt, &item.UpdatedAt,
			&vendorUser.ID, &vendorUser.FullName, &vendorUser.Email, &vendorUser.Phone, &vendorUser.AvatarURL, &vendorUser.TrustScore, &vendorUser.IsVerified, &vendorUser.AddressText, &vendorUser.Lat, &vendorUser.Lng,
			&catID, &category.Slug, &category.Name, &category.Icon,
		); err != nil {
			return nil, 0, fmt.Errorf("scan catalog search row error: %w", err)
		}

		item.VendorUser = &vendorUser
		if catID != nil {
			category.ID = *catID
			item.Category = &category
		}
		items = append(items, &item)
	}

	return items, total, nil
}

// ListCatalogItemsByStatus lists catalog items filtered by approval status (for admin review)
func (r *CatalogRepository) ListCatalogItemsByStatus(ctx context.Context, status string) ([]*domain.VendorCatalogItem, error) {
	whereClause := ""
	var args []interface{}
	if status != "" && status != "ALL" {
		if status == "PENDING_ADMIN_APPROVAL" || status == "PENDING" || status == "STAGE3_PENDING" {
			whereClause = "WHERE (ci.status = 'PENDING_ADMIN_APPROVAL' OR ci.status = 'PENDING' OR ci.status = 'PENDING_APPROVAL' OR ci.status = 'STAGE3_PENDING' OR ci.status IS NULL)"
		} else {
			whereClause = "WHERE ci.status = $1"
			args = append(args, status)
		}
	}

	hasP2 := r.hasPhase2Columns(ctx)
	var query string
	if hasP2 {
		query = fmt.Sprintf(`
			SELECT 
				ci.id, ci.vendor_asset_id, ci.vendor_user_id, ci.category_id,
				ci.parent_id, COALESCE(ci.node_type, 'BOOKABLE'), COALESCE(ci.level, 0), COALESCE(ci.path, ci.id::text), COALESCE(ci.display_order, 0),
				ci.title, COALESCE(ci.description, ''), COALESCE(ci.sku, ''), COALESCE(ci.price_type, 'FIXED'),
				ci.unit_price, COALESCE(ci.price_unit, 'PER_PIECE'), ci.stock_quantity, ci.min_order_quantity,
				COALESCE(ci.images, '[]'::jsonb), COALESCE(ci.attributes, '{}'::jsonb),
				COALESCE(ci.included_services, '[]'::jsonb), COALESCE(ci.optional_services, '[]'::jsonb), COALESCE(ci.fulfilment_info, '{}'::jsonb),
				COALESCE(ci.status, 'PENDING_ADMIN_APPROVAL'), COALESCE(ci.rejection_reason, ''), COALESCE(ci.change_request_notes, ''), COALESCE(ci.review_history, '[]'::jsonb),
				COALESCE(ST_Y(ci.pickup_location::geometry), 0.0) as pickup_lat, COALESCE(ST_X(ci.pickup_location::geometry), 0.0) as pickup_lng, COALESCE(ci.pickup_address, ''),
				ci.is_available, ci.created_at, ci.updated_at,
				u.id, COALESCE(u.full_name, 'Vendor Profile'), COALESCE(u.email, ''), COALESCE(u.phone, ''), COALESCE(u.avatar_url, ''), COALESCE(u.trust_score, 5.0), COALESCE(u.is_verified, false), COALESCE(u.address_text, ''), COALESCE(ST_Y(u.location::geometry), 0.0) as lat, COALESCE(ST_X(u.location::geometry), 0.0) as lng,
				c.id, COALESCE(c.slug, ''), COALESCE(c.name, ''), COALESCE(c.icon, '')
			FROM vendor_catalog_items ci
			LEFT JOIN users u ON u.id = ci.vendor_user_id
			LEFT JOIN categories c ON c.id = ci.category_id
			%s
			ORDER BY ci.created_at DESC;
		`, whereClause)
	} else {
		query = fmt.Sprintf(`
			SELECT 
				ci.id, ci.vendor_asset_id, ci.vendor_user_id, ci.category_id,
				NULL::uuid AS parent_id, 'BOOKABLE' AS node_type, 0 AS level, ci.id::text AS path, 0 AS display_order,
				ci.title, COALESCE(ci.description, ''), COALESCE(ci.sku, ''), 'FIXED' AS price_type,
				ci.unit_price, COALESCE(ci.price_unit, 'PER_PIECE'), ci.stock_quantity, ci.min_order_quantity,
				COALESCE(ci.images, '[]'::jsonb), COALESCE(ci.attributes, '{}'::jsonb),
				'[]'::jsonb AS included_services, '[]'::jsonb AS optional_services, '{}'::jsonb AS fulfilment_info,
				COALESCE(ci.status, 'PENDING_ADMIN_APPROVAL'), COALESCE(ci.rejection_reason, ''), '' AS change_request_notes, '[]'::jsonb AS review_history,
				COALESCE(ST_Y(ci.pickup_location::geometry), 0.0) as pickup_lat, COALESCE(ST_X(ci.pickup_location::geometry), 0.0) as pickup_lng, COALESCE(ci.pickup_address, ''),
				ci.is_available, ci.created_at, ci.updated_at,
				u.id, COALESCE(u.full_name, 'Vendor Profile'), COALESCE(u.email, ''), COALESCE(u.phone, ''), COALESCE(u.avatar_url, ''), COALESCE(u.trust_score, 5.0), COALESCE(u.is_verified, false), COALESCE(u.address_text, ''), COALESCE(ST_Y(u.location::geometry), 0.0) as lat, COALESCE(ST_X(u.location::geometry), 0.0) as lng,
				c.id, COALESCE(c.slug, ''), COALESCE(c.name, ''), COALESCE(c.icon, '')
			FROM vendor_catalog_items ci
			LEFT JOIN users u ON u.id = ci.vendor_user_id
			LEFT JOIN categories c ON c.id = ci.category_id
			%s
			ORDER BY ci.created_at DESC;
		`, whereClause)
	}

	rows, err := r.db.Pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to list catalog items by status: %w", err)
	}
	defer rows.Close()

	var items []*domain.VendorCatalogItem
	for rows.Next() {
		var item domain.VendorCatalogItem
		var vendorUser domain.User
		var category domain.Category
		var catID *uuid.UUID
		var uID *uuid.UUID

		if err := rows.Scan(
			&item.ID, &item.VendorAssetID, &item.VendorUserID, &item.CategoryID,
			&item.ParentID, &item.NodeType, &item.Level, &item.Path, &item.DisplayOrder,
			&item.Title, &item.Description, &item.SKU, &item.PriceType,
			&item.UnitPrice, &item.PriceUnit, &item.StockQuantity, &item.MinOrderQuantity,
			&item.Images, &item.Attributes,
			&item.IncludedServices, &item.OptionalServices, &item.FulfilmentInfo,
			&item.Status, &item.RejectionReason, &item.ChangeRequestNotes, &item.ReviewHistory,
			&item.PickupLat, &item.PickupLng, &item.PickupAddress,
			&item.IsAvailable, &item.CreatedAt, &item.UpdatedAt,
			&uID, &vendorUser.FullName, &vendorUser.Email, &vendorUser.Phone, &vendorUser.AvatarURL, &vendorUser.TrustScore, &vendorUser.IsVerified, &vendorUser.AddressText, &vendorUser.Lat, &vendorUser.Lng,
			&catID, &category.Slug, &category.Name, &category.Icon,
		); err != nil {
			return nil, fmt.Errorf("scan catalog list status error: %w", err)
		}

		if uID != nil {
			vendorUser.ID = *uID
		} else {
			vendorUser.ID = item.VendorUserID
		}
		item.VendorUser = &vendorUser

		if catID != nil {
			category.ID = *catID
			item.Category = &category
		}
		items = append(items, &item)
	}

	return items, nil
}

// UpdateCatalogItemStatus updates admin approval status and rejection reason (backward compatible)
func (r *CatalogRepository) UpdateCatalogItemStatus(ctx context.Context, id uuid.UUID, status string, rejectionReason string) error {
	return r.RecordReviewDecision(ctx, id, status, rejectionReason, "", nil, "System Admin")
}

// RecordReviewDecision updates status, notes/reason, and appends to review_history JSONB
func (r *CatalogRepository) RecordReviewDecision(ctx context.Context, id uuid.UUID, status string, rejectionReason string, changeNotes string, reviewerID *uuid.UUID, reviewerName string) error {
	isAvailable := status == "ACTIVE_IN_CATALOG" || status == "APPROVED"

	newEntry := domain.CatalogReviewEntry{
		Timestamp:    time.Now().UTC(),
		Action:       status,
		ReviewerID:   reviewerID,
		ReviewerName: reviewerName,
		Notes:        rejectionReason,
	}
	if changeNotes != "" {
		newEntry.Notes = changeNotes
	}

	entryBytes, _ := json.Marshal(newEntry)

	hasP2 := r.hasPhase2Columns(ctx)
	if hasP2 {
		query := `
			UPDATE vendor_catalog_items
			SET status = $1,
			    rejection_reason = $2,
			    change_request_notes = $3,
			    is_available = $4,
			    review_history = COALESCE(review_history, '[]'::jsonb) || $5::jsonb,
			    updated_at = NOW()
			WHERE id = $6;
		`
		_, err := r.db.Pool.Exec(ctx, query, status, rejectionReason, changeNotes, isAvailable, fmt.Sprintf("[%s]", string(entryBytes)), id)
		return err
	}

	query := `
		UPDATE vendor_catalog_items
		SET status = $1, rejection_reason = $2, is_available = $3, updated_at = NOW()
		WHERE id = $4;
	`
	_, err := r.db.Pool.Exec(ctx, query, status, rejectionReason, isAvailable, id)
	return err
}

func (r *CatalogRepository) UpdateCatalogItem(ctx context.Context, item *domain.VendorCatalogItem) error {
	statusVal := item.Status
	if statusVal == "" {
		if item.NodeType == "GROUPING" {
			statusVal = "APPROVED"
		} else {
			statusVal = "PENDING_ADMIN_APPROVAL"
		}
	}
	isAvailable := statusVal == "ACTIVE_IN_CATALOG" || statusVal == "APPROVED"
	rejectionReason := item.RejectionReason
	if statusVal == "PENDING_ADMIN_APPROVAL" {
		rejectionReason = ""
	}

	imagesJSON := item.Images
	if len(imagesJSON) == 0 {
		imagesJSON = []byte("[]")
	}
	attrJSON := item.Attributes
	if len(attrJSON) == 0 {
		attrJSON = []byte("{}")
	}
	incServicesJSON := item.IncludedServices
	if len(incServicesJSON) == 0 {
		incServicesJSON = []byte("[]")
	}
	optServicesJSON := item.OptionalServices
	if len(optServicesJSON) == 0 {
		optServicesJSON = []byte("[]")
	}
	fulfilmentJSON := item.FulfilmentInfo
	if len(fulfilmentJSON) == 0 {
		fulfilmentJSON = []byte("{}")
	}

	hasP2 := r.hasPhase2Columns(ctx)
	if hasP2 {
		query := `
			UPDATE vendor_catalog_items
			SET title = $1, description = $2, sku = $3, unit_price = $4, price_unit = $5,
			    stock_quantity = $6, min_order_quantity = $7, images = $8,
			    attributes = $9, status = $10, rejection_reason = $11,
			    pickup_location = CASE WHEN $12::float = 0 AND $13::float = 0 THEN pickup_location ELSE ST_SetSRID(ST_MakePoint($13, $12), 4326)::geography END,
			    pickup_address = COALESCE($14, pickup_address), is_available = $15,
			    price_type = $16, node_type = $17, display_order = $18,
			    included_services = $19, optional_services = $20, fulfilment_info = $21,
			    updated_at = NOW()
			WHERE id = $22 AND (vendor_user_id = $23 OR $23 = '00000000-0000-0000-0000-000000000000'::uuid);
		`
		_, err := r.db.Pool.Exec(
			ctx, query,
			item.Title, item.Description, item.SKU, item.UnitPrice, item.PriceUnit,
			item.StockQuantity, item.MinOrderQuantity, imagesJSON,
			attrJSON, statusVal, rejectionReason,
			item.PickupLat, item.PickupLng, item.PickupAddress, isAvailable,
			item.PriceType, item.NodeType, item.DisplayOrder,
			incServicesJSON, optServicesJSON, fulfilmentJSON,
			item.ID, item.VendorUserID,
		)
		if err != nil {
			return fmt.Errorf("failed to update vendor catalog item: %w", err)
		}
		return nil
	}

	query := `
		UPDATE vendor_catalog_items
		SET title = $1, description = $2, sku = $3, unit_price = $4, price_unit = $5,
		    stock_quantity = $6, min_order_quantity = $7, images = COALESCE($8, images),
		    attributes = COALESCE($9, attributes), status = $10, rejection_reason = $11,
		    pickup_location = CASE WHEN $12::float = 0 AND $13::float = 0 THEN pickup_location ELSE ST_SetSRID(ST_MakePoint($13, $12), 4326)::geography END,
		    pickup_address = COALESCE($14, pickup_address), is_available = $15, updated_at = NOW()
		WHERE id = $16 AND (vendor_user_id = $17 OR $17 = '00000000-0000-0000-0000-000000000000'::uuid);
	`
	_, err := r.db.Pool.Exec(
		ctx, query,
		item.Title, item.Description, item.SKU, item.UnitPrice, item.PriceUnit,
		item.StockQuantity, item.MinOrderQuantity, item.Images, item.Attributes,
		statusVal, rejectionReason, item.PickupLat, item.PickupLng, item.PickupAddress,
		isAvailable, item.ID, item.VendorUserID,
	)
	if err != nil {
		return fmt.Errorf("failed to update vendor catalog item: %w", err)
	}
	return nil
}

func (r *CatalogRepository) ArchiveCatalogItem(ctx context.Context, id uuid.UUID, vendorUserID uuid.UUID) error {
	query := `
		UPDATE vendor_catalog_items
		SET status = 'ARCHIVED', is_available = FALSE, updated_at = NOW()
		WHERE id = $1 AND (vendor_user_id = $2 OR $2 = '00000000-0000-0000-0000-000000000000'::uuid);
	`
	_, err := r.db.Pool.Exec(ctx, query, id, vendorUserID)
	if err != nil {
		return fmt.Errorf("failed to archive vendor catalog item: %w", err)
	}
	return nil
}

func (r *CatalogRepository) DeleteCatalogItem(ctx context.Context, id uuid.UUID, vendorUserID uuid.UUID) error {
	query := `DELETE FROM vendor_catalog_items WHERE id = $1 AND vendor_user_id = $2;`
	_, err := r.db.Pool.Exec(ctx, query, id, vendorUserID)
	if err != nil {
		return fmt.Errorf("failed to delete vendor catalog item: %w", err)
	}
	return nil
}


// ============================================================================
// PHASE 4: CUSTOMER MARKETPLACE & DISCOVERY METHODS
// ============================================================================

// SearchMarketplaceCatalog executes a secure, indexed search across approved bookable offerings
func (r *CatalogRepository) SearchMarketplaceCatalog(ctx context.Context, filter domain.MarketplaceCatalogFilter) ([]*domain.VendorCatalogItem, int, error) {
	var conditions []string
	var args []interface{}
	argIdx := 1

	// Mandatory Phase 4 Security & Visibility Rules:
	// 1. Only bookable offerings (grouping nodes are strictly excluded)
	conditions = append(conditions, "(ci.node_type = 'BOOKABLE' OR ci.node_type IS NULL)")
	// 2. Only approved and active offerings
	conditions = append(conditions, "(ci.status = 'ACTIVE_IN_CATALOG' OR ci.status = 'APPROVED')")
	// 3. Must be marked available
	conditions = append(conditions, "ci.is_available = TRUE")
	// 4. Vendor user must be active and not suspended
	conditions = append(conditions, "(u.status = 'ACTIVE' OR u.is_verified = TRUE)")
	// 5. Vendor must have category approval (governance table or legacy skills approval)
	conditions = append(conditions, `(
		EXISTS (
			SELECT 1 FROM vendor_category_approvals vca 
			WHERE vca.vendor_id = ci.vendor_user_id AND vca.category_id = ci.category_id AND vca.status = 'ACTIVE'
		) OR EXISTS (
			SELECT 1 FROM user_skills_assets usa 
			WHERE usa.user_id = ci.vendor_user_id AND usa.category_id = ci.category_id AND usa.status = 'ACTIVE'
		) OR ci.category_id IS NULL
	)`)

	// Search Query (matches title, description, SKU, vendor name, or category name)
	if strings.TrimSpace(filter.Query) != "" {
		conditions = append(conditions, fmt.Sprintf("(ci.title ILIKE $%d OR ci.description ILIKE $%d OR ci.sku ILIKE $%d OR u.full_name ILIKE $%d OR c.name ILIKE $%d)", argIdx, argIdx, argIdx, argIdx, argIdx))
		args = append(args, "%"+strings.TrimSpace(filter.Query)+"%")
		argIdx++
	}

	// Category filter (by ID or Slug)
	if filter.CategoryID != nil && *filter.CategoryID != uuid.Nil {
		conditions = append(conditions, fmt.Sprintf("ci.category_id = $%d", argIdx))
		args = append(args, *filter.CategoryID)
		argIdx++
	} else if strings.TrimSpace(filter.CategorySlug) != "" && strings.ToUpper(filter.CategorySlug) != "ALL" {
		conditions = append(conditions, fmt.Sprintf("c.slug = $%d", argIdx))
		args = append(args, filter.CategorySlug)
		argIdx++
	}

	// Vendor filter
	if filter.VendorID != nil && *filter.VendorID != uuid.Nil {
		conditions = append(conditions, fmt.Sprintf("ci.vendor_user_id = $%d", argIdx))
		args = append(args, *filter.VendorID)
		argIdx++
	}

	// Price range filter
	if filter.MinPrice != nil && *filter.MinPrice >= 0 {
		conditions = append(conditions, fmt.Sprintf("ci.unit_price >= $%d", argIdx))
		args = append(args, *filter.MinPrice)
		argIdx++
	}
	if filter.MaxPrice != nil && *filter.MaxPrice > 0 {
		conditions = append(conditions, fmt.Sprintf("ci.unit_price <= $%d", argIdx))
		args = append(args, *filter.MaxPrice)
		argIdx++
	}

	// Price type filter
	if strings.TrimSpace(filter.PriceType) != "" && strings.ToUpper(filter.PriceType) != "ALL" {
		conditions = append(conditions, fmt.Sprintf("ci.price_type = $%d", argIdx))
		args = append(args, strings.ToUpper(strings.TrimSpace(filter.PriceType)))
		argIdx++
	}

	// In-stock only filter
	if filter.InStockOnly {
		conditions = append(conditions, "ci.stock_quantity > 0")
	}

	// Spatial location proximity filter
	hasDistanceFilter := filter.CustomerLat != 0 && filter.CustomerLng != 0 && filter.RadiusKM > 0
	if hasDistanceFilter {
		conditions = append(conditions, fmt.Sprintf(`(
			ST_DWithin(
				COALESCE(ci.pickup_location::geography, u.location::geography),
				ST_SetSRID(ST_MakePoint($%d, $%d), 4326)::geography,
				$%d * 1000.0
			)
		)`, argIdx, argIdx+1, argIdx+2))
		args = append(args, filter.CustomerLng, filter.CustomerLat, filter.RadiusKM)
		argIdx += 3
	}

	whereClause := "WHERE " + strings.Join(conditions, " AND ")

	// Count Total
	countQuery := fmt.Sprintf(`
		SELECT COUNT(ci.id)
		FROM vendor_catalog_items ci
		JOIN users u ON u.id = ci.vendor_user_id
		LEFT JOIN categories c ON c.id = ci.category_id
		%s;
	`, whereClause)

	var total int
	if err := r.db.Pool.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("failed to count marketplace search results: %w", err)
	}

	limit := filter.Limit
	if limit <= 0 || limit > 100 {
		limit = 24
	}
	offset := filter.Offset
	if offset < 0 {
		offset = 0
	}

	// Sorting
	orderBy := "u.trust_score DESC, ci.created_at DESC"
	switch strings.ToLower(strings.TrimSpace(filter.SortBy)) {
	case "price_asc":
		orderBy = "ci.unit_price ASC, u.trust_score DESC"
	case "price_desc":
		orderBy = "ci.unit_price DESC, u.trust_score DESC"
	case "newest":
		orderBy = "ci.created_at DESC"
	case "trust_score":
		orderBy = "u.trust_score DESC, ci.created_at DESC"
	case "distance":
		if filter.CustomerLat != 0 && filter.CustomerLng != 0 {
			orderBy = fmt.Sprintf("ST_Distance(COALESCE(ci.pickup_location::geography, u.location::geography), ST_SetSRID(ST_MakePoint(%f, %f), 4326)::geography) ASC", filter.CustomerLng, filter.CustomerLat)
		}
	}

	hasP2 := r.hasPhase2Columns(ctx)
	var dataQuery string
	if hasP2 {
		dataQuery = fmt.Sprintf(`
			SELECT 
				ci.id, ci.vendor_asset_id, ci.vendor_user_id, ci.category_id,
				ci.parent_id, COALESCE(ci.node_type, 'BOOKABLE'), COALESCE(ci.level, 0), COALESCE(ci.path, ci.id::text), COALESCE(ci.display_order, 0),
				ci.title, COALESCE(ci.description, ''), COALESCE(ci.sku, ''), COALESCE(ci.price_type, 'FIXED'),
				ci.unit_price, COALESCE(ci.price_unit, 'PER_PIECE'), ci.stock_quantity, ci.min_order_quantity,
				COALESCE(ci.images, '[]'::jsonb), COALESCE(ci.attributes, '{}'::jsonb),
				COALESCE(ci.included_services, '[]'::jsonb), COALESCE(ci.optional_services, '[]'::jsonb), COALESCE(ci.fulfilment_info, '{}'::jsonb),
				COALESCE(ci.status, 'ACTIVE_IN_CATALOG'), COALESCE(ci.rejection_reason, ''), COALESCE(ci.change_request_notes, ''), COALESCE(ci.review_history, '[]'::jsonb),
				COALESCE(ST_Y(ci.pickup_location::geometry), 0.0) as pickup_lat, COALESCE(ST_X(ci.pickup_location::geometry), 0.0) as pickup_lng, COALESCE(ci.pickup_address, ''),
				ci.is_available, ci.created_at, ci.updated_at,
				u.id, u.full_name, COALESCE(u.email, ''), COALESCE(u.phone, ''), COALESCE(u.avatar_url, ''), u.trust_score, u.is_verified, COALESCE(u.address_text, ''), COALESCE(ST_Y(u.location::geometry), 0.0) as lat, COALESCE(ST_X(u.location::geometry), 0.0) as lng,
				c.id, COALESCE(c.slug, ''), COALESCE(c.name, ''), COALESCE(c.icon, '')
			FROM vendor_catalog_items ci
			JOIN users u ON u.id = ci.vendor_user_id
			LEFT JOIN categories c ON c.id = ci.category_id
			%s
			ORDER BY %s
			LIMIT $%d OFFSET $%d;
		`, whereClause, orderBy, argIdx, argIdx+1)
	} else {
		dataQuery = fmt.Sprintf(`
			SELECT 
				ci.id, ci.vendor_asset_id, ci.vendor_user_id, ci.category_id,
				NULL::uuid AS parent_id, 'BOOKABLE' AS node_type, 0 AS level, ci.id::text AS path, 0 AS display_order,
				ci.title, COALESCE(ci.description, ''), COALESCE(ci.sku, ''), 'FIXED' AS price_type,
				ci.unit_price, COALESCE(ci.price_unit, 'PER_PIECE'), ci.stock_quantity, ci.min_order_quantity,
				COALESCE(ci.images, '[]'::jsonb), COALESCE(ci.attributes, '{}'::jsonb),
				'[]'::jsonb AS included_services, '[]'::jsonb AS optional_services, '{}'::jsonb AS fulfilment_info,
				COALESCE(ci.status, 'ACTIVE_IN_CATALOG'), COALESCE(ci.rejection_reason, ''), '' AS change_request_notes, '[]'::jsonb AS review_history,
				COALESCE(ST_Y(ci.pickup_location::geometry), 0.0) as pickup_lat, COALESCE(ST_X(ci.pickup_location::geometry), 0.0) as pickup_lng, COALESCE(ci.pickup_address, ''),
				ci.is_available, ci.created_at, ci.updated_at,
				u.id, u.full_name, COALESCE(u.email, ''), COALESCE(u.phone, ''), COALESCE(u.avatar_url, ''), u.trust_score, u.is_verified, COALESCE(u.address_text, ''), COALESCE(ST_Y(u.location::geometry), 0.0) as lat, COALESCE(ST_X(u.location::geometry), 0.0) as lng,
				c.id, COALESCE(c.slug, ''), COALESCE(c.name, ''), COALESCE(c.icon, '')
			FROM vendor_catalog_items ci
			JOIN users u ON u.id = ci.vendor_user_id
			LEFT JOIN categories c ON c.id = ci.category_id
			%s
			ORDER BY %s
			LIMIT $%d OFFSET $%d;
		`, whereClause, orderBy, argIdx, argIdx+1)
	}

	args = append(args, limit, offset)

	rows, err := r.db.Pool.Query(ctx, dataQuery, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to query marketplace catalog: %w", err)
	}
	defer rows.Close()

	var items []*domain.VendorCatalogItem
	for rows.Next() {
		var item domain.VendorCatalogItem
		var vendorUser domain.User
		var category domain.Category
		var catID *uuid.UUID

		if err := rows.Scan(
			&item.ID, &item.VendorAssetID, &item.VendorUserID, &item.CategoryID,
			&item.ParentID, &item.NodeType, &item.Level, &item.Path, &item.DisplayOrder,
			&item.Title, &item.Description, &item.SKU, &item.PriceType,
			&item.UnitPrice, &item.PriceUnit, &item.StockQuantity, &item.MinOrderQuantity,
			&item.Images, &item.Attributes,
			&item.IncludedServices, &item.OptionalServices, &item.FulfilmentInfo,
			&item.Status, &item.RejectionReason, &item.ChangeRequestNotes, &item.ReviewHistory,
			&item.PickupLat, &item.PickupLng, &item.PickupAddress,
			&item.IsAvailable, &item.CreatedAt, &item.UpdatedAt,
			&vendorUser.ID, &vendorUser.FullName, &vendorUser.Email, &vendorUser.Phone, &vendorUser.AvatarURL, &vendorUser.TrustScore, &vendorUser.IsVerified, &vendorUser.AddressText, &vendorUser.Lat, &vendorUser.Lng,
			&catID, &category.Slug, &category.Name, &category.Icon,
		); err != nil {
			return nil, 0, fmt.Errorf("scan marketplace catalog row error: %w", err)
		}

		item.VendorUser = &vendorUser
		if catID != nil {
			category.ID = *catID
			item.Category = &category
		}
		items = append(items, &item)
	}

	return items, total, nil
}

// GetMarketplaceOfferingByID retrieves an approved offering for customer discovery, complete with breadcrumbs
func (r *CatalogRepository) GetMarketplaceOfferingByID(ctx context.Context, id uuid.UUID) (*domain.VendorCatalogItem, []*domain.CatalogBreadcrumb, error) {
	item, err := r.GetCatalogItemByID(ctx, id)
	if err != nil {
		return nil, nil, err
	}
	if item == nil {
		return nil, nil, fmt.Errorf("offering not found")
	}

	// Security & Visibility Check:
	// Must be bookable, approved, available, and from active vendor
	if item.NodeType != "BOOKABLE" && item.NodeType != "" {
		return nil, nil, fmt.Errorf("item is a grouping node and not an offering")
	}
	if item.Status != "APPROVED" && item.Status != "ACTIVE_IN_CATALOG" {
		return nil, nil, fmt.Errorf("offering is not currently approved for customer discovery")
	}
	if !item.IsAvailable {
		return nil, nil, fmt.Errorf("offering is currently unavailable")
	}
	if item.VendorUser != nil && item.VendorUser.Status != "ACTIVE" && !item.VendorUser.IsVerified {
		return nil, nil, fmt.Errorf("offering vendor is not active")
	}

	// Breadcrumb resolution: parse path "/uuid1/uuid2/uuid3"
	var breadcrumbs []*domain.CatalogBreadcrumb
	if item.Path != "" {
		parts := strings.Split(strings.Trim(item.Path, "/"), "/")
		var ancestorUUIDs []uuid.UUID
		for _, p := range parts {
			if parsed, pErr := uuid.Parse(p); pErr == nil {
				ancestorUUIDs = append(ancestorUUIDs, parsed)
			}
		}

		if len(ancestorUUIDs) > 0 {
			bRows, bErr := r.db.Pool.Query(ctx, `
				SELECT id, title, COALESCE(node_type, 'BOOKABLE'), COALESCE(level, 0)
				FROM vendor_catalog_items
				WHERE id = ANY($1)
				ORDER BY level ASC;
			`, ancestorUUIDs)
			if bErr == nil {
				defer bRows.Close()
				for bRows.Next() {
					var bc domain.CatalogBreadcrumb
					if scanErr := bRows.Scan(&bc.ID, &bc.Title, &bc.NodeType, &bc.Level); scanErr == nil {
						breadcrumbs = append(breadcrumbs, &bc)
					}
				}
			}
		}
	}

	return item, breadcrumbs, nil
}

// GetEligibleVendorsByCategory finds approved vendors with active offerings for a given category
func (r *CatalogRepository) GetEligibleVendorsByCategory(ctx context.Context, categoryID *uuid.UUID, categorySlug string, customerLat, customerLng float64, limit, offset int) ([]*domain.MarketplaceVendorCard, int, error) {
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}

	var catClause string
	var args []interface{}
	argIdx := 1

	if categoryID != nil && *categoryID != uuid.Nil {
		catClause = fmt.Sprintf("ci.category_id = $%d", argIdx)
		args = append(args, *categoryID)
		argIdx++
	} else if strings.TrimSpace(categorySlug) != "" {
		catClause = fmt.Sprintf("c.slug = $%d", argIdx)
		args = append(args, categorySlug)
		argIdx++
	} else {
		catClause = "ci.category_id IS NOT NULL"
	}

	distanceExpr := "NULL::float as distance_km"
	orderExpr := "offering_count DESC, u.trust_score DESC"
	if customerLat != 0 && customerLng != 0 {
		distanceExpr = fmt.Sprintf("ROUND((ST_Distance(u.location::geography, ST_SetSRID(ST_MakePoint(%f, %f), 4326)::geography) / 1000.0)::numeric, 1)::float as distance_km", customerLng, customerLat)
		orderExpr = "distance_km ASC NULLS LAST, offering_count DESC"
	}

	query := fmt.Sprintf(`
		WITH eligible_offerings AS (
			SELECT 
				ci.vendor_user_id,
				COUNT(ci.id) as offering_count,
				MIN(ci.unit_price) as min_price,
				MAX(ci.unit_price) as max_price,
				MODE() WITHIN GROUP (ORDER BY ci.price_unit) as primary_unit,
				MAX(c.name) as cat_name,
				MAX(c.slug) as cat_slug
			FROM vendor_catalog_items ci
			LEFT JOIN categories c ON c.id = ci.category_id
			WHERE %s
			  AND (ci.node_type = 'BOOKABLE' OR ci.node_type IS NULL)
			  AND (ci.status = 'ACTIVE_IN_CATALOG' OR ci.status = 'APPROVED')
			  AND ci.is_available = TRUE
			GROUP BY ci.vendor_user_id
		)
		SELECT 
			u.id, u.full_name, COALESCE(u.phone, ''), COALESCE(u.avatar_url, ''),
			u.trust_score, u.is_verified, COALESCE(u.address_text, ''),
			COALESCE(ST_Y(u.location::geometry), 0.0) as lat,
			COALESCE(ST_X(u.location::geometry), 0.0) as lng,
			%s,
			eo.offering_count, eo.min_price, eo.max_price, COALESCE(eo.primary_unit, 'PER_PIECE'),
			COALESCE(eo.cat_name, ''), COALESCE(eo.cat_slug, '')
		FROM eligible_offerings eo
		JOIN users u ON u.id = eo.vendor_user_id
		WHERE (u.status = 'ACTIVE' OR u.is_verified = TRUE)
		ORDER BY %s
		LIMIT $%d OFFSET $%d;
	`, catClause, distanceExpr, orderExpr, argIdx, argIdx+1)

	args = append(args, limit, offset)

	rows, err := r.db.Pool.Query(ctx, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to query eligible vendors by category: %w", err)
	}
	defer rows.Close()

	var vendors []*domain.MarketplaceVendorCard
	var vendorIDs []uuid.UUID

	for rows.Next() {
		var v domain.MarketplaceVendorCard
		var dist *float64
		if err := rows.Scan(
			&v.VendorID, &v.VendorName, &v.VendorPhone, &v.VendorAvatar,
			&v.TrustScore, &v.IsVerified, &v.AddressText,
			&v.Lat, &v.Lng,
			&dist,
			&v.OfferingCount, &v.MinPrice, &v.MaxPrice, &v.PriceUnit,
			&v.CategoryName, &v.CategorySlug,
		); err != nil {
			return nil, 0, fmt.Errorf("scan eligible vendor row error: %w", err)
		}
		v.DistanceKM = dist
		vendors = append(vendors, &v)
		vendorIDs = append(vendorIDs, v.VendorID)
	}

	// Fetch top 3 sample offerings per vendor
	if len(vendorIDs) > 0 {
		samplesQuery := `
			SELECT 
				id, vendor_user_id, title, unit_price, COALESCE(price_unit, 'PER_PIECE'),
				COALESCE(images, '[]'::jsonb), COALESCE(attributes, '{}'::jsonb)
			FROM (
				SELECT 
					id, vendor_user_id, title, unit_price, price_unit, images, attributes,
					ROW_NUMBER() OVER(PARTITION BY vendor_user_id ORDER BY created_at DESC) as rn
				FROM vendor_catalog_items
				WHERE vendor_user_id = ANY($1)
				  AND (node_type = 'BOOKABLE' OR node_type IS NULL)
				  AND (status = 'ACTIVE_IN_CATALOG' OR status = 'APPROVED')
				  AND is_available = TRUE
			) ranked
			WHERE rn <= 3;
		`
		sRows, sErr := r.db.Pool.Query(ctx, samplesQuery, vendorIDs)
		if sErr == nil {
			defer sRows.Close()
			vendorSamples := make(map[uuid.UUID][]*domain.VendorCatalogItem)
			for sRows.Next() {
				var item domain.VendorCatalogItem
				if scanErr := sRows.Scan(&item.ID, &item.VendorUserID, &item.Title, &item.UnitPrice, &item.PriceUnit, &item.Images, &item.Attributes); scanErr == nil {
					vendorSamples[item.VendorUserID] = append(vendorSamples[item.VendorUserID], &item)
				}
			}
			for _, v := range vendors {
				v.SampleOfferings = vendorSamples[v.VendorID]
			}
		}
	}

	return vendors, len(vendors), nil
}

// CompareMarketplaceOfferings retrieves 2 to 4 offerings and structures their specifications for side-by-side comparison
func (r *CatalogRepository) CompareMarketplaceOfferings(ctx context.Context, ids []uuid.UUID) (*domain.OfferingComparisonResponse, error) {
	if len(ids) < 1 || len(ids) > 6 {
		return nil, fmt.Errorf("comparison requires between 1 and 6 offerings")
	}

	var items []*domain.VendorCatalogItem
	specOccurrences := make(map[string]int)
	specKeySet := make(map[string]bool)
	priceUnitSet := make(map[string]bool)

	for _, id := range ids {
		item, _, err := r.GetMarketplaceOfferingByID(ctx, id)
		if err != nil {
			// Skip unavailable/ineligible items rather than failing completely
			continue
		}

		items = append(items, item)
		if item.PriceUnit != "" {
			priceUnitSet[item.PriceUnit] = true
		}

		// Inspect JSON attributes map
		if len(item.Attributes) > 0 {
			var attrMap map[string]interface{}
			if jsonErr := json.Unmarshal(item.Attributes, &attrMap); jsonErr == nil {
				for k := range attrMap {
					specKeySet[k] = true
					specOccurrences[k]++
				}
			}
		}
	}

	if len(items) == 0 {
		return nil, fmt.Errorf("none of the requested offerings are available for comparison")
	}

	var allSpecKeys []string
	var commonSpecs []string
	for k := range specKeySet {
		allSpecKeys = append(allSpecKeys, k)
		if specOccurrences[k] == len(items) {
			commonSpecs = append(commonSpecs, k)
		}
	}

	var priceUnits []string
	for u := range priceUnitSet {
		priceUnits = append(priceUnits, u)
	}

	return &domain.OfferingComparisonResponse{
		Items:         items,
		CommonSpecs:   commonSpecs,
		AllSpecKeys:   allSpecKeys,
		PriceUnits:    priceUnits,
		HasMixedUnits: len(priceUnits) > 1,
	}, nil
}
