package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/uop/backend/internal/auth"
	"github.com/uop/backend/internal/authz"
	"github.com/uop/backend/internal/domain"
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

// CompleteProfilePayload / VerifyFacePayload still carry user_id/phone for
// older clients, but they are IGNORED for identity: the target is always the
// authenticated caller. A different user_id is rejected.
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

// clientIP returns the peer address used for IP based rate limiting.
func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// requireSelf resolves the authenticated caller and rejects an explicitly
// supplied user_id that refers to somebody else.
func requireSelf(w http.ResponseWriter, r *http.Request, claimedUserID string) (*domain.User, bool) {
	caller, err := authz.CurrentUser(r)
	if authz.Write(w, err) {
		return nil, false
	}
	if claimedUserID != "" {
		if id, perr := uuid.Parse(claimedUserID); perr != nil || id != caller.ID {
			response.Error(w, http.StatusForbidden, "You can only perform this action for your own account", nil)
			return nil, false
		}
	}
	return caller, true
}

// writeOTPError maps OTP/auth flow errors to HTTP responses.
func writeOTPError(w http.ResponseWriter, message string, err error) {
	var limited *service.OTPRateLimitError
	switch {
	case errors.As(err, &limited):
		w.Header().Set("Retry-After", strconv.Itoa(int(limited.RetryAfter.Seconds())+1))
		response.Error(w, http.StatusTooManyRequests, message, limited.Error())
	case errors.Is(err, postgres.ErrOTPLocked):
		response.Error(w, http.StatusTooManyRequests, message, err.Error())
	case errors.Is(err, postgres.ErrInvalidOTP):
		response.Error(w, http.StatusBadRequest, message, err.Error())
	case errors.Is(err, service.ErrOTPUnavailable):
		response.Error(w, http.StatusServiceUnavailable, message, "SMS delivery is currently unavailable")
	default:
		response.Error(w, http.StatusBadRequest, message, err.Error())
	}
}

// CompleteProfile updates the caller's profile details, photo and Aadhaar number.
func (h *UserManagementHandler) CompleteProfile(w http.ResponseWriter, r *http.Request) {
	var p CompleteProfilePayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid request JSON payload", err.Error())
		return
	}
	caller, ok := requireSelf(w, r, p.UserID)
	if !ok {
		return
	}

	updated, err := h.userService.CompleteProfile(r.Context(), caller.ID, p.AvatarURL, p.Bio, p.AddressText, p.AadhaarNumber, p.Lat, p.Lng)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Failed to complete profile", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Profile details completed successfully", updated)
}

// VerifyFace processes the caller's Face ID verification snapshot.
func (h *UserManagementHandler) VerifyFace(w http.ResponseWriter, r *http.Request) {
	var p VerifyFacePayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid request JSON payload", err.Error())
		return
	}
	caller, ok := requireSelf(w, r, p.UserID)
	if !ok {
		return
	}

	updated, err := h.userService.VerifyFace(r.Context(), caller.ID, p.FaceVerificationRef)
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

// Invite creates/invites a new pending user. Admins may invite USER accounts;
// only a SUPER_ADMIN may mint ADMIN or SUPER_ADMIN accounts.
func (h *UserManagementHandler) Invite(w http.ResponseWriter, r *http.Request) {
	admin, err := authz.RequireAdmin(r)
	if authz.Write(w, err) {
		return
	}

	var p InviteUserPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid request JSON payload", err.Error())
		return
	}

	role := domain.UserRole(p.Role)
	if role == "" {
		role = domain.RoleUser
	}
	if !admin.CanGrantRole(role) {
		response.Error(w, http.StatusForbidden, "Only a SUPER_ADMIN can grant administrative roles", nil)
		return
	}

	flow := h.userService.OTP()
	if flow == nil {
		response.Error(w, http.StatusServiceUnavailable, "Authentication is not configured", nil)
		return
	}
	invited, err := flow.Invite(r.Context(), admin, p.FullName, p.Phone, p.Email, role)
	if err != nil {
		writeOTPError(w, "Failed to invite user", err)
		return
	}
	invited.OTPCode = ""

	response.JSON(w, http.StatusCreated, "User invitation created and OTP dispatched successfully", invited)
}

// VerifyOTP verifies a mobile number using an OTP code and, on success, issues
// the signed access and refresh tokens that every later request must carry.
func (h *UserManagementHandler) VerifyOTP(w http.ResponseWriter, r *http.Request) {
	var p VerifyOTPPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid request JSON payload", err.Error())
		return
	}
	flow := h.userService.OTP()
	if flow == nil {
		response.Error(w, http.StatusServiceUnavailable, "Authentication is not configured", nil)
		return
	}

	result, err := flow.Verify(r.Context(), p.Phone, p.OTPCode, clientIP(r))
	if err != nil {
		writeOTPError(w, "OTP verification failed", err)
		return
	}
	result.User.OTPCode = ""

	response.JSON(w, http.StatusOK, "Mobile number verified successfully via OTP", sessionResponse(result.User, result.Tokens))
}

func sessionResponse(user *domain.User, tokens *auth.TokenPair) map[string]interface{} {
	return map[string]interface{}{
		"user":               user,
		"id":                 user.ID.String(),
		"user_id":            user.ID.String(),
		"supabase_uid":       user.SupabaseUID,
		"phone":              user.Phone,
		"full_name":          user.FullName,
		"email":              user.Email,
		"role":               user.Role,
		"status":             user.Status,
		"mobile_verified":    user.MobileVerified,
		"is_verified":        user.IsVerified,
		"access_token":       tokens.AccessToken,
		"refresh_token":      tokens.RefreshToken,
		"token_type":         tokens.TokenType,
		"expires_in":         tokens.ExpiresIn,
		"refresh_expires_in": tokens.RefreshExpiresIn,
	}
}

type RefreshPayload struct {
	RefreshToken string `json:"refresh_token"`
}

// RefreshToken exchanges a valid refresh token for a new token pair.
func (h *UserManagementHandler) RefreshToken(w http.ResponseWriter, r *http.Request) {
	var p RefreshPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil || p.RefreshToken == "" {
		response.Error(w, http.StatusBadRequest, "refresh_token is required", nil)
		return
	}
	flow := h.userService.OTP()
	if flow == nil {
		response.Error(w, http.StatusServiceUnavailable, "Authentication is not configured", nil)
		return
	}
	result, err := flow.Refresh(r.Context(), p.RefreshToken)
	switch {
	case errors.Is(err, service.ErrAccountBlocked):
		response.Error(w, http.StatusForbidden, "Account is suspended or deactivated", nil)
		return
	case err != nil:
		response.Error(w, http.StatusUnauthorized, "Invalid or expired refresh token", nil)
		return
	}
	result.User.OTPCode = ""

	response.JSON(w, http.StatusOK, "Token refreshed", sessionResponse(result.User, result.Tokens))
}

// GetOnboardingStatus retrieves the caller's onboarding checklist status.
func (h *UserManagementHandler) GetOnboardingStatus(w http.ResponseWriter, r *http.Request) {
	caller, err := authz.CurrentUser(r)
	if authz.Write(w, err) {
		return
	}

	status, err := h.userService.GetOnboardingStatus(r.Context(), caller.ID)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to fetch onboarding status", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Onboarding status retrieved", status)
}

// otpIssueResponse is the minimal public response for request-otp / signup.
// It deliberately contains no user profile data and NEVER returns the OTP:
// the endpoints are unauthenticated and must not reveal codes or registration state.
// In development, the OTP is printed directly to the server terminal.
func otpIssueResponse(_ *service.OTPIssueResult, ttlSeconds int) map[string]interface{} {
	return map[string]interface{}{
		"otp_sent":   true,
		"expires_in": ttlSeconds,
	}
}

// RequestOTP generates and sends an OTP code to a mobile number.
func (h *UserManagementHandler) RequestOTP(w http.ResponseWriter, r *http.Request) {
	var p RequestOTPPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid request JSON payload", err.Error())
		return
	}
	flow := h.userService.OTP()
	if flow == nil {
		response.Error(w, http.StatusServiceUnavailable, "Authentication is not configured", nil)
		return
	}

	res, err := flow.Request(r.Context(), p.Phone, clientIP(r))
	if err != nil {
		writeOTPError(w, "Failed to request OTP code", err)
		return
	}
	response.JSON(w, http.StatusOK, "OTP code sent", otpIssueResponse(res, flow.TTLSeconds()))
}

// Signup handles new user registration and OTP dispatch.
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
	flow := h.userService.OTP()
	if flow == nil {
		response.Error(w, http.StatusServiceUnavailable, "Authentication is not configured", nil)
		return
	}

	res, err := flow.Signup(r.Context(), p.FullName, p.Phone, p.Email, clientIP(r))
	if err != nil {
		writeOTPError(w, "Signup registration failed", err)
		return
	}
	response.JSON(w, http.StatusCreated, "Account created with PENDING status. OTP sent", otpIssueResponse(res, flow.TTLSeconds()))
}

// ListUsers retrieves all users for the management dashboard (admin only).
func (h *UserManagementHandler) ListUsers(w http.ResponseWriter, r *http.Request) {
	if _, err := authz.RequireAdmin(r); authz.Write(w, err) {
		return
	}
	users, err := h.userService.ListUsers(r.Context())
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to list users", err.Error())
		return
	}
	for _, u := range users {
		u.OTPCode = ""
	}

	response.JSON(w, http.StatusOK, "Users list retrieved", users)
}

type AddUserServicePayload struct {
	UserID           string                   `json:"user_id"`
	Phone            string                   `json:"phone"`
	CategoryID       string                   `json:"category_id"`
	AssetType        string                   `json:"asset_type"` // e.g. ELECTRICIAN, PLUMBER, CLEANING, TRACTOR, BRICKS
	Title            string                   `json:"title"`
	Description      string                   `json:"description"`
	HourlyRate       *float64                 `json:"hourly_rate"`
	DailyRate        *float64                 `json:"daily_rate"`
	Lat              *float64                 `json:"lat,omitempty"`
	Lng              *float64                 `json:"lng,omitempty"`
	OfferType        string                   `json:"offer_type,omitempty"` // WITH_TRANSPORT or WITHOUT_TRANSPORT
	UnitPrice        *float64                 `json:"unit_price,omitempty"`
	CoverageRadiusKM *float64                 `json:"coverage_radius_km,omitempty"`
	DistanceSlabs    []map[string]interface{} `json:"distance_slabs,omitempty"`
	IncludedServices map[string]interface{}   `json:"included_services,omitempty"`
	Attributes       map[string]interface{}   `json:"attributes,omitempty"`
	AutoApprove      bool                     `json:"auto_approve,omitempty"`
}

// targetUserForWrite resolves the user a write applies to: the caller, or - for
// admins only - the user named in user_id.
func (h *UserManagementHandler) targetUserForWrite(w http.ResponseWriter, r *http.Request, claimedUserID string) (*domain.User, *domain.User, bool) {
	caller, err := authz.CurrentUser(r)
	if authz.Write(w, err) {
		return nil, nil, false
	}
	if claimedUserID == "" {
		return caller, caller, true
	}
	target, rerr := h.resolveUser(r.Context(), claimedUserID)
	if rerr != nil || target == nil {
		response.Error(w, http.StatusBadRequest, "User profile not found", nil)
		return nil, nil, false
	}
	if target.ID != caller.ID && !caller.IsAdmin() {
		response.Error(w, http.StatusForbidden, "You can only perform this action for your own account", nil)
		return nil, nil, false
	}
	return caller, target, true
}

func (h *UserManagementHandler) AddUserService(w http.ResponseWriter, r *http.Request) {
	var p AddUserServicePayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid request JSON payload", err.Error())
		return
	}

	caller, targetUser, ok := h.targetUserForWrite(w, r, p.UserID)
	if !ok {
		return
	}
	// Approval is an admin decision: a client-supplied auto_approve flag from a
	// regular user is ignored.
	autoApprove := p.AutoApprove && caller.IsAdmin()

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

	latVal := 17.25
	lngVal := 78.95
	if p.Lat != nil && *p.Lat != 0 {
		latVal = *p.Lat
	} else if targetUser.Lat != 0 {
		latVal = targetUser.Lat
	}
	if p.Lng != nil && *p.Lng != 0 {
		lngVal = *p.Lng
	} else if targetUser.Lng != 0 {
		lngVal = targetUser.Lng
	}

	attrMap := p.Attributes
	if attrMap == nil {
		attrMap = make(map[string]interface{})
	}
	if p.OfferType != "" {
		attrMap["offer_type"] = p.OfferType
	}
	if p.UnitPrice != nil {
		attrMap["unit_price"] = *p.UnitPrice
	}
	if p.CoverageRadiusKM != nil {
		attrMap["coverage_radius_km"] = *p.CoverageRadiusKM
	}
	if p.DistanceSlabs != nil {
		attrMap["distance_slabs"] = p.DistanceSlabs
	}
	if p.IncludedServices != nil {
		attrMap["included_services"] = p.IncludedServices
	}

	attrBytes, _ := json.Marshal(attrMap)

	svc, err := h.userService.AddUserSkillAssetWithAttributes(
		r.Context(), targetUser.ID, catID, p.AssetType, p.Title, p.Description,
		p.HourlyRate, p.DailyRate, latVal, lngVal, string(attrBytes), autoApprove,
	)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to add service request", err.Error())
		return
	}

	response.JSON(w, http.StatusCreated, "Service offer registered successfully", svc)
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

	_, targetUser, ok := h.targetUserForWrite(w, r, p.UserID)
	if !ok {
		return
	}

	docStr := string(p.Documents)
	if docStr == "" || docStr == "null" {
		docStr = "{}"
	}

	// The repository scopes the update to (asset_id, user_id), so a user cannot
	// attach documents to somebody else's service.
	updated, err := h.userService.SubmitSkillAssetDocuments(r.Context(), assetID, targetUser.ID, docStr)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to submit service documents", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Service documents submitted successfully and moved to UNDER_REVIEW", updated)
}

func (h *UserManagementHandler) ListServiceRequests(w http.ResponseWriter, r *http.Request) {
	if _, err := authz.RequireAdmin(r); authz.Write(w, err) {
		return
	}
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
	if _, err := h.requireAdmin(r); authz.Write(w, err) {
		return
	}
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
	if _, err := h.requireAdmin(r); authz.Write(w, err) {
		return
	}
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
	caller, err := authz.CurrentUser(r)
	if authz.Write(w, err) {
		return
	}

	userIDStr := r.URL.Query().Get("user_id")
	phoneStr := r.URL.Query().Get("phone")

	var targetUser *domain.User
	if userIDStr != "" {
		targetUser, _ = h.resolveUser(r.Context(), userIDStr)
	}
	if targetUser == nil && phoneStr != "" {
		targetUser, _ = h.userRepo.GetByPhone(r.Context(), phoneStr)
	}
	if targetUser == nil && userIDStr == "" && phoneStr == "" {
		targetUser = caller
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

	// Private KYC and compliance documents are restricted to the service owner or an admin.
	if !h.authorizeUserAccess(r, targetUser.ID) {
		for _, svc := range services {
			svc.Documents = []byte("{}")
		}
	}

	response.JSON(w, http.StatusOK, "User services retrieved successfully", services)
}

type UpdateUserStatusPayload struct {
	UserID string `json:"user_id"`
	Phone  string `json:"phone"`
	Status string `json:"status"` // ACTIVE, SUSPENDED, ...
}

var allowedStatusUpdates = map[domain.UserStatus]bool{
	domain.StatusPending:          true,
	domain.StatusOTPVerified:      true,
	domain.StatusProfileCompleted: true,
	domain.StatusActive:           true,
	domain.StatusSuspended:        true,
	"DEACTIVATED":                 true,
}

// UpdateStatus changes an account status. Admin only; changing the status of
// another administrator requires SUPER_ADMIN.
func (h *UserManagementHandler) UpdateStatus(w http.ResponseWriter, r *http.Request) {
	actor, err := authz.RequireAdmin(r)
	if authz.Write(w, err) {
		return
	}

	var p UpdateUserStatusPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid request JSON payload", err.Error())
		return
	}
	status := domain.UserStatus(p.Status)
	if !allowedStatusUpdates[status] {
		response.Error(w, http.StatusBadRequest, "Unsupported status value", nil)
		return
	}

	var targetUser *domain.User
	if p.UserID != "" {
		if uid, parseErr := uuid.Parse(p.UserID); parseErr == nil {
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
	if targetUser.IsAdmin() && targetUser.ID != actor.ID && !actor.IsSuperAdmin() {
		response.Error(w, http.StatusForbidden, "Only a SUPER_ADMIN can change another administrator's status", nil)
		return
	}

	updated, err := h.userService.UpdateUserStatus(r.Context(), targetUser.ID, status)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to update user status", err.Error())
		return
	}
	updated.OTPCode = ""

	response.JSON(w, http.StatusOK, "User status updated successfully", updated)
}

// requireAdmin allows ADMIN and SUPER_ADMIN, using only the verified identity.
func (h *UserManagementHandler) requireAdmin(r *http.Request) (*domain.User, error) {
	return authz.RequireAdmin(r)
}

// authorizeUserAccess reports whether the verified caller is the target user or an admin.
func (h *UserManagementHandler) authorizeUserAccess(r *http.Request, targetUserID uuid.UUID) bool {
	_, err := authz.RequireSelfOrAdmin(r, targetUserID)
	return err == nil
}

// resolveUser finds a user by id, phone or account identifier. It only LOCATES a
// record; callers must still authorise access to it.
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
	return nil, fmt.Errorf("user not found for identifier")
}

// addressTarget resolves the {userId} path (or ?user_id=) and authorises the caller.
func (h *UserManagementHandler) addressTarget(w http.ResponseWriter, r *http.Request) (*domain.User, bool) {
	caller, err := authz.CurrentUser(r)
	if authz.Write(w, err) {
		return nil, false
	}
	idStr := chi.URLParam(r, "userId")
	if idStr == "" {
		idStr = r.URL.Query().Get("user_id")
	}
	if idStr == "" {
		return caller, true
	}
	target, rerr := h.resolveUser(r.Context(), idStr)
	if rerr != nil || target == nil {
		response.Error(w, http.StatusNotFound, "User not found", nil)
		return nil, false
	}
	if target.ID != caller.ID && !caller.IsAdmin() {
		response.Error(w, http.StatusForbidden, "Access denied: you do not have permission to access this user's saved addresses", nil)
		return nil, false
	}
	return target, true
}

// User Saved Address Handlers

func (h *UserManagementHandler) GetUserAddresses(w http.ResponseWriter, r *http.Request) {
	target, ok := h.addressTarget(w, r)
	if !ok {
		return
	}

	addresses, err := h.userService.GetUserAddresses(r.Context(), target.ID)
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
	target, ok := h.addressTarget(w, r)
	if !ok {
		return
	}

	var addr domain.UserAddress
	if err := json.NewDecoder(r.Body).Decode(&addr); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid request JSON payload", err.Error())
		return
	}
	// Ownership comes from the authorised target, never from the body.
	addr.UserID = target.ID

	created, err := h.userService.CreateUserAddress(r.Context(), &addr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Failed to create saved address", err.Error())
		return
	}

	response.JSON(w, http.StatusCreated, "Address saved successfully", created)
}

func (h *UserManagementHandler) UpdateUserAddress(w http.ResponseWriter, r *http.Request) {
	target, ok := h.addressTarget(w, r)
	if !ok {
		return
	}

	var addr domain.UserAddress
	if err := json.NewDecoder(r.Body).Decode(&addr); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid request JSON payload", err.Error())
		return
	}
	if aid, parseErr := uuid.Parse(chi.URLParam(r, "addressId")); parseErr == nil {
		addr.ID = aid
	}
	addr.UserID = target.ID

	if addr.ID == uuid.Nil {
		response.Error(w, http.StatusBadRequest, "addressId is required", nil)
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
	target, ok := h.addressTarget(w, r)
	if !ok {
		return
	}
	aid, parseErr := uuid.Parse(chi.URLParam(r, "addressId"))
	if parseErr != nil {
		response.Error(w, http.StatusBadRequest, "Invalid addressId format", nil)
		return
	}

	updated, err := h.userService.SetDefaultAddress(r.Context(), target.ID, aid)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to set default address", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Default address set successfully", updated)
}

func (h *UserManagementHandler) DeleteUserAddress(w http.ResponseWriter, r *http.Request) {
	target, ok := h.addressTarget(w, r)
	if !ok {
		return
	}
	addressIDStr := chi.URLParam(r, "addressId")
	aid, parseErr := uuid.Parse(addressIDStr)
	if parseErr != nil {
		response.Error(w, http.StatusBadRequest, "Invalid addressId format", nil)
		return
	}

	if err := h.userService.DeleteUserAddress(r.Context(), target.ID, aid); err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to delete saved address", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Saved address deleted successfully", map[string]string{"id": addressIDStr})
}
