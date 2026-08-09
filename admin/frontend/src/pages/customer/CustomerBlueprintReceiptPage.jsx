import { useEffect, useState } from "react";
import api, { buildAssetUrl } from "../../services/api";
import { useParams, useNavigate } from "react-router-dom";
import { Printer, ArrowLeft } from "lucide-react";
import "../staff/ReceiptPage.css";

const PAYMENT_METHOD_LABELS = {
  cash: "Cash",
  paymongo: "Online Payment",
  gcash: "GCash",
  bank_transfer: "Bank Transfer",
};

const PAYMENT_LABEL_TEXT = {
  down_payment: "Down Payment",
  partial_payment: "Partial Payment",
  balance_payment: "Balance Payment",
  full_payment: "Full Payment",
};

const RECEIPT_LOGO_FALLBACK = `${process.env.PUBLIC_URL || ""}/logo192.png`;

const handleReceiptLogoError = (event) => {
  const image = event.currentTarget;

  if (image.dataset.receiptFallbackApplied === "true") {
    image.style.display = "none";
    return;
  }

  image.dataset.receiptFallbackApplied = "true";
  image.src = RECEIPT_LOGO_FALLBACK;
};

const formatMoney = (value) =>
  `₱${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
  })}`;

export default function CustomerBlueprintReceiptPage() {
  const { id, receiptId } = useParams();
  const navigate = useNavigate();
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;
    const fetchReceipt = async () => {
      setLoading(true);
      try {
        const { data } = await api.get(
          `/customer/custom-orders/${id}/receipts/${receiptId}`,
        );
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
  }, [id, receiptId]);

  if (loading) return <div className="loading-screen">Loading receipt...</div>;
  if (!receipt)
    return (
      <div className="page-header" style={{ marginTop: 96 }}>
        <p>{error || "Receipt not found."}</p>
        <button style={btnGhost} onClick={() => navigate(`/custom-requests/${id}`)}>
          <ArrowLeft size={16} /> Back to Order
        </button>
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
    <div style={{ fontFamily: "'Inter', sans-serif" }}>
      <div
        className="page-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          flexWrap: "wrap",
          gap: "16px",
          marginTop: 96,
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
            onClick={() => navigate(`/custom-requests/${id}`)}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#e4e4e7")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "#f4f4f5")}
          >
            <ArrowLeft size={16} /> Back to Order
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
              src={
                buildAssetUrl(receipt.business?.site_logo) ||
                RECEIPT_LOGO_FALLBACK
              }
              alt="Spiral Wood Services logo"
              className="receipt-logo"
              onError={handleReceiptLogoError}
            />
            <h2 className="biz-name">
              {receipt.business?.business_name || "Spiral Wood Services"}
            </h2>
            <p className="biz-info">{receipt.business?.business_address || ""}</p>
            <p className="biz-info">{receipt.business?.business_phone || ""}</p>
            <div className="receipt-divider" />
            <p className="receipt-title">BLUEPRINT PAYMENT RECEIPT</p>
          </div>

          {/* Meta */}
          <div className="receipt-meta">
            <div className="meta-row">
              <span>Receipt #:</span>
              <span>{receipt.receipt_number}</span>
            </div>
            <div className="meta-row">
              <span>Order #:</span>
              <span>{receipt.order_number}</span>
            </div>
            {receipt.blueprint_title && (
              <div className="meta-row">
                <span>Project:</span>
                <span>{receipt.blueprint_title}</span>
              </div>
            )}
            <div className="meta-row">
              <span>Customer:</span>
              <span>{receipt.issued_to}</span>
            </div>
            <div className="meta-row">
              <span>Date:</span>
              <span>
                {receiptDate ? new Date(receiptDate).toLocaleString("en-PH") : "—"}
              </span>
            </div>
            <div className="meta-row">
              <span>Payment Method:</span>
              <span>{paymentMethodLabel}</span>
            </div>
            <div className="meta-row">
              <span>Payment Type:</span>
              <span>{paymentLabelText}</span>
            </div>
            <div className="meta-row">
              <span>Processed By:</span>
              <span>{receipt.processor_display}</span>
            </div>
            <div className="meta-row">
              <span>Status:</span>
              <span style={{ color: isFullyPaid ? "#059669" : "#b45309" }}>
                {receipt.payment_status}
              </span>
            </div>
          </div>

          <div className="receipt-divider" />

          {/* Payment progress */}
          <div className="receipt-totals">
            <div className="total-row">
              <span>Project Total</span>
              <span>{formatMoney(receipt.total_amount)}</span>
            </div>
            <div className="total-row">
              <span>Previous Verified Payments</span>
              <span>{formatMoney(receipt.previous_paid_amount)}</span>
            </div>
            <div className="total-row" style={{ fontWeight: "bold" }}>
              <span>Payment Received (this receipt)</span>
              <span>{formatMoney(receipt.amount_paid)}</span>
            </div>
            <div className="total-row">
              <span>Total Paid After This Payment</span>
              <span>{formatMoney(receipt.total_paid_after)}</span>
            </div>
            <div className="total-row grand">
              <span>Remaining Balance</span>
              <span>{formatMoney(receipt.remaining_balance_after)}</span>
            </div>

            {receipt.provider_reference && (
              <div className="meta-row" style={{ marginTop: 12 }}>
                <span>Reference #:</span>
                <span>{receipt.provider_reference}</span>
              </div>
            )}
          </div>

          <div className="receipt-divider" />

          {/* Footer */}
          <div className="receipt-footer">
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
              System-generated blueprint payment receipt.
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
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
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
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
  transition: "background 0.2s",
};