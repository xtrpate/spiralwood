import { useEffect, useState } from "react";
import api from "../../services/api";
import { useParams, useNavigate } from "react-router-dom";
import { Printer, ArrowLeft } from "lucide-react";
import "./ReceiptPage.css";
import receiptBrandLogoV172 from "../customer/spiral-wood-receipt-logo-v172.png";

const PAYMENT_METHOD_LABELS = {
  cash: "Cash",
  gcash: "GCash",
  bank_transfer: "Bank Transfer",
  paymongo: "Online Payment (PayMongo)",
};

const PAYMENT_LABEL_TEXT = {
  down_payment: "Down Payment",
  partial_payment: "Partial Payment",
  balance_payment: "Balance Payment",
  full_payment: "Full Payment",
};


const formatMoney = (value) =>
  `₱${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
  })}`;

export default function BlueprintReceiptPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;
    const fetchReceipt = async () => {
      try {
        const { data } = await api.get(`/pos/blueprint-receipts/${id}`);
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

  const paymentMethod = String(receipt.payment_method_snapshot || "")
    .trim()
    .toLowerCase();
  const paymentMethodLabel =
    PAYMENT_METHOD_LABELS[paymentMethod] ||
    (paymentMethod ? paymentMethod.replace("_", " ") : "N/A");

  const paymentLabelText =
    PAYMENT_LABEL_TEXT[receipt.payment_label] || receipt.payment_label || "Payment";

  const isFullyPaid = receipt.payment_status === "Fully Paid";
  const receiptDate = receipt.created_at || receipt.printed_at;

  return (
    <div className="staff-receipt-page-v190 staff-blueprint-receipt-v190">
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
            Blueprint Payment Receipt
          </h1>
          <p
            style={{
              margin: "6px 0 0",
              fontSize: 13,
              color: "#52525b",
              lineHeight: 1.5,
            }}
          >
            Receipt #{receipt.receipt_number}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            style={btnGhost}
            onClick={() => navigate("/staff/blueprint-payments")}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#e4e4e7")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#f4f4f5")}
          >
            <ArrowLeft size={16} /> Back
          </button>
          <button
            style={btnPrimary}
            onClick={() => window.print()}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#3f3f46")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#18181b")}
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
            <p className="biz-info">{receipt.business?.business_address || ""}</p>
            <p className="biz-info">{receipt.business?.business_phone || ""}</p>
            <div className="receipt-divider" />
            <div className="staff-receipt-document-v190">
              <p className="receipt-title">BLUEPRINT PAYMENT RECEIPT</p>
              <p className="staff-receipt-copy-v190">STORE COPY</p>
            </div>
          </div>

          {/* Meta */}
          <div className="staff-receipt-section-title-v190">PAYMENT DETAILS</div>
          <div className="receipt-meta">
            <div className="meta-row">
              <span>Receipt number</span>
              <span>{receipt.receipt_number}</span>
            </div>
            <div className="meta-row">
              <span>Order number</span>
              <span>{receipt.order_number}</span>
            </div>
            {receipt.blueprint_title && (
              <div className="meta-row">
                <span>Project</span>
                <span>{receipt.blueprint_title}</span>
              </div>
            )}
            <div className="meta-row">
              <span>Customer</span>
              <span>{receipt.issued_to}</span>
            </div>
            <div className="meta-row">
              <span>Date and time</span>
              <span>
                {receiptDate ? new Date(receiptDate).toLocaleString("en-PH") : "—"}
              </span>
            </div>
            <div className="meta-row">
              <span>Payment method</span>
              <span>{paymentMethodLabel}</span>
            </div>
            <div className="meta-row">
              <span>Payment type</span>
              <span>{paymentLabelText}</span>
            </div>
            <div className="meta-row">
              <span>Processed by</span>
              <span>{receipt.processor_display}</span>
            </div>
            <div className="meta-row">
              <span>Payment status</span>
              <span style={{ color: isFullyPaid ? "#059669" : "#b45309" }}>
                {receipt.payment_status}
              </span>
            </div>
          </div>

          <div className="receipt-divider" />

          {/* Payment progress */}
          <div className="staff-receipt-section-title-v190">PAYMENT SUMMARY</div>
          <div className="receipt-totals staff-receipt-summary-v190">
            <div className="total-row">
              <span>Project total</span>
              <span>{formatMoney(receipt.total_amount)}</span>
            </div>
            <div className="total-row">
              <span>Previous verified payments</span>
              <span>{formatMoney(receipt.previous_paid_amount)}</span>
            </div>
            <div className="total-row staff-payment-received-v190">
              <span>Payment received</span>
              <span>{formatMoney(receipt.amount_paid)}</span>
            </div>
            <div className="total-row">
              <span>Total paid</span>
              <span>{formatMoney(receipt.total_paid_after)}</span>
            </div>
            <div className="total-row grand staff-remaining-balance-v190">
              <span>Remaining balance</span>
              <span>{formatMoney(receipt.remaining_balance_after)}</span>
            </div>

            {receipt.provider_reference && (
              <div
                className="meta-row staff-payment-reference-v192"
                style={{ marginTop: 12 }}
              >
                <span>Payment reference</span>
                <span>{receipt.provider_reference}</span>
              </div>
            )}
          </div>

          <div className="receipt-divider" />

          {/* Footer */}
          <div className="receipt-footer staff-receipt-footer-v190">
            <p style={{ fontWeight: 800, color: "#18181b" }}>
              {receipt.business?.thank_you_message?.trim() ||
                "Thank you for your payment!"}
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
  background: "#18181b",
  color: "#fff",
  border: "1px solid #18181b",
  borderRadius: 0,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
  transition: "background 0.2s",
};

const btnGhost = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "10px 16px",
  background: "#f4f4f5",
  color: "#18181b",
  border: "1px solid #e4e4e7",
  borderRadius: 0,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
  transition: "background 0.2s",
};