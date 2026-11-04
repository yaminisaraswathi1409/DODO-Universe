'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useParams } from 'next/navigation';
import {
  VendorCatalogItem,
  CatalogBreadcrumb,
  UserProfile,
  Category,
  getMarketplaceOffering,
} from '@/lib/api';
import { useCart } from '@/context/CartContext';
import CartDrawerModal from '@/components/CartDrawerModal';
import CreateOrderWizardModal from '@/components/CreateOrderWizardModal';
import {
  ArrowLeft,
  Store,
  Star,
  CheckCircle,
  ShieldCheck,
  Package,
  Layers,
  MapPin,
  Truck,
  Plus,
  Minus,
  ShoppingCart,
  Check,
  Scale,
  Sparkles,
  Info,
  Clock,
  AlertTriangle,
} from 'lucide-react';

export default function OfferingDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;

  const { addToCart, isCartOpen, setIsCartOpen } = useCart();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [item, setItem] = useState<VendorCatalogItem | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<CatalogBreadcrumb[]>([]);
  const [vendor, setVendor] = useState<UserProfile | null>(null);
  const [category, setCategory] = useState<Category | null>(null);

  // Gallery state
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  // Purchasing & Optional Services state
  const [quantity, setQuantity] = useState(1);
  const [selectedOptionalServices, setSelectedOptionalServices] = useState<string[]>([]);
  const [justAdded, setJustAdded] = useState(false);
  const [orderWizardOpen, setOrderWizardOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);

    getMarketplaceOffering(id)
      .then((data) => {
        setItem(data.item);
        setBreadcrumbs(data.breadcrumbs || []);
        setVendor(data.vendor || data.item.vendor_user || null);
        setCategory(data.category || data.item.category || null);

        // Set initial quantity to MOQ if applicable
        if (data.item.min_order_quantity && data.item.min_order_quantity > 1) {
          setQuantity(data.item.min_order_quantity);
        }

        // Save to recently viewed offerings
        if (typeof window !== 'undefined') {
          try {
            const raw = localStorage.getItem('uop_recently_viewed_offerings');
            let list: VendorCatalogItem[] = raw ? JSON.parse(raw) : [];
            list = [data.item, ...list.filter((it) => it.id !== data.item.id)].slice(0, 10);
            localStorage.setItem('uop_recently_viewed_offerings', JSON.stringify(list));
          } catch {}
        }
      })
      .catch((err) => {
        setError(err.message || 'Failed to load offering details');
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-slate-200 border-t-black rounded-full animate-spin mx-auto" />
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
            Loading offering specifications...
          </p>
        </div>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl p-8 max-w-md w-full border border-slate-200 text-center space-y-4 shadow-sm">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto" />
          <h2 className="text-xl font-black text-slate-900">Offering Not Found</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            {error || 'This offering is not approved, has been unpublished, or is currently unavailable.'}
          </p>
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-black text-white font-bold text-xs"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Marketplace</span>
          </Link>
        </div>
      </div>
    );
  }

  // Parse images array
  let images: string[] = [];
  if (item.images) {
    if (typeof item.images === 'string') {
      try {
        const parsed = JSON.parse(item.images);
        if (Array.isArray(parsed)) images = parsed;
      } catch {
        images = [item.images];
      }
    } else if (Array.isArray(item.images)) {
      images = item.images as any[];
    }
  }

  // Parse dynamic specs/attributes
  let specs: Record<string, any> = {};
  if (item.attributes) {
    if (typeof item.attributes === 'string') {
      try {
        specs = JSON.parse(item.attributes);
      } catch {}
    } else if (typeof item.attributes === 'object') {
      specs = item.attributes;
    }
  }

  // Parse included services
  let includedServices: any[] = [];
  if (item.included_services) {
    if (typeof item.included_services === 'string') {
      try {
        includedServices = JSON.parse(item.included_services);
      } catch {}
    } else if (Array.isArray(item.included_services)) {
      includedServices = item.included_services;
    }
  }

  // Parse optional services
  let optionalServices: any[] = [];
  if (item.optional_services) {
    if (typeof item.optional_services === 'string') {
      try {
        optionalServices = JSON.parse(item.optional_services);
      } catch {}
    } else if (Array.isArray(item.optional_services)) {
      optionalServices = item.optional_services;
    }
  }

  const isQuotation = item.price_type === 'QUOTATION';
  const moq = item.min_order_quantity && item.min_order_quantity > 0 ? item.min_order_quantity : 1;

  // Calculate optional add-on total
  const optionalServicesTotal = optionalServices
    .filter((opt) => selectedOptionalServices.includes(opt.id || opt.name))
    .reduce((sum, opt) => sum + (Number(opt.price) || 0), 0);

  const effectiveUnitPrice = item.unit_price + optionalServicesTotal;
  const totalPrice = effectiveUnitPrice * quantity;

  const handleToggleOptionalService = (optId: string) => {
    setSelectedOptionalServices((prev) =>
      prev.includes(optId) ? prev.filter((id) => id !== optId) : [...prev, optId]
    );
  };

  const handleAddToCart = () => {
    if (isQuotation) return;
    if (quantity < moq) {
      alert(`Minimum order quantity is ${moq.toLocaleString()} ${item.price_unit || 'units'}.`);
      return;
    }

    addToCart({
      vendorId: item.vendor_user_id,
      vendorName: vendor?.full_name || 'Verified Vendor',
      vendorBrandName: vendor?.full_name || 'Verified Vendor',
      vendorAvatar: vendor?.avatar_url,
      vendorPhone: vendor?.phone,
      catalogItemId: item.id,
      categoryId: item.category_id,
      categoryName: category?.name,
      categorySlug: category?.slug,
      title: item.title,
      description: item.description,
      quantity,
      quantityUnit: item.price_unit || 'Piece',
      unitPrice: effectiveUnitPrice,
      totalPrice,
      imageUrl: images[0] || undefined,
      includedServices: includedServices.map((s) => (typeof s === 'string' ? s : s.name)),
      selectedAddons: optionalServices
        .filter((opt) => selectedOptionalServices.includes(opt.id || opt.name))
        .map((opt) => ({ id: opt.id || opt.name, title: opt.name || opt.title, price: Number(opt.price) || 0 })),
    });

    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 2000);
  };

  const handleBuyNow = () => {
    if (isQuotation) {
      router.push(`/opportunities?category=${category?.slug || ''}&type=NEED`);
      return;
    }
    handleAddToCart();
    setIsCartOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-24">
      {/* Top Header Navigation */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 px-4 sm:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-black transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Marketplace</span>
          </Link>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsCartOpen(true)}
              className="relative p-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 transition-colors flex items-center gap-2 text-xs font-bold"
            >
              <ShoppingCart className="w-4 h-4" />
              <span className="hidden sm:inline">My Cart</span>
            </button>
          </div>
        </div>
      </header>

      {/* Breadcrumb Trail */}
      <nav className="max-w-7xl mx-auto px-4 sm:px-8 pt-6 pb-2">
        <div className="flex items-center gap-2 text-xs font-medium text-slate-500 overflow-x-auto whitespace-nowrap">
          <Link href="/marketplace" className="hover:text-black">Marketplace</Link>
          {category && (
            <>
              <span className="text-slate-300">/</span>
              <Link href={`/marketplace?category=${category.slug}`} className="hover:text-black">
                {category.name}
              </Link>
            </>
          )}
          {vendor && (
            <>
              <span className="text-slate-300">/</span>
              <span className="font-semibold text-slate-700">{vendor.full_name}</span>
            </>
          )}
          {breadcrumbs.map((bc) => (
            <React.Fragment key={bc.id}>
              <span className="text-slate-300">/</span>
              <span className={bc.id === item.id ? 'font-bold text-slate-900' : 'hover:text-black'}>
                {bc.title}
              </span>
            </React.Fragment>
          ))}
        </div>
      </nav>

      {/* Main Offering Layout */}
      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
          {/* Left Column: Gallery & Details (7 cols) */}
          <div className="lg:col-span-7 space-y-8">
            {/* Gallery */}
            <div className="space-y-4">
              <div className="aspect-[4/3] w-full rounded-3xl bg-white border border-slate-200 overflow-hidden shadow-sm flex items-center justify-center">
                {images.length > 0 ? (
                  <img
                    src={images[selectedImageIndex]}
                    alt={item.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="text-slate-300 flex flex-col items-center gap-2">
                    <Package className="w-16 h-16 stroke-[1.25]" />
                    <span className="text-xs font-medium text-slate-400">No Image Available</span>
                  </div>
                )}
              </div>

              {/* Thumbnails */}
              {images.length > 1 && (
                <div className="flex items-center gap-3 overflow-x-auto pb-2">
                  {images.map((img, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedImageIndex(idx)}
                      className={`w-20 h-20 rounded-2xl border-2 overflow-hidden flex-shrink-0 transition-all ${
                        selectedImageIndex === idx
                          ? 'border-black shadow-md scale-105'
                          : 'border-slate-200 opacity-60 hover:opacity-100'
                      }`}
                    >
                      <img src={img} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Title & Description */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 space-y-4 shadow-sm">
              <div className="flex items-center gap-2 flex-wrap">
                {category && (
                  <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-bold uppercase tracking-wider">
                    {category.name}
                  </span>
                )}
                {item.sku && (
                  <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-500 font-mono text-xs font-bold">
                    SKU: {item.sku}
                  </span>
                )}
                <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Approved Bookable Offering</span>
                </span>
              </div>

              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                {item.title}
              </h1>

              {item.description && (
                <p className="text-sm text-slate-600 leading-relaxed pt-2 border-t border-slate-100">
                  {item.description}
                </p>
              )}
            </div>

            {/* Dynamic Specifications Matrix */}
            {Object.keys(specs).length > 0 && (
              <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 space-y-5 shadow-sm">
                <h2 className="text-base font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <Layers className="w-4 h-4 text-slate-500" />
                  <span>Product Specifications</span>
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {Object.entries(specs).map(([key, val]) => (
                    <div
                      key={key}
                      className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 flex flex-col justify-between"
                    >
                      <span className="font-bold text-slate-400 uppercase tracking-wider text-[10px]">
                        {key.replace(/_/g, ' ')}
                      </span>
                      <span className="font-bold text-slate-900 text-sm mt-0.5">
                        {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Included & Optional Services */}
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 space-y-6 shadow-sm">
              {includedServices.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-600" />
                    <span>Included With This Offering</span>
                  </h3>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {includedServices.map((inc, i) => (
                      <div
                        key={i}
                        className="p-3 rounded-2xl bg-emerald-50/70 border border-emerald-200/60 text-emerald-900 text-xs font-semibold flex items-center gap-2"
                      >
                        <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                        <span>{typeof inc === 'string' ? inc : inc.name || inc.title}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {optionalServices.length > 0 && (
                <div className="space-y-3 pt-4 border-t border-slate-100">
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <Plus className="w-4 h-4 text-slate-600" />
                    <span>Optional Additional Services</span>
                  </h3>
                  <div className="space-y-2">
                    {optionalServices.map((opt, i) => {
                      const optId = opt.id || opt.name || `opt_${i}`;
                      const isChecked = selectedOptionalServices.includes(optId);
                      return (
                        <label
                          key={optId}
                          className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all cursor-pointer ${
                            isChecked
                              ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                              : 'bg-slate-50 border-slate-200 text-slate-800 hover:border-slate-400'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleOptionalService(optId)}
                              className="w-4 h-4 rounded text-black focus:ring-black accent-black"
                            />
                            <div>
                              <span className="font-bold text-xs block">{opt.name || opt.title}</span>
                              {opt.description && (
                                <span className={`text-[11px] block ${isChecked ? 'text-slate-300' : 'text-slate-500'}`}>
                                  {opt.description}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="font-black text-xs font-mono">
                            +₹{Number(opt.price || 0).toLocaleString()}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Fulfilment & Pickup Location */}
            {item.pickup_address && (
              <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 space-y-3 shadow-sm">
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-slate-600" />
                  <span>Vendor Pickup Location</span>
                </h3>
                <p className="text-xs text-slate-600 font-medium">
                  {item.pickup_address}
                </p>
                <div className="text-[11px] text-slate-400">
                  Direct loading and collection coordinate verified by platform governance.
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Pricing & Purchase Card (5 cols sticky) */}
          <div className="lg:col-span-5 sticky top-20 space-y-6">
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 space-y-6 shadow-xl">
              {/* Vendor Profile Header */}
              {vendor && (
                <div className="flex items-center justify-between pb-5 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center">
                      {vendor.avatar_url ? (
                        <img src={vendor.avatar_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Store className="w-6 h-6 text-slate-400" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-1">
                        <span className="font-extrabold text-sm text-slate-900">{vendor.full_name}</span>
                        {vendor.is_verified && <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />}
                      </div>
                      <span className="text-[11px] text-slate-400 font-medium">Verified Supplier</span>
                    </div>
                  </div>

                  {vendor.trust_score ? (
                    <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-xs font-bold text-slate-900">
                      <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                      <span>{vendor.trust_score.toFixed(1)}</span>
                    </div>
                  ) : null}
                </div>
              )}

              {/* Price Banner */}
              <div className="space-y-1">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  {isQuotation ? 'Pricing Model' : 'Unit Price'}
                </span>
                {isQuotation ? (
                  <div className="text-2xl font-black text-slate-900">
                    Custom Quotation
                  </div>
                ) : (
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-3xl sm:text-4xl font-black text-slate-900">
                      ₹{effectiveUnitPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-xs font-bold text-slate-500 uppercase">
                      /{item.price_unit?.replace('PER_', '').toLowerCase() || 'unit'}
                    </span>
                  </div>
                )}
                {optionalServicesTotal > 0 && (
                  <p className="text-[11px] text-emerald-600 font-bold">
                    Includes +₹{optionalServicesTotal.toLocaleString()} optional services
                  </p>
                )}
              </div>

              {/* MOQ & Availability Badges */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-100 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Minimum Order Quantity (MOQ):</span>
                  <span className="font-mono font-bold text-slate-900">
                    {moq.toLocaleString()} {item.price_unit?.replace('PER_', '').toLowerCase() || 'units'}
                  </span>
                </div>
                {item.stock_quantity !== undefined && (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Available Inventory:</span>
                    <span className="font-mono font-bold text-emerald-700">
                      {item.stock_quantity.toLocaleString()} in stock
                    </span>
                  </div>
                )}
              </div>

              {/* Quantity Selector (for fixed price) */}
              {!isQuotation && (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-600 uppercase tracking-wider block">
                    Order Quantity
                  </label>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => Math.max(moq, q - (moq > 10 ? 100 : 1)))}
                      className="w-12 h-12 rounded-2xl border border-slate-200 hover:bg-slate-100 flex items-center justify-center font-bold text-slate-700 transition-colors"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <input
                      type="number"
                      value={quantity}
                      min={moq}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || moq;
                        setQuantity(val);
                      }}
                      className="flex-1 py-3 px-4 rounded-2xl bg-slate-100 text-center font-mono font-black text-lg outline-none border border-transparent focus:border-black"
                    />
                    <button
                      type="button"
                      onClick={() => setQuantity((q) => q + (moq > 10 ? 100 : 1))}
                      className="w-12 h-12 rounded-2xl border border-slate-200 hover:bg-slate-100 flex items-center justify-center font-bold text-slate-700 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  {quantity < moq && (
                    <p className="text-[11px] text-amber-600 font-bold">
                      Quantity must be at least the minimum order quantity of {moq}.
                    </p>
                  )}
                </div>
              )}

              {/* Subtotal Calculation */}
              {!isQuotation && (
                <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Total Estimated Price
                  </span>
                  <span className="text-2xl font-black text-slate-900">
                    ₹{totalPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="space-y-3 pt-2">
                {!isQuotation ? (
                  <>
                    <button
                      type="button"
                      onClick={handleBuyNow}
                      className="w-full py-4 px-6 rounded-2xl bg-black hover:bg-slate-800 text-white font-black text-sm shadow-xl transition-all flex items-center justify-center gap-2"
                    >
                      <span>Proceed to Checkout</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleAddToCart}
                      className={`w-full py-3.5 px-6 rounded-2xl border font-bold text-xs transition-all flex items-center justify-center gap-2 ${
                        justAdded
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'border-slate-300 hover:bg-slate-100 text-slate-800'
                      }`}
                    >
                      {justAdded ? (
                        <>
                          <Check className="w-4 h-4" />
                          <span>Added to Cart</span>
                        </>
                      ) : (
                        <>
                          <ShoppingCart className="w-4 h-4" />
                          <span>Add to Cart</span>
                        </>
                      )}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={handleBuyNow}
                    className="w-full py-4 px-6 rounded-2xl bg-amber-500 hover:bg-amber-600 text-white font-black text-sm shadow-xl transition-all flex items-center justify-center gap-2"
                  >
                    <span>Request Custom Quotation</span>
                  </button>
                )}

                <Link
                  href={`/marketplace/compare?ids=${item.id}`}
                  className="w-full py-3 px-4 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors flex items-center justify-center gap-2"
                >
                  <Scale className="w-3.5 h-3.5 text-slate-500" />
                  <span>Compare with Similar Items</span>
                </Link>
              </div>

              {/* Platform Guarantee */}
              <div className="pt-4 border-t border-slate-100 flex items-center gap-2.5 text-[11px] text-slate-500">
                <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                <span>Escrow Hold & Direct Vendor Fulfillment Protection</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Cart Drawer Modal */}
      <CartDrawerModal
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
      />
    </div>
  );
}

