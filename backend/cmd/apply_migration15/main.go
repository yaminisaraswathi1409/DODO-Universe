package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/uop/backend/internal/config"
	"github.com/uop/backend/internal/repository/postgres"
)

func main() {
	cfg := config.LoadConfig()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	db, err := postgres.NewPostgresDB(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Failed to connect to DB: %v", err)
	}
	defer db.Close()

	sqlBytes, err := os.ReadFile("migrations/000015_add_resource_requirements.up.sql")
	if err != nil {
		log.Fatalf("Failed to read migration file: %v", err)
	}

	_, err = db.Pool.Exec(ctx, string(sqlBytes))
	if err != nil {
		log.Fatalf("Failed to execute migration: %v", err)
	}

	fmt.Println("Successfully executed Migration 000015: Added resource_requirements column to categories!")
}
