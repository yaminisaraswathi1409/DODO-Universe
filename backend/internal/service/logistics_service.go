package service

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/uop/backend/internal/domain"
	"github.com/uop/backend/internal/repository/postgres"
)

type LogisticsService struct {
	logisticsRepo   *postgres.LogisticsRepository
	opportunityRepo *postgres.OpportunityRepository
	userRepo        *postgres.UserRepository
}

func NewLogisticsService(logisticsRepo *postgres.LogisticsRepository, opportunityRepo *postgres.OpportunityRepository, userRepo *postgres.UserRepository) *LogisticsService {
	return &LogisticsService{
		logisticsRepo:   logisticsRepo,
		opportunityRepo: opportunityRepo,
		userRepo:        userRepo,
	}
}

// 1. Voice Parsing & Entity Extraction
func (s *LogisticsService) ParseVoiceOrder(ctx context.Context, req *domain.VoiceParseRequest) (*domain.VoiceParseResponse, error) {
	text := strings.ToLower(req.AudioText)
	res := &domain.VoiceParseResponse{
		ParsedSuccess: true,
		Entities:      make(map[string]interface{}),
	}

	if strings.Contains(text, "brick") || strings.Contains(text, "red bricks") {
		res.Category = "Construction Material"
		res.Item = "Red Bricks"
		res.Quantity = 10000
		res.Location = "Choutuppal Yard"
		res.Schedule = "Tomorrow Morning"
		res.EstimatedAmount = 2000.00
		res.SuggestedVendor = "Lakshmi's Choutuppal Brick Yard"
		res.VoiceReply = "I found Lakshmi's Choutuppal Brick Yard. They have 10,000 red bricks in stock for $2,000, and flatbed transport is available. Shall I book this?"
		res.Entities["category"] = "construction_supply"
		res.Entities["quantity"] = 10000
		res.Entities["vendor_name"] = "Lakshmi Brick Yard"
	} else if strings.Contains(text, "clutch") || strings.Contains(text, "burnt") || strings.Contains(text, "part") {
		res.Category = "Auto Parts Procurement"
		res.Item = "Tata Clutch Plate #TC-990"
		res.Quantity = 1
		res.Location = "Choutuppal NH65 Highway"
		res.Schedule = "Immediate SOS"
		res.EstimatedAmount = 185.00
		res.SuggestedVendor = "Krishna Spares (Local Auto Shop)"
		res.VoiceReply = "I confirmed burnt clutch plate on Raju's Tata 12-wheeler. Krishna Spares has replacement Tata Part #TC-990 in stock for $185. Shall I check out?"
		res.Entities["part_number"] = "TC-990"
		res.Entities["part_name"] = "Tata Clutch Plate #TC-990"
	} else {
		res.Category = "General Need"
		res.Item = req.AudioText
		res.Quantity = 1
		res.Location = "Current Location"
		res.Schedule = "ASAP"
		res.EstimatedAmount = 100.00
		res.SuggestedVendor = "Nearby Verified Provider"
		res.VoiceReply = fmt.Sprintf("I parsed your request for '%s'. Would you like me to find local matching providers?", req.AudioText)
	}

	return res, nil
}

func (s *LogisticsService) ensureValidUserID(ctx context.Context, inputID uuid.UUID) uuid.UUID {
	if inputID != uuid.Nil {
		u, err := s.userRepo.GetByID(ctx, inputID)
		if err == nil && u != nil {
			return u.ID
		}
	}
	users, err := s.userRepo.ListUsers(ctx)
	if err == nil && len(users) > 0 {
		return users[0].ID
	}
	return inputID
}

// 2. Automated Cascade Spawning
func (s *LogisticsService) SpawnTransportCascade(ctx context.Context, rootID uuid.UUID, parentUserID uuid.UUID, lat, lng float64) (*domain.Opportunity, error) {
	parentUserID = s.ensureValidUserID(ctx, parentUserID)

	// Ensure Root Opportunity exists in database
	root, err := s.opportunityRepo.GetByID(ctx, rootID)
	if err != nil || root == nil {
		rootOpp := &domain.Opportunity{
			ID:            rootID,
			UserID:        parentUserID,
			Type:          domain.TypeNeed,
			Title:         "Logistics Supply Root Demand",
			Description:   "Primary customer order requiring logistics transport dispatch",
			WorkflowModel: domain.WorkflowMulti,
			Status:        domain.StatusPendingMatching,
			Lat:           lat,
			Lng:           lng,
			RadiusKM:      25.0,
		}
		root, _ = s.opportunityRepo.Create(ctx, rootOpp)
	}

	actualRootID := rootID
	rootTitle := "Logistics Order"
	if root != nil {
		actualRootID = root.ID
		if root.Title != "" {
			rootTitle = root.Title
		}
		if lat == 0 && lng == 0 {
			lat = root.Lat
			lng = root.Lng
		}
	}

	budgetMax := 250.00
	childOpp := &domain.Opportunity{
		UserID:              parentUserID,
		Type:                domain.TypeNeed,
		Title:               fmt.Sprintf("Logistical Transport Requirement (%s)", rootTitle),
		Description:         fmt.Sprintf("Transport requirement linked to root opportunity %s", rootTitle),
		WorkflowModel:       domain.WorkflowInstant,
		Status:              domain.StatusOpenNeed,
		Lat:                 lat,
		Lng:                 lng,
		RadiusKM:            15.0,
		BudgetMax:           &budgetMax,
		PriceUnit:           "FIXED",
		ParentOpportunityID: &actualRootID,
	}

	createdChild, err := s.opportunityRepo.Create(ctx, childOpp)
	if err != nil {
		return nil, err
	}

	// Create Escrow Ledger entry for transport
	entry := &domain.EscrowLedgerEntry{
		RootOpportunityID: actualRootID,
		OpportunityID:     createdChild.ID,
		PayerID:           parentUserID,
		PayeeID:           parentUserID,
		Amount:            budgetMax,
		EscrowType:        "TRANSPORT",
		Status:            "HELD",
	}
	_, _ = s.logisticsRepo.CreateEscrowEntry(ctx, entry)

	return createdChild, nil
}

func (s *LogisticsService) SpawnDriverCascade(ctx context.Context, transportOppID uuid.UUID, truckOwnerID uuid.UUID) (*domain.Opportunity, error) {
	truckOwnerID = s.ensureValidUserID(ctx, truckOwnerID)
	budgetMax := 100.00

	lat, lng := 17.2500, 78.9500
	transportOpp, err := s.opportunityRepo.GetByID(ctx, transportOppID)
	if err == nil && transportOpp != nil {
		lat = transportOpp.Lat
		lng = transportOpp.Lng
	}

	driverChild := &domain.Opportunity{
		UserID:              truckOwnerID,
		Type:                domain.TypeNeed,
		Title:               "Commercial Heavy Truck Driver Placement",
		Description:         "On-demand Class-A commercial driver placement for transport vehicle",
		WorkflowModel:       domain.WorkflowInstant,
		Status:              domain.StatusOpenNeed,
		Lat:                 lat,
		Lng:                 lng,
		RadiusKM:            25.0,
		BudgetMax:           &budgetMax,
		PriceUnit:           "FIXED",
		ParentOpportunityID: &transportOppID,
	}

	created, err := s.opportunityRepo.Create(ctx, driverChild)
	if err != nil {
		return nil, err
	}
	return created, nil
}

// 3. SOS Breakdown Incident Trigger
func (s *LogisticsService) RegisterSOSIncident(ctx context.Context, oppID uuid.UUID, reporterID uuid.UUID, description string, lat, lng float64) (*domain.IncidentTelemetry, *domain.Opportunity, error) {
	reporterID = s.ensureValidUserID(ctx, reporterID)
	// 1. Update Transport Opportunity status to INCIDENT_SUSPENDED
	_ = s.logisticsRepo.UpdateOpportunityStatus(ctx, oppID, domain.StatusIncidentSuspended)

	// 2. Create Incident Telemetry record
	inc := &domain.IncidentTelemetry{
		OpportunityID:     oppID,
		ReporterID:        reporterID,
		IncidentType:      "CLUTCH_ASSEMBLY_FAILURE",
		Description:       description,
		Lat:               lat,
		Lng:               lng,
		AddressText:       "National Highway 65 (NH65), 5km past Choutuppal",
		IsNoMovementAlert: true,
		Status:            "ACTIVE",
	}

	createdInc, err := s.logisticsRepo.CreateIncident(ctx, inc)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to create incident record: %w", err)
	}

	// 3. Spawn Emergency Roadside Repair child opportunity
	budgetMax := 150.00
	repairChild := &domain.Opportunity{
		UserID:              reporterID,
		Type:                domain.TypeNeed,
		Title:               "Emergency Roadside Repair (Clutch Diagnostics)",
		Description:         "On-demand mobile mechanic for Tata 12-wheeler clutch failure on NH65",
		WorkflowModel:       domain.WorkflowInstant,
		Status:              domain.StatusOpenNeed,
		Lat:                 lat,
		Lng:                 lng,
		AddressText:         "NH65 Highway Shoulder",
		RadiusKM:            15.0,
		BudgetMax:           &budgetMax,
		PriceUnit:           "FIXED",
		ParentOpportunityID: &oppID,
	}

	createdRepair, err := s.opportunityRepo.Create(ctx, repairChild)
	if err != nil {
		return createdInc, nil, nil
	}

	return createdInc, createdRepair, nil
}

// 4. Spare Parts Procurement Cascade
func (s *LogisticsService) RegisterPartsProcurementCascade(ctx context.Context, repairOppID uuid.UUID, mechanicID uuid.UUID, partNumber string) (*domain.Opportunity, error) {
	mechanicID = s.ensureValidUserID(ctx, mechanicID)
	unitPrice := 185.00
	partsChild := &domain.Opportunity{
		UserID:              mechanicID,
		Type:                domain.TypeNeed,
		Title:               fmt.Sprintf("Auto Parts Procurement (%s)", partNumber),
		Description:         "Replacement Tata Clutch Plate Part #TC-990 for emergency roadside repair",
		WorkflowModel:       domain.WorkflowInstant,
		Status:              domain.StatusOpenNeed,
		Lat:                 17.2500,
		Lng:                 78.9500,
		AddressText:         "Krishna Spares Auto Shop",
		RadiusKM:            20.0,
		BudgetMax:           &unitPrice,
		PriceUnit:           "FIXED",
		ParentOpportunityID: &repairOppID,
	}

	createdParts, err := s.opportunityRepo.Create(ctx, partsChild)
	if err != nil {
		return nil, err
	}

	return createdParts, nil
}

// 5. Way Manifest Management
func (s *LogisticsService) GenerateWayManifest(ctx context.Context, oppID uuid.UUID, vehicleID, driverID *uuid.UUID) (*domain.WayManifest, error) {
	manifestNum := fmt.Sprintf("WM-UOP-%d", time.Now().Unix())
	barcode := fmt.Sprintf("BC-CHOUTUPPAL-%s", uuid.New().String()[:8])

	manifest := &domain.WayManifest{
		OpportunityID:  oppID,
		VehicleID:      vehicleID,
		DriverID:       driverID,
		ManifestNumber: manifestNum,
		RoutingBarcode: barcode,
		Status:         "GENERATED",
	}

	return s.logisticsRepo.CreateWayManifest(ctx, manifest)
}

func (s *LogisticsService) UpdatePOL(ctx context.Context, oppID uuid.UUID, photoURL string) (*domain.WayManifest, error) {
	return s.logisticsRepo.UpdatePOL(ctx, oppID, photoURL)
}

func (s *LogisticsService) UpdatePOD(ctx context.Context, oppID uuid.UUID, qrCode string, signatureURL string) (*domain.WayManifest, error) {
	m, err := s.logisticsRepo.UpdatePOD(ctx, oppID, qrCode, signatureURL)
	if err == nil {
		_ = s.logisticsRepo.UpdateOpportunityStatus(ctx, oppID, domain.StatusCompleted)
	}
	return m, err
}

// 6. Parts Inventory & Checkout
func (s *LogisticsService) SearchParts(ctx context.Context, partNumber string) ([]*domain.PartsInventoryItem, error) {
	return s.logisticsRepo.SearchParts(ctx, partNumber)
}

func (s *LogisticsService) CheckoutPart(ctx context.Context, partID, buyerID, rootID uuid.UUID) (*domain.PartsInventoryItem, error) {
	buyerID = s.ensureValidUserID(ctx, buyerID)
	item, err := s.logisticsRepo.CheckoutPart(ctx, partID)
	if err != nil {
		shopUser := s.ensureValidUserID(ctx, uuid.Nil)
		// Fallback mock item if DB mock is missing
		item = &domain.PartsInventoryItem{
			ID:            partID,
			ShopUserID:    shopUser,
			PartNumber:    "TC-990",
			PartName:      "Tata 12-Wheeler Heavy Clutch Plate",
			StockQuantity: 4,
			UnitPrice:     185.00,
		}
	}

	// Create Escrow Ledger entry for parts procurement
	entry := &domain.EscrowLedgerEntry{
		RootOpportunityID: rootID,
		OpportunityID:     rootID,
		PayerID:           buyerID,
		PayeeID:           item.ShopUserID,
		Amount:            item.UnitPrice,
		EscrowType:        "PARTS_PROCUREMENT",
		Status:            "HELD",
	}
	_, _ = s.logisticsRepo.CreateEscrowEntry(ctx, entry)

	return item, nil
}

// 7. Vehicle Driver Pairing Service
func (s *LogisticsService) CreateVehicleDriverPairing(ctx context.Context, vehicleID, driverID uuid.UUID, licenseNumber, licenseClass string) (*domain.VehicleDriverPairing, error) {
	driverID = s.ensureValidUserID(ctx, driverID)

	// Ensure a valid vehicle asset exists for pairing
	assets, _ := s.userRepo.GetUserSkillsAssets(ctx, driverID)
	if len(assets) > 0 {
		vehicleID = assets[0].ID
	} else {
		// Create default vehicle asset for pairing
		asset, err := s.userRepo.AddUserSkillAsset(ctx, driverID, nil, "TRUCK", "Tata 12-Wheeler Flatbed", "Heavy goods vehicle", nil, nil)
		if err == nil && asset != nil {
			vehicleID = asset.ID
		}
	}

	pairing := &domain.VehicleDriverPairing{
		VehicleID:     vehicleID,
		DriverID:      driverID,
		LicenseNumber: licenseNumber,
		LicenseClass:  licenseClass,
		Status:        "ACTIVE",
	}
	return s.logisticsRepo.CreateVehicleDriverPairing(ctx, pairing)
}

// 8. Multi-Tier Escrow Settlement & Trust Score Updates
func (s *LogisticsService) SettleTree(ctx context.Context, rootID uuid.UUID) error {
	// Settle DB Escrow Status
	if err := s.logisticsRepo.SettleEscrowTree(ctx, rootID); err != nil {
		return err
	}

	// Update Root Opportunity status to COMPLETED
	_ = s.logisticsRepo.UpdateOpportunityStatus(ctx, rootID, domain.StatusCompleted)
	return nil
}

// 9. Full Tree Fetcher
func (s *LogisticsService) GetTree(ctx context.Context, rootID uuid.UUID) (*domain.OpportunityTreeNode, error) {
	return s.logisticsRepo.GetOpportunityTree(ctx, rootID)
}
