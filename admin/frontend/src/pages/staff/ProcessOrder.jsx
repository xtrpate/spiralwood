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
        }}
      >
        <div
          className="card"
          style={{
            maxWidth: 520,
            width: "100%",
            textAlign: "center",
            padding: 40,
          }}
        >
          <CheckCircle size={56} color="#2e7d32" style={{ marginBottom: 16 }} />
          <h2 style={{ color: "#1a1a2e", marginBottom: 8 }}>
            Order Successful!
          </h2>

          <p style={{ color: "#666", marginBottom: 6 }}>
            Order #: <strong>{success.order_number}</strong>
          </p>
          <p style={{ color: "#666", marginBottom: 6 }}>
            Receipt #: <strong>{success.receipt_number}</strong>
          </p>

          {success.delivery && (
            <p style={{ color: "#666", marginBottom: 6 }}>
              Delivery Request Saved
            </p>
          )}

          <div style={{ marginBottom: 24 }}>
            <p
              style={{
                fontSize: 22,
                fontWeight: 800,
                color: "#8B4513",
                marginBottom: 8,
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
                  <p style={{ color: "#666", marginBottom: 4 }}>
                    Cash Received:{" "}
                    <strong>
                      ₱
                      {parseFloat(success.cash_received || 0).toLocaleString(
                        "en-PH",
                        { minimumFractionDigits: 2 },
                      )}
                    </strong>
                  </p>
                  <p
                    style={{
                      color: "#2e7d32",
                      marginBottom: 0,
                      fontWeight: "bold",
                      fontSize: "1.1rem",
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
              className="btn btn-primary"
              onClick={() => navigate(`/staff/receipt/${success.receipt_id}`)}
            >
              <Receipt size={16} /> View Receipt
            </button>
            <button
              className="btn btn-secondary"
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
      <div>
        <div className="page-header">
          <h1>Process Order & Payment</h1>
        </div>
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <p style={{ color: "#aaa" }}>
            No items in cart.{" "}
            <button
              className="btn btn-secondary"
              onClick={() => navigate("/staff/products")}
            >
              Go to Product Search
            </button>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h1>Process Order & Payment</h1>
        <p>Review cart and complete payment for walk-in customer</p>
      </div>

      <div
        style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 20 }}
      >
        <div className="card">
          <h3 style={{ marginBottom: 20, fontWeight: 700 }}>
            Customer, Payment & Delivery
          </h3>

          <form onSubmit={handleSubmit}>
            <div className="form-field">
              <label>Customer Name *</label>
              <input
                type="text"
                placeholder="Walk-in Customer"
                value={form.customer_name}
                onChange={(e) =>
                  setForm({ ...form, customer_name: e.target.value })
                }
                required
              />
            </div>

            <div className="form-field">
              <label>Phone Number{phoneIsRequired ? " *" : ""}</label>
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
              />
              {form.customer_phone && !phoneIsValid && (
                <div style={{ color: "#c62828", fontSize: 12, marginTop: 6 }}>
                  Enter a valid 11-digit PH mobile number starting with 09.
                </div>
              )}
            </div>

            <div className="form-field">
              <label>Payment Method *</label>
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
              >
                <option value="cash">Cash</option>
                <option value="gcash">GCash</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="cod">Cash on Delivery (COD)</option>
                <option value="cop">Cash on Pick-up (COP)</option>
              </select>
            </div>

            <div className="form-field">
              <label>Discount</label>
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
                    padding: "12px 14px",
                    border: "1.5px solid #e0e0e0",
                    borderRadius: 8,
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
                  style={{
                    flex: 1,
                    padding: "12px 14px",
                    border: "1.5px solid #e0e0e0",
                    borderRadius: 8,
                    boxSizing: "border-box",
                  }}
                />
              </div>
            </div>

            {form.payment_method === "cash" && (
              <div className="form-field">
                <label>Cash Received (₱) *</label>
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
                />
              </div>
            )}

            <div
              className="card"
              style={{
                marginTop: 20,
                marginBottom: 20,
                background: "#faf7f4",
                border: "1px solid #e2e8f0",
              }}
            >
              <h4 style={{ marginBottom: 14, fontWeight: 700 }}>
                Fulfillment Options
              </h4>
              <div
                style={{ display: "flex", flexDirection: "column", gap: 12 }}
              >
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={form.need_delivery}
                    onChange={(e) =>
                      setForm({ ...form, need_delivery: e.target.checked })
                    }
                  />
                  Need Delivery
                </label>

                {form.need_delivery && (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 14,
                    }}
                  >
                    {/* 👉 THE FIX: Delivery Address and Delivery Fee side-by-side! */}
                    <div
                      style={{
                        gridColumn: "1 / -1",
                        display: "flex",
                        gap: "10px",
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ flex: 2, minWidth: "200px" }}>
                        <label
                          style={{
                            display: "block",
                            marginBottom: 6,
                            fontSize: 13,
                            fontWeight: 600,
                          }}
                        >
                          Delivery Address *
                        </label>
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
                          style={{
                            width: "100%",
                            padding: "12px 14px",
                            border: "1.5px solid #e0e0e0",
                            borderRadius: 8,
                            boxSizing: "border-box",
                          }}
                        />
                      </div>
                      <div style={{ flex: 1, minWidth: "120px" }}>
                        <label
                          style={{
                            display: "block",
                            marginBottom: 6,
                            fontSize: 13,
                            fontWeight: 600,
                          }}
                        >
                          Delivery Fee (₱)
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="e.g. 150"
                          value={form.delivery_fee}
                          onChange={(e) =>
                            setForm({ ...form, delivery_fee: e.target.value })
                          }
                          style={{
                            width: "100%",
                            padding: "12px 14px",
                            border: "1.5px solid #e0e0e0",
                            borderRadius: 8,
                            boxSizing: "border-box",
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <label
                        style={{
                          display: "block",
                          marginBottom: 6,
                          fontSize: 13,
                          fontWeight: 600,
                        }}
                      >
                        Preferred Date & Time *
                      </label>
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
                        style={{
                          width: "100%",
                          padding: "12px 14px",
                          border: "1.5px solid #e0e0e0",
                          borderRadius: 8,
                          boxSizing: "border-box",
                        }}
                      />
                    </div>
                    <div>
                      <label
                        style={{
                          display: "block",
                          marginBottom: 6,
                          fontSize: 13,
                          fontWeight: 600,
                        }}
                      >
                        Delivery Notes
                      </label>
                      <input
                        type="text"
                        placeholder="Optional delivery notes"
                        value={form.delivery_notes}
                        onChange={(e) =>
                          setForm({ ...form, delivery_notes: e.target.value })
                        }
                        style={{
                          width: "100%",
                          padding: "12px 14px",
                          border: "1.5px solid #e0e0e0",
                          borderRadius: 8,
                          boxSizing: "border-box",
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div
              className="form-field full"
              style={{ borderTop: "1px solid #e2e8f0", paddingTop: "20px" }}
            >
              <label>Additional Notes / Special Instructions</label>
              <textarea
                rows={3}
                placeholder="Add any final instructions for the admin or build team here..."
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>

            {error && (
              <div
                style={{
                  background: "#fce4ec",
                  color: "#c62828",
                  padding: "10px 14px",
                  borderRadius: 8,
                  fontSize: 13,
                  marginTop: 16,
                }}
              >
                {error}
              </div>
            )}

            <div style={{ display: "flex", gap: 12, marginTop: 20 }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => navigate("/staff/products")}
              >
                ← Back to Catalog
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!canSubmit}
              >
                {loading
                  ? "Processing..."
                  : "✓ Confirm Order & Process Payment"}
              </button>
            </div>
          </form>
        </div>

        <div className="card" style={{ height: "fit-content" }}>
          <h3 style={{ marginBottom: 16, fontWeight: 700 }}>Order Summary</h3>
          <div style={{ maxHeight: 280, overflowY: "auto" }}>
            {cart.map((item) => (
              <div
                key={item.key}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "8px 0",
                  borderBottom: "1px solid #f0f0f0",
                  fontSize: 13,
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{item.product_name}</div>
                  {(item.wood_type || item.dimensions) && (
                    <div style={{ fontSize: 11, color: "#64748b" }}>
                      {item.wood_type}{" "}
                      {item.dimensions ? `(${item.dimensions})` : ""}
                    </div>
                  )}
                  <div style={{ color: "#888", marginTop: 2 }}>
                    x{item.quantity} @ ₱{item.unit_price.toLocaleString()}
                  </div>
                </div>
                <div style={{ fontWeight: 700 }}>
                  ₱
                  {(item.unit_price * item.quantity).toLocaleString("en-PH", {
                    minimumFractionDigits: 2,
                  })}
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: 16,
              borderTop: "2px solid #f0f0f0",
              paddingTop: 12,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 13,
                marginBottom: 6,
              }}
            >
              <span>Subtotal</span>
              <span>
                ₱
                {subtotal.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
              </span>
            </div>

            {discountAmount > 0 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 13,
                  marginBottom: 6,
                  color: "#2e7d32",
                }}
              >
                <span>
                  Discount{" "}
                  {form.discount_type === "percent"
                    ? `(${discountInput}%)`
                    : `(Flat)`}
                </span>
                <span>
                  -₱
                  {discountAmount.toLocaleString("en-PH", {
                    minimumFractionDigits: 2,
                  })}
                </span>
              </div>
            )}

            {/* 👉 Show Delivery Fee in Summary */}
            {form.need_delivery && deliveryFeeAmt > 0 && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 13,
                  marginBottom: 6,
                  color: "#475569",
                }}
              >
                <span>Delivery Fee</span>
                <span>
                  +₱
                  {deliveryFeeAmt.toLocaleString("en-PH", {
                    minimumFractionDigits: 2,
                  })}
                </span>
              </div>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 18,
                fontWeight: 800,
                color: "#8B4513",
                marginTop: 8,
              }}
            >
              <span>TOTAL</span>
              <span>
                ₱{total.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
              </span>
            </div>

            {form.payment_method === "cash" && (
              <>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 13,
                    marginTop: 10,
                  }}
                >
                  <span>Cash Received</span>
                  <span>
                    ₱
                    {cashReceived.toLocaleString("en-PH", {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 13,
                    marginTop: 6,
                    color: cashReceived >= total ? "#2e7d32" : "#c62828",
                    fontWeight: "bold",
                  }}
                >
                  <span>
                    {cashReceived >= total
                      ? "Change (Sukli)"
                      : "Insufficient Cash"}
                  </span>
                  <span>
                    ₱
                    {Math.abs(cashReceived - total).toLocaleString("en-PH", {
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
