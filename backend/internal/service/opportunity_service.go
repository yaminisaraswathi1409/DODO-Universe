package service

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/uop/backend/internal/domain"
	"github.com/uop/backend/internal/plugin"
	"github.com/uop/backend/internal/repository/postgres"
	"github.com/uop/backend/internal/spatial"
)

type subRepoInterface interface {
	GetUserActiveSubscription(ctx context.Context, userID uuid.UUID) (any, error)
	ValidateAndIncrementSubscription(ctx context.Context, userID uuid.UUID, role string) (any, error)
}

type catalogRepoInterface interface {
	GetCatalogItemByID(ctx context.Context, id uuid.UUID) (*domain.VendorCatalogItem, error)
}

type logisticsFeeCalculator interface {
	CalculateDeliveryFee(ctx context.Context, req *domain.DeliveryCalculationRequest) (*domain.DeliveryCalculationResult, error)
	HoldCatalogEscrow(ctx context.Context, oppID, payerID, payeeID uuid.UUID, amount float64, escrowType string) error
	SpawnTransportCascade(ctx context.Context, rootOppID uuid.UUID, parentUserID uuid.UUID, lat, lng float64) (*domain.Opportunity, error)
	SpawnUnloadingCascade(ctx context.Context, rootOppID uuid.UUID, parentUserID uuid.UUID, lat, lng float64) (*domain.Opportunity, error)
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

	// Auto-resolve category ID from metadata if opp.CategoryID is nil
	if opp.CategoryID == nil && len(opp.Metadata) > 0 {
		var m map[string]interface{}
		if json.Unmarshal(opp.Metadata, &m) == nil {
			if slug, ok := m["category_slug"].(string); ok && slug != "" {
				if cat, err := s.oppRepo.GetCategoryBySlugOrName(ctx, slug); err == nil && cat != nil {
					opp.CategoryID = &cat.ID
				}
			} else if name, ok := m["category_name"].(string); ok && name != "" {
				if cat, err := s.oppRepo.GetCategoryBySlugOrName(ctx, name); err == nil && cat != nil {
					opp.CategoryID = &cat.ID
				}
			} else if cidStr, ok := m["category_id"].(string); ok && cidStr != "" {
				if cid, err := uuid.Parse(cidStr); err == nil {
					opp.CategoryID = &cid
				} else if cat, err := s.oppRepo.GetCategoryBySlugOrName(ctx, cidStr); err == nil && cat != nil {
					opp.CategoryID = &cat.ID
				}
			}
		}
	}

	// Dynamic Category Validation based on DB Category configuration
	if opp.CategoryID != nil {
		cat, catErr := s.oppRepo.GetCategoryByID(ctx, *opp.CategoryID)
		if catErr == nil && cat != nil {
			opp.Category = cat
			var meta map[string]interface{}
			if len(opp.Metadata) > 0 {
				_ = json.Unmarshal(opp.Metadata, &meta)
			}
			if meta == nil {
				meta = make(map[string]interface{})
			}
			if opp.Quantity == nil || *opp.Quantity <= 0 {
				if qVal, exists := meta["quantity"]; exists && qVal != nil {
					switch v := qVal.(type) {
					case float64:
						opp.Quantity = &v
					case int:
						f := float64(v)
						opp.Quantity = &f
					case string:
						if f, err := strconv.ParseFloat(v, 64); err == nil && f > 0 {
							opp.Quantity = &f
						}
					}
				} else if qbVal, exists := meta["quantity_needed"]; exists && qbVal != nil {
					switch v := qbVal.(type) {
					case float64:
						opp.Quantity = &v
					case int:
						f := float64(v)
						opp.Quantity = &f
					case string:
						if f, err := strconv.ParseFloat(v, 64); err == nil && f > 0 {
							opp.Quantity = &f
						}
					}
				} else if cf, ok := meta["custom_fields"].(map[string]interface{}); ok && cf != nil {
					if cfQ, exists := cf["quantity"]; exists && cfQ != nil {
						switch v := cfQ.(type) {
						case float64:
							opp.Quantity = &v
						case int:
							f := float64(v)
							opp.Quantity = &f
						case string:
							if f, err := strconv.ParseFloat(v, 64); err == nil && f > 0 {
								opp.Quantity = &f
							}
						}
					}
				}
			}

			if opp.Quantity != nil && *opp.Quantity > 0 {
				meta["quantity"] = *opp.Quantity
				meta["quantity_needed"] = *opp.Quantity
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

						if !hasVal {
							if cf, ok := meta["custom_fields"].(map[string]interface{}); ok && cf != nil {
								if cfVal, cfExists := cf[f.Key]; cfExists && cfVal != nil && fmt.Sprintf("%v", cfVal) != "" {
									meta[f.Key] = cfVal
									hasVal = true
								}
							}
						}

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
						if vOpt == "" && res.Name != "" {
							vOpt, _ = meta[strings.ToLower(strings.ReplaceAll(res.Name, " ", "_")) + "_option"].(string)
						}
						if vOpt == "" {
							if resMap, ok := meta["resource_selections"].(map[string]interface{}); ok {
								if rSel, exists := resMap[res.Key].(map[string]interface{}); exists {
									if ch, _ := rSel["choice"].(string); ch != "" {
										vOpt = ch
									}
								}
								if vOpt == "" && res.Name != "" {
									if rSel, exists := resMap[strings.ToLower(strings.ReplaceAll(res.Name, " ", "_"))].(map[string]interface{}); exists {
										if ch, _ := rSel["choice"].(string); ch != "" {
											vOpt = ch
										}
									}
								}
							}
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

	if opp.OrderMode == domain.OrderModeCatalog || opp.OrderMode == "CATALOG" || opp.CatalogItemID != nil {
		opp.OrderMode = domain.OrderModeCatalog
		opp.Status = domain.StatusOrderPlaced
		if opp.TargetVendorID != nil {
			opp.AssignedUserID = opp.TargetVendorID
			if s.userRepo != nil && *opp.TargetVendorID != uuid.Nil {
				tv, vErr := s.userRepo.GetByID(ctx, *opp.TargetVendorID)
				if vErr == nil && tv != nil && (tv.IsSuspended || tv.Status == domain.StatusSuspended) {
					return nil, fmt.Errorf("vendor '%s' is currently suspended and cannot accept new orders", tv.FullName)
				}
			}
		}

		// Enforce Backend Minimum Order Quantity (MOQ) and Offering Eligibility rule for Catalog Purchases
		if s.catalogRepo != nil && opp.CatalogItemID != nil && *opp.CatalogItemID != uuid.Nil {
			item, cErr := s.catalogRepo.GetCatalogItemByID(ctx, *opp.CatalogItemID)
			if cErr == nil && item != nil {
				if s.userRepo != nil && item.VendorUserID != uuid.Nil {
					iv, ivErr := s.userRepo.GetByID(ctx, item.VendorUserID)
					if ivErr == nil && iv != nil && (iv.IsSuspended || iv.Status == domain.StatusSuspended) {
						return nil, fmt.Errorf("vendor '%s' is currently suspended and cannot accept new orders", iv.FullName)
					}
				}
				// Prevent purchasing grouping nodes
				if item.NodeType == "GROUPING" {
					return nil, fmt.Errorf("cannot purchase a grouping catalog node. Grouping nodes are for organization only.")
				}
				// Prevent purchasing unapproved offerings
				if item.Status != "" && item.Status != "ACTIVE_IN_CATALOG" && item.Status != "APPROVED" {
					return nil, fmt.Errorf("cannot place catalog order: item is currently %s and not approved for purchase.", item.Status)
				}
				// Prevent quotation-only items from instant checkout
				if item.PriceType == "QUOTATION" && opp.WorkflowModel == domain.WorkflowInstant {
					return nil, fmt.Errorf("quotation-only offerings cannot be checked out via instant checkout. Please request a quote.")
				}
				// MOQ enforcement
				if item.MinOrderQuantity > 1 {
					reqQty := 1.0
					if opp.Quantity != nil && *opp.Quantity > 0 {
						reqQty = *opp.Quantity
					}
					if reqQty < float64(item.MinOrderQuantity) {
						return nil, fmt.Errorf("cannot place catalog order: requested quantity (%.0f) is below vendor's minimum order quantity (%d). Please use 'Request What You Need' for custom quantities.", reqQty, item.MinOrderQuantity)
					}
				}
			}
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
			if calcErr != nil {
				fmt.Printf("[DEBUG CreateOpportunity] CalculateDeliveryFee Error: %v\n", calcErr)
			} else if calcRes != nil {
				fmt.Printf("[DEBUG CreateOpportunity] CalculateDeliveryFee Success! UnitPrice: ₹%.2f, FinalPayable: ₹%.2f\n", calcRes.UnitPrice, calcRes.FinalPayable)
			}
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

	if created.OrderMode == domain.OrderModeCatalog && s.logisticsRepo != nil {
		payeeID := uuid.Nil
		if created.TargetVendorID != nil {
			payeeID = *created.TargetVendorID
		}
		amt := 0.0
		if created.TotalPrice != nil {
			amt = *created.TotalPrice
		}
		if amt > 0 {
			_ = s.logisticsRepo.HoldCatalogEscrow(ctx, created.ID, created.UserID, payeeID, amt, "BRICK_PURCHASE")
		}
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

		if len(rawGroups) > 1 {
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
					ScheduledStart:      created.ScheduledStart,
					ScheduledEnd:        created.ScheduledEnd,
					PriceUnit:           created.PriceUnit,
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
		matchedCount := 0
		for _, p := range providers {
			if p.ID == created.UserID {
				continue
			}
			matchedCount++

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
			} else if created.Quantity != nil && *created.Quantity > 0 {
				quantityStr = fmt.Sprintf("%v units", *created.Quantity)
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

		// Update opportunity metadata with distribution status and eligible count
		var finalMeta map[string]interface{}
		if len(created.Metadata) > 0 {
			_ = json.Unmarshal(created.Metadata, &finalMeta)
		}
		if finalMeta == nil {
			finalMeta = make(map[string]interface{})
		}
		finalMeta["eligible_vendor_count"] = matchedCount
		if matchedCount > 0 {
			finalMeta["distribution_status"] = "DISTRIBUTED"
		} else {
			finalMeta["distribution_status"] = "PENDING_VENDORS"
		}
		finalMetaBytes, _ := json.Marshal(finalMeta)
		created.Metadata = finalMetaBytes
		_ = s.oppRepo.UpdateMetadata(ctx, created.ID, finalMetaBytes)

		// Accurate customer notification based on whether eligible vendors were reached
		if created.UserID != uuid.Nil {
			var custMsg string
			if matchedCount > 0 {
				custMsg = fmt.Sprintf("Your request \"%s\" has been sent to %d eligible vendor(s) in your area.", created.Title, matchedCount)
			} else {
				custMsg = fmt.Sprintf("Your request \"%s\" has been saved and is awaiting eligible vendors in your area.", created.Title)
			}
			cNotifMeta, _ := json.Marshal(map[string]interface{}{
				"opportunity_id":        created.ID,
				"title":                 created.Title,
				"eligible_vendor_count": matchedCount,
				"status":                string(created.Status),
				"type":                  "REQUEST_DISTRIBUTED",
			})
			_, _ = s.userRepo.CreateNotification(ctx, &domain.Notification{
				UserID:   created.UserID,
				Title:    "Request Update",
				Message:  custMsg,
				Type:     "REQUEST_DISTRIBUTED",
				Metadata: cNotifMeta,
			})
		}
	}

	// Trigger Traveller Commuter Route Matching & Notifications if eligible
	if created.Type == domain.TypeNeed && s.oppRepo != nil {
		_, _ = s.ProcessCommuterDeliveryMatches(ctx, created.ID)
	}

	return created, nil
}

// IsEligibleForCommuterDelivery checks whether an opportunity qualifies for traveller / commuter delivery matching.
// Heavy freight / construction material categories (Scenario 1) and invalid types are strictly excluded.
func (s *OpportunityService) IsEligibleForCommuterDelivery(opp *domain.Opportunity) (bool, string) {
	if opp == nil {
		return false, "opportunity is nil"
	}
	if opp.Type != domain.TypeNeed {
		return false, "only customer Need requests qualify for commuter delivery"
	}
	if opp.AssignedUserID != nil {
		return false, "opportunity is already assigned to a provider"
	}

	validStatuses := map[domain.OpportunityStatus]bool{
		domain.StatusOpen:            true,
		domain.StatusOpenNeed:        true,
		domain.StatusPendingMatching: true,
		"ORDER_PLACED":               true,
	}
	if !validStatuses[opp.Status] {
		return false, fmt.Sprintf("ineligible status: %s", opp.Status)
	}

	// Scenario 1 Commercial / Heavy Construction Exclusions
	var catSlug, catName string
	if opp.Category != nil {
		catSlug = strings.ToLower(opp.Category.Slug)
		catName = strings.ToLower(opp.Category.Name)
	}

	ineligibleSlugs := map[string]bool{
		"bricks-building-materials": true,
		"cement-construction":      true,
		"flatbed-transport":         true,
		"equipment-machinery":       true,
		"commercial-driver":         true,
		"roadside-repair":           true,
		"auto-parts-procurement":    true,
	}
	if ineligibleSlugs[catSlug] {
		return false, fmt.Sprintf("category %s is dedicated to commercial freight / logistics cascade", catSlug)
	}

	// Metadata flags
	var meta map[string]interface{}
	if len(opp.Metadata) > 0 {
		_ = json.Unmarshal(opp.Metadata, &meta)
	}
	if meta != nil {
		if isBulk, ok := meta["is_heavy_freight"].(bool); ok && isBulk {
			return false, "request is flagged as heavy freight"
		}
		if isCommuterReq, ok := meta["is_commuter_delivery"].(bool); ok && isCommuterReq {
			return true, "explicitly flagged for commuter delivery"
		}
		if catSlugMeta, ok := meta["category_slug"].(string); ok && ineligibleSlugs[strings.ToLower(catSlugMeta)] {
			return false, fmt.Sprintf("category_slug %s is heavy commercial freight", catSlugMeta)
		}
	}

	// Explicit delivery order modes / workflows
	if opp.OrderMode == domain.OrderModeJourney || opp.OrderMode == "DELIVERY" || opp.OrderMode == "COURIER" {
		return true, "matching delivery order mode"
	}
	if opp.WorkflowModel == "PHARMACY_PICKUP" || opp.WorkflowModel == "PRESCRIPTION_VERIFICATION" || opp.WorkflowModel == "DELIVERY" {
		return true, "matching delivery workflow model"
	}

	// Categories eligible for traveller delivery: Medicine, Healthcare, Groceries, Daily Essentials, Parcel Transport
	if strings.Contains(catSlug, "medicine") || strings.Contains(catName, "medicine") ||
		strings.Contains(catSlug, "pharmacy") || strings.Contains(catName, "pharmacy") ||
		strings.Contains(catSlug, "healthcare") || strings.Contains(catName, "healthcare") ||
		strings.Contains(catSlug, "grocery") || strings.Contains(catName, "grocery") ||
		strings.Contains(catSlug, "food") || strings.Contains(catName, "food") ||
		strings.Contains(catSlug, "essential") || strings.Contains(catName, "essential") ||
		strings.Contains(catSlug, "courier") || strings.Contains(catName, "courier") {
		return true, "eligible delivery category"
	}

	// Title / description keywords for delivery requests (e.g. "Medicine Delivery", "Urgent Grocery Pickup")
	titleLower := strings.ToLower(opp.Title)
	if strings.Contains(titleLower, "medicine") || strings.Contains(titleLower, "pharmacy") ||
		strings.Contains(titleLower, "grocery") || strings.Contains(titleLower, "groceries") ||
		strings.Contains(titleLower, "parcel") || strings.Contains(titleLower, "delivery") {
		return true, "delivery title keywords"
	}

	return false, "request does not match traveller delivery criteria"
}

// HasResolvedPickupLocation checks if an opportunity has distinct, valid pickup coordinates.
// If a custom delivery request has no resolved pickup coordinates or shop, it returns false.
func (s *OpportunityService) HasResolvedPickupLocation(ctx context.Context, opp *domain.Opportunity) (bool, spatial.Coordinates, string) {
	if opp == nil {
		return false, spatial.Coordinates{}, "opportunity is nil"
	}

	var meta map[string]interface{}
	if len(opp.Metadata) > 0 {
		_ = json.Unmarshal(opp.Metadata, &meta)
	}

	var pLat, pLng float64
	if meta != nil {
		if plat, ok := meta["pickup_lat"].(float64); ok && plat != 0 {
			pLat = plat
		}
		if plng, ok := meta["pickup_lng"].(float64); ok && plng != 0 {
			pLng = plng
		}
	}

	// If catalog item is linked, pickup can be resolved by repository from vendor_catalog_items
	if (pLat == 0 || pLng == 0) && opp.CatalogItemID != nil && *opp.CatalogItemID != uuid.Nil {
		return true, spatial.Coordinates{Lat: opp.Lat, Lng: opp.Lng}, "catalog item linked"
	}

	// If explicit pickup coordinates are present and valid
	if pLat != 0 && pLng != 0 && pLat >= -90 && pLat <= 90 && pLng >= -180 && pLng <= 180 {
		return true, spatial.Coordinates{Lat: pLat, Lng: pLng}, "valid pickup coordinates"
	}

	// If pickup location string is specified and distinct from customer delivery address
	if meta != nil {
		pickupLoc, _ := meta["pickup_location"].(string)
		if pickupLoc == "" {
			pickupLoc, _ = meta["source_location"].(string)
		}
		deliveryLoc, _ := meta["delivery_location"].(string)
		if deliveryLoc == "" {
			deliveryLoc, _ = meta["delivery_address"].(string)
		}
		if pickupLoc != "" && deliveryLoc != "" && !strings.EqualFold(pickupLoc, deliveryLoc) && opp.Lat != 0 && opp.Lng != 0 {
			return true, spatial.Coordinates{Lat: opp.Lat, Lng: opp.Lng}, "distinct pickup location"
		}
	}

	return false, spatial.Coordinates{}, "pickup location or shop has not been selected yet"
}

// ProcessCommuterDeliveryMatches finds candidate commuter journeys for an eligible delivery request,
// saves the matches to opportunity_matches, and sends deduplicated notifications to eligible travellers.
func (s *OpportunityService) ProcessCommuterDeliveryMatches(ctx context.Context, needID uuid.UUID) ([]*domain.CommuteMatchResult, error) {
	if s.oppRepo == nil {
		return nil, nil
	}

	opp, err := s.oppRepo.GetByID(ctx, needID)
	if err != nil || opp == nil {
		return nil, fmt.Errorf("need opportunity not found: %w", err)
	}

	// 1. Eligibility check
	isEligible, _ := s.IsEligibleForCommuterDelivery(opp)
	if !isEligible {
		return nil, nil
	}

	// 2. Check if pickup location is resolved
	hasPickup, _, pickupReason := s.HasResolvedPickupLocation(ctx, opp)
	if !hasPickup {
		// Do not pretend a shop has been selected; record status in metadata
		var meta map[string]interface{}
		if len(opp.Metadata) > 0 {
			_ = json.Unmarshal(opp.Metadata, &meta)
		}
		if meta == nil {
			meta = make(map[string]interface{})
		}
		meta["pickup_resolved"] = false
		meta["matching_pending_reason"] = pickupReason
		if metaBytes, err := json.Marshal(meta); err == nil {
			_ = s.oppRepo.UpdateMetadata(ctx, opp.ID, metaBytes)
		}
		return nil, nil
	}

	// 3. Find candidate commuter route matches using Phase B matching engine
	matches, err := s.oppRepo.FindCommuterRouteMatches(ctx, needID, 25000.0)
	if err != nil {
		return nil, fmt.Errorf("failed to find commuter matches: %w", err)
	}

	if len(matches) == 0 {
		return matches, nil
	}

	// 4. For each candidate match, save match record and dispatch deduplicated notification
	for _, m := range matches {
		if m.ProviderID == opp.UserID {
			continue // Exclude customer
		}

		// Save match record in opportunity_matches
		notes := fmt.Sprintf("Detour: %.1f km (%d min) via %s", m.TotalDetourMeters/1000.0, m.EstimatedDetourMin, m.TravelMode)
		quoteAmount := float64(m.EstimatedPayoutCents) / 100.0
		_ = s.oppRepo.SaveOpportunityMatchWithDetails(ctx, m.NeedID, m.ProviderID, "NOTIFIED", m.TotalDetourMeters, quoteAmount, notes)

		if s.userRepo != nil {
			// Format sanitized, privacy-safe notification
			// Do NOT expose prescription contents, private house numbers, phone numbers
			cleanPickup := m.PickupAddress
			if cleanPickup == "" {
				cleanPickup = "Designated Pickup Point"
			}
			cleanDrop := m.DeliveryAddress
			if cleanDrop == "" {
				cleanDrop = "Destination Area"
			}

			notifMsg := fmt.Sprintf("Delivery opportunity along your route (%s to %s). Approx detour: %.1f km (%d min). Proposed compensation: %s.",
				m.OriginAddress, m.DestinationAddress, m.TotalDetourMeters/1000.0, m.EstimatedDetourMin, m.FormattedPayout)

			dedupeKey := fmt.Sprintf("commute_match_%s_%s", m.NeedID, m.ProviderID)

			notifMeta, _ := json.Marshal(map[string]interface{}{
				"opportunity_id":  m.NeedID,
				"journey_id":      m.OfferID,
				"type":            "COMMUTE_DELIVERY_OFFER",
				"offer_title":     m.OfferTitle,
				"detour_km":       math.Round((m.TotalDetourMeters/1000.0)*10) / 10,
				"detour_min":      m.EstimatedDetourMin,
				"payout":          m.FormattedPayout,
				"travel_mode":     m.TravelMode,
				"pickup_area":     cleanPickup,
				"delivery_area":   cleanDrop,
				"dedupe_key":      dedupeKey,
				"action_required": "OPTIONAL_ACCEPT",
			})

			_, _, _ = s.userRepo.CreateNotificationIdempotent(ctx, &domain.Notification{
				UserID:   m.ProviderID,
				Title:    "Delivery Opportunity Along Your Route",
				Message:  notifMsg,
				Type:     "COMMUTE_DELIVERY_OFFER",
				Metadata: notifMeta,
			}, dedupeKey)
		}
	}

	return matches, nil
}

func (s *OpportunityService) GetOpportunity(ctx context.Context, id uuid.UUID) (*domain.Opportunity, error) {
	return s.oppRepo.GetByID(ctx, id)
}

func (s *OpportunityService) GetCategoryBySlugOrName(ctx context.Context, identifier string) (*domain.Category, error) {
	return s.oppRepo.GetCategoryBySlugOrName(ctx, identifier)
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
	case domain.StatusCancelled:
		title = "Order Cancelled"
		msg = fmt.Sprintf("Your order \"%s\" has been cancelled.", opp.Title)
	case domain.StatusRejected:
		title = "Order Declined"
		msg = fmt.Sprintf("Your order \"%s\" was declined by the provider.", opp.Title)
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

	// Vendor suspension check
	if s.userRepo != nil && providerUserID != uuid.Nil {
		prov, pErr := s.userRepo.GetByID(ctx, providerUserID)
		if pErr == nil && prov != nil && (prov.IsSuspended || prov.Status == domain.StatusSuspended) {
			return fmt.Errorf("vendor account is currently suspended and cannot accept orders")
		}
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

	if s.logisticsRepo != nil && len(opp.Metadata) > 0 {
		var meta map[string]interface{}
		if json.Unmarshal(opp.Metadata, &meta) == nil {
			if hasTrans, ok := meta["has_transport"].(bool); ok && hasTrans {
				_, _ = s.logisticsRepo.SpawnTransportCascade(ctx, oppID, providerUserID, opp.Lat, opp.Lng)
			}
			if hasUnload, ok := meta["has_unloading"].(bool); ok && hasUnload {
				_, _ = s.logisticsRepo.SpawnUnloadingCascade(ctx, oppID, providerUserID, opp.Lat, opp.Lng)
			}
		}
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

type ConfirmResourcesParams struct {
	OpportunityID   uuid.UUID
	CallerIdent     string
	Vehicle         map[string]interface{}
	Driver          map[string]interface{}
	ResourceKey     string
	ResourceDetails map[string]interface{}
	Resources       map[string]interface{}
}

func (s *OpportunityService) ConfirmResources(ctx context.Context, params ConfirmResourcesParams) (*domain.Opportunity, error) {
	opp, err := s.oppRepo.GetByID(ctx, params.OpportunityID)
	if err != nil || opp == nil {
		return nil, fmt.Errorf("opportunity not found: %w", err)
	}

	fmt.Printf("[DEBUG ConfirmResources] oppID: %s, callerIdent: %s\n", opp.ID, params.CallerIdent)

	if params.CallerIdent != "" {
		var callerUser *domain.User
		if cUID, parseErr := uuid.Parse(params.CallerIdent); parseErr == nil {
			callerUser, _ = s.userRepo.GetByID(ctx, cUID)
		} else {
			callerUser, _ = s.userRepo.GetByPhone(ctx, params.CallerIdent)
		}
		if callerUser == nil {
			callerUser, _ = s.userRepo.GetBySupabaseUID(ctx, params.CallerIdent)
		}

		if callerUser == nil {
			return nil, fmt.Errorf("unauthorized: caller %s not found or unrecognized", params.CallerIdent)
		}

		isAuthorized := false
		if callerUser.Role == domain.RoleAdmin || callerUser.Role == domain.RoleSuperAdmin {
			isAuthorized = true
		} else if opp.AssignedUserID != nil && *opp.AssignedUserID == callerUser.ID {
			isAuthorized = true
		} else if opp.TargetVendorID != nil && *opp.TargetVendorID == callerUser.ID {
			isAuthorized = true
		} else if opp.UserID == callerUser.ID {
			isAuthorized = true
		}

		if !isAuthorized {
			return nil, fmt.Errorf("unauthorized: user %s is not permitted to edit resource arrangements for order %s", callerUser.ID, opp.ID)
		}
	} else {
		return nil, fmt.Errorf("unauthorized: caller identification required")
	}

	var meta map[string]interface{}
	if len(opp.Metadata) > 0 {
		_ = json.Unmarshal(opp.Metadata, &meta)
	}
	if meta == nil {
		meta = make(map[string]interface{})
	}

	vendorResDetails, _ := meta["vendor_resource_details"].(map[string]interface{})
	if vendorResDetails == nil {
		vendorResDetails = make(map[string]interface{})
	}

	resSelections, _ := meta["resource_selections"].(map[string]interface{})
	if resSelections == nil {
		resSelections = make(map[string]interface{})
	}

	updatedLabels := []string{}

	// 1. Vehicle / Transport details
	if params.Vehicle != nil && len(params.Vehicle) > 0 {
		if rawPhone, ok := params.Vehicle["contact_number"].(string); ok && rawPhone != "" {
			norm, pErr := postgres.ValidateAndNormalizePhone(rawPhone)
			if pErr != nil {
				return nil, fmt.Errorf("invalid vehicle contact phone: %w", pErr)
			}
			params.Vehicle["contact_number"] = norm
		}

		vendorResDetails["vehicle"] = map[string]interface{}{
			"resource_key":  "vehicle",
			"resource_name": "Transportation / Vehicle",
			"status":        "ARRANGED",
			"details":       params.Vehicle,
			"updated_at":    time.Now().UTC().Format(time.RFC3339),
		}

		vSel, _ := resSelections["vehicle"].(map[string]interface{})
		if vSel == nil {
			vSel = map[string]interface{}{
				"resource_key":  "vehicle",
				"resource_name": "Transportation / Vehicle",
				"choice":        "NEED_VEHICLE",
			}
		}
		vSel["vendor_details"] = params.Vehicle
		vSel["arranged"] = true
		vSel["status"] = "ARRANGED"
		resSelections["vehicle"] = vSel

		meta["vendor_vehicle_details"] = params.Vehicle
		updatedLabels = append(updatedLabels, "vehicle/transport")
	}

	// 2. Driver details
	if params.Driver != nil && len(params.Driver) > 0 {
		if rawPhone, ok := params.Driver["driver_phone"].(string); ok && rawPhone != "" {
			norm, pErr := postgres.ValidateAndNormalizePhone(rawPhone)
			if pErr != nil {
				return nil, fmt.Errorf("invalid driver phone: %w", pErr)
			}
			params.Driver["driver_phone"] = norm
		}

		vendorResDetails["driver"] = map[string]interface{}{
			"resource_key":  "driver",
			"resource_name": "Driver",
			"status":        "ARRANGED",
			"details":       params.Driver,
			"updated_at":    time.Now().UTC().Format(time.RFC3339),
		}

		dSel, _ := resSelections["driver"].(map[string]interface{})
		if dSel == nil {
			dSel = map[string]interface{}{
				"resource_key":  "driver",
				"resource_name": "Driver",
				"choice":        "NEED_DRIVER",
			}
		}
		dSel["vendor_details"] = params.Driver
		dSel["arranged"] = true
		dSel["status"] = "ARRANGED"
		resSelections["driver"] = dSel

		meta["vendor_driver_details"] = params.Driver
		updatedLabels = append(updatedLabels, "driver")
	}

	// 3. Generic single resource detail
	if params.ResourceKey != "" && params.ResourceDetails != nil && len(params.ResourceDetails) > 0 {
		rKey := params.ResourceKey
		vendorResDetails[rKey] = map[string]interface{}{
			"resource_key": rKey,
			"status":       "ARRANGED",
			"details":      params.ResourceDetails,
			"updated_at":   time.Now().UTC().Format(time.RFC3339),
		}

		rSel, _ := resSelections[rKey].(map[string]interface{})
		if rSel == nil {
			rSel = map[string]interface{}{
				"resource_key": rKey,
				"choice":       fmt.Sprintf("NEED_%s", strings.ToUpper(rKey)),
			}
		}
		rSel["vendor_details"] = params.ResourceDetails
		rSel["arranged"] = true
		rSel["status"] = "ARRANGED"
		resSelections[rKey] = rSel

		meta["vendor_"+rKey+"_details"] = params.ResourceDetails
		updatedLabels = append(updatedLabels, rKey)
	}

	// 4. Batch resources
	if params.Resources != nil && len(params.Resources) > 0 {
		for rKey, rawDet := range params.Resources {
			if detMap, ok := rawDet.(map[string]interface{}); ok && len(detMap) > 0 {
				vendorResDetails[rKey] = map[string]interface{}{
					"resource_key": rKey,
					"status":       "ARRANGED",
					"details":      detMap,
					"updated_at":   time.Now().UTC().Format(time.RFC3339),
				}

				rSel, _ := resSelections[rKey].(map[string]interface{})
				if rSel == nil {
					rSel = map[string]interface{}{
						"resource_key": rKey,
					}
				}
				rSel["vendor_details"] = detMap
				rSel["arranged"] = true
				rSel["status"] = "ARRANGED"
				resSelections[rKey] = rSel

				meta["vendor_"+rKey+"_details"] = detMap
				updatedLabels = append(updatedLabels, rKey)
			}
		}
	}

	meta["vendor_resource_details"] = vendorResDetails
	meta["resource_selections"] = resSelections

	newMetaBytes, err := json.Marshal(meta)
	if err != nil {
		return nil, fmt.Errorf("failed to encode metadata: %w", err)
	}

	if err := s.oppRepo.UpdateMetadata(ctx, opp.ID, newMetaBytes); err != nil {
		return nil, fmt.Errorf("failed to persist updated resource details: %w", err)
	}
	opp.Metadata = newMetaBytes

	// Dispatch notification to customer
	if len(updatedLabels) > 0 {
		labelStr := strings.Join(updatedLabels, " & ")
		notif := &domain.Notification{
			UserID:   opp.UserID,
			Title:    fmt.Sprintf("Resource Arranged (Order #%s)", opp.ID.String()[:8]),
			Message:  fmt.Sprintf("Your provider has confirmed %s arrangement details for your order: %s", labelStr, opp.Title),
			Type:     "ORDER_UPDATE",
			Metadata: json.RawMessage(fmt.Sprintf(`{"opportunity_id":"%s"}`, opp.ID.String())),
		}
		_, _ = s.userRepo.CreateNotification(ctx, notif)
	}

	return opp, nil
}

// -----------------------------------------------------------------------------
// JOURNEY SERVICE METHODS (Phase A)
// -----------------------------------------------------------------------------

// RegisterJourney validates and registers a new travel route for an ordinary user
func (s *OpportunityService) RegisterJourney(ctx context.Context, userID uuid.UUID, req *domain.RegisterJourneyRequest) (*domain.UserJourney, error) {
	if userID == uuid.Nil {
		return nil, fmt.Errorf("user ID is required")
	}

	// 1. Validate addresses
	originAddr := strings.TrimSpace(req.OriginAddress)
	if originAddr == "" {
		return nil, fmt.Errorf("origin address is required")
	}
	destAddr := strings.TrimSpace(req.DestinationAddress)
	if destAddr == "" {
		return nil, fmt.Errorf("destination address is required")
	}

	// 2. Validate coordinates
	if req.OriginLat < -90.0 || req.OriginLat > 90.0 || req.OriginLng < -180.0 || req.OriginLng > 180.0 {
		return nil, fmt.Errorf("invalid origin coordinates")
	}
	if req.DestinationLat < -90.0 || req.DestinationLat > 90.0 || req.DestinationLng < -180.0 || req.DestinationLng > 180.0 {
		return nil, fmt.Errorf("invalid destination coordinates")
	}

	// 3. Normalize travel mode
	travelMode := strings.ToUpper(strings.TrimSpace(req.TravelMode))
	if travelMode == "" {
		travelMode = "BIKE"
	}

	// 4. Validate and normalize recurrence
	journeyType := strings.ToUpper(strings.TrimSpace(req.JourneyType))
	if journeyType != "RECURRING" {
		journeyType = "ONE_TIME"
	}

	travelFreq := strings.ToUpper(strings.TrimSpace(req.TravelFrequency))
	if travelFreq == "" {
		if journeyType == "RECURRING" {
			travelFreq = "DAILY"
		} else {
			travelFreq = "ONE_TIME"
		}
	}

	days := req.AvailableDays
	if journeyType == "RECURRING" && len(days) == 0 {
		switch travelFreq {
		case "WEEKDAYS":
			days = []string{"MON", "TUE", "WED", "THU", "FRI"}
		case "WEEKENDS":
			days = []string{"SAT", "SUN"}
		default: // DAILY
			days = []string{"MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"}
		}
	}

	// 5. Detour limits validation
	maxDetourKM := req.MaxDetourKM
	if maxDetourKM <= 0 {
		maxDetourKM = 3.0 // default 3 km
	} else if maxDetourKM > 50.0 {
		return nil, fmt.Errorf("maximum acceptable detour cannot exceed 50 km")
	}

	maxDetourMin := req.MaxDetourMinutes
	if maxDetourMin <= 0 {
		maxDetourMin = 15 // default 15 min
	} else if maxDetourMin > 180 {
		return nil, fmt.Errorf("maximum acceptable detour time cannot exceed 180 minutes")
	}

	// 6. Construct Opportunity metadata
	metaMap := map[string]interface{}{
		"is_journey":             true,
		"is_active":              true,
		"origin_address":         originAddr,
		"origin_lat":             req.OriginLat,
		"origin_lng":             req.OriginLng,
		"destination_address":    destAddr,
		"destination":            destAddr,
		"destination_lat":        req.DestinationLat,
		"destination_lng":        req.DestinationLng,
		"travel_mode":            travelMode,
		"journey_type":           journeyType,
		"travel_frequency":       travelFreq,
		"available_days":         days,
		"departure_window_start": strings.TrimSpace(req.DepartureWindowStart),
		"departure_window_end":   strings.TrimSpace(req.DepartureWindowEnd),
		"arrival_window_start":   strings.TrimSpace(req.ArrivalWindowStart),
		"arrival_window_end":     strings.TrimSpace(req.ArrivalWindowEnd),
		"max_detour_km":          maxDetourKM,
		"max_detour_minutes":     maxDetourMin,
	}
	metaBytes, err := json.Marshal(metaMap)
	if err != nil {
		return nil, fmt.Errorf("failed to encode journey metadata: %w", err)
	}

	// 7. Title & Description
	title := fmt.Sprintf("Journey: %s → %s", originAddr, destAddr)
	desc := fmt.Sprintf("%s travel via %s (Max Detour: %.1f km)", travelFreq, travelMode, maxDetourKM)

	wf := domain.WorkflowInstant
	if journeyType == "RECURRING" {
		wf = domain.WorkflowScheduled
	}

	opp := &domain.Opportunity{
		UserID:        userID,
		Type:          domain.TypeOffer,
		OrderMode:     domain.OrderModeJourney,
		Title:         title,
		Description:   desc,
		WorkflowModel: wf,
		Status:        domain.StatusOpen,
		Lat:           req.OriginLat,
		Lng:           req.OriginLng,
		AddressText:   originAddr,
		RadiusKM:      maxDetourKM,
		Metadata:      metaBytes,
	}

	createdOpp, err := s.oppRepo.Create(ctx, opp)
	if err != nil {
		return nil, fmt.Errorf("failed to save journey: %w", err)
	}

	// 8. Return mapped UserJourney
	return &domain.UserJourney{
		ID:                   createdOpp.ID,
		UserID:               userID,
		Title:                createdOpp.Title,
		Description:          createdOpp.Description,
		Status:               string(createdOpp.Status),
		OriginAddress:        originAddr,
		OriginLat:            req.OriginLat,
		OriginLng:            req.OriginLng,
		DestinationAddress:   destAddr,
		DestinationLat:       req.DestinationLat,
		DestinationLng:       req.DestinationLng,
		TravelMode:           travelMode,
		JourneyType:          journeyType,
		TravelFrequency:      travelFreq,
		AvailableDays:        days,
		DepartureWindowStart: strings.TrimSpace(req.DepartureWindowStart),
		DepartureWindowEnd:   strings.TrimSpace(req.DepartureWindowEnd),
		ArrivalWindowStart:   strings.TrimSpace(req.ArrivalWindowStart),
		ArrivalWindowEnd:     strings.TrimSpace(req.ArrivalWindowEnd),
		MaxDetourKM:          maxDetourKM,
		MaxDetourMinutes:     maxDetourMin,
		IsActive:             true,
		CreatedAt:            createdOpp.CreatedAt,
		UpdatedAt:            createdOpp.UpdatedAt,
	}, nil
}

// ListUserJourneys returns all active or paused journeys for the specified user
func (s *OpportunityService) ListUserJourneys(ctx context.Context, userID uuid.UUID) ([]*domain.UserJourney, error) {
	if userID == uuid.Nil {
		return nil, fmt.Errorf("user ID is required")
	}
	return s.oppRepo.GetUserJourneys(ctx, userID)
}

// GetJourney retrieves a journey with strict user ownership validation
func (s *OpportunityService) GetJourney(ctx context.Context, id, userID uuid.UUID) (*domain.UserJourney, error) {
	if id == uuid.Nil || userID == uuid.Nil {
		return nil, fmt.Errorf("journey ID and user ID are required")
	}
	return s.oppRepo.GetJourneyByID(ctx, id, userID)
}

// UpdateJourney validates and updates journey settings with ownership check
func (s *OpportunityService) UpdateJourney(ctx context.Context, id, userID uuid.UUID, req *domain.UpdateJourneyRequest) (*domain.UserJourney, error) {
	if id == uuid.Nil || userID == uuid.Nil {
		return nil, fmt.Errorf("journey ID and user ID are required")
	}

	existing, err := s.oppRepo.GetJourneyByID(ctx, id, userID)
	if err != nil {
		return nil, fmt.Errorf("journey not found or unauthorized: %w", err)
	}

	// Apply updates with fallback to existing values
	originAddr := existing.OriginAddress
	if req.OriginAddress != "" {
		originAddr = strings.TrimSpace(req.OriginAddress)
	}
	destAddr := existing.DestinationAddress
	if req.DestinationAddress != "" {
		destAddr = strings.TrimSpace(req.DestinationAddress)
	}

	originLat := existing.OriginLat
	originLng := existing.OriginLng
	if req.OriginLat != 0 || req.OriginLng != 0 {
		if req.OriginLat < -90.0 || req.OriginLat > 90.0 || req.OriginLng < -180.0 || req.OriginLng > 180.0 {
			return nil, fmt.Errorf("invalid origin coordinates")
		}
		originLat = req.OriginLat
		originLng = req.OriginLng
	}

	destLat := existing.DestinationLat
	destLng := existing.DestinationLng
	if req.DestinationLat != 0 || req.DestinationLng != 0 {
		if req.DestinationLat < -90.0 || req.DestinationLat > 90.0 || req.DestinationLng < -180.0 || req.DestinationLng > 180.0 {
			return nil, fmt.Errorf("invalid destination coordinates")
		}
		destLat = req.DestinationLat
		destLng = req.DestinationLng
	}

	travelMode := existing.TravelMode
	if req.TravelMode != "" {
		travelMode = strings.ToUpper(strings.TrimSpace(req.TravelMode))
	}

	journeyType := existing.JourneyType
	if req.JourneyType != "" {
		journeyType = strings.ToUpper(strings.TrimSpace(req.JourneyType))
	}

	travelFreq := existing.TravelFrequency
	if req.TravelFrequency != "" {
		travelFreq = strings.ToUpper(strings.TrimSpace(req.TravelFrequency))
	}

	days := existing.AvailableDays
	if len(req.AvailableDays) > 0 {
		days = req.AvailableDays
	}

	maxDetourKM := existing.MaxDetourKM
	if req.MaxDetourKM > 0 {
		if req.MaxDetourKM > 50.0 {
			return nil, fmt.Errorf("maximum acceptable detour cannot exceed 50 km")
		}
		maxDetourKM = req.MaxDetourKM
	}

	maxDetourMin := existing.MaxDetourMinutes
	if req.MaxDetourMinutes > 0 {
		if req.MaxDetourMinutes > 180 {
			return nil, fmt.Errorf("maximum acceptable detour time cannot exceed 180 minutes")
		}
		maxDetourMin = req.MaxDetourMinutes
	}

	depStart := existing.DepartureWindowStart
	if req.DepartureWindowStart != "" {
		depStart = strings.TrimSpace(req.DepartureWindowStart)
	}
	depEnd := existing.DepartureWindowEnd
	if req.DepartureWindowEnd != "" {
		depEnd = strings.TrimSpace(req.DepartureWindowEnd)
	}

	arrStart := existing.ArrivalWindowStart
	if req.ArrivalWindowStart != "" {
		arrStart = strings.TrimSpace(req.ArrivalWindowStart)
	}
	arrEnd := existing.ArrivalWindowEnd
	if req.ArrivalWindowEnd != "" {
		arrEnd = strings.TrimSpace(req.ArrivalWindowEnd)
	}

	metaMap := map[string]interface{}{
		"is_journey":             true,
		"is_active":              existing.IsActive,
		"origin_address":         originAddr,
		"origin_lat":             originLat,
		"origin_lng":             originLng,
		"destination_address":    destAddr,
		"destination":            destAddr,
		"destination_lat":        destLat,
		"destination_lng":        destLng,
		"travel_mode":            travelMode,
		"journey_type":           journeyType,
		"travel_frequency":       travelFreq,
		"available_days":         days,
		"departure_window_start": depStart,
		"departure_window_end":   depEnd,
		"arrival_window_start":   arrStart,
		"arrival_window_end":     arrEnd,
		"max_detour_km":          maxDetourKM,
		"max_detour_minutes":     maxDetourMin,
	}
	metaBytes, err := json.Marshal(metaMap)
	if err != nil {
		return nil, fmt.Errorf("failed to encode metadata: %w", err)
	}

	title := fmt.Sprintf("Journey: %s → %s", originAddr, destAddr)
	desc := fmt.Sprintf("%s travel via %s (Max Detour: %.1f km)", travelFreq, travelMode, maxDetourKM)

	return s.oppRepo.UpdateJourney(ctx, id, userID, title, desc, originAddr, originLat, originLng, maxDetourKM, metaBytes)
}

// SetJourneyStatus handles pause, resume, and cancellation of registered journeys
func (s *OpportunityService) SetJourneyStatus(ctx context.Context, id, userID uuid.UUID, action string) error {
	if id == uuid.Nil || userID == uuid.Nil {
		return fmt.Errorf("journey ID and user ID are required")
	}

	action = strings.ToUpper(strings.TrimSpace(action))
	var targetStatus domain.OpportunityStatus
	var isActive bool

	switch action {
	case "PAUSE":
		targetStatus = domain.StatusPaused
		isActive = false
	case "RESUME":
		targetStatus = domain.StatusOpen
		isActive = true
	case "CANCEL":
		targetStatus = domain.StatusCancelled
		isActive = false
	default:
		return fmt.Errorf("invalid action '%s': must be PAUSE, RESUME, or CANCEL", action)
	}

	return s.oppRepo.UpdateJourneyStatus(ctx, id, userID, targetStatus, isActive)
}
