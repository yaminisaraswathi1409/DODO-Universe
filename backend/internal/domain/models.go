package domain

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type OpportunityType string

const (
	TypeNeed  OpportunityType = "NEED"
	TypeOffer OpportunityType = "OFFER"
)

type WorkflowModel string

const (
	WorkflowInstant   WorkflowModel = "INSTANT"
	WorkflowScheduled WorkflowModel = "SCHEDULED"
	WorkflowQuotation WorkflowModel = "QUOTATION"
	WorkflowRental    WorkflowModel = "RENTAL"
	WorkflowAuction   WorkflowModel = "AUCTION"
	WorkflowMulti     WorkflowModel = "MULTI_LAYER"
)

type OpportunityStatus string

const (
	StatusOpen              OpportunityStatus = "OPEN"
	StatusOrderPlaced       OpportunityStatus = "ORDER_PLACED"
	StatusMatched           OpportunityStatus = "MATCHED"
	StatusProviderAccepted  OpportunityStatus = "PROVIDER_ACCEPTED"
	StatusAccepted          OpportunityStatus = "ACCEPTED"
	StatusOrderConfirmed    OpportunityStatus = "ORDER_CONFIRMED"
	StatusPreparing         OpportunityStatus = "PREPARING"
	StatusProcessing        OpportunityStatus = "PROCESSING"
	StatusDispatched        OpportunityStatus = "DISPATCHED"
	StatusVehicleAssigned   OpportunityStatus = "VEHICLE_ASSIGNED"
	StatusDriverAssigned    OpportunityStatus = "DRIVER_ASSIGNED"
	StatusInTransit         OpportunityStatus = "IN_TRANSIT"
	StatusEnroute           OpportunityStatus = "ENROUTE"
	StatusVehicleProblem    OpportunityStatus = "VEHICLE_PROBLEM"
	StatusIncidentSuspended OpportunityStatus = "INCIDENT_SUSPENDED"
	StatusIssueResolved     OpportunityStatus = "ISSUE_RESOLVED"
	StatusRepairCompleted   OpportunityStatus = "REPAIR_COMPLETED"
	StatusInTransitAgain    OpportunityStatus = "IN_TRANSIT_AGAIN"
	StatusOutForDelivery    OpportunityStatus = "OUT_FOR_DELIVERY"
	StatusArrived           OpportunityStatus = "ARRIVED"
	StatusDelivered         OpportunityStatus = "DELIVERED"
	StatusCompleted         OpportunityStatus = "COMPLETED"
	StatusCancelled         OpportunityStatus = "CANCELLED"
	StatusRejected          OpportunityStatus = "REJECTED"
	StatusPendingMatching   OpportunityStatus = "PENDING_MATCHING"
	StatusOpenNeed          OpportunityStatus = "OPEN_NEED"
	StatusInProgress        OpportunityStatus = "IN_PROGRESS"
)

type UserStatus string

const (
	StatusPending          UserStatus = "PENDING"
	StatusOTPVerified      UserStatus = "OTP_VERIFIED"
	StatusProfileCompleted UserStatus = "PROFILE_COMPLETED"
	StatusActive           UserStatus = "ACTIVE"
	StatusSuspended        UserStatus = "SUSPENDED"
)

type UserRole string

const (
	RoleSuperAdmin UserRole = "SUPER_ADMIN"
	RoleAdmin      UserRole = "ADMIN"
	RoleUser       UserRole = "USER"
)

// User (Unified Profile: both Customer & Provider)
type User struct {
	ID                  uuid.UUID  `json:"id"`
	SupabaseUID         string     `json:"supabase_uid"`
	Email               string     `json:"email,omitempty"`
	Phone               string     `json:"phone,omitempty"`
	FullName            string     `json:"full_name"`
	AvatarURL           string     `json:"avatar_url,omitempty"`
	Bio                 string     `json:"bio,omitempty"`
	Lat                 float64    `json:"lat"`
	Lng                 float64    `json:"lng"`
	AddressText         string     `json:"address_text,omitempty"`
	AadhaarNumber       string     `json:"aadhaar_number,omitempty"`
	TrustScore          float64    `json:"trust_score"`
	IsVerified          bool       `json:"is_verified"`
	Status              UserStatus `json:"status"`
	Role                UserRole   `json:"role"`
	MobileVerified      bool       `json:"mobile_verified"`
	OTPCode             string     `json:"otp_code,omitempty"`
	OTPExpiresAt        *time.Time `json:"otp_expires_at,omitempty"`
	FaceVerified        bool       `json:"face_verified"`
	FaceVerifiedAt      *time.Time `json:"face_verified_at,omitempty"`
	FaceVerificationRef string     `json:"face_verification_ref,omitempty"`
	InvitedBy           *uuid.UUID `json:"invited_by,omitempty"`
	InvitedAt           *time.Time `json:"invited_at,omitempty"`
	CreatedAt           time.Time  `json:"created_at"`
	UpdatedAt           time.Time  `json:"updated_at"`
}

// UserAddress (Saved Delivery Address for User - Home, Work, Site, etc.)
type UserAddress struct {
	ID            uuid.UUID `json:"id"`
	UserID        uuid.UUID `json:"user_id"`
	Label         string    `json:"label"` // e.g. Home, Work, Construction Site, Other
	AddressText   string    `json:"address_text"`
	Lat           float64   `json:"lat"`
	Lng           float64   `json:"lng"`
	Landmark      string    `json:"landmark,omitempty"`
	ReceiverName  string    `json:"receiver_name,omitempty"`
	ReceiverPhone string    `json:"receiver_phone,omitempty"`
	IsDefault     bool      `json:"is_default"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}


type ServiceAssetStatus string

const (
	ServiceStatusPendingApproval     ServiceAssetStatus = "PENDING_APPROVAL"
	ServiceStatusApproved            ServiceAssetStatus = "APPROVED"
	ServiceStatusDocsPending         ServiceAssetStatus = "DOCUMENTS_PENDING"
	ServiceStatusUnderReview         ServiceAssetStatus = "UNDER_REVIEW"
	ServiceStatusVerificationPending ServiceAssetStatus = "VERIFICATION_PENDING"
	ServiceStatusActive              ServiceAssetStatus = "ACTIVE"
	ServiceStatusRejected            ServiceAssetStatus = "REJECTED"
	ServiceStatusSuspended           ServiceAssetStatus = "SUSPENDED"
)

// UserSkillAsset (Vehicles, Machinery, Equipment, Labor skills)
type UserSkillAsset struct {
	ID              uuid.UUID          `json:"id"`
	UserID          uuid.UUID          `json:"user_id"`
	User            *User              `json:"user,omitempty"`
	CategoryID      *uuid.UUID         `json:"category_id,omitempty"`
	Category        *Category          `json:"category,omitempty"`
	AssetType       string             `json:"asset_type"` // TRACTOR, TRUCK, ELECTRICIAN, PLUMBER, etc.
	Title           string             `json:"title"`
	Description     string             `json:"description,omitempty"`
	HourlyRate      *float64           `json:"hourly_rate,omitempty"`
	DailyRate       *float64           `json:"daily_rate,omitempty"`
	IsAvailable     bool               `json:"is_available"`
	Status          ServiceAssetStatus `json:"status"`
	RejectionReason string             `json:"rejection_reason,omitempty"`
	Documents       json.RawMessage    `json:"documents,omitempty"`
	Lat             float64            `json:"lat"`
	Lng             float64            `json:"lng"`
	Attributes      json.RawMessage    `json:"attributes,omitempty"`
	CreatedAt       time.Time          `json:"created_at"`
	UpdatedAt       time.Time          `json:"updated_at"`
}

// Category definition
type Category struct {
	ID                uuid.UUID       `json:"id"`
	Slug              string          `json:"slug"`
	Name              string          `json:"name"`
	Description       string          `json:"description,omitempty"`
	Icon              string          `json:"icon,omitempty"`
	DefaultWorkflow   WorkflowModel   `json:"default_workflow"`
	RequiredDocuments json.RawMessage `json:"required_documents,omitempty"`
	OpportunityFields json.RawMessage `json:"opportunity_fields,omitempty"`
	CreatedAt         time.Time       `json:"created_at"`
}


// Opportunity (Represents a Need or Offer)
type Opportunity struct {
	ID                  uuid.UUID         `json:"id"`
	UserID              uuid.UUID         `json:"user_id"`
	User                *User             `json:"user,omitempty"`
	CategoryID          *uuid.UUID        `json:"category_id,omitempty"`
	Category            *Category         `json:"category,omitempty"`
	Type                OpportunityType   `json:"type"`
	Title               string            `json:"title"`
	Description         string            `json:"description"`
	WorkflowModel       WorkflowModel     `json:"workflow_model"`
	Status              OpportunityStatus `json:"status"`
	Lat                 float64           `json:"lat"`
	Lng                 float64           `json:"lng"`
	AddressText         string            `json:"address_text,omitempty"`
	RadiusKM            float64           `json:"radius_km"`
	BudgetMin           *float64          `json:"budget_min,omitempty"`
	BudgetMax           *float64          `json:"budget_max,omitempty"`
	PriceUnit           string            `json:"price_unit,omitempty"`
	ScheduledStart      *time.Time        `json:"scheduled_start,omitempty"`
	ScheduledEnd        *time.Time        `json:"scheduled_end,omitempty"`
	ParentOpportunityID *uuid.UUID        `json:"parent_opportunity_id,omitempty"`
	Metadata            json.RawMessage   `json:"metadata,omitempty"`
	CreatedAt           time.Time         `json:"created_at"`
	UpdatedAt           time.Time         `json:"updated_at"`
}

// OpportunityMatch (Match score & proposed agreement)
type OpportunityMatch struct {
	ID             uuid.UUID `json:"id"`
	OpportunityID  uuid.UUID `json:"opportunity_id"`
	MatchedUserID  uuid.UUID `json:"matched_user_id"`
	MatchedUser    *User     `json:"matched_user,omitempty"`
	Status         string    `json:"status"` // PROPOSED, ACCEPTED, REJECTED, COMPLETED
	MatchScore     float64   `json:"match_score"`
	DistanceMeters float64   `json:"distance_meters"`
	QuoteAmount    *float64  `json:"quote_amount,omitempty"`
	Notes          string    `json:"notes,omitempty"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}

// OpportunityChain (Multi-Layer Parent-Child Linkage)
type OpportunityChain struct {
	ID                  uuid.UUID `json:"id"`
	ParentOpportunityID uuid.UUID `json:"parent_opportunity_id"`
	ChildOpportunityID  uuid.UUID `json:"child_opportunity_id"`
	RelationshipType    string    `json:"relationship_type"`
	CreatedAt           time.Time `json:"created_at"`
}

// TrustRating
type TrustRating struct {
	ID            uuid.UUID `json:"id"`
	OpportunityID uuid.UUID `json:"opportunity_id"`
	RaterID       uuid.UUID `json:"rater_id"`
	RateeID       uuid.UUID `json:"ratee_id"`
	Rating        float64   `json:"rating"`
	Review        string    `json:"review,omitempty"`
	OnTime        bool      `json:"on_time"`
	CreatedAt     time.Time `json:"created_at"`
}

// VehicleDriverPairing (Assigning driver to vehicle asset)
type VehicleDriverPairing struct {
	ID            uuid.UUID       `json:"id"`
	VehicleID     uuid.UUID       `json:"vehicle_id"`
	Vehicle       *UserSkillAsset `json:"vehicle,omitempty"`
	DriverID      uuid.UUID       `json:"driver_id"`
	Driver        *User           `json:"driver,omitempty"`
	LicenseNumber string          `json:"license_number,omitempty"`
	LicenseClass  string          `json:"license_class,omitempty"`
	Status        string          `json:"status"` // ACTIVE, OFF_DUTY, SUSPENDED
	AssignedAt    time.Time       `json:"assigned_at"`
	CreatedAt     time.Time       `json:"created_at"`
	UpdatedAt     time.Time       `json:"updated_at"`
}

// WayManifest (Digital Way Manifest, routing barcode, Proof of Loading & Delivery)
type WayManifest struct {
	ID             uuid.UUID       `json:"id"`
	OpportunityID  uuid.UUID       `json:"opportunity_id"`
	VehicleID      *uuid.UUID      `json:"vehicle_id,omitempty"`
	Vehicle        *UserSkillAsset `json:"vehicle,omitempty"`
	DriverID       *uuid.UUID      `json:"driver_id,omitempty"`
	Driver         *User           `json:"driver,omitempty"`
	ManifestNumber string          `json:"manifest_number"`
	RoutingBarcode string          `json:"routing_barcode"`
	POLPhotoURL    string          `json:"pol_photo_url,omitempty"`
	POLCapturedAt  *time.Time      `json:"pol_captured_at,omitempty"`
	PODQRCode      string          `json:"pod_qr_code,omitempty"`
	PODSignature   string          `json:"pod_signature_url,omitempty"`
	PODCapturedAt  *time.Time      `json:"pod_captured_at,omitempty"`
	Status         string          `json:"status"` // GENERATED, LOADED, IN_TRANSIT, DELIVERED
	CreatedAt      time.Time       `json:"created_at"`
	UpdatedAt      time.Time       `json:"updated_at"`
}

// IncidentTelemetry (SOS Breakdown & Telemetry alert tracking)
type IncidentTelemetry struct {
	ID                uuid.UUID       `json:"id"`
	OpportunityID     uuid.UUID       `json:"opportunity_id"`
	ReporterID        uuid.UUID       `json:"reporter_id"`
	Reporter          *User           `json:"reporter,omitempty"`
	IncidentType      string          `json:"incident_type"` // CLUTCH_FAILURE, ACCIDENT, MECHANICAL_BREAKDOWN
	Description       string          `json:"description,omitempty"`
	Lat               float64         `json:"lat"`
	Lng               float64         `json:"lng"`
	AddressText       string          `json:"address_text,omitempty"`
	TelemetryData     json.RawMessage `json:"telemetry_data,omitempty"`
	IsNoMovementAlert bool            `json:"is_no_movement_alert"`
	Status            string          `json:"status"` // ACTIVE, RESOLVED
	CreatedAt         time.Time       `json:"created_at"`
	UpdatedAt         time.Time       `json:"updated_at"`
}

// EscrowLedgerEntry (Multi-tier financial ledger & sub-budget tracking)
type EscrowLedgerEntry struct {
	ID                uuid.UUID       `json:"id"`
	RootOpportunityID uuid.UUID       `json:"root_opportunity_id"`
	OpportunityID     uuid.UUID       `json:"opportunity_id"`
	PayerID           uuid.UUID       `json:"payer_id"`
	Payer             *User           `json:"payer,omitempty"`
	PayeeID           uuid.UUID       `json:"payee_id"`
	Payee             *User           `json:"payee,omitempty"`
	Amount            float64         `json:"amount"`
	EscrowType        string          `json:"escrow_type"` // DEPOSIT, TRANSPORT, DRIVER_FEE, MECHANIC_FEE, PARTS_PROCUREMENT
	Status            string          `json:"status"`      // HELD, RELEASED, REFUNDED
	Metadata          json.RawMessage `json:"metadata,omitempty"`
	CreatedAt         time.Time       `json:"created_at"`
	UpdatedAt         time.Time       `json:"updated_at"`
}

// PartsInventoryItem (Local auto parts stock inventory)
type PartsInventoryItem struct {
	ID            uuid.UUID `json:"id"`
	ShopUserID    uuid.UUID `json:"shop_user_id"`
	ShopUser      *User     `json:"shop_user,omitempty"`
	PartNumber    string    `json:"part_number"`
	PartName      string    `json:"part_name"`
	Description   string    `json:"description,omitempty"`
	StockQuantity int       `json:"stock_quantity"`
	UnitPrice     float64   `json:"unit_price"`
	Lat           float64   `json:"lat"`
	Lng           float64   `json:"lng"`
	CreatedAt     time.Time `json:"created_at"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// VoiceParseRequest & VoiceParseResponse
type VoiceParseRequest struct {
	AudioText string  `json:"audio_text"`
	UserLat   float64 `json:"user_lat"`
	UserLng   float64 `json:"user_lng"`
}

type VoiceParseResponse struct {
	Category        string   `json:"category"`
	Item            string   `json:"item"`
	Quantity        int      `json:"quantity"`
	Location        string   `json:"location"`
	Schedule        string   `json:"schedule"`
	EstimatedAmount float64  `json:"estimated_amount"`
	SuggestedVendor string   `json:"suggested_vendor"`
	VoiceReply      string   `json:"voice_reply"`
	ParsedSuccess   bool     `json:"parsed_success"`
	Entities        map[string]interface{} `json:"entities"`
}

// OpportunityTreeNode (Full recursive opportunity ancestry tree node)
type OpportunityTreeNode struct {
	Opportunity *Opportunity           `json:"opportunity"`
	Manifest    *WayManifest           `json:"manifest,omitempty"`
	Incident    *IncidentTelemetry     `json:"incident,omitempty"`
	Children    []*OpportunityTreeNode `json:"children,omitempty"`
}

// OpportunityStatusHistory (Record of every order status transition)
type OpportunityStatusHistory struct {
	ID              uuid.UUID  `json:"id"`
	OpportunityID   uuid.UUID  `json:"opportunity_id"`
	FromStatus      string     `json:"from_status,omitempty"`
	ToStatus        string     `json:"to_status"`
	ChangedByUserID *uuid.UUID `json:"changed_by_user_id,omitempty"`
	Notes           string     `json:"notes,omitempty"`
	CreatedAt       time.Time  `json:"created_at"`
}

