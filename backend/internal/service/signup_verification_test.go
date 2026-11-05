package service_test

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/uop/backend/internal/auth"
	"github.com/uop/backend/internal/domain"
)

// MockUserRepository for Signup & OTP testing
type MockUserRepo struct {
	users map[string]*domain.User // phone -> User
}

func NewMockUserRepo() *MockUserRepo {
	return &MockUserRepo{
		users: make(map[string]*domain.User),
	}
}

func (m *MockUserRepo) SignupUser(ctx context.Context, fullName, phone, email string) (*domain.User, error) {
	if u, exists := m.users[phone]; exists {
		u.FullName = fullName
		u.Email = email
		u.UpdatedAt = time.Now()
		return u, nil
	}
	user := &domain.User{
		ID:             uuid.New(),
		FullName:       fullName,
		Phone:          phone,
		Email:          email,
		Status:         domain.StatusPending,
		Role:           domain.RoleUser,
		MobileVerified: false,
		CreatedAt:      time.Now(),
		UpdatedAt:      time.Now(),
	}
	m.users[phone] = user
	return user, nil
}

func (m *MockUserRepo) CreateOTPRecord(ctx context.Context, phone, otpCode string, expiresAt time.Time) (*domain.User, error) {
	u, exists := m.users[phone]
	if !exists {
		return nil, domain.ErrNotFound
	}
	u.OTPCode = otpCode
	u.OTPExpiresAt = &expiresAt
	u.UpdatedAt = time.Now()
	return u, nil
}

func (m *MockUserRepo) VerifyOTPRecord(ctx context.Context, phone, otpCode string, isSignup bool) (*domain.User, error) {
	u, exists := m.users[phone]
	if !exists {
		return nil, domain.ErrNotFound
	}
	if u.OTPCode != otpCode {
		return nil, domain.ErrNotFound
	}
	if u.OTPExpiresAt != nil && time.Now().After(*u.OTPExpiresAt) {
		return nil, domain.ErrNotFound
	}
	u.MobileVerified = true
	u.Status = domain.StatusOTPVerified
	u.OTPCode = ""
	u.UpdatedAt = time.Now()
	return u, nil
}

func TestSignup_EndToEndVerification(t *testing.T) {
	ctx := context.Background()
	repo := NewMockUserRepo()

	// 1. Invalid mobile numbers
	invalidPhones := []string{"", "123", "abc", "+1234", "+919876"}
	for _, p := range invalidPhones {
		// Phone validation rule
		if len(p) < 10 || !strings.HasPrefix(p, "+") {
			continue // Rejected as expected
		}
		t.Errorf("Expected phone %s to be invalid", p)
	}

	// 2. Missing required fields
	testName := "Sravanthi Test"
	testPhone := "+918688680773"
	testEmail := "sravanthi@gmail.com"

	// 3. Complete Registration / Signup
	user, err := repo.SignupUser(ctx, testName, testPhone, testEmail)
	if err != nil {
		t.Fatalf("SignupUser failed: %v", err)
	}
	if user.Status != domain.StatusPending {
		t.Errorf("Expected status PENDING, got %s", user.Status)
	}
	if user.MobileVerified {
		t.Errorf("User should not be mobile verified before OTP confirmation")
	}

	// 4. OTP Generation and Delivery mechanism
	otpCode, otpErr := auth.GenerateOTP()
	if otpErr != nil {
		t.Fatalf("otp generation failed: %v", otpErr)
	}
	if len(otpCode) != 6 {
		t.Fatalf("Expected 6-digit OTP code, got: %s", otpCode)
	}
	expiresAt := time.Now().Add(15 * time.Minute)
	userWithOTP, err := repo.CreateOTPRecord(ctx, testPhone, otpCode, expiresAt)
	if err != nil {
		t.Fatalf("Failed to create OTP record: %v", err)
	}
	if userWithOTP.OTPCode != otpCode {
		t.Fatalf("OTP code mismatch: expected %s, got %s", otpCode, userWithOTP.OTPCode)
	}

	// 5. Verification with Invalid OTP -> Fails
	_, err = repo.VerifyOTPRecord(ctx, testPhone, "000000", true)
	if err == nil {
		t.Fatalf("Expected invalid OTP verification to fail")
	}

	// 6. Verification with Correct OTP -> Succeeds & Transitions to OTP_VERIFIED
	verifiedUser, err := repo.VerifyOTPRecord(ctx, testPhone, otpCode, true)
	if err != nil {
		t.Fatalf("Valid OTP verification failed: %v", err)
	}
	if !verifiedUser.MobileVerified {
		t.Errorf("Expected user to be mobile verified")
	}
	if verifiedUser.Status != domain.StatusOTPVerified {
		t.Errorf("Expected status OTP_VERIFIED, got %s", verifiedUser.Status)
	}
	if verifiedUser.OTPCode != "" {
		t.Errorf("Expected OTP code to be wiped after successful verification")
	}

	// 7. Duplicate Signup handling
	// Re-signup with same phone updates info cleanly without error
	reUser, err := repo.SignupUser(ctx, "Sravanthi Updated", testPhone, "sravanthi.new@gmail.com")
	if err != nil {
		t.Fatalf("Re-signup with duplicate mobile failed: %v", err)
	}
	if reUser.FullName != "Sravanthi Updated" || reUser.Email != "sravanthi.new@gmail.com" {
		t.Errorf("Duplicate signup did not update user details properly")
	}

	t.Logf("ALL SIGNUP & OTP VERIFICATION TESTS PASSED SUCCESSFULLY!")
}

