package middleware

import "strings"

// publicRoute is a method + path pattern relative to /api/v1. "{}" matches one
// path segment.
type publicRoute struct {
	method  string
	pattern string
}

// publicRoutes is the complete allow-list of API routes reachable without
// authentication. Everything else requires a verified access token
// (deny-by-default). Keep this list short and review every addition.
var publicRoutes = []publicRoute{
	{"GET", "/health"},

	// Sign-in flow.
	{"POST", "/auth/request-otp"},
	{"POST", "/auth/signup"},
	{"POST", "/auth/refresh"},
	{"POST", "/users/verify-otp"},

	// Public marketplace browsing.
	{"GET", "/categories"},
	{"GET", "/categories/tree"},
	{"GET", "/categories/{}/vendors"},
	{"GET", "/catalog/search"},
	{"GET", "/catalog/items/{}"},
	{"GET", "/catalog/compare"},
	{"POST", "/catalog/compare"},
	{"GET", "/catalog/{}"},
	{"GET", "/vendors/{}/catalog"},
	{"GET", "/vendors/{}/catalog/tree"},
	{"GET", "/opportunities/public"},
	{"POST", "/cart/validate"},

	// Signed private-file downloads: the handler validates the HMAC signature
	// and expiry itself.
	{"GET", "/files/signed/{}"},
}

// IsPublicRoute reports whether method+path (relative to /api/v1) may be
// called without authentication.
func IsPublicRoute(method, path string) bool {
	path = strings.TrimRight(path, "/")
	if path == "" {
		path = "/"
	}
	for _, route := range publicRoutes {
		if route.method == method && matchPattern(route.pattern, path) {
			return true
		}
	}
	return false
}

func matchPattern(pattern, path string) bool {
	p := strings.Split(strings.Trim(pattern, "/"), "/")
	s := strings.Split(strings.Trim(path, "/"), "/")
	if len(p) != len(s) {
		return false
	}
	for i := range p {
		if p[i] == "{}" {
			if s[i] == "" {
				return false
			}
			continue
		}
		if p[i] != s[i] {
			return false
		}
	}
	return true
}

// adminOnlyRoutes lists routes (relative to /api/v1) that only ADMIN and
// SUPER_ADMIN may call, in addition to the blanket /admin/* prefix. Individual
// handlers still perform their own checks (and stricter SUPER_ADMIN checks).
var adminOnlyRoutes = []publicRoute{
	{"POST", "/categories"},
	{"DELETE", "/categories/{}"},
	{"GET", "/users/list"},
	{"POST", "/users/status"},
	{"POST", "/users/invite"},
}

// IsAdminOnlyRoute reports whether method+path requires an administrator.
func IsAdminOnlyRoute(method, path string) bool {
	trimmed := strings.TrimRight(path, "/")
	if trimmed == "/admin" || strings.HasPrefix(trimmed, "/admin/") {
		return true
	}
	for _, route := range adminOnlyRoutes {
		if route.method == method && matchPattern(route.pattern, trimmed) {
			return true
		}
	}
	return false
}
