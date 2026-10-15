'use client';

import React from 'react';
import { useCart } from '@/context/CartContext';
import { X, Trash2, ShoppingBag, Plus, Minus, ArrowRight, Layers, ArrowLeft, ShieldCheck, FileText } from 'lucide-react';
import Link from 'next/link';

interface CartDrawerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProceedToCheckout?: () => void;
}

export default function CartDrawerModal({
  isOpen,
  onClose,
  onProceedToCheckout,
}: CartDrawerModalProps) {
  const {
    cartItems,
    removeFromCart,
    updateQuantity,
    setCartItemQuantity,
    clearCart,
    cartSubtotal,
    platformFee,
    taxAmount,
    cartTotal,
    cartCount,
  } = useCart();

  // Lock background body scrolling ONLY when modal is open
  React.useEffect(() => {
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

  // Handle browser popstate / back button inside CartDrawerModal
  React.useEffect(() => {
    if (!isOpen) return;

    // Push modal state to window history so pressing Back closes the drawer without navigating away from Services
    if (typeof window !== 'undefined' && window.history.state?.modal !== 'cart_drawer') {
      window.history.pushState({ modal: 'cart_drawer' }, '', window.location.href);
    }

    const handlePopState = () => {
      onClose();
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isOpen, onClose]);

  const handleCloseWithHistory = () => {
    if (typeof window !== 'undefined' && window.history.state?.modal === 'cart_drawer') {
      window.history.back();
    } else {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] overflow-hidden bg-black/80 backdrop-blur-md animate-fadeIn touch-none">
      <div className="absolute inset-0" onClick={handleCloseWithHistory} />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white border-l border-slate-200 text-slate-900 flex flex-col shadow-2xl">
          {/* Header */}
          <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleCloseWithHistory}
                className="p-2 rounded-xl text-slate-500 hover:text-black hover:bg-slate-200 transition-colors"
                title="Back / Close Cart"
              >
                <ArrowLeft className="w-5 h-5 text-black" />
              </button>
              <div>
                <h2 className="text-base font-black text-slate-900">Your Order Cart</h2>
                <span className="text-xs text-slate-500 font-mono">
                  {cartCount} {cartCount === 1 ? 'item' : 'items'} selected
                </span>
              </div>
            </div>
            <button
              onClick={handleCloseWithHistory}
              className="p-2 rounded-xl text-slate-500 hover:text-black hover:bg-slate-200 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Cart Item List */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {cartItems.length === 0 ? (
              <div className="text-center py-16 space-y-4">
                <div className="w-16 h-16 rounded-full bg-slate-100 border border-slate-300 flex items-center justify-center mx-auto text-slate-400">
                  <ShoppingBag className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Your cart is empty</h3>
                  <p className="text-xs text-slate-600 mt-1 max-w-xs mx-auto">
                    Browse platform categories or marketplace listings to add items and customized services.
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="px-5 py-2.5 rounded-xl bg-black hover:bg-slate-800 text-white font-bold text-xs inline-flex items-center gap-2 transition-all shadow-md"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Browse Marketplace</span>
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between pb-2 border-b border-slate-200 text-xs text-slate-600">
                  <span>Multi-Service Cart Items ({cartItems.length})</span>
                  <button
                    onClick={clearCart}
                    className="text-rose-600 hover:underline text-[11px] font-bold flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Clear All</span>
                  </button>
                </div>

                {cartItems.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3 relative group"
                  >
                    {/* Vendor Header Badge */}
                    {(item.vendorName || item.vendorBrandName) && (
                      <div className="flex items-center gap-2 pb-2.5 border-b border-slate-200 text-xs">
                        <div className="w-5 h-5 rounded-md bg-slate-200 border border-slate-300 overflow-hidden flex items-center justify-center shrink-0">
                          {item.vendorAvatar ? (
                            <img src={item.vendorAvatar} alt={item.vendorName} className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-[10px] font-bold text-slate-900">🏪</span>
                          )}
                        </div>
                        <div className="truncate">
                          <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold block leading-none">
                            Booked Vendor / Business:
                          </span>
                          <span className="text-xs font-extrabold text-slate-900 truncate block">
                            {item.vendorBrandName || item.vendorName}
                            {item.vendorPhone ? ` (${item.vendorPhone})` : ''}
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="flex items-start justify-between gap-3">
                      {item.imageUrl && (
                        <div className="w-14 h-14 rounded-xl bg-white border border-slate-200 overflow-hidden shrink-0">
                          <img src={item.imageUrl} alt={item.title} className="w-full h-full object-cover" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <span className="px-2 py-0.5 rounded bg-slate-200 text-slate-900 border border-slate-300 text-[10px] font-bold uppercase">
                          {item.categoryName || 'Service'}
                        </span>
                        <h4 className="text-sm font-bold text-slate-900 mt-1 leading-snug">{item.title}</h4>

                        {item.description && (
                          <p className="text-[11px] text-slate-600 mt-1 line-clamp-2 leading-relaxed">
                            {item.description}
                          </p>
                        )}

                        {item.selectedOptionTitle && (
                          <span className="text-[11px] text-slate-800 font-semibold block mt-1">
                            Package/Option: {item.selectedOptionTitle}
                          </span>
                        )}

                        {item.includedServices && item.includedServices.length > 0 && (
                          <div className="flex items-center gap-1 flex-wrap mt-1.5">
                            {item.includedServices.map((inc) => (
                              <span
                                key={inc}
                                className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-800 text-[9px] font-extrabold uppercase border border-slate-300"
                              >
                                {inc} INCLUDED
                              </span>
                            ))}
                          </div>
                        )}

                        {item.selectedAddons && item.selectedAddons.length > 0 && (
                          <div className="mt-1.5 space-y-0.5">
                            <span className="text-[10px] font-semibold text-slate-700 block">Add-ons:</span>
                            {item.selectedAddons.map((addon) => (
                              <span key={addon.id} className="text-[10px] text-slate-600 block">
                                • {addon.title} (+₹{addon.price})
                              </span>
                            ))}
                          </div>
                        )}

                        {(item.selectedDate || item.selectedTime) && (
                          <div className="mt-1.5 text-[11px] text-slate-700 font-mono flex items-center gap-1">
                            <span>📅 {item.selectedDate || 'Scheduled'}</span>
                            {item.selectedTime && <span>🕒 {item.selectedTime}</span>}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => removeFromCart(item.id)}
                        className="text-slate-400 hover:text-rose-600 p-1 transition-colors shrink-0"
                        title="Remove item"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Dynamic Fields Details Pill Grid */}
                    {item.dynamicFields && Object.keys(item.dynamicFields).length > 0 && (
                      <div className="grid grid-cols-2 gap-1.5 p-2.5 rounded-xl bg-white border border-slate-200 text-[11px]">
                        {Object.entries(item.dynamicFields).map(([k, v]) => (
                          <div key={k} className="truncate">
                            <span className="text-slate-500 uppercase tracking-wider text-[9px] block">
                              {k.replace(/_/g, ' ')}
                            </span>
                            <span className="text-slate-900 font-medium truncate block font-mono">
                              {Array.isArray(v) ? v.join(', ') : typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Quantity & Unit Price Footer with Direct Editable Input */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => updateQuantity(item.id, -1)}
                          className="w-7 h-7 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-900 flex items-center justify-center font-bold text-xs"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        
                        {/* Direct Editable Quantity Input */}
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => setCartItemQuantity(item.id, parseInt(e.target.value, 10))}
                          className="w-12 py-1 text-center bg-white border border-slate-300 text-slate-900 font-mono text-xs rounded-lg focus:outline-none focus:border-black font-bold"
                        />

                        <button
                          onClick={() => updateQuantity(item.id, 1)}
                          className="w-7 h-7 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-900 flex items-center justify-center font-bold text-xs"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="text-right">
                        <span className="text-xs font-black text-slate-900 font-mono">
                          ₹{(item.totalPrice || item.unitPrice * item.quantity).toLocaleString()}
                        </span>
                        <span className="text-[10px] text-slate-500 block font-normal">
                          (₹{item.unitPrice.toLocaleString()} / {item.quantityUnit || 'unit'})
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Charges Breakdown Summary & Checkout Action */}
          {cartItems.length > 0 && (
            <div className="p-5 border-t border-slate-200 bg-slate-50 space-y-4">
              {/* Itemized Financial Calculation Card */}
              <div className="p-3.5 rounded-2xl bg-white border border-slate-200 space-y-2 text-xs">
                <div className="flex items-center justify-between text-slate-600">
                  <span>Items Subtotal</span>
                  <span className="font-mono text-slate-900 font-semibold">
                    ₹{cartSubtotal.toLocaleString()}
                  </span>
                </div>

                <div className="flex items-center justify-between text-slate-600">
                  <span>Platform & PostGIS Matching Fee</span>
                  <span className="font-mono text-slate-900 font-semibold">
                    ₹{platformFee}
                  </span>
                </div>

                <div className="flex items-center justify-between text-slate-600">
                  <span>Estimated GST & Taxes (18%)</span>
                  <span className="font-mono text-slate-900 font-semibold">
                    ₹{taxAmount.toLocaleString()}
                  </span>
                </div>

                <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-sm font-black text-slate-900">
                  <span>Total Amount</span>
                  <span className="text-slate-900 font-mono font-black text-base">
                    ₹{cartTotal.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Action Buttons: Continue Shopping & Proceed to Checkout */}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleCloseWithHistory}
                  className="flex-1 py-3.5 rounded-2xl bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Continue Shopping</span>
                </button>

                <button
                  onClick={() => {
                    if (typeof window !== 'undefined' && window.history.state?.modal === 'cart_drawer') {
                      window.history.back();
                    }
                    onClose();
                    if (onProceedToCheckout) {
                      onProceedToCheckout();
                    }
                  }}
                  className="flex-1 py-3.5 rounded-2xl bg-black hover:bg-slate-800 text-white font-black text-xs uppercase tracking-wider transition-all shadow-md flex items-center justify-center gap-2"
                >
                  <span>Proceed to Checkout</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
