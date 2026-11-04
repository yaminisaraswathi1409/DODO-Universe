package domain

import (
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
)

var ErrNotFound = errors.New("record not found")

// FormPurpose defines where the dynamic form schema is used
type FormPurpose string

const (
	PurposeMainServiceApplication   FormPurpose = "MAIN_SERVICE_APPLICATION"
	PurposeVendorCategoryApplication FormPurpose = "VENDOR_CATEGORY_APPLICATION"
	PurposeVendorCatalogOffering    FormPurpose = "VENDOR_CATALOG_OFFERING"
	PurposeCustomerOpportunity      FormPurpose = "CUSTOMER_OPPORTUNITY"
	PurposeCustomerServiceRequest   FormPurpose = "CUSTOMER_SERVICE_REQUEST"
	PurposeDocumentVerification     FormPurpose = "DOCUMENT_VERIFICATION"
)

// FormFieldType defines the supported field input types
type FormFieldType string

const (
	FieldTypeText          FormFieldType = "TEXT"
	FieldTypeTextarea      FormFieldType = "TEXTAREA"
	FieldTypeNumber        FormFieldType = "NUMBER"
	FieldTypeDecimal       FormFieldType = "DECIMAL"
	FieldTypeEmail         FormFieldType = "EMAIL"
	FieldTypePhone         FormFieldType = "PHONE"
	FieldTypeDate          FormFieldType = "DATE"
	FieldTypeTime          FormFieldType = "TIME"
	FieldTypeDatetime      FormFieldType = "DATETIME"
	FieldTypeSelect        FormFieldType = "SELECT"
	FieldTypeMultiSelect   FormFieldType = "MULTI_SELECT"
	FieldTypeRadio         FormFieldType = "RADIO"
	FieldTypeCheckbox      FormFieldType = "CHECKBOX"
	FieldTypeCheckboxGroup FormFieldType = "CHECKBOX_GROUP"
	FieldTypeFile          FormFieldType = "FILE"
	FieldTypeImage         FormFieldType = "IMAGE"
	FieldTypeMultiImage    FormFieldType = "MULTI_IMAGE"
	FieldTypePDF           FormFieldType = "PDF"
	FieldTypeVideo         FormFieldType = "VIDEO"
	FieldTypeURL           FormFieldType = "URL"
	FieldTypeLocation      FormFieldType = "LOCATION"
	FieldTypeQuantity      FormFieldType = "QUANTITY"
	FieldTypeCurrency      FormFieldType = "CURRENCY"
	FieldTypeAddress       FormFieldType = "ADDRESS"
)

// FormFieldValidation represents detailed validation rules for a field
type FormFieldValidation struct {
	Min             *float64 `json:"min,omitempty"`
	Max             *float64 `json:"max,omitempty"`
	MinLength       *int     `json:"min_length,omitempty"`
	MaxLength       *int     `json:"max_length,omitempty"`
	Pattern         string   `json:"pattern,omitempty"`
	AllowedMimeTypes []string `json:"allowed_mime_types,omitempty"`
	MaxFileSizeMB   *float64 `json:"max_file_size_mb,omitempty"`
	MaxFiles        *int     `json:"max_files,omitempty"`
}

// FormSelectOption represents choices for Select, MultiSelect, Radio
type FormSelectOption struct {
	Label string `json:"label"`
	Value string `json:"value"`
}

// FormFieldCondition represents a single condition predicate
type FormFieldCondition struct {
	FieldKey string      `json:"field_key"`
	Operator string      `json:"operator"` // equals, not_equals, contains, gt, lt, is_empty, is_not_empty
	Value    interface{} `json:"value,omitempty"`
}

// FormConditionalRule represents condition groups (AND / OR) for field visibility or requirement
type FormConditionalRule struct {
	TargetFieldKey string               `json:"target_field_key"`
	Action         string               `json:"action"` // show, hide, require, disable
	Logic          string               `json:"logic"`  // AND, OR
	Conditions     []FormFieldCondition `json:"conditions"`
}

// FormFieldSpec defines a single configurable field
type FormFieldSpec struct {
	Key          string               `json:"key"`
	Label        string               `json:"label"`
	Type         FormFieldType        `json:"type"`
	Required     bool                 `json:"required"`
	Placeholder  string               `json:"placeholder,omitempty"`
	HelpText     string               `json:"help_text,omitempty"`
	DefaultValue interface{}          `json:"default_value,omitempty"`
	SectionID    string               `json:"section_id,omitempty"`
	DisplayOrder int                  `json:"display_order"`
	Options      []FormSelectOption   `json:"options,omitempty"`
	Validation   *FormFieldValidation `json:"validation,omitempty"`
	Rules        []FormConditionalRule `json:"rules,omitempty"`
	UnitOptions  []string             `json:"unit_options,omitempty"` // For QUANTITY / CURRENCY
}

// FormSection groups fields into structured sections
type FormSection struct {
	ID           string `json:"id"`
	Title        string `json:"title"`
	Description  string `json:"description,omitempty"`
	DisplayOrder int    `json:"display_order"`
	IsRepeatable bool   `json:"is_repeatable,omitempty"`
}

// FormSchema represents a full dynamic form definition
type FormSchema struct {
	ID              uuid.UUID             `json:"id"`
	Title           string                `json:"title"`
	Description     string                `json:"description,omitempty"`
	Purpose         FormPurpose           `json:"purpose"`
	CategoryID      *uuid.UUID            `json:"category_id,omitempty"`
	Category        *Category             `json:"category,omitempty"`
	MainServiceSlug string                `json:"main_service_slug,omitempty"`
	Version         int                   `json:"version"`
	IsActive        bool                  `json:"is_active"`
	Sections        []FormSection         `json:"sections"`
	Fields          []FormFieldSpec       `json:"fields"`
	Rules           []FormConditionalRule `json:"rules"`
	CreatedBy       *uuid.UUID            `json:"created_by,omitempty"`
	CreatedAt       time.Time             `json:"created_at"`
	UpdatedAt       time.Time             `json:"updated_at"`
}

// FormSubmission represents a user's submitted answers
type FormSubmission struct {
	ID             uuid.UUID              `json:"id"`
	SchemaID       uuid.UUID              `json:"schema_id"`
	SchemaVersion  int                    `json:"schema_version"`
	SchemaSnapshot json.RawMessage        `json:"schema_snapshot"` // Immutable snapshot of FormSchema
	UserID         uuid.UUID              `json:"user_id"`
	User           *User                  `json:"user,omitempty"`
	EntityID       *uuid.UUID             `json:"entity_id,omitempty"`
	EntityType     string                 `json:"entity_type,omitempty"` // OPPORTUNITY, USER_ASSET, CATALOG_ITEM, CATEGORY_APPROVAL
	Status         string                 `json:"status"`                // DRAFT, SUBMITTED, APPROVED, CHANGES_REQUESTED, REJECTED
	Answers        map[string]interface{} `json:"answers"`
	ReviewNotes    string                 `json:"review_notes,omitempty"`
	ReviewedBy     *uuid.UUID             `json:"reviewed_by,omitempty"`
	ReviewedAt     *time.Time             `json:"reviewed_at,omitempty"`
	CreatedAt      time.Time              `json:"created_at"`
	UpdatedAt      time.Time              `json:"updated_at"`
}
