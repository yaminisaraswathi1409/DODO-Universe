-- Seed Test User into Supabase PostgreSQL Database for Login & Activation Flow Testing

INSERT INTO users (
    supabase_uid,
    email,
    phone,
    full_name,
    status,
    role,
    mobile_verified,
    otp_code,
    otp_expires_at,
    is_verified,
    trust_score
) VALUES (
    'test_user_uid_1001',
    'testuser@uop.platform',
    '+919876543210',
    'Test User',
    'PENDING',
    'USER',
    FALSE,
    '123456',
    NOW() + INTERVAL '24 hours',
    FALSE,
    5.00
) ON CONFLICT (phone) DO UPDATE SET
    otp_code = '123456',
    otp_expires_at = NOW() + INTERVAL '24 hours',
    status = CASE WHEN users.status = 'ACTIVE' THEN 'ACTIVE' ELSE 'PENDING' END;
