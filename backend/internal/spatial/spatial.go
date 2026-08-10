package spatial

import (
	"fmt"
	"math"
)

// Coordinates represents a WGS84 lat/lng pair
type Coordinates struct {
	Lat float64 `json:"lat"`
	Lng float64 `json:"lng"`
}

// ToPostGISPoint returns a PostGIS ST_MakePoint WKT or SQL fragment
func ToPostGISPoint(lat, lng float64) string {
	return fmt.Sprintf("ST_SetSRID(ST_MakePoint(%f, %f), 4326)::geography", lng, lat)
}

// HaversineDistance calculates approximate distance in meters between two lat/lng points in Go
func HaversineDistance(c1, c2 Coordinates) float64 {
	const earthRadius = 6371000 // meters

	lat1 := c1.Lat * math.Pi / 180
	lat2 := c2.Lat * math.Pi / 180
	deltaLat := (c2.Lat - c1.Lat) * math.Pi / 180
	deltaLng := (c2.Lng - c1.Lng) * math.Pi / 180

	a := math.Sin(deltaLat/2)*math.Sin(deltaLat/2) +
		math.Cos(lat1)*math.Cos(lat2)*
			math.Sin(deltaLng/2)*math.Sin(deltaLng/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))

	return earthRadius * c
}
