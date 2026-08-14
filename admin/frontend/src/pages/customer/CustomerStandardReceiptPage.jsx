import { useEffect, useState } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../../services/api";
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
  partial_payment: "Partial Payment",
  balance_payment: "Balance Payment",
  full_payment: "Full Payment",
};

const formatMoney = (value) =>
  `₱${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default function CustomerStandardReceiptPage() {
  const { id, receiptId } = useParams();
  const navigate = useNavigate();
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    const loadReceipt = async () => {
      setLoading(true);

      try {
        const { data } = await api.get(
          `/customer/orders/${id}/receipts/${receiptId}`,
        );

        if (mounted) {
          setReceipt(data);
          setError("");
        }
      } catch (err) {
        if (mounted) {
          setReceipt(null);
          setError(
            err?.response?.data?.message ||
              "Failed to load receipt.",
          );
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadReceipt();

    return () => {
      mounted = false;
    };
  }, [id, receiptId]);

  const backToOrder = () => {
    navigate(`/orders?focus_order_id=${id}`);
  };

  if (loading) {
    return <div className="loading-screen">Loading receipt...</div>;
  }

  if (!receipt) {
    return (
      <div className="page-header" style={{ marginTop: 96 }}>
        <p>{error || "Receipt not found."}</p>
        <button style={btnGhost} onClick={backToOrder}>
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

  const paymentFor =
    PAYMENT_LABEL_TEXT[receipt.payment_label] ||
    receipt.payment_label ||
    "Payment";

  const receiptDate = receipt.created_at || receipt.printed_at;
  const items = Array.isArray(receipt.items)
    ? receipt.items
    : [];

  return (
    <div className="customer-receipt-page-v172">
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

        <div
          style={{
            display: "flex",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <button style={btnGhost} onClick={backToOrder}>
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
            <p className="biz-info">
              {receipt.business?.business_phone || ""}
            </p>
            <div className="receipt-divider" />
            <p className="receipt-title">PAYMENT RECEIPT</p>
          </div>

          <div className="receipt-meta">
            <div className="meta-row">
              <span>Receipt number</span>
              <span>{receipt.receipt_number}</span>
            </div>

            <div className="meta-row">
              <span>Order number</span>
              <span>{receipt.order_number}</span>
            </div>

            <div className="meta-row">
              <span>Customer</span>
              <span>{receipt.issued_to}</span>
            </div>

            <div className="meta-row">
              <span>Payment date</span>
              <span>
                {receiptDate
                  ? new Date(receiptDate).toLocaleString("en-PH")
                  : "—"}
              </span>
            </div>

            <div className="meta-row">
              <span>Payment method</span>
              <span>{paymentMethodLabel}</span>
            </div>

            <div className="meta-row">
              <span>Payment for</span>
              <span>{paymentFor}</span>
            </div>

            <div className="meta-row">
              <span>Payment status</span>
              <span>{receipt.payment_status}</span>
            </div>
          </div>

          {items.length > 0 && (
            <>
              <div className="receipt-divider" />

              <table className="receipt-items">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th style={{ textAlign: "center" }}>Qty</th>
                    <th style={{ textAlign: "right" }}>
                      Price
                    </th>
                    <th style={{ textAlign: "right" }}>
                      Subtotal
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {items.map((item, index) => {
                    const quantity = Number(
                      item.quantity || 0,
                    );
                    const unitPrice = Number(
                      item.unit_price || 0,
                    );

                    return (
                      <tr key={index}>
                        <td>{item.product_name || "Item"}</td>
                        <td style={{ textAlign: "center" }}>
                          {quantity}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {formatMoney(unitPrice)}
                        </td>
                        <td
                          style={{
                            textAlign: "right",
                            fontWeight: 600,
                          }}
                        >
                          {formatMoney(
                            unitPrice * quantity,
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </>
          )}

          <div className="receipt-divider" />

          <div className="receipt-totals">
            <div className="total-row">
              <span>Order total</span>
              <span>
                {formatMoney(receipt.total_amount)}
              </span>
            </div>

            <div className="total-row customer-payment-received-v172">
              <span>Payment received</span>
              <span>
                {formatMoney(receipt.amount_paid)}
              </span>
            </div>

            <div className="total-row">
              <span>Total paid</span>
              <span>
                {formatMoney(receipt.total_paid_after)}
              </span>
            </div>

            <div className="total-row grand customer-remaining-balance-v172">
              <span>Remaining balance</span>
              <span>
                {formatMoney(
                  receipt.remaining_balance_after,
                )}
              </span>
            </div>

            {receipt.provider_reference && (
              <div
                className="meta-row"
                style={{ marginTop: 12 }}
              >
                <span>Payment reference</span>
                <span>{receipt.provider_reference}</span>
              </div>
            )}
          </div>

          <div className="receipt-divider" />

          <div className="receipt-footer">
            <p className="customer-receipt-thanks-v172">
              {receipt.business?.thank_you_message ||
                "Thank you for your payment."}
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
  color: "#ffffff",
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
