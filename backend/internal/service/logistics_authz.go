package service

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/uop/backend/internal/domain"
)

// OrderRole identifies how a user relates to an order. Roles are derived only
// from existing records (opportunity ownership/assignment, way manifest); no
// new tables are involved.
type OrderRole int

const (
	// RoleOrderOwner is the customer who created the order (or any order in its chain).
	RoleOrderOwner OrderRole = iota
	// RoleOrderProvider is the target vendor, assigned provider, or the vendor /
	// transport provider recorded on the way manifest, anywhere in the order chain.
	RoleOrderProvider
	// RoleOrderDriver is the driver recorded on the way manifest.
	RoleOrderDriver
)

// OrderAccess answers "who may act on this order" for the authorization layer.
type OrderAccess struct {
	// Chain is the opportunity and its ancestors (nearest first).
	Chain    []*domain.Opportunity
	Manifest *domain.WayManifest
}

// Has reports whether userID holds role on the order.
func (a *OrderAccess) Has(userID uuid.UUID, role OrderRole) bool {
	if a == nil || userID == uuid.Nil {
		return false
	}
	switch role {
	case RoleOrderOwner:
		for _, o := range a.Chain {
			if o.UserID == userID {
				return true
			}
		}
	case RoleOrderProvider:
		for _, o := range a.Chain {
			if o.AssignedUserID != nil && *o.AssignedUserID == userID {
				return true
			}
			if o.TargetVendorID != nil && *o.TargetVendorID == userID {
				return true
			}
		}
		if m := a.Manifest; m != nil {
			if m.VendorID != nil && *m.VendorID == userID {
				return true
			}
			if m.TransportProviderID != nil && *m.TransportProviderID == userID {
				return true
			}
		}
	case RoleOrderDriver:
		if m := a.Manifest; m != nil && m.DriverID != nil && *m.DriverID == userID {
			return true
		}
	}
	return false
}

// HasAny reports whether userID holds at least one of the roles.
func (a *OrderAccess) HasAny(userID uuid.UUID, roles ...OrderRole) bool {
	for _, r := range roles {
		if a.Has(userID, r) {
			return true
		}
	}
	return false
}

// OrderAccess loads the opportunity chain and manifest for oppID.
func (s *LogisticsService) OrderAccess(ctx context.Context, oppID uuid.UUID) (*OrderAccess, error) {
	access := &OrderAccess{}
	current := oppID
	for depth := 0; depth < 6 && current != uuid.Nil; depth++ {
		opp, err := s.opportunityRepo.GetByID(ctx, current)
		if err != nil {
			return nil, err
		}
		if opp == nil {
			if depth == 0 {
				return nil, fmt.Errorf("order not found")
			}
			break
		}
		access.Chain = append(access.Chain, opp)
		if opp.ParentOpportunityID == nil {
			break
		}
		current = *opp.ParentOpportunityID
	}
	if m, err := s.logisticsRepo.GetManifestByOpportunityID(ctx, oppID); err == nil {
		access.Manifest = m
	}
	return access, nil
}

// VehicleOwnerID returns the user who owns a vehicle asset.
func (s *LogisticsService) VehicleOwnerID(ctx context.Context, vehicleID uuid.UUID) (uuid.UUID, error) {
	return s.logisticsRepo.GetVehicleOwnerID(ctx, vehicleID)
}

// IncidentOpportunityID returns the order an SOS incident belongs to.
func (s *LogisticsService) IncidentOpportunityID(ctx context.Context, incidentID uuid.UUID) (uuid.UUID, error) {
	return s.logisticsRepo.GetIncidentOpportunityID(ctx, incidentID)
}

