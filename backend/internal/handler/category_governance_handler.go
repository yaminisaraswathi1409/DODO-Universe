package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/uop/backend/internal/domain"
	"github.com/uop/backend/internal/middleware"
	"github.com/uop/backend/internal/repository/postgres"
	"github.com/uop/backend/internal/service"
	"github.com/uop/backend/pkg/response"
)

type CategoryGovernanceHandler struct {
	govService *service.CategoryGovernanceService
	userRepo   *postgres.UserRepository
}

func NewCategoryGovernanceHandler(govService *service.CategoryGovernanceService, userRepo *postgres.UserRepository) *CategoryGovernanceHandler {
	return &CategoryGovernanceHandler{govService: govService, userRepo: userRepo}
}

func (h *CategoryGovernanceHandler) requireAdmin(r *http.Request) (*domain.User, error) {
	if h.userRepo == nil {
		return nil, fmt.Errorf("user repository unavailable")
	}
	claims, ok := middleware.GetUserClaims(r.Context())
	if ok && claims.SupabaseUID != "" {
		u, err := h.userRepo.GetBySupabaseUID(r.Context(), claims.SupabaseUID)
		if err == nil && u != nil && u.Role == domain.RoleAdmin {
			return u, nil
		}
	}
	authHeader := r.Header.Get("Authorization")
	if authHeader != "" {
		parts := strings.Split(authHeader, " ")
		tokenStr := authHeader
		if len(parts) == 2 && strings.ToLower(parts[0]) == "bearer" {
			tokenStr = parts[1]
		}
		if uid, err := uuid.Parse(tokenStr); err == nil {
			if u, _ := h.userRepo.GetByID(r.Context(), uid); u != nil && u.Role == domain.RoleAdmin {
				return u, nil
			}
		}
		if u, _ := h.userRepo.GetBySupabaseUID(r.Context(), tokenStr); u != nil && u.Role == domain.RoleAdmin {
			return u, nil
		}
	}
	return nil, fmt.Errorf("admin credentials required")
}

func (h *CategoryGovernanceHandler) authorizeVendor(r *http.Request, targetVendorID uuid.UUID) bool {
	if h.userRepo == nil {
		return true
	}
	claims, ok := middleware.GetUserClaims(r.Context())
	if ok && claims.SupabaseUID != "" {
		u, err := h.userRepo.GetBySupabaseUID(r.Context(), claims.SupabaseUID)
		if err == nil && u != nil {
			return u.Role == domain.RoleAdmin || u.ID == targetVendorID
		}
	}
	authHeader := r.Header.Get("Authorization")
	if authHeader != "" {
		parts := strings.Split(authHeader, " ")
		tokenStr := authHeader
		if len(parts) == 2 && strings.ToLower(parts[0]) == "bearer" {
			tokenStr = parts[1]
		}
		if uid, err := uuid.Parse(tokenStr); err == nil {
			if u, _ := h.userRepo.GetByID(r.Context(), uid); u != nil {
				return u.Role == domain.RoleAdmin || u.ID == targetVendorID
			}
		}
	}
	return true
}

// ----------------------------------------------------------------------------
// HIERARCHY HANDLERS
// ----------------------------------------------------------------------------

func (h *CategoryGovernanceHandler) GetHierarchyTree(w http.ResponseWriter, r *http.Request) {
	tree, err := h.govService.GetCategoryTree(r.Context())
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to load category hierarchy tree", err.Error())
		return
	}
	response.JSON(w, http.StatusOK, "Category hierarchy tree fetched successfully", tree)
}

type MoveCategoryPayload struct {
	ParentID     *string `json:"parent_id"`
	DisplayOrder int     `json:"display_order"`
}

func (h *CategoryGovernanceHandler) UpdateParent(w http.ResponseWriter, r *http.Request) {
	if _, err := h.requireAdmin(r); err != nil {
		response.Error(w, http.StatusForbidden, "Admin credentials required", nil)
		return
	}
	idStr := chi.URLParam(r, "id")
	catID, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid category ID", nil)
		return
	}

	var p MoveCategoryPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid request payload", err.Error())
		return
	}

	var parentUUID *uuid.UUID
	if p.ParentID != nil && *p.ParentID != "" && *p.ParentID != "null" {
		pid, err := uuid.Parse(*p.ParentID)
		if err != nil {
			response.Error(w, http.StatusBadRequest, "Invalid parent category ID", nil)
			return
		}
		parentUUID = &pid
	}

	updated, err := h.govService.MoveCategory(r.Context(), catID, parentUUID, p.DisplayOrder)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error(), nil)
		return
	}

	response.JSON(w, http.StatusOK, "Category hierarchy location updated successfully", updated)
}

type ToggleSelectablePayload struct {
	IsSelectable bool `json:"is_selectable"`
}

func (h *CategoryGovernanceHandler) ToggleSelectable(w http.ResponseWriter, r *http.Request) {
	if _, err := h.requireAdmin(r); err != nil {
		response.Error(w, http.StatusForbidden, "Admin credentials required", nil)
		return
	}
	idStr := chi.URLParam(r, "id")
	catID, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid category ID", nil)
		return
	}

	var p ToggleSelectablePayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid request payload", err.Error())
		return
	}

	updated, err := h.govService.ToggleSelectability(r.Context(), catID, p.IsSelectable)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error(), nil)
		return
	}

	response.JSON(w, http.StatusOK, "Category selectability updated successfully", updated)
}

// ----------------------------------------------------------------------------
// VENDOR GOVERNANCE HANDLERS
// ----------------------------------------------------------------------------

type ApplyCategoryPayload struct {
	VendorID          string   `json:"vendor_id"`
	CategoryID        string   `json:"category_id"`
	AssetID           string   `json:"asset_id"`
	SecondaryAssetIDs []string `json:"secondary_asset_ids"`
	Notes             string   `json:"notes"`
}

func (h *CategoryGovernanceHandler) ApplyForCategory(w http.ResponseWriter, r *http.Request) {
	var p ApplyCategoryPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid JSON payload", err.Error())
		return
	}

	vendorID, err := uuid.Parse(p.VendorID)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid vendor_id", nil)
		return
	}
	catID, err := uuid.Parse(p.CategoryID)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid category_id", nil)
		return
	}
	assetID, err := uuid.Parse(p.AssetID)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid asset_id", nil)
		return
	}

	var secondaryUUIDs []uuid.UUID
	for _, s := range p.SecondaryAssetIDs {
		if u, err := uuid.Parse(s); err == nil && u != assetID {
			secondaryUUIDs = append(secondaryUUIDs, u)
		}
	}

	approval, err := h.govService.ApplyForCategory(r.Context(), vendorID, catID, assetID, secondaryUUIDs, p.Notes)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error(), nil)
		return
	}

	response.JSON(w, http.StatusCreated, "Category application submitted successfully for Admin review", approval)
}

type ResubmitCategoryPayload struct {
	VendorID          string   `json:"vendor_id"`
	AssetID           string   `json:"asset_id"`
	SecondaryAssetIDs []string `json:"secondary_asset_ids"`
	Notes             string   `json:"notes"`
}

func (h *CategoryGovernanceHandler) ResubmitCategoryApplication(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	approvalID, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid approval ID", nil)
		return
	}

	var p ResubmitCategoryPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid JSON payload", err.Error())
		return
	}

	vendorID, err := uuid.Parse(p.VendorID)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid vendor_id", nil)
		return
	}
	assetID, err := uuid.Parse(p.AssetID)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid asset_id", nil)
		return
	}

	var secondaryUUIDs []uuid.UUID
	for _, s := range p.SecondaryAssetIDs {
		if u, err := uuid.Parse(s); err == nil && u != assetID {
			secondaryUUIDs = append(secondaryUUIDs, u)
		}
	}

	approval, err := h.govService.ResubmitCategoryApplication(r.Context(), vendorID, approvalID, assetID, secondaryUUIDs, p.Notes)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error(), nil)
		return
	}

	response.JSON(w, http.StatusOK, "Category application updated and resubmitted successfully", approval)
}

func (h *CategoryGovernanceHandler) ListVendorCategoryApprovals(w http.ResponseWriter, r *http.Request) {
	vendorIDStr := r.URL.Query().Get("vendor_id")
	if vendorIDStr == "" {
		response.Error(w, http.StatusBadRequest, "vendor_id query parameter is required", nil)
		return
	}
	vendorID, err := uuid.Parse(vendorIDStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid vendor_id", nil)
		return
	}

	if !h.authorizeVendor(r, vendorID) {
		response.Error(w, http.StatusForbidden, "Unauthorized: you do not have permission to view another vendor's approvals", nil)
		return
	}
	list, err := h.govService.ListVendorApprovals(r.Context(), vendorID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to fetch vendor approvals", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Vendor category approvals retrieved", list)
}

func (h *CategoryGovernanceHandler) ListAdminCategoryApprovals(w http.ResponseWriter, r *http.Request) {
	if _, err := h.requireAdmin(r); err != nil {
		response.Error(w, http.StatusForbidden, "Admin credentials required", nil)
		return
	}
	statusFilter := r.URL.Query().Get("status")
	list, err := h.govService.ListAdminApprovals(r.Context(), statusFilter)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to fetch category approval requests", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Admin category approvals retrieved", list)
}

type AdminReviewApprovalPayload struct {
	AdminID string `json:"admin_id"`
	Action  string `json:"action"` // APPROVE, REJECT, REQUEST_CHANGES, SUSPEND
	Notes   string `json:"notes"`
}

func (h *CategoryGovernanceHandler) AdminReviewCategoryApproval(w http.ResponseWriter, r *http.Request) {
	if _, err := h.requireAdmin(r); err != nil {
		response.Error(w, http.StatusForbidden, "Admin credentials required", nil)
		return
	}
	idStr := chi.URLParam(r, "id")
	approvalID, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid approval ID", nil)
		return
	}

	var p AdminReviewApprovalPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid JSON payload", err.Error())
		return
	}

	adminID, err := uuid.Parse(p.AdminID)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid admin_id", nil)
		return
	}

	updated, err := h.govService.AdminReviewApproval(r.Context(), adminID, approvalID, p.Action, p.Notes)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error(), nil)
		return
	}

	msg := "Category approval reviewed successfully"
	if updated.Status == domain.CategoryApprovalActive {
		msg = "Vendor credential approved! Vendor is now authorized to offer services in this category."
	} else if updated.Status == domain.CategoryApprovalChangesRequested {
		msg = "Change request sent to vendor."
	} else if updated.Status == domain.CategoryApprovalRejected {
		msg = "Vendor category application rejected."
	} else if updated.Status == domain.CategoryApprovalSuspended {
		msg = "Vendor category authorization suspended."
	}

	response.JSON(w, http.StatusOK, msg, updated)
}
