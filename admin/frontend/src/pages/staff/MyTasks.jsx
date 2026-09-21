// WISDOM INDOOR MY TASKS UI V1
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import api from "../../services/api";
import { getSocket, subscribeSocketReady } from "../../services/socket";
import {
  formatPHDateTime,
  formatPHWallClockDate,
  parseSystemDateTime,
} from "../../utils/dateTime";
import useAuthStore from "../../store/authStore";
import { extractCustomerBlueprintScene } from "../customer/customerBlueprintAdapter";
import StaffProductionBlueprintViewer from "./StaffProductionBlueprintViewer";

const REQUIRED_STEPS = [
  "Cutting Machine",
  "Edge Banding",
  "Horizontal Drilling",
  "Retouching",
  "Packing",
];

const FILTERS = [
  { key: "all", label: "All" },
  { key: "assigned", label: "Assigned" },
  { key: "in_progress", label: "In Production" },
  { key: "blocked", label: "On Hold" },
  { key: "ready", label: "Ready" },
];

const STEP_STATUS_META = {
  pending: {
    bg: "#ffffff",
    color: "#52525b",
    border: "#d4d4d8",
    label: "Not Started",
  },
  in_progress: {
    bg: "#f4f4f5",
    color: "#18181b",
    border: "#cfcfd4",
    label: "In Progress",
  },
  completed: {
    bg: "#18181b",
    color: "#ffffff",
    border: "#18181b",
    label: "Done",
  },
  blocked: {
    bg: "#ffffff",
    color: "#991b1b",
    border: "#d8a3a3",
    label: "On Hold",
  },
};

const ORDER_STATUS_META = {
  assigned: {
    bg: "#ffffff",
    color: "#52525b",
    border: "#d4d4d8",
    label: "Assigned",
  },
  in_progress: {
    bg: "#f4f4f5",
    color: "#18181b",
    border: "#cfcfd4",
    label: "In Production",
  },
  blocked: {
    bg: "#ffffff",
    color: "#991b1b",
    border: "#d8a3a3",
    label: "On Hold",
  },
  ready: {
    bg: "#18181b",
    color: "#ffffff",
    border: "#18181b",
    label: "Ready",
  },
};

const normalize = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

const formatDueDate = (value) => formatPHWallClockDate(value);

const formatMaterialQuantity = (value) => {
  const quantity = Number(value);
  if (!Number.isFinite(quantity)) return "—";
  return new Intl.NumberFormat("en-PH", {
    maximumFractionDigits: 2,
  }).format(quantity);
};

const extractAdminProductionNote = (description) => {
  const text = String(description || "").trim();
  if (!text) return "";

  const marker = "Admin production note:";
  const markerIndex = text.toLowerCase().indexOf(marker.toLowerCase());

  if (markerIndex === -1) return "";

  return text.slice(markerIndex + marker.length).trim();
};

const getEventTimestamp = (value) => {
  const parsed = parseSystemDateTime(value);
  return parsed ? parsed.getTime() : 0;
};

const getLatestAssignmentTimestamp = (taskList = []) =>
  taskList.reduce((latest, task) => {
    const candidate = Math.max(
      getEventTimestamp(task?.created_at),
      getEventTimestamp(task?.assigned_at),
    );

    return candidate > latest ? candidate : latest;
  }, 0);

const canStartStepInSequence = (steps, stepIndex) =>
  steps.slice(0, stepIndex).every((step) => step.status === "completed");

const getPreviousRequiredStepLabel = (steps, stepIndex) => {
  const previousIncomplete = steps
    .slice(0, stepIndex)
    .find((step) => step.status !== "completed");

  return previousIncomplete ? previousIncomplete.stepLabel : "";
};

const getCurrentStep = (steps = []) => {
  const inProgress = steps.find((step) => step.status === "in_progress");
  if (inProgress) return inProgress;

  const blocked = steps.find((step) => step.status === "blocked");
  if (blocked) return blocked;

  const nextPending = steps.find((step, index) => {
    if (step.status !== "pending") return false;
    return canStartStepInSequence(steps, index);
  });

  if (nextPending) return nextPending;

  const firstPending = steps.find((step) => step.status === "pending");
  if (firstPending) return firstPending;

  return steps[steps.length - 1] || null;
};

export default function MyTasks() {
  const { user, hasPermission } = useAuthStore();
  const canManageTasks = hasPermission("task_assignments.manage");

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [expandedOrderKey, setExpandedOrderKey] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [focusedTaskId, setFocusedTaskId] = useState(null);
  const [holdTarget, setHoldTarget] = useState(null);
  const [holdReason, setHoldReason] = useState("");
  const [holdSaving, setHoldSaving] = useState(false);
  const [taskActionTarget, setTaskActionTarget] = useState(null);
  const [taskActionMode, setTaskActionMode] = useState(null);

  const loadTasks = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);

    try {
      const { data } = await api.get("/tasks");
      const safeList = Array.isArray(data) ? data : [];

      // The backend already scopes staff to complete production packets.
      // Do not filter rows again here: prior completed steps may belong to a
      // previous staff member and are required for correct sequence/progress.
      setTasks(safeList);
    } catch (err) {
      toast.error(
        err?.response?.data?.message || "Failed to load production work.",
      );
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    const handleTaskUpdated = (payload) => {
      const taskId = Number(payload?.task_id);
      const orderId = Number(payload?.order_id);
      const assignedTo = Number(payload?.assigned_to);
      const previousAssigneeIds = Array.isArray(payload?.previous_assignee_ids)
        ? payload.previous_assignee_ids.map(Number)
        : [];

      const currentUserId = Number(user?.id);

      const affectsCurrentUser =
        assignedTo === currentUserId ||
        previousAssigneeIds.includes(currentUserId);

      if (
        !affectsCurrentUser &&
        Number.isInteger(taskId) &&
        !Number.isInteger(orderId)
      ) {
        return;
      }

      loadTasks({ silent: true }).catch((err) => {
        console.error(
          "Failed to refresh production work after realtime task update:",
          err,
        );
      });
    };

    const attachListener = (socket) => {
      if (!socket) return;

      socket.off("task:updated", handleTaskUpdated);
      socket.on("task:updated", handleTaskUpdated);
    };

    const socket = getSocket();

    if (socket) {
      attachListener(socket);
    }

    const unsubscribeReady = subscribeSocketReady((readySocket) => {
      attachListener(readySocket);
    });

    return () => {
      const currentSocket = getSocket();

      if (currentSocket) {
        currentSocket.off("task:updated", handleTaskUpdated);
      }

      unsubscribeReady();
    };
  }, [loadTasks, user?.id]);

  const updateTaskStatus = async (taskId, status, options = {}) => {
    try {
      setBusyId(taskId);

      const payload = { status };
      if (status === "blocked") {
        payload.hold_reason = String(options.holdReason || "").trim();
      }

      const { data } = await api.put(`/tasks/${taskId}/status`, payload);

      setTasks((previous) =>
        previous.map((task) =>
          Number(task.id) === Number(taskId)
            ? {
                ...task,
                ...(data?.task || {}),
                status,
                hold_reason:
                  status === "blocked"
                    ? payload.hold_reason
                    : status === "in_progress"
                      ? null
                      : task.hold_reason,
              }
            : task,
        ),
      );

      if (data?.message) toast.success(data.message);
      return true;
    } catch (err) {
      toast.error(
        err?.response?.data?.message || "Failed to update production step.",
      );
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const openHoldDialog = (task) => {
    if (!task) return;
    setHoldTarget(task);
    setHoldReason("");
  };

  const closeHoldDialog = () => {
    if (holdSaving) return;
    setHoldTarget(null);
    setHoldReason("");
  };

  const submitHold = async () => {
    const reason = holdReason.trim();
    if (!reason) {
      toast.error("Please enter a reason before putting this work on hold.");
      return;
    }
    if (reason.length > 500) {
      toast.error("Hold reason must be 500 characters or fewer.");
      return;
    }

    setHoldSaving(true);
    const saved = await updateTaskStatus(holdTarget.id, "blocked", {
      holdReason: reason,
    });
    if (saved) {
      setHoldTarget(null);
      setHoldReason("");
    }
    setHoldSaving(false);
  };

  const openTaskActionDialog = (task, mode) => {
    if (!task || !["complete", "undo"].includes(mode)) return;

    setTaskActionTarget(task);
    setTaskActionMode(mode);
  };

  const closeTaskActionDialog = () => {
    if (
      taskActionTarget &&
      Number(busyId) === Number(taskActionTarget.id)
    ) {
      return;
    }

    setTaskActionTarget(null);
    setTaskActionMode(null);
  };

  const undoTaskCompletion = async (taskId) => {
    try {
      setBusyId(taskId);

      const { data } = await api.post(
        `/tasks/${taskId}/undo-completion`,
      );

      setTasks((previous) =>
        previous.map((task) =>
          Number(task.id) === Number(taskId)
            ? {
                ...task,
                ...(data?.task || {}),
                status: "in_progress",
                completed_at: null,
                hold_reason: null,
              }
            : task,
        ),
      );

      if (data?.message) toast.success(data.message);
      return true;
    } catch (err) {
      toast.error(
        err?.response?.data?.message ||
          "Failed to undo production step completion.",
      );
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const submitTaskAction = async () => {
    if (!taskActionTarget || !taskActionMode) return;

    const saved =
      taskActionMode === "complete"
        ? await updateTaskStatus(taskActionTarget.id, "completed")
        : await undoTaskCompletion(taskActionTarget.id);

    if (saved) {
      setTaskActionTarget(null);
      setTaskActionMode(null);
    }
  };

  const groupedOrders = useMemo(() => {
    const map = new Map();

    tasks.forEach((task) => {
      const key =
        task.order_id || task.order_number || `${task.assigned_to}-${task.id}`;

      if (!map.has(key)) {
        map.set(key, {
          key,
          orderId: task.order_id || null,
          orderNumber: task.order_number || "—",
          assignedByName: task.assigned_by_name || "—",
          dueDate: task.due_date || null,
          adminNote: extractAdminProductionNote(task.description),
          rawTasks: [],
          productionMaterials: [],
        });
      }

      const bucket = map.get(key);
      bucket.rawTasks.push(task);

      if (
        Array.isArray(task.production_materials) &&
        task.production_materials.length > 0
      ) {
        bucket.productionMaterials = task.production_materials;
      }

      if (!bucket.dueDate && task.due_date) {
        bucket.dueDate = task.due_date;
      }

      const taskAdminNote = extractAdminProductionNote(task.description);
      if (!bucket.adminNote && taskAdminNote) {
        bucket.adminNote = taskAdminNote;
      }

      if (
        (!bucket.assignedByName || bucket.assignedByName === "—") &&
        task.assigned_by_name
      ) {
        bucket.assignedByName = task.assigned_by_name;
      }
    });

    return Array.from(map.values())
      .map((order) => {
        const steps = REQUIRED_STEPS.map((stepLabel) => {
          const matchedTask =
            order.rawTasks.find(
              (task) => normalize(task.task_role) === normalize(stepLabel),
            ) || null;

          const status = normalize(matchedTask?.status || "pending");

          return {
            stepLabel,
            task: matchedTask,
            status,
          };
        });

        const completedCount = steps.filter(
          (step) => step.status === "completed",
        ).length;

        const hasBlocked = steps.some((step) => step.status === "blocked");
        const hasInProgress = steps.some(
          (step) => step.status === "in_progress",
        );
        const hasStarted = steps.some((step) =>
          ["in_progress", "completed", "blocked"].includes(step.status),
        );

        const ready =
          completedCount === REQUIRED_STEPS.length &&
          steps.every((step) => Boolean(step.task));

        let overallStatus = "assigned";
        if (ready) overallStatus = "ready";
        else if (hasBlocked) overallStatus = "blocked";
        else if (hasInProgress || hasStarted) overallStatus = "in_progress";

        return {
          ...order,
          steps,
          completedCount,
          progressPercent: Math.round(
            (completedCount / REQUIRED_STEPS.length) * 100,
          ),
          overallStatus,
          ready,
          currentStep: getCurrentStep(steps),
          latestAssignmentTimestamp: getLatestAssignmentTimestamp(
            order.rawTasks,
          ),
        };
      })
      .sort((a, b) => {
        if (b.latestAssignmentTimestamp !== a.latestAssignmentTimestamp) {
          return b.latestAssignmentTimestamp - a.latestAssignmentTimestamp;
        }

        const aOrderId = Number(a.orderId || 0);
        const bOrderId = Number(b.orderId || 0);

        if (bOrderId !== aOrderId) {
          return bOrderId - aOrderId;
        }

        return String(b.orderNumber || "").localeCompare(
          String(a.orderNumber || ""),
          undefined,
          { numeric: true, sensitivity: "base" },
        );
      });
  }, [tasks]);

  useEffect(() => {
    const focusId = searchParams.get("focus_task_id");
    if (!focusId || loading) return;

    const numericId = Number(focusId);
    const matchedOrder = groupedOrders.find((order) =>
      order.rawTasks.some((task) => Number(task.id) === numericId),
    );

    if (!matchedOrder) {
      toast.error("That task could not be found. It may have been removed.");

      const next = new URLSearchParams(searchParams);
      next.delete("focus_task_id");
      setSearchParams(next, { replace: true });
      return;
    }

    setFilter("all");
    setSearch("");
    setExpandedOrderKey(matchedOrder.key);
    setFocusedTaskId(numericId);

    const scrollTimer = setTimeout(() => {
      const stepElement = document.getElementById(`task-step-${numericId}`);
      const orderElement = document.getElementById(
        `order-group-${matchedOrder.orderId || matchedOrder.key}`,
      );

      (stepElement || orderElement)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }, 100);

    const highlightTimer = setTimeout(() => setFocusedTaskId(null), 4000);

    const next = new URLSearchParams(searchParams);
    next.delete("focus_task_id");
    setSearchParams(next, { replace: true });

    return () => {
      clearTimeout(scrollTimer);
      clearTimeout(highlightTimer);
    };
  }, [searchParams, loading, groupedOrders, setSearchParams]);

  const summary = useMemo(
    () => ({
      assigned: groupedOrders.filter(
        (order) => order.overallStatus === "assigned",
      ).length,
      inProgress: groupedOrders.filter(
        (order) => order.overallStatus === "in_progress",
      ).length,
      blocked: groupedOrders.filter(
        (order) => order.overallStatus === "blocked",
      ).length,
      ready: groupedOrders.filter((order) => order.ready).length,
    }),
    [groupedOrders],
  );

  const visibleOrders = useMemo(() => {
    const query = search.trim().toLowerCase();

    return groupedOrders.filter((order) => {
      if (filter !== "all" && order.overallStatus !== filter) {
        return false;
      }

      if (!query) return true;

      const currentStep = order.currentStep?.stepLabel || "";

      return [
        order.orderNumber,
        currentStep,
        order.assignedByName,
        ORDER_STATUS_META[order.overallStatus]?.label,
      ].some((value) =>
        String(value || "")
          .toLowerCase()
          .includes(query),
      );
    });
  }, [groupedOrders, filter, search]);

  return (
    <div className="indoor-tasks-page" style={pageShell}>
      <header className="indoor-tasks-header" style={pageHeader}>
        <div>
          <h1 style={pageTitle}>My Production Work</h1>
          <p style={pageSubtitle}>
            Complete your assigned production steps in order.
          </p>
        </div>
      </header>

      <section className="indoor-tasks-summary" style={summaryGrid}>
        <SummaryCard label="New Assignments" value={summary.assigned} />
        <SummaryCard
          label="In Production"
          value={summary.inProgress}
          emphasized
        />
        <SummaryCard
          label="On Hold"
          value={summary.blocked}
          danger={summary.blocked > 0}
        />
        <SummaryCard label="Ready" value={summary.ready} />
      </section>

      <section className="indoor-tasks-toolbar" style={toolbar}>
        <input
          id="staff-production-search"
          name="staff_production_search"
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search order or production step"
          aria-label="Search production work"
          className="indoor-tasks-search"
          style={searchInput}
        />

        <div className="indoor-tasks-filter-row" style={filterRow}>
          {FILTERS.map((item) => {
            const active = filter === item.key;

            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setFilter(item.key)}
                style={active ? activeFilterButton : filterButton}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="indoor-tasks-list-panel" style={listPanel}>
        <div className="indoor-tasks-list-header" style={listHeader}>
          <div>
            <h2 style={sectionTitle}>Production Orders</h2>
            <p style={sectionSubtitle}>Newest assignments first.</p>
          </div>

          {!loading ? (
            <div style={recordCount}>
              {visibleOrders.length}{" "}
              {visibleOrders.length === 1 ? "order" : "orders"}
            </div>
          ) : null}
        </div>

        {loading ? (
          <div style={emptyState}>Loading production work...</div>
        ) : visibleOrders.length === 0 ? (
          <div style={emptyState}>No production work matches this view.</div>
        ) : (
          <div className="indoor-task-order-list" style={orderList}>
            {visibleOrders.map((order) => {
              const orderMeta =
                ORDER_STATUS_META[order.overallStatus] ||
                ORDER_STATUS_META.assigned;

              const isExpanded = expandedOrderKey === order.key;
              const currentStep = order.ready
                ? "Production Complete"
                : order.currentStep?.stepLabel || "Production Work";

              return (
                <article
                  key={order.key}
                  id={`order-group-${order.orderId || order.key}`}
                  className="indoor-task-order-card"
                  style={orderCard}
                >
                  <div className="indoor-task-order-summary" style={orderSummary}>
                    <div className="indoor-task-order-primary" style={orderPrimary}>
                      <div className="indoor-task-order-heading" style={orderHeadingRow}>
                        <div>
                          <div style={orderNumber}>{order.orderNumber}</div>
                          <div style={currentStepText}>{currentStep}</div>
                        </div>

                        <span
                          style={{
                            ...statusBadge,
                            background: orderMeta.bg,
                            color: orderMeta.color,
                            border: `1px solid ${orderMeta.border}`,
                          }}
                        >
                          {orderMeta.label}
                        </span>
                      </div>

                      <div className="indoor-task-meta-grid" style={metaGrid}>
                        <Info
                          label="Due Date"
                          value={formatDueDate(order.dueDate)}
                          important
                        />
                        <Info
                          label="Progress"
                          value={`${order.completedCount} of ${REQUIRED_STEPS.length} steps`}
                        />
                        <Info
                          label="Assigned By"
                          value={order.assignedByName}
                        />
                      </div>
                    </div>

                    <div className="indoor-task-action-column" style={orderActionColumn}>
                      <div className="indoor-task-progress-area" style={progressArea}>
                        <div style={progressTrack}>
                          <div
                            style={{
                              ...progressFill,
                              width: `${order.progressPercent}%`,
                            }}
                          />
                        </div>
                        <div style={progressPercent}>
                          {order.progressPercent}%
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setExpandedOrderKey((current) =>
                            current === order.key ? null : order.key,
                          )
                        }
                        style={viewButton}
                      >
                        {isExpanded ? "Hide Work" : "View Work"}
                      </button>
                    </div>
                  </div>

                  {isExpanded ? (
                    <div className="indoor-task-expanded" style={expandedArea}>
                      <ProductionBlueprintPanel
                        orderId={order.orderId}
                        orderNumber={order.orderNumber}
                      />

                      <ProductionMaterialsPanel
                        materials={order.productionMaterials}
                      />

                      {order.adminNote ? (
                        <div style={noteBox}>
                          <div style={noteLabel}>Admin Note</div>
                          <div style={noteText}>{order.adminNote}</div>
                        </div>
                      ) : null}

                      <div style={stepsHeader}>
                        <div>
                          <h3 style={stepsTitle}>Production Steps</h3>
                          <p style={stepsSubtitle}>
                            Finish each step before starting the next one.
                          </p>
                        </div>
                      </div>

                      <div style={stepList}>
                        {order.steps.map((step, stepIndex) => {
                          const stepMeta =
                            STEP_STATUS_META[step.status] ||
                            STEP_STATUS_META.pending;

                          const canStartThisStep = canStartStepInSequence(
                            order.steps,
                            stepIndex,
                          );

                          const canUndoThisStep = order.steps
                            .slice(stepIndex + 1)
                            .every(
                              (candidate) => candidate.status === "pending",
                            );

                          const previousStep = getPreviousRequiredStepLabel(
                            order.steps,
                            stepIndex,
                          );

                          const isFocused =
                            step.task &&
                            Number(focusedTaskId) === Number(step.task.id);

                          const isOwnedByCurrentUser =
                            canManageTasks ||
                            (step.task &&
                              Number(step.task.assigned_to) ===
                                Number(user?.id));

                          return (
                            <div
                              key={step.stepLabel}
                              className="indoor-task-step-row"
                              id={
                                step.task
                                  ? `task-step-${step.task.id}`
                                  : undefined
                              }
                              style={{
                                ...stepRow,
                                ...(isFocused
                                  ? {
                                      outline: "2px solid #18181b",
                                      outlineOffset: "-2px",
                                    }
                                  : {}),
                              }}
                            >
                              <div style={stepIndexBox}>{stepIndex + 1}</div>

                              <div style={stepContent}>
                                <div style={stepName}>{step.stepLabel}</div>

                                {!step.task ? (
                                  <div style={stepHint}>
                                    Waiting for task assignment
                                  </div>
                                ) : !isOwnedByCurrentUser ? (
                                  <div style={stepHint}>
                                    {step.status === "completed"
                                      ? `Completed by ${step.task.assigned_to_name || "previous staff"}`
                                      : `Assigned to ${step.task.assigned_to_name || "another staff member"}`}
                                  </div>
                                ) : step.status === "pending" &&
                                  !canStartThisStep ? (
                                  <div style={stepHint}>
                                    Finish {previousStep} first
                                  </div>
                                ) : null}

                                {step.status === "blocked" &&
                                step.task?.hold_reason ? (
                                  <div
                                    style={{
                                      ...stepHint,
                                      color: "#991b1b",
                                      marginTop: 4,
                                    }}
                                  >
                                    Hold reason: {step.task.hold_reason}
                                  </div>
                                ) : null}

                                {step.status === "completed" &&
                                step.task?.completed_at ? (
                                  <div style={stepCompletedTime}>
                                    Completed:{" "}
                                    {formatPHDateTime(step.task.completed_at)}
                                  </div>
                                ) : null}
                              </div>

                              <div className="indoor-task-step-right" style={stepRight}>
                                <span
                                  style={{
                                    ...statusBadge,
                                    background: stepMeta.bg,
                                    color: stepMeta.color,
                                    border: `1px solid ${stepMeta.border}`,
                                  }}
                                >
                                  {stepMeta.label}
                                </span>

                                {step.task && isOwnedByCurrentUser ? (
                                  <div className="indoor-task-step-actions" style={stepActions}>
                                    {step.status === "pending" &&
                                    canStartThisStep ? (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          updateTaskStatus(
                                            step.task.id,
                                            "in_progress",
                                          )
                                        }
                                        disabled={busyId === step.task.id}
                                        style={
                                          busyId === step.task.id
                                            ? disabledButton
                                            : secondaryButton
                                        }
                                      >
                                        {busyId === step.task.id
                                          ? "Saving..."
                                          : "Start"}
                                      </button>
                                    ) : null}

                                    {step.status === "in_progress" ? (
                                      <>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            openTaskActionDialog(
                                              step.task,
                                              "complete",
                                            )
                                          }
                                          disabled={busyId === step.task.id}
                                          style={
                                            busyId === step.task.id
                                              ? disabledButton
                                              : primaryButton
                                          }
                                        >
                                          {busyId === step.task.id
                                            ? "Saving..."
                                            : "Mark Done"}
                                        </button>

                                        <button
                                          type="button"
                                          onClick={() =>
                                            openHoldDialog(step.task)
                                          }
                                          disabled={busyId === step.task.id}
                                          style={
                                            busyId === step.task.id
                                              ? disabledButton
                                              : dangerButton
                                          }
                                        >
                                          {busyId === step.task.id
                                            ? "Saving..."
                                            : "Put on Hold"}
                                        </button>
                                      </>
                                    ) : null}

                                    {step.status === "completed" &&
                                    canUndoThisStep ? (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          openTaskActionDialog(
                                            step.task,
                                            "undo",
                                          )
                                        }
                                        disabled={busyId === step.task.id}
                                        style={
                                          busyId === step.task.id
                                            ? disabledButton
                                            : secondaryButton
                                        }
                                      >
                                        {busyId === step.task.id
                                          ? "Saving..."
                                          : "Undo Done"}
                                      </button>
                                    ) : null}

                                    {step.status === "blocked" ? (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          updateTaskStatus(
                                            step.task.id,
                                            "in_progress",
                                          )
                                        }
                                        disabled={busyId === step.task.id}
                                        style={
                                          busyId === step.task.id
                                            ? disabledButton
                                            : secondaryButton
                                        }
                                      >
                                        {busyId === step.task.id
                                          ? "Saving..."
                                          : "Resume Work"}
                                      </button>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {order.ready ? (
                        <div style={readyMessage}>
                          Production complete. Admin has been notified.
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <style>{`
        /* WISDOM FURNITURE SPECIALIST TASKS MOBILE FLOW B2 */
        .indoor-tasks-page {
          width: min(100%, 1440px);
          max-width: 1440px;
          margin: 0 auto;
        }

        @media (max-width: 767px) {
          .indoor-tasks-page {
            padding-bottom: 10px !important;
          }

          .indoor-tasks-header {
            margin-bottom: 15px !important;
          }

          .indoor-tasks-header h1 {
            font-size: 22px !important;
            line-height: 1.12 !important;
          }

          .indoor-tasks-header p {
            margin-top: 5px !important;
            font-size: 12px !important;
          }

          .indoor-tasks-summary {
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 8px !important;
            margin-bottom: 12px !important;
          }

          .indoor-tasks-summary-card {
            min-height: 86px !important;
            padding: 13px !important;
          }

          .indoor-tasks-toolbar {
            padding: 10px !important;
            margin-bottom: 12px !important;
            display: block !important;
          }

          .indoor-tasks-search {
            width: 100% !important;
            min-width: 0 !important;
            height: 40px !important;
          }

          .indoor-tasks-filter-row {
            width: 100%;
            margin-top: 9px;
            display: flex !important;
            flex-wrap: nowrap !important;
            gap: 6px !important;
            overflow-x: auto;
            padding-bottom: 2px;
            scrollbar-width: none;
          }

          .indoor-tasks-filter-row::-webkit-scrollbar {
            display: none;
          }

          .indoor-tasks-filter-row button {
            flex: 0 0 auto;
            min-height: 36px !important;
          }

          .indoor-tasks-list-panel {
            overflow: hidden;
          }

          .indoor-tasks-list-header {
            min-height: 0 !important;
            padding: 13px 14px !important;
          }

          .indoor-task-order-card {
            overflow: hidden;
          }

          .indoor-task-order-summary {
            padding: 14px !important;
            display: block !important;
          }

          .indoor-task-order-primary {
            width: 100%;
            min-width: 0;
          }

          .indoor-task-order-heading {
            align-items: flex-start !important;
            gap: 10px !important;
          }

          .indoor-task-order-heading > div:first-child {
            min-width: 0;
          }

          .indoor-task-order-heading > span {
            flex: 0 0 auto;
          }

          .indoor-task-meta-grid {
            margin-top: 13px !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 11px 14px !important;
          }

          .indoor-task-meta-grid > div:nth-child(3) {
            grid-column: 1 / -1;
          }

          .indoor-task-action-column {
            width: 100% !important;
            flex: 0 0 auto !important;
            margin-top: 14px;
            gap: 9px !important;
          }

          .indoor-task-progress-area {
            width: 100%;
          }

          .indoor-task-action-column > button {
            width: 100%;
            min-height: 40px !important;
          }

          .indoor-task-expanded {
            padding: 0 12px 14px !important;
          }

          .indoor-task-blueprint-panel {
            padding: 12px !important;
            flex-direction: column !important;
            align-items: stretch !important;
            gap: 12px !important;
          }

          .indoor-task-blueprint-preview {
            width: 100% !important;
            height: 180px !important;
            flex: 0 0 auto !important;
          }

          .indoor-task-blueprint-content {
            width: 100% !important;
            min-width: 0 !important;
            flex: 0 0 auto !important;
          }

          .indoor-task-blueprint-action {
            width: 100%;
            align-self: auto !important;
          }

          .indoor-task-blueprint-action button {
            width: 100%;
            min-height: 40px !important;
          }

          .indoor-task-materials-panel {
            margin-top: 12px !important;
          }

          .indoor-task-materials-header {
            min-height: 0 !important;
            padding: 12px !important;
            align-items: flex-start !important;
          }

          .indoor-task-materials-table-wrap {
            overflow: visible !important;
          }

          .indoor-task-materials-table {
            min-width: 0 !important;
          }

          .indoor-task-materials-header-row {
            display: none !important;
          }

          .indoor-task-material-row {
            min-height: 0 !important;
            padding: 12px !important;
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            gap: 10px 14px !important;
          }

          .indoor-task-material-row > div:first-child {
            grid-column: 1 / -1;
          }

          .indoor-task-material-row > div:nth-child(2),
          .indoor-task-material-row > div:nth-child(3) {
            min-width: 0;
          }

          .indoor-task-material-row > div:nth-child(2)::before,
          .indoor-task-material-row > div:nth-child(3)::before {
            display: block;
            margin-bottom: 4px;
            color: #85868b;
            font-size: 8px;
            font-weight: 700;
            letter-spacing: 0.07em;
            text-transform: uppercase;
          }

          .indoor-task-material-row > div:nth-child(2)::before {
            content: "Required Qty";
          }

          .indoor-task-material-row > div:nth-child(3)::before {
            content: "Unit";
          }

          .indoor-task-step-row {
            min-height: 0 !important;
            padding: 12px !important;
            grid-template-columns: 28px minmax(0, 1fr) !important;
            align-items: start !important;
            gap: 10px !important;
          }

          .indoor-task-step-right {
            grid-column: 1 / -1;
            margin-left: 38px;
            width: calc(100% - 38px);
            display: flex !important;
            flex-direction: column !important;
            align-items: stretch !important;
            justify-content: flex-start !important;
            gap: 8px !important;
          }

          .indoor-task-step-right > span {
            align-self: flex-start;
          }

          .indoor-task-step-actions {
            width: 100%;
            display: grid !important;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 7px !important;
          }

          .indoor-task-step-actions button {
            width: 100%;
            min-height: 40px !important;
          }
        }

        @media (max-width: 380px) {
          .indoor-task-meta-grid {
            grid-template-columns: 1fr !important;
          }

          .indoor-task-meta-grid > div:nth-child(3) {
            grid-column: auto;
          }

          .indoor-task-step-actions {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
      {taskActionTarget ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1200,
            background: "rgba(0, 0, 0, 0.48)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
          onClick={closeTaskActionDialog}
        >
          <div
            style={{
              width: 500,
              maxWidth: "100%",
              background: "#ffffff",
              border: "1px solid #d4d4d8",
              padding: 22,
              boxSizing: "border-box",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <h3
              style={{
                margin: 0,
                fontSize: 19,
                color: "#18181b",
                lineHeight: 1.25,
              }}
            >
              {taskActionMode === "complete"
                ? "Mark production step as done?"
                : "Undo completed production step?"}
            </h3>

            <p
              style={{
                margin: "8px 0 0",
                color: "#71717a",
                fontSize: 12.5,
                lineHeight: 1.55,
              }}
            >
              {taskActionMode === "complete"
                ? `Mark ${taskActionTarget.task_role || taskActionTarget.title || "this production step"} as completed? This will unlock the next production step.`
                : `Return ${taskActionTarget.task_role || taskActionTarget.title || "this production step"} to In Progress? Undo is blocked if a later production step has already started or the order has already moved forward to delivery or completion.`}
            </p>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
                marginTop: 20,
              }}
            >
              <button
                type="button"
                onClick={closeTaskActionDialog}
                disabled={busyId === taskActionTarget.id}
                style={secondaryButton}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={submitTaskAction}
                disabled={busyId === taskActionTarget.id}
                style={
                  busyId === taskActionTarget.id
                    ? disabledButton
                    : primaryButton
                }
              >
                {busyId === taskActionTarget.id
                  ? "Saving..."
                  : taskActionMode === "complete"
                    ? "Mark Done"
                    : "Undo Done"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {holdTarget ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1200,
            background: "rgba(0, 0, 0, 0.48)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
          onClick={closeHoldDialog}
        >
          <div
            style={{
              width: 520,
              maxWidth: "100%",
              background: "#ffffff",
              border: "1px solid #d4d4d8",
              padding: 22,
              boxSizing: "border-box",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <h3
              style={{
                margin: 0,
                fontSize: 19,
                color: "#18181b",
                lineHeight: 1.25,
              }}
            >
              Put production step on hold
            </h3>
            <p
              style={{
                margin: "7px 0 18px",
                color: "#71717a",
                fontSize: 12.5,
                lineHeight: 1.5,
              }}
            >
              {holdTarget.task_role || holdTarget.title}. Add a short reason so
              the admin and any reassigned staff can see why work paused.
            </p>

            <label
              htmlFor="production-hold-reason"
              style={{
                display: "block",
                marginBottom: 6,
                color: "#3f3f46",
                fontSize: 11,
                fontWeight: 700,
              }}
            >
              Reason for putting this work on hold *
            </label>
            <textarea
              id="production-hold-reason"
              value={holdReason}
              maxLength={500}
              autoFocus
              onChange={(event) => setHoldReason(event.target.value)}
              placeholder="Example: Cutting machine unavailable. Work will continue tomorrow."
              style={{
                width: "100%",
                minHeight: 110,
                resize: "vertical",
                border: "1px solid #d4d4d8",
                padding: 10,
                boxSizing: "border-box",
                fontFamily: "inherit",
                fontSize: 12.5,
                color: "#18181b",
                outline: "none",
              }}
            />
            <div
              style={{
                marginTop: 5,
                textAlign: "right",
                color: "#71717a",
                fontSize: 10.5,
              }}
            >
              {holdReason.length}/500
            </div>

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
                onClick={closeHoldDialog}
                disabled={holdSaving}
                style={secondaryButton}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitHold}
                disabled={holdSaving || !holdReason.trim()}
                style={
                  holdSaving || !holdReason.trim()
                    ? disabledButton
                    : dangerButton
                }
              >
                {holdSaving ? "Saving..." : "Put on Hold"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ProductionMaterialsPanel({ materials = [] }) {
  const rows = Array.isArray(materials) ? materials : [];

  return (
    <div className="indoor-task-materials-panel" style={materialsPanel}>
      <div className="indoor-task-materials-header" style={materialsHeader}>
        <div>
          <div style={materialsTitle}>Required Materials</div>
          <div style={materialsSubtitle}>
            Materials recorded for this production order.
          </div>
        </div>
        <span style={productionReadOnlyBadge}>Read Only</span>
      </div>

      {rows.length === 0 ? (
        <div style={materialsEmpty}>
          No recorded required inventory materials for this order.
        </div>
      ) : (
        <div className="indoor-task-materials-table-wrap" style={materialsTableWrap}>
          <div className="indoor-task-materials-table" style={materialsTable}>
            <div className="indoor-task-materials-header-row" style={{ ...materialsRow, ...materialsTableHeader }}>
              <div>Material</div>
              <div>Required Qty</div>
              <div>Unit</div>
            </div>

            {rows.map((material, index) => (
              <div
                key={
                  material?.material_id != null
                    ? `material-${material.material_id}`
                    : `material-row-${index}`
                }
                className="indoor-task-material-row"
                style={materialsRow}
              >
                <div style={materialsName}>
                  {material?.material_name || "Material"}
                </div>
                <div>{formatMaterialQuantity(material?.quantity)}</div>
                <div>{material?.unit || "unit"}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ProductionBlueprintPanel({ orderId, orderNumber }) {
  const navigate = useNavigate();
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const numericOrderId = Number(orderId);

    if (!Number.isInteger(numericOrderId) || numericOrderId <= 0) {
      setRecord(null);
      setError("No production Blueprint is linked to this work.");
      setLoading(false);
      return () => {
        active = false;
      };
    }

    setLoading(true);
    setError("");

    api
      .get(`/tasks/orders/${numericOrderId}/blueprint`)
      .then(({ data }) => {
        if (!active) return;
        setRecord(data || null);
      })
      .catch((err) => {
        if (!active) return;
        setRecord(null);
        setError(
          err?.response?.data?.message ||
            "Production Blueprint is not available.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [orderId]);

  const blueprint = record?.blueprint || null;
  const scene = useMemo(
    () => (blueprint ? extractCustomerBlueprintScene(blueprint) : null),
    [blueprint],
  );

  const has3D =
    Array.isArray(scene?.components) &&
    scene.components.length > 0 &&
    Number(scene?.bounds?.width || 0) > 20 &&
    Number(scene?.bounds?.height || 0) > 20;

  const dimensionText = scene
    ? [
        scene.defaultDimensions?.width_mm,
        scene.defaultDimensions?.height_mm,
        scene.defaultDimensions?.depth_mm,
      ]
        .map((value) => {
          const number = Number(value);
          return Number.isFinite(number) && number > 0
            ? `${Math.round(number)} mm`
            : "—";
        })
        .join(" × ")
    : "";

  return (
    <div className="indoor-task-blueprint-panel" style={productionBlueprintPanel}>
      <div className="indoor-task-blueprint-preview" style={productionBlueprintPreview}>
        {loading ? (
          <div style={productionPreviewState}>Loading design...</div>
        ) : blueprint && has3D ? (
          <StaffProductionBlueprintViewer
            blueprint={blueprint}
            compact
            compactHeight={122}
          />
        ) : (
          <div style={productionPreviewState}>
            {blueprint ? "No 3D view available" : "Blueprint unavailable"}
          </div>
        )}
      </div>

      <div className="indoor-task-blueprint-content" style={productionBlueprintContent}>
        <div style={productionBlueprintKicker}>Production Blueprint</div>
        <div style={productionBlueprintTitle}>
          {loading
            ? "Preparing furniture reference..."
            : blueprint?.title || "Assigned production work"}
        </div>

        <div style={productionBlueprintCopy}>
          {error
            ? error
            : blueprint
              ? `Production design reference${orderNumber ? ` for ${orderNumber}` : ""}.`
              : "No production Blueprint is linked to this work."}
        </div>

        {blueprint && dimensionText ? (
          <div style={productionBlueprintDimensions}>{dimensionText}</div>
        ) : null}

        <span style={productionReadOnlyBadge}>Read Only</span>
      </div>

      <div className="indoor-task-blueprint-action" style={productionBlueprintAction}>
        <button
          type="button"
          onClick={() => navigate(`/staff/tasks/${Number(orderId)}/blueprint`)}
          disabled={!blueprint}
          style={
            blueprint ? productionOpenButton : productionOpenButtonDisabled
          }
        >
          View Blueprint
        </button>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, emphasized = false, danger = false }) {
  return (
    <div className="indoor-tasks-summary-card" style={summaryCard}>
      <div
        style={{
          fontSize: 24,
          fontWeight: 800,
          color: danger ? "#991b1b" : "#18181b",
          lineHeight: 1,
          letterSpacing: "-0.025em",
        }}
      >
        {value}
      </div>

      <div style={summaryLabel}>{label}</div>

      {emphasized ? <div style={summaryAccent} /> : null}
    </div>
  );
}

function Info({ label, value, important = false }) {
  return (
    <div>
      <div style={infoLabel}>{label}</div>
      <div
        style={{
          ...infoValue,
          fontWeight: important ? 650 : 500,
        }}
      >
        {value || "—"}
      </div>
    </div>
  );
}

const pageShell = {
  width: "100%",
  boxSizing: "border-box",
  padding: "0 0 36px",
  color: "#18181b",
};

const pageHeader = {
  marginBottom: 18,
};

const pageTitle = {
  margin: 0,
  fontSize: 24,
  fontWeight: 800,
  color: "#0a0a0a",
  lineHeight: 1.15,
  letterSpacing: "-0.025em",
};

const pageSubtitle = {
  margin: "6px 0 0",
  color: "#696a70",
  fontSize: 12.5,
  fontWeight: 400,
  lineHeight: 1.5,
};

const summaryGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
  gap: 10,
  marginBottom: 14,
};

const summaryCard = {
  position: "relative",
  minHeight: 76,
  padding: "15px 17px",
  boxSizing: "border-box",
  background: "#ffffff",
  border: "1px solid #dcdde1",
  borderRadius: 0,
  overflow: "hidden",
};

const summaryLabel = {
  marginTop: 7,
  color: "#77787e",
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.075em",
  textTransform: "uppercase",
};

const summaryAccent = {
  position: "absolute",
  left: 0,
  right: 0,
  bottom: 0,
  height: 2,
  background: "#18181b",
};

const toolbar = {
  padding: 12,
  marginBottom: 14,
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
  background: "#ffffff",
  border: "1px solid #dcdde1",
  borderRadius: 0,
};

const searchInput = {
  flex: "0 1 330px",
  minWidth: 230,
  height: 36,
  padding: "0 11px",
  boxSizing: "border-box",
  border: "1px solid #d7d8dc",
  borderRadius: 0,
  background: "#ffffff",
  color: "#18181b",
  fontSize: 11.5,
  fontWeight: 400,
  outline: "none",
};

const filterRow = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexWrap: "wrap",
};

const filterButton = {
  minHeight: 32,
  padding: "6px 10px",
  border: "1px solid #d7d8dc",
  borderRadius: 0,
  background: "#ffffff",
  color: "#52525b",
  fontSize: 10.5,
  fontWeight: 600,
  cursor: "pointer",
};

const activeFilterButton = {
  ...filterButton,
  border: "1px solid #18181b",
  background: "#18181b",
  color: "#ffffff",
};

const listPanel = {
  background: "#ffffff",
  border: "1px solid #dcdde1",
  borderRadius: 0,
};

const listHeader = {
  minHeight: 60,
  padding: "13px 16px",
  boxSizing: "border-box",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  borderBottom: "1px solid #e5e5e8",
};

const sectionTitle = {
  margin: 0,
  fontSize: 14,
  fontWeight: 700,
  color: "#18181b",
};

const sectionSubtitle = {
  margin: "4px 0 0",
  fontSize: 10.5,
  fontWeight: 400,
  color: "#7d7e83",
};

const recordCount = {
  color: "#85868b",
  fontSize: 10,
  fontWeight: 500,
};

const emptyState = {
  padding: 34,
  color: "#77787e",
  textAlign: "center",
  fontSize: 11.5,
  fontWeight: 500,
};

const orderList = {
  display: "grid",
};

const orderCard = {
  background: "#ffffff",
  borderBottom: "1px solid #dddddf",
  borderRadius: 0,
};

const orderSummary = {
  padding: "16px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "stretch",
  gap: 22,
};

const orderPrimary = {
  flex: 1,
  minWidth: 0,
};

const orderHeadingRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 14,
};

const orderNumber = {
  color: "#111113",
  fontSize: 14,
  fontWeight: 800,
  letterSpacing: "0.015em",
};

const currentStepText = {
  marginTop: 4,
  color: "#55565b",
  fontSize: 11,
  fontWeight: 550,
};

const statusBadge = {
  minHeight: 23,
  padding: "4px 8px",
  boxSizing: "border-box",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 0,
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};

const metaGrid = {
  marginTop: 15,
  display: "grid",
  gridTemplateColumns: "repeat(3, minmax(130px, 1fr))",
  gap: 18,
};

const infoLabel = {
  marginBottom: 4,
  color: "#818287",
  fontSize: 8.5,
  fontWeight: 700,
  letterSpacing: "0.07em",
  textTransform: "uppercase",
};

const infoValue = {
  color: "#2b2b2f",
  fontSize: 10.5,
  lineHeight: 1.4,
  wordBreak: "break-word",
};

const orderActionColumn = {
  width: 190,
  flex: "0 0 190px",
  display: "flex",
  flexDirection: "column",
  justifyContent: "space-between",
  alignItems: "stretch",
  gap: 14,
};

const progressArea = {
  width: "100%",
};

const progressTrack = {
  width: "100%",
  height: 5,
  overflow: "hidden",
  background: "#e8e8eb",
  borderRadius: 0,
};

const progressFill = {
  height: "100%",
  background: "#18181b",
  borderRadius: 0,
};

const progressPercent = {
  marginTop: 5,
  color: "#66676c",
  fontSize: 9.5,
  fontWeight: 600,
  textAlign: "right",
};

const viewButton = {
  minHeight: 32,
  padding: "6px 10px",
  border: "1px solid #18181b",
  borderRadius: 0,
  background: "#ffffff",
  color: "#18181b",
  fontSize: 10.5,
  fontWeight: 650,
  cursor: "pointer",
};

const expandedArea = {
  padding: "0 16px 16px",
  borderTop: "1px solid #ededf0",
};

const materialsPanel = {
  marginTop: 14,
  border: "1px solid #dfdfe3",
  background: "#ffffff",
};

const materialsHeader = {
  minHeight: 52,
  padding: "11px 12px",
  boxSizing: "border-box",
  borderBottom: "1px solid #ececef",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

const materialsTitle = {
  color: "#18181b",
  fontSize: 13,
  fontWeight: 700,
  lineHeight: 1.3,
};

const materialsSubtitle = {
  marginTop: 3,
  color: "#77787e",
  fontSize: 10.5,
  fontWeight: 400,
  lineHeight: 1.4,
};

const materialsTableWrap = {
  overflowX: "auto",
};

const materialsTable = {
  minWidth: 520,
};

const materialsRow = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) 120px 100px",
  gap: 12,
  minHeight: 38,
  padding: "9px 12px",
  boxSizing: "border-box",
  alignItems: "center",
  borderBottom: "1px solid #f0f0f2",
  color: "#3f3f46",
  fontSize: 11,
  lineHeight: 1.35,
};

const materialsTableHeader = {
  minHeight: 34,
  background: "#fafafa",
  color: "#71717a",
  fontSize: 9.5,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.045em",
};

const materialsName = {
  color: "#18181b",
  fontWeight: 600,
};

const materialsEmpty = {
  padding: "12px",
  color: "#71717a",
  fontSize: 11,
  lineHeight: 1.45,
};

const stepCompletedTime = {
  marginTop: 4,
  color: "#52525b",
  fontSize: 10.5,
  fontWeight: 500,
  lineHeight: 1.4,
};

const noteBox = {
  marginTop: 14,
  padding: "11px 12px",
  border: "1px solid #dfdfe3",
  borderRadius: 0,
  background: "#fafafa",
};

const noteLabel = {
  marginBottom: 5,
  color: "#55565b",
  fontSize: 8.5,
  fontWeight: 700,
  letterSpacing: "0.07em",
  textTransform: "uppercase",
};

const noteText = {
  color: "#55565b",
  fontSize: 10.5,
  fontWeight: 400,
  lineHeight: 1.5,
  whiteSpace: "pre-wrap",
};

const stepsHeader = {
  marginTop: 15,
  marginBottom: 10,
};

const stepsTitle = {
  margin: 0,
  color: "#18181b",
  fontSize: 13,
  fontWeight: 700,
};

const stepsSubtitle = {
  margin: "4px 0 0",
  color: "#7d7e83",
  fontSize: 10,
  fontWeight: 400,
};

const stepList = {
  display: "grid",
};

const stepRow = {
  minHeight: 58,
  padding: "10px 12px",
  boxSizing: "border-box",
  display: "grid",
  gridTemplateColumns: "28px minmax(0, 1fr) auto",
  alignItems: "center",
  gap: 12,
  border: "1px solid #e2e2e5",
  borderBottom: 0,
  borderRadius: 0,
  background: "#ffffff",
};

const stepIndexBox = {
  width: 24,
  height: 24,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid #d7d8dc",
  borderRadius: 0,
  color: "#73747a",
  fontSize: 9.5,
  fontWeight: 600,
};

const stepContent = {
  minWidth: 0,
};

const stepName = {
  color: "#1d1d20",
  fontSize: 11.5,
  fontWeight: 650,
};

const stepHint = {
  marginTop: 4,
  color: "#88898e",
  fontSize: 9.5,
  fontWeight: 400,
};

const stepRight = {
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-end",
  gap: 8,
  flexWrap: "wrap",
};

const stepActions = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  flexWrap: "wrap",
};

const baseActionButton = {
  minHeight: 30,
  padding: "5px 9px",
  borderRadius: 0,
  fontSize: 10,
  fontWeight: 650,
};

const primaryButton = {
  ...baseActionButton,
  border: "1px solid #18181b",
  background: "#18181b",
  color: "#ffffff",
  cursor: "pointer",
};

const secondaryButton = {
  ...baseActionButton,
  border: "1px solid #18181b",
  background: "#ffffff",
  color: "#18181b",
  cursor: "pointer",
};

const dangerButton = {
  ...baseActionButton,
  border: "1px solid #d8a3a3",
  background: "#ffffff",
  color: "#991b1b",
  cursor: "pointer",
};

const disabledButton = {
  ...baseActionButton,
  border: "1px solid #dedee2",
  background: "#f3f3f5",
  color: "#a0a1a6",
  cursor: "not-allowed",
};

const productionBlueprintPanel = {
  marginTop: 14,
  padding: 12,
  display: "flex",
  alignItems: "center",
  gap: 14,
  flexWrap: "wrap",
  border: "1px solid #dcdde1",
  borderRadius: 0,
  background: "#fafafa",
};

const productionBlueprintPreview = {
  width: 190,
  height: 122,
  flex: "0 0 190px",
  overflow: "hidden",
  border: "1px solid #dedee2",
  borderRadius: 0,
  background: "#f7f2ea",
};

const productionPreviewState = {
  width: "100%",
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 12,
  boxSizing: "border-box",
  color: "#77787e",
  fontSize: 9.5,
  fontWeight: 550,
  textAlign: "center",
};

const productionBlueprintContent = {
  minWidth: 220,
  flex: "1 1 280px",
};

const productionBlueprintKicker = {
  marginBottom: 5,
  color: "#77787e",
  fontSize: 8.5,
  fontWeight: 750,
  letterSpacing: "0.075em",
  textTransform: "uppercase",
};

const productionBlueprintTitle = {
  color: "#18181b",
  fontSize: 13,
  fontWeight: 750,
  lineHeight: 1.35,
};

const productionBlueprintCopy = {
  marginTop: 5,
  color: "#696a70",
  fontSize: 10,
  fontWeight: 400,
  lineHeight: 1.5,
};

const productionBlueprintDimensions = {
  marginTop: 7,
  color: "#3f3f46",
  fontSize: 9.5,
  fontWeight: 650,
};

const productionReadOnlyBadge = {
  minHeight: 22,
  marginTop: 8,
  padding: "3px 7px",
  boxSizing: "border-box",
  display: "inline-flex",
  alignItems: "center",
  border: "1px solid #d7d8dc",
  borderRadius: 0,
  background: "#ffffff",
  color: "#55565b",
  fontSize: 8.5,
  fontWeight: 700,
  letterSpacing: "0.055em",
  textTransform: "uppercase",
};

const productionBlueprintAction = {
  flex: "0 0 auto",
  alignSelf: "stretch",
  display: "flex",
  alignItems: "center",
};

const productionOpenButton = {
  minHeight: 34,
  padding: "6px 12px",
  border: "1px solid #18181b",
  borderRadius: 0,
  background: "#18181b",
  color: "#ffffff",
  fontSize: 10,
  fontWeight: 650,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const productionOpenButtonDisabled = {
  ...productionOpenButton,
  border: "1px solid #dedee2",
  background: "#f0f0f2",
  color: "#a0a1a6",
  cursor: "not-allowed",
};

const readyMessage = {
  marginTop: 12,
  padding: "10px 12px",
  border: "1px solid #d7d8dc",
  borderRadius: 0,
  background: "#fafafa",
  color: "#3f3f46",
  fontSize: 10.5,
  fontWeight: 550,
};
