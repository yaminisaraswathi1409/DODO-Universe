package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/uop/backend/internal/domain"
)

type UserRepository struct {
	db *DB
}

func NewUserRepository(db *DB) *UserRepository {
	return &UserRepository{db: db}
}

func (r *UserRepository) scanUserRow(row pgx.Row) (*domain.User, error) {
	var res domain.User
	var statusStr, roleStr string

	err := row.Scan(
		&res.ID, &res.SupabaseUID, &res.Email, &res.Phone, &res.FullName, &res.AvatarURL, &res.Bio,
		&res.Lat, &res.Lng, &res.AddressText, &res.AadhaarNumber, &res.TrustScore, &res.IsVerified,
		&statusStr, &roleStr, &res.MobileVerified, &res.OTPCode, &res.OTPExpiresAt,
		&res.FaceVerified, &res.FaceVerifiedAt, &res.FaceVerificationRef,
		&res.InvitedBy, &res.InvitedAt, &res.CreatedAt, &res.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	res.Status = domain.UserStatus(statusStr)
	res.Role = domain.UserRole(roleStr)
	if res.Status == domain.StatusSuspended {
		res.IsSuspended = true
	}

	return &res, nil
}

func (r *UserRepository) UpsertUser(ctx context.Context, u *domain.User) (*domain.User, error) {
	query := `
		INSERT INTO users (supabase_uid, email, phone, full_name, avatar_url, bio, location, address_text, status, role)
		VALUES ($1, $2, $3, $4, $5, $6, ST_SetSRID(ST_MakePoint($7, $8), 4326)::geography, $9, COALESCE(NULLIF($10, ''), 'PENDING'), COALESCE(NULLIF($11, ''), 'USER'))
		ON CONFLICT (supabase_uid) DO UPDATE SET
			email = EXCLUDED.email,
			phone = COALESCE(EXCLUDED.phone, users.phone),
			full_name = EXCLUDED.full_name,
			avatar_url = COALESCE(EXCLUDED.avatar_url, users.avatar_url),
			bio = COALESCE(EXCLUDED.bio, users.bio),
			location = CASE WHEN EXCLUDED.location IS NOT NULL THEN EXCLUDED.location ELSE users.location END,
			address_text = COALESCE(EXCLUDED.address_text, users.address_text),
			updated_at = NOW()
		RETURNING id, supabase_uid, COALESCE(email, ''), COALESCE(phone, ''), full_name, COALESCE(avatar_url, ''), COALESCE(bio, ''), 
		          COALESCE(ST_Y(location::geometry), 0.0) as lat, COALESCE(ST_X(location::geometry), 0.0) as lng, COALESCE(address_text, ''), COALESCE(aadhaar_number, ''), trust_score, is_verified,
		          status, role, mobile_verified, COALESCE(otp_code, ''), otp_expires_at, face_verified, face_verified_at, COALESCE(face_verification_ref, ''),
		          invited_by, invited_at, created_at, updated_at;
	`

	row := r.db.Pool.QueryRow(ctx, query,
		u.SupabaseUID, u.Email, u.Phone, u.FullName, u.AvatarURL, u.Bio, u.Lng, u.Lat, u.AddressText, u.Status, u.Role,
	)

	return r.scanUserRow(row)
}

func (r *UserRepository) InviteUser(ctx context.Context, inviterID uuid.UUID, fullName, phone, email string, role domain.UserRole, otpCode string, expiresAt time.Time) (*domain.User, error) {
	supabaseUID := fmt.Sprintf("invited_%s_%d", uuid.New().String()[:8], time.Now().Unix())
	query := `
		INSERT INTO users (supabase_uid, email, phone, full_name, status, role, otp_code, otp_expires_at, invited_by, invited_at)
		VALUES ($1, NULLIF($2, ''), $3, $4, 'PENDING', $5, $6, $7, $8, NOW())
		RETURNING id, supabase_uid, COALESCE(email, ''), COALESCE(phone, ''), full_name, COALESCE(avatar_url, ''), COALESCE(bio, ''), 
		          COALESCE(ST_Y(location::geometry), 0.0) as lat, COALESCE(ST_X(location::geometry), 0.0) as lng, COALESCE(address_text, ''), COALESCE(aadhaar_number, ''), trust_score, is_verified,
		          status, role, mobile_verified, COALESCE(otp_code, ''), otp_expires_at, face_verified, face_verified_at, COALESCE(face_verification_ref, ''),
		          invited_by, invited_at, created_at, updated_at;
	`
	row := r.db.Pool.QueryRow(ctx, query, supabaseUID, email, phone, fullName, role, otpCode, expiresAt, inviterID)
	return r.scanUserRow(row)
}

func (r *UserRepository) VerifyOTP(ctx context.Context, phone, otpCode string) (*domain.User, error) {
	query := `
		UPDATE users
		SET mobile_verified = TRUE,
		    status = CASE WHEN status = 'PENDING' THEN 'OTP_VERIFIED' ELSE status END,
		    otp_code = NULL,
		    updated_at = NOW()
		WHERE phone = $1 AND otp_code = $2 AND (otp_expires_at IS NULL OR otp_expires_at > NOW())
		RETURNING id, supabase_uid, COALESCE(email, ''), COALESCE(phone, ''), full_name, COALESCE(avatar_url, ''), COALESCE(bio, ''), 
		          COALESCE(ST_Y(location::geometry), 0.0) as lat, COALESCE(ST_X(location::geometry), 0.0) as lng, COALESCE(address_text, ''), COALESCE(aadhaar_number, ''), trust_score, is_verified,
		          status, role, mobile_verified, COALESCE(otp_code, ''), otp_expires_at, face_verified, face_verified_at, COALESCE(face_verification_ref, ''),
		          invited_by, invited_at, created_at, updated_at;
	`
	row := r.db.Pool.QueryRow(ctx, query, phone, otpCode)
	user, err := r.scanUserRow(row)
	if err != nil {
		return nil, fmt.Errorf("invalid or expired OTP code: %w", err)
	}

	return r.ActivateIfEligible(ctx, user.ID)
}

func (r *UserRepository) CompleteProfile(ctx context.Context, userID uuid.UUID, avatarURL, bio, addressText, aadhaarNumber string, lat, lng float64) (*domain.User, error) {
	query := `
		UPDATE users
		SET avatar_url = $2,
		    bio = $3,
		    address_text = $4,
		    aadhaar_number = COALESCE(NULLIF($5, ''), aadhaar_number),
		    location = ST_SetSRID(ST_MakePoint($6, $7), 4326)::geography,
		    status = CASE WHEN status IN ('PENDING', 'OTP_VERIFIED') THEN 'PROFILE_COMPLETED' ELSE status END,
		    updated_at = NOW()
		WHERE id = $1
		RETURNING id, supabase_uid, COALESCE(email, ''), COALESCE(phone, ''), full_name, COALESCE(avatar_url, ''), COALESCE(bio, ''), 
		          COALESCE(ST_Y(location::geometry), 0.0) as lat, COALESCE(ST_X(location::geometry), 0.0) as lng, COALESCE(address_text, ''), COALESCE(aadhaar_number, ''), trust_score, is_verified,
		          status, role, mobile_verified, COALESCE(otp_code, ''), otp_expires_at, face_verified, face_verified_at, COALESCE(face_verification_ref, ''),
		          invited_by, invited_at, created_at, updated_at;
	`
	row := r.db.Pool.QueryRow(ctx, query, userID, avatarURL, bio, addressText, aadhaarNumber, lng, lat)
	user, err := r.scanUserRow(row)
	if err != nil {
		return nil, err
	}

	return r.ActivateIfEligible(ctx, user.ID)
}

func (r *UserRepository) VerifyFace(ctx context.Context, userID uuid.UUID, faceRef string) (*domain.User, error) {
	query := `
		UPDATE users
		SET face_verified = TRUE,
		    face_verified_at = NOW(),
		    face_verification_ref = $2,
		    updated_at = NOW()
		WHERE id = $1
		RETURNING id, supabase_uid, COALESCE(email, ''), COALESCE(phone, ''), full_name, COALESCE(avatar_url, ''), COALESCE(bio, ''), 
		          COALESCE(ST_Y(location::geometry), 0.0) as lat, COALESCE(ST_X(location::geometry), 0.0) as lng, COALESCE(address_text, ''), COALESCE(aadhaar_number, ''), trust_score, is_verified,
		          status, role, mobile_verified, COALESCE(otp_code, ''), otp_expires_at, face_verified, face_verified_at, COALESCE(face_verification_ref, ''),
		          invited_by, invited_at, created_at, updated_at;
	`
	row := r.db.Pool.QueryRow(ctx, query, userID, faceRef)
	user, err := r.scanUserRow(row)
	if err != nil {
		return nil, err
	}

	return r.ActivateIfEligible(ctx, user.ID)
}

func (r *UserRepository) ActivateIfEligible(ctx context.Context, userID uuid.UUID) (*domain.User, error) {
	query := `
		UPDATE users
		SET status = 'ACTIVE',
		    is_verified = TRUE,
		    updated_at = NOW()
		WHERE id = $1
		  AND mobile_verified = TRUE
		  AND avatar_url IS NOT NULL AND avatar_url != ''
		  AND face_verified = TRUE
		RETURNING id, supabase_uid, COALESCE(email, ''), COALESCE(phone, ''), full_name, COALESCE(avatar_url, ''), COALESCE(bio, ''), 
		          COALESCE(ST_Y(location::geometry), 0.0) as lat, COALESCE(ST_X(location::geometry), 0.0) as lng, COALESCE(address_text, ''), COALESCE(aadhaar_number, ''), trust_score, is_verified,
		          status, role, mobile_verified, COALESCE(otp_code, ''), otp_expires_at, face_verified, face_verified_at, COALESCE(face_verification_ref, ''),
		          invited_by, invited_at, created_at, updated_at;
	`
	row := r.db.Pool.QueryRow(ctx, query, userID)
	activated, err := r.scanUserRow(row)
	if err != nil || activated == nil {
		// If user is not yet eligible for full activation (e.g. pending profile photo or face scan), return current user status
		return r.GetByID(ctx, userID)
	}
	return activated, nil
}

func (r *UserRepository) UpdateStatus(ctx context.Context, userID uuid.UUID, status domain.UserStatus) (*domain.User, error) {
	isVerified := status == domain.StatusActive
	query := `
		UPDATE users
		SET status = $2,
		    is_verified = $3,
		    updated_at = NOW()
		WHERE id = $1
		RETURNING id, supabase_uid, COALESCE(email, ''), COALESCE(phone, ''), full_name, COALESCE(avatar_url, ''), COALESCE(bio, ''), 
		          COALESCE(ST_Y(location::geometry), 0.0) as lat, COALESCE(ST_X(location::geometry), 0.0) as lng, COALESCE(address_text, ''), COALESCE(aadhaar_number, ''), trust_score, is_verified,
		          status, role, mobile_verified, COALESCE(otp_code, ''), otp_expires_at, face_verified, face_verified_at, COALESCE(face_verification_ref, ''),
		          invited_by, invited_at, created_at, updated_at;
	`
	row := r.db.Pool.QueryRow(ctx, query, userID, string(status), isVerified)
	return r.scanUserRow(row)
}

// ValidateAndNormalizePhone validates that the phone number contains the correct number of digits
// and normalizes it to standard E.164. For Indian mobile numbers (+91 or default), it strictly enforces exactly 10 digits.
func ValidateAndNormalizePhone(phone string) (string, error) {
	phone = strings.TrimSpace(phone)
	if phone == "" {
		return "", errors.New("mobile phone number is required")
	}

	var digits strings.Builder
	for _, r := range phone {
		if r >= '0' && r <= '9' {
			digits.WriteRune(r)
		}
	}

	dStr := digits.String()
	if dStr == "" {
		return "", errors.New("phone number must contain numeric digits")
	}

	// Case 1: Prefixed with +91 or 91
	if strings.HasPrefix(phone, "+91") || (len(dStr) >= 2 && strings.HasPrefix(dStr, "91") && len(dStr) != 10) {
		national := dStr
		if strings.HasPrefix(national, "91") {
			national = national[2:]
		}
		if len(national) < 10 {
			return "", fmt.Errorf("invalid mobile number: incomplete number (%d digits provided, exactly 10 digits required)", len(national))
		}
		if len(national) > 10 {
			return "", fmt.Errorf("invalid mobile number: Indian phone numbers must contain exactly 10 digits (provided %d digits)", len(national))
		}
		return "+91" + national, nil
	}

	// Case 2: 10 raw digits (standard Indian national number without country prefix)
	if len(dStr) == 10 {
		return "+91" + dStr, nil
	}

	// Case 3: Other international numbers with explicit '+' prefix
	if strings.HasPrefix(phone, "+") {
		// General E.164 international numbers are 7 to 15 digits
		if len(dStr) < 7 || len(dStr) > 15 {
			return "", fmt.Errorf("invalid international phone number length (%d digits)", len(dStr))
		}
		return "+" + dStr, nil
	}

	// Default case (assumed Indian number if no other country code):
	if len(dStr) < 10 {
		return "", fmt.Errorf("invalid mobile number: incomplete number (%d digits provided, exactly 10 digits required)", len(dStr))
	}
	if len(dStr) > 10 {
		return "", fmt.Errorf("invalid mobile number: Indian phone numbers must contain exactly 10 digits (provided %d digits)", len(dStr))
	}

	return "+91" + dStr, nil
}

// NormalizePhone converts any phone string (+91..., 9876..., +91 98765-43210) to standard E.164 (+919876543210)
func NormalizePhone(phone string) string {
	normalized, err := ValidateAndNormalizePhone(phone)
	if err != nil {
		phone = strings.TrimSpace(phone)
		if strings.HasPrefix(phone, "+") {
			return phone
		}
		return "+91" + phone
	}
	return normalized
}

func (r *UserRepository) GetByPhone(ctx context.Context, phone string) (*domain.User, error) {
	normPhone := NormalizePhone(phone)
	query := `
		SELECT id, supabase_uid, COALESCE(email, ''), COALESCE(phone, ''), full_name, COALESCE(avatar_url, ''), COALESCE(bio, ''),
		       COALESCE(ST_Y(location::geometry), 0.0) as lat, COALESCE(ST_X(location::geometry), 0.0) as lng,
		       COALESCE(address_text, ''), COALESCE(aadhaar_number, ''), trust_score, is_verified,
		       status, role, mobile_verified, COALESCE(otp_code, ''), otp_expires_at, face_verified, face_verified_at, COALESCE(face_verification_ref, ''),
		       invited_by, invited_at, created_at, updated_at
		FROM users
		WHERE phone = $1 
		   OR phone = $2 
		   OR RIGHT(REGEXP_REPLACE(phone, '\D', '', 'g'), 10) = RIGHT(REGEXP_REPLACE($1, '\D', '', 'g'), 10)
		ORDER BY CASE WHEN status = 'ACTIVE' THEN 1 WHEN status = 'PROFILE_COMPLETED' THEN 2 WHEN status = 'OTP_VERIFIED' THEN 3 ELSE 4 END, created_at DESC
		LIMIT 1;
	`
	row := r.db.Pool.QueryRow(ctx, query, normPhone, phone)
	return r.scanUserRow(row)
}

func (r *UserRepository) GetBySupabaseUID(ctx context.Context, uid string) (*domain.User, error) {
	query := `
		SELECT id, supabase_uid, COALESCE(email, ''), COALESCE(phone, ''), full_name, COALESCE(avatar_url, ''), COALESCE(bio, ''),
		       COALESCE(ST_Y(location::geometry), 0.0) as lat, COALESCE(ST_X(location::geometry), 0.0) as lng,
		       COALESCE(address_text, ''), COALESCE(aadhaar_number, ''), trust_score, is_verified,
		       status, role, mobile_verified, COALESCE(otp_code, ''), otp_expires_at, face_verified, face_verified_at, COALESCE(face_verification_ref, ''),
		       invited_by, invited_at, created_at, updated_at
		FROM users
		WHERE supabase_uid = $1;
	`
	row := r.db.Pool.QueryRow(ctx, query, uid)
	return r.scanUserRow(row)
}

func (r *UserRepository) GetByID(ctx context.Context, id uuid.UUID) (*domain.User, error) {
	query := `
		SELECT id, supabase_uid, COALESCE(email, ''), COALESCE(phone, ''), full_name, COALESCE(avatar_url, ''), COALESCE(bio, ''),
		       COALESCE(ST_Y(location::geometry), 0.0) as lat, COALESCE(ST_X(location::geometry), 0.0) as lng,
		       COALESCE(address_text, ''), COALESCE(aadhaar_number, ''), trust_score, is_verified,
		       status, role, mobile_verified, COALESCE(otp_code, ''), otp_expires_at, face_verified, face_verified_at, COALESCE(face_verification_ref, ''),
		       invited_by, invited_at, created_at, updated_at
		FROM users
		WHERE id = $1;
	`
	row := r.db.Pool.QueryRow(ctx, query, id)
	return r.scanUserRow(row)
}

func (r *UserRepository) ListUsers(ctx context.Context) ([]*domain.User, error) {
	query := `
		SELECT id, supabase_uid, COALESCE(email, ''), COALESCE(phone, ''), full_name, COALESCE(avatar_url, ''), COALESCE(bio, ''),
		       COALESCE(ST_Y(location::geometry), 0.0) as lat, COALESCE(ST_X(location::geometry), 0.0) as lng,
		       COALESCE(address_text, ''), COALESCE(aadhaar_number, ''), trust_score, is_verified,
		       status, role, mobile_verified, COALESCE(otp_code, ''), otp_expires_at, face_verified, face_verified_at, COALESCE(face_verification_ref, ''),
		       invited_by, invited_at, created_at, updated_at
		FROM users
		ORDER BY created_at DESC;
	`
	rows, err := r.db.Pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to list users: %w", err)
	}
	defer rows.Close()

	var users []*domain.User
	for rows.Next() {
		u, err := r.scanUserRow(rows)
		if err != nil {
			return nil, err
		}
		users = append(users, u)
	}

	return users, nil
}


func (r *UserRepository) SignupUser(ctx context.Context, fullName, phone, email string) (*domain.User, error) {
	normPhone := NormalizePhone(phone)
	fullName = strings.TrimSpace(fullName)
	email = strings.TrimSpace(email)

	user, err := r.GetByPhone(ctx, normPhone)
	if err == nil && user != nil {
		// Update details if user is in pending status
		if user.Status == domain.StatusPending && (fullName != "" || email != "") {
			updateQuery := `
				UPDATE users
				SET full_name = CASE WHEN $2 != '' THEN $2 ELSE full_name END,
				    email = CASE WHEN $3 != '' THEN $3 ELSE email END,
				    updated_at = NOW()
				WHERE id = $1
				RETURNING id, supabase_uid, COALESCE(email, ''), COALESCE(phone, ''), full_name, COALESCE(avatar_url, ''), COALESCE(bio, ''), 
				          COALESCE(ST_Y(location::geometry), 0.0) as lat, COALESCE(ST_X(location::geometry), 0.0) as lng, COALESCE(address_text, ''), COALESCE(aadhaar_number, ''), trust_score, is_verified,
				          status, role, mobile_verified, COALESCE(otp_code, ''), otp_expires_at, face_verified, face_verified_at, COALESCE(face_verification_ref, ''),
				          invited_by, invited_at, created_at, updated_at;
			`
			row := r.db.Pool.QueryRow(ctx, updateQuery, user.ID, fullName, email)
			return r.scanUserRow(row)
		}
		return user, nil
	}

	supabaseUID := fmt.Sprintf("phone_%s_%d", uuid.New().String()[:8], time.Now().Unix())
	if fullName == "" {
		fullName = "New Platform User"
	}

	query := `
		INSERT INTO users (supabase_uid, phone, full_name, email, status, role, mobile_verified)
		VALUES ($1, $2, $3, NULLIF($4, ''), 'PENDING', 'USER', FALSE)
		ON CONFLICT (phone) DO UPDATE SET full_name = EXCLUDED.full_name, email = NULLIF(EXCLUDED.email, ''), updated_at = NOW()
		RETURNING id, supabase_uid, COALESCE(email, ''), COALESCE(phone, ''), full_name, COALESCE(avatar_url, ''), COALESCE(bio, ''), 
		          COALESCE(ST_Y(location::geometry), 0.0) as lat, COALESCE(ST_X(location::geometry), 0.0) as lng, COALESCE(address_text, ''), COALESCE(aadhaar_number, ''), trust_score, is_verified,
		          status, role, mobile_verified, COALESCE(otp_code, ''), otp_expires_at, face_verified, face_verified_at, COALESCE(face_verification_ref, ''),
		          invited_by, invited_at, created_at, updated_at;
	`
	row := r.db.Pool.QueryRow(ctx, query, supabaseUID, normPhone, fullName, email)
	return r.scanUserRow(row)
}

func (r *UserRepository) CreateOrGetByPhone(ctx context.Context, phone string) (*domain.User, error) {
	normPhone := NormalizePhone(phone)
	user, err := r.GetByPhone(ctx, normPhone)
	if err == nil && user != nil {
		return user, nil
	}

	// Auto-create pending user for new phone numbers
	supabaseUID := fmt.Sprintf("phone_%s_%d", uuid.New().String()[:8], time.Now().Unix())
	query := `
		INSERT INTO users (supabase_uid, phone, full_name, status, role, mobile_verified)
		VALUES ($1, $2, 'New Platform User', 'PENDING', 'USER', FALSE)
		ON CONFLICT (phone) DO UPDATE SET updated_at = NOW()
		RETURNING id, supabase_uid, COALESCE(email, ''), COALESCE(phone, ''), full_name, COALESCE(avatar_url, ''), COALESCE(bio, ''), 
		          COALESCE(ST_Y(location::geometry), 0.0) as lat, COALESCE(ST_X(location::geometry), 0.0) as lng, COALESCE(address_text, ''), COALESCE(aadhaar_number, ''), trust_score, is_verified,
		          status, role, mobile_verified, COALESCE(otp_code, ''), otp_expires_at, face_verified, face_verified_at, COALESCE(face_verification_ref, ''),
		          invited_by, invited_at, created_at, updated_at;
	`
	row := r.db.Pool.QueryRow(ctx, query, supabaseUID, normPhone)
	return r.scanUserRow(row)
}


func (r *UserRepository) CreateOTPRecord(ctx context.Context, phone, otpCode string, expiresAt time.Time) (*domain.User, error) {
	normPhone := NormalizePhone(phone)
	otpCode = strings.TrimSpace(otpCode)

	// 1. Ensure user exists
	user, err := r.CreateOrGetByPhone(ctx, normPhone)
	if err != nil || user == nil {
		return nil, fmt.Errorf("failed to auto-create or fetch user for phone %s: %v", normPhone, err)
	}

	// 2. Insert record into user_otps table
	otpQuery := `
		INSERT INTO user_otps (phone, otp_code, expires_at, is_verified, attempts)
		VALUES ($1, $2, $3, FALSE, 0);
	`
	_, err = r.db.Pool.Exec(ctx, otpQuery, user.Phone, otpCode, expiresAt)
	if err != nil {
		log.Printf("[USER REPO WARN] Insert user_otps warning: %v\n", err)
	}

	// 3. Update user table by Primary Key ID
	updateQuery := `
		UPDATE users
		SET otp_code = $2,
		    otp_expires_at = $3,
		    updated_at = NOW()
		WHERE id = $1
		RETURNING id, supabase_uid, COALESCE(email, ''), COALESCE(phone, ''), full_name, COALESCE(avatar_url, ''), COALESCE(bio, ''), 
		          COALESCE(ST_Y(location::geometry), 0.0) as lat, COALESCE(ST_X(location::geometry), 0.0) as lng, COALESCE(address_text, ''), COALESCE(aadhaar_number, ''), trust_score, is_verified,
		          status, role, mobile_verified, COALESCE(otp_code, ''), otp_expires_at, face_verified, face_verified_at, COALESCE(face_verification_ref, ''),
		          invited_by, invited_at, created_at, updated_at;
	`
	row := r.db.Pool.QueryRow(ctx, updateQuery, user.ID, otpCode, expiresAt)
	return r.scanUserRow(row)
}


func (r *UserRepository) VerifyOTPRecord(ctx context.Context, phone, otpCode string, isDevMode bool) (*domain.User, error) {
	phone = strings.TrimSpace(phone)
	otpCode = strings.TrimSpace(otpCode)

	// 1. Fetch user record with flexible phone matching (+91... vs 9876...)
	user, err := r.GetByPhone(ctx, phone)
	if err != nil || user == nil {
		cleanPhone := strings.TrimPrefix(phone, "+")
		user, err = r.GetByPhone(ctx, cleanPhone)
		if err != nil || user == nil {
			user, err = r.GetByPhone(ctx, "+"+cleanPhone)
		}
	}

	if user == nil {
		log.Printf("[VERIFY OTP DEBUG] User not found for input phone: '%s'\n", phone)
		return nil, fmt.Errorf("user with mobile phone number %s not found", phone)
	}

	log.Printf("[VERIFY OTP DEBUG] Found user ID: %s, Phone: '%s', Stored OTPCode: '%s', Input OTPCode: '%s', isDevMode: %t\n",
		user.ID, user.Phone, user.OTPCode, otpCode, isDevMode)

	// 2. Validate OTP code against dev bypass (123456/777888), stored user.OTPCode, or user_otps table
	isValid := (isDevMode && (otpCode == "123456" || otpCode == "777888")) ||
		(user.OTPCode != "" && user.OTPCode == otpCode)


	if !isValid {
		var count int
		cleanP := strings.ReplaceAll(phone, "+", "")
		otpCheckQuery := `
			SELECT COUNT(*) FROM user_otps
			WHERE (phone = $1 OR phone = $2 OR REPLACE(phone, '+', '') = $3)
			  AND otp_code = $4 AND is_verified = FALSE;
		`
		_ = r.db.Pool.QueryRow(ctx, otpCheckQuery, phone, user.Phone, cleanP, otpCode).Scan(&count)
		if count > 0 {
			isValid = true
		}
	}

	if !isValid {
		return nil, fmt.Errorf("invalid or expired OTP code")
	}

	// 3. Promote user status to OTP_VERIFIED
	updateUserQuery := `
		UPDATE users
		SET mobile_verified = TRUE,
		    status = CASE WHEN status = 'PENDING' THEN 'OTP_VERIFIED' ELSE status END,
		    otp_code = NULL,
		    updated_at = NOW()
		WHERE id = $1
		RETURNING id, supabase_uid, COALESCE(email, ''), COALESCE(phone, ''), full_name, COALESCE(avatar_url, ''), COALESCE(bio, ''), 
		          COALESCE(ST_Y(location::geometry), 0.0) as lat, COALESCE(ST_X(location::geometry), 0.0) as lng, COALESCE(address_text, ''), COALESCE(aadhaar_number, ''), trust_score, is_verified,
		          status, role, mobile_verified, COALESCE(otp_code, ''), otp_expires_at, face_verified, face_verified_at, COALESCE(face_verification_ref, ''),
		          invited_by, invited_at, created_at, updated_at;
	`
	row := r.db.Pool.QueryRow(ctx, updateUserQuery, user.ID)
	updatedUser, err := r.scanUserRow(row)
	if err != nil || updatedUser == nil {
		return nil, fmt.Errorf("failed to update user status")
	}

	// 4. Mark user_otps record as verified
	markOTPQuery := `
		UPDATE user_otps
		SET is_verified = TRUE, updated_at = NOW()
		WHERE (phone = $1 OR phone = $2) AND is_verified = FALSE;
	`
	_, _ = r.db.Pool.Exec(ctx, markOTPQuery, phone, user.Phone)

	return r.ActivateIfEligible(ctx, updatedUser.ID)
}

func (r *UserRepository) scanUserSkillAssetRow(row pgx.Row) (*domain.UserSkillAsset, error) {
	var asset domain.UserSkillAsset
	var statusStr string
	var catID *uuid.UUID

	err := row.Scan(
		&asset.ID, &asset.UserID, &catID, &asset.AssetType, &asset.Title, &asset.Description,
		&asset.HourlyRate, &asset.DailyRate, &asset.IsAvailable, &statusStr, &asset.RejectionReason,
		&asset.Documents, &asset.Lat, &asset.Lng, &asset.Attributes, &asset.CreatedAt, &asset.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	asset.Status = domain.ServiceAssetStatus(statusStr)
	asset.CategoryID = catID
	return &asset, nil
}

func (r *UserRepository) AddUserSkillAsset(ctx context.Context, userID uuid.UUID, categoryID *uuid.UUID, assetType, title, description string, hourlyRate, dailyRate *float64) (*domain.UserSkillAsset, error) {
	query := `
		INSERT INTO user_skills_assets (user_id, category_id, asset_type, title, description, hourly_rate, daily_rate, status, is_available)
		VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING_APPROVAL', FALSE)
		RETURNING id, user_id, category_id, asset_type, title, COALESCE(description, ''), hourly_rate, daily_rate, is_available,
		          COALESCE(status, 'PENDING_APPROVAL'), COALESCE(rejection_reason, ''), COALESCE(documents, '{}'::jsonb),
		          COALESCE(ST_Y(current_location::geometry), 0.0) as lat, COALESCE(ST_X(current_location::geometry), 0.0) as lng,
		          COALESCE(attributes, '{}'::jsonb), created_at, updated_at;
	`
	row := r.db.Pool.QueryRow(ctx, query, userID, categoryID, assetType, title, description, hourlyRate, dailyRate)
	return r.scanUserSkillAssetRow(row)
}

func (r *UserRepository) AddUserSkillAssetWithAttributes(ctx context.Context, userID uuid.UUID, categoryID *uuid.UUID, assetType, title, description string, hourlyRate, dailyRate *float64, lat, lng float64, attributesJSON string, autoApprove bool) (*domain.UserSkillAsset, error) {
	status := "PENDING_APPROVAL"
	isAvail := false
	if autoApprove {
		status = "ACTIVE"
		isAvail = true
	}
	if attributesJSON == "" {
		attributesJSON = "{}"
	}

	query := `
		INSERT INTO user_skills_assets (user_id, category_id, asset_type, title, description, hourly_rate, daily_rate, current_location, attributes, status, is_available)
		VALUES ($1, $2, $3, $4, $5, $6, $7, ST_SetSRID(ST_MakePoint($9, $8), 4326), $10::jsonb, $11, $12)
		RETURNING id, user_id, category_id, asset_type, title, COALESCE(description, ''), hourly_rate, daily_rate, is_available,
		          COALESCE(status, 'PENDING_APPROVAL'), COALESCE(rejection_reason, ''), COALESCE(documents, '{}'::jsonb),
		          COALESCE(ST_Y(current_location::geometry), 0.0) as lat, COALESCE(ST_X(current_location::geometry), 0.0) as lng,
		          COALESCE(attributes, '{}'::jsonb), created_at, updated_at;
	`
	row := r.db.Pool.QueryRow(ctx, query, userID, categoryID, assetType, title, description, hourlyRate, dailyRate, lat, lng, attributesJSON, status, isAvail)
	return r.scanUserSkillAssetRow(row)
}

func (r *UserRepository) SubmitSkillAssetDocuments(ctx context.Context, assetID, userID uuid.UUID, documentsJSON string) (*domain.UserSkillAsset, error) {
	query := `
		UPDATE user_skills_assets
		SET documents = $3::jsonb,
		    status = 'UNDER_REVIEW',
		    rejection_reason = NULL,
		    updated_at = NOW()
		WHERE id = $1 AND user_id = $2
		RETURNING id, user_id, category_id, asset_type, title, COALESCE(description, ''), hourly_rate, daily_rate, is_available,
		          COALESCE(status, 'UNDER_REVIEW'), COALESCE(rejection_reason, ''), COALESCE(documents, '{}'::jsonb),
		          COALESCE(ST_Y(current_location::geometry), 0.0) as lat, COALESCE(ST_X(current_location::geometry), 0.0) as lng,
		          COALESCE(attributes, '{}'::jsonb), created_at, updated_at;
	`
	row := r.db.Pool.QueryRow(ctx, query, assetID, userID, documentsJSON)
	return r.scanUserSkillAssetRow(row)
}

func (r *UserRepository) GetUserSkillsAssets(ctx context.Context, userID uuid.UUID) ([]*domain.UserSkillAsset, error) {
	query := `
		SELECT sa.id, sa.user_id, sa.category_id, sa.asset_type, sa.title, COALESCE(sa.description, ''),
		       sa.hourly_rate, sa.daily_rate, sa.is_available, COALESCE(sa.status, 'PENDING_APPROVAL'),
		       COALESCE(sa.rejection_reason, ''), COALESCE(sa.documents, '{}'::jsonb),
		       COALESCE(ST_Y(sa.current_location::geometry), 0.0) as lat, COALESCE(ST_X(sa.current_location::geometry), 0.0) as lng,
		       COALESCE(sa.attributes, '{}'::jsonb), sa.created_at, sa.updated_at
		FROM user_skills_assets sa
		WHERE sa.user_id = $1
		ORDER BY sa.created_at DESC;
	`
	rows, err := r.db.Pool.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []*domain.UserSkillAsset
	for rows.Next() {
		asset, err := r.scanUserSkillAssetRow(rows)
		if err != nil {
			return nil, err
		}

		if asset.CategoryID != nil {
			catQuery := `SELECT id, slug, name, COALESCE(description, ''), COALESCE(icon, ''), default_workflow, COALESCE(required_documents, '[]'::jsonb), COALESCE(opportunity_fields, '[]'::jsonb), COALESCE(resources, '[]'::jsonb) FROM categories WHERE id = $1;`
			var c domain.Category
			if err := r.db.Pool.QueryRow(ctx, catQuery, *asset.CategoryID).Scan(&c.ID, &c.Slug, &c.Name, &c.Description, &c.Icon, &c.DefaultWorkflow, &c.RequiredDocuments, &c.OpportunityFields, &c.Resources); err == nil {
				asset.Category = &c
			}
		}

		list = append(list, asset)
	}
	return list, nil
}

// GetActiveUserSkillsAssets queries ONLY ACTIVE and available provider services for public customer storefronts
func (r *UserRepository) GetActiveUserSkillsAssets(ctx context.Context, userID uuid.UUID) ([]*domain.UserSkillAsset, error) {
	query := `
		SELECT sa.id, sa.user_id, sa.category_id, sa.asset_type, sa.title, COALESCE(sa.description, ''),
		       sa.hourly_rate, sa.daily_rate, sa.is_available, COALESCE(sa.status, 'PENDING_APPROVAL'),
		       COALESCE(sa.rejection_reason, ''), COALESCE(sa.documents, '{}'::jsonb),
		       COALESCE(ST_Y(sa.current_location::geometry), 0.0) as lat, COALESCE(ST_X(sa.current_location::geometry), 0.0) as lng,
		       COALESCE(sa.attributes, '{}'::jsonb), sa.created_at, sa.updated_at
		FROM user_skills_assets sa
		WHERE sa.user_id = $1
		  AND sa.status IN ('ACTIVE', 'APPROVED')
		  AND sa.is_available = TRUE
		ORDER BY sa.created_at DESC;
	`
	rows, err := r.db.Pool.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []*domain.UserSkillAsset
	for rows.Next() {
		asset, err := r.scanUserSkillAssetRow(rows)
		if err != nil {
			return nil, err
		}

		if asset.CategoryID != nil {
			catQuery := `SELECT id, slug, name, COALESCE(description, ''), COALESCE(icon, ''), default_workflow, COALESCE(required_documents, '[]'::jsonb), COALESCE(opportunity_fields, '[]'::jsonb), COALESCE(resources, '[]'::jsonb) FROM categories WHERE id = $1;`
			var c domain.Category
			if err := r.db.Pool.QueryRow(ctx, catQuery, *asset.CategoryID).Scan(&c.ID, &c.Slug, &c.Name, &c.Description, &c.Icon, &c.DefaultWorkflow, &c.RequiredDocuments, &c.OpportunityFields, &c.Resources); err == nil {
				asset.Category = &c
			}
		}

		list = append(list, asset)
	}
	return list, nil
}

func (r *UserRepository) ListAllUserSkillAssetRequests(ctx context.Context, statusFilter string) ([]*domain.UserSkillAsset, error) {
	query := `
		SELECT sa.id, sa.user_id, sa.category_id, sa.asset_type, sa.title, COALESCE(sa.description, ''),
		       sa.hourly_rate, sa.daily_rate, sa.is_available, COALESCE(sa.status, 'PENDING_APPROVAL'),
		       COALESCE(sa.rejection_reason, ''), COALESCE(sa.documents, '{}'::jsonb),
		       COALESCE(ST_Y(sa.current_location::geometry), 0.0) as lat, COALESCE(ST_X(sa.current_location::geometry), 0.0) as lng,
		       COALESCE(sa.attributes, '{}'::jsonb), sa.created_at, sa.updated_at
		FROM user_skills_assets sa
		WHERE ($1 = '' OR $1 = 'ALL' OR COALESCE(sa.status, 'PENDING_APPROVAL') = $1)
		ORDER BY sa.updated_at DESC;
	`
	rows, err := r.db.Pool.Query(ctx, query, statusFilter)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []*domain.UserSkillAsset
	for rows.Next() {
		asset, err := r.scanUserSkillAssetRow(rows)
		if err != nil {
			return nil, err
		}

		// Attach user details
		u, _ := r.GetByID(ctx, asset.UserID)
		asset.User = u

		// Attach category details
		if asset.CategoryID != nil {
			catQuery := `SELECT id, slug, name, COALESCE(description, ''), COALESCE(icon, ''), default_workflow, COALESCE(required_documents, '[]'::jsonb) FROM categories WHERE id = $1;`
			var c domain.Category
			if err := r.db.Pool.QueryRow(ctx, catQuery, *asset.CategoryID).Scan(&c.ID, &c.Slug, &c.Name, &c.Description, &c.Icon, &c.DefaultWorkflow, &c.RequiredDocuments); err == nil {
				asset.Category = &c
			}
		}

		list = append(list, asset)
	}
	return list, nil
}

func (r *UserRepository) AdminApproveServiceRequest(ctx context.Context, assetID uuid.UUID) (*domain.UserSkillAsset, error) {
	query := `
		UPDATE user_skills_assets
		SET status = 'DOCUMENTS_PENDING',
		    rejection_reason = NULL,
		    updated_at = NOW()
		WHERE id = $1
		RETURNING id, user_id, category_id, asset_type, title, COALESCE(description, ''), hourly_rate, daily_rate, is_available,
		          COALESCE(status, 'DOCUMENTS_PENDING'), COALESCE(rejection_reason, ''), COALESCE(documents, '{}'::jsonb),
		          COALESCE(ST_Y(current_location::geometry), 0.0) as lat, COALESCE(ST_X(current_location::geometry), 0.0) as lng,
		          COALESCE(attributes, '{}'::jsonb), created_at, updated_at;
	`
	row := r.db.Pool.QueryRow(ctx, query, assetID)
	return r.scanUserSkillAssetRow(row)
}

func (r *UserRepository) AdminReviewDocuments(ctx context.Context, assetID uuid.UUID, approve bool, rejectionReason string) (*domain.UserSkillAsset, error) {
	var query string
	if approve {
		query = `
			UPDATE user_skills_assets
			SET status = 'ACTIVE',
			    is_available = TRUE,
			    rejection_reason = NULL,
			    updated_at = NOW()
			WHERE id = $1
			RETURNING id, user_id, category_id, asset_type, title, COALESCE(description, ''), hourly_rate, daily_rate, is_available,
			          COALESCE(status, 'ACTIVE'), COALESCE(rejection_reason, ''), COALESCE(documents, '{}'::jsonb),
			          COALESCE(ST_Y(current_location::geometry), 0.0) as lat, COALESCE(ST_X(current_location::geometry), 0.0) as lng,
			          COALESCE(attributes, '{}'::jsonb), created_at, updated_at;
		`
		row := r.db.Pool.QueryRow(ctx, query, assetID)
		return r.scanUserSkillAssetRow(row)
	}

	query = `
		UPDATE user_skills_assets
		SET status = 'REJECTED',
		    is_available = FALSE,
		    rejection_reason = $2,
		    updated_at = NOW()
		WHERE id = $1
		RETURNING id, user_id, category_id, asset_type, title, COALESCE(description, ''), hourly_rate, daily_rate, is_available,
		          COALESCE(status, 'REJECTED'), COALESCE(rejection_reason, ''), COALESCE(documents, '{}'::jsonb),
		          COALESCE(ST_Y(current_location::geometry), 0.0) as lat, COALESCE(ST_X(current_location::geometry), 0.0) as lng,
		          COALESCE(attributes, '{}'::jsonb), created_at, updated_at;
	`
	row := r.db.Pool.QueryRow(ctx, query, assetID, rejectionReason)
	return r.scanUserSkillAssetRow(row)
}

func (r *UserRepository) DeleteUserSkillAsset(ctx context.Context, assetID, userID uuid.UUID) error {
	query := `DELETE FROM user_skills_assets WHERE id = $1 AND user_id = $2;`
	_, err := r.db.Pool.Exec(ctx, query, assetID, userID)
	return err
}

// User Saved Addresses Repository Methods

func (r *UserRepository) GetUserAddresses(ctx context.Context, userID uuid.UUID) ([]*domain.UserAddress, error) {
	query := `
		SELECT id, user_id, label, address_text, lat, lng,
		       COALESCE(landmark, ''), COALESCE(receiver_name, ''), COALESCE(receiver_phone, ''),
		       is_default, created_at, updated_at
		FROM user_addresses
		WHERE user_id = $1
		ORDER BY is_default DESC, created_at DESC;
	`
	rows, err := r.db.Pool.Query(ctx, query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []*domain.UserAddress
	for rows.Next() {
		var addr domain.UserAddress
		if err := rows.Scan(
			&addr.ID, &addr.UserID, &addr.Label, &addr.AddressText, &addr.Lat, &addr.Lng,
			&addr.Landmark, &addr.ReceiverName, &addr.ReceiverPhone,
			&addr.IsDefault, &addr.CreatedAt, &addr.UpdatedAt,
		); err != nil {
			return nil, err
		}
		list = append(list, &addr)
	}
	return list, nil
}

func (r *UserRepository) GetAddressByID(ctx context.Context, addressID uuid.UUID) (*domain.UserAddress, error) {
	query := `
		SELECT id, user_id, label, address_text, lat, lng,
		       COALESCE(landmark, ''), COALESCE(receiver_name, ''), COALESCE(receiver_phone, ''),
		       is_default, created_at, updated_at
		FROM user_addresses
		WHERE id = $1;
	`
	var addr domain.UserAddress
	err := r.db.Pool.QueryRow(ctx, query, addressID).Scan(
		&addr.ID, &addr.UserID, &addr.Label, &addr.AddressText, &addr.Lat, &addr.Lng,
		&addr.Landmark, &addr.ReceiverName, &addr.ReceiverPhone,
		&addr.IsDefault, &addr.CreatedAt, &addr.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &addr, nil
}

func (r *UserRepository) CreateUserAddress(ctx context.Context, addr *domain.UserAddress) (*domain.UserAddress, error) {
	// If this address is set to default, clear previous default address for this user
	if addr.IsDefault {
		_ = r.clearUserDefaultAddress(ctx, addr.UserID)
	} else {
		// If user has no existing addresses, make this first address default automatically
		var count int
		_ = r.db.Pool.QueryRow(ctx, `SELECT COUNT(*) FROM user_addresses WHERE user_id = $1;`, addr.UserID).Scan(&count)
		if count == 0 {
			addr.IsDefault = true
		}
	}

	query := `
		INSERT INTO user_addresses (user_id, label, address_text, location, lat, lng, landmark, receiver_name, receiver_phone, is_default)
		VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($5, $4), 4326)::geography, $4, $5, $6, $7, $8, $9)
		RETURNING id, user_id, label, address_text, lat, lng,
		          COALESCE(landmark, ''), COALESCE(receiver_name, ''), COALESCE(receiver_phone, ''),
		          is_default, created_at, updated_at;
	`
	var created domain.UserAddress
	err := r.db.Pool.QueryRow(
		ctx, query,
		addr.UserID, addr.Label, addr.AddressText, addr.Lat, addr.Lng,
		addr.Landmark, addr.ReceiverName, addr.ReceiverPhone, addr.IsDefault,
	).Scan(
		&created.ID, &created.UserID, &created.Label, &created.AddressText, &created.Lat, &created.Lng,
		&created.Landmark, &created.ReceiverName, &created.ReceiverPhone,
		&created.IsDefault, &created.CreatedAt, &created.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	if created.IsDefault {
		_ = r.syncUserProfileAddress(ctx, created.UserID, created.AddressText, created.Lat, created.Lng)
	}
	return &created, nil
}


func (r *UserRepository) UpdateUserAddress(ctx context.Context, addr *domain.UserAddress) (*domain.UserAddress, error) {
	if addr.IsDefault {
		_ = r.clearUserDefaultAddress(ctx, addr.UserID)
	}

	query := `
		UPDATE user_addresses
		SET label = $3,
		    address_text = $4,
		    location = ST_SetSRID(ST_MakePoint($6, $5), 4326)::geography,
		    lat = $5,
		    lng = $6,
		    landmark = $7,
		    receiver_name = $8,
		    receiver_phone = $9,
		    is_default = $10,
		    updated_at = NOW()
		WHERE id = $1 AND user_id = $2
		RETURNING id, user_id, label, address_text, lat, lng,
		          COALESCE(landmark, ''), COALESCE(receiver_name, ''), COALESCE(receiver_phone, ''),
		          is_default, created_at, updated_at;
	`
	var updated domain.UserAddress
	err := r.db.Pool.QueryRow(
		ctx, query,
		addr.ID, addr.UserID, addr.Label, addr.AddressText, addr.Lat, addr.Lng,
		addr.Landmark, addr.ReceiverName, addr.ReceiverPhone, addr.IsDefault,
	).Scan(
		&updated.ID, &updated.UserID, &updated.Label, &updated.AddressText, &updated.Lat, &updated.Lng,
		&updated.Landmark, &updated.ReceiverName, &updated.ReceiverPhone,
		&updated.IsDefault, &updated.CreatedAt, &updated.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	return &updated, nil
}

func (r *UserRepository) SetDefaultAddress(ctx context.Context, userID, addressID uuid.UUID) (*domain.UserAddress, error) {
	if err := r.clearUserDefaultAddress(ctx, userID); err != nil {
		return nil, err
	}

	query := `
		UPDATE user_addresses
		SET is_default = TRUE, updated_at = NOW()
		WHERE id = $1 AND user_id = $2
		RETURNING id, user_id, label, address_text, lat, lng,
		          COALESCE(landmark, ''), COALESCE(receiver_name, ''), COALESCE(receiver_phone, ''),
		          is_default, created_at, updated_at;
	`
	var updated domain.UserAddress
	err := r.db.Pool.QueryRow(ctx, query, addressID, userID).Scan(
		&updated.ID, &updated.UserID, &updated.Label, &updated.AddressText, &updated.Lat, &updated.Lng,
		&updated.Landmark, &updated.ReceiverName, &updated.ReceiverPhone,
		&updated.IsDefault, &updated.CreatedAt, &updated.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}
	if updated.IsDefault {
		_ = r.syncUserProfileAddress(ctx, updated.UserID, updated.AddressText, updated.Lat, updated.Lng)
	}
	return &updated, nil
}

func (r *UserRepository) syncUserProfileAddress(ctx context.Context, userID uuid.UUID, addressText string, lat, lng float64) error {
	query := `
		UPDATE users
		SET address_text = $2,
		    location = ST_SetSRID(ST_MakePoint($4, $3), 4326)::geography,
		    updated_at = NOW()
		WHERE id = $1;
	`
	_, err := r.db.Pool.Exec(ctx, query, userID, addressText, lat, lng)
	return err
}


func (r *UserRepository) DeleteUserAddress(ctx context.Context, userID, addressID uuid.UUID) error {
	// First check if deleted address was default
	var wasDefault bool
	_ = r.db.Pool.QueryRow(ctx, `SELECT is_default FROM user_addresses WHERE id = $1 AND user_id = $2;`, addressID, userID).Scan(&wasDefault)

	query := `DELETE FROM user_addresses WHERE id = $1 AND user_id = $2;`
	if _, err := r.db.Pool.Exec(ctx, query, addressID, userID); err != nil {
		return err
	}

	// If default was deleted, promote another address to default if available
	if wasDefault {
		promoteQuery := `
			UPDATE user_addresses
			SET is_default = TRUE, updated_at = NOW()
			WHERE id = (
				SELECT id FROM user_addresses WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1
			);
		`
		_, _ = r.db.Pool.Exec(ctx, promoteQuery, userID)
	}
	return nil
}

func (r *UserRepository) clearUserDefaultAddress(ctx context.Context, userID uuid.UUID) error {
	query := `UPDATE user_addresses SET is_default = FALSE WHERE user_id = $1;`
	_, err := r.db.Pool.Exec(ctx, query, userID)
	return err
}

func (r *UserRepository) CreateNotification(ctx context.Context, notif *domain.Notification) (*domain.Notification, error) {
	query := `
		INSERT INTO notifications (user_id, title, message, type, metadata)
		VALUES ($1, $2, $3, COALESCE(NULLIF($4, ''), 'INFO'), COALESCE($5, '{}'::jsonb))
		RETURNING id, user_id, title, message, type, COALESCE(metadata, '{}'::jsonb), is_read, created_at;
	`
	row := r.db.Pool.QueryRow(ctx, query, notif.UserID, notif.Title, notif.Message, notif.Type, notif.Metadata)
	var res domain.Notification
	err := row.Scan(&res.ID, &res.UserID, &res.Title, &res.Message, &res.Type, &res.Metadata, &res.IsRead, &res.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("failed to create notification: %w", err)
	}
	return &res, nil
}

// CreateNotificationIdempotent inserts a notification only if one with the same dedupeKey does not exist for this user.
// Returns (notification, wasCreated, error).
func (r *UserRepository) CreateNotificationIdempotent(ctx context.Context, notif *domain.Notification, dedupeKey string) (*domain.Notification, bool, error) {
	if dedupeKey == "" {
		res, err := r.CreateNotification(ctx, notif)
		return res, err == nil, err
	}

	// First check if a notification with this dedupeKey already exists for this user
	checkQuery := `
		SELECT id, user_id, title, message, type, COALESCE(metadata, '{}'::jsonb), is_read, created_at
		FROM notifications
		WHERE user_id = $1 AND metadata->>'dedupe_key' = $2
		LIMIT 1;
	`
	var existing domain.Notification
	err := r.db.Pool.QueryRow(ctx, checkQuery, notif.UserID, dedupeKey).Scan(
		&existing.ID, &existing.UserID, &existing.Title, &existing.Message, &existing.Type, &existing.Metadata, &existing.IsRead, &existing.CreatedAt,
	)
	if err == nil {
		// Already exists -> idempotent no-op
		return &existing, false, nil
	}

	// Inject dedupeKey into metadata
	var meta map[string]interface{}
	if len(notif.Metadata) > 0 {
		_ = json.Unmarshal(notif.Metadata, &meta)
	}
	if meta == nil {
		meta = make(map[string]interface{})
	}
	meta["dedupe_key"] = dedupeKey
	notif.Metadata, _ = json.Marshal(meta)

	query := `
		INSERT INTO notifications (user_id, title, message, type, metadata)
		VALUES ($1, $2, $3, COALESCE(NULLIF($4, ''), 'INFO'), COALESCE($5, '{}'::jsonb))
		RETURNING id, user_id, title, message, type, COALESCE(metadata, '{}'::jsonb), is_read, created_at;
	`
	row := r.db.Pool.QueryRow(ctx, query, notif.UserID, notif.Title, notif.Message, notif.Type, notif.Metadata)
	var res domain.Notification
	if err := row.Scan(&res.ID, &res.UserID, &res.Title, &res.Message, &res.Type, &res.Metadata, &res.IsRead, &res.CreatedAt); err != nil {
		return nil, false, fmt.Errorf("failed to create notification: %w", err)
	}
	return &res, true, nil
}

func (r *UserRepository) GetUserNotifications(ctx context.Context, userID uuid.UUID) ([]*domain.Notification, error) {
	query := `
		SELECT id, user_id, title, message, type, COALESCE(metadata, '{}'::jsonb), is_read, created_at
		FROM notifications
		WHERE user_id = $1
		ORDER BY created_at DESC
		LIMIT 50;
	`
	rows, err := r.db.Pool.Query(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to query notifications: %w", err)
	}
	defer rows.Close()

	var list []*domain.Notification
	for rows.Next() {
		var n domain.Notification
		if err := rows.Scan(&n.ID, &n.UserID, &n.Title, &n.Message, &n.Type, &n.Metadata, &n.IsRead, &n.CreatedAt); err != nil {
			return nil, err
		}
		list = append(list, &n)
	}
	return list, nil
}

func (r *UserRepository) MarkNotificationAsRead(ctx context.Context, notifID, userID uuid.UUID) error {
	query := `UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2;`
	_, err := r.db.Pool.Exec(ctx, query, notifID, userID)
	return err
}

func (r *UserRepository) MarkAllNotificationsAsRead(ctx context.Context, userID uuid.UUID) error {
	query := `UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read = FALSE;`
	_, err := r.db.Pool.Exec(ctx, query, userID)
	return err
}

func (r *UserRepository) GetUnreadNotificationCount(ctx context.Context, userID uuid.UUID) (int, error) {
	query := `SELECT COUNT(*) FROM notifications WHERE user_id = $1 AND is_read = FALSE;`
	var count int
	err := r.db.Pool.QueryRow(ctx, query, userID).Scan(&count)
	return count, err
}

// FetchQueuedNotifications retrieves pending or queued notifications from the persistent queue
func (r *UserRepository) FetchQueuedNotifications(ctx context.Context, limit int) ([]*domain.Notification, error) {
	if r.db == nil || r.db.Pool == nil {
		return nil, nil
	}
	query := `
		SELECT id, user_id, title, message, type, COALESCE(metadata, '{}'::jsonb), is_read, created_at
		FROM notifications
		WHERE (metadata->>'status' = 'QUEUED' OR metadata->>'status' = 'PENDING')
		  AND (metadata->>'next_retry_at' IS NULL OR (metadata->>'next_retry_at')::timestamptz <= NOW())
		ORDER BY created_at ASC
		LIMIT $1;
	`
	rows, err := r.db.Pool.Query(ctx, query, limit)
	if err != nil {
		return nil, fmt.Errorf("failed fetching queued notifications: %w", err)
	}
	defer rows.Close()

	var list []*domain.Notification
	for rows.Next() {
		var n domain.Notification
		if err := rows.Scan(&n.ID, &n.UserID, &n.Title, &n.Message, &n.Type, &n.Metadata, &n.IsRead, &n.CreatedAt); err != nil {
			return nil, err
		}
		list = append(list, &n)
	}
	return list, nil
}

// UpdateNotificationDispatchStatus persists the final delivery status and gateway telemetry to the notification row
func (r *UserRepository) UpdateNotificationDispatchStatus(ctx context.Context, notifID uuid.UUID, status string, gateway string, attempts int, errorMsg string) error {
	if r.db == nil || r.db.Pool == nil {
		return nil
	}
	query := `
		UPDATE notifications
		SET locked_by = NULL,
		    locked_at = NULL,
		    metadata = jsonb_set(
			jsonb_set(
				jsonb_set(
					jsonb_set(
						COALESCE(metadata, '{}'::jsonb),
						'{status}', to_jsonb($2::text)
					),
					'{gateway}', to_jsonb($3::text)
				),
				'{attempts}', to_jsonb($4::int)
			),
			'{error}', to_jsonb($5::text)
		) || jsonb_build_object('dispatched_at', NOW()::text)
		WHERE id = $1;
	`
	_, err := r.db.Pool.Exec(ctx, query, notifID, status, gateway, attempts, errorMsg)
	return err
}

// ScheduleNotificationRetry updates notification back to QUEUED with next_retry_at, unlocking the record for future worker claims
func (r *UserRepository) ScheduleNotificationRetry(ctx context.Context, notifID uuid.UUID, attempts int, nextRetryAt time.Time, errorMsg string) error {
	if r.db == nil || r.db.Pool == nil {
		return nil
	}
	query := `
		UPDATE notifications
		SET locked_by = NULL,
		    locked_at = NULL,
		    metadata = jsonb_set(
				jsonb_set(
					jsonb_set(
						jsonb_set(
							COALESCE(metadata, '{}'::jsonb),
							'{status}', '"QUEUED"'::jsonb
						),
						'{attempts}', to_jsonb($2::int)
					),
					'{next_retry_at}', to_jsonb($3::text)
				),
				'{error}', to_jsonb($4::text)
			) || jsonb_build_object('retry_scheduled_at', NOW()::text)
		WHERE id = $1;
	`
	_, err := r.db.Pool.Exec(ctx, query, notifID, attempts, nextRetryAt.Format(time.RFC3339), errorMsg)
	return err
}

// FailNotification marks a notification permanently FAILED, releasing locks and preserving attempt counts
func (r *UserRepository) FailNotification(ctx context.Context, notifID uuid.UUID, attempts int, errorMsg string) error {
	if r.db == nil || r.db.Pool == nil {
		return nil
	}
	query := `
		UPDATE notifications
		SET locked_by = NULL,
		    locked_at = NULL,
		    metadata = jsonb_set(
				jsonb_set(
					jsonb_set(
						COALESCE(metadata, '{}'::jsonb),
						'{status}', '"FAILED"'::jsonb
					),
					'{attempts}', to_jsonb($2::int)
				),
				'{error}', to_jsonb($3::text)
			) || jsonb_build_object('failed_at', NOW()::text)
		WHERE id = $1;
	`
	_, err := r.db.Pool.Exec(ctx, query, notifID, attempts, errorMsg)
	return err
}

// RecoverStaleLocks finds notifications left in PROCESSING by dead workers and unlocks them back to QUEUED
func (r *UserRepository) RecoverStaleLocks(ctx context.Context, staleThreshold time.Duration) (int64, error) {
	if r.db == nil || r.db.Pool == nil {
		return 0, nil
	}
	intervalSec := int(staleThreshold.Seconds())
	if intervalSec <= 0 {
		intervalSec = 300
	}

	query := fmt.Sprintf(`
		UPDATE notifications
		SET locked_by = NULL,
		    locked_at = NULL,
		    metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{status}', '"QUEUED"')
		WHERE (metadata->>'status' = 'PROCESSING')
		  AND (locked_at IS NULL OR locked_at < NOW() - INTERVAL '%d seconds');
	`, intervalSec)

	res, err := r.db.Pool.Exec(ctx, query)
	if err != nil {
		if strings.Contains(err.Error(), "locked_by") || strings.Contains(err.Error(), "locked_at") {
			return 0, nil
		}
		return 0, err
	}
	return res.RowsAffected(), nil
}

// ============================================================================
// PHASE 7: NOTIFICATION PREFERENCES, FILTERING & GOVERNANCE METHODS
// ============================================================================

// GetNotificationPreferences retrieves channel and category preferences for a user
func (r *UserRepository) GetNotificationPreferences(ctx context.Context, userID uuid.UUID) (*domain.NotificationPreference, error) {
	defaultPref := &domain.NotificationPreference{
		UserID:             userID,
		InAppEnabled:       true,
		SMSEnabled:         true,
		PushEnabled:        true,
		DisabledCategories: []string{},
		CreatedAt:          time.Now(),
		UpdatedAt:          time.Now(),
	}

	if r.db == nil || r.db.Pool == nil {
		return defaultPref, nil
	}

	query := `
		SELECT user_id, in_app_enabled, sms_enabled, push_enabled, disabled_categories, created_at, updated_at
		FROM user_notification_preferences
		WHERE user_id = $1;
	`
	var pref domain.NotificationPreference
	err := r.db.Pool.QueryRow(ctx, query, userID).Scan(
		&pref.UserID,
		&pref.InAppEnabled,
		&pref.SMSEnabled,
		&pref.PushEnabled,
		&pref.DisabledCategories,
		&pref.CreatedAt,
		&pref.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) || strings.Contains(err.Error(), "does not exist") {
			return defaultPref, nil
		}
		return nil, fmt.Errorf("failed to get notification preferences: %w", err)
	}

	if pref.DisabledCategories == nil {
		pref.DisabledCategories = []string{}
	}
	return &pref, nil
}

// UpsertNotificationPreferences updates or creates user notification preferences
func (r *UserRepository) UpsertNotificationPreferences(ctx context.Context, pref *domain.NotificationPreference) error {
	if r.db == nil || r.db.Pool == nil {
		return nil
	}
	if pref == nil {
		return fmt.Errorf("preferences cannot be nil")
	}

	if pref.DisabledCategories == nil {
		pref.DisabledCategories = []string{}
	}

	query := `
		INSERT INTO user_notification_preferences (user_id, in_app_enabled, sms_enabled, push_enabled, disabled_categories, updated_at)
		VALUES ($1, $2, $3, $4, $5, NOW())
		ON CONFLICT (user_id) DO UPDATE
		SET in_app_enabled = EXCLUDED.in_app_enabled,
		    sms_enabled = EXCLUDED.sms_enabled,
		    push_enabled = EXCLUDED.push_enabled,
		    disabled_categories = EXCLUDED.disabled_categories,
		    updated_at = NOW();
	`
	_, err := r.db.Pool.Exec(ctx, query, pref.UserID, pref.InAppEnabled, pref.SMSEnabled, pref.PushEnabled, pref.DisabledCategories)
	if err != nil {
		return fmt.Errorf("failed to upsert notification preferences: %w", err)
	}
	return nil
}

// GetFilteredNotifications retrieves paginated notifications with optional type and read filtering
func (r *UserRepository) GetFilteredNotifications(ctx context.Context, filter *domain.NotificationFilter) (*domain.NotificationPage, error) {
	page := filter.Page
	if page <= 0 {
		page = 1
	}
	pageSize := filter.PageSize
	if pageSize <= 0 || pageSize > 100 {
		pageSize = 20
	}
	offset := (page - 1) * pageSize

	res := &domain.NotificationPage{
		Notifications: []*domain.Notification{},
		TotalCount:    0,
		Page:          page,
		PageSize:      pageSize,
		UnreadCount:   0,
	}

	if r.db == nil || r.db.Pool == nil {
		return res, nil
	}

	// 1. Fetch unread count for user
	unreadCount, _ := r.GetUnreadNotificationCount(ctx, filter.UserID)
	res.UnreadCount = unreadCount

	// 2. Build dynamic where clause
	whereClauses := []string{"user_id = $1"}
	args := []interface{}{filter.UserID}
	argIdx := 2

	if filter.Type != "" {
		whereClauses = append(whereClauses, fmt.Sprintf("type = $%d", argIdx))
		args = append(args, filter.Type)
		argIdx++
	}

	if filter.UnreadOnly != nil && *filter.UnreadOnly {
		whereClauses = append(whereClauses, "is_read = FALSE")
	}

	whereSQL := strings.Join(whereClauses, " AND ")

	// 3. Count total matching
	countQuery := fmt.Sprintf("SELECT COUNT(*) FROM notifications WHERE %s;", whereSQL)
	var total int
	err := r.db.Pool.QueryRow(ctx, countQuery, args...).Scan(&total)
	if err != nil {
		if strings.Contains(err.Error(), "does not exist") {
			return res, nil
		}
		return nil, fmt.Errorf("failed counting notifications: %w", err)
	}
	res.TotalCount = total

	if total == 0 {
		return res, nil
	}

	// 4. Fetch page items
	itemsQuery := fmt.Sprintf(`
		SELECT id, user_id, title, message, type, COALESCE(metadata, '{}'::jsonb), is_read, created_at
		FROM notifications
		WHERE %s
		ORDER BY created_at DESC
		LIMIT $%d OFFSET $%d;
	`, whereSQL, argIdx, argIdx+1)

	args = append(args, pageSize, offset)

	rows, err := r.db.Pool.Query(ctx, itemsQuery, args...)
	if err != nil {
		return nil, fmt.Errorf("failed fetching notifications: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var n domain.Notification
		if err := rows.Scan(&n.ID, &n.UserID, &n.Title, &n.Message, &n.Type, &n.Metadata, &n.IsRead, &n.CreatedAt); err != nil {
			return nil, err
		}

		// Privacy Protection: sanitize metadata to ensure no raw OTP or secret token is exposed
		if len(n.Metadata) > 0 {
			var rawMap map[string]interface{}
			if err := json.Unmarshal(n.Metadata, &rawMap); err == nil {
				sanitized := domain.SanitizeSensitiveData(rawMap)
				sanitizedBytes, _ := json.Marshal(sanitized)
				n.Metadata = sanitizedBytes
			}
		}

		res.Notifications = append(res.Notifications, &n)
	}

	return res, nil
}

// ClaimQueuedNotifications atomically claims queued notification jobs using FOR UPDATE SKIP LOCKED
func (r *UserRepository) ClaimQueuedNotifications(ctx context.Context, workerID string, limit int) ([]*domain.Notification, error) {
	if r.db == nil || r.db.Pool == nil {
		return nil, nil
	}
	if limit <= 0 {
		limit = 50
	}

	query := `
		WITH claimed AS (
			SELECT id
			FROM notifications
			WHERE (
				(metadata->>'status' = 'QUEUED' OR metadata->>'status' = 'PENDING' OR metadata->>'status' IS NULL)
				OR (metadata->>'status' = 'PROCESSING' AND locked_at < NOW() - INTERVAL '5 minutes')
			)
			AND (metadata->>'next_retry_at' IS NULL OR (metadata->>'next_retry_at')::timestamptz <= NOW())
			ORDER BY created_at ASC
			LIMIT $1
			FOR UPDATE SKIP LOCKED
		)
		UPDATE notifications n
		SET locked_by = $2,
		    locked_at = NOW(),
		    metadata = jsonb_set(COALESCE(n.metadata, '{}'::jsonb), '{status}', '"PROCESSING"')
		FROM claimed c
		WHERE n.id = c.id
		RETURNING n.id, n.user_id, n.title, n.message, n.type, COALESCE(n.metadata, '{}'::jsonb), n.is_read, n.created_at;
	`

	rows, err := r.db.Pool.Query(ctx, query, limit, workerID)
	if err != nil {
		// Fallback for schema variants without locking columns
		if strings.Contains(err.Error(), "locked_by") || strings.Contains(err.Error(), "locked_at") {
			return r.FetchQueuedNotifications(ctx, limit)
		}
		return nil, fmt.Errorf("failed claiming queued notifications: %w", err)
	}
	defer rows.Close()

	var list []*domain.Notification
	for rows.Next() {
		var n domain.Notification
		if err := rows.Scan(&n.ID, &n.UserID, &n.Title, &n.Message, &n.Type, &n.Metadata, &n.IsRead, &n.CreatedAt); err != nil {
			return nil, err
		}
		list = append(list, &n)
	}
	return list, nil
}

// SuspendVendor marks a vendor account suspended with mandatory reason and governance audit
func (r *UserRepository) SuspendVendor(ctx context.Context, vendorID, adminID uuid.UUID, reason string) error {
	if r.db == nil || r.db.Pool == nil {
		return nil
	}
	query := `
		UPDATE users
		SET status = 'SUSPENDED',
		    is_suspended = TRUE,
		    suspension_reason = $2,
		    suspended_at = NOW(),
		    suspended_by = $3,
		    updated_at = NOW()
		WHERE id = $1;
	`
	res, err := r.db.Pool.Exec(ctx, query, vendorID, reason, adminID)
	if err != nil {
		// If is_suspended column doesn't exist yet, fallback to status
		if strings.Contains(err.Error(), "is_suspended") {
			_, err = r.db.Pool.Exec(ctx, "UPDATE users SET status = 'SUSPENDED', updated_at = NOW() WHERE id = $1;", vendorID)
			return err
		}
		return fmt.Errorf("failed to suspend vendor: %w", err)
	}
	if res.RowsAffected() == 0 {
		return fmt.Errorf("vendor with ID %s not found", vendorID.String())
	}
	return nil
}

// ReactivateVendor restores a suspended vendor account to active status
func (r *UserRepository) ReactivateVendor(ctx context.Context, vendorID, adminID uuid.UUID) error {
	if r.db == nil || r.db.Pool == nil {
		return nil
	}
	query := `
		UPDATE users
		SET status = 'ACTIVE',
		    is_suspended = FALSE,
		    suspension_reason = NULL,
		    suspended_at = NULL,
		    suspended_by = NULL,
		    updated_at = NOW()
		WHERE id = $1;
	`
	res, err := r.db.Pool.Exec(ctx, query, vendorID)
	if err != nil {
		if strings.Contains(err.Error(), "is_suspended") {
			_, err = r.db.Pool.Exec(ctx, "UPDATE users SET status = 'ACTIVE', updated_at = NOW() WHERE id = $1;", vendorID)
			return err
		}
		return fmt.Errorf("failed to reactivate vendor: %w", err)
	}
	if res.RowsAffected() == 0 {
		return fmt.Errorf("vendor with ID %s not found", vendorID.String())
	}
	return nil
}

