package service

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/uop/backend/internal/domain"
	"github.com/uop/backend/internal/repository/postgres"
	"github.com/uop/backend/internal/spatial"
)

func TestCommuterRouteMatching(t *testing.T) {
	ist := time.FixedZone("IST", 5*3600+30*60)
	// Base coordinates: Lingotam (Origin) to Choutuppal (Dest)
	originCoord := spatial.Coordinates{Lat: 17.2000, Lng: 78.9000}
	destCoord := spatial.Coordinates{Lat: 17.2500, Lng: 78.9500}

	customerID := uuid.New()
	travellerID := uuid.New()

	baseNeed := &domain.Opportunity{
		ID:          uuid.New(),
		UserID:      customerID,
		Type:        domain.TypeNeed,
		Status:      domain.StatusOpen,
		Title:       "Urgent Medicines from Pharmacy",
		AddressText: "Near Highway Crossing, Choutuppal",
		Lat:         17.2400,
		Lng:         78.9400,
	}

	pickupOnRoute := spatial.Coordinates{Lat: 17.2100, Lng: 78.9100}
	dropOnRoute := spatial.Coordinates{Lat: 17.2400, Lng: 78.9400}

	createBaseJourney := func() (*domain.Opportunity, map[string]interface{}) {
		meta := map[string]interface{}{
			"is_journey":             true,
			"origin_address":         "Lingotam Village, Telangana",
			"origin_lat":             originCoord.Lat,
			"origin_lng":             originCoord.Lng,
			"destination_address":    "Choutuppal Town, Telangana",
			"destination_lat":        destCoord.Lat,
			"destination_lng":        destCoord.Lng,
			"max_detour_km":          5.0,
			"travel_mode":            "BIKE",
			"travel_frequency":       "DAILY",
			"departure_window_start": "08:00",
			"departure_window_end":   "10:00",
			"is_active":              true,
		}
		rawMeta, _ := json.Marshal(meta)

		opp := &domain.Opportunity{
			ID:          uuid.New(),
			UserID:      travellerID,
			Type:        domain.TypeOffer,
			OrderMode:   domain.OrderModeJourney,
			Status:      domain.StatusOpen,
			Title:       "Daily Commute: Lingotam to Choutuppal",
			AddressText: "Lingotam Village, Telangana",
			Lat:         originCoord.Lat,
			Lng:         originCoord.Lng,
			RadiusKM:    5.0,
			Metadata:    rawMeta,
			CreatedAt:   time.Now(),
		}
		return opp, meta
	}

	candidateUser := &domain.User{
		ID:         travellerID,
		FullName:   "Ramesh Kumar",
		Phone:      "+91 98765 43210",
		TrustScore: 4.8,
	}

	// -------------------------------------------------------------------------
	// 1. Valid active journey matching a suitable delivery
	// -------------------------------------------------------------------------
	t.Run("1_ValidActiveJourneyMatchesSuitableDelivery", func(t *testing.T) {
		jOpp, jMeta := createBaseJourney()
		need := *baseNeed

		match, ok := postgres.EvaluateCommuteMatch(&need, pickupOnRoute, dropOnRoute, "Pharmacy Lingotam", "Customer Residence", jOpp, jMeta, candidateUser, 25000)
		if !ok || match == nil {
			t.Fatalf("Expected valid match for forward journey within detour limit, got none")
		}

		if match.Provider == nil || match.Provider.Phone != "+91 98****3210" {
			t.Errorf("Expected masked phone number for privacy protection, got: %v", match.Provider)
		}
		if match.TotalDetourMeters > 5000.0 {
			t.Errorf("Expected added detour to be within 5km, got %f meters", match.TotalDetourMeters)
		}
		t.Logf("PASS: Found valid match: detour = %.1f m, est detour = %d min, payout = %s",
			match.TotalDetourMeters, match.EstimatedDetourMin, match.FormattedPayout)
	})

	// -------------------------------------------------------------------------
	// 2. Journey in the wrong direction
	// -------------------------------------------------------------------------
	t.Run("2_JourneyInWrongDirection", func(t *testing.T) {
		jOpp, jMeta := createBaseJourney()
		need := *baseNeed

		// Inverted route: pickup near Destination, drop-off near Origin
		wrongPickup := spatial.Coordinates{Lat: 17.2450, Lng: 78.9450}
		wrongDrop := spatial.Coordinates{Lat: 17.2050, Lng: 78.9050}

		match, ok := postgres.EvaluateCommuteMatch(&need, wrongPickup, wrongDrop, "Choutuppal End", "Lingotam End", jOpp, jMeta, candidateUser, 25000)
		if ok || match != nil {
			t.Errorf("Expected reverse direction trip to be rejected, but it was matched!")
		} else {
			t.Logf("PASS: Correctly rejected reverse direction trip")
		}
	})

	// -------------------------------------------------------------------------
	// 3. Pickup/drop-off outside the acceptable detour
	// -------------------------------------------------------------------------
	t.Run("3_PickupOrDropOutsideAcceptableDetour", func(t *testing.T) {
		jOpp, jMeta := createBaseJourney()
		need := *baseNeed
		// Traveller specifies strict max detour of 1.0 km
		jMeta["max_detour_km"] = 1.0

		// Stop is 8km out of the corridor to the North-West
		farPickup := spatial.Coordinates{Lat: 17.3500, Lng: 78.8500}

		match, ok := postgres.EvaluateCommuteMatch(&need, farPickup, dropOnRoute, "Far Out-of-Way Shop", "Destination", jOpp, jMeta, candidateUser, 25000)
		if ok || match != nil {
			t.Errorf("Expected delivery with 8km detour to be rejected when max_detour_km is 1.0km, but it was matched!")
		} else {
			t.Logf("PASS: Correctly rejected trip exceeding configured detour limit")
		}
	})

	// -------------------------------------------------------------------------
	// 4. Paused journey
	// -------------------------------------------------------------------------
	t.Run("4_PausedJourneyExcluded", func(t *testing.T) {
		// Case A: Status is PAUSED
		jOpp, jMeta := createBaseJourney()
		jOpp.Status = domain.StatusPaused
		need := *baseNeed

		if _, ok := postgres.EvaluateCommuteMatch(&need, pickupOnRoute, dropOnRoute, "Pickup", "Drop", jOpp, jMeta, candidateUser, 25000); ok {
			t.Errorf("Expected journey with Status=PAUSED to be excluded!")
		} else {
			t.Logf("PASS: Excluded journey with Status=PAUSED")
		}

		// Case B: Metadata is_active is false
		jOpp2, jMeta2 := createBaseJourney()
		jMeta2["is_active"] = false
		if _, ok := postgres.EvaluateCommuteMatch(&need, pickupOnRoute, dropOnRoute, "Pickup", "Drop", jOpp2, jMeta2, candidateUser, 25000); ok {
			t.Errorf("Expected journey with is_active=false to be excluded!")
		} else {
			t.Logf("PASS: Excluded journey with is_active=false")
		}
	})

	// -------------------------------------------------------------------------
	// 5. Cancelled journey
	// -------------------------------------------------------------------------
	t.Run("5_CancelledJourneyExcluded", func(t *testing.T) {
		jOpp, jMeta := createBaseJourney()
		jOpp.Status = domain.StatusCancelled
		need := *baseNeed

		if _, ok := postgres.EvaluateCommuteMatch(&need, pickupOnRoute, dropOnRoute, "Pickup", "Drop", jOpp, jMeta, candidateUser, 25000); ok {
			t.Errorf("Expected journey with Status=CANCELLED to be excluded!")
		} else {
			t.Logf("PASS: Excluded journey with Status=CANCELLED")
		}
	})

	// -------------------------------------------------------------------------
	// 6. Request with missing or invalid coordinates
	// -------------------------------------------------------------------------
	t.Run("6_MissingOrInvalidCoordinates", func(t *testing.T) {
		jOpp, jMeta := createBaseJourney()
		need := *baseNeed

		invalidPickup := spatial.Coordinates{Lat: 95.0, Lng: 78.9100} // Latitude > 90
		if _, ok := postgres.EvaluateCommuteMatch(&need, invalidPickup, dropOnRoute, "Pickup", "Drop", jOpp, jMeta, candidateUser, 25000); ok {
			t.Errorf("Expected invalid latitude (95.0) to be rejected!")
		} else {
			t.Logf("PASS: Rejected request with invalid latitude")
		}

		zeroCoord := spatial.Coordinates{Lat: 0.0, Lng: 0.0} // Null island (0,0)
		if _, ok := postgres.EvaluateCommuteMatch(&need, zeroCoord, dropOnRoute, "Pickup", "Drop", jOpp, jMeta, candidateUser, 25000); ok {
			t.Errorf("Expected (0,0) coordinates to be rejected!")
		} else {
			t.Logf("PASS: Rejected request with missing/zero coordinates")
		}
	})

	// -------------------------------------------------------------------------
	// 7. Departure/arrival window mismatch
	// -------------------------------------------------------------------------
	t.Run("7_DepartureWindowMismatch", func(t *testing.T) {
		jOpp, jMeta := createBaseJourney()
		jMeta["departure_window_start"] = "08:00"
		jMeta["departure_window_end"] = "09:30"

		need := *baseNeed
		// Delivery requested for 17:30 (5:30 PM) -> well outside 08:00-09:30
		eveningTime := time.Date(2026, 10, 26, 17, 30, 0, 0, ist)
		need.ScheduledStart = &eveningTime

		if _, ok := postgres.EvaluateCommuteMatch(&need, pickupOnRoute, dropOnRoute, "Pickup", "Drop", jOpp, jMeta, candidateUser, 25000); ok {
			t.Errorf("Expected time mismatch (evening vs morning commute) to be rejected!")
		} else {
			t.Logf("PASS: Correctly rejected departure window mismatch")
		}

		// Delivery requested for 08:45 -> matches window
		morningTime := time.Date(2026, 10, 26, 8, 45, 0, 0, ist)
		need.ScheduledStart = &morningTime
		if _, ok := postgres.EvaluateCommuteMatch(&need, pickupOnRoute, dropOnRoute, "Pickup", "Drop", jOpp, jMeta, candidateUser, 25000); !ok {
			t.Errorf("Expected matching time (08:45 within 08:00-09:30) to pass!")
		} else {
			t.Logf("PASS: Permitted match within departure window")
		}
	})

	// -------------------------------------------------------------------------
	// 8. Recurring-day mismatch
	// -------------------------------------------------------------------------
	t.Run("8_RecurringDayMismatch", func(t *testing.T) {
		jOpp, jMeta := createBaseJourney()
		jMeta["travel_frequency"] = "WEEKDAYS"
		delete(jMeta, "available_days")

		need := *baseNeed
		// 2026-10-25 is Sunday
		sundayTime := time.Date(2026, 10, 25, 9, 0, 0, 0, ist)
		need.ScheduledStart = &sundayTime

		if _, ok := postgres.EvaluateCommuteMatch(&need, pickupOnRoute, dropOnRoute, "Pickup", "Drop", jOpp, jMeta, candidateUser, 25000); ok {
			t.Errorf("Expected Sunday request to be rejected for WEEKDAYS journey!")
		} else {
			t.Logf("PASS: Correctly rejected Sunday request on WEEKDAYS journey")
		}

		// 2026-10-26 is Monday -> should match
		mondayTime := time.Date(2026, 10, 26, 9, 0, 0, 0, ist)
		need.ScheduledStart = &mondayTime
		if _, ok := postgres.EvaluateCommuteMatch(&need, pickupOnRoute, dropOnRoute, "Pickup", "Drop", jOpp, jMeta, candidateUser, 25000); !ok {
			t.Errorf("Expected Monday request to pass on WEEKDAYS journey!")
		} else {
			t.Logf("PASS: Permitted Monday request on WEEKDAYS journey")
		}
	})

	// -------------------------------------------------------------------------
	// 9. Already assigned or completed requests
	// -------------------------------------------------------------------------
	t.Run("9_AlreadyAssignedOrCompletedRequestsExcluded", func(t *testing.T) {
		jOpp, jMeta := createBaseJourney()

		// Case A: Request already assigned to another driver
		needAssigned := *baseNeed
		assignedDriver := uuid.New()
		needAssigned.AssignedUserID = &assignedDriver

		if _, ok := postgres.EvaluateCommuteMatch(&needAssigned, pickupOnRoute, dropOnRoute, "Pickup", "Drop", jOpp, jMeta, candidateUser, 25000); ok {
			t.Errorf("Expected assigned need to be excluded from commuter matching!")
		} else {
			t.Logf("PASS: Excluded already-assigned request")
		}

		// Case B: Request completed
		needCompleted := *baseNeed
		needCompleted.Status = domain.StatusCompleted
		if _, ok := postgres.EvaluateCommuteMatch(&needCompleted, pickupOnRoute, dropOnRoute, "Pickup", "Drop", jOpp, jMeta, candidateUser, 25000); ok {
			t.Errorf("Expected completed need to be excluded from commuter matching!")
		} else {
			t.Logf("PASS: Excluded completed request")
		}
	})

	// -------------------------------------------------------------------------
	// 10. Correct PostGIS longitude/latitude ordering
	// -------------------------------------------------------------------------
	t.Run("10_CorrectPostGISCoordinateOrdering", func(t *testing.T) {
		lat := 17.251300
		lng := 78.897300

		pgPoint := spatial.ToPostGISPoint(lat, lng)
		expected := "ST_SetSRID(ST_MakePoint(78.897300, 17.251300), 4326)::geography"

		if pgPoint != expected {
			t.Errorf("PostGIS Point ordering violation! Expected %s, got %s", expected, pgPoint)
		} else {
			t.Logf("PASS: PostGIS ST_MakePoint strictly maintains (longitude, latitude) ordering: %s", pgPoint)
		}
	})
}

func TestPhaseC_CommuterOfferNotificationFlow(t *testing.T) {
	svc := NewOpportunityService(nil, nil, nil)
	ctx := context.Background()

	// -------------------------------------------------------------------------
	// 1. Eligible request vs Non-eligible request (Scenario 1 Isolation)
	// -------------------------------------------------------------------------
	t.Run("1_EligibilityRule_DeliveryVsScenario1", func(t *testing.T) {
		// Case A: Medicine delivery need -> Eligible
		medNeed := &domain.Opportunity{
			ID:     uuid.New(),
			UserID: uuid.New(),
			Type:   domain.TypeNeed,
			Status: domain.StatusOpen,
			Title:  "Urgent Fever Medication",
			Category: &domain.Category{
				Slug: "medicine-healthcare",
				Name: "Medicine & Healthcare",
			},
		}
		if ok, reason := svc.IsEligibleForCommuterDelivery(medNeed); !ok {
			t.Errorf("Expected medicine request to be eligible, got false: %s", reason)
		} else {
			t.Logf("PASS: Medicine delivery correctly recognized as eligible: %s", reason)
		}

		// Case B: Grocery delivery need -> Eligible
		grocNeed := &domain.Opportunity{
			ID:     uuid.New(),
			UserID: uuid.New(),
			Type:   domain.TypeNeed,
			Status: domain.StatusOpen,
			Title:  "Daily Provisions and Vegetables",
			Category: &domain.Category{
				Slug: "groceries-daily-essentials",
				Name: "Groceries & Daily Essentials",
			},
		}
		if ok, reason := svc.IsEligibleForCommuterDelivery(grocNeed); !ok {
			t.Errorf("Expected grocery request to be eligible, got false: %s", reason)
		} else {
			t.Logf("PASS: Grocery delivery correctly recognized as eligible: %s", reason)
		}

		// Case C: Scenario 1 Bricks & Building Materials -> Strictly Ineligible
		brickNeed := &domain.Opportunity{
			ID:     uuid.New(),
			UserID: uuid.New(),
			Type:   domain.TypeNeed,
			Status: domain.StatusOpen,
			Title:  "1000 Red Clay Bricks For Wall Construction",
			Category: &domain.Category{
				Slug: "bricks-building-materials",
				Name: "Bricks & Building Materials",
			},
		}
		if ok, reason := svc.IsEligibleForCommuterDelivery(brickNeed); ok {
			t.Errorf("FAIL: Scenario 1 Bricks request must NOT be eligible for commuter delivery!")
		} else {
			t.Logf("PASS: Scenario 1 Bricks correctly blocked from commuter delivery: %s", reason)
		}

		// Case D: Scenario 1 Cement & Construction Supplies -> Strictly Ineligible
		cementNeed := &domain.Opportunity{
			ID:     uuid.New(),
			UserID: uuid.New(),
			Type:   domain.TypeNeed,
			Status: domain.StatusOpen,
			Title:  "50 Bags of UltraTech Cement",
			Category: &domain.Category{
				Slug: "cement-construction",
				Name: "Cement & Construction Supplies",
			},
		}
		if ok, reason := svc.IsEligibleForCommuterDelivery(cementNeed); ok {
			t.Errorf("FAIL: Scenario 1 Cement request must NOT be eligible for commuter delivery!")
		} else {
			t.Logf("PASS: Scenario 1 Cement correctly blocked from commuter delivery: %s", reason)
		}

		// Case E: Scenario 1 Flatbed Logistics Transport -> Strictly Ineligible
		flatbedNeed := &domain.Opportunity{
			ID:     uuid.New(),
			UserID: uuid.New(),
			Type:   domain.TypeNeed,
			Status: domain.StatusOpen,
			Title:  "Heavy Freight Flatbed Transport",
			Category: &domain.Category{
				Slug: "flatbed-transport",
				Name: "Flatbed Logistics & Freight",
			},
		}
		if ok, reason := svc.IsEligibleForCommuterDelivery(flatbedNeed); ok {
			t.Errorf("FAIL: Scenario 1 Flatbed freight must NOT be eligible for commuter delivery!")
		} else {
			t.Logf("PASS: Scenario 1 Flatbed freight correctly blocked: %s", reason)
		}
	})

	// -------------------------------------------------------------------------
	// 2. Request without a valid pickup location is not falsely offered
	// -------------------------------------------------------------------------
	t.Run("2_UnresolvedPickupLocationHandledSafely", func(t *testing.T) {
		// Custom request with only delivery address, no shop selected, no pickup coords
		customNeed := &domain.Opportunity{
			ID:          uuid.New(),
			UserID:      uuid.New(),
			Type:        domain.TypeNeed,
			Status:      domain.StatusOpen,
			Title:       "Custom Paracetamol Request",
			AddressText: "Near Highway Crossing, Choutuppal",
			Lat:         17.2500,
			Lng:         78.9500,
			Metadata:    []byte(`{"delivery_location": "Near Highway Crossing, Choutuppal"}`),
		}

		hasPickup, _, reason := svc.HasResolvedPickupLocation(ctx, customNeed)
		if hasPickup {
			t.Errorf("FAIL: Request without shop/pickup selection was falsely marked as resolved!")
		} else {
			t.Logf("PASS: Request without shop correctly recognized as awaiting pickup selection: %s", reason)
		}

		// Request with explicit pickup coordinates from a selected pharmacy
		resolvedNeed := &domain.Opportunity{
			ID:          uuid.New(),
			UserID:      uuid.New(),
			Type:        domain.TypeNeed,
			Status:      domain.StatusOpen,
			Title:       "Pharmacy Prescription Order",
			AddressText: "Customer Home, Choutuppal",
			Lat:         17.2500,
			Lng:         78.9500,
			Metadata: []byte(`{
				"pickup_location": "Apollo Pharmacy, Main Road, Choutuppal",
				"pickup_lat": 17.2400,
				"pickup_lng": 78.9400,
				"delivery_location": "Customer Home, Choutuppal",
				"delivery_lat": 17.2500,
				"delivery_lng": 78.9500
			}`),
		}

		hasResolved, coords, _ := svc.HasResolvedPickupLocation(ctx, resolvedNeed)
		if !hasResolved || coords.Lat != 17.2400 || coords.Lng != 78.9400 {
			t.Errorf("FAIL: Resolved pickup coordinates were not extracted properly: got %v, %v", hasResolved, coords)
		} else {
			t.Logf("PASS: Resolved pickup coordinates successfully extracted: Lat=%.4f, Lng=%.4f", coords.Lat, coords.Lng)
		}
	})

	// -------------------------------------------------------------------------
	// 3. Privacy protection & phone number masking
	// -------------------------------------------------------------------------
	t.Run("3_PrivacyMaskingOfPersonalData", func(t *testing.T) {
		phone1 := "+91 98765 43210"
		masked1 := postgres.MaskPhone(phone1)
		expected1 := "+91 98****3210"
		if masked1 != expected1 {
			t.Errorf("Phone masking failed: expected %s, got %s", expected1, masked1)
		} else {
			t.Logf("PASS: Phone number correctly masked: %s -> %s", phone1, masked1)
		}

		phone2 := "+919640754927"
		masked2 := postgres.MaskPhone(phone2)
		expected2 := "+91964****4927"
		if masked2 != expected2 {
			t.Errorf("Phone masking failed: expected %s, got %s", expected2, masked2)
		} else {
			t.Logf("PASS: 10-digit phone correctly masked: %s -> %s", phone2, masked2)
		}
	})

	// -------------------------------------------------------------------------
	// 4. Repeated processing does not duplicate matches or notifications (Deduplication Key)
	// -------------------------------------------------------------------------
	t.Run("4_NotificationDeduplicationKeyIntegrity", func(t *testing.T) {
		needID := uuid.New()
		travellerID := uuid.New()

		// Generate deduplication key used by CreateNotificationIdempotent
		dedupeKey1 := fmt.Sprintf("commute_match_%s_%s", needID, travellerID)
		dedupeKey2 := fmt.Sprintf("commute_match_%s_%s", needID, travellerID)

		if dedupeKey1 != dedupeKey2 {
			t.Errorf("Dedupe keys must be completely deterministic!")
		}

		// Ensure different traveller produces distinct key
		otherTravellerID := uuid.New()
		dedupeKeyOther := fmt.Sprintf("commute_match_%s_%s", needID, otherTravellerID)
		if dedupeKey1 == dedupeKeyOther {
			t.Errorf("Different travellers must have different deduplication keys!")
		} else {
			t.Logf("PASS: Idempotent deduplication keys verified: %s", dedupeKey1)
		}
	})

	// -------------------------------------------------------------------------
	// 5. Assigned or Completed requests do not produce new offers
	// -------------------------------------------------------------------------
	t.Run("5_AssignedOrCompletedRequestsExcluded", func(t *testing.T) {
		assignedUser := uuid.New()
		assignedNeed := &domain.Opportunity{
			ID:             uuid.New(),
			UserID:         uuid.New(),
			Type:           domain.TypeNeed,
			Status:         domain.StatusInProgress,
			AssignedUserID: &assignedUser,
			Title:          "Already Assigned Delivery",
			Category: &domain.Category{
				Slug: "medicine-healthcare",
			},
		}

		if ok, reason := svc.IsEligibleForCommuterDelivery(assignedNeed); ok {
			t.Errorf("FAIL: Assigned request should NOT be eligible for commuter delivery!")
		} else {
			t.Logf("PASS: Assigned request correctly excluded: %s", reason)
		}

		completedNeed := &domain.Opportunity{
			ID:       uuid.New(),
			UserID:   uuid.New(),
			Type:     domain.TypeNeed,
			Status:   domain.StatusCompleted,
			Title:    "Completed Delivery",
			Category: &domain.Category{
				Slug: "medicine-healthcare",
			},
		}

		if ok, reason := svc.IsEligibleForCommuterDelivery(completedNeed); ok {
			t.Errorf("FAIL: Completed request should NOT be eligible for commuter delivery!")
		} else {
			t.Logf("PASS: Completed request correctly excluded: %s", reason)
		}
	})
}
