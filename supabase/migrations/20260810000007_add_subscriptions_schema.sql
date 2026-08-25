-- Supabase Migration: Add Dynamic Subscription Packages & User Subscriptions Schema for Scenario 2
-- Version: 20260810000007

CREATE TABLE IF NOT EXISTS subscription_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_type VARCHAR(50) NOT NULL,
    package_name JSONB NOT NULL,
    package_desc JSONB NOT NULL,
    price_cents INTEGER NOT NULL DEFAULT 0,
    billing_cycle VARCHAR(20) NOT NULL DEFAULT 'MONTHLY',
    request_limit INTEGER NOT NULL DEFAULT 10,
    commission_pct NUMERIC(5, 2) DEFAULT 0.00,
    is_active BOOLEAN DEFAULT TRUE,
    target_demographics JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    package_id UUID NOT NULL REFERENCES subscription_packages(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
    cycle_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cycle_end TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
    units_used INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscription_packages_role ON subscription_packages(role_type);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_status ON user_subscriptions(user_id, status);

INSERT INTO subscription_packages (id, role_type, package_name, package_desc, price_cents, billing_cycle, request_limit, commission_pct, is_active, target_demographics)
VALUES
(
    'a1b2c3d4-0001-4000-8000-000000000001',
    'SEEKER',
    '{"en": "Village Elder Essential Care Plan", "te": "గ్రామీణ వయోవృద్ధుల అత్యవసర రక్షణ ప్రణాళిక"}'::jsonb,
    '{"en": "Free essential medicine & grocery delivery for senior citizens in rural areas (up to 10 deliveries/month).", "te": "గ్రామీణ వృద్ధులకు ప్రతినెల 10 ఉచిత మందులు మరియు సరుకుల రవాణా సౌకర్యం."}'::jsonb,
    0,
    'MONTHLY',
    10,
    0.00,
    TRUE,
    '{"min_age": 60, "location_tags": ["rural", "lingotam"]}'::jsonb
),
(
    'a1b2c3d4-0002-4000-8000-000000000002',
    'PROVIDER',
    '{"en": "Village Commuter Earning Pack", "te": "గ్రామీణ ప్రయాణీకుల సంపాదన ప్యాక్"}'::jsonb,
    '{"en": "Monetize daily commute route with up to 30 micro-deliveries or passenger matches per month (5% platform fee).", "te": "రోజువారీ ప్రయాణాల్లో ప్రతినెల 30 మైక్రో-డెలివరీల ద్వారా ఆదాయం పొందండి."}'::jsonb,
    5000,
    'MONTHLY',
    30,
    5.00,
    TRUE,
    '{"vehicle_types": ["bike", "auto", "tractor"], "location_tags": ["lingotam", "choutuppal"]}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
    package_name = EXCLUDED.package_name,
    package_desc = EXCLUDED.package_desc,
    price_cents = EXCLUDED.price_cents,
    request_limit = EXCLUDED.request_limit;

INSERT INTO categories (id, slug, name, description, icon, default_workflow)
VALUES
    (gen_random_uuid(), 'essential-medicine-delivery', 'Essential Medicine Delivery', 'Doorstep medicine procurement and rural micro-logistics', 'Pill', 'MULTI_LAYER'),
    (gen_random_uuid(), 'commuter-micro-logistics', 'Commuter Micro-Logistics', 'Opportunistic delivery matching for daily village commuters', 'Truck', 'INSTANT')
ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name;
