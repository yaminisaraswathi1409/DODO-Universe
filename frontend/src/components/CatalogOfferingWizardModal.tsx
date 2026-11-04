'use client';

import React, { useState, useEffect } from 'react';
import {
  Category,
  VendorCatalogItem,
  AdditionalServiceItem,
  OpportunityFieldSpec,
  createCatalogItem,
  updateCatalogItem,
  uploadFile,
} from '@/lib/api';
import {
  X,
  ChevronRight,
  ChevronLeft,
  Check,
  Package,
  Folder,
  Upload,
  Plus,
  Trash2,
  AlertCircle,
  Eye,
  DollarSign,
  Layers,
  MapPin,
  CheckCircle2,
  Clock,
  Info,
} from 'lucide-react';

interface CatalogOfferingWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (item: VendorCatalogItem) => void;
  currentUser: { id: string; phone?: string; full_name?: string };
  categories: Category[];
  eligibleCategoryIds: string[]; // platform categories approved for this vendor
  existingCatalogNodes: VendorCatalogItem[];
  initialParentNode?: VendorCatalogItem | null;
  initialNodeType?: 'GROUPING' | 'BOOKABLE';
  editingItem?: VendorCatalogItem | null;
}

export default function CatalogOfferingWizardModal({
  isOpen,
  onClose,
  onSuccess,
  currentUser,
  categories,
  eligibleCategoryIds,
  existingCatalogNodes,
  initialParentNode = null,
  initialNodeType = 'BOOKABLE',
  editingItem = null,
}: CatalogOfferingWizardModalProps) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Step 1: Platform Category
  const [selectedCategoryId, setSelectedCategoryId] = useState('');

  // Step 2: Parent Node
  const [parentId, setParentId] = useState<string | null>(null);

  // Step 3: Node Type
  const [nodeType, setNodeType] = useState<'GROUPING' | 'BOOKABLE'>('BOOKABLE');

  // Step 4: Basic & Category-Specific Specs
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sku, setSku] = useState('');
  const [categoryFields, setCategoryFields] = useState<OpportunityFieldSpec[]>([]);
  const [customAttributes, setCustomAttributes] = useState<Record<string, any>>({});

  // Step 5: Pricing, Unit, MOQ, Stock, Price Type
  const [priceType, setPriceType] = useState<'FIXED' | 'QUOTATION'>('FIXED');
  const [unitPrice, setUnitPrice] = useState<number>(8.5);
  const [priceUnit, setPriceUnit] = useState('PER_PIECE');
  const [customUnit, setCustomUnit] = useState('');
  const [minOrderQuantity, setMinOrderQuantity] = useState<number>(1000);
  const [stockQuantity, setStockQuantity] = useState<number>(50000);
  const [pickupAddress, setPickupAddress] = useState('');

  // Step 6: Included & Optional Services
  const [includedServices, setIncludedServices] = useState<AdditionalServiceItem[]>([]);
  const [optionalServices, setOptionalServices] = useState<AdditionalServiceItem[]>([]);
  const [newServiceName, setNewServiceName] = useState('');
  const [newServiceDesc, setNewServiceDesc] = useState('');
  const [newServicePrice, setNewServicePrice] = useState<number>(0);
  const [newServicePriceUnit, setNewServicePriceUnit] = useState('PER_TRIP');
  const [newServiceIsIncluded, setNewServiceIsIncluded] = useState(false);

  // Step 7: Uploaded Images
  const [images, setImages] = useState<string[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);

  // Step 8: Preview simulation toggle for optional services
  const [selectedPreviewOptionalServices, setSelectedPreviewOptionalServices] = useState<Record<string, boolean>>({});

  // Filter categories to vendor's approved categories if available
  const availableCategories = categories.filter((c) =>
    eligibleCategoryIds.length === 0 || eligibleCategoryIds.includes(c.id) || eligibleCategoryIds.includes(c.slug)
  );

  // Load editingItem or initialize defaults
  useEffect(() => {
    if (!isOpen) return;

    if (editingItem) {
      setSelectedCategoryId(editingItem.category_id || '');
      setParentId(editingItem.parent_id || null);
      setNodeType(editingItem.node_type || 'BOOKABLE');
      setTitle(editingItem.title || '');
      setDescription(editingItem.description || '');
      setSku(editingItem.sku || '');
      setPriceType(editingItem.price_type || 'FIXED');
      setUnitPrice(editingItem.unit_price || 0);
      setPriceUnit(editingItem.price_unit || 'PER_PIECE');
      setMinOrderQuantity(editingItem.min_order_quantity || 1);
      setStockQuantity(editingItem.stock_quantity || 1000);
      setPickupAddress(editingItem.pickup_address || '');
      setImages(editingItem.images || []);
      setCustomAttributes(editingItem.attributes || {});
      setIncludedServices(editingItem.included_services || []);
      setOptionalServices(editingItem.optional_services || []);
      setStep(1);
    } else {
      // New Node Defaults
      setNodeType(initialNodeType);
      setParentId(initialParentNode ? initialParentNode.id : null);
      if (initialParentNode && initialParentNode.category_id) {
        setSelectedCategoryId(initialParentNode.category_id);
      } else if (availableCategories.length > 0) {
        setSelectedCategoryId(availableCategories[0].id);
      }
      setTitle('');
      setDescription('');
      setSku('');
      setPriceType('FIXED');
      setUnitPrice(8.5);
      setPriceUnit('PER_PIECE');
      setMinOrderQuantity(1000);
      setStockQuantity(50000);
      setPickupAddress('');
      setImages([]);
      setCustomAttributes({});
      setIncludedServices([]);
      setOptionalServices([
        { id: 'opt_transport', name: 'Site Transport (15-Ton Flatbed)', description: 'Direct transit to site', is_included: false, price: 1500, price_unit: 'PER_TRIP', is_available: true },
        { id: 'opt_loading', name: 'Yard Loading Labor', description: 'Mechanized forklift loading', is_included: false, price: 0.8, price_unit: 'PER_PIECE', is_available: true },
        { id: 'opt_unloading', name: 'Site Unloading Labor', description: 'Manual unloading at destination', is_included: false, price: 0.7, price_unit: 'PER_PIECE', is_available: true },
      ]);
      setStep(1);
    }
    setErrorMsg('');
  }, [isOpen, editingItem, initialParentNode, initialNodeType]);

  // Update dynamic fields when category changes
  useEffect(() => {
    if (!selectedCategoryId) {
      setCategoryFields([]);
      return;
    }
    const cat = categories.find((c) => c.id === selectedCategoryId || c.slug === selectedCategoryId);
    if (cat && Array.isArray(cat.opportunity_fields)) {
      setCategoryFields(cat.opportunity_fields);
    } else {
      setCategoryFields([]);
    }
  }, [selectedCategoryId, categories]);

  if (!isOpen) return null;

  const currentCategory = categories.find(
    (c) => c.id === selectedCategoryId || c.slug === selectedCategoryId
  );

  // Additional service addition
  const handleAddService = () => {
    if (!newServiceName.trim()) return;
    const newService: AdditionalServiceItem = {
      id: `svc_${Date.now()}`,
      name: newServiceName.trim(),
      description: newServiceDesc.trim(),
      is_included: newServiceIsIncluded,
      price: newServiceIsIncluded ? 0 : newServicePrice,
      price_unit: newServiceIsIncluded ? '' : newServicePriceUnit,
      is_available: true,
    };

    if (newServiceIsIncluded) {
      setIncludedServices((prev) => [...prev, newService]);
    } else {
      setOptionalServices((prev) => [...prev, newService]);
    }

    setNewServiceName('');
    setNewServiceDesc('');
    setNewServicePrice(0);
    setNewServiceIsIncluded(false);
  };

  const handleRemoveService = (id: string, isIncluded: boolean) => {
    if (isIncluded) {
      setIncludedServices((prev) => prev.filter((s) => s.id !== id));
    } else {
      setOptionalServices((prev) => prev.filter((s) => s.id !== id));
    }
  };

  // Image Upload Handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingImage(true);
    try {
      const uploaded: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const res = await uploadFile(file);
        if (res?.url) {
          uploaded.push(res.url);
        }
      }
      setImages((prev) => [...prev, ...uploaded]);
    } catch (err: any) {
      setErrorMsg(err.message || 'Image upload failed');
    } finally {
      setUploadingImage(false);
      e.target.value = '';
    }
  };

  const handleRemoveImage = (index: number) => {
    setImages((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Save / Submit Handler
  const handleFinalSubmit = async (targetStatus: 'DRAFT' | 'PENDING_ADMIN_APPROVAL') => {
    if (!title.trim()) {
      setErrorMsg('Title is required');
      return;
    }
    if (!selectedCategoryId) {
      setErrorMsg('Platform category is required');
      return;
    }
    if (nodeType === 'BOOKABLE' && priceType === 'FIXED' && unitPrice <= 0) {
      setErrorMsg('Unit price must be greater than zero for fixed-price offerings');
      return;
    }

    setSaving(true);
    setErrorMsg('');

    try {
      const finalPriceUnit = priceUnit === 'CUSTOM' ? (customUnit.trim() || 'UNIT') : priceUnit;
      const payload: Partial<VendorCatalogItem> = {
        vendor_user_id: currentUser.id,
        category_id: selectedCategoryId,
        parent_id: parentId,
        node_type: nodeType,
        price_type: priceType,
        title: title.trim(),
        description: description.trim(),
        sku: sku.trim(),
        unit_price: nodeType === 'GROUPING' ? 0 : unitPrice,
        price_unit: nodeType === 'GROUPING' ? '' : finalPriceUnit,
        min_order_quantity: nodeType === 'GROUPING' ? 0 : minOrderQuantity,
        stock_quantity: nodeType === 'GROUPING' ? 0 : stockQuantity,
        pickup_address: pickupAddress.trim(),
        attributes: customAttributes,
        included_services: includedServices,
        optional_services: optionalServices,
        images: images,
        status: nodeType === 'GROUPING' ? 'APPROVED' : targetStatus,
        is_available: false,
      };

      let result: VendorCatalogItem;
      if (editingItem) {
        result = await updateCatalogItem(editingItem.id, payload);
      } else {
        result = await createCatalogItem(payload);
      }

      onSuccess(result);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save catalog offering');
    } finally {
      setSaving(false);
    }
  };

  // Preview total calculation
  const previewQty = Math.max(minOrderQuantity, 1);
  const previewBasePrice = unitPrice * previewQty;
  let previewOptionalTotal = 0;
  optionalServices.forEach((svc) => {
    if (selectedPreviewOptionalServices[svc.id]) {
      if (svc.price_unit === 'PER_PIECE') {
        previewOptionalTotal += (svc.price || 0) * previewQty;
      } else {
        previewOptionalTotal += svc.price || 0;
      }
    }
  });
  const previewTotalPayable = previewBasePrice + previewOptionalTotal;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-8">
        {/* MODAL HEADER & STEP PROGRESS */}
        <div className="p-6 bg-slate-50 border-b border-slate-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-black text-white">
                {nodeType === 'GROUPING' ? <Folder className="w-5 h-5" /> : <Package className="w-5 h-5" />}
              </span>
              <div>
                <h3 className="font-extrabold text-lg text-slate-900">
                  {editingItem ? 'Edit Catalog Node' : 'Add to Vendor Catalog'}
                </h3>
                <p className="text-xs text-slate-500">
                  Step {step} of 9: {
                    step === 1 ? 'Select Platform Category' :
                    step === 2 ? 'Select Parent Node' :
                    step === 3 ? 'Choose Node Type' :
                    step === 4 ? 'Category Specifications' :
                    step === 5 ? 'Pricing & MOQ' :
                    step === 6 ? 'Included & Optional Services' :
                    step === 7 ? 'Upload Images' :
                    step === 8 ? 'Customer Listing Preview' :
                    'Review & Submit'
                  }
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-full hover:bg-slate-200 text-slate-400 hover:text-black transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Stepper Dots */}
          <div className="flex items-center gap-1.5 mt-4">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((s) => (
              <div
                key={s}
                className={`h-1.5 flex-1 rounded-full transition-all ${
                  s === step ? 'bg-black' : s < step ? 'bg-emerald-500' : 'bg-slate-200'
                }`}
              />
            ))}
          </div>
        </div>

        {/* ERROR BANNER */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3 rounded-2xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* STEP CONTENT BODY */}
        <div className="p-6 max-h-[60vh] overflow-y-auto space-y-6">
          {/* STEP 1: Platform Category */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h4 className="font-extrabold text-sm text-slate-900">Step 1: Select Approved Platform Category</h4>
                <p className="text-xs text-slate-500">Choose the shared platform category under which this offering or grouping node operates.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {availableCategories.map((cat) => {
                  const isSelected = selectedCategoryId === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setSelectedCategoryId(cat.id)}
                      className={`p-4 rounded-2xl border text-left transition-all flex items-start gap-3 ${
                        isSelected
                          ? 'border-black bg-black/5 ring-1 ring-black'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className={`p-2 rounded-xl text-lg ${isSelected ? 'bg-black text-white' : 'bg-slate-100'}`}>
                        {cat.icon || '🧱'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="font-extrabold text-xs text-slate-900 block truncate">{cat.name}</span>
                        <span className="text-[11px] text-slate-500 line-clamp-1">{cat.description || cat.slug}</span>
                      </div>
                      {isSelected && <CheckCircle2 className="w-4 h-4 text-black shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 2: Parent Node */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h4 className="font-extrabold text-sm text-slate-900">Step 2: Select Parent Catalog Node</h4>
                <p className="text-xs text-slate-500">Attach this node under an existing grouping/offering node, or keep it at Root level (Level 0).</p>
              </div>

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setParentId(null)}
                  className={`w-full p-4 rounded-2xl border text-left transition-all flex items-center justify-between ${
                    parentId === null
                      ? 'border-black bg-black/5 ring-1 ring-black'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="p-2 rounded-xl bg-slate-100 text-slate-700">
                      <Folder className="w-4 h-4" />
                    </span>
                    <div>
                      <span className="font-extrabold text-xs text-slate-900 block">Root Catalog Node (Level 0)</span>
                      <span className="text-[11px] text-slate-500">Node will appear at top-level of your catalog</span>
                    </div>
                  </div>
                  {parentId === null && <CheckCircle2 className="w-4 h-4 text-black" />}
                </button>

                {existingCatalogNodes
                  .filter((n) => editingItem ? n.id !== editingItem.id : true)
                  .map((node) => {
                    const isSelected = parentId === node.id;
                    const isGrp = node.node_type === 'GROUPING';
                    return (
                      <button
                        key={node.id}
                        type="button"
                        onClick={() => setParentId(node.id)}
                        className={`w-full p-4 rounded-2xl border text-left transition-all flex items-center justify-between ${
                          isSelected
                            ? 'border-black bg-black/5 ring-1 ring-black'
                            : 'border-slate-200 hover:border-slate-300 bg-white'
                        }`}
                        style={{ marginLeft: `${Math.min((node.level || 0) * 16, 48)}px`, width: `calc(100% - ${Math.min((node.level || 0) * 16, 48)}px)` }}
                      >
                        <div className="flex items-center gap-3">
                          <span className={`p-2 rounded-xl ${isGrp ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>
                            {isGrp ? <Folder className="w-4 h-4" /> : <Package className="w-4 h-4" />}
                          </span>
                          <div>
                            <span className="font-extrabold text-xs text-slate-900 block truncate">{node.title}</span>
                            <span className="text-[11px] text-slate-500">
                              Level {node.level || 0} • {isGrp ? 'Grouping' : 'Bookable Offering'}
                            </span>
                          </div>
                        </div>
                        {isSelected && <CheckCircle2 className="w-4 h-4 text-black shrink-0" />}
                      </button>
                    );
                  })}
              </div>
            </div>
          )}

          {/* STEP 3: Node Type */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h4 className="font-extrabold text-sm text-slate-900">Step 3: Choose Node Type</h4>
                <p className="text-xs text-slate-500">Select whether this node is for grouping / organization, or a purchasable offering.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setNodeType('GROUPING')}
                  className={`p-6 rounded-3xl border text-left transition-all space-y-3 ${
                    nodeType === 'GROUPING'
                      ? 'border-black bg-black/5 ring-2 ring-black'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center">
                    <Folder className="w-6 h-6" />
                  </div>
                  <div>
                    <h5 className="font-extrabold text-slate-900 text-sm">Grouping Node (Not Bookable)</h5>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Used strictly to organize your catalog hierarchy (e.g. &quot;Red Bricks&quot;, &quot;Heavy Structural&quot;). No mandatory price, MOQ, or stock. Cannot be purchased directly by customers.
                    </p>
                  </div>
                  {nodeType === 'GROUPING' && (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-black">
                      <Check className="w-3.5 h-3.5" /> Selected
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setNodeType('BOOKABLE')}
                  className={`p-6 rounded-3xl border text-left transition-all space-y-3 ${
                    nodeType === 'BOOKABLE'
                      ? 'border-black bg-black/5 ring-2 ring-black'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-800 flex items-center justify-center">
                    <Package className="w-6 h-6" />
                  </div>
                  <div>
                    <h5 className="font-extrabold text-slate-900 text-sm">Bookable Offering</h5>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      An actual product or service customers can book or purchase (e.g. &quot;Standard Red Bricks + Transportation&quot;). Includes specifications, pricing, MOQ, stock, and services.
                    </p>
                  </div>
                  {nodeType === 'BOOKABLE' && (
                    <span className="inline-flex items-center gap-1 text-xs font-bold text-black">
                      <Check className="w-3.5 h-3.5" /> Selected
                    </span>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: Specifications */}
          {step === 4 && (
            <div className="space-y-4">
              <div>
                <h4 className="font-extrabold text-sm text-slate-900">
                  Step 4: {nodeType === 'GROUPING' ? 'Grouping Name & Description' : 'Offering Specifications'}
                </h4>
                <p className="text-xs text-slate-500">
                  {nodeType === 'GROUPING'
                    ? 'Enter the title for this grouping category.'
                    : `Dynamic specifications for ${currentCategory?.name || 'Category'}.`}
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    Title / Offering Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={nodeType === 'GROUPING' ? 'e.g. Red Bricks Group' : 'e.g. Premium Kiln-Fired Red Clay Bricks'}
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-xs font-medium focus:ring-1 focus:ring-black focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Description</label>
                  <textarea
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describe material grade, application, or features..."
                    className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-xs font-medium focus:ring-1 focus:ring-black focus:outline-none"
                  />
                </div>

                {nodeType === 'BOOKABLE' && (
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">SKU / Item Code (Optional)</label>
                    <input
                      type="text"
                      value={sku}
                      onChange={(e) => setSku(e.target.value)}
                      placeholder="e.g. BRK-RED-CL1"
                      className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-xs font-medium focus:ring-1 focus:ring-black focus:outline-none"
                    />
                  </div>
                )}

                {/* Dynamic Category Specifications */}
                {nodeType === 'BOOKABLE' && categoryFields.length > 0 && (
                  <div className="pt-3 border-t border-slate-100 space-y-3">
                    <span className="text-xs font-extrabold text-slate-900 block">
                      {currentCategory?.name} Technical Specifications
                    </span>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {categoryFields.map((field) => {
                        const val = customAttributes[field.key] || '';
                        return (
                          <div key={field.key} className="space-y-1">
                            <label className="text-[11px] font-bold text-slate-700 block">
                              {field.label} {field.required && <span className="text-red-500">*</span>}
                            </label>
                            {field.type === 'select' && Array.isArray(field.options) ? (
                              <select
                                value={val}
                                onChange={(e) => setCustomAttributes({ ...customAttributes, [field.key]: e.target.value })}
                                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-medium focus:ring-1 focus:ring-black focus:outline-none bg-white"
                              >
                                <option value="">Select {field.label}...</option>
                                {field.options.map((opt) => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            ) : (
                              <input
                                type={field.type === 'number' ? 'number' : 'text'}
                                value={val}
                                onChange={(e) => setCustomAttributes({ ...customAttributes, [field.key]: e.target.value })}
                                placeholder={field.placeholder || `Enter ${field.label}`}
                                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-medium focus:ring-1 focus:ring-black focus:outline-none"
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 5: Pricing, Unit, MOQ, Stock */}
          {step === 5 && (
            <div className="space-y-4">
              <div>
                <h4 className="font-extrabold text-sm text-slate-900">Step 5: Pricing, Price Type, MOQ & Stock</h4>
                <p className="text-xs text-slate-500">Configure base unit pricing and order quantities. Grouping nodes skip this step.</p>
              </div>

              {nodeType === 'GROUPING' ? (
                <div className="p-8 text-center rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                  <Info className="w-6 h-6 text-slate-400 mx-auto" />
                  <p className="text-xs text-slate-600 font-medium">
                    Grouping nodes do not have price, MOQ, or inventory stock. You can proceed to the next step.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Price Type Selector */}
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setPriceType('FIXED')}
                      className={`p-3 rounded-2xl border text-left transition-all ${
                        priceType === 'FIXED'
                          ? 'border-black bg-black/5 ring-1 ring-black'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <span className="font-extrabold text-xs text-slate-900 block">Fixed Pricing</span>
                      <span className="text-[10px] text-slate-500">Instant bookable fixed unit price</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPriceType('QUOTATION')}
                      className={`p-3 rounded-2xl border text-left transition-all ${
                        priceType === 'QUOTATION'
                          ? 'border-black bg-black/5 ring-1 ring-black'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <span className="font-extrabold text-xs text-slate-900 block">Quotation-Based</span>
                      <span className="text-[10px] text-slate-500">Requires customized quote workflow</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">
                        Base Unit Price (₹) {priceType === 'FIXED' && <span className="text-red-500">*</span>}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={unitPrice}
                        onChange={(e) => setUnitPrice(parseFloat(e.target.value) || 0)}
                        placeholder="e.g. 8.50"
                        className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-xs font-medium focus:ring-1 focus:ring-black focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">Pricing Unit</label>
                      <select
                        value={priceUnit}
                        onChange={(e) => setPriceUnit(e.target.value)}
                        className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-xs font-medium focus:ring-1 focus:ring-black focus:outline-none bg-white"
                      >
                        <option value="PER_PIECE">Per Piece</option>
                        <option value="PER_1000_PCS">Per 1,000 Pieces</option>
                        <option value="PER_BAG">Per Bag</option>
                        <option value="PER_KG">Per KG</option>
                        <option value="PER_TON">Per Ton</option>
                        <option value="PER_TRIP">Per Trip</option>
                        <option value="PER_KM">Per KM</option>
                        <option value="CUSTOM">Custom Unit</option>
                      </select>
                    </div>

                    {priceUnit === 'CUSTOM' && (
                      <div className="sm:col-span-2">
                        <label className="text-xs font-bold text-slate-700 block mb-1">Custom Unit Label</label>
                        <input
                          type="text"
                          value={customUnit}
                          onChange={(e) => setCustomUnit(e.target.value)}
                          placeholder="e.g. PER_PALLET"
                          className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-xs font-medium focus:ring-1 focus:ring-black focus:outline-none"
                        />
                      </div>
                    )}

                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">Minimum Order Quantity (MOQ)</label>
                      <input
                        type="number"
                        value={minOrderQuantity}
                        onChange={(e) => setMinOrderQuantity(parseInt(e.target.value) || 1)}
                        className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-xs font-medium focus:ring-1 focus:ring-black focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-700 block mb-1">Available Stock Quantity</label>
                      <input
                        type="number"
                        value={stockQuantity}
                        onChange={(e) => setStockQuantity(parseInt(e.target.value) || 0)}
                        className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-xs font-medium focus:ring-1 focus:ring-black focus:outline-none"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="text-xs font-bold text-slate-700 block mb-1">Pickup Yard Address / Location</label>
                      <input
                        type="text"
                        value={pickupAddress}
                        onChange={(e) => setPickupAddress(e.target.value)}
                        placeholder="e.g. Yard #4, Choutuppal Industrial Area, NH-65, Telangana"
                        className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-xs font-medium focus:ring-1 focus:ring-black focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 6: Included & Optional Services */}
          {step === 6 && (
            <div className="space-y-4">
              <div>
                <h4 className="font-extrabold text-sm text-slate-900">Step 6: Included & Optional Additional Services</h4>
                <p className="text-xs text-slate-500">
                  Customers can see which services are bundled for free, and choose optional services with transparent extra charges.
                </p>
              </div>

              {nodeType === 'GROUPING' ? (
                <div className="p-8 text-center rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                  <Info className="w-6 h-6 text-slate-400 mx-auto" />
                  <p className="text-xs text-slate-600 font-medium">Grouping nodes do not bundle individual services.</p>
                </div>
              ) : (
                <div className="space-y-5">
                  {/* Add New Service Inline Form */}
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                    <span className="text-xs font-extrabold text-slate-900 block">Configure New Additional Service</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <input
                          type="text"
                          value={newServiceName}
                          onChange={(e) => setNewServiceName(e.target.value)}
                          placeholder="Service Name (e.g. Site Unloading)"
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-1 focus:ring-black focus:outline-none"
                        />
                      </div>
                      <div>
                        <input
                          type="text"
                          value={newServiceDesc}
                          onChange={(e) => setNewServiceDesc(e.target.value)}
                          placeholder="Description (Optional)"
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:ring-1 focus:ring-black focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={newServiceIsIncluded}
                          onChange={(e) => setNewServiceIsIncluded(e.target.checked)}
                          className="rounded text-black focus:ring-black"
                        />
                        <span>Included in Base Price (Free)</span>
                      </label>

                      {!newServiceIsIncluded && (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            step="0.01"
                            value={newServicePrice || ''}
                            onChange={(e) => setNewServicePrice(parseFloat(e.target.value) || 0)}
                            placeholder="Price (₹)"
                            className="w-24 px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs focus:ring-1 focus:ring-black focus:outline-none"
                          />
                          <select
                            value={newServicePriceUnit}
                            onChange={(e) => setNewServicePriceUnit(e.target.value)}
                            className="px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs focus:ring-1 focus:ring-black focus:outline-none bg-white"
                          >
                            <option value="PER_TRIP">Per Trip</option>
                            <option value="PER_PIECE">Per Piece</option>
                            <option value="PER_TON">Per Ton</option>
                            <option value="FIXED">Flat Fee</option>
                          </select>
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={handleAddService}
                        className="px-4 py-2 rounded-xl bg-black text-white hover:bg-slate-800 text-xs font-bold ml-auto"
                      >
                        + Add Service
                      </button>
                    </div>
                  </div>

                  {/* Included Services List */}
                  <div className="space-y-2">
                    <span className="text-xs font-extrabold text-emerald-800 block">
                      Included Services ({includedServices.length})
                    </span>
                    {includedServices.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No free included services configured.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {includedServices.map((svc) => (
                          <div key={svc.id} className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-200 flex items-center justify-between text-xs">
                            <div>
                              <span className="font-bold text-emerald-950 block">{svc.name}</span>
                              {svc.description && <span className="text-[11px] text-emerald-700">{svc.description}</span>}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-900 text-[10px] font-bold">INCLUDED</span>
                              <button
                                type="button"
                                onClick={() => handleRemoveService(svc.id, true)}
                                className="p-1 rounded text-red-500 hover:bg-red-50"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Optional Services List */}
                  <div className="space-y-2">
                    <span className="text-xs font-extrabold text-blue-800 block">
                      Optional Services ({optionalServices.length})
                    </span>
                    {optionalServices.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">No optional services configured.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {optionalServices.map((svc) => (
                          <div key={svc.id} className="p-3 rounded-xl bg-blue-50/60 border border-blue-200 flex items-center justify-between text-xs">
                            <div>
                              <span className="font-bold text-blue-950 block">{svc.name}</span>
                              {svc.description && <span className="text-[11px] text-blue-700">{svc.description}</span>}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-extrabold text-blue-950">
                                +₹{svc.price} <span className="text-[10px] text-blue-600 font-medium">/{svc.price_unit}</span>
                              </span>
                              <button
                                type="button"
                                onClick={() => handleRemoveService(svc.id, false)}
                                className="p-1 rounded text-red-500 hover:bg-red-50"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 7: Upload Images */}
          {step === 7 && (
            <div className="space-y-4">
              <div>
                <h4 className="font-extrabold text-sm text-slate-900">Step 7: Upload Product & Yard Photos</h4>
                <p className="text-xs text-slate-500">Add high-resolution photos of your product, yard, or equipment.</p>
              </div>

              <div className="p-6 rounded-2xl border-2 border-dashed border-slate-300 text-center space-y-2 hover:border-black transition-colors">
                <Upload className="w-8 h-8 text-slate-400 mx-auto" />
                <label className="cursor-pointer font-bold text-xs text-black block">
                  Click to select and upload images
                  <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
                <p className="text-[10px] text-slate-400">PNG, JPG, WEBP up to 10MB</p>
                {uploadingImage && <p className="text-xs text-amber-600 font-bold">Uploading files...</p>}
              </div>

              {images.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {images.map((img, idx) => (
                    <div key={idx} className="relative group rounded-xl overflow-hidden border border-slate-200 aspect-square">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img} alt={`Upload ${idx}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => handleRemoveImage(idx)}
                        className="absolute top-1 right-1 p-1 rounded-full bg-red-600 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* STEP 8: Customer Preview */}
          {step === 8 && (
            <div className="space-y-4">
              <div>
                <h4 className="font-extrabold text-sm text-slate-900">Step 8: Customer-Facing Listing Preview</h4>
                <p className="text-xs text-slate-500">This is how your customer sees this item in the marketplace.</p>
              </div>

              <div className="p-6 rounded-3xl bg-slate-50 border border-slate-200 space-y-4 max-w-md mx-auto shadow-sm">
                {images.length > 0 ? (
                  <div className="h-44 rounded-2xl overflow-hidden bg-slate-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={images[0]} alt={title} className="w-full h-full object-cover" />
                  </div>
                ) : (
                  <div className="h-44 rounded-2xl bg-slate-200 flex items-center justify-center text-slate-400">
                    {nodeType === 'GROUPING' ? <Folder className="w-12 h-12" /> : <Package className="w-12 h-12" />}
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">{currentCategory?.name}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800">
                      {nodeType === 'GROUPING' ? 'Grouping Node' : 'Direct Booking'}
                    </span>
                  </div>
                  <h5 className="font-extrabold text-base text-slate-900 mt-1">{title || 'Untitled Node'}</h5>
                  {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
                </div>

                {nodeType === 'BOOKABLE' && (
                  <div className="space-y-3 pt-3 border-t border-slate-200">
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs text-slate-600">Base Unit Price:</span>
                      <span className="font-extrabold text-lg text-slate-900">
                        ₹{unitPrice} <span className="text-xs text-slate-500 font-normal">/{priceUnit}</span>
                      </span>
                    </div>

                    {minOrderQuantity > 1 && (
                      <div className="flex items-center justify-between text-xs text-slate-600">
                        <span>Minimum Order (MOQ):</span>
                        <span className="font-bold text-slate-900">{minOrderQuantity.toLocaleString()} units</span>
                      </div>
                    )}

                    {/* Included Services Simulation */}
                    {includedServices.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[10px] font-extrabold text-slate-500 uppercase">Included Free:</span>
                        <div className="flex flex-wrap gap-1">
                          {includedServices.map((s) => (
                            <span key={s.id} className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 text-[10px] font-bold">
                              ✓ {s.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Optional Services Interactive Simulation */}
                    {optionalServices.length > 0 && (
                      <div className="space-y-1.5 pt-2 border-t border-slate-200/60">
                        <span className="text-[10px] font-extrabold text-slate-500 uppercase">
                          Select Optional Add-ons (Customer Simulation):
                        </span>
                        {optionalServices.map((svc) => {
                          const isChecked = !!selectedPreviewOptionalServices[svc.id];
                          return (
                            <label
                              key={svc.id}
                              className="flex items-center justify-between p-2 rounded-xl bg-white border border-slate-200 text-xs cursor-pointer"
                            >
                              <div className="flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={(e) =>
                                    setSelectedPreviewOptionalServices({
                                      ...selectedPreviewOptionalServices,
                                      [svc.id]: e.target.checked,
                                    })
                                  }
                                  className="rounded text-black focus:ring-black"
                                />
                                <span className="font-medium text-slate-800">{svc.name}</span>
                              </div>
                              <span className="font-bold text-slate-900">+₹{svc.price}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}

                    {/* Simulation Calculated Total */}
                    <div className="p-3 rounded-2xl bg-black text-white flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-slate-300 block">Total for {previewQty} units:</span>
                        <span className="text-base font-extrabold">₹{previewTotalPayable.toLocaleString()}</span>
                      </div>
                      <span className="text-xs font-bold text-emerald-400">Ready to Book</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 9: Review & Submit */}
          {step === 9 && (
            <div className="space-y-4">
              <div>
                <h4 className="font-extrabold text-sm text-slate-900">Step 9: Review & Final Action</h4>
                <p className="text-xs text-slate-500">Save as draft to work on later, or submit for administrative verification.</p>
              </div>

              <div className="p-6 rounded-3xl bg-slate-50 border border-slate-200 space-y-3 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-200">
                  <span className="text-slate-500">Node Type:</span>
                  <span className="font-bold text-slate-900">{nodeType === 'GROUPING' ? 'Grouping Node (Not Bookable)' : 'Bookable Offering'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200">
                  <span className="text-slate-500">Platform Category:</span>
                  <span className="font-bold text-slate-900">{currentCategory?.name}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-200">
                  <span className="text-slate-500">Title:</span>
                  <span className="font-bold text-slate-900">{title}</span>
                </div>
                {nodeType === 'BOOKABLE' && (
                  <>
                    <div className="flex justify-between py-1 border-b border-slate-200">
                      <span className="text-slate-500">Pricing:</span>
                      <span className="font-bold text-slate-900">₹{unitPrice} / {priceUnit} ({priceType})</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-200">
                      <span className="text-slate-500">MOQ & Stock:</span>
                      <span className="font-bold text-slate-900">MOQ {minOrderQuantity} • Stock {stockQuantity}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-200">
                      <span className="text-slate-500">Services:</span>
                      <span className="font-bold text-slate-900">{includedServices.length} Included • {optionalServices.length} Optional</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Images Uploaded:</span>
                  <span className="font-bold text-slate-900">{images.length} photo(s)</span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleFinalSubmit('DRAFT')}
                  className="flex-1 py-3.5 rounded-2xl bg-white border border-slate-300 text-slate-800 font-extrabold text-xs hover:bg-slate-100 transition-colors"
                >
                  Save as Draft
                </button>

                <button
                  type="button"
                  disabled={saving}
                  onClick={() => handleFinalSubmit('PENDING_ADMIN_APPROVAL')}
                  className="flex-1 py-3.5 rounded-2xl bg-black text-white font-extrabold text-xs hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 shadow-md"
                >
                  {saving ? 'Submitting...' : 'Submit for Admin Approval'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* MODAL FOOTER STEP NAVIGATION */}
        <div className="p-6 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            disabled={step === 1 || saving}
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-200 text-xs font-bold disabled:opacity-30 disabled:pointer-events-none flex items-center gap-1.5 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Previous</span>
          </button>

          {step < 9 ? (
            <button
              type="button"
              onClick={() => {
                if (step === 1 && !selectedCategoryId) {
                  setErrorMsg('Please select a platform category');
                  return;
                }
                if (step === 4 && !title.trim()) {
                  setErrorMsg('Please enter a title');
                  return;
                }
                setErrorMsg('');
                setStep((s) => Math.min(9, s + 1));
              }}
              className="px-6 py-2.5 rounded-xl bg-black text-white hover:bg-slate-800 text-xs font-extrabold flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <span>Next</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled={saving}
              onClick={() => handleFinalSubmit('PENDING_ADMIN_APPROVAL')}
              className="px-6 py-2.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-extrabold transition-colors shadow-md"
            >
              {saving ? 'Submitting...' : 'Complete & Submit'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

