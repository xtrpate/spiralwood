// WISDOM INDOOR STAFF DASHBOARD UI V1
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  ClipboardList,
  Clock3,
  PackageCheck,
} from "lucide-react";
import api from "../../services/api";
import useAuthStore from "../../store/authStore";

const REQUIRED_STEPS = [
  "Cutting Machine",
  "Edge Banding",
  "Horizontal Drilling",
  "Retouching",
  "Packing",
];

const normalize = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

const toDateKey = (value) => {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const todayKey = () => toDateKey(new Date());

const formatDate = (value) => {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";

  return parsed.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatTime = (value) => {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";

  return parsed.toLocaleTimeString("en-PH", {
    hour: "numeric",
    minute: "2-digit",
  });
};

const safeTime = (value) => {
  if (!value) return 0;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
};

const getAssignedStaffId = (appointment) =>
  Number(
    appointment?.assigned_staff_id ??
      appointment?.assigned_to ??
      appointment?.assigned_provider_id ??
      0,
  );

const getPurposeLabel = (value) => {
  const key = normalize(value);
  if (key === "site_measurement") return "Site Measurement";
  if (key === "installation") return "Installation";
  if (key === "consultation") return "Consultation";

  return String(value || "Appointment")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const getAppointmentStatusLabel = (value) => {
  const key = normalize(value);
  if (key === "awaiting_staff_acceptance") return "Awaiting Acceptance";
  if (key === "confirmed") return "Confirmed";
  if (key === "pending") return "Pending";
  if (key === "completed") return "Completed";
  if (key === "cancelled") return "Cancelled";
  if (key === "rejected") return "Rejected";

  return String(value || "—")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const getWorkStatus = (taskList = []) => {
  const statuses = taskList.map((task) => normalize(task.status));

  if (
    taskList.length > 0 &&
    taskList.every((task) => normalize(task.status) === "completed")
  ) {
    return "ready";
  }

  if (statuses.includes("blocked")) return "blocked";

  if (
    statuses.includes("in_progress") ||
    statuses.includes("completed")
  ) {
    return "in_progress";
  }

  return "assigned";
};

const getWorkStatusLabel = (status) => {
  if (status === "ready") return "Ready";
  if (status === "blocked") return "Blocked";
  if (status === "in_progress") return "In Production";
  return "Assigned";
};

const getCurrentStep = (taskList = []) => {
  const sorted = [...taskList].sort((a, b) => {
    const aIndex = REQUIRED_STEPS.findIndex(
      (step) => normalize(step) === normalize(a.task_role),
    );
    const bIndex = REQUIRED_STEPS.findIndex(
      (step) => normalize(step) === normalize(b.task_role),
    );

    return (aIndex < 0 ? 999 : aIndex) - (bIndex < 0 ? 999 : bIndex);
  });

  const active = sorted.find(
    (task) => normalize(task.status) === "in_progress",
  );
  if (active) return active;

  const next = sorted.find(
    (task) => normalize(task.status) !== "completed",
  );
  if (next) return next;

  return sorted[sorted.length - 1] || null;
};

const groupAssignedWork = (tasks = [], userId) => {
  const visible = tasks.filter(
    (task) => Number(task.assigned_to) === Number(userId),
  );

  const grouped = new Map();

  visible.forEach((task) => {
    const key =
      task.order_id ||
      task.order_number ||
      `${task.assigned_to || "staff"}-${task.id}`;

    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        orderId: task.order_id || null,
        orderNumber: task.order_number || "—",
        dueDate: task.due_date || null,
        tasks: [],
      });
    }

    const group = grouped.get(key);
    group.tasks.push(task);

    if (!group.dueDate && task.due_date) {
      group.dueDate = task.due_date;
    }
  });

  return Array.from(grouped.values())
    .map((group) => {
      const currentTask = getCurrentStep(group.tasks);
      const status = getWorkStatus(group.tasks);

      const latestTime = group.tasks.reduce(
        (latest, task) =>
          Math.max(
            latest,
            safeTime(task.created_at),
            safeTime(task.assigned_at),
            safeTime(task.updated_at),
          ),
        0,
      );

      return {
        ...group,
        currentTask,
        currentStep:
          status === "ready"
            ? "Production Complete"
            : currentTask?.task_role || "Production Work",
        status,
        latestTime,
      };
    })
    .sort((a, b) => {
      if (b.latestTime !== a.latestTime) {
        return b.latestTime - a.latestTime;
      }

      return Number(b.orderId || 0) - Number(a.orderId || 0);
    });
};

const getInventoryStatus = (item) => {
  const explicit = normalize(item?.status);
  if (explicit === "out_of_stock") return "Out of Stock";
  if (explicit === "low_stock") return "Low Stock";

  const stock = Number(
    item?.stock ??
      item?.stock_quantity ??
      item?.quantity ??
      item?.current_stock ??
      0,
  );

  return stock <= 0 ? "Out of Stock" : "Low Stock";
};

const getInventoryStock = (item) =>
  Number(
    item?.stock ??
      item?.stock_quantity ??
      item?.quantity ??
      item?.current_stock ??
      0,
  );

const getInventoryName = (item) =>
  item?.product_name ||
  item?.name ||
  item?.material_name ||
  item?.item_name ||
  "Inventory Item";

const card = {
  background: "#ffffff",
  border: "1px solid #dcdde1",
  borderRadius: 0,
  boxShadow: "none",
};

const buttonBase = {
  minHeight: 34,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
  padding: "7px 11px",
  borderRadius: 0,
  fontSize: 11,
  fontWeight: 650,
  cursor: "pointer",
};

const secondaryButton = {
  ...buttonBase,
  border: "1px solid #18181b",
  background: "#ffffff",
  color: "#18181b",
};

const labelStyle = {
  color: "#77787e",
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: "0.075em",
  textTransform: "uppercase",
};

const valueStyle = {
  color: "#18181b",
  fontSize: 22,
  fontWeight: 800,
  lineHeight: 1,
  letterSpacing: "-0.02em",
};

function SummaryCard({ icon: Icon, label, value, emphasis = false }) {
  return (
    <div
      style={{
        ...card,
        minHeight: 82,
        padding: "16px 18px",
        display: "flex",
        alignItems: "center",
        gap: 14,
      }}
    >
      <div
        style={{
          width: 38,
          height: 38,
          flex: "0 0 38px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          border: "1px solid #dedee1",
          borderRadius: 0,
          background: emphasis ? "#18181b" : "#fafafa",
          color: emphasis ? "#ffffff" : "#18181b",
        }}
      >
        <Icon size={18} strokeWidth={1.8} />
      </div>

      <div>
        <div style={valueStyle}>{value}</div>
        <div style={{ ...labelStyle, marginTop: 7 }}>{label}</div>
      </div>
    </div>
  );
}

function StatusBadge({ children, strong = false, danger = false }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        minHeight: 24,
        padding: "4px 8px",
        borderRadius: 0,
        border: danger
          ? "1px solid #d7a3a3"
          : strong
            ? "1px solid #18181b"
            : "1px solid #d2d3d7",
        background: strong ? "#18181b" : "#ffffff",
        color: danger ? "#991b1b" : strong ? "#ffffff" : "#3f3f46",
        fontSize: 9.5,
        fontWeight: 700,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [tasks, setTasks] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [inventoryAlerts, setInventoryAlerts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);

      const [taskResult, appointmentResult, dashboardResult] =
        await Promise.allSettled([
          api.get("/tasks"),
          api.get("/pos/appointments"),
          api.get("/pos/dashboard"),
        ]);

      if (!active) return;

      setTasks(
        taskResult.status === "fulfilled" &&
          Array.isArray(taskResult.value?.data)
          ? taskResult.value.data
          : [],
      );

      setAppointments(
        appointmentResult.status === "fulfilled" &&
          Array.isArray(appointmentResult.value?.data)
          ? appointmentResult.value.data
          : [],
      );

      const dashboardData =
        dashboardResult.status === "fulfilled"
          ? dashboardResult.value?.data
          : null;

      setInventoryAlerts(
        Array.isArray(dashboardData?.low_stock_alerts)
          ? dashboardData.low_stock_alerts
          : [],
      );

      setLoading(false);
    };

    load();

    return () => {
      active = false;
    };
  }, []);

  const work = useMemo(
    () => groupAssignedWork(tasks, user?.id),
    [tasks, user?.id],
  );

  const assignedAppointments = useMemo(
    () =>
      appointments
        .filter(
          (appointment) =>
            getAssignedStaffId(appointment) === Number(user?.id || 0),
        )
        .sort(
          (a, b) =>
            safeTime(a.scheduled_date) - safeTime(b.scheduled_date),
        ),
    [appointments, user?.id],
  );

  const todaysAppointments = useMemo(
    () =>
      assignedAppointments.filter(
        (appointment) =>
          toDateKey(appointment.scheduled_date) === todayKey() &&
          !["completed", "cancelled", "rejected"].includes(
            normalize(appointment.status),
          ),
      ),
    [assignedAppointments],
  );

  const inProductionCount = work.filter(
    (item) => item.status === "in_progress",
  ).length;

  const visibleWork = work.slice(0, 5);
  const visibleAppointments = todaysAppointments.slice(0, 4);
  const visibleInventoryAlerts = inventoryAlerts.slice(0, 5);

  const todayLabel = new Date().toLocaleDateString("en-PH", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div
      style={{
        width: "100%",
        boxSizing: "border-box",
        paddingBottom: 36,
        color: "#18181b",
      }}
    >
      <header
        style={{
          marginBottom: 20,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
        }}
      >
        <div>
          <h1
            style={{
              margin: 0,
              color: "#0a0a0a",
              fontSize: 24,
              fontWeight: 800,
              lineHeight: 1.15,
              letterSpacing: "-0.025em",
            }}
          >
            Staff Dashboard
          </h1>
          <p
            style={{
              margin: "6px 0 0",
              color: "#68696f",
              fontSize: 12.5,
              fontWeight: 400,
              lineHeight: 1.5,
            }}
          >
            Your assigned work and today's priorities.
          </p>
        </div>

        <div
          style={{
            color: "#85868b",
            fontSize: 10.5,
            fontWeight: 400,
            whiteSpace: "nowrap",
            paddingTop: 4,
          }}
        >
          {todayLabel}
        </div>
      </header>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 10,
          marginBottom: 16,
        }}
      >
        <SummaryCard
          icon={ClipboardList}
          label="Assigned Work"
          value={loading ? "—" : work.length}
        />
        <SummaryCard
          icon={PackageCheck}
          label="In Production"
          value={loading ? "—" : inProductionCount}
          emphasis
        />
        <SummaryCard
          icon={CalendarClock}
          label="Appointments Today"
          value={loading ? "—" : todaysAppointments.length}
        />
        <SummaryCard
          icon={AlertTriangle}
          label="Inventory Alerts"
          value={loading ? "—" : inventoryAlerts.length}
        />
      </section>

      <section style={{ ...card, marginBottom: 16 }}>
        <div
          style={{
            minHeight: 60,
            padding: "14px 16px",
            boxSizing: "border-box",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            borderBottom: "1px solid #e7e7ea",
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                color: "#18181b",
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              My Work
            </h2>
            <p
              style={{
                margin: "4px 0 0",
                color: "#7d7e83",
                fontSize: 10.5,
                lineHeight: 1.4,
              }}
            >
              Your latest assigned production work.
            </p>
          </div>

          <button
            type="button"
            style={secondaryButton}
            onClick={() => navigate("/staff/tasks")}
          >
            View all
          </button>
        </div>

        {loading ? (
          <div
            style={{
              padding: 28,
              color: "#77787e",
              fontSize: 11.5,
              textAlign: "center",
            }}
          >
            Loading assigned work...
          </div>
        ) : visibleWork.length === 0 ? (
          <div
            style={{
              padding: 28,
              color: "#77787e",
              fontSize: 11.5,
              textAlign: "center",
            }}
          >
            No production work is assigned to you.
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                tableLayout: "fixed",
                fontSize: 11.5,
              }}
            >
              <thead>
                <tr style={{ background: "#fafafa" }}>
                  {[
                    ["Order", "24%"],
                    ["Current Step", "29%"],
                    ["Due Date", "18%"],
                    ["Status", "18%"],
                    ["", "11%"],
                  ].map(([label, width]) => (
                    <th
                      key={label || "action"}
                      style={{
                        width,
                        padding: "10px 16px",
                        borderBottom: "1px solid #e7e7ea",
                        color: "#77787e",
                        fontSize: 8.5,
                        fontWeight: 700,
                        letterSpacing: "0.075em",
                        textAlign: label ? "left" : "right",
                        textTransform: "uppercase",
                      }}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {visibleWork.map((item) => (
                  <tr key={item.key}>
                    <td
                      style={{
                        padding: "13px 16px",
                        borderBottom: "1px solid #ededf0",
                        color: "#18181b",
                        fontWeight: 700,
                      }}
                    >
                      {item.orderNumber}
                    </td>

                    <td
                      style={{
                        padding: "13px 16px",
                        borderBottom: "1px solid #ededf0",
                        color: "#3f3f46",
                        fontWeight: 500,
                      }}
                    >
                      {item.currentStep}
                    </td>

                    <td
                      style={{
                        padding: "13px 16px",
                        borderBottom: "1px solid #ededf0",
                        color: "#52525b",
                        fontWeight: 400,
                      }}
                    >
                      {formatDate(item.dueDate)}
                    </td>

                    <td
                      style={{
                        padding: "13px 16px",
                        borderBottom: "1px solid #ededf0",
                      }}
                    >
                      <StatusBadge
                        strong={item.status === "ready"}
                        danger={item.status === "blocked"}
                      >
                        {getWorkStatusLabel(item.status)}
                      </StatusBadge>
                    </td>

                    <td
                      style={{
                        padding: "10px 16px",
                        borderBottom: "1px solid #ededf0",
                        textAlign: "right",
                      }}
                    >
                      <button
                        type="button"
                        style={{
                          ...secondaryButton,
                          minHeight: 30,
                          padding: "5px 9px",
                          fontSize: 10,
                        }}
                        onClick={() =>
                          navigate(
                            item.currentTask?.id
                              ? `/staff/tasks?focus_task_id=${item.currentTask.id}`
                              : "/staff/tasks",
                          )
                        }
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
          gap: 16,
        }}
      >
        <section style={card}>
          <div
            style={{
              minHeight: 60,
              padding: "14px 16px",
              boxSizing: "border-box",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              borderBottom: "1px solid #e7e7ea",
            }}
          >
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                Today's Appointments
              </h2>
              <p
                style={{
                  margin: "4px 0 0",
                  color: "#7d7e83",
                  fontSize: 10.5,
                }}
              >
                Appointments assigned to you today.
              </p>
            </div>

            <button
              type="button"
              style={{
                ...secondaryButton,
                minHeight: 30,
                padding: "5px 9px",
                fontSize: 10,
              }}
              onClick={() => navigate("/staff/appointment")}
            >
              View all
            </button>
          </div>

          {loading ? (
            <div
              style={{
                padding: 28,
                color: "#77787e",
                fontSize: 11.5,
                textAlign: "center",
              }}
            >
              Loading appointments...
            </div>
          ) : visibleAppointments.length === 0 ? (
            <div
              style={{
                padding: 28,
                color: "#77787e",
                fontSize: 11.5,
                textAlign: "center",
              }}
            >
              No appointments assigned for today.
            </div>
          ) : (
            <div>
              {visibleAppointments.map((appointment) => (
                <div
                  key={appointment.id}
                  style={{
                    minHeight: 66,
                    padding: "12px 16px",
                    boxSizing: "border-box",
                    display: "grid",
                    gridTemplateColumns: "72px minmax(0, 1fr) auto",
                    alignItems: "center",
                    gap: 12,
                    borderBottom: "1px solid #ededf0",
                  }}
                >
                  <div>
                    <div
                      style={{
                        color: "#18181b",
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      {formatTime(appointment.scheduled_date)}
                    </div>
                    <div
                      style={{
                        marginTop: 3,
                        color: "#85868b",
                        fontSize: 9,
                      }}
                    >
                      Today
                    </div>
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        color: "#252529",
                        fontSize: 11.5,
                        fontWeight: 600,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {appointment.customer_name ||
                        appointment.customer ||
                        `Appointment ${appointment.id}`}
                    </div>
                    <div
                      style={{
                        marginTop: 4,
                        color: "#77787e",
                        fontSize: 9.5,
                      }}
                    >
                      {getPurposeLabel(appointment.purpose)}
                    </div>
                  </div>

                  <StatusBadge
                    strong={normalize(appointment.status) === "completed"}
                  >
                    {getAppointmentStatusLabel(appointment.status)}
                  </StatusBadge>
                </div>
              ))}
            </div>
          )}
        </section>

        <section style={card}>
          <div
            style={{
              minHeight: 60,
              padding: "14px 16px",
              boxSizing: "border-box",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              borderBottom: "1px solid #e7e7ea",
            }}
          >
            <div>
              <h2
                style={{
                  margin: 0,
                  fontSize: 14,
                  fontWeight: 700,
                }}
              >
                Inventory Alerts
              </h2>
              <p
                style={{
                  margin: "4px 0 0",
                  color: "#7d7e83",
                  fontSize: 10.5,
                }}
              >
                Stock conditions that may affect current work.
              </p>
            </div>

            <button
              type="button"
              style={{
                ...secondaryButton,
                minHeight: 30,
                padding: "5px 9px",
                fontSize: 10,
              }}
              onClick={() => navigate("/staff/inventory")}
            >
              View inventory
            </button>
          </div>

          {loading ? (
            <div
              style={{
                padding: 28,
                color: "#77787e",
                fontSize: 11.5,
                textAlign: "center",
              }}
            >
              Loading inventory alerts...
            </div>
          ) : visibleInventoryAlerts.length === 0 ? (
            <div
              style={{
                padding: 28,
                color: "#77787e",
                fontSize: 11.5,
                textAlign: "center",
              }}
            >
              No inventory alerts right now.
            </div>
          ) : (
            <div>
              {visibleInventoryAlerts.map((item, index) => {
                const status = getInventoryStatus(item);
                const stock = getInventoryStock(item);

                return (
                  <div
                    key={item.id || `${getInventoryName(item)}-${index}`}
                    style={{
                      minHeight: 66,
                      padding: "12px 16px",
                      boxSizing: "border-box",
                      display: "grid",
                      gridTemplateColumns: "minmax(0, 1fr) 64px auto",
                      alignItems: "center",
                      gap: 12,
                      borderBottom: "1px solid #ededf0",
                    }}
                  >
                    <div
                      style={{
                        color: "#252529",
                        fontSize: 11.5,
                        fontWeight: 600,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {getInventoryName(item)}
                    </div>

                    <div>
                      <div
                        style={{
                          color: "#18181b",
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        {stock}
                      </div>
                      <div
                        style={{
                          marginTop: 3,
                          color: "#85868b",
                          fontSize: 9,
                        }}
                      >
                        Stock
                      </div>
                    </div>

                    <StatusBadge danger={status === "Out of Stock"}>
                      {status}
                    </StatusBadge>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <style>{`
        @media (max-width: 1050px) {
          .pos-main > div > section:first-of-type {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 760px) {
          .pos-main > div > header {
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  );
}
