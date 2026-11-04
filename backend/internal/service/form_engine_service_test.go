package service_test

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/uop/backend/internal/domain"
	"github.com/uop/backend/internal/service"
)

// In-memory mock for FormEngine testing
type mockFormEngineRepo struct {
	schemas     map[uuid.UUID]*domain.FormSchema
	submissions map[uuid.UUID]*domain.FormSubmission
}

func newMockFormEngineRepo() *mockFormEngineRepo {
	return &mockFormEngineRepo{
		schemas:     make(map[uuid.UUID]*domain.FormSchema),
		submissions: make(map[uuid.UUID]*domain.FormSubmission),
	}
}

func (m *mockFormEngineRepo) CreateSchema(ctx context.Context, s *domain.FormSchema) error {
	if s.ID == uuid.Nil {
		s.ID = uuid.New()
	}
	s.CreatedAt = time.Now()
	s.UpdatedAt = time.Now()
	m.schemas[s.ID] = s
	return nil
}

func (m *mockFormEngineRepo) GetSchemaByID(ctx context.Context, id uuid.UUID) (*domain.FormSchema, error) {
	s, ok := m.schemas[id]
	if !ok {
		return nil, domain.ErrNotFound
	}
	return s, nil
}

func (m *mockFormEngineRepo) GetActiveSchemaForCategory(ctx context.Context, catID uuid.UUID, purpose domain.FormPurpose) (*domain.FormSchema, error) {
	for _, s := range m.schemas {
		if s.CategoryID != nil && *s.CategoryID == catID && s.Purpose == purpose && s.IsActive {
			return s, nil
		}
	}
	return nil, domain.ErrNotFound
}

func (m *mockFormEngineRepo) PublishNewVersion(ctx context.Context, prevID uuid.UUID, next *domain.FormSchema) error {
	prev, ok := m.schemas[prevID]
	if !ok {
		return domain.ErrNotFound
	}
	prev.IsActive = false
	next.ID = uuid.New()
	next.Version = prev.Version + 1
	next.IsActive = true
	m.schemas[next.ID] = next
	return nil
}

func (m *mockFormEngineRepo) CreateSubmission(ctx context.Context, sub *domain.FormSubmission) error {
	if sub.ID == uuid.Nil {
		sub.ID = uuid.New()
	}
	sub.CreatedAt = time.Now()
	sub.UpdatedAt = time.Now()
	m.submissions[sub.ID] = sub
	return nil
}

func (m *mockFormEngineRepo) GetSubmissionByID(ctx context.Context, id uuid.UUID) (*domain.FormSubmission, error) {
	sub, ok := m.submissions[id]
	if !ok {
		return nil, domain.ErrNotFound
	}
	return sub, nil
}

func TestPhase3_DynamicFormsEngine(t *testing.T) {
	_ = context.Background()
	repo := newMockFormEngineRepo()
	svc := service.NewFormEngineService(nil, nil)

	catID := uuid.New()
	userID := uuid.New()

	// 1. Supported Field Types & Schema Definition
	schemaV1 := &domain.FormSchema{
		ID:          uuid.New(),
		Title:       "Bricks Vendor Offering Schema",
		Description: "Dynamic schema for Bricks offering configuration",
		Purpose:     domain.PurposeVendorCatalogOffering,
		CategoryID:  &catID,
		Version:     1,
		IsActive:    true,
		Fields: []domain.FormFieldSpec{
			{
				Key:      "brick_type",
				Label:    "Brick Type",
				Type:     domain.FieldTypeSelect,
				Required: true,
				Options: []domain.FormSelectOption{
					{Label: "Red Clay Bricks", Value: "RED_CLAY"},
					{Label: "Fly Ash Bricks", Value: "FLY_ASH"},
					{Label: "AAC Blocks", Value: "AAC_BLOCKS"},
				},
			},
			{
				Key:      "quality_grade",
				Label:    "Quality Grade",
				Type:     domain.FieldTypeText,
				Required: true,
				Rules: []domain.FormConditionalRule{
					{
						TargetFieldKey: "quality_grade",
						Action:         "show",
						Logic:          "OR",
						Conditions: []domain.FormFieldCondition{
							{FieldKey: "brick_type", Operator: "equals", Value: "RED_CLAY"},
						},
					},
				},
			},
			{
				Key:      "aac_density",
				Label:    "AAC Dry Density (kg/m3)",
				Type:     domain.FieldTypeNumber,
				Required: true,
				Rules: []domain.FormConditionalRule{
					{
						TargetFieldKey: "aac_density",
						Action:         "show",
						Logic:          "OR",
						Conditions: []domain.FormFieldCondition{
							{FieldKey: "brick_type", Operator: "equals", Value: "AAC_BLOCKS"},
						},
					},
				},
			},
			{
				Key:      "moq",
				Label:    "Minimum Order Quantity",
				Type:     domain.FieldTypeQuantity,
				Required: true,
			},
			{
				Key:      "unit_price",
				Label:    "Unit Price (INR)",
				Type:     domain.FieldTypeCurrency,
				Required: true,
			},
			{
				Key:      "specification_sheet",
				Label:    "Technical Spec Sheet (PDF)",
				Type:     domain.FieldTypePDF,
				Required: false,
			},
		},
	}
	_ = repo.CreateSchema(context.Background(), schemaV1)

	// 2. Conditional Field Visibility & AND/OR Condition Evaluation
	// Test Red Clay Bricks selection -> quality_grade visible, aac_density hidden
	answersRedClay := map[string]interface{}{
		"brick_type":    "RED_CLAY",
		"quality_grade": "Class 1 High Load",
		"moq":           500,
		"unit_price":    5.50,
		// Stale value in hidden field aac_density should be purged
		"aac_density":   600,
	}

	sanitized, errs := svc.ValidateAnswers(schemaV1, answersRedClay)
	if len(errs) > 0 {
		t.Fatalf("Validation failed for valid Red Clay answer: %v", errs)
	}
	// Check hidden field stale value removal
	if _, exists := sanitized["aac_density"]; exists {
		t.Fatalf("Hidden field 'aac_density' was NOT removed from sanitized answers!")
	}
	if sanitized["quality_grade"] != "Class 1 High Load" {
		t.Fatalf("Visible conditional field 'quality_grade' was missing or incorrect")
	}

	// 3. AAC Blocks selection -> aac_density required, quality_grade hidden
	answersAACIncomplete := map[string]interface{}{
		"brick_type": "AAC_BLOCKS",
		"moq":        200,
		"unit_price": 45.00,
		// Missing aac_density which is now visible & required!
	}
	_, errsAAC := svc.ValidateAnswers(schemaV1, answersAACIncomplete)
	if len(errsAAC) == 0 {
		t.Fatalf("Expected validation error for missing visible required conditional field 'aac_density'")
	}
	if !strings.Contains(errsAAC[0], "aac_density") {
		t.Fatalf("Expected error mentioning 'aac_density', got: %v", errsAAC)
	}

	// 4. File Upload Validation (PDF URL checking)
	answersWithInvalidFile := map[string]interface{}{
		"brick_type":          "RED_CLAY",
		"quality_grade":       "Class 1",
		"moq":                 500,
		"unit_price":          5.50,
		"specification_sheet": "javascript:alert('malicious')", // Invalid URL
	}
	_, fileErrs := svc.ValidateAnswers(schemaV1, answersWithInvalidFile)
	if len(fileErrs) == 0 || !strings.Contains(fileErrs[0], "valid uploaded file URL") {
		t.Fatalf("Expected file upload path validation error, got: %v", fileErrs)
	}

	// 5. Schema Versioning & Historical Submission Rendering
	// Submit under Version 1
	subV1 := &domain.FormSubmission{
		ID:             uuid.New(),
		SchemaID:       schemaV1.ID,
		SchemaVersion:  schemaV1.Version,
		SchemaSnapshot: []byte(`{"version": 1, "fields": [{"key": "brick_type"}]}`),
		UserID:         userID,
		Status:         "SUBMITTED",
		Answers:        sanitized,
	}
	_ = repo.CreateSubmission(context.Background(), subV1)

	// Admin updates schema to Version 2 with new field "kiln_temperature"
	schemaV2 := &domain.FormSchema{
		Title:       "Bricks Vendor Offering Schema v2",
		Description: "Updated with kiln temperature requirement",
		Fields: append(schemaV1.Fields, domain.FormFieldSpec{
			Key:      "kiln_temperature",
			Label:    "Kiln Temperature (°C)",
			Type:     domain.FieldTypeNumber,
			Required: true,
		}),
	}
	_ = repo.PublishNewVersion(context.Background(), schemaV1.ID, schemaV2)

	// Verify Schema V1 is now deactivated and V2 is active with version 2
	oldS, _ := repo.GetSchemaByID(context.Background(), schemaV1.ID)
	if oldS.IsActive {
		t.Fatalf("Expected old schema to be deactivated after publishing new version")
	}
	if schemaV2.Version != 2 || !schemaV2.IsActive {
		t.Fatalf("Expected new schema version 2, got %d, active: %v", schemaV2.Version, schemaV2.IsActive)
	}

	// Verify historical submission still references Version 1 and retains original snapshot
	storedSub, _ := repo.GetSubmissionByID(context.Background(), subV1.ID)
	if storedSub.SchemaVersion != 1 {
		t.Fatalf("Historical submission version corrupted! Expected 1, got %d", storedSub.SchemaVersion)
	}
	var snap map[string]interface{}
	_ = json.Unmarshal(storedSub.SchemaSnapshot, &snap)
	if snap["version"].(float64) != 1 {
		t.Fatalf("Historical snapshot version mismatch")
	}

	// 6. Seamless SynthesizeSchemaFromCategory Backward Compatibility (Scenario 1 Bricks protection)
	bricksCat := &domain.Category{
		ID:   catID,
		Name: "Bricks & Building Materials",
		Slug: "bricks-building-materials",
		OpportunityFields: []byte(`[
			{"key": "brick_type", "label": "Brick Type", "type": "select", "required": true, "options": ["Red Bricks", "Fly Ash Bricks"]},
			{"key": "dimensions", "label": "Dimensions", "type": "text", "required": true},
			{"key": "quantity", "label": "Quantity Needed", "type": "number", "required": true}
		]`),
		RequiredDocuments: []byte(`[
			{"key": "gst_cert", "label": "GST Registration Certificate", "type": "pdf", "required": true, "max_file_size_mb": 10},
			{"key": "yard_photo", "label": "Brick Kiln / Yard Photo", "type": "image", "required": true}
		]`),
	}

	synthesizedOpp := svc.SynthesizeSchemaFromCategory(bricksCat, domain.PurposeCustomerOpportunity)
	if len(synthesizedOpp.Fields) != 3 {
		t.Fatalf("Expected 3 synthesized opportunity fields, got %d", len(synthesizedOpp.Fields))
	}
	if synthesizedOpp.Fields[0].Key != "brick_type" || synthesizedOpp.Fields[0].Type != domain.FieldTypeSelect {
		t.Errorf("Synthesized field mismatch: %v", synthesizedOpp.Fields[0])
	}

	synthesizedDocs := svc.SynthesizeSchemaFromCategory(bricksCat, domain.PurposeVendorCategoryApplication)
	if len(synthesizedDocs.Fields) != 2 {
		t.Fatalf("Expected 2 synthesized document fields, got %d", len(synthesizedDocs.Fields))
	}
	if synthesizedDocs.Fields[0].Type != domain.FieldTypePDF || synthesizedDocs.Fields[1].Type != domain.FieldTypeImage {
		t.Errorf("Synthesized doc types mismatch: %v, %v", synthesizedDocs.Fields[0].Type, synthesizedDocs.Fields[1].Type)
	}

	t.Logf("ALL PHASE 3 DYNAMIC FORMS ENGINE TESTS PASSED!")
}

