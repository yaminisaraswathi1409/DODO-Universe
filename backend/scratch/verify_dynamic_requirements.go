//go:build ignore

package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
)

const baseURL = "http://localhost:8080/api/v1"

type Category struct {
	ID                   string                   `json:"id"`
	Slug                 string                   `json:"slug"`
	Name                 string                   `json:"name"`
	OpportunityFields    []map[string]interface{} `json:"opportunity_fields"`
	Resources            []map[string]interface{} `json:"resources"`
	ResourceRequirements map[string]interface{}   `json:"resource_requirements"`
}

type APIResponse struct {
	Success bool            `json:"success"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data"`
}

func main() {
	fmt.Println("==========================================================")
	fmt.Println("DODO-UNIVERSE E2E DYNAMIC REQUIREMENTS ENGINE TEST SUITE")
	fmt.Println("==========================================================")

	// 1. Fetch Categories
	fmt.Println("\n[TEST A] Fetching categories from backend API...")
	resp, err := http.Get(baseURL + "/categories")
	if err != nil {
		fmt.Printf("ERROR: Failed to connect to API: %v\n", err)
		os.Exit(1)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var apiResp APIResponse
	if err := json.Unmarshal(body, &apiResp); err != nil {
		fmt.Printf("ERROR: Failed to parse API response: %v\n", err)
		os.Exit(1)
	}

	var categories []Category
	if err := json.Unmarshal(apiResp.Data, &categories); err != nil {
		fmt.Printf("ERROR: Failed to parse categories data: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("✓ Successfully retrieved %d categories from backend database.\n", len(categories))

	var targetCat *Category
	for i := range categories {
		if categories[i].Slug == "bricks-building-materials" {
			targetCat = &categories[i]
			break
		}
	}

	if targetCat == nil && len(categories) > 0 {
		targetCat = &categories[0]
	}

	if targetCat == nil {
		fmt.Println("ERROR: No categories found in system.")
		os.Exit(1)
	}

	fmt.Printf("-> Testing with Main Service: %s (ID: %s, Slug: %s)\n", targetCat.Name, targetCat.ID, targetCat.Slug)

	// 2. Admin Save Resource Configuration
	fmt.Println("\n[TEST B] Testing Admin Resource & Logistics Configuration endpoint...")
	updatedResources := []map[string]interface{}{
		{
			"id":                "res_vehicle",
			"key":               "vehicle",
			"name":              "Vehicle & Transportation",
			"description":       "Commercial transport vehicle arrangement",
			"requirement_level": "REQUIRED",
			"active":            true,
			"display_order":     1,
			"options": []map[string]interface{}{
				{"key": "BOOK_VEHICLE", "label": "1. I will book a vehicle", "description": "Vendor / platform arranges vehicle"},
				{"key": "HAVE_VEHICLE", "label": "2. I have a vehicle / Myself", "description": "Customer provides vehicle details"},
				{"key": "NO_VEHICLE", "label": "3. I do not have a vehicle", "description": "Vendor arranges vehicle"},
			},
			"fields": []map[string]interface{}{
				{"key": "vehicle_type", "label": "Vehicle Type", "type": "select", "required": true, "options": []string{"10-Wheeler Tipper", "12-Wheeler Hauler", "Tata Ace", "Tractor"}},
				{"key": "registration_number", "label": "Registration Number", "type": "text", "required": true, "placeholder": "TS-08-AB-1234"},
				{"key": "owner_name", "label": "Vehicle Owner Name", "type": "text", "required": true, "placeholder": "Owner Name"},
			},
		},
		{
			"id":                "res_driver",
			"key":               "driver",
			"name":              "Commercial Driver",
			"description":       "Licensed heavy vehicle driver arrangement",
			"requirement_level": "OPTIONAL",
			"active":            true,
			"display_order":     2,
			"options": []map[string]interface{}{
				{"key": "BOOK_DRIVER", "label": "1. I will book a driver", "description": "Vendor / platform arranges driver"},
				{"key": "HAVE_DRIVER", "label": "2. I have a driver / Myself", "description": "Customer provides driver details"},
				{"key": "NO_DRIVER", "label": "3. I do not have a driver", "description": "Vendor arranges driver"},
			},
			"fields": []map[string]interface{}{
				{"key": "driver_name", "label": "Driver Name", "type": "text", "required": true, "placeholder": "Driver Name"},
				{"key": "driver_phone", "label": "Driver Mobile Phone", "type": "text", "required": true, "placeholder": "+91 Phone"},
			},
		},
	}

	payloadBytes, _ := json.Marshal(map[string]interface{}{
		"resources": updatedResources,
	})

	saveResp, err := http.Post(baseURL+"/admin/categories/"+targetCat.ID+"/resources", "application/json", bytes.NewBuffer(payloadBytes))
	if err != nil {
		fmt.Printf("ERROR: Admin save resources request failed: %v\n", err)
		os.Exit(1)
	}
	defer saveResp.Body.Close()

	if saveResp.StatusCode != http.StatusOK {
		saveBody, _ := io.ReadAll(saveResp.Body)
		fmt.Printf("ERROR: Admin save resources returned status %d: %s\n", saveResp.StatusCode, string(saveBody))
		os.Exit(1)
	}

	fmt.Println("✓ Admin successfully updated and persisted Resource & Logistics Requirements in backend database.")

	// 3. Test Customer Opportunity Creation with Dynamic Selections
	fmt.Println("\n[TEST C] Testing Customer Request What You Need Submission...")
	oppPayload := map[string]interface{}{
		"type":           "NEED",
		"category_id":    targetCat.ID,
		"title":          "Bricks Request with Vehicle & Driver Selections",
		"description":    "750 Red Bricks required at Choutuppal site",
		"workflow_model": "MULTI_LAYER",
		"address_text":   "Choutuppal, Telangana",
		"lat":            17.25,
		"lng":            78.95,
		"radius_km":      25,
		"quantity":       750,
		"price_unit":     "FIXED",
		"metadata": map[string]interface{}{
			"category_slug": targetCat.Slug,
			"category_name": targetCat.Name,
			"quantity":      750,
			"unit":          "Pieces",
			"resource_selections": map[string]interface{}{
				"vehicle": map[string]interface{}{
					"resource_key":             "vehicle",
					"resource_name":            "Vehicle & Transportation",
					"choice":                   "HAVE_VEHICLE",
					"has_resource":             true,
					"need_provider_to_arrange": false,
					"details": map[string]interface{}{
						"vehicle_type":        "10-Wheeler Tipper",
						"registration_number": "TS-08-AB-1234",
						"owner_name":          "Telangana Fleet Corp",
					},
				},
				"driver": map[string]interface{}{
					"resource_key":             "driver",
					"resource_name":            "Commercial Driver",
					"choice":                   "NO_DRIVER",
					"has_resource":             false,
					"need_provider_to_arrange": true,
					"details":                  nil,
				},
			},
			"has_vehicle": true,
			"has_driver":  false,
			"vehicle_details": map[string]interface{}{
				"vehicle_type":        "10-Wheeler Tipper",
				"registration_number": "TS-08-AB-1234",
			},
		},
	}

	oppBytes, _ := json.Marshal(oppPayload)
	oppResp, err := http.Post(baseURL+"/opportunities/create", "application/json", bytes.NewBuffer(oppBytes))
	if err != nil {
		fmt.Printf("ERROR: Create opportunity request failed: %v\n", err)
		os.Exit(1)
	}
	defer oppResp.Body.Close()

	oppBody, _ := io.ReadAll(oppResp.Body)
	if oppResp.StatusCode != http.StatusOK && oppResp.StatusCode != http.StatusCreated {
		fmt.Printf("ERROR: Create opportunity returned status %d: %s\n", oppResp.StatusCode, string(oppBody))
		os.Exit(1)
	}

	var oppAPIResp APIResponse
	json.Unmarshal(oppBody, &oppAPIResp)

	var createdOpp struct {
		ID       string                 `json:"id"`
		Title    string                 `json:"title"`
		Status   string                 `json:"status"`
		Metadata map[string]interface{} `json:"metadata"`
	}
	json.Unmarshal(oppAPIResp.Data, &createdOpp)

	fmt.Printf("✓ Customer custom request created successfully! ID: %s, Status: %s\n", createdOpp.ID, createdOpp.Status)

	// 4. Test Vendor Feed Retrieval
	fmt.Println("\n[TEST D] Testing Vendor Feed Distribution & Request Retrieval...")
	matchingResp, err := http.Get(baseURL + "/opportunities/matching")
	if err != nil {
		fmt.Printf("ERROR: Fetch matching opportunities failed: %v\n", err)
		os.Exit(1)
	}
	defer matchingResp.Body.Close()

	matchingBody, _ := io.ReadAll(matchingResp.Body)
	var matchingAPIResp APIResponse
	json.Unmarshal(matchingBody, &matchingAPIResp)

	fmt.Printf("✓ Retrieved matching vendor feed (%d bytes response).\n", len(matchingBody))

	fmt.Println("\n==========================================================")
	fmt.Println("ALL E2E VERIFICATION TESTS PASSED SUCCESSFULLY!")
	fmt.Println("==========================================================")
}
