-- Migration 000019: Add vendor delivery rules table
CREATE TABLE IF NOT EXISTS vendor_delivery_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
    vendor_asset_id UUID REFERENCES user_skills_assets(id) ON DELETE CASCADE,
    catalog_item_id UUID REFERENCES vendor_catalog_items(id) ON DELETE CASCADE,
    max_service_radius_km NUMERIC(8, 2) DEFAULT 50.00,
    min_distance_km NUMERIC(8, 2) NOT NULL DEFAULT 0.00,
    max_distance_km NUMERIC(8, 2) NOT NULL DEFAULT 10.00,
    delivery_fee NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vdr_vendor_user ON vendor_delivery_rules(vendor_user_id);
CREATE INDEX IF NOT EXISTS idx_vdr_category ON vendor_delivery_rules(category_id);
CREATE INDEX IF NOT EXISTS idx_vdr_asset ON vendor_delivery_rules(vendor_asset_id);
CREATE INDEX IF NOT EXISTS idx_vdr_item ON vendor_delivery_rules(catalog_item_id);
