-- Migration 000007: Add dynamic service verification schema and rich category requirement defaults

-- 1. Ensure required_documents column exists on categories
ALTER TABLE categories 
ADD COLUMN IF NOT EXISTS required_documents JSONB DEFAULT '[]'::jsonb;

-- 2. Ensure verification columns exist on user_skills_assets
ALTER TABLE user_skills_assets 
ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'PENDING_APPROVAL',
ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
ADD COLUMN IF NOT EXISTS documents JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES categories(id) ON DELETE SET NULL;

-- 3. Seed rich dynamic verification schemas for core categories
UPDATE categories 
SET required_documents = '[
  {
    "key": "registration_number",
    "label": "Tractor / Vehicle Registration Number",
    "description": "Enter official state transport registration number",
    "type": "text",
    "required": true
  },
  {
    "key": "rc_document_pdf",
    "label": "Vehicle RC / Ownership Certificate (PDF Document)",
    "description": "Upload scanned copy of vehicle RC certificate (PDF format)",
    "type": "pdf",
    "required": true,
    "allowed_file_types": ["application/pdf"],
    "max_file_size_mb": 15
  },
  {
    "key": "tractor_photos",
    "label": "Tractor & Attachment Photos (Front, Side, Working)",
    "description": "Upload high quality photos of tractor and rotavator",
    "type": "multi_image",
    "required": true,
    "allowed_file_types": ["image/jpeg", "image/png", "image/webp"],
    "max_files": 4,
    "max_file_size_mb": 10
  },
  {
    "key": "working_demo_video",
    "label": "Field Operation Demo Video",
    "description": "Upload a short video showing tractor in working operation (MP4/WEBM)",
    "type": "video",
    "required": false,
    "allowed_file_types": ["video/mp4", "video/webm"],
    "max_file_size_mb": 50
  }
]'::jsonb
WHERE slug = 'agriculture-farming';

UPDATE categories 
SET required_documents = '[
  {
    "key": "trade_license_number",
    "label": "Plumbing / Electrician Trade License Number",
    "description": "Government or municipal trade license ID",
    "type": "text",
    "required": true
  },
  {
    "key": "experience_years",
    "label": "Years of Active Experience",
    "description": "Select total years performing field repairs",
    "type": "number",
    "required": true
  },
  {
    "key": "specialization_service",
    "label": "Primary Service Specialization",
    "description": "Select your core skill specialty",
    "type": "select",
    "required": true,
    "options": ["Residential Plumbing & Wiring", "Commercial Industrial Electrician", "Carpentry & Furniture Fitting", "Painting & Waterproofing"]
  },
  {
    "key": "certificate_pdf",
    "label": "Trade Certificate / ID Proof (PDF)",
    "description": "Upload trade certificate or government ID proof document",
    "type": "pdf",
    "required": true,
    "allowed_file_types": ["application/pdf"]
  },
  {
    "key": "work_samples_photos",
    "label": "Past Completed Work Sample Photos",
    "description": "Upload photos of completed wiring, plumbing, or painting projects",
    "type": "multi_image",
    "required": true,
    "allowed_file_types": ["image/jpeg", "image/png", "image/webp"],
    "max_files": 5
  }
]'::jsonb
WHERE slug = 'home-services';

UPDATE categories 
SET required_documents = '[
  {
    "key": "driving_license_no",
    "label": "Commercial Transport Driving License Number",
    "description": "Enter valid commercial DL number",
    "type": "text",
    "required": true
  },
  {
    "key": "vehicle_type",
    "label": "Logistics Truck / Pickup Category",
    "description": "Choose your transport vehicle type",
    "type": "select",
    "required": true,
    "options": ["Pickup Truck (1.5 Ton)", "Heavy Goods Truck (10 Ton)", "Container Delivery Van", "Three-Wheeler Goods Auto"]
  },
  {
    "key": "dl_photo",
    "label": "Driving License Document Photo",
    "description": "Front & back photo of commercial license",
    "type": "image",
    "required": true
  },
  {
    "key": "vehicle_rc_pdf",
    "label": "Transport Permit & Vehicle RC (PDF)",
    "description": "Upload transport permit document",
    "type": "pdf",
    "required": true
  }
]'::jsonb
WHERE slug = 'logistics-transport';
