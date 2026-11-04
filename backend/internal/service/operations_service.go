package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/uop/backend/internal/domain"
	"github.com/uop/backend/internal/repository/postgres"
)

type OperationsService struct {
	operationsRepo *postgres.OperationsRepository
	userRepo       *postgres.UserRepository
	logisticsRepo  *postgres.LogisticsRepository
	dispatcher     *NotificationDispatcher
}

func NewOperationsService(
	operationsRepo *postgres.OperationsRepository,
	userRepo *postgres.UserRepository,
	logisticsRepo *postgres.LogisticsRepository,
	dispatcher *NotificationDispatcher,
) *OperationsService {
	return &OperationsService{
		operationsRepo: operationsRepo,
		userRepo:       userRepo,
		logisticsRepo:  logisticsRepo,
		dispatcher:     dispatcher,
	}
}

// ----------------------------------------------------------------------------
// DASHBOARD & MONITORING
// ----------------------------------------------------------------------------

func (s *OperationsService) GetDashboardMetrics(ctx context.Context) (*domain.AdminDashboardMetrics, error) {
	if s.operationsRepo == nil {
		return &domain.AdminDashboardMetrics{
			OrdersByStatus: make(map[string]int),
			GeneratedAt:    time.Now(),
		}, nil
	}
	return s.operationsRepo.GetDashboardMetrics(ctx)
}

func (s *OperationsService) ListStuckOrders(ctx context.Context) ([]*domain.StuckOrderAlert, error) {
	if s.operationsRepo == nil {
		return []*domain.StuckOrderAlert{}, nil
	}
	return s.operationsRepo.ListStuckOrders(ctx)
}

func (s *OperationsService) ListAuditLogs(ctx context.Context, entityType string, actorID *uuid.UUID, limit, offset int) ([]*domain.AdminAuditLog, int, error) {
	if s.operationsRepo == nil {
		return []*domain.AdminAuditLog{}, 0, nil
	}
	return s.operationsRepo.ListAuditLogs(ctx, entityType, actorID, limit, offset)
}

// ----------------------------------------------------------------------------
// VENDOR GOVERNANCE & SUSPENSION
// ----------------------------------------------------------------------------

func (s *OperationsService) SuspendVendor(ctx context.Context, adminID uuid.UUID, req *domain.VendorSuspensionRequest) error {
	if req == nil || req.VendorID == uuid.Nil {
		return fmt.Errorf("vendor ID is required")
	}
	if strings.TrimSpace(req.Reason) == "" {
		return fmt.Errorf("suspension reason is mandatory for governance compliance")
	}

	// 1. Suspend vendor record
	if err := s.userRepo.SuspendVendor(ctx, req.VendorID, adminID, req.Reason); err != nil {
		return fmt.Errorf("failed suspending vendor: %w", err)
	}

	// 2. Audit Trail
	if s.operationsRepo != nil {
		_ = s.operationsRepo.CreateAuditLog(ctx, &domain.AdminAuditLog{
			ID:         uuid.New(),
			ActorID:    &adminID,
			ActorRole:  "ADMIN",
			Action:     "VENDOR_SUSPENDED",
			EntityType: "VENDOR",
			EntityID:   &req.VendorID,
			Reason:     req.Reason,
			Metadata:   json.RawMessage(`{"governance":"suspension"}`),
			CreatedAt:  time.Now(),
		})
	}

	// 3. Dispatch persistent governance notice to vendor
	if s.dispatcher != nil {
		_, _ = s.dispatcher.Dispatch(ctx, &DispatchRequest{
			UserID:    req.VendorID,
			Title:     "Vendor Account Suspended",
			Message:   fmt.Sprintf("Your vendor account has been suspended by administration. Reason: %s. Active orders will be fulfilled.", req.Reason),
			Type:      "SECURITY_ALERT",
			Channel:   ChannelInApp,
			DedupeKey: fmt.Sprintf("vendor_susp_%s_%d", req.VendorID, time.Now().Unix()),
		})
	}

	return nil
}

func (s *OperationsService) ReactivateVendor(ctx context.Context, adminID uuid.UUID, req *domain.VendorReactivateRequest) error {
	if req == nil || req.VendorID == uuid.Nil {
		return fmt.Errorf("vendor ID is required")
	}
	if strings.TrimSpace(req.Reason) == "" {
		req.Reason = "Governance review completed; account restored"
	}

	// 1. Restore vendor record
	if err := s.userRepo.ReactivateVendor(ctx, req.VendorID, adminID); err != nil {
		return fmt.Errorf("failed reactivating vendor: %w", err)
	}

	// 2. Audit Trail
	if s.operationsRepo != nil {
		_ = s.operationsRepo.CreateAuditLog(ctx, &domain.AdminAuditLog{
			ID:         uuid.New(),
			ActorID:    &adminID,
			ActorRole:  "ADMIN",
			Action:     "VENDOR_REACTIVATED",
			EntityType: "VENDOR",
			EntityID:   &req.VendorID,
			Reason:     req.Reason,
			Metadata:   json.RawMessage(`{"governance":"reactivation"}`),
			CreatedAt:  time.Now(),
		})
	}

	// 3. Dispatch notice
	if s.dispatcher != nil {
		_, _ = s.dispatcher.Dispatch(ctx, &DispatchRequest{
			UserID:    req.VendorID,
			Title:     "Vendor Account Reactivated",
			Message:   "Your vendor account has been restored to active standing. You may now accept orders and manage catalog items.",
			Type:      "SECURITY_ALERT",
			Channel:   ChannelInApp,
			DedupeKey: fmt.Sprintf("vendor_react_%s_%d", req.VendorID, time.Now().Unix()),
		})
	}

	return nil
}

// ----------------------------------------------------------------------------
// SOS INCIDENTS & ESCALATION
// ----------------------------------------------------------------------------

func (s *OperationsService) ListActiveIncidents(ctx context.Context) ([]map[string]interface{}, error) {
	if s.operationsRepo == nil {
		return []map[string]interface{}{}, nil
	}
	return s.operationsRepo.ListActiveIncidents(ctx)
}

func (s *OperationsService) HandleIncidentAction(ctx context.Context, adminID uuid.UUID, adminName string, incidentID uuid.UUID, req *domain.IncidentActionRequest) error {
	if req == nil {
		return fmt.Errorf("incident action request cannot be empty")
	}
	if incidentID == uuid.Nil {
		return fmt.Errorf("incident ID is required")
	}

	switch strings.ToUpper(strings.TrimSpace(req.Action)) {
	case "ACKNOWLEDGE":
		if err := s.operationsRepo.AssignIncidentHandler(ctx, incidentID, adminID); err != nil {
			return fmt.Errorf("failed acknowledging incident: %w", err)
		}
		if s.operationsRepo != nil {
			_ = s.operationsRepo.CreateAuditLog(ctx, &domain.AdminAuditLog{
				ID:         uuid.New(),
				ActorID:    &adminID,
				ActorRole:  "ADMIN",
				Action:     "INCIDENT_ACKNOWLEDGED",
				EntityType: "INCIDENT",
				EntityID:   &incidentID,
				Reason:     "Operations acknowledged active SOS incident",
				CreatedAt:  time.Now(),
			})
		}

	case "ASSIGN_HANDLER":
		handlerID := adminID
		if req.HandlerID != nil && *req.HandlerID != uuid.Nil {
			handlerID = *req.HandlerID
		}
		if err := s.operationsRepo.AssignIncidentHandler(ctx, incidentID, handlerID); err != nil {
			return fmt.Errorf("failed assigning handler: %w", err)
		}
		if s.operationsRepo != nil {
			_ = s.operationsRepo.CreateAuditLog(ctx, &domain.AdminAuditLog{
				ID:         uuid.New(),
				ActorID:    &adminID,
				ActorRole:  "ADMIN",
				Action:     "INCIDENT_HANDLER_ASSIGNED",
				EntityType: "INCIDENT",
				EntityID:   &incidentID,
				Metadata:   json.RawMessage(fmt.Sprintf(`{"handler_id":"%s"}`, handlerID.String())),
				CreatedAt:  time.Now(),
			})
		}

	case "ADD_NOTE":
		if strings.TrimSpace(req.Note) == "" {
			return fmt.Errorf("note content cannot be blank")
		}
		if err := s.operationsRepo.AddIncidentNote(ctx, incidentID, adminID, adminName, req.Note); err != nil {
			return fmt.Errorf("failed adding internal incident note: %w", err)
		}
		if s.operationsRepo != nil {
			_ = s.operationsRepo.CreateAuditLog(ctx, &domain.AdminAuditLog{
				ID:         uuid.New(),
				ActorID:    &adminID,
				ActorRole:  "ADMIN",
				Action:     "INCIDENT_NOTE_ADDED",
				EntityType: "INCIDENT",
				EntityID:   &incidentID,
				Reason:     req.Note,
				CreatedAt:  time.Now(),
			})
		}

	case "RESOLVE":
		if strings.TrimSpace(req.ResolutionNotes) == "" {
			return fmt.Errorf("resolution notes are mandatory when closing an SOS incident")
		}
		if s.logisticsRepo != nil {
			sosReq := &domain.SOSResolutionRequest{
				IncidentID:           incidentID,
				ReplacementVehicleID: req.ReplacementVehicleID,
				ReplacementDriverID:  req.ReplacementDriverID,
				ResolutionNotes:      req.ResolutionNotes,
				ResumeTransit:        req.ResumeTransit,
			}
			if err := s.logisticsRepo.ResolveSOSIncident(ctx, sosReq); err != nil {
				return fmt.Errorf("failed resolving SOS incident: %w", err)
			}
		}
		if s.operationsRepo != nil {
			_ = s.operationsRepo.CreateAuditLog(ctx, &domain.AdminAuditLog{
				ID:         uuid.New(),
				ActorID:    &adminID,
				ActorRole:  "ADMIN",
				Action:     "INCIDENT_RESOLVED",
				EntityType: "INCIDENT",
				EntityID:   &incidentID,
				Reason:     req.ResolutionNotes,
				Metadata:   json.RawMessage(fmt.Sprintf(`{"resume_transit":%t}`, req.ResumeTransit)),
				CreatedAt:  time.Now(),
			})
		}

	default:
		return fmt.Errorf("unsupported incident action: %s", req.Action)
	}

	return nil
}

// ----------------------------------------------------------------------------
// USER NOTIFICATION PREFERENCES & FILTERING
// ----------------------------------------------------------------------------

func (s *OperationsService) GetNotificationPreferences(ctx context.Context, userID uuid.UUID) (*domain.NotificationPreference, error) {
	if s.userRepo == nil {
		return &domain.NotificationPreference{
			UserID:             userID,
			InAppEnabled:       true,
			SMSEnabled:         true,
			PushEnabled:        true,
			DisabledCategories: []string{},
			CreatedAt:          time.Now(),
			UpdatedAt:          time.Now(),
		}, nil
	}
	return s.userRepo.GetNotificationPreferences(ctx, userID)
}

func (s *OperationsService) UpdateNotificationPreferences(ctx context.Context, pref *domain.NotificationPreference) error {
	if s.userRepo == nil {
		return nil
	}
	if pref == nil {
		return fmt.Errorf("notification preference cannot be nil")
	}
	return s.userRepo.UpsertNotificationPreferences(ctx, pref)
}

func (s *OperationsService) GetFilteredNotifications(ctx context.Context, filter *domain.NotificationFilter) (*domain.NotificationPage, error) {
	if s.userRepo == nil {
		return &domain.NotificationPage{
			Notifications: []*domain.Notification{},
			TotalCount:    0,
			Page:          filter.Page,
			PageSize:      filter.PageSize,
		}, nil
	}
	return s.userRepo.GetFilteredNotifications(ctx, filter)
}

