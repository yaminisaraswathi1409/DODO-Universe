'use client';

import React, { useState, useEffect } from 'react';
import { Category, createOpportunity, getCategories, Opportunity, OpportunityFieldSpec, uploadFile, getUserAddresses } from '@/lib/api';
import { X, HelpCircle, Handshake, MapPin, Tag, Calendar, DollarSign, Package, Send, CheckCircle, Upload, FileText, RefreshCw } from 'lucide-react';

interface CreateOpportunityModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultType?: 'NEED' | 'OFFER';
  onCreated?: (opp: Opportunity) => void;
}

export default function CreateOpportunityModal({
  isOpen,
  onClose,
  defaultType = 'NEED',
  onCreated,
}: CreateOpportunityModalProps) {
  const [type, setType] = useState<'NEED' | 'OFFER'>(defaultType);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  
  // Standard fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [addressText, setAddressText] = useState('Choutuppal, Telangana');
  const [lat, setLat] = useState(17.25);
  const [lng, setLng] = useState(78.95);
  const [destination, setDestination] = useState('');
  const [scheduledStart, setScheduledStart] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [priceUnit, setPriceUnit] = useState('FIXED');

  // DB-Driven Dynamic Custom Fields State
  const [customValues, setCustomValues] = useState<Record<string, any>>({});
  const [uploadingFields, setUploadingFields] = useState<Record<string, boolean>>({});

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    setType(defaultType);
  }, [defaultType]);

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
  const dynamicFields: OpportunityFieldSpec[] = selectedCategory?.opportunity_fields || [];

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const quantityVal = customValues['quantity'] || customValues['quantity_bags'] || customValues['cargo_weight_tons'] || customValues['farm_area_acres'];
    const finalTitle = `${selectedCategory?.name || 'Service'} ${type === 'NEED' ? 'Requirement' : 'Offer'}${quantityVal ? ' (' + quantityVal + ' Units)' : ''}`;
    const finalDesc = `${selectedCategory?.name || 'Service'} ${type === 'NEED' ? 'Need' : 'Offer'} request at ${addressText || 'location'}`;

    // Validate required dynamic fields
    for (const field of dynamicFields) {
      if (field.required && (!customValues[field.key] || customValues[field.key].toString().trim() === '')) {
        setError(`Please fill in required field: ${field.label}`);
        return;
      }
    }

    setLoading(true);
    setError('');

    try {
      let storedUser = null;
      if (typeof window !== 'undefined') {
        const u = localStorage.getItem('uop_user');
        if (u) storedUser = JSON.parse(u);
      }

      const quantityVal = customValues['quantity'] || customValues['quantity_needed'] || customValues['quantity_bags'] || customValues['cargo_weight_tons'] || customValues['farm_area_acres'] || customValues['capacity'] || customValues['units'];
      const pickupVal = customValues['pickup_location'] || addressText;
      const destVal = customValues['destination_location'] || destination;
      const dateVal = customValues['required_date'] || scheduledStart;
      const budgetVal = customValues['budget_amount'] || budgetMax;

      const payload: Partial<Opportunity> & { user_id?: string; metadata?: Record<string, any> } = {
        type,
        category_id: selectedCategory?.id || selectedCategoryId || undefined,
        title: finalTitle,
        description: finalDesc,
        workflow_model: type === 'NEED' ? 'MULTI_LAYER' : 'INSTANT',
        address_text: pickupVal || 'Choutuppal, Telangana',
        lat: lat || 17.25,
        lng: lng || 78.95,
        radius_km: 25,
        budget_max: budgetVal ? parseFloat(budgetVal) : undefined,
        price_unit: priceUnit,
        scheduled_start: dateVal ? new Date(dateVal).toISOString() : undefined,
        user_id: storedUser?.id || undefined,
        metadata: {
          custom_fields: customValues,
          category_slug: selectedCategory?.slug,
          category_name: selectedCategory?.name,
          quantity: quantityVal ? parseInt(quantityVal, 10) || quantityVal : undefined,
          destination: destVal ? destVal.trim() : undefined,
          ...customValues,
        },
      };

      const created = await createOpportunity(payload);
      if (created) {
        setSuccess(true);
        setTimeout(() => {
          setSuccess(false);
          if (onCreated) onCreated(created);
          onClose();
        }, 1200);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create opportunity. Please check details.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-[#0d1322] border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl my-8">
        <button
          onClick={onClose}
          className="absolute top-6 right-6 p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
              type === 'NEED' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
            }`}>
              {type === 'NEED' ? 'I Need Help' : 'I Can Offer'}
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">
            {type === 'NEED' ? 'Create a Real Need' : 'Create a Real Offer'}
          </h2>
          <p className="text-slate-400 text-sm mt-1">
            {type === 'NEED' 
              ? 'Post your dynamic requirement to connect with real providers.' 
              : 'Post your availability, fleet, goods, or services.'}
          </p>
        </div>

        {/* Type Switcher Tabs */}
        <div className="grid grid-cols-2 gap-2 p-1.5 bg-slate-900/80 rounded-2xl border border-slate-800 mb-6">
          <button
            type="button"
            onClick={() => setType('NEED')}
            className={`py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
              type === 'NEED' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            <HelpCircle className="w-4 h-4" />
            <span>I Need Help</span>
          </button>
          <button
            type="button"
            onClick={() => setType('OFFER')}
            className={`py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all ${
              type === 'OFFER' ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Handshake className="w-4 h-4" />
            <span>I Can Offer</span>
          </button>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-sm">
            {error}
          </div>
        )}

        {success ? (
          <div className="py-12 text-center space-y-4">
            <CheckCircle className="w-16 h-16 text-emerald-400 mx-auto animate-bounce" />
            <h3 className="text-2xl font-bold text-white">Opportunity Created Successfully!</h3>
            <p className="text-slate-400 text-sm">Published to the live PostgreSQL marketplace feed.</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Category Select */}
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-400 mb-1 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-blue-400" />
                <span>Select Service Category *</span>
              </label>
              <select
                value={selectedCategoryId}
                onChange={(e) => setSelectedCategoryId(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-slate-900/90 border border-slate-800 text-slate-200 text-sm focus:outline-none focus:border-blue-500 font-semibold"
              >
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name} ({cat.slug})
                  </option>
                ))}
              </select>
            </div>

            {/* DB-Driven Dynamic Category Fields Section */}
            {dynamicFields.length > 0 && (
              <div className="pt-2 border-t border-slate-800/80 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                    <FileText className="w-4 h-4" />
                    <span>Dynamic Category Specifications ({selectedCategory?.name})</span>
                  </h4>
                  <span className="text-[10px] text-slate-500 font-mono">Configured in DB</span>
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  {dynamicFields.map((field) => {
                    const value = customValues[field.key];
                    const isUploading = uploadingFields[field.key];

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
                        ) : field.type === 'datetime' || field.type === 'date' ? (
                          <input
                            type={field.type === 'datetime' ? 'datetime-local' : 'date'}
                            value={value || ''}
                            onChange={(e) => handleCustomFieldChange(field.key, e.target.value)}
                            className="w-full px-4 py-3 rounded-xl bg-slate-900/90 border border-slate-800 text-slate-200 text-sm focus:outline-none focus:border-purple-500"
                            required={field.required}
                          />
                        ) : field.type === 'textarea' ? (
                          <textarea
                            rows={3}
                            placeholder={field.placeholder || `Enter ${field.label}`}
                            value={value || ''}
                            onChange={(e) => handleCustomFieldChange(field.key, e.target.value)}
                            className="w-full px-4 py-3 rounded-xl bg-slate-900/90 border border-slate-800 text-slate-200 text-sm focus:outline-none focus:border-purple-500"
                            required={field.required}
                          />
                        ) : (field.type === 'photo' || field.type === 'video' || field.type === 'file') ? (
                          <div className="space-y-2">
                            <div className="flex items-center gap-3">
                              <label className="cursor-pointer px-4 py-2.5 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 text-xs font-bold flex items-center gap-2 transition-all">
                                {isUploading ? (
                                  <>
                                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    <span>Uploading...</span>
                                  </>
                                ) : (
                                  <>
                                    <Upload className="w-3.5 h-3.5" />
                                    <span>Upload {field.label}</span>
                                  </>
                                )}
                                <input
                                  type="file"
                                  accept={field.type === 'photo' ? 'image/*' : field.type === 'video' ? 'video/*' : '*/*'}
                                  onChange={(e) => {
                                    if (e.target.files && e.target.files[0]) {
                                      handleFileUpload(field.key, e.target.files[0]);
                                    }
                                  }}
                                  className="hidden"
                                />
                              </label>
                              {value && (
                                <span className="text-xs font-mono text-emerald-400 truncate max-w-[200px]">✓ Uploaded ({value})</span>
                              )}
                            </div>
                          </div>
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

            {/* Submit Buttons */}
            <div className="pt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-3 rounded-xl border border-slate-800 text-slate-400 hover:text-white font-semibold text-sm transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className={`px-6 py-3 rounded-xl font-bold text-sm text-white flex items-center gap-2 shadow-lg transition-all ${
                  type === 'NEED' 
                    ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 shadow-blue-600/30' 
                    : 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-600/30'
                }`}
              >
                <Send className="w-4 h-4" />
                <span>{loading ? 'Publishing...' : `Publish ${type === 'NEED' ? 'Need' : 'Offer'}`}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
