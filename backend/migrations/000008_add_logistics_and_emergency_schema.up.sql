-- 000008_add_logistics_and_emergency_schema.up.sql
-- Migration for Scenario 1: Multi-Layer Connected Logistics & Emergency Recovery

-- 1. Ensure new categories exist for logistics and roadside emergency cascades
INSERT INTO categories (slug, name, description, icon, default_workflow) VALUES
('flatbed-transport', 'Flatbed Logistics & Freight', 'Long-haul flatbed truck transport for heavy goods', 'Truck', 'INSTANT'),
('commercial-driver', 'Commercial Driver Placement', 'On-demand commercial vehicle drivers', 'UserCheck', 'INSTANT'),
('roadside-repair', 'Emergency Roadside Repair', 'On-demand mobile mechanics for vehicle breakdowns', 'Wrench', 'INSTANT'),
('auto-parts-procurement', 'Auto Parts Procurement', 'Vehicle spare parts and hardware procurement', 'Package', 'INSTANT')
ON CONFLICT (slug) DO NOTHING;

-- 2. Vehicle-Driver Pairings Table
CREATE TABLE IF NOT EXISTS vehicle_driver_pairings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID NOT NULL REFERENCES user_skills_assets(id) ON DELETE CASCADE,
    driver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    license_number VARCHAR(100),
    license_class VARCHAR(50) DEFAULT 'CLASS-A',
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Digital Way Manifests & Verification Table (PoL & PoD)
CREATE TABLE IF NOT EXISTS way_manifests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opportunity_id UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
    vehicle_id UUID REFERENCES user_skills_assets(id) ON DELETE SET NULL,
    driver_id UUID REFERENCES users(id) ON DELETE SET NULL,
    manifest_number VARCHAR(100) UNIQUE NOT NULL,
    routing_barcode VARCHAR(255) NOT NULL,
    pol_photo_url TEXT,
    pol_captured_at TIMESTAMPTZ,
    pod_qr_code VARCHAR(255),
    pod_signature_url TEXT,
    pod_captured_at TIMESTAMPTZ,
    status VARCHAR(50) NOT NULL DEFAULT 'GENERATED',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Incidents & Vehicle Telemetry Table
CREATE TABLE IF NOT EXISTS incidents_telemetry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opportunity_id UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
    reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    incident_type VARCHAR(100) NOT NULL,
    description TEXT,
    location GEOGRAPHY(Point, 4326),
    address_text TEXT,
    telemetry_data JSONB DEFAULT '{}'::jsonb,
    is_no_movement_alert BOOLEAN DEFAULT FALSE,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Multi-Tier Escrow Ledger Table
CREATE TABLE IF NOT EXISTS escrow_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    root_opportunity_id UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
    opportunity_id UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
    payer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    payee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount NUMERIC(12, 2) NOT NULL,
    escrow_type VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'HELD',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Parts Inventory Table
CREATE TABLE IF NOT EXISTS parts_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shop_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    part_number VARCHAR(100) NOT NULL,
    part_name VARCHAR(255) NOT NULL,
    description TEXT,
    stock_quantity INT NOT NULL DEFAULT 0,
    unit_price NUMERIC(12, 2) NOT NULL,
    location GEOGRAPHY(Point, 4326),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Spatial & Lookup Indexes
CREATE INDEX IF NOT EXISTS idx_vehicle_driver_pairings_driver ON vehicle_driver_pairings(driver_id);
CREATE INDEX IF NOT EXISTS idx_way_manifests_opp ON way_manifests(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_incidents_opp ON incidents_telemetry(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_escrow_root_opp ON escrow_ledger(root_opportunity_id);
CREATE INDEX IF NOT EXISTS idx_parts_inventory_part ON parts_inventory(part_number);
