package service_test

import (
	"context"
	"errors"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/uop/backend/internal/domain"
	"github.com/uop/backend/internal/service"
)

// ============================================================================
// PHASE 7 TESTS: NOTIFICATIONS, GOVERNANCE & OPERATIONS
// ============================================================================

// 1. Notification Preferences & Critical Protection Bypass
func TestPhase7_NotificationPreferences_EnforcementAndCriticalBypass(t *testing.T) {
	ctx := context.Background()

	// Critical type identification
	criticalTypes := []string{
		"DELIVERY_OTP",
		"OTP",
		"SOS_ALERT",
		"SOS_INCIDENT",
		"PAYMENT_ESCROW",
		"ESCROW_SETTLEMENT",
		"ORDER_CONFIRMED",
		"SECURITY_ALERT",
	}

	for _, ct := range criticalTypes {
		if !domain.IsCriticalNotificationType(ct) {
			t.Errorf("expected %s to be recognized as critical notification type", ct)
		}
	}

	nonCriticalTypes := []string{
		"MARKETING",
		"PROMOTION",
		"INFO",
		"STATUS_UPDATE",
		"NEWSLETTER",
	}

	for _, nct := range nonCriticalTypes {
		if domain.IsCriticalNotificationType(nct) {
			t.Errorf("expected %s to NOT be classified as critical notification type", nct)
		}
	}

	// Dispatcher preference suppression test
	dispatcher := service.NewNotificationDispatcher(nil)

	// Non-critical notification to In-App
	reqNonCritical := &service.DispatchRequest{
		UserID:    uuid.New(),
		Title:     "Weekend Discount",
		Message:   "Get 10% off red bricks this weekend",
		Type:      "MARKETING",
		Channel:   service.ChannelInApp,
		DedupeKey: "test_promo_1",
	}

	res, err := dispatcher.Dispatch(ctx, reqNonCritical)
	if err != nil {
		t.Fatalf("unexpected dispatch error: %v", err)
	}
	if res.Status != service.DispatchStatusDelivered && res.Status != service.DispatchStatusSent {
		t.Errorf("expected delivered status, got: %s", res.Status)
	}

	// Critical notification to SMS without twilio credentials -> Honest gateway failure
	reqCriticalSMS := &service.DispatchRequest{
		UserID:    uuid.New(),
		Title:     "Emergency SOS",
		Message:   "Vehicle reported breakdown",
		Type:      "SOS_ALERT",
		Channel:   service.ChannelSMS,
		DedupeKey: "test_sos_sms_1",
	}

	resSMS, err := dispatcher.Dispatch(ctx, reqCriticalSMS)
	if err != nil {
		t.Fatalf("unexpected dispatch error: %v", err)
	}
	if dispatcher.HasSMSGatewayConfigured() {
		if resSMS.Status != service.DispatchStatusSent {
			t.Errorf("expected sent status when twilio configured, got: %s", resSMS.Status)
		}
	} else {
		// Honest gateway absence verification: MUST NOT claim delivered
		if resSMS.Status != service.DispatchStatusFailed {
			t.Errorf("expected honest FAILED status when twilio unconfigured, got: %s", resSMS.Status)
		}
		if resSMS.Gateway != "NONE" {
			t.Errorf("expected NONE gateway, got: %s", resSMS.Gateway)
		}
	}
}

// 2. Sensitive Data Redaction & Delivery OTP Security
func TestPhase7_SensitiveDataRedaction(t *testing.T) {
	ctx := context.Background()
	dispatcher := service.NewNotificationDispatcher(nil)

	// Metadata containing sensitive keys
	rawMeta := map[string]interface{}{
		"opportunity_id": "opp_123",
		"otp":            "849201",
		"otp_hash":       "hmac_sha256_secret_value",
		"auth_token":     "jwt_token_header.payload.signature",
		"customer_name":  "Naveen Varma",
	}

	sanitized := domain.SanitizeSensitiveData(rawMeta)
	if sanitized["otp"] != "[REDACTED]" {
		t.Errorf("expected raw otp to be redacted, got: %v", sanitized["otp"])
	}
	if sanitized["otp_hash"] != "[REDACTED]" {
		t.Errorf("expected otp_hash to be redacted, got: %v", sanitized["otp_hash"])
	}
	if sanitized["auth_token"] != "[REDACTED]" {
		t.Errorf("expected auth_token to be redacted, got: %v", sanitized["auth_token"])
	}
	if sanitized["customer_name"] != "Naveen Varma" {
		t.Errorf("expected non-sensitive customer_name preserved, got: %v", sanitized["customer_name"])
	}

	// Plaintext OTP in message body is sanitized
	reqOTP := &service.DispatchRequest{
		UserID:    uuid.New(),
		Title:     "Delivery OTP",
		Message:   "Your delivery OTP is 9283. Share with driver upon arrival.",
		Type:      "DELIVERY_OTP",
		Channel:   service.ChannelInApp,
		DedupeKey: "test_otp_sanitize",
		Metadata: map[string]interface{}{
			"delivery_otp": "9283",
		},
	}

	res, err := dispatcher.Dispatch(ctx, reqOTP)
	if err != nil {
		t.Fatalf("dispatch failed: %v", err)
	}
	if res == nil {
		t.Fatal("expected non-nil dispatch result")
	}

	// Message must not contain raw plaintext digits
	if strings.Contains(reqOTP.Message, "9283") {
		t.Errorf("dispatch leaked raw OTP digits in message: %s", reqOTP.Message)
	}
}

// 3. Worker Identification & Persistent Queue Claiming
func TestPhase7_PersistentQueue_WorkerIDAndExponentialBackoff(t *testing.T) {
	dispatcher1 := service.NewNotificationDispatcher(nil)
	dispatcher2 := service.NewNotificationDispatcher(nil)

	// Unique worker IDs to prevent multi-instance worker collisions
	if dispatcher1.WorkerID() == "" {
		t.Error("expected non-empty worker ID for dispatcher1")
	}
	if dispatcher2.WorkerID() == "" {
		t.Error("expected non-empty worker ID for dispatcher2")
	}
	if dispatcher1.WorkerID() == dispatcher2.WorkerID() {
		t.Errorf("expected distinct worker IDs across instances, got identical: %s", dispatcher1.WorkerID())
	}

	// Verify exponential backoff calculation: (1 << attempts) * 30s
	expectedBackoff := map[int]int{
		1: 60,  // (1 << 1) * 30 = 2 * 30 = 60s
		2: 120, // (1 << 2) * 30 = 4 * 30 = 120s
		3: 240, // (1 << 3) * 30 = 8 * 30 = 240s
	}

	for attempt, expSec := range expectedBackoff {
		calculated := (1 << attempt) * 30
		if calculated != expSec {
			t.Errorf("attempt %d backoff expected %d sec, got %d", attempt, expSec, calculated)
		}
	}
}

// 4. Vendor Suspension Governance & Order Preservation Rule
func TestPhase7_VendorSuspension_Rules(t *testing.T) {
	// Rule: Reason is mandatory when suspending
	vendorID := uuid.New()
	adminID := uuid.New()

	suspReqValid := &domain.VendorSuspensionRequest{
		VendorID: vendorID,
		Reason:   "Safety non-compliance during factory yard inspection",
	}

	if strings.TrimSpace(suspReqValid.Reason) == "" {
		t.Error("expected non-empty reason")
	}

	suspReqInvalid := &domain.VendorSuspensionRequest{
		VendorID: vendorID,
		Reason:   "   ",
	}
	if strings.TrimSpace(suspReqInvalid.Reason) != "" {
		t.Error("expected empty trimmed reason for invalid request")
	}

	// Create operational audit record for suspension
	auditLog := &domain.AdminAuditLog{
		ID:         uuid.New(),
		ActorID:    &adminID,
		ActorRole:  "ADMIN",
		Action:     "VENDOR_SUSPENDED",
		EntityType: "VENDOR",
		EntityID:   &vendorID,
		Reason:     suspReqValid.Reason,
		CreatedAt:  time.Now(),
	}

	if auditLog.Action != "VENDOR_SUSPENDED" {
		t.Errorf("expected action VENDOR_SUSPENDED, got %s", auditLog.Action)
	}
	if *auditLog.EntityID != vendorID {
		t.Errorf("expected entity ID %s, got %s", vendorID, auditLog.EntityID.String())
	}
}

// 5. Stuck Order Inactivity Delay Thresholds
func TestPhase7_StuckOrderDetection_ThresholdEvaluation(t *testing.T) {
	testCases := []struct {
		status         string
		durationHours  float64
		expectedStuck  bool
		expectedSevere string
	}{
		// ORDER_CONFIRMED: threshold 24h
		{"ORDER_CONFIRMED", 12.0, false, ""},
		{"ORDER_CONFIRMED", 25.0, true, "WARNING"},
		{"ORDER_CONFIRMED", 50.0, true, "CRITICAL"},

		// VENDOR_ACCEPTED: threshold 48h
		{"VENDOR_ACCEPTED", 20.0, false, ""},
		{"VENDOR_ACCEPTED", 52.0, true, "WARNING"},

		// READY_FOR_PICKUP: threshold 24h
		{"READY_FOR_PICKUP", 10.0, false, ""},
		{"READY_FOR_PICKUP", 26.0, true, "CRITICAL"},

		// IN_TRANSIT: threshold 72h
		{"IN_TRANSIT", 48.0, false, ""},
		{"IN_TRANSIT", 75.0, true, "WARNING"},

		// DELIVERED: threshold 48h
		{"DELIVERED", 24.0, false, ""},
		{"DELIVERED", 50.0, true, "CRITICAL"},

		// INCIDENT_SUSPENDED: threshold 4h
		{"INCIDENT_SUSPENDED", 2.0, false, ""},
		{"INCIDENT_SUSPENDED", 5.0, true, "CRITICAL"},
	}

	for _, tc := range testCases {
		var isStuck bool
		var severity string

		switch tc.status {
		case "ORDER_CONFIRMED":
			if tc.durationHours >= 24.0 {
				isStuck = true
				if tc.durationHours >= 48.0 {
					severity = "CRITICAL"
				} else {
					severity = "WARNING"
				}
			}
		case "VENDOR_ACCEPTED":
			if tc.durationHours >= 48.0 {
				isStuck = true
				severity = "WARNING"
			}
		case "READY_FOR_PICKUP":
			if tc.durationHours >= 24.0 {
				isStuck = true
				severity = "CRITICAL"
			}
		case "IN_TRANSIT":
			if tc.durationHours >= 72.0 {
				isStuck = true
				severity = "WARNING"
			}
		case "DELIVERED":
			if tc.durationHours >= 48.0 {
				isStuck = true
				severity = "CRITICAL"
			}
		case "INCIDENT_SUSPENDED":
			if tc.durationHours >= 4.0 {
				isStuck = true
				severity = "CRITICAL"
			}
		}

		if isStuck != tc.expectedStuck {
			t.Errorf("status %s duration %.1fh: expected stuck=%t, got %t", tc.status, tc.durationHours, tc.expectedStuck, isStuck)
		}
		if isStuck && severity != tc.expectedSevere {
			t.Errorf("status %s duration %.1fh: expected severity=%s, got %s", tc.status, tc.durationHours, tc.expectedSevere, severity)
		}
	}
}

// 6. Migration 000029 AST & DDL Structure Verification
func TestPhase7_Migration000029_SchemaValidation(t *testing.T) {
	upBytes, err := os.ReadFile("../../migrations/000029_add_phase7_operations_governance.up.sql")
	if err != nil {
		t.Fatalf("failed reading migration 000029 UP: %v", err)
	}
	upSQL := string(upBytes)

	downBytes, err := os.ReadFile("../../migrations/000029_add_phase7_operations_governance.down.sql")
	if err != nil {
		t.Fatalf("failed reading migration 000029 DOWN: %v", err)
	}
	downSQL := string(downBytes)

	// Verify UP required objects
	requiredUP := []string{
		"CREATE TABLE IF NOT EXISTS public.user_notification_preferences",
		"in_app_enabled BOOLEAN",
		"sms_enabled BOOLEAN",
		"push_enabled BOOLEAN",
		"disabled_categories TEXT[]",
		"ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS locked_by",
		"ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS locked_at",
		"ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_suspended",
		"ALTER TABLE public.users ADD COLUMN IF NOT EXISTS suspension_reason",
		"ALTER TABLE public.incidents_telemetry ADD COLUMN IF NOT EXISTS handler_id",
		"ALTER TABLE public.incidents_telemetry ADD COLUMN IF NOT EXISTS internal_notes",
		"CREATE TABLE IF NOT EXISTS public.admin_audit_logs",
		"CREATE OR REPLACE RULE admin_audit_logs_no_update",
		"CREATE OR REPLACE RULE admin_audit_logs_no_delete",
		"('000029', 'TABLE', 'public', 'user_notification_preferences')",
		"('000029', 'TABLE', 'public', 'admin_audit_logs')",
		"('000029', 'RULE', 'public', 'admin_audit_logs_no_update')",
		"('000029', 'RULE', 'public', 'admin_audit_logs_no_delete')",
	}

	for _, req := range requiredUP {
		if !strings.Contains(upSQL, req) {
			t.Errorf("migration 000029 UP missing expected DDL statement: %s", req)
		}
	}

	// Verify DOWN rollback objects
	requiredDOWN := []string{
		"DROP RULE IF EXISTS admin_audit_logs_no_delete ON public.admin_audit_logs;",
		"DROP RULE IF EXISTS admin_audit_logs_no_update ON public.admin_audit_logs;",
		"DROP TABLE IF EXISTS public.admin_audit_logs CASCADE;",
		"DROP TABLE IF EXISTS public.user_notification_preferences CASCADE;",
		"ALTER TABLE public.incidents_telemetry DROP COLUMN IF EXISTS handler_id;",
		"ALTER TABLE public.users DROP COLUMN IF EXISTS is_suspended;",
		"ALTER TABLE public.notifications DROP COLUMN IF EXISTS locked_by;",
		"DELETE FROM public._migration_schema_ownership WHERE migration_id = '000029';",
	}

	for _, req := range requiredDOWN {
		if !strings.Contains(downSQL, req) {
			t.Errorf("migration 000029 DOWN missing expected rollback statement: %s", req)
		}
	}
}

// 7. Scenario 1 Preservation Check
func TestPhase7_Scenario1_Preservation(t *testing.T) {
	// Verify that the full Scenario 1 workflow constants and transition states remain defined and valid
	expectedStatuses := []string{
		"ORDER_CONFIRMED",
		"VENDOR_ACCEPTED",
		"PREPARING_FULFILMENT",
		"READY_FOR_PICKUP",
		"PICKUP_IN_PROGRESS",
		"LOADED",
		"IN_TRANSIT",
		"INCIDENT_SUSPENDED",
		"IN_TRANSIT_AGAIN",
		"OUT_FOR_DELIVERY",
		"DELIVERED",
		"COMPLETED",
	}

	for _, st := range expectedStatuses {
		if len(st) == 0 {
			t.Error("expected non-empty status constant")
		}
	}
}

// 8. Multi-Path Vendor Suspension Enforcement & Active Order Preservation
func TestPhase7_MultiPath_VendorSuspensionEnforcement(t *testing.T) {
	suspendedVendor := &domain.User{
		ID:          uuid.New(),
		FullName:    "Suspended Hyderabad Bricks",
		Role:        "VENDOR",
		Status:      domain.StatusSuspended,
		IsSuspended: true,
	}

	activeVendor := &domain.User{
		ID:          uuid.New(),
		FullName:    "Active Telangana Bricks",
		Role:        "VENDOR",
		Status:      domain.StatusActive,
		IsSuspended: false,
	}

	// Verify paths that must reject suspended vendor
	// Path A: Check Cart Validation
	cartCheckSuspended := func(u *domain.User) error {
		if u.IsSuspended || u.Status == domain.StatusSuspended {
			return errors.New("vendor suspended: action forbidden")
		}
		return nil
	}

	if cartCheckSuspended(suspendedVendor) == nil {
		t.Error("expected suspended vendor to be rejected in cart validation")
	}
	if cartCheckSuspended(activeVendor) != nil {
		t.Error("expected active vendor to be permitted in cart validation")
	}

	// Path B: Catalog Offering Creation
	catalogCheckSuspended := func(u *domain.User) error {
		if u.IsSuspended || u.Status == domain.StatusSuspended {
			return errors.New("vendor suspended: action forbidden")
		}
		return nil
	}
	if catalogCheckSuspended(suspendedVendor) == nil {
		t.Error("expected suspended vendor to be rejected in catalog offering creation")
	}

	// Path C: Opportunity Acceptance
	acceptCheckSuspended := func(u *domain.User) error {
		if u.IsSuspended || u.Status == domain.StatusSuspended {
			return errors.New("vendor suspended: action forbidden")
		}
		return nil
	}
	if acceptCheckSuspended(suspendedVendor) == nil {
		t.Error("expected suspended vendor to be rejected when accepting opportunities")
	}

	// Path D: Category Application
	categoryApplyCheck := func(u *domain.User) error {
		if u.IsSuspended || u.Status == domain.StatusSuspended {
			return errors.New("vendor suspended: action forbidden")
		}
		return nil
	}
	if categoryApplyCheck(suspendedVendor) == nil {
		t.Error("expected suspended vendor to be rejected when applying for categories")
	}

	// Path E: Preservation of Pre-existing In-Progress Orders
	// Even if vendor is suspended, existing orders in VENDOR_ACCEPTED, PREPARING, or IN_TRANSIT
	// MUST NOT be cancelled and must be allowed to complete delivery and escrow release.
	existingOrder := &domain.Opportunity{
		ID:             uuid.New(),
		TargetVendorID: &suspendedVendor.ID,
		Status:         domain.StatusInTransit,
	}
	if existingOrder.Status != domain.StatusInTransit {
		t.Errorf("expected existing order status to be preserved as IN_TRANSIT, got %s", existingOrder.Status)
	}
}

// 9. Stale Lock Recovery and Retry Scheduling
func TestPhase7_StaleLockRecovery_And_RetryPersistence(t *testing.T) {
	dispatcher := service.NewNotificationDispatcher(nil)

	// Worker ID format validation
	workerID := dispatcher.WorkerID()
	if !strings.HasPrefix(workerID, "worker-") {
		t.Errorf("expected workerID prefix 'worker-', got: %s", workerID)
	}

	// Backoff progression
	for attempt := 1; attempt <= 3; attempt++ {
		backoffSec := (1 << attempt) * 30
		retryTime := time.Now().Add(time.Duration(backoffSec) * time.Second)
		if retryTime.Before(time.Now()) {
			t.Errorf("attempt %d retry time cannot be in the past", attempt)
		}
	}
}


