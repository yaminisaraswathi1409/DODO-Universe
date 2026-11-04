package service

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/uop/backend/internal/domain"
	"github.com/uop/backend/internal/repository/postgres"
)

type CheckoutService struct {
	checkoutRepo *postgres.CheckoutRepository
	userRepo     *postgres.UserRepository
}

func NewCheckoutService(checkoutRepo *postgres.CheckoutRepository, userRepo *postgres.UserRepository) *CheckoutService {
	return &CheckoutService{
		checkoutRepo: checkoutRepo,
		userRepo:     userRepo,
	}
}

func (s *CheckoutService) ValidateCart(ctx context.Context, req *domain.CartValidationRequest) (*domain.CartValidationResponse, error) {
	if req == nil {
		return &domain.CartValidationResponse{
			IsValid:         false,
			RejectionReason: "Cart request payload cannot be empty",
		}, nil
	}
	if len(req.Items) == 0 {
		return &domain.CartValidationResponse{
			IsValid:         false,
			RejectionReason: "Cart is empty. Please add items to proceed.",
		}, nil
	}
	return s.checkoutRepo.ValidateCartItems(ctx, req)
}

func (s *CheckoutService) InitiateCheckout(ctx context.Context, req *domain.InitiateCheckoutRequest, userID uuid.UUID) (*domain.InitiateCheckoutResponse, error) {
	if req == nil {
		return nil, fmt.Errorf("checkout request cannot be empty")
	}
	if userID == uuid.Nil {
		return nil, fmt.Errorf("authenticated user required to initiate checkout")
	}

	// Verify customer status
	if s.userRepo != nil {
		user, err := s.userRepo.GetByID(ctx, userID)
		if err != nil {
			return nil, fmt.Errorf("failed to retrieve user profile: %w", err)
		}
		if user == nil {
			return nil, fmt.Errorf("user not found")
		}
		if user.Status == domain.StatusSuspended {
			return nil, fmt.Errorf("account is suspended. Cannot place orders")
		}
	}

	// 1. Authoritative Server-Side Validation
	validation, err := s.checkoutRepo.ValidateCartItems(ctx, &req.CartValidationRequest)
	if err != nil {
		return nil, fmt.Errorf("cart validation failed: %w", err)
	}
	if !validation.IsValid {
		return nil, fmt.Errorf("checkout validation rejected: %s", validation.RejectionReason)
	}

	// 2. Generate idempotency key if missing
	if strings.TrimSpace(req.IdempotencyKey) == "" {
		req.IdempotencyKey = fmt.Sprintf("idemp_%s_%d", userID.String()[:8], time.Now().UnixNano())
	}

	return s.checkoutRepo.InitiateReservationAndCheckout(ctx, req, userID, validation)
}

func (s *CheckoutService) ProcessPaymentCallback(ctx context.Context, req *domain.PaymentCallbackRequest) (*domain.PaymentTransaction, error) {
	if req == nil {
		return nil, fmt.Errorf("payment callback request cannot be empty")
	}
	if strings.TrimSpace(req.PaymentReference) == "" {
		return nil, fmt.Errorf("payment reference is required")
	}
	return s.checkoutRepo.ProcessPaymentCallback(ctx, req)
}

func (s *CheckoutService) CancelCheckoutOrder(ctx context.Context, oppID, userID uuid.UUID) error {
	if oppID == uuid.Nil || userID == uuid.Nil {
		return fmt.Errorf("order ID and user ID are required for cancellation")
	}
	return s.checkoutRepo.CancelCheckoutOrder(ctx, oppID, userID)
}

func (s *CheckoutService) ExpireStaleReservations(ctx context.Context) (int64, error) {
	if s.checkoutRepo == nil {
		return 0, nil
	}
	return s.checkoutRepo.ExpireStaleReservations(ctx)
}

