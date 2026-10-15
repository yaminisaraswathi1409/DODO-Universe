'use client';

import React, { useState, useEffect } from 'react';
import { Category, createOpportunity, getCategories, Opportunity, OpportunityFieldSpec, uploadFile, getUserAddresses } from '@/lib/api';
import { X, HelpCircle, Handshake, MapPin, Tag, Calendar, DollarSign, Package, Send, CheckCircle, Upload, FileText, RefreshCw, Truck, Edit2, ArrowLeft, ShieldCheck, Check, Info, Sparkles, User, Wrench, Loader2 } from 'lucide-react';

interface CreateOpportunityModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultType?: 'NEED' | 'OFFER';
  initialCategoryId?: string;
  initialQuantity?: number | string;
  initialUnit?: string;
  initialCustomValues?: Record<string, any>;
  onCreated?: (opp: Opportunity) => void;
}

export default function CreateOpportunityModal({
  isOpen,
  onClose,
  defaultType = 'NEED',
  initialCategoryId,
  initialQuantity,
  initialUnit,
  initialCustomValues,
  onCreated,
}: CreateOpportunityModalProps) {
  const [type, setType] = useState<'NEED' | 'OFFER'>(defaultType);
  const [step, setStep] = useState<'FORM' | 'REVIEW'>('FORM');
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingCats, setLoadingCats] = useState(false);
  const [catsError, setCatsError] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState(initialCategoryId || '');

  // Requirement form fields
  const [quantity, setQuantity] = useState(initialQuantity ? String(initialQuantity) : '750');
  const [unit, setUnit] = useState(initialUnit || 'Pieces');
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
  const [customValues, setCustomValues] = useState<Record<string, any>>(initialCustomValues || {});
  const [uploadingFields, setUploadingFields] = useState<Record<string, boolean>>({});

  // Dynamic Resource Choice State (Key -> Choice string e.g. "NO_VEHICLE" or "HAVE_VEHICLE")
  const [resourceChoices, setResourceChoices] = useState<Record<string, string>>({});
  // Dynamic Resource Detail Values State (Key -> FieldKey -> Value)
  const [resourceFieldValues, setResourceFieldValues] = useState<Record<string, Record<string, string>>>({});

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [createdOppResult, setCreatedOppResult] = useState<Opportunity | null>(null);

  // Compute canonical unique categories deduplicated by normalized slug
  const uniqueCategories = React.useMemo(() => {
    const seen = new Set<string>();
    return categories.filter((c) => {
      const s = (c.slug || '').toLowerCase().trim();
      if (!s || seen.has(s)) return false;
      seen.add(s);
      return true;
    });
  }, [categories]);

  // Handle switching categories: resets ONLY category-specific custom values and resources that are no longer applicable
  const handleCategoryChange = (newCatId: string) => {
    const newCat = categories.find((c) => c.id === newCatId || c.slug === newCatId);
    const targetId = newCat ? newCat.id : newCatId;
    setSelectedCategoryId(targetId);

    // 1. Reset category-specific fields: retain ONLY fields defined in newCat.opportunity_fields
    const validFieldKeys = new Set((newCat?.opportunity_fields || []).map((f) => f.key));
    setCustomValues((prev) => {
      const next: Record<string, any> = {};
      for (const [k, v] of Object.entries(prev)) {
        if (validFieldKeys.has(k)) {
          next[k] = v;
        }
      }
      return next;
    });

    // 2. Reset resource choices: retain only choices for resources active in newCat
    const validActiveResources = (newCat?.resources || []).filter(
      (r: any) => r.active && r.requirement_level !== 'NOT_APPLICABLE'
    );
    const validResKeys = new Set(validActiveResources.map((r: any) => r.key));

    setResourceChoices((prev) => {
      const next: Record<string, string> = {};
      validActiveResources.forEach((r: any) => {
        const existingChoice = prev[r.key];
        const hasOption = r.options && r.options.some((opt: any) => opt.key === existingChoice);
        if (existingChoice && hasOption) {
          next[r.key] = existingChoice;
        } else if (r.options && r.options.length > 0) {
          next[r.key] = r.options[0].key;
        } else {
          next[r.key] = `NEED_${r.key.toUpperCase()}`;
        }
      });
      return next;
    });

    // 3. Reset resource detail values: retain only for active resources in newCat
    setResourceFieldValues((prev) => {
      const next: Record<string, Record<string, string>> = {};
      for (const [resKey, details] of Object.entries(prev)) {
        if (validResKeys.has(resKey)) {
          const resDef = validActiveResources.find((r: any) => r.key === resKey);
          const validDetailKeys = new Set((resDef?.fields || []).map((f: any) => f.key));
          const filteredDetails: Record<string, string> = {};
          for (const [dk, dv] of Object.entries(details)) {
            if (validDetailKeys.has(dk)) {
              filteredDetails[dk] = dv;
            }
          }
          if (Object.keys(filteredDetails).length > 0) {
            next[resKey] = filteredDetails;
          }
        }
      }
      return next;
    });

    // 4. Update default unit based on new category if initialUnit wasn't explicit
    if (newCat && !initialUnit) {
      const slug = (newCat.slug || '').toLowerCase();
      if (slug.includes('brick')) setUnit('Pieces');
      else if (slug.includes('cement')) setUnit('Bags');
      else if (slug.includes('labour') || slug.includes('driver')) setUnit('Days');
      else if (slug.includes('transport') || slug.includes('vehicle')) setUnit('Trips');
      else setUnit('Pieces');
    }
  };

  useEffect(() => {
    if (initialCategoryId && categories.length > 0) {
      const matched = categories.find((c) => c.id === initialCategoryId || c.slug === initialCategoryId);
      if (matched) {
        handleCategoryChange(matched.id);
      }
    } else if (initialCategoryId) {
      setSelectedCategoryId(initialCategoryId);
    }
    if (initialQuantity) {
      setQuantity(String(initialQuantity));
    }
    if (initialUnit) {
      setUnit(initialUnit);
    }
    if (initialCustomValues) {
      setCustomValues(initialCustomValues);
    }
  }, [initialCategoryId, initialQuantity, initialUnit, initialCustomValues, categories.length]);

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

  const loadCatsAndAddress = async () => {
    setLoadingCats(true);
    setCatsError(null);
    try {
      const cats = await getCategories();
      setCategories(cats);

      // Determine initial selection
      let defaultId = '';
      if (initialCategoryId) {
        const found = cats.find((c) => c.id === initialCategoryId || c.slug === initialCategoryId);
        if (found) defaultId = found.id;
      }
      if (!defaultId && selectedCategoryId) {
        const found = cats.find((c) => c.id === selectedCategoryId || c.slug === selectedCategoryId);
        if (found) defaultId = found.id;
      }
      if (!defaultId && cats.length > 0) {
        defaultId = cats[0].id;
      }
      if (defaultId) {
        setSelectedCategoryId(defaultId);
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
    } catch (err: any) {
      setCatsError(err.message || 'Failed to load service categories.');
    } finally {
      setLoadingCats(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadCatsAndAddress();
    }
  }, [isOpen]);

  const selectedCategory = uniqueCategories.find((c) => c.id === selectedCategoryId || c.slug === selectedCategoryId);

  // Auto-set default unit based on category if not explicitly provided
  useEffect(() => {
    if (selectedCategory && !initialUnit) {
      const slug = (selectedCategory.slug || '').toLowerCase();
      if (slug.includes('brick')) setUnit('Pieces');
      else if (slug.includes('cement')) setUnit('Bags');
      else if (slug.includes('labour') || slug.includes('driver')) setUnit('Days');
      else if (slug.includes('transport') || slug.includes('vehicle')) setUnit('Trips');
      else setUnit('Pieces');
    }
  }, [selectedCategory, initialUnit]);

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

  const handleResourceChoiceChange = (resKey: string, choiceKey: string) => {
    setResourceChoices((prev) => ({ ...prev, [resKey]: choiceKey }));
    // If switching away from "I have it", clear old detail fields so they aren't incorrectly treated as current information
    if (!choiceKey.startsWith('HAVE_')) {
      setResourceFieldValues((prev) => {
        const updated = { ...prev };
        delete updated[resKey];
        return updated;
      });
    }
  };

  const handleResourceDetailChange = (resKey: string, fieldKey: string, val: string) => {
    setResourceFieldValues((prev) => ({
      ...prev,
      [resKey]: {
        ...(prev[resKey] || {}),
        [fieldKey]: val,
      },
    }));
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
      for (const res of activeResources) {
        const choice = resourceChoices[res.key] || (res.options && res.options.length > 0 ? res.options[0].key : `NEED_${res.key.toUpperCase()}`);
        if (choice.startsWith('HAVE_') && res.fields) {
          const detailMap = resourceFieldValues[res.key] || {};
          for (const rf of res.fields) {
            if (rf.required && (!detailMap[rf.key] || detailMap[rf.key].trim() === '')) {
              setError(`Please provide ${rf.label} for your ${res.name}.`);
              return;
            }
          }
        }
      }
    }

    setStep('REVIEW');
  };

  const handleSubmit = async () => {
    const finalTitle = `${selectedCategory?.name || 'Service'} Request (${quantity ? quantity + ' ' + unit : 'Custom Requirement'})`;
    const finalDesc = description || `${selectedCategory?.name || 'Service'} request for ${quantity} ${unit} at ${addressText || 'location'}`;

    setLoading(true);
    setError('');

    try {
      let storedUser = null;
      if (typeof window !== 'undefined') {
        const u = localStorage.getItem('uop_user');
        if (u) storedUser = JSON.parse(u);
      }

      // Build structured resource selections map for active resources in this category
      const resourceSelectionsMap: Record<string, any> = {};
      activeResources.forEach((res: any) => {
        const defaultChoice = (res.options && res.options.length > 0) ? res.options[0].key : `NEED_${res.key.toUpperCase()}`;
        const choice = resourceChoices[res.key] || defaultChoice;
        const hasResource = choice.startsWith('HAVE_');
        const details = hasResource ? (resourceFieldValues[res.key] || {}) : null;

        resourceSelectionsMap[res.key] = {
          resource_id: res.id,
          resource_key: res.key,
          resource_name: res.name,
          requirement_level: res.requirement_level,
          choice: choice,
          has_resource: hasResource,
          need_provider_to_arrange: !hasResource,
          details: details,
        };
      });

      // Filter custom field values to only those explicitly defined for this category
      const validFieldKeys = new Set(dynamicFields.map((f: any) => f.key));
      const sanitizedCustomValues: Record<string, any> = {};
      Object.keys(customValues).forEach((k) => {
        if (validFieldKeys.has(k) && customValues[k] !== undefined && customValues[k] !== '') {
          sanitizedCustomValues[k] = customValues[k];
        }
      });

      // Inject backward-compatible legacy resource flags
      const legacyResourceFlags: Record<string, any> = {};
      activeResources.forEach((res: any) => {
        const choice = resourceChoices[res.key] || (res.options && res.options.length > 0 ? res.options[0].key : `NEED_${res.key.toUpperCase()}`);
        legacyResourceFlags[res.key + '_option'] = choice;
        legacyResourceFlags['resource_' + res.key] = choice;
        if (res.name) {
          const norm = res.name.toLowerCase().trim().replace(/\s+/g, '_');
          legacyResourceFlags[norm + '_option'] = choice;
          legacyResourceFlags['resource_' + norm] = choice;
        }
      });

      const matchedCat = selectedCategory || categories.find((c) => c.id === selectedCategoryId || c.slug === selectedCategoryId);
      const effectiveCatId = matchedCat?.id || selectedCategoryId || undefined;

      const payload: Partial<Opportunity> & { user_id?: string; metadata?: Record<string, any> } = {
        type,
        order_mode: 'GENERAL_BROADCAST',
        category_id: effectiveCatId,
        quantity: quantity ? parseFloat(quantity) : undefined,
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
          custom_fields: { ...sanitizedCustomValues, quantity, unit },
          category_id: effectiveCatId,
          category_slug: matchedCat?.slug || selectedCategory?.slug,
          category_name: matchedCat?.name || selectedCategory?.name,
          quantity: parseFloat(quantity) || (quantity ? parseFloat(quantity) : 1),
          quantity_needed: parseFloat(quantity) || undefined,
          unit: unit,
          resource_selections: resourceSelectionsMap,
          ...legacyResourceFlags,
          // Legacy backwards compatible fields for vehicle/driver if present
          has_vehicle: resourceSelectionsMap['vehicle']?.has_resource,
          has_driver: resourceSelectionsMap['driver']?.has_resource,
          vehicle_details: resourceSelectionsMap['vehicle']?.details,
          driver_details: resourceSelectionsMap['driver']?.details,
          destination: destAddr ? destAddr.trim() : undefined,
          origin_address: originAddr,
          travel_frequency: travelFreq,
          travel_mode: travelMode,
          travel_time: travelTime,
          is_active: true,
          ...sanitizedCustomValues,
        },
      };

      const created = await createOpportunity(payload);
      if (created) {
        setCreatedOppResult(created);
        setSuccess(true);
        setTimeout(() => {
          setSuccess(false);
          setStep('FORM');
          if (onCreated) onCreated(created);
          onClose();
        }, 2200);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4 overflow-hidden">
      <div className="relative w-full max-w-2xl max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)] my-auto bg-white border border-slate-200 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-900">
        
        {/* Modal Fixed Header */}
        <div className="p-5 sm:p-6 border-b border-slate-200 flex-none relative bg-white/95 backdrop-blur-sm">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 p-2 rounded-full text-slate-500 hover:text-black hover:bg-slate-100 transition-colors z-10"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-full bg-slate-100 border border-slate-300 text-black font-black text-[10px] uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-black" />
              <span>MODEL 2 — REQUEST WHAT YOU NEED</span>
            </span>
          </div>

          <h2 className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tight mt-1">
            {step === 'REVIEW'
              ? 'REVIEW YOUR CUSTOM REQUIREMENT'
              : `REQUEST ${selectedCategory?.name || 'SERVICE'}`}
          </h2>
          <p className="text-slate-600 text-xs mt-0.5">
            {step === 'REVIEW'
              ? 'Review your requirement & resource details before submitting to all eligible vendors.'
              : 'Describe your custom requirement. We will route it to all eligible approved vendors.'}
          </p>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-5 sm:p-6 space-y-6">

        {error && (
          <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-semibold flex items-center gap-2">
            <Info className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
        )}

        {success ? (
          <div className="py-12 text-center space-y-4">
            <CheckCircle className="w-16 h-16 text-black mx-auto animate-bounce" />
            {createdOppResult?.metadata?.eligible_vendor_count === 0 ? (
              <>
                <h3 className="text-2xl font-black text-slate-900">Request Saved & Awaiting Eligible Vendors</h3>
                <p className="text-slate-600 text-sm max-w-md mx-auto">
                  Your request has been created and saved. There are currently no active vendors for {selectedCategory?.name || 'this service'} in your area. Eligible vendors will be able to review and respond as soon as they become active.
                </p>
              </>
            ) : (
              <>
                <h3 className="text-2xl font-black text-slate-900">
                  {createdOppResult?.metadata?.eligible_vendor_count
                    ? `Request Sent to ${createdOppResult.metadata.eligible_vendor_count} Eligible Vendor(s)!`
                    : 'Request Sent to All Eligible Vendors!'}
                </h3>
                <p className="text-slate-600 text-sm">
                  Approved providers for {selectedCategory?.name || 'this service'} have received your request and can review it in their dashboard.
                </p>
              </>
            )}
          </div>
        ) : step === 'FORM' ? (
          /* ========================================================================= */
          /* STEP 1 — REQUIREMENT FORM */
          /* ========================================================================= */
          <form id="create-opportunity-form" onSubmit={handleContinueToReview} className="space-y-6">
            
            {/* Category Selector */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Main Service / Category *
                </label>
                {loadingCats && (
                  <span className="text-[11px] text-slate-500 flex items-center gap-1 font-medium">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-black" />
                    <span>Loading services...</span>
                  </span>
                )}
              </div>

              {catsError ? (
                <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-semibold flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Info className="w-4 h-4 text-rose-500 shrink-0" />
                    <span>{catsError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => loadCatsAndAddress()}
                    className="px-2.5 py-1 rounded bg-white border border-rose-300 text-rose-800 text-[11px] font-bold hover:bg-rose-100 transition-colors"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <select
                  value={selectedCategoryId}
                  onChange={(e) => handleCategoryChange(e.target.value)}
                  disabled={loadingCats || uniqueCategories.length === 0}
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-sm font-bold focus:outline-none focus:border-black disabled:opacity-60 disabled:cursor-not-allowed"
                  required
                >
                  {uniqueCategories.length === 0 ? (
                    <option value="">No categories available</option>
                  ) : (
                    uniqueCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))
                  )}
                </select>
              )}
            </div>

            {/* Dynamic Material Specifications & Fields (Configured in DB) */}
            {dynamicFields.length > 0 && (
              <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200 space-y-4 shadow-sm">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5 border-b border-slate-200 pb-2">
                  <FileText className="w-4 h-4 text-black" />
                  <span>{selectedCategory?.name} Specifications</span>
                </h4>

                <div className="grid sm:grid-cols-2 gap-4">
                  {dynamicFields.map((field) => {
                    const value = customValues[field.key];

                    return (
                      <div key={field.key} className={`space-y-1 ${field.type === 'textarea' || field.type === 'location' ? 'sm:col-span-2' : ''}`}>
                        <label className="block text-xs font-semibold text-slate-700">
                          {field.label} {field.required && <span className="text-black font-bold">*</span>}
                        </label>

                        {field.type === 'select' ? (
                          <select
                            value={value || ''}
                            onChange={(e) => handleCustomFieldChange(field.key, e.target.value)}
                            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs font-semibold focus:outline-none focus:border-black"
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
                            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs font-mono focus:outline-none focus:border-black"
                            required={field.required}
                          />
                        ) : (
                          <input
                            type="text"
                            placeholder={field.placeholder || `Enter ${field.label}`}
                            value={value || ''}
                            onChange={(e) => handleCustomFieldChange(field.key, e.target.value)}
                            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-black"
                            required={field.required}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Quantity and Unit */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                  Required Quantity *
                </label>
                <input
                  type="number"
                  min="1"
                  step="any"
                  placeholder="e.g. 750"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-sm font-semibold focus:outline-none focus:border-black font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                  Unit *
                </label>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-sm font-semibold focus:outline-none focus:border-black"
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

            {/* Dynamic "I Have It / I Do Not Have It" Resource Cards */}
            {activeResources.length > 0 && (
              <div className="space-y-4 pt-2">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                  <Truck className="w-4 h-4 text-black" />
                  <span>Resource Availability & Logistics Arrangements</span>
                </h4>

                {activeResources.map((res: any) => {
                  const defaultChoice = (res.options && res.options.length > 0) ? res.options[0].key : `NEED_${res.key.toUpperCase()}`;
                  const currentChoice = resourceChoices[res.key] || defaultChoice;
                  const isHaveIt = currentChoice.startsWith('HAVE_');
                  const detailValues = resourceFieldValues[res.key] || {};

                  return (
                    <div key={res.id || res.key} className="p-4 sm:p-5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h5 className="text-xs font-extrabold text-slate-900 uppercase tracking-wide">{res.name || res.key}</h5>
                          <p className="text-[11px] text-slate-500">{res.description || `Indicate if you have ${res.name} or need provider to arrange.`}</p>
                        </div>
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${isHaveIt ? 'bg-black text-white' : 'bg-slate-200 text-slate-800'}`}>
                          {isHaveIt ? 'I HAVE IT' : 'PROVIDER ARRANGES'}
                        </span>
                      </div>

                      {/* Resource Radio / Choice buttons */}
                      <div className="grid sm:grid-cols-2 gap-2 text-xs">
                        {(res.options || [
                          { key: `NEED_${res.key.toUpperCase()}`, label: `1. I do not have ${res.name}`, description: `Vendor / platform arranges ${res.name}` },
                          { key: `HAVE_${res.key.toUpperCase()}`, label: `2. I have my own ${res.name}`, description: `Customer provides details` },
                        ]).map((opt: any) => {
                          const isSelected = currentChoice === opt.key;
                          return (
                            <button
                              key={opt.key}
                              type="button"
                              onClick={() => handleResourceChoiceChange(res.key, opt.key)}
                              className={`p-3 rounded-xl border text-left transition-all flex flex-col justify-between ${isSelected ? 'bg-black text-white border-black font-bold shadow-sm' : 'bg-white text-slate-900 border-slate-300 hover:border-slate-400'}`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-xs">{opt.label}</span>
                                {isSelected && <Check className="w-4 h-4 shrink-0 text-white" />}
                              </div>
                              {opt.description && (
                                <span className={`text-[10px] mt-1 ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>
                                  {opt.description}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {/* Revealed Detail Fields if "I HAVE IT" is selected */}
                      {isHaveIt && res.fields && res.fields.length > 0 && (
                        <div className="mt-3 p-3.5 rounded-xl bg-white border border-slate-300 space-y-3 animate-in fade-in duration-150">
                          <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">
                            Provide your {res.name} Details *
                          </span>
                          <div className="grid sm:grid-cols-2 gap-3 text-xs">
                            {res.fields.map((rf: any) => (
                              <div key={rf.key} className="space-y-1">
                                <label className="block text-[11px] font-semibold text-slate-700">
                                  {rf.label} {rf.required && <span className="text-black font-bold">*</span>}
                                </label>
                                {rf.type === 'select' ? (
                                  <select
                                    value={detailValues[rf.key] || ''}
                                    onChange={(e) => handleResourceDetailChange(res.key, rf.key, e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 text-xs font-semibold focus:outline-none focus:border-black"
                                    required={rf.required}
                                  >
                                    <option value="">-- Select {rf.label} --</option>
                                    {(rf.options || []).map((o: string) => (
                                      <option key={o} value={o}>{o}</option>
                                    ))}
                                  </select>
                                ) : (
                                  <input
                                    type="text"
                                    placeholder={rf.placeholder || `Enter ${rf.label}`}
                                    value={detailValues[rf.key] || ''}
                                    onChange={(e) => handleResourceDetailChange(res.key, rf.key, e.target.value)}
                                    className="w-full px-3 py-2 rounded-lg bg-slate-50 border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-black"
                                    required={rf.required}
                                  />
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Delivery / Service Location */}
            <div>
              <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                Delivery / Service Location *
              </label>
              <input
                type="text"
                placeholder="Enter location address"
                value={addressText}
                onChange={(e) => setAddressText(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-sm font-semibold focus:outline-none focus:border-black"
                required
              />
            </div>

            {/* Required Date */}
            <div>
              <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                Required Date / Delivery Date
              </label>
              <input
                type="date"
                value={scheduledStart}
                onChange={(e) => setScheduledStart(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-sm font-semibold focus:outline-none focus:border-black"
              />
            </div>

            {/* Additional Notes */}
            <div>
              <label className="block text-xs font-bold uppercase text-slate-700 mb-1">
                Additional Notes / Special Instructions
              </label>
              <textarea
                rows={3}
                placeholder="Enter any additional specifications or instructions for vendors..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-slate-50 border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-black"
              />
            </div>
          </form>
        ) : (
          /* ========================================================================= */
          /* STEP 2 — REVIEW / SUBMIT */
          /* ========================================================================= */
          <div className="space-y-6">
            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
              <div className="border-b border-slate-200 pb-3">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Service Category</span>
                <span className="text-lg font-black text-slate-900">{selectedCategory?.name || 'Service'}</span>
              </div>

              <div className="grid grid-cols-2 gap-4 border-b border-slate-200 pb-3">
                <div>
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Requested Quantity</span>
                  <span className="text-sm font-black text-slate-900 font-mono">{quantity} {unit}</span>
                </div>

                <div>
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Target Date</span>
                  <span className="text-sm font-semibold text-slate-900">
                    {scheduledStart ? new Date(scheduledStart).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'As soon as possible'}
                  </span>
                </div>
              </div>

              <div className="border-b border-slate-200 pb-3">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Delivery Location</span>
                <span className="text-sm font-semibold text-slate-900">{addressText}</span>
              </div>

              {dynamicFields.length > 0 && dynamicFields.some((f) => customValues[f.key] !== undefined && customValues[f.key] !== '') && (
                <div className="border-b border-slate-200 pb-3 space-y-1">
                  <span className="text-[11px] font-bold text-slate-900 uppercase tracking-wider block">Category Specifications</span>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {dynamicFields
                      .filter((f) => customValues[f.key] !== undefined && customValues[f.key] !== '')
                      .map((f) => (
                        <div key={f.key} className="p-2 rounded bg-white border border-slate-200">
                          <span className="text-slate-500 block text-[10px] uppercase font-mono">{f.label || f.key}</span>
                          <span className="text-slate-900 font-semibold">{String(customValues[f.key])}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {activeResources.length > 0 && (
                <div>
                  <span className="text-[11px] font-bold text-slate-900 uppercase tracking-wider block mb-2">Resource Selections</span>
                  <div className="space-y-2 text-xs">
                    {activeResources.map((res: any) => {
                      const choice = resourceChoices[res.key] || (res.options && res.options.length > 0 ? res.options[0].key : `NEED_${res.key.toUpperCase()}`);
                      const isHave = choice.startsWith('HAVE_');
                      const details = resourceFieldValues[res.key];

                      return (
                        <div key={res.key} className="p-3 rounded-xl bg-white border border-slate-200 flex flex-col gap-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900">{res.name}</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isHave ? 'bg-black text-white' : 'bg-slate-100 text-slate-800 border border-slate-300'}`}>
                              {isHave ? 'CUSTOMER PROVIDED' : 'NEEDED FROM VENDOR'}
                            </span>
                          </div>
                          {isHave && details && Object.keys(details).length > 0 && (
                            <div className="mt-1 text-[11px] text-slate-600 font-mono">
                              {Object.entries(details).map(([dk, dv]) => `${dk}: ${dv}`).join(' | ')}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">Additional Notes</span>
                <span className="text-sm text-slate-700 leading-relaxed">{description || 'No additional notes provided.'}</span>
              </div>
            </div>
          </div>
        )}
        </div>

        {/* Modal Fixed Footer */}
        {!success && (
          <div className="p-4 sm:p-5 border-t border-slate-200 bg-white flex items-center justify-between gap-4 flex-none">
            {step === 'FORM' ? (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-3 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="create-opportunity-form"
                  className="px-6 py-3 rounded-xl font-bold text-sm text-white bg-black hover:bg-slate-800 shadow-md transition-all"
                >
                  CONTINUE TO REVIEW
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setStep('FORM')}
                  className="px-5 py-3 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-900 font-bold text-sm inline-flex items-center gap-2 transition-all"
                >
                  <Edit2 className="w-4 h-4" />
                  <span>EDIT DETAILS</span>
                </button>

                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={loading}
                  className="px-8 py-3.5 rounded-xl font-black text-sm text-white bg-black hover:bg-slate-800 shadow-md flex items-center gap-2 transition-all"
                >
                  <Send className="w-4 h-4" />
                  <span>{loading ? 'SENDING REQUEST...' : 'SUBMIT REQUEST TO ALL VENDORS'}</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
