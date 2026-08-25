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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-[#0c1220] border-l border-slate-800 text-slate-100 flex flex-col shadow-2xl">
          {/* Header */}
          <div className="p-5 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/60">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-extrabold text-white">Your Order Cart</h2>
                <span className="text-xs text-slate-400 font-mono">
                  {cartCount} {cartCount === 1 ? 'item' : 'items'} selected
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Cart Item List */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {cartItems.length === 0 ? (
              <div className="text-center py-16 space-y-4">
                <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-slate-500">
                  <ShoppingBag className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Your cart is empty</h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                    Browse platform categories or marketplace listings to add items and customized services.
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs inline-flex items-center gap-2 transition-all"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Browse Marketplace</span>
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-xs text-slate-400">
                  <span>Multi-Service Cart Items ({cartItems.length})</span>
                  <button
                    onClick={clearCart}
                    className="text-rose-400 hover:underline text-[11px] font-semibold flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Clear All</span>
                  </button>
                </div>

                {cartItems.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3 relative group"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] font-bold uppercase">
                          {item.categoryName}
                        </span>
                        <h4 className="text-sm font-bold text-white mt-1">{item.title}</h4>
                      </div>
                      <button
                        onClick={() => removeFromCart(item.id)}
                        className="text-slate-500 hover:text-rose-400 p-1 transition-colors"
                        title="Remove item"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Dynamic Fields Details Pill Grid */}
                    {item.dynamicFields && Object.keys(item.dynamicFields).length > 0 && (
                      <div className="grid grid-cols-2 gap-1.5 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 text-[11px]">
                        {Object.entries(item.dynamicFields).map(([k, v]) => (
                          <div key={k} className="truncate">
                            <span className="text-slate-500 uppercase tracking-wider text-[9px] block">
                              {k.replace(/_/g, ' ')}
                            </span>
                            <span className="text-slate-200 font-medium truncate block font-mono">
                              {String(v)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Quantity & Unit Price Footer with Direct Editable Input */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-800/60">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => updateQuantity(item.id, -1)}
                          className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center font-bold text-xs"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        
                        {/* Direct Editable Quantity Input */}
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => setCartItemQuantity(item.id, parseInt(e.target.value, 10))}
                          className="w-12 py-1 text-center bg-slate-950 border border-slate-800 text-white font-mono text-xs rounded-lg focus:outline-none focus:border-blue-500 font-bold"
                        />

                        <button
                          onClick={() => updateQuantity(item.id, 1)}
                          className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center font-bold text-xs"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="text-right">
                        <span className="text-xs font-bold text-emerald-400 font-mono">
                          ₹{(item.totalPrice || item.unitPrice * item.quantity).toLocaleString()}
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
            <div className="p-5 border-t border-slate-800/80 bg-slate-900/80 space-y-4">
              {/* Itemized Financial Calculation Card */}
              <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2 text-xs">
                <div className="flex items-center justify-between text-slate-400">
                  <span>Items Subtotal</span>
                  <span className="font-mono text-slate-200 font-semibold">
                    ₹{cartSubtotal.toLocaleString()}
                  </span>
                </div>

                <div className="flex items-center justify-between text-slate-400">
                  <span>Platform & PostGIS Matching Fee</span>
                  <span className="font-mono text-slate-200 font-semibold">
                    ₹{platformFee}
                  </span>
                </div>

                <div className="flex items-center justify-between text-slate-400">
                  <span>Estimated GST & Taxes (18%)</span>
                  <span className="font-mono text-slate-200 font-semibold">
                    ₹{taxAmount.toLocaleString()}
                  </span>
                </div>

                <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-sm font-extrabold text-white">
                  <span>Total Amount</span>
                  <span className="text-emerald-400 font-mono">
                    ₹{cartTotal.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Action Buttons: Continue Shopping & Proceed to Checkout */}
              <div className="flex items-center gap-3">
                <button
                  onClick={onClose}
                  className="flex-1 py-3.5 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-all"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Continue Shopping</span>
                </button>

                <button
                  onClick={() => {
                    onClose();
                    if (onProceedToCheckout) {
                      onProceedToCheckout();
                    }
                  }}
                  className="flex-1 py-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 via-teal-600 to-blue-600 hover:opacity-95 text-white font-bold text-xs uppercase tracking-wider transition-all shadow-xl shadow-emerald-600/25 flex items-center justify-center gap-2"
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
