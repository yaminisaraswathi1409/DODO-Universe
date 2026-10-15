'use client';

import React, { useState, useEffect } from 'react';
import {
  UserProfile,
  UserServiceAsset,
  VendorCatalogItem,
  Category,
  OpportunityFieldSpec,
  getVendorCatalog,
  createCatalogItem,
  updateCatalogItem,
  deleteCatalogItem,
  getCategories,
  uploadFile,
  addUserService,
  submitServiceDocuments,
  getUserServices,
} from '@/lib/api';
import {
  Package,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  Loader2,
  X,
  AlertCircle,
  Clock,
  Upload,
  Image as ImageIcon,
  Check,
  RefreshCw,
  Layers,
  MapPin,
  Eye,
  Tag,
  Info,
} from 'lucide-react';

interface VendorCatalogManagerProps {
  currentUser: UserProfile;
  userAssets: UserServiceAsset[];
}

export default function VendorCatalogManager({ currentUser, userAssets }: VendorCatalogManagerProps) {
  const [items, setItems] = useState<VendorCatalogItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [localUserAssets, setLocalUserAssets] = useState<UserServiceAsset[]>(userAssets);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Modals
  const [requestServiceModalOpen, setRequestServiceModalOpen] = useState(false);
  const [offeringModalOpen, setOfferingModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<VendorCatalogItem | null>(null);
  const [viewingItem, setViewingItem] = useState<VendorCatalogItem | null>(null);

  // Form State for Sub-Service / Offering (Full Vendor Freedom)
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sku, setSku] = useState('');
  const [unitPrice, setUnitPrice] = useState<number>(1500);
  const [priceUnit, setPriceUnit] = useState('PER_1000_PCS');
  const [customUnit, setCustomUnit] = useState('');
  const [stockQuantity, setStockQuantity] = useState<number>(100000);
  const [minOrderQuantity, setMinOrderQuantity] = useState<number>(1000);
  const [selectedAssetId, setSelectedAssetId] = useState<string>('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [pickupAddress, setPickupAddress] = useState<string>('');
  const [includedComponents, setIncludedComponents] = useState<string[]>(['Material', 'Yard Loading', 'Transportation']);
  const [newTagInput, setNewTagInput] = useState('');
  const [notIncludedText, setNotIncludedText] = useState('');

  // Photos State
  const [images, setImages] = useState<string[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadError, setUploadError] = useState<string>('');

  // Stage 2 Details Form State
  const [stage2ModalAsset, setStage2ModalAsset] = useState<UserServiceAsset | null>(null);
  const [stage2Category, setStage2Category] = useState<Category | null>(null);
  const [stage2FormValues, setStage2FormValues] = useState<Record<string, any>>({});
  const [stage2Photos, setStage2Photos] = useState<string[]>([]);
  const [submittingStage2, setSubmittingStage2] = useState(false);
  const [stage2Error, setStage2Error] = useState('');

  useEffect(() => {
    setLocalUserAssets(userAssets);
  }, [userAssets]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [catData, catalogRes, userAssetsRes] = await Promise.all([
        getCategories(),
        getVendorCatalog(currentUser.id),
        getUserServices(currentUser.phone || currentUser.id).catch(() => []),
      ]);
      setCategories(catData || []);
      if (catalogRes) {
        setItems(catalogRes.items || []);
      }
      if (userAssetsRes && userAssetsRes.length > 0) {
        setLocalUserAssets(userAssetsRes);
      }
    } catch {
      // Catch silently
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentUser.id]);

  // Helper: Get matched category info or title fallback for a user asset
  const getAssetCategoryInfo = (asset: UserServiceAsset) => {
    const cat = categories.find(
      (c) =>
        c.id === asset.category_id ||
        c.slug === asset.category?.slug ||
        c.slug.toLowerCase() === asset.asset_type?.toLowerCase() ||
        c.name.toLowerCase() === asset.asset_type?.toLowerCase() ||
        c.slug.replace(/-/g, '_').toLowerCase() === asset.asset_type?.toLowerCase()
    );

    return {
      categoryId: asset.category_id || cat?.id || asset.id,
      categorySlug: cat?.slug || asset.category?.slug || asset.asset_type?.toLowerCase() || '',
      name: cat?.name || asset.title || asset.asset_type || 'Main Service',
    };
  };

  // Eligible Main Services for Sub-Service Creation:
  // ONLY Main Services where Service Request = APPROVED AND Service Details = APPROVED (status ACTIVE or APPROVED)
  const eligibleAssets = localUserAssets.filter(
    (a) => a.status === 'ACTIVE' || a.status === 'APPROVED'
  );

  const eligibleMainServices = eligibleAssets.map((asset) => {
    const info = getAssetCategoryInfo(asset);
    return {
      assetId: asset.id,
      categoryId: info.categoryId,
      categorySlug: info.categorySlug,
      name: info.name,
    };
  });

  const canCreateOffering = eligibleMainServices.length > 0;

  // Stage 1: Request Main Service
  const handleStage1OptIn = async (category: Category) => {
    try {
      setLoading(true);
      const newAsset = await addUserService({
        user_id: currentUser.id,
        phone: currentUser.phone,
        category_id: category.id,
        asset_type: category.slug.toUpperCase(),
        title: `${category.name} Provider Service`,
        description: `Main Service Request for ${category.name}`,
      });
      if (newAsset) {
        setLocalUserAssets((prev) => [newAsset, ...prev]);
        alert(`Service Request submitted for "${category.name}"! Pending Admin approval.`);
        setRequestServiceModalOpen(false);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to submit service request');
    } finally {
      setLoading(false);
    }
  };

  // Stage 2 Details Open
  const handleOpenStage2Form = (asset: UserServiceAsset) => {
    const matchedCategory = categories.find(
      (c) =>
        c.id === asset.category_id ||
        c.slug === asset.category?.slug ||
        c.slug.toLowerCase() === asset.asset_type?.toLowerCase() ||
        c.name.toLowerCase() === asset.asset_type?.toLowerCase()
    ) || {
      id: asset.category_id || '1',
      name: asset.title || 'Main Service',
      slug: 'main-service',
    };

    setStage2ModalAsset(asset);
    setStage2Category(matchedCategory as Category);
    setStage2Error('');

    const existingDocs = asset.documents || {};
    setStage2FormValues(existingDocs);
    const photos: string[] = Array.isArray(existingDocs.photos) ? existingDocs.photos : [];
    setStage2Photos(photos);
  };

  // Stage 2 Details Submit
  const handleSubmitStage2Details = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stage2ModalAsset) return;
    setSubmittingStage2(true);
    setStage2Error('');

    try {
      const payloadDocs = {
        ...stage2FormValues,
        photos: stage2Photos,
        submitted_at: new Date().toISOString(),
      };
      const updatedAsset = await submitServiceDocuments({
        asset_id: stage2ModalAsset.id,
        user_id: currentUser.id,
        phone: currentUser.phone,
        documents: payloadDocs,
      });

      if (updatedAsset) {
        setLocalUserAssets((prev) => prev.map((a) => (a.id === updatedAsset.id ? updatedAsset : a)));
        setStage2ModalAsset(null);
        alert(`Service Details for "${updatedAsset.title}" submitted successfully! Moved to Pending Admin Approval.`);
      }
    } catch (err: any) {
      setStage2Error(err.message || 'Failed to submit service details');
    } finally {
      setSubmittingStage2(false);
    }
  };

  // Sub-Service / Offering Add Modal Open (Full Freedom)
  const handleOpenAddOffering = () => {
    if (!canCreateOffering) {
      alert(
        'Complete and get your service details approved before creating sub-services.\n\nRequest a main service first and ensure Admin has approved both your Service Request and Service Details.'
      );
      return;
    }

    setEditingItem(null);
    const initialSvc = eligibleMainServices[0];
    if (initialSvc) {
      setSelectedAssetId(initialSvc.assetId);
      setSelectedCategoryId(initialSvc.categoryId);
      setTitle(`${initialSvc.name} + Delivery`);
    } else {
      setSelectedAssetId('');
      setSelectedCategoryId('');
      setTitle('Service Offering + Delivery');
    }
    setDescription('');
    setSku('');
    setUnitPrice(1500);
    setPriceUnit('PER_1000_PCS');
    setCustomUnit('');
    setStockQuantity(100000);
    setMinOrderQuantity(1000);
    setIncludedComponents(['Material', 'Yard Loading', 'Transportation']);
    setNotIncludedText('');
    setNewTagInput('');
    setImages([]);
    setPickupAddress(currentUser.address_text || '');
    setErrorMsg('');
    setUploadError('');
    setOfferingModalOpen(true);
  };

  // Offering Edit Modal Open
  const handleOpenEditOffering = (item: VendorCatalogItem) => {
    setEditingItem(item);
    setTitle(item.title);
    setDescription(item.description || '');
    setSku(item.sku || '');
    setUnitPrice(item.unit_price);

    const knownUnits = ['PER_1000_PCS', 'PER_PIECE', 'PER_TRUCK', 'PER_TON', 'PER_BAG', 'PER_TRIP', 'PER_HOUR', 'PER_ACRE', 'PER_JOB'];
    if (knownUnits.includes(item.price_unit || '')) {
      setPriceUnit(item.price_unit || 'PER_1000_PCS');
      setCustomUnit('');
    } else {
      setPriceUnit('CUSTOM');
      setCustomUnit(item.price_unit || '');
    }

    setStockQuantity(item.stock_quantity ?? 0);
    setMinOrderQuantity(item.min_order_quantity || 1000);
    setSelectedAssetId(item.vendor_asset_id || '');
    setSelectedCategoryId(item.category_id || '');
    setPickupAddress(item.pickup_address || currentUser.address_text || '');

    const attrs = item.attributes || {};
    let compList: string[] = [];
    if (Array.isArray(attrs.included_components)) {
      compList = attrs.included_components;
    } else if (Array.isArray(attrs.included_items)) {
      compList = attrs.included_items;
    } else {
      compList = ['Service Package'];
    }
    setIncludedComponents(compList);
    setNotIncludedText(attrs.not_included || '');

    let itemImages: string[] = [];
    if (Array.isArray(item.images)) {
      itemImages = item.images;
    } else if (typeof item.images === 'string') {
      try {
        const parsed = JSON.parse(item.images);
        itemImages = Array.isArray(parsed) ? parsed : [];
      } catch {
        if ((item.images as string).startsWith('/')) {
          itemImages = [item.images as string];
        }
      }
    }
    setImages(itemImages);
    setErrorMsg('');
    setUploadError('');
    setOfferingModalOpen(true);
  };

  const handleDeleteOffering = async (id: string) => {
    if (!confirm('Are you sure you want to delete this sub-service offering?')) return;
    const ok = await deleteCatalogItem(id, currentUser.id);
    if (ok) {
      setItems((prev) => prev.filter((it) => it.id !== id));
    }
  };

  const handleResubmitOffering = async (item: VendorCatalogItem) => {
    try {
      setSaving(true);
      const payload: Partial<VendorCatalogItem> = {
        vendor_user_id: currentUser.id,
        title: item.title,
        description: item.description,
        sku: item.sku,
        unit_price: item.unit_price,
        price_unit: item.price_unit,
        stock_quantity: item.stock_quantity,
        min_order_quantity: item.min_order_quantity,
        images: item.images,
        attributes: item.attributes,
        pickup_address: item.pickup_address,
        status: 'PENDING_ADMIN_APPROVAL',
        is_available: false,
      };

      const updated = await updateCatalogItem(item.id, payload);
      setItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)));
    } catch (err: any) {
      alert(err.message || 'Failed to resubmit sub-service offering.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddCustomTag = () => {
    const val = newTagInput.trim();
    if (val && !includedComponents.includes(val)) {
      setIncludedComponents([...includedComponents, val]);
      setNewTagInput('');
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    setUploadingImage(true);
    setUploadError('');
    setUploadProgress(10);

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const newUploadedUrls: string[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (!allowedTypes.includes(file.type.toLowerCase())) {
          throw new Error(`File '${file.name}' has invalid format. Only JPG, PNG, and WEBP images are supported.`);
        }
        if (file.size > 15 * 1024 * 1024) {
          throw new Error(`File '${file.name}' exceeds 15MB limit.`);
        }

        const res = await uploadFile(file);
        if (res && res.url) {
          newUploadedUrls.push(res.url);
        }
        setUploadProgress(Math.round(((i + 1) / files.length) * 100));
      }
      setImages((prev) => [...prev, ...newUploadedUrls]);
    } catch (err: any) {
      setUploadError(err.message || 'Image upload failed. Please try again.');
    } finally {
      setUploadingImage(false);
      setUploadProgress(0);
      e.target.value = '';
    }
  };

  const handleSubmitOffering = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || unitPrice <= 0) {
      setErrorMsg('Please enter a valid sub-service title and unit price');
      return;
    }
    if (!selectedCategoryId) {
      setErrorMsg('Please select an approved Main Service category');
      return;
    }

    setSaving(true);
    setErrorMsg('');

    try {
      const finalPriceUnit = priceUnit === 'CUSTOM' ? (customUnit.trim() || 'UNIT') : priceUnit;
      const existingAttrs = editingItem?.attributes || {};
      const updatedAttributes = {
        ...existingAttrs,
        included_components: includedComponents,
        included_items: includedComponents,
        not_included: notIncludedText.trim(),
      };

      const payload: Partial<VendorCatalogItem> = {
        vendor_user_id: currentUser.id,
        vendor_asset_id: selectedAssetId || undefined,
        category_id: selectedCategoryId || undefined,
        title: title.trim(),
        description: description.trim(),
        sku: sku.trim(),
        unit_price: unitPrice,
        price_unit: finalPriceUnit,
        stock_quantity: stockQuantity,
        min_order_quantity: minOrderQuantity,
        pickup_address: pickupAddress.trim(),
        is_available: false, // Requires Admin Approval before appearing in Marketplace
        status: 'PENDING_ADMIN_APPROVAL',
        images: images,
        attributes: updatedAttributes,
      };

      if (editingItem) {
        const updated = await updateCatalogItem(editingItem.id, payload);
        setItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)));
      } else {
        const created = await createCatalogItem(payload);
        setItems((prev) => [created, ...prev]);
      }
      setOfferingModalOpen(false);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save sub-service offering');
    } finally {
      setSaving(false);
    }
  };

  const getMediaUrl = (url: string) => {
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
    return `${baseUrl}${url}`;
  };

  // Group offerings by Category for Section 2
  const groupedOfferingsMap = categories
    .map((category) => {
      const categoryOfferings = items.filter(
        (item) => item.category_id === category.id || item.category?.slug === category.slug
      );
      return {
        category,
        offerings: categoryOfferings,
      };
    })
    .filter((g) => g.offerings.length > 0);

  const unassignedOfferings = items.filter(
    (item) => !categories.some((c) => c.id === item.category_id || c.slug === item.category?.slug)
  );

  return (
    <div className="space-y-10 text-slate-900">
      {/* PAGE HEADER */}
      <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm space-y-1">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">SERVICES I PROVIDE</h1>
        <p className="text-xs sm:text-sm text-slate-500 font-medium">
          Manage the services you provide and the sub-service offerings you make available to customers.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 gap-3 bg-white rounded-3xl border border-slate-200 shadow-sm">
          <Loader2 className="w-6 h-6 text-slate-900 animate-spin" />
          <span className="text-sm text-slate-500 font-medium">Loading vendor services and sub-services...</span>
        </div>
      ) : (
        <>
          {/* ========================================================================= */}
          {/* SECTION 1: MY SERVICES                                                  */}
          {/* ========================================================================= */}
          <section className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
              <div>
                <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">MY SERVICES</h2>
                <p className="text-xs text-slate-500 mt-1">
                  These are the main services you have requested and been approved to provide.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setRequestServiceModalOpen(true)}
                className="px-5 py-2.5 rounded-xl bg-black hover:bg-slate-800 text-white font-bold text-xs shadow-sm flex items-center justify-center gap-2 transition-all shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>+ Request a Service</span>
              </button>
            </div>

            {/* MY SERVICES LIST */}
            {localUserAssets.length === 0 ? (
              <div className="text-center py-12 px-4 rounded-2xl bg-slate-50 border border-dashed border-slate-200 space-y-3">
                <Layers className="w-10 h-10 text-slate-400 mx-auto" />
                <h3 className="text-sm font-bold text-slate-800">You haven&apos;t requested any services yet.</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Request a main service category to start providing your services on the platform.
                </p>
                <button
                  type="button"
                  onClick={() => setRequestServiceModalOpen(true)}
                  className="px-4 py-2 rounded-xl bg-black text-white font-bold text-xs hover:bg-slate-800 transition-colors inline-flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Request a Service</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {localUserAssets.map((asset) => {
                  const cat =
                    categories.find(
                      (c) =>
                        c.id === asset.category_id ||
                        c.slug === asset.category?.slug ||
                        c.slug.toLowerCase() === asset.asset_type?.toLowerCase() ||
                        c.name.toLowerCase() === asset.asset_type?.toLowerCase()
                    ) || {
                      name: asset.title || 'Main Service',
                    };

                  // Stage 1 (Service Request) Status
                  const isRequestApproved = asset.status !== 'PENDING_APPROVAL' && asset.status !== 'REJECTED';
                  const isRequestPending = asset.status === 'PENDING_APPROVAL';
                  const isRequestRejected = asset.status === 'REJECTED';

                  // Stage 2 (Service Details) Status
                  const isDetailsApproved = asset.status === 'ACTIVE';
                  const isDetailsPending = asset.status === 'UNDER_REVIEW';
                  const isDetailsNeeded = asset.status === 'DOCUMENTS_PENDING';
                  const isDetailsRejected = asset.status === 'REJECTED' && isRequestApproved;

                  return (
                    <div
                      key={asset.id}
                      className="p-5 rounded-2xl bg-white border border-slate-200 hover:border-slate-300 transition-all space-y-4 shadow-sm flex flex-col justify-between"
                    >
                      <div className="space-y-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                            <Layers className="w-4 h-4 text-black" />
                          </div>
                          <div>
                            <h3 className="text-base font-extrabold text-slate-900">{cat.name}</h3>
                            <span className="text-[11px] text-slate-500 font-medium">Main Service Category</span>
                          </div>
                        </div>

                        {/* Status Table / Breakdown */}
                        <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2 font-medium">
                          {/* Row 1: Service Request */}
                          <div className="flex items-center justify-between">
                            <span className="text-slate-600 font-semibold">Service Request</span>
                            {isRequestApproved && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> ✓ Approved
                              </span>
                            )}
                            {isRequestPending && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                <Clock className="w-3.5 h-3.5 text-amber-600" /> ⏳ Pending Admin Approval
                              </span>
                            )}
                            {isRequestRejected && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-800 border border-rose-200">
                                <AlertCircle className="w-3.5 h-3.5 text-rose-600" /> ✕ Rejected
                              </span>
                            )}
                          </div>

                          {/* Row 2: Service Details */}
                          <div className="flex items-center justify-between border-t border-slate-200/60 pt-2">
                            <span className="text-slate-600 font-semibold">Service Details</span>
                            {isDetailsApproved && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> ✓ Approved
                              </span>
                            )}
                            {isDetailsPending && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                <Clock className="w-3.5 h-3.5 text-amber-600" /> ⏳ Pending Admin Approval
                              </span>
                            )}
                            {isDetailsNeeded && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">
                                ⏳ Details Pending
                              </span>
                            )}
                            {isDetailsRejected && (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-800 border border-rose-200">
                                <AlertCircle className="w-3.5 h-3.5 text-rose-600" /> ✕ Rejected
                              </span>
                            )}
                            {isRequestPending && <span className="text-[11px] text-slate-400 font-mono">—</span>}
                          </div>

                          {/* Admin Rejection Reason Callout */}
                          {asset.rejection_reason && (isRequestRejected || isDetailsRejected) && (
                            <div className="mt-2 p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-medium space-y-0.5">
                              <span className="font-bold block text-[10px] uppercase text-rose-700">Admin Note / Feedback:</span>
                              <p className="text-rose-800">{asset.rejection_reason}</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Action Button */}
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                        {isRequestPending ? (
                          <span className="text-xs text-slate-500 italic">Awaiting Admin request review...</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleOpenStage2Form(asset)}
                            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-900 text-xs font-bold transition-all flex items-center gap-1.5"
                          >
                            <Edit2 className="w-3.5 h-3.5 text-slate-700" />
                            <span>
                              {isDetailsApproved
                                ? 'View / Edit Details'
                                : isDetailsPending
                                ? 'View Details Status'
                                : 'Complete Service Details'}
                            </span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ========================================================================= */}
          {/* SECTION 2: MY SERVICE OFFERINGS & SUB-SERVICES                          */}
          {/* ========================================================================= */}
          <section className="bg-white p-6 sm:p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
              <div>
                <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">MY SERVICE OFFERINGS</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Create the specific sub-services or packages you want to offer to customers.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleOpenAddOffering}
                  disabled={!canCreateOffering}
                  className={`px-5 py-2.5 rounded-xl text-xs font-bold shadow-sm flex items-center justify-center gap-2 transition-all ${
                    canCreateOffering
                      ? 'bg-black hover:bg-slate-800 text-white cursor-pointer'
                      : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                  }`}
                  title={!canCreateOffering ? 'Complete and get your main service details approved first' : 'Create Sub-Service'}
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Create Sub-Service</span>
                </button>
              </div>
            </div>

            {/* Gating Notice Banner if no approved service exists */}
            {!canCreateOffering && (
              <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs space-y-1">
                <div className="flex items-center gap-2 font-bold">
                  <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>No approved services available yet.</span>
                </div>
                <p className="text-amber-800 text-[11px] pl-6">
                  Request and complete a service first. Once Admin approves it, you can create your sub-service offerings.
                </p>
              </div>
            )}

            {/* SUB-SERVICES LIST / GRID */}
            {items.length === 0 ? (
              <div className="text-center py-12 px-4 rounded-2xl bg-slate-50 border border-dashed border-slate-200 space-y-3">
                <Package className="w-10 h-10 text-slate-400 mx-auto" />
                <h3 className="text-sm font-bold text-slate-800">You don&apos;t have any service offerings yet.</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Create a sub-service offering under one of your approved main services.
                </p>
                <button
                  type="button"
                  onClick={handleOpenAddOffering}
                  disabled={!canCreateOffering}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1.5 ${
                    canCreateOffering
                      ? 'bg-black text-white hover:bg-slate-800'
                      : 'bg-slate-200 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Create Sub-Service</span>
                </button>
              </div>
            ) : (
              <div className="space-y-8">
                {groupedOfferingsMap.map(({ category, offerings }) => (
                  <div key={category.id} className="space-y-4">
                    <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Main Service:</span>
                      <span className="text-sm font-extrabold text-slate-900">{category.name}</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {offerings.map((item) => {
                        const attrs = item.attributes || {};
                        const components: string[] = Array.isArray(attrs.included_components)
                          ? attrs.included_components
                          : Array.isArray(attrs.included_items)
                          ? attrs.included_items
                          : [];

                        const isApproved = item.status === 'ACTIVE_IN_CATALOG' || item.status === 'APPROVED';
                        const isPending = item.status === 'PENDING_ADMIN_APPROVAL';
                        const isRejected = item.status === 'REJECTED';

                        return (
                          <div
                            key={item.id}
                            className="p-5 rounded-2xl bg-white border border-slate-200 hover:border-slate-300 transition-all flex flex-col justify-between space-y-4 shadow-sm"
                          >
                            <div className="space-y-3">
                              <div className="flex items-start justify-between gap-2">
                                <h3 className="text-base font-extrabold text-slate-900">{item.title}</h3>
                                <span className="px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-900 text-xs font-bold font-mono shrink-0">
                                  ₹{item.unit_price} / {item.price_unit ? item.price_unit.replace('PER_', '').toLowerCase() : 'unit'}
                                </span>
                              </div>

                              {/* Status Indicator */}
                              <div>
                                {isApproved && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold">
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> ✓ Approved
                                  </span>
                                )}
                                {isPending && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-bold">
                                    <Clock className="w-3.5 h-3.5 text-amber-600" /> ⏳ Pending Admin Approval
                                  </span>
                                )}
                                {isRejected && (
                                  <div className="space-y-1.5">
                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-rose-50 border border-rose-200 text-rose-800 text-[11px] font-bold">
                                      <AlertCircle className="w-3.5 h-3.5 text-rose-600" /> ✕ Rejected by Admin
                                    </span>
                                    {item.rejection_reason && (
                                      <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs font-medium space-y-0.5">
                                        <span className="font-bold block text-[10px] uppercase text-rose-700">Admin Note / Feedback:</span>
                                        <p className="text-rose-800">{item.rejection_reason}</p>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>

                              {/* Included Components Tags */}
                              {components.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                  {components.map((comp, idx) => (
                                    <span
                                      key={idx}
                                      className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-800 text-[11px] font-medium flex items-center gap-1"
                                    >
                                      <Check className="w-3 h-3 text-black" />
                                      <span>{comp}</span>
                                    </span>
                                  ))}
                                </div>
                              )}

                              {item.description && (
                                <p className="text-xs text-slate-600 line-clamp-2">{item.description}</p>
                              )}
                            </div>

                            {/* Card Actions */}
                            <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => setViewingItem(item)}
                                  className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold flex items-center gap-1 transition-colors"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>View</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditOffering(item)}
                                  className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold flex items-center gap-1 transition-colors"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                  <span>Edit</span>
                                </button>
                              </div>

                              <div className="flex items-center gap-2">
                                {isRejected && (
                                  <button
                                    type="button"
                                    onClick={() => handleResubmitOffering(item)}
                                    disabled={saving}
                                    className="px-3 py-1.5 rounded-lg bg-black hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1 transition-colors"
                                  >
                                    <RefreshCw className="w-3 h-3" />
                                    <span>Resubmit</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleDeleteOffering(item.id)}
                                  className="px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold flex items-center gap-1 transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>Delete</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {/* Unassigned Offerings fallback */}
                {unassignedOfferings.length > 0 && (
                  <div className="space-y-4 pt-4 border-t border-slate-100">
                    <h3 className="text-sm font-extrabold text-slate-900">Other Sub-Services</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {unassignedOfferings.map((item) => (
                        <div key={item.id} className="p-4 rounded-2xl border border-slate-200 space-y-2 bg-white">
                          <h4 className="font-bold text-slate-900 text-sm">{item.title}</h4>
                          <p className="text-xs text-slate-600 font-mono">₹{item.unit_price}</p>
                          <div className="flex justify-end gap-2 pt-2">
                            <button onClick={() => setViewingItem(item)} className="px-3 py-1 rounded bg-slate-100 text-slate-900 text-xs font-bold">View</button>
                            <button onClick={() => handleOpenEditOffering(item)} className="px-3 py-1 rounded bg-slate-100 text-slate-900 text-xs font-bold">Edit</button>
                            <button onClick={() => handleDeleteOffering(item.id)} className="px-3 py-1 rounded bg-rose-50 text-rose-700 text-xs font-bold">Delete</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: REQUEST A SERVICE (SECTION 1 ACTION)                             */}
      {/* ========================================================================= */}
      {requestServiceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-xl bg-white border border-slate-200 rounded-3xl p-6 shadow-2xl space-y-5 my-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">REQUEST A SERVICE</h3>
                <p className="text-xs text-slate-500 mt-0.5">Choose a service you want to provide:</p>
              </div>
              <button
                type="button"
                onClick={() => setRequestServiceModalOpen(false)}
                className="text-slate-400 hover:text-slate-900 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
              {categories.map((cat) => {
                const existingAsset = localUserAssets.find(
                  (a) =>
                    a.category_id === cat.id ||
                    a.category?.slug === cat.slug ||
                    a.asset_type?.toLowerCase() === cat.slug.toLowerCase() ||
                    a.asset_type?.toLowerCase() === cat.name.toLowerCase()
                );

                return (
                  <div
                    key={cat.id}
                    className="p-4 rounded-2xl border border-slate-200 hover:border-slate-300 transition-all flex items-center justify-between gap-4 bg-white"
                  >
                    <div className="space-y-0.5">
                      <h4 className="font-extrabold text-slate-900 text-sm">{cat.name}</h4>
                      <p className="text-xs text-slate-500">{cat.description || 'Main platform service'}</p>
                    </div>

                    {existingAsset ? (
                      <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
                        {existingAsset.status === 'ACTIVE'
                          ? '✓ Approved'
                          : existingAsset.status === 'PENDING_APPROVAL'
                          ? '⏳ Request Pending'
                          : 'In Progress'}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleStage1OptIn(cat)}
                        className="px-4 py-2 rounded-xl bg-black hover:bg-slate-800 text-white font-bold text-xs shadow-sm transition-all shrink-0 flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Request Service</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="pt-2 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setRequestServiceModalOpen(false)}
                className="px-5 py-2 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 font-bold text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: CREATE / EDIT SUB-SERVICE OFFERING (FULL VENDOR FREEDOM)          */}
      {/* ========================================================================= */}
      {offeringModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/50 backdrop-blur-sm overflow-hidden">
          <div className="relative w-full max-w-2xl max-h-[calc(100dvh-2rem)] my-auto bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="p-5 sm:p-6 border-b border-slate-200 flex items-center justify-between flex-none bg-white">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">
                  {editingItem ? 'Edit Sub-Service Offering' : 'Create Sub-Service Offering'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  You have full freedom to define your sub-service name, pricing, and inclusions. (Requires Admin approval before going live).
                </p>
              </div>
              <button type="button" onClick={() => setOfferingModalOpen(false)} className="text-slate-400 hover:text-slate-900 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-6 space-y-4">
              {errorMsg && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <form id="vendor-offering-form" onSubmit={handleSubmitOffering} className="space-y-4 text-xs">
                {/* Step 1: Choose Approved Main Service */}
                <div>
                  <label className="block text-slate-900 font-bold mb-1">Main Service Category *</label>
                  <select
                    required
                    value={selectedAssetId}
                    onChange={(e) => {
                      const targetAssetId = e.target.value;
                      setSelectedAssetId(targetAssetId);
                      const matchingSvc = eligibleMainServices.find((s) => s.assetId === targetAssetId);
                      if (matchingSvc) {
                        setSelectedCategoryId(matchingSvc.categoryId);
                        if (!editingItem) {
                          setTitle(`${matchingSvc.name} + Delivery`);
                        }
                      }
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 font-semibold focus:outline-none focus:border-black"
                  >
                    {eligibleMainServices.map((svc) => (
                      <option key={svc.assetId} value={svc.assetId}>
                        {svc.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Sub-Service Name / Title */}
                <div>
                  <label className="block text-slate-900 font-bold mb-1">Sub-Service / Offering Title *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Red Clay Bricks + Loading + Site Delivery, 50 Bags Cement + Unloading..."
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 font-bold focus:outline-none focus:border-black text-sm"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Name your sub-service offering freely. You can offer any combination or custom package.
                  </p>
                </div>

                {/* What is Included (Dynamic Tags) */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                  <label className="block text-slate-900 font-extrabold text-xs">
                    What is Included in this Sub-Service?
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="Type included item/service (e.g. Material, Loading, Transport, Unloading) and click Add"
                      value={newTagInput}
                      onChange={(e) => setNewTagInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddCustomTag();
                        }
                      }}
                      className="flex-1 px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-black"
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomTag}
                      className="px-3.5 py-2 rounded-xl bg-black text-white font-bold text-xs hover:bg-slate-800"
                    >
                      + Add
                    </button>
                  </div>

                  {includedComponents.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-2">
                      {includedComponents.map((tag, idx) => (
                        <span
                          key={idx}
                          className="px-2.5 py-1 rounded-lg bg-white border border-slate-300 text-slate-900 text-xs font-semibold flex items-center gap-1.5 shadow-sm"
                        >
                          <Check className="w-3 h-3 text-black" />
                          <span>{tag}</span>
                          <button
                            type="button"
                            onClick={() => setIncludedComponents(includedComponents.filter((_, i) => i !== idx))}
                            className="text-slate-400 hover:text-rose-600 ml-1 font-bold"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* What is NOT Included */}
                <div>
                  <label className="block text-slate-900 font-bold mb-1">What is NOT Included? (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. GST extra, Crane unloading required by buyer..."
                    value={notIncludedText}
                    onChange={(e) => setNotIncludedText(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-black"
                  />
                </div>

                {/* Price & Price Unit */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-900 font-bold mb-1">Offering Price (₹) *</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={unitPrice}
                      onChange={(e) => setUnitPrice(parseFloat(e.target.value) || 0)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 font-mono font-bold focus:outline-none focus:border-black text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-900 font-bold mb-1">Pricing Unit *</label>
                    <select
                      value={priceUnit}
                      onChange={(e) => setPriceUnit(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 font-medium focus:outline-none focus:border-black"
                    >
                      <option value="PER_1000_PCS">Per 1,000 Pcs</option>
                      <option value="PER_PIECE">Per Piece</option>
                      <option value="PER_TRUCK">Per Truckload</option>
                      <option value="PER_TON">Per Ton</option>
                      <option value="PER_BAG">Per Bag</option>
                      <option value="PER_TRIP">Per Delivery Trip</option>
                      <option value="PER_HOUR">Per Hour</option>
                      <option value="PER_ACRE">Per Acre</option>
                      <option value="PER_JOB">Per Job / Package</option>
                      <option value="CUSTOM">Custom Unit...</option>
                    </select>
                    {priceUnit === 'CUSTOM' && (
                      <input
                        type="text"
                        placeholder="e.g. Per 50 Bags, Per 100 SqFt..."
                        value={customUnit}
                        onChange={(e) => setCustomUnit(e.target.value)}
                        className="w-full mt-2 px-3 py-2 rounded-xl bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-black"
                      />
                    )}
                  </div>
                </div>

                {/* MOQ & Stock */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Min Order Quantity (MOQ)</label>
                    <input
                      type="number"
                      value={minOrderQuantity}
                      onChange={(e) => setMinOrderQuantity(parseInt(e.target.value) || 1)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 font-mono focus:outline-none focus:border-black"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">Available Quantity / Stock</label>
                    <input
                      type="number"
                      value={stockQuantity}
                      onChange={(e) => setStockQuantity(parseInt(e.target.value) || 0)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 font-mono focus:outline-none focus:border-black"
                    />
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-slate-900 font-bold mb-1">Description & Details</label>
                  <textarea
                    rows={2}
                    placeholder="Provide details about material strength, quality, delivery timeframe, or package scope..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-black"
                  />
                </div>

                {/* Photos */}
                <div className="space-y-2 border border-slate-200 rounded-2xl p-4 bg-slate-50">
                  <div className="flex items-center justify-between">
                    <label className="block text-slate-900 font-bold text-xs flex items-center gap-1.5">
                      <ImageIcon className="w-4 h-4 text-slate-800" />
                      <span>Sub-Service Photos</span>
                    </label>
                    <span className="text-[11px] text-slate-500 font-medium">{images.length} uploaded</span>
                  </div>

                  {images.length > 0 && (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 pt-1">
                      {images.map((imgUrl, idx) => (
                        <div key={idx} className="relative group rounded-xl overflow-hidden border border-slate-200 aspect-square bg-slate-100">
                          <img src={getMediaUrl(imgUrl)} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => setImages((prev) => prev.filter((_, i) => i !== idx))}
                            className="absolute top-1 right-1 p-1 rounded-full bg-black/80 text-white hover:bg-rose-600 transition-colors shadow"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="pt-1">
                    <label className={`flex flex-col items-center justify-center p-3.5 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${uploadingImage ? 'bg-slate-100 border-slate-300' : 'bg-white border-slate-300 hover:border-black'}`}>
                      <input
                        type="file"
                        multiple
                        accept="image/jpeg,image/png,image/webp"
                        onChange={handleFileSelect}
                        disabled={uploadingImage}
                        className="hidden"
                      />
                      {uploadingImage ? (
                        <div className="flex items-center gap-2 text-slate-700 font-medium text-xs">
                          <Loader2 className="w-4 h-4 animate-spin text-black" />
                          <span>Uploading photos... ({uploadProgress}%)</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-slate-700 text-xs">
                          <Upload className="w-4 h-4 text-slate-800" />
                          <span className="font-semibold text-slate-900">+ Add Photos</span>
                        </div>
                      )}
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-700 font-bold mb-1">Dispatch / Yard Location</label>
                  <input
                    type="text"
                    placeholder="Yard location or dispatch site address"
                    value={pickupAddress}
                    onChange={(e) => setPickupAddress(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-black"
                  />
                </div>
              </form>
            </div>

            {/* Modal Footer */}
            <div className="p-4 sm:p-5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-3 flex-none">
              <button
                type="button"
                onClick={() => setOfferingModalOpen(false)}
                className="px-5 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="vendor-offering-form"
                disabled={saving || uploadingImage}
                className="px-6 py-2.5 rounded-xl bg-black hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md disabled:opacity-50"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{editingItem ? 'Submit Updated Sub-Service' : 'Submit for Admin Approval'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 3: VIEW OFFERING DETAILS                                           */}
      {/* ========================================================================= */}
      {viewingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-lg bg-white border border-slate-200 rounded-3xl p-6 shadow-2xl space-y-5 my-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">{viewingItem.title}</h3>
                <span className="text-xs font-bold text-slate-500 font-mono">₹{viewingItem.unit_price} / {viewingItem.price_unit}</span>
              </div>
              <button type="button" onClick={() => setViewingItem(null)} className="text-slate-400 hover:text-slate-900 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <span className="font-bold text-slate-500 uppercase text-[10px] block mb-1">Status</span>
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 text-slate-900 font-bold border border-slate-200">
                  {viewingItem.status === 'ACTIVE_IN_CATALOG' || viewingItem.status === 'APPROVED'
                    ? '✓ Approved & Live in Marketplace'
                    : viewingItem.status === 'REJECTED'
                    ? '✕ Rejected'
                    : '⏳ Pending Admin Approval'}
                </span>
              </div>

              {viewingItem.description && (
                <div>
                  <span className="font-bold text-slate-500 uppercase text-[10px] block mb-1">Description</span>
                  <p className="text-slate-800 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-200">
                    {viewingItem.description}
                  </p>
                </div>
              )}

              {viewingItem.pickup_address && (
                <div>
                  <span className="font-bold text-slate-500 uppercase text-[10px] block mb-1">Yard Location</span>
                  <p className="text-slate-800 font-medium">{viewingItem.pickup_address}</p>
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setViewingItem(null)}
                className="px-5 py-2.5 rounded-xl bg-black text-white font-bold text-xs hover:bg-slate-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 4: STAGE 2 SERVICE DETAILS SUBMISSION                              */}
      {/* ========================================================================= */}
      {stage2ModalAsset && stage2Category && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm overflow-hidden">
          <div className="relative w-full max-w-2xl max-h-[calc(100dvh-2rem)] my-auto bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
            {/* Header */}
            <div className="p-5 sm:p-6 border-b border-slate-200 flex items-center justify-between flex-none bg-white">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">
                  Service Details — {stage2Category.name}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Submit required specifications, MOQ, yard location, and photos for Admin approval.
                </p>
              </div>
              <button type="button" onClick={() => setStage2ModalAsset(null)} className="text-slate-400 hover:text-slate-900 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Form Body */}
            <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-6 space-y-4">
              {stage2Error && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{stage2Error}</span>
                </div>
              )}

              <form id="stage2-details-form" onSubmit={handleSubmitStage2Details} className="space-y-4 text-xs">
                {((stage2Category.opportunity_fields && stage2Category.opportunity_fields.length > 0
                  ? stage2Category.opportunity_fields
                  : [
                      { key: 'brick_type', label: 'Brick Type / Material Grade', type: 'select', options: ['Red Clay Bricks', 'Fly Ash Bricks', 'AAC Blocks', 'Concrete Blocks'], required: true },
                      { key: 'dimensions', label: 'Standard Dimensions (mm)', type: 'text', placeholder: '230 x 110 x 70 mm', required: true },
                      { key: 'quality_grade', label: 'Quality Grade / Class', type: 'select', options: ['Class A (High Strength)', 'Class B (Standard)', 'Heavy Duty Structural'], required: true },
                      { key: 'moq_units', label: 'Minimum Order Quantity (MOQ)', type: 'number', placeholder: '1000', required: true },
                      { key: 'base_price', label: 'Base Material Price (₹)', type: 'number', placeholder: '1500', required: true },
                      { key: 'pickup_location', label: 'Pickup Yard Location', type: 'text', placeholder: 'e.g. Choutuppal Yard', required: true },
                    ]) as OpportunityFieldSpec[]).map((field) => (
                  <div key={field.key} className="space-y-1">
                    <label className="block text-slate-800 font-semibold">
                      {field.label} {field.required && <span className="text-rose-600">*</span>}
                    </label>

                    {field.type === 'select' && field.options ? (
                      <select
                        value={stage2FormValues[field.key] || ''}
                        onChange={(e) => setStage2FormValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-black font-medium"
                      >
                        <option value="">Select {field.label}...</option>
                        {field.options.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={field.type === 'number' ? 'number' : 'text'}
                        value={stage2FormValues[field.key] || ''}
                        onChange={(e) => setStage2FormValues((prev) => ({ ...prev, [field.key]: e.target.value }))}
                        placeholder={field.placeholder}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 focus:outline-none focus:border-black font-medium"
                      />
                    )}
                  </div>
                ))}

                {/* Stage 2 Photos */}
                <div className="space-y-2 border border-slate-200 rounded-2xl p-4 bg-slate-50">
                  <div className="flex items-center justify-between">
                    <label className="block text-slate-900 font-semibold text-xs flex items-center gap-1.5">
                      <ImageIcon className="w-4 h-4 text-slate-800" />
                      <span>Yard & License Photos</span>
                    </label>
                    <span className="text-[11px] text-slate-500 font-medium">{stage2Photos.length} uploaded</span>
                  </div>

                  {stage2Photos.length > 0 && (
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 pt-1">
                      {stage2Photos.map((imgUrl, idx) => (
                        <div key={idx} className="relative group rounded-xl overflow-hidden border border-slate-200 aspect-square bg-slate-100">
                          <img src={getMediaUrl(imgUrl)} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => setStage2Photos((prev) => prev.filter((_, i) => i !== idx))}
                            className="absolute top-1 right-1 p-1 rounded-full bg-black/80 text-white hover:bg-rose-600 transition-colors shadow"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="pt-1">
                    <label className="flex flex-col items-center justify-center p-3 border-2 border-dashed rounded-xl cursor-pointer bg-white border-slate-300 hover:border-black transition-colors">
                      <input
                        type="file"
                        multiple
                        accept="image/jpeg,image/png,image/webp"
                        onChange={async (e) => {
                          const files = Array.from(e.target.files || []);
                          if (files.length === 0) return;
                          try {
                            for (const f of files) {
                              const res = await uploadFile(f);
                              if (res && res.url) {
                                setStage2Photos((prev) => [...prev, res.url]);
                              }
                            }
                          } catch (err: any) {
                            alert(err.message || 'Photo upload failed');
                          }
                          e.target.value = '';
                        }}
                        className="hidden"
                      />
                      <div className="flex items-center gap-2 text-slate-700 text-xs">
                        <Upload className="w-4 h-4 text-slate-800" />
                        <span className="font-semibold text-slate-900">+ Upload Yard / Spec Photos</span>
                      </div>
                    </label>
                  </div>
                </div>
              </form>
            </div>

            {/* Footer */}
            <div className="p-4 sm:p-5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-3 flex-none">
              <button
                type="button"
                onClick={() => setStage2ModalAsset(null)}
                className="px-5 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="stage2-details-form"
                disabled={submittingStage2}
                className="px-6 py-2.5 rounded-xl bg-black hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md disabled:opacity-50"
              >
                {submittingStage2 && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Submit Details for Admin Approval</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
