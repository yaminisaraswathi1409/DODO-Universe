'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
  AlertCircle,
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
  onSwitchToRequestWhatYouNeed?: (
    categorySlug?: string,
    initialQuantity?: number,
    itemTitle?: string
  ) => void;
}

export default function VendorStorefrontModal({
  isOpen,
  onClose,
  vendorId,
  initialVendorUser,
  onSelectCatalogItemForOrder,
  onSelectServiceForOrder,
  onSwitchToRequestWhatYouNeed,
}: VendorStorefrontModalProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { addToCart } = useCart();
  const [loading, setLoading] = useState(false);
  const [vendor, setVendor] = useState<UserProfile | null>(initialVendorUser || null);
  const [assets, setAssets] = useState<UserServiceAsset[]>([]);
  const [items, setItems] = useState<VendorCatalogItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const catParam = searchParams ? searchParams.get('cat') : null;
  const optParam = searchParams ? searchParams.get('opt') : null;

  const [selectedCategoryKey, setSelectedCategoryKey] = useState<string | null>(catParam || null);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(optParam || null);
  const [quantity, setQuantity] = useState<number>(1);
  const [addedNotice, setAddedNotice] = useState<string | null>(null);

  // MOQ Warning state when quantity < offering MOQ
  const [moqWarning, setMoqWarning] = useState<{
    itemTitle: string;
    moq: number;
    requestedQty: number;
    categorySlug?: string;
  } | null>(null);

  // Selected Add-ons per Option ID map: { [optionId]: string[] (addon_ids) }
  const [selectedAddonsMap, setSelectedAddonsMap] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (isOpen && vendorId) {
      setLoading(true);
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
              (a) => (a.status === 'ACTIVE' || a.status === 'APPROVED') && a.is_available
            );
            setAssets(activeServices);
            setItems(data.items || []);
          }
        })
        .finally(() => setLoading(false));
    }
  }, [isOpen, vendorId]);

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

  // Sync state with URL search parameters (enables Browser Back & Forward for Category & Option selection)
  useEffect(() => {
    if (!isOpen) return;
    setSelectedCategoryKey(catParam || null);
    setSelectedOptionId(optParam || null);
  }, [isOpen, catParam, optParam]);

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
      if ((asset.status !== 'ACTIVE' && asset.status !== 'APPROVED') || !asset.is_available) return;

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
  const selectedGroup = categoryGroups.find(
    (g) =>
      g.key === selectedCategoryKey ||
      g.key === `cat_${selectedCategoryKey}` ||
      g.key.replace('cat_', '') === selectedCategoryKey
  );

  const handleSelectCategoryGroup = (groupKey: string, firstOptId: string | null) => {
    setSelectedCategoryKey(groupKey);
    setSelectedOptionId(firstOptId);
    setQuantity(1);

    const params = new URLSearchParams(searchParams ? searchParams.toString() : '');
    params.set('cat', groupKey);
    if (firstOptId) {
      params.set('opt', firstOptId);
    } else {
      params.delete('opt');
    }
    router.push(`/opportunities?${params.toString()}`);
  };

  const handleSelectOptionCard = (optId: string) => {
    setSelectedOptionId(optId);

    const params = new URLSearchParams(searchParams ? searchParams.toString() : '');
    params.set('opt', optId);
    router.push(`/opportunities?${params.toString()}`);
  };

  const handleCloseModal = () => {
    if (searchParams && (searchParams.has('vendor_id') || searchParams.has('cat') || searchParams.has('opt'))) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete('vendor_id');
      params.delete('cat');
      params.delete('opt');
      const q = params.toString();
      router.replace(q ? `/opportunities?${q}` : '/opportunities');
    }
    onClose();
  };

  const handleBackToVendorServices = () => {
    const params = new URLSearchParams(searchParams ? searchParams.toString() : '');
    if (params.has('opt') || params.has('cat')) {
      router.back();
    } else {
      handleCloseModal();
    }
  };

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

    // Rule: Enforce vendor offering MOQ
    const itemMoq = opt.entityType === 'ITEM' && opt.rawItem ? (opt.rawItem.min_order_quantity || 1) : 1;
    if (quantity < itemMoq) {
      setMoqWarning({
        itemTitle: opt.rawItem?.title || opt.title,
        moq: itemMoq,
        requestedQty: quantity,
        categorySlug: opt.rawItem?.category?.slug || selectedGroup?.key?.replace('cat_', ''),
      });
      return;
    }
    setMoqWarning(null);

    const selectedAddons = getSelectedAddonsList(opt);
    const addonsUnitPrice = selectedAddons.reduce((sum, a) => sum + a.price, 0);
    const effectiveUnitPrice = opt.price + addonsUnitPrice;
    const subtotal = effectiveUnitPrice * quantity;

    const itemImage = opt.rawItem?.images
      ? (typeof opt.rawItem.images === 'string'
          ? opt.rawItem.images
          : Array.isArray(opt.rawItem.images)
          ? (opt.rawItem.images as any[])[0]
          : undefined)
      : vendor.avatar_url;

    addToCart({
      vendorId: vendor.id,
      vendorName: vendor.full_name,
      vendorBrandName: vendor.full_name,
      vendorAvatar: vendor.avatar_url,
      vendorPhone: vendor.phone,
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
      imageUrl: itemImage,
      title: opt.rawItem?.title ? `${opt.rawItem.title} (${opt.title})` : `${selectedGroup?.name || 'Service'} — ${opt.title}`,
      description: opt.description || opt.rawItem?.description || opt.rawAsset?.description,
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
  };

  const handleOrderDirect = (opt: GroupedOption) => {
    if (!vendor) return;

    // Rule: Enforce vendor offering MOQ
    const itemMoq = opt.entityType === 'ITEM' && opt.rawItem ? (opt.rawItem.min_order_quantity || 1) : 1;
    if (quantity < itemMoq) {
      setMoqWarning({
        itemTitle: opt.rawItem?.title || opt.title,
        moq: itemMoq,
        requestedQty: quantity,
        categorySlug: opt.rawItem?.category?.slug || selectedGroup?.key?.replace('cat_', ''),
      });
      return;
    }
    setMoqWarning(null);

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

    // Open checkout directly for this item (do not open Cart Drawer)
    if (opt.entityType === 'ITEM' && opt.rawItem && onSelectCatalogItemForOrder) {
      onSelectCatalogItemForOrder(vendor, opt.rawItem, quantity, vendorSellingOpt);
    } else if (opt.entityType === 'ASSET' && opt.rawAsset && onSelectServiceForOrder) {
      onSelectServiceForOrder(vendor, opt.rawAsset, vendorSellingOpt);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm overflow-hidden animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)] my-auto bg-white border border-slate-200 rounded-3xl shadow-2xl overflow-hidden flex flex-col text-slate-900">
        
        {/* Modal Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50 shrink-0">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 overflow-hidden">
            <Store className="w-4 h-4 text-black shrink-0" />
            <button
              type="button"
              onClick={onClose}
              className="hover:text-black transition-colors"
            >
              Browse Shops
            </button>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <button
              type="button"
              onClick={handleBackToVendorServices}
              className={`hover:text-black transition-colors truncate max-w-[180px] sm:max-w-xs ${!selectedGroup ? 'text-slate-900 font-bold' : ''}`}
            >
              {vendor?.full_name || 'Vendor Storefront'}
            </button>
            {selectedGroup && (
              <>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span className="text-black font-bold truncate max-w-[180px] sm:max-w-xs">{selectedGroup.name}</span>
              </>
            )}
          </div>
          <button
            onClick={handleCloseModal}
            className="p-2 text-slate-500 hover:text-black rounded-xl hover:bg-slate-200 transition-colors"
            title="Close Storefront"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {addedNotice && (
          <div className="px-6 py-2.5 bg-slate-100 border-b border-slate-300 text-slate-900 text-xs font-bold flex items-center gap-2 justify-center animate-in slide-in-from-top-2">
            <Check className="w-4 h-4 text-black" />
            <span>{addedNotice}</span>
          </div>
        )}

        {moqWarning && (
          <div className="mx-6 my-3 p-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950 space-y-3 shadow-sm animate-in fade-in duration-150 shrink-0">
            <div className="flex items-center gap-2 font-black text-xs uppercase tracking-wider text-amber-900">
              <AlertCircle className="w-4.5 h-4.5 text-amber-600 shrink-0" />
              <span>Quantity Below Vendor Minimum Order Quantity (MOQ)</span>
            </div>
            <p className="text-xs text-amber-900 leading-relaxed">
              Vendor <strong>{vendor?.full_name}</strong> requires a minimum order quantity of <strong>{moqWarning.moq.toLocaleString()} pieces</strong> for <strong>{moqWarning.itemTitle}</strong>. You requested <strong>{moqWarning.requestedQty.toLocaleString()} pieces</strong>.
            </p>
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  const catSlug = moqWarning.categorySlug || 'bricks-building-materials';
                  const reqQty = moqWarning.requestedQty;
                  const itemTitle = moqWarning.itemTitle;
                  setMoqWarning(null);
                  onClose();
                  if (onSwitchToRequestWhatYouNeed) {
                    onSwitchToRequestWhatYouNeed(catSlug, reqQty, itemTitle);
                  }
                }}
                className="px-4 py-2.5 rounded-xl bg-black hover:bg-slate-800 text-white text-xs font-black transition-all shadow-sm flex items-center gap-1.5"
              >
                <Sparkles className="w-4 h-4" />
                <span>Switch to &quot;Request What You Need&quot;</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setQuantity(moqWarning.moq);
                  setMoqWarning(null);
                }}
                className="px-3.5 py-2.5 rounded-xl bg-white border border-amber-400 hover:bg-amber-100 text-amber-950 text-xs font-bold transition-all"
              >
                Set Quantity to MOQ ({moqWarning.moq.toLocaleString()})
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <Loader2 className="w-8 h-8 text-black animate-spin" />
            <p className="text-sm text-slate-600">Loading Vendor Storefront...</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            
            {/* Vendor Header Summary Card */}
            {vendor && (
              <div className="p-6 rounded-2xl bg-white border border-slate-200 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-slate-100 border border-slate-300 overflow-hidden flex items-center justify-center shrink-0">
                      {vendor.avatar_url ? (
                        <img src={vendor.avatar_url} alt={vendor.full_name} className="w-full h-full object-cover" />
                      ) : (
                        <Store className="w-8 h-8 text-black" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-2xl font-black text-slate-900">{vendor.full_name}</h2>
                        {vendor.is_verified && (
                          <span className="px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-300 text-slate-900 text-xs font-bold flex items-center gap-1">
                            <ShieldCheck className="w-3.5 h-3.5 text-black" />
                            Verified Vendor
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 mt-1 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-black shrink-0" />
                        <span>{vendor.address_text || 'Choutuppal, Telangana'}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 bg-slate-50 px-4 py-2.5 rounded-xl border border-slate-200 self-start sm:self-auto">
                    <div className="text-center px-3 border-r border-slate-200">
                      <div className="flex items-center gap-1 text-slate-900 font-bold text-sm">
                        <Star className="w-4 h-4 fill-current text-black" />
                        <span>{vendor.trust_score ? vendor.trust_score.toFixed(1) : '5.0'}</span>
                      </div>
                      <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                        Trust Rating
                      </span>
                    </div>
                    <div className="text-center px-3">
                      <div className="text-sm font-bold text-black">{categoryGroups.length}</div>
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
                <div className="border-b border-slate-200 pb-3">
                  <h3 className="text-lg font-black text-slate-900 uppercase tracking-wider">Services &amp; Products</h3>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Select a service category offered by {vendor?.full_name || 'this vendor'} to choose packages, variants &amp; add-ons.
                  </p>
                </div>

                {categoryGroups.length === 0 ? (
                  <div className="text-center py-12 px-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                    <ShoppingBag className="w-8 h-8 text-slate-400 mx-auto" />
                    <p className="text-xs font-medium text-slate-600">No active services registered for this vendor.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {categoryGroups.map((group) => (
                      <div
                        key={group.key}
                        className="p-5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-4 hover:border-slate-300 hover:bg-slate-100 transition-all group"
                      >
                        <div className="flex items-center gap-4">
                          <div className="text-3xl shrink-0">{group.emoji}</div>
                          <div>
                            <h4 className="text-lg font-bold text-slate-900 group-hover:text-black transition-colors">
                              {group.name}
                            </h4>
                            <p className="text-xs text-slate-600 mt-0.5 line-clamp-1">{group.description}</p>
                            <span className="inline-block mt-1 text-[10px] font-mono text-black font-bold">
                              {group.options.length} Option{group.options.length > 1 ? 's' : ''} / Packages Available
                            </span>
                          </div>
                        </div>

                        <button
                          onClick={() => {
                            const firstOpt = group.options.length > 0 ? group.options[0].id : null;
                            handleSelectCategoryGroup(group.key, firstOpt);
                          }}
                          className="px-5 py-2.5 rounded-xl bg-black hover:bg-slate-800 text-white font-black text-xs shrink-0 flex items-center gap-2 shadow-sm transition-all"
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
                  <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                    <div>
                      <button
                        onClick={handleBackToVendorServices}
                        className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-black transition-colors mb-2"
                      >
                        <ArrowLeft className="w-4 h-4 text-black" />
                        <span>Back to Services</span>
                      </button>
                      <h3 className="text-2xl font-black text-slate-900 flex items-center gap-2">
                        <span>{selectedGroup.emoji}</span>
                        <span>{selectedGroup.name}</span>
                      </h3>
                      <p className="text-xs text-slate-600 mt-1">{selectedGroup.description}</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <span className="text-xs font-black uppercase tracking-wider text-slate-900 block">
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
                              handleSelectOptionCard(opt.id);
                            }}
                            className={`p-5 rounded-2xl border text-left cursor-pointer transition-all flex flex-col justify-between space-y-4 ${
                              isSelected
                                ? 'bg-black text-white border-black shadow-md'
                                : 'bg-slate-50 border-slate-200 text-slate-900 hover:border-slate-300 hover:bg-slate-100'
                            }`}
                          >
                            <div className="space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <h4 className={`font-bold text-base ${isSelected ? 'text-white' : 'text-slate-900'}`}>{opt.title}</h4>
                                {isSelected && <Check className="w-5 h-5 text-white shrink-0" />}
                              </div>

                              <div className={`text-xl font-black font-mono ${isSelected ? 'text-white' : 'text-slate-900'}`}>
                                ₹{effectiveUnitPrice.toLocaleString()} <span className={`text-xs font-normal ${isSelected ? 'text-slate-300' : 'text-slate-500'}`}>/ {formattedUnit}</span>
                                {addonsSum > 0 && (
                                  <span className={`text-[10px] font-normal block ${isSelected ? 'text-slate-300' : 'text-slate-600'}`}>
                                    (Base ₹{opt.price} + ₹{addonsSum} Add-ons)
                                  </span>
                                )}
                              </div>

                              {opt.description && (
                                <p className={`text-xs leading-relaxed ${isSelected ? 'text-slate-300' : 'text-slate-600'}`}>{opt.description}</p>
                              )}

                              {/* Included Services Badges */}
                              {opt.included_services && opt.included_services.length > 0 ? (
                                <div className={`flex items-center gap-1.5 flex-wrap pt-2 border-t ${isSelected ? 'border-slate-800' : 'border-slate-200'}`}>
                                  {opt.included_services.map((inc) => (
                                    <span
                                      key={inc}
                                      className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 border ${
                                        isSelected ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-200 border-slate-300 text-slate-900'
                                      }`}
                                    >
                                      {inc.toUpperCase().includes('TRANS') && <Truck className="w-3 h-3 text-current" />}
                                      {inc.toUpperCase().includes('DRIVER') && <UserCheck className="w-3 h-3 text-current" />}
                                      <span>{inc} INCLUDED</span>
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className={`text-[10px] font-medium pt-2 border-t block ${isSelected ? 'border-slate-800 text-slate-400' : 'border-slate-200 text-slate-500'}`}>
                                  Material only
                                </span>
                              )}

                              {/* Optional Add-ons Checkboxes */}
                              {isSelected && opt.availableAddons && opt.availableAddons.length > 0 && (
                                <div className="pt-3 border-t border-slate-800 space-y-2" onClick={(e) => e.stopPropagation()}>
                                  <span className="text-xs font-bold text-slate-300 block">Optional Add-ons:</span>
                                  <div className="space-y-1.5">
                                    {opt.availableAddons.map((addon) => {
                                      const isAddonChecked = (selectedAddonsMap[opt.id] || []).includes(addon.id);
                                      return (
                                        <label
                                          key={addon.id}
                                          className="flex items-center justify-between p-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 cursor-pointer text-xs transition-all"
                                        >
                                          <div className="flex items-center gap-2">
                                            <input
                                              type="checkbox"
                                              checked={isAddonChecked}
                                              onChange={() => toggleAddonForOption(opt.id, addon.id)}
                                              className="rounded bg-slate-800 border-slate-700 text-white focus:ring-0"
                                            />
                                            <span className="text-slate-200 font-medium">{addon.title}</span>
                                          </div>
                                          <span className="font-mono text-white font-bold">+₹{addon.price}</span>
                                        </label>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Option Selection & Quantity / Add to Cart Controls */}
                            {isSelected ? (
                              <div className="pt-3 border-t border-slate-800 space-y-4">
                                <div className="flex items-center justify-between gap-3 bg-slate-900 p-2.5 rounded-xl border border-slate-800">
                                  <span className="text-xs text-slate-300 font-semibold">Quantity / Units:</span>
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
                                  <span className="text-slate-300 font-semibold">Total Subtotal:</span>
                                  <span className="text-sm font-black text-white font-mono">
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
                                    <ShoppingCart className="w-3.5 h-3.5 text-white" />
                                    <span>Add to Cart</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOrderDirect(opt);
                                    }}
                                    className="flex-1 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-black font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm"
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
                                className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-900 font-bold text-xs transition-all flex items-center justify-center gap-1"
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
