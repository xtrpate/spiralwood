import { useState, useEffect } from "react";
import api, { buildAssetUrl } from "../../services/api";
import { useParams, useNavigate } from "react-router-dom";
import { Printer, ArrowLeft } from "lucide-react";
import "./ReceiptPage.css";
import { formatPHDateTime } from "../../utils/dateTime";
import receiptBrandLogoV172 from "../customer/spiral-wood-receipt-logo-v172.png";

const OFFICIAL_BUSINESS_ADDRESS =
  "8 Laot Street, Near Gavino, Prenza I, Marilao, 3019 Bulacan";

export default function ReceiptPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;
    const fetchReceipt = async () => {
      try {
        const { data } = await api.get(`/pos/receipts/${id}`);
        if (isMounted) {
          setReceipt(data);
          setError("");
        }
      } catch (err) {
        if (isMounted) {
          setReceipt(null);
          setError(err.response?.data?.message || "Failed to load receipt.");
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchReceipt();
    return () => {
      isMounted = false;
    };
  }, [id]);

  if (loading) return <div className="loading-screen">Loading receipt...</div>;
  if (!receipt)
    return (
      <div className="page-header">
        <p>{error || "Receipt not found."}</p>
      </div>
    );

  const items = Array.isArray(receipt.items) ? receipt.items : [];
  const paymentMethod = String(receipt.payment_method || "")
    .trim()
    .toLowerCase();
  const PAYMENT_METHOD_LABELS = {
    gcash: "GCash",
    bank_transfer: "Bank Transfer",
    paymongo: "Online Payment",
  };
  const paymentMethodLabel =
    PAYMENT_METHOD_LABELS[paymentMethod] ||
    (paymentMethod ? paymentMethod.replace("_", " ") : "");

  const paymentSummary = receipt.payment_summary || null;
  const total = Number(
    paymentSummary?.order_total ?? receipt.total_amount ?? receipt.total ?? 0,
  );
  const paymentReceived = Number(paymentSummary?.payment_received ?? total);
  const previousPaid = Number(paymentSummary?.previous_paid ?? 0);
  const totalPaidAfter = Number(paymentSummary?.total_paid_after ?? total);
  const remainingBalance = Number(paymentSummary?.remaining_balance ?? 0);
  const paymentStatusLabel =
    paymentSummary?.status || "Payment status unavailable";
  const financialSummary = receipt.financial_summary || null;
  const formatMoney = (value) =>
    Number(value || 0).toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  // Optional business/footer fields are shown ONLY when actually configured
  // in website_settings -- never fabricated. warranty_period_days is a real
  // configured value (see pos.receipts.js), so it is safe to surface here.
  const warrantyPeriodDays = receipt.business?.warranty_period_days
    ? Number(receipt.business.warranty_period_days)
    : null;
  const thankYouMessage =
    receipt.business?.thank_you_message?.trim() ||
    "Thank you for your purchase!";
  const returnNote = receipt.business?.return_policy_note?.trim() || null;

  const hasCashReceived =
    receipt.cash_received !== null &&
    receipt.cash_received !== undefined &&
    receipt.cash_received !== "" &&
    !Number.isNaN(Number(receipt.cash_received));
  const cashReceived = hasCashReceived ? Number(receipt.cash_received) : null;

  const hasBackendChange =
    receipt.change_amount !== null &&
    receipt.change_amount !== undefined &&
    receipt.change_amount !== "" &&
    !Number.isNaN(Number(receipt.change_amount));
  const backendChange = hasBackendChange ? Number(receipt.change_amount) : 0;

  const change =
    paymentMethod === "cash"
      ? hasBackendChange
        ? backendChange
        : cashReceived !== null
          ? Math.max(0, cashReceived - total)
          : 0
      : 0;

  const receiptDate = receipt.created_at || receipt.printed_at;

  return (
    <div className="staff-receipt-page-v190">
      <div
        className="page-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          flexWrap: "wrap",
          gap: "16px",
          marginBottom: 32,
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: 24,
              fontWeight: 800,
              color: "#0a0a0a",
              letterSpacing: "-0.02em",
            }}
          >
            Sales Receipt
          </h1>
          <p
            style={{
              margin: "6px 0 0",
              fontSize: 13,
              color: "#52525b",
              lineHeight: 1.5,
            }}
          >
            Receipt number {receipt.receipt_number}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            style={btnGhost}
            onClick={() => navigate("/staff/products")}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#f4f4f5")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#ffffff")}
          >
            <ArrowLeft size={16} /> Back
          </button>
          <button
            style={btnPrimary}
            onClick={() => window.print()}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#2c2c2f")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#111111")}
          >
            <Printer size={16} /> Print Receipt
          </button>
        </div>
      </div>

      <div className="receipt-wrapper">
        <div className="receipt" id="receipt-print">
          {/* Header */}
          <div className="receipt-header">
            <img
              src={receiptBrandLogoV172}
              alt="Spiral Wood Services"
              className="receipt-logo staff-receipt-logo-v192"
            />
            <p className="biz-info">
              {OFFICIAL_BUSINESS_ADDRESS}
            </p>
            <p className="biz-info">{receipt.business?.business_phone || ""}</p>
            <div className="receipt-divider" />
            <div className="staff-receipt-document-v190">
              <p className="receipt-title">SALES RECEIPT</p>
              <p className="staff-receipt-copy-v190">STORE COPY</p>
            </div>
          </div>

          {/* Meta */}
          <div className="staff-receipt-section-title-v190">SALE DETAILS</div>
          <div className="receipt-meta">
            <div className="meta-row">
              <span>Receipt Number</span>
              <span>{receipt.receipt_number}</span>
            </div>
            <div className="meta-row">
              <span>Order Number</span>
              <span>{receipt.order_number}</span>
            </div>
            <div className="meta-row">
              <span>Date and time</span>
              <span>
                {receiptDate
                  ? formatPHDateTime(receiptDate, {
                      year: "numeric",
                      month: "numeric",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                      second: "2-digit",
                    })
                  : "\u2014"}
              </span>
            </div>
            <div className="meta-row">
              <span>Customer</span>
              <span>{receipt.customer_display || receipt.issued_to || "Customer"}</span>
            </div>
            <div className="meta-row">
              <span>Payment method</span>
              <span style={{ textTransform: "capitalize" }}>
                {paymentMethodLabel || "N/A"}
              </span>
            </div>
            <div className="meta-row">
              <span>Payment status</span>
              <span
                style={{
                  color: paymentSummary?.is_fully_paid ? "#059669" : "#b45309",
                }}
              >
                {paymentStatusLabel}
              </span>
            </div>
            <div className="meta-row">
              <span>Processed by</span>
              <span>{receipt.processor_display || receipt.staff_name || "Staff"}</span>
            </div>
          </div>

          <div className="receipt-divider" />

          {/* Items */}
          <div className="staff-receipt-section-title-v190">ITEMS</div>
          <table className="receipt-items staff-receipt-items-v190">
            <thead>
              <tr>
                <th>Item</th>
                <th style={{ textAlign: "center" }}>Qty</th>
                <th style={{ textAlign: "right" }}>Price</th>
                <th style={{ textAlign: "right" }}>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, i) => (
                <tr key={i}>
                  <td>
                    {item.product_name}
                    {(item.variation_name || item.wood_type) && (
                      <div
                        style={{
                          fontSize: "10px",
                          color: "#52525b",
                          marginTop: 2,
                        }}
                      >
                        {[item.variation_name, item.wood_type]
                          .filter(Boolean)
                          .join(" • ")}
                      </div>
                    )}
                  </td>
                  <td style={{ textAlign: "center", fontWeight: 600 }}>
                    {item.quantity}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    ₱
                    {parseFloat(item.unit_price).toLocaleString("en-PH", {
                      minimumFractionDigits: 2,
                    })}
                  </td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>
                    ₱
                    {(
                      parseFloat(item.unit_price || 0) *
                      parseFloat(item.quantity || 0)
                    ).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="receipt-divider" />

          {/* Totals */}
          <div className="staff-receipt-section-title-v190">PAYMENT SUMMARY</div>
          <div className="receipt-totals staff-receipt-summary-v190">
            {financialSummary && (
              <>
                <div className="total-row">
                  <span>Merchandise Subtotal</span>
                  <span>{"\u20B1"}{formatMoney(financialSummary.subtotal)}</span>
                </div>
                {Number(financialSummary.delivery_fee) > 0 && (
                  <div className="total-row">
                    <span>Delivery Fee</span>
                    <span>
                      {"\u20B1"}{formatMoney(financialSummary.delivery_fee)}
                    </span>
                  </div>
                )}
                <div className="total-row">
                  <span>Discount</span>
                  <span>
                    {Number(financialSummary.discount) > 0 ? "-" : ""}
                    {"\u20B1"}{formatMoney(financialSummary.discount)}
                  </span>
                </div>
                <div className="total-row">
                  <span>VATable Sales</span>
                  <span>{"\u20B1"}{formatMoney(financialSummary.vatable_sales)}</span>
                </div>
                <div className="total-row">
                  <span>VAT-Exempt Sales</span>
                  <span>{"\u20B1"}{formatMoney(financialSummary.vat_exempt_sales)}</span>
                </div>
                <div className="total-row">
                  <span>Zero-Rated Sales</span>
                  <span>{"\u20B1"}{formatMoney(financialSummary.zero_rated_sales)}</span>
                </div>
                <div className="total-row">
                  <span>VAT (12%)</span>
                  <span>{"\u20B1"}{formatMoney(financialSummary.tax)}</span>
                </div>
              </>
            )}

            <div className="total-row grand staff-total-v190">
              <span>ORDER TOTAL</span>
              <span>
                ₱{total.toLocaleString("en-PH", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>

            <div className="total-row staff-payment-received-v190">
              <span>Payment Received</span>
              <span>
                ₱{paymentReceived.toLocaleString("en-PH", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>

            {(previousPaid > 0 || totalPaidAfter !== paymentReceived) && (
              <div className="total-row">
                <span>Total Paid</span>
                <span>
                  ₱{totalPaidAfter.toLocaleString("en-PH", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
            )}

            <div className="total-row staff-remaining-balance-v190">
              <span>Remaining Balance</span>
              <span>
                ₱{remainingBalance.toLocaleString("en-PH", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </span>
            </div>

            {paymentMethod === "cash" && (
              <div className="total-row staff-cash-received-v190">
                <span>Cash Received</span>
                <span>
                  {cashReceived !== null
                    ? `₱${cashReceived.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`
                    : "—"}
                </span>
              </div>
            )}

            {paymentMethod === "cash" && (
              <div className="total-row staff-change-v190">
                {/* 👉 RULE 8: Explicitly labeled Sukli */}
                <span>Change</span>
                <span>
                  ₱
                  {change.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}

            {receipt.payment_method === "gcash" &&
              receipt.business?.gcash_number && (
                <div className="meta-row" style={{ marginTop: 12 }}>
                  <span>GCash number</span>
                  <span>{receipt.business.gcash_number}</span>
                </div>
              )}
          </div>

          <div className="receipt-divider" />

          {/* Footer */}
          <div className="receipt-footer staff-receipt-footer-v190">
            {receipt.signature_url && (
              <div className="signature-block">
                <img
                  src={buildAssetUrl(receipt.signature_url)}
                  alt="signature"
                  className="signature-img"
                />
                <div className="signature-label">Authorized Signature</div>
              </div>
            )}
            <p style={{ fontWeight: 800, color: "#18181b" }}>
              {thankYouMessage}
            </p>
            <p
              style={{
                fontSize: 10,
                color: "#71717a",
                marginTop: 6,
                lineHeight: 1.4,
              }}
            >
              {returnNote ||
                (warrantyPeriodDays
                  ? `Keep this receipt. Warranty coverage is ${warrantyPeriodDays} day${warrantyPeriodDays === 1 ? "" : "s"}, based on store policy.`
                  : "Please keep this receipt for your records.")}
            </p>
            <p
              style={{
                fontSize: 9,
                color: "#a1a1aa",
                marginTop: 8,
              }}
            >
              Generated by WISDOM POS.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

const btnPrimary = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 20px",
  background: "#111111",
  color: "#ffffff",
  border: "1px solid #111111",
  borderRadius: 0,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
  transition: "background 0.15s",
};

const btnGhost = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 16px",
  background: "#ffffff",
  color: "#111111",
  border: "1px solid #111111",
  borderRadius: 0,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
  transition: "background 0.15s",
};