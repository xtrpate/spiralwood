// src/pages/users/UsersPage.jsx – User & Role Management (Admin only)
import React, { useEffect, useState } from "react";
import api from "../../services/api";
import toast from "react-hot-toast";
import useAuthStore from "../../store/authStore";

const ROLE_STYLE = {
  admin: { bg: "#e9d5ff", color: "#6b21a8", label: "Administrator" },
  staff: { bg: "#dbeafe", color: "#1e40af", label: "Staff / POS" },
};

const STAFF_TYPE_STYLE = {
  indoor: { bg: "#ecfeff", color: "#155e75", label: "Indoor Staff" },
  delivery_rider: { bg: "#fff7ed", color: "#c2410c", label: "Delivery Rider" },
};

const BLANK_FORM = {
  name: "",
  email: "",
  password: "",
  role: "staff",
  staff_type: "indoor",
  phone: "",
  is_active: true,
};

export default function UsersPage() {
  const { user: me } = useAuthStore();
  const [users, setUsers] = useState([]);
  const [loading, setLoad] = useState(true);
  const [modal, setModal] = useState(null); // null | 'add' | 'edit' | 'password'
  const [form, setForm] = useState(BLANK_FORM);
  const [pwForm, setPwForm] = useState({ new_password: "", confirm: "" });
  const [saving, setSaving] = useState(false);
  const [target, setTarget] = useState(null);

  const load = async () => {
    setLoad(true);
    try {
      const { data } = await api.get("/users");
      setUsers(data);
    } finally {
      setLoad(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openAdd = () => {
    setForm(BLANK_FORM);
    setTarget(null);
    setModal("add");
  };

  const openEdit = (u) => {
    setForm({
      name: u.name,
      email: u.email,
      role: u.role,
      staff_type: u.staff_type || "indoor",
      phone: u.phone || "",
      is_active: !!u.is_active,
      password: "",
    });
    setTarget(u);
    setModal("edit");
  };

  const openPassword = (u) => {
    setPwForm({ new_password: "", confirm: "" });
    setTarget(u);
    setModal("password");
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);

    try {
      if (form.role !== "staff") {
        form.staff_type = "";
      }

      if (modal === "add") {
        if (!form.password) {
          toast.error("Password is required.");
          setSaving(false);
          return;
        }

        await api.post("/users", form);
        toast.success("User created.");
      } else {
        const { password, ...rest } = form;
        await api.put(`/users/${target.id}`, rest);
        toast.success("User updated.");
      }

      setModal(null);
      load();
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordReset = async (e) => {
    e.preventDefault();

    if (pwForm.new_password !== pwForm.confirm) {
      toast.error("Passwords do not match.");
      return;
    }

    if (pwForm.new_password.length < 8) {
      toast.error("Password must be at least 8 characters.");
      return;
    }

    setSaving(true);
    try {
      await api.patch(`/users/${target.id}/password`, {
        new_password: pwForm.new_password,
      });
      toast.success("Password reset successfully.");
      setModal(null);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (u) => {
    if (u.id === me?.id) {
      toast.error("You cannot delete your own account.");
      return;
    }

    if (!window.confirm(`Delete user "${u.name}"? This cannot be undone.`)) {
      return;
    }

    try {
      await api.delete(`/users/${u.id}`);
      toast.success("User deleted.");
      load();
    } catch {}
  };

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const admins = users.filter((u) => u.role === "admin");
  const staff = users.filter((u) => u.role === "staff");

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 20,
        }}
      >
        <div>
          <h1 style={pageTitle}>User & Role Management</h1>
          <p style={{ fontSize: 13, color: "#64748b", margin: "4px 0 0" }}>
            Manage administrator and staff accounts. Only admins can access this
            panel.
          </p>
        </div>

        <button onClick={openAdd} style={btnPrimary}>
          + Add User
        </button>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
        <SummaryCard
          label="Total Users"
          value={users.length}
          color="#3b82f6"
          icon="👥"
        />
        <SummaryCard
          label="Administrators"
          value={admins.length}
          color="#8b5cf6"
          icon="🔑"
        />
        <SummaryCard
          label="Staff / POS"
          value={staff.length}
          color="#06b6d4"
          icon="🏪"
        />
        <SummaryCard
          label="Active"
          value={users.filter((u) => u.is_active).length}
          color="#10b981"
          icon="✅"
        />
      </div>

      <UserTable
        title="Administrators"
        users={admins}
        loading={loading}
        me={me}
        onEdit={openEdit}
        onPassword={openPassword}
        onDelete={handleDelete}
      />

      <div style={{ marginTop: 20 }} />

      <UserTable
        title="Staff / POS Operators"
        users={staff}
        loading={loading}
        me={me}
        onEdit={openEdit}
        onPassword={openPassword}
        onDelete={handleDelete}
      />

      {(modal === "add" || modal === "edit") && (
        <div style={overlay}>
          <div style={modalBox}>
            <h3 style={{ margin: "0 0 20px" }}>
              {modal === "add"
                ? "➕ Add New User"
                : `✏️ Edit User — ${target?.name}`}
            </h3>

            <form onSubmit={handleSave}>
              <Field label="Full Name *">
                <input
                  required
                  value={form.name}
                  onChange={(e) => setF("name", e.target.value)}
                  style={inputFull}
                  placeholder="e.g. Juan Dela Cruz"
                />
              </Field>

              <Field label="Email Address *">
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={(e) => setF("email", e.target.value)}
                  style={inputFull}
                  placeholder="user@spiralwood.com"
                />
              </Field>

              {modal === "add" && (
                <Field label="Password *">
                  <input
                    required
                    type="password"
                    value={form.password}
                    onChange={(e) => setF("password", e.target.value)}
                    style={inputFull}
                    placeholder="Minimum 8 characters"
                    minLength={8}
                  />
                </Field>
              )}

              <Field label="Phone Number">
                <input
                  value={form.phone}
                  onChange={(e) => setF("phone", e.target.value)}
                  style={inputFull}
                  placeholder="e.g. 09XX-XXX-XXXX"
                />
              </Field>

              <Field label="Role *">
                <div style={{ display: "flex", gap: 12 }}>
                  {Object.entries(ROLE_STYLE).map(([key, rs]) => (
                    <label
                      key={key}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        cursor: "pointer",
                        padding: "10px 16px",
                        border: `2px solid ${form.role === key ? rs.color : "#e2e8f0"}`,
                        borderRadius: 8,
                        flex: 1,
                        fontSize: 13,
                        background: form.role === key ? rs.bg : "#fff",
                      }}
                    >
                      <input
                        type="radio"
                        value={key}
                        checked={form.role === key}
                        onChange={() => {
                          setF("role", key);
                          if (key !== "staff") {
                            setF("staff_type", "");
                          } else if (!form.staff_type) {
                            setF("staff_type", "indoor");
                          }
                        }}
                        style={{ accentColor: rs.color }}
                      />
                      <div>
                        <div style={{ fontWeight: 600, color: rs.color }}>
                          {rs.label}
                        </div>
                        <div style={{ fontSize: 11, color: "#64748b" }}>
                          {key === "admin"
                            ? "Full system access"
                            : "Assigned internal operations only"}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </Field>

              {form.role === "staff" && (
                <Field label="Staff Type *">
                  <div style={{ display: "flex", gap: 12 }}>
                    {Object.entries(STAFF_TYPE_STYLE).map(([key, rs]) => (
                      <label
                        key={key}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          cursor: "pointer",
                          padding: "10px 16px",
                          border: `2px solid ${form.staff_type === key ? rs.color : "#e2e8f0"}`,
                          borderRadius: 8,
                          flex: 1,
                          fontSize: 13,
                          background: form.staff_type === key ? rs.bg : "#fff",
                        }}
                      >
                        <input
                          type="radio"
                          value={key}
                          checked={form.staff_type === key}
                          onChange={() => setF("staff_type", key)}
                          style={{ accentColor: rs.color }}
                        />
                        <div>
                          <div style={{ fontWeight: 600, color: rs.color }}>
                            {rs.label}
                          </div>
                          <div style={{ fontSize: 11, color: "#64748b" }}>
                            {key === "indoor"
                              ? "Project task / appointment side"
                              : "Delivery assignment only"}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                </Field>
              )}

              {modal === "edit" && (
                <Field label="Account Status">
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={(e) => setF("is_active", e.target.checked)}
                    />
                    Account is active
                  </label>
                </Field>
              )}

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  justifyContent: "flex-end",
                  marginTop: 24,
                }}
              >
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  style={btnGhost}
                >
                  Cancel
                </button>

                <button type="submit" disabled={saving} style={btnPrimary}>
                  {saving
                    ? "Saving..."
                    : modal === "add"
                      ? "Create User"
                      : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modal === "password" && (
        <div style={overlay}>
          <div style={{ ...modalBox, width: 400 }}>
            <h3 style={{ margin: "0 0 6px" }}>🔒 Reset Password</h3>
            <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 20px" }}>
              Resetting password for <strong>{target?.name}</strong>
            </p>

            <form onSubmit={handlePasswordReset}>
              <Field label="New Password *">
                <input
                  required
                  type="password"
                  value={pwForm.new_password}
                  onChange={(e) =>
                    setPwForm((f) => ({ ...f, new_password: e.target.value }))
                  }
                  style={inputFull}
                  placeholder="Minimum 8 characters"
                  minLength={8}
                />
              </Field>

              <Field label="Confirm New Password *">
                <input
                  required
                  type="password"
                  value={pwForm.confirm}
                  onChange={(e) =>
                    setPwForm((f) => ({ ...f, confirm: e.target.value }))
                  }
                  style={{
                    ...inputFull,
                    borderColor:
                      pwForm.confirm && pwForm.confirm !== pwForm.new_password
                        ? "#dc2626"
                        : "#d1d5db",
                  }}
                  placeholder="Re-enter new password"
                />
                {pwForm.confirm && pwForm.confirm !== pwForm.new_password && (
                  <p style={{ fontSize: 11, color: "#dc2626", marginTop: 4 }}>
                    Passwords do not match.
                  </p>
                )}
              </Field>

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  justifyContent: "flex-end",
                  marginTop: 24,
                }}
              >
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  style={btnGhost}
                >
                  Cancel
                </button>

                <button type="submit" disabled={saving} style={btnPrimary}>
                  {saving ? "Saving..." : "Reset Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function UserTable({ title, users, loading, me, onEdit, onPassword, onDelete }) {
  return (
    <div style={card}>
      <div
        style={{
          padding: "14px 20px",
          borderBottom: "1px solid #f1f5f9",
          background: "#f8fafc",
        }}
      >
        <h3
          style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#1e2a38" }}
        >
          {title}
        </h3>
      </div>

      <table
        style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
      >
        <thead>
          <tr style={{ background: "#fafafa" }}>
            {[
              "User",
              "Email",
              "Phone",
              "Role",
              "Status",
              "Last Login",
              "Actions",
            ].map((h) => (
              <th key={h} style={th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {loading ? (
            <tr>
              <td colSpan={7} style={centerCell}>
                Loading...
              </td>
            </tr>
          ) : users.length === 0 ? (
            <tr>
              <td colSpan={7} style={centerCell}>
                No users in this role.
              </td>
            </tr>
          ) : (
            users.map((u) => {
              const rs = ROLE_STYLE[u.role] || {
                bg: "#f1f5f9",
                color: "#475569",
                label: u.role,
              };
              const isMe = u.id === me?.id;

              return (
                <tr
                  key={u.id}
                  style={{
                    borderBottom: "1px solid #f1f5f9",
                    background: isMe ? "#fefce8" : "transparent",
                  }}
                >
                  <td style={td}>
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 10 }}
                    >
                      <div style={avatarStyle(u.role)}>
                        {u.name?.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: 500 }}>
                          {u.name}
                          {isMe && (
                            <span
                              style={{
                                marginLeft: 6,
                                fontSize: 11,
                                color: "#854d0e",
                                background: "#fef9c3",
                                padding: "1px 6px",
                                borderRadius: 8,
                              }}
                            >
                              You
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td style={{ ...td, fontSize: 12 }}>{u.email}</td>
                  <td style={{ ...td, fontSize: 12 }}>{u.phone || "—"}</td>

                  <td style={td}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <span
                        style={{
                          background: rs.bg,
                          color: rs.color,
                          padding: "2px 10px",
                          borderRadius: 12,
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        {rs.label}
                      </span>

                      {u.role === "staff" && u.staff_type && (
                        <span
                          style={{
                            background:
                              STAFF_TYPE_STYLE[u.staff_type]?.bg || "#f1f5f9",
                            color:
                              STAFF_TYPE_STYLE[u.staff_type]?.color || "#475569",
                            padding: "2px 10px",
                            borderRadius: 12,
                            fontSize: 11,
                            fontWeight: 600,
                          }}
                        >
                          {STAFF_TYPE_STYLE[u.staff_type]?.label || u.staff_type}
                        </span>
                      )}
                    </div>
                  </td>

                  <td style={td}>
                    <span
                      style={{
                        background: u.is_active ? "#d1fae5" : "#fee2e2",
                        color: u.is_active ? "#065f46" : "#991b1b",
                        padding: "2px 10px",
                        borderRadius: 12,
                        fontSize: 11,
                        fontWeight: 600,
                      }}
                    >
                      {u.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>

                  <td style={{ ...td, fontSize: 12, color: "#64748b" }}>
                    {u.last_login ? (
                      new Date(u.last_login).toLocaleDateString("en-PH")
                    ) : (
                      <span style={{ color: "#94a3b8" }}>Never</span>
                    )}
                  </td>

                  <td style={td}>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button onClick={() => onEdit(u)} style={btnEdit}>
                        Edit
                      </button>
                      <button onClick={() => onPassword(u)} style={btnPw}>
                        🔒 Password
                      </button>
                      {!isMe && (
                        <button onClick={() => onDelete(u)} style={btnDel}>
                          🗑
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function SummaryCard({ label, value, color, icon }) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 10,
        padding: "14px 18px",
        borderLeft: `4px solid ${color}`,
        boxShadow: "0 1px 6px rgba(0,0,0,.08)",
        minWidth: 130,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <p
            style={{
              fontSize: 11,
              color: "#64748b",
              margin: 0,
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            {label}
          </p>
          <p
            style={{
              fontSize: 24,
              fontWeight: 700,
              color: "#1e2a38",
              margin: "4px 0 0",
            }}
          >
            {value}
          </p>
        </div>
        <span style={{ fontSize: 22 }}>{icon}</span>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "#374151",
          display: "block",
          marginBottom: 6,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

const avatarStyle = (role) => ({
  width: 34,
  height: 34,
  borderRadius: "50%",
  background: role === "admin" ? "#e9d5ff" : "#dbeafe",
  color: role === "admin" ? "#6b21a8" : "#1e40af",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 700,
  fontSize: 13,
  flexShrink: 0,
});

const pageTitle = {
  fontSize: 22,
  fontWeight: 700,
  color: "#1e2a38",
  margin: 0,
};

const card = {
  background: "#fff",
  borderRadius: 12,
  boxShadow: "0 1px 6px rgba(0,0,0,.08)",
  overflow: "hidden",
};

const th = {
  textAlign: "left",
  padding: "10px 14px",
  fontSize: 11,
  fontWeight: 600,
  color: "#64748b",
  textTransform: "uppercase",
};

const td = {
  padding: "10px 14px",
  color: "#374151",
  verticalAlign: "middle",
};

const centerCell = {
  textAlign: "center",
  padding: 32,
  color: "#94a3b8",
};

const inputFull = {
  width: "100%",
  padding: "8px 12px",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  fontSize: 13,
  boxSizing: "border-box",
};

const overlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,.5)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const modalBox = {
  background: "#fff",
  borderRadius: 12,
  padding: 28,
  width: 520,
  maxHeight: "88vh",
  overflowY: "auto",
  boxShadow: "0 20px 60px rgba(0,0,0,.3)",
};

const btnPrimary = {
  padding: "8px 20px",
  background: "#1e40af",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
};

const btnGhost = {
  padding: "8px 16px",
  background: "#f1f5f9",
  color: "#374151",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 13,
};

const btnEdit = {
  padding: "4px 10px",
  background: "#e0f2fe",
  color: "#0369a1",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 12,
};

const btnPw = {
  padding: "4px 10px",
  background: "#f3e8ff",
  color: "#6b21a8",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 12,
};

const btnDel = {
  padding: "4px 10px",
  background: "#fee2e2",
  color: "#dc2626",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 12,
};