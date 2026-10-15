//go:build ignore

package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

const baseURL = "http://localhost:8080/api/v1"

type UserAsset struct {
	ID           string                 `json:"id"`
	UserID       string                 `json:"user_id"`
	CategoryID   *string                `json:"category_id"`
	AssetType    string                 `json:"asset_type"`
	Title        string                 `json:"title"`
	Status       string                 `json:"status"`
	IsAvailable  bool                   `json:"is_available"`
	Category     *struct {
		ID   string `json:"id"`
		Slug string `json:"slug"`
		Name string `json:"name"`
	} `json:"category"`
}

type Category struct {
	ID   string `json:"id"`
	Slug string `json:"slug"`
	Name string `json:"name"`
}

func main() {
	fmt.Println("==========================================================")
	fmt.Println("VERIFYING VENDOR ELIGIBLE MAIN SERVICES FOR SUB-SERVICE DROPDOWN")
	fmt.Println("==========================================================")

	client := &http.Client{Timeout: 10 * time.Second}

	// 1. Fetch categories
	req, _ := http.NewRequest("GET", baseURL+"/categories", nil)
	resp, err := client.Do(req)
	if err != nil {
		fmt.Printf("ERROR: Failed to connect to API server: %v\n", err)
		os.Exit(1)
	}
	defer resp.Body.Close()

	var catRes struct {
		Data []Category `json:"data"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&catRes)
	categories := catRes.Data

	// 2. Fetch services for vendor Neha (+919640754927)
	fmt.Println("\n[STEP 1] Fetching Vendor Assets for Neha (+919640754927)...")
	req, _ = http.NewRequest("GET", baseURL+"/users/services?phone=9640754927", nil)
	resp, err = client.Do(req)
	if err != nil {
		fmt.Printf("ERROR: Failed to query vendor assets: %v\n", err)
		os.Exit(1)
	}
	defer resp.Body.Close()

	bodyBytes, _ := io.ReadAll(resp.Body)
	var assetRes struct {
		Data []UserAsset `json:"data"`
	}
	_ = json.Unmarshal(bodyBytes, &assetRes)

	fmt.Printf("Total Vendor Services Found on Services I Provide: %d\n", len(assetRes.Data))

	fmt.Println("\n--- All Vendor Assets Breakdown ---")
	for i, a := range assetRes.Data {
		isReqApproved := a.Status != "PENDING_APPROVAL" && a.Status != "REJECTED"
		isDetailsApproved := a.Status == "ACTIVE" || a.Status == "APPROVED"
		isEligible := isReqApproved && isDetailsApproved

		fmt.Printf("%d. Title: '%s' | Status: '%s' | Req Approved: %v | Details Approved: %v | ELIGIBLE: %v\n",
			i+1, a.Title, a.Status, isReqApproved, isDetailsApproved, isEligible)
	}

	// 3. Compute eligible main services using our exact frontend logic
	var eligibleMainServices []struct {
		AssetID      string
		CategoryID   string
		CategorySlug string
		Name         string
	}

	for _, asset := range assetRes.Data {
		if asset.Status == "ACTIVE" || asset.Status == "APPROVED" {
			var catName, catID, catSlug string

			for _, c := range categories {
				if (asset.CategoryID != nil && *asset.CategoryID == c.ID) ||
					(asset.Category != nil && asset.Category.Slug == c.Slug) ||
					strings.EqualFold(c.Slug, asset.AssetType) ||
					strings.EqualFold(c.Name, asset.AssetType) ||
					strings.EqualFold(strings.ReplaceAll(c.Slug, "-", "_"), asset.AssetType) {
					catID = c.ID
					catSlug = c.Slug
					catName = c.Name
					break
				}
			}

			if catName == "" {
				catName = asset.Title
				if catName == "" {
					catName = asset.AssetType
				}
				if asset.CategoryID != nil {
					catID = *asset.CategoryID
				} else {
					catID = asset.ID
				}
			}

			eligibleMainServices = append(eligibleMainServices, struct {
				AssetID      string
				CategoryID   string
				CategorySlug string
				Name         string
			}{
				AssetID:      asset.ID,
				CategoryID:   catID,
				CategorySlug: catSlug,
				Name:         catName,
			})
		}
	}

	fmt.Println("\n==========================================================")
	fmt.Printf("ELIGIBLE MAIN SERVICES FOR CREATE SUB-SERVICE DROPDOWN (%d):\n", len(eligibleMainServices))
	fmt.Println("==========================================================")
	for i, s := range eligibleMainServices {
		fmt.Printf("%d. Name: '%s' | Asset ID: %s | Category ID: %s\n", i+1, s.Name, s.AssetID, s.CategoryID)
	}

	// Verification checks
	expectedEligibleNames := []string{"cement services", "water supply", "Tractor & Rotavator Rental"}
	foundNames := make(map[string]bool)
	for _, s := range eligibleMainServices {
		foundNames[s.Name] = true
	}

	for _, name := range expectedEligibleNames {
		if name == "cement services" && (foundNames["Cement & Construction Supplies"] || foundNames["Cement & Construction Supplies Service"]) {
			continue
		}
		if !foundNames[name] {
			fmt.Printf("\nERROR: Expected eligible service '%s' was MISSING from dropdown list!\n", name)
			os.Exit(1)
		}
	}

	if foundNames["Logistics & Transport"] || foundNames["Education & Skill Tuition"] {
		fmt.Println("\nERROR: Pending-detail services were illegally included in dropdown!")
		os.Exit(1)
	}

	fmt.Println("\n✓ VERIFICATION SUCCESSFUL: All eligible Main Services appear in dropdown, and pending-detail services are excluded!")
}
