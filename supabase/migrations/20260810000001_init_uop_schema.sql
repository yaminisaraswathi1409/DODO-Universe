-- Enable PostGIS extension at the very top
CREATE EXTENSION IF NOT EXISTS postgis;

-- 1. Users Table (Unified identity: acts as both Customer and Provider)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    supabase_uid VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE,
    phone VARCHAR(50) UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    bio TEXT,
    location GEOGRAPHY(Point, 4326),
    address_text TEXT,
    trust_score NUMERIC(3, 2) DEFAULT 5.00 CHECK (trust_score >= 0 AND trust_score <= 5.00),
    is_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. User Skills & Assets Table (Vehicles, Equipment, Machinery, Services)
CREATE TABLE IF NOT EXISTS user_skills_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    asset_type VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    hourly_rate NUMERIC(10, 2),
    daily_rate NUMERIC(10, 2),
    is_available BOOLEAN DEFAULT TRUE,
    current_location GEOGRAPHY(Point, 4326),
    attributes JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Categories Table
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    icon VARCHAR(100),
    default_workflow VARCHAR(50) DEFAULT 'INSTANT',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Opportunities Table (Needs and Offers)
CREATE TABLE IF NOT EXISTS opportunities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('NEED', 'OFFER')),
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    workflow_model VARCHAR(50) NOT NULL DEFAULT 'INSTANT',
    status VARCHAR(50) NOT NULL DEFAULT 'OPEN',
    location GEOGRAPHY(Point, 4326) NOT NULL,
    address_text TEXT,
    radius_km NUMERIC(6, 2) DEFAULT 25.00,
    budget_min NUMERIC(12, 2),
    budget_max NUMERIC(12, 2),
    price_unit VARCHAR(50) DEFAULT 'FIXED',
    scheduled_start TIMESTAMPTZ,
    scheduled_end TIMESTAMPTZ,
    parent_opportunity_id UUID REFERENCES opportunities(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Opportunity Matches Table
CREATE TABLE IF NOT EXISTS opportunity_matches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opportunity_id UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
    matched_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'PROPOSED',
    match_score NUMERIC(5, 2) DEFAULT 0.00,
    distance_meters NUMERIC(10, 2),
    quote_amount NUMERIC(12, 2),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(opportunity_id, matched_user_id)
);

-- 6. Opportunity Chains Table (Multi-Layer Dependency Graph)
CREATE TABLE IF NOT EXISTS opportunity_chains (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_opportunity_id UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
    child_opportunity_id UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
    relationship_type VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(parent_opportunity_id, child_opportunity_id)
);

-- 7. Trust & Accountability Ratings Table
CREATE TABLE IF NOT EXISTS trust_ratings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opportunity_id UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
    rater_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ratee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating NUMERIC(3, 2) NOT NULL CHECK (rating >= 1.00 AND rating <= 5.00),
    review TEXT,
    on_time BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Spatial PostGIS GIST Indexes
CREATE INDEX IF NOT EXISTS idx_users_location ON users USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_user_skills_assets_location ON user_skills_assets USING GIST (current_location);
CREATE INDEX IF NOT EXISTS idx_opportunities_location ON opportunities USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_opportunities_status_type ON opportunities (status, type);
CREATE INDEX IF NOT EXISTS idx_opportunities_parent ON opportunities (parent_opportunity_id);

-- Default Seed Categories for UOP
INSERT INTO categories (slug, name, description, icon, default_workflow) VALUES
('agriculture-farming', 'Agriculture & Farming', 'Tractor rental, rotavator, harvesters, seeds, farm labor', 'Tractor', 'SCHEDULED'),
('logistics-transport', 'Logistics & Transport', 'Goods transport, pickup truck, delivery, driver hire', 'Truck', 'INSTANT'),
('equipment-machinery', 'Equipment & Machinery', 'Construction equipment, tools, generator rental', 'Wrench', 'RENTAL'),
('home-services', 'Home Services & Repair', 'Electrician, plumber, carpenter, painter, cleaning', 'Home', 'INSTANT'),
('medicine-healthcare', 'Medicine & Healthcare', 'Medicine delivery, medical care, lab sample pickup', 'HeartPulse', 'INSTANT'),
('education-tutoring', 'Education & Skill Tuition', 'Home tuition, math teacher, vocational training', 'BookOpen', 'SCHEDULED')
ON CONFLICT (slug) DO NOTHING;
