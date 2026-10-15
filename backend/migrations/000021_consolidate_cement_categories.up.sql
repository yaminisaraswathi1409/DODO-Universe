-- Migration 000021: Consolidate duplicate cement categories
-- Merges legacy unconfigured 'cement-services' into canonical 'cement-construction' ('Cement & Construction Supplies')

-- 1. Merge required_documents from cement-services into cement-construction if cement-construction has empty documents
UPDATE categories
SET required_documents = COALESCE(
    (SELECT required_documents FROM categories WHERE slug = 'cement-services'),
    '[]'::jsonb
)
WHERE slug = 'cement-construction'
  AND (required_documents IS NULL OR jsonb_array_length(required_documents) = 0);

-- 2. Migrate all provider assets linked to cement-services to canonical cement-construction
UPDATE user_skills_assets
SET category_id = (SELECT id FROM categories WHERE slug = 'cement-construction'),
    asset_type = 'CEMENT_CONSTRUCTION',
    title = CASE 
        WHEN title = 'cement services' THEN 'Cement & Construction Supplies'
        WHEN title = 'cement services Service' THEN 'Cement & Construction Supplies Service'
        ELSE title 
    END,
    updated_at = NOW()
WHERE category_id = (SELECT id FROM categories WHERE slug = 'cement-services')
   OR asset_type = 'CEMENT_SERVICES';

-- 3. Migrate any opportunities linked to cement-services
UPDATE opportunities
SET category_id = (SELECT id FROM categories WHERE slug = 'cement-construction'),
    updated_at = NOW()
WHERE category_id = (SELECT id FROM categories WHERE slug = 'cement-services');

-- 4. Migrate any vendor catalog items linked to cement-services
UPDATE vendor_catalog_items
SET category_id = (SELECT id FROM categories WHERE slug = 'cement-construction'),
    updated_at = NOW()
WHERE category_id = (SELECT id FROM categories WHERE slug = 'cement-services');

-- 5. Delete duplicate legacy category record
DELETE FROM categories
WHERE slug = 'cement-services';
