'use client';

import React, { useState, useEffect } from 'react';
import { UserProfile, UserServiceAsset, VendorCatalogItem, Category, getVendorCatalog, getCategories } from '@/lib/api';
import { useCart } from '@/context/CartContext';
import {
  X,
  Store,
  Star,
  MapPin,
  CheckCircle,
  ShieldCheck,
  Package,
  ShoppingBag,
  Plus,
  Minus,
  ArrowRight,
  ArrowLeft,
  Loader2,
  Wrench,
  ShoppingCart,
  Check,
  Truck,
  UserCheck,
  Tag,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

export interface VendorSellingOption {
  id: string;
  title: string;
  price: number;
  unit: string; // PER_PIECE, PER_BAG, PER_TON, PER_KM, PER_TRIP, PER_HOUR, PER_DAY, FIXED, BUNDLE
  included_services?: string[]; // e.g. ["TRANSPORT", "DRIVER", "LOADING", "UNLOADING"]
  description?: string;
  additional_charges?: Record<string, number>;
  is_active?: boolean;
}

export interface VendorAddon {
  id: string;
  title: string;
  price: number;
  is_active?: boolean;
  description?: string;
}

export interface GroupedOption {
  id: string;
  parentEntityId: string;
  entityType: 'ITEM' | 'ASSET';
  title: string;
  price: number;
  unit: string;
  included_services: string[];
  description: string;
  rawItem?: VendorCatalogItem;
  rawAsset?: UserServiceAsset;
  availableAddons?: VendorAddon[];
}

export interface CategoryGroup {
  key: string;
  name: string;
  description: string;
  emoji: string;
  options: GroupedOption[];
}

interface VendorStorefrontModalProps {
  isOpen: boolean;
  onClose: () => void;
  vendorId: string | null;
  initialVendorUser?: UserProfile | null;
  onSelectCatalogItemForOrder?: (
    vendor: UserProfile,
    item: VendorCatalogItem,
    quantity: number,
    selectedOption?: VendorSellingOption
  ) => void;
  onSelectServiceForOrder?: (
    vendor: UserProfile,
    asset: UserServiceAsset,
    selectedOption?: VendorSellingOption
  ) => void;
}

export default function VendorStorefrontModal({
  isOpen,
  onClose,
  vendorId,
  initialVendorUser,
  onSelectCatalogItemForOrder,
  onSelectServiceForOrder,
}: VendorStorefrontModalProps) {
  const { addToCart } = useCart();
  const [loading, setLoading] = useState(false);
  const [vendor, setVendor] = useState<UserProfile | null>(initialVendorUser || null);
  const [assets, setAssets] = useState<UserServiceAsset[]>([]);
  const [items, setItems] = useState<VendorCatalogItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [selectedCategoryKey, setSelectedCategoryKey] = useState<string | null>(null);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [addedNotice, setAddedNotice] = useState<string | null>(null);

  // Selected Add-ons per Option ID map: { [optionId]: string[] (addon_ids) }
  const [selectedAddonsMap, setSelectedAddonsMap] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (isOpen && vendorId) {
      setLoading(true);
      setSelectedCategoryKey(null);
      setSelectedOptionId(null);
      setQuantity(1);
      setSelectedAddonsMap({});

      Promise.all([
        getVendorCatalog(vendorId),
        getCategories().catch(() => [] as Category[]),
      ])
        .then(([data, fetchedCategories]) => {
          if (fetchedCategories && fetchedCategories.length > 0) {
            setCategories(fetchedCategories);
          }
          if (data) {
            setVendor(data.vendor);

            const activeServices = (data.assets || []).filter(
              (a) => a.status === 'ACTIVE' && a.is_available
            );
            setAssets(activeServices);
            setItems(data.items || []);
          }
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen, vendorId]);

  useEffect(() => {
    if (!isOpen) return;

    const handlePopState = () => {
      if (selectedCategoryKey) {
        setSelectedCategoryKey(null);
        setSelectedOptionId(null);
      } else {
        onClose();
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isOpen, selectedCategoryKey, onClose]);

  if (!isOpen) return null;

  // Helper: derive or extract vendor selling options for catalog items
  function getSellingOptionsForItem(item: VendorCatalogItem): VendorSellingOption[] {
    const raw: any[] = item.attributes?.variants || item.attributes?.selling_options || item.attributes?.pricing_options || item.attributes?.packages || [];
    if (Array.isArray(raw) && raw.length > 0) {
      return raw
        .filter((opt) => opt.is_active !== false)
        .map((opt, idx) => ({
          id: opt.id || `opt_${item.id}_${idx}`,
          title: opt.title || opt.name || opt.label || item.title,
          price: typeof opt.price === 'number' ? opt.price : (typeof opt.unit_price === 'number' ? opt.unit_price : item.unit_price),
          unit: opt.unit || opt.price_unit || item.price_unit || 'PER_PIECE',
          included_services: opt.included_services || opt.inclusions || [],
          description: opt.description || '',
          additional_charges: opt.additional_charges || {},
          is_active: opt.is_active !== false,
        }));
    }

    // Default vendor options fallback if no multi-variant configured
    const defaultUnit = item.price_unit || 'PER_PIECE';
    const titleLower = (item.title || '').toLowerCase();

    if (titleLower.includes('brick') || titleLower.includes('block')) {
      return [
        {
          id: `opt_${item.id}_mat`,
          title: `Material Only`,
          price: item.unit_price > 0 ? item.unit_price : 4,
          unit: defaultUnit,
          included_services: [],
          description: 'Material supply only',
        },
        {
          id: `opt_${item.id}_mat_trans`,
          title: `Material + Transport`,
          price: (item.unit_price > 0 ? item.unit_price : 4) + 4,
          unit: defaultUnit,
          included_services: ['TRANSPORT'],
          description: 'Includes site delivery transport',
        },
        {
          id: `opt_${item.id}_mat_all`,
          title: `Material + Loading + Transport`,
          price: (item.unit_price > 0 ? item.unit_price : 4) + 6,
          unit: defaultUnit,
          included_services: ['TRANSPORT', 'LOADING'],
          description: 'Complete supply with transport & loading included',
        },
      ];
    } else if (titleLower.includes('cement')) {
      return [
        {
          id: `opt_${item.id}_bag`,
          title: `${item.title} (Material Only)`,
          price: item.unit_price > 0 ? item.unit_price : 350,
          unit: 'PER_BAG',
          included_services: [],
          description: 'Material only per bag',
        },
        {
          id: `opt_${item.id}_bag_trans`,
          title: `${item.title} + Transport`,
          price: (item.unit_price > 0 ? item.unit_price : 350) + 30,
          unit: 'PER_BAG',
          included_services: ['TRANSPORT'],
          description: 'Includes site transport delivery per bag',
        },
      ];
    }

    return [
      {
        id: `opt_${item.id}_default`,
        title: item.title,
        price: item.unit_price,
        unit: defaultUnit,
        included_services: [],
        description: item.description || '',
      },
    ];
  }

  // Helper: derive add-ons for catalog item
  function getAddonsForItem(item: VendorCatalogItem): VendorAddon[] {
    const raw: any[] = item.attributes?.addons || [];
    if (Array.isArray(raw) && raw.length > 0) {
      return raw
        .filter((a) => a.is_active !== false)
        .map((a, idx) => ({
          id: a.id || `addon_${item.id}_${idx}`,
          title: a.title || a.name || 'Addon',
          price: typeof a.price === 'number' ? a.price : (typeof a.unit_price === 'number' ? a.unit_price : 0),
          is_active: a.is_active !== false,
          description: a.description || '',
        }));
    }
    return [];
  }

  // Helper: derive or extract vendor selling options for service assets
  function getSellingOptionsForAsset(asset: UserServiceAsset): VendorSellingOption[] {
    const raw: any[] = (asset.attributes as any)?.selling_options || [];
    if (Array.isArray(raw) && raw.length > 0) {
      return raw
        .filter((opt) => opt.is_active !== false)
        .map((opt, idx) => ({
          id: opt.id || `opt_ast_${asset.id}_${idx}`,
          title: opt.title || opt.label || asset.title,
          price: typeof opt.price === 'number' ? opt.price : (asset.hourly_rate || asset.daily_rate || 500),
          unit: opt.unit || (asset.hourly_rate ? 'PER_HOUR' : asset.daily_rate ? 'PER_DAY' : 'PER_TRIP'),
          included_services: opt.included_services || [],
          description: opt.description || '',
        }));
    }

    const rate = asset.hourly_rate || asset.daily_rate || 1500;
    return [
      {
        id: `opt_${asset.id}_default`,
        title: asset.title,
        price: rate > 0 ? rate : 500,
        unit: asset.hourly_rate ? 'PER_HOUR' : asset.daily_rate ? 'PER_DAY' : 'FIXED',
        included_services: [],
        description: asset.description || '',
      },
    ];
  }

  const getCategoryGroups = (): CategoryGroup[] => {
    const groupsMap = new Map<string, CategoryGroup>();

    items.forEach((item) => {
      const resolvedCat = item.category || (item.category_id ? categories.find((c) => c.id === item.category_id) : undefined);
      const catName = resolvedCat?.name || item.category?.name || 'Bricks & Building Materials';
      const catSlug = resolvedCat?.slug || item.category?.slug || 'bricks-building-materials';
      const key = `cat_${catSlug}`;

      if (!groupsMap.has(key)) {
        let emoji = '📦';
        const s = (catSlug + ' ' + catName).toLowerCase();
        if (s.includes('brick') || s.includes('building')) emoji = '🧱';
        else if (s.includes('cement') || s.includes('construction')) emoji = '🏗️';
        else if (s.includes('agri') || s.includes('farm')) emoji = '🌾';
        else if (s.includes('driver') || s.includes('transport') || s.includes('vehicle')) emoji = '🚚';

        groupsMap.set(key, {
          key,
          name: catName,
          description: resolvedCat?.description || item.category?.description || `Building materials offered by this vendor.`,
          emoji,
          options: [],
        });
      }

      const group = groupsMap.get(key)!;
      const itemOpts = getSellingOptionsForItem(item);
      const itemAddons = getAddonsForItem(item);

      itemOpts.forEach((opt) => {
        group.options.push({
          id: opt.id,
          parentEntityId: item.id,
          entityType: 'ITEM',
          title: opt.title,
          price: opt.price,
          unit: opt.unit,
          included_services: opt.included_services || [],
          description: opt.description || item.description || '',
          rawItem: item,
          availableAddons: itemAddons,
        });
      });
    });

    assets.forEach((asset) => {
      if (asset.status !== 'ACTIVE' || !asset.is_available) return;

      const resolvedCat = asset.category || (asset.category_id ? categories.find((c) => c.id === asset.category_id) : undefined);
      const catName = resolvedCat?.name || asset.category?.name || asset.asset_type || 'Transportation & Logistics';
      const catSlug = resolvedCat?.slug || asset.category?.slug || (asset.asset_type ? asset.asset_type.toLowerCase() : 'transportation');
      const key = `cat_${catSlug}`;

      if (!groupsMap.has(key)) {
        let emoji = '🛠️';
        const s = (catSlug + ' ' + catName + ' ' + (asset.asset_type || '')).toLowerCase();
        if (s.includes('driver') || s.includes('transport') || s.includes('truck') || s.includes('vehicle')) emoji = '🚚';
        else if (s.includes('labour') || s.includes('labor')) emoji = '👷';
        else if (s.includes('plumb')) emoji = '🚰';

        groupsMap.set(key, {
          key,
          name: catName,
          description: resolvedCat?.description || asset.category?.description || `Transport and service offerings registered by this vendor.`,
          emoji,
          options: [],
        });
      }

      const group = groupsMap.get(key)!;
      const assetOpts = getSellingOptionsForAsset(asset);
      assetOpts.forEach((opt) => {
        group.options.push({
          id: opt.id,
          parentEntityId: asset.id,
          entityType: 'ASSET',
          title: opt.title,
          price: opt.price,
          unit: opt.unit,
          included_services: opt.included_services || [],
          description: opt.description || asset.description || '',
          rawAsset: asset,
          availableAddons: [],
        });
      });
    });

    return Array.from(groupsMap.values());
  };

  const categoryGroups = getCategoryGroups();
  const selectedGroup = categoryGroups.find((g) => g.key === selectedCategoryKey);

  const handleQtyChange = (delta: number) => {
    setQuantity((prev) => Math.max(1, prev + delta));
  };

  const handleManualQtyInput = (val: number) => {
    const qty = isNaN(val) ? 1 : Math.max(1, val);
    setQuantity(qty);
  };

  const toggleAddonForOption = (optId: string, addonId: string) => {
    setSelectedAddonsMap((prev) => {
      const current = prev[optId] || [];
      const exists = current.includes(addonId);
      const updated = exists ? current.filter((id) => id !== addonId) : [...current, addonId];
      return { ...prev, [optId]: updated };
    });
  };

  const getSelectedAddonsList = (opt: GroupedOption) => {
    const selectedIds = selectedAddonsMap[opt.id] || [];
    return (opt.availableAddons || [])
      .filter((a) => selectedIds.includes(a.id))
      .map((a) => ({ id: a.id, title: a.title, price: a.price }));
  };

  const handleAddToCart = (opt: GroupedOption) => {
    if (!vendor) return;

    const selectedAddons = getSelectedAddonsList(opt);
    const addonsUnitPrice = selectedAddons.reduce((sum, a) => sum + a.price, 0);
    const effectiveUnitPrice = opt.price + addonsUnitPrice;
    const subtotal = effectiveUnitPrice * quantity;

    addToCart({
      vendorId: vendor.id,
      vendorName: vendor.full_name,
      catalogItemId: opt.entityType === 'ITEM' ? opt.parentEntityId : undefined,
      vendorAssetId: opt.entityType === 'ASSET' ? opt.parentEntityId : undefined,
      optionId: opt.id,
      selectedOptionTitle: opt.title,
      includedServices: opt.included_services,
      selectedAddons: selectedAddons,
      selectedVariant: { id: opt.id, name: opt.title, price: opt.price },
      categoryId: opt.rawItem?.category_id || opt.rawAsset?.category_id || undefined,
      categoryName: selectedGroup?.name || 'Service',
      categorySlug: opt.rawItem?.category?.slug || opt.rawAsset?.category?.slug || 'service',
      title: opt.rawItem?.title ? `${opt.rawItem.title} (${opt.title})` : `${selectedGroup?.name || 'Service'} — ${opt.title}`,
      description: opt.description,
      quantity: quantity,
      quantityUnit: opt.unit ? opt.unit.replace('PER_', '').toLowerCase() : 'unit',
      unitPrice: effectiveUnitPrice,
      totalPrice: subtotal,
      additionalChargesConfig: (opt.rawItem?.attributes || opt.rawAsset?.attributes || {}) as any,
      dynamicFields: {
        ...(opt.rawItem?.attributes || opt.rawAsset?.attributes || {}),
        option_id: opt.id,
        variant_id: opt.id,
        option_title: opt.title,
        included_services: opt.included_services,
        addon_ids: selectedAddons.map((a) => a.id),
        selected_addons: selectedAddons,
      },
    });

    setAddedNotice(`Added ${quantity} ${opt.title} to cart!`);
    setTimeout(() => setAddedNotice(null), 2500);
    onClose();
  };

  const handleOrderDirect = (opt: GroupedOption) => {
    if (!vendor) return;

    const selectedAddons = getSelectedAddonsList(opt);
    const addonsUnitPrice = selectedAddons.reduce((sum, a) => sum + a.price, 0);
    const effectiveUnitPrice = opt.price + addonsUnitPrice;

    const vendorSellingOpt: VendorSellingOption = {
      id: opt.id,
      title: opt.title,
      price: effectiveUnitPrice,
      unit: opt.unit,
      included_services: opt.included_services,
      description: opt.description,
    };

    // Add to cart and open checkout directly
    handleAddToCart(opt);

    if (opt.entityType === 'ITEM' && opt.rawItem && onSelectCatalogItemForOrder) {
      onSelectCatalogItemForOrder(vendor, opt.rawItem, quantity, vendorSellingOpt);
    } else if (opt.entityType === 'ASSET' && opt.rawAsset && onSelectServiceForOrder) {
      onSelectServiceForOrder(vendor, opt.rawAsset, vendorSellingOpt);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-md overflow-hidden animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)] my-auto bg-[#0d1322] border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
        
        {/* Modal Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/60 shrink-0">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 overflow-hidden">
            <Store className="w-4 h-4 text-emerald-400 shrink-0" />
            <button
              type="button"
              onClick={onClose}
              className="hover:text-white transition-colors"
            >
              Browse Shops
            </button>
            <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
            <button
              type="button"
              onClick={() => {
                setSelectedCategoryKey(null);
                setSelectedOptionId(null);
              }}
              className={`hover:text-white transition-colors truncate max-w-[180px] sm:max-w-xs ${!selectedGroup ? 'text-white font-bold' : ''}`}
            >
              {vendor?.full_name || 'Vendor Storefront'}
            </button>
            {selectedGroup && (
              <>
                <ChevronRight className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                <span className="text-emerald-400 font-bold truncate max-w-[180px] sm:max-w-xs">{selectedGroup.name}</span>
              </>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800/80 transition-colors"
            title="Close Storefront"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {addedNotice && (
          <div className="px-6 py-2.5 bg-emerald-500/20 border-b border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-2 justify-center animate-in slide-in-from-top-2">
            <Check className="w-4 h-4 text-emerald-400" />
            <span>{addedNotice}</span>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
            <p className="text-sm text-slate-400">Loading Vendor Storefront...</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            
            {/* Vendor Header Summary Card */}
            {vendor && (
              <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-emerald-950/30 border border-slate-800/80 shadow-lg space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 overflow-hidden flex items-center justify-center shrink-0">
                      {vendor.avatar_url ? (
                        <img src={vendor.avatar_url} alt={vendor.full_name} className="w-full h-full object-cover" />
                      ) : (
                        <Store className="w-8 h-8 text-emerald-400" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-2xl font-extrabold text-white">{vendor.full_name}</h2>
                        {vendor.is_verified && (
                          <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold flex items-center gap-1">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            Verified Vendor
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span>{vendor.address_text || 'Choutuppal, Telangana'}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 bg-slate-950/60 px-4 py-2.5 rounded-xl border border-slate-800 self-start sm:self-auto">
                    <div className="text-center px-3 border-r border-slate-800">
                      <div className="flex items-center gap-1 text-amber-400 font-bold text-sm">
                        <Star className="w-4 h-4 fill-amber-400" />
                        <span>{vendor.trust_score ? vendor.trust_score.toFixed(1) : '5.0'}</span>
                      </div>
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                        Trust Rating
                      </span>
                    </div>
                    <div className="text-center px-3">
                      <div className="text-sm font-bold text-emerald-400">{categoryGroups.length}</div>
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                        Services Offered
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* VIEW 1: CATEGORY / MAIN SERVICE LIST */}
            {selectedCategoryKey === null ? (
              <div className="space-y-4">
                <div className="border-b border-slate-800 pb-3">
                  <h3 className="text-lg font-bold text-white uppercase tracking-wider">Services &amp; Products</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Select a service category offered by {vendor?.full_name || 'this vendor'} to choose packages, variants &amp; add-ons.
                  </p>
                </div>

                {categoryGroups.length === 0 ? (
                  <div className="text-center py-12 px-4 rounded-2xl bg-slate-900/40 border border-slate-800/60 space-y-2">
                    <ShoppingBag className="w-8 h-8 text-slate-600 mx-auto" />
                    <p className="text-xs font-medium text-slate-400">No active services registered for this vendor.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {categoryGroups.map((group) => (
                      <div
                        key={group.key}
                        className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between gap-4 hover:border-slate-700 transition-all group"
                      >
                        <div className="flex items-center gap-4">
                          <div className="text-3xl shrink-0">{group.emoji}</div>
                          <div>
                            <h4 className="text-lg font-extrabold text-white group-hover:text-blue-300 transition-colors">
                              {group.name}
                            </h4>
                            <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{group.description}</p>
                            <span className="inline-block mt-1 text-[10px] font-mono text-emerald-400 font-bold">
                              {group.options.length} Option{group.options.length > 1 ? 's' : ''} / Packages Available
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            setSelectedCategoryKey(group.key);
                            setSelectedOptionId(group.options.length > 0 ? group.options[0].id : null);
                            setQuantity(1);
                          }}
                          className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs shrink-0 flex items-center gap-2 shadow-md shadow-blue-600/30 transition-all"
                        >
                          <span>VIEW OPTIONS</span>
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              /* VIEW 2: EXPANDED DYNAMIC VARIANTS & ADD-ONS FOR SELECTED SERVICE */
              selectedGroup && (
                <div className="space-y-6 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                    <div>
                      <button
                        onClick={() => {
                          setSelectedCategoryKey(null);
                          setSelectedOptionId(null);
                        }}
                        className="inline-flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-white transition-colors mb-2"
                      >
                        <ArrowLeft className="w-4 h-4 text-blue-400" />
                        <span>Back to Services</span>
                      </button>
                      <h3 className="text-2xl font-extrabold text-white flex items-center gap-2">
                        <span>{selectedGroup.emoji}</span>
                        <span>{selectedGroup.name}</span>
                      </h3>
                      <p className="text-xs text-slate-400 mt-1">{selectedGroup.description}</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-slate-300 block">
                      Choose Service Option / Package:
                    </span>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {selectedGroup.options.map((opt) => {
                        const isSelected = selectedOptionId === opt.id;
                        const formattedUnit = opt.unit ? opt.unit.replace('PER_', '').toLowerCase() : 'unit';
                        
                        const selectedAddonsList = getSelectedAddonsList(opt);
                        const addonsSum = selectedAddonsList.reduce((sum, a) => sum + a.price, 0);
                        const effectiveUnitPrice = opt.price + addonsSum;
                        const subtotal = effectiveUnitPrice * quantity;

                        return (
                          <div
                            key={opt.id}
                            onClick={() => {
                              setSelectedOptionId(opt.id);
                            }}
                            className={`p-5 rounded-2xl border text-left cursor-pointer transition-all flex flex-col justify-between space-y-4 ${
                              isSelected
                                ? 'bg-gradient-to-br from-emerald-950/80 via-slate-900 to-slate-900 border-emerald-500 text-white shadow-xl ring-2 ring-emerald-500/50'
                                : 'bg-slate-900/70 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                            }`}
                          >
                            <div className="space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <h4 className="font-extrabold text-base text-white">{opt.title}</h4>
                                {isSelected && <Check className="w-5 h-5 text-emerald-400 shrink-0" />}
                              </div>

                              <div className="text-xl font-extrabold text-emerald-400 font-mono">
                                ₹{effectiveUnitPrice.toLocaleString()} <span className="text-xs text-slate-400 font-normal">/ {formattedUnit}</span>
                                {addonsSum > 0 && (
                                  <span className="text-[10px] text-purple-300 font-normal block">
                                    (Base ₹{opt.price} + ₹{addonsSum} Add-ons)
                                  </span>
                                )}
                              </div>

                              {opt.description && (
                                <p className="text-xs text-slate-400 leading-relaxed">{opt.description}</p>
                              )}

                              {/* Included Services Badges */}
                              {opt.included_services && opt.included_services.length > 0 ? (
                                <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-slate-800/60">
                                  {opt.included_services.map((inc) => (
                                    <span
                                      key={inc}
                                      className="px-2.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 border border-emerald-500/30"
                                    >
                                      {inc.toUpperCase().includes('TRANS') && <Truck className="w-3 h-3 text-emerald-400" />}
                                      {inc.toUpperCase().includes('DRIVER') && <UserCheck className="w-3 h-3 text-emerald-400" />}
                                      <span>{inc} INCLUDED</span>
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-[10px] text-slate-500 font-medium pt-2 border-t border-slate-800/60 block">
                                  Material only
                                </span>
                              )}

                              {/* Optional Add-ons Checkboxes */}
                              {isSelected && opt.availableAddons && opt.availableAddons.length > 0 && (
                                <div className="pt-3 border-t border-slate-800/80 space-y-2" onClick={(e) => e.stopPropagation()}>
                                  <span className="text-xs font-bold text-purple-300 block">Optional Add-ons:</span>
                                  <div className="space-y-1.5">
                                    {opt.availableAddons.map((addon) => {
                                      const isAddonChecked = (selectedAddonsMap[opt.id] || []).includes(addon.id);
                                      return (
                                        <label
                                          key={addon.id}
                                          className="flex items-center justify-between p-2 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 cursor-pointer text-xs transition-all"
                                        >
                                          <div className="flex items-center gap-2">
                                            <input
                                              type="checkbox"
                                              checked={isAddonChecked}
                                              onChange={() => toggleAddonForOption(opt.id, addon.id)}
                                              className="rounded bg-slate-900 border-slate-700 text-purple-500 focus:ring-0"
                                            />
                                            <span className="text-slate-200 font-medium">{addon.title}</span>
                                          </div>
                                          <span className="font-mono text-purple-400 font-bold">+₹{addon.price}</span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Option Selection & Quantity / Add to Cart Controls */}
                            {isSelected ? (
                              <div className="pt-3 border-t border-slate-800/80 space-y-4">
                                <div className="flex items-center justify-between gap-3 bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                                  <span className="text-xs text-slate-400 font-semibold">Quantity / Units:</span>
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleQtyChange(-1);
                                      }}
                                      className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center font-bold"
                                    >
                                      <Minus className="w-3.5 h-3.5" />
                                    </button>
                                    <input
                                      type="number"
                                      value={quantity}
                                      onClick={(e) => e.stopPropagation()}
                                      onChange={(e) => handleManualQtyInput(parseInt(e.target.value))}
                                      className="w-14 text-center bg-transparent text-xs font-mono font-bold text-white focus:outline-none"
                                    />
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleQtyChange(1);
                                      }}
                                      className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center font-bold"
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>

                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-slate-400 font-semibold">Total Subtotal:</span>
                                  <span className="text-sm font-extrabold text-emerald-400 font-mono">
                                    ₹{subtotal.toLocaleString()}
                                  </span>
                                </div>

                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleAddToCart(opt);
                                    }}
                                    className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs border border-slate-700 flex items-center justify-center gap-1.5 transition-all"
                                  >
                                    <ShoppingCart className="w-3.5 h-3.5 text-emerald-400" />
                                    <span>Add to Cart</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOrderDirect(opt);
                                    }}
                                    className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-1.5 transition-all"
                                  >
                                    <span>Order Direct</span>
                                    <ArrowRight className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedOptionId(opt.id);
                                }}
                                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-all flex items-center justify-center gap-1"
                              >
                                <span>SELECT OPTION</span>
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}
