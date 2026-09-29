-- Migration 000018: Add vendor catalog items & opportunity order mode
CREATE TABLE IF NOT EXISTS vendor_catalog_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_asset_id UUID REFERENCES user_skills_assets(id) ON DELETE CASCADE,
    vendor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    sku VARCHAR(100),
    unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    price_unit VARCHAR(50) DEFAULT 'PER_PIECE',
    stock_quantity INT DEFAULT 1000,
    min_order_quantity INT DEFAULT 1,
    images JSONB DEFAULT '[]'::jsonb,
    attributes JSONB DEFAULT '{}'::jsonb,
    is_available BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendor_catalog_vendor_user ON vendor_catalog_items(vendor_user_id);
CREATE INDEX IF NOT EXISTS idx_vendor_catalog_category ON vendor_catalog_items(category_id);
CREATE INDEX IF NOT EXISTS idx_vendor_catalog_available ON vendor_catalog_items(is_available);

-- Extend opportunities table with order_mode and catalog order tracking
ALTER TABLE opportunities 
ADD COLUMN IF NOT EXISTS order_mode VARCHAR(50) DEFAULT 'GENERAL_BROADCAST',
ADD COLUMN IF NOT EXISTS target_vendor_id UUID REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS catalog_item_id UUID REFERENCES vendor_catalog_items(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS quantity NUMERIC(12, 2) DEFAULT 1.00,
ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12, 2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS total_price NUMERIC(12, 2) DEFAULT 0.00;

CREATE INDEX IF NOT EXISTS idx_opportunities_order_mode ON opportunities(order_mode);
CREATE INDEX IF NOT EXISTS idx_opportunities_target_vendor ON opportunities(target_vendor_id);
