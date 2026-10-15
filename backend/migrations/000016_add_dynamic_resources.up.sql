-- Add resources JSONB column to categories table for 100% dynamic resources
ALTER TABLE categories 
ADD COLUMN IF NOT EXISTS resources JSONB DEFAULT '[]'::jsonb;

-- Seed initial resources array for existing categories based on existing vehicle_fields, driver_fields, and resource_requirements
UPDATE categories
SET resources = jsonb_build_array(
  jsonb_build_object(
    'id', 'res_vehicle',
    'key', 'vehicle',
    'name', 'Vehicle',
    'description', 'Transport vehicle arrangement',
    'requirement_level', COALESCE(resource_requirements->>'vehicle', 'OPTIONAL'),
    'active', true,
    'display_order', 1,
    'options', jsonb_build_array(
      jsonb_build_object('key', 'BOOK_VEHICLE', 'label', '1. I will book a vehicle', 'description', 'Provider/platform arranges vehicle'),
      jsonb_build_object('key', 'HAVE_VEHICLE', 'label', '2. I have a vehicle / Myself', 'description', 'Customer provides vehicle details'),
      jsonb_build_object('key', 'NO_VEHICLE', 'label', '3. I do not have a vehicle', 'description', 'Provider arranges vehicle')
    ),
    'fields', COALESCE(vehicle_fields, jsonb_build_array(
      jsonb_build_object('key', 'vehicle_type', 'label', 'Vehicle Type', 'type', 'select', 'required', true, 'options', jsonb_build_array('10-Wheeler', '12-Wheeler', 'Trailer', 'Mini Truck', 'Tractor', 'Flatbed', 'Tata Ace')),
      jsonb_build_object('key', 'registration_number', 'label', 'Vehicle Registration Number', 'type', 'text', 'required', true, 'placeholder', 'e.g. TS-08-AB-1234'),
      jsonb_build_object('key', 'owner_name', 'label', 'Vehicle Owner Name', 'type', 'text', 'required', true, 'placeholder', 'Owner Full Name'),
      jsonb_build_object('key', 'contact_number', 'label', 'Vehicle Contact Number', 'type', 'text', 'required', true, 'placeholder', '+91 Mobile Number')
    ))
  ),
  jsonb_build_object(
    'id', 'res_driver',
    'key', 'driver',
    'name', 'Driver',
    'description', 'Commercial driver arrangement',
    'requirement_level', COALESCE(resource_requirements->>'driver', 'OPTIONAL'),
    'active', true,
    'display_order', 2,
    'options', jsonb_build_array(
      jsonb_build_object('key', 'BOOK_DRIVER', 'label', '1. I will book a driver', 'description', 'Provider/platform arranges driver'),
      jsonb_build_object('key', 'HAVE_DRIVER', 'label', '2. I have a driver / Myself', 'description', 'Customer provides driver details'),
      jsonb_build_object('key', 'NO_DRIVER', 'label', '3. I do not have a driver', 'description', 'Provider arranges driver')
    ),
    'fields', COALESCE(driver_fields, jsonb_build_array(
      jsonb_build_object('key', 'driver_name', 'label', 'Driver Name', 'type', 'text', 'required', true, 'placeholder', 'Driver Full Name'),
      jsonb_build_object('key', 'driver_phone', 'label', 'Driver Phone Number', 'type', 'text', 'required', true, 'placeholder', '+91 Mobile Number'),
      jsonb_build_object('key', 'license_number', 'label', 'Driving Licence Details', 'type', 'text', 'required', false, 'placeholder', 'Licence No. e.g. DL-1420110012345')
    ))
  )
)
WHERE slug IN ('bricks-building-materials', 'cement-construction', 'equipment-machinery', 'logistics-transport', 'flatbed-transport', 'commercial-driver');
