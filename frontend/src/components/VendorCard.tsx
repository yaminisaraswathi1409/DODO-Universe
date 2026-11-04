'use client';

import React from 'react';
import Link from 'next/link';
import { MarketplaceVendorCard } from '@/lib/api';
import {
  Store,
  Star,
  CheckCircle,
  MapPin,
  Package,
  ArrowRight,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react';

interface VendorCardProps {
  vendor: MarketplaceVendorCard;
  onOpenStorefront?: (vendorId: string) => void;
}

export default function VendorCard({ vendor, onOpenStorefront }: VendorCardProps) {
  return (
    <div className="bg-white rounded-3xl border border-slate-200 hover:border-slate-900/30 p-6 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col justify-between space-y-5">
      <div>
        {/* Header: Avatar, Name, Verification, Distance */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center flex-shrink-0">
              {vendor.vendor_avatar ? (
                <img
                  src={vendor.vendor_avatar}
                  alt={vendor.vendor_name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Store className="w-7 h-7 text-slate-400" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="font-extrabold text-base text-slate-900 hover:text-black">
                  {vendor.vendor_name}
                </h3>
                {vendor.is_verified && (
                  <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                )}
              </div>
              {vendor.address_text && (
                <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">
                  {vendor.address_text}
                </p>
              )}
            </div>
          </div>

          {/* Trust Score & Distance Badges */}
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            {vendor.trust_score ? (
              <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-slate-900 text-xs font-bold">
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                <span>{vendor.trust_score.toFixed(1)}</span>
              </div>
            ) : null}
            {vendor.distance_km !== null && vendor.distance_km !== undefined ? (
              <span className="text-[11px] font-bold text-slate-600 flex items-center gap-0.5">
                <MapPin className="w-3 h-3 text-slate-400" />
                <span>{vendor.distance_km} km away</span>
              </span>
            ) : null}
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 gap-3 mt-4 pt-4 border-t border-slate-100 text-xs">
          <div className="bg-slate-50 rounded-2xl p-3">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold block">
              Active Catalog
            </span>
            <span className="text-sm font-black text-slate-900 mt-0.5 block">
              {vendor.offering_count} {vendor.offering_count === 1 ? 'Product' : 'Products'}
            </span>
          </div>

          <div className="bg-slate-50 rounded-2xl p-3">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold block">
              Price Range
            </span>
            <span className="text-sm font-black text-slate-900 mt-0.5 block truncate">
              {vendor.min_price !== undefined && vendor.max_price !== undefined ? (
                `₹${vendor.min_price.toFixed(0)} - ₹${vendor.max_price.toFixed(0)}`
              ) : (
                'On Request'
              )}
            </span>
          </div>
        </div>

        {/* Top Sample Offerings */}
        {vendor.sample_offerings && vendor.sample_offerings.length > 0 && (
          <div className="mt-4 space-y-2">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
              Featured In Store
            </span>
            <div className="space-y-1.5">
              {vendor.sample_offerings.slice(0, 3).map((item) => (
                <Link
                  key={item.id}
                  href={`/marketplace/offering/${item.id}`}
                  className="flex items-center justify-between p-2 rounded-xl bg-slate-50/70 hover:bg-slate-100 text-xs transition-colors group/item"
                >
                  <span className="font-semibold text-slate-800 group-hover/item:text-black truncate max-w-[200px]">
                    {item.title}
                  </span>
                  <div className="flex items-center gap-1 text-[11px] font-mono font-bold text-slate-900 flex-shrink-0">
                    <span>₹{item.unit_price}</span>
                    <ChevronRight className="w-3 h-3 text-slate-400 group-hover/item:translate-x-0.5 transition-transform" />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Action Button */}
      <button
        type="button"
        onClick={() => onOpenStorefront?.(vendor.vendor_id)}
        className="w-full py-3 px-4 rounded-2xl bg-black hover:bg-slate-800 text-white font-bold text-xs shadow-sm transition-all flex items-center justify-center gap-2 group/btn"
      >
        <span>Explore Full Vendor Storefront</span>
        <ArrowRight className="w-3.5 h-3.5 group-hover/btn:translate-x-1 transition-transform" />
      </button>
    </div>
  );
}

