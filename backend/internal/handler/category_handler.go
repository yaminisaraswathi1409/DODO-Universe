package handler

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/uop/backend/internal/repository/postgres"
	"github.com/uop/backend/pkg/response"
)

type CategoryHandler struct {
	db *postgres.DB
}

func NewCategoryHandler(db *postgres.DB) *CategoryHandler {
	return &CategoryHandler{db: db}
}

type CategoryResponse struct {
	ID                   string          `json:"id"`
	Slug                 string          `json:"slug"`
	Name                 string          `json:"name"`
	Description          string          `json:"description"`
	Icon                 string          `json:"icon"`
	DefaultWorkflow      string          `json:"default_workflow"`
	RequiredDocuments    json.RawMessage `json:"required_documents,omitempty"`
	OpportunityFields    json.RawMessage `json:"opportunity_fields,omitempty"`
	VehicleFields        json.RawMessage `json:"vehicle_fields,omitempty"`
	DriverFields         json.RawMessage `json:"driver_fields,omitempty"`
	ResourceRequirements json.RawMessage `json:"resource_requirements,omitempty"`
	Resources            json.RawMessage `json:"resources,omitempty"`
	RelatedServices      json.RawMessage `json:"related_services,omitempty"`
}

func (h *CategoryHandler) List(w http.ResponseWriter, r *http.Request) {
	query := `SELECT id, slug, name, COALESCE(description, ''), COALESCE(icon, ''), default_workflow, COALESCE(required_documents, '[]'::jsonb), COALESCE(opportunity_fields, '[]'::jsonb), COALESCE(vehicle_fields, '[]'::jsonb), COALESCE(driver_fields, '[]'::jsonb), COALESCE(resource_requirements, '{"vehicle": "OPTIONAL", "driver": "OPTIONAL"}'::jsonb), COALESCE(resources, '[]'::jsonb), COALESCE(related_services, '[]'::jsonb) FROM categories ORDER BY name ASC;`

	rows, err := h.db.Pool.Query(r.Context(), query)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to query categories", err.Error())
		return
	}
	defer rows.Close()

	var categories []CategoryResponse
	for rows.Next() {
		var c CategoryResponse
		if err := rows.Scan(&c.ID, &c.Slug, &c.Name, &c.Description, &c.Icon, &c.DefaultWorkflow, &c.RequiredDocuments, &c.OpportunityFields, &c.VehicleFields, &c.DriverFields, &c.ResourceRequirements, &c.Resources, &c.RelatedServices); err != nil {
			response.Error(w, http.StatusInternalServerError, "Failed to scan category", err.Error())
			return
		}
		categories = append(categories, c)
	}

	response.JSON(w, http.StatusOK, "Categories fetched successfully", categories)
}

type CreateCategoryPayload struct {
	Name                 string          `json:"name"`
	Slug                 string          `json:"slug"`
	Description          string          `json:"description"`
	Icon                 string          `json:"icon"`
	DefaultWorkflow      string          `json:"default_workflow"`
	RequiredDocuments    json.RawMessage `json:"required_documents"`
	OpportunityFields    json.RawMessage `json:"opportunity_fields"`
	VehicleFields        json.RawMessage `json:"vehicle_fields"`
	DriverFields         json.RawMessage `json:"driver_fields"`
	ResourceRequirements json.RawMessage `json:"resource_requirements"`
}

func (h *CategoryHandler) Create(w http.ResponseWriter, r *http.Request) {
	var p CreateCategoryPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid request payload", err.Error())
		return
	}

	if p.Name == "" {
		response.Error(w, http.StatusBadRequest, "Category name is required", nil)
		return
	}

	if p.Slug == "" {
		p.Slug = strings.ToLower(strings.ReplaceAll(p.Name, " ", "-"))
	}
	if p.DefaultWorkflow == "" {
		p.DefaultWorkflow = "INSTANT"
	}
	if len(p.RequiredDocuments) == 0 {
		p.RequiredDocuments = json.RawMessage("[]")
	}
	if len(p.OpportunityFields) == 0 {
		p.OpportunityFields = json.RawMessage("[]")
	}
	if len(p.VehicleFields) == 0 {
		p.VehicleFields = json.RawMessage("[]")
	}
	if len(p.DriverFields) == 0 {
		p.DriverFields = json.RawMessage("[]")
	}
	if len(p.ResourceRequirements) == 0 {
		p.ResourceRequirements = json.RawMessage(`{"vehicle": "OPTIONAL", "driver": "OPTIONAL"}`)
	}

	query := `
		INSERT INTO categories (slug, name, description, icon, default_workflow, required_documents, opportunity_fields, vehicle_fields, driver_fields, resource_requirements)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, icon = EXCLUDED.icon, required_documents = COALESCE(EXCLUDED.required_documents, categories.required_documents), opportunity_fields = COALESCE(EXCLUDED.opportunity_fields, categories.opportunity_fields), vehicle_fields = COALESCE(EXCLUDED.vehicle_fields, categories.vehicle_fields), driver_fields = COALESCE(EXCLUDED.driver_fields, categories.driver_fields), resource_requirements = COALESCE(EXCLUDED.resource_requirements, categories.resource_requirements)
		RETURNING id, slug, name, COALESCE(description, ''), COALESCE(icon, ''), default_workflow, COALESCE(required_documents, '[]'::jsonb), COALESCE(opportunity_fields, '[]'::jsonb), COALESCE(vehicle_fields, '[]'::jsonb), COALESCE(driver_fields, '[]'::jsonb), COALESCE(resource_requirements, '{"vehicle": "OPTIONAL", "driver": "OPTIONAL"}'::jsonb);
	`
	row := h.db.Pool.QueryRow(r.Context(), query, p.Slug, p.Name, p.Description, p.Icon, p.DefaultWorkflow, p.RequiredDocuments, p.OpportunityFields, p.VehicleFields, p.DriverFields, p.ResourceRequirements)

	var c CategoryResponse
	if err := row.Scan(&c.ID, &c.Slug, &c.Name, &c.Description, &c.Icon, &c.DefaultWorkflow, &c.RequiredDocuments, &c.OpportunityFields, &c.VehicleFields, &c.DriverFields, &c.ResourceRequirements); err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to save category", err.Error())
		return
	}

	response.JSON(w, http.StatusCreated, "Category saved successfully", c)
}

type UpdateRequirementsPayload struct {
	RequiredDocuments json.RawMessage `json:"required_documents"`
}

func (h *CategoryHandler) UpdateRequirements(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		response.Error(w, http.StatusBadRequest, "Category ID is required", nil)
		return
	}

	var p UpdateRequirementsPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid JSON payload", err.Error())
		return
	}

	query := `
		UPDATE categories
		SET required_documents = $2
		WHERE id = $1
		RETURNING id, slug, name, COALESCE(description, ''), COALESCE(icon, ''), default_workflow, COALESCE(required_documents, '[]'::jsonb), COALESCE(opportunity_fields, '[]'::jsonb), COALESCE(vehicle_fields, '[]'::jsonb), COALESCE(driver_fields, '[]'::jsonb), COALESCE(resource_requirements, '{"vehicle": "OPTIONAL", "driver": "OPTIONAL"}'::jsonb);
	`
	row := h.db.Pool.QueryRow(r.Context(), query, id, p.RequiredDocuments)

	var c CategoryResponse
	if err := row.Scan(&c.ID, &c.Slug, &c.Name, &c.Description, &c.Icon, &c.DefaultWorkflow, &c.RequiredDocuments, &c.OpportunityFields, &c.VehicleFields, &c.DriverFields, &c.ResourceRequirements); err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to update category requirements", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Category requirements updated successfully", c)
}

type UpdateOpportunityFieldsPayload struct {
	OpportunityFields json.RawMessage `json:"opportunity_fields"`
}

func (h *CategoryHandler) UpdateOpportunityFields(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		response.Error(w, http.StatusBadRequest, "Category ID is required", nil)
		return
	}

	var p UpdateOpportunityFieldsPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid JSON payload", err.Error())
		return
	}

	query := `
		UPDATE categories
		SET opportunity_fields = $2
		WHERE id = $1
		RETURNING id, slug, name, COALESCE(description, ''), COALESCE(icon, ''), default_workflow, COALESCE(required_documents, '[]'::jsonb), COALESCE(opportunity_fields, '[]'::jsonb), COALESCE(vehicle_fields, '[]'::jsonb), COALESCE(driver_fields, '[]'::jsonb), COALESCE(resource_requirements, '{"vehicle": "OPTIONAL", "driver": "OPTIONAL"}'::jsonb);
	`
	row := h.db.Pool.QueryRow(r.Context(), query, id, p.OpportunityFields)

	var c CategoryResponse
	if err := row.Scan(&c.ID, &c.Slug, &c.Name, &c.Description, &c.Icon, &c.DefaultWorkflow, &c.RequiredDocuments, &c.OpportunityFields, &c.VehicleFields, &c.DriverFields, &c.ResourceRequirements); err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to update category opportunity fields", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Category opportunity fields updated successfully", c)
}

type UpdateVehicleFieldsPayload struct {
	VehicleFields json.RawMessage `json:"vehicle_fields"`
}

func (h *CategoryHandler) UpdateVehicleFields(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		response.Error(w, http.StatusBadRequest, "Category ID is required", nil)
		return
	}

	var p UpdateVehicleFieldsPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid JSON payload", err.Error())
		return
	}

	query := `
		UPDATE categories
		SET vehicle_fields = $2
		WHERE id = $1
		RETURNING id, slug, name, COALESCE(description, ''), COALESCE(icon, ''), default_workflow, COALESCE(required_documents, '[]'::jsonb), COALESCE(opportunity_fields, '[]'::jsonb), COALESCE(vehicle_fields, '[]'::jsonb), COALESCE(driver_fields, '[]'::jsonb), COALESCE(resource_requirements, '{"vehicle": "OPTIONAL", "driver": "OPTIONAL"}'::jsonb);
	`
	row := h.db.Pool.QueryRow(r.Context(), query, id, p.VehicleFields)

	var c CategoryResponse
	if err := row.Scan(&c.ID, &c.Slug, &c.Name, &c.Description, &c.Icon, &c.DefaultWorkflow, &c.RequiredDocuments, &c.OpportunityFields, &c.VehicleFields, &c.DriverFields, &c.ResourceRequirements); err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to update category vehicle fields", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Category vehicle fields updated successfully", c)
}

type UpdateDriverFieldsPayload struct {
	DriverFields json.RawMessage `json:"driver_fields"`
}

func (h *CategoryHandler) UpdateDriverFields(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		response.Error(w, http.StatusBadRequest, "Category ID is required", nil)
		return
	}

	var p UpdateDriverFieldsPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid JSON payload", err.Error())
		return
	}

	query := `
		UPDATE categories
		SET driver_fields = $2
		WHERE id = $1
		RETURNING id, slug, name, COALESCE(description, ''), COALESCE(icon, ''), default_workflow, COALESCE(required_documents, '[]'::jsonb), COALESCE(opportunity_fields, '[]'::jsonb), COALESCE(vehicle_fields, '[]'::jsonb), COALESCE(driver_fields, '[]'::jsonb), COALESCE(resource_requirements, '{"vehicle": "OPTIONAL", "driver": "OPTIONAL"}'::jsonb);
	`
	row := h.db.Pool.QueryRow(r.Context(), query, id, p.DriverFields)

	var c CategoryResponse
	if err := row.Scan(&c.ID, &c.Slug, &c.Name, &c.Description, &c.Icon, &c.DefaultWorkflow, &c.RequiredDocuments, &c.OpportunityFields, &c.VehicleFields, &c.DriverFields, &c.ResourceRequirements); err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to update category driver fields", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Category driver fields updated successfully", c)
}

type UpdateResourceRequirementsPayload struct {
	ResourceRequirements json.RawMessage `json:"resource_requirements"`
}

func (h *CategoryHandler) UpdateResourceRequirements(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		response.Error(w, http.StatusBadRequest, "Category ID is required", nil)
		return
	}

	var p UpdateResourceRequirementsPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid JSON payload", err.Error())
		return
	}

	query := `
		UPDATE categories
		SET resource_requirements = $2
		WHERE id = $1
		RETURNING id, slug, name, COALESCE(description, ''), COALESCE(icon, ''), default_workflow, COALESCE(required_documents, '[]'::jsonb), COALESCE(opportunity_fields, '[]'::jsonb), COALESCE(vehicle_fields, '[]'::jsonb), COALESCE(driver_fields, '[]'::jsonb), COALESCE(resource_requirements, '{"vehicle": "OPTIONAL", "driver": "OPTIONAL"}'::jsonb), COALESCE(resources, '[]'::jsonb);
	`
	row := h.db.Pool.QueryRow(r.Context(), query, id, p.ResourceRequirements)

	var c CategoryResponse
	if err := row.Scan(&c.ID, &c.Slug, &c.Name, &c.Description, &c.Icon, &c.DefaultWorkflow, &c.RequiredDocuments, &c.OpportunityFields, &c.VehicleFields, &c.DriverFields, &c.ResourceRequirements, &c.Resources); err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to update category resource requirements", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Category resource requirements updated successfully", c)
}

type UpdateResourcesPayload struct {
	Resources json.RawMessage `json:"resources"`
}

func (h *CategoryHandler) UpdateResources(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		response.Error(w, http.StatusBadRequest, "Category ID is required", nil)
		return
	}

	var p UpdateResourcesPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid JSON payload", err.Error())
		return
	}

	if len(p.Resources) == 0 {
		p.Resources = json.RawMessage("[]")
	}

	query := `
		UPDATE categories
		SET resources = $2
		WHERE id = $1
		RETURNING id, slug, name, COALESCE(description, ''), COALESCE(icon, ''), default_workflow, COALESCE(required_documents, '[]'::jsonb), COALESCE(opportunity_fields, '[]'::jsonb), COALESCE(vehicle_fields, '[]'::jsonb), COALESCE(driver_fields, '[]'::jsonb), COALESCE(resource_requirements, '{"vehicle": "OPTIONAL", "driver": "OPTIONAL"}'::jsonb), COALESCE(resources, '[]'::jsonb);
	`
	row := h.db.Pool.QueryRow(r.Context(), query, id, p.Resources)

	var c CategoryResponse
	if err := row.Scan(&c.ID, &c.Slug, &c.Name, &c.Description, &c.Icon, &c.DefaultWorkflow, &c.RequiredDocuments, &c.OpportunityFields, &c.VehicleFields, &c.DriverFields, &c.ResourceRequirements, &c.Resources); err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to update category resources", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Category dynamic resources updated successfully", c)
}

type UpdateRelatedServicesPayload struct {
	RelatedServices json.RawMessage `json:"related_services"`
}

func (h *CategoryHandler) UpdateRelatedServices(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		response.Error(w, http.StatusBadRequest, "Category ID is required", nil)
		return
	}

	var p UpdateRelatedServicesPayload
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		response.Error(w, http.StatusBadRequest, "Invalid JSON payload", err.Error())
		return
	}

	if len(p.RelatedServices) == 0 {
		p.RelatedServices = json.RawMessage("[]")
	}

	query := `
		UPDATE categories
		SET related_services = $2
		WHERE id = $1
		RETURNING id, slug, name, COALESCE(description, ''), COALESCE(icon, ''), default_workflow, COALESCE(required_documents, '[]'::jsonb), COALESCE(opportunity_fields, '[]'::jsonb), COALESCE(vehicle_fields, '[]'::jsonb), COALESCE(driver_fields, '[]'::jsonb), COALESCE(resource_requirements, '{"vehicle": "OPTIONAL", "driver": "OPTIONAL"}'::jsonb), COALESCE(resources, '[]'::jsonb), COALESCE(related_services, '[]'::jsonb);
	`
	row := h.db.Pool.QueryRow(r.Context(), query, id, p.RelatedServices)

	var c CategoryResponse
	if err := row.Scan(&c.ID, &c.Slug, &c.Name, &c.Description, &c.Icon, &c.DefaultWorkflow, &c.RequiredDocuments, &c.OpportunityFields, &c.VehicleFields, &c.DriverFields, &c.ResourceRequirements, &c.Resources, &c.RelatedServices); err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to update category related services", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Category related services updated successfully", c)
}

func (h *CategoryHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		response.Error(w, http.StatusBadRequest, "Category ID is required", nil)
		return
	}

	query := `DELETE FROM categories WHERE id = $1;`
	_, err := h.db.Pool.Exec(r.Context(), query, id)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to delete category", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Category deleted successfully", map[string]string{"id": id})
}

type DistanceSlab struct {
	MinKM  float64 `json:"min_km"`
	MaxKM  float64 `json:"max_km"`
	Charge float64 `json:"charge"`
}

type ProviderOfferResponse struct {
	OfferID          string                 `json:"offer_id"`
	ProviderID       string                 `json:"provider_id"`
	ProviderName     string                 `json:"provider_name"`
	ProviderPhone    string                 `json:"provider_phone"`
	ProviderAvatar   string                 `json:"provider_avatar"`
	TrustScore       float64                `json:"trust_score"`
	CategorySlug     string                 `json:"category_slug"`
	CategoryName     string                 `json:"category_name"`
	Title            string                 `json:"title"`
	Description      string                 `json:"description"`
	OfferType        string                 `json:"offer_type"` // WITH_TRANSPORT or WITHOUT_TRANSPORT
	UnitPrice        float64                `json:"unit_price"`
	CoverageRadiusKM float64                `json:"coverage_radius_km"`
	DistanceKM       float64                `json:"distance_km"`
	IsEligible       bool                   `json:"is_eligible"`
	TransportCharge  float64                `json:"transport_charge"`
	ProductTotal     float64                `json:"product_total"`
	TaxAmount        float64                `json:"tax_amount"`
	FinalTotal       float64                `json:"final_total"`
	DistanceSlabs    []DistanceSlab         `json:"distance_slabs"`
	IncludedServices map[string]interface{} `json:"included_services"`
	Attributes       map[string]interface{} `json:"attributes"`
}

func (h *CategoryHandler) GetProviderOffers(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	latStr := r.URL.Query().Get("lat")
	lngStr := r.URL.Query().Get("lng")
	qtyStr := r.URL.Query().Get("quantity")

	lat, _ := strconv.ParseFloat(latStr, 64)
	lng, _ := strconv.ParseFloat(lngStr, 64)
	quantity, _ := strconv.ParseFloat(qtyStr, 64)
	if quantity <= 0 {
		quantity = 1.0
	}
	if lat == 0 {
		lat = 17.25
	}
	if lng == 0 {
		lng = 78.95
	}

	query := `
		SELECT sa.id, sa.user_id, u.full_name, COALESCE(u.phone, ''), COALESCE(u.avatar_url, ''), u.trust_score,
		       COALESCE(c.slug, sa.asset_type), COALESCE(c.name, sa.title), sa.title, COALESCE(sa.description, ''), COALESCE(sa.daily_rate, 25.0),
		       COALESCE(ST_Y(sa.current_location::geometry), COALESCE(ST_Y(u.location::geometry), 17.25)) as provider_lat,
		       COALESCE(ST_X(sa.current_location::geometry), COALESCE(ST_X(u.location::geometry), 78.95)) as provider_lng,
		       COALESCE(sa.attributes, '{}'::jsonb),
		       ST_Distance(
		           COALESCE(sa.current_location, u.location, ST_SetSRID(ST_MakePoint(78.95, 17.25), 4326)::geography),
		           ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
		       ) / 1000.0 as distance_km
		FROM user_skills_assets sa
		JOIN users u ON sa.user_id = u.id
		LEFT JOIN categories c ON (sa.category_id = c.id OR LOWER(c.slug) = REPLACE(LOWER(sa.asset_type), '_', '-'))
		WHERE (c.slug = $3 OR sa.asset_type = $3 OR LOWER(sa.asset_type) = REPLACE(LOWER($3), '-', '_'))
		  AND sa.status = 'ACTIVE'
		  AND sa.is_available = TRUE;
	`

	rows, err := h.db.Pool.Query(r.Context(), query, lat, lng, slug)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to query provider offers", err.Error())
		return
	}
	defer rows.Close()

	var offers []ProviderOfferResponse
	for rows.Next() {
		var saID, userID, fullName, phone, avatarURL, catSlug, catName, title, desc string
		var trustScore, dailyRate, providerLat, providerLng, distKm float64
		var attrBytes []byte

		if err := rows.Scan(&saID, &userID, &fullName, &phone, &avatarURL, &trustScore, &catSlug, &catName, &title, &desc, &dailyRate, &providerLat, &providerLng, &attrBytes, &distKm); err != nil {
			continue
		}

		var attr map[string]interface{}
		_ = json.Unmarshal(attrBytes, &attr)
		if attr == nil {
			attr = make(map[string]interface{})
		}

		offerType := "WITHOUT_TRANSPORT"
		if ot, ok := attr["offer_type"].(string); ok && ot != "" {
			offerType = ot
		} else if _, ok := attr["distance_slabs"]; ok {
			offerType = "WITH_TRANSPORT"
		} else if _, ok := attr["transport_charge"]; ok {
			offerType = "WITH_TRANSPORT"
		}

		unitPrice := dailyRate
		if up, ok := attr["unit_price"].(float64); ok && up > 0 {
			unitPrice = up
		} else if up, ok := attr["rate_per_unit"].(float64); ok && up > 0 {
			unitPrice = up
		}

		coverageRadius := 50.0
		if cr, ok := attr["coverage_radius_km"].(float64); ok && cr > 0 {
			coverageRadius = cr
		}

		// Distance Slabs
		var slabs []DistanceSlab
		if slabsRaw, ok := attr["distance_slabs"].([]interface{}); ok {
			for _, s := range slabsRaw {
				if sm, ok := s.(map[string]interface{}); ok {
					var minK, maxK, ch float64
					if v, ok := sm["min_km"].(float64); ok { minK = v }
					if v, ok := sm["max_km"].(float64); ok { maxK = v }
					if v, ok := sm["charge"].(float64); ok { ch = v }
					slabs = append(slabs, DistanceSlab{MinKM: minK, MaxKM: maxK, Charge: ch})
				}
			}
		}

		// Included Services
		incServices := make(map[string]interface{})
		if isMap, ok := attr["included_services"].(map[string]interface{}); ok {
			incServices = isMap
		} else if offerType == "WITH_TRANSPORT" {
			incServices["transport"] = true
			incServices["driver"] = true
			incServices["loading"] = true
			incServices["unloading"] = false
		}

		// Price & Eligibility Calculation
		isEligible := true
		transportCharge := 0.0

		if offerType == "WITH_TRANSPORT" {
			if distKm > coverageRadius {
				isEligible = false
			} else {
				// Find matching slab
				matchedSlab := false
				for _, slab := range slabs {
					if distKm >= slab.MinKM && distKm <= slab.MaxKM {
						transportCharge = slab.Charge
						matchedSlab = true
						break
					}
				}
				if !matchedSlab {
					if tc, ok := attr["transport_charge"].(float64); ok && tc > 0 {
						transportCharge = tc
					} else {
						transportCharge = 1000.0 // Default transport charge fallback
					}
				}
			}
		}

		if !isEligible {
			continue // Filter out offers outside coverage radius
		}

		productTotal := unitPrice * quantity
		taxAmount := (productTotal + transportCharge) * 0.18
		finalTotal := productTotal + transportCharge + taxAmount

		offers = append(offers, ProviderOfferResponse{
			OfferID:          saID,
			ProviderID:       userID,
			ProviderName:     fullName,
			ProviderPhone:    phone,
			ProviderAvatar:   avatarURL,
			TrustScore:       trustScore,
			CategorySlug:     catSlug,
			CategoryName:     catName,
			Title:            title,
			Description:      desc,
			OfferType:        offerType,
			UnitPrice:        unitPrice,
			CoverageRadiusKM: coverageRadius,
			DistanceKM:       distKm,
			IsEligible:       isEligible,
			TransportCharge:  transportCharge,
			ProductTotal:     productTotal,
			TaxAmount:        taxAmount,
			FinalTotal:       finalTotal,
			DistanceSlabs:    slabs,
			IncludedServices: incServices,
			Attributes:       attr,
		})
	}

	response.JSON(w, http.StatusOK, "Eligible provider offers retrieved successfully", offers)
}
