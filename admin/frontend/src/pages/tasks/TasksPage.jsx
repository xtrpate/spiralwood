// src/pages/tasks/TasksPage.jsx
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../../services/api";
import toast from "react-hot-toast";
import useAuthStore from "../../store/authStore";

const PRIORITY_ROLES = [
  "Cabinet Maker",
  "Installer",
  "Quality Inspector",
  "Other",
];

const REQUIRED_PRODUCTION_ROLES = [
  "Cutting Machine",
  "Edge Banding",
  "Horizontal Drilling",
  "Retouching",
  "Packing",
];

const TASK_ROLE_FILTERS = [
  ...REQUIRED_PRODUCTION_ROLES,
  ...PRIORITY_ROLES.filter(
    (role) => !REQUIRED_PRODUCTION_ROLES.includes(role),
  ),
];

const STATUS_META = {
  pending: {
    label: "Pending",
    bg: "#fffbeb",
    color: "#a16207",
    border: "#fde68a",
  },
  in_progress: {
    label: "In progress",
    bg: "#eff6ff",
    color: "#1d4ed8",
    border: "#bfdbfe",
  },
  completed: {
    label: "Completed",
    bg: "#ecfdf5",
    color: "#15803d",
    border: "#bbf7d0",
  },
  blocked: {
    label: "On Hold",
    bg: "#fef2f2",
    color: "#b91c1c",
    border: "#fecaca",
  },
};

const ROLE_COLOR = {
  "Cabinet Maker": { bg: "#18181b", color: "#ffffff", border: "#18181b" },
  Installer: { bg: "#f4f4f5", color: "#18181b", border: "#e4e4e7" },
  "Quality Inspector": { bg: "#ffffff", color: "#52525b", border: "#d4d4d8" },
  Other: { bg: "#fafafa", color: "#71717a", border: "#e4e4e7" },
};

const BLANK = {
  title: "",
  description: "",
  assigned_to: "",
  task_role: "Other",
  due_date: "",
  order_id: "",
  blueprint_id: "",
};

const PRODUCTION_ASSIGN_BLANK = {
  staff_id: "",
  due_date: "",
  note: "",
};

const PRODUCTION_STATUS_META = {
  pending: {
    label: "Assigned",
    bg: "#fffbeb",
    color: "#a16207",
    border: "#fde68a",
  },
  in_progress: {
    label: "In Production",
    bg: "#eff6ff",
    color: "#1d4ed8",
    border: "#bfdbfe",
  },
  blocked: {
    label: "On Hold",
    bg: "#fef2f2",
    color: "#b91c1c",
    border: "#fecaca",
  },
  completed: {
    label: "Completed",
    bg: "#ecfdf5",
    color: "#15803d",
    border: "#bbf7d0",
  },
};

const normalizeProductionKey = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

const productionTime = (value) => {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

const buildProductionOrderGroups = (taskList = []) => {
  const requiredKeys = new Set(REQUIRED_PRODUCTION_ROLES.map(normalizeProductionKey));
  const buckets = new Map();

  taskList.forEach((task) => {
    if (!requiredKeys.has(normalizeProductionKey(task?.task_role))) return;
    if (!task?.order_id && !task?.order_number) return;

    const key = task.order_id
      ? `order:${task.order_id}`
      : `number:${task.order_number}`;

    if (!buckets.has(key)) {
      buckets.set(key, {
        key,
        orderId: task.order_id || null,
        orderNumber: task.order_number || "",
        customerName: task.customer_name || "Walk-in Customer",
        rawTasks: [],
      });
    }

    const bucket = buckets.get(key);
    bucket.rawTasks.push(task);
    if (!bucket.orderId && task.order_id) bucket.orderId = task.order_id;
    if (!bucket.orderNumber && task.order_number) bucket.orderNumber = task.order_number;
    if (task.customer_name) bucket.customerName = task.customer_name;
  });

  return Array.from(buckets.values())
    .map((order) => {
      const steps = REQUIRED_PRODUCTION_ROLES.map((stepLabel) => {
        const task =
          order.rawTasks.find(
            (row) =>
              normalizeProductionKey(row?.task_role) ===
              normalizeProductionKey(stepLabel),
          ) || null;
        return {
          stepLabel,
          task,
          status: normalizeProductionKey(task?.status || "pending"),
        };
      });

      const completedCount = steps.filter(
        (step) => step.status === "completed" && step.task,
      ).length;
      const complete =
        completedCount === REQUIRED_PRODUCTION_ROLES.length &&
        steps.every((step) => Boolean(step.task));
      const onHold = steps.some((step) => step.status === "blocked");
      const hasStarted = steps.some((step) =>
        ["in_progress", "blocked", "completed"].includes(step.status),
      );
      const hasInProgress = steps.some((step) => step.status === "in_progress");

      let overallStatus = "pending";
      if (complete) overallStatus = "completed";
      else if (onHold) overallStatus = "blocked";
      else if (hasInProgress || hasStarted) overallStatus = "in_progress";

      const unfinishedTasks = steps
        .filter((step) => step.task && step.status !== "completed")
        .map((step) => step.task);
      const currentTasks = unfinishedTasks.length
        ? unfinishedTasks
        : steps.filter((step) => step.task).map((step) => step.task);

      const currentStaff = Array.from(
        new Map(
          currentTasks
            .filter((task) => task.assigned_to)
            .map((task) => [
              String(task.assigned_to),
              {
                id: String(task.assigned_to),
                name: task.assigned_to_name || "Assigned staff",
              },
            ]),
        ).values(),
      );

      const assignedTimes = order.rawTasks
        .map((task) => productionTime(task.created_at))
        .filter(Boolean);
      const startedTimes = order.rawTasks
        .map((task) => productionTime(task.accepted_at))
        .filter(Boolean);
      const dueTimes = unfinishedTasks
        .map((task) => productionTime(task.due_date))
        .filter(Boolean);
      const fallbackDueTimes = order.rawTasks
        .map((task) => productionTime(task.due_date))
        .filter(Boolean);
      const completedTimes = order.rawTasks
        .map((task) => productionTime(task.completed_at))
        .filter(Boolean);
      const latestTimes = order.rawTasks
        .flatMap((task) => [
          productionTime(task.updated_at),
          productionTime(task.created_at),
        ])
        .filter(Boolean);

      const assignedAt = assignedTimes.length ? Math.min(...assignedTimes) : 0;
      const startedAt = startedTimes.length ? Math.min(...startedTimes) : 0;
      const dueAt = dueTimes.length
        ? Math.min(...dueTimes)
        : fallbackDueTimes.length
          ? Math.max(...fallbackDueTimes)
          : 0;
      const completedAt = completedTimes.length ? Math.max(...completedTimes) : 0;
      const latestAt = latestTimes.length ? Math.max(...latestTimes) : 0;
      const overdue = Boolean(!complete && dueAt && dueAt < Date.now());

      return {
        ...order,
        steps,
        completedCount,
        complete,
        overdue,
        overallStatus,
        currentStaff,
        currentStaffLabel:
          currentStaff.map((person) => person.name).join(", ") || "Not assigned",
        assignedAt: assignedAt ? new Date(assignedAt).toISOString() : null,
        startedAt: startedAt ? new Date(startedAt).toISOString() : null,
        dueDate: dueAt ? new Date(dueAt).toISOString() : null,
        completedAt: completedAt ? new Date(completedAt).toISOString() : null,
        latestAt,
      };
    })
    .sort((a, b) => b.latestAt - a.latestAt || Number(b.orderId || 0) - Number(a.orderId || 0));
};

export default function TasksPage() {
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);
  const { user: me } = useAuthStore();
  const isAdmin = me?.role === "admin";
  const navigate = useNavigate();

  const [tasks, setTasks] = useState([]);
  const [staff, setStaff] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [target, setTarget] = useState(null);
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterRole, setFilterRole] = useState("all");
  const [filterStaff, setFilterStaff] = useState("all");
  const [dueFrom, setDueFrom] = useState("");
  const [dueTo, setDueTo] = useState("");
  const [detailsOrderKey, setDetailsOrderKey] = useState(null);
  const [search, setSearch] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const [focusedTaskId, setFocusedTaskId] = useState(null);
  const [productionAssignModal, setProductionAssignModal] = useState(false);
  const [productionOrderPickerOpen, setProductionOrderPickerOpen] =
    useState(false);
  const [productionOrderSelection, setProductionOrderSelection] = useState("");
  const [productionOrderId, setProductionOrderId] = useState(null);
  const [productionBlueprintId, setProductionBlueprintId] = useState(null);
  const [productionAssignableStaff, setProductionAssignableStaff] = useState(
    [],
  );
  const [productionAssignLoading, setProductionAssignLoading] = useState(false);
  const [productionAssigning, setProductionAssigning] = useState(false);
  const [productionAssignForm, setProductionAssignForm] = useState(
    PRODUCTION_ASSIGN_BLANK,
  );
  const assignmentOrderIdParam = searchParams.get("assign_order_id");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: t } = await api.get("/tasks");
      setTasks(t);
      if (isAdmin) {
        const [{ data: s }, { data: o }] = await Promise.all([
          api.get("/tasks/staff-list"),
          api.get("/tasks/orders-list"),
        ]);
        setStaff(s);
        setOrders(o);
      }
    } catch {
      toast.error("Failed to load tasks.");
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setForm(BLANK);
    setTarget(null);
    setModal("create");
  };
  const toPhilippineDateTimeLocal = (isoString) => {
    if (!isoString) return "";
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return "";
    const ph = new Date(date.getTime() + 8 * 60 * 60 * 1000);
    const yyyy = ph.getUTCFullYear();
    const mm = String(ph.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(ph.getUTCDate()).padStart(2, "0");
    const hh = String(ph.getUTCHours()).padStart(2, "0");
    const mi = String(ph.getUTCMinutes()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  };
  const openEdit = (t) => {
    setForm({
      title: t.title,
      description: t.description || "",
      assigned_to: String(t.assigned_to || ""),
      task_role: t.task_role,
      due_date: toPhilippineDateTimeLocal(t.due_date),
      order_id: t.order_id ? String(t.order_id) : "",
      blueprint_id: t.blueprint_id ? String(t.blueprint_id) : "",
      status: t.status,
    });
    setTarget(t);
    setModal("edit");
  };
  const openView = (t) => {
    setTarget(t);
    setModal("view");
  };

  const openProductionOrderPicker = () => {
    setProductionOrderSelection("");
    setProductionOrderPickerOpen(true);
  };

  const closeProductionOrderPicker = () => {
    setProductionOrderPickerOpen(false);
    setProductionOrderSelection("");
  };

  const startProductionAssignment = () => {
    const orderId = Number(productionOrderSelection);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      toast.error("Please select a blueprint production order.");
      return;
    }

    const next = new URLSearchParams(searchParams);
    next.set("assign_order_id", String(orderId));
    setSearchParams(next);
    closeProductionOrderPicker();
  };

  const clearProductionAssignmentParam = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("assign_order_id");
    setSearchParams(next, { replace: true });
  };

  const closeProductionAssignModal = () => {
    setProductionAssignModal(false);
    setProductionOrderId(null);
    setProductionBlueprintId(null);
    setProductionAssignableStaff([]);
    setProductionAssignForm(PRODUCTION_ASSIGN_BLANK);
    clearProductionAssignmentParam();
  };

  useEffect(() => {
    if (!assignmentOrderIdParam || !me) return;

    if (!isAdmin) {
      toast.error("Only administrators can assign production staff.");
      clearProductionAssignmentParam();
      return;
    }

    const orderId = Number(assignmentOrderIdParam);
    if (!Number.isInteger(orderId) || orderId <= 0) {
      toast.error("Invalid production order assignment request.");
      clearProductionAssignmentParam();
      return;
    }

    let cancelled = false;

    const loadProductionAssignment = async () => {
      setProductionAssignModal(true);
      setProductionAssignLoading(true);
      setProductionOrderId(orderId);
      setProductionBlueprintId(null);
      setProductionAssignableStaff([]);
      setProductionAssignForm(PRODUCTION_ASSIGN_BLANK);

      try {
        const { data } = await api.get(`/orders/${orderId}/assignable-staff`);
        if (cancelled) return;

        setProductionBlueprintId(data?.blueprint_id || null);
        setProductionAssignableStaff(
          Array.isArray(data?.staff) ? data.staff : [],
        );
      } catch (err) {
        if (cancelled) return;
        toast.error(
          err?.response?.data?.message ||
            "Failed to load staff for this production order.",
        );
        setProductionAssignModal(false);
        setProductionOrderId(null);
        clearProductionAssignmentParam();
      } finally {
        if (!cancelled) setProductionAssignLoading(false);
      }
    };

    loadProductionAssignment();

    return () => {
      cancelled = true;
    };
  }, [assignmentOrderIdParam, isAdmin, me?.id]);

  const handleProductionAssign = async (e) => {
    e.preventDefault();

    if (!productionOrderId) {
      toast.error("Production order is missing.");
      return;
    }

    if (!productionAssignForm.staff_id) {
      toast.error("Please select an indoor staff member.");
      return;
    }

    if (!productionAssignForm.due_date) {
      toast.error("Due date is required.");
      return;
    }

    const parsedDueDate = new Date(productionAssignForm.due_date);
    if (Number.isNaN(parsedDueDate.getTime())) {
      toast.error("Due date is invalid.");
      return;
    }

    if (parsedDueDate.getTime() < Date.now() - 60000) {
      toast.error("Due date cannot be in the past.");
      return;
    }

    setProductionAssigning(true);
    try {
      const payload = {
        staff_id: Number(productionAssignForm.staff_id),
        due_date: `${productionAssignForm.due_date.replace("T", " ")}:00`,
        note: productionAssignForm.note.trim(),
      };

      const { data } = await api.patch(
        `/orders/${productionOrderId}/assign-staff`,
        payload,
      );

      toast.success(
        data?.message || "Indoor staff assigned to production successfully.",
      );

      const matchedOrder = orders.find(
        (item) => Number(item.id) === Number(productionOrderId),
      );
      setFilterStatus("all");
      setFilterRole("all");
      setSearch(matchedOrder?.order_number || "");
      closeProductionAssignModal();
      await load();
    } catch (err) {
      toast.error(
        err?.response?.data?.message || "Failed to assign production staff.",
      );
    } finally {
      setProductionAssigning(false);
    }
  };


  const productionOrderGroups = useMemo(
    () => buildProductionOrderGroups(tasks),
    [tasks],
  );

  // Notification navigation focus support: opens the containing production
  // order instead of exposing an individual step in the main list.
  useEffect(() => {
    const focusId = searchParams.get("focus_task_id");
    if (!focusId || loading) return;

    const numericId = Number(focusId);
    const matchedOrder = productionOrderGroups.find((order) =>
      order.rawTasks.some((task) => Number(task.id) === numericId),
    );

    if (!matchedOrder) {
      toast.error("That task could not be found. It may have been removed.");
      const next = new URLSearchParams(searchParams);
      next.delete("focus_task_id");
      setSearchParams(next, { replace: true });
      return;
    }

    setFilterStatus("all");
    setFilterRole("all");
    setFilterStaff("all");
    setDueFrom("");
    setDueTo("");
    setSearch("");
    setFocusedTaskId(numericId);
    setDetailsOrderKey(matchedOrder.key);

    const scrollTimer = setTimeout(() => {
      document
        .getElementById(
          `production-order-${matchedOrder.orderId || matchedOrder.key}`,
        )
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);

    const highlightTimer = setTimeout(() => setFocusedTaskId(null), 4000);

    const next = new URLSearchParams(searchParams);
    next.delete("focus_task_id");
    setSearchParams(next, { replace: true });

    return () => {
      clearTimeout(scrollTimer);
      clearTimeout(highlightTimer);
    };
  }, [searchParams, loading, productionOrderGroups, setSearchParams]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        order_id: form.order_id || null,
        blueprint_id: form.blueprint_id || null,
      };
      if (modal === "create") {
        await api.post("/tasks", payload);
        toast.success("Task assigned! Staff has been notified.");
      } else {
        const { data } = await api.put(`/tasks/${target.id}`, payload);
        toast.success(data?.message || "Task updated.");
      }
      setModal(null);
      load();
    } catch (err) {
      if (err.response?.status === 404) {
        toast.error(err.response?.data?.message || "Task not found.");
      }
    } finally {
      setSaving(false);
    }
  };

  const handleStatusUpdate = async (taskId, status) => {
    try {
      await api.put(`/tasks/${taskId}/status`, { status });
      toast.success(`Marked as ${STATUS_META[status]?.label || status}.`);
      load();
    } catch {
      toast.error("Failed to update status.");
    }
  };

  const handleDelete = async (taskId) => {
    if (!window.confirm("Delete this task? This cannot be undone.")) return;
    try {
      await api.delete(`/tasks/${taskId}`);
      toast.success("Task deleted.");
      load();
    } catch (err) {
      if (err.response?.status === 404) {
        toast.error(err.response?.data?.message || "Task not found.");
      }
    }
  };

  // Order-level production filters. Five required task rows remain available
  // inside Details but are intentionally not repeated in the main list.
  const productionStaffOptions = useMemo(() => {
    const byId = new Map();
    productionOrderGroups.forEach((order) => {
      order.currentStaff.forEach((person) => byId.set(person.id, person));
    });
    return Array.from(byId.values()).sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
  }, [productionOrderGroups]);

  const filteredOrders = useMemo(() => {
    const query = search.trim().toLowerCase();
    const fromTime = dueFrom
      ? new Date(`${dueFrom}T00:00:00`).getTime()
      : null;
    const toTime = dueTo
      ? new Date(`${dueTo}T23:59:59.999`).getTime()
      : null;

    return productionOrderGroups.filter((order) => {
      const statusMatches =
        filterStatus === "all" ||
        (filterStatus === "overdue"
          ? order.overdue
          : order.overallStatus === filterStatus);

      const staffMatches =
        filterStaff === "all" ||
        order.currentStaff.some((person) => person.id === filterStaff);

      const dueTime = productionTime(order.dueDate);
      const dueMatches =
        (!fromTime || (dueTime && dueTime >= fromTime)) &&
        (!toTime || (dueTime && dueTime <= toTime));

      const searchMatches =
        !query ||
        [
          order.orderId,
          order.orderNumber,
          order.customerName,
          order.currentStaffLabel,
        ].some((value) =>
          String(value || "")
            .toLowerCase()
            .includes(query),
        );

      return statusMatches && staffMatches && dueMatches && searchMatches;
    });
  }, [
    productionOrderGroups,
    search,
    filterStatus,
    filterStaff,
    dueFrom,
    dueTo,
  ]);

  const stats = {
    total: productionOrderGroups.length,
    pending: productionOrderGroups.filter(
      (order) => order.overallStatus === "pending",
    ).length,
    in_progress: productionOrderGroups.filter(
      (order) => order.overallStatus === "in_progress",
    ).length,
    blocked: productionOrderGroups.filter(
      (order) => order.overallStatus === "blocked",
    ).length,
    overdue: productionOrderGroups.filter((order) => order.overdue).length,
    completed: productionOrderGroups.filter((order) => order.complete).length,
  };

  const selectedProductionOrder =
    productionOrderGroups.find((order) => order.key === detailsOrderKey) || null;

  const eligibleProductionOrders = orders.filter((item) => {
    const normalizedStatus = String(item?.status || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_");
    return ["contract_released", "production"].includes(normalizedStatus);
  });

  const productionAssignmentOrder = orders.find(
    (item) => Number(item.id) === Number(productionOrderId),
  );
  const productionAssignmentOrderLabel = productionAssignmentOrder?.order_number
    ? `#${productionAssignmentOrder.order_number}`
    : productionOrderId
      ? `#${String(productionOrderId).padStart(5, "0")}`
      : "—";

  const formatTaskDateTime = (value) => {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return date.toLocaleString("en-PH", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const isRepeatedProductionDescription = (task) => {
    const description = String(task?.description || "").trim().toLowerCase();
    const role = String(task?.task_role || "").trim().toLowerCase();
    return Boolean(
      description &&
        role &&
        description === "production step: " + role
    );
  };

  // ── Styles ──────────────────────────────────────────────────────────────────
  const S = {
    page: {
      padding: "28px 32px",
      background: "#f4f4f5",
      minHeight: "100vh",
      fontFamily: "inherit",
      color: "#18181b",
      fontVariantNumeric: "tabular-nums",
    },
    header: {
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      marginBottom: 18,
      flexWrap: "wrap",
      gap: 14,
    },
    title: {
      fontSize: 24,
      fontWeight: 700,
      lineHeight: 1.2,
      color: "#18181b",
      margin: 0,
      letterSpacing: "-0.02em",
    },
    sub: {
      fontSize: 13,
      fontWeight: 400,
      color: "#71717a",
      lineHeight: 1.5,
      margin: "4px 0 0",
    },
    statRow: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
      gap: 10,
      marginBottom: 12,
    },
    stat: {
      background: "#ffffff",
      border: "1px solid #e4e4e7",
      borderRadius: 0,
      minHeight: 78,
      padding: "13px 15px",
      boxSizing: "border-box",
      boxShadow: "none",
    },
    statNum: {
      fontSize: 25,
      fontWeight: 700,
      lineHeight: 1,
      color: "#18181b",
      letterSpacing: "-0.02em",
      fontVariantNumeric: "tabular-nums",
    },
    statLbl: {
      fontSize: 9.5,
      color: "#71717a",
      marginTop: 0,
      marginBottom: 8,
      textTransform: "uppercase",
      letterSpacing: "0.08em",
      fontWeight: 600,
    },
    panel: {
      background: "#ffffff",
      border: "1px solid #e4e4e7",
      borderRadius: 0,
      boxShadow: "none",
      overflow: "hidden",
    },
    panelHeader: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      gap: 16,
      padding: "14px 16px 10px",
    },
    panelTitle: {
      margin: 0,
      fontSize: 15.5,
      fontWeight: 700,
      lineHeight: 1.3,
      color: "#18181b",
    },
    panelHint: {
      margin: "3px 0 0",
      fontSize: 11.5,
      fontWeight: 400,
      lineHeight: 1.4,
      color: "#71717a",
    },
    countText: {
      fontSize: 11,
      fontWeight: 400,
      color: "#71717a",
      whiteSpace: "nowrap",
    },
    toolbar: {
      display: "flex",
      gap: 8,
      padding: "10px 12px",
      borderTop: "1px solid #eeeeef",
      borderBottom: "1px solid #e4e4e7",
      alignItems: "center",
      flexWrap: "wrap",
      background: "#ffffff",
    },
    searchWrap: {
      position: "relative",
      flex: "0 1 360px",
      width: 360,
      maxWidth: "100%",
    },
    searchIcon: {
      position: "absolute",
      left: 11,
      top: "50%",
      transform: "translateY(-50%)",
      color: "#71717a",
      pointerEvents: "none",
    },
    input: {
      width: "100%",
      minHeight: 36,
      padding: "8px 11px 8px 34px",
      border: "1px solid #d4d4d8",
      borderRadius: 0,
      fontFamily: "inherit",
      fontSize: 12.5,
      fontWeight: 400,
      background: "#ffffff",
      outline: "none",
      color: "#18181b",
      boxSizing: "border-box",
    },
    select: {
      minHeight: 36,
      padding: "8px 30px 8px 11px",
      border: "1px solid #d4d4d8",
      borderRadius: 0,
      fontFamily: "inherit",
      fontSize: 12.5,
      fontWeight: 400,
      background: "#ffffff",
      cursor: "pointer",
      color: "#18181b",
      outline: "none",
    },
    btn: {
      minHeight: 34,
      padding: "0 11px",
      borderRadius: 0,
      cursor: "pointer",
      fontFamily: "inherit",
      fontSize: 11.5,
      lineHeight: 1,
      fontWeight: 600,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      whiteSpace: "nowrap",
      boxSizing: "border-box",
    },
    btnPrim: {
      background: "#18181b",
      color: "#ffffff",
      border: "1px solid #18181b",
    },
    btnGray: {
      background: "#ffffff",
      color: "#18181b",
      border: "1px solid #d4d4d8",
    },
    btnRed: {
      background: "#ffffff",
      color: "#991b1b",
      border: "1px solid #efb6b6",
    },
    tag: (bg, color, border) => ({
      display: "inline-flex",
      alignItems: "center",
      minHeight: 24,
      padding: "0 8px",
      borderRadius: 0,
      fontSize: 10.5,
      lineHeight: 1,
      fontWeight: 500,
      background: bg,
      color,
      border: `1px solid ${border || bg}`,
      whiteSpace: "nowrap",
    }),
    tableScroll: {
      width: "100%",
      maxHeight: "calc(100vh - 380px)",
      minHeight: 220,
      overflow: "auto",
    },
    table: {
      width: "100%",
      minWidth: 980,
      borderCollapse: "collapse",
      fontSize: 12.5,
      fontVariantNumeric: "tabular-nums",
    },
    th: {
      position: "sticky",
      top: 0,
      zIndex: 2,
      padding: "10px 12px",
      background: "#fafafa",
      borderBottom: "1px solid #e4e4e7",
      color: "#71717a",
      textAlign: "left",
      fontSize: 9.5,
      fontWeight: 600,
      letterSpacing: "0.08em",
      textTransform: "uppercase",
      whiteSpace: "nowrap",
    },
    tr: {
      background: "#ffffff",
      borderBottom: "1px solid #eeeeef",
    },
    td: {
      padding: "12px",
      color: "#3f3f46",
      fontSize: 12.5,
      fontWeight: 400,
      lineHeight: 1.35,
      verticalAlign: "middle",
    },
    primary: {
      color: "#18181b",
      fontWeight: 600,
      lineHeight: 1.35,
    },
    secondary: {
      marginTop: 3,
      color: "#71717a",
      fontSize: 10.5,
      fontWeight: 400,
      lineHeight: 1.35,
    },
    rowActions: {
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-start",
      gap: 7,
      flexWrap: "nowrap",
      whiteSpace: "nowrap",
    },
    overlay: {
      position: "fixed",
      inset: 0,
      background: "rgba(0, 0, 0, 0.48)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000,
      padding: 20,
    },
    modal: {
      background: "#ffffff",
      borderRadius: 0,
      width: 560,
      maxWidth: "100%",
      maxHeight: "90vh",
      overflowY: "auto",
      padding: 24,
      boxShadow: "none",
      border: "1px solid #d4d4d8",
      boxSizing: "border-box",
    },
    mTitle: {
      fontSize: 20,
      fontWeight: 700,
      lineHeight: 1.25,
      color: "#18181b",
      marginBottom: 20,
      letterSpacing: "-0.015em",
    },
    label: {
      fontSize: 11,
      fontWeight: 600,
      color: "#3f3f46",
      display: "block",
      marginBottom: 6,
    },
    mInput: {
      width: "100%",
      minHeight: 38,
      padding: "9px 11px",
      border: "1px solid #d4d4d8",
      borderRadius: 0,
      fontFamily: "inherit",
      fontSize: 12.5,
      fontWeight: 400,
      boxSizing: "border-box",
      outline: "none",
      color: "#18181b",
      background: "#ffffff",
      fontVariantNumeric: "tabular-nums",
    },
    mRow: { marginBottom: 16 },
    half: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
      gap: 12,
    },
    infoBox: {
      border: "1px solid #e4e4e7",
      borderRadius: 0,
      background: "#fafafa",
      padding: "12px 14px",
      marginBottom: 16,
    },
  };

  const isEditingRequiredProductionTask =
    modal === "edit" && REQUIRED_PRODUCTION_ROLES.includes(target?.task_role);

  return (
    <div style={S.page}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={S.header}>
        <div>
          <h1 style={S.title}>Task Assignments</h1>
          <p style={S.sub}>
            {isAdmin
              ? "Assign tasks to staff and track progress."
              : "Review your assigned tasks and current progress."}
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            style={{ ...S.btn, ...S.btnPrim, minHeight: 36, padding: "0 14px" }}
            onClick={openProductionOrderPicker}
          >
            + Assign production staff
          </button>
        )}
      </div>

      {/* ── Summary ────────────────────────────────────────────────────────── */}
      <div style={S.statRow}>
        {[
          { label: "Production orders", value: stats.total, color: "#18181b" },
          { label: "Assigned", value: stats.pending, color: "#52525b" },
          { label: "In production", value: stats.in_progress, color: "#18181b" },
          { label: "On hold", value: stats.blocked, color: "#b91c1c" },
          { label: "Overdue", value: stats.overdue, color: "#b91c1c" },
          { label: "Completed", value: stats.completed, color: "#15803d" },
        ].map((item) => (
          <div key={item.label} style={S.stat}>
            <div style={S.statLbl}>{item.label}</div>
            <div style={{ ...S.statNum, color: item.color }}>
              {Number(item.value || 0).toLocaleString("en-PH")}
            </div>
          </div>
        ))}
      </div>

      {/* ── Production orders panel ────────────────────────────────────────── */}
      <section style={S.panel}>
        <div style={S.panelHeader}>
          <div>
            <h2 style={S.panelTitle}>Production Orders</h2>
            <p style={S.panelHint}>
              One row per order. Open Details to review the five production steps.
            </p>
          </div>
          <span style={S.countText}>
            {filteredOrders.length.toLocaleString("en-PH")} shown
          </span>
        </div>

        <div style={S.toolbar}>
          <div style={S.searchWrap}>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={S.searchIcon}
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              type="search"
              style={S.input}
              placeholder="Search order ID, customer, or staff"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search production orders"
            />
          </div>

          <select
            style={{ ...S.select, width: 160 }}
            value={filterStatus}
            onChange={(event) => setFilterStatus(event.target.value)}
            aria-label="Filter production orders by status"
          >
            <option value="all">All statuses</option>
            <option value="pending">Assigned</option>
            <option value="in_progress">In production</option>
            <option value="blocked">On hold</option>
            <option value="overdue">Overdue</option>
            <option value="completed">Completed</option>
          </select>

          <select
            style={{ ...S.select, width: 190 }}
            value={filterStaff}
            onChange={(event) => setFilterStaff(event.target.value)}
            aria-label="Filter production orders by current staff"
          >
            <option value="all">All staff</option>
            {productionStaffOptions.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>

          <input
            type="date"
            style={{ ...S.select, width: 150, paddingRight: 8 }}
            value={dueFrom}
            onChange={(event) => setDueFrom(event.target.value)}
            aria-label="Due date from"
            title="Due date from"
          />
          <input
            type="date"
            style={{ ...S.select, width: 150, paddingRight: 8 }}
            value={dueTo}
            onChange={(event) => setDueTo(event.target.value)}
            aria-label="Due date to"
            title="Due date to"
          />

          <button
            type="button"
            style={{ ...S.btn, ...S.btnGray }}
            onClick={() => {
              setSearch("");
              setFilterStatus("all");
              setFilterRole("all");
              setFilterStaff("all");
              setDueFrom("");
              setDueTo("");
            }}
          >
            Reset
          </button>
        </div>

        <div style={S.tableScroll}>
          <table style={{ ...S.table, minWidth: 1120 }}>
            <thead>
              <tr>
                <th style={{ ...S.th, width: "17%" }}>Order</th>
                <th style={{ ...S.th, width: "18%" }}>Customer</th>
                <th style={{ ...S.th, width: "18%" }}>Current Staff</th>
                <th style={{ ...S.th, width: "22%" }}>Schedule</th>
                <th style={{ ...S.th, width: "15%" }}>Progress</th>
                <th style={{ ...S.th, width: "10%" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      ...S.td,
                      textAlign: "center",
                      padding: 42,
                      color: "#71717a",
                    }}
                  >
                    Loading production orders...
                  </td>
                </tr>
              ) : filteredOrders.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      ...S.td,
                      textAlign: "center",
                      padding: 42,
                      color: "#71717a",
                    }}
                  >
                    {productionOrderGroups.length === 0
                      ? "No production orders are assigned yet."
                      : "No production orders match the current filters."}
                  </td>
                </tr>
              ) : (
                filteredOrders.map((order) => {
                  const meta =
                    PRODUCTION_STATUS_META[order.overallStatus] ||
                    PRODUCTION_STATUS_META.pending;
                  const focused = order.rawTasks.some(
                    (task) => Number(task.id) === Number(focusedTaskId),
                  );

                  return (
                    <tr
                      key={order.key}
                      id={`production-order-${order.orderId || order.key}`}
                      style={{
                        ...S.tr,
                        ...(focused
                          ? {
                              boxShadow: "inset 3px 0 0 #18181b",
                              background: "#fafafa",
                            }
                          : null),
                      }}
                    >
                      <td style={S.td}>
                        <div style={S.primary}>
                          {order.orderNumber
                            ? `#${order.orderNumber}`
                            : `Order #${order.orderId}`}
                        </div>
                        <div style={S.secondary}>
                          Order ID: {order.orderId || "—"}
                        </div>
                      </td>

                      <td style={S.td}>
                        <div style={{ ...S.primary, fontWeight: 500 }}>
                          {order.customerName || "Walk-in Customer"}
                        </div>
                      </td>

                      <td style={S.td}>
                        <div style={{ ...S.primary, fontWeight: 500 }}>
                          {order.currentStaffLabel}
                        </div>
                        {order.currentStaff.length > 1 ? (
                          <div style={S.secondary}>
                            Split remaining work
                          </div>
                        ) : null}
                      </td>

                      <td style={S.td}>
                        <div style={{ fontSize: 11.5, lineHeight: 1.5 }}>
                          <div>
                            <strong style={{ fontWeight: 600 }}>Started:</strong>{" "}
                            {order.startedAt
                              ? formatTaskDateTime(order.startedAt)
                              : "Not started"}
                          </div>
                          <div
                            style={{
                              color: order.overdue ? "#b91c1c" : "#3f3f46",
                            }}
                          >
                            <strong style={{ fontWeight: 600 }}>Due:</strong>{" "}
                            {formatTaskDateTime(order.dueDate)}
                          </div>
                          {order.overdue ? (
                            <div
                              style={{
                                ...S.secondary,
                                color: "#b91c1c",
                                fontWeight: 600,
                              }}
                            >
                              Overdue
                            </div>
                          ) : null}
                        </div>
                      </td>

                      <td style={S.td}>
                        <div style={{ ...S.primary, marginBottom: 6 }}>
                          {order.completedCount} / {REQUIRED_PRODUCTION_ROLES.length}
                        </div>
                        <span style={S.tag(meta.bg, meta.color, meta.border)}>
                          {meta.label}
                        </span>
                      </td>

                      <td style={S.td}>
                        <button
                          type="button"
                          style={{ ...S.btn, ...S.btnGray }}
                          onClick={() => setDetailsOrderKey(order.key)}
                        >
                          Details
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {selectedProductionOrder ? (
        <div style={S.overlay} onClick={() => setDetailsOrderKey(null)}>
          <div
            style={{ ...S.modal, width: 920 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={S.mTitle}>Production order details</div>

            <div
              style={{
                ...S.infoBox,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 12,
              }}
            >
              <div>
                <div style={S.label}>Order</div>
                <div style={S.primary}>
                  {selectedProductionOrder.orderNumber
                    ? `#${selectedProductionOrder.orderNumber}`
                    : `Order #${selectedProductionOrder.orderId}`}
                </div>
                <div style={S.secondary}>
                  ID {selectedProductionOrder.orderId || "—"}
                </div>
              </div>
              <div>
                <div style={S.label}>Customer</div>
                <div style={S.primary}>
                  {selectedProductionOrder.customerName || "Walk-in Customer"}
                </div>
              </div>
              <div>
                <div style={S.label}>Current staff</div>
                <div style={S.primary}>
                  {selectedProductionOrder.currentStaffLabel}
                </div>
              </div>
              <div>
                <div style={S.label}>Progress</div>
                <div style={S.primary}>
                  {selectedProductionOrder.completedCount} of {REQUIRED_PRODUCTION_ROLES.length} completed
                </div>
              </div>
              <div>
                <div style={S.label}>Assigned</div>
                <div style={S.primary}>
                  {formatTaskDateTime(selectedProductionOrder.assignedAt)}
                </div>
              </div>
              <div>
                <div style={S.label}>Started</div>
                <div style={S.primary}>
                  {selectedProductionOrder.startedAt
                    ? formatTaskDateTime(selectedProductionOrder.startedAt)
                    : "Not started"}
                </div>
              </div>
              <div>
                <div style={S.label}>Due</div>
                <div
                  style={{
                    ...S.primary,
                    color: selectedProductionOrder.overdue
                      ? "#b91c1c"
                      : "#18181b",
                  }}
                >
                  {formatTaskDateTime(selectedProductionOrder.dueDate)}
                  {selectedProductionOrder.overdue ? " · Overdue" : ""}
                </div>
              </div>
            </div>

            <div style={{ ...S.tableScroll, maxHeight: 430, minHeight: 0 }}>
              <table style={{ ...S.table, minWidth: 800 }}>
                <thead>
                  <tr>
                    <th style={S.th}>Production Step</th>
                    <th style={S.th}>Staff</th>
                    <th style={S.th}>Status</th>
                    <th style={S.th}>Dates</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedProductionOrder.steps.map((step) => {
                    const meta = STATUS_META[step.status] || STATUS_META.pending;
                    const task = step.task;
                    return (
                      <tr key={step.stepLabel} style={S.tr}>
                        <td style={S.td}>
                          <div style={S.primary}>{step.stepLabel}</div>
                          {step.status === "blocked" && task?.hold_reason ? (
                            <div
                              style={{
                                ...S.secondary,
                                color: "#991b1b",
                                maxWidth: 320,
                              }}
                            >
                              Hold reason: {task.hold_reason}
                            </div>
                          ) : null}
                        </td>
                        <td style={S.td}>
                          {task?.assigned_to_name || "Not assigned"}
                        </td>
                        <td style={S.td}>
                          <span style={S.tag(meta.bg, meta.color, meta.border)}>
                            {task ? meta.label : "Not assigned"}
                          </span>
                        </td>
                        <td style={S.td}>
                          {task ? (
                            <div style={{ fontSize: 11, lineHeight: 1.55 }}>
                              <div>Assigned: {formatTaskDateTime(task.created_at)}</div>
                              <div>
                                Started: {task.accepted_at ? formatTaskDateTime(task.accepted_at) : "Not started"}
                              </div>
                              <div>Due: {formatTaskDateTime(task.due_date)}</div>
                              <div>
                                Completed: {task.completed_at ? formatTaskDateTime(task.completed_at) : "—"}
                              </div>
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
                marginTop: 18,
                flexWrap: "wrap",
              }}
            >
              <div>
                {isAdmin &&
                selectedProductionOrder.orderId &&
                !selectedProductionOrder.complete ? (
                  <button
                    type="button"
                    style={{ ...S.btn, ...S.btnPrim }}
                    onClick={() =>
                      navigate(`/admin/orders/${selectedProductionOrder.orderId}`)
                    }
                  >
                    Reassign staff
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                style={{ ...S.btn, ...S.btnGray }}
                onClick={() => setDetailsOrderKey(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Production Order Picker ───────────────────────────────────────── */}
      {productionOrderPickerOpen && (
        <div style={S.overlay} onClick={closeProductionOrderPicker}>
          <div
            style={{ ...S.modal, width: 520 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ marginBottom: 18 }}>
              <div style={S.mTitle}>Select production order</div>
              <div
                style={{
                  color: "#71717a",
                  fontSize: 12.5,
                  lineHeight: 1.5,
                  marginTop: -12,
                }}
              >
                Choose a blueprint order that is ready for production.
              </div>
            </div>

            <div style={S.mRow}>
              <label style={S.label}>Production order *</label>
              <select
                style={S.mInput}
                value={productionOrderSelection}
                onChange={(e) => setProductionOrderSelection(e.target.value)}
              >
                <option value="">Select an order</option>
                {eligibleProductionOrders.map((order) => (
                  <option key={order.id} value={order.id}>
                    {order.order_number
                      ? `#${order.order_number}`
                      : `Order #${String(order.id).padStart(5, "0")}`}
                  </option>
                ))}
              </select>
            </div>

            {eligibleProductionOrders.length === 0 && (
              <div style={S.infoBox}>
                <div
                  style={{
                    color: "#52525b",
                    fontSize: 12,
                    lineHeight: 1.5,
                  }}
                >
                  No blueprint orders are ready for production assignment.
                </div>
              </div>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
                marginTop: 18,
              }}
            >
              <button
                type="button"
                style={{ ...S.btn, ...S.btnGray }}
                onClick={closeProductionOrderPicker}
              >
                Cancel
              </button>
              <button
                type="button"
                style={{ ...S.btn, ...S.btnPrim }}
                onClick={startProductionAssignment}
                disabled={eligibleProductionOrders.length === 0}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Blueprint Production Assignment Modal ─────────────────────────── */}
      {productionAssignModal && (
        <div style={S.overlay}>
          <div
            style={{ ...S.modal, width: 600 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ marginBottom: 18 }}>
              <div style={S.mTitle}>Assign production staff</div>
              <div
                style={{
                  color: "#71717a",
                  fontSize: 12,
                  lineHeight: 1.5,
                  marginTop: -12,
                }}
              >
                Order {productionAssignmentOrderLabel}
                {productionBlueprintId
                  ? ` · Blueprint BP-${String(productionBlueprintId).padStart(
                      5,
                      "0",
                    )}`
                  : ""}
              </div>
            </div>

            {productionAssignLoading ? (
              <div
                style={{
                  padding: "32px 16px",
                  textAlign: "center",
                  color: "#71717a",
                  fontSize: 12.5,
                }}
              >
                Loading available staff...
              </div>
            ) : (
              <form onSubmit={handleProductionAssign}>
                <div style={S.half}>
                  <div style={S.mRow}>
                    <label style={S.label}>Indoor staff *</label>
                    <select
                      style={S.mInput}
                      value={productionAssignForm.staff_id}
                      required
                      onChange={(e) =>
                        setProductionAssignForm((current) => ({
                          ...current,
                          staff_id: e.target.value,
                        }))
                      }
                    >
                      <option value="">Select staff</option>
                      {productionAssignableStaff.map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.name} — {person.active_task_count} active task
                          {Number(person.active_task_count) === 1 ? "" : "s"}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={S.mRow}>
                    <label style={S.label}>Due date and time *</label>
                    <input
                      type="datetime-local"
                      style={S.mInput}
                      value={productionAssignForm.due_date}
                      required
                      onChange={(e) =>
                        setProductionAssignForm((current) => ({
                          ...current,
                          due_date: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>

                <div style={S.infoBox}>
                  <div
                    style={{
                      fontSize: 10.5,
                      fontWeight: 600,
                      color: "#3f3f46",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      marginBottom: 6,
                    }}
                  >
                    Tasks created
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 400,
                      color: "#52525b",
                      lineHeight: 1.55,
                    }}
                  >
                    Creates five linked tasks: Cutting Machine, Edge Banding,
                    Horizontal Drilling, Retouching, and Packing.
                  </div>
                </div>

                <div style={S.mRow}>
                  <label style={S.label}>Notes</label>
                  <textarea
                    style={{
                      ...S.mInput,
                      minHeight: 88,
                      resize: "vertical",
                    }}
                    value={productionAssignForm.note}
                    placeholder="Add instructions for the assigned staff"
                    onChange={(e) =>
                      setProductionAssignForm((current) => ({
                        ...current,
                        note: e.target.value,
                      }))
                    }
                  />
                </div>

                {productionAssignableStaff.length === 0 && (
                  <div
                    style={{
                      ...S.infoBox,
                      borderColor: "#efb6b6",
                      background: "#fffafa",
                      color: "#991b1b",
                      fontSize: 12,
                    }}
                  >
                    No active indoor staff are available for assignment.
                  </div>
                )}

                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginTop: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    type="button"
                    style={{ ...S.btn, ...S.btnPrim }}
                    onClick={() =>
                      navigate(`/admin/orders/${productionOrderId}`)
                    }
                  >
                    Open order
                  </button>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      style={{ ...S.btn, ...S.btnGray }}
                      onClick={closeProductionAssignModal}
                      disabled={productionAssigning}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      style={{ ...S.btn, ...S.btnPrim }}
                      disabled={
                        productionAssigning ||
                        productionAssignableStaff.length === 0
                      }
                    >
                      {productionAssigning ? "Assigning..." : "Assign staff"}
                    </button>
                  </div>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ── Create / Edit Modal ─────────────────────────────────────────────── */}
      {(modal === "create" || modal === "edit") && (
        <div style={S.overlay} onClick={() => setModal(null)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <div style={S.mTitle}>
              {modal === "create" ? "Assign New Task" : "Edit Task"}
            </div>
            <form onSubmit={handleSave}>
              <div style={S.mRow}>
                <label style={S.label}>Task title *</label>
                <input
                  style={S.mInput}
                  value={form.title}
                  required
                  placeholder="e.g. Build cabinet for Order #1023"
                  onChange={(e) =>
                    setForm((p) => ({ ...p, title: e.target.value }))
                  }
                />
              </div>
              <div style={S.mRow}>
                <label style={S.label}>Notes</label>
                <textarea
                  style={{ ...S.mInput, height: 90, resize: "vertical" }}
                  value={form.description}
                  placeholder="Additional instructions or notes…"
                  onChange={(e) =>
                    setForm((p) => ({ ...p, description: e.target.value }))
                  }
                />
              </div>
              <div style={S.half}>
                <div style={S.mRow}>
                  <label style={S.label}>Staff *</label>
                  <select
                    style={S.mInput}
                    value={form.assigned_to}
                    required
                    onChange={(e) =>
                      setForm((p) => ({ ...p, assigned_to: e.target.value }))
                    }
                  >
                    <option value="">Select staff…</option>
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} (
                        {s.staff_type === "indoor"
                          ? "Indoor Staff"
                          : s.staff_type}
                        )
                      </option>
                    ))}
                  </select>
                </div>
                <div style={S.mRow}>
                  <label style={S.label}>Role</label>
                  {isEditingRequiredProductionTask ? (
                    <select style={S.mInput} value={form.task_role} disabled>
                      <option value={form.task_role}>{form.task_role}</option>
                    </select>
                  ) : (
                    <select
                      style={S.mInput}
                      value={form.task_role}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, task_role: e.target.value }))
                      }
                    >
                      {PRIORITY_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div style={S.mRow}>
                  <label style={S.label}>Due date and time</label>
                  <input
                    type="datetime-local"
                    style={S.mInput}
                    value={form.due_date}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, due_date: e.target.value }))
                    }
                  />
                </div>
                {modal === "edit" && (
                  <div style={S.mRow}>
                    <label style={S.label}>Status</label>
                    <select
                      style={S.mInput}
                      value={form.status}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, status: e.target.value }))
                      }
                    >
                      <option value="pending">Pending</option>
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Completed</option>
                      <option value="blocked">Blocked</option>
                    </select>
                  </div>
                )}
              </div>
              <div style={S.half}>
                <div style={S.mRow}>
                  <label style={S.label}>Order</label>
                  {isEditingRequiredProductionTask ? (
                    <select style={S.mInput} value={form.order_id} disabled>
                      <option value={form.order_id}>
                        {target?.order_number
                          ? `#${target.order_number}`
                          : "Linked order"}
                      </option>
                    </select>
                  ) : (
                    <select
                      style={S.mInput}
                      value={form.order_id}
                      onChange={(e) =>
                        setForm((p) => ({ ...p, order_id: e.target.value }))
                      }
                    >
                      <option value="">No linked order</option>
                      {orders.map((o) => (
                        <option key={o.id} value={o.id}>
                          #{o.order_number} ({o.status})
                        </option>
                      ))}
                    </select>
                  )}
                  {isEditingRequiredProductionTask && (
                    <div
                      style={{ fontSize: 11, color: "#71717a", marginTop: 4 }}
                    >
                      Production task links are managed from the order.
                    </div>
                  )}
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 12,
                  justifyContent: "flex-end",
                  marginTop: 12,
                }}
              >
                <button
                  type="button"
                  style={{ ...S.btn, ...S.btnGray }}
                  onClick={() => setModal(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ ...S.btn, ...S.btnPrim }}
                  disabled={saving}
                >
                  {saving
                    ? "Saving…"
                    : modal === "create"
                      ? "Assign Task"
                      : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── View Modal ──────────────────────────────────────────────────────── */}
      {modal === "view" &&
        target &&
        (() => {
          const sm = STATUS_META[target.status] || STATUS_META.pending;
          const rc = ROLE_COLOR[target.task_role] || ROLE_COLOR["Other"];
          return (
            <div style={S.overlay} onClick={() => setModal(null)}>
              <div style={S.modal} onClick={(e) => e.stopPropagation()}>
                <div style={S.mTitle}>Task details</div>
                <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
                  <span style={S.tag(sm.bg, sm.color, sm.border)}>
                    {sm.label}
                  </span>
                  <span style={S.tag(rc.bg, rc.color, rc.border)}>
                    {target.task_role}
                  </span>
                </div>
                {[
                  ["Task", target.title],
                  ["Notes", target.description || "—"],
                  ["Staff", target.assigned_to_name || "—"],
                  ["Assigned by", target.assigned_by_name],
                  [
                    "Order",
                    target.order_number ? `#${target.order_number}` : "—",
                  ],
                  ["Blueprint", target.blueprint_title || "—"],
                  [
                    "Due date",
                    target.due_date
                      ? new Date(target.due_date).toLocaleString("en-PH")
                      : "—",
                  ],
                  [
                    "Accepted",
                    target.accepted_at
                      ? new Date(target.accepted_at).toLocaleString("en-PH")
                      : "—",
                  ],
                  [
                    "Completed",
                    target.completed_at
                      ? new Date(target.completed_at).toLocaleString("en-PH")
                      : "—",
                  ],
                  [
                    "Created",
                    new Date(target.created_at).toLocaleString("en-PH"),
                  ],
                ].map(([k, v]) => (
                  <div
                    key={k}
                    style={{
                      display: "flex",
                      gap: 16,
                      marginBottom: 12,
                      fontSize: 13,
                      borderBottom: "1px solid #f4f4f5",
                      paddingBottom: 8,
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 600,
                        color: "#71717a",
                        minWidth: 120,
                      }}
                    >
                      {k}
                    </span>
                    <span style={{ color: "#18181b", fontWeight: 400 }}>
                      {v}
                    </span>
                  </div>
                ))}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    marginTop: 24,
                  }}
                >
                  <button
                    style={{ ...S.btn, ...S.btnGray }}
                    onClick={() => setModal(null)}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
