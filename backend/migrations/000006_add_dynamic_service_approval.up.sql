-- Migration 000006: Add dynamic service approval workflow and requirement schemas

-- 1. Add required_documents JSONB schema to categories
ALTER TABLE categories 
ADD COLUMN IF NOT EXISTS required_documents JSONB DEFAULT '[]'::jsonb;

-- 2. Add status, rejection_reason, documents JSONB, and category_id to user_skills_assets
ALTER TABLE user_skills_assets 
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'PENDING_APPROVAL',
ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
ADD COLUMN IF NOT EXISTS documents JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_user_skills_assets_status ON user_skills_assets(status);
CREATE INDEX IF NOT EXISTS idx_user_skills_assets_category ON user_skills_assets(category_id);

-- 3. Seed default required_documents JSONB schemas for core platform service categories
UPDATE categories 
SET required_documents = '[
  {"key": "registration_number", "label": "Tractor / Vehicle Registration Number", "type": "text", "required": true},
  {"key": "registration_doc", "label": "Vehicle RC / Ownership Document Photo URL", "type": "image", "required": true},
  {"key": "vehicle_photo", "label": "Tractor / Equipment Front Photo URL", "type": "image", "required": true}
]'::jsonb
WHERE slug = 'agriculture-farming';

UPDATE categories 
SET required_documents = '[
  {"key": "driving_license", "label": "Commercial Driving License Number", "type": "text", "required": true},
  {"key": "license_photo", "label": "Driving License Document Photo URL", "type": "image", "required": true},
  {"key": "vehicle_rc", "label": "Transport Vehicle RC Photo URL", "type": "image", "required": true}
]'::jsonb
WHERE slug = 'logistics-transport';

UPDATE categories 
SET required_documents = '[
  {"key": "trade_cert", "label": "Skill Certification / Trade License Number", "type": "text", "required": true},
  {"key": "experience_years", "label": "Years of Field Experience", "type": "number", "required": true},
  {"key": "cert_photo", "label": "Certification / ID Document Photo URL", "type": "image", "required": true}
]'::jsonb
WHERE slug = 'home-services';

UPDATE categories 
SET required_documents = '[
  {"key": "equipment_serial", "label": "Machinery Serial Number / Model", "type": "text", "required": true},
  {"key": "equipment_photo", "label": "Machinery Photo URL", "type": "image", "required": true}
]'::jsonb
WHERE slug = 'equipment-machinery';
