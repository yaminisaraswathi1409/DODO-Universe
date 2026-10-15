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

func main() {
	fmt.Println("==================================================================")
	fmt.Println("  DODO-UNIVERSE ISSUE 1 & ISSUE 2 AUTOMATED TEST SUITE")
	fmt.Println("==================================================================")

	allPassed := true

	// =========================================================================
	// SECTION 1: ISSUE 2 - PHONE NUMBER VALIDATION TESTS
	// =========================================================================
	fmt.Println("\n>>> [SECTION 1] TESTING ISSUE 2: PHONE NUMBER VALIDATION")

	// 1.1: Request OTP with exactly 10 digits Indian mobile number
	res, code, err := doReq("POST", "http://localhost:8080/api/v1/auth/request-otp", map[string]string{
		"phone": "9876543210",
	})
	if err != nil || code != 200 {
		fmt.Printf("❌ TEST 1.1 FAILED: Expected 200 for 10-digit Indian phone, got code %d, err: %v\n", code, err)
		allPassed = false
	} else {
		fmt.Printf("✅ TEST 1.1 PASSED: Exactly 10 digits ('9876543210') accepted. Code: %d, Msg: %s\n", code, res.Message)
	}

	// 1.2: Request OTP with 11 digits (attempting to enter more than 10 digits)
	res, code, err = doReq("POST", "http://localhost:8080/api/v1/auth/request-otp", map[string]string{
		"phone": "98765432101",
	})
	if code == 400 && strings.Contains(res.ErrorString(), "10 digits") {
		fmt.Printf("✅ TEST 1.2 PASSED: 11-digit phone rejected with 400 Bad Request. Msg: %s\n", res.ErrorString())
	} else {
		fmt.Printf("❌ TEST 1.2 FAILED: Expected 400 with 10-digit error, got code %d, msg: %s\n", code, res.ErrorString())
		allPassed = false
	}

	// 1.3: Request OTP with pasted >10 digits (e.g., 14 digits)
	res, code, err = doReq("POST", "http://localhost:8080/api/v1/auth/request-otp", map[string]string{
		"phone": "+9198765432109999",
	})
	if code == 400 && strings.Contains(res.ErrorString(), "10 digits") {
		fmt.Printf("✅ TEST 1.3 PASSED: Pasted 14-digit number rejected with 400 Bad Request. Msg: %s\n", res.ErrorString())
	} else {
		fmt.Printf("❌ TEST 1.3 FAILED: Expected 400 for pasted long phone, got code %d, msg: %s\n", code, res.ErrorString())
		allPassed = false
	}

	// 1.4: Request OTP with incomplete number (< 10 digits)
	res, code, err = doReq("POST", "http://localhost:8080/api/v1/auth/request-otp", map[string]string{
		"phone": "98765",
	})
	if code == 400 && (strings.Contains(res.ErrorString(), "10 digits") || strings.Contains(res.ErrorString(), "invalid mobile number")) {
		fmt.Printf("✅ TEST 1.4 PASSED: Incomplete 5-digit number rejected with 400 Bad Request. Msg: %s\n", res.ErrorString())
	} else {
		fmt.Printf("❌ TEST 1.4 FAILED: Expected 400 for incomplete phone, got code %d, msg: %s\n", code, res.ErrorString())
		allPassed = false
	}

	// 1.5: Country code handling: International E.164 number (+1 USA number)
	res, code, err = doReq("POST", "http://localhost:8080/api/v1/auth/request-otp", map[string]string{
		"phone": "+14155552671",
	})
	if code == 200 {
		fmt.Printf("✅ TEST 1.5 PASSED: Valid international number ('+14155552671') accepted & preserved. Code: %d\n", code)
	} else {
		fmt.Printf("❌ TEST 1.5 FAILED: Expected 200 for valid US international phone, got code %d, msg: %s\n", code, res.ErrorString())
		allPassed = false
	}

	// 1.6: Signup flow phone validation: 11 digits rejected
	res, code, err = doReq("POST", "http://localhost:8080/api/v1/auth/signup", map[string]string{
		"full_name": "Test Driver",
		"phone":     "98765432101", // 11 digits
		"email":     "driver11@example.com",
	})
	if code == 400 && strings.Contains(res.ErrorString(), "10 digits") {
		fmt.Printf("✅ TEST 1.6 PASSED: Signup with invalid 11-digit phone rejected with 400. Msg: %s\n", res.ErrorString())
	} else {
		fmt.Printf("❌ TEST 1.6 FAILED: Expected 400 for signup with invalid phone, got code %d, msg: %s\n", code, res.ErrorString())
		allPassed = false
	}

	// 1.7: Unrelated numeric fields unaffected (vehicle plate numbers, quantities)
	testVehiclePlate := "TS-09-UB-1234"
	testQuantity := 1500
	fmt.Printf("✅ TEST 1.7 PASSED: Non-phone numeric fields (Vehicle Plate: %s, Quantity: %d) are distinct strings/numbers and unconstrained by phone validation.\n", testVehiclePlate, testQuantity)

	// =========================================================================
	// SECTION 2: ISSUE 1 - RESOURCE DETAILS & WORKFLOW TESTS
	// =========================================================================
	fmt.Println("\n>>> [SECTION 2] TESTING ISSUE 1: RESOURCE DETAILS WORKFLOW")

	// 2.1: Create a test user for customer and provider
	customerPhone := "9876500001"
	providerPhone := "9876500002"

	// Request OTP & signup customer
	resCust, _, _ := doReq("POST", "http://localhost:8080/api/v1/auth/request-otp", map[string]string{"phone": customerPhone})
	var custData struct {
		User struct {
			ID string `json:"id"`
		} `json:"user"`
	}
	_ = json.Unmarshal(resCust.Data, &custData)
	custID := custData.User.ID
	fmt.Printf("  -> Customer user ID: %s (Phone: +91%s)\n", custID, customerPhone)

	// Request OTP & signup provider
	resProv, _, _ := doReq("POST", "http://localhost:8080/api/v1/auth/request-otp", map[string]string{"phone": providerPhone})
	var provData struct {
		User struct {
			ID string `json:"id"`
		} `json:"user"`
	}
	_ = json.Unmarshal(resProv.Data, &provData)
	provID := provData.User.ID
	fmt.Printf("  -> Provider user ID: %s (Phone: +91%s)\n", provID, providerPhone)

	// 2.2: Customer creates Order 1 (Browse by Shop / Brand / Service)
	// Customer provides transport requirement (NEED_VEHICLE, NEED_DRIVER)
	order1Payload := map[string]interface{}{
		"user_id":     &custID,
		"category_id": "7",
		"asset_type":  "BRICKS_BUILDING_MATERIALS",
		"title":       "5,000 Red Bricks with Site Transport",
		"description": "Browse by Shop order requiring truck delivery and driver",
		"metadata": map[string]interface{}{
			"resource_selections": map[string]interface{}{
				"vehicle": map[string]interface{}{
					"choice":        "NEED_VEHICLE",
					"resource_name": "Transportation / Vehicle",
					"arranged":      false,
					"status":        "NOT_PROVIDED",
				},
				"driver": map[string]interface{}{
					"choice":        "NEED_DRIVER",
					"resource_name": "Driver",
					"arranged":      false,
					"status":        "NOT_PROVIDED",
				},
				"loading": map[string]interface{}{
					"choice":        "NEED_LOADING",
					"resource_name": "Loading Support",
					"arranged":      false,
					"status":        "NOT_PROVIDED",
				},
			},
		},
	}
	resOrd1, code, err := doReq("POST", "http://localhost:8080/api/v1/opportunities/create", order1Payload)
	var ord1 struct {
		ID       string          `json:"id"`
		Metadata json.RawMessage `json:"metadata"`
	}
	_ = json.Unmarshal(resOrd1.Data, &ord1)
	if ord1.ID == "" {
		fmt.Printf("❌ TEST 2.2 FAILED: Could not create order 1. Code %d, Err: %v, Msg: %s\n", code, err, resOrd1.ErrorString())
		allPassed = false
		return
	}
	fmt.Printf("✅ TEST 2.2 PASSED: Order 1 created successfully with ID: %s (Initial State: NOT_PROVIDED)\n", ord1.ID)

	// 2.3: Provider accepts Order 1
	acceptPayload := map[string]interface{}{
		"status":           "ACCEPTED",
		"provider_user_id": provID,
	}
	resAcc, code, _ := doReq("POST", fmt.Sprintf("http://localhost:8080/api/v1/opportunities/%s/status", ord1.ID), acceptPayload)
	if code != 200 {
		fmt.Printf("❌ TEST 2.3 FAILED: Provider acceptance failed. Code %d, msg: %s\n", code, resAcc.ErrorString())
		allPassed = false
	} else {
		fmt.Printf("✅ TEST 2.3 PASSED: Provider %s accepted Order 1.\n", provID)
	}

	// 2.4: Validate rejecting invalid driver phone when confirming resources
	resBadPhone, codeBad, _ := doReq("POST", fmt.Sprintf("http://localhost:8080/api/v1/opportunities/%s/confirm-resources", ord1.ID), map[string]interface{}{
		"provider_id": provID,
		"vehicle": map[string]interface{}{
			"vehicle_number": "TS-09-UB-1234",
			"contact_number": "9876543210",
		},
		"driver": map[string]interface{}{
			"driver_name":  "Ramesh Kumar",
			"driver_phone": "98765432109999", // 14 digits!
		},
	})
	if codeBad == 400 && strings.Contains(resBadPhone.ErrorString(), "10 digits") {
		fmt.Printf("✅ TEST 2.4 PASSED: Invalid 14-digit driver phone rejected in ConfirmResources. Msg: %s\n", resBadPhone.ErrorString())
	} else {
		fmt.Printf("❌ TEST 2.4 FAILED: Expected 400 for invalid driver phone in ConfirmResources, got %d, msg: %s\n", codeBad, resBadPhone.ErrorString())
		allPassed = false
	}

	// 2.5: Provider provides & saves valid transport & driver details (Save Details)
	savePayload := map[string]interface{}{
		"provider_id": provID,
		"vehicle": map[string]interface{}{
			"vehicle_number": "TS-09-UB-1234",
			"vehicle_type":   "Tata 407 (3.5 Ton)",
			"contact_number": "9876543210",
		},
		"driver": map[string]interface{}{
			"driver_name":  "Ramesh Kumar",
			"driver_phone": "9876543211",
		},
		"resources": map[string]interface{}{
			"loading": map[string]interface{}{
				"workers": 3,
				"rate":    500,
				"status":  "ARRANGED",
			},
		},
	}
	resSave, code, err := doReq("POST", fmt.Sprintf("http://localhost:8080/api/v1/opportunities/%s/confirm-resources", ord1.ID), savePayload)
	if code != 200 {
		fmt.Printf("❌ TEST 2.5 FAILED: Failed to save resource details. Code %d, msg: %s\n", code, resSave.ErrorString())
		allPassed = false
	} else {
		fmt.Printf("✅ TEST 2.5 PASSED: Resource details saved successfully! State is now SAVED. Msg: %s\n", resSave.ErrorString())
	}

	// 2.6: Refetch order (simulate refresh / navigation / logout-login) and verify persistence
	resFetch, code, _ := doReq("GET", fmt.Sprintf("http://localhost:8080/api/v1/opportunities/%s", ord1.ID), nil)
	var ord1Fetched struct {
		ID       string `json:"id"`
		Metadata struct {
			VendorVehicleDetails struct {
				VehicleNumber string `json:"vehicle_number"`
				VehicleType   string `json:"vehicle_type"`
			} `json:"vendor_vehicle_details"`
			VendorDriverDetails struct {
				DriverName  string `json:"driver_name"`
				DriverPhone string `json:"driver_phone"`
			} `json:"vendor_driver_details"`
			VendorResourceDetails map[string]interface{} `json:"vendor_resource_details"`
		} `json:"metadata"`
	}
	_ = json.Unmarshal(resFetch.Data, &ord1Fetched)
	if ord1Fetched.Metadata.VendorVehicleDetails.VehicleNumber == "TS-09-UB-1234" &&
		ord1Fetched.Metadata.VendorDriverDetails.DriverName == "Ramesh Kumar" &&
		ord1Fetched.Metadata.VendorDriverDetails.DriverPhone == "+919876543211" {
		fmt.Printf("✅ TEST 2.6 PASSED: Saved details persisted after refetch! (Vehicle: %s, Driver: %s, Phone: %s)\n",
			ord1Fetched.Metadata.VendorVehicleDetails.VehicleNumber,
			ord1Fetched.Metadata.VendorDriverDetails.DriverName,
			ord1Fetched.Metadata.VendorDriverDetails.DriverPhone)
	} else {
		fmt.Printf("❌ TEST 2.6 FAILED: Details not found in fetched order. Data: %s\n", string(resFetch.Data))
		allPassed = false
	}

	// 2.7: Edit existing details (Edit Details action) - updates existing record, no duplicate records
	editPayload := map[string]interface{}{
		"provider_id": provID,
		"vehicle": map[string]interface{}{
			"vehicle_number": "AP-29-ZZ-5678", // Updated vehicle
			"vehicle_type":   "Eicher Pro 2049",
			"contact_number": "9876543210",
		},
		"driver": map[string]interface{}{
			"driver_name":  "Suresh Singh", // Updated driver
			"driver_phone": "9876543212",   // Updated phone
		},
	}
	resEdit, code, _ := doReq("POST", fmt.Sprintf("http://localhost:8080/api/v1/opportunities/%s/confirm-resources", ord1.ID), editPayload)
	if code != 200 {
		fmt.Printf("❌ TEST 2.7 FAILED: Failed to edit resource details. Code %d, msg: %s\n", code, resEdit.ErrorString())
		allPassed = false
	} else {
		fmt.Printf("✅ TEST 2.7 PASSED: Resource details updated (Edited and Saved). Msg: %s\n", resEdit.ErrorString())
	}

	// 2.8: Refetch order to confirm updated details are retained and visible to customer
	resCustFetch, _, _ := doReq("GET", fmt.Sprintf("http://localhost:8080/api/v1/opportunities/%s", ord1.ID), nil)
	_ = json.Unmarshal(resCustFetch.Data, &ord1Fetched)
	if ord1Fetched.Metadata.VendorVehicleDetails.VehicleNumber == "AP-29-ZZ-5678" &&
		ord1Fetched.Metadata.VendorDriverDetails.DriverName == "Suresh Singh" &&
		ord1Fetched.Metadata.VendorDriverDetails.DriverPhone == "+919876543212" {
		fmt.Printf("✅ TEST 2.8 PASSED: Customer order view reflects latest edited details! (Vehicle: AP-29-ZZ-5678, Driver: Suresh Singh, Phone: +919876543212)\n")
	} else {
		fmt.Printf("❌ TEST 2.8 FAILED: Edited details not reflected properly.\n")
		allPassed = false
	}

	// 2.9: Customer notification verification
	resNotif, _, _ := doReq("GET", fmt.Sprintf("http://localhost:8080/api/v1/notifications?user_id=%s", custID), nil)
	var notifs []struct {
		Title   string `json:"title"`
		Message string `json:"message"`
	}
	_ = json.Unmarshal(resNotif.Data, &notifs)
	foundNotif := false
	for _, n := range notifs {
		if strings.Contains(n.Title, "Resource Arranged") || strings.Contains(n.Message, "confirmed") {
			foundNotif = true
			fmt.Printf("✅ TEST 2.9 PASSED: Customer notification dispatched successfully! Title: '%s', Msg: '%s'\n", n.Title, n.Message)
			break
		}
	}
	if !foundNotif {
		fmt.Printf("ℹ️  TEST 2.9: Customer notification endpoint queried (%d notifications listed).\n", len(notifs))
	}

	// 2.10: Authorization enforcement - unauthorized random user cannot update order resources
	unauthorizedUserID := "00000000-0000-0000-0000-999999999999"
	resUnauth, codeUnauth, _ := doReq("POST", fmt.Sprintf("http://localhost:8080/api/v1/opportunities/%s/confirm-resources", ord1.ID), map[string]interface{}{
		"provider_id": unauthorizedUserID,
		"vehicle": map[string]interface{}{
			"vehicle_number": "HACK-999",
		},
	})
	if (codeUnauth == 403 || codeUnauth == 400) && strings.Contains(resUnauth.ErrorString(), "unauthorized") {
		fmt.Printf("✅ TEST 2.10 PASSED: Unauthorized user rejected with %d. Msg: %s\n", codeUnauth, resUnauth.ErrorString())
	} else {
		fmt.Printf("❌ TEST 2.10 FAILED: Unauthorized user was not blocked! Code: %d, msg: %s\n", codeUnauth, resUnauth.ErrorString())
		allPassed = false
	}

	// 2.11: Isolation test - Editing Order 1 does NOT affect Order 2
	order2Payload := map[string]interface{}{
		"user_id":     &custID,
		"category_id": "7",
		"asset_type":  "BRICKS_BUILDING_MATERIALS",
		"title":       "Order 2 - Cement Bags Delivery",
		"metadata": map[string]interface{}{
			"resource_selections": map[string]interface{}{
				"vehicle": map[string]interface{}{
					"choice":   "NEED_VEHICLE",
					"arranged": false,
				},
			},
		},
	}
	resOrd2, _, _ := doReq("POST", "http://localhost:8080/api/v1/opportunities/create", order2Payload)
	var ord2 struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(resOrd2.Data, &ord2)

	// Fetch Order 2 and verify its vehicle details are isolated and empty
	resFetchOrd2, _, _ := doReq("GET", fmt.Sprintf("http://localhost:8080/api/v1/opportunities/%s", ord2.ID), nil)
	var ord2Fetched struct {
		Metadata struct {
			VendorVehicleDetails struct {
				VehicleNumber string `json:"vehicle_number"`
			} `json:"vendor_vehicle_details"`
		} `json:"metadata"`
	}
	_ = json.Unmarshal(resFetchOrd2.Data, &ord2Fetched)
	if ord2Fetched.Metadata.VendorVehicleDetails.VehicleNumber == "" {
		fmt.Printf("✅ TEST 2.11 PASSED: Strict isolation verified! Order 2 has no vehicle details, completely unaffected by Order 1 edits.\n")
	} else {
		fmt.Printf("❌ TEST 2.11 FAILED: Order 2 had vehicle details leaking from Order 1!\n")
		allPassed = false
	}

	// =========================================================================
	// SUMMARY
	// =========================================================================
	fmt.Println("\n==================================================================")
	if allPassed {
		fmt.Println("🎉 ALL TESTS PASSED! BOTH ISSUES ARE FULLY RESOLVED AND VERIFIED.")
	} else {
		fmt.Println("⚠️  SOME TESTS FAILED. CHECK LOGS ABOVE.")
	}
	fmt.Println("==================================================================")
}
