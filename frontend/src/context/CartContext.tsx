'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import CartVendorConflictModal from '@/components/CartVendorConflictModal';

export interface CartItem {
  id: string;
  vendorId?: string;
  vendorName?: string;
  vendorBrandName?: string;
  vendorAvatar?: string;
  vendorPhone?: string;
  catalogItemId?: string;
  vendorAssetId?: string;
  optionId?: string;
  selectedOptionTitle?: string;
  includedServices?: string[];
  selectedAddons?: Array<{ id: string; title: string; price: number }>;
  categoryId?: string;
  categoryName?: string;
  categorySlug?: string;
  icon?: string;
  imageUrl?: string;
  title: string;
  description?: string;
  quantity: number;
  quantityUnit?: string;
  unitPrice: number;
  totalPrice: number;
  selectedDate?: string;
  selectedTime?: string;
  selectedVariant?: {
    id?: string;
    name?: string;
    quantity?: number;
    price?: number;
  };
  additionalChargesConfig?: Record<string, any>;
  dynamicFields?: Record<string, any>;
  addressText?: string;
  lat?: number;
  lng?: number;
  addedAt: string;
}

export interface VendorConflictData {
  newItem: Omit<CartItem, 'id' | 'addedAt'>;
  currentVendorName: string;
  newVendorName: string;
  currentVendorId: string;
  newVendorId: string;
}

interface CartContextType {
  cartItems: CartItem[];
  addToCart: (item: Omit<CartItem, 'id' | 'addedAt'>, forceReplace?: boolean) => void;
  removeFromCart: (id: string) => void;
  updateQuantity: (id: string, delta: number) => void;
  setCartItemQuantity: (id: string, newQty: number) => void;
  clearCart: () => void;
  isCartOpen: boolean;
  setIsCartOpen: (open: boolean) => void;
  cartCount: number;
  cartSubtotal: number;
  platformFee: number;
  taxAmount: number;
  cartTotal: number;
  pendingVendorConflict: VendorConflictData | null;
  resolveVendorConflict: (action: 'REPLACE' | 'CANCEL') => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [pendingVendorConflict, setPendingVendorConflict] = useState<VendorConflictData | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('uop_cart');
      if (stored) {
        try {
          setCartItems(JSON.parse(stored));
        } catch {
          // ignore
        }
      }
    }
  }, []);

  const saveCart = (items: CartItem[]) => {
    setCartItems(items);
    if (typeof window !== 'undefined') {
      localStorage.setItem('uop_cart', JSON.stringify(items));
    }
  };

  const executeAdd = (newItem: Omit<CartItem, 'id' | 'addedAt'>, currentItems: CartItem[]) => {
    const existingIndex = currentItems.findIndex(
      (item) =>
        ((newItem.catalogItemId && item.catalogItemId === newItem.catalogItemId) ||
         (newItem.vendorAssetId && item.vendorAssetId === newItem.vendorAssetId) ||
         (newItem.title && item.title === newItem.title && newItem.vendorId && item.vendorId === newItem.vendorId)) &&
        ((newItem.optionId && item.optionId === newItem.optionId) || (!newItem.optionId && !item.optionId))
    );

    let updated: CartItem[];
    if (existingIndex >= 0) {
      updated = [...currentItems];
      const existing = currentItems[existingIndex];
      const combinedQty = existing.quantity + newItem.quantity;
      updated[existingIndex] = {
        ...newItem,
        id: existing.id,
        quantity: combinedQty,
        totalPrice: combinedQty * newItem.unitPrice,
        addedAt: new Date().toISOString(),
      };
    } else {
      const item: CartItem = {
        ...newItem,
        id: `cart_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        addedAt: new Date().toISOString(),
      };
      updated = [...currentItems, item];
    }
    saveCart(updated);
    setIsCartOpen(true);
  };

  const addToCart = (newItem: Omit<CartItem, 'id' | 'addedAt'>, forceReplace = false) => {
    // Phase 4 Single-Vendor Cart Policy Enforcement:
    // If cart already has items and the new item has a different vendor, prompt user
    if (!forceReplace && cartItems.length > 0 && newItem.vendorId) {
      const currentVendorItem = cartItems.find((it) => it.vendorId && it.vendorId !== newItem.vendorId);
      if (currentVendorItem) {
        setPendingVendorConflict({
          newItem,
          currentVendorName: currentVendorItem.vendorName || currentVendorItem.vendorBrandName || 'Existing Vendor',
          newVendorName: newItem.vendorName || newItem.vendorBrandName || 'New Vendor',
          currentVendorId: currentVendorItem.vendorId || '',
          newVendorId: newItem.vendorId,
        });
        return;
      }
    }

    executeAdd(newItem, cartItems);
  };

  const resolveVendorConflict = (action: 'REPLACE' | 'CANCEL') => {
    if (action === 'REPLACE' && pendingVendorConflict) {
      executeAdd(pendingVendorConflict.newItem, []); // Clears previous vendor items and adds new item
    }
    setPendingVendorConflict(null);
  };

  const removeFromCart = (id: string) => {
    const updated = cartItems.filter((item) => item.id !== id);
    saveCart(updated);
  };

  const updateQuantity = (id: string, delta: number) => {
    const updated = cartItems.map((item) => {
      if (item.id === id) {
        const newQty = Math.max(1, item.quantity + delta);
        return {
          ...item,
          quantity: newQty,
          totalPrice: newQty * item.unitPrice,
        };
      }
      return item;
    });
    saveCart(updated);
  };

  const setCartItemQuantity = (id: string, newQty: number) => {
    const validQty = Math.max(1, isNaN(newQty) ? 1 : newQty);
    const updated = cartItems.map((item) => {
      if (item.id === id) {
        return {
          ...item,
          quantity: validQty,
          totalPrice: validQty * item.unitPrice,
        };
      }
      return item;
    });
    saveCart(updated);
  };

  const clearCart = () => {
    saveCart([]);
  };

  const cartCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);
  const cartSubtotal = cartItems.reduce((acc, item) => acc + (item.totalPrice || item.unitPrice * item.quantity), 0);
  const platformFee = cartItems.length > 0 ? 50 : 0;
  // Tax is determined authoritatively by backend validation based on verified catalog tax attributes (no hardcoded 18% assumption)
  const taxAmount = 0;
  const cartTotal = cartSubtotal + platformFee + taxAmount;

  return (
    <CartContext.Provider
      value={{
        cartItems,
        addToCart,
        removeFromCart,
        updateQuantity,
        setCartItemQuantity,
        clearCart,
        isCartOpen,
        setIsCartOpen,
        cartCount,
        cartSubtotal,
        platformFee,
        taxAmount,
        cartTotal,
        pendingVendorConflict,
        resolveVendorConflict,
      }}
    >
      {children}
      <CartVendorConflictModal />
    </CartContext.Provider>
  );
};

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
}
