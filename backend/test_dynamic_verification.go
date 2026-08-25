package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"github.com/google/uuid"
)

type CategoryPayload struct {
	Name              string      `json:"name"`
	Description       string      `json:"description"`
	Icon              string      `json:"icon"`
	RequiredDocuments []ReqField  `json:"required_documents"`
}

type ReqField struct {
	Key         string   `json:"key"`
	Label       string   `json:"label"`
	Description string   `json:"description"`
	Type        string   `json:"type"`
	Required    bool     `json:"required"`
	Options     []string `json:"options,omitempty"`
}

type AddServiceReq struct {
	Phone       string `json:"phone"`
	CategoryID  string `json:"category_id"`
	AssetType   string `json:"asset_type"`
	Title       string `json:"title"`
	Description string `json:"description"`
}

type SubmitDocsReq struct {
	AssetID   string                 `json:"asset_id"`
	Phone     string                 `json:"phone"`
	Documents map[string]interface{} `json:"documents"`
}

type ReviewDocsReq struct {
	Approve         bool   `json:"approve"`
	RejectionReason string `json:"rejection_reason"`
}

func main() {
	baseURL := "http://localhost:8080/api/v1"
	fmt.Println("=== STARTING END-TO-END DYNAMIC VERIFICATION SYSTEM TEST ===")

	// 1. Create a brand new custom category with rich dynamic verification fields
	newCat := CategoryPayload{
		Name:        "Solar Panel Installation & Maintenance",
		Description: "Residential & commercial solar panel cleaning, inverter testing & grid setup",
		Icon:        "Sun",
		RequiredDocuments: []ReqField{
			{Key: "solar_certification_no", Label: "Solar Grid Certification Number", Description: "Official government solar installer license ID", Type: "text", Required: true},
			{Key: "experience_years", Label: "Years in Solar Field", Description: "Total years active", Type: "number", Required: true},
			{Key: "installation_type", Label: "Primary Solar System Category", Description: "Core specialty", Type: "select", Required: true, Options: []string{"Rooftop Residential", "Commercial Industrial Grid", "Off-Grid Battery Storage"}},
			{Key: "electrical_permit_pdf", Label: "Electrical Safety Permit (PDF)", Description: "Upload scanned safety permit", Type: "pdf", Required: true},
			{Key: "working_demo_video", Label: "Solar Cleaning Demo Video (MP4)", Description: "Short video operating solar washer", Type: "video", Required: false},
		},
	}

	body, _ := json.Marshal(newCat)
	res, err := http.Post(baseURL+"/categories", "application/json", bytes.NewBuffer(body))
	if err != nil {
		fmt.Printf("FAIL: Failed creating test category: %v\n", err)
		return
	}
	defer res.Body.Close()

	resBytes, _ := io.ReadAll(res.Body)
	var catRes map[string]interface{}
	json.Unmarshal(resBytes, &catRes)

	dataMap, _ := catRes["data"].(map[string]interface{})
	catID := dataMap["id"].(string)
	fmt.Printf("[STEP 1 SUCCESS] Created Brand New Category: Solar Panel Installation (ID: %s)\n", catID)

	// 2. User requests to provide the Solar service
	addServicePayload := AddServiceReq{
		Phone:       "+919876543210",
		CategoryID:  catID,
		AssetType:   "SOLAR_PANEL_MAINTENANCE",
		Title:       "Surya Solar High-Pressure Panel Cleaning",
		Description: "24/7 Solar panel washing, inverter diagnostics & battery health check",
	}

	body, _ = json.Marshal(addServicePayload)
	res, err = http.Post(baseURL+"/users/services", "application/json", bytes.NewBuffer(body))
	if err != nil {
		fmt.Printf("FAIL: Failed adding user service: %v\n", err)
		return
	}
	defer res.Body.Close()

	resBytes, _ = io.ReadAll(res.Body)
	var serviceRes map[string]interface{}
	json.Unmarshal(resBytes, &serviceRes)

	sData, _ := serviceRes["data"].(map[string]interface{})
	assetID := sData["id"].(string)
	status := sData["status"].(string)
	fmt.Printf("[STEP 2 SUCCESS] User Submitted Service Request (Asset ID: %s | Status: %s)\n", assetID, status)

	// 3. Admin approves initial request to unlock verification details
	res, err = http.Post(fmt.Sprintf("%s/admin/services/%s/approve", baseURL, assetID), "application/json", nil)
	if err != nil {
		fmt.Printf("FAIL: Admin approval error: %v\n", err)
		return
	}
	defer res.Body.Close()

	resBytes, _ = io.ReadAll(res.Body)
	var approveRes map[string]interface{}
	json.Unmarshal(resBytes, &approveRes)
	appData, _ := approveRes["data"].(map[string]interface{})
	fmt.Printf("[STEP 3 SUCCESS] Admin Approved Initial Request -> Status: %s\n", appData["status"])

	// 4. User submits dynamic verification details & uploaded files
	submitPayload := SubmitDocsReq{
		AssetID: assetID,
		Phone:   "+919876543210",
		Documents: map[string]interface{}{
			"solar_certification_no": "SOLAR-LIC-99887766",
			"experience_years":       5,
			"installation_type":      "Rooftop Residential",
			"electrical_permit_pdf":  "/uploads/sample_solar_permit.pdf",
			"working_demo_video":     "/uploads/sample_solar_demo.mp4",
			"aadhaar_number":         "9999-8888-7777",
		},
	}

	body, _ = json.Marshal(submitPayload)
	res, err = http.Post(baseURL+"/users/services/documents", "application/json", bytes.NewBuffer(body))
	if err != nil {
		fmt.Printf("FAIL: Document submission error: %v\n", err)
		return
	}
	defer res.Body.Close()

	resBytes, _ = io.ReadAll(res.Body)
	var submitRes map[string]interface{}
	json.Unmarshal(resBytes, &submitRes)
	subData, _ := submitRes["data"].(map[string]interface{})
	fmt.Printf("[STEP 4 SUCCESS] User Submitted Verification Details & Files -> Status: %s\n", subData["status"])

	// 5. Admin reviews submitted verification & approves -> Status ACTIVE (is_available = true)
	reviewPayload := ReviewDocsReq{
		Approve:         true,
		RejectionReason: "",
	}
	body, _ = json.Marshal(reviewPayload)
	res, err = http.Post(fmt.Sprintf("%s/admin/services/%s/review-documents", baseURL, assetID), "application/json", bytes.NewBuffer(body))
	if err != nil {
		fmt.Printf("FAIL: Admin review error: %v\n", err)
		return
	}
	defer res.Body.Close()

	resBytes, _ = io.ReadAll(res.Body)
	var finalRes map[string]interface{}
	json.Unmarshal(resBytes, &finalRes)
	finalData, _ := finalRes["data"].(map[string]interface{})

	isAvailable := finalData["is_available"].(bool)
	finalStatus := finalData["status"].(string)

	fmt.Printf("[STEP 5 SUCCESS] Admin Approved Verification -> Final Status: %s | IsAvailable: %t\n", finalStatus, isAvailable)

	if finalStatus == "ACTIVE" && isAvailable {
		fmt.Println("\n🎉🎉 SUCCESS: FULL DYNAMIC SERVICE VERIFICATION LIFECYCLE PASSED PERFECTLY! 🎉🎉")
	} else {
		fmt.Println("\n❌ FAIL: Verification did not reach ACTIVE state.")
	}

	_ = uuid.New()
}
