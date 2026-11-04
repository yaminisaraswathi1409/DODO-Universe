import { API_BASE_URL } from './api';

export type FormPurpose =
  | 'MAIN_SERVICE_APPLICATION'
  | 'VENDOR_CATEGORY_APPLICATION'
  | 'VENDOR_CATALOG_OFFERING'
  | 'CUSTOMER_OPPORTUNITY'
  | 'CUSTOMER_SERVICE_REQUEST'
  | 'DOCUMENT_VERIFICATION';

export type FormFieldType =
  | 'TEXT'
  | 'TEXTAREA'
  | 'NUMBER'
  | 'DECIMAL'
  | 'EMAIL'
  | 'PHONE'
  | 'DATE'
  | 'TIME'
  | 'DATETIME'
  | 'SELECT'
  | 'MULTI_SELECT'
  | 'RADIO'
  | 'CHECKBOX'
  | 'CHECKBOX_GROUP'
  | 'FILE'
  | 'IMAGE'
  | 'MULTI_IMAGE'
  | 'PDF'
  | 'VIDEO'
  | 'URL'
  | 'LOCATION'
  | 'QUANTITY'
  | 'CURRENCY'
  | 'ADDRESS';

export interface FormFieldValidation {
  min?: number;
  max?: number;
  min_length?: number;
  max_length?: number;
  pattern?: string;
  allowed_mime_types?: string[];
  max_file_size_mb?: number;
  max_files?: number;
}

export interface FormSelectOption {
  label: string;
  value: string;
}

export interface FormFieldCondition {
  field_key: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'gt' | 'lt' | 'is_empty' | 'is_not_empty';
  value?: any;
}

export interface FormConditionalRule {
  target_field_key: string;
  action: 'show' | 'hide' | 'require' | 'disable';
  logic: 'AND' | 'OR';
  conditions: FormFieldCondition[];
}

export interface FormFieldSpec {
  key: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  placeholder?: string;
  help_text?: string;
  default_value?: any;
  section_id?: string;
  display_order: number;
  options?: FormSelectOption[];
  validation?: FormFieldValidation;
  rules?: FormConditionalRule[];
  unit_options?: string[];
}

export interface FormSection {
  id: string;
  title: string;
  description?: string;
  display_order: number;
  is_repeatable?: boolean;
}

export interface FormSchema {
  id: string;
  title: string;
  description?: string;
  purpose: FormPurpose;
  category_id?: string;
  category?: any;
  main_service_slug?: string;
  version: number;
  is_active: boolean;
  sections: FormSection[];
  fields: FormFieldSpec[];
  rules: FormConditionalRule[];
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface FormSubmission {
  id: string;
  schema_id: string;
  schema_version: number;
  schema_snapshot: any;
  user_id: string;
  entity_id?: string;
  entity_type?: string;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED';
  answers: Record<string, any>;
  review_notes?: string;
  reviewed_by?: string;
  reviewed_at?: string;
  created_at: string;
  updated_at: string;
}

// API methods
export async function createFormSchema(schema: Partial<FormSchema>): Promise<FormSchema> {
  const res = await fetch(`${API_BASE_URL}/admin/forms/schemas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(schema),
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.data;
}

export async function getFormSchema(id: string): Promise<FormSchema> {
  const res = await fetch(`${API_BASE_URL}/forms/schemas/${id}`);
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.data;
}

export async function listFormSchemas(purpose?: FormPurpose, categoryId?: string, activeOnly: boolean = true): Promise<FormSchema[]> {
  const params = new URLSearchParams();
  if (purpose) params.set('purpose', purpose);
  if (categoryId) params.set('category_id', categoryId);
  if (activeOnly) params.set('active', 'true');

  const res = await fetch(`${API_BASE_URL}/forms/schemas?${params.toString()}`);
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.data || [];
}

export async function getCategoryFormSchema(categoryId: string, purpose: FormPurpose = 'CUSTOMER_OPPORTUNITY'): Promise<FormSchema> {
  const res = await fetch(`${API_BASE_URL}/categories/${categoryId}/form-schema?purpose=${purpose}`);
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.data;
}

export async function publishNewSchemaVersion(id: string, newSchema: Partial<FormSchema>): Promise<FormSchema> {
  const res = await fetch(`${API_BASE_URL}/admin/forms/schemas/${id}/version`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(newSchema),
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.data;
}

export async function submitForm(payload: {
  schema_id: string;
  answers: Record<string, any>;
  entity_id?: string;
  entity_type?: string;
  is_draft?: boolean;
}): Promise<FormSubmission> {
  const res = await fetch(`${API_BASE_URL}/forms/submissions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.data;
}

export async function getFormSubmission(id: string): Promise<FormSubmission> {
  const res = await fetch(`${API_BASE_URL}/forms/submissions/${id}`);
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.data;
}

export async function listSubmissionsByEntity(entityType: string, entityId: string): Promise<FormSubmission[]> {
  const res = await fetch(`${API_BASE_URL}/forms/submissions?entity_type=${entityType}&entity_id=${entityId}`);
  if (!res.ok) throw new Error(await res.text());
  const json = await res.json();
  return json.data || [];
}

