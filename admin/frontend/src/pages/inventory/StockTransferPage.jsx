import React, { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx-js-style";
import api from "../../services/api";
import useAuthStore from "../../store/authStore";
import toast from "react-hot-toast";

const DIRECTIONS = {
  warehouse_to_display: {
    label: "Warehouse → Display Area",
    from: "Warehouse",
    to: "Display Area",
    source: "warehouse_stock",
  },
  display_to_warehouse: {
    label: "Display Area → Warehouse",
    from: "Display Area",
    to: "Warehouse",
    source: "display_stock",
  },
};

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const showRequestErrorIfNeeded = (error, fallback) => {
  const response = error?.response;
  const status = Number(response?.status || 0);
  const message = response?.data?.message;

  // The shared Axios interceptor already shows errors for network failures,
  // 403/422/500 responses, and ordinary API responses that include a message.
  // 404 is intentionally silent there, so this page handles that case itself.
  if (status === 404) {
    toast.error(message || fallback);
    return;
  }

  if (
    !response ||
    status === 401 ||
    status === 403 ||
    status === 422 ||
    status === 500 ||
    message
  ) {
    return;
  }

  toast.error(fallback);
};

const emptyLine = () => ({ product_id: "", quantity: "1" });

export default function StockTransferPage() {
  const { user } = useAuthStore();
  const [inventory, setInventory] = useState([]);
  const [summary, setSummary] = useState({
    product_count: 0,
    total_stock: 0,
    warehouse_stock: 0,
    display_stock: 0,
  });
  const [direction, setDirection] = useState("warehouse_to_display");
  const [items, setItems] = useState([emptyLine()]);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const [history, setHistory] = useState([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [filterDirection, setFilterDirection] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [exportingHistory, setExportingHistory] = useState(false);

  const inventoryById = useMemo(
    () => new Map(inventory.map((row) => [Number(row.id), row])),
    [inventory],
  );

  const loadInventory = useCallback(async () => {
    const { data } = await api.get("/inventory/transfers/inventory");
    setInventory(Array.isArray(data?.inventory) ? data.inventory : []);
    setSummary(data?.summary || {});
  }, []);

  const loadHistory = useCallback(async () => {
    const params = { page, limit: 20 };
    if (search.trim()) params.search = search.trim();
    if (filterDirection) params.direction = filterDirection;
    if (from) params.from = from;
    if (to) params.to = to;

    const { data } = await api.get("/inventory/transfers", { params });
    setHistory(Array.isArray(data?.rows) ? data.rows : []);
    setHistoryTotal(Number(data?.total || 0));
  }, [page, search, filterDirection, from, to]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([loadInventory(), loadHistory()]);
    } catch (error) {
      showRequestErrorIfNeeded(error, "Failed to load stock transfers.");
    } finally {
      setLoading(false);
    }
  }, [loadInventory, loadHistory]);

  useEffect(() => {
    reload();
  }, [reload]);

  const updateLine = (index, key, value) => {
    setItems((current) =>
      current.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [key]: value } : item,
      ),
    );
  };

  const addLine = () => setItems((current) => [...current, emptyLine()]);
  const removeLine = (index) =>
    setItems((current) =>
      current.length === 1
        ? [emptyLine()]
        : current.filter((_, itemIndex) => itemIndex !== index),
    );

  const sourceAvailable = (line) => {
    const row = inventoryById.get(Number(line.product_id));
    if (!row) return 0;
    return Number(row[DIRECTIONS[direction].source] || 0);
  };

  const activeDirection = DIRECTIONS[direction];

  const switchDirection = () => {
    setDirection((current) =>
      current === "warehouse_to_display"
        ? "display_to_warehouse"
        : "warehouse_to_display",
    );
  };

  const submitTransfer = async (event) => {
    event.preventDefault();

    const payloadItems = items.map((item) => ({
      product_id: Number(item.product_id),
      quantity: Number(item.quantity),
    }));

    if (payloadItems.some((item) => !item.product_id || !Number.isInteger(item.quantity) || item.quantity <= 0)) {
      toast.error("Select a product and enter a whole-number quantity for every row.");
      return;
    }

    const duplicateIds = payloadItems.map((item) => item.product_id);
    if (new Set(duplicateIds).size !== duplicateIds.length) {
      toast.error("The same product cannot appear twice in one transfer.");
      return;
    }

    if (!reason.trim()) {
      toast.error("Reason is required.");
      return;
    }

    setSaving(true);
    try {
      const { data } = await api.post("/inventory/transfers", {
        direction,
        reason: reason.trim(),
        items: payloadItems,
      });
      toast.success(`${data?.reference_code || "Transfer"} completed.`);
      setItems([emptyLine()]);
      setReason("");
      setPage(1);
      await Promise.all([loadInventory(), loadHistory()]);
    } catch (error) {
      showRequestErrorIfNeeded(error, "Transfer failed.");
    } finally {
      setSaving(false);
    }
  };

  const openDetails = async (id) => {
    setDetailsLoading(true);
    try {
      const { data } = await api.get(`/inventory/transfers/${id}`);
      setSelected(data);
    } catch (error) {
      showRequestErrorIfNeeded(error, "Failed to load transfer details.");
    } finally {
      setDetailsLoading(false);
    }
  };

  const reverseSelected = async () => {
    if (!selected) return;
    const reasonText = window.prompt(
      `Why do you want to undo ${selected.reference_code}?`,
      "Correct stock transfer",
    );
    if (!reasonText || !reasonText.trim()) return;

    try {
      const { data } = await api.post(
        `/inventory/transfers/${selected.id}/reverse`,
        { reason: reasonText.trim() },
      );
      toast.success(`${data?.reference_code || "Undo transfer"} completed.`);
      setSelected(null);
      await Promise.all([loadInventory(), loadHistory()]);
    } catch (error) {
      showRequestErrorIfNeeded(error, "Unable to undo transfer.");
    }
  };

  const totalPages = Math.max(1, Math.ceil(historyTotal / 20));

  const exportTransferHistory = async () => {
    setExportingHistory(true);

    try {
      const exportRows = [];
      let exportPage = 1;
      const exportLimit = 100;
      let expectedTotal = 0;

      while (true) {
        const params = { page: exportPage, limit: exportLimit };
        if (search.trim()) params.search = search.trim();
        if (filterDirection) params.direction = filterDirection;
        if (from) params.from = from;
        if (to) params.to = to;

        const { data } = await api.get("/inventory/transfers", { params });
        const rows = Array.isArray(data?.rows) ? data.rows : [];
        expectedTotal = Number(data?.total || 0);

        if (expectedTotal > 20000) {
          throw new Error(
            "This transfer report is too large to export safely in one browser file.",
          );
        }

        exportRows.push(...rows);

        if (
          rows.length === 0 ||
          exportRows.length >= expectedTotal ||
          rows.length < exportLimit
        ) {
          break;
        }

        exportPage += 1;

        if (exportPage > 200) {
          throw new Error("Transfer export exceeded the safe page limit.");
        }
      }

      const workbook = XLSX.utils.book_new();
      const titleStyle = {
        font: { bold: true, color: { rgb: "111827" } },
      };
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

      const title = (value) => ({ v: value, s: titleStyle });
      const header = (value) => ({ v: value, s: headerStyle });
      const cell = (value) => ({ v: value ?? "", s: cellStyle });

      const generatedAt = new Date();
      const generatedBy =
        String(user?.name || user?.full_name || "").trim() ||
        "Administrator";
      const routeLabel = filterDirection
        ? DIRECTIONS[filterDirection]?.label || filterDirection
        : "All transfers";

      const summarySheet = XLSX.utils.aoa_to_sheet([
        [title("SPIRAL WOOD SERVICES - STOCK TRANSFER REPORT")],
        [title("Generated:"), formatDate(generatedAt)],
        [title("Generated By:"), generatedBy],
        [title("Search:"), search.trim() || "None"],
        [title("Route:"), routeLabel],
        [title("From Date:"), from || "All dates"],
        [title("To Date:"), to || "All dates"],
        [title("Total Records:"), exportRows.length],
      ]);
      summarySheet["!cols"] = [{ wch: 28 }, { wch: 42 }];
      XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

      const transferData = [
        [
          "Reference",
          "Date",
          "From",
          "To",
          "Products",
          "Total Qty",
          "User",
          "Status",
          "Reason",
        ].map(header),
        ...exportRows.map((row) =>
          [
            row.reference_code || "—",
            formatDate(row.created_at),
            DIRECTIONS[row.direction]?.from || "—",
            DIRECTIONS[row.direction]?.to || "—",
            row.item_summary || `${row.item_count || 0} product(s)`,
            Number(row.total_quantity || 0),
            row.transferred_by_name || "System",
            row.reversal_of_transfer_id
              ? "Undo"
              : row.reversed_by_transfer_id
                ? "Undone"
                : "Completed",
            row.reason || "",
          ].map(cell),
        ),
      ];

      const sheet = XLSX.utils.aoa_to_sheet(transferData);
      sheet["!cols"] = [
        { wch: 24 },
        { wch: 24 },
        { wch: 20 },
        { wch: 20 },
        { wch: 54 },
        { wch: 14 },
        { wch: 24 },
        { wch: 14 },
        { wch: 42 },
      ];
      XLSX.utils.book_append_sheet(workbook, sheet, "Stock Transfers");

      const dateScope =
        from && to
          ? `${from}_to_${to}`
          : from
            ? `${from}_onward`
            : to
              ? `through_${to}`
              : "all_dates";
      const stamp = generatedAt
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, 19);

      XLSX.writeFile(
        workbook,
        `wisdom_stock_transfer_report_${dateScope}_${stamp}.xlsx`,
      );

      toast.success("Stock transfer report exported.");
    } catch (error) {
      if (error?.isAxiosError || error?.response) {
        showRequestErrorIfNeeded(
          error,
          "Failed to export stock transfer report.",
        );
      } else {
        toast.error(
          error?.message || "Failed to export stock transfer report.",
        );
      }
    } finally {
      setExportingHistory(false);
    }
  };

  return (
    <div style={pageStyle}>
      <div style={headerStyle}>
        <div>
          <h1 style={titleStyle}>Stock Transfer</h1>
          <p style={subtitleStyle}>
            Move ready-made products between the warehouse and display area.
          </p>
        </div>
      </div>

      <div style={noticeStyle}>
        All ready-made stock starts in the <strong>Warehouse</strong>. Move products to the <strong>Display Area</strong> before selling them through the POS.
      </div>

      <div style={summaryGrid}>
        <SummaryCard label="Ready-Made Products" value={summary.product_count || 0} />
        <SummaryCard label="Total Stock" value={summary.total_stock || 0} />
        <SummaryCard label="Warehouse" value={summary.warehouse_stock || 0} />
        <SummaryCard label="Display Area" value={summary.display_stock || 0} />
      </div>

      <section style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <div>
            <h2 style={sectionTitle}>Transfer Stock</h2>
            <p style={sectionText}>Choose where the stock is moving from and where it is going.</p>
          </div>
        </div>

        <form onSubmit={submitTransfer}>
          <div style={transferRouteStyle}>
            <div style={routeBoxStyle}>
              <div style={routeLabelStyle}>From</div>
              <div style={routeValueStyle}>{activeDirection.from}</div>
            </div>

            <div style={routeArrowStyle} aria-hidden="true">→</div>

            <div style={routeBoxStyle}>
              <div style={routeLabelStyle}>To</div>
              <div style={routeValueStyle}>{activeDirection.to}</div>
            </div>

            <button type="button" onClick={switchDirection} style={secondaryButton}>
              Switch
            </button>
          </div>

          <label style={fieldStyle}>
            <span style={labelStyle}>Reason *</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
              style={inputStyle}
              placeholder="Example: Move products to display"
            />
          </label>

          <div style={lineHeader}>
            <strong>Products</strong>
            <button type="button" onClick={addLine} style={secondaryButton}>+ Add product</button>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            {items.map((line, index) => {
              const available = sourceAvailable(line);
              return (
                <div key={index} style={lineRow}>
                  <select
                    value={line.product_id}
                    onChange={(e) => updateLine(index, "product_id", e.target.value)}
                    style={inputStyle}
                  >
                    <option value="">Select product</option>
                    {inventory.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name} — Warehouse {row.warehouse_stock} • Display Area {row.display_stock}
                      </option>
                    ))}
                  </select>

                  <div>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={line.quantity}
                      onChange={(e) => updateLine(index, "quantity", e.target.value)}
                      style={inputStyle}
                      placeholder="Qty"
                    />
                    <div style={helperStyle}>Available here: {available}</div>
                  </div>

                  <button type="button" onClick={() => removeLine(index)} style={removeButton}>Remove</button>
                </div>
              );
            })}
          </div>

          <div style={actionsStyle}>
            <button type="submit" disabled={saving} style={primaryButton}>
              {saving ? "Transferring..." : "Transfer Stock"}
            </button>
          </div>
        </form>
      </section>

      <section style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <div>
            <h2 style={sectionTitle}>Transfer History</h2>
            <p style={sectionText}>View all completed stock transfers.</p>
          </div>
          <button
            type="button"
            onClick={exportTransferHistory}
            disabled={exportingHistory}
            style={{
              ...primaryButton,
              opacity: exportingHistory ? 0.55 : 1,
              cursor: exportingHistory ? "not-allowed" : "pointer",
              flex: "0 0 auto",
            }}
          >
            {exportingHistory ? "Exporting..." : "Export Excel"}
          </button>
        </div>

        <div style={filterGrid}>
          <label style={filterFieldStyle}>
            <span style={filterLabelStyle}>Search</span>
            <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} style={inputStyle} placeholder="Reference, reason, or product" />
          </label>

          <label style={filterFieldStyle}>
            <span style={filterLabelStyle}>Route</span>
            <select value={filterDirection} onChange={(e) => { setFilterDirection(e.target.value); setPage(1); }} style={inputStyle}>
              <option value="">All transfers</option>
              {Object.entries(DIRECTIONS).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
            </select>
          </label>

          <label style={filterFieldStyle}>
            <span style={filterLabelStyle}>From Date</span>
            <input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} style={inputStyle} />
          </label>

          <label style={filterFieldStyle}>
            <span style={filterLabelStyle}>To Date</span>
            <input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} style={inputStyle} />
          </label>
        </div>

        <div style={tableWrap}>
          <table style={tableStyle}>
            <thead>
              <tr>
                <Th>Reference</Th><Th>Date</Th><Th>From</Th><Th>To</Th><Th>Products</Th><Th>User</Th><Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan="7" style={emptyCell}>Loading...</td></tr>
              ) : history.length === 0 ? (
                <tr><td colSpan="7" style={emptyCell}>No stock transfers found.</td></tr>
              ) : history.map((row) => (
                <tr key={row.id} onClick={() => openDetails(row.id)} style={clickRow}>
                  <Td><strong>{row.reference_code}</strong></Td>
                  <Td>{formatDate(row.created_at)}</Td>
                  <Td>{DIRECTIONS[row.direction]?.from || "—"}</Td>
                  <Td>{DIRECTIONS[row.direction]?.to || "—"}</Td>
                  <Td>{row.item_summary || `${row.item_count} product(s)`}</Td>
                  <Td>{row.transferred_by_name || "System"}</Td>
                  <Td>{row.reversal_of_transfer_id ? "Undo" : row.reversed_by_transfer_id ? "Undone" : "Completed"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={paginationStyle}>
          <span>{historyTotal} record{historyTotal === 1 ? "" : "s"}</span>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} style={secondaryButton}>Previous</button>
            <span>Page {page} of {totalPages}</span>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))} style={secondaryButton}>Next</button>
          </div>
        </div>
      </section>

      {(selected || detailsLoading) && (
        <div style={overlayStyle} onClick={() => !detailsLoading && setSelected(null)}>
          <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
            {detailsLoading && !selected ? <div>Loading...</div> : selected ? (
              <>
                <div style={modalHeader}>
                  <div>
                    <h3 style={{ margin: 0 }}>{selected.reference_code}</h3>
                    <div style={helperStyle}>{formatDate(selected.created_at)}</div>
                  </div>
                  <button type="button" onClick={() => setSelected(null)} style={secondaryButton}>Close</button>
                </div>

                <div style={detailGrid}>
                  <Detail label="From" value={DIRECTIONS[selected.direction]?.from || "—"} />
                  <Detail label="To" value={DIRECTIONS[selected.direction]?.to || "—"} />
                  <Detail label="User" value={selected.transferred_by_name || "System"} />
                  <Detail label="Reason" value={selected.reason} />
                  <Detail
                    label="Status"
                    value={
                      selected.reversal_of_transfer_id
                        ? `Undo of ${selected.reversal_of_reference || selected.reversal_of_transfer_id}`
                        : selected.reversed_by_transfer_id
                          ? `Undone by ${selected.reversed_by_reference}`
                          : "Completed"
                    }
                  />
                </div>

                <div style={tableWrap}>
                  <table style={tableStyle}>
                    <thead><tr><Th>Product</Th><Th>Quantity</Th><Th>Warehouse</Th><Th>Display Area</Th><Th>Total Stock</Th></tr></thead>
                    <tbody>
                      {(selected.items || []).map((item) => (
                        <tr key={item.id}>
                          <Td>{item.product_name_snapshot}</Td>
                          <Td>{item.quantity}</Td>
                          <Td>{item.warehouse_before} → {item.warehouse_after}</Td>
                          <Td>{item.display_before} → {item.display_after}</Td>
                          <Td>{item.total_stock_snapshot}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {!selected.reversal_of_transfer_id && !selected.reversed_by_transfer_id && (
                  <div style={actionsStyle}>
                    <button type="button" onClick={reverseSelected} style={dangerButton}>Undo Transfer</button>
                  </div>
                )}
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value }) {
  return <div style={cardStyle}><div style={cardLabel}>{label}</div><div style={cardValue}>{Number(value || 0)}</div></div>;
}
function Th({ children }) { return <th style={thStyle}>{children}</th>; }
function Td({ children }) { return <td style={tdStyle}>{children}</td>; }
function Detail({ label, value }) { return <div><div style={cardLabel}>{label}</div><div style={{ marginTop: 4, fontSize: 12.5 }}>{value || "—"}</div></div>; }

const pageStyle = { maxWidth: 1180, margin: "0 auto", paddingBottom: 36 };
const headerStyle = { display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 14 };
const titleStyle = { margin: 0, fontSize: 24, color: "#18181b" };
const subtitleStyle = { margin: "5px 0 0", color: "#71717a", fontSize: 12.5, lineHeight: 1.5 };
const noticeStyle = { padding: "11px 13px", border: "1px solid #d4d4d8", background: "#fafafa", fontSize: 12, lineHeight: 1.5, marginBottom: 12 };
const summaryGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 10, marginBottom: 12 };
const cardStyle = { padding: 14, background: "#fff", border: "1px solid #dedfe2" };
const cardLabel = { color: "#71717a", fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em" };
const cardValue = { marginTop: 6, fontSize: 22, fontWeight: 700, color: "#18181b" };
const sectionStyle = { background: "#fff", border: "1px solid #d9dce1", padding: 18, marginBottom: 12 };
const sectionHeaderStyle = { display: "flex", justifyContent: "space-between", gap: 12, paddingBottom: 12, marginBottom: 14, borderBottom: "1px solid #eeeeef" };
const sectionTitle = { margin: 0, fontSize: 15, color: "#18181b" };
const sectionText = { margin: "4px 0 0", color: "#71717a", fontSize: 11.5, lineHeight: 1.45 };
const transferRouteStyle = { display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 14 };
const routeBoxStyle = { flex: "1 1 220px", minHeight: 58, padding: "9px 11px", border: "1px solid #d4d4d8", background: "#fafafa", boxSizing: "border-box" };
const routeLabelStyle = { color: "#71717a", fontSize: 10.5, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em" };
const routeValueStyle = { marginTop: 5, color: "#18181b", fontSize: 13, fontWeight: 650 };
const routeArrowStyle = { color: "#71717a", fontSize: 18, lineHeight: 1, textAlign: "center", flex: "0 0 auto" };
const fieldStyle = { display: "grid", gap: 6, marginBottom: 12 };
const labelStyle = { fontSize: 11, fontWeight: 600, color: "#3f3f46" };
const inputStyle = { width: "100%", minHeight: 37, padding: "8px 10px", border: "1px solid #d4d4d8", background: "#fff", color: "#27272a", fontSize: 12, boxSizing: "border-box" };
const helperStyle = { marginTop: 4, color: "#71717a", fontSize: 10.5 };
const lineHeader = { display: "flex", justifyContent: "space-between", alignItems: "center", margin: "4px 0 8px", fontSize: 12 };
const lineRow = { display: "grid", gridTemplateColumns: "minmax(280px,1fr) 150px auto", gap: 8, alignItems: "start" };
const actionsStyle = { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 14 };
const primaryButton = { minHeight: 37, padding: "0 14px", border: "1px solid #18181b", background: "#18181b", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" };
const secondaryButton = { minHeight: 34, padding: "0 11px", border: "1px solid #d4d4d8", background: "#fff", color: "#27272a", fontSize: 11.5, cursor: "pointer" };
const removeButton = { ...secondaryButton, color: "#991b1b" };
const dangerButton = { ...primaryButton, background: "#fff", color: "#991b1b", borderColor: "#991b1b" };
const filterGrid = { display: "grid", gridTemplateColumns: "2fr 1.5fr 1fr 1fr", gap: 8, marginBottom: 12, alignItems: "end" };
const filterFieldStyle = { display: "grid", gap: 5, minWidth: 0 };
const filterLabelStyle = { color: "#52525b", fontSize: 10.5, fontWeight: 600 };
const tableWrap = { width: "100%", overflowX: "auto" };
const tableStyle = { width: "100%", borderCollapse: "collapse", fontSize: 11.5 };
const thStyle = { padding: "9px 10px", borderBottom: "1px solid #d4d4d8", background: "#fafafa", textAlign: "left", color: "#52525b", whiteSpace: "nowrap" };
const tdStyle = { padding: "10px", borderBottom: "1px solid #eeeeef", color: "#27272a", verticalAlign: "top" };
const clickRow = { cursor: "pointer" };
const emptyCell = { padding: 24, textAlign: "center", color: "#71717a" };
const paginationStyle = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 12, color: "#71717a", fontSize: 11 };
const overlayStyle = { position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18, zIndex: 2000 };
const modalStyle = { width: "min(900px,96vw)", maxHeight: "88vh", overflow: "auto", background: "#fff", border: "1px solid #d4d4d8", padding: 18 };
const modalHeader = { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", paddingBottom: 12, marginBottom: 12, borderBottom: "1px solid #eeeeef" };
const detailGrid = { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginBottom: 14 };
