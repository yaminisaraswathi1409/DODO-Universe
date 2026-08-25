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
	"github.com/uop/backend/pkg/response"
)

func main() {
	cfg := config.LoadConfig()

	log.Printf("[Notification Service] Starting UOP Async Notifications Microservice [ENV: %s]...\n", cfg.Env)

	eventBus := event.NewMemoryEventBus(1000)
	defer eventBus.Close()

	// Register Event Consumers
	eventBus.Subscribe(event.TopicOpportunityCreated, func(ctx context.Context, evt event.Event) error {
		log.Printf("[Notification Service] Event Consumer Triggered: %s (ID: %s)\n", evt.Topic, evt.ID)
		return nil
	})

	eventBus.Subscribe(event.TopicNotificationSend, func(ctx context.Context, evt event.Event) error {
		log.Printf("[Notification Service] Dispatching Push Notification for Data: %+v\n", evt.Data)
		return nil
	})

	r := chi.NewRouter()
	r.Use(chimiddleware.RequestID)
	r.Use(chimiddleware.Logger)
	r.Use(chimiddleware.Recoverer)

	r.Route("/api/v1/notifications", func(r chi.Router) {
		r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
			response.JSON(w, http.StatusOK, "Notification Service is healthy", map[string]interface{}{
				"service":  "notification-service",
				"eventbus": "Active",
			})
		})
	})

	port := os.Getenv("NOTIFICATION_SERVICE_PORT")
	if port == "" {
		port = "8085"
	}

	server := &http.Server{
		Addr:         fmt.Sprintf(":%s", port),
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
	}

	go func() {
		log.Printf("[Notification Service] Listening on port %s\n", port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[Notification Service] Server error: %v\n", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	log.Println("[Notification Service] Shutting down gracefully...")
}
