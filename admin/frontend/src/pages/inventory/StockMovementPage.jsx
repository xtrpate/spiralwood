import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import toast from "react-hot-toast";
import * as XLSX from "xlsx-js-style";
import { FileDown } from "lucide-react";

const PAGE_SIZE = 30;

// WISDOM STOCK MOVEMENTS UI POLISH V1
const SOURCE_LABELS = {
  physical_inventory: "Physical inventory",
  blueprint_production: "Blueprint production",
  legacy_production: "Historical record",
  ready_made_stock: "Ready-made stock",
  product_production: "Ready-made stock",
  order_fulfillment: "Order fulfillment",
  manual: "Manual entry",
};

const MOVEMENT_LABELS = {
  in: "Stock in",
  out: "Stock out",
  adjustment: "Adjustment",
  return: "Return",
};

const SOURCE_BADGES = {
  physical_inventory: ["#f5f3ff", "#6d28d9", "#ddd6fe"],
  blueprint_production: ["#eff6ff", "#1d4ed8", "#bfdbfe"],
  legacy_production: ["#fff7ed", "#9a3412", "#fed7aa"],
  ready_made_stock: ["#ecfdf5", "#166534", "#bbf7d0"],
  product_production: ["#ecfdf5", "#166534", "#bbf7d0"],
  order_fulfillment: ["#fff7ed", "#9a3412", "#fed7aa"],
  manual: ["#f4f4f5", "#3f3f46", "#d4d4d8"],
};

const EMPTY_SUMMARY = {
  record_count: 0,
  in_count: 0,
  out_count: 0,
  adjustment_count: 0,
  return_count: 0,
  blueprint_production_count: 0,
  legacy_production_count: 0,
  ready_made_stock_count: 0,
  order_fulfillment_count: 0,
  manual_count: 0,
};

const formatQuantity = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return number.toLocaleString("en-PH", { maximumFractionDigits: 4 });
};

const DECIMAL_QUANTITY_UNITS = new Set(["meter", "kg", "liter", "gallon"]);

const normalizeQuantityUnit = (value) =>
  String(value || "")
    .trim()
    .toLowerCase();

const unitAllowsDecimalQuantity = (unit) =>
  DECIMAL_QUANTITY_UNITS.has(normalizeQuantityUnit(unit));

const formatDateTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const MATERIAL_FORM_LABELS = {
  sheet: "Sheet",
  linear: "Linear",
  piece: "Solid",
  hardware: "Hardware",
  other: "Other",
};

const formatDimension = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return "";
  return number.toLocaleString("en-PH", { maximumFractionDigits: 2 });
};

const formatMaterialSpecification = (row = {}) => {
  if (!row.material_name) return "";

  const form = String(row.material_form || "").trim().toLowerCase();
  const formLabel = MATERIAL_FORM_LABELS[form] || "";
  const length = formatDimension(row.length_mm);
  const width = formatDimension(row.width_mm);
  const thickness = formatDimension(row.thickness_mm);

  if (length && width && thickness) {
    return `${formLabel ? `${formLabel} · ` : ""}${length} × ${width} × ${thickness} mm`;
  }

  const partialDimensions = [];
  if (length) partialDimensions.push(`L ${length} mm`);
  if (width) partialDimensions.push(`W ${width} mm`);
  if (thickness) partialDimensions.push(`T ${thickness} mm`);

  if (partialDimensions.length > 0) {
    return [formLabel, ...partialDimensions].filter(Boolean).join(" · ");
  }

  return formLabel;
};

const getMovementQuantityLabel = (row = {}) => {
  const isPositive = row.type === "in" || row.type === "return";
  const unit = row.material_unit ? ` ${row.material_unit}` : "";

  if (row.type === "adjustment") {
    return `Set to ${formatQuantity(row.quantity)}${unit}`;
  }

  return `${isPositive ? "+" : "-"}${formatQuantity(row.quantity)}${unit}`;
};

// WISDOM STOCK READY-MADE SEPARATION V1
// WISDOM STOCK MOVEMENT ORDER LINK CLEANUP V1
export default function StockMovementPage() {
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(false);

  const [filters, setFilters] = useState({
    search: "",
    type: "",
    source: "",
    date_preset: "all_time",
    from: "",
    to: "",
    page: 1,
  });
  const [modal, setModal] = useState(false);
  const [detailsRow, setDetailsRow] = useState(null);
  const [hoveredRowId, setHoveredRowId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportScope, setExportScope] = useState("filtered");
  const [itemKind, setItemKind] = useState("material");

  const handleDatePreset = (preset) => {
    const today = new Date();
    today.setMinutes(today.getMinutes() - today.getTimezoneOffset());
    let fromStr = "";
    let toStr = "";

    if (preset === "today") {
      fromStr = today.toISOString().split("T")[0];
      toStr = fromStr;
    } else if (preset === "yesterday") {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      fromStr = y.toISOString().split("T")[0];
      toStr = fromStr;
    } else if (preset === "last_7_days") {
      const y = new Date(today);
      y.setDate(y.getDate() - 7);
      fromStr = y.toISOString().split("T")[0];
      toStr = today.toISOString().split("T")[0];
    } else if (preset === "last_30_days") {
      const y = new Date(today);
      y.setDate(y.getDate() - 30);
      fromStr = y.toISOString().split("T")[0];
      toStr = today.toISOString().split("T")[0];
    }

    setFilters((current) => ({
      ...current,
      date_preset: preset,
      from: fromStr,
      to: toStr,
      page: 1,
    }));
  };
  const [form, setForm] = useState({
    material_id: "",
    product_id: "",
    type: "in",
    quantity: "",
    reference: "",
    notes: "",
  });
  const [rawMats, setRawMats] = useState([]);
  const [products, setProducts] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/inventory/movements", {
        params: { ...filters, limit: PAGE_SIZE },
      });
      setRows(data.rows || []);
      setTotal(Number(data.total || 0));
      setSummary({ ...EMPTY_SUMMARY, ...(data.summary || {}) });
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api
      .get("/inventory/raw", {
        params: { limit: 1000, archive_status: "active" },
      })
      .then((r) => setRawMats(r.data.rows || []));
    api
      .get("/products", { params: { limit: 1000 } })
      .then((r) =>
        setProducts(
          (r.data.products || []).filter(
            (product) =>
              String(product.type || "standard").toLowerCase() !== "blueprint",
          ),
        ),
      );
  }, []);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const summaryCards = useMemo(() => {
    const cards = [
      ["Records", summary.record_count],
      ["Blueprint production", summary.blueprint_production_count],
      ["Ready-made stock", summary.ready_made_stock_count],
      ["Order fulfillment", summary.order_fulfillment_count],
      ["Manual entries", summary.manual_count],
    ];

    if (Number(summary.legacy_production_count || 0) > 0) {
      cards.push(["Historical records", summary.legacy_production_count]);
    }

    return cards;
  }, [summary]);

  const resetForm = () => {
    setItemKind("material");
    setForm({
      material_id: "",
      product_id: "",
      type: "in",
      quantity: "",
      reference: "",
      notes: "",
    });
  };

  const clearFilters = () => {
    setFilters({
      search: "",
      type: "",
      source: "",
      date_preset: "all_time",
      from: "",
      to: "",
      page: 1,
    });
  };

  const updateFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value, page: 1 }));
  };

  const handleMaterialChange = (value) => {
    setForm((current) => ({
      ...current,
      material_id: value,
      product_id: value ? "" : current.product_id,
    }));
  };

  const handleProductChange = (value) => {
    setForm((current) => ({
      ...current,
      product_id: value,
      material_id: value ? "" : current.material_id,
    }));
  };

  const handleExportReport = async () => {
    setExporting(true);
    try {
      const params =
        exportScope === "filtered"
          ? { ...filters, limit: 5000 }
          : { limit: 5000 };

      const { data } = await api.get("/inventory/movements", { params });
      const exportRows = data.rows || [];
      if (!exportRows.length) {
        toast.error("No movements found to export.");
        return;
      }

      const wb = XLSX.utils.book_new();
      const exportData = [
        [{ v: "STOCK MOVEMENT HISTORY REPORT", s: { font: { bold: true } } }],
        [],
        [
          "Date",
          "Movement",
          "Source",
          "Item",
          "Specification",
          "Quantity",
          "Order",
          "Reference",
          "Notes",
          "Recorded By",
        ].map((t) => ({
          v: t,
          s: {
            font: { bold: true, color: { rgb: "FFFFFF" } },
            fill: { fgColor: { rgb: "000000" } },
          },
        })),
      ];

      exportRows.forEach((row) => {
        const qtyLabel = getMovementQuantityLabel(row);
        const specification = formatMaterialSpecification(row);
        exportData.push([
          new Date(row.created_at).toLocaleString("en-PH"),
          String(row.type || "").toUpperCase(),
          SOURCE_LABELS[row.movement_source] || "Manual entry",
          row.material_name || row.product_name || "—",
          specification || "—",
          qtyLabel,
          row.order_number || row.order_id || "—",
          row.reference || "—",
          row.notes || "—",
          row.created_by_name || "—",
        ]);
      });

      const ws = XLSX.utils.aoa_to_sheet(exportData);
      ws["!cols"] = [
        { wch: 25 },
        { wch: 15 },
        { wch: 20 },
        { wch: 35 },
        { wch: 32 },
        { wch: 15 },
        { wch: 20 },
        { wch: 20 },
        { wch: 30 },
        { wch: 20 },
      ];
      XLSX.utils.book_append_sheet(wb, ws, "Stock Movements");
      XLSX.writeFile(
        wb,
        `Stock-Movements-Report-${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
      toast.success("Excel report exported successfully.");
    } catch (err) {
      toast.error("Failed to export report.");
    } finally {
      setExporting(false);
    }
  };

  const handleItemKindChange = (value) => {
    setItemKind(value);
    setForm((current) => ({
      ...current,
      material_id: "",
      product_id: "",
    }));
  };

  const detailsSource = detailsRow?.movement_source || "manual";
  const detailsSourceColors =
    SOURCE_BADGES[detailsSource] || SOURCE_BADGES.manual;
  const detailsItemName =
    detailsRow?.material_name || detailsRow?.product_name || "—";
  const detailsSpecification = formatMaterialSpecification(detailsRow || {});
  const detailsQuantityLabel = detailsRow
    ? getMovementQuantityLabel(detailsRow)
    : "—";
  const detailsIsPositive =
    detailsRow?.type === "in" || detailsRow?.type === "return";
  const detailsIsAdjustment = detailsRow?.type === "adjustment";

  const isMaterialTarget = Boolean(form.material_id);
  const isProductTarget = Boolean(form.product_id);
  const selectedMaterial = useMemo(
    () =>
      rawMats.find(
        (material) => Number(material.id) === Number(form.material_id),
      ) || null,
    [rawMats, form.material_id],
  );
  const selectedOnHand = Number(
    selectedMaterial?.on_hand_quantity ?? selectedMaterial?.quantity ?? 0,
  );
  const selectedReserved = Number(selectedMaterial?.reserved_quantity || 0);
  const selectedAvailable = Number(
    selectedMaterial?.available_quantity ??
      Math.max(0, selectedOnHand - selectedReserved),
  );
  const selectedMaterialAllowsDecimal = unitAllowsDecimalQuantity(
    selectedMaterial?.unit,
  );

  const helperMessage =
    isProductTarget && form.type === "in"
      ? "Stock in adds the selected item to inventory."
      : isProductTarget && form.type === "adjustment"
        ? "Adjustment completely replaces the stock count with the exact quantity you enter below."
        : isMaterialTarget && form.type === "in"
          ? "Use Stock in for supplier deliveries or restocking."
          : isMaterialTarget && form.type === "return"
            ? "Use Return when material is placed back into inventory."
            : isMaterialTarget && form.type === "adjustment"
              ? `Adjustment completely replaces the stock count. Due to active reservations, you cannot set it lower than ${formatQuantity(selectedReserved)} ${selectedMaterial?.unit || "unit"}.`
              : itemKind === "material"
                ? "Choose a raw material to continue."
                : "Choose a ready-made product to continue.";

  const handleSave = async (event) => {
    event.preventDefault();

    if (!form.material_id && !form.product_id) {
      toast.error("Select an inventory item.");
      return;
    }

    const quantityText = String(form.quantity || "").trim();
    const requestedQuantity = Number(quantityText);
    const isAdjustment = form.type === "adjustment";

    if (
      isMaterialTarget &&
      selectedMaterialAllowsDecimal &&
      !/^(?:\d+|\d+\.\d{1,2})$/.test(quantityText)
    ) {
      toast.error(
        `${selectedMaterial?.unit || "This unit"} quantity can have up to 2 decimal places.`,
      );
      return;
    }

    if (
      isMaterialTarget &&
      !selectedMaterialAllowsDecimal &&
      !/^\d+$/.test(quantityText)
    ) {
      toast.error(
        `${selectedMaterial?.unit || "This unit"} quantity must be a whole number.`,
      );
      return;
    }

    if (isProductTarget && !/^\d+$/.test(quantityText)) {
      toast.error("Ready-made product quantity must be a whole number.");
      return;
    }

    if (
      !Number.isFinite(requestedQuantity) ||
      (isAdjustment ? requestedQuantity < 0 : requestedQuantity <= 0)
    ) {
      toast.error(
        isAdjustment
          ? "Adjustment quantity must be 0 or greater."
          : "Quantity must be greater than 0.",
      );
      return;
    }

    setSaving(true);
    try {
      const payload = {
        material_id: form.material_id || null,
        product_id: form.product_id || null,
        type: form.type,
        quantity: Number(form.quantity),
        reference: form.reference.trim() || null,
        notes: form.notes.trim() || null,
      };

      const { data } = await api.post("/inventory/movements", payload);
      toast.success(data?.message || "Stock movement recorded.");
      setModal(false);
      resetForm();
      await load();
    } catch (error) {
      // The global API interceptor displays the server error message.
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={header}>
        <div>
          <h1 style={title}>Stock Movements</h1>
          <p style={subtitle}>
            Review physical stock changes for raw materials and ready-made
            products. Blueprint production appears when raw materials are
            consumed.
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button
            onClick={() => setExportOpen(true)}
            disabled={exporting}
            style={{
              padding: "9px 18px",
              background: "#ffffff",
              color: "#18181b",
              border: "1px solid #d4d4d8",
              borderRadius: "2px",
              fontSize: "12px",
              fontWeight: "600",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <FileDown size={14} />
            {exporting ? "Exporting..." : "Export Report"}
          </button>
          <button onClick={() => setModal(true)} style={btnPrimary}>
            Record movement
          </button>
        </div>
      </div>

      <div style={summaryGrid}>
        {summaryCards.map(([label, value]) => (
          <div key={label} style={summaryCard}>
            <div style={summaryLabel}>{label}</div>
            <div style={summaryValue}>
              {Number(value || 0).toLocaleString("en-PH")}
            </div>
            {label === "Historical records" && (
              <div style={summaryHelper}>
                Older stock movements kept for history and audit tracking.
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={filterCard}>
        <div style={{ ...filterField, flex: "1 1 320px" }}>
          <label style={filterLabel}>Search</label>
          <input
            placeholder="Search material, product, order, reference, or customer"
            value={filters.search}
            onChange={(event) => updateFilter("search", event.target.value)}
            style={{ ...inputSm, width: "100%", boxSizing: "border-box" }}
          />
        </div>

        <div style={filterField}>
          <label style={filterLabel}>Movement</label>
          <select
            value={filters.type}
            onChange={(event) => updateFilter("type", event.target.value)}
            style={inputSm}
          >
            <option value="">All movements</option>
            <option value="in">Stock in</option>
            <option value="out">Stock out</option>
            <option value="adjustment">Adjustment</option>
            <option value="return">Return</option>
          </select>
        </div>

        <div style={filterField}>
          <label style={filterLabel}>Source</label>
          <select
            value={filters.source}
            onChange={(event) => updateFilter("source", event.target.value)}
            style={inputSm}
          >
            <option value="">All sources</option>
            <option value="physical_inventory">Physical inventory</option>
            <option value="blueprint_production">Blueprint production</option>
            <option value="legacy_production">Historical records</option>
            <option value="ready_made_stock">Ready-made stock</option>
            <option value="order_fulfillment">Order fulfillment</option>
            <option value="manual">Manual entry</option>
          </select>
        </div>

        <div style={filterField}>
          <label style={filterLabel}>Date Range</label>
          <select
            value={filters.date_preset}
            onChange={(e) => handleDatePreset(e.target.value)}
            style={inputSm}
          >
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="last_7_days">Last 7 Days</option>
            <option value="last_30_days">Last 30 Days</option>
            <option value="all_time">All Time</option>
            <option value="custom">Custom Range</option>
          </select>
        </div>

        {filters.date_preset === "custom" && (
          <>
            <div style={filterField}>
              <label style={filterLabel}>From</label>
              <input
                type="date"
                value={filters.from}
                onChange={(event) => updateFilter("from", event.target.value)}
                style={inputSm}
                aria-label="From date"
              />
            </div>

            <div style={filterField}>
              <label style={filterLabel}>To</label>
              <input
                type="date"
                value={filters.to}
                onChange={(event) => updateFilter("to", event.target.value)}
                style={inputSm}
                aria-label="To date"
              />
            </div>
          </>
        )}

        <div style={{ ...filterField, justifyContent: "flex-end" }}>
          <span style={{ ...filterLabel, visibility: "hidden" }}>Action</span>
          <button onClick={clearFilters} style={btnGhost}>
            Reset filters
          </button>
        </div>
      </div>

      <div style={tableCard}>
        <div style={tableSectionHeader}>
          <div>
            <div style={tableSectionTitle}>Movement history</div>
            <div style={tableSectionSubtitle}>
              Physical stock changes recorded by the system and staff.
            </div>
          </div>
          <div style={tableCount}>{total.toLocaleString("en-PH")} records</div>
        </div>
        <table
          style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
        >
          <thead>
            <tr style={{ background: "#fafafa" }}>
              {[
                "Date and time",
                "Movement",
                "Source",
                "Item",
                "Quantity",
                "",
              ].map((heading, index) => (
                <th key={`${heading}-${index}`} style={th}>
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} style={emptyCell}>
                  Loading stock movements...
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} style={emptyCell}>
                  No stock movements found for the selected filters.
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const source = row.movement_source || "manual";
                const [sourceBg, sourceColor, sourceBorder] =
                  SOURCE_BADGES[source] || SOURCE_BADGES.manual;
                const isPositive = row.type === "in" || row.type === "return";
                const isAdjustment = row.type === "adjustment";
                const itemName = row.material_name || row.product_name || "—";
                const specification = formatMaterialSpecification(row);
                const quantityLabel = getMovementQuantityLabel(row);
                const isHovered = Number(hoveredRowId) === Number(row.id);

                return (
                  <tr
                    key={row.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`View stock movement details for ${itemName}`}
                    title="View movement details"
                    onClick={() => setDetailsRow(row)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setDetailsRow(row);
                      }
                    }}
                    onMouseEnter={() => setHoveredRowId(row.id)}
                    onMouseLeave={() => setHoveredRowId(null)}
                    style={{
                      borderBottom: "1px solid #f4f4f5",
                      background: isHovered ? "#fafafa" : "#ffffff",
                      cursor: "pointer",
                      outline: "none",
                    }}
                  >
                    <td
                      style={{ ...td, color: "#71717a", whiteSpace: "nowrap" }}
                    >
                      {formatDateTime(row.created_at)}
                    </td>
                    <td style={td}>
                      <span style={typeBadge}>
                        {MOVEMENT_LABELS[row.type] || "Movement"}
                      </span>
                    </td>
                    <td style={td}>
                      <span
                        style={{
                          ...sourceBadge,
                          background: sourceBg,
                          color: sourceColor,
                          border: `1px solid ${sourceBorder}`,
                        }}
                      >
                        {SOURCE_LABELS[source] || "Manual entry"}
                      </span>
                      {row.reservation_status && (
                        <div style={subMeta}>
                          Reservation:{" "}
                          {String(row.reservation_status).replaceAll("_", " ")}
                        </div>
                      )}
                    </td>
                    <td style={{ ...td, minWidth: 230 }}>
                      <div style={{ fontWeight: 600, color: "#0a0a0a" }}>
                        {itemName}
                      </div>
                      {specification && (
                        <div style={subMeta}>{specification}</div>
                      )}
                      {row.product_name && row.material_name && (
                        <div style={subMeta}>For: {row.product_name}</div>
                      )}
                    </td>
                    <td
                      style={{
                        ...td,
                        fontWeight: 700,
                        color: isAdjustment
                          ? "#18181b"
                          : isPositive
                            ? "#166534"
                            : "#b42318",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {quantityLabel}
                    </td>
                    <td
                      aria-hidden="true"
                      style={{
                        ...td,
                        width: 34,
                        paddingLeft: 4,
                        paddingRight: 14,
                        textAlign: "right",
                        color: "#a1a1aa",
                        fontSize: 20,
                        lineHeight: 1,
                        verticalAlign: "middle",
                      }}
                    >
                      ›
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div style={paginationRow}>
        <span style={{ fontSize: 12, color: "#71717a" }}>
          Page {filters.page} of {pageCount} · {total.toLocaleString("en-PH")}{" "}
          records
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            disabled={filters.page <= 1}
            onClick={() =>
              setFilters((current) => ({ ...current, page: current.page - 1 }))
            }
            style={filters.page <= 1 ? btnDisabled : btnGhost}
          >
            Previous
          </button>
          <button
            disabled={filters.page >= pageCount}
            onClick={() =>
              setFilters((current) => ({ ...current, page: current.page + 1 }))
            }
            style={filters.page >= pageCount ? btnDisabled : btnGhost}
          >
            Next
          </button>
        </div>
      </div>

      {detailsRow && (
        <div style={overlay}>
          <div style={detailsModalBox}>
            <div style={detailsHeader}>
              <div>
                <h3 style={modalTitle}>Stock Movement Details</h3>
                <p style={modalSubtitle}>
                  Full inventory history and tracking information for this
                  movement.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailsRow(null)}
                style={detailsCloseIcon}
                aria-label="Close stock movement details"
              >
                ×
              </button>
            </div>

            <div style={detailsSummaryGrid}>
              <div style={detailsSummaryCell}>
                <div style={detailsLabel}>Movement</div>
                <span style={typeBadge}>
                  {MOVEMENT_LABELS[detailsRow.type] || "Movement"}
                </span>
              </div>

              <div style={detailsSummaryCell}>
                <div style={detailsLabel}>Source</div>
                <span
                  style={{
                    ...sourceBadge,
                    background: detailsSourceColors[0],
                    color: detailsSourceColors[1],
                    border: `1px solid ${detailsSourceColors[2]}`,
                  }}
                >
                  {SOURCE_LABELS[detailsSource] || "Manual entry"}
                </span>
              </div>

              <div style={detailsSummaryCell}>
                <div style={detailsLabel}>Quantity</div>
                <div
                  style={{
                    ...detailsStrongValue,
                    color: detailsIsAdjustment
                      ? "#18181b"
                      : detailsIsPositive
                        ? "#166534"
                        : "#b42318",
                  }}
                >
                  {detailsQuantityLabel}
                </div>
              </div>

              <div style={detailsSummaryCell}>
                <div style={detailsLabel}>Date & Time</div>
                <div style={detailsValue}>
                  {formatDateTime(detailsRow.created_at)}
                </div>
              </div>
            </div>

            <div style={detailsSection}>
              <div style={detailsSectionTitle}>Item</div>
              <div style={detailsItemNameStyle}>{detailsItemName}</div>
              {detailsSpecification && (
                <div style={detailsItemMeta}>{detailsSpecification}</div>
              )}
              {detailsRow.product_name && detailsRow.material_name && (
                <div style={detailsItemMeta}>
                  For: {detailsRow.product_name}
                </div>
              )}
            </div>

            <div style={detailsSection}>
              <div style={detailsSectionTitle}>Tracking</div>
              <div style={detailsGrid}>
                {detailsRow.order_id && (
                  <div style={detailsField}>
                    <div style={detailsLabel}>Order</div>
                    <button
                      type="button"
                      onClick={() => {
                        const orderId = detailsRow.order_id;
                        setDetailsRow(null);
                        navigate(`/admin/orders/${orderId}`);
                      }}
                      style={detailsOrderLink}
                    >
                      {detailsRow.order_number ||
                        `Order #${detailsRow.order_id}`}
                    </button>
                    {detailsRow.customer_name && (
                      <div style={detailsMuted}>
                        {detailsRow.customer_name}
                      </div>
                    )}
                    {detailsRow.order_status && (
                      <div style={detailsMuted}>
                        {detailsRow.order_status}
                        {detailsRow.payment_status
                          ? ` · ${detailsRow.payment_status}`
                          : ""}
                      </div>
                    )}
                  </div>
                )}

                {detailsRow.reference && (
                  <div style={detailsField}>
                    <div style={detailsLabel}>Reference</div>
                    <div style={detailsValue}>{detailsRow.reference}</div>
                  </div>
                )}

                {detailsRow.reservation_id && (
                  <div style={detailsField}>
                    <div style={detailsLabel}>Reservation</div>
                    <div style={detailsValue}>
                      #{detailsRow.reservation_id}
                      {detailsRow.reservation_status
                        ? ` · ${String(detailsRow.reservation_status).replaceAll(
                            "_",
                            " ",
                          )}`
                        : ""}
                    </div>
                  </div>
                )}

                {detailsRow.supplier_name && (
                  <div style={detailsField}>
                    <div style={detailsLabel}>Supplier</div>
                    <div style={detailsValue}>
                      {detailsRow.supplier_name}
                    </div>
                  </div>
                )}

                <div style={detailsField}>
                  <div style={detailsLabel}>Recorded By</div>
                  <div style={detailsValue}>
                    {detailsRow.created_by_name || "—"}
                  </div>
                </div>
              </div>
            </div>

            {detailsRow.notes && (
              <div style={detailsSection}>
                <div style={detailsSectionTitle}>Notes</div>
                <div style={detailsNotes}>{detailsRow.notes}</div>
              </div>
            )}

            <div style={modalActions}>
              <button
                type="button"
                onClick={() => setDetailsRow(null)}
                style={btnGhost}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {modal && (
        <div style={overlay}>
          <div style={modalBox}>
            <h3 style={modalTitle}>Record stock movement</h3>
            <p style={modalSubtitle}>
              Choose the movement, item, and quantity for this physical stock
              change.
            </p>
            <form onSubmit={handleSave}>
              <div style={fieldGroup}>
                <label style={label}>Movement *</label>
                <select
                  required
                  value={form.type}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      type: event.target.value,
                    }))
                  }
                  style={inputFull}
                >
                  <option value="in">Stock in</option>
                  <option value="adjustment">Adjustment</option>
                  <option value="return">Return</option>
                </select>
              </div>

              <div style={fieldGroup}>
                <label style={label}>Item type *</label>
                <select
                  required
                  value={itemKind}
                  onChange={(event) => handleItemKindChange(event.target.value)}
                  style={inputFull}
                >
                  <option value="material">Raw material</option>
                  <option value="product">Ready-made product</option>
                </select>
              </div>

              <div style={fieldGroup}>
                <label style={label}>Item *</label>
                {itemKind === "material" ? (
                  <select
                    required
                    value={form.material_id}
                    onChange={(event) =>
                      handleMaterialChange(event.target.value)
                    }
                    style={inputFull}
                  >
                    <option value="">Select raw material</option>
                    {rawMats.map((material) => (
                      <option key={material.id} value={material.id}>
                        {material.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <select
                    required
                    value={form.product_id}
                    onChange={(event) =>
                      handleProductChange(event.target.value)
                    }
                    style={inputFull}
                  >
                    <option value="">Select ready-made product</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {selectedMaterial && (
                <div style={availabilityBox}>
                  <div>
                    <span style={availabilityLabel}>On hand</span>
                    <strong>
                      {formatQuantity(selectedOnHand)} {selectedMaterial.unit}
                    </strong>
                  </div>
                  <div>
                    <span style={availabilityLabel}>Reserved</span>
                    <strong>
                      {formatQuantity(selectedReserved)} {selectedMaterial.unit}
                    </strong>
                  </div>
                  <div>
                    <span style={availabilityLabel}>Available</span>
                    <strong>
                      {formatQuantity(selectedAvailable)}{" "}
                      {selectedMaterial.unit}
                    </strong>
                  </div>
                </div>
              )}

              <div style={helperBox}>{helperMessage}</div>

              <div style={fieldGroup}>
                <label style={label}>Quantity *</label>
                <input
                  type="text"
                  inputMode={
                    itemKind === "material" && selectedMaterialAllowsDecimal
                      ? "decimal"
                      : "numeric"
                  }
                  required
                  value={form.quantity}
                  onChange={(event) => {
                    let nextValue = event.target.value;

                    if (
                      itemKind === "material" &&
                      selectedMaterialAllowsDecimal
                    ) {
                      nextValue = nextValue.replace(/[^0-9.]/g, "");
                      const firstDot = nextValue.indexOf(".");
                      if (firstDot !== -1) {
                        const whole = nextValue.slice(0, firstDot);
                        const fraction = nextValue
                          .slice(firstDot + 1)
                          .replace(/\./g, "")
                          .slice(0, 2);
                        nextValue = `${whole}.${fraction}`;
                      }
                    } else {
                      nextValue = nextValue.replace(/[^0-9]/g, "");
                    }

                    setForm((current) => ({
                      ...current,
                      quantity: nextValue,
                    }));
                  }}
                  style={inputFull}
                />
              </div>

              <div style={fieldGroup}>
                <label style={label}>
                  Reference <span style={optionalText}>Optional</span>
                </label>
                <input
                  value={form.reference}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      reference: event.target.value,
                    }))
                  }
                  placeholder="PO number, receipt number, or adjustment reference"
                  maxLength={100}
                  style={inputFull}
                />
              </div>

              <div style={{ ...fieldGroup, marginBottom: 20 }}>
                <label style={label}>
                  Notes <span style={optionalText}>Optional</span>
                </label>
                <textarea
                  value={form.notes}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  rows={3}
                  style={{ ...inputFull, resize: "vertical" }}
                />
              </div>

              <div style={modalActions}>
                <button
                  type="button"
                  onClick={() => {
                    setModal(false);
                    resetForm();
                  }}
                  style={btnGhost}
                >
                  Cancel
                </button>
                <button type="submit" disabled={saving} style={btnPrimary}>
                  {saving ? "Saving..." : "Save movement"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {exportOpen && (
        <div style={modalBackdrop}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-movement-title"
            style={{ ...dialog, width: "min(520px, 100%)" }}
          >
            <div style={dialogEyebrow}>Report Generation</div>

            <h2 id="export-movement-title" style={dialogTitle}>
              Export movement history
            </h2>

            <p style={{ ...dialogText, marginBottom: 16 }}>
              Create an Excel report mapping the exact physical stock
              adjustments within the warehouse.
            </p>

            <div style={exportScopeList}>
              <button
                type="button"
                onClick={() => setExportScope("filtered")}
                style={{
                  ...exportScopeOption,
                  ...(exportScope === "filtered"
                    ? exportScopeOptionSelected
                    : {}),
                }}
                disabled={exporting}
              >
                <span style={exportScopeTitle}>Current filters</span>

                <span style={exportScopeMeta}>
                  {total.toLocaleString("en-PH")} matching record
                  {total === 1 ? "" : "s"}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setExportScope("all")}
                style={{
                  ...exportScopeOption,
                  ...(exportScope === "all" ? exportScopeOptionSelected : {}),
                }}
                disabled={exporting}
              >
                <span style={exportScopeTitle}>All records</span>

                <span style={exportScopeMeta}>
                  Export entire historical log
                </span>
              </button>
            </div>

            <div style={exportContents}>
              <div style={exportContentsLabel}>Included in Excel</div>

              <div style={exportContentsText}>
                Date, movement type, source context, item specification,
                adjusted quantity, related order, and auditing notes.
              </div>
            </div>

            <div style={dialogActions}>
              <button
                type="button"
                onClick={() => setExportOpen(false)}
                style={btnSecondaryExport}
                disabled={exporting}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleExportReport}
                style={{
                  ...btnPrimaryExport,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  opacity: exporting ? 0.65 : 1,
                  cursor: exporting ? "wait" : "pointer",
                }}
                disabled={exporting}
              >
                <FileDown size={14} strokeWidth={1.8} aria-hidden="true" />

                {exporting ? "Preparing..." : "Export Excel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const header = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 16,
  marginBottom: 18,
};
const title = {
  margin: 0,
  fontSize: 24,
  fontWeight: 700,
  color: "#0a0a0a",
  letterSpacing: "-0.02em",
};
const subtitle = {
  margin: "6px 0 0",
  maxWidth: 850,
  fontSize: 12,
  lineHeight: 1.5,
  color: "#71717a",
};
const summaryGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 10,
  marginBottom: 14,
};
const summaryCard = {
  background: "#fff",
  border: "1px solid #e4e4e7",
  borderRadius: 2,
  padding: "13px 15px",
};
const summaryLabel = {
  fontSize: 10,
  fontWeight: 600,
  color: "#71717a",
  textTransform: "uppercase",
  letterSpacing: 0.7,
};
const summaryValue = {
  marginTop: 5,
  fontSize: 21,
  fontWeight: 700,
  color: "#18181b",
};
const summaryHelper = {
  marginTop: 4,
  maxWidth: 220,
  fontSize: 10,
  lineHeight: 1.4,
  color: "#a1a1aa",
};
const filterCard = {
  display: "flex",
  alignItems: "flex-end",
  gap: 10,
  flexWrap: "wrap",
  padding: 12,
  marginBottom: 14,
  background: "#fff",
  border: "1px solid #e4e4e7",
  borderRadius: 2,
};
const filterField = {
  display: "flex",
  flexDirection: "column",
  gap: 5,
  minWidth: 130,
};
const filterLabel = {
  fontSize: 10,
  fontWeight: 600,
  color: "#52525b",
  textTransform: "uppercase",
  letterSpacing: 0.55,
};
const tableCard = {
  background: "#fff",
  border: "1px solid #e4e4e7",
  borderRadius: 2,
  overflowX: "auto",
};
const tableSectionHeader = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 16,
  padding: "13px 14px",
  borderBottom: "1px solid #e4e4e7",
};
const tableSectionTitle = {
  fontSize: 14,
  fontWeight: 650,
  color: "#18181b",
};
const tableSectionSubtitle = {
  marginTop: 3,
  fontSize: 11,
  color: "#71717a",
};
const tableCount = {
  paddingTop: 2,
  fontSize: 11,
  color: "#71717a",
  whiteSpace: "nowrap",
};
const th = {
  padding: "12px 14px",
  textAlign: "left",
  fontSize: 10,
  fontWeight: 600,
  color: "#71717a",
  textTransform: "uppercase",
  letterSpacing: 0.8,
  whiteSpace: "nowrap",
};
const td = {
  padding: "13px 14px",
  color: "#18181b",
  verticalAlign: "top",
};
const emptyCell = {
  ...td,
  padding: 34,
  textAlign: "center",
  color: "#71717a",
};
const typeBadge = {
  display: "inline-block",
  padding: "3px 8px",
  borderRadius: 2,
  background: "#f4f4f5",
  color: "#18181b",
  border: "1px solid #e4e4e7",
  fontSize: 11,
  fontWeight: 600,
  textTransform: "capitalize",
  whiteSpace: "nowrap",
};
const sourceBadge = {
  display: "inline-block",
  padding: "3px 8px",
  borderRadius: 2,
  fontSize: 11,
  fontWeight: 600,
  whiteSpace: "nowrap",
};
const subMeta = {
  marginTop: 4,
  fontSize: 10,
  color: "#71717a",
  textTransform: "capitalize",
};
const paginationRow = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  marginTop: 14,
};
const inputSm = {
  minHeight: 36,
  padding: "8px 10px",
  border: "1px solid #d4d4d8",
  borderRadius: 2,
  background: "#fff",
  color: "#18181b",
  fontSize: 12,
  outline: "none",
};
const inputFull = {
  width: "100%",
  minHeight: 38,
  padding: "9px 11px",
  border: "1px solid #d4d4d8",
  borderRadius: 2,
  color: "#18181b",
  fontSize: 13,
  boxSizing: "border-box",
  outline: "none",
};
const btnPrimary = {
  minHeight: 36,
  padding: "8px 14px",
  background: "#18181b",
  color: "#fff",
  border: "1px solid #18181b",
  borderRadius: 2,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
const btnGhost = {
  minHeight: 36,
  padding: "8px 12px",
  background: "#fff",
  color: "#18181b",
  border: "1px solid #d4d4d8",
  borderRadius: 2,
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};
const btnDisabled = {
  ...btnGhost,
  color: "#a1a1aa",
  background: "#f4f4f5",
  cursor: "not-allowed",
};
const overlay = {
  position: "fixed",
  inset: 0,
  zIndex: 1000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(0,0,0,.55)",
  padding: 20,
};

const modalBackdrop = {
  position: "fixed",
  inset: 0,
  zIndex: 1100,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(0,0,0,.55)",
  padding: 20,
};
const modalBox = {
  width: 500,
  maxWidth: "100%",
  maxHeight: "90vh",
  overflowY: "auto",
  padding: 24,
  background: "#fff",
  borderRadius: 2,
  boxShadow: "0 18px 50px rgba(0,0,0,.22)",
};
const detailsModalBox = {
  width: 760,
  maxWidth: "100%",
  maxHeight: "90vh",
  overflowY: "auto",
  padding: 24,
  background: "#fff",
  borderRadius: 2,
  boxShadow: "0 18px 50px rgba(0,0,0,.22)",
};
const detailsHeader = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 16,
};
const detailsCloseIcon = {
  width: 32,
  height: 32,
  padding: 0,
  background: "#fff",
  color: "#71717a",
  border: "1px solid #e4e4e7",
  borderRadius: 2,
  fontFamily: "inherit",
  fontSize: 20,
  lineHeight: 1,
  cursor: "pointer",
};
const detailsSummaryGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 0,
  marginBottom: 16,
  border: "1px solid #e4e4e7",
  background: "#fff",
};
const detailsSummaryCell = {
  minHeight: 74,
  padding: "13px 14px",
  borderRight: "1px solid #e4e4e7",
};
const detailsSection = {
  marginBottom: 16,
  padding: "14px 15px",
  border: "1px solid #e4e4e7",
  background: "#fff",
};
const detailsSectionTitle = {
  marginBottom: 10,
  color: "#71717a",
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: 0.7,
  textTransform: "uppercase",
};
const detailsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  columnGap: 24,
  rowGap: 16,
};
const detailsField = {
  minWidth: 0,
};
const detailsLabel = {
  marginBottom: 5,
  color: "#71717a",
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: 0.45,
  textTransform: "uppercase",
};
const detailsValue = {
  color: "#18181b",
  fontSize: 12,
  lineHeight: 1.45,
  wordBreak: "break-word",
};
const detailsStrongValue = {
  color: "#18181b",
  fontSize: 13,
  fontWeight: 700,
  lineHeight: 1.4,
};
const detailsItemNameStyle = {
  color: "#0a0a0a",
  fontSize: 15,
  fontWeight: 700,
  lineHeight: 1.35,
};
const detailsItemMeta = {
  marginTop: 4,
  color: "#71717a",
  fontSize: 11,
  lineHeight: 1.4,
};
const detailsMuted = {
  marginTop: 3,
  color: "#71717a",
  fontSize: 10.5,
  lineHeight: 1.35,
  textTransform: "capitalize",
};
const detailsOrderLink = {
  padding: 0,
  background: "none",
  color: "#18181b",
  border: "none",
  fontFamily: "inherit",
  fontSize: 12,
  fontWeight: 700,
  textAlign: "left",
  textDecoration: "underline",
  textUnderlineOffset: 2,
  cursor: "pointer",
};
const detailsNotes = {
  padding: "10px 12px",
  background: "#fafafa",
  border: "1px solid #f4f4f5",
  color: "#52525b",
  fontSize: 12,
  lineHeight: 1.5,
  whiteSpace: "pre-wrap",
  wordBreak: "break-word",
};
const modalTitle = {
  margin: 0,
  fontSize: 18,
  fontWeight: 700,
  color: "#0a0a0a",
};
const modalSubtitle = {
  margin: "5px 0 18px",
  fontSize: 12,
  lineHeight: 1.45,
  color: "#71717a",
};
const fieldGroup = { marginBottom: 12 };
const label = {
  display: "block",
  marginBottom: 6,
  fontSize: 12,
  fontWeight: 600,
  color: "#3f3f46",
};
const optionalText = {
  marginLeft: 4,
  fontSize: 10,
  fontWeight: 400,
  color: "#a1a1aa",
};
const availabilityBox = {
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
  gap: 8,
  marginTop: -4,
  marginBottom: 12,
  padding: "10px 12px",
  borderRadius: 2,
  background: "#fafafa",
  border: "1px solid #e4e4e7",
  color: "#18181b",
  fontSize: 12,
};
const availabilityLabel = {
  display: "block",
  marginBottom: 3,
  color: "#64748b",
  fontSize: 10,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: 0.5,
};
const helperBox = {
  marginBottom: 16,
  padding: "10px 12px",
  borderRadius: 2,
  background: "#fafafa",
  border: "1px solid #e4e4e7",
  color: "#52525b",
  fontSize: 12,
  lineHeight: 1.5,
};
const modalActions = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 10,
};

const exportScopeList = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 8,
  marginBottom: 12,
};
const exportScopeOption = {
  minHeight: 76,
  padding: "12px 13px",
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  justifyContent: "center",
  gap: 5,
  background: "#ffffff",
  color: "#27272a",
  border: "1px solid #d4d4d8",
  borderRadius: 2,
  fontFamily: "inherit",
  textAlign: "left",
  cursor: "pointer",
};
const exportScopeOptionSelected = {
  background: "#fafafa",
  borderColor: "#18181b",
  boxShadow: "inset 0 0 0 1px #18181b",
};
const exportScopeTitle = {
  color: "#18181b",
  fontSize: 12.5,
  fontWeight: 600,
  lineHeight: 1.25,
};
const exportScopeMeta = {
  color: "#71717a",
  fontSize: 10.5,
  fontWeight: 400,
  lineHeight: 1.35,
};
const exportContents = {
  marginBottom: 18,
  padding: "11px 12px",
  background: "#fafafa",
  border: "1px solid #e4e4e7",
  borderRadius: 2,
};
const exportContentsLabel = {
  marginBottom: 4,
  color: "#3f3f46",
  fontSize: 9.5,
  fontWeight: 600,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};
const exportContentsText = {
  color: "#71717a",
  fontSize: 11.5,
  fontWeight: 400,
  lineHeight: 1.45,
};
const dialog = {
  width: "min(430px, 100%)",
  padding: 20,
  background: "#ffffff",
  border: "1px solid #d4d4d8",
  borderRadius: 2,
  boxShadow: "0 18px 48px rgba(0,0,0,0.18)",
};
const dialogEyebrow = {
  marginBottom: 6,
  color: "#71717a",
  fontSize: 9.5,
  fontWeight: 600,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};
const dialogTitle = {
  margin: 0,
  color: "#18181b",
  fontSize: 18,
  fontWeight: 700,
};
const dialogText = {
  margin: "8px 0 20px",
  color: "#52525b",
  fontSize: 13,
  fontWeight: 400,
  lineHeight: 1.5,
};
const dialogActions = { display: "flex", justifyContent: "flex-end", gap: 8 };
const btnSecondaryExport = {
  minHeight: 36,
  padding: "0 14px",
  background: "#ffffff",
  color: "#27272a",
  border: "1px solid #d4d4d8",
  borderRadius: 2,
  fontFamily: "inherit",
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
};
const btnPrimaryExport = {
  minHeight: 36,
  padding: "0 14px",
  background: "#18181b",
  color: "#ffffff",
  border: "1px solid #18181b",
  borderRadius: 2,
  fontFamily: "inherit",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};
