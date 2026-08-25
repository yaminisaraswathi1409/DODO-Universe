package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/uop/backend/internal/config"
	"github.com/uop/backend/internal/repository/postgres"
	"github.com/uop/backend/pkg/response"
)

func main() {
	cfg := config.LoadConfig()

	log.Printf("[Chaining Service] Starting UOP Multi-Layer Chained Opportunities Microservice [ENV: %s]...\n", cfg.Env)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	db, err := postgres.NewPostgresDB(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Printf("[Chaining Service] Warning: Database connection issue: %v\n", err)
	} else {
		defer db.Close()
	}

	r := chi.NewRouter()
	r.Use(chimiddleware.RequestID)
	r.Use(chimiddleware.Logger)
	r.Use(chimiddleware.Recoverer)

	r.Route("/api/v1/chaining", func(r chi.Router) {
		r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
			response.JSON(w, http.StatusOK, "Chaining Service is healthy", map[string]interface{}{
				"service":  "chaining-service",
				"database": db != nil,
				"mode":     "Multi-Layer Dependency Graphs Enabled",
			})
		})
	})

	port := os.Getenv("CHAINING_SERVICE_PORT")
	if port == "" {
		port = "8084"
	}

	server := &http.Server{
		Addr:         fmt.Sprintf(":%s", port),
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
	}

	go func() {
		log.Printf("[Chaining Service] Listening on port %s\n", port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[Chaining Service] Server error: %v\n", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	log.Println("[Chaining Service] Shutting down gracefully...")
}
