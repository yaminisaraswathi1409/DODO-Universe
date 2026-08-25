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
	"github.com/uop/backend/internal/plugin"
	"github.com/uop/backend/internal/repository/postgres"
	"github.com/uop/backend/internal/service"
	"github.com/uop/backend/pkg/response"
)

func main() {
	cfg := config.LoadConfig()

	log.Printf("[Opportunity Service] Starting UOP Opportunity Lifecycle Microservice [ENV: %s]...\n", cfg.Env)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	db, err := postgres.NewPostgresDB(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Printf("[Opportunity Service] Warning: Database connection issue: %v\n", err)
	} else {
		defer db.Close()
	}

	workflowRegistry := plugin.NewWorkflowRegistry()

	var oppRepo *postgres.OpportunityRepository
	var userRepo *postgres.UserRepository
	var oppService *service.OpportunityService

	if db != nil {
		oppRepo = postgres.NewOpportunityRepository(db)
		userRepo = postgres.NewUserRepository(db)
		oppService = service.NewOpportunityService(oppRepo, userRepo, workflowRegistry)
	}

	eventBus := event.NewMemoryEventBus(1000)
	defer eventBus.Close()

	r := chi.NewRouter()
	r.Use(chimiddleware.RequestID)
	r.Use(chimiddleware.Logger)
	r.Use(chimiddleware.Recoverer)

	r.Route("/api/v1/opportunities", func(r chi.Router) {
		r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
			response.JSON(w, http.StatusOK, "Opportunity Service is healthy", map[string]interface{}{
				"service":        "opportunity-service",
				"database":       db != nil,
				"service_ready":  oppService != nil && oppRepo != nil && userRepo != nil,
				"plugins_count":  len(workflowRegistry.ListPlugins()),
				"active_plugins": workflowRegistry.ListPlugins(),
			})
		})

		r.Get("/plugins", func(w http.ResponseWriter, r *http.Request) {
			response.JSON(w, http.StatusOK, "Supported Opportunity Workflow Plugins", workflowRegistry.ListPlugins())
		})
	})

	port := os.Getenv("OPPORTUNITY_SERVICE_PORT")
	if port == "" {
		port = "8082"
	}

	server := &http.Server{
		Addr:         fmt.Sprintf(":%s", port),
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
	}

	go func() {
		log.Printf("[Opportunity Service] Listening on port %s\n", port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[Opportunity Service] Server error: %v\n", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	log.Println("[Opportunity Service] Shutting down gracefully...")
}
