package service

import (
	"context"
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

	err := s.catalogRepo.CreateCatalogItem(ctx, item)
	if err != nil {
		return nil, err
	}

	return s.catalogRepo.GetCatalogItemByID(ctx, item.ID)
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

func (s *CatalogService) UpdateCatalogItem(ctx context.Context, item *domain.VendorCatalogItem) (*domain.VendorCatalogItem, error) {
	err := s.catalogRepo.UpdateCatalogItem(ctx, item)
	if err != nil {
		return nil, err
	}
	return s.catalogRepo.GetCatalogItemByID(ctx, item.ID)
}

func (s *CatalogService) DeleteCatalogItem(ctx context.Context, id uuid.UUID, vendorUserID uuid.UUID) error {
	return s.catalogRepo.DeleteCatalogItem(ctx, id, vendorUserID)
}
