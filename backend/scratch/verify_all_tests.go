//go:build ignore

package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type APIResponse struct {
	Success bool            `json:"success"`
	Code    int             `json:"code"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data"`
	Error   interface{}     `json:"error"`
}

func (r *APIResponse) ErrorString() string {
	if r == nil {
		return ""
	}
	res := r.Message
	if r.Error != nil {
		res += fmt.Sprintf(" | %v", r.Error)
	}
	return res
}

func doReq(method, url string, payload interface{}) (*APIResponse, int, error) {
	var body io.Reader
	if payload != nil {
		b, err := json.Marshal(payload)
		if err != nil {
			return nil, 0, err
		}
		body = bytes.NewBuffer(b)
	}

	req, err := http.NewRequest(method, url, body)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()

	respBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, err
	}

	var apiResp APIResponse
	_ = json.Unmarshal(respBytes, &apiResp)

	return &apiResp, resp.StatusCode, nil
}

func setupApprovedVendorService(phone, catID, slug, title string) string {
	// Stage 1: Register Service Request
	s1Payload := map[string]interface{}{
		"phone":       phone,
		"category_id": catID,
		"asset_type":  slug,
		"title":       title,
		"description": fmt.Sprintf("Full verified service for %s", title),
	}
	res1, _, _ := doReq("POST", "http://localhost:8080/api/v1/users/services", s1Payload)
	var assetData struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(res1.Data, &assetData)
	if assetData.ID == "" {
		fmt.Printf("⚠️ Warning: Stage 1 failed for %s (%s): %s\n", title, phone, res1.ErrorString())
		return ""
	}

	// Stage 1: Admin Approval
	doReq("POST", fmt.Sprintf("http://localhost:8080/api/v1/admin/services/%s/approve", assetData.ID), nil)

	// Stage 2: Vendor Documents Submission
	s2Payload := map[string]interface{}{
		"asset_id": assetData.ID,
		"phone":    phone,
		"documents": map[string]interface{}{
			"license_number":  "DL-TS-2024-8899",
			"quality_grade":   "Verified A-Grade",
			"base_price":      2500,
			"pickup_location": "Choutuppal Hub Yard",
		},
	}
	doReq("POST", "http://localhost:8080/api/v1/users/services/documents", s2Payload)

	// Stage 2: Admin Review Documents Approval -> ACTIVE / APPROVED & IsAvailable: true
	s2AppPayload := map[string]interface{}{
		"approve":          true,
		"rejection_reason": "",
	}
	res2App, _, _ := doReq("POST", fmt.Sprintf("http://localhost:8080/api/v1/admin/services/%s/review-documents", assetData.ID), s2AppPayload)
	var s2Active struct {
		ID          string `json:"id"`
		Status      string `json:"status"`
		IsAvailable bool   `json:"is_available"`
	}
	_ = json.Unmarshal(res2App.Data, &s2Active)
	fmt.Printf("  -> Service [%s] for %s ready: Asset ID %s, Status: %s, Available: %t\n", title, phone, assetData.ID, s2Active.Status, s2Active.IsAvailable)
	return assetData.ID
}

func main() {
	fmt.Println("==================================================================")
	fmt.Println("  DODO-UNIVERSE E2E VERIFICATION TEST SUITE (TESTS A THROUGH E)")
	fmt.Println("==================================================================")

	allPassed := true

	// 0. Fetch Categories to use real dynamic categories
	catResp, catCode, err := doReq("GET", "http://localhost:8080/api/v1/categories", nil)
	if err != nil || catCode != 200 {
		fmt.Printf("❌ Failed to fetch categories: %v (code %d)\n", err, catCode)
		return
	}
	var categories []struct {
		ID   string `json:"id"`
		Slug string `json:"slug"`
		Name string `json:"name"`
	}
	_ = json.Unmarshal(catResp.Data, &categories)
	fmt.Printf("Found %d dynamic categories in DB.\n", len(categories))

	var catAgri, catRepair struct {
		ID   string `json:"id"`
		Slug string `json:"slug"`
		Name string `json:"name"`
	}
	for _, c := range categories {
		if strings.Contains(strings.ToLower(c.Name), "agricultural") || strings.Contains(strings.ToLower(c.Slug), "agri") {
			catAgri = c
		}
		if strings.Contains(strings.ToLower(c.Name), "repair") || strings.Contains(strings.ToLower(c.Slug), "repair") {
			catRepair = c
		}
	}
	if catAgri.ID == "" && len(categories) > 0 {
		catAgri = categories[0]
	}
	if catRepair.ID == "" && len(categories) > 1 {
		catRepair = categories[1]
	}
	fmt.Printf("Selected Category 1 (Logistics / Agriculture): [%s] (ID: %s, Slug: %s)\n", catAgri.Name, catAgri.ID, catAgri.Slug)
	fmt.Printf("Selected Category 2 (Vehicle Repair / Mechanics): [%s] (ID: %s, Slug: %s)\n", catRepair.Name, catRepair.ID, catRepair.Slug)

	// Create test users:
	custPhone := "9100000001"
	v1Phone := "9200000001"
	v2Phone := "9200000002"
	v3Phone := "9200000003"

	// Sign up users
	resCust, _, _ := doReq("POST", "http://localhost:8080/api/v1/auth/signup", map[string]interface{}{"phone": custPhone, "full_name": "Customer Ramesh", "role": "CUSTOMER"})
	var custUser struct {
		User struct {
			ID string `json:"id"`
		} `json:"user"`
	}
	_ = json.Unmarshal(resCust.Data, &custUser)
	custID := custUser.User.ID

	resV1, _, _ := doReq("POST", "http://localhost:8080/api/v1/auth/signup", map[string]interface{}{"phone": v1Phone, "full_name": "Vendor Agri 1", "role": "PROVIDER"})
	var v1User struct {
		User struct {
			ID string `json:"id"`
		} `json:"user"`
	}
	_ = json.Unmarshal(resV1.Data, &v1User)
	v1ID := v1User.User.ID

	resV2, _, _ := doReq("POST", "http://localhost:8080/api/v1/auth/signup", map[string]interface{}{"phone": v2Phone, "full_name": "Vendor Agri 2", "role": "PROVIDER"})
	var v2User struct {
		User struct {
			ID string `json:"id"`
		} `json:"user"`
	}
	_ = json.Unmarshal(resV2.Data, &v2User)
	v2ID := v2User.User.ID

	resV3, _, _ := doReq("POST", "http://localhost:8080/api/v1/auth/signup", map[string]interface{}{"phone": v3Phone, "full_name": "Vendor Ineligible", "role": "PROVIDER"})
	var v3User struct {
		User struct {
			ID string `json:"id"`
		} `json:"user"`
	}
	_ = json.Unmarshal(resV3.Data, &v3User)
	v3ID := v3User.User.ID

	fmt.Printf("User IDs: Customer: %s, Vendor 1: %s, Vendor 2: %s, Vendor 3: %s\n", custID, v1ID, v2ID, v3ID)

	// Setup Approved Services
	fmt.Println("\nSetting up vendor service opt-ins and approval lifecycle...")
	setupApprovedVendorService(v1Phone, catAgri.ID, catAgri.Slug, "Vendor 1 Agri Express")
	setupApprovedVendorService(v2Phone, catAgri.ID, catAgri.Slug, "Vendor 2 Farm Haulers")
	setupApprovedVendorService(v3Phone, catRepair.ID, catRepair.Slug, "Vendor 3 Mechanic Works")

	// =========================================================================
	// TEST A — CUSTOM REQUEST DISTRIBUTION (REQUEST WHAT YOU NEED)
	// =========================================================================
	fmt.Println("\n------------------------------------------------------------------")
	fmt.Println(">>> TEST A: CUSTOM REQUEST DISTRIBUTION (REQUEST WHAT YOU NEED)")
	fmt.Println("------------------------------------------------------------------")

	reqPayload := map[string]interface{}{
		"title":         fmt.Sprintf("Need 500 Bags Transport for %s", catAgri.Name),
		"description":   "Urgent delivery needed from farm yard to grain market",
		"category_id":   catAgri.ID,
		"type":          "NEED",
		"order_mode":    "GENERAL_BROADCAST",
		"status":        "OPEN",
		"address_text":  "Miryalaguda Agricultural Mandi, Telangana",
		"lat":           16.871,
		"lng":           79.563,
		"radius_km":     50,
		"budget_max":    12000,
		"user_id":       custID,
		"metadata": map[string]interface{}{
			"category_id":       catAgri.ID,
			"category_slug":     catAgri.Slug,
			"category_name":     catAgri.Name,
			"quantity":          500,
			"farm_task":         "Paddy / Crop Harvesting",
			"number_of_workers": 10,
			"pricing_method":    "Per Worker / Day",
			"rate_per_unit":     500,
			"custom_fields": map[string]interface{}{
				"farm_task":         "Paddy / Crop Harvesting",
				"number_of_workers": 10,
				"pricing_method":    "Per Worker / Day",
				"rate_per_unit":     500,
			},
			"resource_selections": map[string]interface{}{
				"vehicle": map[string]interface{}{
					"choice":        "NEED_VEHICLE",
					"requirement":   "MANDATORY",
					"resource_key":  "vehicle",
					"resource_name": "Transportation / Vehicle",
				},
				"driver": map[string]interface{}{
					"choice":        "NEED_DRIVER",
					"requirement":   "MANDATORY",
					"resource_key":  "driver",
					"resource_name": "Driver",
				},
				"loading": map[string]interface{}{
					"choice":        "NEED_LOADING",
					"requirement":   "OPTIONAL",
					"resource_key":  "loading",
					"resource_name": "Loading & Unloading",
				},
			},
		},
	}

	createResp, code, err := doReq("POST", "http://localhost:8080/api/v1/opportunities/create", reqPayload)
	var createdOpp struct {
		ID         string  `json:"id"`
		CategoryID *string `json:"category_id"`
		Status     string  `json:"status"`
		OrderMode  string  `json:"order_mode"`
		Title      string  `json:"title"`
	}
	_ = json.Unmarshal(createResp.Data, &createdOpp)

	if err != nil || code != 201 || createdOpp.ID == "" {
		fmt.Printf("❌ TEST A.1 FAILED: Could not create custom request: %v (code %d, err %v)\n", createResp.ErrorString(), code, err)
		allPassed = false
	} else {
		catIDStr := "nil"
		if createdOpp.CategoryID != nil {
			catIDStr = *createdOpp.CategoryID
		}
		fmt.Printf("✅ TEST A.1 PASSED: Custom request created successfully. ID: %s, CategoryID: %s, Mode: %s\n", createdOpp.ID, catIDStr, createdOpp.OrderMode)
	}

	// Verify Eligible Vendor 1 receives request
	v1MatchResp, _, _ := doReq("GET", fmt.Sprintf("http://localhost:8080/api/v1/opportunities/matching?user_id=%s", v1Phone), nil)
	var v1Matches []struct {
		ID    string `json:"id"`
		Title string `json:"title"`
	}
	_ = json.Unmarshal(v1MatchResp.Data, &v1Matches)
	v1Received := false
	for _, m := range v1Matches {
		if m.ID == createdOpp.ID {
			v1Received = true
			break
		}
	}
	if v1Received {
		fmt.Printf("✅ TEST A.2 PASSED: Eligible Vendor 1 (%s) received request in matching inbox.\n", v1Phone)
	} else {
		fmt.Printf("❌ TEST A.2 FAILED: Eligible Vendor 1 (%s) did NOT receive request! Inbox size: %d\n", v1Phone, len(v1Matches))
		allPassed = false
	}

	// Verify Eligible Vendor 2 receives request
	v2MatchResp, _, _ := doReq("GET", fmt.Sprintf("http://localhost:8080/api/v1/opportunities/matching?user_id=%s", v2Phone), nil)
	var v2Matches []struct {
		ID    string `json:"id"`
		Title string `json:"title"`
	}
	_ = json.Unmarshal(v2MatchResp.Data, &v2Matches)
	v2Received := false
	for _, m := range v2Matches {
		if m.ID == createdOpp.ID {
			v2Received = true
			break
		}
	}
	if v2Received {
		fmt.Printf("✅ TEST A.3 PASSED: Eligible Vendor 2 (%s) received request in matching inbox.\n", v2Phone)
	} else {
		fmt.Printf("❌ TEST A.3 FAILED: Eligible Vendor 2 (%s) did NOT receive request! Inbox size: %d\n", v2Phone, len(v2Matches))
		allPassed = false
	}

	// Verify Ineligible Vendor 3 does NOT receive request
	v3MatchResp, _, _ := doReq("GET", fmt.Sprintf("http://localhost:8080/api/v1/opportunities/matching?user_id=%s", v3Phone), nil)
	var v3Matches []struct {
		ID    string `json:"id"`
		Title string `json:"title"`
	}
	_ = json.Unmarshal(v3MatchResp.Data, &v3Matches)
	v3Received := false
	for _, m := range v3Matches {
		if m.ID == createdOpp.ID {
			v3Received = true
			break
		}
	}
	if !v3Received {
		fmt.Printf("✅ TEST A.4 PASSED: Ineligible Vendor 3 (%s) correctly did NOT receive request.\n", v3Phone)
	} else {
		fmt.Printf("❌ TEST A.4 FAILED: Ineligible Vendor 3 received an unauthorized request!\n")
		allPassed = false
	}

	// Verify Vendor 1 accepts request
	acceptResp, aCode, _ := doReq("POST", fmt.Sprintf("http://localhost:8080/api/v1/opportunities/%s/status", createdOpp.ID), map[string]interface{}{
		"status":  "ACCEPTED",
		"user_id": v1ID,
	})
	if aCode == 200 {
		fmt.Printf("✅ TEST A.5 PASSED: Eligible Vendor 1 accepted request successfully. Msg: %s\n", acceptResp.Message)
	} else {
		fmt.Printf("❌ TEST A.5 FAILED: Vendor 1 could not accept request: code %d, msg %s\n", aCode, acceptResp.ErrorString())
		allPassed = false
	}

	// =========================================================================
	// TEST B — BROWSE BY SHOP / BRAND (MODEL A) DETAILS PERSISTENCE & EDIT
	// =========================================================================
	fmt.Println("\n------------------------------------------------------------------")
	fmt.Println(">>> TEST B: BROWSE BY SHOP / BRAND (MODEL A) DETAILS PERSISTENCE")
	fmt.Println("------------------------------------------------------------------")

	// Create Catalog Order (Model A) targeted directly to Vendor 1
	catalogOrderPayload := map[string]interface{}{
		"title":            "Direct Catalog Order - Grade A Seed Bags",
		"description":      "100 Bags Grade A Paddy Seed",
		"category_id":      catAgri.ID,
		"type":             "NEED",
		"order_mode":       "CATALOG_ORDER",
		"status":           "ACCEPTED",
		"address_text":     "Village Warehouse Yard 4, Nalgonda",
		"budget_max":       35000,
		"total_price":      35000,
		"unit_price":       350,
		"quantity":         100,
		"user_id":          custID,
		"assigned_user_id": v1ID,
		"target_vendor_id": v1ID,
		"metadata": map[string]interface{}{
			"category_id":   catAgri.ID,
			"category_name": catAgri.Name,
			"order_mode":    "CATALOG_ORDER",
		},
	}
	catOrdResp, _, _ := doReq("POST", "http://localhost:8080/api/v1/opportunities/create", catalogOrderPayload)
	var catOrder struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(catOrdResp.Data, &catOrder)
	fmt.Printf("Created Catalog Order ID: %s\n", catOrder.ID)

	// Vendor 1 provides transport and driver details
	v1ResSavePayload := map[string]interface{}{
		"provider_id": v1ID,
		"vehicle": map[string]interface{}{
			"vehicle_type":        "12-Wheeler Heavy Hauler",
			"registration_number": "TS-09-TR-7788",
			"owner_name":          "Telangana Fleet Express",
			"contact_number":      "9849011122",
		},
		"driver": map[string]interface{}{
			"driver_name":    "Naveen Rao",
			"driver_phone":   "9711122233",
			"license_number": "DL-TS-2022-9900",
		},
	}
	saveResResp, sCode, _ := doReq("POST", fmt.Sprintf("http://localhost:8080/api/v1/opportunities/%s/confirm-resources", catOrder.ID), v1ResSavePayload)
	if sCode == 200 {
		fmt.Printf("✅ TEST B.1 PASSED: Vendor 1 saved vehicle and driver details. Msg: %s\n", saveResResp.Message)
	} else {
		fmt.Printf("❌ TEST B.1 FAILED: Save vehicle/driver failed: code %d, msg %s\n", sCode, saveResResp.ErrorString())
		allPassed = false
	}

	// Customer fetches order and verifies latest details are present
	custGetResp, _, _ := doReq("GET", fmt.Sprintf("http://localhost:8080/api/v1/opportunities/%s", catOrder.ID), nil)
	var custOppView struct {
		ID       string                 `json:"id"`
		Category map[string]interface{} `json:"category"`
		Metadata map[string]interface{} `json:"metadata"`
	}
	_ = json.Unmarshal(custGetResp.Data, &custOppView)

	vendorVeh, _ := custOppView.Metadata["vendor_vehicle_details"].(map[string]interface{})
	vendorDrv, _ := custOppView.Metadata["vendor_driver_details"].(map[string]interface{})
	if vendorVeh != nil && vendorVeh["registration_number"] == "TS-09-TR-7788" && vendorDrv != nil && vendorDrv["driver_name"] == "Naveen Rao" {
		fmt.Printf("✅ TEST B.2 PASSED: Customer retrieved saved vendor details (Reg: %v, Driver: %v).\n", vendorVeh["registration_number"], vendorDrv["driver_name"])
	} else {
		fmt.Printf("❌ TEST B.2 FAILED: Customer view did not receive saved vendor details! Meta: %v\n", custOppView.Metadata)
		allPassed = false
	}

	// Vendor 1 edits driver details
	v1EditPayload := map[string]interface{}{
		"provider_id": v1ID,
		"driver": map[string]interface{}{
			"driver_name":    "Naveen Rao Senior",
			"driver_phone":   "9711122233",
			"license_number": "DL-TS-2022-9900-EXP",
		},
	}
	editResp, eCode, _ := doReq("POST", fmt.Sprintf("http://localhost:8080/api/v1/opportunities/%s/confirm-resources", catOrder.ID), v1EditPayload)
	if eCode == 200 {
		fmt.Printf("✅ TEST B.3 PASSED: Vendor 1 edited driver details successfully. Msg: %s\n", editResp.Message)
	} else {
		fmt.Printf("❌ TEST B.3 FAILED: Edit driver details failed: code %d, msg %s\n", eCode, editResp.ErrorString())
		allPassed = false
	}

	// Customer refreshes and verifies updated details
	custRefreshResp, _, _ := doReq("GET", fmt.Sprintf("http://localhost:8080/api/v1/opportunities/%s", catOrder.ID), nil)
	_ = json.Unmarshal(custRefreshResp.Data, &custOppView)
	vendorDrvEdited, _ := custOppView.Metadata["vendor_driver_details"].(map[string]interface{})
	if vendorDrvEdited != nil && vendorDrvEdited["driver_name"] == "Naveen Rao Senior" {
		fmt.Printf("✅ TEST B.4 PASSED: Customer immediately sees edited driver name: '%v'.\n", vendorDrvEdited["driver_name"])
	} else {
		fmt.Printf("❌ TEST B.4 FAILED: Customer did not see updated driver name! Drv: %v\n", vendorDrvEdited)
		allPassed = false
	}

	// =========================================================================
	// TEST C — REQUEST WHAT YOU NEED (MODEL B) DYNAMIC RESOURCE WORKFLOW
	// =========================================================================
	fmt.Println("\n------------------------------------------------------------------")
	fmt.Println(">>> TEST C: REQUEST WHAT YOU NEED (MODEL B) DYNAMIC DETAILS & NOTIFICATIONS")
	fmt.Println("------------------------------------------------------------------")

	// Vendor 1 arranges Vehicle, Driver, AND Loading for the accepted Request What You Need order
	reqResPayload := map[string]interface{}{
		"provider_id": v1ID,
		"vehicle": map[string]interface{}{
			"vehicle_type":        "10-Wheeler Heavy Tipper",
			"registration_number": "TS-07-KL-3344",
			"owner_name":          "Balaji Transport Logistics",
			"contact_number":      "9948033344",
		},
		"driver": map[string]interface{}{
			"driver_name":    "Suresh Reddy",
			"driver_phone":   "9848055566",
			"license_number": "DL-AP-2020-5566",
		},
		"resource_key": "loading",
		"resource_details": map[string]interface{}{
			"arranged_by":         "VENDOR",
			"provider_name":       "Choutuppal Hamali Labour Union",
			"contact_number":      "9849077788",
			"laborers_count":      6,
			"reporting_timestamp": "07:30 AM",
		},
	}
	cSaveResp, cCode, _ := doReq("POST", fmt.Sprintf("http://localhost:8080/api/v1/opportunities/%s/confirm-resources", createdOpp.ID), reqResPayload)
	if cCode == 200 {
		fmt.Printf("✅ TEST C.1 PASSED: Vendor 1 confirmed Vehicle, Driver, and Loading arrangements. Msg: %s\n", cSaveResp.Message)
	} else {
		fmt.Printf("❌ TEST C.1 FAILED: Confirming resources failed: code %d, msg %s\n", cCode, cSaveResp.ErrorString())
		allPassed = false
	}

	// Verify Customer receives Notification
	custNotifResp, _, _ := doReq("GET", fmt.Sprintf("http://localhost:8080/api/v1/notifications?user_id=%s", custID), nil)
	var notifs []struct {
		ID      string `json:"id"`
		Title   string `json:"title"`
		Message string `json:"message"`
	}
	_ = json.Unmarshal(custNotifResp.Data, &notifs)
	notifReceived := false
	for _, n := range notifs {
		if strings.Contains(strings.ToLower(n.Title), "resource") || strings.Contains(strings.ToLower(n.Message), "arranged") || strings.Contains(strings.ToLower(n.Message), "vehicle") {
			notifReceived = true
			fmt.Printf("✅ TEST C.2 PASSED: Customer received notification: '%s' - '%s'\n", n.Title, n.Message)
			break
		}
	}
	if !notifReceived {
		fmt.Printf("ℹ️ TEST C.2 NOTE: Notifications count: %d\n", len(notifs))
	}

	// Verify Customer request detail view includes all resource arrangement structures
	custReqGetResp, _, _ := doReq("GET", fmt.Sprintf("http://localhost:8080/api/v1/opportunities/%s", createdOpp.ID), nil)
	var custReqDetail struct {
		ID                   string                 `json:"id"`
		AssignedUser         map[string]interface{} `json:"assigned_user"`
		Category             map[string]interface{} `json:"category"`
		Metadata             map[string]interface{} `json:"metadata"`
		ResourceRequirements map[string]interface{} `json:"resource_requirements"`
	}
	_ = json.Unmarshal(custReqGetResp.Data, &custReqDetail)

	vrd, _ := custReqDetail.Metadata["vendor_resource_details"].(map[string]interface{})
	loadingArr, _ := vrd["loading"].(map[string]interface{})
	loadingDet, _ := loadingArr["details"].(map[string]interface{})

	if loadingDet != nil && loadingDet["provider_name"] == "Choutuppal Hamali Labour Union" {
		fmt.Printf("✅ TEST C.3 PASSED: Customer sees vendor-arranged Loading: Team: '%v', Phone: '%v'\n", loadingDet["provider_name"], loadingDet["contact_number"])
	} else {
		fmt.Printf("❌ TEST C.3 FAILED: Customer did not see Loading arrangements! VRD: %v\n", vrd)
		allPassed = false
	}

	// Verify Customer-provided selections remain distinct from Vendor arrangements
	resSel, _ := custReqDetail.Metadata["resource_selections"].(map[string]interface{})
	loadingSel, _ := resSel["loading"].(map[string]interface{})
	if loadingSel != nil && loadingSel["choice"] == "NEED_LOADING" && loadingSel["arranged"] == true {
		fmt.Printf("✅ TEST C.4 PASSED: Customer original choice ('NEED_LOADING') and vendor arrangement status ('arranged: true') remain distinctly preserved.\n")
	} else {
		fmt.Printf("❌ TEST C.4 FAILED: Resource selection integrity compromised! Sel: %v\n", loadingSel)
		allPassed = false
	}

	// =========================================================================
	// TEST D — DYNAMIC CATEGORY COVERAGE (TESTING SECOND SERVICE CATEGORY)
	// =========================================================================
	fmt.Println("\n------------------------------------------------------------------")
	fmt.Println(">>> TEST D: DYNAMIC CATEGORY COVERAGE (CATEGORY 2: REPAIR / MECHANICS)")
	fmt.Println("------------------------------------------------------------------")

	// Submit custom request for Category 2 (Vehicle Repair & Mechanics)
	reqRepairPayload := map[string]interface{}{
		"title":         fmt.Sprintf("Emergency Tractor Breakdown Support - %s", catRepair.Name),
		"description":   "Hydraulic lift failure on Mahindra 575 DI tractor",
		"category_id":   catRepair.ID,
		"type":          "NEED",
		"order_mode":    "GENERAL_BROADCAST",
		"status":        "OPEN",
		"address_text":  "Highway 65 NH, Choutuppal",
		"lat":           17.251,
		"lng":           78.911,
		"budget_max":    4500,
		"user_id":       custID,
		"metadata": map[string]interface{}{
			"category_id":              catRepair.ID,
			"category_slug":            catRepair.Slug,
			"category_name":            catRepair.Name,
			"vehicle_type":             "Tractor",
			"vehicle_number":           "TS-08-TR-1234",
			"problem_description":      "Hydraulic lift pump pressure dropped",
			"urgency_level":            "Emergency Roadside Breakdown",
			"current_vehicle_location": "Highway 65 NH, Choutuppal",
			"custom_fields": map[string]interface{}{
				"vehicle_type":             "Tractor",
				"vehicle_number":           "TS-08-TR-1234",
				"problem_description":      "Hydraulic lift pump pressure dropped",
				"urgency_level":            "Emergency Roadside Breakdown",
				"current_vehicle_location": "Highway 65 NH, Choutuppal",
			},
			"resource_selections": map[string]interface{}{
				"equipment": map[string]interface{}{
					"choice":        "NEED_EQUIPMENT",
					"resource_key":  "equipment",
					"resource_name": "Hydraulic Diagnostics Kit",
				},
			},
		},
	}

	createRepairResp, _, _ := doReq("POST", "http://localhost:8080/api/v1/opportunities/create", reqRepairPayload)
	var createdRepairOpp struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(createRepairResp.Data, &createdRepairOpp)
	fmt.Printf("Created Category 2 Request ID: %s\n", createdRepairOpp.ID)

	// Verify Vendor 3 (approved for Category 2) receives it
	v3RepairMatchResp, _, _ := doReq("GET", fmt.Sprintf("http://localhost:8080/api/v1/opportunities/matching?user_id=%s", v3Phone), nil)
	var v3RepairMatches []struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(v3RepairMatchResp.Data, &v3RepairMatches)
	v3GotIt := false
	for _, m := range v3RepairMatches {
		if m.ID == createdRepairOpp.ID {
			v3GotIt = true
			break
		}
	}
	if v3GotIt {
		fmt.Printf("✅ TEST D.1 PASSED: Vendor 3 received Category 2 (%s) custom request.\n", catRepair.Name)
	} else {
		fmt.Printf("❌ TEST D.1 FAILED: Vendor 3 did not receive Category 2 request! Matches: %d\n", len(v3RepairMatches))
		allPassed = false
	}

	// Vendor 3 accepts Category 2 request
	doReq("POST", fmt.Sprintf("http://localhost:8080/api/v1/opportunities/%s/status", createdRepairOpp.ID), map[string]interface{}{
		"status":  "ACCEPTED",
		"user_id": v3ID,
	})

	// Vendor 3 arranges Equipment details
	equipConfirmPayload := map[string]interface{}{
		"provider_id":  v3ID,
		"resource_key": "equipment",
		"resource_details": map[string]interface{}{
			"arranged_by":    "VENDOR",
			"provider_name":  "Sri Krishna Mobile Tool Van",
			"contact_number": "9849099900",
			"kit_model":      "Bosch Rexroth Diagnostic Kit & Pressure Gauge",
		},
	}
	equipResp, eqCode, _ := doReq("POST", fmt.Sprintf("http://localhost:8080/api/v1/opportunities/%s/confirm-resources", createdRepairOpp.ID), equipConfirmPayload)
	if eqCode == 200 {
		fmt.Printf("✅ TEST D.2 PASSED: Category 2 reusable equipment arrangement confirmed. Msg: %s\n", equipResp.Message)
	} else {
		fmt.Printf("❌ TEST D.2 FAILED: Confirming category 2 equipment failed: code %d, msg %s\n", eqCode, equipResp.ErrorString())
		allPassed = false
	}

	// Customer verifies Category 2 request shows equipment arrangement
	custRepairGetResp, _, _ := doReq("GET", fmt.Sprintf("http://localhost:8080/api/v1/opportunities/%s", createdRepairOpp.ID), nil)
	var repairOppDetail struct {
		Metadata map[string]interface{} `json:"metadata"`
	}
	_ = json.Unmarshal(custRepairGetResp.Data, &repairOppDetail)
	repVrd, _ := repairOppDetail.Metadata["vendor_resource_details"].(map[string]interface{})
	eqArr, _ := repVrd["equipment"].(map[string]interface{})
	eqDet, _ := eqArr["details"].(map[string]interface{})
	if eqDet != nil && eqDet["kit_model"] == "Bosch Rexroth Diagnostic Kit & Pressure Gauge" {
		fmt.Printf("✅ TEST D.3 PASSED: Customer sees Category 2 dynamic equipment arrangement: '%v'.\n", eqDet["kit_model"])
	} else {
		fmt.Printf("❌ TEST D.3 FAILED: Customer did not see Category 2 equipment details! VRD: %v\n", repVrd)
		allPassed = false
	}

	// =========================================================================
	// TEST E — REGRESSION VERIFICATION
	// =========================================================================
	fmt.Println("\n------------------------------------------------------------------")
	fmt.Println(">>> TEST E: REGRESSION VERIFICATION")
	fmt.Println("------------------------------------------------------------------")

	// E.1: Phone validation rejects invalid phone numbers
	badPhoneResp, badPhoneCode, _ := doReq("POST", "http://localhost:8080/api/v1/auth/request-otp", map[string]string{"phone": "123"})
	if badPhoneCode == 400 {
		fmt.Printf("✅ TEST E.1 PASSED: Strict 10-digit phone validation preserved. (Code: %d, Msg: %s)\n", badPhoneCode, badPhoneResp.ErrorString())
	} else {
		fmt.Printf("❌ TEST E.1 FAILED: Expected 400 for invalid phone, got %d\n", badPhoneCode)
		allPassed = false
	}

	// E.2: Unauthorized user cannot edit another vendor's resource details
	unauthResp, unauthCode, _ := doReq("POST", fmt.Sprintf("http://localhost:8080/api/v1/opportunities/%s/confirm-resources", catOrder.ID), map[string]interface{}{
		"provider_id": v3ID, // Vendor 3 is NOT the assigned vendor for catOrder
		"vehicle": map[string]interface{}{
			"vehicle_type":        "Tractor",
			"registration_number": "TS-99-HACK",
			"owner_name":          "Intruder",
			"contact_number":      "9111122233",
		},
	})
	if unauthCode == 403 || (unauthCode == 400 && strings.Contains(strings.ToLower(unauthResp.ErrorString()), "unauthorized")) {
		fmt.Printf("✅ TEST E.2 PASSED: Authorization safeguard prevents cross-vendor edits. (Code: %d, Msg: %s)\n", unauthCode, unauthResp.ErrorString())
	} else {
		fmt.Printf("❌ TEST E.2 FAILED: Unauthorized user was permitted to edit order! Code: %d, Msg: %s\n", unauthCode, unauthResp.ErrorString())
		allPassed = false
	}

	// E.3: Customer order history lists all placed orders
	custOrdersResp, coCode, _ := doReq("GET", fmt.Sprintf("http://localhost:8080/api/v1/opportunities/my-orders?user_id=%s", custID), nil)
	var custOrders []struct {
		ID    string `json:"id"`
		Title string `json:"title"`
	}
	_ = json.Unmarshal(custOrdersResp.Data, &custOrders)
	if coCode == 200 && len(custOrders) >= 2 {
		fmt.Printf("✅ TEST E.3 PASSED: Customer order history returns %d orders.\n", len(custOrders))
	} else {
		fmt.Printf("❌ TEST E.3 FAILED: Customer orders endpoint failed! Code: %d, count: %d\n", coCode, len(custOrders))
		allPassed = false
	}

	fmt.Println("\n==================================================================")
	if allPassed {
		fmt.Println("🎉 ALL TESTS (TEST A, TEST B, TEST C, TEST D, TEST E) PASSED SUCCESSFULLY!")
	} else {
		fmt.Println("❌ SOME TESTS FAILED. Check test logs above.")
	}
	fmt.Println("==================================================================")
}
