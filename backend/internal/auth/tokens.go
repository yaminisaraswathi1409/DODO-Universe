// Package auth contains the server-side authentication primitives: signed
// access/refresh tokens, OTP generation and verification, SMS delivery and
// request rate limiting.
package auth

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Token types carried in the `typ` claim so an access token can never be
// replayed as a refresh token (or vice versa).
const (
	TokenTypeAccess  = "access"
	TokenTypeRefresh = "refresh"
)

var (
	ErrInvalidToken = errors.New("invalid or expired token")
	ErrWrongType    = errors.New("token type not accepted here")
)

// Claims are the verified contents of a DODO-issued token.
//
// Role is intentionally absent: authorization is always decided from the
// database role of the user identified by Subject, never from the token.
type Claims struct {
	// SupabaseUID is the stable account identifier stored in users.supabase_uid.
	SupabaseUID string `json:"suid"`
	// Type is "access" or "refresh".
	Type string `json:"typ"`
	jwt.RegisteredClaims
}

// UserID returns the token subject (users.id).
func (c *Claims) UserID() string { return c.Subject }

// TokenService issues and verifies HS256 tokens.
type TokenService struct {
	secret     []byte
	issuer     string
	audience   string
	accessTTL  time.Duration
	refreshTTL time.Duration
	now        func() time.Time
}

// TokenConfig configures a TokenService.
type TokenConfig struct {
	Secret     string
	Issuer     string
	Audience   string
	AccessTTL  time.Duration
	RefreshTTL time.Duration
	// Now overrides the clock (tests only). Nil means time.Now.
	Now func() time.Time
}

// MinSecretBytes is the shortest HMAC key accepted.
const MinSecretBytes = 32

// NewTokenService validates the configuration. It refuses weak or empty
// secrets: an empty HMAC key would make every token forgeable.
func NewTokenService(cfg TokenConfig) (*TokenService, error) {
	if len(cfg.Secret) < MinSecretBytes {
		return nil, fmt.Errorf("token secret must be at least %d bytes", MinSecretBytes)
	}
	if cfg.Issuer == "" || cfg.Audience == "" {
		return nil, errors.New("token issuer and audience are required")
	}
	if cfg.AccessTTL <= 0 || cfg.RefreshTTL <= 0 {
		return nil, errors.New("token lifetimes must be positive")
	}
	now := cfg.Now
	if now == nil {
		now = time.Now
	}
	return &TokenService{
		secret:     []byte(cfg.Secret),
		issuer:     cfg.Issuer,
		audience:   cfg.Audience,
		accessTTL:  cfg.AccessTTL,
		refreshTTL: cfg.RefreshTTL,
		now:        now,
	}, nil
}

// AccessTTL / RefreshTTL expose lifetimes for API responses.
func (s *TokenService) AccessTTL() time.Duration  { return s.accessTTL }
func (s *TokenService) RefreshTTL() time.Duration { return s.refreshTTL }

// TokenPair is returned to clients after a successful login or refresh.
type TokenPair struct {
	AccessToken      string `json:"access_token"`
	RefreshToken     string `json:"refresh_token"`
	TokenType        string `json:"token_type"`
	ExpiresIn        int64  `json:"expires_in"`
	RefreshExpiresIn int64  `json:"refresh_expires_in"`
}

// IssuePair creates an access and a refresh token for the user.
func (s *TokenService) IssuePair(userID, supabaseUID string) (*TokenPair, error) {
	access, err := s.issue(userID, supabaseUID, TokenTypeAccess, s.accessTTL)
	if err != nil {
		return nil, err
	}
	refresh, err := s.issue(userID, supabaseUID, TokenTypeRefresh, s.refreshTTL)
	if err != nil {
		return nil, err
	}
	return &TokenPair{
		AccessToken:      access,
		RefreshToken:     refresh,
		TokenType:        "Bearer",
		ExpiresIn:        int64(s.accessTTL.Seconds()),
		RefreshExpiresIn: int64(s.refreshTTL.Seconds()),
	}, nil
}

func (s *TokenService) issue(userID, supabaseUID, typ string, ttl time.Duration) (string, error) {
	if userID == "" {
		return "", errors.New("user id required")
	}
	jti, err := randomID()
	if err != nil {
		return "", err
	}
	now := s.now()
	claims := Claims{
		SupabaseUID: supabaseUID,
		Type:        typ,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    s.issuer,
			Subject:   userID,
			Audience:  jwt.ClaimStrings{s.audience},
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
			ID:        jti,
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(s.secret)
}

// Verify checks signature (HS256 only), expiry, not-before, issuer and
// audience, and that the token is of the wanted type.
func (s *TokenService) Verify(tokenString, wantType string) (*Claims, error) {
	parser := jwt.NewParser(
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithIssuer(s.issuer),
		jwt.WithAudience(s.audience),
		jwt.WithExpirationRequired(),
		jwt.WithIssuedAt(),
		jwt.WithTimeFunc(s.now),
		jwt.WithLeeway(5*time.Second),
	)
	claims := &Claims{}
	token, err := parser.ParseWithClaims(tokenString, claims, func(t *jwt.Token) (interface{}, error) {
		return s.secret, nil
	})
	if err != nil || token == nil || !token.Valid {
		return nil, ErrInvalidToken
	}
	if claims.Subject == "" {
		return nil, ErrInvalidToken
	}
	if claims.Type != wantType {
		return nil, ErrWrongType
	}
	return claims, nil
}

func randomID() (string, error) {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

