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
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		fmt.Printf("Error connecting to database: %v\n", err)
		return
	}
	defer pool.Close()

	fmt.Println("=== CHECKING VENDOR CATALOG ITEMS IN DATABASE ===")
	rows, err := pool.Query(ctx, `
		SELECT 
			ci.id, 
			ci.vendor_user_id, 
			COALESCE(u.full_name, 'Unknown') as vendor_name,
			COALESCE(ci.category_id::text, '') as category_id, 
			COALESCE(c.slug, 'No Category') as category_slug,
			COALESCE(c.name, 'No Category Name') as category_name,
			ci.title, 
			ci.unit_price, 
			COALESCE(ci.price_unit, 'PER_PIECE'), 
			COALESCE(ci.status, 'NULL'), 
			ci.is_available,
			ci.created_at
		FROM vendor_catalog_items ci
		LEFT JOIN users u ON u.id = ci.vendor_user_id
		LEFT JOIN categories c ON c.id = ci.category_id
		ORDER BY ci.created_at DESC;
	`)
	if err != nil {
		fmt.Printf("Error querying catalog items: %v\n", err)
		return
	}
	defer rows.Close()

	count := 0
	for rows.Next() {
		count++
		var id, vendorID, vendorName, catID, catSlug, catName, title, priceUnit, status string
		var unitPrice float64
		var isAvailable bool
		var createdAt interface{}

		err := rows.Scan(&id, &vendorID, &vendorName, &catID, &catSlug, &catName, &title, &unitPrice, &priceUnit, &status, &isAvailable, &createdAt)
		if err != nil {
			fmt.Printf("Scan error: %v\n", err)
			continue
		}

		fmt.Printf("[%d] ID: %s | Vendor: %s (%s)\n", count, id, vendorName, vendorID)
		fmt.Printf("    Title: %s | Price: ₹%.2f / %s\n", title, unitPrice, priceUnit)
		fmt.Printf("    Category: %s (slug: '%s', ID: '%s')\n", catName, catSlug, catID)
		fmt.Printf("    Status: %s | IsAvailable: %v | CreatedAt: %v\n\n", status, isAvailable, createdAt)
	}

	if count == 0 {
		fmt.Println("NO CATALOG ITEMS FOUND IN DATABASE!")
	} else {
		fmt.Printf("TOTAL CATALOG ITEMS IN DB: %d\n", count)
	}
}
