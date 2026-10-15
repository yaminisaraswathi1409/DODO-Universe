-- Migration 000020: Extend vendor_catalog_items with approval status, rejection reason, and PostGIS pickup location

ALTER TABLE vendor_catalog_items 
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'ACTIVE_IN_CATALOG',
ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
ADD COLUMN IF NOT EXISTS pickup_location GEOGRAPHY(Point, 4326),
ADD COLUMN IF NOT EXISTS pickup_address TEXT;

CREATE INDEX IF NOT EXISTS idx_vendor_catalog_status ON vendor_catalog_items(status);
CREATE INDEX IF NOT EXISTS idx_vendor_catalog_pickup_location ON vendor_catalog_items USING GIST(pickup_location);
