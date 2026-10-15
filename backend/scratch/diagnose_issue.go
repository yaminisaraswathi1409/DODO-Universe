//go:build ignore

package main

import (
	"context"
	"fmt"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgresql://postgres.qnnpgryyilwenigawarv:DODO-Universe2026@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?sslmode=require"
	}
	ctx := context.Background()

	config, err := pgxpool.ParseConfig(dbURL)
	if err != nil {
		fmt.Printf("Failed to parse config: %v\n", err)
		return
	}
	config.ConnConfig.DefaultQueryExecMode = 4 // pgx.QueryExecModeSimpleProtocol
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		fmt.Printf("Failed to connect: %v\n", err)
		return
	}
	defer pool.Close()

	fmt.Println("=== CATEGORIES ===")
	catRows, err := pool.Query(ctx, `SELECT id, slug, name FROM categories ORDER BY name`)
	if err != nil {
		fmt.Println("Error:", err)
		return
	}
	for catRows.Next() {
		var id, slug, name string
		_ = catRows.Scan(&id, &slug, &name)
		fmt.Printf("Cat: ID=%s, Slug=%s, Name=%s\n", id, slug, name)
	}
	catRows.Close()

	fmt.Println("\n=== USER SKILLS ASSETS (Vendors/Providers) ===")
	assetRows, err := pool.Query(ctx, `
		SELECT usa.id, usa.user_id, u.full_name, COALESCE(usa.category_id::text, 'NULL'), usa.asset_type, usa.title, usa.status, usa.is_available
		FROM user_skills_assets usa
		JOIN users u ON usa.user_id = u.id
		ORDER BY u.full_name
	`)
	if err != nil {
		fmt.Println("Error:", err)
		return
	}
	for assetRows.Next() {
		var aid, uid, uName, cid, aType, title, status string
		var isAvail bool
		_ = assetRows.Scan(&aid, &uid, &uName, &cid, &aType, &title, &status, &isAvail)
		fmt.Printf("Asset: User=%s (%s), CatID=%s, Type=%s, Title=%s, Status=%s, IsAvail=%v\n", uName, uid, cid, aType, title, status, isAvail)
	}
	assetRows.Close()

	fmt.Println("\n=== RECENT CUSTOMER REQUESTS (type=NEED) ===")
	oppRows, err := pool.Query(ctx, `
		SELECT o.id, o.user_id, u.full_name, COALESCE(o.category_id::text, 'NULL'), o.order_mode, o.title, o.status, COALESCE(o.target_vendor_id::text, 'NULL'), COALESCE(o.assigned_user_id::text, 'NULL')
		FROM opportunities o
		JOIN users u ON o.user_id = u.id
		WHERE o.type = 'NEED'
		ORDER BY o.created_at DESC
		LIMIT 10
	`)
	if err != nil {
		fmt.Println("Error:", err)
		return
	}
	for oppRows.Next() {
		var oid, uid, uName, cid, om, title, status, tvid, auid string
		_ = oppRows.Scan(&oid, &uid, &uName, &cid, &om, &title, &status, &tvid, &auid)
		fmt.Printf("Opp: ID=%s, User=%s, CatID=%s, OrderMode=%s, Title=%s, Status=%s, TargetVendor=%s, Assigned=%s\n", oid, uName, cid, om, title, status, tvid, auid)
	}
	oppRows.Close()
}
