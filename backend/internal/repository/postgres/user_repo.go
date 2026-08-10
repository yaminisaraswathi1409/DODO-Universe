package postgres

import (
	"context"
	"errors"
	"fmt"

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

func (r *UserRepository) UpsertUser(ctx context.Context, u *domain.User) (*domain.User, error) {
	query := `
		INSERT INTO users (supabase_uid, email, phone, full_name, avatar_url, bio, location, address_text)
		VALUES ($1, $2, $3, $4, $5, $6, ST_SetSRID(ST_MakePoint($7, $8), 4326)::geography, $9)
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
		          ST_Y(location::geometry) as lat, ST_X(location::geometry) as lng, COALESCE(address_text, ''), trust_score, is_verified, created_at, updated_at;
	`

	row := r.db.Pool.QueryRow(ctx, query,
		u.SupabaseUID, u.Email, u.Phone, u.FullName, u.AvatarURL, u.Bio, u.Lng, u.Lat, u.AddressText,
	)

	var res domain.User
	err := row.Scan(
		&res.ID, &res.SupabaseUID, &res.Email, &res.Phone, &res.FullName, &res.AvatarURL, &res.Bio,
		&res.Lat, &res.Lng, &res.AddressText, &res.TrustScore, &res.IsVerified, &res.CreatedAt, &res.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to upsert user: %w", err)
	}

	return &res, nil
}

func (r *UserRepository) GetBySupabaseUID(ctx context.Context, uid string) (*domain.User, error) {
	query := `
		SELECT id, supabase_uid, COALESCE(email, ''), COALESCE(phone, ''), full_name, COALESCE(avatar_url, ''), COALESCE(bio, ''),
		       COALESCE(ST_Y(location::geometry), 0.0) as lat, COALESCE(ST_X(location::geometry), 0.0) as lng,
		       COALESCE(address_text, ''), trust_score, is_verified, created_at, updated_at
		FROM users
		WHERE supabase_uid = $1;
	`
	row := r.db.Pool.QueryRow(ctx, query, uid)

	var res domain.User
	err := row.Scan(
		&res.ID, &res.SupabaseUID, &res.Email, &res.Phone, &res.FullName, &res.AvatarURL, &res.Bio,
		&res.Lat, &res.Lng, &res.AddressText, &res.TrustScore, &res.IsVerified, &res.CreatedAt, &res.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get user by uid: %w", err)
	}

	return &res, nil
}

func (r *UserRepository) GetByID(ctx context.Context, id uuid.UUID) (*domain.User, error) {
	query := `
		SELECT id, supabase_uid, COALESCE(email, ''), COALESCE(phone, ''), full_name, COALESCE(avatar_url, ''), COALESCE(bio, ''),
		       COALESCE(ST_Y(location::geometry), 0.0) as lat, COALESCE(ST_X(location::geometry), 0.0) as lng,
		       COALESCE(address_text, ''), trust_score, is_verified, created_at, updated_at
		FROM users
		WHERE id = $1;
	`
	row := r.db.Pool.QueryRow(ctx, query, id)

	var res domain.User
	err := row.Scan(
		&res.ID, &res.SupabaseUID, &res.Email, &res.Phone, &res.FullName, &res.AvatarURL, &res.Bio,
		&res.Lat, &res.Lng, &res.AddressText, &res.TrustScore, &res.IsVerified, &res.CreatedAt, &res.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get user by id: %w", err)
	}

	return &res, nil
}
