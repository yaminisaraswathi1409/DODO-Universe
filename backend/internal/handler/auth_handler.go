package handler

import (
	"encoding/json"
	"net/http"

	"github.com/uop/backend/internal/domain"
	"github.com/uop/backend/internal/middleware"
	"github.com/uop/backend/internal/repository/postgres"
	"github.com/uop/backend/pkg/response"
)

type AuthHandler struct {
	userRepo *postgres.UserRepository
}

func NewAuthHandler(userRepo *postgres.UserRepository) *AuthHandler {
	return &AuthHandler{userRepo: userRepo}
}

type SyncUserRequest struct {
	FullName    string  `json:"full_name"`
	Phone       string  `json:"phone"`
	AvatarURL   string  `json:"avatar_url"`
	Bio         string  `json:"bio"`
	Lat         float64 `json:"lat"`
	Lng         float64 `json:"lng"`
	AddressText string  `json:"address_text"`
}

// SyncProfile syncs Supabase authenticated user into backend PostgreSQL DB
func (h *AuthHandler) SyncProfile(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserClaims(r.Context())
	if !ok {
		response.Error(w, http.StatusUnauthorized, "Unauthorized", nil)
		return
	}

	var req SyncUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil && r.ContentLength > 0 {
		response.Error(w, http.StatusBadRequest, "Invalid request body", err.Error())
		return
	}

	u := &domain.User{
		SupabaseUID: claims.SupabaseUID,
		Email:       claims.Email,
		Phone:       req.Phone,
		FullName:    req.FullName,
		AvatarURL:   req.AvatarURL,
		Bio:         req.Bio,
		Lat:         req.Lat,
		Lng:         req.Lng,
		AddressText: req.AddressText,
	}
	if u.FullName == "" {
		u.FullName = "UOP User"
	}

	saved, err := h.userRepo.UpsertUser(r.Context(), u)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to sync user profile", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "User profile synchronized successfully", saved)
}

// GetMe returns current authenticated user profile
func (h *AuthHandler) GetMe(w http.ResponseWriter, r *http.Request) {
	claims, ok := middleware.GetUserClaims(r.Context())
	if !ok {
		response.Error(w, http.StatusUnauthorized, "Unauthorized", nil)
		return
	}

	user, err := h.userRepo.GetBySupabaseUID(r.Context(), claims.SupabaseUID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to fetch user profile", err.Error())
		return
	}

	if user == nil {
		response.Error(w, http.StatusNotFound, "User profile not found. Please sync profile.", nil)
		return
	}

	response.JSON(w, http.StatusOK, "User profile fetched successfully", user)
}
