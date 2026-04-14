// src/pages/customers/CustomersPage.jsx – Customer Account Management (Admin)
import React, { useEffect, useState, useCallback } from "react";
import api from "../../services/api";
import toast from "react-hot-toast";

const EMAIL_VERIFY_STYLE = {
  verified: { bg: "#d1fae5", color: "#065f46", label: "Verified" },
  pending: { bg: "#fee2e2", color: "#991b1b", label: "Not Verified" },
};

export default function CustomersPage() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoad] = useState(true);
  const [filters, setFilters] = useState({
    search: "",
    is_verified: "",
    page: 1,
  });
  const [detail, setDetail] = useState(null); // { row }

  const load = useCallback(async () => {
    setLoad(true);
    try {
      const { data } = await api.get("/customers", {
        params: { ...filters, limit: 20 },
      });
      setRows(data.rows);
      setTotal(data.total);
    } finally {
      setLoad(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  const setF = (k, v) => setFilters((f) => ({ ...f, [k]: v, page: 1 }));

  const doAction = async (id, action) => {
    const labels = {
      activate: "Activate this account?",
      deactivate: "Deactivate this account?",
      delete: "Permanently delete this customer? This cannot be undone.",
    };

    if (!window.confirm(labels[action])) return;

    try {
      const { data } = await api.patch(`/customers/${id}/status`, { action });
      toast.success(data?.message || "Customer updated.");
      setDetail(null);
      load();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Action failed.");
    }
  };

  const verifiedCount = rows.filter((r) => Number(r.is_verified) === 1).length;
  const notVerifiedCount = rows.filter(
    (r) => Number(r.is_verified) !== 1,
  ).length;

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 20,
        }}
      >
        <div>
          <h1 style={pageTitle}>Customer Account Management</h1>
          <p style={{ fontSize: 13, color: "#64748b", margin: "4px 0 0" }}>
            Review customer accounts and manage customer access.
          </p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <SummaryChip label="Total Customers" value={total} color="#3b82f6" />
        <SummaryChip
          label="Email Verified"
          value={verifiedCount}
          color="#10b981"
        />
        <SummaryChip
          label="Not Verified"
          value={notVerifiedCount}
          color="#ef4444"
          alert={notVerifiedCount > 0}
        />
      </div>

      <div
        style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}
      >
        <input
          placeholder="Search name or email..."
          value={filters.search}
          onChange={(e) => setF("search", e.target.value)}
          style={inputSm}
        />

        <select
          value={filters.is_verified}
          onChange={(e) => setF("is_verified", e.target.value)}
          style={inputSm}
        >
          <option value="">All Email Status</option>
          <option value="1">Verified</option>
          <option value="0">Not Verified</option>
        </select>

        <button
          onClick={() => setFilters({ search: "", is_verified: "", page: 1 })}
          style={btnGhost}
        >
          Reset
        </button>
      </div>

      <div style={card}>
        <table
          style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
        >
          <thead>
            <tr
              style={{
                background: "#f8fafc",
                borderBottom: "1px solid #e2e8f0",
              }}
            >
              {[
                "Name",
                "Email",
                "Phone",
                "Registered",
                "Last Login",
                "Email Verified",
                "Active",
                "Actions",
              ].map((h) => (
                <th key={h} style={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} style={centerCell}>
                  Loading customers...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} style={centerCell}>
                  No customers found.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const emailStatus =
                  Number(r.is_verified) === 1
                    ? EMAIL_VERIFY_STYLE.verified
                    : EMAIL_VERIFY_STYLE.pending;

                return (
                  <tr key={r.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={td}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        <div style={avatar}>
                          {r.name?.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 500 }}>{r.name}</div>
                        </div>
                      </div>
                    </td>

                    <td style={{ ...td, fontSize: 12 }}>{r.email}</td>
                    <td style={{ ...td, fontSize: 12 }}>{r.phone || "—"}</td>

                    <td style={{ ...td, fontSize: 12, color: "#64748b" }}>
                      {new Date(r.created_at).toLocaleDateString("en-PH")}
                    </td>

                    <td style={{ ...td, fontSize: 12, color: "#64748b" }}>
                      {r.last_login ? (
                        new Date(r.last_login).toLocaleDateString("en-PH")
                      ) : (
                        <span style={{ color: "#94a3b8" }}>Never</span>
                      )}
                    </td>

                    <td style={td}>
                      <span
                        style={{
                          background: emailStatus.bg,
                          color: emailStatus.color,
                          padding: "2px 10px",
                          borderRadius: 12,
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        {emailStatus.label}
                      </span>
                    </td>

                    <td style={td}>
                      <span
                        style={{
                          background: r.is_active ? "#d1fae5" : "#fee2e2",
                          color: r.is_active ? "#065f46" : "#991b1b",
                          padding: "2px 10px",
                          borderRadius: 12,
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        {r.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>

                    <td style={td}>
                      <div
                        style={{ display: "flex", gap: 4, flexWrap: "wrap" }}
                      >
                        <button
                          onClick={() => setDetail({ row: r })}
                          style={btnView}
                        >
                          View
                        </button>
                        {r.is_active ? (
                          <button
                            onClick={() => doAction(r.id, "deactivate")}
                            style={btnWarn}
                          >
                            Deactivate
                          </button>
                        ) : (
                          <button
                            onClick={() => doAction(r.id, "activate")}
                            style={btnApprove}
                          >
                            Activate
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

        {total > 20 && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: 10,
              padding: 16,
            }}
          >
            <button
              disabled={filters.page <= 1}
              onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
              style={btnGhost}
            >
              ← Prev
            </button>

            <span style={{ fontSize: 13, color: "#64748b" }}>
              Page {filters.page} of {Math.ceil(total / 20)}
            </span>

            <button
              disabled={filters.page >= Math.ceil(total / 20)}
              onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
              style={btnGhost}
            >
              Next →
            </button>
          </div>
        )}
      </div>

      {detail && (
        <CustomerDetailModal
          row={detail.row}
          onClose={() => setDetail(null)}
          onAction={(action) => doAction(detail.row.id, action)}
        />
      )}
    </div>
  );
}

function CustomerDetailModal({ row, onClose, onAction }) {
  const emailStatus =
    Number(row.is_verified) === 1
      ? EMAIL_VERIFY_STYLE.verified
      : EMAIL_VERIFY_STYLE.pending;

  return (
    <div style={overlay}>
      <div style={modalBox}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            marginBottom: 20,
          }}
        >
          <div style={{ ...avatar, width: 52, height: 52, fontSize: 22 }}>
            {row.name?.charAt(0).toUpperCase()}
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>
              {row.name}
            </h3>
            <span
              style={{
                background: emailStatus.bg,
                color: emailStatus.color,
                padding: "2px 10px",
                borderRadius: 12,
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              {emailStatus.label}
            </span>
          </div>
        </div>

        <div
          style={{
            background: "#f8fafc",
            borderRadius: 10,
            padding: "14px 16px",
            marginBottom: 20,
          }}
        >
          {[
            ["Email", row.email],
            ["Phone", row.phone || "—"],
            ["Address", row.address || "—"],
            ["Registered", new Date(row.created_at).toLocaleString("en-PH")],
            [
              "Last Login",
              row.last_login
                ? new Date(row.last_login).toLocaleString("en-PH")
                : "Never",
            ],
            [
              "Email Status",
              Number(row.is_verified) === 1
                ? "✓ Email verified"
                : "✗ Not verified",
            ],
            ["Account", row.is_active ? "Active" : "Inactive"],
          ].map(([label, value]) => (
            <div
              key={label}
              style={{
                display: "flex",
                justifyContent: "space-between",
                padding: "6px 0",
                borderBottom: "1px solid #f1f5f9",
                fontSize: 13,
              }}
            >
              <span style={{ color: "#64748b", fontWeight: 500 }}>{label}</span>
              <span
                style={{
                  color: "#374151",
                  textAlign: "right",
                  maxWidth: "60%",
                }}
              >
                {value}
              </span>
            </div>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginBottom: 16,
          }}
        >
          {row.is_active ? (
            <button onClick={() => onAction("deactivate")} style={btnWarn}>
              Deactivate Account
            </button>
          ) : (
            <button onClick={() => onAction("activate")} style={btnApprove}>
              Activate Account
            </button>
          )}

          <button
            onClick={() => {
              if (window.confirm(`Permanently delete ${row.name}?`)) {
                onAction("delete");
                onClose();
              }
            }}
            style={btnDelete}
          >
            🗑 Delete Account
          </button>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={btnGhost}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function SummaryChip({ label, value, color, alert }) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 10,
        padding: "14px 20px",
        borderLeft: `4px solid ${alert ? "#ef4444" : color}`,
        boxShadow: "0 1px 6px rgba(0,0,0,.08)",
        display: "flex",
        alignItems: "center",
        gap: 12,
        minWidth: 160,
      }}
    >
      <div>
        <p
          style={{
            fontSize: 11,
            color: "#64748b",
            margin: 0,
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          {label}
        </p>
        <p
          style={{
            fontSize: 24,
            fontWeight: 700,
            color: alert ? "#ef4444" : "#1e2a38",
            margin: "4px 0 0",
          }}
        >
          {value}
        </p>
      </div>
      {alert && <span style={{ fontSize: 20 }}>⚠️</span>}
    </div>
  );
}

const pageTitle = {
  fontSize: 22,
  fontWeight: 700,
  color: "#1e2a38",
  margin: 0,
};
const card = {
  background: "#fff",
  borderRadius: 12,
  boxShadow: "0 1px 6px rgba(0,0,0,.08)",
  overflow: "hidden",
};
const th = {
  textAlign: "left",
  padding: "11px 14px",
  fontSize: 11,
  fontWeight: 600,
  color: "#64748b",
  textTransform: "uppercase",
};
const td = { padding: "11px 14px", color: "#374151", verticalAlign: "middle" };
const centerCell = { textAlign: "center", padding: 40, color: "#94a3b8" };
const inputSm = {
  padding: "7px 12px",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  fontSize: 13,
  minWidth: 180,
};
const avatar = {
  width: 36,
  height: 36,
  borderRadius: "50%",
  background: "#dbeafe",
  color: "#1e40af",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 700,
  fontSize: 14,
  flexShrink: 0,
};
const overlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,.5)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};
const modalBox = {
  background: "#fff",
  borderRadius: 12,
  padding: 28,
  width: 480,
  maxHeight: "85vh",
  overflowY: "auto",
  boxShadow: "0 20px 60px rgba(0,0,0,.3)",
};
const btnGhost = {
  padding: "7px 16px",
  background: "#f1f5f9",
  color: "#374151",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 13,
};
const btnView = {
  padding: "4px 12px",
  background: "#e0f2fe",
  color: "#0369a1",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 12,
};
const btnApprove = {
  padding: "5px 12px",
  background: "#d1fae5",
  color: "#065f46",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
};
const btnWarn = {
  padding: "5px 12px",
  background: "#fef9c3",
  color: "#854d0e",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
};
const btnDelete = {
  padding: "5px 12px",
  background: "#fee2e2",
  color: "#991b1b",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
};
