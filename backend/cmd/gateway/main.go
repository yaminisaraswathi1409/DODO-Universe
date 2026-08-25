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
	"github.com/go-chi/cors"
	"github.com/uop/backend/internal/config"
	"github.com/uop/backend/internal/middleware"
	"github.com/uop/backend/pkg/response"
)

func main() {
	cfg := config.LoadConfig()

	log.Printf("[API Gateway] Starting UOP API Gateway Microservice [Port: %s, ENV: %s]...\n", cfg.Port, cfg.Env)

	r := chi.NewRouter()

	// Global Middleware Stack
	r.Use(chimiddleware.RequestID)
	r.Use(chimiddleware.RealIP)
	r.Use(chimiddleware.Logger)
	r.Use(chimiddleware.Recoverer)
	r.Use(chimiddleware.Timeout(30 * time.Second))

	// CORS Setup
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token", "X-Trace-ID"},
		ExposedHeaders:   []string{"Link", "X-Trace-ID"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// API Gateway Routes
	r.Route("/api/v1", func(r chi.Router) {
		// Health check
		r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
			response.JSON(w, http.StatusOK, "UOP API Gateway is healthy", map[string]interface{}{
				"service": "api-gateway",
				"version": "2.0.0",
				"status":  "UP",
				"time":    time.Now().Format(time.RFC3339),
			})
		})

		// Public Routes (Categories, SEO feeds, Public Opportunities)
		r.Get("/categories", func(w http.ResponseWriter, r *http.Request) {
			response.JSON(w, http.StatusOK, "Categories fetched via API Gateway", []map[string]string{
				{"id": "agriculture", "name": "Agriculture & Farming", "default_plugin": "scheduled_booking"},
				{"id": "logistics", "name": "Logistics & Transport", "default_plugin": "instant_acceptance"},
				{"id": "home_services", "name": "Home & Skilled Repair", "default_plugin": "quotation"},
				{"id": "rentals", "name": "Equipment & Asset Rental", "default_plugin": "rental"},
			})
		})

		// Authenticated Routes (Protected by Supabase JWT validation)
		r.Group(func(r chi.Router) {
			r.Use(middleware.JWTAuthMiddleware(cfg.SupabaseJWTSecret))

			r.Get("/users/me", func(w http.ResponseWriter, r *http.Request) {
				userID := r.Context().Value("user_id")
				response.JSON(w, http.StatusOK, "Authenticated user profile fetched", map[string]interface{}{
					"user_id": userID,
					"service": "user-service-proxy",
				})
			})
		})
	})

	server := &http.Server{
		Addr:         fmt.Sprintf(":%s", cfg.Port),
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		log.Printf("[API Gateway] Server listening at http://localhost:%s/api/v1/health\n", cfg.Port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[API Gateway] Server HTTP error: %v\n", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	log.Println("[API Gateway] Shutting down gracefully...")
	ctxShutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := server.Shutdown(ctxShutdown); err != nil {
		log.Fatalf("[API Gateway] Forced shutdown error: %v\n", err)
	}

	log.Println("[API Gateway] Server exited cleanly.")
}
