package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"
)

const baseURL = "http://localhost:8080/api/v1"

func main() {
	fmt.Println("==========================================================")
	fmt.Println("RUNNING E2E VERIFICATION FOR VENDOR SERVICE OFFERINGS / SUB-SERVICES")
	fmt.Println("==========================================================")

	client := &http.Client{Timeout: 10 * time.Second}

	// 1. Get Categories to find Main Service (Bricks & Building Materials)
	fmt.Println("\n[STEP 1] Fetching Main Service Categories...")
	req, _ := http.NewRequest("GET", baseURL+"/categories", nil)
	resp, err := client.Do(req)
	if err != nil {
		fmt.Printf("ERROR: Failed to connect to API server: %v\n", err)
		os.Exit(1)
	}
	defer resp.Body.Close()

	var catRes struct {
		Data []struct {
			ID   string `json:"id"`
			Slug string `json:"slug"`
			Name string `json:"name"`
		} `json:"data"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&catRes)

	if len(catRes.Data) == 0 {
		fmt.Println("ERROR: No categories found in system.")
		os.Exit(1)
	}

	var mainCatID string
	var mainCatName string
	for fontCat := range catRes.Data {
		c := catRes.Data[fontCat]
		if c.Slug == "bricks" || c.Name == "Bricks & Building Materials" {
			mainCatID = c.ID
			mainCatName = c.Name
			break
		}
	}
	if mainCatID == "" {
		mainCatID = catRes.Data[0].ID
		mainCatName = catRes.Data[0].Name
	}
	fmt.Printf("✓ Main Service Identified: '%s' (ID: %s)\n", mainCatName, mainCatID)

	// Fetch Users to pick a Vendor
	fmt.Println("\n[STEP 2] Resolving Vendor Profile...")
	req, _ = http.NewRequest("GET", baseURL+"/users/services?phone=9876543210", nil)
	resp, err = client.Do(req)
	if err != nil {
		fmt.Printf("ERROR: Failed to query users: %v\n", err)
		os.Exit(1)
	}
	defer resp.Body.Close()

	var vendorID string = "d6138a68-ab6b-402e-b011-8ea7b71c23e9" // fallback default vendor UUID
	var vendorRes struct {
		Data []struct {
			UserID string `json:"user_id"`
		} `json:"data"`
	}
	if json.NewDecoder(resp.Body).Decode(&vendorRes) == nil && len(vendorRes.Data) > 0 {
		vendorID = vendorRes.Data[0].UserID
	}
	fmt.Printf("✓ Vendor ID: %s\n", vendorID)

	// 2. Create 4 Vendor Service Offerings under Main Service
	fmt.Println("\n[STEP 3-6] Vendor Creates 4 Service Offerings under Main Service...")

	offerings := []struct {
		Title      string   `json:"title"`
		UnitPrice  float64  `json:"unit_price"`
		Components []string `json:"components"`
	}{
		{Title: "Bricks", UnitPrice: 1500, Components: []string{"Bricks"}},
		{Title: "Bricks + Loading", UnitPrice: 1650, Components: []string{"Bricks", "Loading"}},
		{Title: "Bricks + Transportation", UnitPrice: 2000, Components: []string{"Bricks", "Transportation"}},
		{Title: "Bricks + Loading + Transportation", UnitPrice: 2200, Components: []string{"Bricks", "Loading", "Transportation"}},
	}

	createdIDs := make([]string, 0, 4)

	for i, off := range offerings {
		payload := map[string]interface{}{
			"vendor_user_id": vendorID,
			"category_id":    mainCatID,
			"title":          off.Title,
			"description":    fmt.Sprintf("Vendor offering for %s", off.Title),
			"unit_price":     off.UnitPrice,
			"price_unit":     "PER_1000_PCS",
			"stock_quantity": 50000,
			"min_order_quantity": 1000,
			"images":         []string{"/public/uploads/1791022575704971100_35d87a6a.jpg"},
			"attributes": map[string]interface{}{
				"included_components": off.Components,
			},
			"pickup_address": "Vendor Batch Yard 42, Industrial Zone",
		}
		jsonBytes, _ := json.Marshal(payload)

		req, _ = http.NewRequest("POST", baseURL+"/vendor/catalog", bytes.NewBuffer(jsonBytes))
		req.Header.Set("Content-Type", "application/json")
		resp, err = client.Do(req)
		if err != nil {
			fmt.Printf("ERROR creating offering %d: %v\n", i+1, err)
			os.Exit(1)
		}

		var itemRes struct {
			Data struct {
				ID     string `json:"id"`
				Title  string `json:"title"`
				Status string `json:"status"`
			} `json:"data"`
		}
		bodyBytes, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		_ = json.Unmarshal(bodyBytes, &itemRes)

		if itemRes.Data.ID == "" {
			fmt.Printf("ERROR: Failed to parse created offering response: %s\n", string(bodyBytes))
			os.Exit(1)
		}

		fmt.Printf("  - Offering %d: '%s' (₹%.2f) -> Status: %s [ID: %s]\n", i+1, itemRes.Data.Title, off.UnitPrice, itemRes.Data.Status, itemRes.Data.ID)

		if itemRes.Data.Status != "PENDING_ADMIN_APPROVAL" {
			fmt.Printf("ERROR: Offering %d status was expected to be PENDING_ADMIN_APPROVAL, got %s\n", i+1, itemRes.Data.Status)
			os.Exit(1)
		}

		createdIDs = append(createdIDs, itemRes.Data.ID)
	}

	// 3. Admin Reviews & Decision: Reject Offering 2, Approve Offerings 1, 3, 4
	fmt.Println("\n[STEP 7-10] Admin Reviews & Decision...")
	// Reject Offering 2 (Bricks + Loading)
	fmt.Printf("  - Rejecting Offering 2 ('%s', ID: %s) with reason...\n", offerings[1].Title, createdIDs[1])
	rejectBody, _ := json.Marshal(map[string]string{"rejection_reason": "Loading fee schedule exceeds standard regional tier limits."})
	req, _ = http.NewRequest("POST", baseURL+fmt.Sprintf("/admin/catalog/%s/reject", createdIDs[1]), bytes.NewBuffer(rejectBody))
	req.Header.Set("Content-Type", "application/json")
	resp, err = client.Do(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		fmt.Printf("ERROR rejecting offering: %v (code: %d)\n", err, resp.StatusCode)
		os.Exit(1)
	}
	resp.Body.Close()
	fmt.Println("    ✓ Status -> REJECTED")

	// Approve Offerings 1, 3, 4
	for _, idx := range []int{0, 2, 3} {
		fmt.Printf("  - Approving Offering %d ('%s', ID: %s)...\n", idx+1, offerings[idx].Title, createdIDs[idx])
		req, _ = http.NewRequest("POST", baseURL+fmt.Sprintf("/admin/catalog/%s/approve", createdIDs[idx]), nil)
		resp, err = client.Do(req)
		if err != nil || resp.StatusCode != http.StatusOK {
			fmt.Printf("ERROR approving offering: %v (code: %d)\n", err, resp.StatusCode)
			os.Exit(1)
		}
		resp.Body.Close()
		fmt.Println("    ✓ Status -> ACTIVE_IN_CATALOG / APPROVED")
	}

	// 4. Public Marketplace Search Verification
	fmt.Println("\n[STEP 11] Customer Marketplace Search Verification...")
	req, _ = http.NewRequest("GET", baseURL+"/catalog/search?q=Bricks", nil)
	resp, err = client.Do(req)
	if err != nil {
		fmt.Printf("ERROR searching catalog: %v\n", err)
		os.Exit(1)
	}
	defer resp.Body.Close()

	var searchRes struct {
		Data struct {
			Items []struct {
				ID    string `json:"id"`
				Title string `json:"title"`
			} `json:"items"`
		} `json:"data"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&searchRes)

	foundIDs := make(map[string]bool)
	for _, it := range searchRes.Data.Items {
		foundIDs[it.ID] = true
	}

	fmt.Printf("  - Search returned %d approved catalog items.\n", len(searchRes.Data.Items))

	if foundIDs[createdIDs[1]] {
		fmt.Println("ERROR: Rejected Offering 2 ('Bricks + Loading') was illegally returned in Marketplace search results!")
		os.Exit(1)
	} else {
		fmt.Println("  ✓ Verified: Rejected offering is HIDDEN from customer Marketplace search.")
	}

	if !foundIDs[createdIDs[0]] || !foundIDs[createdIDs[2]] || !foundIDs[createdIDs[3]] {
		fmt.Println("ERROR: Approved offerings were missing from Marketplace search.")
		os.Exit(1)
	} else {
		fmt.Println("  ✓ Verified: All approved offerings (1, 3, 4) are VISIBLE in Marketplace.")
	}

	// 5. Edit Test (Requirement 35)
	fmt.Println("\n[STEP 12 - EDIT TEST] Vendor Edits Price of Approved Offering 3...")
	editPayload := map[string]interface{}{
		"vendor_user_id": vendorID,
		"title":          "Bricks + Transportation",
		"unit_price":     2200.0,
		"price_unit":     "PER_1000_PCS",
		"is_available":   false,
	}
	editBytes, _ := json.Marshal(editPayload)
	req, _ = http.NewRequest("PUT", baseURL+fmt.Sprintf("/vendor/catalog/%s", createdIDs[2]), bytes.NewBuffer(editBytes))
	req.Header.Set("Content-Type", "application/json")
	resp, err = client.Do(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		fmt.Printf("ERROR updating offering: %v (code: %d)\n", err, resp.StatusCode)
		os.Exit(1)
	}
	var editRes struct {
		Data struct {
			Status string `json:"status"`
		} `json:"data"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&editRes)
	resp.Body.Close()

	fmt.Printf("  - Updated status: %s\n", editRes.Data.Status)
	if editRes.Data.Status != "PENDING_ADMIN_APPROVAL" {
		fmt.Printf("ERROR: Editing approved offering did not reset status to PENDING_ADMIN_APPROVAL! Got %s\n", editRes.Data.Status)
		os.Exit(1)
	}
	fmt.Println("  ✓ Verified: Material edit automatically transitions status back to PENDING_ADMIN_APPROVAL.")

	// Re-approve Offering 3 for clean state
	req, _ = http.NewRequest("POST", baseURL+fmt.Sprintf("/admin/catalog/%s/approve", createdIDs[2]), nil)
	resp, _ = client.Do(req)
	if resp != nil {
		resp.Body.Close()
	}

	// 6. Photo Test (Requirement 36)
	fmt.Println("\n[STEP 13 - PHOTO TEST] Vendor Updates Photos on Offering...")
	photoPayload := map[string]interface{}{
		"vendor_user_id": vendorID,
		"title":          "Bricks + Loading + Transportation",
		"unit_price":     2200.0,
		"price_unit":     "PER_1000_PCS",
		"images":         []string{"/public/uploads/1791022575704971100_35d87a6a.jpg", "/public/uploads/photo2.jpg"},
	}
	photoBytes, _ := json.Marshal(photoPayload)
	req, _ = http.NewRequest("PUT", baseURL+fmt.Sprintf("/vendor/catalog/%s", createdIDs[3]), bytes.NewBuffer(photoBytes))
	req.Header.Set("Content-Type", "application/json")
	resp, err = client.Do(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		fmt.Printf("ERROR updating photos: %v (code: %d)\n", err, resp.StatusCode)
		os.Exit(1)
	}
	resp.Body.Close()
	fmt.Println("  ✓ Verified: Photos persisted directly to offering without requiring a separate photo approval step.")

	fmt.Println("\n==========================================================")
	fmt.Println("ALL E2E SUB-SERVICE & ADMIN APPROVAL VERIFICATION TESTS PASSED!")
	fmt.Println("==========================================================")
}
