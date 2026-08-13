import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const CartContext = createContext(null);
const STORAGE_KEY = 'mzansishop_cart_v1';

const loadCart = () => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    return [];
  }
};

export function CartProvider({ children }) {
  const [items, setItems] = useState(loadCart);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (error) {
      // Ignore storage errors
    }
  }, [items]);

  const buildVariationKey = (selectedVariations) => {
    if (!selectedVariations || typeof selectedVariations !== 'object') return '';
    const entries = Object.entries(selectedVariations)
      .filter(([, value]) => value !== undefined && value !== null && value !== '');
    if (entries.length === 0) return '';
    entries.sort(([a], [b]) => a.localeCompare(b));
    return entries.map(([key, value]) => `${key}:${value}`).join('|');
  };

  const addToCart = (product, quantity = 1) => {
    const tenantId = product.tenantId || product.storeId || '';
    const variationKey = product.variationId || buildVariationKey(product.selectedVariations);
    const cartKey = `${tenantId || 'store'}_${product.id}${variationKey ? `_${variationKey}` : ''}`;
    setItems((prev) => {
      const existing = prev.find((item) => item.cartKey === cartKey);
      if (existing) {
        return prev.map((item) =>
          item.cartKey === cartKey ? { ...item, quantity: item.quantity + quantity } : item
        );
      }
      return [
        ...prev,
        {
          ...product,
          tenantId,
          cartKey,
          quantity
        }
      ];
    });
  };

  const removeFromCart = (cartKey) => {
    setItems((prev) => prev.filter((item) => item.cartKey !== cartKey));
  };

  const updateQuantity = (cartKey, quantity) => {
    setItems((prev) =>
      prev.map((item) => (item.cartKey === cartKey ? { ...item, quantity } : item))
    );
  };

  const clearCart = () => setItems([]);

  const cartCount = useMemo(() => items.reduce((sum, item) => sum + (item.quantity || 0), 0), [items]);
  const subtotal = useMemo(
    () => items.reduce((sum, item) => sum + (item.price || 0) * (item.quantity || 0), 0),
    [items]
  );
  const vendorIds = useMemo(
    () => Array.from(new Set(items.map((item) => item.tenantId).filter(Boolean))),
    [items]
  );

  const value = {
    items,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    cartCount,
    subtotal,
    vendorIds
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error('useCart must be used within CartProvider');
  }
  return ctx;
}
