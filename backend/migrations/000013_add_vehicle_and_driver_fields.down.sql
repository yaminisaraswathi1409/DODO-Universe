-- Migration 000013 Down: Remove vehicle_fields and driver_fields columns

ALTER TABLE categories 
DROP COLUMN IF EXISTS vehicle_fields,
DROP COLUMN IF EXISTS driver_fields;
