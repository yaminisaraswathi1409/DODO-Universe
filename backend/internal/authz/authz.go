// Package authz centralises authorization decisions for HTTP handlers. Every
// helper derives identity from the context populated by the authentication
// middleware (a verified token + the database role) and from nothing else.
package authz

import (
	"context"
	"errors"
	"net/http"

	"github.com/google/uuid"
	"github.com/uop/backend/internal/domain"
	"github.com/uop/backend/internal/middleware"
	"github.com/uop/backend/pkg/response"
)

var (
	// ErrUnauthenticated means no verified identity is attached to the request.
	ErrUnauthenticated = errors.New("authentication required")
	// ErrForbidden means the verified user lacks permission.
	ErrForbidden = errors.New("insufficient permissions")
)

// CurrentUser returns the verified user for the request.
func CurrentUser(r *http.Request) (*domain.User, error) {
	user, ok := middleware.GetAuthUser(r.Context())
	if !ok {
		return nil, ErrUnauthenticated
	}
	return user, nil
}

// CurrentUserID returns the verified user's ID, or uuid.Nil if unauthenticated.
func CurrentUserID(r *http.Request) uuid.UUID {
	if user, err := CurrentUser(r); err == nil {
		return user.ID
	}
	return uuid.Nil
}

// RequireAdmin allows ADMIN and SUPER_ADMIN.
func RequireAdmin(r *http.Request) (*domain.User, error) {
	user, err := CurrentUser(r)
	if err != nil {
		return nil, err
	}
	if !user.IsAdmin() {
		return nil, ErrForbidden
	}
	return user, nil
}

// RequireSuperAdmin allows SUPER_ADMIN only.
func RequireSuperAdmin(r *http.Request) (*domain.User, error) {
	user, err := CurrentUser(r)
	if err != nil {
		return nil, err
	}
	if !user.IsSuperAdmin() {
		return nil, ErrForbidden
	}
	return user, nil
}

// RequireSelfOrAdmin allows the target user themself or any admin.
func RequireSelfOrAdmin(r *http.Request, target uuid.UUID) (*domain.User, error) {
	user, err := CurrentUser(r)
	if err != nil {
		return nil, err
	}
	if user.ID != target && !user.IsAdmin() {
		return nil, ErrForbidden
	}
	return user, nil
}

// DriverLookup loads explicit driver identities.
type DriverLookup interface {
	GetDriverProfile(ctx context.Context, userID uuid.UUID) (*domain.DriverProfile, error)
}

// RequireDriver allows a user with an APPROVED driver profile. Admins are not
// implicitly drivers.
func RequireDriver(r *http.Request, lookup DriverLookup) (*domain.User, *domain.DriverProfile, error) {
	user, err := CurrentUser(r)
	if err != nil {
		return nil, nil, err
	}
	if lookup == nil {
		return nil, nil, ErrForbidden
	}
	profile, err := lookup.GetDriverProfile(r.Context(), user.ID)
	if err != nil || !profile.IsApproved() {
		return nil, nil, ErrForbidden
	}
	return user, profile, nil
}

// Write maps an authz error to the right HTTP response and reports whether it
// wrote one.
func Write(w http.ResponseWriter, err error) bool {
	switch {
	case err == nil:
		return false
	case errors.Is(err, ErrUnauthenticated):
		response.Error(w, http.StatusUnauthorized, "Authentication required", nil)
	default:
		response.Error(w, http.StatusForbidden, "You do not have permission to perform this action", nil)
	}
	return true
}

