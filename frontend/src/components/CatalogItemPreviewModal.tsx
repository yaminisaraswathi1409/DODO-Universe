'use client';

import React, { useState } from 'react';
import {
  VendorCatalogItem,
  AdditionalServiceItem,
} from '@/lib/api';
import {
  X,
  Package,
  Folder,
  Check,
  CheckCircle2,
  Clock,
  MapPin,
  ShieldCheck,
  Layers,
  History,
  Tag,
} from 'lucide-react';

interface CatalogItemPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: VendorCatalogItem | null;
}

export default function CatalogItemPreviewModal({
  isOpen,
  onClose,
  item,
}: CatalogItemPreviewModalProps) {
  const [selectedOptionalServices, setSelectedOptionalServices] = useState<Record<string, boolean>>({});

  if (!isOpen || !item) return null;

  const isGrouping = item.node_type === 'GROUPING';
  const qty = Math.max(item.min_order_quantity || 1, 1);
  const baseSubtotal = (item.unit_price || 0) * qty;

  let optionalSubtotal = 0;
  if (Array.isArray(item.optional_services)) {
    item.optional_services.forEach((svc) => {
      if (selectedOptionalServices[svc.id]) {
        if (svc.price_unit === 'PER_PIECE') {
          optionalSubtotal += (svc.price || 0) * qty;
        } else {
          optionalSubtotal += svc.price || 0;
        }
      }
    });
  }

  const finalPayable = baseSubtotal + optionalSubtotal;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-8">
        {/* Header */}
        <div className="p-6 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-black text-white">
              {isGrouping ? <Folder className="w-5 h-5" /> : <Package className="w-5 h-5" />}
            </span>
            <div>
              <h3 className="font-extrabold text-base text-slate-900">Customer Listing Preview</h3>
              <p className="text-xs text-slate-500">Live simulation of marketplace customer view</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-200 text-slate-400 hover:text-black transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 max-h-[70vh] overflow-y-auto space-y-6">
          {/* Images Gallery */}
          {Array.isArray(item.images) && item.images.length > 0 ? (
            <div className="rounded-2xl overflow-hidden aspect-video bg-slate-100 border border-slate-200">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.images[0]} alt={item.title} className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="h-40 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 border border-slate-200">
              {isGrouping ? <Folder className="w-12 h-12" /> : <Package className="w-12 h-12" />}
            </div>
          )}

          {/* Title & Metadata */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                {item.category?.name || 'Category'}
              </span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                isGrouping
                  ? 'bg-slate-100 text-slate-700'
                  : 'bg-emerald-100 text-emerald-800'
              }`}>
                {isGrouping ? 'Grouping Node (Not Bookable)' : 'Bookable Product'}
              </span>
              {item.price_type === 'QUOTATION' && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-100 text-purple-800">
                  Quotation-Based
                </span>
              )}
            </div>

            <h4 className="font-extrabold text-lg text-slate-900">{item.title}</h4>
            {item.description && <p className="text-xs text-slate-500 mt-1 leading-relaxed">{item.description}</p>}
          </div>

          {!isGrouping && (
            <>
              {/* Base Price & MOQ Info */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-xs text-slate-600">Unit Price:</span>
                  <span className="font-extrabold text-xl text-slate-900">
                    ₹{item.unit_price} <span className="text-xs text-slate-500 font-normal">/{item.price_unit || 'PIECE'}</span>
                  </span>
                </div>

                {item.min_order_quantity && item.min_order_quantity > 1 && (
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span>Minimum Order Quantity (MOQ):</span>
                    <span className="font-bold text-slate-900">{item.min_order_quantity.toLocaleString()} units</span>
                  </div>
                )}

                {item.stock_quantity !== undefined && (
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span>Available Stock:</span>
                    <span className="font-bold text-slate-900">{item.stock_quantity.toLocaleString()} units</span>
                  </div>
                )}
              </div>

              {/* Technical Specifications */}
              {item.attributes && Object.keys(item.attributes).length > 0 && (
                <div className="space-y-2">
                  <h5 className="font-extrabold text-xs text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5" />
                    <span>Product Specifications</span>
                  </h5>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {Object.entries(item.attributes).map(([key, value]) => {
                      if (key === 'included_components' || key === 'included_items' || key === 'pricing_matrix') return null;
                      return (
                        <div key={key} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                          <span className="text-[10px] text-slate-400 font-bold uppercase block">{key.replace(/_/g, ' ')}</span>
                          <span className="font-extrabold text-slate-800">{String(value)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Included Services */}
              {Array.isArray(item.included_services) && item.included_services.length > 0 && (
                <div className="space-y-2">
                  <h5 className="font-extrabold text-xs text-emerald-900 uppercase tracking-wider">
                    Included Free Services ({item.included_services.length})
                  </h5>
                  <div className="space-y-1.5">
                    {item.included_services.map((svc) => (
                      <div key={svc.id} className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between text-xs">
                        <div>
                          <span className="font-bold text-emerald-950 block">{svc.name}</span>
                          {svc.description && <span className="text-[10px] text-emerald-700">{svc.description}</span>}
                        </div>
                        <span className="text-[10px] font-extrabold text-emerald-800 bg-emerald-200/80 px-2 py-0.5 rounded-full">
                          FREE
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Optional Services & Simulation */}
              {Array.isArray(item.optional_services) && item.optional_services.length > 0 && (
                <div className="space-y-2">
                  <h5 className="font-extrabold text-xs text-blue-900 uppercase tracking-wider">
                    Optional Add-On Services (Customer Selection)
                  </h5>
                  <div className="space-y-1.5">
                    {item.optional_services.map((svc) => {
                      const isSelected = !!selectedOptionalServices[svc.id];
                      return (
                        <label
                          key={svc.id}
                          className="p-3 rounded-xl bg-blue-50/50 border border-blue-200 flex items-center justify-between text-xs cursor-pointer hover:bg-blue-50 transition-colors"
                        >
                          <div className="flex items-center gap-2.5">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) =>
                                setSelectedOptionalServices({
                                  ...selectedOptionalServices,
                                  [svc.id]: e.target.checked,
                                })
                              }
                              className="rounded text-black focus:ring-black"
                            />
                            <div>
                              <span className="font-bold text-slate-900 block">{svc.name}</span>
                              {svc.description && <span className="text-[10px] text-slate-500">{svc.description}</span>}
                            </div>
                          </div>
                          <span className="font-extrabold text-blue-950">
                            +₹{svc.price} <span className="text-[10px] text-blue-600 font-medium">/{svc.price_unit}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Pickup Address */}
              {item.pickup_address && (
                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 text-xs flex items-start gap-2 text-slate-600">
                  <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-slate-900 block">Pickup Location / Yard</span>
                    <span>{item.pickup_address}</span>
                  </div>
                </div>
              )}

              {/* Interactive Calculation Card */}
              <div className="p-4 rounded-2xl bg-black text-white space-y-2">
                <div className="flex justify-between text-xs text-slate-300">
                  <span>Base Price ({qty.toLocaleString()} units):</span>
                  <span>₹{baseSubtotal.toLocaleString()}</span>
                </div>
                {optionalSubtotal > 0 && (
                  <div className="flex justify-between text-xs text-blue-300">
                    <span>Selected Optional Services:</span>
                    <span>+₹{optionalSubtotal.toLocaleString()}</span>
                  </div>
                )}
                <div className="pt-2 border-t border-slate-800 flex justify-between items-baseline">
                  <span className="text-xs font-bold">Estimated Total Payable:</span>
                  <span className="text-xl font-extrabold text-white">₹{finalPayable.toLocaleString()}</span>
                </div>
              </div>
            </>
          )}

          {/* Review History Audit Trail */}
          {Array.isArray(item.review_history) && item.review_history.length > 0 && (
            <div className="space-y-2 pt-4 border-t border-slate-200">
              <h5 className="font-extrabold text-xs text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                <History className="w-3.5 h-3.5" />
                <span>Admin Review History</span>
              </h5>
              <div className="space-y-1.5">
                {item.review_history.map((rev, idx) => (
                  <div key={idx} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800">{rev.action}</span>
                      <span className="text-[10px] text-slate-400">{new Date(rev.timestamp).toLocaleString()}</span>
                    </div>
                    {rev.notes && <p className="text-slate-600 italic text-[11px]">&quot;{rev.notes}&quot;</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

