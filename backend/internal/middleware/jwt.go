package middleware

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/uop/backend/internal/auth"
	"github.com/uop/backend/internal/domain"
	"github.com/uop/backend/pkg/response"
)

type contextKey string

// UserContextKey stores *UserClaims; AuthUserContextKey stores *domain.User.
const (
	UserContextKey     contextKey = "user_claims"
	AuthUserContextKey contextKey = "auth_user"
)

// UserClaims are the identity facts the middleware has VERIFIED for a request.
// Handlers must never read identity from headers or request bodies.
type UserClaims struct {
	// SupabaseUID is the account identifier (users.supabase_uid) of the verified user.
	SupabaseUID string
	Email       string
	// Role is the role loaded from the database for the verified user (never
	// taken from the token). Empty when the user has no database row yet.
	Role string
	jwt.RegisteredClaims
}

// UserLookup resolves accounts for verified token subjects.
type UserLookup interface {
	GetByID(ctx context.Context, id uuid.UUID) (*domain.User, error)
	GetBySupabaseUID(ctx context.Context, uid string) (*domain.User, error)
}

// Authenticator verifies Bearer tokens and attaches the verified identity to
// the request context.
type Authenticator struct {
	Tokens *auth.TokenService
	// SupabaseJWTSecret, when non-empty, additionally accepts Supabase-issued
	// access tokens (HS256, audience "authenticated", expiry required).
	SupabaseJWTSecret string
	Users             UserLookup
	// IsPublic reports routes that need no authentication. Nil means none.
	IsPublic func(method, path string) bool
	// IsAdminOnly reports routes restricted to ADMIN and SUPER_ADMIN. It is a
	// central, defence-in-depth policy applied before any handler runs.
	IsAdminOnly func(method, path string) bool
	// Now overrides the clock (tests only).
	Now func() time.Time
}

// Middleware is deny-by-default:
//   - X-User-ID is always stripped (it is never trusted).
//   - A valid token attaches the verified user to the context.
//   - A missing/invalid token on a non-public route yields 401.
//   - On a public route an invalid token is ignored (treated as anonymous).
//   - Suspended or deactivated accounts get 403 (except GET /users/me, which the
//     clients use to display the account state).
func (a *Authenticator) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r.Header.Del("X-User-ID")

		path := strings.TrimPrefix(r.URL.Path, "/api/v1")
		public := a.IsPublic != nil && a.IsPublic(r.Method, path)

		raw := r.Header.Get("Authorization")
		// Handlers must use the verified context, never the raw header.
		r.Header.Del("Authorization")

		if raw == "" {
			if public {
				next.ServeHTTP(w, r)
				return
			}
			response.Error(w, http.StatusUnauthorized, "Authentication required", nil)
			return
		}

		tokenString, ok := bearerToken(raw)
		if !ok {
			if public {
				next.ServeHTTP(w, r)
				return
			}
			response.Error(w, http.StatusUnauthorized, "Invalid Authorization header. Expected: Bearer <access token>", nil)
			return
		}

		user, claims, status, msg := a.authenticate(r.Context(), tokenString)
		if status != 0 {
			if public {
				next.ServeHTTP(w, r)
				return
			}
			response.Error(w, status, msg, nil)
			return
		}

		if user != nil && isBlocked(user) && !(r.Method == http.MethodGet && path == "/users/me") {
			response.Error(w, http.StatusForbidden, "Account is suspended or deactivated", nil)
			return
		}

		if a.IsAdminOnly != nil && a.IsAdminOnly(r.Method, path) && !user.IsAdmin() {
			response.Error(w, http.StatusForbidden, "Administrator permission required", nil)
			return
		}

		ctx := context.WithValue(r.Context(), UserContextKey, claims)
		if user != nil {
			ctx = context.WithValue(ctx, AuthUserContextKey, user)
		}
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// authenticate returns either (user, claims, 0, "") on success or a non-zero
// HTTP status and message on failure.
func (a *Authenticator) authenticate(ctx context.Context, tokenString string) (*domain.User, *UserClaims, int, string) {
	if a.Users == nil {
		return nil, nil, http.StatusServiceUnavailable, "Authentication backend unavailable"
	}
	if a.Tokens != nil {
		if tc, err := a.Tokens.Verify(tokenString, auth.TokenTypeAccess); err == nil {
			id, perr := uuid.Parse(tc.UserID())
			if perr != nil {
				return nil, nil, http.StatusUnauthorized, "Invalid or expired token"
			}
			user, lerr := a.Users.GetByID(ctx, id)
			if lerr != nil || user == nil {
				// The account no longer exists (or could not be loaded): fail closed.
				return nil, nil, http.StatusUnauthorized, "Invalid or expired token"
			}
			// The token's account identifier must still match the account row.
			if tc.SupabaseUID != "" && tc.SupabaseUID != user.SupabaseUID {
				return nil, nil, http.StatusUnauthorized, "Invalid or expired token"
			}
			return user, claimsFor(user, tc.RegisteredClaims), 0, ""
		} else if errors.Is(err, auth.ErrWrongType) {
			return nil, nil, http.StatusUnauthorized, "Refresh tokens cannot be used as access tokens"
		}
	}

	if a.SupabaseJWTSecret != "" {
		if uid, email, rc, err := verifySupabase(tokenString, a.SupabaseJWTSecret, a.Now); err == nil {
			user, _ := a.Users.GetBySupabaseUID(ctx, uid)
			claims := &UserClaims{SupabaseUID: uid, Email: email, RegisteredClaims: rc}
			if user != nil {
				claims.Role = string(user.Role)
				claims.Email = firstNonEmpty(user.Email, email)
			}
			return user, claims, 0, ""
		}
	}
	return nil, nil, http.StatusUnauthorized, "Invalid or expired token"
}

func claimsFor(user *domain.User, rc jwt.RegisteredClaims) *UserClaims {
	return &UserClaims{
		SupabaseUID:      user.SupabaseUID,
		Email:            user.Email,
		Role:             string(user.Role),
		RegisteredClaims: rc,
	}
}

type supabaseClaims struct {
	Email string `json:"email"`
	jwt.RegisteredClaims
}

func verifySupabase(tokenString, secret string, now func() time.Time) (string, string, jwt.RegisteredClaims, error) {
	opts := []jwt.ParserOption{
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithAudience("authenticated"),
		jwt.WithExpirationRequired(),
		jwt.WithLeeway(5 * time.Second),
	}
	if now != nil {
		opts = append(opts, jwt.WithTimeFunc(now))
	}
	claims := &supabaseClaims{}
	token, err := jwt.NewParser(opts...).ParseWithClaims(tokenString, claims, func(*jwt.Token) (interface{}, error) {
		return []byte(secret), nil
	})
	if err != nil || token == nil || !token.Valid || claims.Subject == "" {
		return "", "", jwt.RegisteredClaims{}, fmt.Errorf("invalid supabase token")
	}
	return claims.Subject, claims.Email, claims.RegisteredClaims, nil
}

func isBlocked(u *domain.User) bool {
	return u.IsSuspended || u.Status == domain.StatusSuspended || string(u.Status) == "DEACTIVATED"
}

func bearerToken(header string) (string, bool) {
	parts := strings.Fields(header)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") || parts[1] == "" {
		return "", false
	}
	return parts[1], true
}

func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if v != "" {
			return v
		}
	}
	return ""
}

// GetUserClaims returns the verified claims placed in the context by the
// Authenticator.
func GetUserClaims(ctx context.Context) (*UserClaims, bool) {
	claims, ok := ctx.Value(UserContextKey).(*UserClaims)
	return claims, ok && claims != nil
}

// GetAuthUser returns the verified, database-backed user for the request.
func GetAuthUser(ctx context.Context) (*domain.User, bool) {
	user, ok := ctx.Value(AuthUserContextKey).(*domain.User)
	return user, ok && user != nil
}

// WithAuthUser attaches a user to a context (used by tests and internal callers).
func WithAuthUser(ctx context.Context, user *domain.User) context.Context {
	claims := claimsFor(user, jwt.RegisteredClaims{})
	ctx = context.WithValue(ctx, UserContextKey, claims)
	return context.WithValue(ctx, AuthUserContextKey, user)
}
