import React, { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import api from "../../services/api";
import useAuthStore from "../../store/authStore";

const REQUIRED_STEPS = [
  "Cutting Machine",
  "Edge Banding",
  "Horizontal Drilling",
  "Retouching",
  "Packing",
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
    border: "#e4e4e7",
    label: "In Progress",
  },
  completed: {
    bg: "#0a0a0a",
    color: "#ffffff",
    border: "#0a0a0a",
    label: "Done",
  },
  blocked: {
    bg: "#fef2f2",
    color: "#991b1b",
    border: "#fecaca",
    label: "Blocked",
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
    border: "#e4e4e7",
    label: "In Production",
  },
  blocked: {
    bg: "#fef2f2",
    color: "#991b1b",
    border: "#fecaca",
    label: "Blocked",
  },
  ready: {
    bg: "#0a0a0a",
    color: "#ffffff",
    border: "#0a0a0a",
    label: "Ready for Shipping",
  },
};

const normalize = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

const formatDateTime = (value) => {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const getSortableTimestamp = (value) => {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

const getLatestTaskTimestamp = (taskList = []) =>
  taskList.reduce((latest, task) => {
    const candidate = getSortableTimestamp(
      task?.created_at || task?.assigned_at || task?.due_date,
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

export default function MyTasks() {
  const { user } = useAuthStore();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/tasks");

      const safeList = Array.isArray(data) ? data : [];
      const visible =
        user?.role === "admin"
          ? safeList
          : safeList.filter(
              (task) => Number(task.assigned_to) === Number(user?.id),
            );

      setTasks(visible);
    } catch (err) {
      toast.error(
        err?.response?.data?.message || "Failed to load production orders.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTasks();
  }, []); // eslint-disable-line

  const updateTaskStatus = async (taskId, status) => {
    try {
      setBusyId(taskId);

      const { data } = await api.put(`/tasks/${taskId}/status`, { status });

      setTasks((prev) =>
        prev.map((task) =>
          Number(task.id) === Number(taskId)
            ? {
                ...task,
                ...(data?.task || {}),
                status,
              }
            : task,
        ),
      );
    } catch (err) {
      toast.error(
        err?.response?.data?.message || "Failed to update production step.",
      );
    } finally {
      setBusyId(null);
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
          assignedToName: task.assigned_to_name || "—",
          assignedByName: task.assigned_by_name || "—",
          dueDate: task.due_date || null,
          deliveryAddress: task.delivery_address || "—",
          adminNote: task.description || "",
          rawTasks: [],
        });
      }

      const bucket = map.get(key);
      bucket.rawTasks.push(task);

      if (!bucket.dueDate && task.due_date) {
        bucket.dueDate = task.due_date;
      }

      if (!bucket.adminNote && task.description) {
        bucket.adminNote = task.description;
      }

      if (!bucket.assignedToName && task.assigned_to_name) {
        bucket.assignedToName = task.assigned_to_name;
      }

      if (!bucket.assignedByName && task.assigned_by_name) {
        bucket.assignedByName = task.assigned_by_name;
      }

      if (!bucket.deliveryAddress && task.delivery_address) {
        bucket.deliveryAddress = task.delivery_address;
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

        const readyForShipping =
          completedCount === REQUIRED_STEPS.length &&
          steps.every((step) => Boolean(step.task));

        let overallStatus = "assigned";
        if (readyForShipping) overallStatus = "ready";
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
          readyForShipping,
          latestTaskTimestamp: getLatestTaskTimestamp(order.rawTasks),
        };
      })
      .sort((a, b) => {
        if (b.latestTaskTimestamp !== a.latestTaskTimestamp) {
          return b.latestTaskTimestamp - a.latestTaskTimestamp;
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

  const summary = useMemo(() => {
    return {
      orders: groupedOrders.length,
      assigned: groupedOrders.filter((o) => o.overallStatus === "assigned")
        .length,
      inProgress: groupedOrders.filter((o) => o.overallStatus === "in_progress")
        .length,
      blocked: groupedOrders.filter((o) => o.overallStatus === "blocked")
        .length,
      ready: groupedOrders.filter((o) => o.readyForShipping).length,
    };
  }, [groupedOrders]);

  return (
    <div style={pageShell}>
      <div style={heroCard}>
        <div style={{ marginBottom: 24 }}>
          <h1 style={pageTitle}>Production Work Queue</h1>
          <p style={pageSubtitle}>
            Manage your assigned production orders, complete each manufacturing
            step, and notify admin when the order is ready for shipping review.
          </p>
        </div>

        <div style={summaryGrid}>
          <SummaryCard
            label="Assigned Orders"
            value={summary.orders}
            color="#0a0a0a"
          />
          <SummaryCard
            label="New Assignments"
            value={summary.assigned}
            color="#52525b"
          />
          <SummaryCard
            label="In Production"
            value={summary.inProgress}
            color="#18181b"
          />
          <SummaryCard
            label="Blocked"
            value={summary.blocked}
            color="#dc2626"
          />
          <SummaryCard
            label="Ready for Shipping"
            value={summary.ready}
            color="#0a0a0a"
          />
        </div>
      </div>

      <div style={boardCard}>
        <div style={boardHeader}>Assigned Production Orders — Newest First</div>

        {loading ? (
          <div style={emptyState}>Loading production orders...</div>
        ) : groupedOrders.length === 0 ? (
          <div style={emptyState}>No assigned production orders found.</div>
        ) : (
          <div style={orderList}>
            {groupedOrders.map((order) => {
              const orderMeta =
                ORDER_STATUS_META[order.overallStatus] ||
                ORDER_STATUS_META.assigned;

              return (
                <div key={order.key} style={orderCard}>
                  <div style={orderTop}>
                    <div style={{ flex: 1, minWidth: 260 }}>
                      <div style={orderHeaderRow}>
                        <span style={orderRefBadge}>
                          {order.orderNumber ||
                            `Order #${order.orderId || "—"}`}
                        </span>

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

                      <h3 style={orderTitle}>Production Order</h3>
                      <p style={orderSubtitle}>
                        Complete the full workflow from Cutting Machine up to
                        Packing, then wait for admin shipping review.
                      </p>
                    </div>

                    <div style={progressPanel}>
                      <div style={progressLabel}>
                        {order.completedCount}/{REQUIRED_STEPS.length} steps
                        completed
                      </div>
                      <div style={progressBarTrack}>
                        <div
                          style={{
                            ...progressBarFill,
                            width: `${order.progressPercent}%`,
                          }}
                        />
                      </div>
                      <div style={progressValue}>{order.progressPercent}%</div>
                    </div>
                  </div>

                  <div style={metaGrid}>
                    <Info label="Assigned To" value={order.assignedToName} />
                    <Info label="Assigned By" value={order.assignedByName} />
                    <Info
                      label="Assigned On"
                      value={
                        order.latestTaskTimestamp
                          ? formatDateTime(order.latestTaskTimestamp)
                          : "—"
                      }
                    />
                    <Info
                      label="Due Date"
                      value={order.dueDate ? formatDateTime(order.dueDate) : "—"}
                    />
                    <Info
                      label="Delivery Address"
                      value={order.deliveryAddress}
                    />
                  </div>

                  <div style={noteBox}>
                    <div style={noteTitle}>Admin Production Note</div>
                    <div style={noteText}>
                      {order.adminNote ||
                        "No additional production note provided."}
                    </div>
                  </div>

                  <div style={checklistWrap}>
                    <div style={checklistTitle}>Production Checklist</div>

                    <div style={stepList}>
                      {order.steps.map((step, stepIndex) => {
                        const stepMeta =
                          STEP_STATUS_META[step.status] ||
                          STEP_STATUS_META.pending;

                        const canStartThisStep = canStartStepInSequence(
                          order.steps,
                          stepIndex,
                        );

                        const previousRequiredStepLabel =
                          getPreviousRequiredStepLabel(order.steps, stepIndex);

                        return (
                          <div key={step.stepLabel} style={stepRow}>
                            <div style={stepLeft}>
                              <div style={stepName}>{step.stepLabel}</div>
                              <div style={stepSubtext}>
                                {step.task
                                  ? step.task.title
                                  : "Waiting for production packet creation"}
                              </div>
                            </div>

                            <div style={stepRight}>
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

                              {step.task ? (
                                <div style={stepActions}>
                                  {step.status === "pending" &&
                                    canStartThisStep && (
                                      <button
                                        onClick={() =>
                                          updateTaskStatus(
                                            step.task.id,
                                            "in_progress",
                                          )
                                        }
                                        disabled={busyId === step.task.id}
                                        style={
                                          busyId === step.task.id
                                            ? disabledGhostBtn
                                            : ghostBtn
                                        }
                                      >
                                        {busyId === step.task.id
                                          ? "Saving..."
                                          : "Start"}
                                      </button>
                                    )}

                                  {step.status === "pending" &&
                                    !canStartThisStep && (
                                      <span style={sequenceHint}>
                                        Complete {previousRequiredStepLabel}{" "}
                                        first
                                      </span>
                                    )}

                                  {step.status === "in_progress" && (
                                    <>
                                      <button
                                        onClick={() =>
                                          updateTaskStatus(
                                            step.task.id,
                                            "completed",
                                          )
                                        }
                                        disabled={busyId === step.task.id}
                                        style={
                                          busyId === step.task.id
                                            ? btnDisabled
                                            : successBtn
                                        }
                                      >
                                        {busyId === step.task.id
                                          ? "Saving..."
                                          : "Mark Done"}
                                      </button>

                                      <button
                                        onClick={() =>
                                          updateTaskStatus(
                                            step.task.id,
                                            "blocked",
                                          )
                                        }
                                        disabled={busyId === step.task.id}
                                        style={
                                          busyId === step.task.id
                                            ? btnDisabled
                                            : dangerBtn
                                        }
                                      >
                                        {busyId === step.task.id
                                          ? "Saving..."
                                          : "Report Blocker"}
                                      </button>
                                    </>
                                  )}

                                  {step.status === "blocked" && (
                                    <button
                                      onClick={() =>
                                        updateTaskStatus(
                                          step.task.id,
                                          "in_progress",
                                        )
                                      }
                                      disabled={busyId === step.task.id}
                                      style={
                                        busyId === step.task.id
                                          ? disabledGhostBtn
                                          : ghostBtn
                                      }
                                    >
                                      {busyId === step.task.id
                                        ? "Saving..."
                                        : "Resume"}
                                    </button>
                                  )}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {order.readyForShipping && (
                    <div style={readyBox}>
                      Full production workflow completed. Admin has been
                      notified that this order is ready for shipping review.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ label, value, color }) {
  return (
    <div style={summaryCard}>
      <div
        style={{
          fontSize: 26,
          fontWeight: 800,
          color,
          letterSpacing: "-0.02em",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 10,
          color: "#71717a",
          marginTop: 8,
          fontWeight: 800,
          textTransform: "uppercase",
          letterSpacing: "1px",
        }}
      >
        {label}
      </div>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <div style={infoLabel}>{label}</div>
      <div style={infoValue}>{value || "—"}</div>
    </div>
  );
}

const pageShell = {
  padding: 24,
  display: "flex",
  flexDirection: "column",
  gap: 16,
  fontFamily: "'Inter', sans-serif",
};

const heroCard = {
  background: "#ffffff",
  border: "1px solid #e4e4e7",
  borderRadius: 16,
  padding: "20px 24px",
  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
};

const pageTitle = {
  margin: 0,
  fontSize: 24,
  fontWeight: 800,
  color: "#0a0a0a",
  letterSpacing: "-0.02em",
};

const pageSubtitle = {
  margin: "6px 0 0",
  color: "#52525b",
  fontSize: 13,
  lineHeight: 1.5,
  maxWidth: 720,
};

const summaryGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  gap: 16,
};

const summaryCard = {
  background: "#fff",
  borderRadius: 12,
  border: "1px solid #e4e4e7",
  padding: "16px 20px",
  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
};

const boardCard = {
  background: "#fff",
  borderRadius: 16,
  border: "1px solid #e4e4e7",
  overflow: "hidden",
  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
};

const boardHeader = {
  padding: "20px 24px",
  borderBottom: "1px solid #e4e4e7",
  fontWeight: 800,
  fontSize: 16,
  color: "#0a0a0a",
  background: "#fafafa",
};

const emptyState = {
  padding: 40,
  color: "#71717a",
  textAlign: "center",
  fontSize: 13,
  fontWeight: 600,
};

const orderList = {
  display: "grid",
  gap: 16,
  padding: 20,
};

const orderCard = {
  border: "1px solid #e4e4e7",
  borderRadius: 12,
  padding: 20,
  background: "#ffffff",
  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
};

const orderTop = {
  display: "flex",
  justifyContent: "space-between",
  gap: 20,
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const orderHeaderRow = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  alignItems: "center",
};

const orderRefBadge = {
  background: "#f4f4f5",
  color: "#18181b",
  padding: "4px 10px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 700,
  border: "1px solid #e4e4e7",
};

const statusBadge = {
  padding: "4px 10px",
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "1px",
};

const orderTitle = {
  margin: "12px 0 6px",
  fontSize: 20,
  fontWeight: 800,
  color: "#0a0a0a",
  letterSpacing: "-0.01em",
};

const orderSubtitle = {
  margin: 0,
  color: "#52525b",
  fontSize: 13,
  lineHeight: 1.5,
};

const progressPanel = {
  minWidth: 240,
  maxWidth: 320,
  width: "100%",
  background: "#fafafa",
  padding: "14px",
  borderRadius: 12,
  border: "1px solid #e4e4e7",
};

const progressLabel = {
  fontSize: 11,
  fontWeight: 800,
  color: "#18181b",
  marginBottom: 8,
  textTransform: "uppercase",
  letterSpacing: "1px",
};

const progressBarTrack = {
  height: 8,
  background: "#e4e4e7",
  borderRadius: 999,
  overflow: "hidden",
};

const progressBarFill = {
  height: "100%",
  background: "#18181b",
  borderRadius: 999,
};

const progressValue = {
  marginTop: 8,
  fontSize: 12,
  fontWeight: 800,
  color: "#18181b",
  textAlign: "right",
};

const metaGrid = {
  marginTop: 20,
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: 16,
};

const infoLabel = {
  fontSize: 10,
  color: "#71717a",
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: "1px",
  marginBottom: 4,
};

const infoValue = {
  fontSize: 13,
  fontWeight: 600,
  color: "#18181b",
  wordBreak: "break-word",
};

const noteBox = {
  marginTop: 20,
  background: "#fafafa",
  border: "1px solid #e4e4e7",
  borderRadius: 10,
  padding: 14,
};

const noteTitle = {
  fontSize: 10,
  fontWeight: 800,
  color: "#18181b",
  textTransform: "uppercase",
  letterSpacing: "1px",
  marginBottom: 6,
};

const noteText = {
  fontSize: 13,
  color: "#52525b",
  lineHeight: 1.5,
  whiteSpace: "pre-wrap",
};

const checklistWrap = {
  marginTop: 24,
};

const checklistTitle = {
  fontSize: 15,
  fontWeight: 800,
  color: "#0a0a0a",
  marginBottom: 14,
  letterSpacing: "-0.01em",
};

const stepList = {
  display: "grid",
  gap: 12,
};

const stepRow = {
  border: "1px solid #e4e4e7",
  background: "#ffffff",
  borderRadius: 10,
  padding: "16px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 16,
  flexWrap: "wrap",
};

const stepLeft = {
  flex: 1,
  minWidth: 220,
};

const stepName = {
  fontSize: 14,
  fontWeight: 800,
  color: "#0a0a0a",
  marginBottom: 4,
};

const stepSubtext = {
  fontSize: 12,
  color: "#71717a",
  lineHeight: 1.5,
  fontWeight: 500,
};

const stepRight = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
};

const stepActions = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const readyBox = {
  marginTop: 20,
  background: "#fafafa",
  color: "#18181b",
  border: "1px solid #e4e4e7",
  borderRadius: 10,
  padding: "12px 16px",
  fontSize: 12,
  fontWeight: 700,
};

const ghostBtn = {
  background: "#f4f4f5",
  color: "#18181b",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  padding: "8px 14px",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: 12,
};

const disabledGhostBtn = {
  background: "#f4f4f5",
  color: "#a1a1aa",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  padding: "8px 14px",
  fontWeight: 700,
  cursor: "not-allowed",
  fontSize: 12,
};

const successBtn = {
  background: "#18181b",
  color: "#ffffff",
  border: "1px solid #18181b",
  borderRadius: 8,
  padding: "8px 14px",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: 12,
};

const dangerBtn = {
  background: "#fef2f2",
  color: "#991b1b",
  border: "1px solid #fecaca",
  borderRadius: 8,
  padding: "8px 14px",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: 12,
};

const btnDisabled = {
  background: "#e4e4e7",
  color: "#a1a1aa",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  padding: "8px 14px",
  fontWeight: 700,
  cursor: "not-allowed",
  fontSize: 12,
};

const sequenceHint = {
  fontSize: 11,
  fontWeight: 700,
  color: "#71717a",
  background: "#fafafa",
  border: "1px solid #e4e4e7",
  borderRadius: 999,
  padding: "6px 12px",
};