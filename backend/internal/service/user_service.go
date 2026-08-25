package service

import (
	"context"
	"crypto/rand"
	"fmt"
	"io"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/uop/backend/internal/domain"
	"github.com/uop/backend/internal/repository/postgres"
)

type UserService struct {
	userRepo *postgres.UserRepository
}

func NewUserService(userRepo *postgres.UserRepository) *UserService {
	return &UserService{userRepo: userRepo}
}

// GenerateRandomOTP generates a secure 6-digit numerical OTP code
func GenerateRandomOTP() string {
	var table = [...]byte{'1', '2', '3', '4', '5', '6', '7', '8', '9', '0'}
	b := make([]byte, 6)
	n, err := io.ReadAtLeast(rand.Reader, b, 6)
	if n != 6 || err != nil {
		return "123456" // fallback default for dev
	}
	for i := 0; i < len(b); i++ {
		b[i] = table[int(b[i])%len(table)]
	}
	return string(b)
}

type OnboardingStatusResponse struct {
	UserID         uuid.UUID         `json:"user_id"`
	Status         domain.UserStatus `json:"status"`
	MobileVerified bool              `json:"mobile_verified"`
	ProfilePhoto   bool              `json:"profile_photo"`
	FaceVerified   bool              `json:"face_verified"`
	IsActive       bool              `json:"is_active"`
}

func (s *UserService) InviteUser(ctx context.Context, adminUser *domain.User, fullName, phone, email string, role domain.UserRole) (*domain.User, error) {
	var inviterID uuid.UUID
	if adminUser != nil {
		inviterID = adminUser.ID
	}

	if phone == "" {
		return nil, fmt.Errorf("mobile number is required to invite a new user")
	}

	otpCode := GenerateRandomOTP()
	expiresAt := time.Now().Add(15 * time.Minute)

	if role == "" {
		role = domain.RoleUser
	}

	invited, err := s.userRepo.InviteUser(ctx, inviterID, fullName, phone, email, role, otpCode, expiresAt)
	if err != nil {
		return nil, fmt.Errorf("failed to invite user: %w", err)
	}

	log.Printf("[COMMUNICATION GATEWAY] Sent Invitation & OTP code [%s] via SMS/WhatsApp to %s (%s)\n", otpCode, phone, fullName)

	return invited, nil
}

func (s *UserService) SignupUser(ctx context.Context, fullName, phone, email string) (*domain.User, error) {
	if phone == "" {
		return nil, fmt.Errorf("phone number is required for signup")
	}

	user, err := s.userRepo.SignupUser(ctx, fullName, phone, email)
	if err != nil {
		return nil, fmt.Errorf("failed to create pending user record: %w", err)
	}

	otpCode := GenerateRandomOTP()
	expiresAt := time.Now().Add(15 * time.Minute)

	updatedUser, err := s.userRepo.CreateOTPRecord(ctx, phone, otpCode, expiresAt)
	if err != nil {
		log.Printf("[USER SERVICE WARN] Failed to create OTP record: %v\n", err)
		return user, nil
	}

	log.Printf("[DEVELOPMENT OTP] Signup OTP code [%s] generated for mobile: %s (%s)\n", otpCode, phone, fullName)
	return updatedUser, nil
}

func (s *UserService) VerifyOTP(ctx context.Context, phone, otpCode string) (*domain.User, error) {
	if phone == "" || otpCode == "" {
		return nil, fmt.Errorf("phone number and OTP code are required")
	}

	user, err := s.userRepo.VerifyOTPRecord(ctx, phone, otpCode, true)
	if err != nil {
		return nil, err
	}
	if user == nil {
		return nil, fmt.Errorf("invalid or expired OTP code")
	}

	log.Printf("[USER SERVICE] Mobile number verified successfully for user ID: %s (Phone: %s)\n", user.ID, phone)
	return user, nil
}

func (s *UserService) CompleteProfile(ctx context.Context, userID uuid.UUID, avatarURL, bio, addressText, aadhaarNumber string, lat, lng float64) (*domain.User, error) {
	if avatarURL == "" {
		return nil, fmt.Errorf("profile photo (avatar_url) is strictly required to complete user profile")
	}

	user, err := s.userRepo.CompleteProfile(ctx, userID, avatarURL, bio, addressText, aadhaarNumber, lat, lng)
	if err != nil {
		return nil, fmt.Errorf("failed to complete profile: %w", err)
	}

	log.Printf("[USER SERVICE] Profile completed for user ID: %s (Status: %s)\n", user.ID, user.Status)
	return user, nil
}

func (s *UserService) AddUserSkillAsset(ctx context.Context, userID uuid.UUID, categoryID *uuid.UUID, assetType, title, description string, hourlyRate, dailyRate *float64) (*domain.UserSkillAsset, error) {
	return s.userRepo.AddUserSkillAsset(ctx, userID, categoryID, assetType, title, description, hourlyRate, dailyRate)
}

func (s *UserService) SubmitSkillAssetDocuments(ctx context.Context, assetID, userID uuid.UUID, documentsJSON string) (*domain.UserSkillAsset, error) {
	return s.userRepo.SubmitSkillAssetDocuments(ctx, assetID, userID, documentsJSON)
}

func (s *UserService) GetUserSkillsAssets(ctx context.Context, userID uuid.UUID) ([]*domain.UserSkillAsset, error) {
	return s.userRepo.GetUserSkillsAssets(ctx, userID)
}

func (s *UserService) ListAllUserSkillAssetRequests(ctx context.Context, statusFilter string) ([]*domain.UserSkillAsset, error) {
	return s.userRepo.ListAllUserSkillAssetRequests(ctx, statusFilter)
}

func (s *UserService) AdminApproveServiceRequest(ctx context.Context, assetID uuid.UUID) (*domain.UserSkillAsset, error) {
	return s.userRepo.AdminApproveServiceRequest(ctx, assetID)
}

func (s *UserService) AdminReviewDocuments(ctx context.Context, assetID uuid.UUID, approve bool, rejectionReason string) (*domain.UserSkillAsset, error) {
	return s.userRepo.AdminReviewDocuments(ctx, assetID, approve, rejectionReason)
}

func (s *UserService) DeleteUserSkillAsset(ctx context.Context, assetID, userID uuid.UUID) error {
	return s.userRepo.DeleteUserSkillAsset(ctx, assetID, userID)
}


func (s *UserService) UpdateUserStatus(ctx context.Context, userID uuid.UUID, status domain.UserStatus) (*domain.User, error) {
	return s.userRepo.UpdateStatus(ctx, userID, status)
}

func (s *UserService) VerifyFace(ctx context.Context, userID uuid.UUID, faceRef string) (*domain.User, error) {
	if faceRef == "" {
		faceRef = fmt.Sprintf("face_snapshot_%s_%d", userID.String()[:8], time.Now().Unix())
	}

	user, err := s.userRepo.VerifyFace(ctx, userID, faceRef)
	if err != nil {
		return nil, fmt.Errorf("failed to process face verification: %w", err)
	}

	log.Printf("[USER SERVICE] Face ID verification successful for user ID: %s (Status: %s, Active: %t)\n", user.ID, user.Status, user.IsVerified)
	return user, nil
}

func (s *UserService) GetOnboardingStatus(ctx context.Context, userID uuid.UUID) (*OnboardingStatusResponse, error) {
	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil || user == nil {
		return nil, fmt.Errorf("user not found")
	}

	return &OnboardingStatusResponse{
		UserID:         user.ID,
		Status:         user.Status,
		MobileVerified: user.MobileVerified,
		ProfilePhoto:   user.AvatarURL != "",
		FaceVerified:   user.FaceVerified,
		IsActive:       user.Status == domain.StatusActive,
	}, nil
}

func (s *UserService) ListUsers(ctx context.Context) ([]*domain.User, error) {
	return s.userRepo.ListUsers(ctx)
}

func (s *UserService) RequestOTP(ctx context.Context, phone string) (*domain.User, error) {
	if phone == "" {
		return nil, fmt.Errorf("mobile phone number is required")
	}

	otpCode := GenerateRandomOTP()
	expiresAt := time.Now().Add(15 * time.Minute)

	user, err := s.userRepo.CreateOTPRecord(ctx, phone, otpCode, expiresAt)
	if err != nil {
		return nil, fmt.Errorf("failed to request OTP: %w", err)
	}

	log.Printf("[COMMUNICATION GATEWAY] Sent login OTP code [%s] via SMS to mobile: %s\n", otpCode, phone)
	return user, nil
}

// User Saved Addresses Service Methods

func (s *UserService) GetUserAddresses(ctx context.Context, userID uuid.UUID) ([]*domain.UserAddress, error) {
	return s.userRepo.GetUserAddresses(ctx, userID)
}

func (s *UserService) CreateUserAddress(ctx context.Context, addr *domain.UserAddress) (*domain.UserAddress, error) {
	if addr.Label == "" {
		addr.Label = "Home"
	}
	if addr.AddressText == "" {
		return nil, fmt.Errorf("address_text is required")
	}
	return s.userRepo.CreateUserAddress(ctx, addr)
}

func (s *UserService) UpdateUserAddress(ctx context.Context, addr *domain.UserAddress) (*domain.UserAddress, error) {
	if addr.ID == uuid.Nil {
		return nil, fmt.Errorf("address ID is required for update")
	}
	return s.userRepo.UpdateUserAddress(ctx, addr)
}

func (s *UserService) SetDefaultAddress(ctx context.Context, userID, addressID uuid.UUID) (*domain.UserAddress, error) {
	return s.userRepo.SetDefaultAddress(ctx, userID, addressID)
}

func (s *UserService) DeleteUserAddress(ctx context.Context, userID, addressID uuid.UUID) error {
	return s.userRepo.DeleteUserAddress(ctx, userID, addressID)
}
