import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import api from "../../services/api";

const normalize = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const formatMoney = (value) =>
  `₱${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatDateTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const prettyStage = (value) => {
  const key = normalize(value);
  const labels = {
    pending: "Pending",
    confirmed: "Confirmed",
    contract_released: "Contract Released",
    production: "Production",
    ready_for_pickup: "Ready for Pickup",
    shipping: "Shipping",
    delivered: "Delivered",
    completed: "Completed",
    cancelled: "Cancelled",
  };
  return labels[key] || key.replace(/_/g, " ") || "Unknown";
};

const TYPE_META = {
  ready_made: {
    label: "Ready-made",
    background: "#f4f4f5",
    color: "#18181b",
  },
  custom_furniture: {
    label: "Custom Furniture",
    background: "#ffffff",
    color: "#18181b",
  },
};

const STATUS_META = {
  pending: {
    label: "Pending Review",
    background: "#fff7ed",
    color: "#9a3412",
  },
  approved: {
    label: "Approved / Cancelled",
    background: "#f4f4f5",
    color: "#18181b",
  },
  declined: {
    label: "Declined",
    background: "#fef2f2",
    color: "#991b1b",
  },
  cancelled: {
    label: "Cancelled",
    background: "#f4f4f5",
    color: "#18181b",
  },
};

const APPROVABLE_STAGES = new Set([
  "confirmed",
  "contract_released",
  "production",
  "ready_for_pickup",
  "shipping",
]);

const getStatusGroup = (row) => {
  const status = normalize(row?.status);
  if (status === "pending") return "pending";
  if (status === "declined") return "declined";
  if (status === "approved" || status === "cancelled") return "cancelled";
  return status;
};

const getSourceLabel = (row) => {
  const source = normalize(row?.record_source);
  if (source === "custom_request") return "Customer request";
  if (source === "custom_legacy") return "Historical cancellation";
  return "Cancellation history";
};

const showRequestErrorIfNeeded = (err, fallback) => {
  if (!err?.response || err.response.status === 404) {
    toast.error(err?.response?.data?.message || fallback);
  }
};

export default function CancellationsPage() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [modal, setModal] = useState(null);
  const [reviewNote, setReviewNote] = useState("");
  const [processing, setProcessing] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/orders/cancellations");
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      setRows([]);
      showRequestErrorIfNeeded(err, "Failed to load cancellation records.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    load();
  }, []);

  const filteredRows = useMemo(() => {
    const term = normalize(search);

    return rows.filter((row) => {
      const rowType = normalize(row.record_type);
      const rowStatus = getStatusGroup(row);

      if (typeFilter && rowType !== typeFilter) return false;
      if (statusFilter && rowStatus !== statusFilter) return false;

      if (!term) return true;

      return [
        row.order_number,
        row.customer_name,
        row.requested_by_name,
        row.reason,
        row.review_note,
        row.order_status,
        row.order_status_at_request,
        TYPE_META[rowType]?.label,
        STATUS_META[normalize(row.status)]?.label,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term);
    });
  }, [rows, search, typeFilter, statusFilter]);

  const stats = useMemo(
    () => ({
      total: rows.length,
      pending: rows.filter((row) => getStatusGroup(row) === "pending").length,
      cancelled: rows.filter((row) => getStatusGroup(row) === "cancelled").length,
      declined: rows.filter((row) => getStatusGroup(row) === "declined").length,
    }),
    [rows],
  );

  const typeStats = useMemo(
    () => ({
      readyMade: rows.filter((row) => normalize(row.record_type) === "ready_made")
        .length,
      custom: rows.filter(
        (row) => normalize(row.record_type) === "custom_furniture",
      ).length,
    }),
    [rows],
  );

  const openDecision = (row, action) => {
    if (
      normalize(row?.record_source) !== "custom_request" ||
      normalize(row?.status) !== "pending" ||
      !row?.request_id
    ) {
      return;
    }

    setReviewNote("");
    setModal({ row, action });
  };

  const closeDecision = () => {
    if (processing) return;
    setModal(null);
    setReviewNote("");
  };

  const submitDecision = async () => {
    const requestId = Number(modal?.row?.request_id || 0);
    if (!requestId || !modal?.action || processing) return;

    const note = reviewNote.trim();
    if (modal.action === "decline" && !note) {
      toast.error("Please provide a reason for declining this request.");
      return;
    }
    if (note.length > 500) {
      toast.error("Review note must be 500 characters or fewer.");
      return;
    }

    setProcessing(true);
    try {
      const { data } = await api.post(
        `/orders/cancellations/${requestId}/${modal.action}`,
        { review_note: note },
      );
      toast.success(
        data?.message ||
          (modal.action === "approve"
            ? "Cancellation approved."
            : "Cancellation request declined."),
      );
      setModal(null);
      setReviewNote("");
      await load();
    } catch (err) {
      showRequestErrorIfNeeded(err, "Failed to process cancellation request.");
    } finally {
      setProcessing(false);
    }
  };

  const modalRow = modal?.row || null;
  const approveBlockedByPayment =
    Number(modalRow?.pending_payment_count || 0) > 0 ||
    Number(modalRow?.payment_session_active || 0) === 1;
  const approveBlockedByStage =
    Boolean(modalRow) &&
    !APPROVABLE_STAGES.has(normalize(modalRow.order_status));
  const approveBlocked = approveBlockedByPayment || approveBlockedByStage;

  return (
    <div style={pageShell}>
      <div style={headerRow}>
        <div>
          <div style={eyebrow}>Sales & Orders</div>
          <h1 style={pageTitle}>Cancellations</h1>
          <p style={pageSubtitle}>
            Review ready-made cancellation history and custom furniture
            cancellation requests in one place.
          </p>
        </div>
        <button type="button" onClick={load} style={secondaryButton}>
          Refresh
        </button>
      </div>

      <div style={policyCard}>
        <strong>No-refund policy</strong>
        <span>
          This page does not issue refunds. Ready-made orders keep their existing
          cancellation and stock-restoration flow. Custom furniture cancellation
          approval preserves recorded payments in payment history.
        </span>
      </div>

      <div style={statsGrid}>
        <StatCard label="Total Records" value={stats.total} />
        <StatCard label="Pending Review" value={stats.pending} />
        <StatCard label="Cancelled" value={stats.cancelled} />
        <StatCard label="Declined" value={stats.declined} />
      </div>

      <div style={typeSummary}>
        <span>Ready-made: {typeStats.readyMade}</span>
        <span>Custom Furniture: {typeStats.custom}</span>
      </div>

      <div style={filterCard}>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search order, customer, or reason..."
          style={input}
        />
        <select
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value)}
          style={{ ...input, minWidth: 170 }}
        >
          <option value="">All types</option>
          <option value="ready_made">Ready-made</option>
          <option value="custom_furniture">Custom Furniture</option>
        </select>
        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          style={{ ...input, minWidth: 170 }}
        >
          <option value="">All statuses</option>
          <option value="pending">Pending Review</option>
          <option value="cancelled">Cancelled</option>
          <option value="declined">Declined</option>
        </select>
        <button
          type="button"
          onClick={() => {
            setSearch("");
            setTypeFilter("");
            setStatusFilter("");
          }}
          style={secondaryButton}
        >
          Reset
        </button>
      </div>

      <div style={tableCard}>
        <div style={tableHeader}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18 }}>Cancellation Records</h2>
            <p style={{ margin: "6px 0 0", color: "#71717a", fontSize: 13 }}>
              Ready-made cancellations are history. Custom requests remain active
              until an admin approves or declines them.
            </p>
          </div>
          <span style={{ color: "#71717a", fontSize: 13 }}>
            {filteredRows.length} shown
          </span>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={table}>
            <thead>
              <tr>
                {[
                  "Order",
                  "Type",
                  "Customer",
                  "Stage",
                  "Payment",
                  "Reason",
                  "Status",
                  "Actions",
                ].map((label) => (
                  <th key={label} style={th}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={emptyCell}>
                    Loading cancellation records...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={8} style={emptyCell}>
                    No cancellation records found for the selected filters.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const rowType = normalize(row.record_type);
                  const rowSource = normalize(row.record_source);
                  const decision = normalize(row.status) || "cancelled";
                  const statusMeta = STATUS_META[decision] || STATUS_META.cancelled;
                  const typeMeta = TYPE_META[rowType] || TYPE_META.custom_furniture;
                  const taskTotal = Number(row.production_task_count || 0);
                  const taskDone = Number(row.production_completed_count || 0);
                  const hasPendingPayment =
                    Number(row.pending_payment_count || 0) > 0 ||
                    Number(row.payment_session_active || 0) === 1;
                  const canReview =
                    rowSource === "custom_request" &&
                    decision === "pending" &&
                    Number(row.request_id || 0) > 0;
                  const stageValue =
                    rowSource === "custom_request"
                      ? row.order_status_at_request || row.order_status
                      : row.order_status;

                  return (
                    <tr key={row.record_key || `${rowSource}-${row.order_id}`}>
                      <td style={td}>
                        <button
                          type="button"
                          onClick={() => navigate(`/admin/orders/${row.order_id}`)}
                          style={linkButton}
                        >
                          {row.order_number || `#${row.order_id}`}
                        </button>
                        <div style={subText}>{formatDateTime(row.requested_at)}</div>
                        <div style={sourceText}>{getSourceLabel(row)}</div>
                      </td>

                      <td style={td}>
                        <span
                          style={{
                            ...badge,
                            background: typeMeta.background,
                            color: typeMeta.color,
                            border: "1px solid #d4d4d8",
                          }}
                        >
                          {typeMeta.label}
                        </span>
                      </td>

                      <td style={td}>
                        <div style={strongText}>{row.customer_name || "Customer"}</div>
                        {rowSource === "custom_request" ? (
                          <div style={subText}>
                            Requested by {row.requested_by_name || "Customer"}
                          </div>
                        ) : null}
                      </td>

                      <td style={td}>
                        <div>{prettyStage(stageValue)}</div>
                        {rowSource === "custom_request" &&
                        normalize(row.order_status) !== normalize(stageValue) ? (
                          <div style={subText}>
                            Current: {prettyStage(row.order_status)}
                          </div>
                        ) : null}
                        {rowType === "custom_furniture" && taskTotal > 0 ? (
                          <div style={subText}>
                            Production {taskDone}/{taskTotal}
                          </div>
                        ) : null}
                      </td>

                      <td style={td}>
                        <div style={strongText}>
                          {formatMoney(row.verified_payment_total)}
                        </div>
                        <div style={hasPendingPayment ? warningText : subText}>
                          {hasPendingPayment
                            ? "Payment review/session active"
                            : Number(row.verified_payment_total || 0) > 0
                              ? "Verified payment recorded"
                              : "No verified payment"}
                        </div>
                      </td>

                      <td style={{ ...td, minWidth: 250 }}>
                        <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.45 }}>
                          {row.reason || "No reason recorded."}
                        </div>
                        {row.review_note ? (
                          <div style={{ ...subText, marginTop: 6 }}>
                            Admin note: {row.review_note}
                          </div>
                        ) : null}
                      </td>

                      <td style={td}>
                        <span
                          style={{
                            ...badge,
                            background: statusMeta.background,
                            color: statusMeta.color,
                          }}
                        >
                          {statusMeta.label}
                        </span>
                      </td>

                      <td style={td}>
                        <div style={actionRow}>
                          <button
                            type="button"
                            onClick={() => navigate(`/admin/orders/${row.order_id}`)}
                            style={secondaryButton}
                          >
                            View Order
                          </button>

                          {canReview ? (
                            <>
                              <button
                                type="button"
                                onClick={() => openDecision(row, "decline")}
                                style={secondaryButton}
                              >
                                Decline
                              </button>
                              <button
                                type="button"
                                onClick={() => openDecision(row, "approve")}
                                style={primaryButton}
                              >
                                Approve Cancellation
                              </button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal && modalRow ? (
        <div
          role="presentation"
          style={modalBackdrop}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDecision();
          }}
        >
          <div role="dialog" aria-modal="true" style={modalCard}>
            <h2 style={{ margin: 0, fontSize: 20 }}>
              {modal.action === "approve"
                ? "Approve Cancellation"
                : "Decline Cancellation Request"}
            </h2>

            <p style={modalCopy}>
              {modalRow.order_number || `Order #${modalRow.order_id}`} — {" "}
              {modalRow.customer_name || "Customer"}
            </p>

            <div style={modalSummary}>
              <SummaryLine
                label="Stage when requested"
                value={prettyStage(
                  modalRow.order_status_at_request || modalRow.order_status,
                )}
              />
              <SummaryLine
                label="Current order status"
                value={prettyStage(modalRow.order_status)}
              />
              <SummaryLine
                label="Verified payment"
                value={formatMoney(modalRow.verified_payment_total)}
              />
              <SummaryLine
                label="Production"
                value={
                  Number(modalRow.production_task_count || 0) > 0
                    ? `${Number(modalRow.production_completed_count || 0)} / ${Number(
                        modalRow.production_task_count || 0,
                      )} completed`
                    : "Not started"
                }
              />
            </div>

            <div style={reasonCard}>
              <strong>Customer reason</strong>
              <div style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>
                {modalRow.reason}
              </div>
            </div>

            {modal.action === "approve" ? (
              <div style={policyNotice}>
                Approval cancels the custom furniture order. Recorded payments
                remain in payment history and this action does not issue a refund.
              </div>
            ) : null}

            {modal.action === "approve" && approveBlocked ? (
              <div style={warningCard}>
                {approveBlockedByPayment
                  ? "Approval is blocked until the pending payment review or active online payment session is resolved."
                  : "The order is no longer at a stage where this cancellation can be approved."}
              </div>
            ) : null}

            <label style={fieldLabel}>
              <span>
                Admin note {modal.action === "decline" ? "(required)" : "(optional)"}
              </span>
              <textarea
                rows={4}
                maxLength={500}
                value={reviewNote}
                onChange={(event) => setReviewNote(event.target.value)}
                disabled={processing}
                placeholder={
                  modal.action === "decline"
                    ? "Explain why the request is being declined"
                    : "Optional internal/customer-facing note"
                }
                style={textarea}
              />
              <small style={{ color: "#71717a" }}>{reviewNote.length}/500</small>
            </label>

            <div style={modalActions}>
              <button
                type="button"
                onClick={closeDecision}
                disabled={processing}
                style={secondaryButton}
              >
                Back
              </button>
              <button
                type="button"
                onClick={submitDecision}
                disabled={
                  processing ||
                  (modal.action === "approve" && approveBlocked) ||
                  (modal.action === "decline" && !reviewNote.trim())
                }
                style={modal.action === "approve" ? primaryButton : dangerButton}
              >
                {processing
                  ? "Saving..."
                  : modal.action === "approve"
                    ? "Approve Cancellation"
                    : "Decline Request"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div style={statCard}>
      <span style={statLabel}>{label}</span>
      <strong style={statValue}>{value}</strong>
    </div>
  );
}

function SummaryLine({ label, value }) {
  return (
    <div style={summaryLine}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

const pageShell = {
  padding: "24px 28px 40px",
  color: "#18181b",
};

const headerRow = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "flex-start",
  marginBottom: 18,
};

const eyebrow = {
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  fontSize: 12,
  color: "#71717a",
  marginBottom: 6,
};

const pageTitle = {
  margin: 0,
  fontSize: 30,
  lineHeight: 1.2,
};

const pageSubtitle = {
  margin: "7px 0 0",
  color: "#71717a",
  maxWidth: 760,
};

const policyCard = {
  border: "1px solid #d4d4d8",
  background: "#ffffff",
  padding: "14px 16px",
  display: "grid",
  gap: 5,
  marginBottom: 16,
  fontSize: 13,
  lineHeight: 1.5,
};

const statsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 12,
  marginBottom: 10,
};

const statCard = {
  background: "#ffffff",
  border: "1px solid #e4e4e7",
  padding: 16,
  display: "grid",
  gap: 8,
};

const statLabel = {
  color: "#52525b",
  fontSize: 12,
};

const statValue = {
  fontSize: 24,
};

const typeSummary = {
  display: "flex",
  gap: 18,
  flexWrap: "wrap",
  color: "#52525b",
  fontSize: 12,
  marginBottom: 16,
};

const filterCard = {
  background: "#ffffff",
  border: "1px solid #e4e4e7",
  padding: 12,
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
  marginBottom: 16,
};

const input = {
  minHeight: 38,
  border: "1px solid #d4d4d8",
  background: "#ffffff",
  padding: "8px 10px",
  fontSize: 13,
  minWidth: 280,
};

const tableCard = {
  background: "#ffffff",
  border: "1px solid #e4e4e7",
};

const tableHeader = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  alignItems: "center",
  padding: "14px 16px",
  borderBottom: "1px solid #e4e4e7",
};

const table = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 13,
};

const th = {
  textAlign: "left",
  padding: "11px 12px",
  borderBottom: "1px solid #e4e4e7",
  color: "#52525b",
  fontWeight: 600,
  whiteSpace: "nowrap",
};

const td = {
  padding: "12px",
  borderBottom: "1px solid #f4f4f5",
  verticalAlign: "top",
};

const emptyCell = {
  padding: 34,
  textAlign: "center",
  color: "#71717a",
};

const strongText = {
  fontWeight: 600,
};

const subText = {
  color: "#71717a",
  fontSize: 11,
  marginTop: 4,
  lineHeight: 1.4,
};

const sourceText = {
  color: "#52525b",
  fontSize: 10,
  marginTop: 3,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const warningText = {
  color: "#9a3412",
  fontSize: 11,
  marginTop: 4,
  lineHeight: 1.4,
};

const badge = {
  display: "inline-block",
  padding: "4px 8px",
  fontSize: 11,
  fontWeight: 600,
  whiteSpace: "nowrap",
};

const actionRow = {
  display: "flex",
  gap: 7,
  flexWrap: "wrap",
  minWidth: 220,
};

const linkButton = {
  border: 0,
  padding: 0,
  margin: 0,
  background: "transparent",
  color: "#18181b",
  fontWeight: 700,
  cursor: "pointer",
  textDecoration: "underline",
  textUnderlineOffset: 2,
};

const secondaryButton = {
  minHeight: 34,
  border: "1px solid #d4d4d8",
  background: "#ffffff",
  color: "#18181b",
  padding: "7px 11px",
  fontSize: 12,
  cursor: "pointer",
};

const primaryButton = {
  minHeight: 34,
  border: "1px solid #18181b",
  background: "#18181b",
  color: "#ffffff",
  padding: "7px 11px",
  fontSize: 12,
  cursor: "pointer",
};

const dangerButton = {
  minHeight: 34,
  border: "1px solid #991b1b",
  background: "#ffffff",
  color: "#991b1b",
  padding: "7px 11px",
  fontSize: 12,
  cursor: "pointer",
};

const modalBackdrop = {
  position: "fixed",
  inset: 0,
  zIndex: 1400,
  background: "rgba(0, 0, 0, 0.45)",
  display: "grid",
  placeItems: "center",
  padding: 20,
};

const modalCard = {
  width: "min(620px, 100%)",
  maxHeight: "90vh",
  overflowY: "auto",
  background: "#ffffff",
  border: "1px solid #d4d4d8",
  padding: 22,
};

const modalCopy = {
  margin: "8px 0 14px",
  color: "#52525b",
};

const modalSummary = {
  border: "1px solid #e4e4e7",
  marginBottom: 14,
};

const summaryLine = {
  display: "flex",
  justifyContent: "space-between",
  gap: 16,
  padding: "9px 11px",
  borderBottom: "1px solid #f4f4f5",
  fontSize: 13,
};

const reasonCard = {
  border: "1px solid #e4e4e7",
  background: "#fafafa",
  padding: 12,
  marginBottom: 12,
  fontSize: 13,
  lineHeight: 1.5,
};

const policyNotice = {
  border: "1px solid #d4d4d8",
  background: "#ffffff",
  padding: 12,
  marginBottom: 12,
  fontSize: 13,
  lineHeight: 1.5,
};

const warningCard = {
  border: "1px solid #fed7aa",
  background: "#fff7ed",
  color: "#9a3412",
  padding: 12,
  marginBottom: 12,
  fontSize: 13,
  lineHeight: 1.5,
};

const fieldLabel = {
  display: "grid",
  gap: 7,
  fontSize: 13,
};

const textarea = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #d4d4d8",
  padding: 10,
  resize: "vertical",
  font: "inherit",
};

const modalActions = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  marginTop: 18,
};
