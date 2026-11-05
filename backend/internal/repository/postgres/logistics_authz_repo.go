package postgres

import (
	"context"
	"fmt"

	"github.com/google/uuid"
)

// GetVehicleOwnerID returns the owner (users.id) of a vehicle asset.
func (r *LogisticsRepository) GetVehicleOwnerID(ctx context.Context, vehicleID uuid.UUID) (uuid.UUID, error) {
	var owner uuid.UUID
	if err := r.db.Pool.QueryRow(ctx, `SELECT user_id FROM user_skills_assets WHERE id = $1`, vehicleID).Scan(&owner); err != nil {
		return uuid.Nil, fmt.Errorf("vehicle not found")
	}
	return owner, nil
}

// GetIncidentOpportunityID returns the order an incident belongs to.
func (r *LogisticsRepository) GetIncidentOpportunityID(ctx context.Context, incidentID uuid.UUID) (uuid.UUID, error) {
	var oppID uuid.UUID
	if err := r.db.Pool.QueryRow(ctx, `SELECT opportunity_id FROM incidents_telemetry WHERE id = $1`, incidentID).Scan(&oppID); err != nil {
		return uuid.Nil, fmt.Errorf("incident not found")
	}
	return oppID, nil
}

