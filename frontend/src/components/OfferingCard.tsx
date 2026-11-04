'use client';

import React from 'react';
import Link from 'next/link';
import { VendorCatalogItem } from '@/lib/api';
import { useCart } from '@/context/CartContext';
import {
  Package,
  Store,
  Star,
  CheckCircle,
  ShieldCheck,
  ShoppingCart,
  Check,
  Scale,
  Sparkles,
  Layers,
} from 'lucide-react';

interface OfferingCardProps {
  item: VendorCatalogItem;
  isCompared?: boolean;
  onToggleCompare?: (item: VendorCatalogItem) => void;
  onOpenStorefront?: (vendorId: string) => void;
}

export default function OfferingCard({
  item,
  isCompared = false,
  onToggleCompare,
  onOpenStorefront,
}: OfferingCardProps) {
  const { addToCart } = useCart();
  const [justAdded, setJustAdded] = React.useState(false);

  // Extract primary image
  let mainImage: string | null = null;
  if (item.images) {
    if (typeof item.images === 'string') {
      try {
        const parsed = JSON.parse(item.images);
        if (Array.isArray(parsed) && parsed.length > 0) mainImage = parsed[0];
      } catch {
        mainImage = item.images;
      }
    } else if (Array.isArray(item.images) && item.images.length > 0) {
      mainImage = (item.images as any[])[0];
    }
  }

  // Included services count
  let includedCount = 0;
  if (item.included_services) {
    if (Array.isArray(item.included_services)) {
      includedCount = item.included_services.length;
    } else if (typeof item.included_services === 'string') {
      try {
        const parsed = JSON.parse(item.included_services);
        if (Array.isArray(parsed)) includedCount = parsed.length;
      } catch {}
    }
  }

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (item.price_type === 'QUOTATION') {
      return;
    }

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
      imageUrl: mainImage || undefined,
    });

    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1800);
  };

  const isQuotation = item.price_type === 'QUOTATION';

  return (
    <div className="group relative bg-white rounded-3xl border border-slate-200 hover:border-slate-900/30 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col justify-between overflow-hidden">
      <div>
        {/* Card Header & Thumbnail */}
        <div className="relative aspect-video w-full bg-slate-100 overflow-hidden">
          {mainImage ? (
            <img
              src={mainImage}
              alt={item.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-slate-100 text-slate-400">
              <Package className="w-12 h-12 stroke-[1.25]" />
            </div>
          )}

          {/* Badges Over Image */}
          <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
            {item.category?.name && (
              <span className="px-2.5 py-1 rounded-full bg-black/80 backdrop-blur-md text-white text-[10px] font-extrabold uppercase tracking-wider">
                {item.category.name}
              </span>
            )}
            {isQuotation ? (
              <span className="px-2.5 py-1 rounded-full bg-amber-500 text-white text-[10px] font-black uppercase tracking-wider">
                Custom Quote
              </span>
            ) : item.stock_quantity !== undefined && item.stock_quantity > 0 ? (
              <span className="px-2.5 py-1 rounded-full bg-emerald-600 text-white text-[10px] font-black uppercase tracking-wider">
                In Stock
              </span>
            ) : null}
          </div>

          {/* Compare Checkbox Button */}
          {onToggleCompare && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggleCompare(item);
              }}
              className={`absolute bottom-3 right-3 p-2 rounded-xl backdrop-blur-md text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm ${
                isCompared
                  ? 'bg-black text-white'
                  : 'bg-white/90 text-slate-700 hover:bg-white'
              }`}
              title="Compare with other offerings"
            >
              <Scale className="w-3.5 h-3.5" />
              <span className="text-[11px]">{isCompared ? 'Compared' : 'Compare'}</span>
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-3">
          {/* Vendor Information Link */}
          {item.vendor_user && (
            <div className="flex items-center justify-between text-xs text-slate-500">
              <button
                type="button"
                onClick={() => onOpenStorefront?.(item.vendor_user_id)}
                className="hover:text-black font-semibold flex items-center gap-1.5 truncate text-left group/vendor"
              >
                <Store className="w-3.5 h-3.5 text-slate-400 group-hover/vendor:text-black" />
                <span className="truncate">{item.vendor_user.full_name}</span>
                {item.vendor_user.is_verified && (
                  <CheckCircle className="w-3 h-3 text-emerald-600 flex-shrink-0" />
                )}
              </button>
              {item.vendor_user.trust_score ? (
                <div className="flex items-center gap-0.5 text-slate-800 font-bold text-[11px]">
                  <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                  <span>{item.vendor_user.trust_score.toFixed(1)}</span>
                </div>
              ) : null}
            </div>
          )}

          {/* Offering Title */}
          <Link href={`/marketplace/offering/${item.id}`} className="block group/title">
            <h3 className="font-extrabold text-base text-slate-900 group-hover/title:text-black line-clamp-2 leading-snug">
              {item.title}
            </h3>
          </Link>

          {/* Description snippet */}
          {item.description && (
            <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
              {item.description}
            </p>
          )}

          {/* Features / Included Services Pills */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {item.min_order_quantity && item.min_order_quantity > 1 ? (
              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-mono text-[10px] font-bold">
                MOQ: {item.min_order_quantity.toLocaleString()}
              </span>
            ) : null}
            {includedCount > 0 && (
              <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold">
                {includedCount} Included Service{includedCount > 1 ? 's' : ''}
              </span>
            )}
            {item.pickup_address && (
              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-medium truncate max-w-[140px]">
                📍 Pickup Available
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Card Footer: Price & CTA */}
      <div className="p-5 pt-0 mt-3 border-t border-slate-100 pt-4 flex items-center justify-between gap-3">
        <div>
          {isQuotation ? (
            <div>
              <span className="text-xs text-slate-400 font-medium">Pricing</span>
              <div className="text-base font-black text-slate-900">Upon Request</div>
            </div>
          ) : (
            <div>
              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">
                Price ({item.price_unit?.replace('PER_', '').toLowerCase() || 'unit'})
              </span>
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-black text-slate-900">
                  ₹{item.unit_price?.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="text-[11px] text-slate-500 font-medium">
                  /{item.price_unit?.replace('PER_', '').toLowerCase() || 'piece'}
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/marketplace/offering/${item.id}`}
            className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-colors"
          >
            Details
          </Link>

          {!isQuotation ? (
            <button
              type="button"
              onClick={handleAddToCart}
              className={`p-2.5 rounded-xl font-bold text-xs transition-all shadow-sm flex items-center justify-center ${
                justAdded
                  ? 'bg-emerald-600 text-white'
                  : 'bg-black hover:bg-slate-800 text-white'
              }`}
              title="Add to Cart"
            >
              {justAdded ? (
                <Check className="w-4 h-4" />
              ) : (
                <ShoppingCart className="w-4 h-4" />
              )}
            </button>
          ) : (
            <Link
              href={`/marketplace/offering/${item.id}`}
              className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition-colors shadow-sm"
            >
              Quote
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

