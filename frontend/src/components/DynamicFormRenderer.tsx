'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { FormSchema, FormFieldSpec } from '@/lib/formsApi';
import { evaluateFormRules } from '@/components/ConditionalFieldController';
import DynamicFieldRenderer from '@/components/DynamicFieldRenderer';
import { AlertCircle, CheckCircle, Send, Save, ArrowRight } from 'lucide-react';

interface DynamicFormRendererProps {
  schema: FormSchema;
  initialValues?: Record<string, any>;
  onSubmit: (answers: Record<string, any>, isDraft: boolean) => Promise<void>;
  isSubmitting?: boolean;
  submitButtonText?: string;
  allowDraft?: boolean;
  disabled?: boolean;
}

export default function DynamicFormRenderer({
  schema,
  initialValues = {},
  onSubmit,
  isSubmitting = false,
  submitButtonText = 'Submit Application',
  allowDraft = true,
  disabled = false,
}: DynamicFormRendererProps) {
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);

  // Initialize values
  useEffect(() => {
    const defaults: Record<string, any> = {};
    for (const f of schema.fields || []) {
      if (initialValues[f.key] !== undefined) {
        defaults[f.key] = initialValues[f.key];
      } else if (f.default_value !== undefined && f.default_value !== null) {
        defaults[f.key] = f.default_value;
      }
    }
    setAnswers(defaults);
  }, [schema, initialValues]);

  // Evaluate conditional rules whenever answers change
  const { visibleFields, requiredFields } = useMemo(() => {
    return evaluateFormRules(schema.rules || [], answers);
  }, [schema.rules, answers]);

  const handleFieldChange = (key: string, val: any) => {
    setAnswers((prev) => {
      const next = { ...prev, [key]: val };
      return next;
    });
    // Clear error on change
    if (errors[key]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    for (const f of schema.fields || []) {
      const isVisible = visibleFields[f.key] !== false;
      if (!isVisible) continue;

      const isRequired = requiredFields[f.key] !== undefined ? requiredFields[f.key] : f.required;
      const val = answers[f.key];
      const hasVal = val !== undefined && val !== null && String(val).trim() !== '';

      if (isRequired && !hasVal) {
        newErrors[f.key] = `${f.label} is required`;
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);

    if (!validate()) {
      setGeneralError('Please complete all required fields correctly before submitting.');
      return;
    }

    // Filter out hidden fields so stale values are not submitted
    const sanitizedAnswers: Record<string, any> = {};
    for (const [k, v] of Object.entries(answers)) {
      if (visibleFields[k] !== false) {
        sanitizedAnswers[k] = v;
      }
    }

    try {
      await onSubmit(sanitizedAnswers, false);
    } catch (err: any) {
      setGeneralError(err.message || 'Submission failed');
    }
  };

  const handleDraftSave = async () => {
    setGeneralError(null);
    try {
      await onSubmit(answers, true);
    } catch (err: any) {
      setGeneralError(err.message || 'Draft saving failed');
    }
  };

  // Group fields by sections
  const sections = useMemo(() => {
    const defaultSection = { id: 'default', title: '', displayOrder: 0 };
    const secMap = new Map<string, { title: string; description?: string; fields: FormFieldSpec[] }>();

    for (const sec of schema.sections || []) {
      secMap.set(sec.id, { title: sec.title, description: sec.description, fields: [] });
    }

    if (!secMap.has('default')) {
      secMap.set('default', { title: 'General Details', fields: [] });
    }

    for (const f of schema.fields || []) {
      const isVisible = visibleFields[f.key] !== false;
      if (!isVisible) continue;

      const secId = f.section_id || 'default';
      const targetSec = secMap.get(secId) || secMap.get('default')!;
      targetSec.fields.push(f);
    }

    return Array.from(secMap.entries()).filter(([_, s]) => s.fields.length > 0);
  }, [schema.sections, schema.fields, visibleFields]);

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Schema Header */}
      {schema.description && (
        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
          <p className="text-xs text-slate-600 font-medium">{schema.description}</p>
        </div>
      )}

      {generalError && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 flex items-center gap-3 text-rose-700 text-xs font-bold">
          <AlertCircle className="w-5 h-5 shrink-0 text-rose-600" />
          <span>{generalError}</span>
        </div>
      )}

      {/* Render Sections */}
      <div className="space-y-6">
        {sections.map(([secId, sec]) => (
          <div key={secId} className="p-5 rounded-2xl border border-slate-200 bg-white shadow-sm space-y-4">
            {sec.title && (
              <div className="border-b border-slate-100 pb-2.5">
                <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">{sec.title}</h3>
                {sec.description && <p className="text-xs text-slate-500 mt-0.5">{sec.description}</p>}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sec.fields.map((f) => (
                <div
                  key={f.key}
                  className={
                    f.type === 'TEXTAREA' || f.type === 'ADDRESS' || f.type === 'LOCATION'
                      ? 'md:col-span-2'
                      : 'col-span-1'
                  }
                >
                  <DynamicFieldRenderer
                    field={{
                      ...f,
                      required: requiredFields[f.key] !== undefined ? requiredFields[f.key] : f.required,
                    }}
                    value={answers[f.key]}
                    onChange={(val) => handleFieldChange(f.key, val)}
                    error={errors[f.key]}
                    disabled={disabled || isSubmitting}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-200">
        {allowDraft && (
          <button
            type="button"
            onClick={handleDraftSave}
            disabled={disabled || isSubmitting}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 font-bold text-xs flex items-center justify-center gap-2 transition disabled:opacity-50"
          >
            <Save className="w-4 h-4 text-slate-500" />
            <span>Save Draft</span>
          </button>
        )}

        <button
          type="submit"
          disabled={disabled || isSubmitting}
          className="w-full sm:w-auto px-7 py-3 rounded-xl bg-slate-900 hover:bg-black text-white font-extrabold text-xs shadow-md flex items-center justify-center gap-2 transition disabled:opacity-50 ml-auto"
        >
          <span>{isSubmitting ? 'Submitting...' : submitButtonText}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </form>
  );
}

