package handler

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/uop/backend/internal/domain"
	"github.com/uop/backend/internal/middleware"
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

// CreateCatalogItem handles POST /api/v1/vendor/catalog and POST /api/v1/services/create
func (h *CatalogHandler) CreateCatalogItem(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		VendorUserID     string                 `json:"vendor_user_id"`
		VendorAssetID    *string                `json:"vendor_asset_id"`
		CategoryID       *string                `json:"category_id"`
		CategoryCode     string                 `json:"category_code"`
		SubCategory      string                 `json:"sub_category"`
		Title            string                 `json:"title"`
		Description      string                 `json:"description"`
		SKU              string                 `json:"sku"`
		UnitPrice        float64                `json:"unit_price"`
		PriceUnit        string                 `json:"price_unit"`
		StockQuantity    int                    `json:"stock_quantity"`
		MinOrderQuantity int                    `json:"min_order_quantity"`
		MOQUnits         int                    `json:"moq_units"`
		Images           json.RawMessage        `json:"images"`
		Attributes       json.RawMessage        `json:"attributes"`
		Metadata         map[string]interface{} `json:"metadata"`
		PickupLocation   *struct {
			Latitude    float64 `json:"latitude"`
			Longitude   float64 `json:"longitude"`
			AddressText string  `json:"address_text"`
		} `json:"pickup_location"`
		PickupLat   *float64 `json:"pickup_lat"`
		PickupLng   *float64 `json:"pickup_lng"`
		AddressText string   `json:"address_text"`
		IsAvailable *bool    `json:"is_available"`
	}

	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid request JSON payload", err.Error())
		return
	}

	// Resolve target Vendor User
	var vendorUser *domain.User
	claims, ok := middleware.GetUserClaims(r.Context())
	if ok && claims.SupabaseUID != "" {
		vendorUser, _ = h.userRepo.GetBySupabaseUID(r.Context(), claims.SupabaseUID)
	}
	if vendorUser == nil && payload.VendorUserID != "" {
		vUID, parseErr := uuid.Parse(payload.VendorUserID)
		if parseErr == nil {
			vendorUser, _ = h.userRepo.GetByID(r.Context(), vUID)
		}
	}
	if vendorUser == nil {
		users, err := h.userRepo.ListUsers(r.Context())
		if err == nil && len(users) > 0 {
			vendorUser = users[0]
		}
	}

	if vendorUser == nil {
		response.Error(w, http.StatusBadRequest, "Vendor profile not found", nil)
		return
	}

	// Stage 3 Prerequisite Enforcement: Vendor can only create sub-services if parent main service details are APPROVED / ACTIVE
	userAssets, _ := h.userRepo.GetActiveUserSkillsAssets(r.Context(), vendorUser.ID)
	if len(userAssets) > 0 {
		var parentApproved bool
		for _, asset := range userAssets {
			if asset.Status == domain.ServiceStatusActive || asset.Status == domain.ServiceStatusApproved {
				if payload.VendorAssetID != nil && *payload.VendorAssetID != "" {
					if asset.ID.String() == *payload.VendorAssetID {
						parentApproved = true
						break
					}
				} else if payload.CategoryID != nil && *payload.CategoryID != "" && asset.CategoryID != nil {
					if asset.CategoryID.String() == *payload.CategoryID {
						parentApproved = true
						break
					}
				} else {
					parentApproved = true
					break
				}
			}
		}
		if !parentApproved {
			response.Error(w, http.StatusBadRequest, "Cannot create sub-service offering: Parent main service details must be approved by Admin first (Stage 2)", nil)
			return
		}
	}

	// Merge attributes & metadata
	attrMap := make(map[string]interface{})
	if len(payload.Attributes) > 0 && string(payload.Attributes) != "{}" {
		_ = json.Unmarshal(payload.Attributes, &attrMap)
	}
	if payload.Metadata != nil {
		for k, v := range payload.Metadata {
			attrMap[k] = v
		}
	}

	// Extract unit price & MOQ from Section 6 payload if present
	unitPriceVal := payload.UnitPrice
	if unitPriceVal <= 0 && payload.Metadata != nil {
		if pm, ok := payload.Metadata["pricing_matrix"].(map[string]interface{}); ok {
			if baseRate, bOk := pm["base_unit_price_inr"].(float64); bOk {
				unitPriceVal = baseRate
			}
		}
	}
	if unitPriceVal <= 0 {
		unitPriceVal = 7.50
	}

	moqVal := payload.MinOrderQuantity
	if moqVal <= 0 && payload.MOQUnits > 0 {
		moqVal = payload.MOQUnits
	}
	if moqVal <= 0 && payload.Metadata != nil {
		if mVal, mOk := payload.Metadata["moq_units"].(float64); mOk {
			moqVal = int(mVal)
		}
	}
	if moqVal <= 0 {
		moqVal = 1000
	}

	// Resolve location coordinates
	var latVal, lngVal float64
	var addrText string
	if payload.PickupLocation != nil {
		latVal = payload.PickupLocation.Latitude
		lngVal = payload.PickupLocation.Longitude
		addrText = payload.PickupLocation.AddressText
	}
	if latVal == 0 && payload.PickupLat != nil {
		latVal = *payload.PickupLat
	}
	if lngVal == 0 && payload.PickupLng != nil {
		lngVal = *payload.PickupLng
	}
	if addrText == "" && payload.AddressText != "" {
		addrText = payload.AddressText
	}
	if latVal == 0 && vendorUser.Lat != 0 {
		latVal = vendorUser.Lat
		lngVal = vendorUser.Lng
		addrText = vendorUser.AddressText
	}

	attrBytes, _ := json.Marshal(attrMap)

	item := &domain.VendorCatalogItem{
		VendorUserID:     vendorUser.ID,
		Title:            payload.Title,
		Description:      payload.Description,
		SKU:              payload.SKU,
		UnitPrice:        unitPriceVal,
		PriceUnit:        payload.PriceUnit,
		StockQuantity:    payload.StockQuantity,
		MinOrderQuantity: moqVal,
		Images:           payload.Images,
		Attributes:       attrBytes,
		Status:           "PENDING_ADMIN_APPROVAL",
		PickupLat:        latVal,
		PickupLng:        lngVal,
		PickupAddress:    addrText,
		IsAvailable:      false,
	}

	if item.Title == "" {
		item.Title = "Brick & Building Material Listing"
	}
	if item.PriceUnit == "" {
		item.PriceUnit = "PER_PIECE"
	}
	if item.StockQuantity <= 0 {
		item.StockQuantity = 100000
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
		response.Error(w, http.StatusInternalServerError, "Failed to create catalog service item", err.Error())
		return
	}

	response.JSON(w, http.StatusCreated, "Vendor service created successfully and submitted for PENDING_ADMIN_APPROVAL", created)
}

// ListAdminCatalogRequests handles GET /api/v1/admin/catalog/requests
func (h *CatalogHandler) ListAdminCatalogRequests(w http.ResponseWriter, r *http.Request) {
	status := r.URL.Query().Get("status")
	if status == "" {
		status = "PENDING_ADMIN_APPROVAL"
	}

	items, err := h.catalogService.ListCatalogItemsByStatus(r.Context(), status)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to list catalog requests", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Catalog service requests retrieved", items)
}

// ApproveCatalogItem handles POST /api/v1/admin/catalog/{id}/approve
func (h *CatalogHandler) ApproveCatalogItem(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	itemID, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid catalog item ID", nil)
		return
	}

	approved, err := h.catalogService.ApproveCatalogItem(r.Context(), itemID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to approve catalog service listing", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Catalog service listing APPROVED and activated in catalog", approved)
}

// RejectCatalogItem handles POST /api/v1/admin/catalog/{id}/reject
func (h *CatalogHandler) RejectCatalogItem(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	itemID, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid catalog item ID", nil)
		return
	}

	var payload struct {
		RejectionReason string `json:"rejection_reason"`
	}
	_ = json.NewDecoder(r.Body).Decode(&payload)

	rejected, err := h.catalogService.RejectCatalogItem(r.Context(), itemID, payload.RejectionReason)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to reject catalog service listing", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Catalog service listing REJECTED", rejected)
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
		PickupLat        float64         `json:"pickup_lat"`
		PickupLng        float64         `json:"pickup_lng"`
		PickupAddress    string          `json:"pickup_address"`
		IsAvailable      bool            `json:"is_available"`
	}

	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid request JSON payload", err.Error())
		return
	}

	var vendorUID uuid.UUID
	claims, ok := middleware.GetUserClaims(r.Context())
	if ok && claims.SupabaseUID != "" {
		vUser, _ := h.userRepo.GetBySupabaseUID(r.Context(), claims.SupabaseUID)
		if vUser != nil {
			vendorUID = vUser.ID
		}
	}
	if vendorUID == uuid.Nil && payload.VendorUserID != "" {
		parsed, parseErr := uuid.Parse(payload.VendorUserID)
		if parseErr == nil {
			vendorUID = parsed
		}
	}
	if vendorUID == uuid.Nil {
		existing, getErr := h.catalogService.GetCatalogItemByID(r.Context(), itemID)
		if getErr == nil && existing != nil {
			vendorUID = existing.VendorUserID
		}
	}
	if vendorUID == uuid.Nil {
		response.Error(w, http.StatusBadRequest, "Invalid vendor_user_id format or unauthenticated vendor", nil)
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
		Status:           "PENDING_ADMIN_APPROVAL", // Resubmission resets to pending admin approval
		PickupLat:        payload.PickupLat,
		PickupLng:        payload.PickupLng,
		PickupAddress:    payload.PickupAddress,
		IsAvailable:      payload.IsAvailable,
	}

	updated, err := h.catalogService.UpdateCatalogItem(r.Context(), item)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to update catalog item", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Catalog item updated successfully and reset to PENDING_ADMIN_APPROVAL", updated)
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
