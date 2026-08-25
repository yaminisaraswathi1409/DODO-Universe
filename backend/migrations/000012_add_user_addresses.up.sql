-- Create user_addresses table for saved addresses (Home, Work, Construction Site, etc.)
CREATE TABLE IF NOT EXISTS user_addresses (
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
);

-- Indexes for fast query lookup & spatial search
CREATE INDEX IF NOT EXISTS idx_user_addresses_user_id ON user_addresses (user_id);
CREATE INDEX IF NOT EXISTS idx_user_addresses_user_default ON user_addresses (user_id, is_default);
CREATE INDEX IF NOT EXISTS idx_user_addresses_location ON user_addresses USING GIST (location);
