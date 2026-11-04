package handler

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/uop/backend/internal/domain"
	"github.com/uop/backend/internal/middleware"
	"github.com/uop/backend/pkg/response"
)

// ============================================================================
// PHASE 6: ORDER FULFILMENT & LOGISTICS HTTP HANDLERS
// ============================================================================

// Helper to extract authenticated user ID from context or header
func getUserIDFromRequest(r *http.Request) uuid.UUID {
	if claims, ok := middleware.GetUserClaims(r.Context()); ok && claims != nil {
		if id, err := uuid.Parse(claims.SupabaseUID); err == nil && id != uuid.Nil {
			return id
		}
	}
	if headerUID := r.Header.Get("X-User-ID"); headerUID != "" {
		if id, err := uuid.Parse(headerUID); err == nil {
			return id
		}
	}
	return uuid.Nil
}

// 1. GetVendorOrders handles GET /api/v1/vendor/orders
func (h *LogisticsHandler) GetVendorOrders(w http.ResponseWriter, r *http.Request) {
	vendorID := getUserIDFromRequest(r)
	if vendorID == uuid.Nil {
		// Also allow query param for dev flexibility
		if qUID := r.URL.Query().Get("vendor_id"); qUID != "" {
			if id, err := uuid.Parse(qUID); err == nil {
				vendorID = id
			}
		}
	}
	if vendorID == uuid.Nil {
		response.Error(w, http.StatusUnauthorized, "Vendor authentication required (missing X-User-ID or vendor_id)", nil)
		return
	}

	statusFilter := r.URL.Query().Get("status")
	limitStr := r.URL.Query().Get("limit")
	limit := 50
	if limitStr != "" {
		if l, err := strconv.Atoi(limitStr); err == nil {
			limit = l
		}
	}

	orders, err := h.logisticsService.GetVendorOrders(r.Context(), vendorID, statusFilter, limit)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to retrieve vendor orders", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Vendor orders retrieved successfully", orders)
}

// 2. GetVendorOrderDetail handles GET /api/v1/vendor/orders/{id}
func (h *LogisticsHandler) GetVendorOrderDetail(w http.ResponseWriter, r *http.Request) {
	oppIDStr := chi.URLParam(r, "id")
	oppID, err := uuid.Parse(oppIDStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid order ID format", nil)
		return
	}

	vendorID := getUserIDFromRequest(r)
	if vendorID == uuid.Nil {
		if qUID := r.URL.Query().Get("vendor_id"); qUID != "" {
			if id, err := uuid.Parse(qUID); err == nil {
				vendorID = id
			}
		}
	}
	if vendorID == uuid.Nil {
		response.Error(w, http.StatusUnauthorized, "Vendor authentication required", nil)
		return
	}

	order, err := h.logisticsService.GetVendorOrderDetail(r.Context(), oppID, vendorID)
	if err != nil {
		response.Error(w, http.StatusForbidden, err.Error(), nil)
		return
	}

	response.JSON(w, http.StatusOK, "Vendor order detail retrieved successfully", order)
}

// 3. ExecuteVendorAction handles POST /api/v1/vendor/orders/{id}/actions
func (h *LogisticsHandler) ExecuteVendorAction(w http.ResponseWriter, r *http.Request) {
	oppIDStr := chi.URLParam(r, "id")
	oppID, err := uuid.Parse(oppIDStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid order ID format", nil)
		return
	}

	vendorID := getUserIDFromRequest(r)
	var req domain.VendorOrderActionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid JSON payload", err.Error())
		return
	}

	if vendorID == uuid.Nil {
		if qUID := r.URL.Query().Get("vendor_id"); qUID != "" {
			if id, err := uuid.Parse(qUID); err == nil {
				vendorID = id
			}
		}
	}
	if vendorID == uuid.Nil {
		response.Error(w, http.StatusUnauthorized, "Vendor authentication required", nil)
		return
	}

	if err := h.logisticsService.ExecuteVendorAction(r.Context(), oppID, vendorID, &req); err != nil {
		response.Error(w, http.StatusBadRequest, err.Error(), nil)
		return
	}

	response.JSON(w, http.StatusOK, "Vendor action processed successfully", map[string]interface{}{
		"order_id": oppID,
		"action":   req.Action,
	})
}

// 4. MatchTransportProviders handles POST /api/v1/logistics/providers/match
func (h *LogisticsHandler) MatchTransportProviders(w http.ResponseWriter, r *http.Request) {
	var req domain.LogisticsProviderMatchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid JSON payload", err.Error())
		return
	}

	matches, err := h.logisticsService.MatchTransportProviders(r.Context(), &req)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to match transport providers", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Transport providers matched successfully", matches)
}

// 5. AssignDriverAndVehicle handles POST /api/v1/logistics/assign-driver-vehicle
func (h *LogisticsHandler) AssignDriverAndVehicle(w http.ResponseWriter, r *http.Request) {
	var req domain.AssignDriverVehicleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid JSON payload", err.Error())
		return
	}

	pairing, err := h.logisticsService.AssignDriverAndVehicle(r.Context(), &req)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error(), nil)
		return
	}

	response.JSON(w, http.StatusCreated, "Driver and vehicle assigned successfully", pairing)
}

// 6. GenerateOrGetWayManifest handles POST /api/v1/logistics/manifests
func (h *LogisticsHandler) GenerateOrGetWayManifest(w http.ResponseWriter, r *http.Request) {
	var payload struct {
		OpportunityID       string  `json:"opportunity_id"`
		VendorID            *string `json:"vendor_id,omitempty"`
		TransportProviderID *string `json:"transport_provider_id,omitempty"`
		VehicleID           *string `json:"vehicle_id,omitempty"`
		DriverID            *string `json:"driver_id,omitempty"`
		CargoDescription    string  `json:"cargo_description"`
		PickupAddress       string  `json:"pickup_address"`
		DeliveryAddress     string  `json:"delivery_address"`
		CargoQuantity       float64 `json:"cargo_quantity"`
		CargoUnit           string  `json:"cargo_unit"`
	}

	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid JSON payload", err.Error())
		return
	}

	oppID, err := uuid.Parse(payload.OpportunityID)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid opportunity_id", err.Error())
		return
	}

	var vID, pID, vehID, dID *uuid.UUID
	if payload.VendorID != nil && *payload.VendorID != "" {
		if id, err := uuid.Parse(*payload.VendorID); err == nil {
			vID = &id
		}
	}
	if payload.TransportProviderID != nil && *payload.TransportProviderID != "" {
		if id, err := uuid.Parse(*payload.TransportProviderID); err == nil {
			pID = &id
		}
	}
	if payload.VehicleID != nil && *payload.VehicleID != "" {
		if id, err := uuid.Parse(*payload.VehicleID); err == nil {
			vehID = &id
		}
	}
	if payload.DriverID != nil && *payload.DriverID != "" {
		if id, err := uuid.Parse(*payload.DriverID); err == nil {
			dID = &id
		}
	}

	manifest, err := h.logisticsService.GenerateOrGetWayManifest(
		r.Context(), oppID, vID, pID, vehID, dID,
		payload.CargoDescription, payload.PickupAddress, payload.DeliveryAddress,
		payload.CargoQuantity, payload.CargoUnit,
	)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed generating manifest", err.Error())
		return
	}

	response.JSON(w, http.StatusCreated, "Way manifest retrieved or generated successfully", manifest)
}

// 7. RegisterProofOfLoading handles POST /api/v1/logistics/manifests/pol
func (h *LogisticsHandler) RegisterProofOfLoading(w http.ResponseWriter, r *http.Request) {
	var req domain.ProofOfLoadingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid JSON payload", err.Error())
		return
	}

	manifest, err := h.logisticsService.RegisterProofOfLoading(r.Context(), &req)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error(), nil)
		return
	}

	response.JSON(w, http.StatusOK, "Proof of Loading recorded successfully; order in transit", manifest)
}

// 8. RegisterProofOfDelivery handles POST /api/v1/logistics/manifests/pod
func (h *LogisticsHandler) RegisterProofOfDelivery(w http.ResponseWriter, r *http.Request) {
	var req domain.ProofOfDeliveryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid JSON payload", err.Error())
		return
	}

	manifest, err := h.logisticsService.RegisterProofOfDelivery(r.Context(), &req)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error(), nil)
		return
	}

	response.JSON(w, http.StatusOK, "Proof of Delivery recorded successfully; awaiting customer OTP verification", manifest)
}

// 9. GenerateDeliveryOTP handles GET/POST /api/v1/opportunities/{id}/delivery-otp
func (h *LogisticsHandler) GenerateDeliveryOTP(w http.ResponseWriter, r *http.Request) {
	oppIDStr := chi.URLParam(r, "id")
	oppID, err := uuid.Parse(oppIDStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid opportunity ID", nil)
		return
	}

	callerID := getUserIDFromRequest(r)
	if callerID == uuid.Nil {
		response.Error(w, http.StatusUnauthorized, "Customer authentication required to access delivery verification OTP", nil)
		return
	}

	otp, err := h.logisticsService.AttachDeliveryOTPForCustomer(r.Context(), oppID, callerID)
	if err != nil {
		if strings.Contains(err.Error(), "unauthorized") {
			response.Error(w, http.StatusForbidden, err.Error(), nil)
			return
		}
		response.Error(w, http.StatusInternalServerError, "Failed generating delivery OTP", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Secure delivery OTP generated", map[string]interface{}{
		"opportunity_id": oppID,
		"delivery_otp":   otp,
	})
}

// 10. VerifySecureDeliveryOTP handles POST /api/v1/opportunities/{id}/verify-delivery-otp-secure
func (h *LogisticsHandler) VerifySecureDeliveryOTP(w http.ResponseWriter, r *http.Request) {
	oppIDStr := chi.URLParam(r, "id")
	oppID, err := uuid.Parse(oppIDStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid opportunity ID", nil)
		return
	}

	var req domain.DeliveryOTPVerificationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid JSON payload", err.Error())
		return
	}

	verifiedBy := getUserIDFromRequest(r)
	var vByPtr *uuid.UUID
	if verifiedBy != uuid.Nil {
		vByPtr = &verifiedBy
	}

	if err := h.logisticsService.VerifySecureDeliveryOTP(r.Context(), oppID, req.OTPCode, vByPtr); err != nil {
		response.Error(w, http.StatusBadRequest, err.Error(), nil)
		return
	}

	response.JSON(w, http.StatusOK, "Delivery OTP verified successfully; order completed & escrow settled", map[string]interface{}{
		"opportunity_id": oppID,
		"status":         "COMPLETED",
		"escrow_settled": true,
	})
}

// 11. SubmitSOSIncident handles POST /api/v1/logistics/sos/incident
func (h *LogisticsHandler) SubmitSOSIncident(w http.ResponseWriter, r *http.Request) {
	var req domain.SOSReportExtendedRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid JSON payload", err.Error())
		return
	}

	if req.ReporterID == uuid.Nil {
		req.ReporterID = getUserIDFromRequest(r)
	}

	inc, err := h.logisticsService.SubmitSOSIncident(r.Context(), &req)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed recording SOS incident", err.Error())
		return
	}

	response.JSON(w, http.StatusCreated, "SOS incident recorded; order suspended for emergency recovery", inc)
}

// 12. ResolveSOSIncident handles POST /api/v1/logistics/sos/resolve
func (h *LogisticsHandler) ResolveSOSIncident(w http.ResponseWriter, r *http.Request) {
	var req domain.SOSResolutionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid JSON payload", err.Error())
		return
	}

	if err := h.logisticsService.ResolveSOSIncident(r.Context(), &req); err != nil {
		response.Error(w, http.StatusBadRequest, err.Error(), nil)
		return
	}

	response.JSON(w, http.StatusOK, "SOS incident resolved successfully", map[string]interface{}{
		"incident_id":    req.IncidentID,
		"resume_transit": req.ResumeTransit,
	})
}

// 13. TransitionOrderStatus handles POST /api/v1/opportunities/{id}/status-transition
func (h *LogisticsHandler) TransitionOrderStatus(w http.ResponseWriter, r *http.Request) {
	oppIDStr := chi.URLParam(r, "id")
	oppID, err := uuid.Parse(oppIDStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid opportunity ID", nil)
		return
	}

	var payload struct {
		ToStatus string `json:"to_status"`
		Notes    string `json:"notes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid JSON payload", err.Error())
		return
	}

	userID := getUserIDFromRequest(r)
	var uPtr *uuid.UUID
	if userID != uuid.Nil {
		uPtr = &userID
	}

	toStatus := domain.OpportunityStatus(payload.ToStatus)
	if err := h.logisticsService.TransitionOrderStatus(r.Context(), oppID, toStatus, uPtr, payload.Notes); err != nil {
		response.Error(w, http.StatusBadRequest, err.Error(), nil)
		return
	}

	response.JSON(w, http.StatusOK, "Status transitioned successfully", map[string]interface{}{
		"opportunity_id": oppID,
		"to_status":      toStatus,
	})
}

