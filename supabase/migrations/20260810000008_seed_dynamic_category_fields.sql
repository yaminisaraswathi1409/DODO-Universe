-- Migration 20260810000008: Add opportunity_fields column if not exists & seed dynamic category fields

ALTER TABLE categories 
ADD COLUMN IF NOT EXISTS opportunity_fields JSONB DEFAULT '[]'::jsonb;

-- 1. Ensure categories exist for Bricks, Cement, and Vehicle Repair
INSERT INTO categories (slug, name, description, icon, default_workflow) VALUES
('bricks-building-materials', 'Bricks & Building Materials', 'Red bricks, fly ash bricks, AAC blocks, sand, gravel', 'Package', 'INSTANT'),
('cement-construction', 'Cement & Construction Supplies', 'OPC, PPC, PSC cement bags, steel rebar, binding wire', 'Layers', 'INSTANT'),
('vehicle-repair', 'Vehicle Repair & Mechanics', 'Tractor, truck, auto, car repair, mobile mechanic', 'Wrench', 'INSTANT')
ON CONFLICT (slug) DO NOTHING;

-- 2. Seed Dynamic Opportunity Fields JSONB for Bricks
UPDATE categories
SET opportunity_fields = '[
  {"key": "quantity", "label": "Quantity (Number of Bricks)", "type": "number", "required": true, "placeholder": "e.g. 5000"},
  {"key": "brick_type", "label": "Brick Type", "type": "select", "required": true, "options": ["Red Clay Bricks", "Fly Ash Bricks", "AAC Blocks", "Concrete Blocks"]},
  {"key": "grade_spec", "label": "Specification / Grade", "type": "select", "required": true, "options": ["Class A (High Strength)", "Class B (Standard)", "Heavy Duty Structural"]},
  {"key": "delivery_access", "label": "Site Access Type", "type": "select", "required": false, "options": ["10-Wheeler Truck Accessible", "Tractor Access Only", "Narrow Street / Manual Unload"]}
]'::jsonb
WHERE slug = 'bricks-building-materials';

-- 3. Seed Dynamic Opportunity Fields JSONB for Cement
UPDATE categories
SET opportunity_fields = '[
  {"key": "quantity_bags", "label": "Quantity (Bags)", "type": "number", "required": true, "placeholder": "e.g. 100"},
  {"key": "cement_type", "label": "Cement Type", "type": "select", "required": true, "options": ["OPC 53 Grade", "PPC (Portland Pozzolana)", "PSC (Portland Slag)", "White Cement"]},
  {"key": "grade", "label": "Grade Standard", "type": "select", "required": true, "options": ["53 Grade", "43 Grade", "Super Premium Rapid Hardening"]},
  {"key": "brand_preference", "label": "Brand Preference", "type": "select", "required": false, "options": ["UltraTech", "Ambuja", "ACC", "Ramco", "Chettinad", "Any Quality Brand"]}
]'::jsonb
WHERE slug = 'cement-construction';

-- 4. Seed Dynamic Opportunity Fields JSONB for Vehicle Repair
UPDATE categories
SET opportunity_fields = '[
  {"key": "vehicle_type", "label": "Vehicle Category", "type": "select", "required": true, "options": ["Tractor", "Commercial Truck", "Auto Rickshaw", "Four-Wheeler Car", "Two-Wheeler Bike", "Heavy Construction Equipment"]},
  {"key": "vehicle_number", "label": "Vehicle Registration Number", "type": "text", "required": true, "placeholder": "e.g. TS08 AB 1234"},
  {"key": "problem_description", "label": "Problem / Issue Details", "type": "textarea", "required": true, "placeholder": "Describe breakdown or repair issue (e.g. Clutch failure, Engine overheating, Flat tyre)"},
  {"key": "urgency_level", "label": "Urgency", "type": "select", "required": true, "options": ["Emergency Roadside Breakdown", "Within 24 Hours", "Scheduled Maintenance"]},
  {"key": "current_vehicle_location", "label": "Current Vehicle Location", "type": "text", "required": true, "placeholder": "e.g. Highway NH65 near Choutuppal Toll Gate"}
]'::jsonb
WHERE slug = 'vehicle-repair';

-- 5. Seed Dynamic Opportunity Fields JSONB for Logistics & Transport
UPDATE categories
SET opportunity_fields = '[
  {"key": "cargo_weight_tons", "label": "Cargo Weight (Tons)", "type": "number", "required": true, "placeholder": "e.g. 10"},
  {"key": "vehicle_required", "label": "Vehicle Type Required", "type": "select", "required": true, "options": ["10-Ton Flatbed Truck", "Tractor Trailer", "Mini Pickup Van", "Container Truck"]},
  {"key": "goods_type", "label": "Type of Goods", "type": "select", "required": true, "options": ["Agricultural Produce", "Building Materials", "Heavy Machinery", "General Goods"]}
]'::jsonb
WHERE slug = 'logistics-transport';

-- 6. Seed Dynamic Opportunity Fields JSONB for Agriculture & Farming
UPDATE categories
SET opportunity_fields = '[
  {"key": "farm_area_acres", "label": "Farm Area (Acres)", "type": "number", "required": true, "placeholder": "e.g. 5"},
  {"key": "equipment_needed", "label": "Equipment / Machine Needed", "type": "select", "required": true, "options": ["Tractor with Rotavator", "Paddy Harvester", "Ploughing Machine", "Pesticide Sprayer"]},
  {"key": "crop_type", "label": "Crop Type", "type": "text", "required": true, "placeholder": "e.g. Paddy, Cotton, Maize"}
]'::jsonb
WHERE slug = 'agriculture-farming';
