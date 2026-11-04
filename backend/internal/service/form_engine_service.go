package service

import (
	"context"
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"github.com/google/uuid"
	"github.com/uop/backend/internal/domain"
	"github.com/uop/backend/internal/repository/postgres"
)

type FormEngineService struct {
	formRepo *postgres.FormEngineRepository
	catRepo  *postgres.CategoryGovernanceRepository
}

func NewFormEngineService(formRepo *postgres.FormEngineRepository, catRepo *postgres.CategoryGovernanceRepository) *FormEngineService {
	return &FormEngineService{
		formRepo: formRepo,
		catRepo:  catRepo,
	}
}

// CreateSchema creates and validates a new form schema
func (s *FormEngineService) CreateSchema(ctx context.Context, schema *domain.FormSchema) (*domain.FormSchema, error) {
	if strings.TrimSpace(schema.Title) == "" {
		return nil, fmt.Errorf("form schema title is required")
	}
	if schema.Purpose == "" {
		return nil, fmt.Errorf("form purpose is required")
	}

	// Validate fields
	keysSeen := make(map[string]bool)
	for i, f := range schema.Fields {
		if strings.TrimSpace(f.Key) == "" {
			return nil, fmt.Errorf("field #%d: field key cannot be empty", i+1)
		}
		if keysSeen[f.Key] {
			return nil, fmt.Errorf("field #%d: duplicate field key '%s'", i+1, f.Key)
		}
		keysSeen[f.Key] = true

		if strings.TrimSpace(f.Label) == "" {
			return nil, fmt.Errorf("field '%s': label is required", f.Key)
		}
		if f.Type == "" {
			return nil, fmt.Errorf("field '%s': field type is required", f.Key)
		}

		// Selection fields require options
		if f.Type == domain.FieldTypeSelect || f.Type == domain.FieldTypeMultiSelect || f.Type == domain.FieldTypeRadio || f.Type == domain.FieldTypeCheckboxGroup {
			if len(f.Options) == 0 {
				return nil, fmt.Errorf("field '%s': options are required for %s", f.Key, f.Type)
			}
		}
	}

	err := s.formRepo.CreateSchema(ctx, schema)
	if err != nil {
		return nil, err
	}
	return s.formRepo.GetSchemaByID(ctx, schema.ID)
}

// GetSchemaByID retrieves a schema
func (s *FormEngineService) GetSchemaByID(ctx context.Context, id uuid.UUID) (*domain.FormSchema, error) {
	return s.formRepo.GetSchemaByID(ctx, id)
}

// GetActiveSchemaForCategory retrieves or dynamically generates schema for category
func (s *FormEngineService) GetActiveSchemaForCategory(ctx context.Context, categoryID uuid.UUID, purpose domain.FormPurpose) (*domain.FormSchema, error) {
	schema, err := s.formRepo.GetActiveSchemaForCategory(ctx, categoryID, purpose)
	if err == nil && schema != nil {
		return schema, nil
	}

	// Fallback & Seamless Phase 1 / Scenario 1 Compatibility:
	// Synthesize a FormSchema from Category's opportunity_fields, required_documents, resources
	if s.catRepo != nil {
		cat, cErr := s.catRepo.GetCategoryByID(ctx, categoryID)
		if cErr == nil && cat != nil {
			return s.SynthesizeSchemaFromCategory(cat, purpose), nil
		}
	}

	return nil, domain.ErrNotFound
}

// SynthesizeSchemaFromCategory creates a FormSchema dynamically from existing category JSONB configuration
func (s *FormEngineService) SynthesizeSchemaFromCategory(cat *domain.Category, purpose domain.FormPurpose) *domain.FormSchema {
	schema := &domain.FormSchema{
		ID:          cat.ID, // deterministic ID
		Title:       fmt.Sprintf("%s (%s Form)", cat.Name, purpose),
		Description: fmt.Sprintf("Standard form for %s", cat.Name),
		Purpose:     purpose,
		CategoryID:  &cat.ID,
		Category:    cat,
		Version:     1,
		IsActive:    true,
		Sections: []domain.FormSection{
			{ID: "general", Title: "General Information", DisplayOrder: 1},
			{ID: "specifications", Title: "Category Specifications", DisplayOrder: 2},
			{ID: "verification", Title: "Verification Documents", DisplayOrder: 3},
		},
		Fields: []domain.FormFieldSpec{},
		Rules:  []domain.FormConditionalRule{},
	}

	if purpose == domain.PurposeCustomerOpportunity || purpose == domain.PurposeVendorCatalogOffering {
		// Convert cat.OpportunityFields
		if len(cat.OpportunityFields) > 0 {
			var rawFields []struct {
				Key         string                 `json:"key"`
				Label       string                 `json:"label"`
				Type        string                 `json:"type"`
				Required    bool                   `json:"required"`
				Placeholder string                 `json:"placeholder"`
				Options     []string               `json:"options"`
				Validation  map[string]interface{} `json:"validation"`
			}
			_ = json.Unmarshal(cat.OpportunityFields, &rawFields)
			for idx, rf := range rawFields {
				fType := domain.FieldTypeText
				switch strings.ToLower(rf.Type) {
				case "number", "integer":
					fType = domain.FieldTypeNumber
				case "decimal":
					fType = domain.FieldTypeDecimal
				case "select":
					fType = domain.FieldTypeSelect
				case "textarea":
					fType = domain.FieldTypeTextarea
				case "date":
					fType = domain.FieldTypeDate
				case "datetime":
					fType = domain.FieldTypeDatetime
				case "location":
					fType = domain.FieldTypeLocation
				case "photo", "image":
					fType = domain.FieldTypeImage
				case "file":
					fType = domain.FieldTypeFile
				}

				var opts []domain.FormSelectOption
				for _, o := range rf.Options {
					opts = append(opts, domain.FormSelectOption{Label: o, Value: o})
				}

				schema.Fields = append(schema.Fields, domain.FormFieldSpec{
					Key:          rf.Key,
					Label:        rf.Label,
					Type:         fType,
					Required:     rf.Required,
					Placeholder:  rf.Placeholder,
					SectionID:    "specifications",
					DisplayOrder: idx + 1,
					Options:      opts,
				})
			}
		}
	} else if purpose == domain.PurposeVendorCategoryApplication || purpose == domain.PurposeDocumentVerification {
		// Convert cat.RequiredDocuments
		if len(cat.RequiredDocuments) > 0 {
			var rawDocs []struct {
				Key              string   `json:"key"`
				Label            string   `json:"label"`
				Type             string   `json:"type"`
				Required         bool     `json:"required"`
				AllowedFileTypes []string `json:"allowed_file_types"`
				MaxFileSizeMB    float64  `json:"max_file_size_mb"`
				Options          []string `json:"options"`
			}
			_ = json.Unmarshal(cat.RequiredDocuments, &rawDocs)
			for idx, rd := range rawDocs {
				fType := domain.FieldTypePDF
				switch strings.ToLower(rd.Type) {
				case "image":
					fType = domain.FieldTypeImage
				case "multi_image":
					fType = domain.FieldTypeMultiImage
				case "pdf":
					fType = domain.FieldTypePDF
				case "video":
					fType = domain.FieldTypeVideo
				case "text":
					fType = domain.FieldTypeText
				case "date":
					fType = domain.FieldTypeDate
				case "select":
					fType = domain.FieldTypeSelect
				}

				var opts []domain.FormSelectOption
				for _, o := range rd.Options {
					opts = append(opts, domain.FormSelectOption{Label: o, Value: o})
				}

				val := &domain.FormFieldValidation{
					AllowedMimeTypes: rd.AllowedFileTypes,
				}
				if rd.MaxFileSizeMB > 0 {
					val.MaxFileSizeMB = &rd.MaxFileSizeMB
				}

				schema.Fields = append(schema.Fields, domain.FormFieldSpec{
					Key:          rd.Key,
					Label:        rd.Label,
					Type:         fType,
					Required:     rd.Required,
					SectionID:    "verification",
					DisplayOrder: idx + 1,
					Options:      opts,
					Validation:   val,
				})
			}
		}
	}

	return schema
}

// EvaluateCondition evaluates a single condition predicate against user answers
func EvaluateCondition(cond domain.FormFieldCondition, answers map[string]interface{}) bool {
	rawVal, exists := answers[cond.FieldKey]
	valStr := fmt.Sprintf("%v", rawVal)
	expectedStr := fmt.Sprintf("%v", cond.Value)

	switch cond.Operator {
	case "equals", "==":
		if !exists {
			return false
		}
		return strings.EqualFold(strings.TrimSpace(valStr), strings.TrimSpace(expectedStr))
	case "not_equals", "!=":
		if !exists {
			return true
		}
		return !strings.EqualFold(strings.TrimSpace(valStr), strings.TrimSpace(expectedStr))
	case "contains":
		if !exists {
			return false
		}
		return strings.Contains(strings.ToLower(valStr), strings.ToLower(expectedStr))
	case "is_empty":
		return !exists || strings.TrimSpace(valStr) == "" || valStr == "<nil>"
	case "is_not_empty":
		return exists && strings.TrimSpace(valStr) != "" && valStr != "<nil>"
	case "gt", ">":
		vNum, err1 := strconv.ParseFloat(valStr, 64)
		expNum, err2 := strconv.ParseFloat(expectedStr, 64)
		if err1 != nil || err2 != nil {
			return false
		}
		return vNum > expNum
	case "lt", "<":
		vNum, err1 := strconv.ParseFloat(valStr, 64)
		expNum, err2 := strconv.ParseFloat(expectedStr, 64)
		if err1 != nil || err2 != nil {
			return false
		}
		return vNum < expNum
	default:
		return false
	}
}

// EvaluateRule evaluates a group rule (AND / OR)
func EvaluateRule(rule domain.FormConditionalRule, answers map[string]interface{}) bool {
	if len(rule.Conditions) == 0 {
		return true
	}
	isOR := strings.EqualFold(rule.Logic, "OR")

	for _, cond := range rule.Conditions {
		res := EvaluateCondition(cond, answers)
		if isOR && res {
			return true
		}
		if !isOR && !res {
			return false
		}
	}
	return !isOR
}

// ValidateAnswers validates user-submitted answers against a FormSchema, honoring conditional visibility
func (s *FormEngineService) ValidateAnswers(schema *domain.FormSchema, answers map[string]interface{}) (map[string]interface{}, []string) {
	var errs []string
	sanitized := make(map[string]interface{})

	// 1. Determine active field visibility and required status based on rules
	fieldVisibility := make(map[string]bool)
	fieldRequired := make(map[string]bool)

	// Default all to visible
	for _, f := range schema.Fields {
		fieldVisibility[f.Key] = true
		fieldRequired[f.Key] = f.Required
	}

	// Apply schema-level rules
	for _, r := range schema.Rules {
		matched := EvaluateRule(r, answers)
		switch r.Action {
		case "show":
			fieldVisibility[r.TargetFieldKey] = matched
		case "hide":
			fieldVisibility[r.TargetFieldKey] = !matched
		case "require":
			if matched {
				fieldRequired[r.TargetFieldKey] = true
			}
		}
	}

	// Apply field-level rules
	for _, f := range schema.Fields {
		for _, r := range f.Rules {
			matched := EvaluateRule(r, answers)
			switch r.Action {
			case "show":
				fieldVisibility[r.TargetFieldKey] = matched
			case "hide":
				fieldVisibility[r.TargetFieldKey] = !matched
			case "require":
				if matched {
					fieldRequired[r.TargetFieldKey] = true
				}
			}
		}
	}

	// 2. Validate fields
	for _, f := range schema.Fields {
		isVisible := fieldVisibility[f.Key]
		if !isVisible {
			// Rule: Hidden fields must not accidentally submit stale values. Purge from sanitized.
			continue
		}

		isRequired := fieldRequired[f.Key]
		val, exists := answers[f.Key]
		hasValue := exists && val != nil && strings.TrimSpace(fmt.Sprintf("%v", val)) != "" && fmt.Sprintf("%v", val) != "<nil>"

		if isRequired && !hasValue {
			errs = append(errs, fmt.Sprintf("Field '%s' (%s) is required", f.Label, f.Key))
			continue
		}

		if !hasValue {
			continue
		}

		// Field type validation
		valStr := strings.TrimSpace(fmt.Sprintf("%v", val))
		switch f.Type {
		case domain.FieldTypeNumber:
			if _, err := strconv.ParseInt(valStr, 10, 64); err != nil {
				errs = append(errs, fmt.Sprintf("Field '%s' must be an integer", f.Label))
			}
		case domain.FieldTypeDecimal, domain.FieldTypeCurrency, domain.FieldTypeQuantity:
			fVal, err := strconv.ParseFloat(valStr, 64)
			if err != nil {
				errs = append(errs, fmt.Sprintf("Field '%s' must be a valid number", f.Label))
			} else if f.Validation != nil {
				if f.Validation.Min != nil && fVal < *f.Validation.Min {
					errs = append(errs, fmt.Sprintf("Field '%s' must be at least %v", f.Label, *f.Validation.Min))
				}
				if f.Validation.Max != nil && fVal > *f.Validation.Max {
					errs = append(errs, fmt.Sprintf("Field '%s' cannot exceed %v", f.Label, *f.Validation.Max))
				}
			}
		case domain.FieldTypeEmail:
			if !strings.Contains(valStr, "@") || !strings.Contains(valStr, ".") {
				errs = append(errs, fmt.Sprintf("Field '%s' must be a valid email address", f.Label))
			}
		case domain.FieldTypePhone:
			phoneRegex := regexp.MustCompile(`^[0-9+\s-]{8,20}$`)
			if !phoneRegex.MatchString(valStr) {
				errs = append(errs, fmt.Sprintf("Field '%s' must be a valid phone number", f.Label))
			}
		case domain.FieldTypeSelect, domain.FieldTypeRadio:
			validChoice := false
			for _, opt := range f.Options {
				if strings.EqualFold(opt.Value, valStr) || strings.EqualFold(opt.Label, valStr) {
					validChoice = true
					break
				}
			}
			if len(f.Options) > 0 && !validChoice {
				errs = append(errs, fmt.Sprintf("Field '%s' contains an invalid selection: %s", f.Label, valStr))
			}
		case domain.FieldTypeFile, domain.FieldTypeImage, domain.FieldTypePDF, domain.FieldTypeVideo:
			// Validate file path format
			if !strings.HasPrefix(valStr, "/uploads/") && !strings.HasPrefix(valStr, "http://") && !strings.HasPrefix(valStr, "https://") {
				errs = append(errs, fmt.Sprintf("Field '%s' must reference a valid uploaded file URL", f.Label))
			}
		}

		sanitized[f.Key] = val
	}

	return sanitized, errs
}

// SubmitForm validates and saves a submission
func (s *FormEngineService) SubmitForm(ctx context.Context, userID uuid.UUID, schemaID uuid.UUID, answers map[string]interface{}, entityID *uuid.UUID, entityType string, isDraft bool) (*domain.FormSubmission, error) {
	schema, err := s.formRepo.GetSchemaByID(ctx, schemaID)
	if err != nil {
		return nil, fmt.Errorf("schema not found: %w", err)
	}

	var sanitized map[string]interface{}
	if !isDraft {
		var valErrs []string
		sanitized, valErrs = s.ValidateAnswers(schema, answers)
		if len(valErrs) > 0 {
			return nil, fmt.Errorf("validation failed: %s", strings.Join(valErrs, "; "))
		}
	} else {
		sanitized = answers
	}

	// Capture immutable snapshot of schema
	schemaBytes, _ := json.Marshal(schema)

	status := "SUBMITTED"
	if isDraft {
		status = "DRAFT"
	}

	sub := &domain.FormSubmission{
		SchemaID:       schema.ID,
		SchemaVersion:  schema.Version,
		SchemaSnapshot: schemaBytes,
		UserID:         userID,
		EntityID:       entityID,
		EntityType:     entityType,
		Status:         status,
		Answers:        sanitized,
	}

	err = s.formRepo.CreateSubmission(ctx, sub)
	if err != nil {
		return nil, err
	}
	return s.formRepo.GetSubmissionByID(ctx, sub.ID)
}

// PublishNewVersion publishes a new version of a schema
func (s *FormEngineService) PublishNewVersion(ctx context.Context, prevSchemaID uuid.UUID, newSchema *domain.FormSchema) (*domain.FormSchema, error) {
	err := s.formRepo.PublishNewVersion(ctx, prevSchemaID, newSchema)
	if err != nil {
		return nil, err
	}
	return s.formRepo.GetSchemaByID(ctx, newSchema.ID)
}

// ListSchemas lists schemas
func (s *FormEngineService) ListSchemas(ctx context.Context, purpose *domain.FormPurpose, categoryID *uuid.UUID, activeOnly bool) ([]*domain.FormSchema, error) {
	return s.formRepo.ListSchemas(ctx, purpose, categoryID, activeOnly)
}

// GetSubmissionByID retrieves a submission
func (s *FormEngineService) GetSubmissionByID(ctx context.Context, id uuid.UUID) (*domain.FormSubmission, error) {
	return s.formRepo.GetSubmissionByID(ctx, id)
}

// ListSubmissionsByEntity retrieves submissions
func (s *FormEngineService) ListSubmissionsByEntity(ctx context.Context, entityType string, entityID uuid.UUID) ([]*domain.FormSubmission, error) {
	return s.formRepo.ListSubmissionsByEntity(ctx, entityType, entityID)
}
