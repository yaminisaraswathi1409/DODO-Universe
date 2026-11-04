import sys

path = 'backend/internal/domain/models.go'
with open(path, 'rb') as f:
    raw = f.read()

# Normalize to LF for easy search
is_crlf = b'\r\n' in raw
text = raw.decode('utf-8')

target = """// VendorCatalogItem represents a product or service offered in a vendor's catalog (1 Vendor -> MANY items)
type VendorCatalogItem struct {
\tID               uuid.UUID       `json:"id"`
\tVendorAssetID    *uuid.UUID      `json:"vendor_asset_id,omitempty"`
\tVendorAsset      *UserSkillAsset `json:"vendor_asset,omitempty"`
\tVendorUserID     uuid.UUID       `json:"vendor_user_id"`
\tVendorUser       *User           `json:"vendor_user,omitempty"`
\tCategoryID       *uuid.UUID      `json:"category_id,omitempty"`
\tCategory         *Category       `json:"category,omitempty"`
\tTitle            string          `json:"title"`
\tDescription      string          `json:"description,omitempty"`
\tSKU              string          `json:"sku,omitempty"`
\tUnitPrice        float64         `json:"unit_price"`
\tPriceUnit        string          `json:"price_unit"`
\tStockQuantity    int             `json:"stock_quantity"`
\tMinOrderQuantity int             `json:"min_order_quantity"`
\tImages           json.RawMessage `json:"images,omitempty"`
\tAttributes       json.RawMessage `json:"attributes,omitempty"`
\tStatus           string          `json:"status,omitempty"`
\tRejectionReason  string          `json:"rejection_reason,omitempty"`
\tPickupLat        float64         `json:"pickup_lat,omitempty"`
\tPickupLng        float64         `json:"pickup_lng,omitempty"`
\tPickupAddress    string          `json:"pickup_address,omitempty"`
\tIsAvailable      bool            `json:"is_available"`
\tCreatedAt        time.Time       `json:"created_at"`
\tUpdatedAt        time.Time       `json:"updated_at"`
}"""

replacement = """// VendorCatalogItem represents a product, service offering, or grouping node in a vendor's catalog
type VendorCatalogItem struct {
\tID                 uuid.UUID            `json:"id"`
\tVendorAssetID      *uuid.UUID           `json:"vendor_asset_id,omitempty"`
\tVendorAsset        *UserSkillAsset      `json:"vendor_asset,omitempty"`
\tVendorUserID       uuid.UUID            `json:"vendor_user_id"`
\tVendorUser         *User                `json:"vendor_user,omitempty"`
\tCategoryID         *uuid.UUID           `json:"category_id,omitempty"`
\tCategory           *Category            `json:"category,omitempty"`
\tParentID           *uuid.UUID           `json:"parent_id,omitempty"`
\tNodeType           string               `json:"node_type"` // GROUPING or BOOKABLE
\tLevel              int                  `json:"level"`
\tPath               string               `json:"path"`
\tDisplayOrder       int                  `json:"display_order"`
\tTitle              string               `json:"title"`
\tDescription        string               `json:"description,omitempty"`
\tSKU                string               `json:"sku,omitempty"`
\tPriceType          string               `json:"price_type"` // FIXED or QUOTATION
\tUnitPrice          float64              `json:"unit_price"`
\tPriceUnit          string               `json:"price_unit"`
\tStockQuantity      int                  `json:"stock_quantity"`
\tMinOrderQuantity   int                  `json:"min_order_quantity"`
\tImages             json.RawMessage      `json:"images,omitempty"`
\tAttributes         json.RawMessage      `json:"attributes,omitempty"`
\tIncludedServices   json.RawMessage      `json:"included_services,omitempty"`
\tOptionalServices   json.RawMessage      `json:"optional_services,omitempty"`
\tFulfilmentInfo     json.RawMessage      `json:"fulfilment_info,omitempty"`
\tStatus             string               `json:"status,omitempty"`
\tChangeRequestNotes string               `json:"change_request_notes,omitempty"`
\tRejectionReason    string               `json:"rejection_reason,omitempty"`
\tReviewHistory      json.RawMessage      `json:"review_history,omitempty"`
\tPickupLat          float64              `json:"pickup_lat,omitempty"`
\tPickupLng          float64              `json:"pickup_lng,omitempty"`
\tPickupAddress      string               `json:"pickup_address,omitempty"`
\tIsAvailable        bool                 `json:"is_available"`
\tCreatedAt          time.Time            `json:"created_at"`
\tUpdatedAt          time.Time            `json:"updated_at"`
\tChildren           []*VendorCatalogItem `json:"children,omitempty"`
}

type CatalogReviewEntry struct {
\tTimestamp    time.Time  `json:"timestamp"`
\tAction       string     `json:"action"` // APPROVED, CHANGES_REQUESTED, REJECTED
\tReviewerID   *uuid.UUID `json:"reviewer_id,omitempty"`
\tReviewerName string     `json:"reviewer_name,omitempty"`
\tNotes        string     `json:"notes,omitempty"`
}

type AdditionalServiceItem struct {
\tID          string  `json:"id"`
\tName        string  `json:"name"`
\tDescription string  `json:"description,omitempty"`
\tIsIncluded  bool    `json:"is_included"`
\tPrice       float64 `json:"price,omitempty"`
\tPriceUnit   string  `json:"price_unit,omitempty"`
\tIsAvailable bool    `json:"is_available"`
}"""

# Handle crlf
if is_crlf:
    target = target.replace('\n', '\r\n')
    replacement = replacement.replace('\n', '\r\n')

if target not in text:
    print("Error: Target not found")
    sys.exit(1)

new_text = text.replace(target, replacement, 1)
with open(path, 'wb') as f:
    f.write(new_text.encode('utf-8'))
print("Successfully replaced models.go content")

