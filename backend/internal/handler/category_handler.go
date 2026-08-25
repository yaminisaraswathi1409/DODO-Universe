package handler

import (
	"encoding/json"
	"net/http"
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
	ID                string          `json:"id"`
	Slug              string          `json:"slug"`
	Name              string          `json:"name"`
	Description       string          `json:"description"`
	Icon              string          `json:"icon"`
	DefaultWorkflow   string          `json:"default_workflow"`
	RequiredDocuments json.RawMessage `json:"required_documents,omitempty"`
	OpportunityFields json.RawMessage `json:"opportunity_fields,omitempty"`
}

func (h *CategoryHandler) List(w http.ResponseWriter, r *http.Request) {
	query := `SELECT id, slug, name, COALESCE(description, ''), COALESCE(icon, ''), default_workflow, COALESCE(required_documents, '[]'::jsonb), COALESCE(opportunity_fields, '[]'::jsonb) FROM categories ORDER BY name ASC;`

	rows, err := h.db.Pool.Query(r.Context(), query)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to query categories", err.Error())
		return
	}
	defer rows.Close()

	var categories []CategoryResponse
	for rows.Next() {
		var c CategoryResponse
		if err := rows.Scan(&c.ID, &c.Slug, &c.Name, &c.Description, &c.Icon, &c.DefaultWorkflow, &c.RequiredDocuments, &c.OpportunityFields); err != nil {
			response.Error(w, http.StatusInternalServerError, "Failed to scan category", err.Error())
			return
		}
		categories = append(categories, c)
	}

	response.JSON(w, http.StatusOK, "Categories fetched successfully", categories)
}

type CreateCategoryPayload struct {
	Name              string          `json:"name"`
	Slug              string          `json:"slug"`
	Description       string          `json:"description"`
	Icon              string          `json:"icon"`
	DefaultWorkflow   string          `json:"default_workflow"`
	RequiredDocuments json.RawMessage `json:"required_documents"`
	OpportunityFields json.RawMessage `json:"opportunity_fields"`
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

	query := `
		INSERT INTO categories (slug, name, description, icon, default_workflow, required_documents, opportunity_fields)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, icon = EXCLUDED.icon, required_documents = COALESCE(EXCLUDED.required_documents, categories.required_documents), opportunity_fields = COALESCE(EXCLUDED.opportunity_fields, categories.opportunity_fields)
		RETURNING id, slug, name, COALESCE(description, ''), COALESCE(icon, ''), default_workflow, COALESCE(required_documents, '[]'::jsonb), COALESCE(opportunity_fields, '[]'::jsonb);
	`
	row := h.db.Pool.QueryRow(r.Context(), query, p.Slug, p.Name, p.Description, p.Icon, p.DefaultWorkflow, p.RequiredDocuments, p.OpportunityFields)

	var c CategoryResponse
	if err := row.Scan(&c.ID, &c.Slug, &c.Name, &c.Description, &c.Icon, &c.DefaultWorkflow, &c.RequiredDocuments, &c.OpportunityFields); err != nil {
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
		RETURNING id, slug, name, COALESCE(description, ''), COALESCE(icon, ''), default_workflow, COALESCE(required_documents, '[]'::jsonb), COALESCE(opportunity_fields, '[]'::jsonb);
	`
	row := h.db.Pool.QueryRow(r.Context(), query, id, p.RequiredDocuments)

	var c CategoryResponse
	if err := row.Scan(&c.ID, &c.Slug, &c.Name, &c.Description, &c.Icon, &c.DefaultWorkflow, &c.RequiredDocuments, &c.OpportunityFields); err != nil {
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
		RETURNING id, slug, name, COALESCE(description, ''), COALESCE(icon, ''), default_workflow, COALESCE(required_documents, '[]'::jsonb), COALESCE(opportunity_fields, '[]'::jsonb);
	`
	row := h.db.Pool.QueryRow(r.Context(), query, id, p.OpportunityFields)

	var c CategoryResponse
	if err := row.Scan(&c.ID, &c.Slug, &c.Name, &c.Description, &c.Icon, &c.DefaultWorkflow, &c.RequiredDocuments, &c.OpportunityFields); err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to update category opportunity fields", err.Error())
		return
	}

	response.JSON(w, http.StatusOK, "Category opportunity fields updated successfully", c)
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
