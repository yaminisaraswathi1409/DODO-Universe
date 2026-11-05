// Package runtimeenv answers one question consistently across the backend:
// "is this an explicitly-declared development/test environment?".
//
// The answer is secure by default. Anything other than an explicit development
// value (including an unset ENV/APP_ENV) is treated as production, so a
// deployment that forgets to set ENV can never enable development-only
// behaviour such as returning OTP codes in API responses.
package runtimeenv

import (
	"os"
	"strings"
)

var developmentValues = map[string]bool{
	"development": true,
	"dev":         true,
	"local":       true,
	"test":        true,
}

// IsDevelopment reports whether ENV or APP_ENV explicitly names a development
// environment. If either variable names production, production wins.
func IsDevelopment() bool {
	env := normalize(os.Getenv("ENV"))
	appEnv := normalize(os.Getenv("APP_ENV"))

	if env == "production" || env == "prod" || appEnv == "production" || appEnv == "prod" {
		return false
	}
	return developmentValues[env] || developmentValues[appEnv]
}

// IsProduction is the inverse of IsDevelopment.
func IsProduction() bool { return !IsDevelopment() }

func normalize(v string) string { return strings.ToLower(strings.TrimSpace(v)) }

