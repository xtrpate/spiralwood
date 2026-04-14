/**
 * src/pages/customer/customcartcontext.jsx
 * Compatibility wrapper over the unified CartContext
 * Keeps old custom-cart pages working while the cart state is already unified.
 */
import { createContext, useContext, useMemo } from "react";
import { useCart } from "./cartcontext";

const CustomCartContext = createContext(null);

export function CustomCartProvider({ children }) {
  const {
    cart,
    setCartState,
    customCart,
    customCartCount,
    addToCart,
    removeItem,
    removeMany,
  } = useCart();

  const addToCustomCart = (item) => {
    if (!item) return;

    addToCart({
      ...item,
      cart_type: "blueprint",
      item_type: "blueprint",
    });
  };

  const removeFromCustomCart = (key) => {
    removeItem(key);
  };

  const removeManyFromCustomCart = (keys = []) => {
    removeMany(keys);
  };

  const clearCustomCart = () => {
    setCartState((prev) =>
      (Array.isArray(prev) ? prev : []).filter(
        (item) => item.cart_type !== "blueprint",
      ),
    );

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

      const safeCustom = (Array.isArray(resolvedCustom) ? resolvedCustom : []).map(
        (item) => ({
          ...item,
          cart_type: "blueprint",
          item_type: "blueprint",
        }),
      );

      return [...currentStandard, ...safeCustom];
    });
  };

  const value = useMemo(
    () => ({
      customCart,
      setCustomCart,
      customCartCount,
      addToCustomCart,
      removeFromCustomCart,
      removeManyFromCustomCart,
      clearCustomCart,
    }),
    [customCart, customCartCount],
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