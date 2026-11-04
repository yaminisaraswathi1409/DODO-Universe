'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  VendorCatalogItem,
  OfferingComparisonResponse,
  compareMarketplaceOfferings,
} from '@/lib/api';
import { useCart } from '@/context/CartContext';
import CartDrawerModal from '@/components/CartDrawerModal';
import {
  ArrowLeft,
  Scale,
  Store,
  Star,
  CheckCircle,
  Package,
  Layers,
  MapPin,
  Check,
  X,
  AlertTriangle,
  ShoppingCart,
  Plus,
} from 'lucide-react';

function OfferingCompareContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const idsParam = searchParams?.get('ids') || '';

  const { addToCart, isCartOpen, setIsCartOpen } = useCart();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [comparison, setComparison] = useState<OfferingComparisonResponse | null>(null);

  const offeringIds = React.useMemo(() => {
    return idsParam
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }, [idsParam]);

  useEffect(() => {
    if (offeringIds.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    compareMarketplaceOfferings(offeringIds)
      .then((data) => {
        setComparison(data);
      })
      .catch((err) => {
        setError(err.message || 'Failed to compare offerings');
      })
      .finally(() => setLoading(false));
  }, [idsParam]);

  const handleRemoveItem = (idToRemove: string) => {
    const updatedIds = offeringIds.filter((id) => id !== idToRemove);
    if (updatedIds.length === 0) {
      router.push('/marketplace');
    } else {
      router.push(`/marketplace/compare?ids=${updatedIds.join(',')}`);
    }
  };

  const handleAddToCart = (item: VendorCatalogItem) => {
    if (item.price_type === 'QUOTATION') return;

    addToCart({
      vendorId: item.vendor_user_id,
      vendorName: item.vendor_user?.full_name || 'Verified Vendor',
      vendorBrandName: item.vendor_user?.full_name || 'Verified Vendor',
      vendorAvatar: item.vendor_user?.avatar_url,
      vendorPhone: item.vendor_user?.phone,
      catalogItemId: item.id,
      categoryId: item.category_id,
      categoryName: item.category?.name,
      categorySlug: item.category?.slug,
      title: item.title,
      description: item.description,
      quantity: item.min_order_quantity && item.min_order_quantity > 0 ? item.min_order_quantity : 1,
      quantityUnit: item.price_unit || 'Piece',
      unitPrice: item.unit_price,
      totalPrice: item.unit_price * (item.min_order_quantity && item.min_order_quantity > 0 ? item.min_order_quantity : 1),
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-slate-200 border-t-black rounded-full animate-spin mx-auto" />
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
            Compiling side-by-side comparison matrix...
          </p>
        </div>
      </div>
    );
  }

  if (offeringIds.length === 0 || !comparison || comparison.items.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-3xl p-8 max-w-md w-full border border-slate-200 text-center space-y-4 shadow-sm">
          <Scale className="w-12 h-12 text-slate-300 mx-auto" />
          <h2 className="text-xl font-black text-slate-900">No Offerings to Compare</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            Select 2 to 4 offerings in the marketplace to compare specifications, prices, MOQ, and services side-by-side.
          </p>
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-black text-white font-bold text-xs"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Browse Marketplace</span>
          </Link>
        </div>
      </div>
    );
  }

  const { items, all_spec_keys, has_mixed_units, price_units } = comparison;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-24">
      {/* Top Header */}
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
              className="p-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 transition-colors flex items-center gap-2 text-xs font-bold"
            >
              <ShoppingCart className="w-4 h-4" />
              <span className="hidden sm:inline">My Cart</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-8 space-y-8">
        {/* Title & Mixed-Units Warning */}
        <div className="space-y-4">
          <div>
            <span className="text-xs font-black text-slate-900 uppercase tracking-widest flex items-center gap-1.5">
              <Scale className="w-3.5 h-3.5" />
              <span>Side-by-Side Comparison</span>
            </span>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 mt-1 tracking-tight">
              Compare {items.length} Offerings
            </h1>
          </div>

          {/* Mixed Pricing Units Warning Banner */}
          {has_mixed_units && (
            <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-3 text-amber-900">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="space-y-1 text-xs leading-relaxed">
                <span className="font-bold block">Notice: Mixed Pricing Units Detected</span>
                <p className="text-amber-800">
                  The compared offerings use different pricing units ({price_units.join(', ')}). Direct numerical comparison should account for differences in unit quantities.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Comparison Matrix Table */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[700px]">
            {/* Header: Item Cards */}
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/50">
                <th className="p-5 w-48 text-xs font-bold text-slate-400 uppercase tracking-wider align-top">
                  Product / Offering
                </th>
                {items.map((it) => {
                  let img: string | null = null;
                  if (it.images) {
                    if (typeof it.images === 'string') {
                      try {
                        const parsed = JSON.parse(it.images);
                        if (Array.isArray(parsed) && parsed.length > 0) img = parsed[0];
                      } catch {
                        img = it.images;
                      }
                    } else if (Array.isArray(it.images) && it.images.length > 0) {
                      img = (it.images as any[])[0];
                    }
                  }

                  return (
                    <th key={it.id} className="p-5 min-w-[220px] max-w-[280px] align-top">
                      <div className="space-y-3">
                        <div className="relative aspect-video w-full rounded-2xl bg-slate-100 overflow-hidden border border-slate-200">
                          {img ? (
                            <img src={img} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-300">
                              <Package className="w-8 h-8" />
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(it.id)}
                            className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 hover:bg-black text-white text-xs transition-colors"
                            title="Remove from comparison"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div>
                          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">
                            {it.category?.name || 'Category'}
                          </span>
                          <Link
                            href={`/marketplace/offering/${it.id}`}
                            className="font-extrabold text-sm text-slate-900 hover:underline line-clamp-2"
                          >
                            {it.title}
                          </Link>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleAddToCart(it)}
                          className="w-full py-2.5 px-3 rounded-xl bg-black hover:bg-slate-800 text-white font-bold text-xs shadow-sm flex items-center justify-center gap-1.5 transition-colors"
                        >
                          <ShoppingCart className="w-3.5 h-3.5" />
                          <span>Add to Cart</span>
                        </button>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 text-xs">
              {/* Row: Vendor */}
              <tr>
                <td className="p-4 font-bold text-slate-500 bg-slate-50/50">Vendor / Store</td>
                {items.map((it) => (
                  <td key={it.id} className="p-4 font-semibold text-slate-900">
                    <div className="flex items-center gap-1.5">
                      <Store className="w-3.5 h-3.5 text-slate-400" />
                      <span>{it.vendor_user?.full_name || 'Verified Vendor'}</span>
                      {it.vendor_user?.is_verified && (
                        <CheckCircle className="w-3 h-3 text-emerald-600 flex-shrink-0" />
                      )}
                    </div>
                  </td>
                ))}
              </tr>

              {/* Row: Vendor Rating */}
              <tr>
                <td className="p-4 font-bold text-slate-500 bg-slate-50/50">Trust Score</td>
                {items.map((it) => (
                  <td key={it.id} className="p-4 font-bold text-slate-800">
                    <div className="flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                      <span>{it.vendor_user?.trust_score?.toFixed(1) || '5.0'}</span>
                    </div>
                  </td>
                ))}
              </tr>

              {/* Row: Price & Unit */}
              <tr>
                <td className="p-4 font-bold text-slate-500 bg-slate-50/50">Unit Price</td>
                {items.map((it) => (
                  <td key={it.id} className="p-4">
                    {it.price_type === 'QUOTATION' ? (
                      <span className="font-bold text-amber-700">Custom Quote</span>
                    ) : (
                      <div className="font-black text-slate-900 text-sm">
                        ₹{it.unit_price?.toLocaleString('en-IN', { minimumFractionDigits: 2 })}{' '}
                        <span className="text-[11px] font-medium text-slate-500">
                          /{it.price_unit?.replace('PER_', '').toLowerCase() || 'piece'}
                        </span>
                      </div>
                    )}
                  </td>
                ))}
              </tr>

              {/* Row: Minimum Order Quantity (MOQ) */}
              <tr>
                <td className="p-4 font-bold text-slate-500 bg-slate-50/50">Min. Order Qty (MOQ)</td>
                {items.map((it) => (
                  <td key={it.id} className="p-4 font-mono font-bold text-slate-800">
                    {it.min_order_quantity ? it.min_order_quantity.toLocaleString() : '1'}{' '}
                    {it.price_unit?.replace('PER_', '').toLowerCase() || 'units'}
                  </td>
                ))}
              </tr>

              {/* Row: Stock Inventory */}
              <tr>
                <td className="p-4 font-bold text-slate-500 bg-slate-50/50">Stock Available</td>
                {items.map((it) => (
                  <td key={it.id} className="p-4 font-semibold text-slate-700">
                    {it.stock_quantity !== undefined && it.stock_quantity > 0 ? (
                      <span className="text-emerald-700 font-mono font-bold">
                        {it.stock_quantity.toLocaleString()} in stock
                      </span>
                    ) : (
                      <span className="text-slate-400">Available on request</span>
                    )}
                  </td>
                ))}
              </tr>

              {/* Row: Included Services */}
              <tr>
                <td className="p-4 font-bold text-slate-500 bg-slate-50/50">Included Services</td>
                {items.map((it) => {
                  let inc: any[] = [];
                  if (it.included_services) {
                    if (typeof it.included_services === 'string') {
                      try {
                        inc = JSON.parse(it.included_services);
                      } catch {}
                    } else if (Array.isArray(it.included_services)) {
                      inc = it.included_services;
                    }
                  }
                  return (
                    <td key={it.id} className="p-4 space-y-1">
                      {inc.length > 0 ? (
                        inc.map((s, idx) => (
                          <div key={idx} className="flex items-center gap-1.5 text-[11px] text-emerald-800 font-medium">
                            <Check className="w-3 h-3 text-emerald-600 flex-shrink-0" />
                            <span>{typeof s === 'string' ? s : s.name || s.title}</span>
                          </div>
                        ))
                      ) : (
                        <span className="text-slate-400 italic">None specified</span>
                      )}
                    </td>
                  );
                })}
              </tr>

              {/* Row: Pickup Address */}
              <tr>
                <td className="p-4 font-bold text-slate-500 bg-slate-50/50">Pickup Location</td>
                {items.map((it) => (
                  <td key={it.id} className="p-4 text-[11px] text-slate-600 font-medium leading-relaxed">
                    {it.pickup_address || 'Vendor Yard'}
                  </td>
                ))}
              </tr>

              {/* Dynamic Specifications Rows */}
              {all_spec_keys.map((specKey) => (
                <tr key={specKey}>
                  <td className="p-4 font-bold text-slate-500 bg-slate-50/50 capitalize">
                    {specKey.replace(/_/g, ' ')}
                  </td>
                  {items.map((it) => {
                    let attrs: Record<string, any> = {};
                    if (it.attributes) {
                      if (typeof it.attributes === 'string') {
                        try {
                          attrs = JSON.parse(it.attributes);
                        } catch {}
                      } else if (typeof it.attributes === 'object') {
                        attrs = it.attributes;
                      }
                    }
                    const val = attrs[specKey];
                    return (
                      <td key={it.id} className="p-4 font-medium text-slate-800">
                        {val !== undefined ? (
                          <span className="font-bold text-slate-900">
                            {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {/* Cart Drawer */}
      <CartDrawerModal
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
      />
    </div>
  );
}


export default function OfferingComparePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="w-10 h-10 border-4 border-slate-200 border-t-black rounded-full animate-spin" />
        </div>
      }
    >
      <OfferingCompareContent />
    </Suspense>
  );
}
