// src/pages/customers/CustomersPage.jsx – Customer Account Management (Admin)
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import api, { buildAssetUrl } from "../../services/api";
import toast from "react-hot-toast";
import {
  BadgeCheck,
  Eye,
  MailWarning,
  MoreHorizontal,
  Search,
  UserRoundCheck,
  UserRoundX,
  UsersRound,
  X,
} from "lucide-react";

const FILTERS = {
  search: "",
  email_status: "",
  account_status: "",
  page: 1,
};

const PAGE_SIZE = 20;
const API_PAGE_SIZE = 500;

const getInitial = (name) => {
  const words = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();

  return `${words[0][0] || ""}${words[words.length - 1][0] || ""}`.toUpperCase();
};

function CustomerAvatar({ src, name, className = "" }) {
  const [failed, setFailed] = useState(false);
  const resolved = buildAssetUrl(src);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  return (
    <div className={`cm-avatar${className ? ` ${className}` : ""}`}>
      {resolved && !failed ? (
        <img
          src={resolved}
          alt={`${name || "Customer"} profile`}
          onError={() => setFailed(true)}
        />
      ) : (
        getInitial(name)
      )}
    </div>
  );
}

const formatDate = (value, includeTime = false) => {
  if (!value) return "Never";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";

  return includeTime
    ? date.toLocaleString("en-PH", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : date.toLocaleDateString("en-PH", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
};

export default function CustomersPage() {
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(FILTERS);
  const [detail, setDetail] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);

  const menuRef = useRef(null);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setOpenMenuId(null);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);

    try {
      const first = await api.get("/customers", {
        params: { page: 1, limit: API_PAGE_SIZE },
      });

      const firstRows = Array.isArray(first.data?.rows) ? first.data.rows : [];
      const total = Number(first.data?.total || firstRows.length);
      const pageCount = Math.max(1, Math.ceil(total / API_PAGE_SIZE));

      if (pageCount === 1) {
        setRows(firstRows);
        return;
      }

      const remainingRequests = [];
      for (let page = 2; page <= pageCount; page += 1) {
        remainingRequests.push(
          api.get("/customers", {
            params: { page, limit: API_PAGE_SIZE },
          }),
        );
      }

      const remaining = await Promise.all(remainingRequests);
      const combined = [...firstRows];

      remaining.forEach(({ data }) => {
        if (Array.isArray(data?.rows)) combined.push(...data.rows);
      });

      setRows(combined);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const doAction = async (id, action, name) => {
    const message =
      action === "activate"
        ? `Activate ${name}'s customer account?`
        : `Deactivate ${name}'s customer account? Their order and warranty history will remain available.`;

    if (!window.confirm(message)) return;

    try {
      const { data } = await api.put(`/customers/${id}/status`, { action });
      toast.success(data?.message || "Customer account updated.");
      setDetail(null);
      setOpenMenuId(null);
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Action failed.");
    }
  };

  const verifiedCount = useMemo(
    () => rows.filter((row) => Number(row.is_verified) === 1).length,
    [rows],
  );

  const notVerifiedCount = useMemo(
    () => rows.filter((row) => Number(row.is_verified) !== 1).length,
    [rows],
  );

  const inactiveCount = useMemo(
    () => rows.filter((row) => !row.is_active).length,
    [rows],
  );

  const filteredRows = useMemo(() => {
    const search = filters.search.trim().toLowerCase();

    return rows.filter((row) => {
      const searchable = [row.name, row.email, row.phone]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const verified = Number(row.is_verified) === 1;
      const active = !!row.is_active;

      const matchesSearch = !search || searchable.includes(search);
      const matchesEmail =
        !filters.email_status ||
        (filters.email_status === "verified" && verified) ||
        (filters.email_status === "not_verified" && !verified);
      const matchesAccount =
        !filters.account_status ||
        (filters.account_status === "active" && active) ||
        (filters.account_status === "inactive" && !active);

      return matchesSearch && matchesEmail && matchesAccount;
    });
  }, [rows, filters.search, filters.email_status, filters.account_status]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));

  useEffect(() => {
    if (filters.page > pageCount) {
      setFilters((current) => ({ ...current, page: pageCount }));
    }
  }, [filters.page, pageCount]);

  const pageRows = useMemo(() => {
    const start = (filters.page - 1) * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [filteredRows, filters.page]);

  const activeFilterCount = [
    filters.search,
    filters.email_status,
    filters.account_status,
  ].filter(Boolean).length;

  const setFilter = (key, value) =>
    setFilters((current) => ({
      ...current,
      [key]: value,
      page: 1,
    }));

  const resetFilters = () => setFilters(FILTERS);

  return (
    <div className="wisdom-admin-customers-v2">
      {/* WISDOM ADMIN CUSTOMER ACCOUNT MANAGEMENT UI V2 */}
      <style>{styles}</style>

      <header className="cm-page-header">
        <div>
          <h1 className="cm-page-title">Customer Account Management</h1>
          <p className="cm-page-subtitle">
            Review customer accounts, verification, sign-in activity, and access.
          </p>
        </div>
      </header>

      <section className="cm-summary-grid" aria-label="Customer account summary">
        <SummaryCard
          label="Total Customers"
          value={rows.length}
          icon={<UsersRound size={18} strokeWidth={1.9} />}
        />
        <SummaryCard
          label="Email Verified"
          value={verifiedCount}
          icon={<BadgeCheck size={18} strokeWidth={1.9} />}
        />
        <SummaryCard
          label="Not Verified"
          value={notVerifiedCount}
          icon={<MailWarning size={18} strokeWidth={1.9} />}
          alert={notVerifiedCount > 0}
        />
        <SummaryCard
          label="Inactive Accounts"
          value={inactiveCount}
          icon={<UserRoundX size={18} strokeWidth={1.9} />}
        />
      </section>

      <section className="cm-card">
        <div className="cm-card-heading">
          <div>
            <h2>Customer Accounts</h2>
            <p>
              Find customers and review their contact, verification, and account status.
            </p>
          </div>

          <div className="cm-result-count">
            {filteredRows.length} of {rows.length} customers
          </div>
        </div>

        <div className="cm-toolbar">
          <label className="cm-field cm-search-field">
            <span>Search</span>
            <div className="cm-search-wrap">
              <Search size={15} strokeWidth={1.8} aria-hidden="true" />
              <input
                value={filters.search}
                onChange={(event) => setFilter("search", event.target.value)}
                placeholder="Search name, email, or phone..."
              />
            </div>
          </label>

          <label className="cm-field">
            <span>Email Status</span>
            <select
              value={filters.email_status}
              onChange={(event) => setFilter("email_status", event.target.value)}
            >
              <option value="">All Email Statuses</option>
              <option value="verified">Verified</option>
              <option value="not_verified">Not Verified</option>
            </select>
          </label>

          <label className="cm-field">
            <span>Account Status</span>
            <select
              value={filters.account_status}
              onChange={(event) =>
                setFilter("account_status", event.target.value)
              }
            >
              <option value="">All Account Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>

          {activeFilterCount > 0 && (
            <button
              type="button"
              className="cm-btn cm-btn-secondary cm-reset-btn"
              onClick={resetFilters}
            >
              Reset Filters
            </button>
          )}
        </div>

        <div className="cm-table-wrap">
          <table className="cm-table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Contact</th>
                <th>Registered</th>
                <th>Last Login</th>
                <th>Email Status</th>
                <th>Account Status</th>
                <th className="cm-actions-heading">Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="cm-empty">
                    Loading customer accounts...
                  </td>
                </tr>
              ) : pageRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="cm-empty">
                    <strong>No matching customers</strong>
                    <span>Adjust the search or filters to view more accounts.</span>
                  </td>
                </tr>
              ) : (
                pageRows.map((row) => (
                  <CustomerRow
                    key={row.id}
                    row={row}
                    openMenuId={openMenuId}
                    setOpenMenuId={setOpenMenuId}
                    menuRef={menuRef}
                    onView={() => {
                      setDetail(row);
                      setOpenMenuId(null);
                    }}
                    onAction={doAction}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {pageCount > 1 && (
          <div className="cm-pagination">
            <button
              type="button"
              className="cm-btn cm-btn-secondary"
              disabled={filters.page <= 1}
              onClick={() =>
                setFilters((current) => ({
                  ...current,
                  page: current.page - 1,
                }))
              }
            >
              Previous
            </button>

            <span>
              Page {filters.page} of {pageCount}
            </span>

            <button
              type="button"
              className="cm-btn cm-btn-secondary"
              disabled={filters.page >= pageCount}
              onClick={() =>
                setFilters((current) => ({
                  ...current,
                  page: current.page + 1,
                }))
              }
            >
              Next
            </button>
          </div>
        )}
      </section>

      {detail && (
        <CustomerDetailModal
          row={detail}
          onClose={() => setDetail(null)}
          onAction={doAction}
        />
      )}
    </div>
  );
}

function SummaryCard({ label, value, icon, alert = false }) {
  return (
    <div className="cm-summary-card">
      <div>
        <div className="cm-summary-label">{label}</div>
        <div className={`cm-summary-value${alert ? " is-alert" : ""}`}>
          {value}
        </div>
      </div>

      <div className="cm-summary-icon" aria-hidden="true">
        {icon}
      </div>
    </div>
  );
}

function CustomerRow({
  row,
  openMenuId,
  setOpenMenuId,
  menuRef,
  onView,
  onAction,
}) {
  const verified = Number(row.is_verified) === 1;
  const active = !!row.is_active;

  return (
    <tr>
      <td>
        <div className="cm-account-cell">
          <CustomerAvatar src={row.profile_photo} name={row.name} />
          <div className="cm-account-copy">
            <span className="cm-user-name">{row.name || "Unnamed Customer"}</span>
            <small>Customer account</small>
          </div>
        </div>
      </td>

      <td>
        <div className="cm-contact">
          <span>{row.email || "Email not provided"}</span>
          <small>{row.phone || "Phone not provided"}</small>
        </div>
      </td>

      <td>
        <span className="cm-date">{formatDate(row.created_at)}</span>
      </td>

      <td>
        <span className="cm-date">{formatDate(row.last_login)}</span>
      </td>

      <td>
        <StatusText
          positive={verified}
          positiveLabel="Verified"
          negativeLabel="Not Verified"
        />
      </td>

      <td>
        <StatusText
          positive={active}
          positiveLabel="Active"
          negativeLabel="Inactive"
        />
      </td>

      <td>
        <div className="cm-row-actions">
          <button
            type="button"
            className="cm-btn cm-btn-secondary cm-view-btn"
            onClick={onView}
          >
            <Eye size={13} strokeWidth={1.9} />
            View
          </button>

          <div
            className="cm-more-wrap"
            ref={openMenuId === row.id ? menuRef : null}
          >
            <button
              type="button"
              className="cm-icon-btn"
              aria-label={`More actions for ${row.name}`}
              aria-expanded={openMenuId === row.id}
              onClick={() =>
                setOpenMenuId((current) => (current === row.id ? null : row.id))
              }
            >
              <MoreHorizontal size={17} strokeWidth={2} />
            </button>

            {openMenuId === row.id && (
              <div className="cm-action-menu">
                {active ? (
                  <button
                    type="button"
                    className="cm-menu-danger"
                    onClick={() => onAction(row.id, "deactivate", row.name)}
                  >
                    <UserRoundX size={14} strokeWidth={1.9} />
                    Deactivate Account
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onAction(row.id, "activate", row.name)}
                  >
                    <UserRoundCheck size={14} strokeWidth={1.9} />
                    Activate Account
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </td>
    </tr>
  );
}

function StatusText({
  positive,
  positiveLabel,
  negativeLabel,
}) {
  return (
    <span className={`cm-status${positive ? " is-positive" : " is-negative"}`}>
      <i aria-hidden="true" />
      {positive ? positiveLabel : negativeLabel}
    </span>
  );
}

function CustomerDetailModal({ row, onClose, onAction }) {
  const active = !!row.is_active;
  const verified = Number(row.is_verified) === 1;

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="cm-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="cm-modal" role="dialog" aria-modal="true">
        <div className="cm-modal-header">
          <div className="cm-modal-profile">
            <CustomerAvatar
              src={row.profile_photo}
              name={row.name}
              className="cm-modal-avatar"
            />
            <div>
              <div className="cm-modal-eyebrow">Customer Account</div>
              <h3>{row.name || "Unnamed Customer"}</h3>
              <p>{row.email || "Email not provided"}</p>
            </div>
          </div>

          <button
            type="button"
            className="cm-modal-close"
            aria-label="Close"
            onClick={onClose}
          >
            <X size={17} strokeWidth={1.9} />
          </button>
        </div>

        <div className="cm-modal-body">
          <section className="cm-detail-section">
            <div className="cm-section-title">Contact Information</div>
            <div className="cm-detail-grid">
              <DetailItem label="Email" value={row.email || "Not provided"} />
              <DetailItem label="Phone" value={row.phone || "Not provided"} />
              <DetailItem
                label="Address"
                value={row.address || "Not provided"}
                wide
              />
            </div>
          </section>

          <section className="cm-detail-section">
            <div className="cm-section-title">Account Information</div>
            <div className="cm-detail-grid">
              <DetailItem
                label="Registered"
                value={formatDate(row.created_at, true)}
              />
              <DetailItem
                label="Last Login"
                value={formatDate(row.last_login, true)}
              />
              <DetailItem
                label="Email Status"
                value={
                  <StatusText
                    positive={verified}
                    positiveLabel="Verified"
                    negativeLabel="Not Verified"
                  />
                }
              />
              <DetailItem
                label="Account Status"
                value={
                  <StatusText
                    positive={active}
                    positiveLabel="Active"
                    negativeLabel="Inactive"
                  />
                }
              />
            </div>
          </section>
        </div>

        <div className="cm-modal-footer">
          <button
            type="button"
            className="cm-btn cm-btn-secondary"
            onClick={onClose}
          >
            Close
          </button>

          {active ? (
            <button
              type="button"
              className="cm-btn cm-btn-danger-outline"
              onClick={() => onAction(row.id, "deactivate", row.name)}
            >
              Deactivate Account
            </button>
          ) : (
            <button
              type="button"
              className="cm-btn cm-btn-primary"
              onClick={() => onAction(row.id, "activate", row.name)}
            >
              Activate Account
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailItem({ label, value, wide = false }) {
  return (
    <div className={`cm-detail-item${wide ? " is-wide" : ""}`}>
      <span>{label}</span>
      <div>{value}</div>
    </div>
  );
}

const styles = `
  .wisdom-admin-customers-v2 {
    width: min(100%, 1460px);
    margin: 0 auto;
    color: #18181b;
    --cm-border: #dde1e6;
    --cm-border-soft: #eceff2;
    --cm-muted: #71717a;
    --cm-danger: #b42318;
  }

  .wisdom-admin-customers-v2 *,
  .wisdom-admin-customers-v2 *::before,
  .wisdom-admin-customers-v2 *::after {
    box-sizing: border-box;
  }

  .wisdom-admin-customers-v2 button,
  .wisdom-admin-customers-v2 input,
  .wisdom-admin-customers-v2 select {
    font: inherit;
  }

  .cm-page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 20px;
    margin-bottom: 18px;
  }

  .cm-page-title {
    margin: 0;
    color: #0a0a0a;
    font-size: 26px;
    line-height: 1.15;
    font-weight: 760;
    letter-spacing: -0.02em;
  }

  .cm-page-subtitle {
    margin: 6px 0 0;
    max-width: 720px;
    color: #626871;
    font-size: 12.5px;
    line-height: 1.5;
    font-weight: 400;
  }

  .cm-summary-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
    margin-bottom: 16px;
  }

  .cm-summary-card {
    min-height: 82px;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 14px 15px;
    border: 1px solid var(--cm-border);
    border-radius: 4px;
    background: #ffffff;
  }

  .cm-summary-label {
    color: #696f78;
    font-size: 9.5px;
    line-height: 1.3;
    font-weight: 650;
    letter-spacing: 1px;
    text-transform: uppercase;
  }

  .cm-summary-value {
    margin-top: 7px;
    color: #111214;
    font-size: 25px;
    line-height: 1;
    font-weight: 760;
  }

  .cm-summary-value.is-alert {
    color: #c43b31;
  }

  .cm-summary-icon {
    color: #464b52;
  }

  .cm-card {
    border: 1px solid var(--cm-border);
    border-radius: 4px;
    background: #ffffff;
    overflow: visible;
  }

  .cm-card-heading {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 18px;
    padding: 16px 17px 13px;
    border-bottom: 1px solid var(--cm-border);
  }

  .cm-card-heading h2 {
    margin: 0;
    color: #1e2023;
    font-size: 16px;
    line-height: 1.25;
    font-weight: 700;
  }

  .cm-card-heading p {
    margin: 4px 0 0;
    color: #737982;
    font-size: 11.5px;
    line-height: 1.45;
    font-weight: 400;
  }

  .cm-result-count {
    padding: 7px 9px;
    border: 1px solid var(--cm-border);
    border-radius: 3px;
    color: #555b63;
    background: #ffffff;
    font-size: 10.5px;
    font-weight: 550;
    white-space: nowrap;
  }

  .cm-toolbar {
    display: grid;
    grid-template-columns:
      minmax(300px, 1.7fr)
      minmax(180px, 0.75fr)
      minmax(180px, 0.75fr)
      auto;
    align-items: end;
    gap: 10px;
    padding: 13px 17px;
    border-bottom: 1px solid var(--cm-border);
    background: #fafafa;
  }

  .cm-field {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .cm-field > span,
  .cm-section-title {
    color: #393e45;
    font-size: 10.5px;
    line-height: 1.3;
    font-weight: 650;
  }

  .cm-field input,
  .cm-field select {
    width: 100%;
    height: 37px;
    padding: 0 10px;
    border: 1px solid #cbd0d6;
    border-radius: 3px;
    outline: none;
    background: #ffffff;
    color: #262a30;
    font-size: 12.5px;
    font-weight: 400;
  }

  .cm-field input:focus,
  .cm-field select:focus {
    border-color: #777d85;
    box-shadow: 0 0 0 2px rgba(24, 24, 27, 0.07);
  }

  .cm-search-wrap {
    position: relative;
  }

  .cm-search-wrap svg {
    position: absolute;
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
    color: #8a9098;
    pointer-events: none;
  }

  .cm-search-wrap input {
    padding-left: 32px;
  }

  .cm-btn {
    min-height: 35px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 0 12px;
    border: 1px solid transparent;
    border-radius: 3px;
    cursor: pointer;
    font-size: 11.5px;
    line-height: 1;
    font-weight: 650;
    transition:
      background 130ms ease,
      border-color 130ms ease,
      color 130ms ease;
  }

  .cm-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .cm-btn-primary {
    border-color: #18181b;
    background: #18181b;
    color: #ffffff;
  }

  .cm-btn-primary:hover:not(:disabled) {
    background: #2f2f33;
  }

  .cm-btn-secondary {
    border-color: #cfd4da;
    background: #ffffff;
    color: #2e3238;
  }

  .cm-btn-secondary:hover:not(:disabled) {
    background: #f7f7f8;
  }

  .cm-btn-danger-outline {
    border-color: #e4aaa5;
    background: #ffffff;
    color: #b42318;
  }

  .cm-btn-danger-outline:hover:not(:disabled) {
    background: #fff5f4;
  }

  .cm-reset-btn {
    min-width: 100px;
  }

  .cm-table-wrap {
    width: 100%;
    overflow-x: auto;
  }

  .cm-table {
    width: 100%;
    min-width: 1110px;
    border-collapse: collapse;
    table-layout: fixed;
  }

  .cm-table th {
    padding: 11px 13px;
    border-bottom: 1px solid var(--cm-border);
    background: #fbfbfb;
    color: #60656d;
    font-size: 9.5px;
    line-height: 1.2;
    font-weight: 600;
    letter-spacing: 0.35px;
    text-align: left;
    text-transform: uppercase;
  }

  .cm-table th:nth-child(1) { width: 21%; }
  .cm-table th:nth-child(2) { width: 24%; }
  .cm-table th:nth-child(3) { width: 11%; }
  .cm-table th:nth-child(4) { width: 11%; }
  .cm-table th:nth-child(5) { width: 11%; }
  .cm-table th:nth-child(6) { width: 11%; }
  .cm-table th:nth-child(7) { width: 11%; }

  .cm-table td {
    padding: 12px 13px;
    border-bottom: 1px solid var(--cm-border-soft);
    color: #34383d;
    font-size: 11.5px;
    line-height: 1.35;
    font-weight: 400;
    vertical-align: middle;
  }

  .cm-table tbody tr:last-child td {
    border-bottom: 0;
  }

  .cm-table tbody tr:hover {
    background: #fcfcfc;
  }

  .cm-account-cell {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .cm-avatar {
    width: 34px;
    height: 34px;
    flex: 0 0 34px;
    display: grid;
    place-items: center;
    border: 1px solid #dfe2e6;
    border-radius: 50%;
    background: #f7f7f8;
    color: #535860;
    font-size: 9.5px;
    font-weight: 700;
    letter-spacing: 0.2px;
    overflow: hidden;
  }

  .cm-avatar img {
    width: 100%;
    height: 100%;
    display: block;
    border-radius: inherit;
    object-fit: cover;
  }

  .cm-account-copy,
  .cm-contact {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .cm-user-name {
    overflow: hidden;
    color: #25282c;
    font-size: 11.8px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cm-account-copy small,
  .cm-contact small {
    overflow: hidden;
    color: #858a91;
    font-size: 9.8px;
    font-weight: 400;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cm-contact > span {
    overflow: hidden;
    color: #34383d;
    font-size: 11.5px;
    font-weight: 400;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cm-date {
    color: #858a91;
    font-size: 10.5px;
    font-weight: 400;
  }

  .cm-status {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    color: #3f444a;
    font-size: 10.5px;
    font-weight: 500;
    white-space: nowrap;
  }

  .cm-status i {
    width: 6px;
    height: 6px;
    flex: 0 0 6px;
    border-radius: 50%;
  }

  .cm-status.is-positive i {
    background: #2f7d4a;
  }

  .cm-status.is-negative {
    color: #9d3028;
  }

  .cm-status.is-negative i {
    background: #c43b31;
  }

  .cm-row-actions {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: 6px;
  }

  .cm-actions-heading {
    text-align: right !important;
  }

  .cm-view-btn {
    min-height: 31px;
    padding: 0 9px;
    font-size: 10.5px;
  }

  .cm-more-wrap {
    position: relative;
  }

  .cm-icon-btn,
  .cm-modal-close {
    width: 32px;
    height: 32px;
    display: inline-grid;
    place-items: center;
    padding: 0;
    border: 1px solid #cfd4da;
    border-radius: 3px;
    background: #ffffff;
    color: #50565e;
    cursor: pointer;
  }

  .cm-icon-btn:hover,
  .cm-modal-close:hover {
    background: #f7f7f8;
  }

  .cm-action-menu {
    position: absolute;
    z-index: 30;
    top: calc(100% + 5px);
    right: 0;
    width: 190px;
    padding: 5px;
    border: 1px solid #d6dae0;
    border-radius: 3px;
    background: #ffffff;
    box-shadow: 0 12px 30px rgba(15, 23, 42, 0.12);
  }

  .cm-action-menu button {
    width: 100%;
    min-height: 34px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 9px;
    border: 0;
    border-radius: 2px;
    background: transparent;
    color: #34383e;
    cursor: pointer;
    font-size: 11.5px;
    font-weight: 550;
    text-align: left;
  }

  .cm-action-menu button:hover {
    background: #f5f6f7;
  }

  .cm-action-menu .cm-menu-danger {
    color: #b42318;
  }

  .cm-action-menu .cm-menu-danger:hover {
    background: #fff4f2;
  }

  .cm-empty {
    height: 170px;
    text-align: center;
    color: #777d86;
  }

  .cm-empty strong,
  .cm-empty span {
    display: block;
  }

  .cm-empty strong {
    margin-bottom: 5px;
    color: #30343a;
    font-size: 13px;
    font-weight: 650;
  }

  .cm-empty span {
    font-size: 11.5px;
    font-weight: 400;
  }

  .cm-pagination {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 10px;
    padding: 12px 15px;
    border-top: 1px solid var(--cm-border);
    background: #fafafa;
  }

  .cm-pagination span {
    color: #696f78;
    font-size: 11px;
    font-weight: 550;
  }

  .cm-overlay {
    position: fixed;
    z-index: 1000;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    background: rgba(0, 0, 0, 0.58);
  }

  .cm-modal {
    width: min(100%, 650px);
    max-height: 90vh;
    overflow-y: auto;
    border: 1px solid #d8dce1;
    border-radius: 4px;
    background: #ffffff;
    box-shadow: 0 22px 56px rgba(0, 0, 0, 0.2);
  }

  .cm-modal-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 18px 19px 15px;
    border-bottom: 1px solid #e1e4e8;
  }

  .cm-modal-profile {
    display: flex;
    align-items: center;
    gap: 11px;
  }

  .cm-modal-avatar {
    width: 42px;
    height: 42px;
    flex-basis: 42px;
    font-size: 14px;
  }

  .cm-modal-eyebrow {
    margin-bottom: 4px;
    color: #7b8189;
    font-size: 9px;
    font-weight: 650;
    letter-spacing: 1px;
    text-transform: uppercase;
  }

  .cm-modal-header h3 {
    margin: 0;
    color: #17191d;
    font-size: 20px;
    line-height: 1.2;
    font-weight: 740;
  }

  .cm-modal-header p {
    margin: 5px 0 0;
    color: #727881;
    font-size: 11.5px;
    line-height: 1.4;
    font-weight: 400;
  }

  .cm-modal-body {
    padding: 18px 19px;
  }

  .cm-detail-section + .cm-detail-section {
    margin-top: 18px;
    padding-top: 17px;
    border-top: 1px solid #eceef1;
  }

  .cm-section-title {
    margin-bottom: 9px;
  }

  .cm-detail-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .cm-detail-item {
    min-width: 0;
    padding: 10px 11px;
    border: 1px solid #e0e3e7;
    border-radius: 3px;
    background: #ffffff;
  }

  .cm-detail-item.is-wide {
    grid-column: 1 / -1;
  }

  .cm-detail-item > span {
    display: block;
    margin-bottom: 4px;
    color: #858b93;
    font-size: 9px;
    font-weight: 650;
    letter-spacing: 0.7px;
    text-transform: uppercase;
  }

  .cm-detail-item > div {
    overflow-wrap: anywhere;
    color: #2f343a;
    font-size: 11.5px;
    line-height: 1.45;
    font-weight: 500;
  }

  .cm-modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 13px 19px;
    border-top: 1px solid #e1e4e8;
    background: #fafafa;
  }

  @media (max-width: 1000px) {
    .cm-summary-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .cm-toolbar {
      grid-template-columns:
        minmax(240px, 1fr)
        minmax(170px, 0.65fr)
        minmax(170px, 0.65fr);
    }

    .cm-reset-btn {
      width: fit-content;
    }
  }

  @media (max-width: 720px) {
    .wisdom-admin-customers-v2 {
      width: 100%;
    }

    .cm-summary-grid,
    .cm-toolbar,
    .cm-detail-grid {
      grid-template-columns: 1fr;
    }

    .cm-card-heading {
      flex-direction: column;
      align-items: flex-start;
    }

    .cm-detail-item.is-wide {
      grid-column: auto;
    }
  }
`;
