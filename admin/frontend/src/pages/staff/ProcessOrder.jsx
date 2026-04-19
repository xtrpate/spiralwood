import { useState, useEffect } from "react";
import api from "../../services/api";
import { useNavigate } from "react-router-dom";
import { CheckCircle, Receipt } from "lucide-react";

const isValidPHPhone = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length === 11 && digits.startsWith("09");
};

export default function ProcessOrder() {
  const navigate = useNavigate();
  const [cart, setCart] = useState([]);
  const [form, setForm] = useState({
    customer_name: "",
    customer_phone: "",
    payment_method: "cash",
    cash_received: "",

    discount_type: "amount",
    discount: "",

    need_delivery: false,
    delivery_fee: "", // 👉 STATE FOR DELIVERY FEE
    delivery_address: "",
    delivery_requested_date: "",
    delivery_notes: "",

    notes: "",
  });

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const saved = sessionStorage.getItem("pos_cart");
    if (saved) setCart(JSON.parse(saved));
  }, []);

  const subtotal = cart.reduce((s, i) => s + i.unit_price * i.quantity, 0);

  const discountInput = parseFloat(form.discount) || 0;
  let discountAmount = 0;
  if (form.discount_type === "percent") {
    discountAmount = subtotal * (discountInput / 100);
  } else {
    discountAmount = discountInput;
  }

  // 👉 MATH: Include delivery fee in total
  const deliveryFeeAmt = parseFloat(form.delivery_fee) || 0;
  const total = Math.max(
    subtotal - discountAmount + (form.need_delivery ? deliveryFeeAmt : 0),
    0,
  );

  const cashReceived = parseFloat(form.cash_received) || 0;
  const change =
    form.payment_method === "cash" ? Math.max(cashReceived - total, 0) : 0;

  const normalizedPhone = String(form.customer_phone || "").replace(/\D/g, "");
  const phoneIsRequired = form.need_delivery;
  const phoneIsValid = !normalizedPhone || isValidPHPhone(normalizedPhone);

  const discountIsValid =
    form.discount_type === "percent"
      ? discountInput >= 0 && discountInput <= 100
      : discountInput >= 0 && discountInput <= subtotal;

  const cashIsValid =
    form.payment_method !== "cash" ||
    (!Number.isNaN(parseFloat(form.cash_received)) && cashReceived >= total);

  const deliveryIsValid =
    !form.need_delivery ||
    (form.delivery_address.trim() && form.delivery_requested_date);

  const canSubmit =
    cart.length > 0 &&
    !loading &&
    !!form.customer_name.trim() &&
    discountIsValid &&
    phoneIsValid &&
    (!phoneIsRequired || normalizedPhone.length === 11) &&
    cashIsValid &&
    deliveryIsValid;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (cart.length === 0) return setError("Cart is empty.");
    if (!form.customer_name.trim())
      return setError("Customer name is required.");
    if (phoneIsRequired && !normalizedPhone)
      return setError("Phone number is required for delivery.");
    if (normalizedPhone && !isValidPHPhone(normalizedPhone))
      return setError(
        "Enter a valid 11-digit PH mobile number starting with 09.",
      );
    if (!discountIsValid) return setError("Invalid discount amount.");

    if (form.payment_method === "cash") {
      if (!form.cash_received || Number.isNaN(parseFloat(form.cash_received))) {
        return setError("Cash received is required for cash payments.");
      }
      if (cashReceived < total) {
        return setError("Cash received cannot be less than the total amount.");
      }
    }

    if (form.need_delivery) {
      if (!form.delivery_address.trim())
        return setError("Delivery address is required.");
      if (!form.delivery_requested_date)
        return setError("Preferred delivery date and time is required.");
    }

    setLoading(true);

    try {
      const payload = {
        customer_name: form.customer_name.trim(),
        customer_phone: normalizedPhone,
        payment_method: form.payment_method,
        cash_received: form.payment_method === "cash" ? cashReceived : null,
        change: form.payment_method === "cash" ? change : null,
        discount: discountAmount,
        delivery_fee: form.need_delivery ? deliveryFeeAmt : 0, // 👉 Send Delivery Fee to Backend
        notes: form.notes,
        items: cart,
        delivery: form.need_delivery
          ? {
              address: form.delivery_address.trim(),
              requested_date: form.delivery_requested_date,
              notes: form.delivery_notes.trim(),
            }
          : null,
      };

      const res = await api.post("/pos/orders", payload);

      sessionStorage.removeItem("pos_cart");
      setSuccess(res.data);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to process order.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "60vh",
          fontFamily: "'Inter', sans-serif"
        }}
      >
        <div
          style={{
            ...cardStyle,
            maxWidth: 520,
            width: "100%",
            textAlign: "center",
            padding: 40,
          }}
        >
          <CheckCircle size={56} color="#059669" style={{ marginBottom: 16 }} />
          <h2 style={{ color: "#0a0a0a", marginBottom: 8, fontSize: 24, fontWeight: 800, letterSpacing: "-0.01em" }}>
            Order Successful!
          </h2>

          <p style={{ color: "#52525b", marginBottom: 6, fontSize: 14 }}>
            Order #: <strong style={{ color: "#18181b" }}>{success.order_number}</strong>
          </p>
          <p style={{ color: "#52525b", marginBottom: 6, fontSize: 14 }}>
            Receipt #: <strong style={{ color: "#18181b" }}>{success.receipt_number}</strong>
          </p>

          {success.delivery && (
            <p style={{ color: "#52525b", marginBottom: 6, fontSize: 14 }}>
              Delivery Request Saved
            </p>
          )}

          <div style={{ margin: "24px 0", padding: "20px", background: "#fafafa", borderRadius: 12, border: "1px solid #e4e4e7" }}>
            <p
              style={{
                fontSize: 28,
                fontWeight: 800,
                color: "#0a0a0a",
                margin: "0 0 12px",
                letterSpacing: "-0.02em"
              }}
            >
              ₱
              {parseFloat(success.total).toLocaleString("en-PH", {
                minimumFractionDigits: 2,
              })}
            </p>

            {success.cash_received !== null &&
              success.cash_received !== undefined && (
                <>
                  <p style={{ color: "#52525b", marginBottom: 6, fontSize: 14 }}>
                    Cash Received:{" "}
                    <strong style={{ color: "#18181b" }}>
                      ₱
                      {parseFloat(success.cash_received || 0).toLocaleString(
                        "en-PH",
                        { minimumFractionDigits: 2 },
                      )}
                    </strong>
                  </p>
                  <p
                    style={{
                      color: "#059669",
                      margin: 0,
                      fontWeight: 800,
                      fontSize: 16,
                    }}
                  >
                    Change (Sukli): ₱
                    {parseFloat(success.change || 0).toLocaleString("en-PH", {
                      minimumFractionDigits: 2,
                    })}
                  </p>
                </>
              )}
          </div>

          <div
            style={{
              display: "flex",
              gap: 12,
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              style={btnPrimary}
              onClick={() => navigate(`/staff/receipt/${success.receipt_id}`)}
            >
              <Receipt size={16} /> View Receipt
            </button>
            <button
              style={btnSecondary}
              onClick={() => {
                setSuccess(null);
                setCart([]);
                setForm({
                  customer_name: "",
                  customer_phone: "",
                  payment_method: "cash",
                  cash_received: "",
                  discount_type: "amount",
                  discount: "",
                  delivery_fee: "",
                  notes: "",
                  need_delivery: false,
                  delivery_address: "",
                  delivery_requested_date: "",
                  delivery_notes: "",
                });
                navigate("/staff/products");
              }}
            >
              New Order
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (cart.length === 0) {
    return (
      <div style={{ fontFamily: "'Inter', sans-serif" }}>
        <div style={pageHeader}>
          <h1 style={pageTitle}>Process Order & Payment</h1>
        </div>
        <div style={{ ...cardStyle, textAlign: "center", padding: 60 }}>
          <p style={{ color: "#71717a", fontSize: 14, fontWeight: 600, marginBottom: 20 }}>
            No items in cart.
          </p>
          <button
            style={btnSecondary}
            onClick={() => navigate("/staff/products")}
          >
            Go to Product Search
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", paddingBottom: 40 }}>
      <div style={pageHeader}>
        <h1 style={pageTitle}>Process Order & Payment</h1>
        <p style={pageSubtitle}>Review cart and complete payment for walk-in customer</p>
      </div>

      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 24, alignItems: "start" }}
      >
        <div style={{ ...cardStyle, padding: 32 }}>
          <h3 style={{ margin: "0 0 24px", fontWeight: 800, fontSize: 18, color: "#0a0a0a", letterSpacing: "-0.01em" }}>
            Customer, Payment & Delivery
          </h3>

          <form onSubmit={handleSubmit}>
            <div style={formField}>
              <label style={labelStyle}>Customer Name *</label>
              <input
                type="text"
                placeholder="Walk-in Customer"
                value={form.customer_name}
                onChange={(e) =>
                  setForm({ ...form, customer_name: e.target.value })
                }
                required
                style={inputStyle}
              />
            </div>

            <div style={formField}>
              <label style={labelStyle}>Phone Number{phoneIsRequired ? " *" : ""}</label>
              <input
                type="tel"
                placeholder="09XXXXXXXXX"
                value={form.customer_phone}
                maxLength={11}
                onChange={(e) =>
                  setForm({
                    ...form,
                    customer_phone: e.target.value
                      .replace(/\D/g, "")
                      .slice(0, 11),
                  })
                }
                style={{ ...inputStyle, borderColor: (form.customer_phone && !phoneIsValid) ? "#dc2626" : "#e4e4e7" }}
              />
              {form.customer_phone && !phoneIsValid && (
                <div style={{ color: "#dc2626", fontSize: 12, marginTop: 6, fontWeight: 600 }}>
                  Enter a valid 11-digit PH mobile number starting with 09.
                </div>
              )}
            </div>

            <div style={formField}>
              <label style={labelStyle}>Payment Method *</label>
              <select
                value={form.payment_method}
                onChange={(e) =>
                  setForm({
                    ...form,
                    payment_method: e.target.value,
                    cash_received:
                      e.target.value === "cash" ? form.cash_received : "",
                  })
                }
                required
                style={inputStyle}
              >
                <option value="cash">Cash</option>
                <option value="gcash">GCash</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="cod">Cash on Delivery (COD)</option>
                <option value="cop">Cash on Pick-up (COP)</option>
              </select>
            </div>

            <div style={formField}>
              <label style={labelStyle}>Discount</label>
              <div style={{ display: "flex", gap: "8px" }}>
                <select
                  value={form.discount_type}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      discount_type: e.target.value,
                      discount: "",
                    })
                  }
                  style={{
                    width: "80px",
                    padding: "10px 14px",
                    border: "1px solid #e4e4e7",
                    borderRadius: 8,
                    outline: "none",
                    background: "#fff",
                    color: "#18181b",
                    fontSize: 13
                  }}
                >
                  <option value="amount">₱</option>
                  <option value="percent">%</option>
                </select>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder={
                    form.discount_type === "amount"
                      ? "Amount (e.g. 500)"
                      : "Percent (e.g. 20)"
                  }
                  value={form.discount}
                  onChange={(e) =>
                    setForm({ ...form, discount: e.target.value })
                  }
                  style={{ ...inputStyle, flex: 1 }}
                />
              </div>
            </div>

            {form.payment_method === "cash" && (
              <div style={formField}>
                <label style={labelStyle}>Cash Received (₱) *</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Enter amount received"
                  value={form.cash_received}
                  onChange={(e) =>
                    setForm({ ...form, cash_received: e.target.value })
                  }
                  required
                  style={inputStyle}
                />
              </div>
            )}

            <div
              style={{
                marginTop: 24,
                marginBottom: 24,
                background: "#fafafa",
                border: "1px solid #e4e4e7",
                borderRadius: 12,
                padding: 24
              }}
            >
              <h4 style={{ margin: "0 0 16px", fontWeight: 800, fontSize: 15, color: "#0a0a0a" }}>
                Fulfillment Options
              </h4>
              <div
                style={{ display: "flex", flexDirection: "column", gap: 16 }}
              >
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    fontSize: 13,
                    fontWeight: 700,
                    color: "#18181b",
                    cursor: "pointer"
                  }}
                >
                  <div
                    onClick={() => setForm({ ...form, need_delivery: !form.need_delivery })}
                    style={{
                      width: 44,
                      height: 24,
                      borderRadius: 12,
                      cursor: "pointer",
                      background: form.need_delivery ? "#18181b" : "#d4d4d8",
                      position: "relative",
                      transition: "background .2s",
                      flexShrink: 0
                    }}
                  >
                    <div
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: "50%",
                        background: "#fff",
                        position: "absolute",
                        top: 3,
                        left: form.need_delivery ? 23 : 3,
                        transition: "left .2s",
                        boxShadow: "0 1px 3px rgba(0,0,0,.2)",
                      }}
                    />
                  </div>
                  Need Delivery
                </label>

                {form.need_delivery && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 16,
                      marginTop: 8
                    }}
                  >
                    {/* 👉 Delivery Address and Delivery Fee side-by-side */}
                    <div
                      style={{
                        gridColumn: "1 / -1",
                        display: "flex",
                        gap: "12px",
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ flex: 2, minWidth: "200px" }}>
                        <label style={labelStyle}>Delivery Address *</label>
                        <input
                          type="text"
                          placeholder="Full delivery address"
                          value={form.delivery_address}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              delivery_address: e.target.value,
                            })
                          }
                          required={form.need_delivery}
                          style={inputStyle}
                        />
                      </div>
                      <div style={{ flex: 1, minWidth: "120px" }}>
                        <label style={labelStyle}>Delivery Fee (₱)</label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="e.g. 150"
                          value={form.delivery_fee}
                          onChange={(e) =>
                            setForm({ ...form, delivery_fee: e.target.value })
                          }
                          style={inputStyle}
                        />
                      </div>
                    </div>
                    
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label style={labelStyle}>Preferred Date & Time *</label>
                      <input
                        type="datetime-local"
                        value={form.delivery_requested_date}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            delivery_requested_date: e.target.value,
                          })
                        }
                        required={form.need_delivery}
                        style={inputStyle}
                      />
                    </div>
                    
                    <div style={{ gridColumn: "1 / -1" }}>
                      <label style={labelStyle}>Delivery Notes</label>
                      <input
                        type="text"
                        placeholder="Optional delivery notes"
                        value={form.delivery_notes}
                        onChange={(e) =>
                          setForm({ ...form, delivery_notes: e.target.value })
                        }
                        style={inputStyle}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div style={formField}>
              <label style={labelStyle}>Additional Notes / Special Instructions</label>
              <textarea
                rows={3}
                placeholder="Add any final instructions for the admin or build team here..."
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
              />
            </div>

            {error && (
              <div
                style={{
                  background: "#fef2f2",
                  color: "#991b1b",
                  padding: "12px 16px",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  marginTop: 20,
                  border: "1px solid #fecaca"
                }}
              >
                {error}
              </div>
            )}

            <div style={{ display: "flex", gap: 12, marginTop: 32, justifyContent: "space-between", flexWrap: "wrap" }}>
              <button
                type="button"
                style={btnSecondary}
                onClick={() => navigate("/staff/products")}
              >
                ← Back to Catalog
              </button>
              <button
                type="submit"
                style={canSubmit ? btnPrimary : { ...btnPrimary, opacity: 0.5, cursor: "not-allowed" }}
                disabled={!canSubmit}
              >
                {loading
                  ? "Processing..."
                  : "✓ Confirm Order & Process Payment"}
              </button>
            </div>
          </form>
        </div>

        {/* Right Sidebar - Summary */}
        <div style={{ ...cardStyle, padding: 0, height: "fit-content" }}>
          <div style={{ padding: "20px 24px", borderBottom: "1px solid #f4f4f5", background: "#fafafa" }}>
            <h3 style={{ margin: 0, fontWeight: 800, fontSize: 16, color: "#0a0a0a", letterSpacing: "1px", textTransform: "uppercase" }}>Order Summary</h3>
          </div>
          
          <div style={{ maxHeight: 320, overflowY: "auto", padding: "0 24px" }}>
            {cart.map((item) => (
              <div
                key={item.key}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "16px 0",
                  borderBottom: "1px solid #f4f4f5",
                  fontSize: 13,
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, color: "#0a0a0a", marginBottom: 2 }}>{item.product_name}</div>
                  {(item.wood_type || item.dimensions) && (
                    <div style={{ fontSize: 11, color: "#71717a", fontWeight: 500 }}>
                      {item.wood_type}{" "}
                      {item.dimensions ? `(${item.dimensions})` : ""}
                    </div>
                  )}
                  <div style={{ color: "#71717a", marginTop: 4, fontWeight: 600 }}>
                    x{item.quantity} @ ₱{item.unit_price.toLocaleString()}
                  </div>
                </div>
                <div style={{ fontWeight: 800, color: "#0a0a0a" }}>
                  ₱
                  {(item.unit_price * item.quantity).toLocaleString("en-PH", {
                    minimumFractionDigits: 2,
                  })}
                </div>
              </div>
            ))}
          </div>

          <div style={{ padding: 24, background: "#fafafa", borderTop: "1px solid #e4e4e7" }}>
            <div style={summaryRowStyle}>
              <span>Subtotal</span>
              <span style={{ fontWeight: 600, color: "#18181b" }}>
                ₱{subtotal.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
              </span>
            </div>

            {discountAmount > 0 && (
              <div style={{ ...summaryRowStyle, color: "#dc2626" }}>
                <span>
                  Discount{" "}
                  {form.discount_type === "percent"
                    ? `(${discountInput}%)`
                    : `(Flat)`}
                </span>
                <span style={{ fontWeight: 600 }}>
                  -₱{discountAmount.toLocaleString("en-PH", {
                    minimumFractionDigits: 2,
                  })}
                </span>
              </div>
            )}

            {form.need_delivery && deliveryFeeAmt > 0 && (
              <div style={summaryRowStyle}>
                <span>Delivery Fee</span>
                <span style={{ fontWeight: 600, color: "#18181b" }}>
                  +₱{deliveryFeeAmt.toLocaleString("en-PH", {
                    minimumFractionDigits: 2,
                  })}
                </span>
              </div>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 20,
                fontWeight: 800,
                color: "#0a0a0a",
                marginTop: 16,
                paddingTop: 16,
                borderTop: "1px solid #e4e4e7",
                letterSpacing: "-0.01em"
              }}
            >
              <span>TOTAL</span>
              <span>
                ₱{total.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
              </span>
            </div>

            {form.payment_method === "cash" && (
              <>
                <div style={{ ...summaryRowStyle, marginTop: 16, color: "#52525b" }}>
                  <span>Cash Received</span>
                  <span style={{ fontWeight: 700, color: "#18181b" }}>
                    ₱{cashReceived.toLocaleString("en-PH", {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 13,
                    marginTop: 8,
                    color: cashReceived >= total ? "#059669" : "#dc2626",
                    fontWeight: 700,
                  }}
                >
                  <span>
                    {cashReceived >= total
                      ? "Change (Sukli)"
                      : "Insufficient Cash"}
                  </span>
                  <span>
                    ₱{Math.abs(cashReceived - total).toLocaleString("en-PH", {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Reusable Styles ──────────────────────────────────────────

const pageHeader = {
  marginBottom: 24,
};

const pageTitle = {
  fontSize: 24,
  fontWeight: 800,
  color: "#0a0a0a",
  margin: 0,
  letterSpacing: "-0.02em"
};

const pageSubtitle = {
  fontSize: 13,
  color: "#52525b",
  marginTop: 6,
  lineHeight: 1.5,
};

const cardStyle = {
  background: "#ffffff",
  border: "1px solid #e4e4e7",
  borderRadius: 16,
  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
};

const formField = {
  marginBottom: 20,
};

const labelStyle = {
  display: "block",
  marginBottom: 8,
  fontSize: 11,
  fontWeight: 800,
  color: "#71717a",
  textTransform: "uppercase",
  letterSpacing: "1px"
};

const inputStyle = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 8,
  border: "1px solid #e4e4e7",
  fontSize: 13,
  color: "#18181b",
  outline: "none",
  boxSizing: "border-box",
  background: "#ffffff",
  transition: "border-color 0.2s"
};

const summaryRowStyle = {
  display: "flex",
  justifyContent: "space-between",
  fontSize: 13,
  marginBottom: 10,
  color: "#52525b",
};

const btnPrimary = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: "12px 24px",
  background: "#18181b",
  color: "#fff",
  border: "1px solid #18181b",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
  transition: "background 0.2s"
};

const btnSecondary = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 8,
  padding: "12px 20px",
  background: "#f4f4f5",
  color: "#18181b",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
  transition: "background 0.2s"
};