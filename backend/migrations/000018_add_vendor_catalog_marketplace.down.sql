ALTER TABLE opportunities 
DROP COLUMN IF EXISTS order_mode,
DROP COLUMN IF EXISTS target_vendor_id,
DROP COLUMN IF EXISTS catalog_item_id,
DROP COLUMN IF EXISTS quantity,
DROP COLUMN IF EXISTS unit_price,
DROP COLUMN IF EXISTS total_price;

DROP TABLE IF EXISTS vendor_catalog_items CASCADE;
