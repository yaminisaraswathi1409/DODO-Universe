package service

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/uop/backend/internal/auth"
	"github.com/uop/backend/internal/domain"
	"github.com/uop/backend/internal/repository/postgres"
)

var (
	// ErrOTPUnavailable means SMS could not be delivered (gateway missing or failed).
	ErrOTPUnavailable = errors.New("could not send the verification code: SMS delivery is unavailable")
	// ErrInvalidRefreshToken is returned for any refresh failure (single message, no oracle).
	ErrInvalidRefreshToken = errors.New("invalid or expired refresh token")
	// ErrAccountBlocked is returned when a suspended/deactivated account tries to refresh.
	ErrAccountBlocked = errors.New("account is suspended or deactivated")
)

// OTPRateLimitError reports a throttled request and when to retry.
type OTPRateLimitError struct{ RetryAfter time.Duration }

func (e *OTPRateLimitError) Error() string {
	secs := int(e.RetryAfter.Seconds()) + 1
	return fmt.Sprintf("too many requests: retry in %d seconds", secs)
}

// otpStore is the persistence the OTP flow needs; *postgres.UserRepository satisfies it.
type otpStore interface {
	SignupUser(ctx context.Context, fullName, phone, email string) (*domain.User, error)
	StoreOTPVerifier(ctx context.Context, phone, verifier string, expiresAt time.Time) (*domain.User, error)
	ExpireOTPs(ctx context.Context, phone string) error
	CountRecentOTPs(ctx context.Context, phone string, since time.Time) (int, time.Time, error)
	VerifyOTPWith(ctx context.Context, phone, code string, maxAttempts int, match postgres.OTPMatcher) (*domain.User, error)
	InviteUser(ctx context.Context, inviterID uuid.UUID, fullName, phone, email string, role domain.UserRole, verifier string, expiresAt time.Time) (*domain.User, error)
	GetByID(ctx context.Context, id uuid.UUID) (*domain.User, error)
}

// OTPFlowConfig wires the OTP, SMS and token components.
type OTPFlowConfig struct {
	Store  otpStore
	Hasher *auth.OTPHasher
	Sender auth.SMSSender
	Tokens *auth.TokenService
	TTL    time.Duration
	// IsDevelopment allows returning the code to the caller, and only when the
	// sender is the non-delivering development console sender.
	IsDevelopment bool
	// Now overrides the clock (tests only).
	Now func() time.Time
}

// OTPFlow implements OTP issuance, verification, token issuance and refresh.
type OTPFlow struct {
	cfg OTPFlowConfig

	requestPhone *auth.RateLimiter
	requestIP    *auth.RateLimiter
	verifyPhone  *auth.RateLimiter
	verifyIP     *auth.RateLimiter

	// Tunables (exported through NewOTPFlow defaults; tests may adjust).
	DBWindow       time.Duration
	DBMaxPerWindow int
	ResendCooldown time.Duration
}

// NewOTPFlow applies the default limits:
//
//	issue:  3 per phone / 10 min, 20 per IP / hour, 30 s resend cooldown, 5 per phone / 10 min in the DB
//	verify: 10 per phone / 10 min, 60 per IP / 10 min, 5 wrong guesses per issued code
func NewOTPFlow(cfg OTPFlowConfig) *OTPFlow {
	if cfg.TTL <= 0 {
		cfg.TTL = 5 * time.Minute
	}
	if cfg.Now == nil {
		cfg.Now = time.Now
	}
	f := &OTPFlow{
		cfg:            cfg,
		requestPhone:   auth.NewRateLimiter(3, 10*time.Minute),
		requestIP:      auth.NewRateLimiter(20, time.Hour),
		verifyPhone:    auth.NewRateLimiter(10, 10*time.Minute),
		verifyIP:       auth.NewRateLimiter(60, 10*time.Minute),
		DBWindow:       10 * time.Minute,
		DBMaxPerWindow: 5,
		ResendCooldown: 30 * time.Second,
	}
	for _, l := range []*auth.RateLimiter{f.requestPhone, f.requestIP, f.verifyPhone, f.verifyIP} {
		l.SetClock(cfg.Now)
	}
	return f
}

// TTLSeconds is the lifetime of an issued code, for API responses.
func (f *OTPFlow) TTLSeconds() int { return int(f.cfg.TTL.Seconds()) }

// OTPIssueResult is returned after a code has been issued.
type OTPIssueResult struct {
	User *domain.User
	// DevCode is non-empty only in an explicit development environment with the
	// non-delivering console sender. It is never set in production.
	DevCode string
}

// Request issues a login OTP for phone.
func (f *OTPFlow) Request(ctx context.Context, phone, clientIP string) (*OTPIssueResult, error) {
	return f.issue(ctx, phone, clientIP, nil)
}

// Signup creates (or updates a still-PENDING) account and issues an OTP.
func (f *OTPFlow) Signup(ctx context.Context, fullName, phone, email, clientIP string) (*OTPIssueResult, error) {
	return f.issue(ctx, phone, clientIP, func(norm string) error {
		_, err := f.cfg.Store.SignupUser(ctx, fullName, norm, email)
		if err != nil {
			return fmt.Errorf("failed to create pending user record: %w", err)
		}
		return nil
	})
}

func (f *OTPFlow) issue(ctx context.Context, phone, clientIP string, beforeStore func(norm string) error) (*OTPIssueResult, error) {
	norm, err := postgres.ValidateAndNormalizePhone(phone)
	if err != nil {
		return nil, err
	}

	// Fail before creating accounts or codes if no gateway can deliver them.
	if unconfigured, ok := f.cfg.Sender.(auth.UnconfiguredSMS); ok {
		return nil, fmt.Errorf("%w: %s", ErrOTPUnavailable, unconfigured.Reason)
	}

	if err := f.checkIssueLimits(ctx, norm, clientIP); err != nil {
		return nil, err
	}

	if beforeStore != nil {
		if err := beforeStore(norm); err != nil {
			return nil, err
		}
	}

	code, err := auth.GenerateOTP()
	if err != nil {
		return nil, fmt.Errorf("could not generate a verification code")
	}
	verifier := f.cfg.Hasher.Hash(norm, code)
	user, err := f.cfg.Store.StoreOTPVerifier(ctx, norm, verifier, f.cfg.Now().Add(f.cfg.TTL))
	if err != nil {
		return nil, fmt.Errorf("failed to issue OTP: %w", err)
	}

	sendCtx, cancel := context.WithTimeout(ctx, 12*time.Second)
	defer cancel()
	body := fmt.Sprintf("Your DODO Universe verification code is %s. It expires in %d minutes. Do not share this code.", code, int(f.cfg.TTL.Minutes()))
	if err := f.cfg.Sender.Send(sendCtx, norm, body); err != nil {
		// An undelivered code must not stay valid.
		_ = f.cfg.Store.ExpireOTPs(ctx, norm)
		log.Printf("[otp] SMS delivery failed via %s for %s: %v", f.cfg.Sender.Name(), maskPhone(norm), err)
		return nil, fmt.Errorf("%w", ErrOTPUnavailable)
	}

	return &OTPIssueResult{User: user}, nil
}

func (f *OTPFlow) checkIssueLimits(ctx context.Context, normPhone, clientIP string) error {
	if ok, wait := f.requestPhone.Allow("otp:" + normPhone); !ok {
		return &OTPRateLimitError{RetryAfter: wait}
	}
	if clientIP != "" {
		if ok, wait := f.requestIP.Allow("otp-ip:" + clientIP); !ok {
			return &OTPRateLimitError{RetryAfter: wait}
		}
	}
	now := f.cfg.Now()
	count, last, err := f.cfg.Store.CountRecentOTPs(ctx, normPhone, now.Add(-f.DBWindow))
	if err != nil {
		// Fail closed: without the persistent counter we cannot prove the limit holds.
		return fmt.Errorf("could not verify OTP request limits: %w", err)
	}
	if count >= f.DBMaxPerWindow {
		return &OTPRateLimitError{RetryAfter: f.DBWindow}
	}
	if !last.IsZero() && now.Sub(last) < f.ResendCooldown {
		return &OTPRateLimitError{RetryAfter: f.ResendCooldown - now.Sub(last)}
	}
	return nil
}

// VerifyResult is the outcome of a successful verification.
type VerifyResult struct {
	User   *domain.User
	Tokens *auth.TokenPair
}

// Verify checks the code and, on success, issues an access/refresh token pair.
func (f *OTPFlow) Verify(ctx context.Context, phone, code, clientIP string) (*VerifyResult, error) {
	norm, err := postgres.ValidateAndNormalizePhone(phone)
	if err != nil {
		return nil, err
	}
	code = strings.TrimSpace(code)
	if !auth.ValidOTPFormat(code) {
		return nil, postgres.ErrInvalidOTP
	}
	if ok, wait := f.verifyPhone.Allow("verify:" + norm); !ok {
		return nil, &OTPRateLimitError{RetryAfter: wait}
	}
	if clientIP != "" {
		if ok, wait := f.verifyIP.Allow("verify-ip:" + clientIP); !ok {
			return nil, &OTPRateLimitError{RetryAfter: wait}
		}
	}

	user, err := f.cfg.Store.VerifyOTPWith(ctx, norm, code, auth.MaxOTPAttempts,
		func(stored, userPhone, candidate string) bool {
			return f.cfg.Hasher.Matches(stored, norm, candidate) ||
				f.cfg.Hasher.Matches(stored, postgres.NormalizePhone(userPhone), candidate) ||
				f.cfg.Hasher.Matches(stored, userPhone, candidate)
		})
	if err != nil {
		return nil, err
	}
	if user == nil {
		return nil, postgres.ErrInvalidOTP
	}
	pair, err := f.cfg.Tokens.IssuePair(user.ID.String(), user.SupabaseUID)
	if err != nil {
		return nil, fmt.Errorf("could not issue session tokens")
	}
	return &VerifyResult{User: user, Tokens: pair}, nil
}

// Refresh exchanges a valid refresh token for a new token pair. The account is
// reloaded, so suspended/deleted accounts cannot refresh.
//
// Limitation: refresh tokens are stateless and cannot be individually revoked
// before they expire; suspending the account is the revocation lever.
func (f *OTPFlow) Refresh(ctx context.Context, refreshToken string) (*VerifyResult, error) {
	claims, err := f.cfg.Tokens.Verify(refreshToken, auth.TokenTypeRefresh)
	if err != nil {
		return nil, ErrInvalidRefreshToken
	}
	id, err := uuid.Parse(claims.UserID())
	if err != nil {
		return nil, ErrInvalidRefreshToken
	}
	user, err := f.cfg.Store.GetByID(ctx, id)
	if err != nil || user == nil {
		return nil, ErrInvalidRefreshToken
	}
	if claims.SupabaseUID != "" && claims.SupabaseUID != user.SupabaseUID {
		return nil, ErrInvalidRefreshToken
	}
	if user.IsBlocked() {
		return nil, ErrAccountBlocked
	}
	pair, err := f.cfg.Tokens.IssuePair(user.ID.String(), user.SupabaseUID)
	if err != nil {
		return nil, fmt.Errorf("could not issue session tokens")
	}
	return &VerifyResult{User: user, Tokens: pair}, nil
}

// Invite creates an invited account and delivers its OTP. The caller must have
// been authorised (admin, and SUPER_ADMIN for privileged roles) by the handler.
func (f *OTPFlow) Invite(ctx context.Context, inviter *domain.User, fullName, phone, email string, role domain.UserRole) (*domain.User, error) {
	if inviter == nil || !inviter.CanGrantRole(role) {
		return nil, errors.New("you are not allowed to grant this role")
	}
	norm, err := postgres.ValidateAndNormalizePhone(phone)
	if err != nil {
		return nil, err
	}
	if unconfigured, ok := f.cfg.Sender.(auth.UnconfiguredSMS); ok {
		return nil, fmt.Errorf("%w: %s", ErrOTPUnavailable, unconfigured.Reason)
	}
	if role == "" {
		role = domain.RoleUser
	}
	code, err := auth.GenerateOTP()
	if err != nil {
		return nil, fmt.Errorf("could not generate a verification code")
	}
	invited, err := f.cfg.Store.InviteUser(ctx, inviter.ID, fullName, norm, email, role,
		f.cfg.Hasher.Hash(norm, code), f.cfg.Now().Add(f.cfg.TTL))
	if err != nil {
		return nil, fmt.Errorf("failed to invite user: %w", err)
	}
	body := fmt.Sprintf("You have been invited to DODO Universe. Your verification code is %s. It expires in %d minutes.", code, int(f.cfg.TTL.Minutes()))
	sendCtx, cancel := context.WithTimeout(ctx, 12*time.Second)
	defer cancel()
	if err := f.cfg.Sender.Send(sendCtx, norm, body); err != nil {
		_ = f.cfg.Store.ExpireOTPs(ctx, norm)
		log.Printf("[otp] invite SMS delivery failed via %s for %s: %v", f.cfg.Sender.Name(), maskPhone(norm), err)
		return invited, ErrOTPUnavailable
	}
	return invited, nil
}

func maskPhone(p string) string {
	if len(p) <= 4 {
		return "****"
	}
	return strings.Repeat("*", len(p)-4) + p[len(p)-4:]
}
