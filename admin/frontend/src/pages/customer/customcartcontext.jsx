/**
 * src/pages/customer/customcartcontext.jsx
 * Compatibility wrapper over the unified CartContext
 * Keeps old custom-cart pages working while the cart state is already unified.
 */
import { createContext, useContext, useMemo } from "react";
import { useCart } from "./cartcontext";
import useAuthStore from "../../store/authStore";

const CustomCartContext = createContext(null);

export function CustomCartProvider({ children }) {
  const {
    cart,
    setCartState,
    customCart,
    customCartCount,
    addToCart,
    updateQty,
    removeItem,
    removeMany,
  } = useCart();

  const addToCustomCart = (item) => {
    if (!item) return { ok: false, reason: "INVALID_ITEM" };

    const requestedQuantity = Number(item?.quantity);
    const quantity =
      Number.isSafeInteger(requestedQuantity) && requestedQuantity > 0
        ? requestedQuantity
        : 1;

    addToCart({
      ...item,
      quantity,
      cart_type: "blueprint",
      item_type: "blueprint",
    });

    return { ok: true };
  };

  const updateCustomQty = (key, delta) => {
    updateQty(key, delta);
  };

  const removeFromCustomCart = (key) => {
    removeItem(key);
  };

  const removeManyFromCustomCart = (keys = []) => {
    removeMany(keys);
  };

  const clearCustomCart = () => {
    const customKeys = (Array.isArray(customCart) ? customCart : [])
      .map((item) => item?.key)
      .filter(Boolean);

    removeMany(customKeys);

    try {
      sessionStorage.removeItem("cust_custom_cart");
      sessionStorage.removeItem("cust_selected_custom_checkout");
    } catch {
      // ignore storage errors
    }
  };

  const setCustomCart = (nextValue) => {
    setCartState((prev) => {
      const currentAll = Array.isArray(prev) ? prev : [];
      const currentStandard = currentAll.filter(
        (item) => item.cart_type !== "blueprint",
      );
      const currentCustom = currentAll.filter(
        (item) => item.cart_type === "blueprint",
      );

      const resolvedCustom =
        typeof nextValue === "function" ? nextValue(currentCustom) : nextValue;

      const safeCustom = (
        Array.isArray(resolvedCustom) ? resolvedCustom : []
      ).map((item) => {
        const requestedQuantity = Number(item?.quantity);
        const quantity =
          Number.isSafeInteger(requestedQuantity) && requestedQuantity > 0
            ? requestedQuantity
            : 1;

        return {
          ...item,
          quantity,
          cart_type: "blueprint",
          item_type: "blueprint",
        };
      });

      return [...currentStandard, ...safeCustom];
    });
  };

  const value = useMemo(
    () => ({
      customCart,
      setCustomCart,
      customCartCount,
      addToCustomCart,
      updateCustomQty,
      removeFromCustomCart,
      removeManyFromCustomCart,
      clearCustomCart,
    }),
    [customCart, customCartCount, updateQty],
  );

  return (
    <CustomCartContext.Provider value={value}>
      {children}
    </CustomCartContext.Provider>
  );
}

export function useCustomCart() {
  const context = useContext(CustomCartContext);

  if (!context) {
    throw new Error("useCustomCart must be used inside CustomCartProvider");
  }

  return context;
}
