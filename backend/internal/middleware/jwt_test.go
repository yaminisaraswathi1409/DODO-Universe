package middleware_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/uop/backend/internal/auth"
	"github.com/uop/backend/internal/domain"
	"github.com/uop/backend/internal/middleware"
)

const secretA = "0123456789abcdef0123456789abcdef-secret-A"
const supabaseSecret = "supabase-jwt-secret-supabase-jwt-secret-1234"

type fakeUsers struct{ byID map[uuid.UUID]*domain.User }

func (f *fakeUsers) GetByID(_ context.Context, id uuid.UUID) (*domain.User, error) {
	return f.byID[id], nil
}
func (f *fakeUsers) GetBySupabaseUID(_ context.Context, uid string) (*domain.User, error) {
	for _, u := range f.byID {
		if u.SupabaseUID == uid {
			return u, nil
		}
	}
	return nil, nil
}

type env struct {
	tokens *auth.TokenService
	users  *fakeUsers
	now    time.Time
	h      http.Handler
	seen   *seen
}

type seen struct {
	user       *domain.User
	claims     *middleware.UserClaims
	authHeader string
	xUserID    string
	called     bool
}

func newEnv(t *testing.T, supabase string) *env {
	t.Helper()
	e := &env{now: time.Now(), users: &fakeUsers{byID: map[uuid.UUID]*domain.User{}}, seen: &seen{}}
	tokens, err := auth.NewTokenService(auth.TokenConfig{
		Secret: secretA, Issuer: "dodo-test", Audience: "dodo-clients",
		AccessTTL: 15 * time.Minute, RefreshTTL: 24 * time.Hour, Now: func() time.Time { return e.now },
	})
	if err != nil {
		t.Fatal(err)
	}
	e.tokens = tokens
	authn := &middleware.Authenticator{
		Tokens: tokens, SupabaseJWTSecret: supabase, Users: e.users,
		IsPublic: middleware.IsPublicRoute, IsAdminOnly: middleware.IsAdminOnlyRoute,
		Now: func() time.Time { return e.now },
	}
	e.h = authn.Middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		e.seen.called = true
		e.seen.user, _ = middleware.GetAuthUser(r.Context())
		e.seen.claims, _ = middleware.GetUserClaims(r.Context())
		e.seen.authHeader = r.Header.Get("Authorization")
		e.seen.xUserID = r.Header.Get("X-User-ID")
		w.WriteHeader(http.StatusOK)
	}))
	return e
}

func (e *env) addUser(role domain.UserRole, status domain.UserStatus) *domain.User {
	u := &domain.User{ID: uuid.New(), SupabaseUID: "suid-" + uuid.NewString()[:8], Role: role, Status: status, FullName: "T"}
	e.users.byID[u.ID] = u
	return u
}

func (e *env) bearer(u *domain.User) string {
	pair, err := e.tokens.IssuePair(u.ID.String(), u.SupabaseUID)
	if err != nil {
		panic(err)
	}
	return "Bearer " + pair.AccessToken
}

func (e *env) do(method, path, authHeader string, extra map[string]string) *httptest.ResponseRecorder {
	*e.seen = seen{}
	req := httptest.NewRequest(method, "/api/v1"+path, nil)
	if authHeader != "" {
		req.Header.Set("Authorization", authHeader)
	}
	for k, v := range extra {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	e.h.ServeHTTP(rec, req)
	return rec
}

func TestForgedAndRawBearerValuesAreRejected(t *testing.T) {
	e := newEnv(t, "")
	victim := e.addUser(domain.RoleAdmin, domain.StatusActive)

	attacker, _ := auth.NewTokenService(auth.TokenConfig{
		Secret: "ATTACKER-secret-ATTACKER-secret-ATTACKER!!", Issuer: "dodo-test", Audience: "dodo-clients",
		AccessTTL: time.Hour, RefreshTTL: time.Hour,
	})
	forged, _ := attacker.IssuePair(victim.ID.String(), victim.SupabaseUID)

	cases := map[string]string{
		"raw user uuid (old web behaviour)":     "Bearer " + victim.ID.String(),
		"raw supabase uid (old web behaviour)":  "Bearer " + victim.SupabaseUID,
		"token signed with attacker secret":     "Bearer " + forged.AccessToken,
		"bare token without Bearer scheme":      victim.ID.String(),
		"wrong scheme":                          "Basic " + victim.ID.String(),
		"empty bearer":                          "Bearer ",
		"arbitrary string":                      "Bearer not-a-token",
	}
	for name, header := range cases {
		rec := e.do("GET", "/users/me", header, nil)
		if rec.Code != http.StatusUnauthorized {
			t.Errorf("%s: got %d, want 401", name, rec.Code)
		}
		if e.seen.called {
			t.Errorf("%s: handler must not run", name)
		}
	}
}

func TestMissingTokenOnProtectedRoutes(t *testing.T) {
	e := newEnv(t, "")
	for _, route := range [][2]string{
		{"GET", "/users/me"}, {"POST", "/opportunities"}, {"POST", "/upload"}, {"GET", "/users/services"},
		{"POST", "/escrow/settle/abc"}, {"GET", "/admin/operations/metrics"}, {"GET", "/notifications/"},
	} {
		rec := e.do(route[0], route[1], "", nil)
		if rec.Code != http.StatusUnauthorized || e.seen.called {
			t.Errorf("%s %s: got %d called=%v, want 401/not called", route[0], route[1], rec.Code, e.seen.called)
		}
	}
}

func TestValidTokenAttachesVerifiedUserAndStripsHeaders(t *testing.T) {
	e := newEnv(t, "")
	u := e.addUser(domain.RoleUser, domain.StatusActive)
	other := e.addUser(domain.RoleAdmin, domain.StatusActive)

	rec := e.do("GET", "/users/me", e.bearer(u), map[string]string{"X-User-ID": other.ID.String()})
	if rec.Code != http.StatusOK {
		t.Fatalf("got %d", rec.Code)
	}
	if e.seen.user == nil || e.seen.user.ID != u.ID {
		t.Fatalf("verified user not attached: %+v", e.seen.user)
	}
	if e.seen.claims.SupabaseUID != u.SupabaseUID || e.seen.claims.Role != string(domain.RoleUser) {
		t.Fatalf("claims must come from the database user: %+v", e.seen.claims)
	}
	if e.seen.xUserID != "" {
		t.Error("X-User-ID must be stripped before reaching handlers")
	}
	if e.seen.authHeader != "" {
		t.Error("the raw Authorization header must not reach handlers")
	}
}

func TestExpiredAndWrongTypeTokensRejected(t *testing.T) {
	e := newEnv(t, "")
	u := e.addUser(domain.RoleUser, domain.StatusActive)
	pair, _ := e.tokens.IssuePair(u.ID.String(), u.SupabaseUID)

	if rec := e.do("GET", "/users/me", "Bearer "+pair.RefreshToken, nil); rec.Code != http.StatusUnauthorized {
		t.Errorf("refresh token used as access token: got %d, want 401", rec.Code)
	}
	e.now = e.now.Add(16 * time.Minute)
	if rec := e.do("GET", "/users/me", "Bearer "+pair.AccessToken, nil); rec.Code != http.StatusUnauthorized {
		t.Errorf("expired access token: got %d, want 401", rec.Code)
	}
}

func TestDeletedAccountAndMismatchedIdentityRejected(t *testing.T) {
	e := newEnv(t, "")
	u := e.addUser(domain.RoleUser, domain.StatusActive)
	header := e.bearer(u)

	// Account renamed/rotated: token's account identifier no longer matches.
	u.SupabaseUID = "rotated"
	if rec := e.do("GET", "/users/me", header, nil); rec.Code != http.StatusUnauthorized {
		t.Errorf("identifier mismatch: got %d, want 401", rec.Code)
	}
	u.SupabaseUID = "restored"
	header = e.bearer(u)
	delete(e.users.byID, u.ID)
	if rec := e.do("GET", "/users/me", header, nil); rec.Code != http.StatusUnauthorized {
		t.Errorf("deleted account: got %d, want 401", rec.Code)
	}
}

func TestSuspendedAccountsAreBlockedExceptProfile(t *testing.T) {
	e := newEnv(t, "")
	for _, u := range []*domain.User{
		e.addUser(domain.RoleUser, domain.StatusSuspended),
		func() *domain.User { x := e.addUser(domain.RoleUser, domain.StatusActive); x.IsSuspended = true; return x }(),
	} {
		h := e.bearer(u)
		if rec := e.do("GET", "/users/me", h, nil); rec.Code != http.StatusOK {
			t.Errorf("suspended user must still read /users/me, got %d", rec.Code)
		}
		if rec := e.do("POST", "/opportunities", h, nil); rec.Code != http.StatusForbidden {
			t.Errorf("suspended user: got %d, want 403", rec.Code)
		}
	}
}

func TestPublicRoutesWorkAnonymouslyAndIgnoreBadTokens(t *testing.T) {
	e := newEnv(t, "")
	for _, route := range [][2]string{
		{"GET", "/health"}, {"GET", "/categories"}, {"GET", "/categories/tree"}, {"GET", "/catalog/search"},
		{"GET", "/catalog/items/abc"}, {"POST", "/auth/request-otp"}, {"POST", "/users/verify-otp"},
		{"POST", "/auth/refresh"}, {"GET", "/vendors/123/catalog"}, {"POST", "/cart/validate"},
		{"GET", "/files/signed/tok.en"},
	} {
		if rec := e.do(route[0], route[1], "", nil); rec.Code != http.StatusOK {
			t.Errorf("%s %s anonymously: got %d, want 200", route[0], route[1], rec.Code)
		}
		// A stale/garbage token on a public route is treated as anonymous (not 401).
		rec := e.do(route[0], route[1], "Bearer stale-garbage", nil)
		if rec.Code != http.StatusOK || e.seen.user != nil {
			t.Errorf("%s %s with bad token: got %d user=%v, want anonymous 200", route[0], route[1], rec.Code, e.seen.user)
		}
	}
	// Non-public siblings stay protected.
	for _, route := range [][2]string{{"POST", "/categories"}, {"DELETE", "/categories/abc"}, {"GET", "/opportunities/abc"}, {"POST", "/checkout/initiate"}} {
		if rec := e.do(route[0], route[1], "", nil); rec.Code != http.StatusUnauthorized {
			t.Errorf("%s %s: got %d, want 401", route[0], route[1], rec.Code)
		}
	}
}

func TestAdminPolicy_UserAdminAndSuperAdminBoundaries(t *testing.T) {
	e := newEnv(t, "")
	user := e.addUser(domain.RoleUser, domain.StatusActive)
	admin := e.addUser(domain.RoleAdmin, domain.StatusActive)
	super := e.addUser(domain.RoleSuperAdmin, domain.StatusActive)

	adminRoutes := [][2]string{
		{"GET", "/admin/operations/metrics"}, {"GET", "/admin/operations/audit-logs"},
		{"POST", "/admin/vendors/abc/suspend"}, {"GET", "/admin/catalog/requests"},
		{"POST", "/admin/forms/schemas"}, {"PUT", "/admin/categories/abc/parent"},
		{"GET", "/admin/services/requests"}, {"POST", "/categories"}, {"DELETE", "/categories/abc"},
		{"GET", "/users/list"}, {"POST", "/users/status"}, {"POST", "/users/invite"},
	}
	for _, route := range adminRoutes {
		if rec := e.do(route[0], route[1], e.bearer(user), nil); rec.Code != http.StatusForbidden || e.seen.called {
			t.Errorf("USER %s %s: got %d called=%v, want 403", route[0], route[1], rec.Code, e.seen.called)
		}
		for name, u := range map[string]*domain.User{"ADMIN": admin, "SUPER_ADMIN": super} {
			if rec := e.do(route[0], route[1], e.bearer(u), nil); rec.Code != http.StatusOK {
				t.Errorf("%s %s %s: got %d, want 200 (both admin roles share admin API access)", name, route[0], route[1], rec.Code)
			}
		}
	}
	// Non-admin routes remain available to ordinary users.
	if rec := e.do("GET", "/users/me", e.bearer(user), nil); rec.Code != http.StatusOK {
		t.Errorf("ordinary route blocked for user: %d", rec.Code)
	}
}

func TestSupabaseIssuedTokens(t *testing.T) {
	mk := func(secret, aud string, exp time.Time, sub string) string {
		tok := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
			"sub": sub, "email": "s@example.com", "aud": aud, "exp": exp.Unix(),
		})
		s, _ := tok.SignedString([]byte(secret))
		return s
	}

	// Disabled when no secret is configured: a Supabase-shaped token is just garbage.
	off := newEnv(t, "")
	u := off.addUser(domain.RoleUser, domain.StatusActive)
	if rec := off.do("GET", "/users/me", "Bearer "+mk(supabaseSecret, "authenticated", off.now.Add(time.Hour), u.SupabaseUID), nil); rec.Code != http.StatusUnauthorized {
		t.Errorf("supabase tokens must be refused when SUPABASE_JWT_SECRET is not configured, got %d", rec.Code)
	}

	e := newEnv(t, supabaseSecret)
	u = e.addUser(domain.RoleUser, domain.StatusActive)
	good := mk(supabaseSecret, "authenticated", e.now.Add(time.Hour), u.SupabaseUID)
	if rec := e.do("GET", "/users/me", "Bearer "+good, nil); rec.Code != http.StatusOK || e.seen.user == nil || e.seen.user.ID != u.ID {
		t.Errorf("valid supabase token rejected: %d", rec.Code)
	}
	for name, tok := range map[string]string{
		"wrong secret":   mk("wrong-secret-wrong-secret-wrong-secret-12", "authenticated", e.now.Add(time.Hour), u.SupabaseUID),
		"wrong audience": mk(supabaseSecret, "somebody-else", e.now.Add(time.Hour), u.SupabaseUID),
		"expired":        mk(supabaseSecret, "authenticated", e.now.Add(-time.Hour), u.SupabaseUID),
	} {
		if rec := e.do("GET", "/users/me", "Bearer "+tok, nil); rec.Code != http.StatusUnauthorized {
			t.Errorf("supabase token (%s): got %d, want 401", name, rec.Code)
		}
	}
	// A Supabase token for an unknown account may only reach routes that tolerate
	// no database user (e.g. sync); admin routes are closed to it.
	unknown := mk(supabaseSecret, "authenticated", e.now.Add(time.Hour), "no-such-user")
	if rec := e.do("GET", "/admin/operations/metrics", "Bearer "+unknown, nil); rec.Code != http.StatusForbidden {
		t.Errorf("unknown supabase identity on admin route: got %d, want 403", rec.Code)
	}
}

func TestRoutePolicyTables(t *testing.T) {
	public := map[[2]string]bool{
		{"GET", "/health"}: true, {"POST", "/auth/refresh"}: true, {"GET", "/catalog/search"}: true,
		{"GET", "/catalog/items/42"}: true, {"GET", "/categories/9/vendors"}: true,
		{"POST", "/upload"}: false, {"GET", "/users/me"}: false, {"POST", "/catalog/search"}: false,
		{"GET", "/uploads/x.png"}: false, {"GET", "/admin/anything"}: false, {"DELETE", "/categories/9"}: false,
		{"GET", "/files/private/a/b"}: false,
	}
	for r, want := range public {
		if got := middleware.IsPublicRoute(r[0], r[1]); got != want {
			t.Errorf("IsPublicRoute(%s %s) = %v, want %v", r[0], r[1], got, want)
		}
	}
	admin := map[[2]string]bool{
		{"GET", "/admin/x"}: true, {"POST", "/admin/forms/schemas"}: true, {"POST", "/categories"}: true,
		{"GET", "/categories"}: false, {"GET", "/users/list"}: true, {"GET", "/users/me"}: false,
		{"POST", "/users/status"}: true, {"POST", "/users/verify-otp"}: false,
	}
	for r, want := range admin {
		if got := middleware.IsAdminOnlyRoute(r[0], r[1]); got != want {
			t.Errorf("IsAdminOnlyRoute(%s %s) = %v, want %v", r[0], r[1], got, want)
		}
	}
}

