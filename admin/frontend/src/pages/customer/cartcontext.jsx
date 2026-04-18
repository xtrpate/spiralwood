import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import api from "../../services/api";
import useAuthStore from "../../store/authStore";

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

  if (["blueprint", "custom", "template"].includes(rawType)) return "blueprint";

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
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const mergeCartCollections = (...collections) => {
  const merged = [];

  collections
    .flat()
    .filter(Boolean)
    .forEach((rawItem) => {
      const item = normalizeCartItem(rawItem);
      if (!item) return;

      const existingIndex = merged.findIndex((entry) => entry.key === item.key);

      if (existingIndex >= 0) {
        merged[existingIndex] = mergeLineItem(merged[existingIndex], item);
      } else {
        merged.push(item);
      }
    });

  return merged;
};

const getInitialCart = () => {
  if (typeof window === "undefined") return [];

  const localCart = parseStoredArray(localStorage.getItem(STORAGE_KEY));
  const legacyCustomCart = parseStoredArray(
    sessionStorage.getItem(LEGACY_CUSTOM_STORAGE_KEY),
  );

  return mergeCartCollections(localCart, legacyCustomCart);
};

export function CartProvider({ children }) {
  const { user } = useAuthStore();
  const isInitialMount = useRef(true);

  // 👉 NEW: A flag to tell the background sync to ignore the next update
  const skipNextSync = useRef(false);

  const [cart, setCart] = useState(getInitialCart);
  const [miniCartOpen, setMiniCartOpen] = useState(false);

  const [cloudLoaded, setCloudLoaded] = useState(false);

  useEffect(() => {
    if (!(user && user.role === "customer")) {
      setCloudLoaded(false);
      return;
    }

    let cancelled = false;

    api
      .get("/customer/cart")
      .then((res) => {
        if (cancelled) return;

        const cloudCart = Array.isArray(res?.data?.cart) ? res.data.cart : [];

        setCart((currentLocalCart) =>
          mergeCartCollections(cloudCart, currentLocalCart),
        );

        // 👉 2. UNLOCK IT ONCE THE SAVED DATA ARRIVES SAFELY
        setCloudLoaded(true);
      })
      .catch((err) => console.error("Failed to fetch cloud cart", err));

    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.role]);

  // BACKGROUND SYNC EFFECT
  useEffect(() => {
    if (typeof window === "undefined") return;

    localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));

    const customOnly = cart.filter((item) => item.cart_type === "blueprint");
    sessionStorage.setItem(
      LEGACY_CUSTOM_STORAGE_KEY,
      JSON.stringify(customOnly),
    );

    if (user && user.role === "customer" && cloudLoaded) {
      if (skipNextSync.current) {
        skipNextSync.current = false;
      } else {
        api.post("/customer/cart/sync", { cart }).catch((err) => {
          console.error("Cloud sync failed", err);
        });
      }
    }

    isInitialMount.current = false;
  }, [cart, user?.id, user?.role, user, cloudLoaded]);
  const addToCart = (item) => {
    const normalized = normalizeCartItem(item);
    if (!normalized) return;

    setCart((prev) => {
      const existing = prev.find((entry) => entry.key === normalized.key);

      if (!existing) return [...prev, normalized];

      return prev.map((entry) =>
        entry.key === normalized.key ? mergeLineItem(entry, normalized) : entry,
      );
    });
  };

  const openMiniCart = () => setMiniCartOpen(true);
  const closeMiniCart = () => setMiniCartOpen(false);
  const toggleMiniCart = () => setMiniCartOpen((prev) => !prev);

  const updateQty = (key, delta) => {
    const cleanKey = String(key || "").trim();
    if (!cleanKey) return;

    setCart((prev) =>
      prev
        .map((item) => {
          if (item.key !== cleanKey) return item;

          const nextQty = toPositiveInt(item.quantity, 1) + Number(delta || 0);

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
    setCart((prev) => prev.filter((item) => item.key !== cleanKey));
  };

  const removeMany = (keys = []) => {
    const keySet = new Set(
      (Array.isArray(keys) ? keys : [])
        .map((k) => String(k || "").trim())
        .filter(Boolean),
    );

    if (!keySet.size) return;

    setCart((prev) => prev.filter((item) => !keySet.has(item.key)));
  };

  const clearCart = (syncToCloud = true) => {
    setMiniCartOpen(false);

    // 👉 NEW: If we are not syncing to the cloud (logout), tell the background effect to ignore the upcoming empty cart!
    if (!syncToCloud) {
      skipNextSync.current = true;
    }

    setCart([]);

    localStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(LEGACY_CUSTOM_STORAGE_KEY);
    sessionStorage.removeItem("cust_selected_keys");
    sessionStorage.removeItem("cust_selected_custom_checkout");

    if (syncToCloud && user && user.role === "customer") {
      api.post("/customer/cart/sync", { cart: [] }).catch((err) => {
        console.error("Cloud clear cart sync failed", err);
      });
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
    () => cart.reduce((sum, item) => sum + toPositiveInt(item.quantity, 1), 0),
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
      setCart,
      miniCartOpen,
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
      openMiniCart,
      closeMiniCart,
      toggleMiniCart,
    }),
    [
      cart,
      miniCartOpen,
      standardCart,
      customCart,
      cartCount,
      customCartCount,
      cartTotal,
    ],
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
