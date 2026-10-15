//go:build ignore

package main

import (
	"context"
	"fmt"
	"os"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/uop/backend/internal/repository/postgres"
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
	config.ConnConfig.DefaultQueryExecMode = 4 // SimpleProtocol
	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		fmt.Printf("Failed to connect: %v\n", err)
		return
	}
	defer pool.Close()

	vamsiID := uuid.MustParse("0964525e-4119-4cf3-8e29-14b7b66bc3c6")
	oppID := uuid.MustParse("ad9c944b-c7e2-4953-9dc5-46f5e0c22d05")

	fmt.Println("=== NOTIFICATIONS FOR VAMSI ===")
	notifRows, err := pool.Query(ctx, `SELECT id, user_id, title, message, type, is_read, created_at FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5`, vamsiID)
	if err != nil {
		fmt.Println("Error:", err)
	} else {
		for notifRows.Next() {
			var id, uid, title, msg, ntype string
			var isRead bool
			var createdAt interface{}
			_ = notifRows.Scan(&id, &uid, &title, &msg, &ntype, &isRead, &createdAt)
			fmt.Printf("Notif: [%s] Title=%s, Msg=%s, Type=%s\n", createdAt, title, msg, ntype)
		}
		notifRows.Close()
	}

	fmt.Println("\n=== MATCHES FOR OPPORTUNITY ad9c944b ===")
	mRows, err := pool.Query(ctx, `SELECT id, opportunity_id, matched_user_id, status FROM opportunity_matches WHERE opportunity_id = $1`, oppID)
	if err != nil {
		fmt.Println("Error:", err)
	} else {
		for mRows.Next() {
			var id, oid, muid, status string
			_ = mRows.Scan(&id, &oid, &muid, &status)
			fmt.Printf("Match: ID=%s, MatchedUser=%s, Status=%s\n", id, muid, status)
		}
		mRows.Close()
	}

	fmt.Println("\n=== RUNNING GetMatchingRequestsForProvider for Vamsi ===")
	db := &postgres.DB{Pool: pool}
	oppRepo := postgres.NewOpportunityRepository(db)
	reqs, err := oppRepo.GetMatchingRequestsForProvider(ctx, vamsiID)
	if err != nil {
		fmt.Println("GetMatchingRequestsForProvider Error:", err)
	} else {
		fmt.Printf("Found %d matching requests for Vamsi:\n", len(reqs))
		for _, r := range reqs {
			fmt.Printf(" - Opp ID=%s, Title=%s, Status=%s, OrderMode=%s, CatID=%v\n", r.ID, r.Title, r.Status, r.OrderMode, r.CategoryID)
		}
	}
}
