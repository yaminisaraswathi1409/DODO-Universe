//go:build ignore

package main

import (
	"context"
	"fmt"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	dbURL := "postgresql://postgres.qnnpgryyilwenigawarv:DODO-Universe2026@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?sslmode=require"
	ctx := context.Background()

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		fmt.Printf("Failed to connect: %v\n", err)
		os.Exit(1)
	}
	defer pool.Close()

	// Check table schema for categories
	rows, err := pool.Query(ctx, `
		SELECT column_name, data_type 
		FROM information_schema.columns 
		WHERE table_name = 'categories'
		ORDER BY ordinal_position
	`)
	if err != nil {
		fmt.Printf("Schema error: %v\n", err)
		os.Exit(1)
	}
	defer rows.Close()

	fmt.Println("COLUMNS IN 'categories':")
	for rows.Next() {
		var col, dt string
		_ = rows.Scan(&col, &dt)
		fmt.Printf(" - %s (%s)\n", col, dt)
	}
}
