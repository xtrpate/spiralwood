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
  pending: { bg: "#f8fafc", color: "#475569", label: "Not Started" },
  in_progress: { bg: "#fff7ed", color: "#c2410c", label: "In Progress" },
  completed: { bg: "#ecfdf5", color: "#047857", label: "Done" },
  blocked: { bg: "#fef2f2", color: "#b91c1c", label: "Blocked" },
};

const ORDER_STATUS_META = {
  assigned: { bg: "#eff6ff", color: "#1d4ed8", label: "Assigned" },
  in_progress: { bg: "#fff7ed", color: "#c2410c", label: "In Production" },
  blocked: { bg: "#fef2f2", color: "#b91c1c", label: "Blocked" },
  ready: { bg: "#ecfdf5", color: "#047857", label: "Ready for Shipping" },
};

const normalize = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

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
      await api.put(`/tasks/${taskId}/status`, { status });
      toast.success("Production step updated.");
      await loadTasks();
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
        };
      })
      .sort((a, b) => {
        if (a.readyForShipping && !b.readyForShipping) return -1;
        if (!a.readyForShipping && b.readyForShipping) return 1;
        return String(a.orderNumber).localeCompare(String(b.orderNumber));
      });
  }, [tasks]);

  const summary = useMemo(() => {
    return {
      orders: groupedOrders.length,
      assigned: groupedOrders.filter((o) => o.overallStatus === "assigned")
        .length,
      inProgress: groupedOrders.filter((o) => o.overallStatus === "in_progress")
        .length,
      blocked: groupedOrders.filter((o) => o.overallStatus === "blocked").length,
      ready: groupedOrders.filter((o) => o.readyForShipping).length,
    };
  }, [groupedOrders]);

  return (
    <div style={pageShell}>
      <div style={heroCard}>
        <div style={{ marginBottom: 16 }}>
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
            color="#2563eb"
          />
          <SummaryCard
            label="New Assignments"
            value={summary.assigned}
            color="#64748b"
          />
          <SummaryCard
            label="In Production"
            value={summary.inProgress}
            color="#c2410c"
          />
          <SummaryCard
            label="Blocked"
            value={summary.blocked}
            color="#b91c1c"
          />
          <SummaryCard
            label="Ready for Shipping"
            value={summary.ready}
            color="#047857"
          />
        </div>
      </div>

      <div style={boardCard}>
        <div style={boardHeader}>Assigned Production Orders</div>

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
                          {order.orderNumber || `Order #${order.orderId || "—"}`}
                        </span>

                        <span
                          style={{
                            ...statusBadge,
                            background: orderMeta.bg,
                            color: orderMeta.color,
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
                      label="Due Date"
                      value={
                        order.dueDate
                          ? new Date(order.dueDate).toLocaleString()
                          : "—"
                      }
                    />
                    <Info
                      label="Delivery Address"
                      value={order.deliveryAddress}
                    />
                  </div>

                  <div style={noteBox}>
                    <div style={noteTitle}>Admin Production Note</div>
                    <div style={noteText}>
                      {order.adminNote || "No additional production note provided."}
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
                                }}
                              >
                                {stepMeta.label}
                              </span>

                              {step.task ? (
                                <div style={stepActions}>
                                  {step.status === "pending" && canStartThisStep && (
                                    <button
                                      onClick={() =>
                                        updateTaskStatus(
                                          step.task.id,
                                          "in_progress",
                                        )
                                      }
                                      disabled={busyId === step.task.id}
                                      style={ghostBtn}
                                    >
                                      Start
                                    </button>
                                  )}

                                  {step.status === "pending" &&
                                    !canStartThisStep && (
                                      <span style={sequenceHint}>
                                        Complete {previousRequiredStepLabel} first
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
                                        style={successBtn}
                                      >
                                        Mark Done
                                      </button>
                                      <button
                                        onClick={() =>
                                          updateTaskStatus(
                                            step.task.id,
                                            "blocked",
                                          )
                                        }
                                        disabled={busyId === step.task.id}
                                        style={dangerBtn}
                                      >
                                        Report Blocker
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
                                      style={ghostBtn}
                                    >
                                      Resume
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
      <div style={{ fontSize: 28, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
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
};

const heroCard = {
  background: "#ffffff",
  border: "1px solid #e5e7eb",
  borderRadius: 18,
  padding: 18,
  boxShadow: "0 8px 24px rgba(15, 23, 42, 0.05)",
};

const pageTitle = {
  margin: 0,
  fontSize: 30,
  fontWeight: 800,
  color: "#0f172a",
};

const pageSubtitle = {
  margin: "8px 0 0",
  color: "#64748b",
  fontSize: 14,
  lineHeight: 1.6,
};

const summaryGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(5, minmax(120px, 1fr))",
  gap: 12,
};

const summaryCard = {
  background: "#fff",
  borderRadius: 14,
  border: "1px solid #e5e7eb",
  padding: 16,
};

const boardCard = {
  background: "#fff",
  borderRadius: 16,
  border: "1px solid #e5e7eb",
  overflow: "hidden",
  boxShadow: "0 10px 30px rgba(2, 6, 23, 0.05)",
};

const boardHeader = {
  padding: "16px 20px",
  borderBottom: "1px solid #f1f5f9",
  fontWeight: 700,
  fontSize: 18,
  color: "#0f172a",
};

const emptyState = {
  padding: 24,
  color: "#64748b",
};

const orderList = {
  display: "grid",
  gap: 16,
  padding: 18,
};

const orderCard = {
  border: "1px solid #e2e8f0",
  borderRadius: 16,
  padding: 18,
  background: "#ffffff",
};

const orderTop = {
  display: "flex",
  justifyContent: "space-between",
  gap: 18,
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const orderHeaderRow = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
};

const orderRefBadge = {
  background: "#eff6ff",
  color: "#1d4ed8",
  padding: "5px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
};

const statusBadge = {
  padding: "5px 10px",
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 700,
};

const orderTitle = {
  margin: "12px 0 6px",
  fontSize: 24,
  fontWeight: 800,
  color: "#111827",
};

const orderSubtitle = {
  margin: 0,
  color: "#475569",
  fontSize: 14,
  lineHeight: 1.6,
};

const progressPanel = {
  minWidth: 240,
  maxWidth: 320,
  width: "100%",
};

const progressLabel = {
  fontSize: 13,
  fontWeight: 700,
  color: "#334155",
  marginBottom: 8,
};

const progressBarTrack = {
  height: 10,
  background: "#e2e8f0",
  borderRadius: 999,
  overflow: "hidden",
};

const progressBarFill = {
  height: "100%",
  background: "linear-gradient(90deg, #2563eb, #0ea5e9)",
  borderRadius: 999,
};

const progressValue = {
  marginTop: 8,
  fontSize: 12,
  fontWeight: 700,
  color: "#0f172a",
};

const metaGrid = {
  marginTop: 16,
  display: "grid",
  gridTemplateColumns: "repeat(4, minmax(160px, 1fr))",
  gap: 12,
};

const infoLabel = {
  fontSize: 12,
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: 0.5,
  marginBottom: 4,
};

const infoValue = {
  fontSize: 14,
  fontWeight: 600,
  color: "#1f2937",
  wordBreak: "break-word",
};

const noteBox = {
  marginTop: 16,
  background: "#f8fafc",
  border: "1px solid #e2e8f0",
  borderRadius: 12,
  padding: 14,
};

const noteTitle = {
  fontSize: 12,
  fontWeight: 700,
  color: "#334155",
  textTransform: "uppercase",
  letterSpacing: 0.6,
  marginBottom: 6,
};

const noteText = {
  fontSize: 14,
  color: "#475569",
  lineHeight: 1.6,
  whiteSpace: "pre-wrap",
};

const checklistWrap = {
  marginTop: 18,
};

const checklistTitle = {
  fontSize: 15,
  fontWeight: 800,
  color: "#0f172a",
  marginBottom: 12,
};

const stepList = {
  display: "grid",
  gap: 10,
};

const stepRow = {
  border: "1px solid #e5e7eb",
  borderRadius: 12,
  padding: 14,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  flexWrap: "wrap",
};

const stepLeft = {
  flex: 1,
  minWidth: 220,
};

const stepName = {
  fontSize: 15,
  fontWeight: 700,
  color: "#111827",
  marginBottom: 4,
};

const stepSubtext = {
  fontSize: 13,
  color: "#64748b",
  lineHeight: 1.5,
};

const stepRight = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
};

const stepActions = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const readyBox = {
  marginTop: 16,
  background: "#ecfdf5",
  color: "#047857",
  border: "1px solid #a7f3d0",
  borderRadius: 12,
  padding: "12px 14px",
  fontSize: 13,
  fontWeight: 700,
};

const ghostBtn = {
  background: "#fff",
  color: "#334155",
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  padding: "10px 14px",
  fontWeight: 700,
  cursor: "pointer",
};

const successBtn = {
  background: "#ecfdf5",
  color: "#047857",
  border: "1px solid #a7f3d0",
  borderRadius: 10,
  padding: "10px 14px",
  fontWeight: 700,
  cursor: "pointer",
};

const dangerBtn = {
  background: "#fef2f2",
  color: "#b91c1c",
  border: "1px solid #fecaca",
  borderRadius: 10,
  padding: "10px 14px",
  fontWeight: 700,
  cursor: "pointer",
};

const sequenceHint = {
  fontSize: 12,
  fontWeight: 700,
  color: "#92400e",
  background: "#fffbeb",
  border: "1px solid #fde68a",
  borderRadius: 999,
  padding: "6px 10px",
};