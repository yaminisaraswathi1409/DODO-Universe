package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/uop/backend/internal/domain"
	"github.com/uop/backend/internal/repository/postgres"
)

type UserService struct {
	userRepo *postgres.UserRepository
	otp      *OTPFlow
}

// SetOTPFlow installs the OTP/SMS/token flow. Authentication endpoints refuse to work without it.
func (s *UserService) SetOTPFlow(flow *OTPFlow) { s.otp = flow }

// OTP returns the configured OTP flow (nil if authentication is not configured).
func (s *UserService) OTP() *OTPFlow { return s.otp }

func NewUserService(userRepo *postgres.UserRepository) *UserService {
	return &UserService{userRepo: userRepo}
}

type OnboardingStatusResponse struct {
	UserID         uuid.UUID         `json:"user_id"`
	Status         domain.UserStatus `json:"status"`
	MobileVerified bool              `json:"mobile_verified"`
	ProfilePhoto   bool              `json:"profile_photo"`
	FaceVerified   bool              `json:"face_verified"`
	IsActive       bool              `json:"is_active"`
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

func (s *UserService) AddUserSkillAssetWithAttributes(ctx context.Context, userID uuid.UUID, categoryID *uuid.UUID, assetType, title, description string, hourlyRate, dailyRate *float64, lat, lng float64, attributesJSON string, autoApprove bool) (*domain.UserSkillAsset, error) {
	asset, err := s.userRepo.AddUserSkillAssetWithAttributes(ctx, userID, categoryID, assetType, title, description, hourlyRate, dailyRate, lat, lng, attributesJSON, autoApprove)
	if err == nil && asset != nil {
		notifTitle := "Service Submission Received"
		notifMsg := fmt.Sprintf("Your service submission \"%s\" has been received and submitted for admin review.", title)
		if autoApprove {
			notifTitle = "Service Approved & Active!"
			notifMsg = fmt.Sprintf("Your service submission \"%s\" has been auto-approved and is now ACTIVE!", title)
		}
		notifMeta, _ := json.Marshal(map[string]interface{}{
			"asset_id": asset.ID,
			"title":    asset.Title,
			"status":   asset.Status,
			"type":     "SERVICE_SUBMITTED",
		})
		_, _ = s.userRepo.CreateNotification(ctx, &domain.Notification{
			UserID:   userID,
			Title:    notifTitle,
			Message:  notifMsg,
			Type:     "SERVICE_SUBMITTED",
			Metadata: notifMeta,
		})
	}
	return asset, err
}

func (s *UserService) SubmitSkillAssetDocuments(ctx context.Context, assetID, userID uuid.UUID, documentsJSON string) (*domain.UserSkillAsset, error) {
	asset, err := s.userRepo.SubmitSkillAssetDocuments(ctx, assetID, userID, documentsJSON)
	if err == nil && asset != nil {
		notifMeta, _ := json.Marshal(map[string]interface{}{
			"asset_id": asset.ID,
			"title":    asset.Title,
			"type":     "DOCUMENTS_SUBMITTED",
		})
		_, _ = s.userRepo.CreateNotification(ctx, &domain.Notification{
			UserID:   userID,
			Title:    "Verification Documents Submitted",
			Message:  fmt.Sprintf("Your verification documents for \"%s\" were uploaded successfully and are under admin review.", asset.Title),
			Type:     "DOCUMENTS_SUBMITTED",
			Metadata: notifMeta,
		})
	}
	return asset, err
}

func (s *UserService) GetUserSkillsAssets(ctx context.Context, userID uuid.UUID) ([]*domain.UserSkillAsset, error) {
	return s.userRepo.GetUserSkillsAssets(ctx, userID)
}

func (s *UserService) ListAllUserSkillAssetRequests(ctx context.Context, statusFilter string) ([]*domain.UserSkillAsset, error) {
	return s.userRepo.ListAllUserSkillAssetRequests(ctx, statusFilter)
}

func (s *UserService) AdminApproveServiceRequest(ctx context.Context, assetID uuid.UUID) (*domain.UserSkillAsset, error) {
	asset, err := s.userRepo.AdminApproveServiceRequest(ctx, assetID)
	if err == nil && asset != nil {
		notifMeta, _ := json.Marshal(map[string]interface{}{
			"asset_id": asset.ID,
			"title":    asset.Title,
			"status":   asset.Status,
			"type":     "SERVICE_PRE_APPROVED",
		})
		_, _ = s.userRepo.CreateNotification(ctx, &domain.Notification{
			UserID:   asset.UserID,
			Title:    "Service Request Pre-Approved!",
			Message:  fmt.Sprintf("Your service request \"%s\" has been pre-approved by admin! Please upload verification documents to complete activation.", asset.Title),
			Type:     "SERVICE_PRE_APPROVED",
			Metadata: notifMeta,
		})
	}
	return asset, err
}

func (s *UserService) AdminReviewDocuments(ctx context.Context, assetID uuid.UUID, approve bool, rejectionReason string) (*domain.UserSkillAsset, error) {
	asset, err := s.userRepo.AdminReviewDocuments(ctx, assetID, approve, rejectionReason)
	if err == nil && asset != nil {
		var title, msg, nType string
		if approve {
			title = "Service Approved & Active!"
			msg = fmt.Sprintf("Congratulations! Admin approved your verification documents for \"%s\". Your service is now ACTIVE!", asset.Title)
			nType = "SERVICE_APPROVED"
		} else {
			title = "Service Application Update"
			msg = fmt.Sprintf("Your service application for \"%s\" was rejected. Reason: %s", asset.Title, rejectionReason)
			nType = "SERVICE_REJECTED"
		}
		notifMeta, _ := json.Marshal(map[string]interface{}{
			"asset_id": asset.ID,
			"title":    asset.Title,
			"status":   asset.Status,
			"type":     nType,
		})
		_, _ = s.userRepo.CreateNotification(ctx, &domain.Notification{
			UserID:   asset.UserID,
			Title:    title,
			Message:  msg,
			Type:     nType,
			Metadata: notifMeta,
		})
	}
	return asset, err
}

func (s *UserService) DeleteUserSkillAsset(ctx context.Context, assetID, userID uuid.UUID) error {
	return s.userRepo.DeleteUserSkillAsset(ctx, assetID, userID)
}

func (s *UserService) UpdateUserStatus(ctx context.Context, userID uuid.UUID, status domain.UserStatus) (*domain.User, error) {
	user, err := s.userRepo.UpdateStatus(ctx, userID, status)
	if err == nil && user != nil {
		notifMeta, _ := json.Marshal(map[string]interface{}{
			"user_id": user.ID,
			"status":  string(status),
			"type":    "ACCOUNT_STATUS_UPDATED",
		})
		_, _ = s.userRepo.CreateNotification(ctx, &domain.Notification{
			UserID:   user.ID,
			Title:    "Account Status Update",
			Message:  fmt.Sprintf("Your account status has been updated to %s.", string(status)),
			Type:     "ACCOUNT_STATUS_UPDATED",
			Metadata: notifMeta,
		})
	}
	return user, err
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
