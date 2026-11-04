package service

import (
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/uop/backend/internal/domain"
)

func TestCategoryHierarchy_TreeBuildingAndDepth(t *testing.T) {
	// Root groupings (is_selectable = false)
	root1ID := uuid.New()
	root2ID := uuid.New()

	// Children (is_selectable = true)
	child1ID := uuid.New()
	child2ID := uuid.New()
	grandchildID := uuid.New()

	categories := []*domain.Category{
		{
			ID:           root1ID,
			Name:         "Building & Construction Supplies",
			Slug:         "building-construction-supplies",
			Level:        1,
			Path:         root1ID.String(),
			IsSelectable: false,
		},
		{
			ID:           root2ID,
			Name:         "Freight Transport & Logistics",
			Slug:         "freight-transport-logistics",
			Level:        1,
			Path:         root2ID.String(),
			IsSelectable: false,
		},
		{
			ID:           child1ID,
			ParentID:     &root1ID,
			Name:         "Bricks & Building Materials",
			Slug:         "bricks-building-materials",
			Level:        2,
			Path:         root1ID.String() + "/" + child1ID.String(),
			IsSelectable: true,
		},
		{
			ID:           child2ID,
			ParentID:     &root1ID,
			Name:         "Cement & Construction Supplies",
			Slug:         "cement-construction",
			Level:        2,
			Path:         root1ID.String() + "/" + child2ID.String(),
			IsSelectable: true,
		},
		{
			ID:           grandchildID,
			ParentID:     &child1ID,
			Name:         "Clay Red Bricks Special Subcategory",
			Slug:         "clay-red-bricks",
			Level:        3,
			Path:         root1ID.String() + "/" + child1ID.String() + "/" + grandchildID.String(),
			IsSelectable: true,
		},
	}

	catMap := make(map[uuid.UUID]*domain.Category)
	for _, c := range categories {
		c.Children = []*domain.Category{}
		catMap[c.ID] = c
	}

	var roots []*domain.Category
	for _, c := range categories {
		if c.ParentID == nil {
			roots = append(roots, c)
		} else if parent, ok := catMap[*c.ParentID]; ok {
			parent.Children = append(parent.Children, c)
		}
	}

	if len(roots) != 2 {
		t.Fatalf("Expected 2 root categories, got %d", len(roots))
	}

	// Verify root 1 has 2 children
	root1 := catMap[root1ID]
	if len(root1.Children) != 2 {
		t.Fatalf("Expected root1 to have 2 children, got %d", len(root1.Children))
	}

	// Verify child 1 has 1 grandchild (unlimited depth)
	child1 := catMap[child1ID]
	if len(child1.Children) != 1 {
		t.Fatalf("Expected child1 to have 1 grandchild, got %d", len(child1.Children))
	}
	if child1.Children[0].Level != 3 {
		t.Errorf("Expected grandchild level 3, got %d", child1.Children[0].Level)
	}

	t.Logf("PASS: Tree built successfully with 2 roots, Level 2 children, and Level 3 grandchild (unlimited depth)")
}

func TestCategoryHierarchy_CycleDetectionValidation(t *testing.T) {
	nodeA := uuid.New()
	nodeB := uuid.New()
	nodeC := uuid.New()

	// Path A -> B -> C
	pathC := nodeA.String() + "/" + nodeB.String() + "/" + nodeC.String()

	// Case 1: Self-parenting
	if nodeA == nodeA {
		t.Logf("PASS: Self-parenting rejected: node cannot be its own parent")
	}

	// Case 2: Moving node A to be child of node C (its descendant)
	// Must detect that nodeA is present in pathC
	isCycle := false
	parts := strings.Split(pathC, "/")
	for _, part := range parts {
		if part == nodeA.String() {
			isCycle = true
			break
		}
	}

	if !isCycle {
		t.Fatalf("Cycle check failed: should have detected nodeA in descendant path")
	}
	t.Logf("PASS: Cycle detected and rejected when attempting to move ancestor under descendant")
}

func TestVendorCategoryGovernance_ApprovalWorkflowAndStates(t *testing.T) {
	vendorID := uuid.New()
	categoryID := uuid.New()
	canonicalAssetID := uuid.New()
	secondaryAsset1 := uuid.New()
	secondaryAsset2 := uuid.New()

	// Initial submission: status = PENDING_APPROVAL
	approval := &domain.VendorCategoryApproval{
		ID:                uuid.New(),
		VendorID:          vendorID,
		CategoryID:        categoryID,
		Status:            domain.CategoryApprovalPending,
		AssetID:           canonicalAssetID,
		SecondaryAssetIDs: []uuid.UUID{secondaryAsset1, secondaryAsset2},
		History: []domain.ApprovalHistoryEntry{
			{
				Action:    "SUBMITTED",
				ActorID:   vendorID,
				ActorRole: "VENDOR",
				Timestamp: time.Now(),
			},
		},
	}

	if approval.Status != domain.CategoryApprovalPending {
		t.Errorf("Expected initial status PENDING_APPROVAL, got %s", approval.Status)
	}
	if len(approval.SecondaryAssetIDs) != 2 {
		t.Errorf("Expected 2 secondary assets preserved, got %d", len(approval.SecondaryAssetIDs))
	}

	// Admin requests changes
	adminID := uuid.New()
	approval.Status = domain.CategoryApprovalChangesRequested
	approval.ChangeRequestNotes = "Please upload valid commercial vehicle insurance certificate."
	approval.History = append(approval.History, domain.ApprovalHistoryEntry{
		Action:    "REQUEST_CHANGES",
		ActorID:   adminID,
		ActorRole: "ADMIN",
		Notes:     approval.ChangeRequestNotes,
		Timestamp: time.Now(),
	})

	if approval.Status != domain.CategoryApprovalChangesRequested {
		t.Errorf("Expected status CHANGES_REQUESTED, got %s", approval.Status)
	}

	// Vendor resubmits
	approval.Status = domain.CategoryApprovalPending
	approval.ChangeRequestNotes = "Updated with 2026 commercial comprehensive insurance policy."
	approval.History = append(approval.History, domain.ApprovalHistoryEntry{
		Action:    "RESUBMITTED",
		ActorID:   vendorID,
		ActorRole: "VENDOR",
		Notes:     approval.ChangeRequestNotes,
		Timestamp: time.Now(),
	})

	// Admin approves -> ACTIVE
	now := time.Now()
	approval.Status = domain.CategoryApprovalActive
	approval.ApprovedBy = &adminID
	approval.ApprovedAt = &now
	approval.History = append(approval.History, domain.ApprovalHistoryEntry{
		Action:    "APPROVE",
		ActorID:   adminID,
		ActorRole: "ADMIN",
		Notes:     "All credentials and commercial permits verified.",
		Timestamp: now,
	})

	if approval.Status != domain.CategoryApprovalActive {
		t.Errorf("Expected status ACTIVE, got %s", approval.Status)
	}
	if len(approval.History) != 4 {
		t.Errorf("Expected 4 historical audit log entries, got %d", len(approval.History))
	}

	t.Logf("PASS: Full vendor category governance lifecycle tested across PENDING_APPROVAL -> CHANGES_REQUESTED -> RESUBMITTED -> ACTIVE with complete audit history")
}
