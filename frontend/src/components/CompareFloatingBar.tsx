'use client';

import React from 'react';
import Link from 'next/link';
import { VendorCatalogItem } from '@/lib/api';
import { Scale, X, ArrowRight, Package } from 'lucide-react';

interface CompareFloatingBarProps {
  items: VendorCatalogItem[];
  onRemoveItem: (id: string) => void;
  onClearAll: () => void;
}

export default function CompareFloatingBar({
  items,
  onRemoveItem,
  onClearAll,
}: CompareFloatingBarProps) {
  if (items.length === 0) return null;

  const compareUrl = `/marketplace/compare?ids=${items.map((i) => i.id).join(',')}`;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-full max-w-2xl px-4 animate-in slide-in-from-bottom-5 duration-300">
      <div className="bg-slate-900/95 backdrop-blur-md text-white rounded-3xl p-4 sm:p-5 shadow-2xl border border-slate-800 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 overflow-x-auto min-w-0 py-1">
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">
              <Scale className="w-4 h-4 text-white" />
            </div>
            <div className="hidden sm:block">
              <span className="text-xs font-bold block leading-none">Compare Offerings</span>
              <span className="text-[10px] text-slate-400 font-medium">
                {items.length} of 4 items selected
              </span>
            </div>
          </div>

          {/* Selected Item Pills / Thumbnails */}
          <div className="flex items-center gap-2">
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
                <div
                  key={it.id}
                  className="relative group/pill flex items-center gap-2 pl-1.5 pr-2 py-1 rounded-2xl bg-white/10 border border-white/10 text-xs font-medium"
                >
                  <div className="w-6 h-6 rounded-lg bg-black/40 overflow-hidden flex items-center justify-center flex-shrink-0">
                    {img ? (
                      <img src={img} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Package className="w-3.5 h-3.5 text-slate-400" />
                    )}
                  </div>
                  <span className="max-w-[100px] truncate text-[11px]">{it.title}</span>
                  <button
                    type="button"
                    onClick={() => onRemoveItem(it.id)}
                    className="p-0.5 rounded-full hover:bg-white/20 text-slate-400 hover:text-white transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={onClearAll}
            className="px-2.5 py-2 text-[11px] text-slate-400 hover:text-white font-semibold transition-colors"
          >
            Clear
          </button>
          <Link
            href={compareUrl}
            className="px-4 py-2.5 rounded-2xl bg-white hover:bg-slate-100 text-slate-950 font-black text-xs transition-all shadow-md flex items-center gap-1.5"
          >
            <span>Compare Now</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}

