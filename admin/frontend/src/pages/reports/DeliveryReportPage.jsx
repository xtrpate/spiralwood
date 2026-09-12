import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  FileDown,
  Search,
  X,
} from "lucide-react";
import api, { buildAssetUrl } from "../../services/api";
import DeliveryReceiptModal from "../../components/delivery/DeliveryReceiptModal";
import DownloadFileButton from "../../components/delivery/DownloadFileButton";
import {
  exportDeliveryActivityReportPdf,
  exportDeliveryRecordPdf,
} from "../staff/DeliveryReportPdf";
import "./DeliveryReportPage.css";

const PAGE_SIZE = 25;

const normalize = (value) => String(value || "").trim().toLowerCase();

const formatStatus = (value) => {
  const status = normalize(value);
  if (!status) return "Unknown";
  if (status === "in_transit") return "In Transit";
  if (status === "completed") return "Delivered";
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const formatDateTime = (value) => {
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

const formatDateOnly = (value) => {
  if (!value) return "—";
  const raw = String(value).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (match) {
    const local = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    if (!Number.isNaN(local.getTime())) {
      return local.toLocaleDateString("en-PH", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    }
  }
  return formatDateTime(value);
};

const formatRecipientType = (value) => {
  const recipient = normalize(value);
  if (recipient === "customer") return "Customer";
  if (recipient === "authorized_representative") {
    return "Authorized Representative";
  }
  return "—";
};

const getOutcomeDate = (record = {}) => {
  const status = normalize(record.report_status || record.status);
  if (status === "delivered" || status === "completed") {
    return record.delivered_date || record.activity_date || record.updated_at || null;
  }
  if (status === "failed") {
    return record.activity_date || record.updated_at || null;
  }
  return null;
};

const getProofFilename = (record = {}) => {
  const orderNumber = String(
    record.order_number || `delivery-${record.delivery_id || "proof"}`,
  )
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "_");
  const cleanUrl = String(record.signed_receipt || "").split("?")[0];
  const extensionMatch = cleanUrl.match(/\.(jpg|jpeg|jfif|png|webp|pdf)$/i);
  const extension = extensionMatch ? extensionMatch[0].toLowerCase() : "";
  return `Proof_of_Delivery_${orderNumber}${extension}`;
};

const emptySummary = {
  total: 0,
  delivered: 0,
  failed: 0,
  active: 0,
  scheduled: 0,
  in_transit: 0,
  success_rate: 0,
};

const emptyPagination = {
  page: 1,
  limit: PAGE_SIZE,
  total: 0,
  total_pages: 1,
};

function SummaryCard({ label, value, note }) {
  return (
    <div className="delivery-report-summary-card">
      <span>{label}</span>
      <strong>{value}</strong>
      {note ? <small>{note}</small> : null}
    </div>
  );
}

export default function DeliveryReportPage() {
  const navigate = useNavigate();
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState(emptySummary);
  const [pagination, setPagination] = useState(emptyPagination);
  const [riders, setRiders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [riderId, setRiderId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);

  const [detail, setDetail] = useState({
    open: false,
    loading: false,
    data: null,
    error: "",
  });
  const [receiptModal, setReceiptModal] = useState({
    open: false,
    loading: false,
    data: null,
    error: "",
  });
  const [signatureViewer, setSignatureViewer] = useState({
    open: false,
    loading: false,
    data: null,
    error: "",
  });

  const selectedRiderName = useMemo(() => {
    if (!riderId) return "All";
    return riders.find((rider) => String(rider.id) === String(riderId))?.name || "Selected Rider";
  }, [riderId, riders]);

  const buildParams = useCallback(
    (extra = {}) => ({
      page,
      limit: PAGE_SIZE,
      search: search.trim() || undefined,
      status,
      rider_id: riderId || undefined,
      from: fromDate || undefined,
      to: toDate || undefined,
      ...extra,
    }),
    [page, search, status, riderId, fromDate, toDate],
  );

  const loadReport = useCallback(async () => {
    if (fromDate && toDate && fromDate > toDate) {
      setRecords([]);
      setSummary(emptySummary);
      setPagination({ ...emptyPagination, page: 1 });
      setError("From date cannot be later than To date.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const { data } = await api.get("/pos/deliveries/report", {
        params: buildParams(),
      });
      setRecords(Array.isArray(data?.records) ? data.records : []);
      setSummary({ ...emptySummary, ...(data?.summary || {}) });
      setPagination({ ...emptyPagination, ...(data?.pagination || {}) });
      setRiders(Array.isArray(data?.riders) ? data.riders : []);
    } catch (err) {
      setRecords([]);
      setSummary(emptySummary);
      setPagination({ ...emptyPagination, page });
      setError(
        err?.response?.data?.message || "Failed to load the Delivery Report.",
      );
    } finally {
      setLoading(false);
    }
  }, [buildParams, fromDate, toDate, page]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(loadReport, search.trim() ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [loadReport, search]);

  const clearFilters = () => {
    setSearch("");
    setStatus("all");
    setRiderId("");
    setFromDate("");
    setToDate("");
    setPage(1);
  };

  const openDetail = async (deliveryId) => {
    setDetail({ open: true, loading: true, data: null, error: "" });
    setReceiptModal({ open: false, loading: false, data: null, error: "" });
    setSignatureViewer({ open: false, loading: false, data: null, error: "" });

    try {
      const { data } = await api.get(`/pos/deliveries/report/${deliveryId}`);
      setDetail({ open: true, loading: false, data, error: "" });
    } catch (err) {
      setDetail({
        open: true,
        loading: false,
        data: null,
        error:
          err?.response?.data?.message || "Failed to load the attempt.",
      });
    }
  };

  const closeDetail = () => {
    setDetail({ open: false, loading: false, data: null, error: "" });
    setReceiptModal({ open: false, loading: false, data: null, error: "" });
    setSignatureViewer({ open: false, loading: false, data: null, error: "" });
  };

  useEffect(() => {
    if (!detail.open) return undefined;

    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      setDetail({ open: false, loading: false, data: null, error: "" });
      setReceiptModal({ open: false, loading: false, data: null, error: "" });
      setSignatureViewer({ open: false, loading: false, data: null, error: "" });
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [detail.open]);

  const openReceipt = async () => {
    const deliveryId = Number(detail.data?.delivery_id || 0);
    if (!deliveryId || receiptModal.loading) return;

    setReceiptModal({ open: true, loading: true, data: null, error: "" });
    try {
      const { data } = await api.get(`/pos/deliveries/${deliveryId}/receipt`);
      setReceiptModal({ open: true, loading: false, data, error: "" });
    } catch (err) {
      setReceiptModal({
        open: true,
        loading: false,
        data: null,
        error:
          err?.response?.data?.message || "Failed to load the Delivery Receipt.",
      });
    }
  };

  const openSignature = async () => {
    const deliveryId = Number(detail.data?.delivery_id || 0);
    if (!deliveryId || signatureViewer.loading) return;

    setSignatureViewer({ open: true, loading: true, data: null, error: "" });
    try {
      const { data } = await api.get(
        `/pos/deliveries/${deliveryId}/acknowledgement`,
      );
      setSignatureViewer({ open: true, loading: false, data, error: "" });
    } catch (err) {
      setSignatureViewer({
        open: true,
        loading: false,
        data: null,
        error:
          err?.response?.data?.message || "Failed to load the recipient e-signature.",
      });
    }
  };

  const handleExport = async () => {
    if (exporting) return;
    if (fromDate && toDate && fromDate > toDate) {
      setError("From date cannot be later than To date.");
      return;
    }

    setExporting(true);
    setError("");
    try {
      const { data } = await api.get("/pos/deliveries/report", {
        params: buildParams({ export: 1, page: 1 }),
      });
      const exportRecords = Array.isArray(data?.records) ? data.records : [];
      exportDeliveryActivityReportPdf({
        deliveries: exportRecords,
        filters: {
          search: search.trim(),
          status,
          rider: selectedRiderName,
          from: fromDate,
          to: toDate,
        },
      });
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Failed to export the Delivery Report.",
      );
    } finally {
      setExporting(false);
    }
  };

  const detailData = detail.data || {};
  const detailItems = Array.isArray(detailData.items) ? detailData.items : [];
  const detailHasItemCode = detailItems.some((item) =>
    String(item?.client_code || "").trim(),
  );
  const proofUrl = detailData.signed_receipt
    ? buildAssetUrl(detailData.signed_receipt)
    : "";
  const hasSignature = Number(detailData.delivery_has_signature || 0) === 1;
  const hasReceipt = Boolean(detailData.delivery_receipt_number);

  const handleExportRecord = () => {
    if (!detail.data) return;

    try {
      exportDeliveryRecordPdf({ delivery: detailData });
    } catch (exportError) {
      setError(
        exportError?.message || "Failed to export the selected delivery record.",
      );
    }
  };

  return (
    <div className="delivery-report-page">
      <header className="delivery-report-header">
        <div>
          <h1>Delivery Report</h1>
          <p>
            Review attempts, handoff evidence, rider activity, and outcomes.
          </p>
        </div>
        <button
          type="button"
          className="delivery-report-button delivery-report-button-primary"
          onClick={handleExport}
          disabled={exporting || loading || summary.total === 0}
        >
          <FileDown size={16} />
          {exporting ? "Preparing PDF..." : "Export Report"}
        </button>
      </header>

      <section className="delivery-report-summary-grid">
        <SummaryCard label="Total Attempts" value={summary.total} />
        <SummaryCard label="Delivered" value={summary.delivered} />
        <SummaryCard label="Failed" value={summary.failed} />
        <SummaryCard
          label="Active"
          value={summary.active}
          note={`${summary.scheduled || 0} scheduled · ${summary.in_transit || 0} in transit`}
        />
        <SummaryCard
          label="Success Rate"
          value={`${Number(summary.success_rate || 0).toFixed(1)}%`}
          note="Delivered ÷ finished attempts"
        />
      </section>

      <section className="delivery-report-filter-card">
        <div className="delivery-report-search-wrap">
          <Search size={16} />
          <input
            type="text"
            value={search}
            placeholder="Search order, customer, address, rider, or DR number"
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </div>

        <label>
          <span>Rider</span>
          <select
            value={riderId}
            onChange={(event) => {
              setRiderId(event.target.value);
              setPage(1);
            }}
          >
            <option value="">All Riders</option>
            {riders.map((rider) => (
              <option key={rider.id} value={rider.id}>
                {rider.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Status</span>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="all">All Statuses</option>
            <option value="scheduled">Scheduled</option>
            <option value="in_transit">In Transit</option>
            <option value="delivered">Delivered</option>
            <option value="failed">Failed</option>
          </select>
        </label>

        <label>
          <span>From</span>
          <input
            type="date"
            value={fromDate}
            onChange={(event) => {
              setFromDate(event.target.value);
              setPage(1);
            }}
          />
        </label>

        <label>
          <span>To</span>
          <input
            type="date"
            value={toDate}
            onChange={(event) => {
              setToDate(event.target.value);
              setPage(1);
            }}
          />
        </label>

        <button
          type="button"
          className="delivery-report-button delivery-report-button-secondary"
          onClick={clearFilters}
        >
          Clear Filters
        </button>
      </section>

      <div className="delivery-report-filter-note">
        Date filters use the scheduled date for active attempts and the outcome date for finished attempts.
      </div>

      {error ? (
        <div className="delivery-report-alert" role="alert">
          {error}
        </div>
      ) : null}

      <section className="delivery-report-table-card">
        <div className="delivery-report-table-head">
          <div>
            <h2>Attempts</h2>
            <p>Each row represents one attempt. Redeliveries remain separate.</p>
          </div>
          <span>{pagination.total} attempt{pagination.total === 1 ? "" : "s"}</span>
        </div>

        {loading ? (
          <div className="delivery-report-empty">Loading report...</div>
        ) : records.length === 0 ? (
          <div className="delivery-report-empty">No attempts match these filters.</div>
        ) : (
          <>
            <div className="delivery-report-table-scroll">
              <table className="delivery-report-table">
                <thead>
                  <tr>
                    <th>Scheduled</th>
                    <th>Outcome Date</th>
                    <th>Order</th>
                    <th>Customer</th>
                    <th>Rider</th>
                    <th>Attempt</th>
                    <th>Status</th>
                    <th>DR Number</th>
                    <th aria-label="Action" />
                  </tr>
                </thead>
                <tbody>
                  {records.map((record) => (
                    <tr
                      key={record.delivery_id}
                      onDoubleClick={() => openDetail(record.delivery_id)}
                    >
                      <td>{formatDateOnly(record.scheduled_date)}</td>
                      <td>{formatDateTime(getOutcomeDate(record))}</td>
                      <td className="delivery-report-order">{record.order_number || "—"}</td>
                      <td>{record.customer_name || "Walk-in Customer"}</td>
                      <td>{record.driver_name || "Unassigned"}</td>
                      <td>
                        {Number(record.attempt_number || 1)} of {Number(record.attempt_count || 1)}
                      </td>
                      <td>
                        <span className={`delivery-report-status delivery-report-status-${normalize(record.report_status)}`}>
                          {formatStatus(record.report_status)}
                        </span>
                      </td>
                      <td>{record.delivery_receipt_number || "—"}</td>
                      <td className="delivery-report-action-cell">
                        <button
                          type="button"
                          className="delivery-report-row-action"
                          onClick={() => openDetail(record.delivery_id)}
                        >
                          <Eye size={14} /> View Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="delivery-report-pagination">
              <span>
                Page {pagination.page} of {Math.max(1, pagination.total_pages)}
              </span>
              <div>
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={pagination.page <= 1}
                >
                  <ChevronLeft size={15} /> Previous
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setPage((current) =>
                      Math.min(Math.max(1, pagination.total_pages), current + 1),
                    )
                  }
                  disabled={pagination.page >= pagination.total_pages}
                >
                  Next <ChevronRight size={15} />
                </button>
              </div>
            </div>
          </>
        )}
      </section>

      {detail.open ? (
        <div className="delivery-report-detail-overlay" onClick={closeDetail}>
          <aside
            className="delivery-report-detail-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delivery-report-detail-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="delivery-report-detail-head">
              <div>
                <span>Attempt Details</span>
                <h2 id="delivery-report-detail-title">{detailData.order_number || "Attempt Details"}</h2>
                <p>{detailData.customer_name || "Customer"}</p>
              </div>
              <button type="button" aria-label="Close" onClick={closeDetail}>
                <X size={19} />
              </button>
            </div>

            {detail.loading ? (
              <div className="delivery-report-detail-loading">Loading attempt...</div>
            ) : detail.error ? (
              <div className="delivery-report-alert" role="alert">
                {detail.error}
              </div>
            ) : (
              <>
                <div className="delivery-report-detail-status-row">
                  <span className={`delivery-report-status delivery-report-status-${normalize(detailData.report_status)}`}>
                    {formatStatus(detailData.report_status)}
                  </span>
                  <span>
                    Attempt {Number(detailData.attempt_number || 1)} of {Number(detailData.attempt_count || 1)}
                  </span>
                </div>

                <section className="delivery-report-detail-grid">
                  <div><span>Order Type</span><strong>{formatStatus(detailData.order_type)}</strong></div>
                  <div><span>Rider</span><strong>{detailData.driver_name || "Unassigned"}</strong></div>
                  <div><span>Assigned On</span><strong>{formatDateTime(detailData.assigned_at)}</strong></div>
                  <div><span>Scheduled</span><strong>{formatDateOnly(detailData.scheduled_date)}</strong></div>
                  <div><span>Outcome Date</span><strong>{formatDateTime(getOutcomeDate(detailData))}</strong></div>
                  <div><span>DR Number</span><strong>{detailData.delivery_receipt_number || "Not available"}</strong></div>
                </section>

                <section className="delivery-report-detail-section">
                  <h3>Destination</h3>
                  <p>{detailData.address || "Address unavailable"}</p>
                </section>

                <section className="delivery-report-detail-section">
                  <h3>Items</h3>
                  {detailItems.length ? (
                    <div className="delivery-report-items-scroll">
                      <table className="delivery-report-items-table">
                        <thead>
                          <tr>
                            {detailHasItemCode ? <th>Item Code</th> : null}
                            <th>Qty</th>
                            <th>Unit</th>
                            <th>Description</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detailItems.map((item, index) => (
                            <tr key={`${item.order_item_id || item.client_code || item.description || "item"}-${index}`}>
                              {detailHasItemCode ? <td>{item.client_code || "—"}</td> : null}
                              <td>{Number(item.quantity || 0)}</td>
                              <td>{item.unit || "pc"}</td>
                              <td>{item.description || "Item"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p>No item details are available for this delivery record.</p>
                  )}
                </section>

                {normalize(detailData.report_status) === "delivered" ? (
                  <section className="delivery-report-detail-section">
                    <h3>Recorded Handoff</h3>
                    <div className="delivery-report-handoff-grid">
                      <div><span>Received By</span><strong>{detailData.delivery_received_by_name || "—"}</strong></div>
                      <div><span>Recipient</span><strong>{formatRecipientType(detailData.delivery_recipient_type)}</strong></div>
                      <div><span>Received On</span><strong>{formatDateTime(detailData.delivery_acknowledged_at)}</strong></div>
                      <div><span>Proof of Delivery</span><strong>{proofUrl ? "Recorded" : "Unavailable"}</strong></div>
                    </div>
                  </section>
                ) : null}

                {detailData.notes ? (
                  <section className="delivery-report-detail-section">
                    <h3>{normalize(detailData.report_status) === "failed" ? "Failure Details" : "Notes"}</h3>
                    <p className="delivery-report-notes">{detailData.notes}</p>
                  </section>
                ) : null}

                <section className="delivery-report-detail-section">
                  <h3>Documents</h3>
                  <div className="delivery-report-document-actions">
                    {proofUrl ? (
                      <>
                        <a
                          href={proofUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="delivery-report-button delivery-report-button-secondary"
                        >
                          <Eye size={14} /> View Proof
                        </a>
                        <DownloadFileButton
                          url={proofUrl}
                          filename={getProofFilename(detailData)}
                          label="Download Proof"
                          loadingLabel="Downloading..."
                          className="delivery-report-button delivery-report-button-secondary"
                        />
                      </>
                    ) : null}

                    {hasSignature ? (
                      <button
                        type="button"
                        className="delivery-report-button delivery-report-button-secondary"
                        onClick={openSignature}
                      >
                        <Eye size={14} /> View E-Signature
                      </button>
                    ) : null}

                    {hasReceipt ? (
                      <button
                        type="button"
                        className="delivery-report-button delivery-report-button-secondary"
                        onClick={openReceipt}
                        disabled={receiptModal.loading}
                      >
                        <Download size={14} />
                        {receiptModal.loading ? "Loading Receipt..." : "View Receipt"}
                      </button>
                    ) : null}

                    {!proofUrl && !hasSignature && !hasReceipt ? (
                      <p>No documents are available for this attempt.</p>
                    ) : null}
                  </div>
                  {receiptModal.error ? (
                    <div className="delivery-report-inline-error">{receiptModal.error}</div>
                  ) : null}
                </section>

                <div className="delivery-report-detail-footer">
                  <button
                    type="button"
                    className="delivery-report-button delivery-report-button-secondary"
                    onClick={handleExportRecord}
                  >
                    <FileDown size={14} /> Export Record
                  </button>
                  <button
                    type="button"
                    className="delivery-report-button delivery-report-button-primary"
                    onClick={() => navigate(`/admin/orders/${detailData.order_id}`)}
                  >
                    Open Order
                  </button>
                  <button
                    type="button"
                    className="delivery-report-button delivery-report-button-secondary"
                    onClick={closeDetail}
                  >
                    Close
                  </button>
                </div>
              </>
            )}
          </aside>
        </div>
      ) : null}

      {receiptModal.open && receiptModal.data ? (
        <DeliveryReceiptModal
          receipt={receiptModal.data}
          onClose={() =>
            setReceiptModal({ open: false, loading: false, data: null, error: "" })
          }
        />
      ) : null}

      {signatureViewer.open ? (
        <div
          className="delivery-report-signature-overlay"
          onClick={() =>
            setSignatureViewer({ open: false, loading: false, data: null, error: "" })
          }
        >
          <div
            className="delivery-report-signature-card"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="delivery-report-signature-head">
              <div>
                <span>Recipient E-Signature</span>
                <strong>{detailData.order_number || "Delivery"}</strong>
              </div>
              <button
                type="button"
                aria-label="Close signature"
                onClick={() =>
                  setSignatureViewer({ open: false, loading: false, data: null, error: "" })
                }
              >
                <X size={18} />
              </button>
            </div>
            <div className="delivery-report-signature-body">
              {signatureViewer.loading ? (
                <p>Loading e-signature...</p>
              ) : signatureViewer.error ? (
                <div className="delivery-report-alert">{signatureViewer.error}</div>
              ) : signatureViewer.data?.signature_data ? (
                <>
                  <img src={signatureViewer.data.signature_data} alt="Recipient e-signature" />
                  <div className="delivery-report-signature-meta">
                    <strong>{signatureViewer.data.received_by_name || "Recipient"}</strong>
                    <span>{formatRecipientType(signatureViewer.data.recipient_type)}</span>
                    <span>{formatDateTime(signatureViewer.data.acknowledged_at)}</span>
                  </div>
                </>
              ) : (
                <p>No e-signature was captured for this delivery.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
