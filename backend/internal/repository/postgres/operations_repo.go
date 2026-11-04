package postgres

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/uop/backend/internal/domain"
)

type OperationsRepository struct {
	db *DB
}

func NewOperationsRepository(db *DB) *OperationsRepository {
	return &OperationsRepository{db: db}
}

// GetDashboardMetrics aggregates real platform operational indicators across database tables
func (r *OperationsRepository) GetDashboardMetrics(ctx context.Context) (*domain.AdminDashboardMetrics, error) {
	metrics := &domain.AdminDashboardMetrics{
		OrdersByStatus: make(map[string]int),
		GeneratedAt:    time.Now(),
	}

	if r.db == nil || r.db.Pool == nil {
		return metrics, nil
	}

	// 1. User role counts
	userCountsQuery := `
		SELECT role, COUNT(*)
		FROM users
		WHERE status = 'ACTIVE'
		GROUP BY role;
	`
	rows, err := r.db.Pool.Query(ctx, userCountsQuery)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var role string
			var count int
			if scanErr := rows.Scan(&role, &count); scanErr == nil {
				switch strings.ToUpper(role) {
				case "CUSTOMER":
					metrics.ActiveUsersCount = count
				case "VENDOR":
					metrics.ActiveVendorsCount = count
				case "DRIVER":
					metrics.ActiveDriversCount = count
				}
			}
		}
	}

	// 2. Pending Category & Catalog Approvals
	_ = r.db.Pool.QueryRow(ctx, "SELECT COUNT(*) FROM vendor_category_approvals WHERE status = 'PENDING';").Scan(&metrics.PendingCategoryApprovals)
	_ = r.db.Pool.QueryRow(ctx, "SELECT COUNT(*) FROM vendor_catalog_items WHERE status = 'PENDING';").Scan(&metrics.PendingCatalogApprovals)

	// 3. Orders by Status
	orderRows, err := r.db.Pool.Query(ctx, `
		SELECT status, COUNT(*)
		FROM opportunities
		GROUP BY status;
	`)
	if err == nil {
		defer orderRows.Close()
		for orderRows.Next() {
			var status string
			var count int
			if scanErr := orderRows.Scan(&status, &count); scanErr == nil {
				metrics.OrdersByStatus[status] = count
			}
		}
	}

	// 4. Active SOS Incidents
	_ = r.db.Pool.QueryRow(ctx, "SELECT COUNT(*) FROM incidents_telemetry WHERE status IN ('ACTIVE', 'INVESTIGATING');").Scan(&metrics.ActiveIncidentsCount)

	// 5. Notification Dispatch Queue Status
	_ = r.db.Pool.QueryRow(ctx, "SELECT COUNT(*) FROM notifications WHERE metadata->>'status' = 'FAILED';").Scan(&metrics.FailedNotificationJobsCount)
	_ = r.db.Pool.QueryRow(ctx, "SELECT COUNT(*) FROM notifications WHERE metadata->>'status' IN ('QUEUED', 'PENDING');").Scan(&metrics.QueuedNotificationJobsCount)

	// 6. Stuck Orders Count
	stuckOrders, err := r.ListStuckOrders(ctx)
	if err == nil {
		metrics.StuckOrdersCount = len(stuckOrders)
	}

	return metrics, nil
}

// ListStuckOrders evaluates opportunities exceeding stage-specific delay thresholds
func (r *OperationsRepository) ListStuckOrders(ctx context.Context) ([]*domain.StuckOrderAlert, error) {
	alerts := make([]*domain.StuckOrderAlert, 0)
	if r.db == nil || r.db.Pool == nil {
		return alerts, nil
	}

	// Query opportunities in intermediate non-terminal states
	query := `
		SELECT o.id, o.title, o.status, COALESCE(o.target_vendor_id, o.assigned_user_id, '00000000-0000-0000-0000-000000000000'::uuid),
		       COALESCE(v.full_name, 'Unknown Vendor'), o.user_id, COALESCE(c.full_name, 'Unknown Customer'),
		       o.updated_at, EXTRACT(EPOCH FROM (NOW() - o.updated_at)) / 3600.0 AS duration_hours
		FROM opportunities o
		LEFT JOIN users v ON v.id = COALESCE(o.target_vendor_id, o.assigned_user_id)
		LEFT JOIN users c ON c.id = o.user_id
		WHERE o.status IN (
			'ORDER_CONFIRMED',
			'VENDOR_ACCEPTED',
			'READY_FOR_PICKUP',
			'IN_TRANSIT',
			'DELIVERED',
			'INCIDENT_SUSPENDED'
		)
		ORDER BY o.updated_at ASC;
	`

	rows, err := r.db.Pool.Query(ctx, query)
	if err != nil {
		return alerts, fmt.Errorf("failed querying opportunities for delay inspection: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var (
			oppID, vendorID, customerID uuid.UUID
			title, status, vendorName, customerName string
			updatedAt time.Time
			durationHours float64
		)

		if scanErr := rows.Scan(
			&oppID, &title, &status, &vendorID, &vendorName,
			&customerID, &customerName, &updatedAt, &durationHours,
		); scanErr != nil {
			return alerts, scanErr
		}

		var (
			thresholdHours float64
			isStuck bool
			severity string
			recommendation string
		)

		switch status {
		case "ORDER_CONFIRMED":
			thresholdHours = 24.0
			if durationHours >= thresholdHours {
				isStuck = true
				if durationHours >= 48.0 {
					severity = "CRITICAL"
				} else {
					severity = "WARNING"
				}
				recommendation = "Contact vendor immediately to accept order or initiate graceful auto-reassignment"
			}
		case "VENDOR_ACCEPTED":
			thresholdHours = 48.0
			if durationHours >= thresholdHours {
				isStuck = true
				severity = "WARNING"
				recommendation = "Verify vendor packaging readiness and logistics resource allocation"
			}
		case "READY_FOR_PICKUP":
			thresholdHours = 24.0
			if durationHours >= thresholdHours {
				isStuck = true
				severity = "CRITICAL"
				recommendation = "Inspect driver assignment and dispatch vehicle for loading confirmation"
			}
		case "IN_TRANSIT":
			thresholdHours = 72.0
			if durationHours >= thresholdHours {
				isStuck = true
				severity = "WARNING"
				recommendation = "Review live GPS telemetry or initiate transport check-in call"
			}
		case "DELIVERED":
			thresholdHours = 48.0
			if durationHours >= thresholdHours {
				isStuck = true
				severity = "CRITICAL"
				recommendation = "Follow up with customer for delivery OTP handshake to release vendor escrow"
			}
		case "INCIDENT_SUSPENDED":
			thresholdHours = 4.0
			if durationHours >= thresholdHours {
				isStuck = true
				severity = "CRITICAL"
				recommendation = "SOS emergency unresolved: dispatch roadside assistance or assign replacement vehicle"
			}
		}

		if isStuck {
			alerts = append(alerts, &domain.StuckOrderAlert{
				OpportunityID:   oppID,
				Title:           title,
				VendorID:        vendorID,
				VendorName:      vendorName,
				CustomerID:      customerID,
				CustomerName:    customerName,
				Status:          status,
				DurationHours:   durationHours,
				ThresholdHours:  thresholdHours,
				StatusEnteredAt: updatedAt,
				Severity:        severity,
				Recommendation:  recommendation,
			})
		}
	}

	return alerts, nil
}

// CreateAuditLog writes an auditable record of governance or operational actions
func (r *OperationsRepository) CreateAuditLog(ctx context.Context, log *domain.AdminAuditLog) error {
	if r.db == nil || r.db.Pool == nil {
		return nil
	}
	if log == nil {
		return fmt.Errorf("audit log cannot be nil")
	}

	query := `
		INSERT INTO admin_audit_logs (
			id, actor_id, actor_role, action, entity_type, entity_id,
			previous_state, new_state, reason, metadata, created_at
		) VALUES (
			COALESCE($1, gen_random_uuid()), $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW()
		);
	`
	_, err := r.db.Pool.Exec(
		ctx, query,
		log.ID, log.ActorID, log.ActorRole, log.Action, log.EntityType, log.EntityID,
		log.PreviousState, log.NewState, log.Reason, log.Metadata,
	)
	if err != nil {
		return fmt.Errorf("failed inserting audit log: %w", err)
	}
	return nil
}

// ListAuditLogs retrieves paginated audit logs with optional entity and actor filtering
func (r *OperationsRepository) ListAuditLogs(ctx context.Context, entityType string, actorID *uuid.UUID, limit, offset int) ([]*domain.AdminAuditLog, int, error) {
	logs := make([]*domain.AdminAuditLog, 0)
	if r.db == nil || r.db.Pool == nil {
		return logs, 0, nil
	}

	if limit <= 0 || limit > 100 {
		limit = 20
	}
	if offset < 0 {
		offset = 0
	}

	whereClauses := []string{"1=1"}
	args := make([]interface{}, 0)
	argIdx := 1

	if entityType != "" {
		whereClauses = append(whereClauses, fmt.Sprintf("entity_type = $%d", argIdx))
		args = append(args, entityType)
		argIdx++
	}

	if actorID != nil && *actorID != uuid.Nil {
		whereClauses = append(whereClauses, fmt.Sprintf("actor_id = $%d", argIdx))
		args = append(args, *actorID)
		argIdx++
	}

	whereSQL := strings.Join(whereClauses, " AND ")

	var total int
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM admin_audit_logs WHERE %s;", whereSQL)
	if err := r.db.Pool.QueryRow(ctx, countQuery, args...).Scan(&total); err != nil {
		if strings.Contains(err.Error(), "does not exist") {
			return logs, 0, nil
		}
		return logs, 0, err
	}

	itemsQuery := fmt.Sprintf(`
		SELECT id, actor_id, actor_role, action, entity_type, entity_id,
		       previous_state, new_state, COALESCE(reason, ''), COALESCE(metadata, '{}'::jsonb), created_at
		FROM admin_audit_logs
		WHERE %s
		ORDER BY created_at DESC
		LIMIT $%d OFFSET $%d;
	`, whereSQL, argIdx, argIdx+1)

	args = append(args, limit, offset)

	rows, err := r.db.Pool.Query(ctx, itemsQuery, args...)
	if err != nil {
		return logs, 0, err
	}
	defer rows.Close()

	for rows.Next() {
		var l domain.AdminAuditLog
		if err := rows.Scan(
			&l.ID, &l.ActorID, &l.ActorRole, &l.Action, &l.EntityType, &l.EntityID,
			&l.PreviousState, &l.NewState, &l.Reason, &l.Metadata, &l.CreatedAt,
		); err != nil {
			return logs, 0, err
		}
		logs = append(logs, &l)
	}

	return logs, total, nil
}

// ListActiveIncidents retrieves active SOS incidents for administrative escalation
func (r *OperationsRepository) ListActiveIncidents(ctx context.Context) ([]map[string]interface{}, error) {
	incidents := make([]map[string]interface{}, 0)
	if r.db == nil || r.db.Pool == nil {
		return incidents, nil
	}

	query := `
		SELECT i.id, i.opportunity_id, o.title, i.reporter_id, u.full_name, u.phone,
		       i.incident_type, COALESCE(i.description, ''), i.status,
		       COALESCE(ST_Y(i.location::geometry), 0.0) AS lat,
		       COALESCE(ST_X(i.location::geometry), 0.0) AS lng,
		       COALESCE(i.address_text, ''), COALESCE(i.telemetry_data, '{}'::jsonb),
		       i.is_no_movement_alert, i.handler_id, COALESCE(h.full_name, ''),
		       COALESCE(i.resolution_notes, ''), COALESCE(i.internal_notes, '[]'::jsonb),
		       i.created_at, i.updated_at
		FROM incidents_telemetry i
		JOIN opportunities o ON o.id = i.opportunity_id
		JOIN users u ON u.id = i.reporter_id
		LEFT JOIN users h ON h.id = i.handler_id
		ORDER BY CASE WHEN i.status = 'ACTIVE' THEN 1 WHEN i.status = 'INVESTIGATING' THEN 2 ELSE 3 END,
		         i.created_at DESC
		LIMIT 50;
	`

	rows, err := r.db.Pool.Query(ctx, query)
	if err != nil {
		// Fallback if extended columns are pending
		return incidents, nil
	}
	defer rows.Close()

	for rows.Next() {
		var (
			id, oppID, reporterID uuid.UUID
			oppTitle, reporterName, reporterPhone, incidentType, description, status string
			lat, lng float64
			addressText string
			telemetryData, internalNotes []byte
			noMovementAlert bool
			handlerID *uuid.UUID
			handlerName, resolutionNotes string
			createdAt, updatedAt time.Time
		)

		if scanErr := rows.Scan(
			&id, &oppID, &oppTitle, &reporterID, &reporterName, &reporterPhone,
			&incidentType, &description, &status, &lat, &lng,
			&addressText, &telemetryData, &noMovementAlert,
			&handlerID, &handlerName, &resolutionNotes, &internalNotes,
			&createdAt, &updatedAt,
		); scanErr != nil {
			return incidents, scanErr
		}

		item := map[string]interface{}{
			"id":                   id,
			"opportunity_id":       oppID,
			"opportunity_title":    oppTitle,
			"reporter_id":          reporterID,
			"reporter_name":        reporterName,
			"reporter_phone":       reporterPhone,
			"incident_type":        incidentType,
			"description":          description,
			"status":               status,
			"latitude":             lat,
			"longitude":            lng,
			"address_text":         addressText,
			"telemetry_data":       json.RawMessage(telemetryData),
			"is_no_movement_alert": noMovementAlert,
			"handler_id":           handlerID,
			"handler_name":         handlerName,
			"resolution_notes":     resolutionNotes,
			"internal_notes":       json.RawMessage(internalNotes),
			"created_at":           createdAt,
			"updated_at":           updatedAt,
		}
		incidents = append(incidents, item)
	}

	return incidents, nil
}

// AddIncidentNote appends an internal note to an active SOS incident
func (r *OperationsRepository) AddIncidentNote(ctx context.Context, incidentID, authorID uuid.UUID, authorName, note string) error {
	if r.db == nil || r.db.Pool == nil {
		return nil
	}

	noteObj := domain.IncidentInternalNote{
		AuthorID:   authorID,
		AuthorName: authorName,
		Note:       note,
		CreatedAt:  time.Now(),
	}
	noteJSON, _ := json.Marshal(noteObj)

	query := `
		UPDATE incidents_telemetry
		SET internal_notes = COALESCE(internal_notes, '[]'::jsonb) || $2::jsonb,
		    updated_at = NOW()
		WHERE id = $1;
	`
	_, err := r.db.Pool.Exec(ctx, query, incidentID, string(noteJSON))
	return err
}

// AssignIncidentHandler sets the operations handler on an SOS incident
func (r *OperationsRepository) AssignIncidentHandler(ctx context.Context, incidentID, handlerID uuid.UUID) error {
	if r.db == nil || r.db.Pool == nil {
		return nil
	}

	query := `
		UPDATE incidents_telemetry
		SET handler_id = $2,
		    status = 'INVESTIGATING',
		    updated_at = NOW()
		WHERE id = $1;
	`
	_, err := r.db.Pool.Exec(ctx, query, incidentID, handlerID)
	return err
}

