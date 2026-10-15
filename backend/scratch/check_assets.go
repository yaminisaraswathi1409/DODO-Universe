//go:build ignore

package main

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	dbURL := "postgresql://postgres.qnnpgryyilwenigawarv:DODO-Universe2026@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?sslmode=require"

	config, err := pgxpool.ParseConfig(dbURL)
	if err != nil {
		fmt.Printf("Config error: %v\n", err)
		return
	}

	pool, err := pgxpool.NewWithConfig(context.Background(), config)
	if err != nil {
		fmt.Printf("Connection error: %v\n", err)
		return
	}
	defer pool.Close()

	rows, err := pool.Query(context.Background(), `
		SELECT sa.id, sa.user_id, sa.category_id, sa.asset_type, sa.title, sa.status, sa.is_available,
		       c.id, c.slug, c.name, u.full_name, u.phone
		FROM user_skills_assets sa
		LEFT JOIN categories c ON c.id = sa.category_id OR c.slug = sa.asset_type OR LOWER(c.name) = LOWER(sa.asset_type)
		LEFT JOIN users u ON u.id = sa.user_id;
	`)
	if err != nil {
		fmt.Printf("Query error: %v\n", err)
		return
	}
	defer rows.Close()

	fmt.Println("--- USER SKILLS ASSETS IN DB ---")
	for rows.Next() {
		var saID, userID, title, status string
		var catID, cID, cSlug, cName, uName, uPhone *string
		var assetType string
		var isAvail bool
		err := rows.Scan(&saID, &userID, &catID, &assetType, &title, &status, &isAvail, &cID, &cSlug, &cName, &uName, &uPhone)
		if err != nil {
			fmt.Printf("Scan error: %v\n", err)
			continue
		}
		catNameStr := "NONE"
		if cName != nil {
			catNameStr = *cName
		}
		userNameStr := "UNKNOWN"
		if uName != nil {
			userNameStr = *uName
		}
		phoneStr := ""
		if uPhone != nil {
			phoneStr = *uPhone
		}
		fmt.Printf("Asset ID: %s | User: %s (%s, %s) | Title: '%s' | AssetType: '%s' | Status: '%s' | Available: %v | Matched Cat: '%s'\n",
			saID, userNameStr, phoneStr, userID, title, assetType, status, isAvail, catNameStr)
	}

	// Also print all categories in DB
	catRows, err := pool.Query(context.Background(), `SELECT id, slug, name FROM categories ORDER BY name;`)
	if err == nil {
		defer catRows.Close()
		fmt.Println("\n--- ALL CATEGORIES IN DB ---")
		for catRows.Next() {
			var id, slug, name string
			_ = catRows.Scan(&id, &slug, &name)
			fmt.Printf("Category ID: %s | Slug: '%s' | Name: '%s'\n", id, slug, name)
		}
	}
}
