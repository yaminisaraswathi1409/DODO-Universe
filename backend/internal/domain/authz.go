package domain

import (
	"time"

	"github.com/google/uuid"
)

// ----------------------------------------------------------------------------
// Authorization policy
//
//   USER         – may act only on their own resources and on orders where they
//                  are a participant (customer, target vendor, assigned provider).
//   ADMIN        – platform operations: approvals, governance, vendor
//                  suspension, audit, operations dashboards.
//   SUPER_ADMIN  – everything ADMIN can do, plus managing privileged accounts
//                  (granting ADMIN / SUPER_ADMIN, changing another admin's status).
//
// Roles are always read from the database for the verified user. They are never
// taken from a token, header or request body.
// ----------------------------------------------------------------------------

// IsAdmin is true for ADMIN and SUPER_ADMIN. This is the single definition of
// "can use admin APIs"; the web app, the Flutter app and every backend admin
// endpoint must agree with it.
func (u *User) IsAdmin() bool {
	return u != nil && (u.Role == RoleAdmin || u.Role == RoleSuperAdmin)
}

// IsSuperAdmin is true only for SUPER_ADMIN.
func (u *User) IsSuperAdmin() bool {
	return u != nil && u.Role == RoleSuperAdmin
}

// IsBlocked reports suspended/deactivated accounts.
func (u *User) IsBlocked() bool {
	return u != nil && (u.IsSuspended || u.Status == StatusSuspended || string(u.Status) == "DEACTIVATED")
}

// CanGrantRole reports whether u may create or promote an account to role.
// Only a SUPER_ADMIN may mint privileged roles; an ADMIN may only invite USERs.
func (u *User) CanGrantRole(role UserRole) bool {
	switch role {
	case RoleAdmin, RoleSuperAdmin:
		return u.IsSuperAdmin()
	case RoleUser, "":
		return u.IsAdmin()
	default:
		return false
	}
}

// ----------------------------------------------------------------------------
// Driver identity
// ----------------------------------------------------------------------------

// DriverStatus is the lifecycle of an explicit driver identity.
type DriverStatus string

const (
	DriverStatusPending   DriverStatus = "PENDING"
	DriverStatusApproved  DriverStatus = "APPROVED"
	DriverStatusSuspended DriverStatus = "SUSPENDED"
	DriverStatusRejected  DriverStatus = "REJECTED"
)

// DriverProfile is the explicit driver identity of a user. A user is a driver
// only if an APPROVED profile exists – never because a service asset's
// asset_type happens to contain the word "DRIVER".
//
// Storage: table driver_profiles, proposed in
// backend/docs/proposed_migrations/000030_add_driver_profiles.up.sql (not applied).
type DriverProfile struct {
	UserID        uuid.UUID    `json:"user_id"`
	Status        DriverStatus `json:"status"`
	LicenseNumber string       `json:"license_number,omitempty"`
	LicenseClass  string       `json:"license_class,omitempty"`
	LicenseExpiry *time.Time   `json:"license_expiry,omitempty"`
	IsAvailable   bool         `json:"is_available"`
	ApprovedBy    *uuid.UUID   `json:"approved_by,omitempty"`
	ApprovedAt    *time.Time   `json:"approved_at,omitempty"`
	CreatedAt     time.Time    `json:"created_at"`
	UpdatedAt     time.Time    `json:"updated_at"`
}

// IsApproved reports whether the profile grants driver permissions.
func (p *DriverProfile) IsApproved() bool {
	return p != nil && p.Status == DriverStatusApproved
}

