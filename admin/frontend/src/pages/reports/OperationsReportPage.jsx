import React, { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import * as XLSX from "xlsx-js-style";
import api from "../../services/api";
import useAuthStore from "../../store/authStore";

import "./OperationsReportPage.css";

const OPERATION_TYPES = [
  { value: "tasks", label: "Task Assignments", endpoint: "/tasks" },
  {
    value: "appointments",
    label: "Appointments",
    endpoint: "/pos/appointments",
  },
  {
    value: "delivery",
    label: "Deliveries",
    endpoint: "/pos/deliveries",
  },
  { value: "warranty", label: "Warranty Claims", endpoint: "/warranty" },
];

const formatDateTime = (value) => {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";

  return parsed.toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const humanize = (value) =>
  String(value || "—")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

// Helper to extract the correct date field based on operation type
const getRowDate = (row, opType) => {
  if (opType === "appointments")
    return new Date(
      row.scheduled_date ||
        row.preferred_date ||
        row.appointment_date ||
        row.created_at ||
        row.updated_at,
    );
  if (opType === "delivery")
    return new Date(
      row.scheduled_date ||
        row.delivery_date ||
        row.created_at ||
        row.updated_at,
    );
  return new Date(row.created_at || row.updated_at);
};

// Helper to evaluate date ranges
const isDateInRange = (dateObj, filterType, customStart, customEnd) => {
  if (filterType === "all") return true;
  if (!dateObj || Number.isNaN(dateObj.getTime())) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const target = new Date(dateObj);
  target.setHours(0, 0, 0, 0);

  if (filterType === "today") {
    return target.getTime() === today.getTime();
  }

  if (filterType === "yesterday") {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    return target.getTime() === yesterday.getTime();
  }

  if (filterType === "this_week") {
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay()); // Sunday
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 6); // Saturday
    return target >= startOfWeek && target <= endOfWeek;
  }

  if (filterType === "this_month") {
    return (
      target.getMonth() === today.getMonth() &&
      target.getFullYear() === today.getFullYear()
    );
  }

  if (filterType === "this_year") {
    return target.getFullYear() === today.getFullYear();
  }

  if (filterType === "custom") {
    if (customStart) {
      const sDate = new Date(`${customStart}T00:00:00`);
      if (target < sDate) return false;
    }
    if (customEnd) {
      const eDate = new Date(`${customEnd}T00:00:00`);
      if (target > eDate) return false;
    }
    return true;
  }

  return true;
};

function SummaryCard({ label, value, note }) {
  return (
    <div className="opr-summary-card">
      <div className="opr-summary-label">{label}</div>
      <div className="opr-summary-value">{value}</div>
      {note ? <div className="opr-summary-note">{note}</div> : null}
    </div>
  );
}

function EmptyRow({ colSpan, text }) {
  return (
    <tr>
      <td colSpan={colSpan} className="opr-empty-cell">
        {text}
      </td>
    </tr>
  );
}

export default function OperationsReportPage() {
  const { user } = useAuthStore();
  const [operationType, setOperationType] = useState("tasks");
  const [search, setSearch] = useState("");

  // Date filter state
  const [dateFilter, setDateFilter] = useState("all");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const [page, setPage] = useState(1);

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [generatedAt, setGeneratedAt] = useState("");

  const activeOperation = useMemo(
    () => OPERATION_TYPES.find((op) => op.value === operationType),
    [operationType],
  );

  const loadReport = useCallback(async () => {
    if (!activeOperation) return;
    setLoading(true);

    try {
      const { data } = await api.get(activeOperation.endpoint, {
        params: { limit: 5000 },
      });

      const fetchedRows =
        data.tasks ||
        data.claims ||
        data.deliveries ||
        data.appointments ||
        data.rows ||
        data ||
        [];

      setRows(Array.isArray(fetchedRows) ? fetchedRows : []);
      setGeneratedAt(new Date().toISOString());
    } catch (err) {
      toast.error(`Failed to load ${activeOperation.label.toLowerCase()}.`);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [activeOperation]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      // 1. Date check
      const rowDate = getRowDate(row, operationType);
      if (!isDateInRange(rowDate, dateFilter, customStart, customEnd)) {
        return false;
      }

      // 2. Search check
      const query = search.trim().toLowerCase();
      if (query) {
        const matchesSearch = Object.values(row).some((val) =>
          String(val || "")
            .toLowerCase()
            .includes(query),
        );
        if (!matchesSearch) return false;
      }

      return true;
    });
  }, [rows, search, operationType, dateFilter, customStart, customEnd]);

  // Reset page to 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [search, operationType, dateFilter, customStart, customEnd]);

  const paginatedRows = useMemo(() => {
    const start = (page - 1) * 20;
    return filteredRows.slice(start, start + 20);
  }, [filteredRows, page]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / 20));

  const summary = useMemo(() => {
    const total = filteredRows.length;
    const pending = filteredRows.filter((r) =>
      ["pending", "scheduled", "in_progress"].includes(
        String(r.status).toLowerCase(),
      ),
    ).length;
    const completed = filteredRows.filter((r) =>
      ["completed", "resolved", "delivered", "done"].includes(
        String(r.status).toLowerCase(),
      ),
    ).length;

    return { total, pending, completed };
  }, [filteredRows]);

  const exportExcel = async () => {
    setExporting(true);
    try {
      const workbook = XLSX.utils.book_new();

      const headerStyle = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "18181B" } },
        border: {
          top: { style: "thin", color: { rgb: "D1D5DB" } },
          bottom: { style: "thin", color: { rgb: "D1D5DB" } },
          left: { style: "thin", color: { rgb: "D1D5DB" } },
          right: { style: "thin", color: { rgb: "D1D5DB" } },
        },
      };

      const cellStyle = {
        border: {
          top: { style: "thin", color: { rgb: "E5E7EB" } },
          bottom: { style: "thin", color: { rgb: "E5E7EB" } },
          left: { style: "thin", color: { rgb: "E5E7EB" } },
          right: { style: "thin", color: { rgb: "E5E7EB" } },
        },
      };

      const header = (value) => ({ v: value, s: headerStyle });
      const cell = (value) => ({ v: value ?? "", s: cellStyle });

      let headers = [];
      let mappedData = [];

      if (operationType === "tasks") {
        headers = [
          "Task ID",
          "Order / Reference",
          "Assigned To",
          "Status",
          "Created At",
        ];
        mappedData = filteredRows.map((r) => [
          r.id,
          r.order_id || "—",
          r.assigned_to_name || "Unassigned",
          humanize(r.status),
          formatDateTime(r.created_at),
        ]);
      } else if (operationType === "appointments") {
        headers = [
          "Appointment ID",
          "Customer",
          "Service Type",
          "Status",
          "Scheduled Date",
        ];
        mappedData = filteredRows.map((r) => [
          r.id,
          r.customer_name || "—",
          humanize(r.purpose || r.service_type || r.type || r.service),
          humanize(r.status),
          formatDateTime(
            r.scheduled_date ||
              r.preferred_date ||
              r.appointment_date ||
              r.created_at,
          ),
        ]);
      } else if (operationType === "delivery") {
        headers = [
          "Delivery ID",
          "Order Number",
          "Driver",
          "Status",
          "Delivery Date",
        ];
        mappedData = filteredRows.map((r) => [
          r.id,
          r.order_number || "—",
          r.driver_name || "Unassigned",
          humanize(r.status),
          formatDateTime(r.scheduled_date || r.delivery_date || r.created_at),
        ]);
      } else if (operationType === "warranty") {
        headers = ["Claim ID", "Customer", "Issue", "Status", "Filed On"];
        mappedData = filteredRows.map((r) => [
          r.id,
          r.customer_name || "—",
          r.issue_description || "—",
          humanize(r.status),
          formatDateTime(r.created_at),
        ]);
      }

      const titleStyle = {
        font: { bold: true, sz: 16, color: { rgb: "111827" } },
        alignment: { horizontal: "center", vertical: "center" },
      };

      const descStyle = {
        font: { italic: true, sz: 11, color: { rgb: "52525B" } },
        alignment: { horizontal: "center", vertical: "center" },
      };

      const excelData = [
        [{ v: `Operations Report - ${activeOperation.label}`, s: titleStyle }],
        [], // Empty row to accommodate the vertical merge
        [
          {
            v: "Review historical performance, assignments, and fulfillment metrics across all service and operational channels.",
            s: descStyle,
          },
        ],
        [], // Empty spacer row before data
        headers.map(header),
        ...mappedData.map((row) => row.map(cell)),
      ];

      const sheet = XLSX.utils.aoa_to_sheet(excelData);
      sheet["!cols"] = headers.map(() => ({ wch: 25 }));

      // Merge Title across rows 1-2 and all columns, Merge Description across row 3
      sheet["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 1, c: headers.length - 1 } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: headers.length - 1 } },
      ];

      XLSX.utils.book_append_sheet(workbook, sheet, activeOperation.label);

      const fileName = `operations_report_${operationType}_${new Date().getTime()}.xlsx`;

      if (window.showSaveFilePicker) {
        const handle = await window.showSaveFilePicker({
          suggestedName: fileName,
          types: [
            {
              description: "Excel Document",
              accept: {
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
                  [".xlsx"],
              },
            },
          ],
        });
        const writable = await handle.createWritable();
        const buffer = XLSX.write(workbook, {
          bookType: "xlsx",
          type: "array",
        });
        await writable.write(buffer);
        await writable.close();
      } else {
        XLSX.writeFile(workbook, fileName);
      }

      toast.success(`${activeOperation.label} report exported.`);
    } catch (err) {
      if (err.name !== "AbortError") toast.error("Failed to export report.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="operations-report">
      <div className="opr-page-header">
        <div>
          <h1>Operations Report</h1>
          <p>
            Review historical performance, assignments, and fulfillment metrics
            across all service and operational channels.
          </p>
        </div>

        <div className="opr-header-actions opr-no-print">
          <button
            type="button"
            className="opr-button opr-button-secondary"
            onClick={loadReport}
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <button
            type="button"
            className="opr-button opr-button-primary"
            onClick={exportExcel}
            disabled={loading || filteredRows.length === 0 || exporting}
          >
            {exporting ? "Exporting..." : "Export Excel"}
          </button>
        </div>
      </div>

      <div className="opr-report-meta">
        <span>
          <strong>Generated:</strong> {formatDateTime(generatedAt)}
        </span>
        <span>
          <strong>Generated By:</strong> {user?.name || "Administrator"}
        </span>
        <span>
          <strong>Scope:</strong> {activeOperation?.label} logs
        </span>
      </div>

      <div className="opr-toolbar opr-no-print">
        {/* SEARCH BAR PLACED FIRST TO EXPAND ON LEFT */}
        <label className="opr-filter-field opr-search-field">
          <span>Search Records</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ID, customer, status..."
          />
        </label>

        <label className="opr-filter-field" style={{ minWidth: 180 }}>
          <span>Operation Type</span>
          <select
            value={operationType}
            onChange={(e) => {
              setOperationType(e.target.value);
              setSearch("");
            }}
          >
            {OPERATION_TYPES.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        {/* NEW DATE RANGE FILTER */}
        <label className="opr-filter-field" style={{ minWidth: 160 }}>
          <span>Date Filter</span>
          <select
            value={dateFilter}
            onChange={(e) => {
              setDateFilter(e.target.value);
              setCustomStart("");
              setCustomEnd("");
            }}
          >
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="this_week">This Week</option>
            <option value="this_month">This Month</option>
            <option value="this_year">This Year</option>
            <option value="custom">Custom Date Range</option>
          </select>
        </label>

        {/* CUSTOM DATE INPUTS VISIBLE ONLY IF CUSTOM SELECTED */}
        {dateFilter === "custom" && (
          <>
            <label
              className="opr-filter-field"
              style={{ minWidth: 130, flex: "0 0 auto" }}
            >
              <span>Start Date</span>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
              />
            </label>
            <label
              className="opr-filter-field"
              style={{ minWidth: 130, flex: "0 0 auto" }}
            >
              <span>End Date</span>
              <input
                type="date"
                value={customEnd}
                min={customStart}
                onChange={(e) => setCustomEnd(e.target.value)}
              />
            </label>
          </>
        )}
      </div>

      {!loading ? (
        <>
          <div
            className="opr-summary-grid"
            style={{ gridTemplateColumns: "repeat(3, 1fr)" }}
          >
            <SummaryCard
              label="Total Records"
              value={summary.total}
              note={`Total ${activeOperation.label.toLowerCase()} found`}
            />
            <SummaryCard
              label="Pending / Active"
              value={summary.pending}
              note="Awaiting action or currently in progress"
            />
            <SummaryCard
              label="Completed"
              value={summary.completed}
              note="Successfully resolved or delivered"
            />
          </div>

          <section className="opr-card">
            <div className="opr-section-head">
              <div>
                <h2>{activeOperation.label} Data</h2>
                <p>
                  Historical log of all operations corresponding to the selected
                  category.
                </p>
              </div>
              <div className="opr-section-count">
                {filteredRows.length} record(s)
              </div>
            </div>

            <div className="opr-table-scroll">
              <table className="opr-table">
                <thead>
                  <tr>
                    {operationType === "tasks" && (
                      <>
                        <th>Task ID</th>
                        <th>Order Reference</th>
                        <th>Assigned To</th>
                        <th>Status</th>
                        <th>Created At</th>
                      </>
                    )}
                    {operationType === "appointments" && (
                      <>
                        <th>Appt ID</th>
                        <th>Customer</th>
                        <th>Service Type</th>
                        <th>Status</th>
                        <th>Scheduled Date</th>
                      </>
                    )}
                    {operationType === "delivery" && (
                      <>
                        <th>Delivery ID</th>
                        <th>Order Number</th>
                        <th>Driver</th>
                        <th>Status</th>
                        <th>Delivery Date</th>
                      </>
                    )}
                    {operationType === "warranty" && (
                      <>
                        <th>Claim ID</th>
                        <th>Customer</th>
                        <th>Issue Description</th>
                        <th>Status</th>
                        <th>Filed On</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <EmptyRow
                      colSpan={5}
                      text={`No ${activeOperation.label.toLowerCase()} match the current filters.`}
                    />
                  ) : (
                    paginatedRows.map((row) => (
                      <tr key={row.id}>
                        {operationType === "tasks" && (
                          <>
                            <td className="opr-primary-text">#{row.id}</td>
                            <td>{row.order_id || "—"}</td>
                            <td>{row.assigned_to_name || "Unassigned"}</td>
                            <td>{humanize(row.status)}</td>
                            <td>{formatDateTime(row.created_at)}</td>
                          </>
                        )}
                        {operationType === "appointments" && (
                          <>
                            <td className="opr-primary-text">#{row.id}</td>
                            <td>{row.customer_name || "—"}</td>
                            <td>
                              {humanize(
                                row.purpose ||
                                  row.service_type ||
                                  row.type ||
                                  row.service,
                              )}
                            </td>
                            <td>{humanize(row.status)}</td>
                            <td>
                              {formatDateTime(
                                row.scheduled_date ||
                                  row.preferred_date ||
                                  row.appointment_date ||
                                  row.created_at,
                              )}
                            </td>
                          </>
                        )}
                        {operationType === "delivery" && (
                          <>
                            <td className="opr-primary-text">#{row.id}</td>
                            <td>{row.order_number || "—"}</td>
                            <td>{row.driver_name || "Unassigned"}</td>
                            <td>{humanize(row.status)}</td>
                            <td>
                              {formatDateTime(
                                row.scheduled_date ||
                                  row.delivery_date ||
                                  row.created_at,
                              )}
                            </td>
                          </>
                        )}
                        {operationType === "warranty" && (
                          <>
                            <td className="opr-primary-text">#{row.id}</td>
                            <td>{row.customer_name || "—"}</td>
                            <td
                              style={{
                                maxWidth: 250,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {row.issue_description || "—"}
                            </td>
                            <td>{humanize(row.status)}</td>
                            <td>{formatDateTime(row.created_at)}</td>
                          </>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {filteredRows.length > 0 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "12px 15px",
                  borderTop: "1px solid #e4e7ea",
                  background: "#fff",
                }}
              >
                <span style={{ fontSize: 11.5, color: "#71717a" }}>
                  Showing {(page - 1) * 20 + 1} to{" "}
                  {Math.min(page * 20, filteredRows.length)} of{" "}
                  {filteredRows.length} records
                </span>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button
                    type="button"
                    className="opr-button opr-button-secondary"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </button>
                  <span
                    style={{
                      fontSize: 11.5,
                      color: "#3f3f46",
                      fontWeight: 500,
                      margin: "0 4px",
                    }}
                  >
                    Page {page} of {totalPages}
                  </span>
                  <button
                    type="button"
                    className="opr-button opr-button-secondary"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </section>
        </>
      ) : (
        <div className="opr-loading">Loading operations data...</div>
      )}
    </div>
  );
}
