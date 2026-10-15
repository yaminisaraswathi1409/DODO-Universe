-- Migration 000015: Add resource_requirements JSONB column to categories table & seed defaults

ALTER TABLE categories 
ADD COLUMN IF NOT EXISTS resource_requirements JSONB DEFAULT '{"vehicle": "OPTIONAL", "driver": "OPTIONAL"}'::jsonb;

-- Seed default resource requirements
-- 1. Building & Construction materials (Bricks, Cement, Equipment): Vehicle & Driver Optional
UPDATE categories
SET resource_requirements = '{"vehicle": "OPTIONAL", "driver": "OPTIONAL", "labour": "NOT_APPLICABLE"}'::jsonb
WHERE slug IN ('bricks-building-materials', 'cement-construction', 'equipment-machinery');

-- 2. Logistics & Transport: Vehicle & Driver Required
UPDATE categories
SET resource_requirements = '{"vehicle": "REQUIRED", "driver": "REQUIRED", "labour": "NOT_APPLICABLE"}'::jsonb
WHERE slug IN ('logistics-transport', 'flatbed-transport', 'commercial-driver');

-- 3. Non-vehicle services (Labour, Home Services, Plumbing, Medicine, Tutoring, Repair): Vehicle & Driver Not Applicable
UPDATE categories
SET resource_requirements = '{"vehicle": "NOT_APPLICABLE", "driver": "NOT_APPLICABLE", "labour": "NOT_APPLICABLE"}'::jsonb
WHERE slug IN ('labour-services', 'construction-labour', 'farm-labour', 'home-services', 'medicine-healthcare', 'education-tutoring', 'vehicle-repair', 'roadside-repair', 'auto-parts-procurement');
