'use client';

import React, { useState, useEffect } from 'react';
import { Category, Opportunity, OpportunityFieldSpec } from '@/lib/api';
import { useCart } from '@/context/CartContext';
import { X, Layers, ShoppingBag, CheckCircle, AlertCircle, Plus, Minus, Tag, MapPin, Calendar, Clock } from 'lucide-react';

interface ServiceDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  category: Category | null;
  opportunity?: Opportunity | null;
}

export default function ServiceDetailModal({
  isOpen,
  onClose,
  category,
  opportunity,
}: ServiceDetailModalProps) {
  const { addToCart } = useCart();
  const [dynamicFormValues, setDynamicFormValues] = useState<Record<string, any>>({});
  const [quantity, setQuantity] = useState<number>(1);
  const [error, setError] = useState<string>('');
  const [addedSuccess, setAddedSuccess] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen && category) {
      setDynamicFormValues({});
      setQuantity(1);
      setError('');
      setAddedSuccess(false);

      // Pre-fill initial dynamic field values if metadata or defaults exist
      const initial: Record<string, any> = {};
      const fields = category.opportunity_fields || [];
      fields.forEach((f) => {
        if (f.options && f.options.length > 0) {
          initial[f.key] = f.options[0];
        }
      });
      if (opportunity?.metadata) {
        Object.assign(initial, opportunity.metadata);
      }
      setDynamicFormValues(initial);
    }
  }, [isOpen, category, opportunity]);

  if (!isOpen || !category) return null;

  const fields: OpportunityFieldSpec[] = category.opportunity_fields || [];

  const handleFieldChange = (key: string, val: any) => {
    setDynamicFormValues((prev) => ({
      ...prev,
      [key]: val,
    }));
    // Sync quantity if a dynamic field key represents quantity
    if (key === 'quantity' || key === 'quantity_bags' || key === 'cargo_weight_tons' || key === 'farm_area_acres') {
      const parsed = parseInt(val, 10);
      if (!isNaN(parsed) && parsed > 0) {
        setQuantity(parsed);
      }
    }
  };

  const handleAddToCartSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validate required dynamic fields according to DB schema
    for (const f of fields) {
      if (f.required && (!dynamicFormValues[f.key] || String(dynamicFormValues[f.key]).trim() === '')) {
        setError(`Please fill in required field: ${f.label}`);
        return;
      }
    }

    // Calculate unit price or estimate
    const unitPrice = opportunity?.budget_max || 500;
    const finalQuantity = Math.max(1, quantity);

    addToCart({
      categoryId: category.id,
      categoryName: category.name,
      categorySlug: category.slug,
      icon: category.icon,
      title: opportunity?.title || `${category.name} Service Order`,
      description: opportunity?.description || category.description,
      quantity: finalQuantity,
      unitPrice: unitPrice,
      totalPrice: unitPrice * finalQuantity,
      dynamicFields: { ...dynamicFormValues },
      addressText: opportunity?.address_text || 'Choutuppal, Telangana 508252',
      lat: opportunity?.lat || 17.25,
      lng: opportunity?.lng || 78.95,
    });

    setAddedSuccess(true);
    setTimeout(() => {
      onClose();
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#0c1220] border border-slate-800 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl space-y-0">
        {/* Header */}
        <div className="p-6 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-blue-400 uppercase tracking-widest block">
                {category.name}
              </span>
              <h2 className="text-lg font-extrabold text-white">
                {opportunity ? opportunity.title : `Order ${category.name}`}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleAddToCartSubmit} className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Description Card */}
          <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 text-xs text-slate-300">
            <p>{opportunity?.description || category.description}</p>
          </div>

          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {addedSuccess && (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
              <CheckCircle className="w-4 h-4 shrink-0" />
              <span>Successfully added to your shopping cart! Opening cart...</span>
            </div>
          )}

          {/* DB-Driven Dynamic Opportunity Fields */}
          {fields.length > 0 ? (
            <div className="space-y-4">
              <span className="text-xs font-bold uppercase text-slate-400 tracking-wider block border-b border-slate-800 pb-2">
                Service Specifications & Customization
              </span>

              {fields.map((field) => (
                <div key={field.key} className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-300">
                    {field.label} {field.required && <span className="text-rose-400">*</span>}
                  </label>

                  {field.type === 'select' ? (
                    <select
                      value={dynamicFormValues[field.key] || ''}
                      onChange={(e) => handleFieldChange(field.key, e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs focus:outline-none focus:border-blue-500"
                      required={field.required}
                    >
                      {field.options?.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : field.type === 'textarea' ? (
                    <textarea
                      rows={2}
                      value={dynamicFormValues[field.key] || ''}
                      onChange={(e) => handleFieldChange(field.key, e.target.value)}
                      placeholder={field.placeholder || `Enter ${field.label}...`}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs focus:outline-none focus:border-blue-500 resize-none"
                      required={field.required}
                    />
                  ) : field.type === 'number' ? (
                    <input
                      type="number"
                      value={dynamicFormValues[field.key] || ''}
                      onChange={(e) => handleFieldChange(field.key, e.target.value)}
                      placeholder={field.placeholder || 'e.g. 100'}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs focus:outline-none focus:border-blue-500 font-mono"
                      required={field.required}
                    />
                  ) : (
                    <input
                      type="text"
                      value={dynamicFormValues[field.key] || ''}
                      onChange={(e) => handleFieldChange(field.key, e.target.value)}
                      placeholder={field.placeholder || `Enter ${field.label}`}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs focus:outline-none focus:border-blue-500"
                      required={field.required}
                    />
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 text-xs text-slate-400 italic text-center">
              Standard category pricing model. Select quantity below to add to your order cart.
            </div>
          )}

          {/* Quantity Selector */}
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-white block">Quantity / Volume</span>
              <span className="text-[11px] text-slate-400">Select order quantity</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center font-bold text-sm transition-colors"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="text-sm font-bold text-white font-mono min-w-[24px] text-center">
                {quantity}
              </span>
              <button
                type="button"
                onClick={() => setQuantity((q) => q + 1)}
                className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center font-bold text-sm transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:opacity-95 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-xl shadow-blue-600/25 flex items-center justify-center gap-2"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Add Item to Order Cart</span>
          </button>
        </form>
      </div>
    </div>
  );
}
