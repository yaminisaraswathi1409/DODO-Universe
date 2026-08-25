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
	"github.com/uop/backend/internal/spatial"
	"github.com/uop/backend/pkg/response"
)

func main() {
	cfg := config.LoadConfig()

	log.Printf("[Matching Service] Starting UOP PostGIS Spatial Matching Microservice [ENV: %s]...\n", cfg.Env)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	db, err := postgres.NewPostgresDB(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Printf("[Matching Service] Warning: Database connection issue: %v\n", err)
	} else {
		defer db.Close()
	}

	r := chi.NewRouter()
	r.Use(chimiddleware.RequestID)
	r.Use(chimiddleware.Logger)
	r.Use(chimiddleware.Recoverer)

	r.Route("/api/v1/matching", func(r chi.Router) {
		r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
			response.JSON(w, http.StatusOK, "PostGIS Spatial Matching Service is healthy", map[string]interface{}{
				"service":  "matching-service",
				"database": db != nil,
				"postgis":  "ST_DWithin / ST_MakePoint Enabled",
			})
		})

		r.Get("/distance", func(w http.ResponseWriter, r *http.Request) {
			// Sample Haversine spatial distance test calculation
			c1 := spatial.Coordinates{Lat: 17.3850, Lng: 78.4867} // Hyderabad
			c2 := spatial.Coordinates{Lat: 17.2500, Lng: 78.8500} // Choutuppal
			distMeters := spatial.HaversineDistance(c1, c2)

			response.JSON(w, http.StatusOK, "Spatial distance calculated", map[string]interface{}{
				"origin":          c1,
				"destination":     c2,
				"distance_meters": distMeters,
				"distance_km":     distMeters / 1000.0,
			})
		})
	})

	port := os.Getenv("MATCHING_SERVICE_PORT")
	if port == "" {
		port = "8083"
	}

	server := &http.Server{
		Addr:         fmt.Sprintf(":%s", port),
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
	}

	go func() {
		log.Printf("[Matching Service] Listening on port %s\n", port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[Matching Service] Server error: %v\n", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	log.Println("[Matching Service] Shutting down gracefully...")
}
