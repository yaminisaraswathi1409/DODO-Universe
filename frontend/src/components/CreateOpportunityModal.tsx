'use client';

import React, { useState, useEffect } from 'react';
import { Category, createOpportunity, getCategories, Opportunity, OpportunityFieldSpec, uploadFile, getUserAddresses } from '@/lib/api';
import { X, HelpCircle, Handshake, MapPin, Tag, Calendar, DollarSign, Package, Send, CheckCircle, Upload, FileText, RefreshCw, Truck, Edit2, ArrowLeft } from 'lucide-react';

interface CreateOpportunityModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultType?: 'NEED' | 'OFFER';
  initialCategoryId?: string;
  onCreated?: (opp: Opportunity) => void;
}

export default function CreateOpportunityModal({
  isOpen,
  onClose,
  defaultType = 'NEED',
  initialCategoryId,
  onCreated,
}: CreateOpportunityModalProps) {
  const [type, setType] = useState<'NEED' | 'OFFER'>(defaultType);
  const [step, setStep] = useState<'FORM' | 'REVIEW'>('FORM');
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState(initialCategoryId || '');

  // Requirement form fields
  const [quantity, setQuantity] = useState('350');
  const [unit, setUnit] = useState('Pieces');
  const [addressText, setAddressText] = useState('Choutuppal, Telangana');
  const [lat, setLat] = useState(17.25);
  const [lng, setLng] = useState(78.95);
  const [scheduledStart, setScheduledStart] = useState('');
  const [description, setDescription] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [priceUnit, setPriceUnit] = useState('FIXED');

  // Commute Offer Route Fields State
  const [originAddr, setOriginAddr] = useState('Lingotam, Telangana');
  const [destAddr, setDestAddr] = useState('Choutuppal, Telangana');
  const [travelFreq, setTravelFreq] = useState('DAILY');
  const [travelMode, setTravelMode] = useState('BIKE');
  const [travelTime, setTravelTime] = useState('08:00 AM - 09:00 AM');

  // DB-Driven Dynamic Custom Fields State
  const [customValues, setCustomValues] = useState<Record<string, any>>({});
  const [uploadingFields, setUploadingFields] = useState<Record<string, boolean>>({});

  // Transport Arrangement Choice State
  const [transportOption, setTransportOption] = useState<'NEED_TRANSPORT' | 'OWN_VEHICLE' | 'ARRANGE_MYSELF'>('NEED_TRANSPORT');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (initialCategoryId) {
      setSelectedCategoryId(initialCategoryId);
    }
  }, [initialCategoryId]);

  useEffect(() => {
    setType(defaultType);
    setStep('FORM');
  }, [defaultType, isOpen]);

  // Lock background body scrolling ONLY when modal is open
  useEffect(() => {
    if (!isOpen) return;
    const origOverflow = document.body.style.overflow;
    const origDocOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = origOverflow;
      document.documentElement.style.overflow = origDocOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    async function loadCatsAndAddress() {
      const cats = await getCategories();
      setCategories(cats);
      if (cats.length > 0 && !selectedCategoryId) {
        setSelectedCategoryId(cats[0].id);
      }

      // Auto-load user's saved default address if available
      if (typeof window !== 'undefined') {
        const uStr = localStorage.getItem('uop_user');
        if (uStr) {
          try {
            const u = JSON.parse(uStr);
            if (u?.id) {
              const userAddrs = await getUserAddresses(u.id);
              if (userAddrs && userAddrs.length > 0) {
                const def = userAddrs.find((a) => a.is_default) || userAddrs[0];
                setAddressText(def.address_text);
                setLat(def.lat);
                setLng(def.lng);
              } else if (u.address_text) {
                setAddressText(u.address_text);
                setLat(u.lat || 17.25);
                setLng(u.lng || 78.95);
              }
            }
          } catch {
            // ignore
          }
        }
      }
    }
    if (isOpen) {
      loadCatsAndAddress();
    }
  }, [isOpen]);

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId || c.slug === selectedCategoryId);

  // Auto-set default unit based on category
  useEffect(() => {
    if (selectedCategory) {
      const slug = (selectedCategory.slug || '').toLowerCase();
      if (slug.includes('brick')) setUnit('Pieces');
      else if (slug.includes('cement')) setUnit('Bags');
      else if (slug.includes('labour') || slug.includes('driver')) setUnit('Days');
      else if (slug.includes('transport') || slug.includes('vehicle')) setUnit('Trips');
      else setUnit('Pieces');
    }
  }, [selectedCategory]);

  const dynamicFields: OpportunityFieldSpec[] = (selectedCategory?.opportunity_fields || []).filter(
    (f) => f.key !== 'quantity' && f.key !== 'delivery_access' && f.label !== 'Site Access Type'
  );
  const activeResources = (selectedCategory?.resources || []).filter(
    (r: any) => r.active && r.requirement_level !== 'NOT_APPLICABLE'
  );

  if (!isOpen) return null;

  const handleCustomFieldChange = (key: string, val: any) => {
    setCustomValues((prev) => ({ ...prev, [key]: val }));
  };

  const handleFileUpload = async (fieldKey: string, file: File) => {
    setUploadingFields((prev) => ({ ...prev, [fieldKey]: true }));
    try {
      const res = await uploadFile(file);
      handleCustomFieldChange(fieldKey, res.url);
    } catch (err: any) {
      alert(`File upload failed: ${err.message || 'Error'}`);
    } finally {
      setUploadingFields((prev) => ({ ...prev, [fieldKey]: false }));
    }
  };

  const handleContinueToReview = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (type === 'NEED') {
      if (!quantity || parseFloat(quantity) <= 0) {
        setError('Please enter a valid quantity.');
        return;
      }
      if (!addressText.trim()) {
        setError('Please select or enter a delivery/service location.');
        return;
      }
      for (const field of dynamicFields) {
        if (field.required && (!customValues[field.key] || customValues[field.key].toString().trim() === '')) {
          setError(`Please fill in required field: ${field.label}`);
          return;
        }
      }
    }

    setStep('REVIEW');
  };

  const handleSubmit = async () => {
    const finalTitle = `${selectedCategory?.name || 'Service'} ${type === 'NEED' ? 'Requirement' : 'Offer'}${quantity ? ' (' + quantity + ' ' + unit + ')' : ''}`;
    const finalDesc = description || `${selectedCategory?.name || 'Service'} ${type === 'NEED' ? 'Need' : 'Offer'} request at ${addressText || 'location'}`;

    setLoading(true);
    setError('');

    try {
      let storedUser = null;
      if (typeof window !== 'undefined') {
        const u = localStorage.getItem('uop_user');
        if (u) storedUser = JSON.parse(u);
      }

      const payload: Partial<Opportunity> & { user_id?: string; metadata?: Record<string, any> } = {
        type,
        category_id: selectedCategory?.id || selectedCategoryId || undefined,
        title: type === 'OFFER' ? `Commute Route Offer: ${originAddr} ↔ ${destAddr}` : finalTitle,
        description: type === 'OFFER' ? `Daily commuter route travel between ${originAddr} and ${destAddr} (${travelMode})` : finalDesc,
        workflow_model: type === 'NEED' ? 'MULTI_LAYER' : 'INSTANT',
        address_text: type === 'OFFER' ? originAddr : (addressText || 'Choutuppal, Telangana'),
        lat: lat || 17.25,
        lng: lng || 78.95,
        radius_km: 25,
        budget_max: budgetMax ? parseFloat(budgetMax) : undefined,
        price_unit: priceUnit,
        scheduled_start: scheduledStart ? new Date(scheduledStart).toISOString() : undefined,
        user_id: storedUser?.id || undefined,
        metadata: {
          custom_fields: { ...customValues, quantity, unit },
          category_slug: selectedCategory?.slug,
          category_name: selectedCategory?.name,
          quantity: parseFloat(quantity) || 1,
          unit: unit,
          transport_option: transportOption,
          transport_charge: transportOption === 'NEED_TRANSPORT' ? 2500 : 0,
          destination: destAddr ? destAddr.trim() : undefined,
          origin_address: originAddr,
          origin_lat: 17.22,
          origin_lng: 78.90,
          destination_address: destAddr,
          destination_lat: 17.25,
          destination_lng: 78.95,
          travel_frequency: travelFreq,
          travel_mode: travelMode,
          travel_time: travelTime,
          is_active: true,
          ...customValues,
        },
      };

      const created = await createOpportunity(payload);
      if (created) {
        setSuccess(true);
        setTimeout(() => {
          setSuccess(false);
          setStep('FORM');
          if (onCreated) onCreated(created);
          onClose();
        }, 1200);
      }
    } catch (err: any) {
      let errMsg = err?.message || 'Failed to create opportunity. Please check details.';
      if (typeof errMsg === 'string' && errMsg.startsWith('{')) {
        try {
          const parsed = JSON.parse(errMsg);
          errMsg = parsed.error || parsed.message || errMsg;
        } catch {
          // ignore
        }
      }
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-2 sm:p-4 overflow-hidden">
      <div className="relative w-full max-w-2xl max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)] my-auto bg-[#0d1322] border border-slate-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        
        {/* Modal Fixed Header */}
        <div className="p-5 sm:p-6 border-b border-slate-800/80 flex-none relative bg-[#0d1322]/95 backdrop-blur-sm">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors z-10"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>

          <h2 className="text-xl sm:text-2xl font-extrabold text-white uppercase tracking-tight">
            {step === 'REVIEW'
              ? 'YOUR REQUEST'
              : `REQUEST ${selectedCategory?.name || 'SERVICE'}`}
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            {step === 'REVIEW'
              ? 'Review your requirement details before submitting.'
              : 'Enter your requirement details below.'}
          </p>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-5 sm:p-6 space-y-6">

        {error && (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">
            {error}
          </div>
        )}

        {success ? (
          <div className="py-12 text-center space-y-4">
            <CheckCircle className="w-16 h-16 text-emerald-400 mx-auto animate-bounce" />
            <h3 className="text-2xl font-bold text-white">Request Submitted Successfully!</h3>
            <p className="text-slate-400 text-sm">Matching eligible local providers for your request...</p>
          </div>
        ) : step === 'FORM' ? (
          /* ========================================================================= */
          /* STEP 2 — REQUIREMENT FORM */
          /* ========================================================================= */
          <form id="create-opportunity-form" onSubmit={handleContinueToReview} className="space-y-5">
            {/* Quantity and Unit */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                  Quantity *
                </label>
                <input
                  type="number"
                  min="1"
                  step="any"
                  placeholder="e.g. 350"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm font-semibold focus:outline-none focus:border-blue-500 font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                  Unit *
                </label>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm font-semibold focus:outline-none focus:border-blue-500"
                >
                  <option value="Pieces">Pieces</option>
                  <option value="Bags">Bags</option>
                  <option value="Tons">Tons</option>
                  <option value="Square Feet">Square Feet</option>
                  <option value="Hours">Hours</option>
                  <option value="Days">Days</option>
                  <option value="Trips">Trips</option>
                  <option value="Units">Units</option>
                </select>
              </div>
            </div>

            {/* Delivery / Service Location */}
            <div>
              <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                Delivery / Service Location *
              </label>
              <input
                type="text"
                placeholder="Select Location"
                value={addressText}
                onChange={(e) => setAddressText(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm font-semibold focus:outline-none focus:border-blue-500"
                required
              />
            </div>

            {/* When do you need it? */}
            <div>
              <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                When do you need it?
              </label>
              <input
                type="date"
                value={scheduledStart}
                onChange={(e) => setScheduledStart(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm font-semibold focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Additional Requirements */}
            <div>
              <label className="block text-xs font-bold uppercase text-slate-300 mb-1">
                Additional Requirements
              </label>
              <textarea
                rows={3}
                placeholder="Describe what you need..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-700 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Dynamic Category Specifications (if configured in DB) */}
            {dynamicFields.length > 0 && (
              <div className="pt-3 border-t border-slate-800/80 space-y-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                  <FileText className="w-4 h-4" />
                  <span>Category Specifications</span>
                </h4>

                <div className="grid sm:grid-cols-2 gap-4">
                  {dynamicFields.map((field) => {
                    const value = customValues[field.key];

                    return (
                      <div key={field.key} className={`space-y-1 ${field.type === 'textarea' || field.type === 'location' ? 'sm:col-span-2' : ''}`}>
                        <label className="block text-xs font-semibold uppercase text-slate-300">
                          {field.label} {field.required && <span className="text-rose-400">*</span>}
                        </label>

                        {field.type === 'select' ? (
                          <select
                            value={value || ''}
                            onChange={(e) => handleCustomFieldChange(field.key, e.target.value)}
                            className="w-full px-4 py-3 rounded-xl bg-slate-900/90 border border-slate-800 text-slate-200 text-sm focus:outline-none focus:border-purple-500"
                            required={field.required}
                          >
                            <option value="">-- Select {field.label} --</option>
                            {field.options?.map((opt) => (
                              <option key={opt} value={opt}>{opt}</option>
                            ))}
                          </select>
                        ) : field.type === 'number' ? (
                          <input
                            type="number"
                            placeholder={field.placeholder || `Enter ${field.label}`}
                            value={value || ''}
                            onChange={(e) => handleCustomFieldChange(field.key, e.target.value)}
                            className="w-full px-4 py-3 rounded-xl bg-slate-900/90 border border-slate-800 text-slate-200 text-sm focus:outline-none focus:border-purple-500"
                            required={field.required}
                          />
                        ) : (
                          <input
                            type="text"
                            placeholder={field.placeholder || `Enter ${field.label}`}
                            value={value || ''}
                            onChange={(e) => handleCustomFieldChange(field.key, e.target.value)}
                            className="w-full px-4 py-3 rounded-xl bg-slate-900/90 border border-slate-800 text-slate-200 text-sm focus:outline-none focus:border-purple-500"
                            required={field.required}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </form>
        ) : (
          /* ========================================================================= */
          /* STEP 3 — REVIEW / SUBMIT */
          /* ========================================================================= */
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-4">
              <div className="border-b border-slate-800 pb-3">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Service</span>
                <span className="text-lg font-extrabold text-white">{selectedCategory?.name || 'Service'}</span>
              </div>

              <div className="grid grid-cols-2 gap-4 border-b border-slate-800 pb-3">
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Quantity</span>
                  <span className="text-sm font-extrabold text-emerald-400 font-mono">{quantity} {unit}</span>
                </div>

                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Date</span>
                  <span className="text-sm font-semibold text-slate-200">
                    {scheduledStart ? new Date(scheduledStart).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'As soon as needed'}
                  </span>
                </div>
              </div>

              <div className="border-b border-slate-800 pb-3">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Location</span>
                <span className="text-sm font-semibold text-slate-200">{addressText}</span>
              </div>

              <div>
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Requirements</span>
                <span className="text-sm text-slate-300 leading-relaxed">{description || 'Need delivery to construction site.'}</span>
              </div>

              {Object.keys(customValues).length > 0 && (
                <div className="pt-2 border-t border-slate-800 space-y-1">
                  <span className="text-[11px] font-bold text-purple-400 uppercase tracking-wider block">Specifications</span>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {Object.entries(customValues).map(([k, v]) => (
                      <div key={k} className="p-2 rounded bg-slate-950/60 border border-slate-800">
                        <span className="text-slate-500 block text-[10px] uppercase font-mono">{k}</span>
                        <span className="text-slate-200 font-semibold">{String(v)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        </div>

        {/* Modal Fixed Footer with Action Buttons */}
        {!success && (
          <div className="p-4 sm:p-5 border-t border-slate-800/80 bg-[#0a0f1d] flex items-center justify-between gap-4 flex-none">
            {step === 'FORM' ? (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-3 rounded-xl border border-slate-800 text-slate-400 hover:text-white font-semibold text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="create-opportunity-form"
                  className="px-6 py-3 rounded-xl font-bold text-sm text-white bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-600/30 transition-all"
                >
                  CONTINUE
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setStep('FORM')}
                  className="px-5 py-3 rounded-xl border border-slate-700 hover:border-slate-500 text-slate-300 font-bold text-sm inline-flex items-center gap-2 transition-all"
                >
                  <Edit2 className="w-4 h-4" />
                  <span>EDIT</span>
                </button>

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading}
                  className="px-8 py-3.5 rounded-xl font-extrabold text-sm text-white bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:from-blue-500 hover:to-indigo-500 shadow-xl shadow-blue-600/30 flex items-center gap-2 transition-all"
                >
                  <Send className="w-4 h-4" />
                  <span>{loading ? 'SUBMITTING...' : 'SUBMIT REQUEST'}</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
