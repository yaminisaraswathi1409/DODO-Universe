package service

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/uop/backend/internal/domain"
	"github.com/uop/backend/internal/plugin"
	"github.com/uop/backend/internal/repository/postgres"
)

type subRepoInterface interface {
	GetUserActiveSubscription(ctx context.Context, userID uuid.UUID) (any, error)
	ValidateAndIncrementSubscription(ctx context.Context, userID uuid.UUID, role string) (any, error)
}

type catalogItemAttrHolder struct {
	Attributes json.RawMessage
}

type catalogRepoInterface interface {
	GetCatalogItemByID(ctx context.Context, id uuid.UUID) (*catalogItemAttrHolder, error)
}

type logisticsFeeCalculator interface {
	CalculateDeliveryFee(ctx context.Context, req *domain.DeliveryCalculationRequest) (*domain.DeliveryCalculationResult, error)
}

type OpportunityService struct {
	oppRepo          *postgres.OpportunityRepository
	userRepo         *postgres.UserRepository
	logisticsRepo    logisticsFeeCalculator
	subRepo          subRepoInterface
	catalogRepo      catalogRepoInterface
	workflowRegistry *plugin.WorkflowRegistry
}

func NewOpportunityService(
	oppRepo *postgres.OpportunityRepository,
	userRepo *postgres.UserRepository,
	workflowRegistry *plugin.WorkflowRegistry,
) *OpportunityService {
	return &OpportunityService{
		oppRepo:          oppRepo,
		userRepo:         userRepo,
		workflowRegistry: workflowRegistry,
	}
}

func (s *OpportunityService) SetSubscriptionRepository(subRepo any) {
	if sRepo, ok := subRepo.(subRepoInterface); ok {
		s.subRepo = sRepo
	}
}

func (s *OpportunityService) SetLogisticsRepository(logisticsRepo any) {
	if lRepo, ok := logisticsRepo.(logisticsFeeCalculator); ok {
		s.logisticsRepo = lRepo
	}
}

func (s *OpportunityService) SetCatalogRepository(catalogRepo any) {
	if cRepo, ok := catalogRepo.(catalogRepoInterface); ok {
		s.catalogRepo = cRepo
	}
}

func (s *OpportunityService) CreateOpportunity(ctx context.Context, opp *domain.Opportunity) (*domain.Opportunity, error) {
	// Validate subscription limits if subscription repo is attached and user ID is present
	if s.subRepo != nil && opp.UserID != uuid.Nil {
		activeSub, err := s.subRepo.GetUserActiveSubscription(ctx, opp.UserID)
		if err == nil && activeSub != nil {
			// User has an active subscription -> Validate limits and consume 1 unit credit
			_, incErr := s.subRepo.ValidateAndIncrementSubscription(ctx, opp.UserID, "SEEKER")
			if incErr != nil {
				return nil, fmt.Errorf("subscription limit error: %w", incErr)
			}
		}
	}

	// Validate workflow model plugin
	wf, err := s.workflowRegistry.Get(opp.WorkflowModel)
	if err != nil {
		return nil, fmt.Errorf("invalid workflow model: %w", err)
	}

	if err := wf.Validate(ctx, opp); err != nil {
		return nil, fmt.Errorf("workflow validation failed: %w", err)
	}

	if opp.RadiusKM <= 0 {
		opp.RadiusKM = 25.0 // default 25km radius
	}

	// Dynamic Category Validation based on DB Category configuration
	if opp.CategoryID != nil {
		cat, catErr := s.oppRepo.GetCategoryByID(ctx, *opp.CategoryID)
		if catErr == nil && cat != nil {
			var meta map[string]interface{}
			if len(opp.Metadata) > 0 {
				_ = json.Unmarshal(opp.Metadata, &meta)
			}
			if meta == nil {
				meta = make(map[string]interface{})
			}
			if opp.Quantity != nil && *opp.Quantity > 0 {
				if _, exists := meta["quantity"]; !exists {
					meta["quantity"] = *opp.Quantity
				}
				if _, exists := meta["quantity_needed"]; !exists {
					meta["quantity_needed"] = *opp.Quantity
				}
			}

			// 1. Validate Dynamic Opportunity Fields
			var oppFields []struct {
				Key      string `json:"key"`
				Label    string `json:"label"`
				Required bool   `json:"required"`
			}
			if len(cat.OpportunityFields) > 0 {
				_ = json.Unmarshal(cat.OpportunityFields, &oppFields)
			}

			if len(oppFields) > 0 {
				catItemAttrCache := make(map[string]map[string]interface{})
				getCatItemAttr := func(itemID uuid.UUID) map[string]interface{} {
					idStr := itemID.String()
					if attr, found := catItemAttrCache[idStr]; found {
						return attr
					}
					attrMap := make(map[string]interface{})
					if s.catalogRepo != nil {
						item, err := s.catalogRepo.GetCatalogItemByID(ctx, itemID)
						if err == nil && item != nil && len(item.Attributes) > 0 {
							_ = json.Unmarshal(item.Attributes, &attrMap)
						}
					}
					catItemAttrCache[idStr] = attrMap
					return attrMap
				}

				var candidateCatalogItemIDs []uuid.UUID
				if opp.CatalogItemID != nil && *opp.CatalogItemID != uuid.Nil {
					candidateCatalogItemIDs = append(candidateCatalogItemIDs, *opp.CatalogItemID)
				}
				if cartItemsRaw, ok := meta["cart_items"].([]interface{}); ok {
					for _, cRaw := range cartItemsRaw {
						if cMap, ok := cRaw.(map[string]interface{}); ok {
							if cIDStr, ok := cMap["catalogItemId"].(string); ok && cIDStr != "" {
								if parsed, err := uuid.Parse(cIDStr); err == nil {
									candidateCatalogItemIDs = append(candidateCatalogItemIDs, parsed)
								}
							} else if cIDStr, ok := cMap["catalog_item_id"].(string); ok && cIDStr != "" {
								if parsed, err := uuid.Parse(cIDStr); err == nil {
									candidateCatalogItemIDs = append(candidateCatalogItemIDs, parsed)
								}
							}
						}
					}
				}

				for _, f := range oppFields {
					if f.Required {
						val, exists := meta[f.Key]
						hasVal := exists && val != nil && fmt.Sprintf("%v", val) != ""

						if !hasVal && len(candidateCatalogItemIDs) > 0 {
							for _, cID := range candidateCatalogItemIDs {
								itemAttrs := getCatItemAttr(cID)
								if attrVal, found := itemAttrs[f.Key]; found && attrVal != nil && fmt.Sprintf("%v", attrVal) != "" {
									meta[f.Key] = attrVal
									hasVal = true
									break
								}
							}
						}

						if !hasVal && opp.OrderMode == domain.OrderModeCatalog {
							meta[f.Key] = opp.Title
							hasVal = true
						}

						if !hasVal {
							return nil, fmt.Errorf("required service field '%s' (%s) is missing", f.Label, f.Key)
						}
					}
				}
				opp.Metadata, _ = json.Marshal(meta)
			}

			// 2. Validate 100% Dynamic Category Resources & Resource Fields
			var dynamicResources []struct {
				Key              string `json:"key"`
				Name             string `json:"name"`
				RequirementLevel string `json:"requirement_level"`
				Active           bool   `json:"active"`
				Fields           []struct {
					Key      string `json:"key"`
					Label    string `json:"label"`
					Required bool   `json:"required"`
				} `json:"fields"`
			}
			if len(cat.Resources) > 0 {
				_ = json.Unmarshal(cat.Resources, &dynamicResources)
			}

			if len(dynamicResources) > 0 {
				for _, res := range dynamicResources {
					if res.Active && res.RequirementLevel == "REQUIRED" {
						optKey := res.Key + "_option"
						vOpt, _ := meta[optKey].(string)
						if vOpt == "" {
							vOpt, _ = meta["resource_" + res.Key].(string)
						}
						if vOpt == "" {
							return nil, fmt.Errorf("required resource '%s' selection is missing for %s", res.Name, cat.Name)
						}
					}
				}
			} else {
				// Fallback validation for legacy resource_requirements
				var resReq map[string]string
				if len(cat.ResourceRequirements) > 0 {
					_ = json.Unmarshal(cat.ResourceRequirements, &resReq)
				}
				if resReq != nil {
					for rKey, reqLevel := range resReq {
						if reqLevel == "REQUIRED" {
							optKey := rKey + "_option"
							vOpt, _ := meta[optKey].(string)
							if vOpt == "" {
								return nil, fmt.Errorf("required resource '%s' selection is missing for %s", rKey, cat.Name)
							}
						}
					}
				}
			}
		}
	}

	// Direct Catalog Orders or Multi-Brand Cart Orders: Authoritative backend price resolution & status handling
	if opp.OrderMode == domain.OrderModeCatalog {
		opp.Status = domain.StatusOrderPlaced
		if opp.TargetVendorID != nil {
			opp.AssignedUserID = opp.TargetVendorID
		}

		if (opp.CatalogItemID != nil || opp.TargetVendorID != nil) && s.logisticsRepo != nil {
			calcReq := &domain.DeliveryCalculationRequest{
				CustomerLat: opp.Lat,
				CustomerLng: opp.Lng,
			}
			if opp.CatalogItemID != nil {
				calcReq.CatalogItemID = opp.CatalogItemID.String()
			}
			if opp.TargetVendorID != nil {
				calcReq.VendorUserID = opp.TargetVendorID.String()
			}
			if opp.CategoryID != nil {
				calcReq.CategoryID = opp.CategoryID.String()
			}
			if opp.Quantity != nil && *opp.Quantity > 0 {
				calcReq.Quantity = *opp.Quantity
			}

			var meta map[string]interface{}
			if len(opp.Metadata) > 0 {
				_ = json.Unmarshal(opp.Metadata, &meta)
			}
			if meta != nil {
				if vasID, ok := meta["vendor_asset_id"].(string); ok && vasID != "" {
					calcReq.VendorAssetID = vasID
				} else if vasID, ok := meta["service_asset_id"].(string); ok && vasID != "" {
					calcReq.VendorAssetID = vasID
				}
			}

			calcRes, calcErr := s.logisticsRepo.CalculateDeliveryFee(ctx, calcReq)
			if calcErr == nil && calcRes != nil {
				if !calcRes.IsEligible {
					return nil, fmt.Errorf("cannot place catalog order: %s", calcRes.RejectionReason)
				}

				// Authoritatively override unit_price & total_price from backend DB calculation
				opp.UnitPrice = &calcRes.UnitPrice
				opp.TotalPrice = &calcRes.FinalPayable

				var meta map[string]interface{}
				if len(opp.Metadata) > 0 {
					_ = json.Unmarshal(opp.Metadata, &meta)
				}
				if meta == nil {
					meta = make(map[string]interface{})
				}

				var ruleIDStr *uuid.UUID
				ruleSummary := "Default distance tier"
				if calcRes.AppliedRule != nil {
					ruleIDStr = &calcRes.AppliedRule.ID
					ruleSummary = fmt.Sprintf("%.0f-%.0f km bracket", calcRes.AppliedRule.MinDistanceKM, calcRes.AppliedRule.MaxDistanceKM)
				}

				effectiveDriver := calcRes.DriverCharge
				if calcRes.DriverIncluded {
					effectiveDriver = 0.0
				}

				snapshot := domain.PriceSnapshot{
					ItemTitle:       calcRes.ItemTitle,
					PricingModel:    calcRes.PricingModel,
					UnitPrice:       calcRes.UnitPrice,
					Quantity:        calcRes.Quantity,
					Subtotal:        calcRes.Subtotal,
					DistanceKM:      calcRes.DistanceKM,
					DeliveryCharge:  calcRes.DeliveryCharge,
					TransportCharge: calcRes.TransportCharge,
					DriverCharge:    calcRes.DriverCharge,
					DriverIncluded:  calcRes.DriverIncluded,
					LoadingCharge:   calcRes.LoadingCharge,
					UnloadingCharge: calcRes.UnloadingCharge,
					ServiceFee:      calcRes.ServiceFee,
					TotalCharges:    calcRes.TotalCharges,
					FinalPayable:    calcRes.FinalPayable,
					Items: []domain.PriceSnapshotItem{
						{
							Title:     calcRes.ItemTitle,
							Quantity:  calcRes.Quantity,
							UnitPrice: calcRes.UnitPrice,
							Subtotal:  calcRes.Subtotal,
							Unit:      calcRes.PricingModel,
						},
					},
					Charges: domain.PriceSnapshotCharges{
						Transport: calcRes.TransportCharge,
						Driver:    effectiveDriver,
						Loading:   calcRes.LoadingCharge,
						Unloading: calcRes.UnloadingCharge,
						Delivery:  calcRes.DeliveryCharge,
						Service:   calcRes.ServiceFee,
					},
					AppliedRuleID: ruleIDStr,
					RuleSummary:   ruleSummary,
					CalculatedAt:  time.Now(),
				}

				meta["price_snapshot"] = snapshot
				meta["delivery_charge"] = calcRes.DeliveryCharge
				meta["transport_charge"] = calcRes.TransportCharge
				meta["driver_charge"] = calcRes.DriverCharge
				meta["loading_charge"] = calcRes.LoadingCharge
				meta["unloading_charge"] = calcRes.UnloadingCharge
				meta["total_charges"] = calcRes.TotalCharges
				meta["subtotal"] = calcRes.Subtotal
				meta["distance_km"] = calcRes.DistanceKM
				opp.Metadata, _ = json.Marshal(meta)

				if opp.TargetVendorID == nil && calcRes.VendorUserID != "" {
					if vUID, pErr := uuid.Parse(calcRes.VendorUserID); pErr == nil {
						opp.TargetVendorID = &vUID
						opp.AssignedUserID = &vUID
					}
				}
			}
		}
	} else {
		opp.OrderMode = domain.OrderModeGeneral
		opp.Status = domain.StatusOpen
	}


	created, err := s.oppRepo.Create(ctx, opp)
	if err != nil {
		return nil, err
	}

	// Process Multi-Brand Cart Order Separation (Parent -> Brand Sub-Orders)
	var createdMeta map[string]interface{}
	if len(created.Metadata) > 0 {
		_ = json.Unmarshal(created.Metadata, &createdMeta)
	}

	if createdMeta != nil {
		var rawGroups []interface{}
		if vg, exists := createdMeta["vendor_groups"]; exists {
			if slice, ok := vg.([]interface{}); ok {
				rawGroups = slice
			}
		}

		if len(rawGroups) > 0 {
			for _, gRaw := range rawGroups {
				gMap, ok := gRaw.(map[string]interface{})
				if !ok {
					continue
				}
				vIDStr, _ := gMap["vendorId"].(string)
				vName, _ := gMap["vendorName"].(string)
				if vName == "" {
					vName = "Brand Vendor"
				}

				var vendorUID *uuid.UUID
				if vIDStr != "" {
					if parsed, err := uuid.Parse(vIDStr); err == nil {
						if s.userRepo != nil {
							if usr, uErr := s.userRepo.GetByID(ctx, parsed); uErr == nil && usr != nil {
								vendorUID = &parsed
							}
						} else {
							vendorUID = &parsed
						}
					}
				}

				var groupItems []interface{}
				if itemsRaw, ok := gMap["items"].([]interface{}); ok {
					groupItems = itemsRaw
				}

				itemTitles := []string{}
				var groupSubtotal float64 = 0
				var firstCatID *uuid.UUID
				var firstCatItemID *uuid.UUID

				for _, itRaw := range groupItems {
					if itMap, ok := itRaw.(map[string]interface{}); ok {
						if t, ok := itMap["title"].(string); ok {
							itemTitles = append(itemTitles, t)
						}
						if price, ok := itMap["totalPrice"].(float64); ok {
							groupSubtotal += price
						} else if unitP, ok := itMap["unitPrice"].(float64); ok {
							qty, _ := itMap["quantity"].(float64)
							if qty <= 0 {
								qty = 1
							}
							groupSubtotal += unitP * qty
						}
						if firstCatID == nil {
							if catIDStr, ok := itMap["categoryId"].(string); ok && catIDStr != "" {
								if pCat, err := uuid.Parse(catIDStr); err == nil {
									firstCatID = &pCat
								}
							}
						}
						if firstCatItemID == nil {
							if catItemStr, ok := itMap["catalogItemId"].(string); ok && catItemStr != "" {
								if pItem, err := uuid.Parse(catItemStr); err == nil {
									firstCatItemID = &pItem
								}
							}
						}
					}
				}

				childTitle := fmt.Sprintf("%s Order (%d items)", vName, len(groupItems))
				if len(itemTitles) > 0 {
					childTitle = fmt.Sprintf("%s: %s", vName, strings.Join(itemTitles, ", "))
				}
				childDesc := fmt.Sprintf("Brand sub-order for %s containing %d items: %s", vName, len(groupItems), strings.Join(itemTitles, "; "))

				childMetaMap := make(map[string]interface{})
				for k, v := range createdMeta {
					childMetaMap[k] = v
				}
				childMetaMap["brand_vendor_id"] = vIDStr
				childMetaMap["brand_name"] = vName
				childMetaMap["brand_items"] = groupItems
				childMetaMap["brand_subtotal"] = groupSubtotal

				childMetaBytes, _ := json.Marshal(childMetaMap)

				qty := float64(len(groupItems))
				childOpp := &domain.Opportunity{
					UserID:              created.UserID,
					ParentOpportunityID: &created.ID,
					TargetVendorID:      vendorUID,
					AssignedUserID:      vendorUID,
					CategoryID:          firstCatID,
					CatalogItemID:       firstCatItemID,
					Type:                domain.TypeNeed,
					OrderMode:           domain.OrderModeCatalog,
					Title:               childTitle,
					Description:         childDesc,
					WorkflowModel:       created.WorkflowModel,
					Status:              domain.StatusOrderPlaced,
					Lat:                 created.Lat,
					Lng:                 created.Lng,
					AddressText:         created.AddressText,
					RadiusKM:            created.RadiusKM,
					Quantity:            &qty,
					UnitPrice:           &groupSubtotal,
					TotalPrice:          &groupSubtotal,
					Metadata:            childMetaBytes,
				}

				_, childErr := s.oppRepo.Create(ctx, childOpp)
				if childErr != nil {
					childOpp.CatalogItemID = nil
					childOpp.CategoryID = nil
					_, childErr = s.oppRepo.Create(ctx, childOpp)
				}
				if childErr == nil && vendorUID != nil {
					// Send direct notification to vendor
					vNotifMsg := fmt.Sprintf("You received a direct order for %s (%s). Please inspect and fulfill.", vName, childTitle)
					vNotifMeta, _ := json.Marshal(map[string]interface{}{
						"opportunity_id": childOpp.ID,
						"parent_id":      created.ID,
						"title":          childTitle,
						"status":         string(childOpp.Status),
						"type":           "DIRECT_CATALOG_ORDER",
						"order_mode":     "CATALOG_ORDER",
					})
					_, _ = s.userRepo.CreateNotification(ctx, &domain.Notification{
						UserID:   *vendorUID,
						Title:    "New Brand Catalog Order",
						Message:  vNotifMsg,
						Type:     "DIRECT_CATALOG_ORDER",
						Metadata: vNotifMeta,
					})
				}
			}
		}
	}

	// Trigger Customer ORDER_PLACED Notification
	if created.UserID != uuid.Nil {
		custNotifMsg := fmt.Sprintf("Your order \"%s\" has been placed successfully.", created.Title)
		if created.OrderMode == domain.OrderModeCatalog {
			custNotifMsg = fmt.Sprintf("Your catalog order \"%s\" has been sent directly to the vendor.", created.Title)
		}
		custNotifMeta, _ := json.Marshal(map[string]interface{}{
			"opportunity_id": created.ID,
			"title":          created.Title,
			"status":         string(created.Status),
			"type":           "ORDER_PLACED",
			"order_mode":     string(created.OrderMode),
		})
		_, _ = s.userRepo.CreateNotification(ctx, &domain.Notification{
			UserID:   created.UserID,
			Title:    "Order Placed Successfully",
			Message:  custNotifMsg,
			Type:     "ORDER_PLACED",
			Metadata: custNotifMeta,
		})
	}

	// For Direct Catalog Orders, send direct notification to Target Vendor ONLY
	if created.OrderMode == domain.OrderModeCatalog && created.TargetVendorID != nil {
		vendorNotifMsg := fmt.Sprintf("You received a direct catalog order for \"%s\". Please inspect and accept.", created.Title)
		vendorNotifMeta, _ := json.Marshal(map[string]interface{}{
			"opportunity_id": created.ID,
			"title":          created.Title,
			"status":         string(created.Status),
			"type":           "DIRECT_CATALOG_ORDER",
			"order_mode":     string(created.OrderMode),
		})
		_, _ = s.userRepo.CreateNotification(ctx, &domain.Notification{
			UserID:   *created.TargetVendorID,
			Title:    "New Direct Catalog Order",
			Message:  vendorNotifMsg,
			Type:     "DIRECT_CATALOG_ORDER",
			Metadata: vendorNotifMeta,
		})
	}

	// Trigger Provider Matching & Structured Notifications (Skip for Direct Catalog Orders)
	if created.Type == domain.TypeNeed && created.CategoryID != nil && created.OrderMode != domain.OrderModeCatalog {
		providers, _ := s.oppRepo.FindEligibleProvidersForCategory(ctx, created.CategoryID)
		for _, p := range providers {
			if p.ID == created.UserID {
				continue
			}

			// Record match linkage
			_ = s.oppRepo.SaveOpportunityMatch(ctx, created.ID, p.ID, "NOTIFIED")

			// Extract metadata fields for notification content
			var meta map[string]interface{}
			if len(created.Metadata) > 0 {
				_ = json.Unmarshal(created.Metadata, &meta)
			}
			if meta == nil {
				meta = make(map[string]interface{})
			}

			catName := created.Title
			if created.Category != nil && created.Category.Name != "" {
				catName = created.Category.Name
			}

			quantityStr := "1 unit"
			if q, ok := meta["quantity"]; ok && q != nil {
				quantityStr = fmt.Sprintf("%v units", q)
			} else if qb, ok := meta["quantity_bags"]; ok && qb != nil {
				quantityStr = fmt.Sprintf("%v bags", qb)
			}

			pickupStr := created.AddressText
			if pLoc, ok := meta["pickup_location"].(string); ok && pLoc != "" {
				pickupStr = pLoc
			} else if sLoc, ok := meta["source_location"].(string); ok && sLoc != "" {
				pickupStr = sLoc
			}
			if pickupStr == "" {
				pickupStr = "Standard Location"
			}

			deliveryStr := created.AddressText
			if dLoc, ok := meta["delivery_location"].(string); ok && dLoc != "" {
				deliveryStr = dLoc
			}
			if deliveryStr == "" {
				deliveryStr = "Customer Delivery Address"
			}

			reqDateStr := "Scheduled"
			if created.ScheduledStart != nil {
				reqDateStr = created.ScheduledStart.Format("02 Jan 2006")
			}

			notifMsg := fmt.Sprintf("New Matching Order\n%s — %s\nPickup: %s\nDeliver to: %s\nRequired: %s",
				catName, quantityStr, pickupStr, deliveryStr, reqDateStr)

			notifMeta, _ := json.Marshal(map[string]interface{}{
				"opportunity_id": created.ID,
				"category":       catName,
				"quantity":       quantityStr,
				"pickup":         pickupStr,
				"delivery":       deliveryStr,
				"type":           "MATCHING_ORDER",
			})

			_, _ = s.userRepo.CreateNotification(ctx, &domain.Notification{
				UserID:   p.ID,
				Title:    "New Matching Order",
				Message:  notifMsg,
				Type:     "MATCHING_ORDER",
				Metadata: notifMeta,
			})
		}
	}

	return created, nil
}

func (s *OpportunityService) GetOpportunity(ctx context.Context, id uuid.UUID) (*domain.Opportunity, error) {
	return s.oppRepo.GetByID(ctx, id)
}

func (s *OpportunityService) MatchOpportunity(ctx context.Context, oppID uuid.UUID) ([]*domain.OpportunityMatch, error) {
	opp, err := s.oppRepo.GetByID(ctx, oppID)
	if err != nil || opp == nil {
		return nil, fmt.Errorf("opportunity not found: %v", err)
	}

	// Match opposite type: if NEED -> match OFFERs; if OFFER -> match NEEDs
	targetType := domain.TypeOffer
	if opp.Type == domain.TypeOffer {
		targetType = domain.TypeNeed
	}

	radiusMeters := opp.RadiusKM * 1000.0
	matches, err := s.oppRepo.FindProximityMatches(ctx, opp.Lat, opp.Lng, targetType, opp.CategoryID, radiusMeters, 20)
	if err != nil {
		return nil, err
	}

	return matches, nil
}

// CreateChildOpportunity generates a multi-layer linked opportunity (e.g. Brick seller needs Transport)
func (s *OpportunityService) CreateChildOpportunity(ctx context.Context, parentID uuid.UUID, userID uuid.UUID, childReq *domain.Opportunity) (*domain.Opportunity, error) {
	parent, err := s.oppRepo.GetByID(ctx, parentID)
	if err != nil || parent == nil {
		return nil, fmt.Errorf("parent opportunity not found: %v", err)
	}

	childReq.UserID = userID
	childReq.ParentOpportunityID = &parentID
	childReq.WorkflowModel = domain.WorkflowMulti
	childReq.Lat = parent.Lat
	childReq.Lng = parent.Lng

	createdChild, err := s.CreateOpportunity(ctx, childReq)
	if err != nil {
		return nil, fmt.Errorf("failed to create child chained opportunity: %w", err)
	}

	return createdChild, nil
}

func (s *OpportunityService) ListPublicOpportunities(ctx context.Context, categorySlug, oppType string, page, limit int) ([]*domain.Opportunity, int, error) {
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 50 {
		limit = 20
	}
	offset := (page - 1) * limit

	return s.oppRepo.ListPublicListings(ctx, categorySlug, oppType, limit, offset)
}

func (s *OpportunityService) NotifyOrderStatusChange(ctx context.Context, oppID uuid.UUID, status domain.OpportunityStatus, extraDetails string) error {
	opp, err := s.oppRepo.GetByID(ctx, oppID)
	if err != nil || opp == nil {
		return err
	}

	var title, msg string
	switch status {
	case domain.StatusOrderPlaced, domain.StatusOpen:
		title = "Order Placed Successfully"
		msg = fmt.Sprintf("Your order \"%s\" has been placed successfully.", opp.Title)
	case domain.StatusProviderAccepted, domain.StatusAccepted:
		title = "Provider Accepted Your Order!"
		msg = fmt.Sprintf("A provider accepted your request for \"%s\".", opp.Title)
	case domain.StatusVehicleAssigned:
		title = "Vehicle Arranged"
		msg = fmt.Sprintf("Vehicle arranged for your order \"%s\".", opp.Title)
	case domain.StatusDriverAssigned:
		title = "Driver Assigned"
		msg = fmt.Sprintf("Driver assigned for your order \"%s\".", opp.Title)
	case domain.StatusPreparing, domain.StatusDispatched:
		title = "Loading Status Update"
		msg = fmt.Sprintf("Loading status update for order \"%s\".", opp.Title)
	case domain.StatusInTransit, domain.StatusEnroute:
		title = "In Transit"
		msg = fmt.Sprintf("Transport started! Your order \"%s\" is on the way.", opp.Title)
	case domain.StatusVehicleProblem, domain.StatusIncidentSuspended:
		title = "Delivery Delay / Vehicle Issue Alert"
		msg = fmt.Sprintf("Vehicle issue / delivery delay reported for \"%s\".", opp.Title)
	case domain.StatusRepairCompleted, domain.StatusIssueResolved, domain.StatusInTransitAgain:
		title = "Repair Completed / Transport Resumed"
		msg = fmt.Sprintf("Vehicle repair completed! Transport resumed for \"%s\".", opp.Title)
	case domain.StatusDelivered:
		title = "Delivered!"
		msg = fmt.Sprintf("Order \"%s\" delivered successfully.", opp.Title)
	case domain.StatusCompleted:
		title = "Order Completed"
		msg = fmt.Sprintf("Order \"%s\" completed. Thank you!", opp.Title)
	default:
		title = fmt.Sprintf("Order Status Updated: %s", status)
		msg = fmt.Sprintf("Your order \"%s\" status changed to %s.", opp.Title, status)
	}

	if extraDetails != "" {
		msg += " " + extraDetails
	}

	notifMeta, _ := json.Marshal(map[string]interface{}{
		"opportunity_id": opp.ID,
		"title":          opp.Title,
		"status":         string(status),
		"extra_details":  extraDetails,
		"type":           string(status),
	})

	_, err = s.userRepo.CreateNotification(ctx, &domain.Notification{
		UserID:   opp.UserID,
		Title:    title,
		Message:  msg,
		Type:     string(status),
		Metadata: notifMeta,
	})

	// Also notify assigned provider if present and different from customer
	if opp.AssignedUserID != nil && *opp.AssignedUserID != uuid.Nil && *opp.AssignedUserID != opp.UserID {
		providerMsg := fmt.Sprintf("Order \"%s\" status updated to %s.", opp.Title, status)
		if extraDetails != "" {
			providerMsg += " " + extraDetails
		}
		_, _ = s.userRepo.CreateNotification(ctx, &domain.Notification{
			UserID:   *opp.AssignedUserID,
			Title:    fmt.Sprintf("Order Update: %s", title),
			Message:  providerMsg,
			Type:     string(status),
			Metadata: notifMeta,
		})
	}

	return err
}

func (s *OpportunityService) UpdateOpportunityStatus(ctx context.Context, id uuid.UUID, status domain.OpportunityStatus) error {
	err := s.oppRepo.UpdateStatus(ctx, id, status)
	if err == nil {
		_ = s.NotifyOrderStatusChange(ctx, id, status, "")
	}
	return err
}

func (s *OpportunityService) UpdateOpportunityStatusWithProvider(ctx context.Context, id uuid.UUID, status domain.OpportunityStatus, providerUserID uuid.UUID) error {
	if status == domain.StatusAccepted || status == "ACCEPTED" || status == "PROVIDER_ACCEPTED" {
		return s.AcceptOpportunity(ctx, id, providerUserID)
	}
	err := s.oppRepo.UpdateStatus(ctx, id, status)
	if err == nil {
		_ = s.NotifyOrderStatusChange(ctx, id, status, "")
	}
	return err
}

func (s *OpportunityService) AcceptOpportunity(ctx context.Context, oppID uuid.UUID, providerUserID uuid.UUID) error {
	opp, err := s.oppRepo.GetByID(ctx, oppID)
	if err != nil || opp == nil {
		return fmt.Errorf("opportunity not found")
	}

	if opp.AssignedUserID != nil && *opp.AssignedUserID != providerUserID {
		return fmt.Errorf("order has already been accepted by another provider")
	}

	// Worker Capacity Validation (Requirement 8)
	if len(opp.Metadata) > 0 {
		var meta map[string]interface{}
		if err := json.Unmarshal(opp.Metadata, &meta); err == nil {
			reqWorkers := 0
			if w, ok := meta["number_of_workers"]; ok {
				switch v := w.(type) {
				case float64:
					reqWorkers = int(v)
				case int:
					reqWorkers = v
				}
			} else if w, ok := meta["workers_required"]; ok {
				switch v := w.(type) {
				case float64:
					reqWorkers = int(v)
				case int:
					reqWorkers = v
				}
			}

			if reqWorkers > 0 && providerUserID != uuid.Nil {
				assets, err := s.userRepo.GetUserSkillsAssets(ctx, providerUserID)
				if err == nil && len(assets) > 0 {
					providerCapacity := 0
					for _, ast := range assets {
						if len(ast.Attributes) > 0 {
							var attr map[string]interface{}
							if json.Unmarshal(ast.Attributes, &attr) == nil {
								if capVal, ok := attr["worker_capacity"]; ok {
									switch v := capVal.(type) {
									case float64:
										if int(v) > providerCapacity {
											providerCapacity = int(v)
										}
									case int:
										if v > providerCapacity {
											providerCapacity = v
										}
									}
								}
							}
						}
					}
					if providerCapacity > 0 && providerCapacity < reqWorkers {
						return fmt.Errorf("worker capacity error: provider capacity (%d workers) is insufficient for requested order (%d workers)", providerCapacity, reqWorkers)
					}
				}
			}
		}
	}

	if s.subRepo != nil && providerUserID != uuid.Nil {
		activeSub, err := s.subRepo.GetUserActiveSubscription(ctx, providerUserID)
		if err == nil && activeSub != nil {
			// Validate provider subscription & consume 1 credit
			_, incErr := s.subRepo.ValidateAndIncrementSubscription(ctx, providerUserID, "PROVIDER")
			if incErr != nil {
				return fmt.Errorf("provider subscription error: %w", incErr)
			}
		}
	}

	// Atomic update in PostgreSQL database
	err = s.oppRepo.AssignProviderAtomically(ctx, oppID, providerUserID)
	if err != nil {
		return err
	}

	// Create customer notification
	provider, _ := s.userRepo.GetByID(ctx, providerUserID)
	providerName := "A verified provider"
	providerPhone := ""
	if provider != nil {
		providerName = provider.FullName
		providerPhone = provider.Phone
	}

	notifMsg := fmt.Sprintf("%s (%s) has accepted your request for \"%s\"!", providerName, providerPhone, opp.Title)
	notifMeta, _ := json.Marshal(map[string]interface{}{
		"opportunity_id":   oppID,
		"provider_id":      providerUserID,
		"provider_name":    providerName,
		"provider_phone":   providerPhone,
		"type":             "ORDER_ACCEPTED",
	})

	_, _ = s.userRepo.CreateNotification(ctx, &domain.Notification{
		UserID:   opp.UserID,
		Title:    "Provider Accepted Your Order!",
		Message:  notifMsg,
		Type:     "ORDER_ACCEPTED",
		Metadata: notifMeta,
	})

	return nil
}

func (s *OpportunityService) GetMatchingRequestsForProvider(ctx context.Context, providerID uuid.UUID) ([]*domain.Opportunity, error) {
	return s.oppRepo.GetMatchingRequestsForProvider(ctx, providerID)
}

func (s *OpportunityService) GetAcceptedOrdersForProvider(ctx context.Context, providerID uuid.UUID) ([]*domain.Opportunity, error) {
	return s.oppRepo.GetAcceptedOrdersForProvider(ctx, providerID)
}

func (s *OpportunityService) GetUserOpportunities(ctx context.Context, userID uuid.UUID) ([]*domain.Opportunity, error) {
	return s.oppRepo.GetUserOpportunities(ctx, userID)
}

func (s *OpportunityService) GetUserNotifications(ctx context.Context, userID uuid.UUID) ([]*domain.Notification, error) {
	return s.userRepo.GetUserNotifications(ctx, userID)
}

func (s *OpportunityService) MarkNotificationAsRead(ctx context.Context, notifID, userID uuid.UUID) error {
	return s.userRepo.MarkNotificationAsRead(ctx, notifID, userID)
}

func (s *OpportunityService) MarkAllNotificationsAsRead(ctx context.Context, userID uuid.UUID) error {
	return s.userRepo.MarkAllNotificationsAsRead(ctx, userID)
}

func (s *OpportunityService) GetUnreadNotificationCount(ctx context.Context, userID uuid.UUID) (int, error) {
	return s.userRepo.GetUnreadNotificationCount(ctx, userID)
}

func (s *OpportunityService) FindCommuterRouteMatches(ctx context.Context, needID uuid.UUID) ([]*domain.CommuteMatchResult, error) {
	return s.oppRepo.FindCommuterRouteMatches(ctx, needID, 25000.0)
}

func (s *OpportunityService) GetStatusHistory(ctx context.Context, id uuid.UUID) ([]*domain.OpportunityStatusHistory, error) {
	return s.oppRepo.GetStatusHistory(ctx, id)
}
