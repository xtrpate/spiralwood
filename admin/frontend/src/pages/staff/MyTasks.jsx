// WISDOM INDOOR MY TASKS UI V1
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import api from "../../services/api";
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
  { key: "blocked", label: "Blocked" },
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
    border: "#cfcfd4",
    label: "In Production",
  },
  blocked: {
    bg: "#ffffff",
    color: "#991b1b",
    border: "#d8a3a3",
    label: "Blocked",
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

const formatDate = (value) => {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const getSortableTimestamp = (value) => {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

const getLatestTaskTimestamp = (taskList = []) =>
  taskList.reduce((latest, task) => {
    const candidate = Math.max(
      getSortableTimestamp(task?.created_at),
      getSortableTimestamp(task?.assigned_at),
      getSortableTimestamp(task?.updated_at),
      getSortableTimestamp(task?.due_date),
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
  const { user } = useAuthStore();

  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [expandedOrderKey, setExpandedOrderKey] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [focusedTaskId, setFocusedTaskId] = useState(null);

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
        err?.response?.data?.message || "Failed to load production work.",
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

      setTasks((previous) =>
        previous.map((task) =>
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
          assignedByName: task.assigned_by_name || "—",
          dueDate: task.due_date || null,
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
    <div style={pageShell}>
      <header style={pageHeader}>
        <div>
          <h1 style={pageTitle}>My Production Work</h1>
          <p style={pageSubtitle}>
            Complete your assigned production steps in order.
          </p>
        </div>
      </header>

      <section style={summaryGrid}>
        <SummaryCard label="New Assignments" value={summary.assigned} />
        <SummaryCard
          label="In Production"
          value={summary.inProgress}
          emphasized
        />
        <SummaryCard
          label="Blocked"
          value={summary.blocked}
          danger={summary.blocked > 0}
        />
        <SummaryCard label="Ready" value={summary.ready} />
      </section>

      <section style={toolbar}>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search order or production step"
          aria-label="Search production work"
          style={searchInput}
        />

        <div style={filterRow}>
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

      <section style={listPanel}>
        <div style={listHeader}>
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
          <div style={orderList}>
            {visibleOrders.map((order) => {
              const orderMeta =
                ORDER_STATUS_META[order.overallStatus] ||
                ORDER_STATUS_META.assigned;

              const isExpanded = expandedOrderKey === order.key;
              const currentStep =
                order.ready
                  ? "Production Complete"
                  : order.currentStep?.stepLabel || "Production Work";

              return (
                <article
                  key={order.key}
                  id={`order-group-${order.orderId || order.key}`}
                  style={orderCard}
                >
                  <div style={orderSummary}>
                    <div style={orderPrimary}>
                      <div style={orderHeadingRow}>
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

                      <div style={metaGrid}>
                        <Info
                          label="Due Date"
                          value={formatDate(order.dueDate)}
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

                    <div style={orderActionColumn}>
                      <div style={progressArea}>
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
                    <div style={expandedArea}>
                      <ProductionBlueprintPanel
                        orderId={order.orderId}
                        orderNumber={order.orderNumber}
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

                          const previousStep = getPreviousRequiredStepLabel(
                            order.steps,
                            stepIndex,
                          );

                          const isFocused =
                            step.task &&
                            Number(focusedTaskId) === Number(step.task.id);

                          return (
                            <div
                              key={step.stepLabel}
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
                                ) : step.status === "pending" &&
                                  !canStartThisStep ? (
                                  <div style={stepHint}>
                                    Finish {previousStep} first
                                  </div>
                                ) : null}
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
                                            updateTaskStatus(
                                              step.task.id,
                                              "completed",
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
                                            updateTaskStatus(
                                              step.task.id,
                                              "blocked",
                                            )
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
                                            : "Report Blocker"}
                                        </button>
                                      </>
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
                                          : "Resume"}
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
    <div style={productionBlueprintPanel}>
      <div style={productionBlueprintPreview}>
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

      <div style={productionBlueprintContent}>
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

      <div style={productionBlueprintAction}>
        <button
          type="button"
          onClick={() => navigate(`/staff/tasks/${Number(orderId)}/blueprint`)}
          disabled={!blueprint}
          style={blueprint ? productionOpenButton : productionOpenButtonDisabled}
        >
          View Blueprint
        </button>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, emphasized = false, danger = false }) {
  return (
    <div style={summaryCard}>
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
  borderColor: "#18181b",
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
  borderColor: "#dedee2",
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
