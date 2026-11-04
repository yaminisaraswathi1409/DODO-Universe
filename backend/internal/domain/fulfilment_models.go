package domain

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

// ============================================================================
// PHASE 6: ORDER FULFILMENT & LOGISTICS MANAGEMENT DOMAIN MODELS
// ============================================================================

// Additional Opportunity Statuses for Phase 6 Lifecycles
const (
	StatusVendorReview          OpportunityStatus = "VENDOR_REVIEW"
	StatusVendorAccepted        OpportunityStatus = "VENDOR_ACCEPTED"
	StatusFulfilmentPreparation OpportunityStatus = "FULFILMENT_PREPARATION"
	StatusResourceArrangement   OpportunityStatus = "RESOURCE_ARRANGEMENT"
	StatusLogisticsConfirmed    OpportunityStatus = "LOGISTICS_CONFIRMED"
	StatusReadyForPickup        OpportunityStatus = "READY_FOR_PICKUP"
	StatusPickupVerified        OpportunityStatus = "PICKUP_VERIFIED"
	StatusDeliveryVerified      OpportunityStatus = "DELIVERY_VERIFIED"
)

// FulfilmentStatusTransitionValidator validates whether a lifecycle progression is permissible
func IsValidFulfilmentTransition(from, to OpportunityStatus) bool {
	// Any active state can move to CANCELLED or REJECTED
	if to == StatusCancelled || to == StatusRejected {
		return from != StatusCompleted && from != StatusCancelled && from != StatusRejected
	}

	// Any active in-transit state can report SOS emergency / suspend
	if to == StatusIncidentSuspended || to == StatusVehicleProblem {
		return from == StatusInTransit || from == StatusDispatched || from == StatusOutForDelivery || from == StatusPickupVerified
	}

	// Recovery from incident back to in-transit or resolved
	if from == StatusIncidentSuspended || from == StatusVehicleProblem {
		return to == StatusIssueResolved || to == StatusRepairCompleted || to == StatusInTransitAgain || to == StatusInTransit
	}

	validTransitions := map[OpportunityStatus][]OpportunityStatus{
		// Initial post-checkout confirmation
		StatusOrderConfirmed: {
			StatusVendorReview,
			StatusVendorAccepted,
			StatusPreparing,
			StatusFulfilmentPreparation,
			StatusCancelled,
			StatusRejected,
		},
		StatusVendorReview: {
			StatusVendorAccepted,
			StatusPreparing,
			StatusFulfilmentPreparation,
			StatusCancelled,
			StatusRejected,
		},
		StatusVendorAccepted: {
			StatusPreparing,
			StatusFulfilmentPreparation,
			StatusResourceArrangement,
			StatusReadyForPickup,
			StatusCancelled,
		},
		StatusFulfilmentPreparation: {
			StatusPreparing,
			StatusResourceArrangement,
			StatusLogisticsConfirmed,
			StatusReadyForPickup,
			StatusCancelled,
		},
		StatusPreparing: {
			StatusResourceArrangement,
			StatusLogisticsConfirmed,
			StatusReadyForPickup,
			StatusCancelled,
		},
		StatusResourceArrangement: {
			StatusLogisticsConfirmed,
			StatusVehicleAssigned,
			StatusDriverAssigned,
			StatusReadyForPickup,
			StatusCancelled,
		},
		StatusLogisticsConfirmed: {
			StatusReadyForPickup,
			StatusPickupVerified,
			StatusDispatched,
			StatusCancelled,
		},
		StatusReadyForPickup: {
			StatusPickupVerified,
			StatusDispatched,
			StatusInTransit,
			StatusCancelled,
		},
		StatusPickupVerified: {
			StatusDispatched,
			StatusInTransit,
			StatusOutForDelivery,
			StatusCancelled,
		},
		StatusDispatched: {
			StatusInTransit,
			StatusOutForDelivery,
			StatusArrived,
			StatusDelivered,
			StatusCancelled,
		},
		StatusInTransit: {
			StatusOutForDelivery,
			StatusArrived,
			StatusDelivered,
			StatusVehicleProblem,
			StatusIncidentSuspended,
			StatusCancelled,
		},
		StatusInTransitAgain: {
			StatusOutForDelivery,
			StatusArrived,
			StatusDelivered,
			StatusVehicleProblem,
			StatusIncidentSuspended,
			StatusCancelled,
		},
		StatusOutForDelivery: {
			StatusArrived,
			StatusDelivered,
			StatusDeliveryVerified,
			StatusCancelled,
		},
		StatusArrived: {
			StatusDelivered,
			StatusDeliveryVerified,
		},
		StatusDelivered: {
			StatusDeliveryVerified,
			StatusCompleted,
		},
		StatusDeliveryVerified: {
			StatusCompleted,
		},
		// Legacy / Scenario 1 Compatibility bridges
		StatusAccepted: {
			StatusPreparing,
			StatusDispatched,
			StatusInTransit,
			StatusCompleted,
		},
		StatusMatched: {
			StatusAccepted,
			StatusProviderAccepted,
			StatusCancelled,
		},
		StatusProviderAccepted: {
			StatusPreparing,
			StatusDispatched,
			StatusCompleted,
		},
		StatusIssueResolved: {
			StatusInTransitAgain,
			StatusInTransit,
			StatusOutForDelivery,
			StatusDelivered,
		},
		StatusRepairCompleted: {
			StatusInTransitAgain,
			StatusInTransit,
			StatusOutForDelivery,
			StatusDelivered,
		},
	}

	allowed, exists := validTransitions[from]
	if !exists {
		// Allow OPEN/PENDING matching states to progress to MATCHED/ACCEPTED
		if from == StatusOpen || from == StatusOpenNeed || from == StatusPendingMatching {
			return to == StatusMatched || to == StatusAccepted || to == StatusOrderConfirmed || to == StatusCancelled
		}
		return false
	}

	for _, s := range allowed {
		if s == to {
			return true
		}
	}
	return false
}

// Vendor Order Action Types
type VendorOrderAction string

const (
	ActionVendorAccept       VendorOrderAction = "ACCEPT"
	ActionVendorReject       VendorOrderAction = "REJECT"
	ActionVendorPrepare      VendorOrderAction = "PREPARE"
	ActionVendorReadyPickup  VendorOrderAction = "READY_FOR_PICKUP"
)

// VendorOrderActionRequest encapsulates vendor decisions on orders
type VendorOrderActionRequest struct {
	Action           VendorOrderAction `json:"action"`
	RejectionReason  string            `json:"rejection_reason,omitempty"`
	PreparationNotes string            `json:"preparation_notes,omitempty"`
	EstimatedReadyAt *time.Time        `json:"estimated_ready_at,omitempty"`
}

// OrderResourceArrangementRequest captures transport, loading, unloading, vehicle, driver details
type OrderResourceArrangementRequest struct {
	OpportunityID       uuid.UUID  `json:"opportunity_id"`
	TransportMode       string     `json:"transport_mode"` // VENDOR_PROVIDED, CUSTOMER_ARRANGED, PLATFORM_ASSIST, THIRD_PARTY_3PL, NOT_REQUIRED
	LoadingMode         string     `json:"loading_mode"`   // INCLUDED_BY_VENDOR, OPTIONAL_PAID, CUSTOMER_ARRANGES, NOT_REQUIRED
	UnloadingMode       string     `json:"unloading_mode"` // INCLUDED_BY_VENDOR, OPTIONAL_PAID, CUSTOMER_ARRANGES, NOT_REQUIRED
	TransportProviderID *uuid.UUID `json:"transport_provider_id,omitempty"`
	VehicleID           *uuid.UUID `json:"vehicle_id,omitempty"`
	DriverID            *uuid.UUID `json:"driver_id,omitempty"`
	VehicleType         string     `json:"vehicle_type,omitempty"`
	VehicleRegNumber    string     `json:"vehicle_reg_number,omitempty"`
	DriverName          string     `json:"driver_name,omitempty"`
	DriverPhone         string     `json:"driver_phone,omitempty"`
	DriverLicenseNumber string     `json:"driver_license_number,omitempty"`
	ArrangementNotes    string     `json:"arrangement_notes,omitempty"`
}

// LogisticsProviderMatchRequest allows spatial discovery of transport providers
type LogisticsProviderMatchRequest struct {
	PickupLat        float64 `json:"pickup_lat"`
	PickupLng        float64 `json:"pickup_lng"`
	DeliveryLat      float64 `json:"delivery_lat"`
	DeliveryLng      float64 `json:"delivery_lng"`
	RequiredCapacity float64 `json:"required_capacity,omitempty"`
	VehicleType      string  `json:"vehicle_type,omitempty"`
	RadiusKM         float64 `json:"radius_km,omitempty"`
	Limit            int     `json:"limit,omitempty"`
}

// EligibleLogisticsProvider represents a nearby verified transport provider found via PostGIS
type EligibleLogisticsProvider struct {
	ProviderID      uuid.UUID       `json:"provider_id"`
	ProviderName    string          `json:"provider_name"`
	ProviderPhone   string          `json:"provider_phone,omitempty"`
	TrustScore      float64         `json:"trust_score"`
	DistanceKM      float64         `json:"distance_km"`
	VehicleAssetID  *uuid.UUID      `json:"vehicle_asset_id,omitempty"`
	VehicleTitle    string          `json:"vehicle_title,omitempty"`
	VehicleType     string          `json:"vehicle_type,omitempty"`
	CapacityWeight  float64         `json:"capacity_weight,omitempty"`
	CapacityVolume  float64         `json:"capacity_volume,omitempty"`
	EstimatedCharge float64         `json:"estimated_charge"`
	IsAvailable     bool            `json:"is_available"`
	Attributes      json.RawMessage `json:"attributes,omitempty"`
}

// AssignDriverVehicleRequest assigns an active driver and vehicle to an opportunity/manifest
type AssignDriverVehicleRequest struct {
	OpportunityID       uuid.UUID  `json:"opportunity_id"`
	ManifestID          *uuid.UUID `json:"manifest_id,omitempty"`
	VehicleID           uuid.UUID  `json:"vehicle_id"`
	DriverID            uuid.UUID  `json:"driver_id"`
	LicenseNumber       string     `json:"license_number,omitempty"`
	LicenseClass        string     `json:"license_class,omitempty"`
	ReplaceExisting     bool       `json:"replace_existing,omitempty"`
	ReassignmentReason  string     `json:"reassignment_reason,omitempty"`
}

// ProofOfLoadingRequest registers photos and verification at pickup
type ProofOfLoadingRequest struct {
	OpportunityID   uuid.UUID `json:"opportunity_id"`
	ManifestID      *uuid.UUID `json:"manifest_id,omitempty"`
	PhotoURLs       []string  `json:"photo_urls"`
	LoadedQuantity  float64   `json:"loaded_quantity"`
	CargoUnit       string    `json:"cargo_unit,omitempty"`
	LocationLat     float64   `json:"location_lat,omitempty"`
	LocationLng     float64   `json:"location_lng,omitempty"`
	AddressText     string    `json:"address_text,omitempty"`
	AuthorizedByName string    `json:"authorized_by_name,omitempty"`
	DriverNotes     string    `json:"driver_notes,omitempty"`
	DiscrepancyNotes string   `json:"discrepancy_notes,omitempty"`
}

// ProofOfDeliveryRequest registers photos, notes, and delivery arrival
type ProofOfDeliveryRequest struct {
	OpportunityID    uuid.UUID `json:"opportunity_id"`
	ManifestID       *uuid.UUID `json:"manifest_id,omitempty"`
	PhotoURLs        []string  `json:"photo_urls,omitempty"`
	SignatureURL     string    `json:"signature_url,omitempty"`
	DeliveredQuantity float64  `json:"delivered_quantity"`
	CargoUnit        string    `json:"cargo_unit,omitempty"`
	RecipientName    string    `json:"recipient_name"`
	DeliveryNotes    string    `json:"delivery_notes,omitempty"`
	DamagedQuantity  float64   `json:"damaged_quantity,omitempty"`
	LocationLat      float64   `json:"location_lat,omitempty"`
	LocationLng      float64   `json:"location_lng,omitempty"`
}

// DeliveryOTPVerificationRequest validates the secure delivery handshake OTP
type DeliveryOTPVerificationRequest struct {
	OpportunityID uuid.UUID `json:"opportunity_id"`
	ManifestID    *uuid.UUID `json:"manifest_id,omitempty"`
	OTPCode       string    `json:"otp_code"`
	VerifiedBy    *uuid.UUID `json:"verified_by,omitempty"`
}

// SOSReportExtendedRequest provides comprehensive incident logging
type SOSReportExtendedRequest struct {
	OpportunityID     uuid.UUID              `json:"opportunity_id"`
	ManifestID        *uuid.UUID             `json:"manifest_id,omitempty"`
	ReporterID        uuid.UUID              `json:"reporter_id"`
	IncidentType      string                 `json:"incident_type"` // CLUTCH_FAILURE, BREAKDOWN, ACCIDENT, OBSTRUCTION, CARGO_DAMAGE, DELAY
	Description       string                 `json:"description"`
	Lat               float64                `json:"lat"`
	Lng               float64                `json:"lng"`
	AddressText       string                 `json:"address_text,omitempty"`
	TelemetryData     map[string]interface{} `json:"telemetry_data,omitempty"`
	IsNoMovementAlert bool                   `json:"is_no_movement_alert"`
}

// SOSResolutionRequest allows operations to resolve an incident and reassign resources
type SOSResolutionRequest struct {
	IncidentID            uuid.UUID  `json:"incident_id"`
	ResolutionNotes       string     `json:"resolution_notes"`
	ReplacementVehicleID  *uuid.UUID `json:"replacement_vehicle_id,omitempty"`
	ReplacementDriverID   *uuid.UUID `json:"replacement_driver_id,omitempty"`
	ResumeTransit         bool       `json:"resume_transit"`
}

