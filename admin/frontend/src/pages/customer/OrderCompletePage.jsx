import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Check, ShoppingBag } from "lucide-react";
import "./cart.css";

const CONFIRMATION_KEY = "wisdom_last_order_confirmation";

const formatPeso = (value) =>
  `₱${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatDateTime = (value) => {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const formatPaymentMethod = (value) => {
  const method = String(value || "").trim().toLowerCase();

  if (method === "cod") return "Cash on Delivery";
  if (method === "cop") return "Cash on Pick-up";
  if (method === "gcash") return "GCash";
  if (method === "bank_transfer") return "Bank Transfer";
  if (method === "paymongo") return "Online Payment";

  return "";
};

const displayOrderNumber = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  return raw.startsWith("#") ? raw : `#${raw}`;
};

export default function OrderCompletePage() {
  const navigate = useNavigate();
  const [confirmation, setConfirmation] = useState(null);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });

    try {
      const raw = sessionStorage.getItem(CONFIRMATION_KEY);
      const parsed = raw ? JSON.parse(raw) : null;

      if (parsed && typeof parsed === "object") {
        setConfirmation(parsed);
      }
    } catch {
      setConfirmation(null);
    }
  }, []);

  const items = Array.isArray(confirmation?.items)
    ? confirmation.items
    : [];

  const orderNumber = displayOrderNumber(confirmation?.order_number);
  const placedAt = formatDateTime(confirmation?.placed_at);
  const paymentMethod = formatPaymentMethod(confirmation?.payment_method);

  const leaveConfirmation = (path) => {
    try {
      sessionStorage.removeItem(CONFIRMATION_KEY);
    } catch {
      // Navigation should still work even if browser storage is unavailable.
    }

    navigate(path);
  };

  return (
    <div className="fm-cart-shell order-complete-page">
      <div className="fm-cart-progress order-complete-progress">
        <div className="fm-cart-step">
          <span className="fm-cart-step-num">1</span>
          <span>Shopping Cart</span>
        </div>

        <ChevronRight size={16} className="fm-cart-progress-arrow" />

        <div className="fm-cart-step">
          <span className="fm-cart-step-num">2</span>
          <span>Checkout Details</span>
        </div>

        <ChevronRight size={16} className="fm-cart-progress-arrow" />

        <div className="fm-cart-step active">
          <span className="fm-cart-step-num">3</span>
          <span>Order Complete</span>
        </div>
      </div>

      <section className="order-complete-content">
        <div className="order-complete-success-icon" aria-hidden="true">
          <Check size={34} strokeWidth={2.2} />
        </div>

        <h1>Thank you for your purchase</h1>

        <p className="order-complete-lead">
          Your order has been placed successfully. We&apos;ll notify you when
          its status changes.
        </p>

        {orderNumber ? (
          <p className="order-complete-number">
            Order number <strong>{orderNumber}</strong>
          </p>
        ) : null}

        {confirmation ? (
          <div className="order-complete-summary-card">
            <div className="order-complete-summary-header">
              <h2>Order Summary</h2>
            </div>

            <div className="order-complete-meta">
              {orderNumber ? (
                <div className="order-complete-meta-row">
                  <span>Order Number</span>
                  <strong>{orderNumber}</strong>
                </div>
              ) : null}

              {confirmation?.customer_name ? (
                <div className="order-complete-meta-row">
                  <span>Customer</span>
                  <strong>{confirmation.customer_name}</strong>
                </div>
              ) : null}

              {placedAt ? (
                <div className="order-complete-meta-row">
                  <span>Date &amp; Time</span>
                  <strong>{placedAt}</strong>
                </div>
              ) : null}

              {paymentMethod ? (
                <div className="order-complete-meta-row">
                  <span>Payment</span>
                  <strong>{paymentMethod}</strong>
                </div>
              ) : null}
            </div>

            {items.length ? (
              <div className="order-complete-items">
                {items.map((item, index) => (
                  <div
                    key={`${item.product_name || "product"}-${index}`}
                    className="order-complete-item"
                  >
                    <div className="order-complete-item-image">
                      {item.image_src ? (
                        <img
                          src={item.image_src}
                          alt={item.product_name || "Product"}
                          onError={(event) => {
                            event.currentTarget.style.display = "none";
                          }}
                        />
                      ) : (
                        <span aria-hidden="true">🪵</span>
                      )}
                    </div>

                    <div className="order-complete-item-copy">
                      <div className="order-complete-item-name">
                        {item.product_name || "Product"}
                      </div>
                      <div className="order-complete-item-qty">
                        Qty {Math.max(1, Number(item.quantity || 1))}
                      </div>
                    </div>

                    <div className="order-complete-item-price">
                      {formatPeso(
                        Number(item.unit_price || 0) *
                          Math.max(1, Number(item.quantity || 1)),
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            <div className="order-complete-totals">
              <div className="order-complete-total-row">
                <span>Subtotal</span>
                <span>{formatPeso(confirmation?.subtotal)}</span>
              </div>

              <div className="order-complete-total-row">
                <span>Shipping</span>
                <span>Free</span>
              </div>

              <div className="order-complete-total-row final">
                <strong>Total</strong>
                <strong>{formatPeso(confirmation?.total)}</strong>
              </div>
            </div>
          </div>
        ) : (
          <div className="order-complete-simple-note">
            You can review your order details anytime from My Orders.
          </div>
        )}

        <div className="order-complete-actions">
          <button
            type="button"
            className="order-complete-secondary"
            onClick={() => leaveConfirmation("/orders")}
          >
            View My Orders
          </button>

          <button
            type="button"
            className="order-complete-primary"
            onClick={() => leaveConfirmation("/catalog")}
          >
            <ShoppingBag size={16} />
            Continue Shopping
          </button>
        </div>
      </section>
    </div>
  );
}
