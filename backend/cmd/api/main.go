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
	"github.com/uop/backend/internal/handler"
	"github.com/uop/backend/internal/middleware"
	"github.com/uop/backend/internal/plugin"
	"github.com/uop/backend/internal/repository/postgres"
	"github.com/uop/backend/internal/service"
	"github.com/uop/backend/pkg/response"
)

func main() {
	cfg := config.LoadConfig()

	log.Printf("Starting Universal Opportunity Platform (UOP) Core Backend [ENV: %s]...\n", cfg.Env)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	// Initialize Supabase PostgreSQL database pool using standard pgx/v5 driver
	db, err := postgres.NewPostgresDB(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Printf("Warning: Database connection failed (verify DATABASE_URL in .env): %v\n", err)
	} else {
		defer db.Close()
	}

	// Initialize Repositories
	var userRepo *postgres.UserRepository
	var oppRepo *postgres.OpportunityRepository
	var logisticsRepo *postgres.LogisticsRepository
	if db != nil {
		userRepo = postgres.NewUserRepository(db)
		oppRepo = postgres.NewOpportunityRepository(db)
		logisticsRepo = postgres.NewLogisticsRepository(db)
	}

	// Initialize Workflow Plugin Engine
	workflowRegistry := plugin.NewWorkflowRegistry()

	// Initialize Services
	var oppService *service.OpportunityService
	var userService *service.UserService
	var logisticsService *service.LogisticsService

	if oppRepo != nil && userRepo != nil {
		oppService = service.NewOpportunityService(oppRepo, userRepo, workflowRegistry)
	}
	if userRepo != nil {
		userService = service.NewUserService(userRepo)
	}
	if logisticsRepo != nil && oppRepo != nil && userRepo != nil {
		logisticsService = service.NewLogisticsService(logisticsRepo, oppRepo, userRepo)
	}

	// Initialize Handlers
	var authHandler *handler.AuthHandler
	var oppHandler *handler.OpportunityHandler
	var catHandler *handler.CategoryHandler
	var userMgmtHandler *handler.UserManagementHandler
	var logisticsHandler *handler.LogisticsHandler

	if userRepo != nil {
		authHandler = handler.NewAuthHandler(userRepo)
	}
	if oppService != nil && userRepo != nil {
		oppHandler = handler.NewOpportunityHandler(oppService, userRepo)
	}
	if db != nil {
		catHandler = handler.NewCategoryHandler(db)
	}
	if userService != nil && userRepo != nil {
		userMgmtHandler = handler.NewUserManagementHandler(userService, userRepo)
	}
	if logisticsService != nil {
		logisticsHandler = handler.NewLogisticsHandler(logisticsService)
	}
	uploadHandler := handler.NewUploadHandler("./public/uploads")

	// Setup Chi Router
	r := chi.NewRouter()

	// Middleware Stack
	r.Use(chimiddleware.RequestID)
	r.Use(chimiddleware.RealIP)
	r.Use(chimiddleware.Logger)
	r.Use(chimiddleware.Recoverer)
	r.Use(chimiddleware.Timeout(30 * time.Second))

	// CORS Configuration
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Serve Uploaded Files (Images, PDFs, Videos)
	r.Handle("/uploads/*", http.StripPrefix("/uploads/", http.FileServer(http.Dir("./public/uploads"))))

	// API Routes
	r.Route("/api/v1", func(r chi.Router) {
		// Health check
		r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
			response.JSON(w, http.StatusOK, "UOP Core Backend API is healthy", map[string]interface{}{
				"version":  "1.0.0",
				"time":     time.Now().Format(time.RFC3339),
				"database": db != nil,
			})
		})

		// Category endpoints
		r.Get("/categories", func(w http.ResponseWriter, r *http.Request) {
			if catHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
				return
			}
			catHandler.List(w, r)
		})

		r.Post("/categories", func(w http.ResponseWriter, r *http.Request) {
			if catHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
				return
			}
			catHandler.Create(w, r)
		})

		r.Delete("/categories/{id}", func(w http.ResponseWriter, r *http.Request) {
			if catHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
				return
			}
			catHandler.Delete(w, r)
		})

		// User Services endpoints
		r.Get("/users/services", func(w http.ResponseWriter, r *http.Request) {
			if userMgmtHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
				return
			}
			userMgmtHandler.GetUserServices(w, r)
		})

		r.Post("/users/services", func(w http.ResponseWriter, r *http.Request) {
			if userMgmtHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
				return
			}
			userMgmtHandler.AddUserService(w, r)
		})

		r.Post("/users/services/documents", func(w http.ResponseWriter, r *http.Request) {
			if userMgmtHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
				return
			}
			userMgmtHandler.SubmitServiceDocuments(w, r)
		})

		// Secure File Upload Endpoint
		r.Post("/upload", uploadHandler.HandleFileUpload)

		// Admin Service Request & Category Governance Endpoints
		r.Get("/admin/services/requests", func(w http.ResponseWriter, r *http.Request) {
			if userMgmtHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
				return
			}
			userMgmtHandler.ListServiceRequests(w, r)
		})

		r.Post("/admin/services/{id}/approve", func(w http.ResponseWriter, r *http.Request) {
			if userMgmtHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
				return
			}
			userMgmtHandler.AdminApproveServiceRequest(w, r)
		})

		r.Post("/admin/services/{id}/review-documents", func(w http.ResponseWriter, r *http.Request) {
			if userMgmtHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
				return
			}
			userMgmtHandler.AdminReviewServiceDocuments(w, r)
		})

		r.Post("/admin/categories/{id}/requirements", func(w http.ResponseWriter, r *http.Request) {
			if catHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
				return
			}
			catHandler.UpdateRequirements(w, r)
		})

		r.Post("/admin/categories/{id}/opportunity-fields", func(w http.ResponseWriter, r *http.Request) {
			if catHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
				return
			}
			catHandler.UpdateOpportunityFields(w, r)
		})

		r.Post("/users/status", func(w http.ResponseWriter, r *http.Request) {
			if userMgmtHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
				return
			}
			userMgmtHandler.UpdateStatus(w, r)
		})


		r.Get("/opportunities/public", func(w http.ResponseWriter, r *http.Request) {
			if oppHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
				return
			}
			oppHandler.ListPublic(w, r)
		})

		r.Get("/opportunities/{id}", func(w http.ResponseWriter, r *http.Request) {
			if oppHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
				return
			}
			oppHandler.GetByID(w, r)
		})

		r.Post("/opportunities/{id}/status", func(w http.ResponseWriter, r *http.Request) {
			if oppHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
				return
			}
			oppHandler.UpdateStatus(w, r)
		})

		r.Get("/opportunities/{id}/history", func(w http.ResponseWriter, r *http.Request) {
			if oppHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
				return
			}
			oppHandler.GetStatusHistory(w, r)
		})

		// OTP Verification & User Management Public endpoints
		r.Post("/users/verify-otp", func(w http.ResponseWriter, r *http.Request) {
			if userMgmtHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
				return
			}
			userMgmtHandler.VerifyOTP(w, r)
		})

		r.Post("/auth/request-otp", func(w http.ResponseWriter, r *http.Request) {
			if userMgmtHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
				return
			}
			userMgmtHandler.RequestOTP(w, r)
		})

		r.Post("/auth/signup", func(w http.ResponseWriter, r *http.Request) {
			if userMgmtHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
				return
			}
			userMgmtHandler.Signup(w, r)
		})


		r.Post("/users/complete-profile", func(w http.ResponseWriter, r *http.Request) {
			if userMgmtHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
				return
			}
			userMgmtHandler.CompleteProfile(w, r)
		})

		r.Post("/users/verify-face", func(w http.ResponseWriter, r *http.Request) {
			if userMgmtHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
				return
			}
			userMgmtHandler.VerifyFace(w, r)
		})

		r.Get("/users/list", func(w http.ResponseWriter, r *http.Request) {
			if userMgmtHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
				return
			}
			userMgmtHandler.ListUsers(w, r)
		})

		// Saved Addresses endpoints
		r.Get("/users/{userId}/addresses", func(w http.ResponseWriter, r *http.Request) {
			if userMgmtHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
				return
			}
			userMgmtHandler.GetUserAddresses(w, r)
		})

		r.Post("/users/{userId}/addresses", func(w http.ResponseWriter, r *http.Request) {
			if userMgmtHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
				return
			}
			userMgmtHandler.CreateUserAddress(w, r)
		})

		r.Put("/users/{userId}/addresses/{addressId}", func(w http.ResponseWriter, r *http.Request) {
			if userMgmtHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
				return
			}
			userMgmtHandler.UpdateUserAddress(w, r)
		})

		r.Put("/users/{userId}/addresses/{addressId}/default", func(w http.ResponseWriter, r *http.Request) {
			if userMgmtHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
				return
			}
			userMgmtHandler.SetDefaultUserAddress(w, r)
		})

		r.Delete("/users/{userId}/addresses/{addressId}", func(w http.ResponseWriter, r *http.Request) {
			if userMgmtHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
				return
			}
			userMgmtHandler.DeleteUserAddress(w, r)
		})




		// Authenticated Routes (Protected by Supabase JWT validation middleware)
		r.Group(func(r chi.Router) {
			r.Use(middleware.JWTAuthMiddleware(cfg.SupabaseJWTSecret))

			// User Sync & Self Inspection
			r.Post("/users/sync", func(w http.ResponseWriter, r *http.Request) {
				if authHandler == nil {
					response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
					return
				}
				authHandler.SyncProfile(w, r)
			})

			r.Get("/users/me", func(w http.ResponseWriter, r *http.Request) {
				if authHandler == nil {
					response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
					return
				}
				authHandler.GetMe(w, r)
			})

			// User Management Module Routes
			r.Post("/users/invite", func(w http.ResponseWriter, r *http.Request) {
				if userMgmtHandler == nil {
					response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
					return
				}
				userMgmtHandler.Invite(w, r)
			})

			r.Get("/users/onboarding-status", func(w http.ResponseWriter, r *http.Request) {
				if userMgmtHandler == nil {
					response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
					return
				}
				userMgmtHandler.GetOnboardingStatus(w, r)
			})

			// Opportunity Management & Spatial Matching
			r.Post("/opportunities", func(w http.ResponseWriter, r *http.Request) {
				if oppHandler == nil {
					response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
					return
				}
				oppHandler.Create(w, r)
			})

			r.Get("/opportunities/{id}/matches", func(w http.ResponseWriter, r *http.Request) {
				if oppHandler == nil {
					response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
					return
				}
				oppHandler.FindMatches(w, r)
			})

			r.Post("/opportunities/{id}/chain", func(w http.ResponseWriter, r *http.Request) {
				if oppHandler == nil {
					response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
					return
				}
				oppHandler.CreateChainChild(w, r)
			})
		})

		// Logistics & Emergency Scenario 1 Endpoints
		if logisticsHandler != nil {
			r.Post("/voice/parse", logisticsHandler.ParseVoice)
			r.Get("/parts/search", logisticsHandler.SearchParts)
			r.Post("/parts/checkout", logisticsHandler.CheckoutPart)
			r.Post("/logistics/pairings", logisticsHandler.CreateVehicleDriverPairing)
			r.Get("/opportunities/{id}/tree", logisticsHandler.GetTree)
			r.Post("/logistics/cascade", logisticsHandler.TriggerCascade)
			r.Post("/logistics/sos", logisticsHandler.ReportSOSIncident)
			r.Post("/logistics/manifest", logisticsHandler.GenerateWayManifest)
			r.Post("/logistics/manifest/pol", logisticsHandler.UploadPOL)
			r.Post("/logistics/manifest/pod", logisticsHandler.UploadPOD)
			r.Post("/escrow/settle/{root_id}", logisticsHandler.SettleEscrow)
		}
	})

	server := &http.Server{
		Addr:         fmt.Sprintf(":%s", cfg.Port),
		Handler:      r,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		log.Printf("Server listening on port %s (http://localhost:%s/api/v1/health)\n", cfg.Port, cfg.Port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Server HTTP error: %v\n", err)
		}
	}()

	// Graceful shutdown handling
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	<-stop

	log.Println("Shutting down UOP backend server gracefully...")
	ctxShutdown, cancelShutdown := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancelShutdown()

	if err := server.Shutdown(ctxShutdown); err != nil {
		log.Fatalf("Server forced to shutdown: %v\n", err)
	}

	log.Println("Server exited cleanly.")
}
