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

UPDATE users
SET phone = '+91' || RIGHT(REGEXP_REPLACE(phone, '\D', '', 'g'), 10)
WHERE phone IS NOT NULL AND phone != '' AND LENGTH(REGEXP_REPLACE(phone, '\D', '', 'g')) >= 10;

DELETE FROM users u1
USING users u2
WHERE u1.id < u2.id
  AND u1.phone = u2.phone;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_unique ON users (phone);
