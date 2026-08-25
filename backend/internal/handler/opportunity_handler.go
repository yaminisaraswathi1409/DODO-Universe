package handler

import (
	"encoding/json"
	"net/http"
	"strconv"
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
	Type           string                 `json:"type"` // NEED or OFFER
	Title          string                 `json:"title"`
	Description    string                 `json:"description"`
	WorkflowModel  string                 `json:"workflow_model"` // INSTANT, SCHEDULED, QUOTATION, RENTAL, AUCTION, MULTI_LAYER
	Lat            float64                `json:"lat"`
	Lng            float64                `json:"lng"`
	AddressText    string                 `json:"address_text"`
	RadiusKM       float64                `json:"radius_km"`
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
		Title:         p.Title,
		Description:   p.Description,
		WorkflowModel: wfModel,
		Lat:           p.Lat,
		Lng:           p.Lng,
		AddressText:   p.AddressText,
		RadiusKM:      p.RadiusKM,
		BudgetMin:     p.BudgetMin,
		BudgetMax:     p.BudgetMax,
		PriceUnit:     p.PriceUnit,
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
		response.Error(w, http.StatusInternalServerError, "Failed to create opportunity", err.Error())
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
	Status string `json:"status"`
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

	err = h.oppService.UpdateOpportunityStatus(r.Context(), id, domain.OpportunityStatus(p.Status))
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to update opportunity status", err.Error())
		return
	}

	opp, _ := h.oppService.GetOpportunity(r.Context(), id)
	response.JSON(w, http.StatusOK, "Opportunity status updated successfully", opp)
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
