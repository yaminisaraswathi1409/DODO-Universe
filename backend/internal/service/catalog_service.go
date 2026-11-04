package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/uop/backend/internal/domain"
	"github.com/uop/backend/internal/repository/postgres"
)

type CatalogService struct {
	catalogRepo *postgres.CatalogRepository
	userRepo    *postgres.UserRepository
	govRepo     *postgres.CategoryGovernanceRepository
}

func NewCatalogService(catalogRepo *postgres.CatalogRepository, userRepo *postgres.UserRepository) *CatalogService {
	return &CatalogService{
		catalogRepo: catalogRepo,
		userRepo:    userRepo,
	}
}

func (s *CatalogService) SetGovernanceRepo(govRepo *postgres.CategoryGovernanceRepository) {
	s.govRepo = govRepo
}

func (s *CatalogService) CreateCatalogItem(ctx context.Context, item *domain.VendorCatalogItem) (*domain.VendorCatalogItem, error) {
	if item.VendorUserID == uuid.Nil {
		return nil, fmt.Errorf("vendor user id is required")
	}

	// Vendor suspension check
	if s.userRepo != nil {
		u, err := s.userRepo.GetByID(ctx, item.VendorUserID)
		if err == nil && u != nil && (u.IsSuspended || u.Status == domain.StatusSuspended) {
			return nil, fmt.Errorf("vendor '%s' is currently suspended and cannot publish new catalog offerings", u.FullName)
		}
	}
	if strings.TrimSpace(item.Title) == "" {
		return nil, fmt.Errorf("title is required")
	}

	nodeType := strings.ToUpper(strings.TrimSpace(item.NodeType))
	if nodeType == "" {
		nodeType = "BOOKABLE"
	}
	item.NodeType = nodeType

	priceType := strings.ToUpper(strings.TrimSpace(item.PriceType))
	if priceType == "" {
		priceType = "FIXED"
	}
	item.PriceType = priceType

	// Grouping node validation
	if nodeType == "GROUPING" {
		item.UnitPrice = 0
		item.MinOrderQuantity = 0
		item.StockQuantity = 0
		item.IsAvailable = false // Grouping nodes can never be directly ordered
		if item.Status == "" {
			item.Status = "APPROVED" // Grouping nodes do not require formal admin verification
		}
	} else {
		// Bookable offering validation
		if priceType == "FIXED" && item.UnitPrice <= 0 {
			return nil, fmt.Errorf("unit price must be greater than zero for fixed-price offerings")
		}
		if item.MinOrderQuantity <= 0 {
			item.MinOrderQuantity = 1
		}
		if item.StockQuantity < 0 {
			item.StockQuantity = 0
		}

		// Vendor Governance Rule: Vendor must have ACTIVE category approval to publish bookable offerings
		if s.govRepo != nil && item.CategoryID != nil && *item.CategoryID != uuid.Nil {
			approved, err := s.govRepo.IsVendorApprovedForCategory(ctx, item.VendorUserID, *item.CategoryID)
			if err == nil && !approved {
				return nil, fmt.Errorf("vendor is not approved to publish offerings in this category. An approved category credential is required")
			}
		}

		if item.Status == "" {
			item.Status = "PENDING_ADMIN_APPROVAL"
		}
		item.IsAvailable = item.Status == "ACTIVE_IN_CATALOG" || item.Status == "APPROVED"
	}

	err := s.catalogRepo.CreateCatalogItem(ctx, item)
	if err != nil {
		return nil, err
	}

	created, getErr := s.catalogRepo.GetCatalogItemByID(ctx, item.ID)
	if getErr == nil && created != nil && s.userRepo != nil && created.Status == "PENDING_ADMIN_APPROVAL" {
		notifMeta, _ := json.Marshal(map[string]interface{}{
			"catalog_item_id": created.ID,
			"title":           created.Title,
			"unit_price":      created.UnitPrice,
			"status":          created.Status,
			"type":            "CATALOG_ITEM_SUBMITTED",
		})
		_, _ = s.userRepo.CreateNotification(ctx, &domain.Notification{
			UserID:   created.VendorUserID,
			Title:    "Catalog Service Submitted",
			Message:  fmt.Sprintf("Your catalog service listing \"%s\" (₹%.2f) has been submitted for Admin Verification!", created.Title, created.UnitPrice),
			Type:     "CATALOG_ITEM_SUBMITTED",
			Metadata: notifMeta,
		})
	}

	return created, getErr
}

func (s *CatalogService) GetCatalogItemByID(ctx context.Context, id uuid.UUID) (*domain.VendorCatalogItem, error) {
	return s.catalogRepo.GetCatalogItemByID(ctx, id)
}

func (s *CatalogService) ListCatalogItemsByVendor(ctx context.Context, vendorUserID uuid.UUID) ([]*domain.VendorCatalogItem, error) {
	return s.catalogRepo.ListCatalogItemsByVendor(ctx, vendorUserID)
}

func (s *CatalogService) GetVendorCatalogTree(ctx context.Context, vendorUserID uuid.UUID, categoryID *uuid.UUID, includeUnapproved bool) ([]*domain.VendorCatalogItem, error) {
	return s.catalogRepo.GetVendorCatalogTree(ctx, vendorUserID, categoryID, includeUnapproved)
}

func (s *CatalogService) MoveCatalogNode(ctx context.Context, id uuid.UUID, vendorUserID uuid.UUID, newParentID *uuid.UUID, newDisplayOrder int) error {
	return s.catalogRepo.MoveCatalogNode(ctx, id, vendorUserID, newParentID, newDisplayOrder)
}

func (s *CatalogService) ReorderCatalogNodes(ctx context.Context, vendorUserID uuid.UUID, parentID *uuid.UUID, nodeIDsInOrder []uuid.UUID) error {
	return s.catalogRepo.ReorderCatalogNodes(ctx, vendorUserID, parentID, nodeIDsInOrder)
}

func (s *CatalogService) SearchCatalogItems(ctx context.Context, query string, categorySlug string, limit int, offset int) ([]*domain.VendorCatalogItem, int, error) {
	return s.catalogRepo.SearchCatalogItems(ctx, query, categorySlug, limit, offset)
}

func (s *CatalogService) ListCatalogItemsByStatus(ctx context.Context, status string) ([]*domain.VendorCatalogItem, error) {
	return s.catalogRepo.ListCatalogItemsByStatus(ctx, status)
}

func (s *CatalogService) ApproveCatalogItem(ctx context.Context, id uuid.UUID) (*domain.VendorCatalogItem, error) {
	return s.ApproveCatalogItemWithReviewer(ctx, id, nil, "Admin Control Room")
}

func (s *CatalogService) ApproveCatalogItemWithReviewer(ctx context.Context, id uuid.UUID, reviewerID *uuid.UUID, reviewerName string) (*domain.VendorCatalogItem, error) {
	err := s.catalogRepo.RecordReviewDecision(ctx, id, "ACTIVE_IN_CATALOG", "", "", reviewerID, reviewerName)
	if err != nil {
		return nil, err
	}
	item, err := s.catalogRepo.GetCatalogItemByID(ctx, id)
	if err == nil && item != nil && s.userRepo != nil {
		notifMeta, _ := json.Marshal(map[string]interface{}{
			"catalog_item_id": item.ID,
			"title":           item.Title,
			"status":          "ACTIVE_IN_CATALOG",
			"type":            "CATALOG_ITEM_APPROVED",
		})
		_, _ = s.userRepo.CreateNotification(ctx, &domain.Notification{
			UserID:   item.VendorUserID,
			Title:    "Service Listing Approved!",
			Message:  fmt.Sprintf("Your catalog service \"%s\" has been APPROVED by Admin and is now live in the Customer Marketplace!", item.Title),
			Type:     "CATALOG_ITEM_APPROVED",
			Metadata: notifMeta,
		})
	}
	return item, err
}

func (s *CatalogService) RequestChangesCatalogItem(ctx context.Context, id uuid.UUID, notes string, reviewerID *uuid.UUID, reviewerName string) (*domain.VendorCatalogItem, error) {
	if strings.TrimSpace(notes) == "" {
		return nil, fmt.Errorf("change request notes are mandatory")
	}

	err := s.catalogRepo.RecordReviewDecision(ctx, id, "CHANGES_REQUESTED", "", notes, reviewerID, reviewerName)
	if err != nil {
		return nil, err
	}
	item, err := s.catalogRepo.GetCatalogItemByID(ctx, id)
	if err == nil && item != nil && s.userRepo != nil {
		notifMeta, _ := json.Marshal(map[string]interface{}{
			"catalog_item_id":      item.ID,
			"title":                item.Title,
			"change_request_notes": notes,
			"status":               "CHANGES_REQUESTED",
			"type":                 "CATALOG_ITEM_CHANGES_REQUESTED",
		})
		_, _ = s.userRepo.CreateNotification(ctx, &domain.Notification{
			UserID:   item.VendorUserID,
			Title:    "Action Required: Changes Requested",
			Message:  fmt.Sprintf("Admin has requested changes for your listing \"%s\": %s", item.Title, notes),
			Type:     "CATALOG_ITEM_CHANGES_REQUESTED",
			Metadata: notifMeta,
		})
	}
	return item, err
}

func (s *CatalogService) RejectCatalogItem(ctx context.Context, id uuid.UUID, reason string) (*domain.VendorCatalogItem, error) {
	return s.RejectCatalogItemWithReviewer(ctx, id, reason, nil, "Admin Control Room")
}

func (s *CatalogService) RejectCatalogItemWithReviewer(ctx context.Context, id uuid.UUID, reason string, reviewerID *uuid.UUID, reviewerName string) (*domain.VendorCatalogItem, error) {
	if strings.TrimSpace(reason) == "" {
		return nil, fmt.Errorf("rejection reason is mandatory")
	}

	err := s.catalogRepo.RecordReviewDecision(ctx, id, "REJECTED", reason, "", reviewerID, reviewerName)
	if err != nil {
		return nil, err
	}
	item, err := s.catalogRepo.GetCatalogItemByID(ctx, id)
	if err == nil && item != nil && s.userRepo != nil {
		notifMeta, _ := json.Marshal(map[string]interface{}{
			"catalog_item_id":  item.ID,
			"title":            item.Title,
			"rejection_reason": reason,
			"status":           "REJECTED",
			"type":             "CATALOG_ITEM_REJECTED",
		})
		_, _ = s.userRepo.CreateNotification(ctx, &domain.Notification{
			UserID:   item.VendorUserID,
			Title:    "Service Listing Requires Action",
			Message:  fmt.Sprintf("Your catalog service \"%s\" was rejected by Admin: %s", item.Title, reason),
			Type:     "CATALOG_ITEM_REJECTED",
			Metadata: notifMeta,
		})
	}
	return item, err
}

func (s *CatalogService) ArchiveCatalogItem(ctx context.Context, id uuid.UUID, vendorUserID uuid.UUID) error {
	return s.catalogRepo.ArchiveCatalogItem(ctx, id, vendorUserID)
}

func (s *CatalogService) UpdateCatalogItem(ctx context.Context, item *domain.VendorCatalogItem) (*domain.VendorCatalogItem, error) {
	if item.NodeType == "GROUPING" {
		// Grouping nodes can be updated without triggering admin reapproval
		item.IsAvailable = false
	} else {
		// Re-trigger Stage 3 approval if item details are modified by vendor
		item.Status = "PENDING_ADMIN_APPROVAL"
		item.IsAvailable = false
	}

	err := s.catalogRepo.UpdateCatalogItem(ctx, item)
	if err != nil {
		return nil, err
	}
	return s.catalogRepo.GetCatalogItemByID(ctx, item.ID)
}

func (s *CatalogService) DeleteCatalogItem(ctx context.Context, id uuid.UUID, vendorUserID uuid.UUID) error {
	return s.catalogRepo.DeleteCatalogItem(ctx, id, vendorUserID)
}


// ============================================================================
// PHASE 4: CUSTOMER MARKETPLACE & DISCOVERY SERVICE LAYER
// ============================================================================

// SearchMarketplaceCatalog coordinates multi-criteria customer offering discovery with governance validation
func (s *CatalogService) SearchMarketplaceCatalog(ctx context.Context, filter domain.MarketplaceCatalogFilter) ([]*domain.VendorCatalogItem, int, error) {
	// Normalize filter inputs
	filter.Query = strings.TrimSpace(filter.Query)
	filter.CategorySlug = strings.TrimSpace(filter.CategorySlug)
	if filter.Limit <= 0 || filter.Limit > 100 {
		filter.Limit = 24
	}
	if filter.Offset < 0 {
		filter.Offset = 0
	}

	return s.catalogRepo.SearchMarketplaceCatalog(ctx, filter)
}

// GetMarketplaceOfferingByID retrieves an approved offering for customer discovery with breadcrumb trail
func (s *CatalogService) GetMarketplaceOfferingByID(ctx context.Context, id uuid.UUID) (*domain.VendorCatalogItem, []*domain.CatalogBreadcrumb, error) {
	if id == uuid.Nil {
		return nil, nil, fmt.Errorf("invalid offering ID")
	}
	return s.catalogRepo.GetMarketplaceOfferingByID(ctx, id)
}

// GetEligibleVendorsByCategory finds approved vendors with active offerings for a given category
func (s *CatalogService) GetEligibleVendorsByCategory(ctx context.Context, categoryID *uuid.UUID, categorySlug string, customerLat, customerLng float64, limit, offset int) ([]*domain.MarketplaceVendorCard, int, error) {
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}
	return s.catalogRepo.GetEligibleVendorsByCategory(ctx, categoryID, categorySlug, customerLat, customerLng, limit, offset)
}

// CompareMarketplaceOfferings retrieves 2 to 4 offerings and structures their specifications for side-by-side comparison
func (s *CatalogService) CompareMarketplaceOfferings(ctx context.Context, ids []uuid.UUID) (*domain.OfferingComparisonResponse, error) {
	if len(ids) < 1 {
		return nil, fmt.Errorf("at least one offering ID must be specified for comparison")
	}
	if len(ids) > 6 {
		return nil, fmt.Errorf("a maximum of 6 offerings can be compared simultaneously")
	}
	return s.catalogRepo.CompareMarketplaceOfferings(ctx, ids)
}
