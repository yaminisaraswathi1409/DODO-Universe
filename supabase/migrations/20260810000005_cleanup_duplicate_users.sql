-- Migration: Deduplicate users table by phone and enforce unique phone numbers

-- 1. Remove duplicate PENDING user records where an ACTIVE record already exists for the same phone
DELETE FROM users u1
WHERE u1.status = 'PENDING'
  AND EXISTS (
    SELECT 1 FROM users u2 
    WHERE u2.id != u1.id 
      AND (
        u2.phone = u1.phone 
        OR RIGHT(REGEXP_REPLACE(u2.phone, '\D', '', 'g'), 10) = RIGHT(REGEXP_REPLACE(u1.phone, '\D', '', 'g'), 10)
      )
      AND u2.status IN ('ACTIVE', 'PROFILE_COMPLETED', 'OTP_VERIFIED')
  );

-- 2. Normalize phone numbers in existing users table to E.164 format (+91...)
UPDATE users
SET phone = '+91' || RIGHT(REGEXP_REPLACE(phone, '\D', '', 'g'), 10)
WHERE phone IS NOT NULL AND phone != '' AND LENGTH(REGEXP_REPLACE(phone, '\D', '', 'g')) >= 10;

-- 3. Delete any remaining duplicate phone rows keeping the latest updated row
DELETE FROM users u1
USING users u2
WHERE u1.id < u2.id
  AND u1.phone = u2.phone;

-- 4. Create Unique Index on phone column
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_unique ON users (phone);
