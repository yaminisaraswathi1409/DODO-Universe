package postgres

import (
	"context"
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

// NormalizePhone converts any phone string (+91..., 9876..., +91 98765-43210) to standard E.164 (+919876543210)
func NormalizePhone(phone string) string {
	phone = strings.TrimSpace(phone)
	if phone == "" {
		return ""
	}

	var digits strings.Builder
	for _, r := range phone {
		if r >= '0' && r <= '9' {
			digits.WriteRune(r)
		}
	}

	dStr := digits.String()
	if dStr == "" {
		return phone
	}

	// 10 digits without country code -> default to +91
	if len(dStr) == 10 {
		return "+91" + dStr
	}

	if len(dStr) == 12 && strings.HasPrefix(dStr, "91") {
		return "+" + dStr
	}

	return "+" + dStr
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
		VALUES ($1, $2, $3, $4, 'PENDING', 'USER', FALSE)
		ON CONFLICT (phone) DO UPDATE SET full_name = EXCLUDED.full_name, email = EXCLUDED.email, updated_at = NOW()
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









