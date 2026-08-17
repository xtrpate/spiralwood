import { useEffect, useState } from "react";
import api from "../../services/api";
import { useParams, useNavigate } from "react-router-dom";
import { Printer, ArrowLeft } from "lucide-react";
import "../staff/ReceiptPage.css";
import receiptBrandLogoV172 from "./spiral-wood-receipt-logo-v172.png";
import "./customer-blueprint-receipt-v172.css";

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

const formatMoney = (value) =>
  `₱${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatReceiptDate = (value) => {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-PH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
};

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
          setError(
            err.response?.data?.message ||
              "Failed to load receipt.",
          );
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

  if (loading) {
    return <div className="loading-screen">Loading receipt...</div>;
  }

  if (!receipt) {
    return (
      <div className="page-header" style={{ marginTop: 96 }}>
        <p>{error || "Receipt not found."}</p>
        <button
          style={btnGhost}
          onClick={() => navigate(`/custom-requests/${id}`)}
        >
          <ArrowLeft size={16} /> Back to order
        </button>
      </div>
    );
  }

  const paymentMethod = String(
    receipt.payment_method_snapshot || "",
  )
    .trim()
    .toLowerCase();

  const paymentMethodLabel =
    PAYMENT_METHOD_LABELS[paymentMethod] ||
    (paymentMethod
      ? paymentMethod.replace(/_/g, " ")
      : "N/A");

  const paymentLabelText =
    PAYMENT_LABEL_TEXT[receipt.payment_label] ||
    receipt.payment_label ||
    "Payment";

  const receiptDate = receipt.created_at || receipt.printed_at;

  return (
    <div className="customer-receipt-page-v172 customer-receipt-v180">
      <div
        className="page-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          flexWrap: "wrap",
          gap: 16,
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
            Payment Receipt
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
            onClick={() => navigate(`/custom-requests/${id}`)}
          >
            <ArrowLeft size={16} /> Back to order
          </button>

          <button
            style={btnPrimary}
            onClick={() => window.print()}
          >
            <Printer size={16} /> Print receipt
          </button>
        </div>
      </div>

      <div className="receipt-wrapper">
        <div className="receipt" id="receipt-print">
          <div className="receipt-header">
            <img
              src={receiptBrandLogoV172}
              alt="Spiral Wood Services"
              className="receipt-logo receipt-logo-customer-v172"
            />

            <p className="biz-info">
              {receipt.business?.business_address || ""}
            </p>
            {receipt.business?.business_phone ? (
              <p className="biz-info">
                {receipt.business.business_phone}
              </p>
            ) : null}

            <div className="receipt-divider" />

            <div className="customer-receipt-document-v180">
              <p className="receipt-title">PAYMENT RECEIPT</p>
              <p className="customer-receipt-copy-v180">
                CUSTOMER COPY
              </p>
            </div>
          </div>

          <section className="customer-receipt-section-v180">
            <div className="meta-row">
              <span>Receipt number</span>
              <span>{receipt.receipt_number}</span>
            </div>

            <div className="meta-row">
              <span>Order number</span>
              <span>{receipt.order_number}</span>
            </div>

            <div className="meta-row">
              <span>Date and time</span>
              <span>{formatReceiptDate(receiptDate)}</span>
            </div>

            <div className="meta-row">
              <span>Customer</span>
              <span>{receipt.issued_to || "—"}</span>
            </div>

            {receipt.blueprint_title && (
              <div className="meta-row">
                <span>Project</span>
                <span>{receipt.blueprint_title}</span>
              </div>
            )}
          </section>

          <div className="receipt-divider" />

          <section className="customer-receipt-section-v180">
            <div className="customer-receipt-section-title-v180">
              PAYMENT DETAILS
            </div>

            <div className="meta-row">
              <span>Payment method</span>
              <span>{paymentMethodLabel}</span>
            </div>

            <div className="meta-row">
              <span>Payment for</span>
              <span>{paymentLabelText}</span>
            </div>

            <div className="meta-row">
              <span>Payment status</span>
              <span>{receipt.payment_status || "—"}</span>
            </div>

            {receipt.provider_reference && (
              <div className="meta-row">
                <span>Payment reference</span>
                <span>{receipt.provider_reference}</span>
              </div>
            )}
          </section>

          <div className="receipt-divider" />

          <section className="receipt-totals customer-receipt-summary-v180">
            <div className="customer-receipt-section-title-v180">
              PAYMENT SUMMARY
            </div>

            <div className="total-row">
              <span>Project total</span>
              <span>{formatMoney(receipt.total_amount)}</span>
            </div>

            <div className="total-row customer-payment-received-v172 customer-payment-received-v180">
              <span>Payment received</span>
              <span>{formatMoney(receipt.amount_paid)}</span>
            </div>

            <div className="total-row">
              <span>Total paid</span>
              <span>{formatMoney(receipt.total_paid_after)}</span>
            </div>

            <div className="total-row grand customer-remaining-balance-v172 customer-remaining-balance-v180">
              <span>Remaining balance</span>
              <span>{formatMoney(receipt.remaining_balance_after)}</span>
            </div>
          </section>

          <div className="receipt-divider" />

          <div className="receipt-footer customer-receipt-footer-v180">
            <p className="customer-receipt-thanks-v172">
              {receipt.business?.thank_you_message ||
                "Thank you for your payment."}
            </p>
            <p className="customer-receipt-keep-v180">
              Please keep this receipt for your records.
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
};
