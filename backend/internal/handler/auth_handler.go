package handler

import (
	"encoding/json"
	"net/http"

	"github.com/uop/backend/internal/authz"
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

	// Accounts created through the OTP flow already exist and must not be
	// rewritten from request data (this would let a caller change their phone
	// number without OTP verification). Return the stored profile unchanged.
	if existing, aerr := authz.CurrentUser(r); aerr == nil && existing != nil {
		existing.OTPCode = ""
		response.JSON(w, http.StatusOK, "User profile already synchronized", existing)
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

// meResponse is the user profile plus the explicit driver identity (if any).
// The user fields stay at the top level, so existing clients are unaffected.
type meResponse struct {
	*domain.User
	// DriverProfile is null unless the user has an explicit driver_profiles record.
	// Clients must use driver_profile.status == "APPROVED" (never an asset type)
	// to decide whether to show driver features.
	DriverProfile *domain.DriverProfile `json:"driver_profile"`
}

// GetMe returns the authenticated user's profile.
func (h *AuthHandler) GetMe(w http.ResponseWriter, r *http.Request) {
	if _, ok := middleware.GetUserClaims(r.Context()); !ok {
		response.Error(w, http.StatusUnauthorized, "Unauthorized", nil)
		return
	}

	user, err := authz.CurrentUser(r)
	if err != nil {
		response.Error(w, http.StatusNotFound, "User profile not found. Please sync profile.", nil)
		return
	}
	user.OTPCode = ""

	profile, perr := h.userRepo.GetDriverProfile(r.Context(), user.ID)
	if perr != nil {
		profile = nil
	}

	response.JSON(w, http.StatusOK, "User profile fetched successfully", meResponse{User: user, DriverProfile: profile})
}
