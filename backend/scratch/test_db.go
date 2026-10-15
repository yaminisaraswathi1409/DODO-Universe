//go:build ignore

package main

import (
	"context"
	"fmt"

	"github.com/uop/backend/internal/repository/postgres"
)

func main() {
	dbUrl := "postgresql://postgres.qnnpgryyilwenigawarv:DODO-Universe2026@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?sslmode=require"
	db, err := postgres.NewPostgresDB(context.Background(), dbUrl)
	if err != nil {
		fmt.Println("DB Error:", err)
	} else {
		fmt.Println("DB Connected successfully!")
		db.Close()
	}
}
