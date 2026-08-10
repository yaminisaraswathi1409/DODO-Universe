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
	str := ToPostGISPoint(17.2513, 78.8973)
	expected := "ST_SetSRID(ST_MakePoint(78.897300, 17.251300), 4326)::geography"
	if str != expected {
		t.Errorf("Expected PostGIS string %s, got %s", expected, str)
	}
}
