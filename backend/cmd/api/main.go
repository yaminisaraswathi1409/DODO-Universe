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
	var catalogRepo *postgres.CatalogRepository
	var govRepo *postgres.CategoryGovernanceRepository
	var checkoutRepo *postgres.CheckoutRepository
	if db != nil {
		userRepo = postgres.NewUserRepository(db)
		oppRepo = postgres.NewOpportunityRepository(db)
		logisticsRepo = postgres.NewLogisticsRepository(db)
		catalogRepo = postgres.NewCatalogRepository(db)
		govRepo = postgres.NewCategoryGovernanceRepository(db)
		checkoutRepo = postgres.NewCheckoutRepository(db)
	}

	// Initialize Workflow Plugin Engine
	workflowRegistry := plugin.NewWorkflowRegistry()

	// Initialize Services
	var oppService *service.OpportunityService
	var userService *service.UserService
	var logisticsService *service.LogisticsService
	var catalogService *service.CatalogService
	var govService *service.CategoryGovernanceService
	var checkoutService *service.CheckoutService

	if oppRepo != nil && userRepo != nil {
		oppService = service.NewOpportunityService(oppRepo, userRepo, workflowRegistry)
		if catalogRepo != nil {
			oppService.SetCatalogRepository(catalogRepo)
		}
	}
	if userRepo != nil {
		userService = service.NewUserService(userRepo)
	}
	if logisticsRepo != nil && oppRepo != nil && userRepo != nil {
		logisticsService = service.NewLogisticsService(logisticsRepo, oppRepo, userRepo)
		if catalogRepo != nil {
			logisticsService.SetCatalogRepository(catalogRepo)
		}
		if oppService != nil {
			oppService.SetLogisticsRepository(logisticsService)
		}
	}
	if catalogRepo != nil && userRepo != nil {
		catalogService = service.NewCatalogService(catalogRepo, userRepo)
		if govRepo != nil {
			catalogService.SetGovernanceRepo(govRepo)
		}
	}
	if govRepo != nil && userRepo != nil {
		govService = service.NewCategoryGovernanceService(govRepo, userRepo)
	}
	if checkoutRepo != nil && userRepo != nil {
		checkoutService = service.NewCheckoutService(checkoutRepo, userRepo)
	}

	// Phase 6: Persistent Notification Dispatcher Initialization & Background Worker
	var notificationDispatcher *service.NotificationDispatcher
	if userRepo != nil {
		notificationDispatcher = service.NewNotificationDispatcher(userRepo)
		notificationDispatcher.Start(context.Background())
		log.Println("[API Server] Background Notification Dispatcher worker started successfully")
	}

	// Initialize Handlers
	var authHandler *handler.AuthHandler
	var oppHandler *handler.OpportunityHandler
	var catHandler *handler.CategoryHandler
	var userMgmtHandler *handler.UserManagementHandler
	var logisticsHandler *handler.LogisticsHandler
	var catalogHandler *handler.CatalogHandler
	var govHandler *handler.CategoryGovernanceHandler
	var formHandler *handler.FormEngineHandler
	var checkoutHandler *handler.CheckoutHandler
	var operationsHandler *handler.OperationsHandler

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
	if catalogService != nil && userRepo != nil {
		catalogHandler = handler.NewCatalogHandler(catalogService, userRepo)
	}
	if govService != nil {
		govHandler = handler.NewCategoryGovernanceHandler(govService, userRepo)
	}
	if db != nil {
		formRepo := postgres.NewFormEngineRepository(db)
		formService := service.NewFormEngineService(formRepo, govRepo)
		formHandler = handler.NewFormEngineHandler(formService, userRepo)

		operationsRepo := postgres.NewOperationsRepository(db)
		operationsService := service.NewOperationsService(operationsRepo, userRepo, logisticsRepo, notificationDispatcher)
		operationsHandler = handler.NewOperationsHandler(operationsService, userRepo)
	}
	if checkoutService != nil && userRepo != nil {
		checkoutHandler = handler.NewCheckoutHandler(checkoutService, userRepo)
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

		// File Upload endpoint
		r.Post("/upload", uploadHandler.HandleFileUpload)

		// Phase 3: Reusable Dynamic Forms Engine endpoints
		r.Post("/admin/forms/schemas", func(w http.ResponseWriter, r *http.Request) {
			if formHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Form engine unavailable", nil)
				return
			}
			formHandler.CreateSchema(w, r)
		})
		r.Get("/forms/schemas", func(w http.ResponseWriter, r *http.Request) {
			if formHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Form engine unavailable", nil)
				return
			}
			formHandler.ListSchemas(w, r)
		})
		r.Get("/forms/schemas/{id}", func(w http.ResponseWriter, r *http.Request) {
			if formHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Form engine unavailable", nil)
				return
			}
			formHandler.GetSchemaByID(w, r)
		})
		r.Post("/admin/forms/schemas/{id}/version", func(w http.ResponseWriter, r *http.Request) {
			if formHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Form engine unavailable", nil)
				return
			}
			formHandler.PublishNewVersion(w, r)
		})
		r.Get("/categories/{category_id}/form-schema", func(w http.ResponseWriter, r *http.Request) {
			if formHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Form engine unavailable", nil)
				return
			}
			formHandler.GetActiveCategorySchema(w, r)
		})
		r.Post("/forms/submissions", func(w http.ResponseWriter, r *http.Request) {
			if formHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Form engine unavailable", nil)
				return
			}
			formHandler.SubmitForm(w, r)
		})
		r.Get("/forms/submissions/{id}", func(w http.ResponseWriter, r *http.Request) {
			if formHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Form engine unavailable", nil)
				return
			}
			formHandler.GetSubmissionByID(w, r)
		})
		r.Get("/forms/submissions", func(w http.ResponseWriter, r *http.Request) {
			if formHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Form engine unavailable", nil)
				return
			}
			formHandler.ListSubmissionsByEntity(w, r)
		})

		// Category endpoints
		r.Get("/categories", func(w http.ResponseWriter, r *http.Request) {
			if catHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
				return
			}
			catHandler.List(w, r)
		})

		r.Get("/categories/tree", func(w http.ResponseWriter, r *http.Request) {
			if govHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Governance service unavailable", nil)
				return
			}
			govHandler.GetHierarchyTree(w, r)
		})

		r.Put("/admin/categories/{id}/parent", func(w http.ResponseWriter, r *http.Request) {
			if govHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Governance service unavailable", nil)
				return
			}
			govHandler.UpdateParent(w, r)
		})

		r.Put("/admin/categories/{id}/selectable", func(w http.ResponseWriter, r *http.Request) {
			if govHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Governance service unavailable", nil)
				return
			}
			govHandler.ToggleSelectable(w, r)
		})

		// Vendor Category Governance endpoints
		r.Get("/vendor/categories/approvals", func(w http.ResponseWriter, r *http.Request) {
			if govHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Governance service unavailable", nil)
				return
			}
			govHandler.ListVendorCategoryApprovals(w, r)
		})

		r.Post("/vendor/categories/apply", func(w http.ResponseWriter, r *http.Request) {
			if govHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Governance service unavailable", nil)
				return
			}
			govHandler.ApplyForCategory(w, r)
		})

		r.Put("/vendor/categories/resubmit/{id}", func(w http.ResponseWriter, r *http.Request) {
			if govHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Governance service unavailable", nil)
				return
			}
			govHandler.ResubmitCategoryApplication(w, r)
		})

		r.Get("/admin/categories/approvals", func(w http.ResponseWriter, r *http.Request) {
			if govHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Governance service unavailable", nil)
				return
			}
			govHandler.ListAdminCategoryApprovals(w, r)
		})

		r.Post("/admin/categories/approvals/{id}/review", func(w http.ResponseWriter, r *http.Request) {
			if govHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Governance service unavailable", nil)
				return
			}
			govHandler.AdminReviewCategoryApproval(w, r)
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

		r.Get("/admin/catalog/requests", func(w http.ResponseWriter, r *http.Request) {
			if catalogHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Catalog service unavailable", nil)
				return
			}
			catalogHandler.ListAdminCatalogRequests(w, r)
		})

		r.Post("/admin/catalog/{id}/approve", func(w http.ResponseWriter, r *http.Request) {
			if catalogHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Catalog service unavailable", nil)
				return
			}
			catalogHandler.ApproveCatalogItem(w, r)
		})

		r.Post("/admin/catalog/{id}/reject", func(w http.ResponseWriter, r *http.Request) {
			if catalogHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Catalog service unavailable", nil)
				return
			}
			catalogHandler.RejectCatalogItem(w, r)
		})

		r.Post("/admin/catalog/{id}/request-changes", func(w http.ResponseWriter, r *http.Request) {
			if catalogHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Catalog service unavailable", nil)
				return
			}
			catalogHandler.RequestChangesCatalogItem(w, r)
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

		r.Post("/admin/categories/{id}/vehicle-fields", func(w http.ResponseWriter, r *http.Request) {
			if catHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
				return
			}
			catHandler.UpdateVehicleFields(w, r)
		})

		r.Post("/admin/categories/{id}/driver-fields", func(w http.ResponseWriter, r *http.Request) {
			if catHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
				return
			}
			catHandler.UpdateDriverFields(w, r)
		})

		r.Post("/admin/categories/{id}/related-services", func(w http.ResponseWriter, r *http.Request) {
			if catHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
				return
			}
			catHandler.UpdateRelatedServices(w, r)
		})

		r.Put("/admin/categories/{id}/related-services", func(w http.ResponseWriter, r *http.Request) {
			if catHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
				return
			}
			catHandler.UpdateRelatedServices(w, r)
		})

		r.Post("/admin/categories/{id}/resources", func(w http.ResponseWriter, r *http.Request) {
			if catHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
				return
			}
			catHandler.UpdateResources(w, r)
		})

		r.Post("/admin/categories/{id}/resource-requirements", func(w http.ResponseWriter, r *http.Request) {
			if catHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
				return
			}
			catHandler.UpdateResourceRequirements(w, r)
		})

		// Phase 7: Admin Operations & Governance Endpoints
		r.Get("/admin/operations/metrics", func(w http.ResponseWriter, r *http.Request) {
			if operationsHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Operations service unavailable", nil)
				return
			}
			operationsHandler.GetAdminMetrics(w, r)
		})

		r.Get("/admin/operations/stuck-orders", func(w http.ResponseWriter, r *http.Request) {
			if operationsHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Operations service unavailable", nil)
				return
			}
			operationsHandler.GetStuckOrders(w, r)
		})

		r.Get("/admin/operations/audit-logs", func(w http.ResponseWriter, r *http.Request) {
			if operationsHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Operations service unavailable", nil)
				return
			}
			operationsHandler.GetAuditLogs(w, r)
		})

		r.Post("/admin/vendors/{id}/suspend", func(w http.ResponseWriter, r *http.Request) {
			if operationsHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Operations service unavailable", nil)
				return
			}
			operationsHandler.SuspendVendor(w, r)
		})

		r.Post("/admin/vendors/{id}/reactivate", func(w http.ResponseWriter, r *http.Request) {
			if operationsHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Operations service unavailable", nil)
				return
			}
			operationsHandler.ReactivateVendor(w, r)
		})

		r.Get("/admin/operations/incidents", func(w http.ResponseWriter, r *http.Request) {
			if operationsHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Operations service unavailable", nil)
				return
			}
			operationsHandler.ListIncidents(w, r)
		})

		r.Post("/admin/operations/incidents/{id}/action", func(w http.ResponseWriter, r *http.Request) {
			if operationsHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Operations service unavailable", nil)
				return
			}
			operationsHandler.HandleIncidentAction(w, r)
		})

		r.Post("/users/status", func(w http.ResponseWriter, r *http.Request) {
			if userMgmtHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
				return
			}
			userMgmtHandler.UpdateStatus(w, r)
		})

		r.Post("/users/services", func(w http.ResponseWriter, r *http.Request) {
			if userMgmtHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
				return
			}
			userMgmtHandler.AddUserService(w, r)
		})

		r.Post("/users/skills-assets", func(w http.ResponseWriter, r *http.Request) {
			if userMgmtHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
				return
			}
			userMgmtHandler.AddUserService(w, r)
		})

		// Vendor Catalog Marketplace endpoints
		r.Get("/catalog/search", func(w http.ResponseWriter, r *http.Request) {
			if catalogHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Catalog service unavailable", nil)
				return
			}
			catalogHandler.SearchCatalog(w, r)
		})

		// Phase 4: Single Offering Detail
		r.Get("/catalog/items/{id}", func(w http.ResponseWriter, r *http.Request) {
			if catalogHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Catalog service unavailable", nil)
				return
			}
			catalogHandler.GetMarketplaceOfferingByID(w, r)
		})
		r.Get("/catalog/{id}", func(w http.ResponseWriter, r *http.Request) {
			if catalogHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Catalog service unavailable", nil)
				return
			}
			catalogHandler.GetMarketplaceOfferingByID(w, r)
		})

		// Phase 4: Eligible Vendors Discovery by Category
		r.Get("/categories/{category_id}/vendors", func(w http.ResponseWriter, r *http.Request) {
			if catalogHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Catalog service unavailable", nil)
				return
			}
			catalogHandler.GetEligibleVendorsByCategory(w, r)
		})

		// Phase 4: Compare Offerings Side-by-Side
		r.Post("/catalog/compare", func(w http.ResponseWriter, r *http.Request) {
			if catalogHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Catalog service unavailable", nil)
				return
			}
			catalogHandler.CompareOfferings(w, r)
		})
		r.Get("/catalog/compare", func(w http.ResponseWriter, r *http.Request) {
			if catalogHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Catalog service unavailable", nil)
				return
			}
			catalogHandler.CompareOfferings(w, r)
		})

		// ---------------------------------------------------------------------
		// Phase 5: Cart, Checkout, Pricing & Inventory Management Endpoints
		// ---------------------------------------------------------------------
		r.Post("/cart/validate", func(w http.ResponseWriter, r *http.Request) {
			if checkoutHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Checkout service unavailable", nil)
				return
			}
			checkoutHandler.ValidateCart(w, r)
		})

		r.Post("/checkout/initiate", func(w http.ResponseWriter, r *http.Request) {
			if checkoutHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Checkout service unavailable", nil)
				return
			}
			checkoutHandler.InitiateCheckout(w, r)
		})

		r.Post("/checkout/payment/callback", func(w http.ResponseWriter, r *http.Request) {
			if checkoutHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Checkout service unavailable", nil)
				return
			}
			checkoutHandler.ProcessPaymentCallback(w, r)
		})

		r.Post("/checkout/{id}/cancel", func(w http.ResponseWriter, r *http.Request) {
			if checkoutHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Checkout service unavailable", nil)
				return
			}
			checkoutHandler.CancelCheckoutOrder(w, r)
		})

		r.Get("/vendors/{vendor_id}/catalog", func(w http.ResponseWriter, r *http.Request) {
			if catalogHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Catalog service unavailable", nil)
				return
			}
			catalogHandler.GetVendorCatalog(w, r)
		})

		r.Get("/vendors/{vendor_id}/catalog/tree", func(w http.ResponseWriter, r *http.Request) {
			if catalogHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Catalog service unavailable", nil)
				return
			}
			catalogHandler.GetVendorCatalogTree(w, r)
		})

		r.Post("/vendor/catalog/{id}/move", func(w http.ResponseWriter, r *http.Request) {
			if catalogHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Catalog service unavailable", nil)
				return
			}
			catalogHandler.MoveCatalogNode(w, r)
		})

		r.Post("/vendor/catalog/reorder", func(w http.ResponseWriter, r *http.Request) {
			if catalogHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Catalog service unavailable", nil)
				return
			}
			catalogHandler.ReorderCatalogNodes(w, r)
		})

		r.Post("/vendor/catalog/{id}/archive", func(w http.ResponseWriter, r *http.Request) {
			if catalogHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Catalog service unavailable", nil)
				return
			}
			catalogHandler.ArchiveCatalogItem(w, r)
		})

		r.Post("/vendor/catalog", func(w http.ResponseWriter, r *http.Request) {
			if catalogHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Catalog service unavailable", nil)
				return
			}
			catalogHandler.CreateCatalogItem(w, r)
		})

		r.Post("/services/create", func(w http.ResponseWriter, r *http.Request) {
			if catalogHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Catalog service unavailable", nil)
				return
			}
			catalogHandler.CreateCatalogItem(w, r)
		})

		r.Put("/vendor/catalog/{id}", func(w http.ResponseWriter, r *http.Request) {
			if catalogHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Catalog service unavailable", nil)
				return
			}
			catalogHandler.UpdateCatalogItem(w, r)
		})

		r.Delete("/vendor/catalog/{id}", func(w http.ResponseWriter, r *http.Request) {
			if catalogHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Catalog service unavailable", nil)
				return
			}
			catalogHandler.DeleteCatalogItem(w, r)
		})

		r.Get("/provider/offers", func(w http.ResponseWriter, r *http.Request) {
			if catHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
				return
			}
			catHandler.GetProviderOffers(w, r)
		})




		r.Get("/opportunities/public", func(w http.ResponseWriter, r *http.Request) {
			if oppHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
				return
			}
			oppHandler.ListPublic(w, r)
		})

		r.Get("/opportunities/matching", func(w http.ResponseWriter, r *http.Request) {
			if oppHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
				return
			}
			oppHandler.ListMatchingRequests(w, r)
		})

		r.Get("/opportunities/accepted", func(w http.ResponseWriter, r *http.Request) {
			if oppHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
				return
			}
			oppHandler.ListAcceptedOrders(w, r)
		})

		r.Get("/opportunities/my-orders", func(w http.ResponseWriter, r *http.Request) {
			if oppHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
				return
			}
			oppHandler.ListCustomerOrders(w, r)
		})

		r.Route("/notifications", func(r chi.Router) {
			r.Get("/", func(w http.ResponseWriter, r *http.Request) {
				if operationsHandler != nil {
					operationsHandler.GetNotifications(w, r)
					return
				}
				if oppHandler == nil {
					response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
					return
				}
				oppHandler.GetNotifications(w, r)
			})

			r.Get("/preferences", func(w http.ResponseWriter, r *http.Request) {
				if operationsHandler == nil {
					response.Error(w, http.StatusServiceUnavailable, "Operations service unavailable", nil)
					return
				}
				operationsHandler.GetNotificationPreferences(w, r)
			})

			r.Put("/preferences", func(w http.ResponseWriter, r *http.Request) {
				if operationsHandler == nil {
					response.Error(w, http.StatusServiceUnavailable, "Operations service unavailable", nil)
					return
				}
				operationsHandler.UpdateNotificationPreferences(w, r)
			})

			r.Get("/unread-count", func(w http.ResponseWriter, r *http.Request) {
				if oppHandler == nil {
					response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
					return
				}
				oppHandler.GetUnreadNotificationCount(w, r)
			})

			r.Post("/read-all", func(w http.ResponseWriter, r *http.Request) {
				if oppHandler == nil {
					response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
					return
				}
				oppHandler.MarkAllNotificationsAsRead(w, r)
			})

			r.Post("/{id}/read", func(w http.ResponseWriter, r *http.Request) {
				if oppHandler == nil {
					response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
					return
				}
				oppHandler.MarkNotificationAsRead(w, r)
			})
		})

		r.Post("/opportunities/create", func(w http.ResponseWriter, r *http.Request) {
			if oppHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
				return
			}
			oppHandler.Create(w, r)
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

		r.Post("/opportunities/{id}/accept", func(w http.ResponseWriter, r *http.Request) {
			if oppHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
				return
			}
			oppHandler.UpdateStatus(w, r)
		})

		r.Post("/opportunities/{id}/confirm-resources", func(w http.ResponseWriter, r *http.Request) {
			if oppHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
				return
			}
			oppHandler.ConfirmResources(w, r)
		})

		r.Put("/opportunities/{id}/resources", func(w http.ResponseWriter, r *http.Request) {
			if oppHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
				return
			}
			oppHandler.ConfirmResources(w, r)
		})

		r.Get("/opportunities/{id}/history", func(w http.ResponseWriter, r *http.Request) {
			if oppHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
				return
			}
			oppHandler.GetStatusHistory(w, r)
		})

		r.Get("/opportunities/{id}/commuter-matches", func(w http.ResponseWriter, r *http.Request) {
			if oppHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
				return
			}
			oppHandler.GetCommuterMatches(w, r)
		})

		r.Post("/opportunities/{id}/match-commuters", func(w http.ResponseWriter, r *http.Request) {
			if oppHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
				return
			}
			oppHandler.DispatchCommuterMatches(w, r)
		})

		// ---------------------------------------------------------------------
		// Journey Management Endpoints (Phase A)
		// ---------------------------------------------------------------------
		r.Post("/journeys", func(w http.ResponseWriter, r *http.Request) {
			if oppHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
				return
			}
			oppHandler.RegisterJourney(w, r)
		})

		r.Get("/journeys", func(w http.ResponseWriter, r *http.Request) {
			if oppHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
				return
			}
			oppHandler.ListUserJourneys(w, r)
		})

		r.Get("/journeys/{id}", func(w http.ResponseWriter, r *http.Request) {
			if oppHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
				return
			}
			oppHandler.GetJourney(w, r)
		})

		r.Put("/journeys/{id}", func(w http.ResponseWriter, r *http.Request) {
			if oppHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
				return
			}
			oppHandler.UpdateJourney(w, r)
		})

		r.Post("/journeys/{id}/status", func(w http.ResponseWriter, r *http.Request) {
			if oppHandler == nil {
				response.Error(w, http.StatusServiceUnavailable, "Database not connected", nil)
				return
			}
			oppHandler.SetJourneyStatus(w, r)
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
			r.Post("/logistics/calculate-delivery", logisticsHandler.CalculateDelivery)
			r.Post("/logistics/sos", logisticsHandler.ReportSOSIncident)
			r.Post("/logistics/manifest", logisticsHandler.GenerateWayManifest)
			r.Post("/logistics/manifest/pol", logisticsHandler.UploadPOL)
			r.Post("/logistics/manifest/pod", logisticsHandler.UploadPOD)
			r.Post("/opportunities/{id}/verify-delivery-otp", logisticsHandler.VerifyDeliveryOTP)
			r.Post("/escrow/settle/{root_id}", logisticsHandler.SettleEscrow)

			// Phase 6: Order Fulfilment & Logistics Lifecycle Endpoints
			r.Get("/vendor/orders", logisticsHandler.GetVendorOrders)
			r.Get("/vendor/orders/{id}", logisticsHandler.GetVendorOrderDetail)
			r.Post("/vendor/orders/{id}/actions", logisticsHandler.ExecuteVendorAction)
			r.Post("/logistics/providers/match", logisticsHandler.MatchTransportProviders)
			r.Post("/logistics/assign-driver-vehicle", logisticsHandler.AssignDriverAndVehicle)
			r.Post("/logistics/manifests", logisticsHandler.GenerateOrGetWayManifest)
			r.Post("/logistics/manifests/pol", logisticsHandler.RegisterProofOfLoading)
			r.Post("/logistics/manifests/pod", logisticsHandler.RegisterProofOfDelivery)
			r.Get("/opportunities/{id}/delivery-otp", logisticsHandler.GenerateDeliveryOTP)
			r.Post("/opportunities/{id}/delivery-otp", logisticsHandler.GenerateDeliveryOTP)
			r.Post("/opportunities/{id}/verify-delivery-otp-secure", logisticsHandler.VerifySecureDeliveryOTP)
			r.Post("/logistics/sos/incident", logisticsHandler.SubmitSOSIncident)
			r.Post("/logistics/sos/resolve", logisticsHandler.ResolveSOSIncident)
			r.Post("/opportunities/{id}/status-transition", logisticsHandler.TransitionOrderStatus)
		}
	})

	// Background worker: Periodic inventory reservation expiry sweeper (every 60 seconds)
	if checkoutService != nil {
		go func() {
			ticker := time.NewTicker(60 * time.Second)
			defer ticker.Stop()
			for range ticker.C {
				ctxSweep, cancelSweep := context.WithTimeout(context.Background(), 10*time.Second)
				expiredCount, err := checkoutService.ExpireStaleReservations(ctxSweep)
				cancelSweep()
				if err != nil {
					log.Printf("[Checkout Expiry Worker] Error sweeping expired reservations: %v\n", err)
				} else if expiredCount > 0 {
					log.Printf("[Checkout Expiry Worker] Successfully expired %d stale reservation(s)\n", expiredCount)
				}
			}
		}()
	}

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
	if notificationDispatcher != nil {
		notificationDispatcher.Stop()
		log.Println("[API Server] Background Notification Dispatcher worker stopped cleanly")
	}
	ctxShutdown, cancelShutdown := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancelShutdown()

	if err := server.Shutdown(ctxShutdown); err != nil {
		log.Fatalf("Server forced to shutdown: %v\n", err)
	}

	log.Println("Server exited cleanly.")
}
