package plugin

import (
	"context"
	"testing"
	"time"

	"github.com/uop/backend/internal/domain"
)

func TestWorkflowRegistry(t *testing.T) {
	registry := NewWorkflowRegistry()

	// Test Instant Match Plugin
	p, err := registry.Get(domain.WorkflowInstant)
	if err != nil || p == nil {
		t.Fatalf("Failed to retrieve InstantMatchPlugin: %v", err)
	}

	oppInstant := &domain.Opportunity{Title: "Deliver Groceries"}
	if err := p.Validate(context.Background(), oppInstant); err != nil {
		t.Errorf("Validation failed for valid instant opportunity: %v", err)
	}

	// Test Scheduled Plugin validation
	pScheduled, _ := registry.Get(domain.WorkflowScheduled)
	oppScheduledNoTime := &domain.Opportunity{Title: "Tractor Booking"}
	if err := pScheduled.Validate(context.Background(), oppScheduledNoTime); err == nil {
		t.Errorf("Expected error for scheduled booking without start time slot")
	}

	now := time.Now()
	oppScheduledValid := &domain.Opportunity{Title: "Tractor Booking", ScheduledStart: &now}
	if err := pScheduled.Validate(context.Background(), oppScheduledValid); err != nil {
		t.Errorf("Validation failed for valid scheduled opportunity: %v", err)
	}
}
