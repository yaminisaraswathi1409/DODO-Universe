'use client';

import React from 'react';
import { useCart } from '@/context/CartContext';
import { AlertTriangle, Store, RefreshCw, X } from 'lucide-react';

export default function CartVendorConflictModal() {
  const { pendingVendorConflict, resolveVendorConflict } = useCart();

  if (!pendingVendorConflict) return null;

  const { currentVendorName, newVendorName, newItem } = pendingVendorConflict;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl border border-slate-200 space-y-6">
        <div className="flex items-center justify-between">
          <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <button
            onClick={() => resolveVendorConflict('CANCEL')}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-2">
          <h3 className="text-xl font-black text-slate-900 tracking-tight">
            Replace Cart Items?
          </h3>
          <p className="text-sm text-slate-600 leading-relaxed">
            Your cart already contains offerings from{' '}
            <strong className="text-slate-900 font-bold">{currentVendorName}</strong>.
            In DODO-Universe, catalog orders are fulfilled and delivered directly by a single vendor.
          </p>
        </div>

        {/* Vendor Comparison Badge */}
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3 text-xs">
          <div className="flex items-center justify-between text-slate-500">
            <span className="flex items-center gap-1.5 font-medium">
              <Store className="w-3.5 h-3.5" />
              <span>Current Cart:</span>
            </span>
            <span className="font-bold text-slate-900">{currentVendorName}</span>
          </div>
          <div className="h-px bg-slate-200" />
          <div className="flex items-center justify-between text-slate-500">
            <span className="flex items-center gap-1.5 font-medium text-emerald-700">
              <Store className="w-3.5 h-3.5 text-emerald-600" />
              <span>New Vendor:</span>
            </span>
            <span className="font-bold text-emerald-700">{newVendorName}</span>
          </div>
          <div className="pt-1 text-[11px] text-slate-400 italic">
            Adding: &quot;{newItem.title}&quot; (Qty: {newItem.quantity})
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 pt-2">
          <button
            onClick={() => resolveVendorConflict('CANCEL')}
            className="w-full py-3 px-4 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-50 transition-colors text-center"
          >
            Keep Existing Cart
          </button>
          <button
            onClick={() => resolveVendorConflict('REPLACE')}
            className="w-full py-3 px-4 rounded-xl bg-black hover:bg-slate-800 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Clear & Add Item</span>
          </button>
        </div>
      </div>
    </div>
  );
}

