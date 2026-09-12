import { useEffect, useState } from "react";
import api from "../../services/api";
import receiptLogo from "../../pages/customer/spiral-wood-receipt-logo-v172.png";
import { downloadDeliveryReceiptPdf } from "../../utils/deliveryReceiptPdf";
import "./DeliveryReceiptModal.css";

const OFFICIAL_BUSINESS_ADDRESS =
  "8 Laot Street, Near Gavino, Prenza I, Marilao, 3019 Bulacan";

const formatReceiptDateTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};


const formatUnit = (value) => {
  const unit = String(value || "").trim();
  if (!unit) return "pc";
  return unit.toLowerCase() === "pc(s)" ? "pc" : unit;
};
const formatRecipientType = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "authorized_representative") return "Authorized Representative";
  if (normalized === "customer") return "Customer";
  return "—";
};

export default function DeliveryReceiptModal({ receipt, onClose }) {
  const [downloadState, setDownloadState] = useState({ loading: false, error: "" });

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!receipt) return null;

  const items = Array.isArray(receipt.items) ? receipt.items : [];
  const showItemCode = items.some((item) => String(item?.client_code || "").trim());
  const signaturePresent = Boolean(receipt.signature_present && receipt.signature_data);
  const totalItems = Number.isFinite(Number(receipt.total_items))
    ? Number(receipt.total_items)
    : items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

  const handleDownload = async () => {
    if (downloadState.loading) return;
    setDownloadState({ loading: true, error: "" });
    try {
      await downloadDeliveryReceiptPdf(receipt);
      setDownloadState({ loading: false, error: "" });
    } catch (error) {
      setDownloadState({
        loading: false,
        error: error?.message || "Failed to download the Delivery Receipt.",
      });
    }
  };

  return (
    <div
      className="delivery-receipt-modal-shell"
      role="dialog"
      aria-modal="true"
      aria-label="Delivery Receipt"
      onClick={onClose}
    >
      <div
        className="delivery-receipt-modal-card"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="delivery-receipt-modal-actions">
          <div className="delivery-receipt-modal-action-status">
            {downloadState.error ? (
              <span className="delivery-receipt-load-error" role="alert">
                {downloadState.error}
              </span>
            ) : null}
          </div>
          <button
            type="button"
            className="delivery-receipt-action-btn"
            onClick={handleDownload}
            disabled={downloadState.loading}
          >
            {downloadState.loading ? "Preparing PDF..." : "Download Delivery Receipt"}
          </button>
          <button
            type="button"
            className="delivery-receipt-action-btn delivery-receipt-action-btn-secondary"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <article className="delivery-receipt-print-root">
          <header className="delivery-receipt-header-grid">
            <div className="delivery-receipt-brand-cell">
              <img src={receiptLogo} alt="Spiral Wood Services" className="delivery-receipt-logo" />
              <div>
                <div className="delivery-receipt-company">SPIRAL WOOD SERVICES</div>
                <div className="delivery-receipt-address">{OFFICIAL_BUSINESS_ADDRESS}</div>
              </div>
            </div>
            <div className="delivery-receipt-title-cell">
              <div className="delivery-receipt-title">DELIVERY RECEIPT</div>
              <div className="delivery-receipt-dr-row">
                <span>DR No.</span>
                <strong>{receipt.receipt_number || "—"}</strong>
              </div>
            </div>
          </header>

          <section className="delivery-receipt-party-grid">
            <div className="delivery-receipt-label-cell">DELIVER TO</div>
            <div className="delivery-receipt-value-cell delivery-receipt-grow">
              <strong>{receipt.customer_name || "—"}</strong>
              <div>{receipt.delivery_address || "—"}</div>
            </div>
            <div className="delivery-receipt-label-cell">ORDER NO.</div>
            <div className="delivery-receipt-value-cell">
              <strong>{receipt.order_number || "—"}</strong>
            </div>
          </section>

          <section className="delivery-receipt-meta-grid">
            <div className="delivery-receipt-meta-cell">
              <span>DELIVERY DATE</span>
              <strong>{formatReceiptDateTime(receipt.delivered_at || receipt.acknowledged_at)}</strong>
            </div>
            <div className="delivery-receipt-meta-cell">
              <span>DELIVERY REPRESENTATIVE</span>
              <strong>{receipt.driver_name || receipt.recorded_by_name || "Assigned Rider"}</strong>
            </div>
            <div className="delivery-receipt-meta-cell">
              <span>CUSTOMER CONTACT</span>
              <strong>{receipt.customer_phone || "—"}</strong>
            </div>
          </section>

          <section className="delivery-receipt-items-section">
            <table
              className={`delivery-receipt-table ${
                showItemCode
                  ? "delivery-receipt-table-with-code"
                  : "delivery-receipt-table-without-code"
              }`}
            >
              <thead>
                <tr>
                  {showItemCode ? <th>ITEM CODE</th> : null}
                  <th>QUANTITY</th>
                  <th>UNIT</th>
                  <th>DESCRIPTION</th>
                </tr>
              </thead>
              <tbody>
                {items.length ? (
                  items.map((item, index) => (
                    <tr key={`${item.client_code || item.description || "item"}-${index}`}>
                      {showItemCode ? <td>{item.client_code || "—"}</td> : null}
                      <td className="delivery-receipt-center">{Number(item.quantity || 0)}</td>
                      <td className="delivery-receipt-center">{formatUnit(item.unit)}</td>
                      <td>{item.description || "Item"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={showItemCode ? 4 : 3} className="delivery-receipt-empty">
                      No item snapshot is available for this receipt.
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={showItemCode ? 3 : 2}>TOTAL ITEMS</td>
                  <td className="delivery-receipt-total-items">{totalItems}</td>
                </tr>
              </tfoot>
            </table>
          </section>

          <section className="delivery-receipt-turnover-grid">
            <div className="delivery-receipt-turnover-cell">
              <span>RECORDED BY</span>
              <strong>{receipt.recorded_by_name || receipt.captured_by_name || "Assigned Rider"}</strong>
              <small>Company Representative</small>
            </div>
            <div className="delivery-receipt-turnover-cell">
              <span>RECEIVED BY</span>
              <strong>{receipt.received_by_name || "—"}</strong>
              <small>{formatRecipientType(receipt.recipient_type)}</small>
            </div>
            <div className="delivery-receipt-turnover-cell">
              <span>RECEIVED ON</span>
              <strong>{formatReceiptDateTime(receipt.acknowledged_at)}</strong>
              <small>{receipt.proof_of_delivery_recorded ? "Proof of Delivery recorded" : "Proof of Delivery unavailable"}</small>
            </div>
          </section>

          <section className="delivery-receipt-acknowledgement-box">
            <div className="delivery-receipt-box-heading">RECIPIENT ACKNOWLEDGEMENT</div>
            <div className="delivery-receipt-box-body">
              {receipt.acknowledgement_text ||
                "I acknowledge receipt of this order at the delivery address."}
            </div>
            {receipt.note ? (
              <div className="delivery-receipt-note-row">
                <span>NOTE</span>
                <strong>{receipt.note}</strong>
              </div>
            ) : null}
          </section>

          <section className="delivery-receipt-signature-grid">
            <div className="delivery-receipt-box-heading">RECIPIENT E-SIGNATURE (OPTIONAL)</div>
            <div className="delivery-receipt-signature-body">
              {signaturePresent ? (
                <img src={receipt.signature_data} alt="Recipient e-signature" />
              ) : (
                <div className="delivery-receipt-signature-empty">
                  No e-signature was captured. Recipient acknowledgement and Proof of Delivery remain recorded.
                </div>
              )}
            </div>
          </section>

          <footer className="delivery-receipt-footer">
            <div>
              This receipt confirms the recorded delivery handoff for the order shown above.
            </div>
            <div>
              <strong>{receipt.receipt_number || "—"}</strong>
              <br />Issued {formatReceiptDateTime(receipt.issued_at || receipt.acknowledged_at)}
            </div>
          </footer>
        </article>
      </div>
    </div>
  );
}

export function DeliveryReceiptButton({
  endpoint,
  label = "View Delivery Receipt",
  className = "",
  style,
  disabled = false,
}) {
  const [state, setState] = useState({ loading: false, receipt: null, error: "" });

  const openReceipt = async () => {
    if (!endpoint || disabled || state.loading) return;
    setState({ loading: true, receipt: null, error: "" });
    try {
      const { data } = await api.get(endpoint);
      setState({ loading: false, receipt: data, error: "" });
    } catch (error) {
      setState({
        loading: false,
        receipt: null,
        error: error?.response?.data?.message || "Failed to load the Delivery Receipt.",
      });
    }
  };

  return (
    <>
      <button
        type="button"
        className={className}
        style={style}
        disabled={disabled || state.loading}
        onClick={openReceipt}
      >
        {state.loading ? "Loading Receipt..." : label}
      </button>

      {state.error ? (
        <span className="delivery-receipt-load-error" role="alert">
          {state.error}
        </span>
      ) : null}

      {state.receipt ? (
        <DeliveryReceiptModal
          receipt={state.receipt}
          onClose={() => setState((current) => ({ ...current, receipt: null, error: "" }))}
        />
      ) : null}
    </>
  );
}
