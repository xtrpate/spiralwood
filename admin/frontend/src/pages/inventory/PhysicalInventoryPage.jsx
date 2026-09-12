import React, { useCallback, useEffect, useMemo, useState } from "react";
import api from "../../services/api";
import toast from "react-hot-toast";
import * as XLSX from "xlsx-js-style";
import {
  CheckCircle2,
  ClipboardCheck,
  FileDown,
  RefreshCw,
  Save,
  Search,
  XCircle,
} from "lucide-react";

const DECIMAL_UNITS = new Set(["meter", "kg", "liter", "gallon"]);
const EPSILON = 0.0000001;
const HISTORY_PAGE_SIZE = 20;

const EMPTY_HISTORY_FILTERS = {
  search: "",
  status: "",
  result: "",
  date_preset: "all_time",
  from: "",
  to: "",
  page: 1,
};

const formatQuantity = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return number.toLocaleString("en-PH", { maximumFractionDigits: 2 });
};

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

const formatDifference = (value, unit) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  const prefix = number > 0 ? "+" : "";
  return `${prefix}${formatQuantity(number)} ${unit || ""}`.trim();
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

const formatSpecification = (item = {}) => {
  const form =
    MATERIAL_FORM_LABELS[
      String(item.material_form_snapshot || "").trim().toLowerCase()
    ] || "";
  const length = formatDimension(item.length_mm_snapshot);
  const width = formatDimension(item.width_mm_snapshot);
  const thickness = formatDimension(item.thickness_mm_snapshot);

  if (length && width && thickness) {
    return `${form ? `${form} · ` : ""}${length} × ${width} × ${thickness} mm`;
  }

  const parts = [];
  if (form) parts.push(form);
  if (length) parts.push(`L ${length} mm`);
  if (width) parts.push(`W ${width} mm`);
  if (thickness) parts.push(`T ${thickness} mm`);
  return parts.join(" · ");
};

const allowsDecimal = (unit) =>
  DECIMAL_UNITS.has(String(unit || "").trim().toLowerCase());

const sanitizeCountInput = (value, unit) => {
  let next = String(value ?? "");
  if (allowsDecimal(unit)) {
    next = next.replace(/[^0-9.]/g, "");
    const firstDot = next.indexOf(".");
    if (firstDot !== -1) {
      const whole = next.slice(0, firstDot);
      const fraction = next
        .slice(firstDot + 1)
        .replace(/\./g, "")
        .slice(0, 2);
      next = `${whole}.${fraction}`;
    }
    return next;
  }
  return next.replace(/[^0-9]/g, "");
};

const getCountDifference = (item, countText) => {
  if (String(countText ?? "").trim() === "") return null;
  const count = Number(countText);
  if (!Number.isFinite(count)) return null;
  return Math.round((count - Number(item.system_quantity || 0)) * 100) / 100;
};

const statusLabel = (value) => {
  if (value === "draft") return "In progress";
  if (value === "completed") return "Completed";
  if (value === "cancelled") return "Cancelled";
  return value || "—";
};

const getStatusBadgeStyle = (value) => {
  if (value === "completed") {
    return {
      background: "#ecfdf5",
      color: "#166534",
      border: "1px solid #bbf7d0",
    };
  }
  if (value === "cancelled") {
    return {
      background: "#fafafa",
      color: "#52525b",
      border: "1px solid #d4d4d8",
    };
  }
  return {
    background: "#eff6ff",
    color: "#1d4ed8",
    border: "1px solid #bfdbfe",
  };
};

const getFinishedAt = (session = {}) =>
  session.completed_at || session.cancelled_at || null;

export default function PhysicalInventoryPage() {
  const [sessions, setSessions] = useState([]);
  const [activeSession, setActiveSession] = useState(null);
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState({});
  const [selectedIds, setSelectedIds] = useState([]);
  const [search, setSearch] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [startNotes, setStartNotes] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [historyDetail, setHistoryDetail] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyListLoading, setHistoryListLoading] = useState(false);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyFilters, setHistoryFilters] = useState(EMPTY_HISTORY_FILTERS);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportScope, setExportScope] = useState("filtered");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  const hydrateSession = useCallback((data) => {
    setActiveSession(data?.session || null);
    setItems(data?.items || []);
    setNotes(data?.session?.notes || "");
    const nextCounts = {};
    const nextSelectedIds = [];
    for (const item of data?.items || []) {
      if (item.physical_count !== null && item.physical_count !== undefined) {
        nextSelectedIds.push(item.id);
      }
      nextCounts[item.id] = {
        physical_count:
          item.physical_count === null || item.physical_count === undefined
            ? ""
            : String(item.physical_count),
        reason: item.reason || "",
      };
    }
    setCounts(nextCounts);
    setSelectedIds(nextSelectedIds);
  }, []);

  const loadSession = useCallback(
    async (sessionId) => {
      const { data } = await api.get(
        `/inventory/physical-inventory/sessions/${sessionId}`,
      );
      hydrateSession(data);
      return data;
    },
    [hydrateSession],
  );

  const clearActiveSession = useCallback(() => {
    setActiveSession(null);
    setItems([]);
    setCounts({});
    setSelectedIds([]);
    setNotes("");
  }, []);

  const loadActiveSession = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/inventory/physical-inventory/sessions", {
        params: { limit: 1 },
      });
      const draft = data?.active_session || null;
      if (draft) {
        await loadSession(draft.id);
      } else {
        clearActiveSession();
      }
    } finally {
      setLoading(false);
    }
  }, [clearActiveSession, loadSession]);

  const loadHistory = useCallback(async () => {
    setHistoryListLoading(true);
    try {
      const { data } = await api.get("/inventory/physical-inventory/sessions", {
        params: {
          search: historyFilters.search,
          status: historyFilters.status,
          result: historyFilters.result,
          from: historyFilters.from,
          to: historyFilters.to,
          page: historyFilters.page,
          limit: HISTORY_PAGE_SIZE,
        },
      });
      setSessions(data.rows || []);
      setHistoryTotal(Number(data.total || 0));
    } finally {
      setHistoryListLoading(false);
    }
  }, [historyFilters]);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadActiveSession(), loadHistory()]);
  }, [loadActiveSession, loadHistory]);

  useEffect(() => {
    loadActiveSession();
  }, [loadActiveSession]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const historyPageCount = Math.max(
    1,
    Math.ceil(historyTotal / HISTORY_PAGE_SIZE),
  );

  const updateHistoryFilter = (key, value) => {
    setHistoryFilters((current) => ({
      ...current,
      [key]: value,
      page: 1,
    }));
  };

  const resetHistoryFilters = () => {
    setHistoryFilters(EMPTY_HISTORY_FILTERS);
  };

  const handleHistoryDatePreset = (preset) => {
    const localToday = new Date();
    localToday.setMinutes(
      localToday.getMinutes() - localToday.getTimezoneOffset(),
    );
    let from = "";
    let to = "";

    if (preset === "today") {
      from = localToday.toISOString().slice(0, 10);
      to = from;
    } else if (preset === "last_7_days") {
      const startDate = new Date(localToday);
      startDate.setDate(startDate.getDate() - 6);
      from = startDate.toISOString().slice(0, 10);
      to = localToday.toISOString().slice(0, 10);
    } else if (preset === "last_30_days") {
      const startDate = new Date(localToday);
      startDate.setDate(startDate.getDate() - 29);
      from = startDate.toISOString().slice(0, 10);
      to = localToday.toISOString().slice(0, 10);
    }

    setHistoryFilters((current) => ({
      ...current,
      date_preset: preset,
      from,
      to,
      page: 1,
    }));
  };

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const summary = useMemo(() => {
    let differences = 0;
    let blocked = 0;

    for (const item of items) {
      if (!selectedSet.has(item.id)) continue;
      const entry = counts[item.id] || {};
      const countText = String(entry.physical_count ?? "").trim();
      const difference = getCountDifference(item, countText);
      if (difference !== null && Math.abs(difference) > EPSILON) {
        differences += 1;
      }
      if (
        countText !== "" &&
        Number(countText) + EPSILON < Number(item.current_reserved_quantity || 0)
      ) {
        blocked += 1;
      }
    }

    return {
      total: items.length,
      counted: selectedIds.length,
      remaining: Math.max(0, items.length - selectedIds.length),
      differences,
      blocked,
    };
  }, [items, counts, selectedIds, selectedSet]);
  const filteredItems = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((item) => {
      const text = [
        item.material_name_snapshot,
        item.unit_snapshot,
        formatSpecification(item),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return text.includes(needle);
    });
  }, [items, search]);

  const allShownSelected =
    filteredItems.length > 0 &&
    filteredItems.every((item) => selectedSet.has(item.id));

  const toggleItemSelection = (item, checked) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(item.id);
      else next.delete(item.id);
      return [...next];
    });

    setCounts((current) => ({
      ...current,
      [item.id]: checked
        ? {
            ...(current[item.id] || {}),
            physical_count:
              String(current[item.id]?.physical_count ?? "").trim() === ""
                ? String(item.system_quantity ?? 0)
                : current[item.id].physical_count,
            reason: current[item.id]?.reason || "",
          }
        : { physical_count: "", reason: "" },
    }));
  };

  const toggleAllShown = (checked) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const item of filteredItems) {
        if (checked) next.add(item.id);
        else next.delete(item.id);
      }
      return [...next];
    });
    setCounts((current) => {
      const next = { ...current };
      for (const item of filteredItems) {
        if (checked) {
          next[item.id] = {
            ...(next[item.id] || {}),
            physical_count:
              String(next[item.id]?.physical_count ?? "").trim() === ""
                ? String(item.system_quantity ?? 0)
                : next[item.id].physical_count,
            reason: next[item.id]?.reason || "",
          };
        } else {
          next[item.id] = { physical_count: "", reason: "" };
        }
      }
      return next;
    });
  };
  const buildPayloadItems = () =>
    items.map((item) => ({
      item_id: item.id,
      physical_count: selectedSet.has(item.id)
        ? String(counts[item.id]?.physical_count ?? "").trim() === ""
          ? null
          : Number(counts[item.id].physical_count)
        : null,
      reason: selectedSet.has(item.id)
        ? String(counts[item.id]?.reason || "").trim() || null
        : null,
    }));
  const validateBeforeFinalize = () => {
    if (selectedIds.length === 0) {
      toast.error("Select at least one raw material to reconcile.");
      return false;
    }

    const missingReason = [];
    const invalidReserved = [];

    for (const item of items) {
      if (!selectedSet.has(item.id)) continue;
      const entry = counts[item.id] || {};
      const countText = String(entry.physical_count ?? "").trim();
      if (!countText) {
        toast.error(`Enter a physical count for ${item.material_name_snapshot}.`);
        return false;
      }

      const count = Number(countText);
      if (!Number.isFinite(count) || count < 0) {
        toast.error(`Invalid physical count for ${item.material_name_snapshot}.`);
        return false;
      }
      if (!allowsDecimal(item.unit_snapshot) && !Number.isInteger(count)) {
        toast.error(
          `${item.material_name_snapshot} must use a whole-number count.`,
        );
        return false;
      }

      const difference = getCountDifference(item, countText);
      if (
        difference !== null &&
        Math.abs(difference) > EPSILON &&
        !String(entry.reason || "").trim()
      ) {
        missingReason.push(item);
      }

      if (count + EPSILON < Number(item.current_reserved_quantity || 0)) {
        invalidReserved.push(item);
      }
    }

    if (missingReason.length > 0) {
      toast.error(
        `Add a reason to every difference. ${missingReason.length} item${missingReason.length === 1 ? " needs" : "s need"} a reason.`,
      );
      return false;
    }
    if (invalidReserved.length > 0) {
      toast.error(
        `Physical count cannot be lower than active Blueprint reservations for ${invalidReserved.length} item${invalidReserved.length === 1 ? "" : "s"}.`,
      );
      return false;
    }
    return true;
  };


  const handleStart = async () => {
    setStarting(true);
    try {
      const { data } = await api.post("/inventory/physical-inventory/sessions", {
        notes: startNotes.trim() || null,
      });
      toast.success(data?.message || "Physical inventory count started.");
      setStartOpen(false);
      setStartNotes("");
      await refreshAll();
    } catch (error) {
      // Global API interceptor displays server message.
    } finally {
      setStarting(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!activeSession) return;
    setSaving(true);
    try {
      const { data } = await api.put(
        `/inventory/physical-inventory/sessions/${activeSession.id}`,
        {
          notes: notes.trim() || null,
          items: buildPayloadItems(),
        },
      );
      toast.success(data?.message || "Draft saved.");
      await loadSession(activeSession.id);
      await loadHistory();
    } catch (error) {
      // Global API interceptor displays server message.
    } finally {
      setSaving(false);
    }
  };

  const handleFinalize = async () => {
    if (!activeSession || !validateBeforeFinalize()) return;

    const confirmed = window.confirm(
      `Finalize ${activeSession.reference_code} for ${selectedIds.length} selected material${selectedIds.length === 1 ? "" : "s"}? Only selected rows will be reconciled. Stock Movements are created only for differences.`,
    );
    if (!confirmed) return;

    setFinalizing(true);
    try {
      const { data } = await api.post(
        `/inventory/physical-inventory/sessions/${activeSession.id}/finalize`,
        {
          notes: notes.trim() || null,
          items: buildPayloadItems(),
        },
      );
      toast.success(data?.message || "Physical inventory finalized.");
      setActiveSession(null);
      setItems([]);
      setCounts({});
      setSelectedIds([]);
      await refreshAll();
    } catch (error) {
      // Global API interceptor displays server message.
    } finally {
      setFinalizing(false);
    }
  };

  const handleCancel = async () => {
    if (!activeSession) return;
    if (!cancelReason.trim()) {
      toast.error("Cancellation reason is required.");
      return;
    }

    setSaving(true);
    try {
      const { data } = await api.post(
        `/inventory/physical-inventory/sessions/${activeSession.id}/cancel`,
        { reason: cancelReason.trim() },
      );
      toast.success(data?.message || "Physical inventory count cancelled.");
      setCancelOpen(false);
      setCancelReason("");
      setActiveSession(null);
      setItems([]);
      setCounts({});
      setSelectedIds([]);
      await refreshAll();
    } catch (error) {
      // Global API interceptor displays server message.
    } finally {
      setSaving(false);
    }
  };

  const openHistory = async (sessionId) => {
    setHistoryLoading(true);
    try {
      const { data } = await api.get(
        `/inventory/physical-inventory/sessions/${sessionId}`,
      );
      setHistoryDetail(data);
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleExportReport = async () => {
    setExporting(true);
    try {
      const params =
        exportScope === "filtered"
          ? {
              search: historyFilters.search,
              status: historyFilters.status,
              result: historyFilters.result,
              from: historyFilters.from,
              to: historyFilters.to,
            }
          : {};

      const { data } = await api.get("/inventory/physical-inventory/report", {
        params,
      });
      const reportSessions = data.sessions || [];
      const reportItems = data.items || [];

      if (reportSessions.length === 0) {
        toast.error("No physical inventory records found to export.");
        return;
      }

      const workbook = XLSX.utils.book_new();
      const headerStyle = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "18181B" } },
        alignment: { vertical: "center" },
      };

      const summaryRows = [
        [
          {
            v: "PHYSICAL INVENTORY HISTORY REPORT",
            s: { font: { bold: true, sz: 14 } },
          },
        ],
        [],
        [
          "Reference",
          "Status",
          "Counted",
          "Materials",
          "Differences",
          "Started By",
          "Started",
          "Finished",
          "Session Notes",
          "Cancellation Reason",
        ].map((value) => ({ v: value, s: headerStyle })),
      ];

      for (const session of reportSessions) {
        summaryRows.push([
          session.reference_code || "—",
          statusLabel(session.status),
          Number(session.counted_count || 0),
          Number(session.item_count || 0),
          Number(session.difference_count || 0),
          session.started_by_name || "—",
          session.started_at
            ? new Date(session.started_at).toLocaleString("en-PH")
            : "—",
          getFinishedAt(session)
            ? new Date(getFinishedAt(session)).toLocaleString("en-PH")
            : "—",
          session.notes || "—",
          session.cancel_reason || "—",
        ]);
      }

      const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
      summarySheet["!cols"] = [
        { wch: 24 },
        { wch: 14 },
        { wch: 10 },
        { wch: 10 },
        { wch: 12 },
        { wch: 22 },
        { wch: 22 },
        { wch: 22 },
        { wch: 36 },
        { wch: 36 },
      ];
      XLSX.utils.book_append_sheet(workbook, summarySheet, "Sessions");

      const detailRows = [
        [
          {
            v: "PHYSICAL INVENTORY COUNT DETAILS",
            s: { font: { bold: true, sz: 14 } },
          },
        ],
        [],
        [
          "Reference",
          "Status",
          "Material",
          "Specification",
          "Unit",
          "System Qty",
          "Physical Qty",
          "Difference",
          "Reason",
          "Stock Movement",
        ].map((value) => ({ v: value, s: headerStyle })),
      ];

      for (const item of reportItems) {
        detailRows.push([
          item.reference_code || "—",
          statusLabel(item.session_status),
          item.material_name_snapshot || "—",
          formatSpecification(item) || "—",
          item.unit_snapshot || "—",
          Number(item.system_quantity || 0),
          item.physical_count === null || item.physical_count === undefined
            ? "—"
            : Number(item.physical_count),
          item.difference_quantity === null ||
          item.difference_quantity === undefined
            ? "—"
            : Number(item.difference_quantity),
          item.reason || "—",
          item.stock_movement_id
            ? item.movement_reference || `#${item.stock_movement_id}`
            : "No adjustment",
        ]);
      }

      const detailSheet = XLSX.utils.aoa_to_sheet(detailRows);
      detailSheet["!cols"] = [
        { wch: 24 },
        { wch: 14 },
        { wch: 34 },
        { wch: 34 },
        { wch: 12 },
        { wch: 14 },
        { wch: 14 },
        { wch: 14 },
        { wch: 42 },
        { wch: 32 },
      ];
      XLSX.utils.book_append_sheet(workbook, detailSheet, "Count Details");

      XLSX.writeFile(
        workbook,
        `Physical-Inventory-Report-${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
      toast.success("Physical Inventory Excel report exported.");
      setExportOpen(false);
    } catch (error) {
      // Global API interceptor displays server errors when available.
      if (!error?.response) {
        toast.error("Failed to export Physical Inventory report.");
      }
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <div style={header}>
        <div>
          <h1 style={title}>Physical Inventory</h1>
          <p style={subtitle}>
            Select only the materials you are counting, then enter the actual
            warehouse quantity. Unselected rows stay unchanged. Differences
            require a reason and are recorded as traceable stock adjustments.
          </p>
        </div>

        <div style={headerActions}>
          <button onClick={refreshAll} disabled={loading} style={btnSecondary}>
            <RefreshCw size={14} />
            Refresh
          </button>
          {!activeSession && (
            <button onClick={() => setStartOpen(true)} style={btnPrimary}>
              <ClipboardCheck size={14} />
              Start physical count
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div style={emptyCard}>Loading physical inventory...</div>
      ) : activeSession ? (
        <>
          <div style={sessionCard}>
            <div>
              <div style={eyebrow}>Active count</div>
              <div style={sessionReference}>{activeSession.reference_code}</div>
              <div style={sessionMeta}>
                Started by {activeSession.started_by_name || "Administrator"} ·{" "}
                {formatDateTime(activeSession.started_at)}
              </div>
            </div>
            <span style={statusDraft}>In progress</span>
          </div>

          <div style={summaryGrid}>
            {[
              ["Materials", summary.total],
              ["Selected", summary.counted],
              ["Not selected", summary.remaining],
              ["Differences", summary.differences],
            ].map(([label, value]) => (
              <div key={label} style={summaryCard}>
                <div style={summaryLabel}>{label}</div>
                <div style={summaryValue}>
                  {Number(value || 0).toLocaleString("en-PH")}
                </div>
              </div>
            ))}
          </div>

          {(Number(activeSession.stock_changed_count || 0) > 0 ||
            items.some(
              (item) =>
                selectedSet.has(item.id) &&
                (Number(item.material_is_active) !== 1 ||
                  Math.abs(
                    Number(item.current_on_hand || 0) -
                      Number(item.system_quantity || 0),
                  ) > EPSILON),
            )) && (
            <div style={warningBox}>
              One or more selected material records changed after this count
              started. Finalization is protected by the backend and will not
              overwrite newer inventory. Refresh or start a fresh count before
              reconciling those selected rows.
            </div>
          )}

          <div style={toolbar}>
            <div style={searchWrap}>
              <Search size={14} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search material or specification"
                style={searchInput}
              />
            </div>
            <div style={toolbarMeta}>
              {filteredItems.length.toLocaleString("en-PH")} shown
            </div>
          </div>

          <div style={tableCard}>
            <table style={table}>
              <thead>
                <tr style={theadRow}>
                  <th style={{ ...th, width: 44, textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={allShownSelected}
                      onChange={(event) => toggleAllShown(event.target.checked)}
                      aria-label="Select all shown materials"
                    />
                  </th>
                  <th style={th}>Material</th>
                  <th style={th}>Unit</th>
                  <th style={th}>System Qty</th>
                  <th style={th}>Reserved</th>
                  <th style={th}>Physical Count</th>
                  <th style={th}>Difference</th>
                  <th style={th}>Reason</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => {
                  const entry = counts[item.id] || {
                    physical_count: "",
                    reason: "",
                  };
                  const difference = getCountDifference(
                    item,
                    entry.physical_count,
                  );
                  const selected = selectedSet.has(item.id);
                  const hasDifference =
                    selected && difference !== null && Math.abs(difference) > EPSILON;
                  const belowReserved =
                    String(entry.physical_count ?? "").trim() !== "" &&
                    Number(entry.physical_count) + EPSILON <
                      Number(item.current_reserved_quantity || 0);
                  const systemChanged =
                    Number(item.material_is_active) !== 1 ||
                    Math.abs(
                      Number(item.current_on_hand || 0) -
                        Number(item.system_quantity || 0),
                    ) > EPSILON;

                  return (
                    <tr
                      key={item.id}
                      style={{ ...tr, background: selected ? "#fff" : "#fafafa" }}
                    >
                      <td style={{ ...td, textAlign: "center", width: 44 }}>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={(event) =>
                            toggleItemSelection(item, event.target.checked)
                          }
                          aria-label={`Select ${item.material_name_snapshot}`}
                        />
                      </td>
                      <td style={{ ...td, minWidth: 220 }}>
                        <div style={itemName}>
                          {item.material_name_snapshot}
                        </div>
                        {formatSpecification(item) && (
                          <div style={itemMeta}>{formatSpecification(item)}</div>
                        )}
                        {systemChanged && (
                          <div style={changedMeta}>System stock changed</div>
                        )}
                      </td>
                      <td style={td}>{item.unit_snapshot || "—"}</td>
                      <td style={{ ...td, fontWeight: 600 }}>
                        {formatQuantity(item.system_quantity)}
                      </td>
                      <td style={td}>
                        {formatQuantity(item.current_reserved_quantity || 0)}
                      </td>
                      <td style={{ ...td, minWidth: 145 }}>
                        <input
                          value={entry.physical_count}
                          onChange={(event) => {
                            const next = sanitizeCountInput(
                              event.target.value,
                              item.unit_snapshot,
                            );
                            setCounts((current) => ({
                              ...current,
                              [item.id]: {
                                ...(current[item.id] || {}),
                                physical_count: next,
                              },
                            }));
                          }}
                          disabled={!selected}
                          inputMode={
                            allowsDecimal(item.unit_snapshot)
                              ? "decimal"
                              : "numeric"
                          }
                          placeholder={selected ? "Count" : "Select row first"}
                          style={{
                            ...countInput,
                            background: selected ? "#fff" : "#f4f4f5",
                            color: selected ? "#18181b" : "#a1a1aa",
                            borderColor: belowReserved ? "#dc2626" : "#d4d4d8",
                          }}
                        />
                        {belowReserved && (
                          <div style={errorMeta}>
                            Below reserved{" "}
                            {formatQuantity(item.current_reserved_quantity || 0)}
                          </div>
                        )}
                      </td>
                      <td
                        style={{
                          ...td,
                          fontWeight: 700,
                          color:
                            difference === null
                              ? "#71717a"
                              : Math.abs(difference) <= EPSILON
                                ? "#166534"
                                : difference > 0
                                  ? "#1d4ed8"
                                  : "#b42318",
                        }}
                      >
                        {difference === null
                          ? "—"
                          : formatDifference(difference, item.unit_snapshot)}
                      </td>
                      <td style={{ ...td, minWidth: 260 }}>
                        <input
                          value={entry.reason}
                          onChange={(event) =>
                            setCounts((current) => ({
                              ...current,
                              [item.id]: {
                                ...(current[item.id] || {}),
                                reason: event.target.value.slice(0, 500),
                              },
                            }))
                          }
                          disabled={!hasDifference}
                          placeholder={
                            hasDifference
                              ? "Required reason for difference"
                              : "No reason needed"
                          }
                          style={{
                            ...reasonInput,
                            background: hasDifference ? "#fff" : "#fafafa",
                            color: hasDifference ? "#18181b" : "#a1a1aa",
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div style={notesCard}>
            <label style={fieldLabel}>Session notes · Optional</label>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value.slice(0, 1000))}
              rows={3}
              placeholder="General notes about this physical inventory count"
              style={textarea}
            />
          </div>

          <div style={actionBar}>
            <button
              type="button"
              onClick={() => setCancelOpen(true)}
              disabled={saving || finalizing}
              style={btnDangerGhost}
            >
              <XCircle size={14} />
              Cancel count
            </button>
            <div style={rightActions}>
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={saving || finalizing}
                style={btnSecondary}
              >
                <Save size={14} />
                {saving ? "Saving..." : "Save draft"}
              </button>
              <button
                type="button"
                onClick={handleFinalize}
                disabled={saving || finalizing}
                style={btnPrimary}
              >
                <CheckCircle2 size={14} />
                {finalizing
                  ? "Finalizing..."
                  : `Finalize selected (${summary.counted})`}
              </button>
            </div>
          </div>
        </>
      ) : (
        <div style={emptyCard}>
          <ClipboardCheck size={28} />
          <div style={emptyTitle}>No physical count in progress</div>
          <div style={emptyText}>
            Start a new count to snapshot all active raw materials before
            entering the actual warehouse quantities.
          </div>
        </div>
      )}

      <div style={{ ...tableCard, marginTop: 18 }}>
        <div style={sectionHeader}>
          <div>
            <div style={sectionTitle}>Physical inventory history</div>
            <div style={sectionSubtitle}>
              Review count sessions, reconciliation results, and audit history.
            </div>
          </div>
          <button
            type="button"
            onClick={() => setExportOpen(true)}
            disabled={exporting}
            style={btnSecondary}
          >
            <FileDown size={14} />
            {exporting ? "Exporting..." : "Export Report"}
          </button>
        </div>

        <div style={historyFilterBar}>
          <div style={{ ...historyFilterField, flex: "1 1 280px" }}>
            <label style={historyFilterLabel}>Search</label>
            <div style={historySearchWrap}>
              <Search size={14} />
              <input
                value={historyFilters.search}
                onChange={(event) =>
                  updateHistoryFilter("search", event.target.value)
                }
                placeholder="Search PI reference"
                style={historySearchInput}
              />
            </div>
          </div>

          <div style={historyFilterField}>
            <label style={historyFilterLabel}>Status</label>
            <select
              value={historyFilters.status}
              onChange={(event) =>
                updateHistoryFilter("status", event.target.value)
              }
              style={historySelect}
            >
              <option value="">All statuses</option>
              <option value="draft">In progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <div style={historyFilterField}>
            <label style={historyFilterLabel}>Result</label>
            <select
              value={historyFilters.result}
              onChange={(event) =>
                updateHistoryFilter("result", event.target.value)
              }
              style={historySelect}
            >
              <option value="">All results</option>
              <option value="with_differences">With differences</option>
              <option value="no_differences">No differences</option>
            </select>
          </div>

          <div style={historyFilterField}>
            <label style={historyFilterLabel}>Date Range</label>
            <select
              value={historyFilters.date_preset}
              onChange={(event) =>
                handleHistoryDatePreset(event.target.value)
              }
              style={historySelect}
            >
              <option value="all_time">All Time</option>
              <option value="today">Today</option>
              <option value="last_7_days">Last 7 Days</option>
              <option value="last_30_days">Last 30 Days</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>

          {historyFilters.date_preset === "custom" && (
            <>
              <div style={historyFilterField}>
                <label style={historyFilterLabel}>From</label>
                <input
                  type="date"
                  value={historyFilters.from}
                  onChange={(event) =>
                    updateHistoryFilter("from", event.target.value)
                  }
                  style={historySelect}
                />
              </div>
              <div style={historyFilterField}>
                <label style={historyFilterLabel}>To</label>
                <input
                  type="date"
                  value={historyFilters.to}
                  onChange={(event) =>
                    updateHistoryFilter("to", event.target.value)
                  }
                  style={historySelect}
                />
              </div>
            </>
          )}

          <div style={{ ...historyFilterField, justifyContent: "flex-end" }}>
            <span style={{ ...historyFilterLabel, visibility: "hidden" }}>
              Action
            </span>
            <button
              type="button"
              onClick={resetHistoryFilters}
              style={btnSecondary}
            >
              Reset filters
            </button>
          </div>
        </div>

        <table style={table}>
          <thead>
            <tr style={theadRow}>
              <th style={th}>Reference</th>
              <th style={th}>Status</th>
              <th style={th}>Items</th>
              <th style={th}>Differences</th>
              <th style={th}>Started By</th>
              <th style={th}>Started</th>
              <th style={th}>Finished</th>
            </tr>
          </thead>
          <tbody>
            {historyListLoading ? (
              <tr>
                <td colSpan={7} style={emptyCell}>
                  Loading physical inventory history...
                </td>
              </tr>
            ) : sessions.length === 0 ? (
              <tr>
                <td colSpan={7} style={emptyCell}>
                  No physical inventory sessions found for the selected
                  filters.
                </td>
              </tr>
            ) : (
              sessions.map((session) => (
                <tr
                  key={session.id}
                  style={{ ...tr, cursor: "pointer" }}
                  onClick={() => {
                    if (session.status === "draft") {
                      loadSession(session.id);
                    } else {
                      openHistory(session.id);
                    }
                  }}
                >
                  <td style={{ ...td, fontWeight: 650 }}>
                    {session.reference_code}
                  </td>
                  <td style={td}>
                    <span
                      style={{
                        ...historyStatusBadge,
                        ...getStatusBadgeStyle(session.status),
                      }}
                    >
                      {statusLabel(session.status)}
                    </span>
                  </td>
                  <td style={td}>
                    {session.counted_count}/{session.item_count}
                  </td>
                  <td style={td}>{session.difference_count}</td>
                  <td style={td}>{session.started_by_name || "—"}</td>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>
                    {formatDateTime(session.started_at)}
                  </td>
                  <td style={{ ...td, whiteSpace: "nowrap" }}>
                    {formatDateTime(getFinishedAt(session))}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div style={historyPagination}>
          <div style={historyCountText}>
            Page {historyFilters.page} of {historyPageCount} ·{" "}
            {historyTotal.toLocaleString("en-PH")} session
            {historyTotal === 1 ? "" : "s"}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              disabled={historyFilters.page <= 1 || historyListLoading}
              onClick={() =>
                setHistoryFilters((current) => ({
                  ...current,
                  page: Math.max(1, current.page - 1),
                }))
              }
              style={
                historyFilters.page <= 1 || historyListLoading
                  ? btnDisabled
                  : btnSecondary
              }
            >
              Previous
            </button>
            <button
              type="button"
              disabled={
                historyFilters.page >= historyPageCount || historyListLoading
              }
              onClick={() =>
                setHistoryFilters((current) => ({
                  ...current,
                  page: Math.min(historyPageCount, current.page + 1),
                }))
              }
              style={
                historyFilters.page >= historyPageCount || historyListLoading
                  ? btnDisabled
                  : btnSecondary
              }
            >
              Next
            </button>
          </div>
        </div>
      </div>

      {exportOpen && (
        <div style={overlay}>
          <div style={{ ...modal, width: "min(540px, 100%)" }}>
            <div style={eyebrow}>Report Generation</div>
            <div style={modalTitle}>Export physical inventory history</div>
            <p style={modalText}>
              Create an Excel workbook with session history and detailed
              material counts.
            </p>

            <div style={exportScopeGrid}>
              <button
                type="button"
                onClick={() => setExportScope("filtered")}
                disabled={exporting}
                style={{
                  ...exportScopeOption,
                  ...(exportScope === "filtered"
                    ? exportScopeOptionSelected
                    : {}),
                }}
              >
                <span style={exportScopeTitle}>Current filters</span>
                <span style={exportScopeMeta}>
                  {historyTotal.toLocaleString("en-PH")} matching session
                  {historyTotal === 1 ? "" : "s"}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setExportScope("all")}
                disabled={exporting}
                style={{
                  ...exportScopeOption,
                  ...(exportScope === "all" ? exportScopeOptionSelected : {}),
                }}
              >
                <span style={exportScopeTitle}>All records</span>
                <span style={exportScopeMeta}>
                  Export the complete Physical Inventory history
                </span>
              </button>
            </div>

            <div style={exportInfoBox}>
              Excel includes a Sessions sheet and a Count Details sheet with
              system quantity, physical quantity, difference, reason, and linked
              Stock Movement.
            </div>

            <div style={modalActions}>
              <button
                type="button"
                onClick={() => setExportOpen(false)}
                disabled={exporting}
                style={btnSecondary}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExportReport}
                disabled={exporting}
                style={btnPrimary}
              >
                <FileDown size={14} />
                {exporting ? "Preparing..." : "Export Excel"}
              </button>
            </div>
          </div>
        </div>
      )}

      {startOpen && (
        <div style={overlay}>
          <div style={modal}>
            <div style={modalTitle}>Start physical count</div>
            <p style={modalText}>
              The system will snapshot every active raw material, including its
              current system quantity and reserved quantity. Only one physical
              count can be in progress at a time.
            </p>
            <label style={fieldLabel}>Session notes · Optional</label>
            <textarea
              value={startNotes}
              onChange={(event) =>
                setStartNotes(event.target.value.slice(0, 1000))
              }
              rows={3}
              style={textarea}
              placeholder="Example: September warehouse count"
            />
            <div style={modalActions}>
              <button
                type="button"
                onClick={() => {
                  setStartOpen(false);
                  setStartNotes("");
                }}
                style={btnSecondary}
                disabled={starting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStart}
                style={btnPrimary}
                disabled={starting}
              >
                {starting ? "Starting..." : "Start count"}
              </button>
            </div>
          </div>
        </div>
      )}

      {cancelOpen && (
        <div style={overlay}>
          <div style={modal}>
            <div style={modalTitle}>Cancel physical count</div>
            <p style={modalText}>
              No stock quantities will change. The cancelled session and reason
              will remain in history.
            </p>
            <label style={fieldLabel}>Cancellation reason *</label>
            <textarea
              value={cancelReason}
              onChange={(event) =>
                setCancelReason(event.target.value.slice(0, 500))
              }
              rows={3}
              style={textarea}
              placeholder="Why is this count being cancelled?"
            />
            <div style={modalActions}>
              <button
                type="button"
                onClick={() => {
                  setCancelOpen(false);
                  setCancelReason("");
                }}
                style={btnSecondary}
                disabled={saving}
              >
                Keep count
              </button>
              <button
                type="button"
                onClick={handleCancel}
                style={btnDanger}
                disabled={saving}
              >
                {saving ? "Cancelling..." : "Cancel count"}
              </button>
            </div>
          </div>
        </div>
      )}

      {(historyDetail || historyLoading) && (
        <div style={overlay}>
          <div style={{ ...modal, width: "min(980px, 96vw)" }}>
            {historyLoading && !historyDetail ? (
              <div style={emptyCell}>Loading history...</div>
            ) : (
              <>
                <div style={historyHeader}>
                  <div>
                    <div style={eyebrow}>Physical inventory record</div>
                    <div style={modalTitle}>
                      {historyDetail?.session?.reference_code}
                    </div>
                    <div style={sessionMeta}>
                      {statusLabel(historyDetail?.session?.status)} · Started{" "}
                      {formatDateTime(historyDetail?.session?.started_at)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setHistoryDetail(null)}
                    style={btnSecondary}
                  >
                    Close
                  </button>
                </div>
                <div style={{ ...tableCard, maxHeight: "58vh" }}>
                  <table style={table}>
                    <thead>
                      <tr style={theadRow}>
                        <th style={th}>Material</th>
                        <th style={th}>System</th>
                        <th style={th}>Physical</th>
                        <th style={th}>Difference</th>
                        <th style={th}>Reason</th>
                        <th style={th}>Movement</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(historyDetail?.items || []).map((item) => (
                        <tr key={item.id} style={tr}>
                          <td style={{ ...td, minWidth: 200 }}>
                            <div style={itemName}>
                              {item.material_name_snapshot}
                            </div>
                            <div style={itemMeta}>
                              {formatSpecification(item)}
                            </div>
                          </td>
                          <td style={td}>
                            {formatQuantity(item.system_quantity)}{" "}
                            {item.unit_snapshot}
                          </td>
                          <td style={td}>
                            {item.physical_count === null
                              ? "—"
                              : `${formatQuantity(item.physical_count)} ${item.unit_snapshot}`}
                          </td>
                          <td style={td}>
                            {item.difference_quantity === null
                              ? "—"
                              : formatDifference(
                                  item.difference_quantity,
                                  item.unit_snapshot,
                                )}
                          </td>
                          <td style={{ ...td, minWidth: 240 }}>
                            {item.reason || "—"}
                          </td>
                          <td style={td}>
                            {item.stock_movement_id
                              ? `#${item.stock_movement_id}`
                              : "No adjustment"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {historyDetail?.session?.cancel_reason && (
                  <div style={warningBox}>
                    Cancellation reason:{" "}
                    {historyDetail.session.cancel_reason}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const header = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  marginBottom: 16,
};
const headerActions = { display: "flex", gap: 8, flexWrap: "wrap" };
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
const sessionCard = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
  padding: "14px 16px",
  marginBottom: 12,
  background: "#fff",
  border: "1px solid #e4e4e7",
  borderRadius: 2,
};
const eyebrow = {
  fontSize: 9.5,
  fontWeight: 700,
  color: "#71717a",
  letterSpacing: "0.09em",
  textTransform: "uppercase",
};
const sessionReference = {
  marginTop: 4,
  fontSize: 17,
  fontWeight: 700,
  color: "#18181b",
};
const sessionMeta = {
  marginTop: 4,
  fontSize: 11,
  color: "#71717a",
};
const statusDraft = {
  padding: "4px 8px",
  border: "1px solid #bfdbfe",
  background: "#eff6ff",
  color: "#1d4ed8",
  borderRadius: 2,
  fontSize: 10.5,
  fontWeight: 650,
};
const summaryGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(120px, 1fr))",
  gap: 10,
  marginBottom: 12,
};
const summaryCard = {
  padding: "12px 14px",
  background: "#fff",
  border: "1px solid #e4e4e7",
  borderRadius: 2,
};
const summaryLabel = {
  fontSize: 9.5,
  fontWeight: 650,
  color: "#71717a",
  letterSpacing: "0.07em",
  textTransform: "uppercase",
};
const summaryValue = {
  marginTop: 4,
  fontSize: 20,
  fontWeight: 700,
  color: "#18181b",
};
const warningBox = {
  marginBottom: 12,
  padding: "10px 12px",
  border: "1px solid #fed7aa",
  background: "#fff7ed",
  color: "#9a3412",
  borderRadius: 2,
  fontSize: 11.5,
  lineHeight: 1.45,
};
const toolbar = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: 10,
  background: "#fff",
  border: "1px solid #e4e4e7",
  borderBottom: "none",
};
const searchWrap = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  minWidth: 280,
  color: "#71717a",
};
const searchInput = {
  width: "100%",
  minHeight: 34,
  padding: "7px 9px",
  border: "1px solid #d4d4d8",
  borderRadius: 2,
  outline: "none",
  fontSize: 12,
};
const toolbarMeta = { fontSize: 11, color: "#71717a" };
const tableCard = {
  background: "#fff",
  border: "1px solid #e4e4e7",
  borderRadius: 2,
  overflow: "auto",
};
const table = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 12,
};
const theadRow = { background: "#fafafa" };
const th = {
  padding: "10px 12px",
  textAlign: "left",
  fontSize: 9.5,
  fontWeight: 650,
  color: "#71717a",
  textTransform: "uppercase",
  letterSpacing: "0.07em",
  whiteSpace: "nowrap",
};
const tr = { borderTop: "1px solid #f4f4f5" };
const td = {
  padding: "11px 12px",
  color: "#18181b",
  verticalAlign: "top",
};
const itemName = { fontWeight: 650, color: "#0a0a0a" };
const itemMeta = {
  marginTop: 3,
  fontSize: 10,
  color: "#71717a",
};
const changedMeta = {
  marginTop: 4,
  fontSize: 10,
  fontWeight: 650,
  color: "#b42318",
};
const errorMeta = {
  marginTop: 4,
  fontSize: 9.5,
  color: "#b42318",
};
const countInput = {
  width: 110,
  minHeight: 34,
  padding: "7px 9px",
  border: "1px solid #d4d4d8",
  borderRadius: 2,
  outline: "none",
  fontSize: 12,
};
const reasonInput = {
  width: "100%",
  minWidth: 230,
  minHeight: 34,
  padding: "7px 9px",
  border: "1px solid #d4d4d8",
  borderRadius: 2,
  outline: "none",
  fontSize: 11.5,
  boxSizing: "border-box",
};
const notesCard = {
  marginTop: 12,
  padding: 12,
  background: "#fff",
  border: "1px solid #e4e4e7",
  borderRadius: 2,
};
const fieldLabel = {
  display: "block",
  marginBottom: 6,
  fontSize: 11,
  fontWeight: 650,
  color: "#3f3f46",
};
const textarea = {
  width: "100%",
  padding: "9px 10px",
  border: "1px solid #d4d4d8",
  borderRadius: 2,
  fontFamily: "inherit",
  fontSize: 12,
  boxSizing: "border-box",
  resize: "vertical",
  outline: "none",
};
const actionBar = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  marginTop: 12,
};
const rightActions = { display: "flex", gap: 8 };
const baseButton = {
  minHeight: 36,
  padding: "8px 13px",
  borderRadius: 2,
  fontFamily: "inherit",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
};
const btnPrimary = {
  ...baseButton,
  background: "#18181b",
  color: "#fff",
  border: "1px solid #18181b",
};
const btnSecondary = {
  ...baseButton,
  background: "#fff",
  color: "#18181b",
  border: "1px solid #d4d4d8",
};
const btnDisabled = {
  ...btnSecondary,
  background: "#f4f4f5",
  color: "#a1a1aa",
  cursor: "not-allowed",
};
const btnDangerGhost = {
  ...baseButton,
  background: "#fff",
  color: "#b42318",
  border: "1px solid #fecaca",
};
const btnDanger = {
  ...baseButton,
  background: "#b42318",
  color: "#fff",
  border: "1px solid #b42318",
};
const emptyCard = {
  minHeight: 190,
  padding: 28,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: 10,
  textAlign: "center",
  background: "#fff",
  border: "1px solid #e4e4e7",
  borderRadius: 2,
  color: "#71717a",
};
const emptyTitle = { fontSize: 15, fontWeight: 700, color: "#18181b" };
const emptyText = {
  maxWidth: 520,
  fontSize: 12,
  lineHeight: 1.5,
  color: "#71717a",
};
const emptyCell = {
  padding: 28,
  textAlign: "center",
  color: "#71717a",
};
const sectionHeader = {
  padding: "12px 14px",
  borderBottom: "1px solid #e4e4e7",
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
};
const sectionTitle = { fontSize: 13.5, fontWeight: 650, color: "#18181b" };
const sectionSubtitle = { marginTop: 3, fontSize: 10.5, color: "#71717a" };
const historyFilterBar = {
  display: "flex",
  alignItems: "flex-end",
  gap: 10,
  flexWrap: "wrap",
  padding: 12,
  borderBottom: "1px solid #e4e4e7",
  background: "#fff",
};
const historyFilterField = {
  minWidth: 135,
  display: "flex",
  flexDirection: "column",
  gap: 5,
};
const historyFilterLabel = {
  fontSize: 9.5,
  fontWeight: 650,
  color: "#52525b",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};
const historySearchWrap = {
  minHeight: 36,
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "0 10px",
  border: "1px solid #d4d4d8",
  borderRadius: 2,
  background: "#fff",
  color: "#71717a",
};
const historySearchInput = {
  width: "100%",
  minWidth: 180,
  border: "none",
  outline: "none",
  fontFamily: "inherit",
  fontSize: 12,
  color: "#18181b",
};
const historySelect = {
  minHeight: 36,
  padding: "7px 10px",
  border: "1px solid #d4d4d8",
  borderRadius: 2,
  background: "#fff",
  color: "#18181b",
  fontFamily: "inherit",
  fontSize: 12,
  outline: "none",
};
const historyStatusBadge = {
  display: "inline-block",
  padding: "3px 8px",
  borderRadius: 2,
  fontSize: 10.5,
  fontWeight: 650,
  whiteSpace: "nowrap",
};
const historyPagination = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "12px 14px",
  borderTop: "1px solid #e4e4e7",
};
const historyCountText = {
  fontSize: 11,
  color: "#71717a",
};
const exportScopeGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 8,
  marginBottom: 12,
};
const exportScopeOption = {
  minHeight: 78,
  padding: "12px 13px",
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  justifyContent: "center",
  gap: 5,
  background: "#fff",
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
  fontWeight: 650,
};
const exportScopeMeta = {
  color: "#71717a",
  fontSize: 10.5,
  lineHeight: 1.35,
};
const exportInfoBox = {
  marginBottom: 16,
  padding: "10px 12px",
  background: "#fafafa",
  border: "1px solid #e4e4e7",
  borderRadius: 2,
  color: "#71717a",
  fontSize: 11.5,
  lineHeight: 1.45,
};
const overlay = {
  position: "fixed",
  inset: 0,
  zIndex: 1200,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  background: "rgba(0,0,0,.55)",
};
const modal = {
  width: "min(520px, 100%)",
  maxHeight: "90vh",
  overflowY: "auto",
  padding: 20,
  background: "#fff",
  border: "1px solid #d4d4d8",
  borderRadius: 2,
  boxShadow: "0 18px 48px rgba(0,0,0,.18)",
};
const modalTitle = { fontSize: 18, fontWeight: 700, color: "#18181b" };
const modalText = {
  margin: "8px 0 16px",
  fontSize: 12,
  lineHeight: 1.5,
  color: "#52525b",
};
const modalActions = {
  marginTop: 16,
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
};
const historyHeader = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  marginBottom: 14,
};
