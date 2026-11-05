package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/uop/backend/internal/authz"
	"github.com/uop/backend/internal/domain"
	"github.com/uop/backend/internal/repository/postgres"
	"github.com/uop/backend/internal/service"
	"github.com/uop/backend/pkg/response"
)

type OperationsHandler struct {
	operationsService *service.OperationsService
	userRepo          *postgres.UserRepository
}

func NewOperationsHandler(
	operationsService *service.OperationsService,
	userRepo *postgres.UserRepository,
) *OperationsHandler {
	return &OperationsHandler{
		operationsService: operationsService,
		userRepo:          userRepo,
	}
}

// getUserFromRequest returns the verified caller, or nil when unauthenticated.
func (h *OperationsHandler) getUserFromRequest(r *http.Request) *domain.User {
	user, err := authz.CurrentUser(r)
	if err != nil {
		return nil
	}
	return user
}

// ----------------------------------------------------------------------------
// USER NOTIFICATION PREFERENCES & NOTIFICATION FEED
// ----------------------------------------------------------------------------

func (h *OperationsHandler) GetNotificationPreferences(w http.ResponseWriter, r *http.Request) {
	user := h.getUserFromRequest(r)
	if user == nil {
		response.Error(w, http.StatusUnauthorized, "Authentication required", nil)
		return
	}

	pref, err := h.operationsService.GetNotificationPreferences(r.Context(), user.ID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed retrieving preferences", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Notification preferences retrieved successfully", pref)
}

func (h *OperationsHandler) UpdateNotificationPreferences(w http.ResponseWriter, r *http.Request) {
	user := h.getUserFromRequest(r)
	if user == nil {
		response.Error(w, http.StatusUnauthorized, "Authentication required", nil)
		return
	}

	var req domain.NotificationPreference
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid payload format", err.Error())
		return
	}

	req.UserID = user.ID
	if err := h.operationsService.UpdateNotificationPreferences(r.Context(), &req); err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed updating preferences", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Notification preferences updated successfully", req)
}

func (h *OperationsHandler) GetNotifications(w http.ResponseWriter, r *http.Request) {
	user := h.getUserFromRequest(r)
	if user == nil {
		response.Error(w, http.StatusUnauthorized, "Authentication required", nil)
		return
	}

	page := 1
	if p, err := strconv.Atoi(r.URL.Query().Get("page")); err == nil && p > 0 {
		page = p
	}
	pageSize := 20
	if ps, err := strconv.Atoi(r.URL.Query().Get("page_size")); err == nil && ps > 0 {
		pageSize = ps
	}
	notifType := r.URL.Query().Get("type")
	var unreadOnly *bool
	if unreadStr := r.URL.Query().Get("unread_only"); unreadStr != "" {
		val := unreadStr == "true" || unreadStr == "1"
		unreadOnly = &val
	}

	filter := &domain.NotificationFilter{
		UserID:     user.ID,
		Type:       notifType,
		UnreadOnly: unreadOnly,
		Page:       page,
		PageSize:   pageSize,
	}

	res, err := h.operationsService.GetFilteredNotifications(r.Context(), filter)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to fetch notifications", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Notifications retrieved successfully", res)
}

// ----------------------------------------------------------------------------
// ADMIN OPERATIONS DASHBOARD & METRICS
// ----------------------------------------------------------------------------

func (h *OperationsHandler) GetAdminMetrics(w http.ResponseWriter, r *http.Request) {
	user := h.getUserFromRequest(r)
	if user == nil || user.Role != domain.RoleAdmin {
		response.Error(w, http.StatusForbidden, "Admin credentials required", nil)
		return
	}

	metrics, err := h.operationsService.GetDashboardMetrics(r.Context())
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed retrieving operations metrics", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Operational metrics retrieved successfully", metrics)
}

func (h *OperationsHandler) GetStuckOrders(w http.ResponseWriter, r *http.Request) {
	user := h.getUserFromRequest(r)
	if user == nil || user.Role != domain.RoleAdmin {
		response.Error(w, http.StatusForbidden, "Admin credentials required", nil)
		return
	}

	alerts, err := h.operationsService.ListStuckOrders(r.Context())
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed retrieving stuck orders", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Stuck order alerts retrieved successfully", alerts)
}

func (h *OperationsHandler) GetAuditLogs(w http.ResponseWriter, r *http.Request) {
	user := h.getUserFromRequest(r)
	if user == nil || user.Role != domain.RoleAdmin {
		response.Error(w, http.StatusForbidden, "Admin credentials required", nil)
		return
	}

	entityType := r.URL.Query().Get("entity_type")
	var actorID *uuid.UUID
	if actorStr := r.URL.Query().Get("actor_id"); actorStr != "" {
		if uid, err := uuid.Parse(actorStr); err == nil {
			actorID = &uid
		}
	}
	limit := 20
	if l, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && l > 0 {
		limit = l
	}
	offset := 0
	if o, err := strconv.Atoi(r.URL.Query().Get("offset")); err == nil && o >= 0 {
		offset = o
	}

	logs, total, err := h.operationsService.ListAuditLogs(r.Context(), entityType, actorID, limit, offset)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed retrieving audit logs", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Audit logs retrieved successfully", map[string]interface{}{
		"logs":   logs,
		"total":  total,
		"limit":  limit,
		"offset": offset,
	})
}

// ----------------------------------------------------------------------------
// VENDOR SUSPENSION & REACTIVATION
// ----------------------------------------------------------------------------

func (h *OperationsHandler) SuspendVendor(w http.ResponseWriter, r *http.Request) {
	user := h.getUserFromRequest(r)
	if user == nil || user.Role != domain.RoleAdmin {
		response.Error(w, http.StatusForbidden, "Admin credentials required", nil)
		return
	}

	idStr := chi.URLParam(r, "id")
	vendorID, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid vendor ID", err.Error())
		return
	}

	var req domain.VendorSuspensionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid request payload", err.Error())
		return
	}
	req.VendorID = vendorID

	if err := h.operationsService.SuspendVendor(r.Context(), user.ID, &req); err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to suspend vendor", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Vendor suspended successfully. Existing orders preserved.", map[string]interface{}{
		"vendor_id": vendorID,
		"status":    "SUSPENDED",
		"reason":    req.Reason,
	})
}

func (h *OperationsHandler) ReactivateVendor(w http.ResponseWriter, r *http.Request) {
	user := h.getUserFromRequest(r)
	if user == nil || user.Role != domain.RoleAdmin {
		response.Error(w, http.StatusForbidden, "Admin credentials required", nil)
		return
	}

	idStr := chi.URLParam(r, "id")
	vendorID, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid vendor ID", err.Error())
		return
	}

	var req domain.VendorReactivateRequest
	_ = json.NewDecoder(r.Body).Decode(&req)
	req.VendorID = vendorID

	if err := h.operationsService.ReactivateVendor(r.Context(), user.ID, &req); err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to reactivate vendor", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Vendor reactivated successfully", map[string]interface{}{
		"vendor_id": vendorID,
		"status":    "ACTIVE",
	})
}

// ----------------------------------------------------------------------------
// SOS INCIDENTS & ESCALATION
// ----------------------------------------------------------------------------

func (h *OperationsHandler) ListIncidents(w http.ResponseWriter, r *http.Request) {
	user := h.getUserFromRequest(r)
	if user == nil || user.Role != domain.RoleAdmin {
		response.Error(w, http.StatusForbidden, "Admin credentials required", nil)
		return
	}

	incidents, err := h.operationsService.ListActiveIncidents(r.Context())
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed retrieving active incidents", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Active incidents retrieved successfully", incidents)
}

func (h *OperationsHandler) HandleIncidentAction(w http.ResponseWriter, r *http.Request) {
	user := h.getUserFromRequest(r)
	if user == nil || user.Role != domain.RoleAdmin {
		response.Error(w, http.StatusForbidden, "Admin credentials required", nil)
		return
	}

	idStr := chi.URLParam(r, "id")
	incidentID, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid incident ID", err.Error())
		return
	}

	var req domain.IncidentActionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid request payload", err.Error())
		return
	}

	if err := h.operationsService.HandleIncidentAction(r.Context(), user.ID, user.FullName, incidentID, &req); err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed executing incident action", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, fmt.Sprintf("Incident action '%s' completed successfully", req.Action), map[string]interface{}{
		"incident_id": incidentID,
		"action":      req.Action,
	})
}

