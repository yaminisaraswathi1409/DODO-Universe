package postgres

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type DB struct {
	Pool *pgxpool.Pool
}

func NewPostgresDB(ctx context.Context, databaseURL string) (*DB, error) {
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("unable to parse database config: %w", err)
	}

	config.MaxConns = 25
	config.MinConns = 5
	config.MaxConnLifetime = 30 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("unable to connect to postgres: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("unable to ping postgres database: %w", err)
	}

	log.Println("Successfully connected to Supabase PostgreSQL database via pgx/v5 pool")
	return &DB{Pool: pool}, nil
}

func (db *DB) Close() {
	if db.Pool != nil {
		db.Pool.Close()
	}
}
