package service_test

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/uop/backend/internal/service"
)

// ----------------------------------------------------------------------------
// Notification Dispatcher Verification Tests
// ----------------------------------------------------------------------------

func TestNotificationDispatcher_InAppDelivery(t *testing.T) {
	dispatcher := service.NewNotificationDispatcher(nil)
	ctx := context.Background()

	req := &service.DispatchRequest{
		UserID:    uuid.New(),
		Title:     "Order Accepted by Srinivas Bricks",
		Message:   "Your order #WM-101 has been confirmed by the vendor.",
		Type:      "ORDER_ACCEPTED",
		Channel:   service.ChannelInApp,
		DedupeKey: "test:dedupe:inapp:1",
	}

	result, err := dispatcher.Dispatch(ctx, req)
	if err != nil {
		t.Fatalf("Unexpected dispatch error: %v", err)
	}

	if result.Status != service.DispatchStatusDelivered {
		t.Fatalf("Expected status DELIVERED for in-app notification, got %s", result.Status)
	}
	if result.Gateway != "IN_APP_DB" {
		t.Fatalf("Expected gateway IN_APP_DB, got %s", result.Gateway)
	}

	t.Logf("PASS: In-app notification delivered successfully (status: %s, gateway: %s)", result.Status, result.Gateway)
}

func TestNotificationDispatcher_SMSGatewayAbsenceHonesty(t *testing.T) {
	// Ensure SMS credentials are not set
	os.Unsetenv("TWILIO_ACCOUNT_SID")
	os.Unsetenv("TWILIO_AUTH_TOKEN")

	dispatcher := service.NewNotificationDispatcher(nil)
	ctx := context.Background()

	req := &service.DispatchRequest{
		UserID:    uuid.New(),
		Title:     "Delivery OTP",
		Message:   "Your delivery OTP is 482915",
		Type:      "DELIVERY_OTP",
		Channel:   service.ChannelSMS,
		Recipient: "+919640754927",
		DedupeKey: "test:dedupe:sms:1",
	}

	result, err := dispatcher.Dispatch(ctx, req)
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}

	// Must NOT claim SMS was sent or delivered
	if result.Status == service.DispatchStatusDelivered || result.Status == service.DispatchStatusSent {
		t.Fatalf("Security failure: system falsely claimed SMS was %s without Twilio credentials!", result.Status)
	}

	if result.Status != service.DispatchStatusFailed {
		t.Fatalf("Expected status FAILED when SMS gateway is missing, got %s", result.Status)
	}

	if result.Gateway != "NONE" {
		t.Fatalf("Expected gateway NONE, got %s", result.Gateway)
	}

	t.Logf("PASS: Honest SMS failure recorded when Twilio credentials absent (error: %s)", result.ErrorMessage)
}

func TestNotificationDispatcher_PushGatewayAbsenceHonesty(t *testing.T) {
	// Ensure Push credentials are not set
	os.Unsetenv("FCM_SERVER_KEY")
	os.Unsetenv("FIREBASE_CREDENTIALS_JSON")

	dispatcher := service.NewNotificationDispatcher(nil)
	ctx := context.Background()

	req := &service.DispatchRequest{
		UserID:    uuid.New(),
		Title:     "Truck Loaded",
		Message:   "Your bricks are loaded and in transit.",
		Type:      "SHIPMENT_LOADED",
		Channel:   service.ChannelPush,
		Recipient: "fcm_device_token_xyz",
		DedupeKey: "test:dedupe:push:1",
	}

	result, err := dispatcher.Dispatch(ctx, req)
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}

	// Must NOT claim Push was sent or delivered
	if result.Status == service.DispatchStatusDelivered || result.Status == service.DispatchStatusSent {
		t.Fatalf("Security failure: system falsely claimed Push was %s without FCM credentials!", result.Status)
	}

	if result.Status != service.DispatchStatusFailed {
		t.Fatalf("Expected status FAILED when Push gateway is missing, got %s", result.Status)
	}

	t.Logf("PASS: Honest Push failure recorded when FCM credentials absent (error: %s)", result.ErrorMessage)
}

func TestNotificationDispatcher_Deduplication(t *testing.T) {
	dispatcher := service.NewNotificationDispatcher(nil)
	ctx := context.Background()
	dedupeKey := "order:completed:opportunity_999"

	req := &service.DispatchRequest{
		UserID:    uuid.New(),
		Title:     "Order Completed",
		Message:   "Order #999 has been delivered and verified.",
		Type:      "ORDER_COMPLETED",
		Channel:   service.ChannelInApp,
		DedupeKey: dedupeKey,
	}

	// First dispatch
	res1, err := dispatcher.Dispatch(ctx, req)
	if err != nil {
		t.Fatalf("First dispatch error: %v", err)
	}
	if res1.AlreadyDispatched {
		t.Fatalf("First dispatch marked as already dispatched")
	}

	// Second dispatch with same dedupe key
	res2, err := dispatcher.Dispatch(ctx, req)
	if err != nil {
		t.Fatalf("Second dispatch error: %v", err)
	}
	if !res2.AlreadyDispatched {
		t.Fatalf("Second dispatch failed deduplication check!")
	}
	if res2.Gateway != "DEDUPE_CACHE" {
		t.Fatalf("Expected gateway DEDUPE_CACHE, got %s", res2.Gateway)
	}

	t.Logf("PASS: Deduplication prevented redundant notification dispatch for key %s", dedupeKey)
}

func TestNotificationDispatcher_QueueAndProcess(t *testing.T) {
	dispatcher := service.NewNotificationDispatcher(nil)
	ctx := context.Background()

	dispatcher.Enqueue(&service.DispatchRequest{
		UserID:    uuid.New(),
		Title:     "Queued Notification 1",
		Message:   "Background task update",
		Channel:   service.ChannelInApp,
		DedupeKey: "queue:test:1",
	})
	dispatcher.Enqueue(&service.DispatchRequest{
		UserID:    uuid.New(),
		Title:     "Queued Notification 2",
		Message:   "Logistics update",
		Channel:   service.ChannelInApp,
		DedupeKey: "queue:test:2",
	})

	if count := dispatcher.QueueLength(); count != 2 {
		t.Fatalf("Expected queue length 2, got %d", count)
	}

	processed, err := dispatcher.ProcessQueue(ctx)
	if err != nil {
		t.Fatalf("ProcessQueue error: %v", err)
	}
	if processed != 2 {
		t.Fatalf("Expected 2 processed notifications, got %d", processed)
	}
	if count := dispatcher.QueueLength(); count != 0 {
		t.Fatalf("Expected empty queue after processing, got %d", count)
	}

	t.Logf("PASS: Notification queue enqueued 2 jobs and drained successfully")
}

func TestNotificationDispatcher_StartupAndGracefulShutdown(t *testing.T) {
	dispatcher := service.NewNotificationDispatcher(nil)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	if dispatcher.IsRunning() {
		t.Fatalf("Dispatcher unexpectedly running before Start")
	}

	dispatcher.Start(ctx)
	if !dispatcher.IsRunning() {
		t.Fatalf("Dispatcher not running after Start")
	}

	// Double start is a safe no-op
	dispatcher.Start(ctx)
	if !dispatcher.IsRunning() {
		t.Fatalf("Dispatcher stopped after redundant Start")
	}

	time.Sleep(50 * time.Millisecond)

	dispatcher.Stop()
	if dispatcher.IsRunning() {
		t.Fatalf("Dispatcher still running after Stop")
	}

	t.Logf("PASS: NotificationDispatcher startup, execution, and graceful termination verified")
}

func TestNotificationDispatcher_Migration000028_UpAndDownValidation(t *testing.T) {
	upBytes, err := os.ReadFile("../migrations/000028_add_persistent_notifications_and_dispatch_queue.up.sql")
	if err != nil {
		upBytes, err = os.ReadFile("../../migrations/000028_add_persistent_notifications_and_dispatch_queue.up.sql")
	}
	if err != nil {
		t.Fatalf("Failed reading 000028 UP migration: %v", err)
	}
	upSQL := string(upBytes)

	requiredUpTokens := []string{
		"CREATE TABLE IF NOT EXISTS public.notifications",
		"user_id UUID NOT NULL REFERENCES public.users(id)",
		"idx_notifications_user_id",
		"idx_notifications_created_at",
		"idx_notifications_dispatch_status",
		"idx_notifications_dedupe_key",
		"_migration_schema_ownership",
		"'000028'",
	}
	for _, tok := range requiredUpTokens {
		if !strings.Contains(upSQL, tok) {
			t.Fatalf("Migration 000028 UP missing token: %s", tok)
		}
	}
	t.Logf("PASS: Migration 000028 UP validated: persistent notifications table, indexes, and ownership verified")

	downBytes, err := os.ReadFile("../migrations/000028_add_persistent_notifications_and_dispatch_queue.down.sql")
	if err != nil {
		downBytes, err = os.ReadFile("../../migrations/000028_add_persistent_notifications_and_dispatch_queue.down.sql")
	}
	if err != nil {
		t.Fatalf("Failed reading 000028 DOWN migration: %v", err)
	}
	downSQL := string(downBytes)

	requiredDownTokens := []string{
		"DROP INDEX IF EXISTS public.idx_notifications_dedupe_key",
		"DROP INDEX IF EXISTS public.idx_notifications_dispatch_status",
		"DROP TABLE IF EXISTS public.notifications CASCADE",
		"DELETE FROM public._migration_schema_ownership WHERE migration_id = '000028'",
	}
	for _, tok := range requiredDownTokens {
		if !strings.Contains(downSQL, tok) {
			t.Fatalf("Migration 000028 DOWN missing rollback token: %s", tok)
		}
	}
	t.Logf("PASS: Migration 000028 DOWN validated: index drops, table drop, and ownership rollback verified")
}
