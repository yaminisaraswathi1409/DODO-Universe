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
	StatusOpen       OpportunityStatus = "OPEN"
	StatusMatched    OpportunityStatus = "MATCHED"
	StatusInProgress OpportunityStatus = "IN_PROGRESS"
	StatusCompleted  OpportunityStatus = "COMPLETED"
	StatusCancelled  OpportunityStatus = "CANCELLED"
)

// User (Unified Profile: both Customer & Provider)
type User struct {
	ID          uuid.UUID `json:"id"`
	SupabaseUID string    `json:"supabase_uid"`
	Email       string    `json:"email,omitempty"`
	Phone       string    `json:"phone,omitempty"`
	FullName    string    `json:"full_name"`
	AvatarURL   string    `json:"avatar_url,omitempty"`
	Bio         string    `json:"bio,omitempty"`
	Lat         float64   `json:"lat"`
	Lng         float64   `json:"lng"`
	AddressText string    `json:"address_text,omitempty"`
	TrustScore  float64   `json:"trust_score"`
	IsVerified  bool      `json:"is_verified"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// UserSkillAsset (Vehicles, Machinery, Equipment, Labor skills)
type UserSkillAsset struct {
	ID              uuid.UUID       `json:"id"`
	UserID          uuid.UUID       `json:"user_id"`
	AssetType       string          `json:"asset_type"` // TRACTOR, TRUCK, ELECTRICIAN, PLUMBER, etc.
	Title           string          `json:"title"`
	Description     string          `json:"description,omitempty"`
	HourlyRate      *float64        `json:"hourly_rate,omitempty"`
	DailyRate       *float64        `json:"daily_rate,omitempty"`
	IsAvailable     bool            `json:"is_available"`
	Lat             float64         `json:"lat"`
	Lng             float64         `json:"lng"`
	Attributes      json.RawMessage `json:"attributes,omitempty"`
	CreatedAt       time.Time       `json:"created_at"`
	UpdatedAt       time.Time       `json:"updated_at"`
}

// Category definition
type Category struct {
	ID              uuid.UUID     `json:"id"`
	Slug            string        `json:"slug"`
	Name            string        `json:"name"`
	Description     string        `json:"description,omitempty"`
	Icon            string        `json:"icon,omitempty"`
	DefaultWorkflow WorkflowModel `json:"default_workflow"`
	CreatedAt       time.Time     `json:"created_at"`
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
