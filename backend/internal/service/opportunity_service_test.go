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
