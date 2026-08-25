package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/uop/backend/internal/domain"
	"github.com/uop/backend/internal/middleware"
	"github.com/uop/backend/internal/repository/postgres"
	"github.com/uop/backend/internal/service"
	"github.com/uop/backend/pkg/response"
)

type UserManagementHandler struct {
	userService *service.UserService
	userRepo    *postgres.UserRepository
}

func NewUserManagementHandler(userService *service.UserService, userRepo *postgres.UserRepository) *UserManagementHandler {
	return &UserManagementHandler{
		userService: userService,
		userRepo:    userRepo,
	}
}

type InviteUserPayload struct {
	FullName string `json:"full_name"`
	Phone    string `json:"phone"`
	Email    string `json:"email"`
	Role     string `json:"role"`
}

type SignupPayload struct {
	FullName string `json:"full_name"`
	Phone    string `json:"phone"`
	Email    string `json:"email"`
}

type VerifyOTPPayload struct {
	Phone   string `json:"phone"`
	OTPCode string `json:"otp_code"`
}

type RequestOTPPayload struct {
	Phone string `json:"phone"`
}

type CompleteProfilePayload struct {
	UserID        string  `json:"user_id"`
	Phone         string  `json:"phone"`
	AvatarURL     string  `json:"avatar_url"`
	Bio           string  `json:"bio"`
	AddressText   string  `json:"address_text"`
	AadhaarNumber string  `json:"aadhaar_number"`
	Lat           float64 `json:"lat"`
	Lng           float64 `json:"lng"`
}

type VerifyFacePayload struct {
	UserID              string `json:"user_id"`
	Phone               string `json:"phone"`
	FaceVerificationRef string `json:"face_verification_ref"`
}

// CompleteProfile updates profile details, photo, and Aadhaar number
func (h *UserManagementHandler) CompleteProfile(w http.ResponseWriter, r *http.Request) {
	var p CompleteProfilePayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid request JSON payload", err.Error())
		return
	}

	var targetUser *domain.User
	if p.UserID != "" {
		uid, parseErr := uuid.Parse(p.UserID)
		if parseErr == nil {
			targetUser, _ = h.userRepo.GetByID(r.Context(), uid)
		}
	}
	if targetUser == nil && p.Phone != "" {
		targetUser, _ = h.userRepo.GetByPhone(r.Context(), p.Phone)
	}
	if targetUser == nil {
		claims, ok := middleware.GetUserClaims(r.Context())
		if ok {
			targetUser, _ = h.userRepo.GetBySupabaseUID(r.Context(), claims.SupabaseUID)
		}
	}

	if targetUser == nil {
		response.Error(w, http.StatusBadRequest, "User profile not found", nil)
		return
	}

	updated, err := h.userService.CompleteProfile(r.Context(), targetUser.ID, p.AvatarURL, p.Bio, p.AddressText, p.AadhaarNumber, p.Lat, p.Lng)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Failed to complete profile", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Profile details completed successfully", updated)
}

// VerifyFace processes Face ID verification snapshot
func (h *UserManagementHandler) VerifyFace(w http.ResponseWriter, r *http.Request) {
	var p VerifyFacePayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid request JSON payload", err.Error())
		return
	}

	var targetUser *domain.User
	if p.UserID != "" {
		uid, parseErr := uuid.Parse(p.UserID)
		if parseErr == nil {
			targetUser, _ = h.userRepo.GetByID(r.Context(), uid)
		}
	}
	if targetUser == nil && p.Phone != "" {
		targetUser, _ = h.userRepo.GetByPhone(r.Context(), p.Phone)
	}
	if targetUser == nil {
		claims, ok := middleware.GetUserClaims(r.Context())
		if ok {
			targetUser, _ = h.userRepo.GetBySupabaseUID(r.Context(), claims.SupabaseUID)
		}
	}

	if targetUser == nil {
		response.Error(w, http.StatusBadRequest, "User profile not found", nil)
		return
	}

	updated, err := h.userService.VerifyFace(r.Context(), targetUser.ID, p.FaceVerificationRef)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Face verification failed", err.Error())
		return
	}

	msg := "Face verification successful."
	if updated != nil && updated.Status == domain.StatusActive {
		msg = "Face verification successful! User account is now ACTIVE."
	}

	response.JSON(w, http.StatusOK, msg, updated)
}

// Invite creates/invites a new pending user
func (h *UserManagementHandler) Invite(w http.ResponseWriter, r *http.Request) {
	var adminUser *domain.User
	claims, ok := middleware.GetUserClaims(r.Context())
	if ok {
		u, _ := h.userRepo.GetBySupabaseUID(r.Context(), claims.SupabaseUID)
		adminUser = u
	}

	var p InviteUserPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid request JSON payload", err.Error())
		return
	}

	role := domain.UserRole(p.Role)
	invited, err := h.userService.InviteUser(r.Context(), adminUser, p.FullName, p.Phone, p.Email, role)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Failed to invite user", err.Error())
		return
	}

	response.JSON(w, http.StatusCreated, "User invitation created and OTP dispatched successfully", invited)
}

// VerifyOTP verifies mobile number using OTP code
func (h *UserManagementHandler) VerifyOTP(w http.ResponseWriter, r *http.Request) {
	var p VerifyOTPPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid request JSON payload", err.Error())
		return
	}

	user, err := h.userService.VerifyOTP(r.Context(), p.Phone, p.OTPCode)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "OTP verification failed", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Mobile number verified successfully via OTP", user)
}

// GetOnboardingStatus retrieves current onboarding checklist status
func (h *UserManagementHandler) GetOnboardingStatus(w http.ResponseWriter, r *http.Request) {
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

	status, err := h.userService.GetOnboardingStatus(r.Context(), user.ID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to fetch onboarding status", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Onboarding status retrieved", status)
}

// RequestOTP resends/generates an OTP code for a user mobile number
func (h *UserManagementHandler) RequestOTP(w http.ResponseWriter, r *http.Request) {
	var p RequestOTPPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid request JSON payload", err.Error())
		return
	}

	user, err := h.userService.RequestOTP(r.Context(), p.Phone)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Failed to request OTP code", err.Error())
		return
	}

	if user == nil {
		response.Error(w, http.StatusInternalServerError, "User creation/update failed", nil)
		return
	}

	resData := map[string]interface{}{
		"user":         user,
		"dev_otp_code": user.OTPCode,
	}

	response.JSON(w, http.StatusOK, "OTP code generated and dispatched via user_otps", resData)
}

// Signup handles new user signup registration and OTP dispatch
func (h *UserManagementHandler) Signup(w http.ResponseWriter, r *http.Request) {
	var p SignupPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid request JSON payload", err.Error())
		return
	}

	if p.Phone == "" {
		response.Error(w, http.StatusBadRequest, "Mobile phone number is required for signup", nil)
		return
	}

	user, err := h.userService.SignupUser(r.Context(), p.FullName, p.Phone, p.Email)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Signup registration failed", err.Error())
		return
	}

	resData := map[string]interface{}{
		"user":         user,
		"dev_otp_code": user.OTPCode,
	}

	response.JSON(w, http.StatusCreated, "User account created with PENDING status. OTP dispatched successfully", resData)
}

// ListUsers retrieves all users in system for management dashboard
func (h *UserManagementHandler) ListUsers(w http.ResponseWriter, r *http.Request) {
	users, err := h.userService.ListUsers(r.Context())
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to list users", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Users list retrieved", users)
}

type AddUserServicePayload struct {
	UserID      string   `json:"user_id"`
	Phone       string   `json:"phone"`
	CategoryID  string   `json:"category_id"`
	AssetType   string   `json:"asset_type"` // e.g. ELECTRICIAN, PLUMBER, CLEANING, TRACTOR
	Title       string   `json:"title"`
	Description string   `json:"description"`
	HourlyRate  *float64 `json:"hourly_rate"`
	DailyRate   *float64 `json:"daily_rate"`
}

func (h *UserManagementHandler) AddUserService(w http.ResponseWriter, r *http.Request) {
	var p AddUserServicePayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid request JSON payload", err.Error())
		return
	}

	var targetUser *domain.User
	if p.UserID != "" {
		uid, parseErr := uuid.Parse(p.UserID)
		if parseErr == nil {
			targetUser, _ = h.userRepo.GetByID(r.Context(), uid)
		}
		if targetUser == nil {
			targetUser, _ = h.userRepo.GetBySupabaseUID(r.Context(), p.UserID)
		}
	}
	if targetUser == nil && p.Phone != "" {
		targetUser, _ = h.userRepo.GetByPhone(r.Context(), p.Phone)
	}
	if targetUser == nil {
		claims, ok := middleware.GetUserClaims(r.Context())
		if ok {
			targetUser, _ = h.userRepo.GetBySupabaseUID(r.Context(), claims.SupabaseUID)
		}
	}

	if targetUser == nil {
		response.Error(w, http.StatusBadRequest, "User profile not found", nil)
		return
	}

	if p.Title == "" {
		p.Title = p.AssetType
	}

	var catID *uuid.UUID
	if p.CategoryID != "" {
		cid, err := uuid.Parse(p.CategoryID)
		if err == nil {
			catID = &cid
		}
	}

	service, err := h.userService.AddUserSkillAsset(r.Context(), targetUser.ID, catID, p.AssetType, p.Title, p.Description, p.HourlyRate, p.DailyRate)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to add service request", err.Error())
		return
	}

	response.JSON(w, http.StatusCreated, "Service request created in PENDING_APPROVAL status", service)
}

type SubmitServiceDocumentsPayload struct {
	AssetID   string          `json:"asset_id"`
	UserID    string          `json:"user_id"`
	Phone     string          `json:"phone"`
	Documents json.RawMessage `json:"documents"`
}

func (h *UserManagementHandler) SubmitServiceDocuments(w http.ResponseWriter, r *http.Request) {
	var p SubmitServiceDocumentsPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid request JSON payload", err.Error())
		return
	}

	assetID, err := uuid.Parse(p.AssetID)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid asset_id UUID format", nil)
		return
	}

	var targetUser *domain.User
	if p.UserID != "" {
		uid, parseErr := uuid.Parse(p.UserID)
		if parseErr == nil {
			targetUser, _ = h.userRepo.GetByID(r.Context(), uid)
		}
		if targetUser == nil {
			targetUser, _ = h.userRepo.GetBySupabaseUID(r.Context(), p.UserID)
		}
	}
	if targetUser == nil && p.Phone != "" {
		targetUser, _ = h.userRepo.GetByPhone(r.Context(), p.Phone)
	}
	if targetUser == nil {
		claims, ok := middleware.GetUserClaims(r.Context())
		if ok {
			targetUser, _ = h.userRepo.GetBySupabaseUID(r.Context(), claims.SupabaseUID)
		}
	}

	if targetUser == nil {
		response.Error(w, http.StatusBadRequest, "User profile not found", nil)
		return
	}

	docStr := string(p.Documents)
	if docStr == "" || docStr == "null" {
		docStr = "{}"
	}

	updated, err := h.userService.SubmitSkillAssetDocuments(r.Context(), assetID, targetUser.ID, docStr)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to submit service documents", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Service documents submitted successfully and moved to UNDER_REVIEW", updated)
}

func (h *UserManagementHandler) ListServiceRequests(w http.ResponseWriter, r *http.Request) {
	status := r.URL.Query().Get("status")
	requests, err := h.userService.ListAllUserSkillAssetRequests(r.Context(), status)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to list service requests", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Service requests retrieved", requests)
}

type AdminReviewDocumentsPayload struct {
	Approve         bool   `json:"approve"`
	RejectionReason string `json:"rejection_reason"`
}

func (h *UserManagementHandler) AdminApproveServiceRequest(w http.ResponseWriter, r *http.Request) {
	assetIDStr := chi.URLParam(r, "id")
	assetID, err := uuid.Parse(assetIDStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid asset ID", nil)
		return
	}

	updated, err := h.userService.AdminApproveServiceRequest(r.Context(), assetID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to approve service request", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Service request approved. Status moved to DOCUMENTS_PENDING", updated)
}

func (h *UserManagementHandler) AdminReviewServiceDocuments(w http.ResponseWriter, r *http.Request) {
	assetIDStr := chi.URLParam(r, "id")
	assetID, err := uuid.Parse(assetIDStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid asset ID", nil)
		return
	}

	var p AdminReviewDocumentsPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid request payload", err.Error())
		return
	}

	updated, err := h.userService.AdminReviewDocuments(r.Context(), assetID, p.Approve, p.RejectionReason)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to review service documents", err.Error())
		return
	}

	msg := "Service documents approved! Service is now ACTIVE."
	if !p.Approve {
		msg = "Service documents rejected."
	}

	response.JSON(w, http.StatusOK, msg, updated)
}

func (h *UserManagementHandler) GetUserServices(w http.ResponseWriter, r *http.Request) {
	userIDStr := r.URL.Query().Get("user_id")
	phoneStr := r.URL.Query().Get("phone")

	var targetUser *domain.User
	if userIDStr != "" {
		uid, parseErr := uuid.Parse(userIDStr)
		if parseErr == nil {
			targetUser, _ = h.userRepo.GetByID(r.Context(), uid)
		}
	}
	if targetUser == nil && phoneStr != "" {
		targetUser, _ = h.userRepo.GetByPhone(r.Context(), phoneStr)
	}

	if targetUser == nil {
		response.JSON(w, http.StatusOK, "User services retrieved", []domain.UserSkillAsset{})
		return
	}

	services, err := h.userService.GetUserSkillsAssets(r.Context(), targetUser.ID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to fetch user services", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "User services retrieved successfully", services)
}


type UpdateUserStatusPayload struct {
	UserID string `json:"user_id"`
	Phone  string `json:"phone"`
	Status string `json:"status"` // e.g. ACTIVE, SUSPENDED, DEACTIVATED
}

func (h *UserManagementHandler) UpdateStatus(w http.ResponseWriter, r *http.Request) {
	var p UpdateUserStatusPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid request JSON payload", err.Error())
		return
	}

	var targetUser *domain.User
	if p.UserID != "" {
		uid, parseErr := uuid.Parse(p.UserID)
		if parseErr == nil {
			targetUser, _ = h.userRepo.GetByID(r.Context(), uid)
		}
	}
	if targetUser == nil && p.Phone != "" {
		targetUser, _ = h.userRepo.GetByPhone(r.Context(), p.Phone)
	}

	if targetUser == nil {
		response.Error(w, http.StatusBadRequest, "User not found", nil)
		return
	}

	updated, err := h.userService.UpdateUserStatus(r.Context(), targetUser.ID, domain.UserStatus(p.Status))
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to update user status", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "User status updated successfully", updated)
}

// User Saved Address Handlers

func (h *UserManagementHandler) resolveUser(ctx context.Context, input string) (*domain.User, error) {
	if input == "" {
		return nil, fmt.Errorf("user identifier is empty")
	}
	if uid, err := uuid.Parse(input); err == nil {
		if u, err := h.userRepo.GetByID(ctx, uid); err == nil && u != nil {
			return u, nil
		}
	}
	if u, err := h.userRepo.GetByPhone(ctx, input); err == nil && u != nil {
		return u, nil
	}
	if u, err := h.userRepo.GetBySupabaseUID(ctx, input); err == nil && u != nil {
		return u, nil
	}
	return nil, fmt.Errorf("user not found for identifier: %s", input)
}

func (h *UserManagementHandler) GetUserAddresses(w http.ResponseWriter, r *http.Request) {
	userIDStr := chi.URLParam(r, "userId")
	if userIDStr == "" {
		userIDStr = r.URL.Query().Get("user_id")
	}

	if userIDStr == "" {
		response.Error(w, http.StatusBadRequest, "userId parameter is required", nil)
		return
	}

	targetUser, err := h.resolveUser(r.Context(), userIDStr)
	if err != nil || targetUser == nil {
		response.Error(w, http.StatusNotFound, "User not found", nil)
		return
	}

	addresses, err := h.userService.GetUserAddresses(r.Context(), targetUser.ID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to retrieve saved addresses", err.Error())
		return
	}

	if addresses == nil {
		addresses = []*domain.UserAddress{}
	}

	response.JSON(w, http.StatusOK, "Saved addresses retrieved successfully", addresses)
}

func (h *UserManagementHandler) CreateUserAddress(w http.ResponseWriter, r *http.Request) {
	userIDStr := chi.URLParam(r, "userId")
	if userIDStr == "" {
		userIDStr = r.URL.Query().Get("user_id")
	}

	var addr domain.UserAddress
	if err := json.NewDecoder(r.Body).Decode(&addr); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid request JSON payload", err.Error())
		return
	}

	if addr.UserID == uuid.Nil && userIDStr != "" {
		if u, err := h.resolveUser(r.Context(), userIDStr); err == nil && u != nil {
			addr.UserID = u.ID
		}
	}

	if addr.UserID == uuid.Nil {
		response.Error(w, http.StatusBadRequest, "user_id is required", nil)
		return
	}

	created, err := h.userService.CreateUserAddress(r.Context(), &addr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Failed to create saved address", err.Error())
		return
	}

	response.JSON(w, http.StatusCreated, "Address saved successfully", created)
}

func (h *UserManagementHandler) UpdateUserAddress(w http.ResponseWriter, r *http.Request) {
	userIDStr := chi.URLParam(r, "userId")
	addressIDStr := chi.URLParam(r, "addressId")

	var addr domain.UserAddress
	if err := json.NewDecoder(r.Body).Decode(&addr); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid request JSON payload", err.Error())
		return
	}

	if addressIDStr != "" {
		aid, parseErr := uuid.Parse(addressIDStr)
		if parseErr == nil {
			addr.ID = aid
		}
	}

	if addr.UserID == uuid.Nil && userIDStr != "" {
		if u, err := h.resolveUser(r.Context(), userIDStr); err == nil && u != nil {
			addr.UserID = u.ID
		}
	}

	if addr.ID == uuid.Nil || addr.UserID == uuid.Nil {
		response.Error(w, http.StatusBadRequest, "addressId and userId are required", nil)
		return
	}

	updated, err := h.userService.UpdateUserAddress(r.Context(), &addr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Failed to update saved address", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Address updated successfully", updated)
}

func (h *UserManagementHandler) SetDefaultUserAddress(w http.ResponseWriter, r *http.Request) {
	userIDStr := chi.URLParam(r, "userId")
	addressIDStr := chi.URLParam(r, "addressId")

	targetUser, err := h.resolveUser(r.Context(), userIDStr)
	aid, parseErr := uuid.Parse(addressIDStr)
	if err != nil || parseErr != nil || targetUser == nil {
		response.Error(w, http.StatusBadRequest, "Invalid userId or addressId format", nil)
		return
	}

	updated, err := h.userService.SetDefaultAddress(r.Context(), targetUser.ID, aid)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to set default address", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Default address set successfully", updated)
}

func (h *UserManagementHandler) DeleteUserAddress(w http.ResponseWriter, r *http.Request) {
	userIDStr := chi.URLParam(r, "userId")
	addressIDStr := chi.URLParam(r, "addressId")

	targetUser, err := h.resolveUser(r.Context(), userIDStr)
	aid, parseErr := uuid.Parse(addressIDStr)
	if err != nil || parseErr != nil || targetUser == nil {
		response.Error(w, http.StatusBadRequest, "Invalid userId or addressId format", nil)
		return
	}

	if err := h.userService.DeleteUserAddress(r.Context(), targetUser.ID, aid); err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to delete saved address", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Saved address deleted successfully", map[string]string{"id": addressIDStr})
}



