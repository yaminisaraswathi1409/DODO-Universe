package handler

import (
	"net/http"

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
	ID              string `json:"id"`
	Slug            string `json:"slug"`
	Name            string `json:"name"`
	Description     string `json:"description"`
	Icon            string `json:"icon"`
	DefaultWorkflow string `json:"default_workflow"`
}

func (h *CategoryHandler) List(w http.ResponseWriter, r *http.Request) {
	query := `SELECT id, slug, name, COALESCE(description, ''), COALESCE(icon, ''), default_workflow FROM categories ORDER BY name ASC;`

	rows, err := h.db.Pool.Query(r.Context(), query)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to query categories", err.Error())
		return
	}
	defer rows.Close()

	var categories []CategoryResponse
	for rows.Next() {
		var c CategoryResponse
		if err := rows.Scan(&c.ID, &c.Slug, &c.Name, &c.Description, &c.Icon, &c.DefaultWorkflow); err != nil {
			response.Error(w, http.StatusInternalServerError, "Failed to scan category", err.Error())
			return
		}
		categories = append(categories, c)
	}

	response.JSON(w, http.StatusOK, "Categories fetched successfully", categories)
}
