// src/pages/tasks/TasksPage.jsx
import React, { useEffect, useState, useCallback } from "react";
import api from "../../services/api";
import toast from "react-hot-toast";
import useAuthStore from "../../store/authStore";

const PRIORITY_ROLES = [
  "Cabinet Maker",
  "Installer",
  "Quality Inspector",
  "Other",
];

const STATUS_META = {
  pending: {
    label: "Pending",
    bg: "#f1f5f9",
    color: "#475569",
    border: "#e2e8f0",
  },
  in_progress: {
    label: "In Progress",
    bg: "#eff6ff",
    color: "#1d4ed8",
    border: "#bfdbfe",
  },
  completed: {
    label: "Completed",
    bg: "#f0fdf4",
    color: "#15803d",
    border: "#bbf7d0",
  },
  blocked: {
    label: "Blocked",
    bg: "#fef2f2",
    color: "#b91c1c",
    border: "#fecaca",
  },
};

const ROLE_COLOR = {
  "Cabinet Maker": { bg: "#fdf4ff", color: "#7e22ce" },
  Installer: { bg: "#fff7ed", color: "#c2410c" },
  "Quality Inspector": { bg: "#eff6ff", color: "#1d4ed8" },
  Other: { bg: "#f8fafc", color: "#475569" },
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

export default function TasksPage() {
  const { user: me } = useAuthStore();
  const isAdmin = me?.role === "admin";

  const [tasks, setTasks] = useState([]);
  const [staff, setStaff] = useState([]);
  const [orders, setOrders] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [target, setTarget] = useState(null);
  const [saving, setSaving] = useState(false);
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterRole, setFilterRole] = useState("all");
  const [search, setSearch] = useState("");

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: t }, { data: n }] = await Promise.all([
        api.get("/tasks"),
        api.get("/tasks/notifications"),
      ]);
      setTasks(t);
      setNotifications(n);
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

  // Poll notifications every 30s
  useEffect(() => {
    const iv = setInterval(async () => {
      try {
        const { data } = await api.get("/tasks/notifications");
        setNotifications(data);
      } catch {}
    }, 30000);
    return () => clearInterval(iv);
  }, []);

  const openCreate = () => {
    setForm(BLANK);
    setTarget(null);
    setModal("create");
  };
  const openEdit = (t) => {
    setForm({
      title: t.title,
      description: t.description || "",
      assigned_to: String(t.assigned_to || ""),
      task_role: t.task_role,
      due_date: t.due_date ? t.due_date.slice(0, 16) : "",
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
        await api.put(`/tasks/${target.id}`, payload);
        toast.success("Task updated.");
      }
      setModal(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to save task.");
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
    } catch {
      toast.error("Failed to delete task.");
    }
  };

  const markAllRead = async () => {
    try {
      await api.patch("/tasks/notifications/read-all");
      setNotifications((p) => p.map((n) => ({ ...n, is_read: 1 })));
      toast.success("All notifications cleared.");
    } catch {}
  };

  const markOneRead = async (id) => {
    try {
      await api.patch(`/tasks/notifications/${id}/read`);
      setNotifications((p) =>
        p.map((n) => (n.id === id ? { ...n, is_read: 1 } : n)),
      );
    } catch {}
  };

  // Filters
  const filtered = tasks.filter((t) => {
    const mStatus = filterStatus === "all" || t.status === filterStatus;
    const mRole = filterRole === "all" || t.task_role === filterRole;
    const mSearch =
      !search ||
      t.title.toLowerCase().includes(search.toLowerCase()) ||
      t.assigned_to_name.toLowerCase().includes(search.toLowerCase()) ||
      (t.order_number || "").toLowerCase().includes(search.toLowerCase());
    return mStatus && mRole && mSearch;
  });

  const stats = {
    total: tasks.length,
    pending: tasks.filter((t) => t.status === "pending").length,
    in_progress: tasks.filter((t) => t.status === "in_progress").length,
    completed: tasks.filter((t) => t.status === "completed").length,
    blocked: tasks.filter((t) => t.status === "blocked").length,
  };

  const isOverdue = (t) =>
    t.due_date && t.status !== "completed" && new Date(t.due_date) < new Date();

  // ── Styles ──────────────────────────────────────────────────────────────────
  const S = {
    page: { padding: "28px 32px", background: "#f8fafc", minHeight: "100vh" },
    header: {
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      marginBottom: 24,
    },
    title: { fontSize: 22, fontWeight: 700, color: "#0f172a", margin: 0 },
    sub: { fontSize: 13, color: "#64748b", marginTop: 3 },
    statRow: {
      display: "grid",
      gridTemplateColumns: "repeat(5,1fr)",
      gap: 14,
      marginBottom: 24,
    },
    stat: {
      background: "#fff",
      border: "1px solid #e2e8f0",
      borderRadius: 12,
      padding: "16px 20px",
    },
    statNum: { fontSize: 28, fontWeight: 800, color: "#0f172a" },
    statLbl: { fontSize: 12, color: "#64748b", marginTop: 2 },
    toolbar: {
      display: "flex",
      gap: 10,
      marginBottom: 20,
      alignItems: "center",
      flexWrap: "wrap",
    },
    input: {
      padding: "8px 12px",
      border: "1px solid #e2e8f0",
      borderRadius: 8,
      fontSize: 13,
      background: "#fff",
      outline: "none",
    },
    select: {
      padding: "8px 12px",
      border: "1px solid #e2e8f0",
      borderRadius: 8,
      fontSize: 13,
      background: "#fff",
      cursor: "pointer",
    },
    btn: {
      padding: "8px 18px",
      borderRadius: 8,
      border: "none",
      cursor: "pointer",
      fontSize: 13,
      fontWeight: 600,
    },
    btnPrim: { background: "#2563eb", color: "#fff" },
    btnGray: {
      background: "#f1f5f9",
      color: "#475569",
      border: "1px solid #e2e8f0",
    },
    btnRed: {
      background: "#fef2f2",
      color: "#b91c1c",
      border: "1px solid #fecaca",
    },
    card: {
      background: "#fff",
      border: "1px solid #e2e8f0",
      borderRadius: 12,
      padding: "18px 20px",
      marginBottom: 10,
    },
    tag: (bg, color, border) => ({
      display: "inline-block",
      padding: "2px 10px",
      borderRadius: 20,
      fontSize: 11,
      fontWeight: 600,
      background: bg,
      color,
      border: `1px solid ${border || bg}`,
    }),
    overlay: {
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,.45)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000,
    },
    modal: {
      background: "#fff",
      borderRadius: 14,
      width: 560,
      maxHeight: "90vh",
      overflowY: "auto",
      padding: 28,
      boxShadow: "0 20px 60px rgba(0,0,0,.25)",
    },
    mTitle: {
      fontSize: 18,
      fontWeight: 700,
      color: "#0f172a",
      marginBottom: 20,
    },
    label: {
      fontSize: 12,
      fontWeight: 600,
      color: "#475569",
      display: "block",
      marginBottom: 5,
    },
    mInput: {
      width: "100%",
      padding: "9px 12px",
      border: "1px solid #e2e8f0",
      borderRadius: 8,
      fontSize: 13,
      boxSizing: "border-box",
      outline: "none",
    },
    mRow: { marginBottom: 16 },
    half: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 },
    notifItem: (isRead) => ({
      padding: "12px 14px",
      borderRadius: 8,
      marginBottom: 8,
      cursor: "pointer",
      background: isRead ? "#f8fafc" : "#eff6ff",
      border: `1px solid ${isRead ? "#e2e8f0" : "#bfdbfe"}`,
    }),
  };

  return (
    <div style={S.page}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={S.header}>
        <div>
          <h1 style={S.title}>📋 Task Assignments</h1>
          <p style={S.sub}>
            {isAdmin
              ? "Assign project tasks to staff and track progress."
              : "Your assigned tasks and their current status."}
          </p>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            style={{ ...S.btn, ...S.btnGray, position: "relative" }}
            onClick={() => setModal("notif")}
          >
            🔔 Notifications
            {unreadCount > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: -7,
                  right: -7,
                  background: "#ef4444",
                  color: "#fff",
                  borderRadius: "50%",
                  width: 18,
                  height: 18,
                  fontSize: 10,
                  fontWeight: 700,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>
          {isAdmin && (
            <button style={{ ...S.btn, ...S.btnPrim }} onClick={openCreate}>
              + Assign Task
            </button>
          )}
        </div>
      </div>

      {/* ── Stats ──────────────────────────────────────────────────────────── */}
      <div style={S.statRow}>
        {[
          { label: "Total", value: stats.total, color: "#6366f1" },
          { label: "Pending", value: stats.pending, color: "#f59e0b" },
          { label: "In Progress", value: stats.in_progress, color: "#3b82f6" },
          { label: "Completed", value: stats.completed, color: "#10b981" },
          { label: "Blocked", value: stats.blocked, color: "#ef4444" },
        ].map((s) => (
          <div key={s.label} style={S.stat}>
            <div style={{ ...S.statNum, color: s.color }}>{s.value}</div>
            <div style={S.statLbl}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Toolbar ────────────────────────────────────────────────────────── */}
      <div style={S.toolbar}>
        <input
          style={{ ...S.input, width: 230 }}
          placeholder="Search title, staff, order…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          style={S.select}
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
        >
          <option value="all">All Status</option>
          <option value="pending">Pending</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="blocked">Blocked</option>
        </select>
        <select
          style={S.select}
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
        >
          <option value="all">All Roles</option>
          {PRIORITY_ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <span style={{ fontSize: 12, color: "#94a3b8", marginLeft: "auto" }}>
          {filtered.length} task{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Task List ──────────────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "#94a3b8" }}>
          Loading tasks…
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "#94a3b8" }}>
          {isAdmin
            ? 'No tasks yet. Click "+ Assign Task" to get started.'
            : "No tasks assigned to you."}
        </div>
      ) : (
        filtered.map((t) => {
          const sm = STATUS_META[t.status] || STATUS_META.pending;
          const rc = ROLE_COLOR[t.task_role] || ROLE_COLOR["Other"];
          const overdue = isOverdue(t);
          return (
            <div
              key={t.id}
              style={{
                ...S.card,
                borderColor: overdue ? "#fca5a5" : "#e2e8f0",
                borderLeft: `4px solid ${sm.color}`,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                }}
              >
                {/* Left side */}
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      display: "flex",
                      gap: 7,
                      alignItems: "center",
                      marginBottom: 7,
                      flexWrap: "wrap",
                    }}
                  >
                    <span style={S.tag(sm.bg, sm.color, sm.border)}>
                      {sm.label}
                    </span>
                    <span style={S.tag(rc.bg, rc.color, rc.bg)}>
                      {t.task_role}
                    </span>
                    {overdue && (
                      <span style={S.tag("#fef2f2", "#b91c1c", "#fecaca")}>
                        ⚠ Overdue
                      </span>
                    )}
                    {!t.is_read && (
                      <span style={S.tag("#eff6ff", "#1d4ed8", "#bfdbfe")}>
                        ● New
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 700,
                      color: "#0f172a",
                      marginBottom: 4,
                    }}
                  >
                    {t.title}
                  </div>
                  {t.description && (
                    <div
                      style={{
                        fontSize: 13,
                        color: "#475569",
                        marginBottom: 7,
                        lineHeight: 1.5,
                      }}
                    >
                      {t.description}
                    </div>
                  )}
                  <div
                    style={{
                      fontSize: 12,
                      color: "#94a3b8",
                      display: "flex",
                      gap: 16,
                      flexWrap: "wrap",
                    }}
                  >
                    <span>
                      👤{" "}
                      <b style={{ color: "#475569" }}>{t.assigned_to_name}</b>
                    </span>
                    <span>📌 By {t.assigned_by_name}</span>
                    {t.order_number && <span>🛒 Order #{t.order_number}</span>}
                    {t.blueprint_title && <span>🗺 {t.blueprint_title}</span>}
                    {t.due_date && (
                      <span style={{ color: overdue ? "#ef4444" : "#94a3b8" }}>
                        📅 Due{" "}
                        {new Date(t.due_date).toLocaleDateString("en-PH")}
                      </span>
                    )}
                    {t.completed_at && (
                      <span style={{ color: "#10b981" }}>
                        ✅{" "}
                        {new Date(t.completed_at).toLocaleDateString("en-PH")}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right side actions */}
                <div
                  style={{
                    display: "flex",
                    gap: 6,
                    marginLeft: 16,
                    flexShrink: 0,
                    flexWrap: "wrap",
                    justifyContent: "flex-end",
                  }}
                >
                  <button
                    style={{ ...S.btn, ...S.btnGray, padding: "6px 12px" }}
                    onClick={() => openView(t)}
                  >
                    View
                  </button>
                  {isAdmin && (
                    <>
                      <button
                        style={{ ...S.btn, ...S.btnGray, padding: "6px 12px" }}
                        onClick={() => openEdit(t)}
                      >
                        Edit
                      </button>
                      <button
                        style={{ ...S.btn, ...S.btnRed, padding: "6px 12px" }}
                        onClick={() => handleDelete(t.id)}
                      >
                        Delete
                      </button>
                    </>
                  )}
                  {!isAdmin && t.status !== "completed" && (
                    <select
                      style={{ ...S.select, fontSize: 12 }}
                      value={t.status}
                      onChange={(e) => handleStatusUpdate(t.id, e.target.value)}
                    >
                      <option value="pending">Pending</option>
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Completed</option>
                      <option value="blocked">Blocked</option>
                    </select>
                  )}
                </div>
              </div>
            </div>
          );
        })
      )}

      {/* ── Create / Edit Modal ─────────────────────────────────────────────── */}
      {(modal === "create" || modal === "edit") && (
        <div style={S.overlay} onClick={() => setModal(null)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <div style={S.mTitle}>
              {modal === "create" ? "+ Assign New Task" : "✏️ Edit Task"}
            </div>
            <form onSubmit={handleSave}>
              <div style={S.mRow}>
                <label style={S.label}>Task Title *</label>
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
                <label style={S.label}>Description</label>
                <textarea
                  style={{ ...S.mInput, height: 80, resize: "vertical" }}
                  value={form.description}
                  placeholder="Additional instructions or notes…"
                  onChange={(e) =>
                    setForm((p) => ({ ...p, description: e.target.value }))
                  }
                />
              </div>
              <div style={S.half}>
                <div style={S.mRow}>
                  <label style={S.label}>Assign To *</label>
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
                        {s.name} ({s.staff_type === "indoor" ? "Indoor Staff" : s.staff_type})
                      </option>
                    ))}
                  </select>
                </div>
                <div style={S.mRow}>
                  <label style={S.label}>Task Role</label>
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
                </div>
                <div style={S.mRow}>
                  <label style={S.label}>Due Date & Time</label>
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
                  <label style={S.label}>Link to Order (optional)</label>
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
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  justifyContent: "flex-end",
                  marginTop: 8,
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
                      ? "📋 Assign Task"
                      : "💾 Save Changes"}
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
                <div style={S.mTitle}>Task Details</div>
                <div style={{ display: "flex", gap: 7, marginBottom: 16 }}>
                  <span style={S.tag(sm.bg, sm.color, sm.border)}>
                    {sm.label}
                  </span>
                  <span style={S.tag(rc.bg, rc.color, rc.bg)}>
                    {target.task_role}
                  </span>
                </div>
                {[
                  ["Title", target.title],
                  ["Description", target.description || "—"],
                  [
                    "Assigned To",
                    target.assigned_to_name || "—",
                  ],
                  ["Assigned By", target.assigned_by_name],
                  [
                    "Linked Order",
                    target.order_number ? `#${target.order_number}` : "—",
                  ],
                  ["Blueprint", target.blueprint_title || "—"],
                  [
                    "Due Date",
                    target.due_date
                      ? new Date(target.due_date).toLocaleString("en-PH")
                      : "—",
                  ],
                  [
                    "Accepted At",
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
                      gap: 12,
                      marginBottom: 10,
                      fontSize: 13,
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 600,
                        color: "#475569",
                        minWidth: 120,
                      }}
                    >
                      {k}:
                    </span>
                    <span style={{ color: "#0f172a" }}>{v}</span>
                  </div>
                ))}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    marginTop: 16,
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

      {/* ── Notifications Modal ─────────────────────────────────────────────── */}
      {modal === "notif" && (
        <div style={S.overlay} onClick={() => setModal(null)}>
          <div
            style={{ ...S.modal, width: 480 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16,
              }}
            >
              <div style={S.mTitle}>🔔 Notifications</div>
              {unreadCount > 0 && (
                <button
                  style={{ ...S.btn, ...S.btnGray, fontSize: 12 }}
                  onClick={markAllRead}
                >
                  Mark all read
                </button>
              )}
            </div>
            {notifications.length === 0 ? (
              <div
                style={{ textAlign: "center", color: "#94a3b8", padding: 30 }}
              >
                No notifications yet.
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  style={S.notifItem(!n.is_read)}
                  onClick={() => {
                    if (!n.is_read) markOneRead(n.id);
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#475569",
                      marginBottom: 2,
                    }}
                  >
                    {n.title}
                  </div>
                  <div
                    style={{ fontSize: 13, color: "#0f172a", marginBottom: 4 }}
                  >
                    {n.message}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "#94a3b8",
                      display: "flex",
                      justifyContent: "space-between",
                    }}
                  >
                    <span>
                      {new Date(n.created_at).toLocaleString("en-PH")}
                    </span>
                    {!n.is_read && (
                      <span style={{ color: "#3b82f6", fontWeight: 700 }}>
                        ● Unread
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginTop: 12,
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
      )}
    </div>
  );
}
