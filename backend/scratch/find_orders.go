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
		fmt.Printf("Config error: %v\n", err)
		return
	}
	config.ConnConfig.DefaultQueryExecMode = 4
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		fmt.Printf("Connection error: %v\n", err)
		return
	}
	defer pool.Close()

	rows, err := pool.Query(ctx, `
		SELECT o.id, o.title, o.quantity, o.unit_price, o.total_price, 
		       COALESCE(to_char(o.scheduled_start, 'YYYY-MM-DD HH24:MI:SS'), 'NULL'),
		       COALESCE(to_char(o.created_at, 'YYYY-MM-DD HH24:MI:SS'), 'NULL'),
		       o.metadata::text
		FROM opportunities o
		ORDER BY o.created_at DESC
		LIMIT 15;
	`)
	if err != nil {
		fmt.Printf("Query error: %v\n", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var id, title, sched, created, metaStr string
		var qty, up, tp *float64
		if err := rows.Scan(&id, &title, &qty, &up, &tp, &sched, &created, &metaStr); err != nil {
			fmt.Printf("Scan error: %v\n", err)
			continue
		}
		var qVal, upVal, tpVal float64
		if qty != nil { qVal = *qty }
		if up != nil { upVal = *up }
		if tp != nil { tpVal = *tp }
		fmt.Printf("ID: %s | Title: %s\n  Qty: %.2f | UnitPrice: %.2f | Total: %.2f | Sched: %s | Created: %s\n  Metadata: %s\n\n",
			id, title, qVal, upVal, tpVal, sched, created, metaStr[:min(len(metaStr), 200)])
	}
}

func min(a, b int) int {
	if a < b { return a }
	return b
}
