// WISDOM RIDER HISTORY UI V3.0
import { useEffect, useMemo, useState } from "react";
import {
  Clock3,
  FileText,
  MapPin,
  Navigation,
  X,
} from "lucide-react";
import api, { buildAssetUrl } from "../../services/api";
import DeliveryReceiptModal from "../../components/delivery/DeliveryReceiptModal";
import DownloadFileButton from "../../components/delivery/DownloadFileButton";
import "./RiderScreen.css";

const PAGE_SIZE = 25;

const normalize = (value) => String(value || "").trim().toLowerCase();

const isSuccessfulDeliveryResult = (status) =>
  ["delivered", "completed"].includes(normalize(status));

const getHistoryResult = (record = {}) =>
  normalize(record.history_result || record.status);

const parseCoordinate = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const getPinnedMapHref = (record = {}) => {
  const lat = parseCoordinate(record.delivery_lat);
  const lng = parseCoordinate(record.delivery_lng);

  if (
    lat === null ||
    lng === null ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return null;
  }

  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
};

const formatDateTime = (value) => {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";

  return date.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const formatRecipientType = (value) => {
  const normalized = normalize(value);
  if (normalized === "customer") return "Customer";
  if (normalized === "authorized_representative") {
    return "Authorized Representative";
  }
  return "Not available";
};

const getRecordDate = (record) =>
  isSuccessfulDeliveryResult(getHistoryResult(record))
    ? record.delivered_date || record.updated_at
    : record.updated_at;

const getProofFilename = (record = {}) => {
  const orderNumber = String(record.order_number || `delivery-${record.delivery_id || "proof"}`)
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "_");
  const cleanUrl = String(record.signed_receipt || "").split("?")[0];
  const extensionMatch = cleanUrl.match(/\.(jpg|jpeg|jfif|png|webp|pdf)$/i);
  const extension = extensionMatch ? extensionMatch[0].toLowerCase() : "";
  return `Proof_of_Delivery_${orderNumber}${extension}`;
};

const emptyPagination = {
  page: 1,
  limit: PAGE_SIZE,
  total: 0,
  total_pages: 1,
};

export default function RiderHistory() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(emptyPagination);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [receiptDetail, setReceiptDetail] = useState({
    deliveryId: null,
    loading: false,
    data: null,
    error: "",
  });
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [signatureViewer, setSignatureViewer] = useState({
    open: false,
    loading: false,
    data: null,
    error: "",
  });

  useEffect(() => {
    if (startDate && endDate && startDate > endDate) {
      setLoading(false);
      setHistory([]);
      setPagination({ ...emptyPagination, page: 1 });
      setError("From date cannot be later than To date.");
      return undefined;
    }

    let active = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError("");

      try {
        const response = await api.get("/pos/deliveries/history", {
          params: {
            paged: 1,
            page,
            limit: PAGE_SIZE,
            search: search.trim() || undefined,
            status: statusFilter,
            from: startDate || undefined,
            to: endDate || undefined,
          },
        });

        if (!active) return;

        const payload = response.data;
        const records = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.records)
            ? payload.records
            : [];
        const serverPagination =
          payload && !Array.isArray(payload) && payload.pagination
            ? payload.pagination
            : {
                page,
                limit: PAGE_SIZE,
                total: records.length,
                total_pages: 1,
              };

        setHistory(records);
        setPagination({
          page: Number(serverPagination.page || page),
          limit: Number(serverPagination.limit || PAGE_SIZE),
          total: Number(serverPagination.total || 0),
          total_pages: Math.max(1, Number(serverPagination.total_pages || 1)),
        });
      } catch (err) {
        if (!active) return;
        console.error("Failed to load delivery history", err);
        setHistory([]);
        setPagination({ ...emptyPagination, page });
        setError(
          err?.response?.data?.message || "Failed to load delivery history.",
        );
      } finally {
        if (active) setLoading(false);
      }
    }, search.trim() ? 250 : 0);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [search, statusFilter, startDate, endDate, page]);

  useEffect(() => {
    const deliveryId = Number(selectedRecord?.delivery_id || 0);
    const receiptNumber = String(
      selectedRecord?.delivery_receipt_number || "",
    ).trim();

    setReceiptModalOpen(false);

    if (!deliveryId || !receiptNumber) {
      setReceiptDetail({
        deliveryId: deliveryId || null,
        loading: false,
        data: null,
        error: "",
      });
      return undefined;
    }

    let active = true;
    setReceiptDetail({
      deliveryId,
      loading: true,
      data: null,
      error: "",
    });

    api
      .get(`/pos/deliveries/${deliveryId}/receipt`)
      .then(({ data }) => {
        if (!active) return;
        setReceiptDetail({
          deliveryId,
          loading: false,
          data,
          error: "",
        });
      })
      .catch((err) => {
        if (!active) return;
        setReceiptDetail({
          deliveryId,
          loading: false,
          data: null,
          error:
            err?.response?.data?.message ||
            "The digital Delivery Receipt could not be loaded.",
        });
      });

    return () => {
      active = false;
    };
  }, [selectedRecord?.delivery_id, selectedRecord?.delivery_receipt_number]);

  const filters = [
    { value: "all", label: "All" },
    { value: "delivered", label: "Delivered" },
    { value: "failed", label: "Failed" },
  ];

  const selectedMapHref = selectedRecord
    ? getPinnedMapHref(selectedRecord)
    : null;

  const proofUrl = selectedRecord?.signed_receipt
    ? buildAssetUrl(selectedRecord.signed_receipt)
    : "";

  const receiptItems = useMemo(() => {
    if (!receiptDetail.data || !Array.isArray(receiptDetail.data.items)) {
      return [];
    }
    return receiptDetail.data.items;
  }, [receiptDetail.data]);

  const openRecord = (record) => {
    setSelectedRecord(record);
    setSignatureViewer({
      open: false,
      loading: false,
      data: null,
      error: "",
    });
  };

  const closeRecord = () => {
    setSelectedRecord(null);
    setReceiptModalOpen(false);
    setSignatureViewer({
      open: false,
      loading: false,
      data: null,
      error: "",
    });
  };

  const openSignature = async () => {
    const deliveryId = Number(selectedRecord?.delivery_id || 0);
    if (!deliveryId) return;

    if (receiptDetail.data?.signature_data) {
      setSignatureViewer({
        open: true,
        loading: false,
        data: receiptDetail.data,
        error: "",
      });
      return;
    }

    setSignatureViewer({
      open: true,
      loading: true,
      data: null,
      error: "",
    });

    try {
      const { data } = await api.get(
        `/pos/deliveries/${deliveryId}/acknowledgement`,
      );
      setSignatureViewer({
        open: true,
        loading: false,
        data,
        error: "",
      });
    } catch (err) {
      setSignatureViewer({
        open: true,
        loading: false,
        data: null,
        error:
          err?.response?.data?.message ||
          "Failed to load the recipient e-signature.",
      });
    }
  };

  return (
    <div className="rider-page-shell rider-history-v2">
      <header className="rider-v2-page-header">
        <div>
          <h2 className="rider-header-title">Delivery History</h2>
          <p className="rider-header-subtitle">
            Review your completed and failed delivery records.
          </p>
        </div>
      </header>

      <section className="rider-card rider-history-filters rider-history-filters-v22">
        <div className="rider-history-tabs">
          {filters.map((filter) => (
            <button
              type="button"
              key={filter.value}
              className={`rider-history-tab ${
                statusFilter === filter.value ? "is-active" : ""
              }`}
              onClick={() => {
                setStatusFilter(filter.value);
                setPage(1);
              }}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="rider-history-filter-grid rider-history-filter-grid-v22">
          <label className="rider-history-search-field">
            <span>Search</span>
            <input
              type="text"
              placeholder="Order, customer, or address"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </label>

          <label>
            <span>From</span>
            <input
              type="date"
              value={startDate}
              onChange={(event) => {
                setStartDate(event.target.value);
                setPage(1);
              }}
            />
          </label>

          <label>
            <span>To</span>
            <input
              type="date"
              value={endDate}
              onChange={(event) => {
                setEndDate(event.target.value);
                setPage(1);
              }}
            />
          </label>
        </div>
      </section>

      <section className="rider-card rider-history-records">
        <div className="rider-history-records-head">
          <div>
            <h3>Records</h3>
            <p>Newest delivery records are shown first.</p>
          </div>
          <span>{pagination.total} total</span>
        </div>

        {error ? (
          <div className="rider-history-error" role="alert">
            {error}
          </div>
        ) : loading ? (
          <div className="rider-history-empty">Loading history...</div>
        ) : history.length === 0 ? (
          <div className="rider-history-empty">
            No delivery records match these filters.
          </div>
        ) : (
          <>
            <div className="rider-table-scroll">
              <table className="rider-table rider-mobile-table rider-history-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Order</th>
                    <th>Customer</th>
                    <th>Destination</th>
                    <th>Result</th>
                    <th aria-label="Action" />
                  </tr>
                </thead>
                <tbody>
                  {history.map((record) => (
                    <tr key={record.delivery_id}>
                      <td data-label="Date">
                        {formatDateTime(getRecordDate(record))}
                      </td>
                      <td
                        data-label="Order"
                        className="rider-history-order"
                      >
                        {record.order_number || "—"}
                      </td>
                      <td data-label="Customer">
                        {record.customer_name || "Customer"}
                      </td>
                      <td
                        data-label="Destination"
                        className="rider-history-destination"
                      >
                        {record.address || "Address unavailable"}
                      </td>
                      <td data-label="Result">
                        <span
                          className={`rider-history-result ${
                            isSuccessfulDeliveryResult(getHistoryResult(record))
                              ? "is-delivered"
                              : ""
                          }`}
                        >
                          {isSuccessfulDeliveryResult(getHistoryResult(record))
                            ? "Delivered"
                            : "Failed"}
                        </span>
                      </td>
                      <td
                        data-label="Action"
                        className="rider-history-action-cell"
                      >
                        <button
                          type="button"
                          className="rider-v2-row-action"
                          onClick={() => openRecord(record)}
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pagination.total_pages > 1 ? (
              <div className="rider-history-pagination">
                <button
                  type="button"
                  className="rider-v2-btn rider-v2-btn-secondary"
                  disabled={loading || pagination.page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Previous
                </button>
                <span>
                  Page {pagination.page} of {pagination.total_pages}
                </span>
                <button
                  type="button"
                  className="rider-v2-btn rider-v2-btn-secondary"
                  disabled={loading || pagination.page >= pagination.total_pages}
                  onClick={() =>
                    setPage((current) =>
                      Math.min(pagination.total_pages, current + 1),
                    )
                  }
                >
                  Next
                </button>
              </div>
            ) : null}
          </>
        )}
      </section>

      {selectedRecord ? (
        <div
          className="rider-history-detail-overlay"
          onClick={closeRecord}
        >
          <aside
            className="rider-history-detail-panel"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="rider-history-detail-head">
              <div>
                <span>Delivery Record</span>
                <h3>{selectedRecord.order_number || "Order"}</h3>
                <p>{selectedRecord.customer_name || "Customer"}</p>
              </div>
              <button
                type="button"
                className="rider-history-close"
                aria-label="Close details"
                onClick={closeRecord}
              >
                <X size={18} strokeWidth={1.8} />
              </button>
            </div>

            <div className="rider-history-detail-status">
              <span
                className={`rider-history-result ${
                  isSuccessfulDeliveryResult(
                    getHistoryResult(selectedRecord),
                  )
                    ? "is-delivered"
                    : ""
                }`}
              >
                {isSuccessfulDeliveryResult(
                  getHistoryResult(selectedRecord),
                )
                  ? "Delivered"
                  : "Failed"}
              </span>
            </div>

            <div className="rider-history-detail-grid">
              <div className="rider-history-detail-item">
                <span>Destination</span>
                <strong>
                  {selectedRecord.address || "Address unavailable"}
                </strong>
              </div>

              <div className="rider-history-detail-item">
                <span>Scheduled</span>
                <strong>
                  {formatDateTime(selectedRecord.scheduled_date)}
                </strong>
              </div>

              <div className="rider-history-detail-item">
                <span>Assigned</span>
                <strong>
                  {formatDateTime(selectedRecord.assigned_at)}
                </strong>
              </div>

              <div className="rider-history-detail-item">
                <span>
                  {isSuccessfulDeliveryResult(
                    getHistoryResult(selectedRecord),
                  )
                    ? "Delivered"
                    : "Attempted"}
                </span>
                <strong>
                  {formatDateTime(getRecordDate(selectedRecord))}
                </strong>
              </div>
            </div>

            {isSuccessfulDeliveryResult(getHistoryResult(selectedRecord)) ? (
              <section className="rider-history-detail-section">
                <div className="rider-history-detail-section-title">
                  <FileText size={15} strokeWidth={1.8} />
                  Recipient Handoff
                </div>

                {selectedRecord.delivery_acknowledgement_id ? (
                  <div className="rider-history-handoff-grid">
                    <div>
                      <span>Received By</span>
                      <strong>
                        {selectedRecord.delivery_received_by_name ||
                          "Not available"}
                      </strong>
                    </div>
                    <div>
                      <span>Recipient</span>
                      <strong>
                        {formatRecipientType(
                          selectedRecord.delivery_recipient_type,
                        )}
                      </strong>
                    </div>
                    <div>
                      <span>Received On</span>
                      <strong>
                        {formatDateTime(
                          selectedRecord.delivery_acknowledged_at,
                        )}
                      </strong>
                    </div>
                    <div>
                      <span>Delivery Receipt</span>
                      <strong>
                        {selectedRecord.delivery_receipt_number ||
                          "Not available"}
                      </strong>
                    </div>
                  </div>
                ) : (
                  <p>
                    Recipient acknowledgement is not available for this older
                    delivery record.
                  </p>
                )}

                <div className="rider-history-detail-actions">
                  {Number(selectedRecord.delivery_has_signature || 0) === 1 ? (
                    <button
                      type="button"
                      className="rider-v2-btn rider-v2-btn-secondary"
                      onClick={openSignature}
                    >
                      View E-Signature
                    </button>
                  ) : null}

                  {selectedRecord.delivery_receipt_number ? (
                    <button
                      type="button"
                      className="rider-v2-btn rider-v2-btn-secondary"
                      disabled={receiptDetail.loading || !receiptDetail.data}
                      onClick={() => setReceiptModalOpen(true)}
                    >
                      {receiptDetail.loading
                        ? "Loading Receipt..."
                        : "View Delivery Receipt"}
                    </button>
                  ) : null}
                </div>

                {receiptDetail.error ? (
                  <div className="rider-history-inline-error" role="alert">
                    {receiptDetail.error}
                  </div>
                ) : null}
              </section>
            ) : null}

            {selectedRecord.delivery_receipt_number ? (
              <section className="rider-history-detail-section">
                <div className="rider-history-detail-section-title">
                  <FileText size={15} strokeWidth={1.8} />
                  Items Delivered
                </div>

                {receiptDetail.loading ? (
                  <p>Loading the frozen delivery item snapshot...</p>
                ) : receiptItems.length ? (
                  <div className="rider-history-items-list">
                    {receiptItems.map((item, index) => (
                      <div
                        className="rider-history-item-row"
                        key={`${item.client_code || item.description || "item"}-${index}`}
                      >
                        <div>
                          <strong>{item.description || "Item"}</strong>
                          {item.client_code ? (
                            <span>{item.client_code}</span>
                          ) : null}
                        </div>
                        <div>
                          Qty {Number(item.quantity || 0)} {item.unit || "pc"}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : receiptDetail.data ? (
                  <p>No item snapshot is available for this receipt.</p>
                ) : null}
              </section>
            ) : null}

            <section className="rider-history-detail-section">
              <div className="rider-history-detail-section-title">
                <MapPin size={15} strokeWidth={1.8} />
                Location
              </div>
              <p>
                {selectedMapHref
                  ? "A saved delivery pin is available for this record."
                  : "No saved delivery pin is available for this older record."}
              </p>

              {selectedMapHref ? (
                <a
                  href={selectedMapHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rider-v2-btn rider-v2-btn-secondary rider-history-detail-button"
                >
                  <Navigation size={15} strokeWidth={2} />
                  Open Map
                </a>
              ) : null}
            </section>

            <section className="rider-history-detail-section">
              <div className="rider-history-detail-section-title">
                <FileText size={15} strokeWidth={1.8} />
                Proof of Delivery
              </div>
              <p>
                {proofUrl
                  ? "Proof was uploaded for this delivery."
                  : "No proof file is available for this record."}
              </p>

              {proofUrl ? (
                <div className="rider-history-detail-actions">
                  <a
                    href={proofUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rider-v2-btn rider-v2-btn-secondary"
                  >
                    View Proof
                  </a>
                  <DownloadFileButton
                    url={proofUrl}
                    filename={getProofFilename(selectedRecord)}
                    label="Download Proof"
                    className="rider-v2-btn rider-v2-btn-secondary"
                  />
                </div>
              ) : null}
            </section>

            {selectedRecord.notes ? (
              <section className="rider-history-detail-section">
                <div className="rider-history-detail-section-title">
                  <Clock3 size={15} strokeWidth={1.8} />
                  {isSuccessfulDeliveryResult(getHistoryResult(selectedRecord))
                    ? "Delivery Notes"
                    : "Failure Details"}
                </div>
                <p className="rider-history-notes">
                  {selectedRecord.notes}
                </p>
              </section>
            ) : null}
          </aside>
        </div>
      ) : null}

      {receiptModalOpen && receiptDetail.data ? (
        <DeliveryReceiptModal
          receipt={receiptDetail.data}
          onClose={() => setReceiptModalOpen(false)}
        />
      ) : null}

      {signatureViewer.open ? (
        <div
          className="rider-history-signature-overlay"
          onClick={() =>
            setSignatureViewer((current) => ({ ...current, open: false }))
          }
        >
          <div
            className="rider-history-signature-card"
            role="dialog"
            aria-modal="true"
            aria-label="Delivery E-Signature"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="rider-history-signature-head">
              <div>
                <span>Delivery E-Signature</span>
                <h3>{selectedRecord?.order_number || "Order"}</h3>
              </div>
              <button
                type="button"
                className="rider-history-close"
                aria-label="Close e-signature"
                onClick={() =>
                  setSignatureViewer((current) => ({
                    ...current,
                    open: false,
                  }))
                }
              >
                <X size={18} strokeWidth={1.8} />
              </button>
            </div>

            {signatureViewer.loading ? (
              <div className="rider-history-signature-message">
                Loading e-signature...
              </div>
            ) : signatureViewer.error ? (
              <div className="rider-history-signature-message is-error">
                {signatureViewer.error}
              </div>
            ) : signatureViewer.data?.signature_data ? (
              <>
                <div className="rider-history-handoff-grid rider-history-signature-meta">
                  <div>
                    <span>Received By</span>
                    <strong>
                      {signatureViewer.data.received_by_name || "Not available"}
                    </strong>
                  </div>
                  <div>
                    <span>Recipient</span>
                    <strong>
                      {formatRecipientType(signatureViewer.data.recipient_type)}
                    </strong>
                  </div>
                  <div>
                    <span>Signed On</span>
                    <strong>
                      {formatDateTime(signatureViewer.data.acknowledged_at)}
                    </strong>
                  </div>
                </div>
                <div className="rider-history-signature-image-wrap">
                  <img
                    src={signatureViewer.data.signature_data}
                    alt="Recipient e-signature"
                  />
                </div>
                <p className="rider-history-signature-acknowledgement">
                  {signatureViewer.data.acknowledgement_text ||
                    "I acknowledge receipt of this order at the delivery address."}
                </p>
              </>
            ) : (
              <div className="rider-history-signature-message">
                No e-signature is available for this record.
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
