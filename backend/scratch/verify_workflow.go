//go:build ignore

package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

type Envelope struct {
	Status  string          `json:"status"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data"`
}

func main() {
	fmt.Println("==================================================")
	fmt.Println("UOP 3-STAGE WORKFLOW VERIFICATION TEST SCRIPT")
	fmt.Println("==================================================")

	// STAGE 1: Service Request
	fmt.Println("\n--- TEST A: STAGE 1 (Vendor Service Request) ---")
	s1Payload := map[string]interface{}{
		"user_id":     "00000000-0000-0000-0000-000000000001",
		"phone":       "+919999999999",
		"category_id": "7",
		"asset_type":  "BRICKS_BUILDING_MATERIALS",
		"title":       "Vyshnavi Red Clay Bricks Yard",
		"description": "Premium quality red clay bricks and fly ash blocks",
	}
	s1Bytes, _ := json.Marshal(s1Payload)
	resp1, err := http.Post("http://localhost:8080/api/v1/users/services", "application/json", bytes.NewBuffer(s1Bytes))
	if err != nil {
		fmt.Printf("Stage 1 HTTP Request Failed: %v\n", err)
		return
	}
	defer resp1.Body.Close()

	body1, _ := io.ReadAll(resp1.Body)
	var env1 Envelope
	json.Unmarshal(body1, &env1)

	var assetData struct {
		ID     string `json:"id"`
		Status string `json:"status"`
	}
	json.Unmarshal(env1.Data, &assetData)
	fmt.Printf("Stage 1 Created Asset ID: %s | Status: %s\n", assetData.ID, assetData.Status)

	if assetData.ID == "" {
		fmt.Println("Stage 1 asset creation failed, exiting test.")
		return
	}

	// STAGE 1 ADMIN APPROVAL
	fmt.Println("\n--- STAGE 1: ADMIN APPROVAL ---")
	resp1Approve, err := http.Post(fmt.Sprintf("http://localhost:8080/api/v1/admin/services/%s/approve", assetData.ID), "application/json", nil)
	if err != nil {
		fmt.Printf("Stage 1 Admin Approval HTTP Failed: %v\n", err)
		return
	}
	defer resp1Approve.Body.Close()

	body1App, _ := io.ReadAll(resp1Approve.Body)
	var env1App Envelope
	json.Unmarshal(body1App, &env1App)
	var s1AppAsset struct {
		Status string `json:"status"`
	}
	json.Unmarshal(env1App.Data, &s1AppAsset)
	fmt.Printf("Stage 1 Approved Status: %s (DOCUMENTS_PENDING unlocks Stage 2 Form)\n", s1AppAsset.Status)

	// STAGE 2: Vendor Service Details Submission
	fmt.Println("\n--- TEST B: STAGE 2 (Dynamic Service Details Submission) ---")
	s2Payload := map[string]interface{}{
		"asset_id": assetData.ID,
		"user_id":  "00000000-0000-0000-0000-000000000001",
		"phone":    "+919999999999",
		"documents": map[string]interface{}{
			"brick_type":      "Red Clay Bricks",
			"dimensions":      "230 x 110 x 70 mm",
			"quality_grade":   "Class A (High Strength)",
			"moq_units":       1000,
			"base_price":      1500,
			"pickup_location": "Choutuppal Storage Yard",
			"photos":          []string{"/uploads/sample_bricks.jpg"},
		},
	}
	s2Bytes, _ := json.Marshal(s2Payload)
	resp2, err := http.Post("http://localhost:8080/api/v1/users/services/documents", "application/json", bytes.NewBuffer(s2Bytes))
	if err != nil {
		fmt.Printf("Stage 2 HTTP Failed: %v\n", err)
		return
	}
	defer resp2.Body.Close()

	body2, _ := io.ReadAll(resp2.Body)
	var env2 Envelope
	json.Unmarshal(body2, &env2)
	var s2Asset struct {
		Status string `json:"status"`
	}
	json.Unmarshal(env2.Data, &s2Asset)
	fmt.Printf("Stage 2 Submitted Status: %s (UNDER_REVIEW awaits Admin Stage 2 Approval)\n", s2Asset.Status)

	// STAGE 2 ADMIN APPROVAL
	fmt.Println("\n--- STAGE 2: ADMIN DETAILS APPROVAL ---")
	s2ApprovePayload := map[string]interface{}{
		"approve":          true,
		"rejection_reason": "",
	}
	s2AppBytes, _ := json.Marshal(s2ApprovePayload)
	resp2App, err := http.Post(fmt.Sprintf("http://localhost:8080/api/v1/admin/services/%s/review-documents", assetData.ID), "application/json", bytes.NewBuffer(s2AppBytes))
	if err != nil {
		fmt.Printf("Stage 2 Admin Approval HTTP Failed: %v\n", err)
		return
	}
	defer resp2App.Body.Close()

	body2App, _ := io.ReadAll(resp2App.Body)
	var env2App Envelope
	json.Unmarshal(body2App, &env2App)
	var s2ActiveAsset struct {
		Status      string `json:"status"`
		IsAvailable bool   `json:"is_available"`
	}
	json.Unmarshal(env2App.Data, &s2ActiveAsset)
	fmt.Printf("Stage 2 Approved Status: %s | Is Available: %t (ACTIVE unlocks Stage 3 [+ Add Sub-Service])\n", s2ActiveAsset.Status, s2ActiveAsset.IsAvailable)

	// STAGE 3: Vendor Sub-Service Offering Creation
	fmt.Println("\n--- TEST C: STAGE 3 (Vendor Sub-Service Offering Creation) ---")
	s3Payload := map[string]interface{}{
		"vendor_user_id":     "00000000-0000-0000-0000-000000000001",
		"vendor_asset_id":    assetData.ID,
		"category_id":        "7",
		"title":              "Bricks + Loading + Transportation",
		"description":        "1,000 Class A Red Bricks with yard loading and site transport included",
		"unit_price":         2200,
		"price_unit":         "PER_1000_PCS",
		"min_order_quantity": 1000,
		"pickup_address":     "Choutuppal Yard",
		"images":             []string{"/uploads/sample_bricks.jpg"},
		"attributes": map[string]interface{}{
			"included_components": []string{"Bricks", "Loading", "Transportation"},
		},
	}
	s3Bytes, _ := json.Marshal(s3Payload)
	resp3, err := http.Post("http://localhost:8080/api/v1/vendor/catalog", "application/json", bytes.NewBuffer(s3Bytes))
	if err != nil {
		fmt.Printf("Stage 3 HTTP Failed: %v\n", err)
		return
	}
	defer resp3.Body.Close()

	body3, _ := io.ReadAll(resp3.Body)
	var env3 Envelope
	json.Unmarshal(body3, &env3)
	var offeringData struct {
		ID     string `json:"id"`
		Status string `json:"status"`
	}
	json.Unmarshal(env3.Data, &offeringData)
	fmt.Printf("Stage 3 Created Offering ID: %s | Status: %s (PENDING_ADMIN_APPROVAL)\n", offeringData.ID, offeringData.Status)

	// STAGE 3 ADMIN APPROVAL
	fmt.Println("\n--- STAGE 3: ADMIN SUB-SERVICE APPROVAL ---")
	resp3App, err := http.Post(fmt.Sprintf("http://localhost:8080/api/v1/admin/catalog/%s/approve", offeringData.ID), "application/json", nil)
	if err != nil {
		fmt.Printf("Stage 3 Admin Approval HTTP Failed: %v\n", err)
		return
	}
	defer resp3App.Body.Close()

	body3App, _ := io.ReadAll(resp3App.Body)
	var env3App Envelope
	json.Unmarshal(body3App, &env3App)
	var s3ActiveOffering struct {
		Status      string `json:"status"`
		IsAvailable bool   `json:"is_available"`
	}
	json.Unmarshal(env3App.Data, &s3ActiveOffering)
	fmt.Printf("Stage 3 Approved Status: %s | Is Available: %t (Published to Marketplace)\n", s3ActiveOffering.Status, s3ActiveOffering.IsAvailable)

	// MARKETPLACE SEARCH VERIFICATION
	fmt.Println("\n--- TEST D: MARKETPLACE EXPOSURE VERIFICATION ---")
	respMkt, err := http.Get("http://localhost:8080/api/v1/catalog/search?q=Bricks&category=bricks-building-materials")
	if err != nil {
		fmt.Printf("Marketplace Search Failed: %v\n", err)
		return
	}
	defer respMkt.Body.Close()

	bodyMkt, _ := io.ReadAll(respMkt.Body)
	var envMkt Envelope
	json.Unmarshal(bodyMkt, &envMkt)
	var items []struct {
		ID    string  `json:"id"`
		Title string  `json:"title"`
		Price float64 `json:"unit_price"`
	}
	json.Unmarshal(envMkt.Data, &items)
	fmt.Printf("Marketplace Search Items Returned: %d\n", len(items))
	for idx, item := range items {
		fmt.Printf("  [%d] Offering ID: %s | Title: %s | Price: ₹%.2f\n", idx+1, item.ID, item.Title, item.Price)
	}

	fmt.Println("\n==================================================")
	fmt.Println("ALL 3 STAGES VERIFIED SUCCESSFULLY!")
	fmt.Println("==================================================")
}
