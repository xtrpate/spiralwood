import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Scissors } from "lucide-react";
import { useCustomCart } from "./customcartcontext";
import { buildAssetUrl } from "../../services/api";
import api from "../../services/api";
import "./customizepage.css";
import useAuthStore from "../../store/authStore";

const PAYMENT_METHODS = [
  {
    value: "cod",
    icon: "💵",
    label: "Cash on Delivery",
    desc: "Preferred only — final payment flow depends on admin quotation",
  },
  {
    value: "cop",
    icon: "🏪",
    label: "Cash on Pick-up",
    desc: "Preferred only — final payment flow depends on admin quotation",
  },
  {
    value: "gcash",
    icon: "📱",
    label: "GCash",
    desc: "Preferred only — actual payment will be requested after estimate approval",
  },
  {
    value: "bank_transfer",
    icon: "🏦",
    label: "Bank Transfer",
    desc: "Preferred only — actual payment will be requested after estimate approval",
  },
];

const formatTemplateLabel = (item = {}) => {
  if (item?.template_profile) {
    return `${String(item.template_profile)
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase())} Template`;
  }

  if (item?.template_category) {
    return String(item.template_category).trim();
  }

  return "Admin Blueprint";
};

const resolveCartImageSrc = (src) => {
  const raw = String(src || "").trim();
  if (!raw) return "";

  if (
    raw.startsWith("/template-previews/") ||
    raw.startsWith("/images/") ||
    raw.startsWith("/assets/")
  ) {
    return raw;
  }

  return buildAssetUrl(raw);
};

const getItemDisplayDims = (item = {}) => {
  const components = Array.isArray(item?.editor_snapshot?.components)
    ? item.editor_snapshot.components
    : [];

  if (!components.length) {
    return {
      width: Number(item.width) || 0,
      height: Number(item.height) || 0,
      depth: Number(item.depth) || 0,
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  components.forEach((comp) => {
    const x = Number(comp?.x) || 0;
    const y = Number(comp?.y) || 0;
    const z = Number(comp?.z) || 0;
    const w = Math.max(0, Number(comp?.width) || 0);
    const h = Math.max(0, Number(comp?.height) || 0);
    const d = Math.max(0, Number(comp?.depth) || 0);

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);

    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
    maxZ = Math.max(maxZ, z + d);
  });

  const width = Math.round(maxX - minX) || Number(item.width) || 0;
  const height = Math.round(maxY - minY) || Number(item.height) || 0;
  const depth = Math.round(maxZ - minZ) || Number(item.depth) || 0;

  return { width, height, depth };
};

export default function CustomCheckoutPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { customCart, removeManyFromCustomCart } = useCustomCart();

  const [checkoutItems, setCheckoutItems] = useState([]);
  const [selectionReady, setSelectionReady] = useState(false);

  const [form, setForm] = useState({
    name: user?.name || "",
    phone: user?.phone || "",
    delivery_address: user?.address || "",
    payment_method: "",
    notes: "",
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      name: user?.name || prev.name || "",
      phone: user?.phone || prev.phone || "",
      delivery_address: user?.address || prev.delivery_address || "",
    }));
  }, [user]);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("cust_selected_custom_checkout");
      const parsed = raw ? JSON.parse(raw) : [];

      if (!Array.isArray(parsed) || !parsed.length) {
        navigate("/cart");
        return;
      }

      const selectedKeys = parsed
        .map((entry) =>
          typeof entry === "string" ? entry : entry?.key || null,
        )
        .filter(Boolean);

      if (!selectedKeys.length) {
        sessionStorage.removeItem("cust_selected_custom_checkout");
        navigate("/cart");
        return;
      }

      const keySet = new Set(selectedKeys);
      const matchedItems = (customCart || []).filter((item) => keySet.has(item.key));

      if (!matchedItems.length) {
        sessionStorage.removeItem("cust_selected_custom_checkout");
        navigate("/cart");
        return;
      }

      setCheckoutItems(matchedItems);
      setSelectionReady(true);
    } catch {
      sessionStorage.removeItem("cust_selected_custom_checkout");
      navigate("/cart");
    }
  }, [customCart, navigate]);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const totalUnits = useMemo(
    () =>
      checkoutItems.reduce(
        (sum, item) => sum + Math.max(1, Number(item.quantity || 1)),
        0,
      ),
    [checkoutItems],
  );

  const handleSubmit = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    setError("");

    if (!checkoutItems.length) {
      setError("No selected custom items found for checkout.");
      return;
    }

    if (!form.name.trim()) {
      setError("Please enter your full name.");
      return;
    }

    if (!form.phone.trim()) {
      setError("Please enter your phone number.");
      return;
    }

    setLoading(true);

    try {
      const res = await api.post("/customer/custom-orders", {
        items: checkoutItems,
        name: form.name,
        phone: form.phone,
        delivery_address: form.delivery_address,
        payment_method: form.payment_method || "",
        notes: form.notes,
      });

      const submittedKeys = checkoutItems
        .map((item) => item.key)
        .filter(Boolean);

      removeManyFromCustomCart(submittedKeys);
      sessionStorage.removeItem("cust_selected_custom_checkout");

      const nextId = res?.data?.order_id;
      if (nextId) {
        navigate(`/custom-requests/${nextId}`, { replace: true });
        return;
      }

      navigate("/orders", { replace: true });
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.response?.data?.error ||
          "Failed to submit custom request. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  if (!selectionReady) {
    return (
      <div>
        <div className="page-hero">
          <h1>Custom Request Checkout</h1>
          <p>Loading selected custom items…</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div
        className="page-hero"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div>
          <h1>Custom Request Checkout</h1>
          <p>Review your custom items and submit them for admin quotation</p>
        </div>

        <button
          className="btn btn-secondary"
          onClick={() => navigate("/cart")}
        >
          ← Back to Cart
        </button>
      </div>

      <div className="checkout-layout">
        <div className="checkout-form-panel">
          {error && <div className="alert alert-error">{error}</div>}

          <div className="checkout-section">
            <div className="checkout-section-header">
              <div
                className="checkout-section-num"
                style={{
                  background: "linear-gradient(135deg,#2d6a4f,#52b788)",
                  fontSize: 13,
                }}
              >
                ✂️
              </div>
              <h3>Your Custom Items</h3>
              <span style={{ marginLeft: "auto", fontSize: 12, color: "#aaa" }}>
                {checkoutItems.length} design
                {checkoutItems.length !== 1 ? "s" : ""} • {totalUnits} unit
                {totalUnits !== 1 ? "s" : ""}
              </span>
            </div>

            <div className="checkout-items-preview">
              {checkoutItems.map((item) => {
                const dims = getItemDisplayDims(item);

                return (
                  <div key={item.key} className="checkout-item-row">
                    <div className="checkout-item-thumb">
                      {item.image_url || item.preview_image_url ? (
                        <img
                          src={resolveCartImageSrc(
                            item.image_url || item.preview_image_url,
                          )}
                          alt={item.base_blueprint_title || item.product_name}
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            borderRadius: 8,
                          }}
                          onError={(e) => {
                            e.target.style.display = "none";
                            if (e.target.nextSibling) {
                              e.target.nextSibling.style.display = "flex";
                            }
                          }}
                        />
                      ) : null}

                      <div
                        style={{
                          display:
                            item.image_url || item.preview_image_url
                              ? "none"
                              : "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          height: "100%",
                          fontSize: 20,
                        }}
                      >
                        🪵
                      </div>
                    </div>

                    <div className="checkout-item-details">
                      <div className="checkout-item-name">
                        {item.base_blueprint_title || item.product_name}
                      </div>

                      <div
                        style={{
                          fontSize: 12,
                          color: "#64748b",
                          marginTop: 4,
                          fontWeight: 500,
                        }}
                      >
                        {formatTemplateLabel(item)} • Customer-edited draft
                      </div>

                      <div className="custom-cart-specs" style={{ marginTop: 4 }}>
                        {item.wood_type && (
                          <span className="custom-spec-tag">🪵 {item.wood_type}</span>
                        )}

                        {(item.finish_color || item.color) && (
                          <span className="custom-spec-tag">
                            🎨 {item.finish_color || item.color}
                          </span>
                        )}

                        {item.door_style && (
                          <span className="custom-spec-tag">🚪 {item.door_style}</span>
                        )}

                        {item.hardware && (
                          <span className="custom-spec-tag">🔩 {item.hardware}</span>
                        )}

                        {(dims.width || dims.height || dims.depth) && (
                          <span className="custom-spec-tag">
                            📐 W{formatItemValue(dims.width)} H
                            {formatItemValue(dims.height)} D
                            {formatItemValue(dims.depth)} {item.unit || "mm"}
                          </span>
                        )}
                      </div>

                      {item.comments ? (
                        <div className="checkout-item-sub" style={{ marginTop: 4 }}>
                          💬 {item.comments}
                        </div>
                      ) : null}
                    </div>

                    <div className="checkout-item-qty">×{item.quantity || 1}</div>

                    <div
                      className="checkout-item-price"
                      style={{ fontSize: 12, color: "#aaa" }}
                    >
                      Quote Needed
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="checkout-section">
            <div className="checkout-section-header">
              <div className="checkout-section-num">1</div>
              <h3>Contact Information</h3>
            </div>

            <div className="checkout-section-body">
              <div className="form-grid">
                <div className="form-field">
                  <label>Full Name *</label>
                  <input
                    type="text"
                    placeholder="Juan dela Cruz"
                    value={form.name}
                    onChange={(e) => set("name", e.target.value)}
                  />
                </div>

                <div className="form-field">
                  <label>Phone Number *</label>
                  <input
                    type="tel"
                    placeholder="09XXXXXXXXX"
                    value={form.phone}
                    onChange={(e) => set("phone", e.target.value)}
                  />
                </div>

                <div className="form-field full">
                  <label>Project / Delivery Address</label>
                  <input
                    type="text"
                    placeholder="Street, Barangay, City, Province"
                    value={form.delivery_address}
                    onChange={(e) => set("delivery_address", e.target.value)}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="checkout-section">
            <div className="checkout-section-header">
              <div className="checkout-section-num">2</div>
              <h3>Preferred Payment Method</h3>
            </div>

            <div className="checkout-section-body">
              <p style={{ fontSize: 12, color: "#aaa", marginBottom: 14 }}>
                Optional only. No payment is required at this stage. Final
                quotation and payment instructions will be given after admin
                review.
              </p>

              <div className="payment-methods">
                {PAYMENT_METHODS.map((m) => (
                  <div
                    key={m.value}
                    className={`payment-method-card ${
                      form.payment_method === m.value ? "selected" : ""
                    }`}
                    onClick={() => set("payment_method", m.value)}
                  >
                    <div className="payment-method-icon">{m.icon}</div>
                    <div className="payment-method-info">
                      <span className="payment-method-name">{m.label}</span>
                      <span className="payment-method-desc">{m.desc}</span>
                    </div>
                    <div className="payment-method-check" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="checkout-section">
            <div className="checkout-section-header">
              <div className="checkout-section-num">3</div>
              <h3>Additional Notes</h3>
            </div>

            <div className="checkout-section-body">
              <div className="form-field">
                <textarea
                  className="order-notes"
                  rows={3}
                  placeholder="Any other instructions or information for our team…"
                  value={form.notes}
                  onChange={(e) => set("notes", e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="checkout-summary">
          <div className="checkout-summary-header">
            <h3>Custom Request Summary</h3>
          </div>

          <div className="checkout-summary-items">
            {checkoutItems.map((item) => (
              <div key={item.key} className="checkout-summary-item">
                <div>
                  <div className="checkout-summary-item-name">
                    {item.base_blueprint_title || item.product_name}
                  </div>
                  <div className="checkout-summary-item-qty">
                    ×{item.quantity || 1}
                  </div>
                </div>

                <div
                  className="checkout-summary-item-price"
                  style={{ color: "#aaa", fontSize: 11 }}
                >
                  Quote Needed
                </div>
              </div>
            ))}
          </div>

          <div className="checkout-summary-totals">
            <div className="summary-row">
              <span>Total Price</span>
              <span style={{ color: "#D2691E", fontWeight: 700 }}>
                To be quoted by admin
              </span>
            </div>

            <p className="summary-note" style={{ marginTop: 10 }}>
              This will be submitted as a custom request for review, not as a
              final paid order.
            </p>
          </div>

          <button
            className="place-order-btn"
            onClick={handleSubmit}
            disabled={loading || !checkoutItems.length}
          >
            {loading ? (
              "Submitting…"
            ) : (
              <>
                <Scissors size={16} /> Submit Custom Request
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatItemValue(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}