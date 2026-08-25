DROP INDEX IF EXISTS idx_users_phone;
DROP INDEX IF EXISTS idx_users_status;

ALTER TABLE users
DROP COLUMN IF EXISTS invited_at,
DROP COLUMN IF EXISTS invited_by,
DROP COLUMN IF EXISTS face_verification_ref,
DROP COLUMN IF EXISTS face_verified_at,
DROP COLUMN IF EXISTS face_verified,
DROP COLUMN IF EXISTS otp_expires_at,
DROP COLUMN IF EXISTS otp_code,
DROP COLUMN IF EXISTS mobile_verified,
DROP COLUMN IF EXISTS role,
DROP COLUMN IF EXISTS status;
