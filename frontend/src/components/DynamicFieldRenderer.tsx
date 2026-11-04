'use client';

import React, { useState } from 'react';
import { FormFieldSpec } from '@/lib/formsApi';
import { uploadFile } from '@/lib/api';
import {
  Upload,
  CheckCircle,
  AlertCircle,
  FileText,
  Image as ImageIcon,
  MapPin,
  Calendar,
  Clock,
  Loader2,
  Trash2,
} from 'lucide-react';

interface DynamicFieldRendererProps {
  field: FormFieldSpec;
  value: any;
  onChange: (val: any) => void;
  error?: string;
  disabled?: boolean;
}

export default function DynamicFieldRenderer({
  field,
  value,
  onChange,
  error,
  disabled = false,
}: DynamicFieldRendererProps) {
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size limit if configured
    if (field.validation?.max_file_size_mb) {
      const sizeMB = file.size / (1024 * 1024);
      if (sizeMB > field.validation.max_file_size_mb) {
        setUploadError(`File exceeds maximum size of ${field.validation.max_file_size_mb} MB`);
        return;
      }
    }

    setUploading(true);
    setUploadError(null);
    try {
      const res = await uploadFile(file);
      onChange(res.url);
    } catch (err: any) {
      setUploadError(err.message || 'File upload failed');
    } finally {
      setUploading(false);
    }
  };

  const renderFieldInput = () => {
    switch (field.type) {
      case 'TEXT':
      case 'EMAIL':
      case 'PHONE':
      case 'URL':
        return (
          <input
            type={field.type === 'EMAIL' ? 'email' : field.type === 'PHONE' ? 'tel' : 'text'}
            value={value !== undefined && value !== null ? value : ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
            disabled={disabled}
            className={`w-full px-4 py-2.5 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 ${
              error
                ? 'border-rose-300 focus:ring-rose-400 bg-rose-50/20'
                : 'border-slate-200 focus:ring-slate-900 bg-white'
            }`}
          />
        );

      case 'TEXTAREA':
        return (
          <textarea
            rows={3}
            value={value !== undefined && value !== null ? value : ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder || `Enter detailed ${field.label.toLowerCase()}...`}
            disabled={disabled}
            className={`w-full px-4 py-2.5 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 resize-none ${
              error
                ? 'border-rose-300 focus:ring-rose-400 bg-rose-50/20'
                : 'border-slate-200 focus:ring-slate-900 bg-white'
            }`}
          />
        );

      case 'NUMBER':
      case 'DECIMAL':
      case 'CURRENCY':
        return (
          <div className="relative">
            {field.type === 'CURRENCY' && (
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">
                ₹
              </span>
            )}
            <input
              type="number"
              step={field.type === 'NUMBER' ? '1' : '0.01'}
              min={field.validation?.min}
              max={field.validation?.max}
              value={value !== undefined && value !== null ? value : ''}
              onChange={(e) => {
                const val = e.target.value;
                onChange(val === '' ? '' : parseFloat(val));
              }}
              placeholder={field.placeholder || '0'}
              disabled={disabled}
              className={`w-full py-2.5 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 ${
                field.type === 'CURRENCY' ? 'pl-8 pr-4' : 'px-4'
              } ${
                error
                  ? 'border-rose-300 focus:ring-rose-400 bg-rose-50/20'
                  : 'border-slate-200 focus:ring-slate-900 bg-white'
              }`}
            />
          </div>
        );

      case 'QUANTITY': {
        const qtyVal = typeof value === 'object' && value !== null ? value.quantity : value || '';
        const unitVal = typeof value === 'object' && value !== null ? value.unit : field.unit_options?.[0] || 'pieces';
        return (
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              min="1"
              value={qtyVal}
              onChange={(e) => {
                const val = e.target.value === '' ? '' : parseFloat(e.target.value);
                onChange(typeof value === 'object' ? { ...value, quantity: val } : { quantity: val, unit: unitVal });
              }}
              placeholder="Quantity"
              disabled={disabled}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
            />
            {field.unit_options && field.unit_options.length > 0 ? (
              <select
                value={unitVal}
                onChange={(e) => {
                  onChange({ quantity: qtyVal, unit: e.target.value });
                }}
                disabled={disabled}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
              >
                {field.unit_options.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={unitVal}
                onChange={(e) => {
                  onChange({ quantity: qtyVal, unit: e.target.value });
                }}
                placeholder="Unit (e.g. piece, kg)"
                disabled={disabled}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            )}
          </div>
        );
      }

      case 'SELECT':
        return (
          <select
            value={value !== undefined && value !== null ? value : ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className={`w-full px-4 py-2.5 rounded-xl border text-sm transition-all focus:outline-none focus:ring-2 bg-white ${
              error
                ? 'border-rose-300 focus:ring-rose-400 bg-rose-50/20'
                : 'border-slate-200 focus:ring-slate-900'
            }`}
          >
            <option value="">-- Select an option --</option>
            {field.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        );

      case 'MULTI_SELECT': {
        const selectedArr: string[] = Array.isArray(value) ? value : [];
        return (
          <div className="space-y-1.5 p-3 rounded-xl border border-slate-200 bg-slate-50/50 max-h-48 overflow-y-auto">
            {field.options?.map((opt) => {
              const isChecked = selectedArr.includes(opt.value);
              return (
                <label
                  key={opt.value}
                  className="flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-white cursor-pointer transition text-xs font-semibold text-slate-800"
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) => {
                      if (e.target.checked) {
                        onChange([...selectedArr, opt.value]);
                      } else {
                        onChange(selectedArr.filter((v) => v !== opt.value));
                      }
                    }}
                    disabled={disabled}
                    className="rounded border-slate-300 text-slate-900 focus:ring-slate-900 w-4 h-4"
                  />
                  <span>{opt.label}</span>
                </label>
              );
            })}
          </div>
        );
      }

      case 'RADIO':
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
            {field.options?.map((opt) => {
              const isSelected = value === opt.value;
              return (
                <label
                  key={opt.value}
                  className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer transition text-xs font-bold ${
                    isSelected
                      ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                      : 'border-slate-200 hover:border-slate-300 text-slate-700 bg-white'
                  }`}
                >
                  <input
                    type="radio"
                    name={field.key}
                    value={opt.value}
                    checked={isSelected}
                    onChange={() => onChange(opt.value)}
                    disabled={disabled}
                    className="sr-only"
                  />
                  <div
                    className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                      isSelected ? 'border-white bg-white' : 'border-slate-300'
                    }`}
                  >
                    {isSelected && <div className="w-1.5 h-1.5 rounded-full bg-slate-900" />}
                  </div>
                  <span>{opt.label}</span>
                </label>
              );
            })}
          </div>
        );

      case 'CHECKBOX':
        return (
          <label className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50/50 cursor-pointer hover:bg-slate-100 transition">
            <input
              type="checkbox"
              checked={Boolean(value)}
              onChange={(e) => onChange(e.target.checked)}
              disabled={disabled}
              className="rounded border-slate-300 text-slate-900 focus:ring-slate-900 w-4 h-4"
            />
            <span className="text-xs font-bold text-slate-800">{field.placeholder || 'Enable this option'}</span>
          </label>
        );

      case 'DATE':
      case 'TIME':
      case 'DATETIME':
        return (
          <div className="relative">
            <input
              type={field.type === 'DATE' ? 'date' : field.type === 'TIME' ? 'time' : 'datetime-local'}
              value={value !== undefined && value !== null ? value : ''}
              onChange={(e) => onChange(e.target.value)}
              disabled={disabled}
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
            />
          </div>
        );

      case 'FILE':
      case 'IMAGE':
      case 'PDF':
      case 'VIDEO':
        return (
          <div className="space-y-2">
            {value ? (
              <div className="flex items-center justify-between p-3 rounded-xl border border-emerald-200 bg-emerald-50/50">
                <div className="flex items-center gap-2.5 overflow-hidden">
                  <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
                  <a
                    href={value}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-bold text-emerald-900 truncate hover:underline"
                  >
                    {value}
                  </a>
                </div>
                {!disabled && (
                  <button
                    type="button"
                    onClick={() => onChange('')}
                    className="p-1 rounded-lg text-slate-400 hover:text-rose-600 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:border-slate-400 hover:bg-slate-50 transition group">
                {uploading ? (
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                    <Loader2 className="w-4 h-4 animate-spin text-slate-900" />
                    <span>Uploading file...</span>
                  </div>
                ) : (
                  <>
                    <Upload className="w-5 h-5 text-slate-400 group-hover:text-slate-700 mb-1 transition" />
                    <span className="text-xs font-bold text-slate-700">Click to upload {field.label}</span>
                    <span className="text-[10px] text-slate-400">
                      {field.type === 'IMAGE' ? 'PNG, JPG, WEBP' : field.type === 'PDF' ? 'PDF document' : 'Supported format'}
                    </span>
                  </>
                )}
                <input
                  type="file"
                  onChange={handleFileUpload}
                  disabled={disabled || uploading}
                  accept={
                    field.type === 'IMAGE'
                      ? 'image/*'
                      : field.type === 'PDF'
                      ? 'application/pdf'
                      : field.type === 'VIDEO'
                      ? 'video/*'
                      : undefined
                  }
                  className="hidden"
                />
              </label>
            )}
            {uploadError && <p className="text-[11px] text-rose-500 font-semibold">{uploadError}</p>}
          </div>
        );

      case 'LOCATION':
      case 'ADDRESS':
        return (
          <div className="relative">
            <MapPin className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={typeof value === 'object' && value !== null ? value.address || '' : value || ''}
              onChange={(e) => {
                if (field.type === 'LOCATION') {
                  onChange({ address: e.target.value, lat: 0, lng: 0 });
                } else {
                  onChange(e.target.value);
                }
              }}
              placeholder={field.placeholder || 'Enter complete address or landmark'}
              disabled={disabled}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900 bg-white"
            />
          </div>
        );

      default:
        return (
          <input
            type="text"
            value={value !== undefined && value !== null ? value : ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm"
          />
        );
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-extrabold text-slate-800">
          {field.label}
          {field.required && <span className="text-rose-500 ml-1">*</span>}
        </label>
      </div>

      {field.help_text && <p className="text-[11px] text-slate-500 font-medium">{field.help_text}</p>}

      {renderFieldInput()}

      {error && (
        <div className="flex items-center gap-1.5 text-rose-600 text-xs font-semibold pt-0.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

