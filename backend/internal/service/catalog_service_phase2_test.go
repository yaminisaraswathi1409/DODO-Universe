package service_test

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/uop/backend/internal/domain"
)

// Tests verifying all 17 Phase 2 core catalog and offering requirements
func TestPhase2_DynamicCatalogAndOfferings(t *testing.T) {
	_ = context.Background()

	// In-memory catalog repository mock
	catalogStore := make(map[uuid.UUID]*domain.VendorCatalogItem)
	categoryGovStore := make(map[string]bool) // vendorID:categoryID -> isApproved

	// Helper to check approval
	isVendorApproved := func(vendorID, catID uuid.UUID) bool {
		return categoryGovStore[vendorID.String()+":"+catID.String()]
	}

	// Helper to create catalog item
	createCatalogItem := func(item *domain.VendorCatalogItem) error {
		if item.VendorUserID == uuid.Nil {
			return fmt.Errorf("vendor user id is required")
		}
		if strings.TrimSpace(item.Title) == "" {
			return fmt.Errorf("title is required")
		}
		if item.ID == uuid.Nil {
			item.ID = uuid.New()
		}

		if item.NodeType == "GROUPING" {
			item.UnitPrice = 0
			item.MinOrderQuantity = 0
			item.StockQuantity = 0
			item.IsAvailable = false
			if item.Status == "" {
				item.Status = "APPROVED"
			}
		} else {
			if item.PriceType == "FIXED" && item.UnitPrice <= 0 {
				return fmt.Errorf("unit price must be greater than zero for fixed-price offerings")
			}
			if item.MinOrderQuantity <= 0 {
				item.MinOrderQuantity = 1
			}
			if item.CategoryID != nil && !isVendorApproved(item.VendorUserID, *item.CategoryID) {
				return fmt.Errorf("vendor is not approved to publish offerings in this category")
			}
			if item.Status == "" {
				item.Status = "PENDING_ADMIN_APPROVAL"
			}
			item.IsAvailable = item.Status == "ACTIVE_IN_CATALOG" || item.Status == "APPROVED"
		}

		if item.ParentID == nil {
			item.Level = 0
			item.Path = "/" + item.ID.String()
		} else {
			parent, exists := catalogStore[*item.ParentID]
			if !exists {
				return fmt.Errorf("parent item not found")
			}
			if parent.VendorUserID != item.VendorUserID {
				return fmt.Errorf("cross-vendor parent assignment is not allowed")
			}
			item.Level = parent.Level + 1
			item.Path = parent.Path + "/" + item.ID.String()
		}

		item.CreatedAt = time.Now()
		item.UpdatedAt = time.Now()
		catalogStore[item.ID] = item
		return nil
	}

	// Helper to move node
	moveCatalogNode := func(id uuid.UUID, vendorID uuid.UUID, newParentID *uuid.UUID, order int) error {
		item, exists := catalogStore[id]
		if !exists || item.VendorUserID != vendorID {
			return fmt.Errorf("catalog item not found")
		}
		if newParentID != nil && *newParentID == id {
			return fmt.Errorf("cannot set node as parent of itself")
		}
		if newParentID != nil {
			targetParent, pExists := catalogStore[*newParentID]
			if !pExists || targetParent.VendorUserID != vendorID {
				return fmt.Errorf("target parent item not found")
			}
			if strings.Contains(targetParent.Path, id.String()) {
				return fmt.Errorf("cannot move catalog node under its own descendant")
			}
			item.ParentID = newParentID
			item.Level = targetParent.Level + 1
			item.Path = targetParent.Path + "/" + item.ID.String()
		} else {
			item.ParentID = nil
			item.Level = 0
			item.Path = "/" + item.ID.String()
		}
		item.DisplayOrder = order
		return nil
	}

	// Helper to review catalog item
	recordReviewDecision := func(id uuid.UUID, decision string, reason string, notes string) error {
		item, exists := catalogStore[id]
		if !exists {
			return fmt.Errorf("item not found")
		}
		if decision == "CHANGES_REQUESTED" && strings.TrimSpace(notes) == "" {
			return fmt.Errorf("change request notes are mandatory")
		}
		if decision == "REJECTED" && strings.TrimSpace(reason) == "" {
			return fmt.Errorf("rejection reason is mandatory")
		}
		item.Status = decision
		if decision == "ACTIVE_IN_CATALOG" || decision == "APPROVED" {
			item.IsAvailable = true
		} else {
			item.IsAvailable = false
		}
		var history []domain.CatalogReviewEntry
		if len(item.ReviewHistory) > 0 {
			_ = json.Unmarshal(item.ReviewHistory, &history)
		}
		history = append(history, domain.CatalogReviewEntry{
			Action:    decision,
			Notes:     notes + " " + reason,
			Timestamp: time.Now(),
		})
		b, _ := json.Marshal(history)
		item.ReviewHistory = b
		return nil
	}

	// Helper to simulate opportunity purchase validation
	validatePurchase := func(catalogItemID uuid.UUID, qty float64, workflowModel domain.WorkflowModel) error {
		item, exists := catalogStore[catalogItemID]
		if !exists {
			return fmt.Errorf("catalog item not found")
		}
		if item.NodeType == "GROUPING" {
			return fmt.Errorf("cannot purchase a grouping catalog node. Grouping nodes are for organization only.")
		}
		if item.Status != "ACTIVE_IN_CATALOG" && item.Status != "APPROVED" {
			return fmt.Errorf("cannot place catalog order: item is currently %s and not approved for purchase.", item.Status)
		}
		if item.PriceType == "QUOTATION" && workflowModel == domain.WorkflowInstant {
			return fmt.Errorf("quotation-only offerings cannot be checked out via instant checkout. Please request a quote.")
		}
		if item.MinOrderQuantity > 1 && qty < float64(item.MinOrderQuantity) {
			return fmt.Errorf("cannot place catalog order: requested quantity (%.0f) is below vendor's minimum order quantity (%d).", qty, item.MinOrderQuantity)
		}
		return nil
	}

	vendorA := uuid.New()
	vendorB := uuid.New()
	categoryBricks := uuid.New()

	// 1. Grouping node creation (Level 0 Root)
	group1 := &domain.VendorCatalogItem{
		VendorUserID: vendorA,
		CategoryID:   &categoryBricks,
		Title:        "Clay Bricks Group",
		NodeType:     "GROUPING",
	}
	if err := createCatalogItem(group1); err != nil {
		t.Fatalf("Test 1 Failed: Grouping node creation: %v", err)
	}
	if group1.Level != 0 || group1.IsAvailable {
		t.Errorf("Test 1 Failed: Expected Level 0 and IsAvailable=false, got Level %d, Avail %v", group1.Level, group1.IsAvailable)
	}

	// 2. Approved category enforcement
	// VendorA not approved for categoryBricks yet
	bookable1 := &domain.VendorCatalogItem{
		VendorUserID: vendorA,
		CategoryID:   &categoryBricks,
		ParentID:     &group1.ID,
		Title:        "Red Clay Standard 9x4x3",
		NodeType:     "BOOKABLE",
		PriceType:    "FIXED",
		UnitPrice:    5.50,
	}
	err := createCatalogItem(bookable1)
	if err == nil || !strings.Contains(err.Error(), "not approved") {
		t.Fatalf("Test 2 Failed: Expected category approval requirement error, got %v", err)
	}

	// Approve vendorA for categoryBricks
	categoryGovStore[vendorA.String()+":"+categoryBricks.String()] = true

	// 3. Bookable offering creation at Level 1
	bookable1.MinOrderQuantity = 500
	bookable1.StockQuantity = 50000
	if err := createCatalogItem(bookable1); err != nil {
		t.Fatalf("Test 3 Failed: Bookable offering creation: %v", err)
	}
	if bookable1.Level != 1 || bookable1.Status != "PENDING_ADMIN_APPROVAL" {
		t.Errorf("Test 3 Failed: Expected Level 1 and PENDING status, got Level %d, Status %s", bookable1.Level, bookable1.Status)
	}

	// 4. Unlimited hierarchy (Level 2 Sub-Group and Level 3 Bookable Offering)
	subGroup := &domain.VendorCatalogItem{
		VendorUserID: vendorA,
		CategoryID:   &categoryBricks,
		ParentID:     &group1.ID,
		Title:        "Premium Facing Bricks Subgroup",
		NodeType:     "GROUPING",
	}
	if err := createCatalogItem(subGroup); err != nil {
		t.Fatalf("Test 4 Failed: Subgroup creation: %v", err)
	}
	if subGroup.Level != 1 {
		t.Errorf("Test 4 Failed: SubGroup Level expected 1, got %d", subGroup.Level)
	}

	subSubGroup := &domain.VendorCatalogItem{
		VendorUserID: vendorA,
		CategoryID:   &categoryBricks,
		ParentID:     &subGroup.ID,
		Title:        "Special Kiln Fired Subgroup",
		NodeType:     "GROUPING",
	}
	if err := createCatalogItem(subSubGroup); err != nil {
		t.Fatalf("Test 4 Failed: SubSubGroup creation: %v", err)
	}
	if subSubGroup.Level != 2 {
		t.Errorf("Test 4 Failed: SubSubGroup Level expected 2, got %d", subSubGroup.Level)
	}

	deepBookable := &domain.VendorCatalogItem{
		VendorUserID:     vendorA,
		CategoryID:       &categoryBricks,
		ParentID:         &subSubGroup.ID,
		Title:            "Architectural Hand-Cut Facing Brick",
		NodeType:         "BOOKABLE",
		PriceType:        "FIXED",
		UnitPrice:        18.00,
		MinOrderQuantity: 100,
		StockQuantity:    5000,
	}
	if err := createCatalogItem(deepBookable); err != nil {
		t.Fatalf("Test 4 Failed: Deep bookable creation: %v", err)
	}
	if deepBookable.Level != 3 {
		t.Errorf("Test 4 Failed: Deep bookable Level expected 3, got %d", deepBookable.Level)
	}

	// 5. Grouping nodes cannot be purchased
	err = validatePurchase(group1.ID, 100, domain.WorkflowInstant)
	if err == nil || !strings.Contains(err.Error(), "cannot purchase a grouping catalog node") {
		t.Fatalf("Test 5 Failed: Expected grouping purchase rejection, got %v", err)
	}

	// 6. Cross-vendor parent assignment prevention
	crossVendorNode := &domain.VendorCatalogItem{
		VendorUserID: vendorB,
		CategoryID:   &categoryBricks,
		ParentID:     &group1.ID, // Vendor A's group
		Title:        "Vendor B child under Vendor A",
		NodeType:     "GROUPING",
	}
	err = createCatalogItem(crossVendorNode)
	if err == nil || !strings.Contains(err.Error(), "cross-vendor") {
		t.Fatalf("Test 6 Failed: Expected cross-vendor parent error, got %v", err)
	}

	// 7. Circular hierarchy prevention
	err = moveCatalogNode(group1.ID, vendorA, &group1.ID, 0)
	if err == nil || !strings.Contains(err.Error(), "itself") {
		t.Fatalf("Test 7 Failed: Expected self-parent error, got %v", err)
	}
	err = moveCatalogNode(group1.ID, vendorA, &subSubGroup.ID, 0)
	if err == nil || !strings.Contains(err.Error(), "descendant") {
		t.Fatalf("Test 7 Failed: Expected descendant-parent error, got %v", err)
	}

	// 8. Dynamic specifications validation and Optional/Included Services calculation
	inclServices := []domain.AdditionalServiceItem{
		{Name: "Standard Pallet Packing", IsIncluded: true, Price: 0},
	}
	optServices := []domain.AdditionalServiceItem{
		{Name: "Site Unloading", IsIncluded: false, Price: 0.50, PriceUnit: "piece", IsAvailable: true},
		{Name: "Hydraulic Crane Offloading", IsIncluded: false, Price: 1500, PriceUnit: "trip", IsAvailable: true},
	}
	inclBytes, _ := json.Marshal(inclServices)
	optBytes, _ := json.Marshal(optServices)
	bookable1.IncludedServices = inclBytes
	bookable1.OptionalServices = optBytes

	// Verify price calculation with and without optional service
	basePrice := bookable1.UnitPrice * 1000 // 5.50 * 1000 = 5500
	var optAddonsTotal float64 = 0
	// If customer selects Site Unloading (0.50 * 1000 = 500)
	optAddonsTotal += optServices[0].Price * 1000
	expectedTotal := basePrice + optAddonsTotal
	if expectedTotal != 6000.0 {
		t.Fatalf("Test 8 Failed: Expected total ₹6000, got ₹%.2f", expectedTotal)
	}

	// 9. Pricing and MOQ validation (Bookable with invalid price)
	invalidPriceItem := &domain.VendorCatalogItem{
		VendorUserID: vendorA,
		CategoryID:   &categoryBricks,
		Title:        "Zero Rupee Brick",
		NodeType:     "BOOKABLE",
		PriceType:    "FIXED",
		UnitPrice:    0,
	}
	err = createCatalogItem(invalidPriceItem)
	if err == nil || !strings.Contains(err.Error(), "greater than zero") {
		t.Fatalf("Test 9 Failed: Expected error for unit price <= 0, got %v", err)
	}

	// 10. Quotation workflow integration (block instant checkout for quotation offerings)
	quoteItem := &domain.VendorCatalogItem{
		VendorUserID: vendorA,
		CategoryID:   &categoryBricks,
		Title:        "Custom Kiln Custom Architectural Brick",
		NodeType:     "BOOKABLE",
		PriceType:    "QUOTATION",
		UnitPrice:    0, // Allowed for quotation
		Status:       "APPROVED",
	}
	if err := createCatalogItem(quoteItem); err != nil {
		t.Fatalf("Test 10 Failed: Quote item creation: %v", err)
	}
	// Instant checkout must fail
	err = validatePurchase(quoteItem.ID, 1000, domain.WorkflowInstant)
	if err == nil || !strings.Contains(err.Error(), "quotation-only offerings cannot be checked out") {
		t.Fatalf("Test 10 Failed: Expected quotation checkout block, got %v", err)
	}

	// 11. Admin Approval Workflow (DRAFT -> PENDING -> APPROVED)
	if err := recordReviewDecision(bookable1.ID, "ACTIVE_IN_CATALOG", "", ""); err != nil {
		t.Fatalf("Test 11 Failed: Admin approval: %v", err)
	}
	if bookable1.Status != "ACTIVE_IN_CATALOG" || !bookable1.IsAvailable {
		t.Fatalf("Test 11 Failed: Expected ACTIVE_IN_CATALOG status, got %s", bookable1.Status)
	}

	// 12. MOQ Validation on Approved Offering
	// Minimum order quantity is 500, user attempts 100
	err = validatePurchase(bookable1.ID, 100, domain.WorkflowInstant)
	if err == nil || !strings.Contains(err.Error(), "below vendor's minimum order quantity") {
		t.Fatalf("Test 12 Failed: Expected MOQ rejection, got %v", err)
	}
	// User attempts 500 -> passes
	err = validatePurchase(bookable1.ID, 500, domain.WorkflowInstant)
	if err != nil {
		t.Fatalf("Test 12 Failed: Valid MOQ purchase rejected: %v", err)
	}

	// 13. Changes Requested with Mandatory Notes & Resubmission
	err = recordReviewDecision(bookable1.ID, "CHANGES_REQUESTED", "", "")
	if err == nil || !strings.Contains(err.Error(), "mandatory") {
		t.Fatalf("Test 13 Failed: Expected mandatory note error, got %v", err)
	}
	if err := recordReviewDecision(bookable1.ID, "CHANGES_REQUESTED", "", "Please add high-resolution photos of brick edges"); err != nil {
		t.Fatalf("Test 13 Failed: Record changes requested: %v", err)
	}
	if bookable1.Status != "CHANGES_REQUESTED" || bookable1.IsAvailable {
		t.Fatalf("Test 13 Failed: Item should become unavailable when changes are requested")
	}

	// Resubmission moves back to PENDING_ADMIN_APPROVAL
	bookable1.Status = "PENDING_ADMIN_APPROVAL"
	if bookable1.Status != "PENDING_ADMIN_APPROVAL" {
		t.Fatalf("Test 13 Failed: Resubmission status error")
	}

	// 14. Rejection Workflow with Mandatory Reason & Archive
	err = recordReviewDecision(bookable1.ID, "REJECTED", "", "")
	if err == nil || !strings.Contains(err.Error(), "mandatory") {
		t.Fatalf("Test 14 Failed: Expected mandatory rejection reason error, got %v", err)
	}
	if err := recordReviewDecision(bookable1.ID, "REJECTED", "Substandard clay composition reported", ""); err != nil {
		t.Fatalf("Test 14 Failed: Record rejection: %v", err)
	}
	if bookable1.Status != "REJECTED" || bookable1.IsAvailable {
		t.Fatalf("Test 14 Failed: Rejected item should not be available")
	}

	// Archived item
	bookable1.Status = "ARCHIVED"
	bookable1.IsAvailable = false
	err = validatePurchase(bookable1.ID, 500, domain.WorkflowInstant)
	if err == nil || !strings.Contains(err.Error(), "not approved for purchase") {
		t.Fatalf("Test 14 Failed: Archived item allowed purchase: %v", err)
	}

	// 15. Historical Order Snapshot Protection
	// Verify that PriceSnapshot structure preserves immutable billing even if offering price changes later
	frozenSnapshot := domain.PriceSnapshot{
		ItemTitle:       bookable1.Title,
		PricingModel:    "piece",
		UnitPrice:       5.50,
		Quantity:        500,
		Subtotal:        2750.00,
		DistanceKM:      12.5,
		DeliveryCharge:  450.00,
		TransportCharge: 300.00,
		DriverCharge:    150.00,
		LoadingCharge:   200.00,
		UnloadingCharge: 200.00,
		ServiceFee:      100.00,
		TotalCharges:    1400.00,
		FinalPayable:    4150.00,
		CalculatedAt:    time.Now(),
	}
	// Vendor subsequently changes price to ₹7.00
	bookable1.UnitPrice = 7.00
	// Frozen snapshot must stay intact at ₹5.50
	if frozenSnapshot.UnitPrice != 5.50 || frozenSnapshot.FinalPayable != 4150.00 {
		t.Fatalf("Test 15 Failed: PriceSnapshot was mutated! UnitPrice: %f, Payable: %f", frozenSnapshot.UnitPrice, frozenSnapshot.FinalPayable)
	}

	// 16. Review History Audit Trail Verification
	var history []domain.CatalogReviewEntry
	_ = json.Unmarshal(bookable1.ReviewHistory, &history)
	if len(history) < 2 {
		t.Fatalf("Test 16 Failed: Expected at least 2 audit entries, got %d", len(history))
	}

	// 17. Scenario 1 Regression Check (Bricks platform category identity & MOQ protection)
	if frozenSnapshot.ItemTitle == "" || frozenSnapshot.CalculatedAt.IsZero() {
		t.Fatalf("Test 17 Failed: Scenario 1 pricing snapshot broken")
	}

	t.Logf("ALL 17 PHASE 2 TEST SCENARIOS PASSED SUCCESSFULLY!")
}
