'use client';

import React, { useState } from 'react';
import {
  FormSchema,
  FormFieldSpec,
  FormFieldType,
  FormPurpose,
  createFormSchema,
  publishNewSchemaVersion,
} from '@/lib/formsApi';
import { Category } from '@/lib/api';
import {
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Layers,
  Save,
  CheckCircle,
  AlertCircle,
  Eye,
  Sliders,
  HelpCircle,
  X,
} from 'lucide-react';
import DynamicFormRenderer from './DynamicFormRenderer';

interface AdminFormBuilderProps {
  categories: Category[];
  existingSchema?: FormSchema | null;
  onSaveSuccess: (schema: FormSchema) => void;
  onClose?: () => void;
}

const SUPPORTED_TYPES: { type: FormFieldType; label: string }[] = [
  { type: 'TEXT', label: 'Single-line Text' },
  { type: 'TEXTAREA', label: 'Long Description (Textarea)' },
  { type: 'NUMBER', label: 'Whole Number' },
  { type: 'DECIMAL', label: 'Decimal Number' },
  { type: 'EMAIL', label: 'Email' },
  { type: 'PHONE', label: 'Phone Number' },
  { type: 'DATE', label: 'Date' },
  { type: 'TIME', label: 'Time' },
  { type: 'DATETIME', label: 'Date & Time' },
  { type: 'SELECT', label: 'Single Select (Dropdown)' },
  { type: 'MULTI_SELECT', label: 'Multiple Select (Checkboxes)' },
  { type: 'RADIO', label: 'Radio Choice Buttons' },
  { type: 'CHECKBOX', label: 'Single Boolean Checkbox' },
  { type: 'FILE', label: 'File Upload (Any)' },
  { type: 'IMAGE', label: 'Image Upload' },
  { type: 'PDF', label: 'PDF Upload' },
  { type: 'VIDEO', label: 'Video Upload' },
  { type: 'URL', label: 'Web URL' },
  { type: 'LOCATION', label: 'Location / Coordinates' },
  { type: 'QUANTITY', label: 'Quantity with Unit' },
  { type: 'CURRENCY', label: 'Price (INR)' },
  { type: 'ADDRESS', label: 'Physical Address' },
];

export default function AdminFormBuilder({
  categories,
  existingSchema,
  onSaveSuccess,
  onClose,
}: AdminFormBuilderProps) {
  const [title, setTitle] = useState(existingSchema?.title || '');
  const [description, setDescription] = useState(existingSchema?.description || '');
  const [purpose, setPurpose] = useState<FormPurpose>(existingSchema?.purpose || 'VENDOR_CATALOG_OFFERING');
  const [categoryId, setCategoryId] = useState<string>(existingSchema?.category_id || '');
  const [fields, setFields] = useState<FormFieldSpec[]>(existingSchema?.fields || []);

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // Field editing state
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const handleAddField = () => {
    const newField: FormFieldSpec = {
      key: `field_${Date.now()}`,
      label: 'New Field',
      type: 'TEXT',
      required: false,
      display_order: fields.length + 1,
    };
    setFields([...fields, newField]);
    setEditingIndex(fields.length);
  };

  const handleRemoveField = (idx: number) => {
    setFields(fields.filter((_, i) => i !== idx));
    if (editingIndex === idx) setEditingIndex(null);
  };

  const handleMoveField = (idx: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= fields.length) return;
    const updated = [...fields];
    const temp = updated[idx];
    updated[idx] = updated[targetIdx];
    updated[targetIdx] = temp;
    setFields(updated);
  };

  const handleFieldChange = (idx: number, key: keyof FormFieldSpec, val: any) => {
    const updated = [...fields];
    updated[idx] = { ...updated[idx], [key]: val };
    setFields(updated);
  };

  const handleSave = async () => {
    setErrorMsg(null);
    if (!title.trim()) {
      setErrorMsg('Please enter a form title');
      return;
    }
    if (fields.length === 0) {
      setErrorMsg('Please add at least one field to the form');
      return;
    }

    setSaving(true);
    try {
      const payload: Partial<FormSchema> = {
        title: title.trim(),
        description: description.trim(),
        purpose,
        category_id: categoryId || undefined,
        fields,
        rules: [],
        sections: [
          { id: 'general', title: 'General Specifications', display_order: 1 },
        ],
        is_active: true,
      };

      let result: FormSchema;
      if (existingSchema?.id) {
        result = await publishNewSchemaVersion(existingSchema.id, payload);
      } else {
        result = await createFormSchema(payload);
      }

      onSaveSuccess(result);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save form schema');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
      {/* Header */}
      <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-slate-900 text-white">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-extrabold text-slate-900">
              {existingSchema ? `Edit Schema (v${existingSchema.version})` : 'Create Dynamic Form Schema'}
            </h2>
            <p className="text-xs text-slate-500">Configure reusable fields, validation, and conditions</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 text-xs font-bold flex items-center gap-1.5 transition"
          >
            <Eye className="w-4 h-4 text-slate-500" />
            <span>{showPreview ? 'Exit Preview' : 'Live Preview'}</span>
          </button>
          {onClose && (
            <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:text-slate-700">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="mx-6 mt-4 p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-center gap-2 text-rose-700 text-xs font-bold">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Body */}
      <div className="p-6 overflow-y-auto space-y-6 flex-1">
        {showPreview ? (
          <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50/30">
            <div className="mb-4 pb-2 border-b border-slate-200">
              <h3 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">Preview Mode</h3>
            </div>
            <DynamicFormRenderer
              schema={{
                id: 'preview',
                title,
                description,
                purpose,
                version: 1,
                is_active: true,
                sections: [{ id: 'general', title: 'Specifications', display_order: 1 }],
                fields,
                rules: [],
                created_at: '',
                updated_at: '',
              }}
              onSubmit={async (val) => alert('Preview Submission:\n' + JSON.stringify(val, null, 2))}
              submitButtonText="Test Submit"
            />
          </div>
        ) : (
          <>
            {/* Meta Configuration */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-extrabold text-slate-800 block mb-1">Form Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Bricks & Blocks Product Specs"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div>
                <label className="text-xs font-extrabold text-slate-800 block mb-1">Form Purpose</label>
                <select
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value as FormPurpose)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
                >
                  <option value="VENDOR_CATALOG_OFFERING">Vendor Catalog Offering</option>
                  <option value="CUSTOMER_OPPORTUNITY">Customer Opportunity / Order Request</option>
                  <option value="VENDOR_CATEGORY_APPLICATION">Vendor Category Application</option>
                  <option value="MAIN_SERVICE_APPLICATION">Main Service Application</option>
                  <option value="DOCUMENT_VERIFICATION">Document Verification</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-extrabold text-slate-800 block mb-1">Associated Platform Category</label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
                >
                  <option value="">-- All Categories / Unassigned --</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.slug})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-extrabold text-slate-800 block mb-1">Description / Instructions</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Instructions displayed at top of form..."
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
            </div>

            {/* Field List */}
            <div className="space-y-4 pt-4 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-slate-900">Form Fields ({fields.length})</h3>
                <button
                  type="button"
                  onClick={handleAddField}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-900 text-white font-bold text-xs flex items-center gap-1.5 hover:bg-black transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Field</span>
                </button>
              </div>

              {fields.length === 0 ? (
                <div className="p-8 text-center rounded-2xl border border-dashed border-slate-200 text-slate-400 text-xs">
                  No fields added yet. Click &quot;Add Field&quot; to configure your dynamic form.
                </div>
              ) : (
                <div className="space-y-3">
                  {fields.map((f, idx) => (
                    <div
                      key={f.key + idx}
                      className="p-4 rounded-2xl border border-slate-200 bg-white shadow-sm space-y-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 text-[10px] font-extrabold flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <span className="text-xs font-extrabold text-slate-900">{f.label || 'Untitled Field'}</span>
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-bold">
                            {f.type}
                          </span>
                          {f.required && (
                            <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 text-[10px] font-bold">
                              Required
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onClick={() => handleMoveField(idx, 'up')}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 disabled:opacity-20"
                          >
                            <ArrowUp className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === fields.length - 1}
                            onClick={() => handleMoveField(idx, 'down')}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 disabled:opacity-20"
                          >
                            <ArrowDown className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveField(idx)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Config Row */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
                        <div>
                          <label className="text-[10px] font-extrabold text-slate-500 uppercase block mb-1">
                            Field Label
                          </label>
                          <input
                            type="text"
                            value={f.label}
                            onChange={(e) => handleFieldChange(idx, 'label', e.target.value)}
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:ring-1 focus:ring-slate-900"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-extrabold text-slate-500 uppercase block mb-1">
                            Field Key (DB attribute)
                          </label>
                          <input
                            type="text"
                            value={f.key}
                            onChange={(e) => handleFieldChange(idx, 'key', e.target.value)}
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:ring-1 focus:ring-slate-900 font-mono"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-extrabold text-slate-500 uppercase block mb-1">
                            Field Type
                          </label>
                          <select
                            value={f.type}
                            onChange={(e) => handleFieldChange(idx, 'type', e.target.value as FormFieldType)}
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:ring-1 focus:ring-slate-900 bg-white"
                          >
                            {SUPPORTED_TYPES.map((t) => (
                              <option key={t.type} value={t.type}>
                                {t.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Options row for select/radio */}
                      {(f.type === 'SELECT' || f.type === 'MULTI_SELECT' || f.type === 'RADIO') && (
                        <div className="pt-2">
                          <label className="text-[10px] font-extrabold text-slate-500 uppercase block mb-1">
                            Choices (Comma-separated)
                          </label>
                          <input
                            type="text"
                            placeholder="Red Clay, Fly Ash, Concrete Block, AAC"
                            value={f.options?.map((o) => o.label).join(', ') || ''}
                            onChange={(e) => {
                              const opts = e.target.value
                                .split(',')
                                .map((s) => s.trim())
                                .filter(Boolean)
                                .map((s) => ({ label: s, value: s }));
                              handleFieldChange(idx, 'options', opts);
                            }}
                            className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-xs focus:ring-1 focus:ring-slate-900"
                          />
                        </div>
                      )}

                      <div className="flex items-center gap-4 pt-1">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={f.required}
                            onChange={(e) => handleFieldChange(idx, 'required', e.target.checked)}
                            className="rounded border-slate-300 text-slate-900 focus:ring-slate-900 w-3.5 h-3.5"
                          />
                          <span className="text-xs font-bold text-slate-700">Required field</span>
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-100"
          >
            Cancel
          </button>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-7 py-2.5 rounded-xl bg-slate-900 text-white font-extrabold text-xs shadow-md hover:bg-black transition flex items-center gap-2 ml-auto"
        >
          <Save className="w-4 h-4" />
          <span>{saving ? 'Publishing...' : existingSchema ? 'Publish New Version' : 'Publish Schema'}</span>
        </button>
      </div>
    </div>
  );
}
