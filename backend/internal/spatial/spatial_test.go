package spatial

import (
	"math"
	"testing"
)

func TestHaversineDistance(t *testing.T) {
	// Choutuppal lat/lng (17.2513, 78.8973) to Hyderabad lat/lng (17.3850, 78.4867) ~48km
	c1 := Coordinates{Lat: 17.2513, Lng: 78.8973}
	c2 := Coordinates{Lat: 17.3850, Lng: 78.4867}

	dist := HaversineDistance(c1, c2)
	distKM := dist / 1000.0

	if math.Abs(distKM-48.0) > 10.0 {
		t.Errorf("Expected distance ~48km, got %f km", distKM)
	}
}

func TestToPostGISPoint(t *testing.T) {
	// PostGIS ST_MakePoint MUST take (longitude, latitude)
	lng := 78.8973
	lat := 17.2513
	str := ToPostGISPoint(lat, lng)
	expected := "ST_SetSRID(ST_MakePoint(78.897300, 17.251300), 4326)::geography"
	if str != expected {
		t.Errorf("Expected PostGIS string %s, got %s", expected, str)
	}
}

func TestPointToSegmentDistance(t *testing.T) {
	// Corridor from Lingotam (17.20, 78.90) to Choutuppal (17.25, 78.95)
	origin := Coordinates{Lat: 17.20, Lng: 78.90}
	dest := Coordinates{Lat: 17.25, Lng: 78.95}

	// 1. Point directly on midpoint of segment
	midPoint := Coordinates{Lat: 17.225, Lng: 78.925}
	distMid := PointToSegmentDistance(midPoint, origin, dest)
	if distMid > 10.0 { // should be virtually 0 meters
		t.Errorf("Expected point on segment to have distance ~0m, got %f m", distMid)
	}

	// 2. Point 2km perpendicularly off the corridor
	offPoint := Coordinates{Lat: 17.24, Lng: 78.91}
	distOff := PointToSegmentDistance(offPoint, origin, dest)
	if distOff < 1000.0 || distOff > 5000.0 {
		t.Errorf("Expected perpendicular distance ~2-3km, got %f m", distOff)
	}
}

func TestRouteProgressProjection(t *testing.T) {
	// Corridor from Origin to Destination (SW to NE)
	origin := Coordinates{Lat: 17.20, Lng: 78.90}
	dest := Coordinates{Lat: 17.30, Lng: 79.00}

	// Pickup near origin (20% along route)
	pickup := Coordinates{Lat: 17.22, Lng: 78.92}
	// Drop near destination (80% along route)
	drop := Coordinates{Lat: 17.28, Lng: 78.98}

	tP := RouteProgressProjection(pickup, origin, dest)
	tD := RouteProgressProjection(drop, origin, dest)

	if !(tD > tP) {
		t.Errorf("Expected forward trip to have tDrop (%f) > tPickup (%f)", tD, tP)
	}

	// Inverted/Wrong direction: Pickup at 80%, Drop at 20%
	if RouteProgressProjection(drop, origin, dest) < RouteProgressProjection(pickup, origin, dest) {
		t.Logf("PASS: Inverted trip correctly recognized as backward progression along corridor")
	}
}

func TestCalculateCommuteDetour(t *testing.T) {
	origin := Coordinates{Lat: 17.20, Lng: 78.90}
	dest := Coordinates{Lat: 17.30, Lng: 79.00}

	// Case 1: Stops are directly on the route line -> minimal added detour
	pOnLine := Coordinates{Lat: 17.23, Lng: 78.93}
	dOnLine := Coordinates{Lat: 17.27, Lng: 78.97}

	addedDetour, pCorr, dCorr := CalculateCommuteDetour(origin, dest, pOnLine, dOnLine)
	if addedDetour > 100.0 {
		t.Errorf("Expected added detour on straight path to be < 100m, got %f m", addedDetour)
	}
	if pCorr > 50.0 || dCorr > 50.0 {
		t.Errorf("Expected corridor offsets on line to be < 50m, got p=%f, d=%f", pCorr, dCorr)
	}

	// Case 2: Stops require a 10km detour out-of-the-way
	pWayOff := Coordinates{Lat: 17.35, Lng: 78.85} // North-West detour
	detourWayOff, pWayOffCorr, _ := CalculateCommuteDetour(origin, dest, pWayOff, dOnLine)
	if detourWayOff < 5000.0 {
		t.Errorf("Expected significant detour > 5000m for out-of-way stop, got %f m", detourWayOff)
	}
	if pWayOffCorr < 5000.0 {
		t.Errorf("Expected corridor distance > 5000m for out-of-way stop, got %f m", pWayOffCorr)
	}
}
