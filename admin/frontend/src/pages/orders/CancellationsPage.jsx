import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import toast from "react-hot-toast";

const POLICY_STYLE = {
  full_refund: { bg: "#dcfce7", color: "#166534", label: "Full Refund" },
  processing_fee: { bg: "#fef3c7", color: "#a16207", label: "15% Fee Applied" },
  non_refundable: { bg: "#fee2e2", color: "#b91c1c", label: "Non-Refundable" },
  rejected: { bg: "#fee2e2", color: "#dc2626", label: "Rejected" },
};

const DECISION_STYLE = {
  pending: { bg: "#fef3c7", color: "#a16207", label: "Pending" },
  approved: { bg: "#dcfce7", color: "#166534", label: "Approved" },
  rejected: { bg: "#fee2e2", color: "#dc2626", label: "Rejected" },
};

const normalize = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const getChannelMeta = (channel) => {
  const key = normalize(channel);
  return key === "online"
    ? { label: "Online", bg: "#eff6ff", color: "#2563eb" }
    : { label: "Walk-in", bg: "#ecfdf5", color: "#15803d" };
};

const formatMoney = (value) =>
  `₱ ${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

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

const getDecisionStatus = (row) => {
  const explicit = normalize(row?.decision_status);
  if (explicit) return explicit;

  if (row?.approved_by == null) return "pending";
  if (normalize(row?.policy_applied) === "rejected") return "rejected";
  return "approved";
};

export default function CancellationsPage() {
  const navigate = useNavigate();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState("");
  const [decisionFilter, setDecisionFilter] = useState("");
  const [showPolicy, setShowPolicy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/orders/cancellations");
      setRows(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error(
        err?.response?.data?.message || "Failed to load cancellation requests.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filteredRows = useMemo(() => {
    const term = normalize(search);

    return rows.filter((row) => {
      const decision = getDecisionStatus(row);
      const haystack = [
        row.order_number,
        row.customer_name,
        row.requested_by_name,
        row.reason,
        row.policy_applied,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        (!decisionFilter || decision === decisionFilter) &&
        (!term || haystack.includes(term))
      );
    });
  }, [rows, search, decisionFilter]);

  const stats = useMemo(() => {
    const pending = rows.filter(
      (row) => getDecisionStatus(row) === "pending",
    ).length;
    const approved = rows.filter(
      (row) => getDecisionStatus(row) === "approved",
    ).length;
    const rejected = rows.filter(
      (row) => getDecisionStatus(row) === "rejected",
    ).length;
    const refundExposure = rows
      .filter((row) => getDecisionStatus(row) === "approved")
      .reduce((sum, row) => sum + Number(row.refund_amount || 0), 0);

    return [
      { label: "Total Requests", value: rows.length },
      { label: "Pending Review", value: pending },
      { label: "Approved", value: approved },
      { label: "Rejected", value: rejected },
      { label: "Refund Exposure", value: formatMoney(refundExposure) },
    ];
  }, [rows]);

  const handleProcess = async ({ approved, refund_amount, policy_applied }) => {
    if (!modal?.row?.order_id) return;

    try {
      await api.post(`/orders/${modal.row.order_id}/cancellation`, {
        approved,
        refund_amount,
        policy_applied,
      });

      toast.success(
        approved ? "Cancellation approved." : "Cancellation rejected.",
      );
      setModal(null);
      load();
    } catch (err) {
      toast.error(
        err?.response?.data?.message ||
          "Failed to process cancellation request.",
      );
    }
  };

  return (
    <div style={pageShell}>
      <div style={headerBlock}>
        <div>
          <div style={eyebrow}>Sales & Orders</div>
          <h1 style={pageTitle}>Cancellations & Refunds</h1>
          <p style={pageSubtitle}>
            Keep review decisions clean, consistent, and tied to the server-side
            refund policy.
          </p>
        </div>

        <div style={summaryPill}>{rows.length} total requests</div>
      </div>

      <div style={statsGrid}>
        {stats.map((item) => (
          <div key={item.label} style={statCard}>
            <div style={statLabel}>{item.label}</div>
            <div style={statValue}>{item.value}</div>
          </div>
        ))}
      </div>

      <div style={infoCard}>
        <div style={infoHeader}>
          <div>
            <div style={infoTitle}>Cancellation policy guide</div>
            <div style={infoSubtitle}>
              Show only when needed instead of always taking vertical space.
            </div>
          </div>

          <button
            onClick={() => setShowPolicy((prev) => !prev)}
            style={btnGhost}
          >
            {showPolicy ? "Hide Policy" : "View Policy"}
          </button>
        </div>

        {showPolicy && (
          <div style={policyBody}>
            <div>
              • Standard orders cancelled before shipment → full refund.
            </div>
            <div>
              • Custom blueprint orders after down payment but before contract
              release → 15% processing fee.
            </div>
            <div>• After contract release → non-refundable.</div>
            <div>
              • POS same-day void before the item leaves the premises → full
              refund.
            </div>
          </div>
        )}
      </div>

      <div style={filterCard}>
        <div style={filterTopRow}>
          <input
            placeholder="Search order, customer, requester, or reason..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...inputBase, ...searchInput }}
          />

          <select
            value={decisionFilter}
            onChange={(e) => setDecisionFilter(e.target.value)}
            style={{ ...inputBase, minWidth: 180 }}
          >
            <option value="">All Decisions</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>

          <button
            onClick={() => {
              setSearch("");
              setDecisionFilter("");
            }}
            style={btnGhost}
          >
            Reset
          </button>
        </div>

        <div style={statusRow}>
          <button
            type="button"
            onClick={() => setDecisionFilter("")}
            style={{
              ...statusChip,
              background: decisionFilter ? "#f8fafc" : "#0f172a",
              color: decisionFilter ? "#475569" : "#ffffff",
              borderColor: decisionFilter ? "#e2e8f0" : "#0f172a",
            }}
          >
            All
          </button>

          {Object.entries(DECISION_STYLE).map(([key, meta]) => {
            const isActive = decisionFilter === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setDecisionFilter(key)}
                style={{
                  ...statusChip,
                  background: isActive ? meta.color : meta.bg,
                  color: isActive ? "#ffffff" : meta.color,
                  borderColor: isActive ? meta.color : "transparent",
                }}
              >
                {meta.label}
              </button>
            );
          })}

          <div style={filtersMeta}>
            {search || decisionFilter
              ? "Filtered view"
              : "Showing all requests"}
          </div>
        </div>
      </div>

      <div style={tableCard}>
        <div style={tableHeader}>
          <div>
            <h2 style={tableTitle}>Cancellation Requests</h2>
            <p style={tableSubtitle}>
              Use the table for scanning, then open a single request only when
              you need to process it.
            </p>
          </div>
        </div>

        <div style={tableWrap}>
          <table style={table}>
            <thead>
              <tr style={theadRow}>
                {[
                  "Order",
                  "Customer",
                  "Requested By",
                  "Channel",
                  "Reason",
                  "Policy",
                  "Refund",
                  "Decision",
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
                  <td colSpan={9} style={emptyCell}>
                    Loading cancellation requests...
                  </td>
                </tr>
              ) : filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={9} style={emptyCell}>
                    <div style={emptyState}>
                      <div style={emptyStateTitle}>
                        No cancellation requests found
                      </div>
                      <div style={emptyStateText}>
                        New requests will appear here after customers submit a
                        cancellation or refund request.
                      </div>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRows.map((row) => {
                  const decision = getDecisionStatus(row);
                  const decisionMeta =
                    DECISION_STYLE[decision] || DECISION_STYLE.pending;
                  const policyKey =
                    normalize(row.policy_applied) ||
                    (decision === "rejected" ? "rejected" : "");
                  const policyMeta = POLICY_STYLE[policyKey];
                  const channelMeta = getChannelMeta(row.channel);

                  return (
                    <tr key={row.id} style={tbodyRow}>
                      <td style={td}>
                        <button
                          onClick={() =>navigate(`/admin/orders/${row.order_id}`)}
                          style={orderLink}
                        >
                          {row.order_number ||
                            `#${String(row.order_id).padStart(5, "0")}`}
                        </button>
                        <div style={secondaryText}>
                          Requested {formatDateTime(row.created_at)}
                        </div>
                      </td>

                      <td style={td}>
                        <div style={primaryText}>
                          {row.customer_name || "Customer"}
                        </div>
                        <div style={secondaryText}>
                          Order #{String(row.order_id).padStart(5, "0")}
                        </div>
                      </td>

                      <td style={td}>
                        <div style={primaryText}>
                          {row.requested_by_name || "Customer"}
                        </div>
                        <div style={secondaryText}>
                          {row.approved_by_name
                            ? `Processed by ${row.approved_by_name}`
                            : "Awaiting admin review"}
                        </div>
                      </td>

                      <td style={td}>
                        <span
                          style={{
                            ...softBadge,
                            background: channelMeta.bg,
                            color: channelMeta.color,
                          }}
                        >
                          {channelMeta.label}
                        </span>
                      </td>

                      <td style={td}>
                        <div style={reasonText}>
                          {row.reason || "No reason provided."}
                        </div>
                      </td>

                      <td style={td}>
                        {policyMeta ? (
                          <span
                            style={{
                              ...softBadge,
                              background: policyMeta.bg,
                              color: policyMeta.color,
                            }}
                          >
                            {policyMeta.label}
                          </span>
                        ) : (
                          <span style={secondaryText}>Pending review</span>
                        )}
                      </td>

                      <td
                        style={{
                          ...td,
                          fontWeight: 700,
                          color:
                            Number(row.refund_amount || 0) > 0
                              ? "#166534"
                              : "#334155",
                        }}
                      >
                        {Number(row.refund_amount || 0) > 0
                          ? formatMoney(row.refund_amount)
                          : "—"}
                      </td>

                      <td style={td}>
                        <span
                          style={{
                            ...softBadge,
                            background: decisionMeta.bg,
                            color: decisionMeta.color,
                          }}
                        >
                          {decisionMeta.label}
                        </span>
                      </td>

                      <td style={td}>
                        <div style={actionsRow}>
                          <button
                            onClick={() => navigate(`/admin/orders/${row.order_id}`)}
                            style={btnView}
                          >
                            View order
                          </button>

                          {decision === "pending" && (
                            <button
                              onClick={() => setModal({ row })}
                              style={btnApprove}
                            >
                              Process
                            </button>
                          )}
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

      {modal && (
        <ProcessModal
          row={modal.row}
          onClose={() => setModal(null)}
          onSubmit={handleProcess}
        />
      )}
    </div>
  );
}

function ProcessModal({ row, onClose, onSubmit }) {
  const [approved, setApproved] = useState(true);
  const [policy, setPolicy] = useState("full_refund");
  const [refund, setRefund] = useState(
    Number(row.total_amount || 0).toFixed(2),
  );

  const handlePolicyChange = (nextPolicy) => {
    setPolicy(nextPolicy);

    const total = Number(row.total_amount || 0);

    if (nextPolicy === "full_refund") setRefund(total.toFixed(2));
    if (nextPolicy === "processing_fee") setRefund((total * 0.85).toFixed(2));
    if (nextPolicy === "non_refundable") setRefund("0.00");
  };

  const handleSubmit = () => {
    const numericRefund = Number(refund || 0);

    if (approved) {
      if (Number.isNaN(numericRefund) || numericRefund < 0) {
        toast.error("Refund amount must be 0 or higher.");
        return;
      }

      onSubmit({
        approved: true,
        refund_amount: numericRefund,
        policy_applied: policy,
      });
      return;
    }

    onSubmit({
      approved: false,
      refund_amount: 0,
      policy_applied: "rejected",
    });
  };

  return (
    <div style={overlay}>
      <div style={modalBox}>
        <h3 style={modalTitle}>Process Cancellation Request</h3>
        <p style={modalSubtitle}>
          {row.order_number ||
            `Order #${String(row.order_id).padStart(5, "0")}`}{" "}
          · Total {formatMoney(row.total_amount)}
        </p>

        <div style={infoPanel}>
          <div>
            <strong>Customer:</strong> {row.customer_name || "Customer"}
          </div>
          <div>
            <strong>Requested by:</strong> {row.requested_by_name || "Customer"}
          </div>
          <div>
            <strong>Requested on:</strong> {formatDateTime(row.created_at)}
          </div>
          <div>
            <strong>Reason:</strong> {row.reason || "No reason provided."}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelSm}>Decision</label>
          <div style={radioRow}>
            <label style={radioLabel}>
              <input
                type="radio"
                checked={approved}
                onChange={() => setApproved(true)}
              />
              Approve cancellation
            </label>

            <label style={radioLabel}>
              <input
                type="radio"
                checked={!approved}
                onChange={() => setApproved(false)}
              />
              Reject request
            </label>
          </div>
        </div>

        {approved ? (
          <>
            <div style={{ marginBottom: 14 }}>
              <label style={labelSm}>Cancellation Policy</label>
              <select
                value={policy}
                onChange={(e) => handlePolicyChange(e.target.value)}
                style={inputFull}
              >
                <option value="full_refund">Full Refund</option>
                <option value="processing_fee">15% Processing Fee</option>
                <option value="non_refundable">Non-Refundable</option>
              </select>
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={labelSm}>Refund Amount (₱)</label>
              <input
                type="number"
                step="0.01"
                value={refund}
                readOnly
                style={{
                  ...inputFull,
                  background: "#f8fafc",
                  color: "#475569",
                }}
              />
              <div style={helperText}>
                Preview only. Final refund amount is still validated and
                enforced by the backend.
              </div>
            </div>
          </>
        ) : (
          <div style={rejectNote}>
            This request will be marked as rejected. The related order will stay
            in its current status.
          </div>
        )}

        <div style={modalActions}>
          <button onClick={onClose} style={btnGhost}>
            Close
          </button>
          <button
            onClick={handleSubmit}
            style={approved ? btnPrimary : btnDeclineAction}
          >
            {approved ? "Approve & Process" : "Reject Request"}
          </button>
        </div>
      </div>
    </div>
  );
}

const pageShell = {
  maxWidth: 1180,
  margin: "0 auto",
  display: "flex",
  flexDirection: "column",
  gap: 12,
};

const headerBlock = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 14,
  flexWrap: "wrap",
};

const eyebrow = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: "#64748b",
  marginBottom: 8,
};

const pageTitle = {
  margin: 0,
  fontSize: 22,
  lineHeight: 1.1,
  fontWeight: 700,
  color: "#0f172a",
};

const pageSubtitle = {
  margin: "8px 0 0",
  color: "#64748b",
  fontSize: 12,
  lineHeight: 1.55,
};

const summaryPill = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  padding: "10px 14px",
  fontSize: 12,
  fontWeight: 700,
  color: "#0f172a",
  boxShadow: "0 6px 18px rgba(15, 23, 42, 0.04)",
};

const statsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 12,
};

const statCard = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  padding: "12px 14px",
  boxShadow: "0 4px 12px rgba(15, 23, 42, 0.028)",
};

const statLabel = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "#94a3b8",
  marginBottom: 8,
};

const statValue = {
  fontSize: 22,
  fontWeight: 700,
  color: "#0f172a",
  lineHeight: 1,
};

const infoCard = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 18,
  padding: 12,
  boxShadow: "0 6px 18px rgba(15, 23, 42, 0.028)",
};

const infoHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
};

const infoTitle = {
  fontSize: 14,
  fontWeight: 700,
  color: "#0f172a",
};

const infoSubtitle = {
  marginTop: 4,
  fontSize: 12,
  color: "#64748b",
};

const policyBody = {
  marginTop: 12,
  display: "grid",
  gap: 8,
  padding: "12px 14px",
  borderRadius: 14,
  background: "#fffbeb",
  border: "1px solid #fde68a",
  color: "#92400e",
  fontSize: 13,
  lineHeight: 1.6,
};

const filterCard = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 18,
  padding: 12,
  boxShadow: "0 6px 18px rgba(15, 23, 42, 0.028)",
};

const filterTopRow = {
  display: "flex",
  flexWrap: "wrap",
  gap: 10,
  marginBottom: 12,
};

const inputBase = {
  height: 38,
  borderRadius: 12,
  border: "1px solid #cbd5e1",
  background: "#ffffff",
  padding: "0 14px",
  fontSize: 13,
  color: "#0f172a",
  outline: "none",
};

const searchInput = {
  flex: "1 1 320px",
  minWidth: 260,
};

const statusRow = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
};

const statusChip = {
  padding: "6px 12px",
  borderRadius: 999,
  border: "1px solid transparent",
  fontSize: 10,
  fontWeight: 700,
  cursor: "pointer",
};

const filtersMeta = {
  marginLeft: "auto",
  fontSize: 12,
  color: "#64748b",
};

const tableCard = {
  background: "#ffffff",
  border: "1px solid #e2e8f0",
  borderRadius: 18,
  overflow: "hidden",
  boxShadow: "0 8px 22px rgba(15, 23, 42, 0.035)",
};

const tableHeader = {
  padding: "16px 18px 10px",
  borderBottom: "1px solid #eef2f7",
};

const tableTitle = {
  margin: 0,
  fontSize: 16,
  fontWeight: 700,
  color: "#0f172a",
};

const tableSubtitle = {
  margin: "4px 0 0",
  fontSize: 12,
  color: "#64748b",
};

const tableWrap = {
  width: "100%",
  overflowX: "auto",
};

const table = {
  width: "100%",
  borderCollapse: "collapse",
  minWidth: 920,
};

const theadRow = {
  background: "#f8fafc",
};

const th = {
  padding: "12px 14px",
  textAlign: "left",
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "#64748b",
  borderBottom: "1px solid #e2e8f0",
};

const tbodyRow = {
  background: "#ffffff",
};

const td = {
  padding: "14px",
  fontSize: 13,
  color: "#334155",
  borderBottom: "1px solid #f1f5f9",
  verticalAlign: "middle",
};

const orderLink = {
  background: "none",
  border: "none",
  color: "#1d4ed8",
  padding: 0,
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

const primaryText = {
  fontSize: 13,
  fontWeight: 700,
  color: "#0f172a",
};

const secondaryText = {
  marginTop: 4,
  fontSize: 11,
  color: "#94a3b8",
};

const reasonText = {
  maxWidth: 240,
  fontSize: 12,
  lineHeight: 1.55,
  color: "#475569",
};

const softBadge = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "4px 10px",
  borderRadius: 999,
  fontSize: 10,
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const actionsRow = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const btnView = {
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid #bfdbfe",
  background: "#eff6ff",
  color: "#1d4ed8",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const btnApprove = {
  padding: "8px 12px",
  borderRadius: 10,
  border: "1px solid #a7f3d0",
  background: "#ecfdf5",
  color: "#047857",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const btnGhost = {
  padding: "9px 12px",
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  background: "#ffffff",
  color: "#334155",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const btnPrimary = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid #1d4ed8",
  background: "#1d4ed8",
  color: "#ffffff",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

const emptyCell = {
  padding: 28,
  textAlign: "center",
  color: "#64748b",
  fontSize: 13,
};

const emptyState = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  alignItems: "center",
};

const emptyStateTitle = {
  fontWeight: 700,
  color: "#0f172a",
};

const emptyStateText = {
  maxWidth: 420,
  lineHeight: 1.55,
};

const overlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(15, 23, 42, 0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
  padding: 20,
};

const modalBox = {
  background: "#fff",
  borderRadius: 18,
  padding: 20,
  width: 500,
  maxWidth: "100%",
  boxShadow: "0 25px 60px rgba(15, 23, 42, 0.28)",
};

const modalTitle = {
  margin: 0,
  fontSize: 18,
  fontWeight: 700,
  color: "#0f172a",
};

const modalSubtitle = {
  margin: "6px 0 16px",
  fontSize: 12,
  color: "#64748b",
};

const infoPanel = {
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  padding: "12px 14px",
  marginBottom: 16,
  display: "grid",
  gap: 8,
  fontSize: 12,
  color: "#334155",
  lineHeight: 1.55,
};

const labelSm = {
  display: "block",
  fontSize: 12,
  fontWeight: 700,
  color: "#334155",
  marginBottom: 8,
};

const radioRow = {
  display: "flex",
  gap: 16,
  flexWrap: "wrap",
};

const radioLabel = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  fontSize: 13,
  color: "#334155",
};

const inputFull = {
  width: "100%",
  height: 38,
  borderRadius: 12,
  border: "1px solid #cbd5e1",
  background: "#ffffff",
  padding: "0 14px",
  fontSize: 13,
  color: "#0f172a",
  boxSizing: "border-box",
};

const helperText = {
  marginTop: 8,
  fontSize: 11,
  color: "#64748b",
  lineHeight: 1.5,
};

const rejectNote = {
  padding: "12px 14px",
  borderRadius: 14,
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#b91c1c",
  fontSize: 12,
  lineHeight: 1.55,
};

const modalActions = {
  marginTop: 18,
  display: "flex",
  justifyContent: "flex-end",
  gap: 10,
  flexWrap: "wrap",
};

const btnDeclineAction = {
  padding: "10px 14px",
  borderRadius: 10,
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#dc2626",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};
