package domain

import (
	"encoding/json"
	"strings"
	"time"

	"github.com/google/uuid"
)

// ============================================================================
// PHASE 7: NOTIFICATIONS, GOVERNANCE & OPERATIONS DOMAIN MODELS
// ============================================================================

// NotificationPreference represents persistent user preferences across channels and categories
type NotificationPreference struct {
	UserID             uuid.UUID `json:"user_id"`
	InAppEnabled       bool      `json:"in_app_enabled"`
	SMSEnabled         bool      `json:"sms_enabled"`
	PushEnabled        bool      `json:"push_enabled"`
	DisabledCategories []string  `json:"disabled_categories"`
	CreatedAt          time.Time `json:"created_at"`
	UpdatedAt          time.Time `json:"updated_at"`
}

// NotificationFilter represents query parameters for fetching user notifications
type NotificationFilter struct {
	UserID     uuid.UUID `json:"user_id"`
	Type       string    `json:"type,omitempty"`
	UnreadOnly *bool     `json:"unread_only,omitempty"`
	Page       int       `json:"page"`
	PageSize   int       `json:"page_size"`
}

// NotificationPage represents a paginated slice of notifications
type NotificationPage struct {
	Notifications []*Notification `json:"notifications"`
	TotalCount    int             `json:"total_count"`
	Page          int             `json:"page"`
	PageSize      int             `json:"page_size"`
	UnreadCount   int             `json:"unread_count"`
}

// AdminDashboardMetrics holds real-time operational metrics across platform entities
type AdminDashboardMetrics struct {
	ActiveUsersCount            int            `json:"active_users_count"`
	ActiveVendorsCount          int            `json:"active_vendors_count"`
	ActiveDriversCount          int            `json:"active_drivers_count"`
	PendingCategoryApprovals    int            `json:"pending_category_approvals"`
	PendingCatalogApprovals     int            `json:"pending_catalog_approvals"`
	OrdersByStatus              map[string]int `json:"orders_by_status"`
	StuckOrdersCount            int            `json:"stuck_orders_count"`
	ActiveIncidentsCount        int            `json:"active_incidents_count"`
	FailedNotificationJobsCount int            `json:"failed_notification_jobs_count"`
	QueuedNotificationJobsCount int            `json:"queued_notification_jobs_count"`
	GeneratedAt                 time.Time      `json:"generated_at"`
}

// StuckOrderAlert represents an order that has exceeded stage inactivity thresholds
type StuckOrderAlert struct {
	OpportunityID  uuid.UUID `json:"opportunity_id"`
	Title          string    `json:"title"`
	VendorID       uuid.UUID `json:"vendor_id"`
	VendorName     string    `json:"vendor_name"`
	CustomerID     uuid.UUID `json:"customer_id"`
	CustomerName   string    `json:"customer_name"`
	Status         string    `json:"status"`
	DurationHours  float64   `json:"duration_hours"`
	ThresholdHours float64   `json:"threshold_hours"`
	StatusEnteredAt time.Time `json:"status_entered_at"`
	Severity       string    `json:"severity"` // WARNING, CRITICAL
	Recommendation string    `json:"recommendation"`
}

// AdminAuditLog records auditable actions taken by platform administrators and operations handlers
type AdminAuditLog struct {
	ID            uuid.UUID       `json:"id"`
	ActorID       *uuid.UUID      `json:"actor_id,omitempty"`
	ActorRole     string          `json:"actor_role"`
	Action        string          `json:"action"`
	EntityType    string          `json:"entity_type"`
	EntityID      *uuid.UUID      `json:"entity_id,omitempty"`
	PreviousState json.RawMessage `json:"previous_state,omitempty"`
	NewState      json.RawMessage `json:"new_state,omitempty"`
	Reason        string          `json:"reason,omitempty"`
	Metadata      json.RawMessage `json:"metadata,omitempty"`
	CreatedAt     time.Time       `json:"created_at"`
}

// VendorSuspensionRequest payload for suspending a vendor
type VendorSuspensionRequest struct {
	VendorID uuid.UUID `json:"vendor_id"`
	Reason   string    `json:"reason"`
}

// VendorReactivateRequest payload for reactivating a suspended vendor
type VendorReactivateRequest struct {
	VendorID uuid.UUID `json:"vendor_id"`
	Reason   string    `json:"reason"`
}

// IncidentInternalNote represents an internal operational note on an SOS incident
type IncidentInternalNote struct {
	AuthorID   uuid.UUID `json:"author_id"`
	AuthorName string    `json:"author_name"`
	Note       string    `json:"note"`
	CreatedAt  time.Time `json:"created_at"`
}

// IncidentActionRequest encapsulates operations actions on active SOS incidents
type IncidentActionRequest struct {
	Action               string     `json:"action"` // ACKNOWLEDGE, ASSIGN_HANDLER, ADD_NOTE, RESOLVE
	HandlerID            *uuid.UUID `json:"handler_id,omitempty"`
	Note                 string     `json:"note,omitempty"`
	ResolutionNotes      string     `json:"resolution_notes,omitempty"`
	ReplacementVehicleID *uuid.UUID `json:"replacement_vehicle_id,omitempty"`
	ReplacementDriverID  *uuid.UUID `json:"replacement_driver_id,omitempty"`
	ResumeTransit        bool       `json:"resume_transit"`
}

// IsCriticalNotificationType returns true if the notification is a safety, security, payment or core delivery alert.
// Critical notifications bypass user category suppression to prevent missed delivery handshakes or emergency alerts.
func IsCriticalNotificationType(notifType string) bool {
	switch strings.ToUpper(strings.TrimSpace(notifType)) {
	case "DELIVERY_OTP", "OTP", "SOS_ALERT", "SOS_INCIDENT", "PAYMENT_ESCROW", "ESCROW_SETTLEMENT", "ORDER_CONFIRMED", "SECURITY_ALERT":
		return true
	default:
		return false
	}
}

// SanitizeSensitiveData removes sensitive fields like raw OTPs, private tokens, or passwords from payloads
func SanitizeSensitiveData(raw map[string]interface{}) map[string]interface{} {
	if raw == nil {
		return make(map[string]interface{})
	}
	sanitized := make(map[string]interface{}, len(raw))
	for k, v := range raw {
		lowerK := strings.ToLower(k)
		if strings.Contains(lowerK, "otp") || strings.Contains(lowerK, "token") || strings.Contains(lowerK, "secret") || strings.Contains(lowerK, "password") || strings.Contains(lowerK, "aadhaar") || strings.Contains(lowerK, "credential") {
			sanitized[k] = "[REDACTED]"
			continue
		}
		sanitized[k] = v
	}
	return sanitized
}

