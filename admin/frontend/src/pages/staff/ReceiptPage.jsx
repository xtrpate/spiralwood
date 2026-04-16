import { useState, useEffect } from "react";
import api, { buildAssetUrl } from "../../services/api";
import { useParams, useNavigate } from "react-router-dom";
import { Printer, ArrowLeft } from "lucide-react";
import "./ReceiptPage.css";

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

  const subtotal = Number(receipt.subtotal ?? 0);
  const discount = Number(receipt.discount ?? 0);
  const total = Number(receipt.total ?? 0);

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
      ? cashReceived !== null
        ? Math.max(0, cashReceived - total)
        : backendChange
      : 0;

  const receiptDate = receipt.created_at || receipt.printed_at;

  return (
    <div>
      <div
        className="page-header"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <h1>Official Receipt</h1>
          <p>Receipt #{receipt.receipt_number}</p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            className="btn btn-secondary"
            onClick={() => navigate("/staff/products")}
          >
            <ArrowLeft size={16} /> Back
          </button>
          <button className="btn btn-primary" onClick={() => window.print()}>
            <Printer size={16} /> Print Receipt
          </button>
        </div>
      </div>

      <div className="receipt-wrapper">
        <div className="receipt" id="receipt-print">
          {/* Header */}
          <div className="receipt-header">
            {receipt.business?.site_logo && (
              <img
                src={buildAssetUrl(receipt.business.site_logo)}
                alt="logo"
                className="receipt-logo"
              />
            )}
            <h2 className="biz-name">
              {receipt.business?.business_name || "Spiral Wood Services"}
            </h2>
            <p className="biz-info">
              {receipt.business?.business_address || ""}
            </p>
            <p className="biz-info">{receipt.business?.business_phone || ""}</p>
            <div className="receipt-divider" />
            <p className="receipt-title">OFFICIAL RECEIPT</p>
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
            <div className="meta-row">
              <span>Date:</span>
              <span>
                {receiptDate
                  ? new Date(receiptDate).toLocaleString("en-PH")
                  : "—"}
              </span>
            </div>
            <div className="meta-row">
              <span>Customer:</span>
              <span>{receipt.walkin_customer_name || "Walk-in Customer"}</span>
            </div>
            <div className="meta-row">
              <span>Payment:</span>
              <span style={{ textTransform: "capitalize" }}>
                {paymentMethod.replace("_", " ") || "N/A"}
              </span>
            </div>
            {receipt.walkin_customer_phone && (
              <div className="meta-row">
                <span>Phone:</span>
                <span>{receipt.walkin_customer_phone}</span>
              </div>
            )}
            <div className="meta-row">
              <span>Cashier:</span>
              <span>{receipt.staff_name}</span>
            </div>
          </div>

          <div className="receipt-divider" />

          {/* Items */}
          <table className="receipt-items">
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
                    {item.wood_type && (
                      <div style={{ fontSize: "10px", color: "#666" }}>
                        {item.wood_type}
                      </div>
                    )}
                  </td>
                  <td style={{ textAlign: "center" }}>{item.quantity}</td>
                  <td style={{ textAlign: "right" }}>
                    ₱
                    {parseFloat(item.unit_price).toLocaleString("en-PH", {
                      minimumFractionDigits: 2,
                    })}
                  </td>
                  <td style={{ textAlign: "right" }}>
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
          <div className="receipt-totals">
            <div className="total-row">
              <span>Subtotal</span>
              <span>
                ₱
                {subtotal.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
              </span>
            </div>

            {discount > 0 && (
              <div className="total-row" style={{ color: "#2e7d32" }}>
                <span>Discount</span>
                <span>
                  -₱
                  {discount.toLocaleString("en-PH", {
                    minimumFractionDigits: 2,
                  })}
                </span>
              </div>
            )}

            <div className="total-row grand">
              <span>TOTAL</span>
              <span>
                ₱{total.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
              </span>
            </div>

            {paymentMethod === "cash" && (
              <div className="total-row">
                <span>Cash Received</span>
                <span>
                  {cashReceived !== null
                    ? `₱${cashReceived.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`
                    : "—"}
                </span>
              </div>
            )}

            {paymentMethod === "cash" && (
              <div className="total-row" style={{ fontWeight: "bold" }}>
                {/* 👉 RULE 8: Explicitly labeled Sukli */}
                <span>Change (Sukli)</span>
                <span>
                  ₱
                  {change.toLocaleString("en-PH", { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}

            {receipt.payment_method === "gcash" &&
              receipt.business?.gcash_number && (
                <div className="meta-row" style={{ marginTop: 10 }}>
                  <span>GCash #:</span>
                  <span>{receipt.business.gcash_number}</span>
                </div>
              )}
          </div>

          <div className="receipt-divider" />

          {/* Footer */}
          <div className="receipt-footer">
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
            <p>Thank you for your purchase!</p>
            <p style={{ fontSize: 11, color: "#aaa", marginTop: 4 }}>
              This is your official receipt. Items sold are non-refundable
              unless covered by warranty.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
