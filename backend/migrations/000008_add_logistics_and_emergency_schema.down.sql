-- 000008_add_logistics_and_emergency_schema.down.sql

DROP TABLE IF EXISTS parts_inventory CASCADE;
DROP TABLE IF EXISTS escrow_ledger CASCADE;
DROP TABLE IF EXISTS incidents_telemetry CASCADE;
DROP TABLE IF EXISTS way_manifests CASCADE;
DROP TABLE IF EXISTS vehicle_driver_pairings CASCADE;
