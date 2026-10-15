-- Migration 000017: Add related_services JSONB column to categories table & seed default relationships

ALTER TABLE categories 
ADD COLUMN IF NOT EXISTS related_services JSONB DEFAULT '[]'::jsonb;

-- Seed default related service suggestions for existing categories
-- 1. Bricks: Suggest Transport & Labour
UPDATE categories
SET related_services = jsonb_build_array(
  jsonb_build_object(
    'id', 'rel_bricks_transport',
    'target_category_slug', 'logistics-transport',
    'title', 'Transport Vehicle',
    'description', 'Arrange a 10-Wheeler Tipper or Truck to deliver bricks to your site',
    'display_order', 1,
    'enabled', true,
    'prompt', 'Need transport to deliver your bricks?'
  ),
  jsonb_build_object(
    'id', 'rel_bricks_labour',
    'target_category_slug', 'labour-services',
    'title', 'Unloading Labour',
    'description', 'Hire skilled helpers for manual brick unloading and stacking',
    'display_order', 2,
    'enabled', true,
    'prompt', 'Need helpers for unloading at site?'
  )
)
WHERE slug IN ('bricks-building-materials');

-- 2. Cement: Suggest Transport & Labour
UPDATE categories
SET related_services = jsonb_build_array(
  jsonb_build_object(
    'id', 'rel_cement_transport',
    'target_category_slug', 'logistics-transport',
    'title', 'Transport Vehicle',
    'description', 'Book a flatbed or mini truck to transport cement bags',
    'display_order', 1,
    'enabled', true,
    'prompt', 'Need transport to ship cement bags?'
  ),
  jsonb_build_object(
    'id', 'rel_cement_labour',
    'target_category_slug', 'labour-services',
    'title', 'Loading & Unloading Labour',
    'description', 'Book helpers for loading/unloading cement bags',
    'display_order', 2,
    'enabled', true,
    'prompt', 'Need helpers for cement loading?'
  )
)
WHERE slug IN ('cement-construction');

-- 3. Equipment & Machinery: Suggest Transport
UPDATE categories
SET related_services = jsonb_build_array(
  jsonb_build_object(
    'id', 'rel_equipment_transport',
    'target_category_slug', 'flatbed-transport',
    'title', 'Heavy Machinery Flatbed Transport',
    'description', 'Book flatbed low-boy trailer to transport machinery',
    'display_order', 1,
    'enabled', true,
    'prompt', 'Need low-boy flatbed transport?'
  )
)
WHERE slug IN ('equipment-machinery');
