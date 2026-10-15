-- Migration 000020 down: Rollback catalog extensions

DROP INDEX IF EXISTS idx_vendor_catalog_pickup_location;
DROP INDEX IF EXISTS idx_vendor_catalog_status;

ALTER TABLE vendor_catalog_items 
DROP COLUMN IF EXISTS pickup_address,
DROP COLUMN IF EXISTS pickup_location,
DROP COLUMN IF EXISTS rejection_reason,
DROP COLUMN IF EXISTS status;
