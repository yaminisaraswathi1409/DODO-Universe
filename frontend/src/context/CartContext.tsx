'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

export interface CartItem {
  id: string;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  icon?: string;
  title: string;
  description?: string;
  quantity: number;
  quantityUnit?: string;
  unitPrice: number;
  totalPrice: number;
  dynamicFields: Record<string, any>;
  addressText?: string;
  lat?: number;
  lng?: number;
  addedAt: string;
}

interface CartContextType {
  cartItems: CartItem[];
  addToCart: (item: Omit<CartItem, 'id' | 'addedAt'>) => void;
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
}

const CartContext = createContext<CartContextType | undefined>(undefined);

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);

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

  const addToCart = (newItem: Omit<CartItem, 'id' | 'addedAt'>) => {
    const item: CartItem = {
      ...newItem,
      id: `cart_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      addedAt: new Date().toISOString(),
    };
    const updated = [...cartItems, item];
    saveCart(updated);
    setIsCartOpen(true);
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
  const taxAmount = Math.round(cartSubtotal * 0.18);
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
      }}
    >
      {children}
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
