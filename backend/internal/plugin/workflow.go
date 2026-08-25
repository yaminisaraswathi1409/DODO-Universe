package plugin

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/uop/backend/internal/domain"
)

// OpportunityWorkflow is the standard interface for plugin-based opportunity models
type OpportunityWorkflow interface {
	GetModelName() domain.WorkflowModel
	Validate(ctx context.Context, opp *domain.Opportunity) error
	ProcessMatch(ctx context.Context, opp *domain.Opportunity, candidate *domain.User) (*domain.OpportunityMatch, error)
	OnAccept(ctx context.Context, match *domain.OpportunityMatch) error
	OnComplete(ctx context.Context, match *domain.OpportunityMatch) error
}

// Registry holds all registered Opportunity Model Plugins
type WorkflowRegistry struct {
	plugins map[domain.WorkflowModel]OpportunityWorkflow
}

func NewWorkflowRegistry() *WorkflowRegistry {
	r := &WorkflowRegistry{
		plugins: make(map[domain.WorkflowModel]OpportunityWorkflow),
	}

	// Register Core Opportunity Model Plugins
	r.Register(&InstantMatchPlugin{})
	r.Register(&ScheduledBookingPlugin{})
	r.Register(&QuotationPlugin{})
	r.Register(&RentalPlugin{})
	r.Register(&MultiLayerPlugin{})

	return r
}

func (r *WorkflowRegistry) Register(plugin OpportunityWorkflow) {
	r.plugins[plugin.GetModelName()] = plugin
}

func (r *WorkflowRegistry) Get(model domain.WorkflowModel) (OpportunityWorkflow, error) {
	plugin, exists := r.plugins[model]
	if !exists {
		// Fallback to InstantMatch default
		return r.plugins[domain.WorkflowInstant], nil
	}
	return plugin, nil
}

func (r *WorkflowRegistry) ListPlugins() []string {
	models := make([]string, 0, len(r.plugins))
	for k := range r.plugins {
		models = append(models, string(k))
	}
	return models
}

// ----------------------------------------------------
// 1. Instant Match Plugin (Taxi, Food, Fast Delivery)
// ----------------------------------------------------
type InstantMatchPlugin struct{}

func (p *InstantMatchPlugin) GetModelName() domain.WorkflowModel {
	return domain.WorkflowInstant
}

func (p *InstantMatchPlugin) Validate(ctx context.Context, opp *domain.Opportunity) error {
	if opp.Title == "" {
		return fmt.Errorf("instant opportunity title cannot be empty")
	}
	return nil
}

func (p *InstantMatchPlugin) ProcessMatch(ctx context.Context, opp *domain.Opportunity, candidate *domain.User) (*domain.OpportunityMatch, error) {
	return &domain.OpportunityMatch{
		ID:            uuid.New(),
		OpportunityID: opp.ID,
		MatchedUserID: candidate.ID,
		Status:        "PROPOSED",
		MatchScore:    candidate.TrustScore * 20.0,
	}, nil
}

func (p *InstantMatchPlugin) OnAccept(ctx context.Context, match *domain.OpportunityMatch) error {
	match.Status = "ACCEPTED"
	return nil
}

func (p *InstantMatchPlugin) OnComplete(ctx context.Context, match *domain.OpportunityMatch) error {
	match.Status = "COMPLETED"
	return nil
}

// ----------------------------------------------------
// 2. Scheduled Booking Plugin (Tractor Rental, Home Tuition)
// ----------------------------------------------------
type ScheduledBookingPlugin struct{}

func (p *ScheduledBookingPlugin) GetModelName() domain.WorkflowModel {
	return domain.WorkflowScheduled
}

func (p *ScheduledBookingPlugin) Validate(ctx context.Context, opp *domain.Opportunity) error {
	if opp.ScheduledStart == nil {
		return fmt.Errorf("scheduled booking requires a start time slot")
	}
	return nil
}

func (p *ScheduledBookingPlugin) ProcessMatch(ctx context.Context, opp *domain.Opportunity, candidate *domain.User) (*domain.OpportunityMatch, error) {
	return &domain.OpportunityMatch{
		ID:            uuid.New(),
		OpportunityID: opp.ID,
		MatchedUserID: candidate.ID,
		Status:        "PROPOSED",
		MatchScore:    candidate.TrustScore * 18.0,
	}, nil
}

func (p *ScheduledBookingPlugin) OnAccept(ctx context.Context, match *domain.OpportunityMatch) error {
	match.Status = "ACCEPTED"
	return nil
}

func (p *ScheduledBookingPlugin) OnComplete(ctx context.Context, match *domain.OpportunityMatch) error {
	match.Status = "COMPLETED"
	return nil
}

// ----------------------------------------------------
// 3. Quotation Bidding Plugin (Construction, Photography)
// ----------------------------------------------------
type QuotationPlugin struct{}

func (p *QuotationPlugin) GetModelName() domain.WorkflowModel {
	return domain.WorkflowQuotation
}

func (p *QuotationPlugin) Validate(ctx context.Context, opp *domain.Opportunity) error {
	return nil
}

func (p *QuotationPlugin) ProcessMatch(ctx context.Context, opp *domain.Opportunity, candidate *domain.User) (*domain.OpportunityMatch, error) {
	return &domain.OpportunityMatch{
		ID:            uuid.New(),
		OpportunityID: opp.ID,
		MatchedUserID: candidate.ID,
		Status:        "BID_PENDING",
	}, nil
}

func (p *QuotationPlugin) OnAccept(ctx context.Context, match *domain.OpportunityMatch) error {
	match.Status = "ACCEPTED"
	return nil
}

func (p *QuotationPlugin) OnComplete(ctx context.Context, match *domain.OpportunityMatch) error {
	match.Status = "COMPLETED"
	return nil
}

// ----------------------------------------------------
// 4. Rental Plugin (Machinery & Tools Rental)
// ----------------------------------------------------
type RentalPlugin struct{}

func (p *RentalPlugin) GetModelName() domain.WorkflowModel {
	return domain.WorkflowRental
}

func (p *RentalPlugin) Validate(ctx context.Context, opp *domain.Opportunity) error {
	return nil
}

func (p *RentalPlugin) ProcessMatch(ctx context.Context, opp *domain.Opportunity, candidate *domain.User) (*domain.OpportunityMatch, error) {
	return &domain.OpportunityMatch{
		ID:            uuid.New(),
		OpportunityID: opp.ID,
		MatchedUserID: candidate.ID,
		Status:        "RENTAL_RESERVED",
	}, nil
}

func (p *RentalPlugin) OnAccept(ctx context.Context, match *domain.OpportunityMatch) error {
	match.Status = "ACCEPTED"
	return nil
}

func (p *RentalPlugin) OnComplete(ctx context.Context, match *domain.OpportunityMatch) error {
	match.Status = "COMPLETED"
	return nil
}

// ----------------------------------------------------
// 5. Multi-Layer Plugin (Chained Parent-Child Task Engine)
// ----------------------------------------------------
type MultiLayerPlugin struct{}

func (p *MultiLayerPlugin) GetModelName() domain.WorkflowModel {
	return domain.WorkflowMulti
}

func (p *MultiLayerPlugin) Validate(ctx context.Context, opp *domain.Opportunity) error {
	return nil
}

func (p *MultiLayerPlugin) ProcessMatch(ctx context.Context, opp *domain.Opportunity, candidate *domain.User) (*domain.OpportunityMatch, error) {
	return &domain.OpportunityMatch{
		ID:            uuid.New(),
		OpportunityID: opp.ID,
		MatchedUserID: candidate.ID,
		Status:        "CHAIN_ACTIVE",
	}, nil
}

func (p *MultiLayerPlugin) OnAccept(ctx context.Context, match *domain.OpportunityMatch) error {
	match.Status = "ACCEPTED"
	return nil
}

func (p *MultiLayerPlugin) OnComplete(ctx context.Context, match *domain.OpportunityMatch) error {
	match.Status = "COMPLETED"
	return nil
}
