'use client';

import React, { useState, useEffect } from 'react';
import { UserProfile, UserServiceAsset, VendorCatalogItem, Category, getVendorCatalog, createCatalogItem, updateCatalogItem, deleteCatalogItem, getCategories } from '@/lib/api';
import {
  Package,
  Plus,
  Edit2,
  Trash2,
  CheckCircle,
  Tag,
  DollarSign,
  Layers,
  Loader2,
  X,
  AlertCircle,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface VendorCatalogManagerProps {
  currentUser: UserProfile;
  userAssets: UserServiceAsset[];
}

export interface VariantFormItem {
  id: string;
  title: string;
  price: number;
  unit: string;
  included_services: string[];
  is_active: boolean;
  description?: string;
}

export interface AddonFormItem {
  id: string;
  title: string;
  price: number;
  is_active: boolean;
  description?: string;
}

export default function VendorCatalogManager({ currentUser, userAssets }: VendorCatalogManagerProps) {
  const [items, setItems] = useState<VendorCatalogItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<VendorCatalogItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sku, setSku] = useState('');
  const [unitPrice, setUnitPrice] = useState<number>(10);
  const [priceUnit, setPriceUnit] = useState('PER_PIECE');
  const [stockQuantity, setStockQuantity] = useState<number>(1000);
  const [minOrderQuantity, setMinOrderQuantity] = useState<number>(1);
  const [selectedAssetId, setSelectedAssetId] = useState<string>('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');

  // Dynamic Variants & Add-ons state
  const [variants, setVariants] = useState<VariantFormItem[]>([]);
  const [addons, setAddons] = useState<AddonFormItem[]>([]);
  const [showAdvancedConfig, setShowAdvancedConfig] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [catData, catalogRes] = await Promise.all([
        getCategories(),
        getVendorCatalog(currentUser.id),
      ]);
      setCategories(catData || []);
      if (catalogRes) {
        setItems(catalogRes.items || []);
      }
    } catch {
      // Error handling
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentUser.id]);

  const handleOpenAdd = () => {
    setEditingItem(null);
    setTitle('');
    setDescription('');
    setSku('');
    setUnitPrice(10);
    setPriceUnit('PER_PIECE');
    setStockQuantity(1000);
    setMinOrderQuantity(1);
    setSelectedAssetId(userAssets[0]?.id || '');
    setSelectedCategoryId(categories[0]?.id || '');
    setVariants([]);
    setAddons([]);
    setShowAdvancedConfig(false);
    setErrorMsg('');
    setModalOpen(true);
  };

  const handleOpenEdit = (item: VendorCatalogItem) => {
    setEditingItem(item);
    setTitle(item.title);
    setDescription(item.description || '');
    setSku(item.sku || '');
    setUnitPrice(item.unit_price);
    setPriceUnit(item.price_unit || 'PER_PIECE');
    setStockQuantity(item.stock_quantity ?? 0);
    setMinOrderQuantity(item.min_order_quantity || 1);
    setSelectedAssetId(item.vendor_asset_id || '');
    setSelectedCategoryId(item.category_id || '');

    const rawVariants: any[] = item.attributes?.variants || item.attributes?.selling_options || item.attributes?.pricing_options || [];
    const parsedVariants: VariantFormItem[] = Array.isArray(rawVariants)
      ? rawVariants.map((v, idx) => ({
          id: v.id || `var_${idx}_${Date.now()}`,
          title: v.title || v.name || 'Variant',
          price: typeof v.price === 'number' ? v.price : (typeof v.unit_price === 'number' ? v.unit_price : item.unit_price),
          unit: v.unit || v.price_unit || item.price_unit || 'PER_PIECE',
          included_services: Array.isArray(v.included_services) ? v.included_services : [],
          is_active: v.is_active !== false,
          description: v.description || '',
        }))
      : [];

    const rawAddons: any[] = item.attributes?.addons || [];
    const parsedAddons: AddonFormItem[] = Array.isArray(rawAddons)
      ? rawAddons.map((a, idx) => ({
          id: a.id || `addon_${idx}_${Date.now()}`,
          title: a.title || a.name || 'Addon',
          price: typeof a.price === 'number' ? a.price : (typeof a.unit_price === 'number' ? a.unit_price : 0),
          is_active: a.is_active !== false,
          description: a.description || '',
        }))
      : [];

    setVariants(parsedVariants);
    setAddons(parsedAddons);
    setShowAdvancedConfig(parsedVariants.length > 0 || parsedAddons.length > 0);
    setErrorMsg('');
    setModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this catalog product?')) return;
    const ok = await deleteCatalogItem(id, currentUser.id);
    if (ok) {
      setItems((prev) => prev.filter((it) => it.id !== id));
    }
  };

  const handleAddVariant = () => {
    const newVar: VariantFormItem = {
      id: `var_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      title: 'Material + Transport',
      price: unitPrice > 0 ? unitPrice + 5 : 15,
      unit: priceUnit,
      included_services: ['Transport'],
      is_active: true,
      description: 'Includes site delivery',
    };
    setVariants((prev) => [...prev, newVar]);
  };

  const handleUpdateVariant = (id: string, field: keyof VariantFormItem, val: any) => {
    setVariants((prev) =>
      prev.map((v) => (v.id === id ? { ...v, [field]: val } : v))
    );
  };

  const handleRemoveVariant = (id: string) => {
    setVariants((prev) => prev.filter((v) => v.id !== id));
  };

  const handleAddAddon = () => {
    const newAddon: AddonFormItem = {
      id: `addon_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      title: 'Unloading Service',
      price: 200,
      is_active: true,
      description: 'Manual site unloading',
    };
    setAddons((prev) => [...prev, newAddon]);
  };

  const handleUpdateAddon = (id: string, field: keyof AddonFormItem, val: any) => {
    setAddons((prev) =>
      prev.map((a) => (a.id === id ? { ...a, [field]: val } : a))
    );
  };

  const handleRemoveAddon = (id: string) => {
    setAddons((prev) => prev.filter((a) => a.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || unitPrice <= 0) {
      setErrorMsg('Please enter a valid title and unit price');
      return;
    }
    setSaving(true);
    setErrorMsg('');

    try {
      const existingAttrs = editingItem?.attributes || {};
      const updatedAttributes = {
        ...existingAttrs,
        variants: variants.map((v) => ({
          ...v,
          name: v.title,
          unit_price: v.price,
        })),
        selling_options: variants.map((v) => ({
          ...v,
          name: v.title,
          unit_price: v.price,
        })),
        addons: addons.map((a) => ({
          ...a,
          name: a.title,
          unit_price: a.price,
        })),
      };

      const payload: Partial<VendorCatalogItem> = {
        vendor_user_id: currentUser.id,
        vendor_asset_id: selectedAssetId || undefined,
        category_id: selectedCategoryId || undefined,
        title: title.trim(),
        description: description.trim(),
        sku: sku.trim(),
        unit_price: unitPrice,
        price_unit: priceUnit,
        stock_quantity: stockQuantity,
        min_order_quantity: minOrderQuantity,
        is_available: true,
        attributes: updatedAttributes,
      };

      if (editingItem) {
        const updated = await updateCatalogItem(editingItem.id, payload);
        setItems((prev) => prev.map((it) => (it.id === updated.id ? updated : it)));
      } else {
        const created = await createCatalogItem(payload);
        setItems((prev) => [created, ...prev]);
      }
      setModalOpen(false);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save catalog item');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-3xl bg-slate-900/60 border border-slate-800">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-bold text-emerald-400 uppercase tracking-widest">
              My Vendor Catalog Storefront
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-white">Manage Products, Packages & Variants</h2>
          <p className="text-xs text-slate-400 mt-1">
            Configure main products/services with dynamic variants (e.g. Material Only, Material + Loading + Transport) and optional add-ons.
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="px-5 py-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-xl shadow-emerald-600/20 flex items-center gap-2 transition-all shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add Catalog Product</span>
        </button>
      </div>

      {/* Catalog Items List */}
      {loading ? (
        <div className="flex items-center justify-center py-16 gap-3">
          <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
          <span className="text-sm text-slate-400">Loading catalog items...</span>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-16 px-4 rounded-3xl bg-slate-900/40 border border-slate-800/80 space-y-4">
          <Package className="w-12 h-12 text-slate-600 mx-auto" />
          <h3 className="text-base font-bold text-slate-300">No Catalog Products Added Yet</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Click &quot;Add Catalog Product&quot; to list your products/services so customers can order directly from your store.
          </p>
          <button
            onClick={handleOpenAdd}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
          >
            Add First Product
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => {
            const itemVariants: any[] = item.attributes?.variants || item.attributes?.selling_options || item.attributes?.pricing_options || [];
            const itemAddons: any[] = item.attributes?.addons || [];

            return (
              <div
                key={item.id}
                className="p-5 rounded-2xl bg-slate-900/70 border border-slate-800 hover:border-slate-700 transition-all flex flex-col justify-between space-y-4"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-bold text-white">{item.title}</h3>
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold font-mono">
                      ₹{item.unit_price} / {item.price_unit ? item.price_unit.replace('PER_', '').toLowerCase() : 'unit'}
                    </span>
                  </div>
                  {item.description && <p className="text-xs text-slate-400 line-clamp-2">{item.description}</p>}

                  <div className="flex items-center gap-2 text-[11px] text-slate-400 pt-1 flex-wrap">
                    {item.sku && <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">SKU: {item.sku}</span>}
                    <span className="text-emerald-400 font-medium">Stock: {item.stock_quantity}</span>
                    {itemVariants.length > 0 && (
                      <span className="px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 text-[10px] font-bold">
                        {itemVariants.length} Variant{itemVariants.length > 1 ? 's' : ''}
                      </span>
                    )}
                    {itemAddons.length > 0 && (
                      <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[10px] font-bold">
                        {itemAddons.length} Add-on{itemAddons.length > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                  <button
                    onClick={() => handleOpenEdit(item)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1 transition-colors"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Edit</span>
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-semibold flex items-center gap-1 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-md overflow-hidden">
          <div className="relative w-full max-w-2xl max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)] my-auto bg-[#0d1322] border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
            {/* Modal Fixed Header */}
            <div className="p-5 sm:p-6 border-b border-slate-800 flex items-center justify-between flex-none bg-[#0d1322]/95 backdrop-blur-sm">
              <h3 className="text-lg font-bold text-white">
                {editingItem ? 'Edit Catalog Product & Variants' : 'Add New Catalog Product'}
              </h3>
              <button onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Scrollable Body */}
            <div className="flex-1 min-h-0 overflow-y-auto p-5 sm:p-6 space-y-4">
              {errorMsg && (
                <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <form id="vendor-catalog-form" onSubmit={handleSubmit} className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Product / Service Category *</label>
                  <select
                    required
                    value={selectedCategoryId}
                    onChange={(e) => setSelectedCategoryId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">Select Target Category...</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Product / Service Title *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Cement Bricks, Ultratech Cement Bag, Tipper Truck Rental"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Base Unit Price (₹) *</label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={unitPrice}
                      onChange={(e) => setUnitPrice(parseFloat(e.target.value))}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Price Unit *</label>
                    <select
                      value={priceUnit}
                      onChange={(e) => setPriceUnit(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value="PER_PIECE">Per Piece / Item</option>
                      <option value="PER_BAG">Per Bag</option>
                      <option value="PER_TON">Per Ton</option>
                      <option value="PER_HOUR">Per Hour</option>
                      <option value="PER_DAY">Per Day</option>
                      <option value="PER_SQFT">Per Sq Ft</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Description</label>
                  <textarea
                    rows={2}
                    placeholder="Details about quality, dimensions, grade..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Stock Quantity</label>
                    <input
                      type="number"
                      value={stockQuantity}
                      onChange={(e) => setStockQuantity(parseInt(e.target.value))}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">SKU (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. BRK-RED-001"
                      value={sku}
                      onChange={(e) => setSku(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-white font-mono focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                {/* Dynamic Variants & Packages Toggle Section */}
                <div className="pt-2 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowAdvancedConfig(!showAdvancedConfig)}
                    className="flex items-center justify-between w-full py-2 text-slate-300 hover:text-white font-bold text-xs"
                  >
                    <span className="flex items-center gap-1.5 text-emerald-400">
                      <Layers className="w-4 h-4" />
                      <span>Configure Dynamic Packages, Variants & Add-ons ({variants.length} Variants, {addons.length} Add-ons)</span>
                    </span>
                    {showAdvancedConfig ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>

                  {showAdvancedConfig && (
                    <div className="space-y-5 pt-3 animate-in fade-in duration-200">
                      
                      {/* VARIANTS / PACKAGES SECTION */}
                      <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-bold text-white text-xs">Variants / Packages</h4>
                            <p className="text-[11px] text-slate-400">e.g. Material Only, Material + Loading, Material + Transportation</p>
                          </div>
                          <button
                            type="button"
                            onClick={handleAddVariant}
                            className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-[11px] flex items-center gap-1"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add Variant</span>
                          </button>
                        </div>

                        {variants.length === 0 ? (
                          <p className="text-[11px] text-slate-500 italic py-2">No variants added. Base product price will be used.</p>
                        ) : (
                          <div className="space-y-3">
                            {variants.map((v, idx) => (
                              <div key={v.id} className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[11px] font-bold text-blue-400">Variant #{idx + 1}</span>
                                  <div className="flex items-center gap-2">
                                    <label className="flex items-center gap-1 text-[11px] text-slate-400 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={v.is_active}
                                        onChange={(e) => handleUpdateVariant(v.id, 'is_active', e.target.checked)}
                                        className="rounded bg-slate-900 border-slate-700 text-emerald-500 focus:ring-0"
                                      />
                                      <span>{v.is_active ? 'Active' : 'Inactive'}</span>
                                    </label>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveVariant(v.id)}
                                      className="p-1 text-red-400 hover:text-red-300"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                  <input
                                    type="text"
                                    placeholder="Variant Title (e.g. Material + Loading)"
                                    value={v.title}
                                    onChange={(e) => handleUpdateVariant(v.id, 'title', e.target.value)}
                                    className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-white text-[11px]"
                                  />
                                  <input
                                    type="number"
                                    step="0.01"
                                    placeholder="Variant Price (₹)"
                                    value={v.price}
                                    onChange={(e) => handleUpdateVariant(v.id, 'price', parseFloat(e.target.value) || 0)}
                                    className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-white font-mono text-[11px]"
                                  />
                                  <input
                                    type="text"
                                    placeholder="Included Services (comma separated)"
                                    value={(v.included_services || []).join(', ')}
                                    onChange={(e) => handleUpdateVariant(v.id, 'included_services', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
                                    className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-white text-[11px]"
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* OPTIONAL ADD-ONS SECTION */}
                      <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-bold text-white text-xs">Optional Add-ons</h4>
                            <p className="text-[11px] text-slate-400">e.g. Unloading, Express Handling, Extra Protection</p>
                          </div>
                          <button
                            type="button"
                            onClick={handleAddAddon}
                            className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-[11px] flex items-center gap-1"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add Add-on</span>
                          </button>
                        </div>

                        {addons.length === 0 ? (
                          <p className="text-[11px] text-slate-500 italic py-2">No optional add-ons configured.</p>
                        ) : (
                          <div className="space-y-3">
                            {addons.map((a, idx) => (
                              <div key={a.id} className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[11px] font-bold text-purple-400">Add-on #{idx + 1}</span>
                                  <div className="flex items-center gap-2">
                                    <label className="flex items-center gap-1 text-[11px] text-slate-400 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={a.is_active}
                                        onChange={(e) => handleUpdateAddon(a.id, 'is_active', e.target.checked)}
                                        className="rounded bg-slate-900 border-slate-700 text-purple-500 focus:ring-0"
                                      />
                                      <span>{a.is_active ? 'Active' : 'Inactive'}</span>
                                    </label>
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveAddon(a.id)}
                                      className="p-1 text-red-400 hover:text-red-300"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  <input
                                    type="text"
                                    placeholder="Add-on Title (e.g. Unloading)"
                                    value={a.title}
                                    onChange={(e) => handleUpdateAddon(a.id, 'title', e.target.value)}
                                    className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-white text-[11px]"
                                  />
                                  <input
                                    type="number"
                                    step="0.01"
                                    placeholder="Add-on Price (₹)"
                                    value={a.price}
                                    onChange={(e) => handleUpdateAddon(a.id, 'price', parseFloat(e.target.value) || 0)}
                                    className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-white font-mono text-[11px]"
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                    </div>
                  )}
                </div>
              </form>
            </div>

            {/* Modal Fixed Action Footer */}
            <div className="p-4 sm:p-5 border-t border-slate-800/80 bg-[#0a0f1d] flex items-center justify-end gap-3 flex-none">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-5 py-2.5 rounded-xl border border-slate-700 hover:border-slate-600 text-slate-300 hover:text-white text-xs font-bold transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="vendor-catalog-form"
                disabled={saving}
                className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-600/30 disabled:opacity-50"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{editingItem ? 'Update Product' : 'Save Product'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
