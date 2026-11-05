package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/uop/backend/internal/authz"
	"github.com/uop/backend/internal/domain"
	"github.com/uop/backend/internal/repository/postgres"
	"github.com/uop/backend/internal/service"
	"github.com/uop/backend/pkg/response"
)

type CheckoutHandler struct {
	checkoutService *service.CheckoutService
	userRepo        *postgres.UserRepository
}

func NewCheckoutHandler(checkoutService *service.CheckoutService, userRepo *postgres.UserRepository) *CheckoutHandler {
	return &CheckoutHandler{
		checkoutService: checkoutService,
		userRepo:        userRepo,
	}
}

// resolveUser returns the verified caller. explicitUserID (from a request body)
// is never trusted: it must match the caller unless the caller is an admin.
func (h *CheckoutHandler) resolveUser(r *http.Request, explicitUserID string) *domain.User {
	caller, err := authz.CurrentUser(r)
	if err != nil {
		return nil
	}
	if explicitUserID == "" || explicitUserID == caller.ID.String() {
		return caller
	}
	if !caller.IsAdmin() {
		return nil
	}
	if h.userRepo != nil {
		if uid, perr := uuid.Parse(explicitUserID); perr == nil {
			if target, _ := h.userRepo.GetByID(r.Context(), uid); target != nil {
				return target
			}
		}
	}
	return nil
}

// ValidateCart godoc
// @Summary Server-authoritative cart validation and pricing breakdown
// @Tags Checkout
// @Accept json
// @Produce json
// @Router /api/v1/cart/validate [post]
func (h *CheckoutHandler) ValidateCart(w http.ResponseWriter, r *http.Request) {
	var req domain.CartValidationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid request JSON payload", err.Error())
		return
	}

	resp, err := h.checkoutService.ValidateCart(r.Context(), &req)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Cart validation failed", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Cart validated successfully", resp)
}

type InitiateCheckoutPayload struct {
	domain.InitiateCheckoutRequest
	UserID string `json:"user_id,omitempty"`
}

// InitiateCheckout godoc
// @Summary Atomically lock inventory, create order, and generate payment transaction
// @Tags Checkout
// @Accept json
// @Produce json
// @Router /api/v1/checkout/initiate [post]
func (h *CheckoutHandler) InitiateCheckout(w http.ResponseWriter, r *http.Request) {
	var p InitiateCheckoutPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid request JSON payload", err.Error())
		return
	}

	user := h.resolveUser(r, p.UserID)
	if user == nil {
		response.Error(w, http.StatusUnauthorized, "Authentication required to initiate checkout", nil)
		return
	}

	resp, err := h.checkoutService.InitiateCheckout(r.Context(), &p.InitiateCheckoutRequest, user.ID)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error(), nil)
		return
	}

	response.JSON(w, http.StatusCreated, "Checkout initiated and inventory reserved successfully", resp)
}

// ProcessPaymentCallback godoc
// @Summary Verified payment callback from gateway, committing inventory and holding escrow
// @Tags Checkout
// @Accept json
// @Produce json
// @Router /api/v1/checkout/payment/callback [post]
func (h *CheckoutHandler) ProcessPaymentCallback(w http.ResponseWriter, r *http.Request) {
	var req domain.PaymentCallbackRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid request JSON payload", err.Error())
		return
	}

	resp, err := h.checkoutService.ProcessPaymentCallback(r.Context(), &req)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error(), nil)
		return
	}

	response.JSON(w, http.StatusOK, "Payment callback processed successfully", resp)
}

// CancelCheckoutOrder godoc
// @Summary Cancel a pending checkout order and release active reserved inventory
// @Tags Checkout
// @Accept json
// @Produce json
// @Router /api/v1/checkout/{id}/cancel [post]
func (h *CheckoutHandler) CancelCheckoutOrder(w http.ResponseWriter, r *http.Request) {
	idStr := chi.URLParam(r, "id")
	oppID, err := uuid.Parse(idStr)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid order UUID", err.Error())
		return
	}

	user := h.resolveUser(r, "")
	if user == nil {
		response.Error(w, http.StatusUnauthorized, "Authentication required to cancel order", nil)
		return
	}

	if err := h.checkoutService.CancelCheckoutOrder(r.Context(), oppID, user.ID); err != nil {
		response.Error(w, http.StatusBadRequest, err.Error(), nil)
		return
	}

	response.JSON(w, http.StatusOK, "Order cancelled successfully and reserved stock released", map[string]string{
		"order_id": oppID.String(),
	})
}
