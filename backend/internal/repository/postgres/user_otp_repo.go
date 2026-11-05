package postgres

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/uop/backend/internal/domain"
)

var (
	// ErrInvalidOTP is returned for wrong, expired, missing or already-used codes.
	// It is deliberately the same error for all of them (no enumeration oracle).
	ErrInvalidOTP = errors.New("invalid or expired OTP code")
	// ErrOTPLocked is returned once the per-code attempt limit is exhausted.
	ErrOTPLocked = errors.New("too many incorrect attempts: request a new OTP code")
)

const userColumns = `id, supabase_uid, COALESCE(email, ''), COALESCE(phone, ''), full_name, COALESCE(avatar_url, ''), COALESCE(bio, ''),
		          COALESCE(ST_Y(location::geometry), 0.0) as lat, COALESCE(ST_X(location::geometry), 0.0) as lng, COALESCE(address_text, ''), COALESCE(aadhaar_number, ''), trust_score, is_verified,
		          status, role, mobile_verified, COALESCE(otp_code, ''), otp_expires_at, face_verified, face_verified_at, COALESCE(face_verification_ref, ''),
		          invited_by, invited_at, created_at, updated_at`

// InviteUser creates an invited PENDING user and stores the hashed OTP
// verifier. The plaintext code is never persisted.
func (r *UserRepository) InviteUser(ctx context.Context, inviterID uuid.UUID, fullName, phone, email string, role domain.UserRole, verifier string, expiresAt time.Time) (*domain.User, error) {
	tx, err := r.db.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	supabaseUID := fmt.Sprintf("invited_%s_%d", uuid.New().String()[:8], time.Now().Unix())
	query := `
		INSERT INTO users (supabase_uid, email, phone, full_name, status, role, otp_code, otp_expires_at, invited_by, invited_at)
		VALUES ($1, NULLIF($2, ''), $3, $4, 'PENDING', $5, NULL, $6, $7, NOW())
		RETURNING ` + userColumns + `;`
	user, err := r.scanUserRow(tx.QueryRow(ctx, query, supabaseUID, email, phone, fullName, role, expiresAt, inviterID))
	if err != nil || user == nil {
		return nil, fmt.Errorf("insert invited user: %w", err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO user_otps (phone, otp_code, expires_at, is_verified, attempts) VALUES ($1, $2, $3, FALSE, 0)`,
		user.Phone, verifier, expiresAt); err != nil {
		return nil, fmt.Errorf("store otp verifier: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return user, nil
}

// StoreOTPVerifier records a new OTP verifier for phone (creating a PENDING
// user for unknown numbers, as the login/signup flow always has) and
// invalidates every earlier unused code for that number.
func (r *UserRepository) StoreOTPVerifier(ctx context.Context, phone, verifier string, expiresAt time.Time) (*domain.User, error) {
	normPhone := NormalizePhone(phone)
	user, err := r.CreateOrGetByPhone(ctx, normPhone)
	if err != nil || user == nil {
		return nil, fmt.Errorf("failed to create or fetch user for phone: %v", err)
	}

	userPhone := user.Phone
	if userPhone == "" {
		userPhone = normPhone
	}

	tx, err := r.db.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	if _, err := tx.Exec(ctx, `UPDATE user_otps SET expires_at = NOW(), updated_at = NOW() WHERE (phone = $1 OR phone = $2 OR RIGHT(REGEXP_REPLACE(phone, '\D', '', 'g'), 10) = RIGHT(REGEXP_REPLACE($1, '\D', '', 'g'), 10)) AND is_verified = FALSE AND expires_at > NOW()`, normPhone, userPhone); err != nil {
		return nil, fmt.Errorf("invalidate previous otps: %w", err)
	}
	if _, err := tx.Exec(ctx, `INSERT INTO user_otps (phone, otp_code, expires_at, is_verified, attempts) VALUES ($1, $2, $3, FALSE, 0)`, normPhone, verifier, expiresAt); err != nil {
		return nil, fmt.Errorf("store otp verifier: %w", err)
	}
	// users.otp_code held plaintext codes in the past; never store a code there again.
	updated, err := r.scanUserRow(tx.QueryRow(ctx,
		`UPDATE users SET otp_code = NULL, otp_expires_at = $2, updated_at = NOW() WHERE id = $1 RETURNING `+userColumns, user.ID, expiresAt))
	if err != nil || updated == nil {
		return nil, fmt.Errorf("update user otp state: %w", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return updated, nil
}

// ExpireOTPs invalidates every unused code for phone (used when SMS delivery
// fails so an undelivered code cannot be guessed).
func (r *UserRepository) ExpireOTPs(ctx context.Context, phone string) error {
	norm := NormalizePhone(phone)
	_, err := r.db.Pool.Exec(ctx, `UPDATE user_otps SET expires_at = NOW(), updated_at = NOW() WHERE (phone = $1 OR phone = $2 OR RIGHT(REGEXP_REPLACE(phone, '\D', '', 'g'), 10) = RIGHT(REGEXP_REPLACE($1, '\D', '', 'g'), 10)) AND is_verified = FALSE AND expires_at > NOW()`, norm, phone)
	return err
}

// CountRecentOTPs returns how many codes were issued for phone since `since`
// and the creation time of the most recent one (zero if none). This is the
// persistent (multi-instance safe) half of OTP request rate limiting.
func (r *UserRepository) CountRecentOTPs(ctx context.Context, phone string, since time.Time) (int, time.Time, error) {
	norm := NormalizePhone(phone)
	var count int
	var last *time.Time
	err := r.db.Pool.QueryRow(ctx,
		`SELECT COUNT(*), MAX(created_at) FROM user_otps WHERE (phone = $1 OR phone = $2 OR RIGHT(REGEXP_REPLACE(phone, '\D', '', 'g'), 10) = RIGHT(REGEXP_REPLACE($1, '\D', '', 'g'), 10)) AND created_at > $3`,
		norm, phone, since).Scan(&count, &last)
	if err != nil {
		return 0, time.Time{}, err
	}
	if last == nil {
		return count, time.Time{}, nil
	}
	return count, *last, nil
}

// OTPMatcher compares a stored verifier against a candidate code.
type OTPMatcher func(storedVerifier, userPhone, candidateCode string) bool

// VerifyOTPWith verifies a code against the newest unexpired, unused OTP for the
// phone number inside one transaction:
//   - expiry is enforced (expires_at > NOW());
//   - every wrong guess increments user_otps.attempts and persists;
//   - after maxAttempts wrong guesses the code is invalidated (ErrOTPLocked);
//   - a correct code is single-use.
//
// There are no development bypass codes.
func (r *UserRepository) VerifyOTPWith(ctx context.Context, phone, code string, maxAttempts int, match OTPMatcher) (*domain.User, error) {
	user, err := r.GetByPhone(ctx, phone)
	if err != nil || user == nil {
		return nil, ErrInvalidOTP
	}

	normPhone := NormalizePhone(phone)
	userPhone := user.Phone
	if userPhone == "" {
		userPhone = normPhone
	}

	tx, err := r.db.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var otpID uuid.UUID
	var stored string
	var attempts int
	err = tx.QueryRow(ctx, `
		SELECT id, otp_code, COALESCE(attempts, 0)
		FROM user_otps
		WHERE (phone = $1 OR phone = $2 OR RIGHT(REGEXP_REPLACE(phone, '\D', '', 'g'), 10) = RIGHT(REGEXP_REPLACE($1, '\D', '', 'g'), 10))
		  AND is_verified = FALSE 
		  AND expires_at > NOW()
		ORDER BY created_at DESC
		LIMIT 1
		FOR UPDATE`, normPhone, userPhone).Scan(&otpID, &stored, &attempts)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrInvalidOTP
		}
		return nil, err
	}

	if attempts >= maxAttempts {
		if _, err := tx.Exec(ctx, `UPDATE user_otps SET expires_at = NOW(), updated_at = NOW() WHERE id = $1`, otpID); err == nil {
			_ = tx.Commit(ctx)
		}
		return nil, ErrOTPLocked
	}

	if !match(stored, user.Phone, code) {
		attempts++
		if attempts >= maxAttempts {
			_, err = tx.Exec(ctx, `UPDATE user_otps SET attempts = $2, expires_at = NOW(), updated_at = NOW() WHERE id = $1`, otpID, attempts)
		} else {
			_, err = tx.Exec(ctx, `UPDATE user_otps SET attempts = $2, updated_at = NOW() WHERE id = $1`, otpID, attempts)
		}
		if err != nil {
			return nil, err
		}
		if err := tx.Commit(ctx); err != nil {
			return nil, err
		}
		if attempts >= maxAttempts {
			return nil, ErrOTPLocked
		}
		return nil, ErrInvalidOTP
	}

	if _, err := tx.Exec(ctx, `UPDATE user_otps SET is_verified = TRUE, updated_at = NOW() WHERE id = $1`, otpID); err != nil {
		return nil, err
	}
	updated, err := r.scanUserRow(tx.QueryRow(ctx, `
		UPDATE users
		SET mobile_verified = TRUE,
		    status = CASE WHEN status = 'PENDING' THEN 'OTP_VERIFIED' ELSE status END,
		    otp_code = NULL,
		    updated_at = NOW()
		WHERE id = $1
		RETURNING `+userColumns, user.ID))
	if err != nil || updated == nil {
		return nil, fmt.Errorf("failed to update user after otp verification: %v", err)
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return r.ActivateIfEligible(ctx, updated.ID)
}

// GetDriverProfile returns the explicit driver identity for a user, or nil if
// none exists. If the driver_profiles table has not been created yet (the
// migration is proposed, not applied) nobody is a driver: it fails closed.
func (r *UserRepository) GetDriverProfile(ctx context.Context, userID uuid.UUID) (*domain.DriverProfile, error) {
	var p domain.DriverProfile
	var status string
	err := r.db.Pool.QueryRow(ctx, `
		SELECT user_id, status, COALESCE(license_number, ''), COALESCE(license_class, ''), license_expiry,
		       is_available, approved_by, approved_at, created_at, updated_at
		FROM driver_profiles WHERE user_id = $1`, userID).Scan(
		&p.UserID, &status, &p.LicenseNumber, &p.LicenseClass, &p.LicenseExpiry,
		&p.IsAvailable, &p.ApprovedBy, &p.ApprovedAt, &p.CreatedAt, &p.UpdatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "42P01" { // undefined_table
			return nil, nil
		}
		return nil, err
	}
	p.Status = domain.DriverStatus(strings.ToUpper(status))
	return &p, nil
}

