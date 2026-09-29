package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/uop/backend/internal/domain"
	"github.com/uop/backend/internal/repository/postgres"
	"github.com/uop/backend/internal/service"
	"github.com/uop/backend/pkg/response"
)

type CatalogHandler struct {
	catalogService *service.CatalogService
	userRepo       *postgres.UserRepository
}

func NewCatalogHandler(catalogService *service.CatalogService, userRepo *postgres.UserRepository) *CatalogHandler {
	return &CatalogHandler{
		catalogService: catalogService,
		userRepo:       userRepo,
	}
}

// SearchCatalog handles GET /api/v1/catalog/search
func (h *CatalogHandler) SearchCatalog(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query().Get("q")
	categorySlug := r.URL.Query().Get("category")
	pageStr := r.URL.Query().Get("page")
	limitStr := r.URL.Query().Get("limit")

	page, _ := strconv.Atoi(pageStr)
	if page < 1 {
		page = 1
	}

	limit, _ := strconv.Atoi(limitStr)
	if limit < 1 || limit > 100 {
		limit = 50
	}
	offset := (page - 1) * limit

	items, total, err := h.catalogService.SearchCatalogItems(r.Context(), q, categorySlug, limit, offset)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to search catalog items", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Catalog items retrieved", map[string]interface{}{
		"items": items,
		"total": total,
		"page":  page,
		"limit": limit,
	})
}

// GetVendorCatalog handles GET /api/v1/vendors/{vendor_id}/catalog
func (h *CatalogHandler) GetVendorCatalog(w http.ResponseWriter, r *http.Request) {
	vendorIDStr := chi.URLParam(r, "vendor_id")
	vendorID, err := uuid.Parse(vendorIDStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid vendor_id format", err.Error())
		return
	}

	vendorUser, err := h.userRepo.GetByID(r.Context(), vendorID)
	if err != nil || vendorUser == nil {
		response.Error(w, http.StatusNotFound, "Vendor not found", nil)
		return
	}

	items, err := h.catalogService.ListCatalogItemsByVendor(r.Context(), vendorID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to list vendor catalog items", err.Error())
		return
	}

	assets, _ := h.userRepo.GetActiveUserSkillsAssets(r.Context(), vendorID)

	response.JSON(w, http.StatusOK, "Vendor catalog retrieved", map[string]interface{}{
		"vendor": vendorUser,
		"assets": assets,
		"items":  items,
	})
}

// CreateCatalogItem handles POST /api/v1/vendor/catalog
func (h *CatalogHandler) CreateCatalogItem(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		VendorUserID     string          `json:"vendor_user_id"`
		VendorAssetID    *string         `json:"vendor_asset_id"`
		CategoryID       *string         `json:"category_id"`
		Title            string          `json:"title"`
		Description      string          `json:"description"`
		SKU              string          `json:"sku"`
		UnitPrice        float64         `json:"unit_price"`
		PriceUnit        string          `json:"price_unit"`
		StockQuantity    int             `json:"stock_quantity"`
		MinOrderQuantity int             `json:"min_order_quantity"`
		Images           json.RawMessage `json:"images"`
		Attributes       json.RawMessage `json:"attributes"`
		IsAvailable      *bool           `json:"is_available"`
	}

	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid request JSON payload", err.Error())
		return
	}

	vendorUID, err := uuid.Parse(payload.VendorUserID)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid vendor_user_id format", err.Error())
		return
	}

	item := &domain.VendorCatalogItem{
		VendorUserID:     vendorUID,
		Title:            payload.Title,
		Description:      payload.Description,
		SKU:              payload.SKU,
		UnitPrice:        payload.UnitPrice,
		PriceUnit:        payload.PriceUnit,
		StockQuantity:    payload.StockQuantity,
		MinOrderQuantity: payload.MinOrderQuantity,
		Images:           payload.Images,
		Attributes:       payload.Attributes,
		IsAvailable:      true,
	}

	if payload.PriceUnit == "" {
		item.PriceUnit = "PER_PIECE"
	}
	if payload.MinOrderQuantity <= 0 {
		item.MinOrderQuantity = 1
	}
	if payload.IsAvailable != nil {
		item.IsAvailable = *payload.IsAvailable
	}

	if payload.VendorAssetID != nil && *payload.VendorAssetID != "" {
		assetID, err := uuid.Parse(*payload.VendorAssetID)
		if err == nil {
			item.VendorAssetID = &assetID
		}
	}
	if payload.CategoryID != nil && *payload.CategoryID != "" {
		catID, err := uuid.Parse(*payload.CategoryID)
		if err == nil {
			item.CategoryID = &catID
		}
	}

	created, err := h.catalogService.CreateCatalogItem(r.Context(), item)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to create catalog item", err.Error())
		return
	}

	response.JSON(w, http.StatusCreated, "Catalog item created successfully", created)
}

// UpdateCatalogItem handles PUT /api/v1/vendor/catalog/{id}
func (h *CatalogHandler) UpdateCatalogItem(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	itemID, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid catalog item id format", err.Error())
		return
	}

	var payload struct {
		VendorUserID     string          `json:"vendor_user_id"`
		Title            string          `json:"title"`
		Description      string          `json:"description"`
		SKU              string          `json:"sku"`
		UnitPrice        float64         `json:"unit_price"`
		PriceUnit        string          `json:"price_unit"`
		StockQuantity    int             `json:"stock_quantity"`
		MinOrderQuantity int             `json:"min_order_quantity"`
		Images           json.RawMessage `json:"images"`
		Attributes       json.RawMessage `json:"attributes"`
		IsAvailable      bool            `json:"is_available"`
	}

	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid request JSON payload", err.Error())
		return
	}

	vendorUID, err := uuid.Parse(payload.VendorUserID)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid vendor_user_id format", err.Error())
		return
	}

	item := &domain.VendorCatalogItem{
		ID:               itemID,
		VendorUserID:     vendorUID,
		Title:            payload.Title,
		Description:      payload.Description,
		SKU:              payload.SKU,
		UnitPrice:        payload.UnitPrice,
		PriceUnit:        payload.PriceUnit,
		StockQuantity:    payload.StockQuantity,
		MinOrderQuantity: payload.MinOrderQuantity,
		Images:           payload.Images,
		Attributes:       payload.Attributes,
		IsAvailable:      payload.IsAvailable,
	}

	updated, err := h.catalogService.UpdateCatalogItem(r.Context(), item)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to update catalog item", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Catalog item updated successfully", updated)
}

// DeleteCatalogItem handles DELETE /api/v1/vendor/catalog/{id}
func (h *CatalogHandler) DeleteCatalogItem(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	itemID, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid catalog item id format", err.Error())
		return
	}

	vendorUserIDStr := r.URL.Query().Get("vendor_user_id")
	vendorUID, err := uuid.Parse(vendorUserIDStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid vendor_user_id query param", err.Error())
		return
	}

	err = h.catalogService.DeleteCatalogItem(r.Context(), itemID, vendorUID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to delete catalog item", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Catalog item deleted successfully", nil)
}
