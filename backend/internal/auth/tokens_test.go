package auth_test

import (
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/uop/backend/internal/auth"
)

const testSecret = "0123456789abcdef0123456789abcdef-secret-A"

type clock struct{ t time.Time }

func (c *clock) now() time.Time { return c.t }

func newTokens(t *testing.T, secret string, c *clock) *auth.TokenService {
	t.Helper()
	svc, err := auth.NewTokenService(auth.TokenConfig{
		Secret: secret, Issuer: "dodo-test", Audience: "dodo-clients",
		AccessTTL: 15 * time.Minute, RefreshTTL: 24 * time.Hour, Now: c.now,
	})
	if err != nil {
		t.Fatalf("NewTokenService: %v", err)
	}
	return svc
}

func TestTokenService_RejectsWeakConfig(t *testing.T) {
	cases := map[string]auth.TokenConfig{
		"empty secret": {Secret: "", Issuer: "i", Audience: "a", AccessTTL: time.Minute, RefreshTTL: time.Hour},
		"short secret": {Secret: "short", Issuer: "i", Audience: "a", AccessTTL: time.Minute, RefreshTTL: time.Hour},
		"no issuer":    {Secret: testSecret, Issuer: "", Audience: "a", AccessTTL: time.Minute, RefreshTTL: time.Hour},
		"zero ttl":     {Secret: testSecret, Issuer: "i", Audience: "a", AccessTTL: 0, RefreshTTL: time.Hour},
	}
	for name, cfg := range cases {
		if _, err := auth.NewTokenService(cfg); err == nil {
			t.Errorf("%s: expected error", name)
		}
	}
}

func TestTokenService_ValidAccessToken(t *testing.T) {
	c := &clock{t: time.Now()}
	svc := newTokens(t, testSecret, c)
	pair, err := svc.IssuePair("user-1", "suid-1")
	if err != nil {
		t.Fatal(err)
	}
	claims, err := svc.Verify(pair.AccessToken, auth.TokenTypeAccess)
	if err != nil {
		t.Fatalf("valid token rejected: %v", err)
	}
	if claims.UserID() != "user-1" || claims.SupabaseUID != "suid-1" {
		t.Fatalf("unexpected claims: %+v", claims)
	}
	if pair.TokenType != "Bearer" || pair.ExpiresIn != 900 {
		t.Fatalf("unexpected pair metadata: %+v", pair)
	}
}

func TestTokenService_ForgedTokenRejected(t *testing.T) {
	c := &clock{t: time.Now()}
	victim := newTokens(t, testSecret, c)
	attacker := newTokens(t, "ATTACKER-secret-ATTACKER-secret-ATTACKER!!", c)

	forged, _ := attacker.IssuePair("admin-user-id", "suid-admin")
	if _, err := victim.Verify(forged.AccessToken, auth.TokenTypeAccess); err == nil {
		t.Fatal("token signed with a different secret must be rejected")
	}

	// A raw identifier (what the old backend accepted) is not a token.
	for _, raw := range []string{"phone_ab12cd34_1700000000", "6f1c2b9e-0000-4000-8000-000000000001", "x", ""} {
		if _, err := victim.Verify(raw, auth.TokenTypeAccess); err == nil {
			t.Errorf("raw identifier %q accepted as a token", raw)
		}
	}
}

func TestTokenService_TamperedPayloadRejected(t *testing.T) {
	c := &clock{t: time.Now()}
	svc := newTokens(t, testSecret, c)
	pair, _ := svc.IssuePair("user-1", "suid-1")
	parts := strings.Split(pair.AccessToken, ".")
	// Swap in a payload for another subject, keep the original signature.
	other, _ := svc.IssuePair("user-2", "suid-2")
	otherParts := strings.Split(other.AccessToken, ".")
	tampered := parts[0] + "." + otherParts[1] + "." + parts[2]
	if _, err := svc.Verify(tampered, auth.TokenTypeAccess); err == nil {
		t.Fatal("tampered payload must be rejected")
	}
}

func TestTokenService_ExpiredTokenRejected(t *testing.T) {
	c := &clock{t: time.Now()}
	svc := newTokens(t, testSecret, c)
	pair, _ := svc.IssuePair("user-1", "suid-1")

	c.t = c.t.Add(14 * time.Minute)
	if _, err := svc.Verify(pair.AccessToken, auth.TokenTypeAccess); err != nil {
		t.Fatalf("token should still be valid at 14m: %v", err)
	}
	c.t = c.t.Add(2 * time.Minute) // 16m > 15m TTL (+5s leeway)
	if _, err := svc.Verify(pair.AccessToken, auth.TokenTypeAccess); err == nil {
		t.Fatal("expired access token must be rejected")
	}
	// The refresh token is still good for much longer.
	if _, err := svc.Verify(pair.RefreshToken, auth.TokenTypeRefresh); err != nil {
		t.Fatalf("refresh token should still be valid: %v", err)
	}
	c.t = c.t.Add(25 * time.Hour)
	if _, err := svc.Verify(pair.RefreshToken, auth.TokenTypeRefresh); err == nil {
		t.Fatal("expired refresh token must be rejected")
	}
}

func TestTokenService_WrongIssuerAudienceAndType(t *testing.T) {
	c := &clock{t: time.Now()}
	svc := newTokens(t, testSecret, c)

	otherIssuer, _ := auth.NewTokenService(auth.TokenConfig{
		Secret: testSecret, Issuer: "someone-else", Audience: "dodo-clients",
		AccessTTL: time.Minute, RefreshTTL: time.Hour, Now: c.now,
	})
	p, _ := otherIssuer.IssuePair("u", "s")
	if _, err := svc.Verify(p.AccessToken, auth.TokenTypeAccess); err == nil {
		t.Error("wrong issuer must be rejected")
	}

	otherAud, _ := auth.NewTokenService(auth.TokenConfig{
		Secret: testSecret, Issuer: "dodo-test", Audience: "another-audience",
		AccessTTL: time.Minute, RefreshTTL: time.Hour, Now: c.now,
	})
	p, _ = otherAud.IssuePair("u", "s")
	if _, err := svc.Verify(p.AccessToken, auth.TokenTypeAccess); err == nil {
		t.Error("wrong audience must be rejected")
	}

	pair, _ := svc.IssuePair("u", "s")
	if _, err := svc.Verify(pair.RefreshToken, auth.TokenTypeAccess); err == nil {
		t.Error("a refresh token must not be accepted as an access token")
	}
	if _, err := svc.Verify(pair.AccessToken, auth.TokenTypeRefresh); err == nil {
		t.Error("an access token must not be accepted as a refresh token")
	}
}

func TestTokenService_RejectsNoneAndOtherAlgorithms(t *testing.T) {
	c := &clock{t: time.Now()}
	svc := newTokens(t, testSecret, c)
	claims := auth.Claims{
		SupabaseUID: "s", Type: auth.TokenTypeAccess,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer: "dodo-test", Subject: "u", Audience: jwt.ClaimStrings{"dodo-clients"},
			ExpiresAt: jwt.NewNumericDate(c.t.Add(time.Hour)), IssuedAt: jwt.NewNumericDate(c.t),
		},
	}

	none, _ := jwt.NewWithClaims(jwt.SigningMethodNone, claims).SignedString(jwt.UnsafeAllowNoneSignatureType)
	if _, err := svc.Verify(none, auth.TokenTypeAccess); err == nil {
		t.Error("alg=none token must be rejected")
	}

	hs512, _ := jwt.NewWithClaims(jwt.SigningMethodHS512, claims).SignedString([]byte(testSecret))
	if _, err := svc.Verify(hs512, auth.TokenTypeAccess); err == nil {
		t.Error("only HS256 is accepted; HS512 must be rejected")
	}
}

func TestTokenService_MissingExpiryRejected(t *testing.T) {
	c := &clock{t: time.Now()}
	svc := newTokens(t, testSecret, c)
	claims := auth.Claims{
		Type: auth.TokenTypeAccess,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer: "dodo-test", Subject: "u", Audience: jwt.ClaimStrings{"dodo-clients"},
		},
	}
	tok, _ := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(testSecret))
	if _, err := svc.Verify(tok, auth.TokenTypeAccess); err == nil {
		t.Fatal("a token without an expiry must be rejected")
	}
}

func TestTokenClaims_DoNotCarryRole(t *testing.T) {
	c := &clock{t: time.Now()}
	svc := newTokens(t, testSecret, c)
	pair, _ := svc.IssuePair("u", "s")
	payload := strings.Split(pair.AccessToken, ".")[1]
	raw, err := jwt.NewParser().DecodeSegment(payload)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(strings.ToLower(string(raw)), "role") {
		t.Fatalf("tokens must not carry a role claim (roles come from the database): %s", raw)
	}
}

