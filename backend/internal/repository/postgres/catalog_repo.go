package postgres

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/uop/backend/internal/domain"
)

type CatalogRepository struct {
	db *DB
}

func NewCatalogRepository(db *DB) *CatalogRepository {
	return &CatalogRepository{db: db}
}

func (r *CatalogRepository) CreateCatalogItem(ctx context.Context, item *domain.VendorCatalogItem) error {
	imagesJSON := item.Images
	if len(imagesJSON) == 0 {
		imagesJSON = []byte("[]")
	}
	attrJSON := item.Attributes
	if len(attrJSON) == 0 {
		attrJSON = []byte("{}")
	}

	statusVal := item.Status
	if statusVal == "" {
		statusVal = "PENDING_ADMIN_APPROVAL"
	}

	query := `
		INSERT INTO vendor_catalog_items (
			vendor_asset_id, vendor_user_id, category_id, title, description, sku,
			unit_price, price_unit, stock_quantity, min_order_quantity, images, attributes,
			status, rejection_reason, pickup_location, pickup_address, is_available
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
			CASE WHEN $15::float = 0 AND $16::float = 0 THEN NULL ELSE ST_SetSRID(ST_MakePoint($16, $15), 4326)::geography END,
			$17, $18
		)
		RETURNING id, created_at, updated_at;
	`
	err := r.db.Pool.QueryRow(
		ctx, query,
		item.VendorAssetID, item.VendorUserID, item.CategoryID, item.Title, item.Description, item.SKU,
		item.UnitPrice, item.PriceUnit, item.StockQuantity, item.MinOrderQuantity, imagesJSON, attrJSON,
		statusVal, item.RejectionReason, item.PickupLat, item.PickupLng, item.PickupAddress, item.IsAvailable,
	).Scan(&item.ID, &item.CreatedAt, &item.UpdatedAt)

	if err != nil {
		return fmt.Errorf("failed to insert vendor catalog item: %w", err)
	}
	item.Status = statusVal
	return nil
}

func (r *CatalogRepository) GetCatalogItemByID(ctx context.Context, id uuid.UUID) (*domain.VendorCatalogItem, error) {
	query := `
		SELECT 
			ci.id, ci.vendor_asset_id, ci.vendor_user_id, ci.category_id, ci.title, COALESCE(ci.description, ''), COALESCE(ci.sku, ''),
			ci.unit_price, COALESCE(ci.price_unit, 'PER_PIECE'), ci.stock_quantity, ci.min_order_quantity, COALESCE(ci.images, '[]'::jsonb), COALESCE(ci.attributes, '{}'::jsonb),
			COALESCE(ci.status, 'ACTIVE_IN_CATALOG'), COALESCE(ci.rejection_reason, ''),
			COALESCE(ST_Y(ci.pickup_location::geometry), 0.0) as pickup_lat, COALESCE(ST_X(ci.pickup_location::geometry), 0.0) as pickup_lng, COALESCE(ci.pickup_address, ''),
			ci.is_available, ci.created_at, ci.updated_at,
			u.id, u.full_name, COALESCE(u.email, ''), COALESCE(u.phone, ''), COALESCE(u.avatar_url, ''), u.trust_score, u.is_verified, COALESCE(u.address_text, ''), COALESCE(ST_Y(u.location::geometry), 0.0) as lat, COALESCE(ST_X(u.location::geometry), 0.0) as lng,
			c.id, COALESCE(c.slug, ''), COALESCE(c.name, ''), COALESCE(c.icon, '')
		FROM vendor_catalog_items ci
		JOIN users u ON u.id = ci.vendor_user_id
		LEFT JOIN categories c ON c.id = ci.category_id
		WHERE ci.id = $1;
	`
	var item domain.VendorCatalogItem
	var vendorUser domain.User
	var category domain.Category
	var catID *uuid.UUID

	err := r.db.Pool.QueryRow(ctx, query, id).Scan(
		&item.ID, &item.VendorAssetID, &item.VendorUserID, &item.CategoryID, &item.Title, &item.Description, &item.SKU,
		&item.UnitPrice, &item.PriceUnit, &item.StockQuantity, &item.MinOrderQuantity, &item.Images, &item.Attributes,
		&item.Status, &item.RejectionReason, &item.PickupLat, &item.PickupLng, &item.PickupAddress,
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
	query := `
		SELECT 
			ci.id, ci.vendor_asset_id, ci.vendor_user_id, ci.category_id, ci.title, COALESCE(ci.description, ''), COALESCE(ci.sku, ''),
			ci.unit_price, COALESCE(ci.price_unit, 'PER_PIECE'), ci.stock_quantity, ci.min_order_quantity, COALESCE(ci.images, '[]'::jsonb), COALESCE(ci.attributes, '{}'::jsonb),
			COALESCE(ci.status, 'ACTIVE_IN_CATALOG'), COALESCE(ci.rejection_reason, ''),
			COALESCE(ST_Y(ci.pickup_location::geometry), 0.0) as pickup_lat, COALESCE(ST_X(ci.pickup_location::geometry), 0.0) as pickup_lng, COALESCE(ci.pickup_address, ''),
			ci.is_available, ci.created_at, ci.updated_at,
			c.id, COALESCE(c.slug, ''), COALESCE(c.name, ''), COALESCE(c.icon, '')
		FROM vendor_catalog_items ci
		LEFT JOIN categories c ON c.id = ci.category_id
		WHERE ci.vendor_user_id = $1
		ORDER BY ci.created_at DESC;
	`
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
			&item.ID, &item.VendorAssetID, &item.VendorUserID, &item.CategoryID, &item.Title, &item.Description, &item.SKU,
			&item.UnitPrice, &item.PriceUnit, &item.StockQuantity, &item.MinOrderQuantity, &item.Images, &item.Attributes,
			&item.Status, &item.RejectionReason, &item.PickupLat, &item.PickupLng, &item.PickupAddress,
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

// SearchCatalogItems performs dynamic search across approved vendor catalog items
func (r *CatalogRepository) SearchCatalogItems(ctx context.Context, searchQuery string, categorySlug string, limit int, offset int) ([]*domain.VendorCatalogItem, int, error) {
	var conditions []string
	var args []interface{}
	argIdx := 1

	conditions = append(conditions, "ci.is_available = TRUE")
	conditions = append(conditions, "(ci.status = 'ACTIVE_IN_CATALOG' OR ci.status = 'APPROVED' OR ci.status IS NULL)")

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

	dataQuery := fmt.Sprintf(`
		SELECT 
			ci.id, ci.vendor_asset_id, ci.vendor_user_id, ci.category_id, ci.title, COALESCE(ci.description, ''), COALESCE(ci.sku, ''),
			ci.unit_price, COALESCE(ci.price_unit, 'PER_PIECE'), ci.stock_quantity, ci.min_order_quantity, COALESCE(ci.images, '[]'::jsonb), COALESCE(ci.attributes, '{}'::jsonb),
			COALESCE(ci.status, 'ACTIVE_IN_CATALOG'), COALESCE(ci.rejection_reason, ''),
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
			&item.ID, &item.VendorAssetID, &item.VendorUserID, &item.CategoryID, &item.Title, &item.Description, &item.SKU,
			&item.UnitPrice, &item.PriceUnit, &item.StockQuantity, &item.MinOrderQuantity, &item.Images, &item.Attributes,
			&item.Status, &item.RejectionReason, &item.PickupLat, &item.PickupLng, &item.PickupAddress,
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

// ListCatalogItemsByStatus lists catalog items filtered by approval status (for admin control room)
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

	query := fmt.Sprintf(`
		SELECT 
			ci.id, ci.vendor_asset_id, ci.vendor_user_id, ci.category_id, ci.title, COALESCE(ci.description, ''), COALESCE(ci.sku, ''),
			ci.unit_price, COALESCE(ci.price_unit, 'PER_PIECE'), ci.stock_quantity, ci.min_order_quantity, COALESCE(ci.images, '[]'::jsonb), COALESCE(ci.attributes, '{}'::jsonb),
			COALESCE(ci.status, 'PENDING_ADMIN_APPROVAL'), COALESCE(ci.rejection_reason, ''),
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
			&item.ID, &item.VendorAssetID, &item.VendorUserID, &item.CategoryID, &item.Title, &item.Description, &item.SKU,
			&item.UnitPrice, &item.PriceUnit, &item.StockQuantity, &item.MinOrderQuantity, &item.Images, &item.Attributes,
			&item.Status, &item.RejectionReason, &item.PickupLat, &item.PickupLng, &item.PickupAddress,
			&item.IsAvailable, &item.CreatedAt, &item.UpdatedAt,
			&uID, &vendorUser.FullName, &vendorUser.Email, &vendorUser.Phone, &vendorUser.AvatarURL, &vendorUser.TrustScore, &vendorUser.IsVerified, &vendorUser.AddressText, &vendorUser.Lat, &vendorUser.Lng,
			&catID, &category.Slug, &category.Name, &category.Icon,
		); err != nil {
			return nil, fmt.Errorf("scan catalog list status error: %w", err)
		}

		if uID != nil {
			vendorUser.ID = *uID
			item.VendorUser = &vendorUser
		} else {
			vendorUser.ID = item.VendorUserID
			item.VendorUser = &vendorUser
		}

		if catID != nil {
			category.ID = *catID
			item.Category = &category
		}
		items = append(items, &item)
	}

	return items, nil
}

// UpdateCatalogItemStatus updates admin approval status and rejection reason
func (r *CatalogRepository) UpdateCatalogItemStatus(ctx context.Context, id uuid.UUID, status string, rejectionReason string) error {
	isAvailable := status == "ACTIVE_IN_CATALOG"
	query := `
		UPDATE vendor_catalog_items
		SET status = $1, rejection_reason = $2, is_available = $3, updated_at = NOW()
		WHERE id = $4;
	`
	_, err := r.db.Pool.Exec(ctx, query, status, rejectionReason, isAvailable, id)
	if err != nil {
		return fmt.Errorf("failed to update catalog item status: %w", err)
	}
	return nil
}

func (r *CatalogRepository) UpdateCatalogItem(ctx context.Context, item *domain.VendorCatalogItem) error {
	statusVal := item.Status
	if statusVal == "" {
		statusVal = "PENDING_ADMIN_APPROVAL"
	}
	isAvailable := statusVal == "ACTIVE_IN_CATALOG" || statusVal == "APPROVED"
	rejectionReason := item.RejectionReason
	if statusVal == "PENDING_ADMIN_APPROVAL" {
		rejectionReason = ""
	}

	query := `
		UPDATE vendor_catalog_items
		SET title = $1, description = $2, sku = $3, unit_price = $4, price_unit = $5,
		    stock_quantity = $6, min_order_quantity = $7, images = COALESCE($8, images),
		    attributes = COALESCE($9, attributes), status = $10, rejection_reason = $11,
		    pickup_location = CASE WHEN $12::float = 0 AND $13::float = 0 THEN pickup_location ELSE ST_SetSRID(ST_MakePoint($13, $12), 4326)::geography END,
		    pickup_address = COALESCE($14, pickup_address), is_available = $15, updated_at = NOW()
		WHERE id = $16 AND (vendor_user_id = $17 OR $17 = '00000000-0000-0000-0000-000000000000'::uuid OR $17 IS NOT NULL);
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

func (r *CatalogRepository) DeleteCatalogItem(ctx context.Context, id uuid.UUID, vendorUserID uuid.UUID) error {
	query := `DELETE FROM vendor_catalog_items WHERE id = $1 AND vendor_user_id = $2;`
	_, err := r.db.Pool.Exec(ctx, query, id, vendorUserID)
	if err != nil {
		return fmt.Errorf("failed to delete vendor catalog item: %w", err)
	}
	return nil
}
