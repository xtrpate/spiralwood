/**
 * src/pages/customer/cartcontext.jsx
 * Unified customer cart state
 * Handles both:
 * - standard / ready-made items
 * - blueprint / custom template items
 */
import { createContext, useContext, useEffect, useMemo, useState } from "react";

const CartContext = createContext(null);

const STORAGE_KEY = "cust_cart";
const LEGACY_CUSTOM_STORAGE_KEY = "cust_custom_cart";

const toPositiveInt = (value, fallback = 1) => {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const toMoney = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const normalizeCartType = (item = {}) => {
  const rawType = String(item?.cart_type || item?.item_type || "")
    .trim()
    .toLowerCase();

  if (["blueprint", "custom", "template"].includes(rawType)) {
    return "blueprint";
  }

  if (
    item?.blueprint_id ||
    item?.template_profile ||
    item?.template_category ||
    item?.customization_snapshot ||
    item?.editor_snapshot ||
    item?.base_blueprint_title
  ) {
    return "blueprint";
  }

  return "standard";
};

const normalizeCartItem = (item = {}) => {
  const key = String(item?.key || "").trim();
  if (!key) return null;

  const cartType = normalizeCartType(item);
  const maxStockRaw = Number(item?.max_stock);
  const maxStock =
    Number.isFinite(maxStockRaw) && maxStockRaw > 0 ? maxStockRaw : null;

  return {
    ...item,
    key,
    cart_type: cartType,
    item_type: cartType === "blueprint" ? "blueprint" : "standard",
    quantity: toPositiveInt(item?.quantity, 1),
    unit_price: toMoney(item?.unit_price, 0),
    production_cost: toMoney(item?.production_cost, 0),
    max_stock: maxStock,
    product_name:
      String(
        item?.product_name ||
          item?.name ||
          item?.title ||
          item?.base_blueprint_title ||
          "Item",
      ).trim() || "Item",
  };
};

const mergeLineItem = (existing, incoming) => {
  const base = normalizeCartItem(existing);
  const next = normalizeCartItem(incoming);

  if (!base || !next) return base || next || null;

  const mergedType = next.cart_type || base.cart_type || "standard";
  const mergedMaxStock =
    Number.isFinite(Number(next.max_stock)) && Number(next.max_stock) > 0
      ? Number(next.max_stock)
      : Number.isFinite(Number(base.max_stock)) && Number(base.max_stock) > 0
        ? Number(base.max_stock)
        : null;

  const currentQty = toPositiveInt(base.quantity, 1);
  const incomingQty = toPositiveInt(next.quantity, 1);

  let mergedQty = currentQty + incomingQty;

  if (mergedType === "standard" && mergedMaxStock) {
    mergedQty = Math.min(mergedQty, mergedMaxStock);
  }

  return normalizeCartItem({
    ...base,
    ...next,
    cart_type: mergedType,
    item_type: mergedType === "blueprint" ? "blueprint" : "standard",
    max_stock: mergedMaxStock,
    quantity: mergedQty,
  });
};

const parseStoredArray = (raw) => {
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const buildInitialCart = () => {
  try {
    const mainCart = parseStoredArray(localStorage.getItem(STORAGE_KEY));

    return mainCart
      .map(normalizeCartItem)
      .filter(Boolean);
  } catch {
    return [];
  }
};

export function CartProvider({ children }) {
  const [cart, setCart] = useState(buildInitialCart);

  useEffect(() => {
  try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));

      const customOnly = cart.filter((item) => item.cart_type === "blueprint");
      sessionStorage.setItem(
        LEGACY_CUSTOM_STORAGE_KEY,
        JSON.stringify(customOnly),
      );
    } catch (error) {
      console.error("[cart] failed to persist unified cart", error);
    }
  }, [cart]);

  const addToCart = (item) => {
    const normalized = normalizeCartItem(item);
    if (!normalized) return;

    setCart((prev) => {
      const existing = prev.find((entry) => entry.key === normalized.key);

      if (!existing) {
        return [...prev, normalized];
      }

      return prev.map((entry) =>
        entry.key === normalized.key
          ? mergeLineItem(entry, normalized)
          : entry,
      );
    });
  };

  const updateQty = (key, delta) => {
    const cleanKey = String(key || "").trim();
    if (!cleanKey) return;

    setCart((prev) =>
      prev
        .map((item) => {
          if (item.key !== cleanKey) return item;

          const currentQty = toPositiveInt(item.quantity, 1);
          const nextQty = currentQty + Number(delta || 0);

          if (nextQty <= 0) return null;

          if (
            item.cart_type === "standard" &&
            item.max_stock &&
            nextQty > item.max_stock
          ) {
            return item;
          }

          return {
            ...item,
            quantity: nextQty,
          };
        })
        .filter(Boolean),
    );
  };

  const removeItem = (key) => {
    const cleanKey = String(key || "").trim();
    if (!cleanKey) return;

    setCart((prev) => prev.filter((item) => item.key !== cleanKey));
  };

  const removeMany = (keys = []) => {
    const keySet = new Set(
      (Array.isArray(keys) ? keys : [])
        .map((key) => String(key || "").trim())
        .filter(Boolean),
    );

    if (!keySet.size) return;

    setCart((prev) => prev.filter((item) => !keySet.has(item.key)));
  };

  const clearCart = () => {
    setCart([]);
    try {
      localStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(LEGACY_CUSTOM_STORAGE_KEY);
      sessionStorage.removeItem("cust_selected_keys");
      sessionStorage.removeItem("cust_selected_custom_checkout");
    } catch {
      // ignore storage errors
    }
  };

  const standardCart = useMemo(
    () => cart.filter((item) => item.cart_type === "standard"),
    [cart],
  );

  const customCart = useMemo(
    () => cart.filter((item) => item.cart_type === "blueprint"),
    [cart],
  );

  const cartCount = useMemo(
    () =>
      cart.reduce((sum, item) => sum + toPositiveInt(item.quantity, 1), 0),
    [cart],
  );

  const customCartCount = useMemo(
    () =>
      customCart.reduce(
        (sum, item) => sum + toPositiveInt(item.quantity, 1),
        0,
      ),
    [customCart],
  );

  const cartTotal = useMemo(
    () =>
      cart.reduce(
        (sum, item) =>
          sum + toMoney(item.unit_price, 0) * toPositiveInt(item.quantity, 1),
        0,
      ),
    [cart],
  );

  const value = useMemo(
    () => ({
      cart,
      setCartState: setCart,

      standardCart,
      customCart,

      cartCount,
      customCartCount,
      cartTotal,

      addToCart,
      updateQty,
      removeItem,
      removeMany,
      clearCart,
    }),
    [cart, standardCart, customCart, cartCount, customCartCount, cartTotal],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export const useCart = () => {
  const context = useContext(CartContext);

  if (!context) {
    throw new Error("useCart must be used inside CartProvider");
  }

  return context;
};