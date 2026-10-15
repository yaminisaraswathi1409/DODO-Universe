-- Migration 000013: Add vehicle_fields and driver_fields columns to categories table & seed defaults

ALTER TABLE categories 
ADD COLUMN IF NOT EXISTS vehicle_fields JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS driver_fields JSONB DEFAULT '[]'::jsonb;

-- Seed default vehicle fields for Logistics & Transport category
UPDATE categories
SET vehicle_fields = '[
  {"key": "vehicle_type", "label": "Vehicle Type", "type": "select", "required": true, "options": ["10-Wheeler", "12-Wheeler", "Trailer", "Mini Truck", "Tractor", "Flatbed", "Tata Ace"]},
  {"key": "registration_number", "label": "Vehicle Registration Number", "type": "text", "required": true, "placeholder": "e.g. TS-08-AB-1234"},
  {"key": "owner_name", "label": "Vehicle Owner Name", "type": "text", "required": true, "placeholder": "Owner Full Name"},
  {"key": "contact_number", "label": "Vehicle Contact Number", "type": "text", "required": true, "placeholder": "+91 Mobile Number"},
  {"key": "vehicle_model", "label": "Vehicle Model / Make", "type": "text", "required": false, "placeholder": "e.g. Tata 2518 / 2022"},
  {"key": "vehicle_capacity", "label": "Vehicle Capacity", "type": "text", "required": false, "placeholder": "e.g. 15 Ton"}
]'::jsonb,
driver_fields = '[
  {"key": "driver_name", "label": "Driver Name", "type": "text", "required": true, "placeholder": "Driver Full Name"},
  {"key": "driver_phone", "label": "Driver Phone Number", "type": "text", "required": true, "placeholder": "+91 Mobile Number"},
  {"key": "license_number", "label": "Driving Licence Details", "type": "text", "required": false, "placeholder": "Licence No. e.g. DL-1420110012345"},
  {"key": "driver_photo", "label": "Driver Photo URL", "type": "text", "required": false, "placeholder": "https://..."}
]'::jsonb
WHERE slug IN ('logistics-transport', 'flatbed-transport', 'commercial-driver', 'agriculture-farming', 'equipment-machinery', 'bricks-building-materials', 'cement-construction', 'vehicle-repair');
