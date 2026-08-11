// src/pages/backup/BackupPage.jsx – Database Backup Management (Admin)
import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Database,
  Download,
  HardDrive,
  RefreshCw,
  Search,
} from "lucide-react";
import api from "../../services/api";
import toast from "react-hot-toast";

export default function BackupPage() {
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTrigger] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedErrorId, setExpandedErrorId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/backup/logs");
      setLogs(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const downloadBackup = async (log) => {
    try {
      const res = await api.get(log.file_url, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = log.filename || "backup.sql";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toast.error("Download failed. Please try again.");
    }
  };

  const triggerBackup = async () => {
    setTrigger(true);
    try {
      const { data } = await api.post("/backup/trigger");
      toast.success(
        `Backup completed! File: ${data.file} (${data.size_kb} KB)`,
      );
      setConfirmOpen(false);
      await load();
    } catch (err) {
      const msg =
        err.response?.data?.message || "Backup failed. Check server logs.";
      toast.error(msg, { duration: 6000 });
    } finally {
      setTrigger(false);
    }
  };

  const sortedLogs = useMemo(
    () =>
      [...logs].sort(
        (a, b) =>
          new Date(b?.created_at || 0).getTime() -
          new Date(a?.created_at || 0).getTime(),
      ),
    [logs],
  );

  const successCount = logs.filter((log) => log.status === "success").length;
  const failCount = logs.filter((log) => log.status === "failed").length;
  const latestBackup = sortedLogs[0] || null;
  const lastSuccess =
    sortedLogs.find((log) => log.status === "success") || null;

  const filteredLogs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return sortedLogs.filter((log) => {
      const matchesType =
        typeFilter === "all" || String(log.type || "").toLowerCase() === typeFilter;

      const matchesStatus =
        statusFilter === "all" ||
        String(log.status || "").toLowerCase() === statusFilter;

      const searchableText = [
        log.filename,
        log.type,
        log.status,
        log.triggered_by,
        log.error_message,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesSearch = !query || searchableText.includes(query);

      return matchesType && matchesStatus && matchesSearch;
    });
  }, [searchQuery, sortedLogs, statusFilter, typeFilter]);

  const formatDate = (value, includeTime = true) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";

    return date.toLocaleString(
      "en-PH",
      includeTime
        ? {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
          }
        : {
            month: "short",
            day: "numeric",
            year: "numeric",
          },
    );
  };

  const formatBackupSize = (fileSize) => {
    if (!fileSize && fileSize !== 0) return "—";
    return Number(fileSize) >= 1024
      ? `${(Number(fileSize) / 1024).toFixed(2)} MB`
      : `${Number(fileSize)} KB`;
  };

  const latestSuccessful = latestBackup?.status === "success";
  const latestFailed = latestBackup?.status === "failed";

  return (
    <div className="backup-admin-v1">
      {/* WISDOM BACKUP UI POLISH V1.0.1 */}
      {/* WISDOM BACKUP UI POLISH V1.0.2.1 */}
      {/* WISDOM BACKUP STATUS DOWNLOAD POLISH V1.0.2.2 */}
      <style>{`
        .backup-admin-v1 {
          --backup-bg: #f6f7f9;
          --backup-surface: #ffffff;
          --backup-border: #e1e4e8;
          --backup-text: #17181c;
          --backup-muted: #68707d;
          --backup-subtle: #8a93a1;
          --backup-accent: #111111;
          --backup-accent-hover: #2b2b2b;
          --backup-accent-soft: #f3f4f6;
          --backup-success: #15803d;
          width: min(100%, 1460px);
          margin: 0 auto;
          --backup-success-soft: #ecfdf3;
          --backup-success-border: #bbf7d0;
          --backup-danger: #b42318;
          --backup-danger-soft: #fff1f0;
          --backup-danger-border: #fecaca;
          color: var(--backup-text);
        }

        .backup-admin-v1 *,
        .backup-admin-v1 *::before,
        .backup-admin-v1 *::after {
          box-sizing: border-box;
        }

        .backup-admin-v1 button,
        .backup-admin-v1 input,
        .backup-admin-v1 select {
          font: inherit;
        }

        .backup-page-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 22px;
          margin-bottom: 18px;
        }

        .backup-page-title {
          margin: 0;
          font-size: 26px;
          line-height: 1.15;
          font-weight: 760;
          letter-spacing: -0.022em;
          color: #111111;
        }

        .backup-page-subtitle {
          max-width: 720px;
          margin: 7px 0 0;
          font-size: 13px;
          line-height: 1.55;
          font-weight: 400;
          color: var(--backup-muted);
        }

        .backup-primary-btn,
        .backup-secondary-btn,
        .backup-text-btn {
          border-radius: 3px;
          cursor: pointer;
          transition:
            transform 150ms ease,
            background 150ms ease,
            border-color 150ms ease,
            box-shadow 150ms ease;
        }

        .backup-primary-btn {
          min-height: 38px;
          padding: 0 15px;
          border: 1px solid #111111;
          border-radius: 3px;
          background: #111111;
          color: #ffffff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          font-size: 12px;
          font-weight: 650;
          white-space: nowrap;
          box-shadow: none;
        }

        .backup-primary-btn:hover:not(:disabled) {
          transform: none;
          background: #2b2b2b;
          border-color: #2b2b2b;
        }

        .backup-primary-btn:disabled {
          cursor: not-allowed;
          opacity: 0.65;
        }

        .backup-secondary-btn {
          min-height: 33px;
          padding: 0 11px;
          border: 1px solid #cfd4da;
          border-radius: 3px;
          background: #ffffff;
          color: #1f2328;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 650;
        }

        .backup-secondary-btn:hover {
          transform: translateY(-1px);
          border-color: #aeb6c2;
          background: #fafbfc;
        }

        .backup-text-btn {
          min-height: 30px;
          padding: 0;
          border: 0;
          background: transparent;
          color: var(--backup-danger);
          font-size: 11px;
          font-weight: 650;
          text-decoration: underline;
          text-underline-offset: 3px;
        }

        .backup-text-btn:hover {
          color: #8f1d14;
        }

        .backup-summary-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 10px;
          margin-bottom: 14px;
        }

        .backup-summary-card {
          min-height: 108px;
          padding: 15px 16px;
          border: 1px solid var(--backup-border);
          border-radius: 4px;
          background: var(--backup-surface);
          box-shadow: 0 1px 3px rgba(15, 23, 42, 0.035);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 10px;
        }

        .backup-summary-top {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }

        .backup-summary-label {
          margin: 0;
          font-size: 10px;
          line-height: 1.3;
          font-weight: 600;
          letter-spacing: 0.055em;
          text-transform: uppercase;
          color: #747d8a;
        }

        .backup-summary-icon {
          width: 30px;
          height: 30px;
          border-radius: 3px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 auto;
        }

        .backup-summary-icon.indigo {
          color: #111111;
          background: #f3f4f6;
        }

        .backup-summary-icon.green {
          color: var(--backup-success);
          background: var(--backup-success-soft);
        }

        .backup-summary-icon.red {
          color: var(--backup-danger);
          background: var(--backup-danger-soft);
        }

        .backup-summary-icon.neutral {
          color: #111111;
          background: #f3f4f6;
        }

        .backup-summary-value {
          margin: 0;
          font-size: 23px;
          line-height: 1.1;
          font-weight: 760;
          letter-spacing: -0.018em;
          color: #15171b;
        }

        .backup-summary-value.success {
          color: var(--backup-success);
        }

        .backup-summary-value.failed {
          color: var(--backup-danger);
        }

        .backup-summary-note {
          margin: 4px 0 0;
          font-size: 10.5px;
          line-height: 1.4;
          font-weight: 400;
          color: var(--backup-muted);
        }

        .backup-schedule-card {
          width: min(100%, 620px);
          margin-bottom: 14px;
          padding: 12px 14px;
          border: 1px solid var(--backup-border);
          border-radius: 4px;
          background: var(--backup-surface);
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          align-items: center;
          gap: 14px;
          box-shadow: 0 1px 3px rgba(15, 23, 42, 0.03);
        }

        .backup-schedule-heading {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 4px;
        }

        .backup-schedule-heading h2 {
          margin: 0;
          font-size: 13.5px;
          font-weight: 720;
          color: #1b1d21;
        }

        .backup-schedule-copy {
          margin: 0;
          font-size: 11px;
          line-height: 1.45;
          color: var(--backup-muted);
        }

        .backup-schedule-copy strong {
          color: #24272c;
          font-weight: 700;
        }

        .backup-schedule-right {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          justify-content: flex-end;
        }

        .backup-time-chip,
        .backup-auto-pill,
        .backup-status-pill,
        .backup-type-pill {
          border-radius: 3px;
          white-space: nowrap;
        }

        .backup-auto-pill {
          padding: 4px 7px;
          border: 1px solid #d9dde3;
          border-radius: 3px;
          background: #f7f7f8;
          color: #4a4f57;
          font-size: 9px;
          font-weight: 650;
          letter-spacing: 0.035em;
          text-transform: uppercase;
        }

        .backup-time-chip {
          padding: 6px 10px;
          border: 1px solid #dfe3e9;
          background: #f9fafb;
          color: #3f4652;
          font-size: 11px;
          font-weight: 650;
        }

        .backup-history-card {
          overflow: hidden;
          border: 1px solid var(--backup-border);
          border-radius: 4px;
          background: var(--backup-surface);
          box-shadow: 0 1px 4px rgba(15, 23, 42, 0.035);
        }

        .backup-history-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 20px;
          padding: 14px 16px 12px;
          border-bottom: 1px solid var(--backup-border);
        }

        .backup-history-head h2 {
          margin: 0;
          font-size: 15px;
          font-weight: 720;
          color: #17191d;
        }

        .backup-history-head p {
          margin: 5px 0 0;
          font-size: 11px;
          line-height: 1.45;
          color: var(--backup-muted);
        }

        .backup-history-count {
          padding-top: 2px;
          font-size: 11px;
          font-weight: 650;
          color: #7a828e;
          white-space: nowrap;
        }

        .backup-toolbar {
          display: grid;
          grid-template-columns: minmax(280px, 1fr) 145px 145px;
          gap: 8px;
          padding: 10px 12px;
          border-bottom: 1px solid var(--backup-border);
          background: #fafafa;
        }

        .backup-search-wrap {
          position: relative;
        }

        .backup-search-wrap svg {
          position: absolute;
          left: 11px;
          top: 50%;
          transform: translateY(-50%);
          color: #8b94a1;
          pointer-events: none;
        }

        .backup-search-input,
        .backup-filter-select {
          width: 100%;
          height: 38px;
          border: 1px solid #d8dde5;
          border-radius: 3px;
          background: #ffffff;
          color: #2c3139;
          font-size: 12px;
          font-weight: 400;
          outline: none;
          transition:
            border-color 150ms ease,
            box-shadow 150ms ease;
        }

        .backup-search-input {
          padding: 0 12px 0 35px;
        }

        .backup-filter-select {
          padding: 0 10px;
          cursor: pointer;
        }

        .backup-search-input:focus,
        .backup-filter-select:focus {
          border-color: #111111;
          box-shadow: 0 0 0 2px rgba(17, 17, 17, 0.08);
        }

        .backup-table-scroll {
          width: 100%;
          overflow-x: auto;
        }

        .backup-history-table {
          width: 100%;
          min-width: 980px;
          border-collapse: separate;
          border-spacing: 0;
          font-size: 12px;
        }

        .backup-history-table thead tr {
          background: #ffffff;
        }

        .backup-history-table th {
          padding: 10px 12px;
          border-bottom: 1px solid var(--backup-border);
          text-align: left;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.075em;
          text-transform: uppercase;
          color: #7c8592;
          white-space: nowrap;
        }

        .backup-history-table td {
          padding: 11px 12px;
          border-bottom: 1px solid #edf0f3;
          color: #343a43;
          vertical-align: middle;
        }

        .backup-history-table tbody tr {
          transition: background 140ms ease;
        }

        .backup-history-table tbody tr:hover {
          background: #fafbff;
        }

        .backup-history-table tbody tr:last-child td {
          border-bottom: 0;
        }

        .backup-file-name {
          display: block;
          max-width: 360px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-family:
            ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 11px;
          font-weight: 650;
          color: #25292f;
        }

        .backup-type-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 7px;
          border: 1px solid #dfe3e8;
          border-radius: 3px;
          background: #f8f8f8;
          color: #50555c;
          font-size: 10px;
          font-weight: 600;
        }

        .backup-status-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 7px;
          border-radius: 3px;
          font-size: 10px;
          font-weight: 700;
        }

        .backup-status-pill.success {
          border: 0;
          background: transparent;
          color: #22262b;
          padding-left: 0;
          padding-right: 0;
          border-radius: 0;
          font-size: 11px;
          font-weight: 500;
        }

        .backup-status-pill.success .backup-success-icon {
          width: 12px;
          height: 12px;
          border-radius: 2px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 auto;
          background: #22c55e;
          color: #ffffff;
          font-size: 9px;
          line-height: 1;
          font-weight: 800;
        }

        .backup-status-pill.failed {
          border: 1px solid var(--backup-danger-border);
          background: var(--backup-danger-soft);
          color: var(--backup-danger);
        }

        .backup-status-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: currentColor;
        }

        .backup-error-row td {
          padding-top: 0;
          background: #fffafa;
        }

        .backup-error-box {
          margin: 0 0 13px;
          padding: 11px 12px;
          border: 1px solid #f3c7c3;
          border-radius: 8px;
          background: var(--backup-danger-soft);
          color: #7f1d1d;
          font-size: 11px;
          line-height: 1.5;
        }

        .backup-error-box strong {
          display: block;
          margin-bottom: 3px;
          font-size: 11px;
          font-weight: 700;
        }

        .backup-empty-state {
          padding: 44px 20px !important;
          text-align: center;
          color: #8a93a0 !important;
          font-size: 12px;
          line-height: 1.55;
        }

        .backup-empty-state strong {
          display: block;
          margin-bottom: 4px;
          color: #59616d;
          font-size: 13px;
          font-weight: 650;
        }

        .backup-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 12000;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          background: rgba(17, 24, 39, 0.5);
          backdrop-filter: blur(2px);
        }

        .backup-modal {
          width: 100%;
          max-width: 400px;
          padding: 22px;
          border: 1px solid #d9dde2;
          border-radius: 4px;
          background: #ffffff;
          box-shadow: 0 18px 48px rgba(15, 23, 42, 0.20);
        }

        .backup-modal-icon {
          width: 36px;
          height: 36px;
          margin-bottom: 14px;
          border-radius: 3px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #f3f4f6;
          color: #111111;
        }

        .backup-modal h3 {
          margin: 0;
          font-size: 19px;
          line-height: 1.25;
          font-weight: 740;
          color: #17191d;
        }

        .backup-modal p {
          margin: 8px 0 0;
          font-size: 12px;
          line-height: 1.55;
          color: var(--backup-muted);
        }

        .backup-modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 22px;
        }

        .backup-spin {
          animation: backup-spin 0.9s linear infinite;
        }

        @keyframes backup-spin {
          to {
            transform: rotate(360deg);
          }
        }

        @media (max-width: 1100px) {
          .backup-summary-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .backup-toolbar {
            grid-template-columns: 1fr 1fr;
          }

          .backup-search-wrap {
            grid-column: 1 / -1;
          }
        }

        @media (max-width: 720px) {
          .backup-page-header {
            flex-direction: column;
          }

          .backup-primary-btn {
            width: 100%;
          }

          .backup-summary-grid {
            grid-template-columns: 1fr;
          }

          .backup-schedule-card {
            grid-template-columns: 1fr;
          }

          .backup-schedule-right {
            justify-content: flex-start;
          }

          .backup-toolbar {
            grid-template-columns: 1fr;
          }

          .backup-search-wrap {
            grid-column: auto;
          }
        }
      `}</style>

      <header className="backup-page-header">
        <div>
          <h1 className="backup-page-title">Database Backups</h1>
          <p className="backup-page-subtitle">
            Monitor backup health, create manual backups, and download
            available database files.
          </p>
        </div>

        <button
          type="button"
          className="backup-primary-btn"
          onClick={() => setConfirmOpen(true)}
          disabled={triggering}
        >
          {triggering ? (
            <>
              <RefreshCw size={15} className="backup-spin" />
              Creating backup...
            </>
          ) : (
            <>
              <Database size={15} />
              Create Backup
            </>
          )}
        </button>
      </header>

      <section className="backup-summary-grid" aria-label="Backup summary">
        <SummaryCard
          label="Last Successful Backup"
          value={lastSuccess ? formatDate(lastSuccess.created_at, false) : "None"}
          note={
            lastSuccess
              ? formatDate(lastSuccess.created_at, true)
              : "No successful backup recorded yet."
          }
          icon={<Clock3 size={18} />}
          tone="indigo"
        />

        <SummaryCard
          label="Latest Status"
          value={
            latestBackup
              ? latestSuccessful
                ? "Successful"
                : latestFailed
                  ? "Failed"
                  : String(latestBackup.status || "Unknown")
              : "No backups"
          }
          note={
            latestBackup
              ? `${latestBackup.type === "auto" ? "Automated" : "Manual"} · ${formatDate(
                  latestBackup.created_at,
                  true,
                )}`
              : "Create a backup to start monitoring."
          }
          icon={
            latestSuccessful ? (
              <CheckCircle2 size={18} />
            ) : latestFailed ? (
              <AlertTriangle size={18} />
            ) : (
              <HardDrive size={18} />
            )
          }
          tone={latestSuccessful ? "green" : latestFailed ? "red" : "neutral"}
          valueClass={latestSuccessful ? "success" : latestFailed ? "failed" : ""}
        />

        <SummaryCard
          label="Total Backups"
          value={logs.length}
          note={`${successCount} successful backup${successCount === 1 ? "" : "s"} recorded.`}
          icon={<Database size={18} />}
          tone="neutral"
        />

        <SummaryCard
          label="Failed Backups"
          value={failCount}
          note={
            failCount > 0
              ? "Review failed backup errors in the history below."
              : "No failed backups recorded."
          }
          icon={<AlertTriangle size={18} />}
          tone={failCount > 0 ? "red" : "green"}
          valueClass={failCount > 0 ? "failed" : ""}
        />
      </section>

      <section className="backup-schedule-card">
        <div>
          <div className="backup-schedule-heading">
            <CalendarClock size={17} color="#4f46e5" />
            <h2>Backup Schedule</h2>
            <span className="backup-auto-pill">Automated</span>
          </div>
          <p className="backup-schedule-copy">
            Automatic backups run daily at <strong>12:00 AM</strong> and{" "}
            <strong>12:00 PM</strong>.
          </p>
        </div>

        <div className="backup-schedule-right">
          <span className="backup-auto-pill">Active</span>
        </div>
      </section>

      <section className="backup-history-card">
        <div className="backup-history-head">
          <div>
            <h2>Backup History</h2>
            <p>Review automated and manual database backups.</p>
          </div>
          <div className="backup-history-count">
            {filteredLogs.length} of {logs.length} backup
            {logs.length === 1 ? "" : "s"}
          </div>
        </div>

        <div className="backup-toolbar">
          <div className="backup-search-wrap">
            <Search size={15} />
            <input
              type="search"
              className="backup-search-input"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search backup file..."
              aria-label="Search backups"
            />
          </div>

          <select
            className="backup-filter-select"
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            aria-label="Filter backup type"
          >
            <option value="all">All Types</option>
            <option value="auto">Automated</option>
            <option value="manual">Manual</option>
          </select>

          <select
            className="backup-filter-select"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            aria-label="Filter backup status"
          >
            <option value="all">All Status</option>
            <option value="success">Successful</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        <div className="backup-table-scroll">
          <table className="backup-history-table">
            <thead>
              <tr>
                <th>Backup</th>
                <th>Type</th>
                <th>Size</th>
                <th>Status</th>
                <th>Created By</th>
                <th>Created</th>
                <th>Action</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="backup-empty-state">
                    <strong>Loading backups...</strong>
                    Please wait while the backup history is being loaded.
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="backup-empty-state">
                    <strong>No backups found</strong>
                    {logs.length === 0
                      ? "Create a backup to start building your backup history."
                      : "Try changing your search or filters."}
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const isSuccess = log.status === "success";
                  const isFailed = log.status === "failed";
                  const showError =
                    isFailed &&
                    Boolean(log.error_message) &&
                    expandedErrorId === log.id;

                  return (
                    <React.Fragment key={log.id}>
                      <tr>
                        <td>
                          <span
                            className="backup-file-name"
                            title={log.filename || ""}
                          >
                            {log.filename || "—"}
                          </span>
                        </td>

                        <td>
                          <span className="backup-type-pill">
                            {log.type === "auto" ? (
                              <Clock3 size={12} />
                            ) : (
                              <Database size={12} />
                            )}
                            {log.type === "auto" ? "Automated" : "Manual"}
                          </span>
                        </td>

                        <td>{formatBackupSize(log.file_size)}</td>

                        <td>
                          <div>
                            <span
                              className={`backup-status-pill ${
                                isSuccess ? "success" : "failed"
                              }`}
                            >
                              {isSuccess ? (
                                <>
                                  <span
                                    className="backup-success-icon"
                                    aria-hidden="true"
                                  >
                                    ✓
                                  </span>
                                  <span>Success</span>
                                </>
                              ) : (
                                <>
                                  <span className="backup-status-dot" />
                                  <span>Failed</span>
                                </>
                              )}
                            </span>

                            {isFailed && log.error_message && (
                              <div>
                                <button
                                  type="button"
                                  className="backup-text-btn"
                                  onClick={() =>
                                    setExpandedErrorId((current) =>
                                      current === log.id ? null : log.id,
                                    )
                                  }
                                >
                                  {showError ? "Hide error" : "View error"}
                                </button>
                              </div>
                            )}
                          </div>
                        </td>

                        <td>{log.triggered_by || "System"}</td>

                        <td style={{ color: "#6d7581", whiteSpace: "nowrap" }}>
                          {formatDate(log.created_at, true)}
                        </td>

                        <td>
                          {isSuccess && log.file_url ? (
                            <button
                              type="button"
                              className="backup-secondary-btn"
                              onClick={() => downloadBackup(log)}
                            >
                              <Download size={13} />
                              Download
                            </button>
                          ) : (
                            <span style={{ color: "#a0a7b1" }}>—</span>
                          )}
                        </td>
                      </tr>

                      {showError && (
                        <tr className="backup-error-row">
                          <td colSpan={7}>
                            <div className="backup-error-box">
                              <strong>Backup failed</strong>
                              {log.error_message}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {confirmOpen && (
        <div
          className="backup-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="backup-confirm-title"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !triggering
            ) {
              setConfirmOpen(false);
            }
          }}
        >
          <div className="backup-modal">
            <div className="backup-modal-icon">
              <Database size={20} />
            </div>

            <h3 id="backup-confirm-title">Create manual backup</h3>
            <p>
              Create a new database backup now? The new record will appear in
              Backup History when the process is complete.
            </p>

            <div className="backup-modal-actions">
              <button
                type="button"
                className="backup-secondary-btn"
                onClick={() => setConfirmOpen(false)}
                disabled={triggering}
              >
                Cancel
              </button>

              <button
                type="button"
                className="backup-primary-btn"
                onClick={triggerBackup}
                disabled={triggering}
              >
                {triggering ? (
                  <>
                    <RefreshCw size={14} className="backup-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Database size={14} />
                    Create Backup
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  note,
  icon,
  tone = "neutral",
  valueClass = "",
}) {
  return (
    <article className="backup-summary-card">
      <div className="backup-summary-top">
        <p className="backup-summary-label">{label}</p>
        <span className={`backup-summary-icon ${tone}`}>{icon}</span>
      </div>

      <div>
        <p className={`backup-summary-value ${valueClass}`}>{value}</p>
        <p className="backup-summary-note">{note}</p>
      </div>
    </article>
  );
}
