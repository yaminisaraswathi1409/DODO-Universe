package handler

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/uop/backend/internal/authz"
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

// SearchCatalog handles GET /api/v1/catalog/search with multi-criteria filtering
func (h *CatalogHandler) SearchCatalog(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query().Get("q")
	categorySlug := r.URL.Query().Get("category")
	vendorIDStr := r.URL.Query().Get("vendor_id")
	priceType := r.URL.Query().Get("price_type")
	inStockStr := r.URL.Query().Get("in_stock")
	sortBy := r.URL.Query().Get("sort_by")
	minPriceStr := r.URL.Query().Get("min_price")
	maxPriceStr := r.URL.Query().Get("max_price")
	latStr := r.URL.Query().Get("lat")
	lngStr := r.URL.Query().Get("lng")
	radiusStr := r.URL.Query().Get("radius_km")
	pageStr := r.URL.Query().Get("page")
	limitStr := r.URL.Query().Get("limit")

	page, _ := strconv.Atoi(pageStr)
	if page < 1 {
		page = 1
	}

	limit, _ := strconv.Atoi(limitStr)
	if limit < 1 || limit > 100 {
		limit = 24
	}
	offset := (page - 1) * limit

	var filter domain.MarketplaceCatalogFilter
	filter.Query = q
	filter.CategorySlug = categorySlug
	filter.PriceType = priceType
	filter.SortBy = sortBy
	filter.Limit = limit
	filter.Offset = offset

	if vendorIDStr != "" {
		if vID, err := uuid.Parse(vendorIDStr); err == nil {
			filter.VendorID = &vID
		}
	}
	if categoryIDStr := r.URL.Query().Get("category_id"); categoryIDStr != "" {
		if cID, err := uuid.Parse(categoryIDStr); err == nil {
			filter.CategoryID = &cID
		}
	}
	if minPriceStr != "" {
		if mp, err := strconv.ParseFloat(minPriceStr, 64); err == nil {
			filter.MinPrice = &mp
		}
	}
	if maxPriceStr != "" {
		if xp, err := strconv.ParseFloat(maxPriceStr, 64); err == nil {
			filter.MaxPrice = &xp
		}
	}
	if inStockStr == "true" || inStockStr == "1" {
		filter.InStockOnly = true
	}
	if latStr != "" && lngStr != "" {
		lat, _ := strconv.ParseFloat(latStr, 64)
		lng, _ := strconv.ParseFloat(lngStr, 64)
		rad, _ := strconv.ParseFloat(radiusStr, 64)
		if rad <= 0 {
			rad = 50.0 // Default 50km radius
		}
		filter.CustomerLat = lat
		filter.CustomerLng = lng
		filter.RadiusKM = rad
	}

	items, total, err := h.catalogService.SearchMarketplaceCatalog(r.Context(), filter)
	if err != nil {
		// Graceful fallback to standard search
		items, total, err = h.catalogService.SearchCatalogItems(r.Context(), q, categorySlug, limit, offset)
		if err != nil {
			response.Error(w, http.StatusInternalServerError, "Failed to search catalog items", err.Error())
			return
		}
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

// GetVendorCatalogTree handles GET /api/v1/vendors/{vendor_id}/catalog/tree
func (h *CatalogHandler) GetVendorCatalogTree(w http.ResponseWriter, r *http.Request) {
	vendorIDStr := chi.URLParam(r, "vendor_id")
	vendorID, err := uuid.Parse(vendorIDStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid vendor_id format", err.Error())
		return
	}

	var categoryID *uuid.UUID
	catIDStr := r.URL.Query().Get("category_id")
	if catIDStr != "" {
		if cID, parseErr := uuid.Parse(catIDStr); parseErr == nil {
			categoryID = &cID
		}
	}

	includeUnapproved := r.URL.Query().Get("include_unapproved") == "true" || r.URL.Query().Get("all") == "true"

	tree, err := h.catalogService.GetVendorCatalogTree(r.Context(), vendorID, categoryID, includeUnapproved)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to build vendor catalog tree", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Vendor catalog tree retrieved", map[string]interface{}{
		"vendor_id": vendorID,
		"tree":      tree,
	})
}

// CreateCatalogItem handles POST /api/v1/vendor/catalog and POST /api/v1/services/create
func (h *CatalogHandler) CreateCatalogItem(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		VendorUserID     string                 `json:"vendor_user_id"`
		VendorAssetID    *string                `json:"vendor_asset_id"`
		CategoryID       *string                `json:"category_id"`
		ParentID         *string                `json:"parent_id"`
		NodeType         string                 `json:"node_type"` // GROUPING or BOOKABLE
		PriceType        string                 `json:"price_type"` // FIXED or QUOTATION
		DisplayOrder     int                    `json:"display_order"`
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
		IncludedServices json.RawMessage        `json:"included_services"`
		OptionalServices json.RawMessage        `json:"optional_services"`
		FulfilmentInfo   json.RawMessage        `json:"fulfilment_info"`
		Status           string                 `json:"status"` // DRAFT or PENDING_ADMIN_APPROVAL
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

	// The vendor is the verified caller (admins may name another vendor).
	vendorID, ok := h.resolveVendorID(w, r, payload.VendorUserID, uuid.Nil)
	if !ok {
		return
	}
	vendorUser, _ := h.userRepo.GetByID(r.Context(), vendorID)
	if vendorUser == nil {
		response.Error(w, http.StatusBadRequest, "Vendor profile not found", nil)
		return
	}

	// Node type resolution
	nodeType := strings.ToUpper(strings.TrimSpace(payload.NodeType))
	if nodeType == "" {
		nodeType = "BOOKABLE"
	}

	priceType := strings.ToUpper(strings.TrimSpace(payload.PriceType))
	if priceType == "" {
		priceType = "FIXED"
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

	// Unit price & MOQ resolution
	unitPriceVal := payload.UnitPrice
	if nodeType == "BOOKABLE" && priceType == "FIXED" {
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
	}

	moqVal := payload.MinOrderQuantity
	if nodeType == "BOOKABLE" {
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

	statusVal := strings.ToUpper(strings.TrimSpace(payload.Status))
	if statusVal == "" {
		if nodeType == "GROUPING" {
			statusVal = "APPROVED"
		} else {
			statusVal = "PENDING_ADMIN_APPROVAL"
		}
	}

	item := &domain.VendorCatalogItem{
		VendorUserID:     vendorUser.ID,
		NodeType:         nodeType,
		PriceType:        priceType,
		DisplayOrder:     payload.DisplayOrder,
		Title:            payload.Title,
		Description:      payload.Description,
		SKU:              payload.SKU,
		UnitPrice:        unitPriceVal,
		PriceUnit:        payload.PriceUnit,
		StockQuantity:    payload.StockQuantity,
		MinOrderQuantity: moqVal,
		Images:           payload.Images,
		Attributes:       attrBytes,
		IncludedServices: payload.IncludedServices,
		OptionalServices: payload.OptionalServices,
		FulfilmentInfo:   payload.FulfilmentInfo,
		Status:           statusVal,
		PickupLat:        latVal,
		PickupLng:        lngVal,
		PickupAddress:    addrText,
		IsAvailable:      statusVal == "ACTIVE_IN_CATALOG" || statusVal == "APPROVED",
	}

	if item.Title == "" {
		if nodeType == "GROUPING" {
			item.Title = "Category Group"
		} else {
			item.Title = "Catalog Offering"
		}
	}

	if item.PriceUnit == "" && nodeType == "BOOKABLE" {
		item.PriceUnit = "PER_PIECE"
	}
	if item.StockQuantity <= 0 && nodeType == "BOOKABLE" {
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

	if payload.ParentID != nil && *payload.ParentID != "" {
		pID, err := uuid.Parse(*payload.ParentID)
		if err == nil {
			item.ParentID = &pID
		}
	}

	created, err := h.catalogService.CreateCatalogItem(r.Context(), item)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to create catalog node or offering", err.Error())
		return
	}

	response.JSON(w, http.StatusCreated, "Vendor catalog item created successfully", created)
}

// MoveCatalogNode handles POST /api/v1/vendor/catalog/{id}/move
func (h *CatalogHandler) MoveCatalogNode(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	itemID, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid catalog item ID", nil)
		return
	}

	var payload struct {
		VendorUserID string  `json:"vendor_user_id"`
		ParentID     *string `json:"parent_id"`
		DisplayOrder int     `json:"display_order"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid request JSON", err.Error())
		return
	}

	var adminFallback uuid.UUID
	if existing, getErr := h.catalogService.GetCatalogItemByID(r.Context(), itemID); getErr == nil && existing != nil {
		adminFallback = existing.VendorUserID
	}
	vendorUID, ok := h.resolveVendorID(w, r, payload.VendorUserID, adminFallback)
	if !ok {
		return
	}

	var newParentID *uuid.UUID
	if payload.ParentID != nil && *payload.ParentID != "" {
		parsedP, pErr := uuid.Parse(*payload.ParentID)
		if pErr == nil {
			newParentID = &parsedP
		}
	}

	err = h.catalogService.MoveCatalogNode(r.Context(), itemID, vendorUID, newParentID, payload.DisplayOrder)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Failed to move catalog node", err.Error())
		return
	}

	updated, _ := h.catalogService.GetCatalogItemByID(r.Context(), itemID)
	response.JSON(w, http.StatusOK, "Catalog node moved successfully", updated)
}

// ReorderCatalogNodes handles POST /api/v1/vendor/catalog/reorder
func (h *CatalogHandler) ReorderCatalogNodes(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		VendorUserID string   `json:"vendor_user_id"`
		ParentID     *string  `json:"parent_id"`
		NodeIDs      []string `json:"node_ids"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid request JSON", err.Error())
		return
	}

	vendorUID, ok := h.resolveVendorID(w, r, payload.VendorUserID, uuid.Nil)
	if !ok {
		return
	}

	var parentID *uuid.UUID
	if payload.ParentID != nil && *payload.ParentID != "" {
		parsedP, pErr := uuid.Parse(*payload.ParentID)
		if pErr == nil {
			parentID = &parsedP
		}
	}

	var nodeUUIDs []uuid.UUID
	for _, nIDStr := range payload.NodeIDs {
		if parsed, pErr := uuid.Parse(nIDStr); pErr == nil {
			nodeUUIDs = append(nodeUUIDs, parsed)
		}
	}

	err := h.catalogService.ReorderCatalogNodes(r.Context(), vendorUID, parentID, nodeUUIDs)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Failed to reorder catalog nodes", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Catalog nodes reordered successfully", nil)
}

func (h *CatalogHandler) requireAdmin(r *http.Request) (*domain.User, error) {
	return authz.RequireAdmin(r)
}

// resolveVendorID returns the vendor a catalog action applies to. It is the
// verified caller. An admin may act for another vendor by naming one in
// vendor_user_id (or, if none is named, for adminFallback when provided). A
// non-admin naming anybody else is rejected: ownership never comes from the
// request body.
func (h *CatalogHandler) resolveVendorID(w http.ResponseWriter, r *http.Request, claimed string, adminFallback uuid.UUID) (uuid.UUID, bool) {
	caller, err := authz.CurrentUser(r)
	if authz.Write(w, err) {
		return uuid.Nil, false
	}
	if claimed == "" {
		if caller.IsAdmin() && adminFallback != uuid.Nil {
			return adminFallback, true
		}
		return caller.ID, true
	}
	id, perr := uuid.Parse(claimed)
	if perr != nil {
		response.Error(w, http.StatusBadRequest, "Invalid vendor_user_id", nil)
		return uuid.Nil, false
	}
	if id != caller.ID && !caller.IsAdmin() {
		response.Error(w, http.StatusForbidden, "Unauthorized: you cannot act for another vendor", nil)
		return uuid.Nil, false
	}
	return id, true
}

// ListAdminCatalogRequests handles GET /api/v1/admin/catalog/requests
func (h *CatalogHandler) ListAdminCatalogRequests(w http.ResponseWriter, r *http.Request) {
	if _, err := h.requireAdmin(r); err != nil {
		response.Error(w, http.StatusForbidden, "Admin credentials required", nil)
		return
	}
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
	if _, err := h.requireAdmin(r); err != nil {
		response.Error(w, http.StatusForbidden, "Admin credentials required", nil)
		return
	}
	idStr := chi.URLParam(r, "id")
	itemID, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid catalog item ID", nil)
		return
	}

	var reviewerID *uuid.UUID
	reviewerName := "Admin Reviewer"
	claims, ok := middleware.GetUserClaims(r.Context())
	if ok && claims.SupabaseUID != "" {
		if u, _ := h.userRepo.GetBySupabaseUID(r.Context(), claims.SupabaseUID); u != nil {
			reviewerID = &u.ID
			if u.FullName != "" {
				reviewerName = u.FullName
			}
		}
	}

	approved, err := h.catalogService.ApproveCatalogItemWithReviewer(r.Context(), itemID, reviewerID, reviewerName)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to approve catalog service listing", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Catalog service listing APPROVED and activated in catalog", approved)
}

// RequestChangesCatalogItem handles POST /api/v1/admin/catalog/{id}/request-changes
func (h *CatalogHandler) RequestChangesCatalogItem(w http.ResponseWriter, r *http.Request) {
	if _, err := h.requireAdmin(r); err != nil {
		response.Error(w, http.StatusForbidden, "Admin credentials required", nil)
		return
	}
	idStr := chi.URLParam(r, "id")
	itemID, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid catalog item ID", nil)
		return
	}

	var payload struct {
		Notes string `json:"notes"`
	}
	_ = json.NewDecoder(r.Body).Decode(&payload)

	if strings.TrimSpace(payload.Notes) == "" {
		response.Error(w, http.StatusBadRequest, "Change request notes are mandatory", nil)
		return
	}

	var reviewerID *uuid.UUID
	reviewerName := "Admin Reviewer"
	claims, ok := middleware.GetUserClaims(r.Context())
	if ok && claims.SupabaseUID != "" {
		if u, _ := h.userRepo.GetBySupabaseUID(r.Context(), claims.SupabaseUID); u != nil {
			reviewerID = &u.ID
			if u.FullName != "" {
				reviewerName = u.FullName
			}
		}
	}

	res, err := h.catalogService.RequestChangesCatalogItem(r.Context(), itemID, payload.Notes, reviewerID, reviewerName)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to request changes", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Changes requested successfully", res)
}

// RejectCatalogItem handles POST /api/v1/admin/catalog/{id}/reject
func (h *CatalogHandler) RejectCatalogItem(w http.ResponseWriter, r *http.Request) {
	if _, err := h.requireAdmin(r); err != nil {
		response.Error(w, http.StatusForbidden, "Admin credentials required", nil)
		return
	}
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

	if strings.TrimSpace(payload.RejectionReason) == "" {
		response.Error(w, http.StatusBadRequest, "Rejection reason is mandatory", nil)
		return
	}

	var reviewerID *uuid.UUID
	reviewerName := "Admin Reviewer"
	claims, ok := middleware.GetUserClaims(r.Context())
	if ok && claims.SupabaseUID != "" {
		if u, _ := h.userRepo.GetBySupabaseUID(r.Context(), claims.SupabaseUID); u != nil {
			reviewerID = &u.ID
			if u.FullName != "" {
				reviewerName = u.FullName
			}
		}
	}

	rejected, err := h.catalogService.RejectCatalogItemWithReviewer(r.Context(), itemID, payload.RejectionReason, reviewerID, reviewerName)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to reject catalog service listing", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Catalog service listing REJECTED", rejected)
}

// ArchiveCatalogItem handles POST /api/v1/vendor/catalog/{id}/archive
func (h *CatalogHandler) ArchiveCatalogItem(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	itemID, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid catalog item ID", nil)
		return
	}

	var payload struct {
		VendorUserID string `json:"vendor_user_id"`
	}
	_ = json.NewDecoder(r.Body).Decode(&payload)

	vendorUID, ok := h.resolveVendorID(w, r, payload.VendorUserID, uuid.Nil)
	if !ok {
		return
	}

	err = h.catalogService.ArchiveCatalogItem(r.Context(), itemID, vendorUID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to archive catalog item", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Catalog item archived successfully", nil)
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
		NodeType         string          `json:"node_type"`
		PriceType        string          `json:"price_type"`
		DisplayOrder     int             `json:"display_order"`
		UnitPrice        float64         `json:"unit_price"`
		PriceUnit        string          `json:"price_unit"`
		StockQuantity    int             `json:"stock_quantity"`
		MinOrderQuantity int             `json:"min_order_quantity"`
		Images           json.RawMessage `json:"images"`
		Attributes       json.RawMessage `json:"attributes"`
		IncludedServices json.RawMessage `json:"included_services"`
		OptionalServices json.RawMessage `json:"optional_services"`
		FulfilmentInfo   json.RawMessage `json:"fulfilment_info"`
		PickupLat        float64         `json:"pickup_lat"`
		PickupLng        float64         `json:"pickup_lng"`
		PickupAddress    string          `json:"pickup_address"`
		IsAvailable      bool            `json:"is_available"`
	}

	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid request JSON payload", err.Error())
		return
	}

	existing, getErr := h.catalogService.GetCatalogItemByID(r.Context(), itemID)
	if getErr != nil || existing == nil {
		response.Error(w, http.StatusNotFound, "Catalog item not found", nil)
		return
	}
	vendorUID, ok := h.resolveVendorID(w, r, payload.VendorUserID, existing.VendorUserID)
	if !ok {
		return
	}
	if existing.VendorUserID != vendorUID {
		response.Error(w, http.StatusForbidden, "Unauthorized: you do not have permission to modify another vendor's catalog item", nil)
		return
	}

	item := &domain.VendorCatalogItem{
		ID:               itemID,
		VendorUserID:     vendorUID,
		NodeType:         payload.NodeType,
		PriceType:        payload.PriceType,
		DisplayOrder:     payload.DisplayOrder,
		Title:            payload.Title,
		Description:      payload.Description,
		SKU:              payload.SKU,
		UnitPrice:        payload.UnitPrice,
		PriceUnit:        payload.PriceUnit,
		StockQuantity:    payload.StockQuantity,
		MinOrderQuantity: payload.MinOrderQuantity,
		Images:           payload.Images,
		Attributes:       payload.Attributes,
		IncludedServices: payload.IncludedServices,
		OptionalServices: payload.OptionalServices,
		FulfilmentInfo:   payload.FulfilmentInfo,
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

	vendorUID, ok := h.resolveVendorID(w, r, r.URL.Query().Get("vendor_user_id"), uuid.Nil)
	if !ok {
		return
	}

	err = h.catalogService.DeleteCatalogItem(r.Context(), itemID, vendorUID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to delete catalog item", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Catalog item deleted successfully", nil)
}


// ============================================================================
// PHASE 4: CUSTOMER MARKETPLACE & DISCOVERY HANDLERS
// ============================================================================

// GetMarketplaceOfferingByID handles GET /api/v1/catalog/items/{id} and GET /api/v1/catalog/{id}
func (h *CatalogHandler) GetMarketplaceOfferingByID(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	offeringID, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid offering ID format", err.Error())
		return
	}

	item, breadcrumbs, err := h.catalogService.GetMarketplaceOfferingByID(r.Context(), offeringID)
	if err != nil {
		response.Error(w, http.StatusNotFound, err.Error(), nil)
		return
	}

	response.JSON(w, http.StatusOK, "Offering details retrieved", map[string]interface{}{
		"item":        item,
		"breadcrumbs": breadcrumbs,
		"vendor":      item.VendorUser,
		"category":    item.Category,
	})
}

// GetEligibleVendorsByCategory handles GET /api/v1/categories/{category_id}/vendors
func (h *CatalogHandler) GetEligibleVendorsByCategory(w http.ResponseWriter, r *http.Request) {
	catParam := chi.URLParam(r, "category_id")
	var catID *uuid.UUID
	var catSlug string
	if parsed, err := uuid.Parse(catParam); err == nil {
		catID = &parsed
	} else {
		catSlug = catParam
	}

	lat, _ := strconv.ParseFloat(r.URL.Query().Get("lat"), 64)
	lng, _ := strconv.ParseFloat(r.URL.Query().Get("lng"), 64)
	page, _ := strconv.Atoi(r.URL.Query().Get("page"))
	if page < 1 {
		page = 1
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit < 1 || limit > 50 {
		limit = 20
	}
	offset := (page - 1) * limit

	vendors, total, err := h.catalogService.GetEligibleVendorsByCategory(r.Context(), catID, catSlug, lat, lng, limit, offset)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to retrieve category vendors", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Eligible vendors retrieved", map[string]interface{}{
		"vendors": vendors,
		"total":   total,
		"page":    page,
		"limit":   limit,
	})
}

// CompareOfferings handles POST /api/v1/catalog/compare and GET /api/v1/catalog/compare
func (h *CatalogHandler) CompareOfferings(w http.ResponseWriter, r *http.Request) {
	var ids []uuid.UUID

	if r.Method == http.MethodPost {
		var req struct {
			OfferingIDs []string `json:"offering_ids"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err == nil {
			for _, idStr := range req.OfferingIDs {
				if parsed, pErr := uuid.Parse(idStr); pErr == nil {
					ids = append(ids, parsed)
				}
			}
		}
	} else {
		idsParam := r.URL.Query().Get("ids")
		if idsParam != "" {
			for _, idStr := range strings.Split(idsParam, ",") {
				if parsed, pErr := uuid.Parse(strings.TrimSpace(idStr)); pErr == nil {
					ids = append(ids, parsed)
				}
			}
		}
	}

	if len(ids) < 1 {
		response.Error(w, http.StatusBadRequest, "Please provide offering_ids for comparison", nil)
		return
	}

	result, err := h.catalogService.CompareMarketplaceOfferings(r.Context(), ids)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error(), nil)
		return
	}

	response.JSON(w, http.StatusOK, "Offerings comparison retrieved", result)
}
