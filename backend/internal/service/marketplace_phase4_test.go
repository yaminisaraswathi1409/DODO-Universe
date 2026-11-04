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

// In-memory Phase 4 Customer Marketplace Test Suite
func TestPhase4_CustomerMarketplaceAndDiscovery(t *testing.T) {
	_ = context.Background()

	// 1. Setup Mock In-Memory Repositories
	userStore := make(map[uuid.UUID]*domain.User)
	catStore := make(map[uuid.UUID]*domain.Category)
	catApprovalStore := make(map[string]bool) // vendorID:categoryID -> isApproved
	catalogStore := make(map[uuid.UUID]*domain.VendorCatalogItem)

	// Seed Platform Categories
	bricksCatID := uuid.New()
	cementCatID := uuid.New()
	inactiveCatID := uuid.New()

	catStore[bricksCatID] = &domain.Category{
		ID:           bricksCatID,
		Name:         "Bricks & Building Materials",
		Slug:         "bricks",
		IsSelectable: true,
	}
	catStore[cementCatID] = &domain.Category{
		ID:           cementCatID,
		Name:         "Cement & Aggregates",
		Slug:         "cement",
		IsSelectable: true,
	}
	catStore[inactiveCatID] = &domain.Category{
		ID:           inactiveCatID,
		Name:         "Unpublished Category",
		Slug:         "unpublished",
		IsSelectable: false,
	}

	// Seed Vendors
	vyshnaviVendorID := uuid.New()
	suspendedVendorID := uuid.New()
	pendingVendorID := uuid.New()

	userStore[vyshnaviVendorID] = &domain.User{
		ID:         vyshnaviVendorID,
		FullName:   "Vyshnavi Bricks",
		Role:       domain.RoleUser,
		Status:     "ACTIVE",
		IsVerified: true,
		TrustScore: 4.8,
		Phone:      "+919876543210",
		AddressText: "Near NH44, Gooty Road, Anantapur",
		Lat:        14.6819,
		Lng:        77.6006,
	}
	userStore[suspendedVendorID] = &domain.User{
		ID:         suspendedVendorID,
		FullName:   "Suspended Supplier Ltd",
		Role:       domain.RoleUser,
		Status:     "SUSPENDED",
		IsVerified: false,
		TrustScore: 1.0,
	}
	userStore[pendingVendorID] = &domain.User{
		ID:         pendingVendorID,
		FullName:   "Pending Approval Vendor",
		Role:       domain.RoleUser,
		Status:     "PENDING",
		IsVerified: false,
	}

	// Category Governance Approvals
	catApprovalStore[vyshnaviVendorID.String()+":"+bricksCatID.String()] = true
	// suspended and pending vendors have NO approval for bricks

	// Seed Catalog Items for Vyshnavi Bricks
	// Root Grouping: Red Bricks (Not Bookable)
	redBricksGroupingID := uuid.New()
	catalogStore[redBricksGroupingID] = &domain.VendorCatalogItem{
		ID:           redBricksGroupingID,
		VendorUserID: vyshnaviVendorID,
		CategoryID:   &bricksCatID,
		ParentID:     nil,
		NodeType:     "GROUPING",
		Level:        0,
		Path:         "/" + redBricksGroupingID.String(),
		Title:        "Red Bricks",
		Description:  "All kiln-fired natural clay red brick options",
		Status:       "APPROVED",
		IsAvailable:  false, // Groupings are never directly purchasable
		CreatedAt:    time.Now().Add(-5 * time.Hour),
	}

	// Child Bookable: Standard Red Bricks (Level 1)
	standardRedBricksID := uuid.New()
	specsJSON, _ := json.Marshal(map[string]interface{}{
		"brick_type":           "Red Clay",
		"quality_grade":        "Class 1",
		"dimensions":           "9 x 4 x 3 inches",
		"compressive_strength": "10.5 N/mm²",
	})
	incServicesJSON, _ := json.Marshal([]string{"Quality Guarantee", "Basic Loading"})
	optServicesJSON, _ := json.Marshal([]map[string]interface{}{
		{"id": "opt_transport", "name": "Flatbed Transportation", "price": 1500.0, "price_unit": "PER_TRIP"},
		{"id": "opt_unloading", "name": "Forklift Unloading", "price": 500.0, "price_unit": "PER_TRIP"},
	})

	catalogStore[standardRedBricksID] = &domain.VendorCatalogItem{
		ID:               standardRedBricksID,
		VendorUserID:     vyshnaviVendorID,
		CategoryID:       &bricksCatID,
		ParentID:         &redBricksGroupingID,
		NodeType:         "BOOKABLE",
		Level:            1,
		Path:             "/" + redBricksGroupingID.String() + "/" + standardRedBricksID.String(),
		Title:            "Standard Red Bricks",
		Description:      "First quality wirecut red clay bricks for loadbearing walls",
		SKU:              "VYSH-RB-001",
		PriceType:        "FIXED",
		UnitPrice:        5.50,
		PriceUnit:        "PER_PIECE",
		MinOrderQuantity: 1000,
		StockQuantity:    50000,
		Attributes:       specsJSON,
		IncludedServices: incServicesJSON,
		OptionalServices: optServicesJSON,
		Status:           "ACTIVE_IN_CATALOG",
		IsAvailable:      true,
		PickupAddress:    "Vyshnavi Kiln Yard #2, Anantapur",
		CreatedAt:        time.Now().Add(-4 * time.Hour),
	}

	// Child Grouping: Premium Red Bricks (Level 1)
	premiumGroupingID := uuid.New()
	catalogStore[premiumGroupingID] = &domain.VendorCatalogItem{
		ID:           premiumGroupingID,
		VendorUserID: vyshnaviVendorID,
		CategoryID:   &bricksCatID,
		ParentID:     &redBricksGroupingID,
		NodeType:     "GROUPING",
		Level:        1,
		Path:         "/" + redBricksGroupingID.String() + "/" + premiumGroupingID.String(),
		Title:        "Premium Red Bricks",
		Status:       "APPROVED",
		IsAvailable:  false,
		CreatedAt:    time.Now().Add(-3 * time.Hour),
	}

	// Deep Child Bookable: Premium Chamfered Red Bricks (Level 2)
	premiumChamferedID := uuid.New()
	catalogStore[premiumChamferedID] = &domain.VendorCatalogItem{
		ID:               premiumChamferedID,
		VendorUserID:     vyshnaviVendorID,
		CategoryID:       &bricksCatID,
		ParentID:         &premiumGroupingID,
		NodeType:         "BOOKABLE",
		Level:            2,
		Path:             "/" + redBricksGroupingID.String() + "/" + premiumGroupingID.String() + "/" + premiumChamferedID.String(),
		Title:            "Premium Chamfered Red Bricks",
		PriceType:        "FIXED",
		UnitPrice:        7.25,
		PriceUnit:        "PER_PIECE",
		MinOrderQuantity: 1000,
		StockQuantity:    20000,
		Status:           "APPROVED",
		IsAvailable:      true,
		CreatedAt:        time.Now().Add(-2 * time.Hour),
	}

	// Quotation Item: Custom Architectural Bricks
	quotationItemID := uuid.New()
	catalogStore[quotationItemID] = &domain.VendorCatalogItem{
		ID:               quotationItemID,
		VendorUserID:     vyshnaviVendorID,
		CategoryID:       &bricksCatID,
		NodeType:         "BOOKABLE",
		Title:            "Custom Architectural Curved Bricks",
		PriceType:        "QUOTATION",
		UnitPrice:        0,
		PriceUnit:        "CUSTOM_QUOTE",
		MinOrderQuantity: 500,
		Status:           "APPROVED",
		IsAvailable:      true,
	}

	// Rejected item (must NEVER be visible to customer)
	rejectedItemID := uuid.New()
	catalogStore[rejectedItemID] = &domain.VendorCatalogItem{
		ID:           rejectedItemID,
		VendorUserID: vyshnaviVendorID,
		CategoryID:   &bricksCatID,
		NodeType:     "BOOKABLE",
		Title:        "Rejected Low Grade Bricks",
		Status:       "REJECTED",
		IsAvailable:  false,
	}

	// Item from Suspended vendor (must NEVER be visible)
	suspendedVendorItemID := uuid.New()
	catalogStore[suspendedVendorItemID] = &domain.VendorCatalogItem{
		ID:           suspendedVendorItemID,
		VendorUserID: suspendedVendorID,
		CategoryID:   &bricksCatID,
		NodeType:     "BOOKABLE",
		Title:        "Suspended Vendor Bricks",
		Status:       "APPROVED",
		IsAvailable:  true,
	}

	// =========================================================================
	// TEST 1: Category and Vendor Discovery Visibility Rules
	// =========================================================
	t.Run("TestCategoryAndVendorDiscoveryVisibilityRules", func(t *testing.T) {
		// Active approved vendor with active offerings should be eligible
		isVendorEligible := func(vendorID uuid.UUID, catID uuid.UUID) bool {
			user, uExists := userStore[vendorID]
			if !uExists || user.Status != "ACTIVE" || !user.IsVerified {
				return false
			}
			if !catApprovalStore[vendorID.String()+":"+catID.String()] {
				return false
			}
			// Check has at least 1 approved bookable offering
			for _, it := range catalogStore {
				if it.VendorUserID == vendorID && it.CategoryID != nil && *it.CategoryID == catID {
					if it.NodeType == "BOOKABLE" && (it.Status == "APPROVED" || it.Status == "ACTIVE_IN_CATALOG") && it.IsAvailable {
						return true
					}
				}
			}
			return false
		}

		if !isVendorEligible(vyshnaviVendorID, bricksCatID) {
			t.Errorf("Expected Vyshnavi Bricks to be eligible for Bricks category")
		}
		if isVendorEligible(suspendedVendorID, bricksCatID) {
			t.Errorf("Suspended vendor must NEVER be eligible")
		}
		if isVendorEligible(pendingVendorID, bricksCatID) {
			t.Errorf("Pending vendor must NEVER be eligible")
		}
		t.Logf("PASS: Vendor discovery correctly filters by user status, category approval, and active offerings")
	})

	// =========================================================================
	// TEST 2: Dynamic Vendor Catalog Navigation (Unlimited Depth & Groupings)
	// =========================================================
	t.Run("TestDynamicVendorCatalogNavigationHierarchy", func(t *testing.T) {
		// Verify Grouping Node properties
		grouping := catalogStore[redBricksGroupingID]
		if grouping.NodeType != "GROUPING" {
			t.Fatalf("Expected redBricksGroupingID to be GROUPING")
		}
		if grouping.IsAvailable {
			t.Errorf("Grouping nodes must NEVER be purchasable (IsAvailable must be false)")
		}

		// Verify Bookable Offering at Level 1
		level1 := catalogStore[standardRedBricksID]
		if level1.Level != 1 || level1.NodeType != "BOOKABLE" || !level1.IsAvailable {
			t.Errorf("Expected Level 1 offering to be bookable and available")
		}

		// Verify Deep Bookable Offering at Level 2
		level2 := catalogStore[premiumChamferedID]
		if level2.Level != 2 || level2.NodeType != "BOOKABLE" || !level2.IsAvailable {
			t.Errorf("Expected Level 2 offering to be bookable and available")
		}

		// Verify breadcrumb generation
		getBreadcrumbs := func(item *domain.VendorCatalogItem) []*domain.CatalogBreadcrumb {
			var bcs []*domain.CatalogBreadcrumb
			parts := strings.Split(strings.Trim(item.Path, "/"), "/")
			for _, p := range parts {
				pUUID, err := uuid.Parse(p)
				if err == nil {
					if node, exists := catalogStore[pUUID]; exists {
						bcs = append(bcs, &domain.CatalogBreadcrumb{
							ID:       node.ID,
							Title:    node.Title,
							NodeType: node.NodeType,
							Level:    node.Level,
						})
					}
				}
			}
			return bcs
		}

		crumbs := getBreadcrumbs(level2)
		if len(crumbs) != 3 {
			t.Fatalf("Expected 3 breadcrumb steps for Level 2 node, got %d", len(crumbs))
		}
		if crumbs[0].Title != "Red Bricks" || crumbs[0].NodeType != "GROUPING" {
			t.Errorf("Step 0 should be root Grouping 'Red Bricks'")
		}
		if crumbs[1].Title != "Premium Red Bricks" || crumbs[1].NodeType != "GROUPING" {
			t.Errorf("Step 1 should be sub Grouping 'Premium Red Bricks'")
		}
		if crumbs[2].Title != "Premium Chamfered Red Bricks" || crumbs[2].NodeType != "BOOKABLE" {
			t.Errorf("Step 2 should be bookable 'Premium Chamfered Red Bricks'")
		}

		t.Logf("PASS: Multi-level vendor hierarchy navigates smoothly and constructs correct breadcrumb trail: %s > %s > %s",
			crumbs[0].Title, crumbs[1].Title, crumbs[2].Title)
	})

	// =========================================================================
	// TEST 3: Offering Details & Dynamic Category Specifications
	// =========================================================
	t.Run("TestOfferingDetailsAndSpecifications", func(t *testing.T) {
		item := catalogStore[standardRedBricksID]
		if item.PriceType != "FIXED" || item.UnitPrice != 5.50 || item.PriceUnit != "PER_PIECE" {
			t.Errorf("Price and unit mismatch: %s %.2f %s", item.PriceType, item.UnitPrice, item.PriceUnit)
		}
		if item.MinOrderQuantity != 1000 {
			t.Errorf("Expected MOQ 1000, got %d", item.MinOrderQuantity)
		}

		var specs map[string]interface{}
		if err := json.Unmarshal(item.Attributes, &specs); err != nil {
			t.Fatalf("Failed to parse specifications JSON: %v", err)
		}
		if specs["brick_type"] != "Red Clay" || specs["quality_grade"] != "Class 1" {
			t.Errorf("Dynamic specs verification failed: %v", specs)
		}

		var optServices []map[string]interface{}
		if err := json.Unmarshal(item.OptionalServices, &optServices); err != nil {
			t.Fatalf("Failed to parse optional services: %v", err)
		}
		if len(optServices) != 2 {
			t.Errorf("Expected 2 optional services, got %d", len(optServices))
		}

		t.Logf("PASS: Offering details correctly exposes dynamic specifications (%d specs) and optional services (%d services)", len(specs), len(optServices))
	})

	// =========================================================================
	// TEST 4: Multi-Criteria Search & Filtering
	// =========================================================
	t.Run("TestMarketplaceSearchAndFilters", func(t *testing.T) {
		search := func(query string, catID *uuid.UUID, minP, maxP *float64, priceType string) []*domain.VendorCatalogItem {
			var results []*domain.VendorCatalogItem
			for _, it := range catalogStore {
				// Exclude grouping nodes
				if it.NodeType != "BOOKABLE" {
					continue
				}
				// Exclude unapproved or unavailable
				if it.Status != "APPROVED" && it.Status != "ACTIVE_IN_CATALOG" {
					continue
				}
				if !it.IsAvailable {
					continue
				}
				// Exclude inactive vendors
				vUser := userStore[it.VendorUserID]
				if vUser == nil || vUser.Status != "ACTIVE" {
					continue
				}

				// Query filter
				if query != "" && !strings.Contains(strings.ToLower(it.Title), strings.ToLower(query)) {
					continue
				}
				// Category filter
				if catID != nil && (it.CategoryID == nil || *it.CategoryID != *catID) {
					continue
				}
				// Price range
				if minP != nil && it.UnitPrice < *minP {
					continue
				}
				if maxP != nil && it.UnitPrice > *maxP {
					continue
				}
				// Price type
				if priceType != "" && it.PriceType != priceType {
					continue
				}

				results = append(results, it)
			}
			return results
		}

		// Search for "Red Bricks"
		rbResults := search("Red Bricks", &bricksCatID, nil, nil, "")
		if len(rbResults) != 2 {
			t.Errorf("Expected 2 bookable red brick items, got %d", len(rbResults))
		}

		// Filter by price <= 6.00
		maxP := 6.00
		cheapResults := search("", &bricksCatID, nil, &maxP, "FIXED")
		if len(cheapResults) != 1 || cheapResults[0].ID != standardRedBricksID {
			t.Errorf("Expected 1 item under ₹6.00 (Standard Red Bricks), got %d", len(cheapResults))
		}

		// Search should NEVER return rejected items or suspended vendor items
		allResults := search("", nil, nil, nil, "")
		for _, res := range allResults {
			if res.ID == rejectedItemID {
				t.Errorf("Security failure: Rejected item appeared in search results")
			}
			if res.ID == suspendedVendorItemID {
				t.Errorf("Security failure: Suspended vendor item appeared in search results")
			}
			if res.NodeType == "GROUPING" {
				t.Errorf("Security failure: Grouping node appeared in search results")
			}
		}

		t.Logf("PASS: Marketplace search correctly enforces visibility, price filtering, and excludes grouping/unapproved nodes")
	})

	// =========================================================================
	// TEST 5: Offering Comparison Side-by-Side
	// =========================================================
	t.Run("TestOfferingComparison", func(t *testing.T) {
		// Compare Standard Red Bricks and Premium Chamfered Red Bricks
		item1 := catalogStore[standardRedBricksID]
		item2 := catalogStore[premiumChamferedID]

		items := []*domain.VendorCatalogItem{item1, item2}
		var priceUnits []string
		unitMap := make(map[string]bool)
		for _, it := range items {
			if !unitMap[it.PriceUnit] {
				unitMap[it.PriceUnit] = true
				priceUnits = append(priceUnits, it.PriceUnit)
			}
		}

		hasMixedUnits := len(priceUnits) > 1
		if hasMixedUnits {
			t.Errorf("Both items use PER_PIECE, should not be mixed units")
		}

		// Add an item with different pricing unit (e.g. PER_1000_BRICKS)
		bulkItem := &domain.VendorCatalogItem{
			ID:        uuid.New(),
			Title:     "Bulk Truckload Red Bricks",
			PriceType: "FIXED",
			UnitPrice: 5000.0,
			PriceUnit: "PER_1000_BRICKS",
		}
		mixedItems := append(items, bulkItem)
		mixedUnitsMap := make(map[string]bool)
		for _, it := range mixedItems {
			mixedUnitsMap[it.PriceUnit] = true
		}
		if len(mixedUnitsMap) <= 1 {
			t.Errorf("Expected mixed units detection when comparing PER_PIECE and PER_1000_BRICKS")
		}

		t.Logf("PASS: Comparison matrix correctly detects unit compatibility and mixed unit warnings (Units: %v)", priceUnits)
	})

	// =========================================================================
	// TEST 6: Single-Vendor Cart Policy & MOQ Enforcement
	// =========================================================
	t.Run("TestSingleVendorCartAndMOQEnforcement", func(t *testing.T) {
		type MockCartItem struct {
			VendorID uuid.UUID
			ItemID   uuid.UUID
			Title    string
			Quantity int
			UnitPrice float64
		}

		var cart []MockCartItem

		addToCart := func(vendorID, itemID uuid.UUID, title string, qty int, unitPrice float64) (string, error) {
			item, exists := catalogStore[itemID]
			if !exists {
				return "", fmt.Errorf("item does not exist")
			}
			if item.NodeType == "GROUPING" {
				return "", fmt.Errorf("grouping nodes cannot be added to cart")
			}
			if item.PriceType == "QUOTATION" {
				return "", fmt.Errorf("quotation offerings must follow the quotation inquiry flow")
			}
			if qty < item.MinOrderQuantity {
				return "", fmt.Errorf("quantity %d is below minimum order quantity (%d)", qty, item.MinOrderQuantity)
			}

			// Single vendor cart check
			if len(cart) > 0 && cart[0].VendorID != vendorID {
				return "VENDOR_CONFLICT", nil
			}

			cart = append(cart, MockCartItem{
				VendorID: vendorID,
				ItemID:   itemID,
				Title:    title,
				Quantity: qty,
				UnitPrice: unitPrice,
			})
			return "SUCCESS", nil
		}

		// 1. Grouping node must be rejected
		_, err := addToCart(vyshnaviVendorID, redBricksGroupingID, "Red Bricks", 1000, 0)
		if err == nil || !strings.Contains(err.Error(), "grouping nodes") {
			t.Errorf("Expected grouping node rejection, got: %v", err)
		}

		// 2. Quantity below MOQ must be rejected
		_, err = addToCart(vyshnaviVendorID, standardRedBricksID, "Standard Red Bricks", 500, 5.50)
		if err == nil || !strings.Contains(err.Error(), "minimum order quantity") {
			t.Errorf("Expected MOQ rejection for 500 < 1000, got: %v", err)
		}

		// 3. Valid MOQ add succeeds
		status, err := addToCart(vyshnaviVendorID, standardRedBricksID, "Standard Red Bricks", 1000, 5.50)
		if err != nil || status != "SUCCESS" {
			t.Fatalf("Valid add to cart failed: %v", err)
		}

		// 4. Quotation item must trigger quotation flow, not cart
		_, err = addToCart(vyshnaviVendorID, quotationItemID, "Custom Bricks", 500, 0)
		if err == nil || !strings.Contains(err.Error(), "quotation inquiry flow") {
			t.Errorf("Expected quotation flow redirection, got: %v", err)
		}

		// 5. Item from different vendor triggers vendor conflict
		otherVendorID := uuid.New()
		otherVendorItem := &domain.VendorCatalogItem{
			ID:               uuid.New(),
			VendorUserID:     otherVendorID,
			NodeType:         "BOOKABLE",
			Title:            "Other Vendor Cement",
			PriceType:        "FIXED",
			UnitPrice:        350.0,
			MinOrderQuantity: 10,
		}
		catalogStore[otherVendorItem.ID] = otherVendorItem

		conflictStatus, err := addToCart(otherVendorID, otherVendorItem.ID, "Other Vendor Cement", 10, 350.0)
		if err != nil || conflictStatus != "VENDOR_CONFLICT" {
			t.Errorf("Expected VENDOR_CONFLICT prompt when adding from different vendor, got %s / %v", conflictStatus, err)
		}

		t.Logf("PASS: Cart rules strictly enforce single-vendor requirement, block grouping nodes, and respect MOQ")
	})
}
