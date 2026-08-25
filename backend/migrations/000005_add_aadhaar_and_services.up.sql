-- Migration 000005: Add Aadhaar number to users and ensure seed admin user
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS aadhaar_number VARCHAR(20);

CREATE INDEX IF NOT EXISTS idx_users_aadhaar ON users (aadhaar_number);

-- Seed default System Admin user if not existing
INSERT INTO users (
    supabase_uid, phone, full_name, email, role, status, is_verified, mobile_verified, face_verified, avatar_url, bio, address_text
) VALUES (
    'admin_seed_001', '+919999999999', 'Platform System Admin', 'admin@uop.org', 'ADMIN', 'ACTIVE', TRUE, TRUE, TRUE, 
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400', 'Master System Administrator', 'UOP Headquarters'
) ON CONFLICT (phone) DO UPDATE SET role = 'ADMIN', status = 'ACTIVE', is_verified = TRUE;
