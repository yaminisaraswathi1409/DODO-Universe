package service

import (
	"context"
	"errors"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/uop/backend/internal/auth"
	"github.com/uop/backend/internal/domain"
	"github.com/uop/backend/internal/repository/postgres"
)

func TestGenerateRandomOTP(t *testing.T) {
	otp1, err := auth.GenerateOTP()
	if err != nil {
		t.Fatalf("unexpected error generating OTP: %v", err)
	}
	otp2, err := auth.GenerateOTP()
	if err != nil {
		t.Fatalf("unexpected error generating OTP: %v", err)
	}

	if len(otp1) != 6 {
		t.Errorf("Expected 6-digit OTP code, got %s", otp1)
	}

	if len(otp2) != 6 {
		t.Errorf("Expected 6-digit OTP code, got %s", otp2)
	}
}

type memoryOTPStore struct {
	mu      sync.Mutex
	users   map[string]*domain.User
	otps    map[string]*mockOTP
	history []mockHistory
}

type mockOTP struct {
	verifier   string
	expiresAt  time.Time
	attempts   int
	isVerified bool
}

type mockHistory struct {
	phone     string
	createdAt time.Time
}

func newMemoryOTPStore() *memoryOTPStore {
	return &memoryOTPStore{
		users: make(map[string]*domain.User),
		otps:  make(map[string]*mockOTP),
	}
}

func (m *memoryOTPStore) SignupUser(ctx context.Context, fullName, phone, email string) (*domain.User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	u, ok := m.users[phone]
	if !ok {
		u = &domain.User{
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
		m.users[phone] = u
		return u, nil
	}
	u.FullName = fullName
	u.Email = email
	u.UpdatedAt = time.Now()
	return u, nil
}

func (m *memoryOTPStore) StoreOTPVerifier(ctx context.Context, phone, verifier string, expiresAt time.Time) (*domain.User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	u, ok := m.users[phone]
	if !ok {
		u = &domain.User{
			ID:        uuid.New(),
			Phone:     phone,
			Status:    domain.StatusPending,
			Role:      domain.RoleUser,
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		}
		m.users[phone] = u
	}
	u.OTPExpiresAt = &expiresAt
	m.otps[phone] = &mockOTP{
		verifier:   verifier,
		expiresAt:  expiresAt,
		attempts:   0,
		isVerified: false,
	}
	m.history = append(m.history, mockHistory{phone: phone, createdAt: time.Now()})
	return u, nil
}

func (m *memoryOTPStore) ExpireOTPs(ctx context.Context, phone string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if rec, ok := m.otps[phone]; ok {
		rec.expiresAt = time.Now().Add(-time.Second)
	}
	return nil
}

func (m *memoryOTPStore) CountRecentOTPs(ctx context.Context, phone string, since time.Time) (int, time.Time, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	count := 0
	var last time.Time
	for _, h := range m.history {
		if h.phone == phone && h.createdAt.After(since) {
			count++
			if h.createdAt.After(last) {
				last = h.createdAt
			}
		}
	}
	return count, last, nil
}

func (m *memoryOTPStore) VerifyOTPWith(ctx context.Context, phone, code string, maxAttempts int, match postgres.OTPMatcher) (*domain.User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	user, ok := m.users[phone]
	if !ok {
		return nil, postgres.ErrInvalidOTP
	}
	otp, hasOTP := m.otps[phone]
	if !hasOTP || otp.isVerified || time.Now().After(otp.expiresAt) {
		return nil, postgres.ErrInvalidOTP
	}
	if otp.attempts >= maxAttempts {
		otp.expiresAt = time.Now().Add(-time.Second)
		return nil, postgres.ErrOTPLocked
	}
	if !match(otp.verifier, phone, code) {
		otp.attempts++
		if otp.attempts >= maxAttempts {
			otp.expiresAt = time.Now().Add(-time.Second)
			return nil, postgres.ErrOTPLocked
		}
		return nil, postgres.ErrInvalidOTP
	}
	otp.isVerified = true
	user.MobileVerified = true
	user.Status = domain.StatusOTPVerified
	return user, nil
}

func (m *memoryOTPStore) InviteUser(ctx context.Context, inviterID uuid.UUID, fullName, phone, email string, role domain.UserRole, verifier string, expiresAt time.Time) (*domain.User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	u := &domain.User{
		ID:             uuid.New(),
		FullName:       fullName,
		Phone:          phone,
		Email:          email,
		Role:           role,
		Status:         domain.StatusPending,
		MobileVerified: false,
		InvitedBy:      &inviterID,
		InvitedAt:      &expiresAt,
		CreatedAt:      time.Now(),
		UpdatedAt:      time.Now(),
	}
	m.users[phone] = u
	m.otps[phone] = &mockOTP{verifier: verifier, expiresAt: expiresAt}
	return u, nil
}

func (m *memoryOTPStore) GetByID(ctx context.Context, id uuid.UUID) (*domain.User, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, u := range m.users {
		if u.ID == id {
			return u, nil
		}
	}
	return nil, domain.ErrNotFound
}

type capturingSMS struct {
	mu      sync.Mutex
	lastTo  string
	lastMsg string
}

func (c *capturingSMS) Name() string { return "capturing-sms" }
func (c *capturingSMS) Send(ctx context.Context, to, body string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.lastTo = to
	c.lastMsg = body
	return nil
}

func TestOTPFlow_CompleteLifecycleAndSecurity(t *testing.T) {
	ctx := context.Background()
	secret := "a-very-long-secret-key-that-is-at-least-32-chars-long"
	hasher, err := auth.NewOTPHasher(secret)
	if err != nil {
		t.Fatal(err)
	}
	tokenService, err := auth.NewTokenService(auth.TokenConfig{
		Secret:     secret,
		Issuer:     "dodo-test",
		Audience:   "dodo-test-aud",
		AccessTTL:  15 * time.Minute,
		RefreshTTL: 24 * time.Hour,
	})
	if err != nil {
		t.Fatal(err)
	}

	sms := &capturingSMS{}
	store := newMemoryOTPStore()
	flow := NewOTPFlow(OTPFlowConfig{
		Store:         store,
		Hasher:        hasher,
		Sender:        sms,
		Tokens:        tokenService,
		TTL:           5 * time.Minute,
		IsDevelopment: true,
	})

	phone := "+919876543210"

	// 1. Signup issues OTP and does NOT leak code in the response
	res, err := flow.Signup(ctx, "Yamini Saraswathi", phone, "yamini@example.com", "127.0.0.1")
	if err != nil {
		t.Fatalf("Signup failed: %v", err)
	}
	if res.DevCode != "" {
		t.Errorf("DevCode must be empty (never returned in responses), got: %s", res.DevCode)
	}

	// 2. Check that the OTP was delivered to the SMS sender
	sms.mu.Lock()
	msg := sms.lastMsg
	sms.mu.Unlock()
	re := regexp.MustCompile(`\b\d{6}\b`)
	otpCode := re.FindString(msg)
	if len(otpCode) != 6 {
		t.Fatalf("Expected 6-digit code in sent message %q", msg)
	}

	// 3. Database stored only verifier, never the plaintext code
	store.mu.Lock()
	otpRec := store.otps[phone]
	store.mu.Unlock()
	if otpRec == nil {
		t.Fatal("OTP record not stored")
	}
	if strings.Contains(otpRec.verifier, otpCode) {
		t.Fatal("Verifier must never contain plaintext OTP code")
	}

	// 4. Verification with wrong code fails
	_, err = flow.Verify(ctx, phone, "000000", "127.0.0.1")
	if !errors.Is(err, postgres.ErrInvalidOTP) {
		t.Errorf("Expected ErrInvalidOTP for wrong code, got: %v", err)
	}

	// 5. Verification with correct code succeeds and issues tokens
	vRes, err := flow.Verify(ctx, phone, otpCode, "127.0.0.1")
	if err != nil {
		t.Fatalf("Verify failed with correct OTP: %v", err)
	}
	if vRes.User == nil || !vRes.User.MobileVerified {
		t.Error("User mobile_verified must be true")
	}
	if vRes.Tokens == nil || vRes.Tokens.AccessToken == "" || vRes.Tokens.RefreshToken == "" {
		t.Fatal("Tokens must be generated upon successful verification")
	}

	// 6. OTP cannot be verified twice (single-use invalidation)
	_, err = flow.Verify(ctx, phone, otpCode, "127.0.0.1")
	if !errors.Is(err, postgres.ErrInvalidOTP) {
		t.Errorf("Expected ErrInvalidOTP when reusing OTP, got: %v", err)
	}

	// 7. Test attempt lockout after 5 wrong attempts
	// Advance clock past cooldown to issue a new code
	flow.ResendCooldown = 0
	_, err = flow.Request(ctx, phone, "127.0.0.1")
	if err != nil {
		t.Fatalf("Request OTP failed: %v", err)
	}
	for i := 0; i < 4; i++ {
		_, err = flow.Verify(ctx, phone, "111111", "127.0.0.1")
		if !errors.Is(err, postgres.ErrInvalidOTP) {
			t.Fatalf("Attempt %d should return ErrInvalidOTP, got %v", i+1, err)
		}
	}
	// 5th failed attempt triggers lockout
	_, err = flow.Verify(ctx, phone, "111111", "127.0.0.1")
	if !errors.Is(err, postgres.ErrOTPLocked) {
		t.Fatalf("5th failed attempt must return ErrOTPLocked, got %v", err)
	}

	// 8. Fail-closed behavior with unconfigured SMS in production
	unconfFlow := NewOTPFlow(OTPFlowConfig{
		Store:         store,
		Hasher:        hasher,
		Sender:        auth.UnconfiguredSMS{Reason: "no gateway"},
		Tokens:        tokenService,
		TTL:           5 * time.Minute,
		IsDevelopment: false,
	})
	_, err = unconfFlow.Request(ctx, "+919999999999", "127.0.0.1")
	if !errors.Is(err, ErrOTPUnavailable) {
		t.Errorf("Expected ErrOTPUnavailable for unconfigured SMS, got: %v", err)
	}
}


