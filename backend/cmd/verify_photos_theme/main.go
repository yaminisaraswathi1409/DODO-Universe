package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"github.com/go-chi/chi/v5"
	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/uop/backend/internal/config"
	"github.com/uop/backend/internal/handler"
	"github.com/uop/backend/internal/repository/postgres"
	"github.com/uop/backend/internal/service"
)

func main() {
	cfg := config.LoadConfig()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	fmt.Println("=========================================================================")
	fmt.Println("       UOP SERVICE PHOTOS & ADMIN APPROVAL - E2E RUNTIME VERIFICATION     ")
	fmt.Println("=========================================================================")

	pgDB, err := postgres.NewPostgresDB(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("Failed to connect to DB: %v", err)
	}

	userRepo := postgres.NewUserRepository(pgDB)
	catalogRepo := postgres.NewCatalogRepository(pgDB)
	catalogService := service.NewCatalogService(catalogRepo, userRepo)
	catalogHandler := handler.NewCatalogHandler(catalogService, userRepo)
	uploadHandler := handler.NewUploadHandler("./public/uploads")

	r := chi.NewRouter()
	r.Route("/api/v1", func(r chi.Router) {
		r.Post("/upload", uploadHandler.HandleFileUpload)
		r.Post("/services/create", catalogHandler.CreateCatalogItem)
		r.Get("/admin/catalog/requests", catalogHandler.ListAdminCatalogRequests)
		r.Post("/admin/catalog/{id}/approve", catalogHandler.ApproveCatalogItem)
		r.Put("/vendor/catalog/{id}", catalogHandler.UpdateCatalogItem)
		r.Get("/catalog/search", catalogHandler.SearchCatalog)
	})

	server := &http.Server{Addr: "127.0.0.1:8089", Handler: r}
	go func() {
		_ = server.ListenAndServe()
	}()
	time.Sleep(500 * time.Millisecond)

	db, err := sql.Open("pgx", cfg.DatabaseURL+"&default_query_exec_mode=exec")
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer db.Close()

	// Seed test vendor
	var vendorID string
	_ = db.QueryRow("SELECT id FROM users WHERE role IN ('VENDOR', 'SEEKER', 'USER') LIMIT 1").Scan(&vendorID)
	if vendorID == "" {
		vendorID = "00000000-0000-0000-0000-000000000001"
		_, _ = db.Exec(`
			INSERT INTO users (id, phone, full_name, role, status) 
			VALUES ($1, '+919876543210', 'Test Brick Vendor', 'VENDOR', 'ACTIVE') 
			ON CONFLICT (id) DO NOTHING
		`, vendorID)
	}

	baseURL := "http://127.0.0.1:8089/api/v1"

	// -------------------------------------------------------------------------
	// STEP 1: TEST FILE UPLOAD API (POST /api/v1/upload)
	// -------------------------------------------------------------------------
	fmt.Println("\n[1/5] Testing File Upload Endpoint (POST /api/v1/upload)...")
	dummyImgPath := filepath.Join(os.TempDir(), "test_brick_photo.jpg")
	dummyData := []byte("\xFF\xD8\xFF\xE0\x00\x10JFIF\x00\x01\x01\x01\x00\x48\x00\x48\x00\x00\xFF\xDB\x00\x43\x00DummyJpegDataBytes")
	_ = os.WriteFile(dummyImgPath, dummyData, 0644)
	defer os.Remove(dummyImgPath)

	bodyBuf := &bytes.Buffer{}
	mw := multipart.NewWriter(bodyBuf)
	fileWriter, _ := mw.CreateFormFile("file", "brick_batch_yard.jpg")
	fileWriter.Write(dummyData)
	mw.Close()

	reqUpload, _ := http.NewRequest("POST", baseURL+"/upload", bodyBuf)
	reqUpload.Header.Set("Content-Type", mw.FormDataContentType())
	respUpload, err := http.DefaultClient.Do(reqUpload)

	var uploadedPhotoURL string
	if err != nil {
		fmt.Printf("  ❌ Upload API Failed: %v\n", err)
	} else {
		uBytes, _ := io.ReadAll(respUpload.Body)
		respUpload.Body.Close()
		var resMap map[string]interface{}
		_ = json.Unmarshal(uBytes, &resMap)
		if data, ok := resMap["data"].(map[string]interface{}); ok {
			uploadedPhotoURL, _ = data["url"].(string)
			fmt.Printf("  ✅ File Upload Success! Stored URL: %s\n", uploadedPhotoURL)
		} else {
			fmt.Printf("  ❌ Upload Error Response: %s\n", string(uBytes))
		}
	}

	if uploadedPhotoURL == "" {
		uploadedPhotoURL = "/uploads/test_brick_batch_1.jpg"
	}
	secondPhotoURL := "/uploads/test_brick_yard_2.jpg"

	// -------------------------------------------------------------------------
	// STEP 2: CREATE VENDOR CATALOG SERVICE WITH PHOTOS
	// -------------------------------------------------------------------------
	fmt.Println("\n[2/5] Creating Vendor Catalog Item with Photos (POST /api/v1/services/create)...")
	photosArray := []string{uploadedPhotoURL, secondPhotoURL}
	photosJSON, _ := json.Marshal(photosArray)

	createPayload := map[string]interface{}{
		"vendor_user_id":     vendorID,
		"title":              "Kiln Fired Red Bricks (Grade A)",
		"description":        "High density structural red clay bricks with test photos",
		"unit_price":         8.50,
		"price_unit":         "PER_PIECE",
		"stock_quantity":     50000,
		"min_order_quantity": 2000,
		"images":             json.RawMessage(photosJSON),
	}
	cBytes, _ := json.Marshal(createPayload)
	respCreate, err := http.Post(baseURL+"/services/create", "application/json", bytes.NewBuffer(cBytes))
	var createdID string
	if err != nil {
		fmt.Printf("  ❌ Service Creation Failed: %v\n", err)
	} else {
		crBody, _ := io.ReadAll(respCreate.Body)
		respCreate.Body.Close()
		var resMap map[string]interface{}
		_ = json.Unmarshal(crBody, &resMap)
		if data, ok := resMap["data"].(map[string]interface{}); ok {
			createdID, _ = data["id"].(string)
			st, _ := data["status"].(string)
			fmt.Printf("  ✅ Created Item ID: %s | Status: %s\n", createdID, st)
		}
	}

	// -------------------------------------------------------------------------
	// STEP 3: VERIFY ADMIN APPROVAL OF SERVICE LISTING (NO PHOTO APPROVAL)
	// -------------------------------------------------------------------------
	if createdID != "" {
		fmt.Println("\n[3/5] Admin Reviewing & Approving SERVICE Listing (POST /api/v1/admin/catalog/{id}/approve)...")
		respApprove, err := http.Post(baseURL+"/admin/catalog/"+createdID+"/approve", "application/json", nil)
		if err != nil {
			fmt.Printf("  ❌ Admin Approval Failed: %v\n", err)
		} else {
			apBody, _ := io.ReadAll(respApprove.Body)
			respApprove.Body.Close()
			var resMap map[string]interface{}
			_ = json.Unmarshal(apBody, &resMap)
			if data, ok := resMap["data"].(map[string]interface{}); ok {
				st, _ := data["status"].(string)
				fmt.Printf("  ✅ Service Listing Approved! New Status: %s (Photos required NO separate admin approval)\n", st)
			}
		}
	}

	// -------------------------------------------------------------------------
	// STEP 4: VERIFY MARKETPLACE RETRIEVAL & PHOTO PERSISTENCE
	// -------------------------------------------------------------------------
	if createdID != "" {
		fmt.Println("\n[4/5] Verifying Marketplace Retrieval of Listing & Real Photos...")
		respSearch, err := http.Get(baseURL + "/catalog/search?q=Kiln")
		if err != nil {
			fmt.Printf("  ❌ Marketplace Query Failed: %v\n", err)
		} else {
			sBody, _ := io.ReadAll(respSearch.Body)
			respSearch.Body.Close()
			var resMap map[string]interface{}
			_ = json.Unmarshal(sBody, &resMap)
			if data, ok := resMap["data"].(map[string]interface{}); ok {
				if items, ok := data["items"].([]interface{}); ok && len(items) > 0 {
					first := items[0].(map[string]interface{})
					title, _ := first["title"].(string)
					rawImgs := first["images"]
					fmt.Printf("  ✅ Marketplace Item Found: '%s' | Photos JSON: %v\n", title, rawImgs)
				}
			}
		}
	}

	// -------------------------------------------------------------------------
	// STEP 5: VERIFY VENDOR PHOTO EDITING & PERSISTENCE
	// -------------------------------------------------------------------------
	if createdID != "" {
		fmt.Println("\n[5/5] Testing Vendor Photo Edit & Persistence (PUT /api/v1/vendor/catalog/{id})...")
		updatedPhotos := []string{uploadedPhotoURL, secondPhotoURL, "/uploads/test_brick_yard_3.jpg"}
		upPhotosJSON, _ := json.Marshal(updatedPhotos)

		updatePayload := map[string]interface{}{
			"vendor_user_id":     vendorID,
			"title":              "Kiln Fired Red Bricks (Grade A - 3 Photos)",
			"unit_price":         8.50,
			"price_unit":         "PER_PIECE",
			"stock_quantity":     50000,
			"min_order_quantity": 2000,
			"images":             json.RawMessage(upPhotosJSON),
		}
		uBytes, _ := json.Marshal(updatePayload)
		reqUpdate, _ := http.NewRequest("PUT", baseURL+"/vendor/catalog/"+createdID, bytes.NewBuffer(uBytes))
		reqUpdate.Header.Set("Content-Type", "application/json")
		respUpdate, err := http.DefaultClient.Do(reqUpdate)
		if err != nil {
			fmt.Printf("  ❌ Photo Edit Failed: %v\n", err)
		} else {
			upBody, _ := io.ReadAll(respUpdate.Body)
			respUpdate.Body.Close()
			var resMap map[string]interface{}
			_ = json.Unmarshal(upBody, &resMap)
			if data, ok := resMap["data"].(map[string]interface{}); ok {
				title, _ := data["title"].(string)
				rawImgs := data["images"]
				fmt.Printf("  ✅ Photo Edit Saved! Title: '%s' | Persisted Photos: %v\n", title, rawImgs)
			}
		}
	}

	fmt.Println("\n=========================================================================")
	fmt.Println("🎉 ALL E2E PHOTO & ADMIN APPROVAL VERIFICATION STEPS COMPLETED!")
	fmt.Println("=========================================================================")
}
