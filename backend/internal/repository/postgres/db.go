package postgres

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type DB struct {
	Pool *pgxpool.Pool
}

func NewPostgresDB(ctx context.Context, databaseURL string) (*DB, error) {
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("unable to parse database config: %w", err)
	}

	// Disable prepared statement caching for compatibility with Supabase pgBouncer Pooler
	config.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol

	config.MaxConns = 25
	config.MinConns = 5
	config.MaxConnLifetime = 30 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("unable to connect to postgres: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("unable to ping postgres database: %w", err)
	}

	log.Println("Successfully connected to Supabase PostgreSQL database via pgx/v5 pool (Simple Protocol mode)")

	// Apply automatic schema updates to guarantee table column consistency across all DB instances
	autoMigrateQueries := []string{
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'PENDING';`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'USER';`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS mobile_verified BOOLEAN DEFAULT FALSE;`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_code VARCHAR(10);`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMPTZ;`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS face_verified BOOLEAN DEFAULT FALSE;`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS face_verified_at TIMESTAMPTZ;`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS face_verification_ref TEXT;`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS invited_by UUID;`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS invited_at TIMESTAMPTZ;`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS aadhaar_number VARCHAR(20);`,
		`ALTER TABLE categories ADD COLUMN IF NOT EXISTS required_documents JSONB DEFAULT '[]'::jsonb;`,
		`ALTER TABLE categories ADD COLUMN IF NOT EXISTS opportunity_fields JSONB DEFAULT '[]'::jsonb;`,
		`ALTER TABLE user_skills_assets ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'PENDING_APPROVAL';`,
		`ALTER TABLE user_skills_assets ADD COLUMN IF NOT EXISTS rejection_reason TEXT;`,
		`ALTER TABLE user_skills_assets ADD COLUMN IF NOT EXISTS documents JSONB DEFAULT '{}'::jsonb;`,
		`ALTER TABLE user_skills_assets ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id) ON DELETE SET NULL;`,
		`CREATE INDEX IF NOT EXISTS idx_user_skills_assets_status ON user_skills_assets(status);`,
		`CREATE INDEX IF NOT EXISTS idx_user_skills_assets_category ON user_skills_assets(category_id);`,
		`UPDATE categories SET required_documents = '[
  {"key": "registration_number", "label": "Tractor / Vehicle Registration Number", "description": "Official state transport registration number", "type": "text", "required": true},
  {"key": "rc_document_pdf", "label": "Vehicle RC / Ownership Certificate (PDF)", "description": "Scanned copy of RC certificate (PDF format)", "type": "pdf", "required": true, "allowed_file_types": ["application/pdf"], "max_file_size_mb": 15},
  {"key": "tractor_photos", "label": "Tractor & Attachment Photos", "description": "High quality photos of tractor and rotavator", "type": "multi_image", "required": true, "allowed_file_types": ["image/jpeg", "image/png", "image/webp"], "max_files": 4},
  {"key": "working_demo_video", "label": "Field Operation Demo Video", "description": "Short video showing tractor in working operation (MP4/WEBM)", "type": "video", "required": false, "allowed_file_types": ["video/mp4", "video/webm"], "max_file_size_mb": 50}
]'::jsonb WHERE slug = 'agriculture-farming' AND (required_documents IS NULL OR required_documents = '[]'::jsonb);`,
		`UPDATE categories SET required_documents = '[
  {"key": "trade_license_number", "label": "Trade License / Skill ID Number", "description": "Government or municipal trade license ID", "type": "text", "required": true},
  {"key": "experience_years", "label": "Years of Active Experience", "description": "Total years performing field repairs", "type": "number", "required": true},
  {"key": "specialization_service", "label": "Primary Service Specialization", "description": "Select core skill specialty", "type": "select", "required": true, "options": ["Residential Plumbing & Wiring", "Commercial Industrial Electrician", "Carpentry & Furniture Fitting", "Painting & Waterproofing"]},
  {"key": "certificate_pdf", "label": "Trade Certificate / ID Proof (PDF)", "description": "Upload trade certificate or government ID proof", "type": "pdf", "required": true, "allowed_file_types": ["application/pdf"]},
  {"key": "work_samples_photos", "label": "Past Work Sample Photos", "description": "Photos of completed wiring, plumbing, or painting projects", "type": "multi_image", "required": true, "allowed_file_types": ["image/jpeg", "image/png", "image/webp"], "max_files": 5}
]'::jsonb WHERE slug = 'home-services' AND (required_documents IS NULL OR required_documents = '[]'::jsonb);`,
		`UPDATE categories SET required_documents = '[
  {"key": "driving_license_no", "label": "Commercial Transport DL Number", "description": "Valid commercial driving license number", "type": "text", "required": true},
  {"key": "vehicle_type", "label": "Transport Vehicle Category", "description": "Choose your transport vehicle type", "type": "select", "required": true, "options": ["Pickup Truck (1.5 Ton)", "Heavy Goods Truck (10 Ton)", "Container Delivery Van", "Three-Wheeler Goods Auto"]},
  {"key": "dl_photo", "label": "Driving License Document Photo", "description": "Front & back photo of commercial license", "type": "image", "required": true},
  {"key": "vehicle_rc_pdf", "label": "Transport Permit & Vehicle RC (PDF)", "description": "Upload transport permit document", "type": "pdf", "required": true}
]'::jsonb WHERE slug = 'logistics-transport' AND (required_documents IS NULL OR required_documents = '[]'::jsonb);`,
		`UPDATE categories SET opportunity_fields = '[
  {"key": "quantity", "label": "Quantity", "type": "number", "required": true, "placeholder": "e.g. 10000"},
  {"key": "unit", "label": "Unit Type", "type": "select", "required": true, "options": ["Red Bricks", "Fly Ash Bricks", "Cement Bags", "Tons", "Items"]},
  {"key": "pickup_location", "label": "Pickup Yard / Address", "type": "location", "required": true, "placeholder": "e.g. Choutuppal Yard"},
  {"key": "destination_location", "label": "Delivery Destination", "type": "location", "required": true, "placeholder": "e.g. Construction Site 4B"},
  {"key": "required_date", "label": "Required Date & Time", "type": "datetime", "required": true},
  {"key": "budget_amount", "label": "Estimated Budget / Rate (₹)", "type": "number", "required": false, "placeholder": "e.g. 50000"}
]'::jsonb WHERE slug IN ('logistics-transport', 'flatbed-transport', 'construction-material') AND (opportunity_fields IS NULL OR opportunity_fields = '[]'::jsonb);`,
		`UPDATE categories SET opportunity_fields = '[
  {"key": "vehicle_type", "label": "Vehicle Type Required", "type": "select", "required": true, "options": ["Tata 12-Wheeler", "Flatbed 15-Ton", "Pickup Truck (1.5T)", "Container Van"]},
  {"key": "license_class", "label": "License Class", "type": "select", "required": true, "options": ["Class-A Commercial", "Heavy Motor Vehicle (HMV)", "Medium HMV"]},
  {"key": "operating_route", "label": "Route / Operating Radius", "type": "text", "required": true, "placeholder": "e.g. NH65 Choutuppal to Hyderabad"},
  {"key": "availability", "label": "Availability", "type": "select", "required": true, "options": ["Immediate / On-Demand", "Day Shift", "Outstation"]}
]'::jsonb WHERE slug = 'commercial-driver' AND (opportunity_fields IS NULL OR opportunity_fields = '[]'::jsonb);`,
		`UPDATE categories SET opportunity_fields = '[
  {"key": "equipment_type", "label": "Vehicle / Machinery Type", "type": "text", "required": true, "placeholder": "e.g. Tata 12-Wheeler Truck"},
  {"key": "problem_description", "label": "Breakdown Problem Details", "type": "textarea", "required": true, "placeholder": "e.g. Burnt clutch assembly failure on NH65"},
  {"key": "breakdown_location", "label": "Highway Breakdown Location", "type": "location", "required": true, "placeholder": "e.g. NH65, 5km past Choutuppal"},
  {"key": "breakdown_photo", "label": "Breakdown Site Photo / Video", "type": "photo", "required": false}
]'::jsonb WHERE slug IN ('roadside-repair', 'home-services') AND (opportunity_fields IS NULL OR opportunity_fields = '[]'::jsonb);`,
		`INSERT INTO users (supabase_uid, phone, full_name, email, role, status, is_verified, mobile_verified, face_verified, avatar_url, bio, address_text)
		 VALUES ('superadmin_seed_001', '+919999999999', 'Platform Super Admin', 'superadmin@dodo-universe.org', 'SUPER_ADMIN', 'ACTIVE', TRUE, TRUE, TRUE, 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400', 'Master System Administrator', 'DODO-Universe Headquarters')
		 ON CONFLICT (phone) DO UPDATE SET role = 'SUPER_ADMIN', status = 'ACTIVE', is_verified = TRUE;`,
		`CREATE TABLE IF NOT EXISTS vehicle_driver_pairings (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			vehicle_id UUID NOT NULL REFERENCES user_skills_assets(id) ON DELETE CASCADE,
			driver_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			license_number VARCHAR(100),
			license_class VARCHAR(50) DEFAULT 'CLASS-A',
			status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
			assigned_at TIMESTAMPTZ DEFAULT NOW(),
			created_at TIMESTAMPTZ DEFAULT NOW(),
			updated_at TIMESTAMPTZ DEFAULT NOW()
		);`,
		`CREATE TABLE IF NOT EXISTS way_manifests (
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
		);`,
		`CREATE TABLE IF NOT EXISTS incidents_telemetry (
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
		);`,
		`CREATE TABLE IF NOT EXISTS escrow_ledger (
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
		);`,
		`CREATE TABLE IF NOT EXISTS parts_inventory (
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
		);`,
		`CREATE TABLE IF NOT EXISTS subscription_packages (
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
		);`,
		`CREATE TABLE IF NOT EXISTS user_subscriptions (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			package_id UUID NOT NULL REFERENCES subscription_packages(id) ON DELETE CASCADE,
			status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE',
			cycle_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			cycle_end TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
			units_used INTEGER DEFAULT 0,
			created_at TIMESTAMPTZ DEFAULT NOW(),
			updated_at TIMESTAMPTZ DEFAULT NOW()
		);`,
		`CREATE INDEX IF NOT EXISTS idx_subscription_packages_role ON subscription_packages(role_type);`,
		`CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user ON user_subscriptions(user_id);`,
		`CREATE TABLE IF NOT EXISTS user_addresses (
			id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
			user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			label VARCHAR(100) NOT NULL,
			address_text TEXT NOT NULL,
			location GEOGRAPHY(Point, 4326) NOT NULL,
			lat NUMERIC(10, 7) NOT NULL,
			lng NUMERIC(10, 7) NOT NULL,
			landmark TEXT,
			receiver_name VARCHAR(255),
			receiver_phone VARCHAR(50),
			is_default BOOLEAN DEFAULT FALSE,
			created_at TIMESTAMPTZ DEFAULT NOW(),
			updated_at TIMESTAMPTZ DEFAULT NOW()
		);`,
		`CREATE INDEX IF NOT EXISTS idx_user_addresses_user_id ON user_addresses (user_id);`,
		`CREATE INDEX IF NOT EXISTS idx_user_addresses_user_default ON user_addresses (user_id, is_default);`,
		`CREATE INDEX IF NOT EXISTS idx_user_addresses_location ON user_addresses USING GIST (location);`,
		`CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_status ON user_subscriptions(user_id, status);`,
		`INSERT INTO subscription_packages (id, role_type, package_name, package_desc, price_cents, billing_cycle, request_limit, commission_pct, is_active, target_demographics)
		 SELECT
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
		 WHERE NOT EXISTS (SELECT 1 FROM subscription_packages WHERE id = 'a1b2c3d4-0001-4000-8000-000000000001');`,
		`INSERT INTO subscription_packages (id, role_type, package_name, package_desc, price_cents, billing_cycle, request_limit, commission_pct, is_active, target_demographics)
		 SELECT
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
		 WHERE NOT EXISTS (SELECT 1 FROM subscription_packages WHERE id = 'a1b2c3d4-0002-4000-8000-000000000002');`,
		`INSERT INTO categories (id, slug, name, description, icon, default_workflow)
		 VALUES
			(gen_random_uuid(), 'essential-medicine-delivery', 'Essential Medicine Delivery', 'Doorstep medicine procurement and rural micro-logistics', 'Pill', 'MULTI_LAYER'),
			(gen_random_uuid(), 'commuter-micro-logistics', 'Commuter Micro-Logistics', 'Opportunistic delivery matching for daily village commuters', 'Truck', 'INSTANT')
		 ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name;`,
	}

	for _, q := range autoMigrateQueries {
		if _, err := pool.Exec(ctx, q); err != nil {
			log.Printf("[DB AUTO-MIGRATE WARN] Execution notice for query '%s': %v\n", q, err)
		}
	}

	return &DB{Pool: pool}, nil
}

func (db *DB) Close() {
	if db.Pool != nil {
		db.Pool.Close()
	}
}
