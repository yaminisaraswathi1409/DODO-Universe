package service

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/google/uuid"
	"github.com/uop/backend/internal/domain"
	"github.com/uop/backend/internal/repository/postgres"
)

type CatalogService struct {
	catalogRepo *postgres.CatalogRepository
	userRepo    *postgres.UserRepository
}

func NewCatalogService(catalogRepo *postgres.CatalogRepository, userRepo *postgres.UserRepository) *CatalogService {
	return &CatalogService{
		catalogRepo: catalogRepo,
		userRepo:    userRepo,
	}
}

func (s *CatalogService) CreateCatalogItem(ctx context.Context, item *domain.VendorCatalogItem) (*domain.VendorCatalogItem, error) {
	if item.VendorUserID == uuid.Nil {
		return nil, fmt.Errorf("vendor user id is required")
	}
	if item.Title == "" {
		return nil, fmt.Errorf("title is required")
	}
	if item.UnitPrice <= 0 {
		return nil, fmt.Errorf("unit price must be greater than zero")
	}

	if item.Status == "" {
		item.Status = "PENDING_ADMIN_APPROVAL"
	}

	err := s.catalogRepo.CreateCatalogItem(ctx, item)
	if err != nil {
		return nil, err
	}

	created, getErr := s.catalogRepo.GetCatalogItemByID(ctx, item.ID)
	if getErr == nil && created != nil && s.userRepo != nil {
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

func (s *CatalogService) SearchCatalogItems(ctx context.Context, query string, categorySlug string, limit int, offset int) ([]*domain.VendorCatalogItem, int, error) {
	return s.catalogRepo.SearchCatalogItems(ctx, query, categorySlug, limit, offset)
}

func (s *CatalogService) ListCatalogItemsByStatus(ctx context.Context, status string) ([]*domain.VendorCatalogItem, error) {
	return s.catalogRepo.ListCatalogItemsByStatus(ctx, status)
}

func (s *CatalogService) ApproveCatalogItem(ctx context.Context, id uuid.UUID) (*domain.VendorCatalogItem, error) {
	err := s.catalogRepo.UpdateCatalogItemStatus(ctx, id, "ACTIVE_IN_CATALOG", "")
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

func (s *CatalogService) RejectCatalogItem(ctx context.Context, id uuid.UUID, reason string) (*domain.VendorCatalogItem, error) {
	err := s.catalogRepo.UpdateCatalogItemStatus(ctx, id, "REJECTED", reason)
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

func (s *CatalogService) UpdateCatalogItem(ctx context.Context, item *domain.VendorCatalogItem) (*domain.VendorCatalogItem, error) {
	// Re-trigger Stage 3 approval if item details are modified by vendor
	item.Status = "PENDING_ADMIN_APPROVAL"
	item.IsAvailable = false
	err := s.catalogRepo.UpdateCatalogItem(ctx, item)
	if err != nil {
		return nil, err
	}
	return s.catalogRepo.GetCatalogItemByID(ctx, item.ID)
}

func (s *CatalogService) DeleteCatalogItem(ctx context.Context, id uuid.UUID, vendorUserID uuid.UUID) error {
	return s.catalogRepo.DeleteCatalogItem(ctx, id, vendorUserID)
}
