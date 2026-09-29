package postgres

import (
	"context"
	"fmt"
	"strings"

	"github.com/uop/backend/internal/domain"
	"github.com/google/uuid"
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

	query := `
		INSERT INTO vendor_catalog_items (
			vendor_asset_id, vendor_user_id, category_id, title, description, sku,
			unit_price, price_unit, stock_quantity, min_order_quantity, images, attributes, is_available
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
		RETURNING id, created_at, updated_at;
	`
	err := r.db.Pool.QueryRow(
		ctx, query,
		item.VendorAssetID, item.VendorUserID, item.CategoryID, item.Title, item.Description, item.SKU,
		item.UnitPrice, item.PriceUnit, item.StockQuantity, item.MinOrderQuantity, imagesJSON, attrJSON, item.IsAvailable,
	).Scan(&item.ID, &item.CreatedAt, &item.UpdatedAt)

	if err != nil {
		return fmt.Errorf("failed to insert vendor catalog item: %w", err)
	}
	return nil
}

func (r *CatalogRepository) GetCatalogItemByID(ctx context.Context, id uuid.UUID) (*domain.VendorCatalogItem, error) {
	query := `
		SELECT 
			ci.id, ci.vendor_asset_id, ci.vendor_user_id, ci.category_id, ci.title, COALESCE(ci.description, ''), COALESCE(ci.sku, ''),
			ci.unit_price, COALESCE(ci.price_unit, 'PER_PIECE'), ci.stock_quantity, ci.min_order_quantity, COALESCE(ci.images, '[]'::jsonb), COALESCE(ci.attributes, '{}'::jsonb), ci.is_available,
			ci.created_at, ci.updated_at,
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
		&item.UnitPrice, &item.PriceUnit, &item.StockQuantity, &item.MinOrderQuantity, &item.Images, &item.Attributes, &item.IsAvailable,
		&item.CreatedAt, &item.UpdatedAt,
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
			ci.unit_price, COALESCE(ci.price_unit, 'PER_PIECE'), ci.stock_quantity, ci.min_order_quantity, COALESCE(ci.images, '[]'::jsonb), COALESCE(ci.attributes, '{}'::jsonb), ci.is_available,
			ci.created_at, ci.updated_at,
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
			&item.UnitPrice, &item.PriceUnit, &item.StockQuantity, &item.MinOrderQuantity, &item.Images, &item.Attributes, &item.IsAvailable,
			&item.CreatedAt, &item.UpdatedAt,
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

// SearchCatalogItems performs dynamic search across vendor catalog items grouped by vendor
func (r *CatalogRepository) SearchCatalogItems(ctx context.Context, searchQuery string, categorySlug string, limit int, offset int) ([]*domain.VendorCatalogItem, int, error) {
	var conditions []string
	var args []interface{}
	argIdx := 1

	conditions = append(conditions, "ci.is_available = TRUE")

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
			ci.unit_price, COALESCE(ci.price_unit, 'PER_PIECE'), ci.stock_quantity, ci.min_order_quantity, COALESCE(ci.images, '[]'::jsonb), COALESCE(ci.attributes, '{}'::jsonb), ci.is_available,
			ci.created_at, ci.updated_at,
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
			&item.UnitPrice, &item.PriceUnit, &item.StockQuantity, &item.MinOrderQuantity, &item.Images, &item.Attributes, &item.IsAvailable,
			&item.CreatedAt, &item.UpdatedAt,
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

func (r *CatalogRepository) UpdateCatalogItem(ctx context.Context, item *domain.VendorCatalogItem) error {
	query := `
		UPDATE vendor_catalog_items
		SET title = $1, description = $2, sku = $3, unit_price = $4, price_unit = $5,
		    stock_quantity = $6, min_order_quantity = $7, images = COALESCE($8, images),
		    attributes = COALESCE($9, attributes), is_available = $10, updated_at = NOW()
		WHERE id = $11 AND vendor_user_id = $12;
	`
	_, err := r.db.Pool.Exec(
		ctx, query,
		item.Title, item.Description, item.SKU, item.UnitPrice, item.PriceUnit,
		item.StockQuantity, item.MinOrderQuantity, item.Images, item.Attributes, item.IsAvailable,
		item.ID, item.VendorUserID,
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
