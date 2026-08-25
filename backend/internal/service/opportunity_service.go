package service

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/uop/backend/internal/domain"
	"github.com/uop/backend/internal/plugin"
	"github.com/uop/backend/internal/repository/postgres"
)

type OpportunityService struct {
	oppRepo          *postgres.OpportunityRepository
	userRepo         *postgres.UserRepository
	workflowRegistry *plugin.WorkflowRegistry
}

func NewOpportunityService(
	oppRepo *postgres.OpportunityRepository,
	userRepo *postgres.UserRepository,
	workflowRegistry *plugin.WorkflowRegistry,
) *OpportunityService {
	return &OpportunityService{
		oppRepo:          oppRepo,
		userRepo:         userRepo,
		workflowRegistry: workflowRegistry,
	}
}

func (s *OpportunityService) CreateOpportunity(ctx context.Context, opp *domain.Opportunity) (*domain.Opportunity, error) {
	// Validate workflow model plugin
	wf, err := s.workflowRegistry.Get(opp.WorkflowModel)
	if err != nil {
		return nil, fmt.Errorf("invalid workflow model: %w", err)
	}

	if err := wf.Validate(ctx, opp); err != nil {
		return nil, fmt.Errorf("workflow validation failed: %w", err)
	}

	if opp.RadiusKM <= 0 {
		opp.RadiusKM = 25.0 // default 25km radius
	}

	opp.Status = domain.StatusOpen

	created, err := s.oppRepo.Create(ctx, opp)
	if err != nil {
		return nil, err
	}

	return created, nil
}

func (s *OpportunityService) GetOpportunity(ctx context.Context, id uuid.UUID) (*domain.Opportunity, error) {
	return s.oppRepo.GetByID(ctx, id)
}

func (s *OpportunityService) MatchOpportunity(ctx context.Context, oppID uuid.UUID) ([]*domain.OpportunityMatch, error) {
	opp, err := s.oppRepo.GetByID(ctx, oppID)
	if err != nil || opp == nil {
		return nil, fmt.Errorf("opportunity not found: %v", err)
	}

	// Match opposite type: if NEED -> match OFFERs; if OFFER -> match NEEDs
	targetType := domain.TypeOffer
	if opp.Type == domain.TypeOffer {
		targetType = domain.TypeNeed
	}

	radiusMeters := opp.RadiusKM * 1000.0
	matches, err := s.oppRepo.FindProximityMatches(ctx, opp.Lat, opp.Lng, targetType, opp.CategoryID, radiusMeters, 20)
	if err != nil {
		return nil, err
	}

	return matches, nil
}

// CreateChildOpportunity generates a multi-layer linked opportunity (e.g. Brick seller needs Transport)
func (s *OpportunityService) CreateChildOpportunity(ctx context.Context, parentID uuid.UUID, userID uuid.UUID, childReq *domain.Opportunity) (*domain.Opportunity, error) {
	parent, err := s.oppRepo.GetByID(ctx, parentID)
	if err != nil || parent == nil {
		return nil, fmt.Errorf("parent opportunity not found: %v", err)
	}

	childReq.UserID = userID
	childReq.ParentOpportunityID = &parentID
	childReq.WorkflowModel = domain.WorkflowMulti
	childReq.Lat = parent.Lat
	childReq.Lng = parent.Lng

	createdChild, err := s.CreateOpportunity(ctx, childReq)
	if err != nil {
		return nil, fmt.Errorf("failed to create child chained opportunity: %w", err)
	}

	return createdChild, nil
}

func (s *OpportunityService) ListPublicOpportunities(ctx context.Context, categorySlug, oppType string, page, limit int) ([]*domain.Opportunity, int, error) {
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 50 {
		limit = 20
	}
	offset := (page - 1) * limit

	return s.oppRepo.ListPublicListings(ctx, categorySlug, oppType, limit, offset)
}

func (s *OpportunityService) UpdateOpportunityStatus(ctx context.Context, id uuid.UUID, status domain.OpportunityStatus) error {
	return s.oppRepo.UpdateStatus(ctx, id, status)
}

func (s *OpportunityService) GetStatusHistory(ctx context.Context, id uuid.UUID) ([]*domain.OpportunityStatusHistory, error) {
	return s.oppRepo.GetStatusHistory(ctx, id)
}
