package service

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/uop/backend/internal/domain"
)

// ============================================================================
// PHASE 6: ORDER FULFILMENT & LOGISTICS MANAGEMENT SERVICE METHODS
// ============================================================================

// 1. Vendor Order Reception
func (s *LogisticsService) GetVendorOrders(ctx context.Context, vendorID uuid.UUID, status string, limit int) ([]*domain.Opportunity, error) {
	return s.logisticsRepo.GetVendorOrders(ctx, vendorID, status, limit)
}

func (s *LogisticsService) GetVendorOrderDetail(ctx context.Context, oppID, vendorID uuid.UUID) (*domain.Opportunity, error) {
	return s.logisticsRepo.GetVendorOrderDetail(ctx, oppID, vendorID)
}

// 2. Vendor Order Decision (Accept, Reject with reason, Prepare, Ready for Pickup)
func (s *LogisticsService) ExecuteVendorAction(ctx context.Context, oppID, vendorID uuid.UUID, req *domain.VendorOrderActionRequest) error {
	if req == nil {
		return fmt.Errorf("action request payload is required")
	}
	return s.logisticsRepo.ExecuteVendorAction(ctx, oppID, vendorID, req)
}

// 3. State Machine Status Transition
func (s *LogisticsService) TransitionOrderStatus(ctx context.Context, oppID uuid.UUID, toStatus domain.OpportunityStatus, changedBy *uuid.UUID, notes string) error {
	return s.logisticsRepo.TransitionOrderStatus(ctx, oppID, toStatus, changedBy, notes)
}

// 4. Logistics Transport Provider Proximity Matching
func (s *LogisticsService) MatchTransportProviders(ctx context.Context, req *domain.LogisticsProviderMatchRequest) ([]*domain.EligibleLogisticsProvider, error) {
	if req == nil {
		return nil, fmt.Errorf("matching request payload is required")
	}
	return s.logisticsRepo.FindEligibleTransportProviders(ctx, req)
}

// 5. Driver & Vehicle Assignment with Conflict Protection
func (s *LogisticsService) AssignDriverAndVehicle(ctx context.Context, req *domain.AssignDriverVehicleRequest) (*domain.VehicleDriverPairing, error) {
	if req == nil {
		return nil, fmt.Errorf("assignment request payload is required")
	}
	if req.VehicleID == uuid.Nil || req.DriverID == uuid.Nil {
		return nil, fmt.Errorf("both vehicle_id and driver_id are required")
	}
	return s.logisticsRepo.AssignDriverAndVehicle(ctx, req)
}

// 6. Extended Digital Way Manifest Generation
func (s *LogisticsService) GenerateOrGetWayManifest(ctx context.Context, oppID uuid.UUID, vendorID, providerID, vehicleID, driverID *uuid.UUID, cargoDesc, pickupAddr, delivAddr string, cargoQty float64, cargoUnit string) (*domain.WayManifest, error) {
	return s.logisticsRepo.GenerateOrGetWayManifest(ctx, oppID, vendorID, providerID, vehicleID, driverID, cargoDesc, pickupAddr, delivAddr, cargoQty, cargoUnit)
}

// 7. Proof of Loading (PoL)
func (s *LogisticsService) RegisterProofOfLoading(ctx context.Context, req *domain.ProofOfLoadingRequest) (*domain.WayManifest, error) {
	if req == nil {
		return nil, fmt.Errorf("proof of loading request is required")
	}
	if req.OpportunityID == uuid.Nil {
		return nil, fmt.Errorf("opportunity_id is required")
	}
	return s.logisticsRepo.RegisterProofOfLoading(ctx, req)
}

// 8. Proof of Delivery (PoD)
func (s *LogisticsService) RegisterProofOfDelivery(ctx context.Context, req *domain.ProofOfDeliveryRequest) (*domain.WayManifest, error) {
	if req == nil {
		return nil, fmt.Errorf("proof of delivery request is required")
	}
	if req.OpportunityID == uuid.Nil {
		return nil, fmt.Errorf("opportunity_id is required")
	}
	return s.logisticsRepo.RegisterProofOfDelivery(ctx, req)
}

// 9. Delivery OTP Generation
func (s *LogisticsService) AttachDeliveryOTP(ctx context.Context, oppID uuid.UUID) (string, error) {
	return s.logisticsRepo.AttachDeliveryOTP(ctx, oppID)
}

func (s *LogisticsService) AttachDeliveryOTPForCustomer(ctx context.Context, oppID uuid.UUID, callerID uuid.UUID) (string, error) {
	return s.logisticsRepo.AttachDeliveryOTPForCustomer(ctx, oppID, callerID)
}

// 10. Secure Delivery OTP Handshake & Atomic Settlement
func (s *LogisticsService) VerifySecureDeliveryOTP(ctx context.Context, oppID uuid.UUID, otpCode string, verifiedBy *uuid.UUID) error {
	return s.logisticsRepo.VerifySecureDeliveryOTP(ctx, oppID, otpCode, verifiedBy)
}

// 11. SOS Incident Reporting & Suspension
func (s *LogisticsService) SubmitSOSIncident(ctx context.Context, req *domain.SOSReportExtendedRequest) (*domain.IncidentTelemetry, error) {
	if req == nil {
		return nil, fmt.Errorf("SOS request is required")
	}
	return s.logisticsRepo.SubmitSOSIncident(ctx, req)
}

// 12. SOS Incident Resolution & Resource Reassignment
func (s *LogisticsService) ResolveSOSIncident(ctx context.Context, req *domain.SOSResolutionRequest) error {
	if req == nil {
		return fmt.Errorf("resolution request is required")
	}
	return s.logisticsRepo.ResolveSOSIncident(ctx, req)
}

