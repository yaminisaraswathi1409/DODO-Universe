package service

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/uop/backend/internal/domain"
	"github.com/uop/backend/internal/repository/postgres"
)

type CategoryGovernanceService struct {
	govRepo  *postgres.CategoryGovernanceRepository
	userRepo *postgres.UserRepository
}

func NewCategoryGovernanceService(
	govRepo *postgres.CategoryGovernanceRepository,
	userRepo *postgres.UserRepository,
) *CategoryGovernanceService {
	return &CategoryGovernanceService{
		govRepo:  govRepo,
		userRepo: userRepo,
	}
}

// ----------------------------------------------------------------------------
// HIERARCHY METHODS
// ----------------------------------------------------------------------------

func (s *CategoryGovernanceService) GetCategoryTree(ctx context.Context) ([]*domain.Category, error) {
	return s.govRepo.GetCategoryTree(ctx)
}

func (s *CategoryGovernanceService) ListAllCategories(ctx context.Context) ([]*domain.Category, error) {
	return s.govRepo.ListAllCategories(ctx)
}

func (s *CategoryGovernanceService) MoveCategory(ctx context.Context, categoryID uuid.UUID, parentID *uuid.UUID, displayOrder int) (*domain.Category, error) {
	if categoryID == uuid.Nil {
		return nil, fmt.Errorf("category ID is required")
	}
	return s.govRepo.UpdateCategoryParent(ctx, categoryID, parentID, displayOrder)
}

func (s *CategoryGovernanceService) ToggleSelectability(ctx context.Context, categoryID uuid.UUID, isSelectable bool) (*domain.Category, error) {
	if categoryID == uuid.Nil {
		return nil, fmt.Errorf("category ID is required")
	}
	return s.govRepo.SetCategorySelectability(ctx, categoryID, isSelectable)
}

// ----------------------------------------------------------------------------
// VENDOR GOVERNANCE METHODS
// ----------------------------------------------------------------------------

func (s *CategoryGovernanceService) ApplyForCategory(ctx context.Context, vendorID, categoryID, assetID uuid.UUID, secondaryAssetIDs []uuid.UUID, notes string) (*domain.VendorCategoryApproval, error) {
	if vendorID == uuid.Nil {
		return nil, fmt.Errorf("vendor ID is required")
	}

	// Vendor suspension check
	if s.userRepo != nil {
		u, err := s.userRepo.GetByID(ctx, vendorID)
		if err == nil && u != nil && (u.IsSuspended || u.Status == domain.StatusSuspended) {
			return nil, fmt.Errorf("vendor is currently suspended and cannot apply for new category approvals")
		}
	}
	if categoryID == uuid.Nil {
		return nil, fmt.Errorf("category ID is required")
	}
	if assetID == uuid.Nil {
		return nil, fmt.Errorf("canonical asset ID is required")
	}

	// Verify category exists and is selectable
	cat, err := s.govRepo.GetCategoryByID(ctx, categoryID)
	if err != nil {
		return nil, fmt.Errorf("category not found: %w", err)
	}
	if !cat.IsSelectable && cat.Level == 1 && cat.ParentID == nil {
		return nil, fmt.Errorf("cannot apply to non-selectable grouping category '%s'. Please select a specific service category", cat.Name)
	}

	approval := &domain.VendorCategoryApproval{
		VendorID:           vendorID,
		CategoryID:         categoryID,
		AssetID:            assetID,
		SecondaryAssetIDs:  secondaryAssetIDs,
		ChangeRequestNotes: notes,
	}

	if err := s.govRepo.ApplyForCategory(ctx, approval); err != nil {
		return nil, err
	}

	return s.govRepo.GetVendorCategoryApproval(ctx, vendorID, categoryID)
}

func (s *CategoryGovernanceService) ResubmitCategoryApplication(ctx context.Context, vendorID, approvalID, assetID uuid.UUID, secondaryAssetIDs []uuid.UUID, notes string) (*domain.VendorCategoryApproval, error) {
	if vendorID == uuid.Nil || approvalID == uuid.Nil {
		return nil, fmt.Errorf("vendor ID and approval ID are required")
	}

	approvals, err := s.govRepo.ListVendorCategoryApprovals(ctx, vendorID)
	if err != nil {
		return nil, err
	}

	var target *domain.VendorCategoryApproval
	for _, a := range approvals {
		if a.ID == approvalID {
			target = a
			break
		}
	}
	if target == nil {
		return nil, fmt.Errorf("application %s not found for vendor", approvalID)
	}

	target.AssetID = assetID
	target.SecondaryAssetIDs = secondaryAssetIDs
	target.ChangeRequestNotes = notes

	if err := s.govRepo.ApplyForCategory(ctx, target); err != nil {
		return nil, err
	}

	return s.govRepo.GetVendorCategoryApproval(ctx, vendorID, target.CategoryID)
}

func (s *CategoryGovernanceService) AdminReviewApproval(ctx context.Context, adminID, approvalID uuid.UUID, action, notes string) (*domain.VendorCategoryApproval, error) {
	if adminID == uuid.Nil || approvalID == uuid.Nil {
		return nil, fmt.Errorf("admin ID and approval ID are required")
	}
	action = strings.ToUpper(action)
	if action != "APPROVE" && action != "REJECT" && action != "REQUEST_CHANGES" && action != "SUSPEND" {
		return nil, fmt.Errorf("invalid review action '%s'. Expected APPROVE, REJECT, REQUEST_CHANGES, or SUSPEND", action)
	}

	return s.govRepo.AdminReviewCategoryApproval(ctx, adminID, approvalID, action, notes)
}

func (s *CategoryGovernanceService) ListVendorApprovals(ctx context.Context, vendorID uuid.UUID) ([]*domain.VendorCategoryApproval, error) {
	if vendorID == uuid.Nil {
		return nil, fmt.Errorf("vendor ID is required")
	}
	return s.govRepo.ListVendorCategoryApprovals(ctx, vendorID)
}

func (s *CategoryGovernanceService) ListAdminApprovals(ctx context.Context, statusFilter string) ([]*domain.VendorCategoryApproval, error) {
	return s.govRepo.ListAdminCategoryApprovals(ctx, statusFilter)
}

func (s *CategoryGovernanceService) VerifyVendorCategoryAccess(ctx context.Context, vendorID, categoryID uuid.UUID) (bool, error) {
	return s.govRepo.IsVendorApprovedForCategory(ctx, vendorID, categoryID)
}
