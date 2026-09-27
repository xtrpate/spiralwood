/**
 * src/pages/customer/customcartcontext.jsx
 * Compatibility wrapper over the unified CartContext
 * Keeps old custom-cart pages working while the cart state is already unified.
 */
import { createContext, useCallback, useContext, useMemo } from "react";
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

  const addToCustomCart = useCallback(
    (item) => {
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
    },
    [addToCart],
  );

  const updateCustomQty = useCallback(
    (key, delta) => {
      updateQty(key, delta);
    },
    [updateQty],
  );

  const removeFromCustomCart = useCallback(
    (key) => {
      removeItem(key);
    },
    [removeItem],
  );

  const removeManyFromCustomCart = useCallback(
    (keys = []) => {
      removeMany(keys);
    },
    [removeMany],
  );

  const clearCustomCart = useCallback(() => {
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
  }, [customCart, removeMany]);

  const setCustomCart = useCallback(
    (nextValue) => {
      setCartState((prev) => {
        const currentAll = Array.isArray(prev) ? prev : [];
        const currentStandard = currentAll.filter(
          (item) => item.cart_type !== "blueprint",
        );
        const currentCustom = currentAll.filter(
          (item) => item.cart_type === "blueprint",
        );

        const resolvedCustom =
          typeof nextValue === "function"
            ? nextValue(currentCustom)
            : nextValue;

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
    },
    [setCartState],
  );

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
    [
      customCart,
      setCustomCart,
      customCartCount,
      addToCustomCart,
      updateCustomQty,
      removeFromCustomCart,
      removeManyFromCustomCart,
      clearCustomCart,
    ],
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
