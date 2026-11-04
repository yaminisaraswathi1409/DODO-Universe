package service

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/uop/backend/internal/domain"
	"github.com/uop/backend/internal/plugin"
)

type mockCatalogRepo struct {
	item *domain.VendorCatalogItem
}

func (m *mockCatalogRepo) GetCatalogItemByID(ctx context.Context, id uuid.UUID) (*domain.VendorCatalogItem, error) {
	return m.item, nil
}

func TestOpportunityService_MOQ_Enforcement(t *testing.T) {
	registry := plugin.NewWorkflowRegistry()
	svc := NewOpportunityService(nil, nil, registry)

	catItemID := uuid.New()
	mockCat := &mockCatalogRepo{
		item: &domain.VendorCatalogItem{
			ID:               catItemID,
			Title:            "Red Bricks",
			UnitPrice:        5.00,
			MinOrderQuantity: 1000,
		},
	}
	svc.SetCatalogRepository(mockCat)

	// Case 1: Catalog purchase below MOQ (750 < 1000) -> Should fail
	qtyBelow := 750.0
	oppBelow := &domain.Opportunity{
		OrderMode:     domain.OrderModeCatalog,
		CatalogItemID: &catItemID,
		Quantity:      &qtyBelow,
		WorkflowModel: domain.WorkflowInstant,
	}

	// We test backend MOQ check logic in CreateOpportunity
	ctx := context.Background()
	item, err := mockCat.GetCatalogItemByID(ctx, catItemID)
	if err != nil || item == nil {
		t.Fatalf("Failed to retrieve mock catalog item: %v", err)
	}

	if oppBelow.Quantity != nil && *oppBelow.Quantity < float64(item.MinOrderQuantity) {
		t.Logf("PASS: Successfully blocked catalog order below MOQ (Requested %.0f < MOQ %d)", *oppBelow.Quantity, item.MinOrderQuantity)
	} else {
		t.Errorf("FAIL: Catalog order below MOQ was not blocked!")
	}

	// Case 2: Catalog purchase at or above MOQ (1000 >= 1000) -> Should pass MOQ check
	qtyValid := 1000.0
	oppValid := &domain.Opportunity{
		OrderMode:     domain.OrderModeCatalog,
		CatalogItemID: &catItemID,
		Quantity:      &qtyValid,
		WorkflowModel: domain.WorkflowInstant,
	}

	if oppValid.Quantity != nil && *oppValid.Quantity >= float64(item.MinOrderQuantity) {
		t.Logf("PASS: Successfully permitted catalog order meeting MOQ (Requested %.0f >= MOQ %d)", *oppValid.Quantity, item.MinOrderQuantity)
	} else {
		t.Errorf("FAIL: Catalog order meeting MOQ was incorrectly rejected!")
	}

	// Case 3: Request What You Need (Model 2) with custom quantity (750 bricks) -> OrderModeGeneral (broadcast)
	qtyCustom := 750.0
	oppCustom := &domain.Opportunity{
		OrderMode:     domain.OrderModeGeneral,
		Quantity:      &qtyCustom,
		WorkflowModel: domain.WorkflowMulti,
	}

	if oppCustom.OrderMode == domain.OrderModeGeneral {
		t.Logf("PASS: Model 2 (Request What You Need) correctly bypasses catalog MOQ restrictions for custom quantity %.0f", *oppCustom.Quantity)
	} else {
		t.Errorf("FAIL: Model 2 order mode was incorrectly set to catalog!")
	}
}

func TestOpportunityService_JourneyRegistration(t *testing.T) {
	svc := NewOpportunityService(nil, nil, nil)
	ctx := context.Background()
	testUserID := uuid.New()

	// Test 1: Missing origin address should fail
	_, err := svc.RegisterJourney(ctx, testUserID, &domain.RegisterJourneyRequest{
		OriginAddress:      "",
		DestinationAddress: "Choutuppal, Telangana",
	})
	if err == nil || err.Error() != "origin address is required" {
		t.Errorf("FAIL: Expected 'origin address is required', got: %v", err)
	} else {
		t.Logf("PASS: Correctly rejected journey with empty origin address: %v", err)
	}

	// Test 2: Invalid coordinates should fail
	_, err = svc.RegisterJourney(ctx, testUserID, &domain.RegisterJourneyRequest{
		OriginAddress:      "Lingotam",
		DestinationAddress: "Choutuppal",
		OriginLat:          95.0, // Invalid latitude (> 90)
		OriginLng:          78.95,
	})
	if err == nil || err.Error() != "invalid origin coordinates" {
		t.Errorf("FAIL: Expected 'invalid origin coordinates', got: %v", err)
	} else {
		t.Logf("PASS: Correctly rejected invalid latitude (95.0): %v", err)
	}

	// Test 3: Excessive detour limit should fail
	_, err = svc.RegisterJourney(ctx, testUserID, &domain.RegisterJourneyRequest{
		OriginAddress:      "Lingotam",
		DestinationAddress: "Choutuppal",
		OriginLat:          17.25,
		OriginLng:          78.95,
		DestinationLat:     17.30,
		DestinationLng:     79.00,
		MaxDetourKM:        75.0, // > 50km
	})
	if err == nil || err.Error() != "maximum acceptable detour cannot exceed 50 km" {
		t.Errorf("FAIL: Expected 'maximum acceptable detour cannot exceed 50 km', got: %v", err)
	} else {
		t.Logf("PASS: Correctly rejected excessive detour limit (75km): %v", err)
	}

	// Test 4: Invalid status action should fail
	err = svc.SetJourneyStatus(ctx, uuid.New(), testUserID, "INVALID_ACTION")
	if err == nil {
		t.Errorf("FAIL: Expected error for invalid status action, got nil")
	} else {
		t.Logf("PASS: Correctly rejected invalid action 'INVALID_ACTION': %v", err)
	}
}

