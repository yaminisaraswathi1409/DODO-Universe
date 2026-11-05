package handler

import (
	"context"
	"net/http"

	"github.com/google/uuid"
	"github.com/uop/backend/internal/authz"
	"github.com/uop/backend/internal/domain"
	"github.com/uop/backend/internal/service"
	"github.com/uop/backend/pkg/response"
)

// OrderAccessSource is what the logistics authorization layer needs from the
// service layer. *service.LogisticsService implements it; tests substitute a fake.
type OrderAccessSource interface {
	OrderAccess(ctx context.Context, oppID uuid.UUID) (*service.OrderAccess, error)
	VehicleOwnerID(ctx context.Context, vehicleID uuid.UUID) (uuid.UUID, error)
	IncidentOpportunityID(ctx context.Context, incidentID uuid.UUID) (uuid.UUID, error)
}

// SetAccessSource replaces the order access source (tests).
func (h *LogisticsHandler) SetAccessSource(src OrderAccessSource) { h.access = src }

// SetDriverPolicy configures explicit-driver enforcement. When enforce is true,
// a user may only be assigned as a driver if they hold an APPROVED
// driver_profiles record. It is off by default because driver_profiles is a
// proposed (not yet applied) migration; turning it on before the table is
// populated would block every driver assignment.
func (h *LogisticsHandler) SetDriverPolicy(lookup authz.DriverLookup, enforce bool) {
	h.drivers = lookup
	h.enforceDriverProfile = enforce
}

// requireOrderRole allows admins and users holding one of roles on the order.
func (h *LogisticsHandler) requireOrderRole(w http.ResponseWriter, r *http.Request, oppID uuid.UUID, roles ...service.OrderRole) (*domain.User, bool) {
	caller, err := authz.CurrentUser(r)
	if authz.Write(w, err) {
		return nil, false
	}
	if caller.IsAdmin() {
		return caller, true
	}
	if h.access == nil {
		response.Error(w, http.StatusServiceUnavailable, "Authorization service unavailable", nil)
		return nil, false
	}
	access, aerr := h.access.OrderAccess(r.Context(), oppID)
	if aerr != nil || access == nil {
		response.Error(w, http.StatusNotFound, "Order not found", nil)
		return nil, false
	}
	if !access.HasAny(caller.ID, roles...) {
		response.Error(w, http.StatusForbidden, "You are not authorised to act on this order", nil)
		return nil, false
	}
	return caller, true
}

// requireAuthenticated resolves the verified caller or writes 401.
func (h *LogisticsHandler) requireAuthenticated(w http.ResponseWriter, r *http.Request) (*domain.User, bool) {
	caller, err := authz.CurrentUser(r)
	if authz.Write(w, err) {
		return nil, false
	}
	return caller, true
}

// checkDriverAssignable enforces the explicit driver identity when enabled.
func (h *LogisticsHandler) checkDriverAssignable(w http.ResponseWriter, r *http.Request, driverID uuid.UUID) bool {
	if !h.enforceDriverProfile {
		return true
	}
	if h.drivers == nil {
		response.Error(w, http.StatusServiceUnavailable, "Driver registry unavailable", nil)
		return false
	}
	profile, err := h.drivers.GetDriverProfile(r.Context(), driverID)
	if err != nil || !profile.IsApproved() {
		response.Error(w, http.StatusForbidden, "The selected user is not an approved driver", nil)
		return false
	}
	return true
}

// vendorFromRequest returns the vendor whose orders are requested: the verified
// caller, or - for admins only - the vendor_id query parameter.
func (h *LogisticsHandler) vendorFromRequest(r *http.Request) uuid.UUID {
	caller, err := authz.CurrentUser(r)
	if err != nil {
		return uuid.Nil
	}
	if caller.IsAdmin() {
		if id, perr := uuid.Parse(r.URL.Query().Get("vendor_id")); perr == nil {
			return id
		}
	}
	return caller.ID
}

// authorizeVehicleAction allows the vehicle's owner or an admin.
func (h *LogisticsHandler) authorizeVehicleAction(w http.ResponseWriter, r *http.Request, vehicleID uuid.UUID) bool {
	caller, ok := h.requireAuthenticated(w, r)
	if !ok {
		return false
	}
	if caller.IsAdmin() {
		return true
	}
	if h.access == nil {
		response.Error(w, http.StatusServiceUnavailable, "Authorization service unavailable", nil)
		return false
	}
	owner, err := h.access.VehicleOwnerID(r.Context(), vehicleID)
	if err != nil {
		response.Error(w, http.StatusNotFound, "Vehicle not found", nil)
		return false
	}
	if owner != caller.ID {
		response.Error(w, http.StatusForbidden, "You can only use vehicles you own", nil)
		return false
	}
	return true
}

// authorizeIncident allows admins and providers on the order the incident belongs to.
func (h *LogisticsHandler) authorizeIncident(w http.ResponseWriter, r *http.Request, incidentID uuid.UUID) bool {
	caller, ok := h.requireAuthenticated(w, r)
	if !ok {
		return false
	}
	if caller.IsAdmin() {
		return true
	}
	if h.access == nil {
		response.Error(w, http.StatusServiceUnavailable, "Authorization service unavailable", nil)
		return false
	}
	oppID, err := h.access.IncidentOpportunityID(r.Context(), incidentID)
	if err != nil {
		response.Error(w, http.StatusNotFound, "Incident not found", nil)
		return false
	}
	_, ok = h.requireOrderRole(w, r, oppID, service.RoleOrderProvider)
	return ok
}
