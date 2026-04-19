import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { buildAssetUrl } from "../../services/api";
import toast from "react-hot-toast";

const STATUS_META = {
  pending: {
    label: "Pending",
    tone: "#52525b",
    bg: "#ffffff",
    border: "#d4d4d8",
  },
  approved: {
    label: "Approved",
    tone: "#18181b",
    bg: "#f4f4f5",
    border: "#e4e4e7",
  },
  fulfilled: {
    label: "Fulfilled",
    tone: "#ffffff",
    bg: "#0a0a0a",
    border: "#0a0a0a",
  },
  rejected: {
    label: "Rejected",
    tone: "#dc2626",
    bg: "#fef2f2",
    border: "#fecaca",
  },
};

const formatDateTime = (value) => {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const formatDate = (value) => {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return parsed.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const openAsset = (value, label = "file") => {
  if (!value) {
    toast.error(`No ${label} available.`);
    return;
  }
  window.open(buildAssetUrl(value), "_blank", "noopener,noreferrer");
};

const getStatusMeta = (status) =>
  STATUS_META[String(status || "").toLowerCase()] || STATUS_META.pending;

const getStatusCount = (rows, status) =>
  rows.filter((row) => String(row.status || "").toLowerCase() === status)
    .length;

export default function WarrantyPage() {
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [selectedRow, setSelectedRow] = useState(null);
  const [fulfillTarget, setFulfillTarget] = useState(null);
  const [decisionModal, setDecisionModal] = useState(null);

  const loadClaims = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/warranty");
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error(
        err?.response?.data?.message || "Failed to load warranty claims.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadClaims();
  }, []);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();

    return rows.filter((row) => {
      const matchesStatus =
        !statusFilter ||
        String(row.status || "").toLowerCase() === statusFilter;

      const haystack = [
        row.order_number,
        row.customer_name,
        row.product_name,
        row.description,
        row.admin_note,
        row.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = !term || haystack.includes(term);

      return matchesStatus && matchesSearch;
    });
  }, [rows, search, statusFilter]);

  const stats = useMemo(
    () => [
      { label: "Total Claims", value: rows.length },
      { label: "Pending", value: getStatusCount(rows, "pending") },
      { label: "Approved", value: getStatusCount(rows, "approved") },
      { label: "Fulfilled", value: getStatusCount(rows, "fulfilled") },
      { label: "Rejected", value: getStatusCount(rows, "rejected") },
    ],
    [rows],
  );

  const handleDecision = async ({ id, decision, admin_note }) => {
    try {
      await api.patch(`/warranty/${id}/decision`, { decision, admin_note });

      toast.success(
        decision === "approved"
          ? "Warranty claim approved."
          : "Warranty claim rejected.",
      );

      setDecisionModal(null);
      setSelectedRow(null);
      loadClaims();
    } catch (err) {
      toast.error(
        err?.response?.data?.message ||
          "Failed to update warranty claim status.",
      );
    }
  };

  const handleFulfill = async ({ id, file }) => {
    try {
      const formData = new FormData();
      formData.append("replacement_receipt", file);

      await api.patch(`/warranty/${id}/fulfill`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      toast.success("Warranty claim marked as fulfilled.");
      setFulfillTarget(null);
      setSelectedRow(null);
      loadClaims();
    } catch (err) {
      toast.error(
        err?.response?.data?.message || "Failed to mark claim as fulfilled.",
      );
    }
  };

  const activeFilterCount = [search, statusFilter].filter(Boolean).length;

  return (
    <div style={pageShell}>
      <div style={headerRow}>
        <div>
          <div style={eyebrow}>Sales & Orders</div>
          <h1 style={pageTitle}>Warranty Claims</h1>
          <p style={pageSubtitle}>
            Review pending claims, inspect customer evidence, approve valid
            requests, and record fulfillment cleanly.
          </p>
        </div>

        <div style={headerBadge}>{rows.length} total claims</div>
      </div>

      <div style={statsGrid}>
        {stats.map((item) => (
          <div key={item.label} style={statCard}>
            <div style={statLabel}>{item.label}</div>
            <div style={statValue}>{item.value}</div>
          </div>
        ))}
      </div>

      <div style={infoBanner}>
        <strong>Admin workflow:</strong> Review the claim first, inspect the
        defect photo and proof, then approve or reject. Only approved claims can
        be marked as fulfilled with a replacement receipt or service proof.
      </div>

      <div style={toolbarCard}>
        <div style={toolbarTop}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order, customer, product, issue, or admin note..."
            style={searchInput}
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={selectInput}
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="fulfilled">Fulfilled</option>
            <option value="rejected">Rejected</option>
          </select>

          <button
            onClick={() => {
              setSearch("");
              setStatusFilter("");
            }}
            style={ghostButton}
          >
            Reset
          </button>
        </div>

        <div style={statusRow}>
          <StatusFilterChip
            active={statusFilter === ""}
            label="All"
            onClick={() => setStatusFilter("")}
          />
          {Object.entries(STATUS_META).map(([key, meta]) => (
            <StatusFilterChip
              key={key}
              active={statusFilter === key}
              label={meta.label}
              onClick={() => setStatusFilter(key)}
              meta={meta}
            />
          ))}

          <div style={filterMeta}>
            {activeFilterCount > 0
              ? `${activeFilterCount} active filter(s)`
              : "No active filters"}
          </div>
        </div>
      </div>

      <div style={tableCard}>
        <div style={sectionHead}>
          <div>
            <h2 style={sectionTitle}>Warranty Queue</h2>
            <p style={sectionSubtitle}>
              Compact admin queue with full review inside the claim modal.
            </p>
          </div>
        </div>

        <div style={tableWrap}>
          <table style={table}>
            <thead>
              <tr style={theadRow}>
                <th style={{ ...th, width: "30%" }}>Claim</th>
                <th style={{ ...th, width: "18%" }}>Customer</th>
                <th style={{ ...th, width: "18%" }}>Submitted</th>
                <th style={{ ...th, width: "14%" }}>Status</th>
                <th style={{ ...th, width: "20%" }}>Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={emptyCell}>
                    Loading warranty claims...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={5} style={emptyCell}>
                    No warranty claims found.
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const statusMeta = getStatusMeta(row.status);
                  const issuePreview =
                    String(row.description || "").trim() ||
                    "No issue description provided.";

                  return (
                    <tr key={row.id} style={bodyRow}>
                      <td style={td}>
                        <div style={claimTitle}>
                          {row.product_name || "Unnamed Product"}
                        </div>
                        <button
                          onClick={() =>
                            navigate(`/admin/orders/${row.order_id}`)
                          }
                          style={orderLink}
                        >
                          {row.order_number || `Order #${row.order_id}`}
                        </button>
                        <div style={issuePreviewStyle}>{issuePreview}</div>
                        {row.status === "rejected" && row.admin_note ? (
                          <div style={notePreviewStyle}>
                            Rejection reason: {row.admin_note}
                          </div>
                        ) : row.admin_note ? (
                          <div style={notePreviewStyleAdmin}>
                            Admin note: {row.admin_note}
                          </div>
                        ) : null}
                      </td>

                      <td style={td}>
                        <div style={customerName}>
                          {row.customer_name || "Customer"}
                        </div>
                        <div style={miniMeta}>
                          Warranty until {formatDate(row.warranty_expiry)}
                        </div>
                      </td>

                      <td style={td}>
                        <div style={miniStrong}>
                          {formatDateTime(row.created_at)}
                        </div>
                        <div style={miniMeta}>
                          {row.fulfilled_at
                            ? `Fulfilled ${formatDateTime(row.fulfilled_at)}`
                            : row.status === "rejected"
                              ? "Rejected by admin"
                              : "Awaiting admin action"}
                        </div>
                      </td>

                      <td style={td}>
                        <span
                          style={{
                            ...statusPill,
                            background: statusMeta.bg,
                            color: statusMeta.tone,
                            borderColor: statusMeta.border,
                          }}
                        >
                          {statusMeta.label}
                        </span>
                      </td>

                      <td style={td}>
                        <div style={rowActions}>
                          <button
                            onClick={() => setSelectedRow(row)}
                            style={primaryOutlineBtn}
                          >
                            Review
                          </button>

                          <button
                            onClick={() =>
                              navigate(`/admin/orders/${row.order_id}`)
                            }
                            style={plainActionBtn}
                          >
                            View Order
                          </button>
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

      {selectedRow && (
        <ReviewModal
          row={selectedRow}
          onClose={() => setSelectedRow(null)}
          onApprove={() =>
            setDecisionModal({ row: selectedRow, decision: "approved" })
          }
          onReject={() =>
            setDecisionModal({ row: selectedRow, decision: "rejected" })
          }
          onFulfill={() => setFulfillTarget(selectedRow)}
          onViewOrder={() => navigate(`/admin/orders/${selectedRow.order_id}`)}
        />
      )}

      {decisionModal && (
        <DecisionModal
          row={decisionModal.row}
          decision={decisionModal.decision}
          onClose={() => setDecisionModal(null)}
          onSubmit={handleDecision}
        />
      )}

      {fulfillTarget && (
        <FulfillModal
          row={fulfillTarget}
          onClose={() => setFulfillTarget(null)}
          onSubmit={handleFulfill}
        />
      )}
    </div>
  );
}

function StatusFilterChip({ active, label, onClick, meta }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...filterChip,
        background: active
          ? meta
            ? meta.bg === "#ffffff"
              ? "#18181b"
              : meta.bg
            : "#18181b"
          : meta
            ? meta.bg === "#ffffff"
              ? "#f4f4f5"
              : meta.bg
            : "#f4f4f5",
        color: active
          ? meta && meta.bg !== "#ffffff"
            ? meta.tone
            : "#ffffff"
          : meta
            ? meta.tone
            : "#52525b",
        border: active
          ? `1px solid ${meta ? (meta.border === "#d4d4d8" ? "#18181b" : meta.border) : "#18181b"}`
          : `1px solid ${meta ? meta.border : "#e4e4e7"}`,
      }}
    >
      {label}
    </button>
  );
}

function ReviewModal({
  row,
  onClose,
  onApprove,
  onReject,
  onFulfill,
  onViewOrder,
}) {
  const statusKey = String(row.status || "").toLowerCase();
  const statusMeta = getStatusMeta(statusKey);

  return (
    <div style={overlay}>
      <div style={reviewModal}>
        <div style={modalHeader}>
          <div>
            <div style={modalEyebrow}>Warranty Review</div>
            <h3 style={modalTitle}>{row.product_name || "Warranty Claim"}</h3>
            <div style={modalSubline}>
              {row.order_number || `Order #${row.order_id}`} · Claim #
              {String(row.id).padStart(4, "0")}
            </div>
          </div>

          <button onClick={onClose} style={closeBtn}>
            ✕
          </button>
        </div>

        <div style={reviewGrid}>
          <div style={mainColumn}>
            <div style={panel}>
              <div style={panelTitle}>Issue Description</div>
              <div style={issueBody}>
                {row.description || "No issue description provided."}
              </div>
            </div>

            <div style={panel}>
              <div style={panelTitle}>Evidence</div>
              <div style={evidenceRow}>
                <button
                  onClick={() => openAsset(row.photo_url, "defect photo")}
                  style={evidenceBtn}
                >
                  Open Defect Photo
                </button>
                <button
                  onClick={() => openAsset(row.proof_url, "proof of purchase")}
                  style={evidenceBtn}
                >
                  Open Proof of Purchase
                </button>
                {row.replacement_receipt && (
                  <button
                    onClick={() =>
                      openAsset(row.replacement_receipt, "replacement receipt")
                    }
                    style={secondaryEvidenceBtn}
                  >
                    Open Replacement Receipt
                  </button>
                )}
              </div>
            </div>

            {row.admin_note && (
              <div style={panel}>
                <div style={panelTitle}>
                  {statusKey === "rejected" ? "Rejection Reason" : "Admin Note"}
                </div>
                <div style={issueBody}>{row.admin_note}</div>
              </div>
            )}
          </div>

          <div style={sideColumn}>
            <div style={summaryCard}>
              <div style={summaryTitle}>Claim Summary</div>

              <div style={summaryItem}>
                <span style={summaryLabel}>Customer</span>
                <span style={summaryValue}>
                  {row.customer_name || "Customer"}
                </span>
              </div>

              <div style={summaryItem}>
                <span style={summaryLabel}>Submitted</span>
                <span style={summaryValue}>
                  {formatDateTime(row.created_at)}
                </span>
              </div>

              <div style={summaryItem}>
                <span style={summaryLabel}>Warranty Expiry</span>
                <span style={summaryValue}>
                  {formatDate(row.warranty_expiry)}
                </span>
              </div>

              <div style={summaryItem}>
                <span style={summaryLabel}>Current Status</span>
                <span
                  style={{
                    ...statusPill,
                    background: statusMeta.bg,
                    color: statusMeta.tone,
                    borderColor: statusMeta.border,
                    alignSelf: "flex-start",
                  }}
                >
                  {statusMeta.label}
                </span>
              </div>

              {row.fulfilled_by_name && (
                <div style={summaryItem}>
                  <span style={summaryLabel}>Fulfilled By</span>
                  <span style={summaryValue}>{row.fulfilled_by_name}</span>
                </div>
              )}

              {row.fulfilled_at && (
                <div style={summaryItem}>
                  <span style={summaryLabel}>Fulfilled At</span>
                  <span style={summaryValue}>
                    {formatDateTime(row.fulfilled_at)}
                  </span>
                </div>
              )}

              {row.admin_note && (
                <div style={summaryItem}>
                  <span style={summaryLabel}>
                    {statusKey === "rejected"
                      ? "Rejection Reason"
                      : "Admin Note"}
                  </span>
                  <span style={summaryValue}>{row.admin_note}</span>
                </div>
              )}

              <div style={summaryDivider} />

              <button onClick={onViewOrder} style={fullWidthGhost}>
                View Linked Order
              </button>

              {statusKey === "pending" && (
                <div style={decisionStack}>
                  <button onClick={onApprove} style={approveBtn}>
                    Approve Claim
                  </button>
                  <button onClick={onReject} style={rejectBtn}>
                    Reject Claim
                  </button>
                </div>
              )}

              {statusKey === "approved" && (
                <button onClick={onFulfill} style={fulfillBtn}>
                  Mark as Fulfilled
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DecisionModal({ row, decision, onClose, onSubmit }) {
  const isReject = decision === "rejected";
  const [adminNote, setAdminNote] = useState(
    isReject ? row.admin_note || "" : row.admin_note || "",
  );

  return (
    <div style={overlay}>
      <div style={smallModal}>
        <div style={modalHeader}>
          <div>
            <div style={modalEyebrow}>
              {isReject ? "Reject Claim" : "Approve Claim"}
            </div>
            <h3 style={modalTitle}>
              {isReject ? "Reject Warranty Claim" : "Approve Warranty Claim"}
            </h3>
            <div style={modalSubline}>
              {row.order_number || `Order #${row.order_id}`} ·{" "}
              {row.product_name}
            </div>
          </div>

          <button onClick={onClose} style={closeBtn}>
            ✕
          </button>
        </div>

        <div style={{ ...panel, margin: 22, marginBottom: 14 }}>
          <div style={panelTitle}>
            {isReject ? "Rejection Reason" : "Admin Note"}
          </div>
          <textarea
            value={adminNote}
            onChange={(e) => setAdminNote(e.target.value)}
            rows={5}
            placeholder={
              isReject
                ? "Explain clearly why this warranty claim is being rejected..."
                : "Optional note for approval..."
            }
            style={textareaInput}
          />
          <div style={helperText}>
            {isReject
              ? "This note will be shown to the customer."
              : "Optional internal/customer-facing note for this decision."}
          </div>
        </div>

        <div style={modalFooter}>
          <button onClick={onClose} style={ghostButton}>
            Cancel
          </button>
          <button
            onClick={() => {
              if (isReject && !adminNote.trim()) {
                toast.error("Please enter the rejection reason first.");
                return;
              }

              onSubmit({
                id: row.id,
                decision,
                admin_note: adminNote.trim(),
              });
            }}
            style={isReject ? rejectBtn : approveBtn}
          >
            {isReject ? "Save Rejection" : "Save Approval"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FulfillModal({ row, onClose, onSubmit }) {
  const [file, setFile] = useState(null);

  return (
    <div style={overlay}>
      <div style={smallModal}>
        <div style={modalHeader}>
          <div>
            <div style={modalEyebrow}>Fulfillment</div>
            <h3 style={modalTitle}>Upload Replacement Receipt</h3>
            <div style={modalSubline}>
              {row.order_number || `Order #${row.order_id}`} ·{" "}
              {row.product_name}
            </div>
          </div>

          <button onClick={onClose} style={closeBtn}>
            ✕
          </button>
        </div>

        <div style={{ ...panel, margin: 22, marginBottom: 14 }}>
          <div style={panelTitle}>Replacement Receipt / Service Proof</div>
          <input
            type="file"
            accept=".jpg,.jpeg,.png,.webp,.pdf"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            style={fileInput}
          />
          <div style={helperText}>
            Upload the proof used to close this approved warranty claim.
          </div>
        </div>

        <div style={modalFooter}>
          <button onClick={onClose} style={ghostButton}>
            Cancel
          </button>
          <button
            onClick={() => {
              if (!file) {
                toast.error("Please upload the replacement receipt first.");
                return;
              }
              onSubmit({ id: row.id, file });
            }}
            style={fulfillBtn}
          >
            Save Fulfillment
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const pageShell = {
  maxWidth: 1180,
  margin: "0 auto",
  display: "flex",
  flexDirection: "column",
  gap: 16,
};

const headerRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  flexWrap: "wrap",
};

const eyebrow = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "1px",
  textTransform: "uppercase",
  color: "#71717a",
  marginBottom: 8,
};

const pageTitle = {
  margin: 0,
  fontSize: 24,
  lineHeight: 1.1,
  fontWeight: 800,
  color: "#0a0a0a",
  letterSpacing: "-0.02em",
};

const pageSubtitle = {
  margin: "8px 0 0",
  color: "#52525b",
  fontSize: 13,
  lineHeight: 1.6,
  maxWidth: 720,
};

const headerBadge = {
  background: "#ffffff",
  border: "1px solid #e4e4e7",
  borderRadius: 12,
  padding: "10px 14px",
  fontSize: 12,
  fontWeight: 700,
  color: "#18181b",
  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
};

const statsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 12,
};

const statCard = {
  background: "#fff",
  border: "1px solid #e4e4e7",
  borderRadius: 12,
  padding: "16px 18px",
  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
};

const statLabel = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "1px",
  textTransform: "uppercase",
  color: "#71717a",
  marginBottom: 8,
};

const statValue = {
  fontSize: 24,
  fontWeight: 800,
  color: "#0a0a0a",
  lineHeight: 1,
  letterSpacing: "-0.02em",
};

const infoBanner = {
  background: "#fafafa",
  border: "1px solid #e4e4e7",
  borderRadius: 12,
  padding: "16px",
  fontSize: 13,
  color: "#18181b",
  lineHeight: 1.6,
};

const toolbarCard = {
  background: "#fff",
  border: "1px solid #e4e4e7",
  borderRadius: 16,
  padding: 16,
  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
};

const toolbarTop = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginBottom: 16,
};

const searchInput = {
  flex: "1 1 360px",
  minWidth: 260,
  height: 40,
  padding: "0 14px",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  fontSize: 13,
  color: "#18181b",
  outline: "none",
};

const selectInput = {
  height: 40,
  minWidth: 160,
  padding: "0 12px",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  fontSize: 13,
  color: "#18181b",
  background: "#fff",
  outline: "none",
};

const ghostButton = {
  height: 40,
  padding: "0 16px",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  background: "#f4f4f5",
  color: "#18181b",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  transition: "background 0.2s",
};

const statusRow = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

const filterChip = {
  padding: "7px 14px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap",
  transition: "all 0.15s ease",
};

const filterMeta = {
  marginLeft: "auto",
  fontSize: 12,
  fontWeight: 600,
  color: "#71717a",
};

const tableCard = {
  background: "#fff",
  border: "1px solid #e4e4e7",
  borderRadius: 16,
  overflow: "hidden",
  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
};

const sectionHead = {
  padding: "20px 20px 14px",
  borderBottom: "1px solid #e4e4e7",
};

const sectionTitle = {
  margin: 0,
  fontSize: 18,
  fontWeight: 800,
  color: "#0a0a0a",
  letterSpacing: "-0.01em",
};

const sectionSubtitle = {
  margin: "4px 0 0",
  fontSize: 13,
  color: "#52525b",
};

const tableWrap = {
  width: "100%",
  overflowX: "auto",
};

const table = {
  width: "100%",
  minWidth: 980,
  borderCollapse: "separate",
  borderSpacing: 0,
};

const theadRow = {
  background: "#fafafa",
};

const th = {
  textAlign: "left",
  padding: "14px 16px",
  fontSize: 10,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "1px",
  color: "#71717a",
  borderBottom: "1px solid #e4e4e7",
};

const td = {
  padding: "16px",
  borderBottom: "1px solid #f4f4f5",
  verticalAlign: "top",
  fontSize: 13,
  color: "#18181b",
};

const bodyRow = {
  background: "#fff",
};

const emptyCell = {
  textAlign: "center",
  padding: "44px 20px",
  color: "#71717a",
  fontSize: 13,
  fontWeight: 600,
};

const claimTitle = {
  fontSize: 15,
  fontWeight: 800,
  color: "#0a0a0a",
  marginBottom: 6,
};

const orderLink = {
  background: "none",
  border: "none",
  padding: 0,
  margin: 0,
  color: "#18181b",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  textDecoration: "underline",
};

const issuePreviewStyle = {
  marginTop: 8,
  color: "#52525b",
  lineHeight: 1.55,
  fontSize: 12,
  display: "-webkit-box",
  WebkitLineClamp: 3,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

const notePreviewStyle = {
  marginTop: 10,
  fontSize: 12,
  lineHeight: 1.55,
  color: "#991b1b",
  background: "#fef2f2",
  border: "1px solid #fecaca",
  borderRadius: 8,
  padding: "8px 12px",
  fontWeight: 500,
};

const notePreviewStyleAdmin = {
  marginTop: 10,
  fontSize: 12,
  lineHeight: 1.55,
  color: "#18181b",
  background: "#f4f4f5",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  padding: "8px 12px",
  fontWeight: 500,
};

const customerName = {
  fontSize: 14,
  fontWeight: 700,
  color: "#0a0a0a",
  marginBottom: 6,
};

const miniStrong = {
  fontSize: 13,
  fontWeight: 700,
  color: "#0a0a0a",
  marginBottom: 6,
};

const miniMeta = {
  fontSize: 12,
  color: "#71717a",
  lineHeight: 1.5,
};

const statusPill = {
  display: "inline-flex",
  alignItems: "center",
  padding: "6px 12px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 700,
  border: "1px solid transparent",
};

const rowActions = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
};

const primaryOutlineBtn = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid #18181b",
  background: "#18181b",
  color: "#ffffff",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  transition: "background 0.2s",
};

const plainActionBtn = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid #e4e4e7",
  background: "#f4f4f5",
  color: "#18181b",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
  transition: "background 0.2s",
};

const overlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(0, 0, 0, 0.6)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
  padding: 20,
};

const reviewModal = {
  width: "100%",
  maxWidth: 1040,
  background: "#fff",
  borderRadius: 20,
  overflow: "hidden",
  boxShadow: "0 25px 60px rgba(0, 0, 0, 0.15)",
};

const smallModal = {
  width: "100%",
  maxWidth: 560,
  background: "#fff",
  borderRadius: 20,
  overflow: "hidden",
  boxShadow: "0 25px 60px rgba(0, 0, 0, 0.15)",
};

const modalHeader = {
  padding: "24px 24px 16px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  borderBottom: "1px solid #e4e4e7",
};

const modalEyebrow = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "1px",
  textTransform: "uppercase",
  color: "#71717a",
  marginBottom: 8,
};

const modalTitle = {
  margin: 0,
  fontSize: 22,
  fontWeight: 800,
  color: "#0a0a0a",
  lineHeight: 1.15,
  letterSpacing: "-0.01em",
};

const modalSubline = {
  marginTop: 8,
  fontSize: 13,
  color: "#52525b",
};

const closeBtn = {
  width: 36,
  height: 36,
  borderRadius: 999,
  border: "1px solid #e4e4e7",
  background: "#fafafa",
  color: "#52525b",
  fontSize: 16,
  fontWeight: 700,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  transition: "all 0.2s",
};

const reviewGrid = {
  display: "grid",
  gridTemplateColumns: "1.5fr 0.95fr",
  gap: 0,
};

const mainColumn = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
  borderRight: "1px solid #e4e4e7",
};

const sideColumn = {
  padding: 24,
  background: "#fafafa",
};

const panel = {
  background: "#fff",
  border: "1px solid #e4e4e7",
  borderRadius: 12,
  padding: 20,
};

const panelTitle = {
  fontSize: 11,
  fontWeight: 800,
  color: "#0a0a0a",
  textTransform: "uppercase",
  letterSpacing: "1px",
  marginBottom: 14,
};

const issueBody = {
  fontSize: 14,
  lineHeight: 1.6,
  color: "#18181b",
  whiteSpace: "pre-wrap",
};

const evidenceRow = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
};

const evidenceBtn = {
  padding: "10px 16px",
  borderRadius: 8,
  border: "1px solid #18181b",
  background: "#18181b",
  color: "#ffffff",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  transition: "background 0.2s",
};

const secondaryEvidenceBtn = {
  padding: "10px 16px",
  borderRadius: 8,
  border: "1px solid #e4e4e7",
  background: "#f4f4f5",
  color: "#18181b",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  transition: "background 0.2s",
};

const summaryCard = {
  background: "#fff",
  border: "1px solid #e4e4e7",
  borderRadius: 16,
  padding: 20,
};

const summaryTitle = {
  fontSize: 16,
  fontWeight: 800,
  color: "#0a0a0a",
  marginBottom: 20,
};

const summaryItem = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  marginBottom: 16,
};

const summaryLabel = {
  fontSize: 10,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "1px",
  color: "#71717a",
};

const summaryValue = {
  fontSize: 14,
  fontWeight: 700,
  color: "#18181b",
  lineHeight: 1.5,
};

const summaryDivider = {
  height: 1,
  background: "#e4e4e7",
  margin: "20px 0",
};

const fullWidthGhost = {
  width: "100%",
  padding: "12px 16px",
  borderRadius: 8,
  border: "1px solid #e4e4e7",
  background: "#f4f4f5",
  color: "#18181b",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  transition: "background 0.2s",
};

const decisionStack = {
  display: "grid",
  gap: 12,
  marginTop: 16,
};

const approveBtn = {
  width: "100%",
  padding: "12px 16px",
  borderRadius: 8,
  border: "1px solid #18181b",
  background: "#18181b",
  color: "#ffffff",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  transition: "background 0.2s",
};

const rejectBtn = {
  width: "100%",
  padding: "12px 16px",
  borderRadius: 8,
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#dc2626",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  transition: "background 0.2s",
};

const fulfillBtn = {
  width: "100%",
  padding: "12px 16px",
  borderRadius: 8,
  border: "1px solid #18181b",
  background: "#18181b",
  color: "#ffffff",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  marginTop: 16,
  transition: "background 0.2s",
};

const fileInput = {
  width: "100%",
  padding: "10px 14px",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  fontSize: 13,
  boxSizing: "border-box",
  background: "#fafafa",
};

const textareaInput = {
  width: "100%",
  minHeight: 120,
  padding: "14px",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  fontSize: 13,
  boxSizing: "border-box",
  resize: "vertical",
  outline: "none",
  color: "#18181b",
  fontFamily: "inherit",
};

const helperText = {
  marginTop: 10,
  fontSize: 12,
  color: "#71717a",
  lineHeight: 1.5,
};

const modalFooter = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 12,
  padding: "0 24px 24px",
};
