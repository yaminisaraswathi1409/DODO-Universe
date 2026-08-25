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
	"github.com/uop/backend/internal/event"
	"github.com/uop/backend/internal/repository/postgres"
	"github.com/uop/backend/internal/service"
	"github.com/uop/backend/pkg/response"
)

func main() {
	cfg := config.LoadConfig()

	log.Printf("[User Service] Starting UOP User & Trust Score Microservice [ENV: %s]...\n", cfg.Env)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Initialize Database Pool
	db, err := postgres.NewPostgresDB(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Printf("[User Service] Warning: Database connection issue: %v\n", err)
	} else {
		defer db.Close()
	}

	// Initialize Repositories & Services
	var userRepo *postgres.UserRepository
	var userService *service.UserService

	if db != nil {
		userRepo = postgres.NewUserRepository(db)
		userService = service.NewUserService(userRepo)
	}

	// Initialize Event Bus
	eventBus := event.NewMemoryEventBus(1000)
	defer eventBus.Close()

	// Subscribe to Trust Score Update Events
	eventBus.Subscribe(event.TopicUserTrustUpdated, func(ctx context.Context, evt event.Event) error {
		log.Printf("[User Service] Event received: %s, Data: %+v\n", evt.Topic, evt.Data)
		return nil
	})

	r := chi.NewRouter()
	r.Use(chimiddleware.RequestID)
	r.Use(chimiddleware.Logger)
	r.Use(chimiddleware.Recoverer)

	r.Route("/api/v1/users", func(r chi.Router) {
		r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
			response.JSON(w, http.StatusOK, "User Service is healthy", map[string]interface{}{
				"service":       "user-service",
				"database":      db != nil,
				"service_ready": userService != nil && userRepo != nil,
			})
		})

		r.Get("/trust-score/{id}", func(w http.ResponseWriter, r *http.Request) {
			userID := chi.URLParam(r, "id")
			response.JSON(w, http.StatusOK, "Trust score retrieved", map[string]interface{}{
				"user_id":     userID,
				"trust_score": 85.5,
				"kyc_status":  "VERIFIED",
				"rating":      4.8,
			})
		})
	})

	port := os.Getenv("USER_SERVICE_PORT")
	if port == "" {
		port = "8081"
	}

	server := &http.Server{
		Addr:         fmt.Sprintf(":%s", port),
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
	}

	go func() {
		log.Printf("[User Service] Listening on port %s\n", port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[User Service] Server error: %v\n", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	log.Println("[User Service] Shutting down gracefully...")
}
