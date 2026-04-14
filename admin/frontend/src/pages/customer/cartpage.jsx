/**
 * src/pages/customer/cartpage.jsx
 * Unified cart page
 * Handles both:
 * - standard / ready-made items
 * - blueprint / custom template items
 */
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  ArrowRight,
  ShoppingBag,
  Scissors,
  Package,
  AlertCircle,
} from "lucide-react";
import { buildAssetUrl } from "../../services/api";
import { useCart } from "./cartcontext";
import "./cart.css";

const resolveImageSrc = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (
    raw.startsWith("http://") ||
    raw.startsWith("https://") ||
    raw.startsWith("data:") ||
    raw.startsWith("blob:") ||
    raw.startsWith("/template-previews/") ||
    raw.startsWith("/images/") ||
    raw.startsWith("/assets/")
  ) {
    return raw;
  }

  return buildAssetUrl(raw);
};

const isBlueprintItem = (item = {}) =>
  String(item?.cart_type || item?.item_type || "")
    .trim()
    .toLowerCase() === "blueprint";

const formatPeso = (value) =>
  `₱${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
  })}`;

export default function CartPage() {
  const navigate = useNavigate();
  const { cart, updateQty, removeItem, clearCart } = useCart();

  const [selected, setSelected] = useState(new Set());
  const [checkoutError, setCheckoutError] = useState("");

  useEffect(() => {
    setSelected((prev) => {
      const cartKeys = new Set(cart.map((i) => i.key));
      const next = new Set([...prev].filter((k) => cartKeys.has(k)));

      cart.forEach((i) => {
        if (!prev.has(i.key)) next.add(i.key);
      });

      return next;
    });
  }, [cart]);

  useEffect(() => {
    if (!checkoutError) return;
    const timer = setTimeout(() => setCheckoutError(""), 3500);
    return () => clearTimeout(timer);
  }, [checkoutError]);

  const toggleItem = (key) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const allChecked = cart.length > 0 && selected.size === cart.length;

  const toggleAll = () => {
    if (allChecked) {
      setSelected(new Set());
    } else {
      setSelected(new Set(cart.map((i) => i.key)));
    }
  };

  const selectedItems = useMemo(
    () => cart.filter((i) => selected.has(i.key)),
    [cart, selected],
  );

  const selectedLineCount = selectedItems.length;
  const selectedUnits = selectedItems.reduce(
    (sum, item) => sum + Math.max(1, Number(item.quantity || 1)),
    0,
  );

  const selectedPricedSubtotal = selectedItems.reduce((sum, item) => {
    if (isBlueprintItem(item)) return sum;
    return sum + Number(item.unit_price || 0) * Number(item.quantity || 0);
  }, 0);

  const hasBlueprintSelected = selectedItems.some((item) => isBlueprintItem(item));
  const hasStandardSelected = selectedItems.some((item) => !isBlueprintItem(item));

  const isMixedSelection = hasBlueprintSelected && hasStandardSelected;

  const mixedSelectionMessage =
    "Your selection contains ready-made and custom items. Please check out them separately.";

  const checkoutButtonLabel = isMixedSelection
    ? "Select One Order Type"
    : hasBlueprintSelected
      ? "Proceed to Custom Checkout"
      : "Proceed to Checkout";

  const checkoutButtonDisabled = selected.size === 0 || isMixedSelection;

  const handleCheckout = () => {
    if (!selectedItems.length) return;

    setCheckoutError("");

    if (isMixedSelection) {
      setCheckoutError(mixedSelectionMessage);
      return;
    }

    if (hasBlueprintSelected) {
      const blueprintKeys = selectedItems.map((item) => item.key);
      sessionStorage.setItem(
        "cust_selected_custom_checkout",
        JSON.stringify(blueprintKeys),
      );
      navigate("/custom-checkout");
      return;
    }

    const standardKeys = selectedItems.map((item) => item.key);
    sessionStorage.setItem("cust_selected_keys", JSON.stringify(standardKeys));
    navigate("/checkout");
  };

  return (
    <div>
      <div className="page-hero">
        <h1>Shopping Cart</h1>
        <p>Review your items before proceeding to checkout</p>
      </div>

      {cart.length === 0 ? (
        <div className="cart-items-panel">
          <div className="cart-empty">
            <div className="cart-empty-icon">🛒</div>
            <h3>Your cart is empty</h3>
            <p>
              Browse ready-made products or customize a furniture template to add
              items here.
            </p>

            <div
              style={{
                display: "flex",
                gap: 12,
                justifyContent: "center",
                flexWrap: "wrap",
              }}
            >
              <button
                className="btn btn-primary"
                onClick={() => navigate("/catalog")}
              >
                <ShoppingBag size={16} /> Browse Products
              </button>

              <button
                className="btn btn-secondary"
                onClick={() => navigate("/customize")}
              >
                <Scissors size={16} /> Go to Customize
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="cart-layout">
          <div className="cart-items-panel">
            <div className="cart-panel-header">
              <h2>
                <ShoppingCart
                  size={18}
                  style={{
                    display: "inline",
                    marginRight: 8,
                    verticalAlign: "middle",
                  }}
                />
                Cart Items
              </h2>

              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <span>
                  {cart.length} line{cart.length !== 1 ? "s" : ""}
                </span>
                <button className="cart-clear-btn" onClick={clearCart}>
                  Clear all
                </button>
              </div>
            </div>

            <div className="cart-select-all-row">
              <label className="cart-select-all-label">
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={toggleAll}
                />
                <span>Select All</span>
              </label>
            </div>

            {cart.map((item) => {
              const isChecked = selected.has(item.key);
              const blueprint = isBlueprintItem(item);
              const imageSrc = resolveImageSrc(
                item.image_url || item.preview_image_url,
              );

              return (
                <div
                  key={item.key}
                  className={`cart-item-row ${
                    isChecked ? "cart-item-selected" : "cart-item-dimmed"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="cart-item-checkbox"
                    checked={isChecked}
                    onChange={() => toggleItem(item.key)}
                  />

                  <div className="cart-item-img">
                    {imageSrc ? (
                      <img
                        src={imageSrc}
                        alt={item.product_name}
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          borderRadius: 8,
                          filter:
                            item.stock_status === "out_of_stock"
                              ? "grayscale(100%)"
                              : "none",
                        }}
                        onError={(e) => {
                          e.target.style.display = "none";
                          if (e.target.nextSibling) {
                            e.target.nextSibling.style.display = "block";
                          }
                        }}
                      />
                    ) : null}

                    <span style={{ display: imageSrc ? "none" : "block" }}>
                      {blueprint ? "📐" : "🪵"}
                    </span>
                  </div>

                  <div className="cart-item-info">
                    <div className="cart-item-name">
                      {item.base_blueprint_title || item.product_name}
                    </div>

                    {item.wood_type && (
                      <div className="cart-item-meta">{item.wood_type}</div>
                    )}

                    <div
                      className="cart-item-meta"
                      style={{
                        color: blueprint ? "#8B4513" : "#475569",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                      }}
                    >
                      {blueprint ? (
                        <>
                          <Scissors size={14} />
                          Custom / Blueprint Request
                        </>
                      ) : (
                        <>
                          <Package size={14} />
                          Ready-Made Product
                        </>
                      )}
                    </div>

                    <div className="cart-item-unit-price">
                      {blueprint
                        ? "Price to be quoted"
                        : formatPeso(item.unit_price) + " each"}
                    </div>
                  </div>

                  <div className="cart-item-controls">
                    <button
                      className="cart-qty-btn"
                      onClick={() => updateQty(item.key, -1)}
                    >
                      <Minus size={13} />
                    </button>

                    <span className="cart-qty-val">{item.quantity}</span>

                    <button
                      className="cart-qty-btn"
                      onClick={() => updateQty(item.key, 1)}
                    >
                      <Plus size={13} />
                    </button>
                  </div>

                  <div className="cart-item-subtotal">
                    {blueprint ? (
                      <span style={{ fontSize: 12, color: "#aaa" }}>TBD</span>
                    ) : (
                      formatPeso(Number(item.unit_price || 0) * Number(item.quantity || 0))
                    )}
                  </div>

                  <button
                    className="cart-item-remove"
                    onClick={() => removeItem(item.key)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              );
            })}

            {selected.size > 0 && selected.size < cart.length && (
              <div className="cart-selection-bar">
                {selected.size} of {cart.length} line
                {cart.length !== 1 ? "s" : ""} selected for checkout
              </div>
            )}
          </div>

          <div className="order-summary-panel">
            <div className="summary-header">
              <h2>Order Summary</h2>
            </div>

            <div className="summary-body">
              <div className="summary-row">
                <span>
                  Selected ({selectedLineCount} line
                  {selectedLineCount !== 1 ? "s" : ""} • {selectedUnits} unit
                  {selectedUnits !== 1 ? "s" : ""})
                </span>
                <span>{formatPeso(selectedPricedSubtotal)}</span>
              </div>

              <div className="summary-row">
                <span>Shipping</span>
                <span style={{ color: "#2e7d32", fontWeight: 700 }}>
                  Calculated at checkout
                </span>
              </div>

              <hr className="summary-divider" />

              <div className="summary-total">
                <span>Total</span>
                <span>{formatPeso(selectedPricedSubtotal)}</span>
              </div>

              <p className="summary-note">
                Ready-made items use standard checkout. Custom / blueprint items
                continue to quotation-based checkout.
              </p>

              {selected.size === 0 && (
                <p className="cart-no-selection-note">
                  ☝️ Select at least one item to proceed
                </p>
              )}

              {(isMixedSelection || checkoutError) && (
                <div
                  style={{
                    marginBottom: 14,
                    borderRadius: 12,
                    padding: "12px 14px",
                    background: "#fff7ed",
                    border: "1px solid #fdba74",
                    color: "#9a3412",
                    fontSize: 13,
                    fontWeight: 600,
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                  }}
                >
                  <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>{isMixedSelection ? mixedSelectionMessage : checkoutError}</span>
                </div>
              )}

              <button
                className="checkout-btn"
                onClick={handleCheckout}
                disabled={checkoutButtonDisabled}
                title={isMixedSelection ? "Select only one order type to continue." : ""}
              >
                {checkoutButtonLabel} <ArrowRight size={16} />
              </button>

              <button
                className="continue-shopping"
                onClick={() => navigate("/catalog")}
              >
                ← Continue Shopping
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}