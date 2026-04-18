import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { buildAssetUrl } from "../../services/api";
import { useCart } from "./cartcontext";
import useAuthStore from "../../store/authStore";
import "./customizepage.css";

const PAYMENT_METHODS = [
  {
    value: "cod",
    icon: "💵",
    label: "Cash on Delivery",
    desc: "Pay when the order is delivered.",
  },
  {
    value: "cop",
    icon: "🏪",
    label: "Cash on Pick-up",
    desc: "Pay when the order is picked up.",
  },
  {
    value: "gcash",
    icon: "📱",
    label: "GCash",
    desc: "Upload proof if you already sent payment.",
  },
  {
    value: "bank_transfer",
    icon: "🏦",
    label: "Bank Transfer",
    desc: "Upload proof if you already sent payment.",
  },
  {
    value: "paymongo",
    icon: "💳",
    label: "Pay Online",
    desc: "You will be redirected to PayMongo after placing the order.",
  },
];

const isBlueprintItem = (item = {}) =>
  String(item?.cart_type || item?.item_type || "")
    .trim()
    .toLowerCase() === "blueprint";

const resolveCartImageSrc = (src) => {
  const raw = String(src || "").trim();
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

const formatPeso = (value) =>
  `₱${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default function CheckoutPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { cart, removeMany } = useCart();

  const [checkoutItems, setCheckoutItems] = useState([]);
  const [selectionReady, setSelectionReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [paymentSettings, setPaymentSettings] = useState({});

  const [form, setForm] = useState({
    name: user?.name || "",
    phone: user?.phone || "",
    delivery_address: user?.address || "",
    payment_method: "",
    notes: "",
    proof: null,
  });

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      name: user?.name || prev.name || "",
      phone: user?.phone || prev.phone || "",
      delivery_address: user?.address || prev.delivery_address || "",
    }));
  }, [user]);

  useEffect(() => {
    let active = true;

    api
      .get("/customer/orders/settings")
      .then((res) => {
        if (!active) return;
        setPaymentSettings(res?.data || {});
      })
      .catch(() => {
        if (!active) return;
        setPaymentSettings({});
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("cust_selected_keys");
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
        sessionStorage.removeItem("cust_selected_keys");
        navigate("/cart");
        return;
      }

      const keySet = new Set(selectedKeys);
      const matchedItems = (Array.isArray(cart) ? cart : []).filter(
        (item) => keySet.has(item.key) && !isBlueprintItem(item),
      );

      if (!matchedItems.length) {
        sessionStorage.removeItem("cust_selected_keys");
        navigate("/cart");
        return;
      }

      setCheckoutItems(matchedItems);
      setSelectionReady(true);
    } catch {
      sessionStorage.removeItem("cust_selected_keys");
      navigate("/cart");
    }
  }, [cart, navigate]);

  const setField = (key, value) =>
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));

  const totalUnits = useMemo(
    () =>
      checkoutItems.reduce(
        (sum, item) => sum + Math.max(1, Number(item.quantity || 1)),
        0,
      ),
    [checkoutItems],
  );

  const subtotal = useMemo(
    () =>
      checkoutItems.reduce(
        (sum, item) =>
          sum +
          Number(item.unit_price || 0) * Math.max(1, Number(item.quantity || 1)),
        0,
      ),
    [checkoutItems],
  );

  const total = subtotal;

  const showProofUpload =
    form.payment_method === "gcash" || form.payment_method === "bank_transfer";

  const handleSubmit = async (e) => {
    if (e?.preventDefault) e.preventDefault();
    setError("");

    if (!checkoutItems.length) {
      setError("No selected ready-made items found for checkout.");
      return;
    }

    if (!String(form.name || "").trim()) {
      setError("Please enter your full name.");
      return;
    }

    if (!String(form.phone || "").trim()) {
      setError("Please enter your phone number.");
      return;
    }

    if (!String(form.payment_method || "").trim()) {
      setError("Please select a payment method.");
      return;
    }

    const payloadItems = checkoutItems.map((item) => ({
      key: item.key,
      product_id: item.product_id,
      variation_id: item.variation_id || null,
      product_name: item.product_name,
      quantity: Math.max(1, Number(item.quantity || 1)),
      unit_price: Number(item.unit_price || 0),
    }));

    const formData = new FormData();
    formData.append("items", JSON.stringify(payloadItems));
    formData.append("name", String(form.name || "").trim());
    formData.append("phone", String(form.phone || "").trim());
    formData.append(
      "delivery_address",
      String(form.delivery_address || "").trim(),
    );
    formData.append("payment_method", String(form.payment_method || "").trim());
    formData.append("notes", String(form.notes || "").trim());
    formData.append("subtotal", String(subtotal));
    formData.append("total", String(total));

    if (form.proof) {
      formData.append("proof", form.proof);
    }

    setLoading(true);

    try {
      const res = await api.post("/customer/orders", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const submittedKeys = payloadItems.map((item) => item.key).filter(Boolean);
      removeMany(submittedKeys);
      sessionStorage.removeItem("cust_selected_keys");

      if (res?.data?.payment_url) {
        window.location.assign(res.data.payment_url);
        return;
      }

      navigate("/orders", { replace: true });
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.response?.data?.error ||
          "Failed to place order. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  if (!selectionReady) {
    return (
      <div className="checkout-page">
        <div className="page-hero">
          <h1>Checkout</h1>
          <p>Loading selected ready-made items…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="checkout-page">
      <div
        className="page-hero"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div>
          <h1>Checkout</h1>
          <p>Review your ready-made items and place your order</p>
        </div>

        <button className="btn btn-secondary" onClick={() => navigate("/cart")}>
          ← Back to Cart
        </button>
      </div>

      <div className="checkout-layout">
        <div className="checkout-form-panel">
          {error && <div className="alert alert-error">{error}</div>}

          <div className="checkout-section">
            <div className="checkout-section-header">
              <div className="checkout-section-num">🛒</div>
              <h3>Your Ready-Made Items</h3>
              <span style={{ marginLeft: "auto", fontSize: 12, color: "#111111" }}>
                {checkoutItems.length} item{checkoutItems.length !== 1 ? "s" : ""} •{" "}
                {totalUnits} unit{totalUnits !== 1 ? "s" : ""}
              </span>
            </div>

            <div className="checkout-items-preview">
              {checkoutItems.map((item) => (
                <div key={item.key} className="checkout-item-row">
                  <div className="checkout-item-thumb">
                    {item.image_url || item.preview_image_url ? (
                      <img
                        src={resolveCartImageSrc(
                          item.image_url || item.preview_image_url,
                        )}
                        alt={item.product_name}
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
                    <div className="checkout-item-name">{item.product_name}</div>

                    <div
                      style={{
                        fontSize: 12,
                        color: "#111111",
                        marginTop: 4,
                        fontWeight: 500,
                      }}
                    >
                      Ready-Made Product
                    </div>

                    {item.stock_status ? (
                      <div className="checkout-item-sub" style={{ marginTop: 4 }}>
                        Stock: {item.stock_status}
                      </div>
                    ) : null}
                  </div>

                  <div className="checkout-item-qty">×{item.quantity || 1}</div>

                  <div className="checkout-item-price">
                    {formatPeso(
                      Number(item.unit_price || 0) *
                        Math.max(1, Number(item.quantity || 1)),
                    )}
                  </div>
                </div>
              ))}
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
                    onChange={(e) => setField("name", e.target.value)}
                  />
                </div>

                <div className="form-field">
                  <label>Phone Number *</label>
                  <input
                    type="tel"
                    placeholder="09XXXXXXXXX"
                    value={form.phone}
                    onChange={(e) => setField("phone", e.target.value)}
                  />
                </div>

                <div className="form-field full">
                  <label>Delivery Address</label>
                  <input
                    type="text"
                    placeholder="Street, Barangay, City, Province"
                    value={form.delivery_address}
                    onChange={(e) =>
                      setField("delivery_address", e.target.value)
                    }
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="checkout-section">
            <div className="checkout-section-header">
              <div className="checkout-section-num">2</div>
              <h3>Payment Method</h3>
            </div>

            <div className="checkout-section-body">
              <div className="payment-methods">
                {PAYMENT_METHODS.map((method) => (
                  <div
                    key={method.value}
                    className={`payment-method-card ${
                      form.payment_method === method.value ? "selected" : ""
                    }`}
                    onClick={() => setField("payment_method", method.value)}
                  >
                    <div className="payment-method-icon">{method.icon}</div>

                    <div className="payment-method-info">
                      <span className="payment-method-name">{method.label}</span>
                      <span className="payment-method-desc">{method.desc}</span>
                    </div>

                    <div
                      className={`payment-method-check ${
                        form.payment_method === method.value ? "selected" : ""
                      }`}
                    />
                  </div>
                ))}
              </div>

              {showProofUpload ? (
                <div style={{ marginTop: 16 }}>
                  <div className="form-field">
                    <label>Proof of Payment</label>
                    <input
                      type="file"
                      accept=".jpg,.jpeg,.png,.gif,.pdf"
                      onChange={(e) =>
                        setField("proof", e.target.files?.[0] || null)
                      }
                    />
                  </div>

                  {(paymentSettings.gcash_number ||
                    paymentSettings.bank_account_name ||
                    paymentSettings.bank_account_number) && (
                    <div
                      style={{
                        marginTop: 12,
                        padding: 12,
                        borderRadius: 12,
                        border: "1px solid #e5e7eb",
                        background: "#f8fafc",
                        fontSize: 13,
                        color: "#334155",
                      }}
                    >
                      {form.payment_method === "gcash" &&
                        paymentSettings.gcash_number && (
                          <div>
                            <strong>GCash Number:</strong>{" "}
                            {paymentSettings.gcash_number}
                          </div>
                        )}

                      {form.payment_method === "bank_transfer" && (
                        <>
                          {paymentSettings.bank_account_name && (
                            <div>
                              <strong>Bank Account Name:</strong>{" "}
                              {paymentSettings.bank_account_name}
                            </div>
                          )}
                          {paymentSettings.bank_account_number && (
                            <div>
                              <strong>Bank Account Number:</strong>{" "}
                              {paymentSettings.bank_account_number}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              ) : null}
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
                  placeholder="Any other instructions for your order…"
                  value={form.notes}
                  onChange={(e) => setField("notes", e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="checkout-summary">
          <div className="checkout-summary-header">
            <h3>Order Summary</h3>
          </div>

          <div className="checkout-summary-items">
            {checkoutItems.map((item) => (
              <div key={item.key} className="checkout-summary-item">
                <div>
                  <div className="checkout-summary-item-name">
                    {item.product_name}
                  </div>
                  <div className="checkout-summary-item-qty">
                    ×{item.quantity || 1}
                  </div>
                </div>

                <div className="checkout-summary-item-price">
                  {formatPeso(
                    Number(item.unit_price || 0) *
                      Math.max(1, Number(item.quantity || 1)),
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="checkout-summary-totals">
            <div className="summary-row">
              <span>Subtotal</span>
              <span>{formatPeso(subtotal)}</span>
            </div>

            <div className="summary-row">
              <span>Shipping</span>
              <span style={{ color: "#111111", fontWeight: 700 }}>
                Calculated by store
              </span>
            </div>

            <div className="summary-row">
              <span>Total</span>
              <span style={{ color: "#111111", fontWeight: 800 }}>
                {formatPeso(total)}
              </span>
            </div>

            <p className="summary-note" style={{ marginTop: 10 }}>
              This checkout is for ready-made products only.
            </p>
          </div>

          <button
            className="place-order-btn"
            onClick={handleSubmit}
            disabled={loading || !checkoutItems.length}
          >
            {loading ? "Placing Order…" : "Place Order"}
          </button>
        </div>
      </div>
    </div>
  );
}