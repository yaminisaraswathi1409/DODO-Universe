package handler

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/uop/backend/internal/domain"
	"github.com/uop/backend/internal/middleware"
	"github.com/uop/backend/internal/repository/postgres"
	"github.com/uop/backend/internal/service"
	"github.com/uop/backend/pkg/response"
)

type OpportunityHandler struct {
	oppService *service.OpportunityService
	userRepo   *postgres.UserRepository
}

func NewOpportunityHandler(oppService *service.OpportunityService, userRepo *postgres.UserRepository) *OpportunityHandler {
	return &OpportunityHandler{
		oppService: oppService,
		userRepo:   userRepo,
	}
}

type CreateOpportunityPayload struct {
	UserID         *string                `json:"user_id"`
	CategoryID     *string                `json:"category_id"`
	TargetVendorID *string                `json:"target_vendor_id"`
	CatalogItemID  *string                `json:"catalog_item_id"`
	Type           string                 `json:"type"`       // NEED or OFFER
	OrderMode      string                 `json:"order_mode"` // CATALOG_ORDER or GENERAL_BROADCAST
	Title          string                 `json:"title"`
	Description    string                 `json:"description"`
	WorkflowModel  string                 `json:"workflow_model"` // INSTANT, SCHEDULED, QUOTATION, RENTAL, AUCTION, MULTI_LAYER
	Lat            float64                `json:"lat"`
	Lng            float64                `json:"lng"`
	AddressText    string                 `json:"address_text"`
	RadiusKM       float64                `json:"radius_km"`
	Quantity       *float64               `json:"quantity"`
	UnitPrice      *float64               `json:"unit_price"`
	TotalPrice     *float64               `json:"total_price"`
	BudgetMin      *float64               `json:"budget_min"`
	BudgetMax      *float64               `json:"budget_max"`
	PriceUnit      string                 `json:"price_unit"`
	ScheduledStart *string                `json:"scheduled_start"`
	ScheduledEnd   *string                `json:"scheduled_end"`
	Metadata       map[string]interface{} `json:"metadata"`
}

func (h *OpportunityHandler) Create(w http.ResponseWriter, r *http.Request) {
	var p CreateOpportunityPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid request JSON payload", err.Error())
		return
	}

	if p.Title == "" {
		p.Title = "Service Request"
	}
	if p.Description == "" {
		p.Description = "Service Request Details"
	}

	var user *domain.User
	claims, ok := middleware.GetUserClaims(r.Context())
	if ok && claims.SupabaseUID != "" {
		user, _ = h.userRepo.GetBySupabaseUID(r.Context(), claims.SupabaseUID)
		if user == nil {
			uid, parseErr := uuid.Parse(claims.SupabaseUID)
			if parseErr == nil {
				user, _ = h.userRepo.GetByID(r.Context(), uid)
			}
		}
	}
	if user == nil && p.UserID != nil && *p.UserID != "" {
		uid, err := uuid.Parse(*p.UserID)
		if err == nil {
			user, _ = h.userRepo.GetByID(r.Context(), uid)
		}
	}
	if user == nil {
		users, err := h.userRepo.ListUsers(r.Context())
		if err == nil && len(users) > 0 {
			user = users[0]
		}
	}
	if user == nil {
		response.Error(w, http.StatusBadRequest, "User profile not found", nil)
		return
	}

	oppType := domain.OpportunityType(p.Type)
	if oppType != domain.TypeNeed && oppType != domain.TypeOffer {
		oppType = domain.TypeNeed
	}

	wfModel := domain.WorkflowModel(p.WorkflowModel)
	if wfModel == "" {
		wfModel = domain.WorkflowInstant
	}

	opp := &domain.Opportunity{
		UserID:        user.ID,
		Type:          oppType,
		OrderMode:     domain.OrderMode(p.OrderMode),
		Title:         p.Title,
		Description:   p.Description,
		WorkflowModel: wfModel,
		Lat:           p.Lat,
		Lng:           p.Lng,
		AddressText:   p.AddressText,
		RadiusKM:      p.RadiusKM,
		Quantity:      p.Quantity,
		UnitPrice:     p.UnitPrice,
		TotalPrice:    p.TotalPrice,
		BudgetMin:     p.BudgetMin,
		BudgetMax:     p.BudgetMax,
		PriceUnit:     p.PriceUnit,
	}

	if opp.OrderMode == "" {
		if p.TargetVendorID != nil && *p.TargetVendorID != "" {
			opp.OrderMode = domain.OrderModeCatalog
		} else {
			opp.OrderMode = domain.OrderModeGeneral
		}
	}

	if p.TargetVendorID != nil && *p.TargetVendorID != "" {
		tvID, err := uuid.Parse(*p.TargetVendorID)
		if err == nil {
			opp.TargetVendorID = &tvID
		}
	}

	if p.CatalogItemID != nil && *p.CatalogItemID != "" {
		ciID, err := uuid.Parse(*p.CatalogItemID)
		if err == nil {
			opp.CatalogItemID = &ciID
		}
	}

	if p.CategoryID != nil && *p.CategoryID != "" {
		cid, err := uuid.Parse(*p.CategoryID)
		if err == nil {
			opp.CategoryID = &cid
		}
	}

	if p.ScheduledStart != nil && *p.ScheduledStart != "" {
		t, err := time.Parse(time.RFC3339, *p.ScheduledStart)
		if err == nil {
			opp.ScheduledStart = &t
		}
	}

	if p.Metadata != nil {
		metaBytes, err := json.Marshal(p.Metadata)
		if err == nil {
			opp.Metadata = metaBytes
		}
	}

	created, err := h.oppService.CreateOpportunity(r.Context(), opp)
	if err != nil {
		status := http.StatusBadRequest
		if strings.Contains(err.Error(), "failed to get") || strings.Contains(err.Error(), "failed to create") || strings.Contains(err.Error(), "database") {
			status = http.StatusInternalServerError
		}
		response.Error(w, status, err.Error(), err.Error())
		return
	}

	response.JSON(w, http.StatusCreated, "Opportunity created successfully", created)
}

func (h *OpportunityHandler) GetByID(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid opportunity ID format", nil)
		return
	}

	opp, err := h.oppService.GetOpportunity(r.Context(), id)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to retrieve opportunity", err.Error())
		return
	}

	if opp == nil {
		response.Error(w, http.StatusNotFound, "Opportunity not found", nil)
		return
	}

	response.JSON(w, http.StatusOK, "Opportunity retrieved successfully", opp)
}

func (h *OpportunityHandler) FindMatches(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid opportunity ID format", nil)
		return
	}

	matches, err := h.oppService.MatchOpportunity(r.Context(), id)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to execute spatial PostGIS matching engine", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Matches retrieved successfully using PostGIS spatial engine", matches)
}

func (h *OpportunityHandler) CreateChainChild(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserClaims(r.Context())
	if !ok {
		response.Error(w, http.StatusUnauthorized, "Unauthorized", nil)
		return
	}

	user, err := h.userRepo.GetBySupabaseUID(r.Context(), claims.SupabaseUID)
	if err != nil || user == nil {
		response.Error(w, http.StatusBadRequest, "User profile not found", nil)
		return
	}

	parentIDStr := chi.URLParam(r, "id")
	parentID, err := uuid.Parse(parentIDStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid parent opportunity ID format", nil)
		return
	}

	var p CreateOpportunityPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid request JSON payload", err.Error())
		return
	}

	childOpp := &domain.Opportunity{
		Title:       p.Title,
		Description: p.Description,
		Type:        domain.TypeNeed,
		BudgetMin:   p.BudgetMin,
		BudgetMax:   p.BudgetMax,
	}

	child, err := h.oppService.CreateChildOpportunity(r.Context(), parentID, user.ID, childOpp)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to create multi-layer chained opportunity", err.Error())
		return
	}

	response.JSON(w, http.StatusCreated, "Multi-layer chained child opportunity created successfully", child)
}

func (h *OpportunityHandler) ListPublic(w http.ResponseWriter, r *http.Request) {
	categorySlug := r.URL.Query().Get("category")
	oppType := r.URL.Query().Get("type")
	pageStr := r.URL.Query().Get("page")
	limitStr := r.URL.Query().Get("limit")

	page, _ := strconv.Atoi(pageStr)
	limit, _ := strconv.Atoi(limitStr)

	list, total, err := h.oppService.ListPublicOpportunities(r.Context(), categorySlug, oppType, page, limit)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to query public opportunities", err.Error())
		return
	}

	meta := map[string]interface{}{
		"total": total,
		"page":  page,
		"limit": limit,
	}

	response.JSON(w, http.StatusOK, "Public opportunities list retrieved", list, meta)
}

type UpdateOpportunityStatusPayload struct {
	Status string  `json:"status"`
	UserID *string `json:"user_id,omitempty"`
	Phone  *string `json:"phone,omitempty"`
}

func (h *OpportunityHandler) UpdateStatus(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid opportunity ID format", nil)
		return
	}

	var p UpdateOpportunityStatusPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil && r.ContentLength > 0 {
		response.Error(w, http.StatusBadRequest, "Invalid JSON payload", err.Error())
		return
	}

	if p.Status == "" {
		p.Status = "ACCEPTED"
	}

	var providerID uuid.UUID
	if p.UserID != nil && *p.UserID != "" {
		providerID, _ = uuid.Parse(*p.UserID)
	} else if p.Phone != nil && *p.Phone != "" {
		u, _ := h.userRepo.GetByPhone(r.Context(), *p.Phone)
		if u != nil {
			providerID = u.ID
		}
	}

	err = h.oppService.UpdateOpportunityStatusWithProvider(r.Context(), id, domain.OpportunityStatus(p.Status), providerID)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error(), nil)
		return
	}

	opp, _ := h.oppService.GetOpportunity(r.Context(), id)
	response.JSON(w, http.StatusOK, "Opportunity status updated successfully", opp)
}

func (h *OpportunityHandler) GetCommuterMatches(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid opportunity ID format", nil)
		return
	}

	matches, err := h.oppService.FindCommuterRouteMatches(r.Context(), id)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to find commuter route matches", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Commuter route matches retrieved successfully", matches)
}

func (h *OpportunityHandler) GetStatusHistory(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid opportunity ID format", nil)
		return
	}

	history, err := h.oppService.GetStatusHistory(r.Context(), id)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to fetch status history", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Opportunity status history retrieved successfully", history)
}

func (h *OpportunityHandler) getUserFromRequest(r *http.Request) *domain.User {
	claims, ok := middleware.GetUserClaims(r.Context())
	if ok && claims.SupabaseUID != "" {
		u, _ := h.userRepo.GetBySupabaseUID(r.Context(), claims.SupabaseUID)
		if u != nil {
			return u
		}
	}
	userParam := r.URL.Query().Get("user_id")
	if userParam == "" {
		userParam = r.URL.Query().Get("phone")
	}
	if userParam != "" {
		uid, err := uuid.Parse(userParam)
		if err == nil {
			u, _ := h.userRepo.GetByID(r.Context(), uid)
			if u != nil {
				return u
			}
		}
		u, _ := h.userRepo.GetByPhone(r.Context(), userParam)
		if u != nil {
			return u
		}
	}
	users, err := h.userRepo.ListUsers(r.Context())
	if err == nil && len(users) > 0 {
		return users[0]
	}
	return nil
}

func (h *OpportunityHandler) ListMatchingRequests(w http.ResponseWriter, r *http.Request) {
	user := h.getUserFromRequest(r)
	if user == nil {
		response.Error(w, http.StatusBadRequest, "User profile not found", nil)
		return
	}

	requests, err := h.oppService.GetMatchingRequestsForProvider(r.Context(), user.ID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to fetch provider matching requests", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Matching requests retrieved successfully", requests)
}

func (h *OpportunityHandler) ListAcceptedOrders(w http.ResponseWriter, r *http.Request) {
	user := h.getUserFromRequest(r)
	if user == nil {
		response.Error(w, http.StatusBadRequest, "User profile not found", nil)
		return
	}

	orders, err := h.oppService.GetAcceptedOrdersForProvider(r.Context(), user.ID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to fetch provider accepted orders", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Accepted orders retrieved successfully", orders)
}

func (h *OpportunityHandler) ListCustomerOrders(w http.ResponseWriter, r *http.Request) {
	user := h.getUserFromRequest(r)
	if user == nil {
		response.Error(w, http.StatusBadRequest, "User profile not found", nil)
		return
	}

	orders, err := h.oppService.GetUserOpportunities(r.Context(), user.ID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to fetch customer orders", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Customer orders retrieved successfully", orders)
}

func (h *OpportunityHandler) GetNotifications(w http.ResponseWriter, r *http.Request) {
	user := h.getUserFromRequest(r)
	if user == nil {
		response.Error(w, http.StatusBadRequest, "User profile not found", nil)
		return
	}

	notifs, err := h.oppService.GetUserNotifications(r.Context(), user.ID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to fetch notifications", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Notifications retrieved successfully", notifs)
}

func (h *OpportunityHandler) MarkNotificationAsRead(w http.ResponseWriter, r *http.Request) {
	user := h.getUserFromRequest(r)
	if user == nil {
		response.Error(w, http.StatusBadRequest, "User profile not found", nil)
		return
	}

	idStr := chi.URLParam(r, "id")
	notifID, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid notification ID", err.Error())
		return
	}

	if err := h.oppService.MarkNotificationAsRead(r.Context(), notifID, user.ID); err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to mark notification as read", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Notification marked as read", map[string]interface{}{
		"id":      notifID,
		"is_read": true,
	})
}

func (h *OpportunityHandler) MarkAllNotificationsAsRead(w http.ResponseWriter, r *http.Request) {
	user := h.getUserFromRequest(r)
	if user == nil {
		response.Error(w, http.StatusBadRequest, "User profile not found", nil)
		return
	}

	if err := h.oppService.MarkAllNotificationsAsRead(r.Context(), user.ID); err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to mark all notifications as read", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "All notifications marked as read", map[string]interface{}{
		"user_id": user.ID,
		"success": true,
	})
}

func (h *OpportunityHandler) GetUnreadNotificationCount(w http.ResponseWriter, r *http.Request) {
	user := h.getUserFromRequest(r)
	if user == nil {
		response.Error(w, http.StatusBadRequest, "User profile not found", nil)
		return
	}

	count, err := h.oppService.GetUnreadNotificationCount(r.Context(), user.ID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to fetch unread notification count", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Unread notification count retrieved", map[string]interface{}{
		"unread_count": count,
	})
}
