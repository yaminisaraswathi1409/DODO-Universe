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

// PointToSegmentDistance calculates the shortest distance in meters from point P
// to the line segment between points A (origin) and B (destination).
func PointToSegmentDistance(p, a, b Coordinates) float64 {
	segLen := HaversineDistance(a, b)
	if segLen < 1.0 { // Virtually identical start and end points
		return HaversineDistance(p, a)
	}

	// Projected equirectangular planar coordinates for accurate local corridor distance
	midLat := (a.Lat + b.Lat) * math.Pi / 360.0
	cosMid := math.Cos(midLat)

	dx := (b.Lng - a.Lng) * cosMid
	dy := b.Lat - a.Lat

	px := (p.Lng - a.Lng) * cosMid
	py := p.Lat - a.Lat

	denom := dx*dx + dy*dy
	if denom < 1e-12 {
		return HaversineDistance(p, a)
	}

	t := (px*dx + py*dy) / denom
	if t <= 0.0 {
		return HaversineDistance(p, a)
	}
	if t >= 1.0 {
		return HaversineDistance(p, b)
	}

	// Projected point along segment
	proj := Coordinates{
		Lat: a.Lat + t*(b.Lat-a.Lat),
		Lng: a.Lng + t*(b.Lng-a.Lng),
	}
	return HaversineDistance(p, proj)
}

// RouteProgressProjection calculates scalar projection parameter t of point P
// along the vector from A (origin) to B (destination).
// t = 0 corresponds to A, t = 1 corresponds to B.
// Values where t(Drop) > t(Pickup) confirm movement along the traveller's travel direction.
func RouteProgressProjection(p, a, b Coordinates) float64 {
	midLat := (a.Lat + b.Lat) * math.Pi / 360.0
	cosMid := math.Cos(midLat)

	dx := (b.Lng - a.Lng) * cosMid
	dy := b.Lat - a.Lat

	px := (p.Lng - a.Lng) * cosMid
	py := p.Lat - a.Lat

	denom := dx*dx + dy*dy
	if denom < 1e-12 {
		return 0.0
	}
	return (px*dx + py*dy) / denom
}

// CalculateCommuteDetour calculates the added detour distance in meters:
// Detour = (dist(O, P) + dist(P, Drop) + dist(Drop, D)) - dist(O, D)
// Returns added detour (>= 0), pickup corridor distance, and dropoff corridor distance.
func CalculateCommuteDetour(origin, dest, pickup, drop Coordinates) (addedDetourMeters float64, pickupCorridorDist float64, dropCorridorDist float64) {
	directDist := HaversineDistance(origin, dest)
	routeWithDelivery := HaversineDistance(origin, pickup) + HaversineDistance(pickup, drop) + HaversineDistance(drop, dest)
	addedDetour := routeWithDelivery - directDist
	if addedDetour < 0 {
		addedDetour = 0
	}

	pickupCorridor := PointToSegmentDistance(pickup, origin, dest)
	dropCorridor := PointToSegmentDistance(drop, origin, dest)

	return addedDetour, pickupCorridor, dropCorridor
}
