// src/pages/users/UsersPage.jsx – User & Role Management (Admin only)
import React, { useEffect, useState } from "react";
import api from "../../services/api";
import toast from "react-hot-toast";
import useAuthStore from "../../store/authStore";

const ROLE_STYLE = {
  admin: {
    bg: "#18181b",
    color: "#ffffff",
    border: "#18181b",
    label: "Administrator",
  },
  staff: {
    bg: "#f4f4f5",
    color: "#18181b",
    border: "#e4e4e7",
    label: "Staff / POS",
  },
};

const STAFF_TYPE_STYLE = {
  cashier: {
    bg: "#ffffff",
    color: "#18181b",
    border: "#e4e4e7",
    label: "Cashier",
    desc: "Handles POS and Walk-in orders",
  },
  indoor: {
    bg: "#ffffff",
    color: "#18181b",
    border: "#e4e4e7",
    label: "Indoor Staff",
    desc: "Project tasks / appointments",
  },
  delivery_rider: {
    bg: "#ffffff",
    color: "#18181b",
    border: "#e4e4e7",
    label: "Delivery Rider",
    desc: "Delivery assignment only",
  },
};

const BLANK_FORM = {
  name: "",
  email: "",
  password: "",
  role: "staff",
  staff_type: "cashier", // Default to cashier when creating staff
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
      staff_type: u.staff_type || "cashier",
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
          <p style={{ fontSize: 13, color: "#52525b", margin: "4px 0 0" }}>
            Manage administrator and staff accounts. Only admins can access this
            panel.
          </p>
        </div>

        <button
          onClick={openAdd}
          style={btnPrimary}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#3f3f46")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "#18181b")}
        >
          + Add User
        </button>
      </div>

      <div
        style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}
      >
        <SummaryCard
          label="Total Users"
          value={users.length}
          color="#18181b"
          icon="👥"
        />
        <SummaryCard
          label="Administrators"
          value={admins.length}
          color="#18181b"
          icon="🔑"
        />
        <SummaryCard
          label="Staff / POS"
          value={staff.length}
          color="#18181b"
          icon="🏪"
        />
        <SummaryCard
          label="Active"
          value={users.filter((u) => u.is_active).length}
          color="#18181b"
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

      <div style={{ marginTop: 24 }} />

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
            <h3
              style={{
                margin: "0 0 24px",
                fontSize: 20,
                fontWeight: 800,
                color: "#0a0a0a",
                letterSpacing: "-0.01em",
              }}
            >
              {modal === "add" ? "Add New User" : `Edit User — ${target?.name}`}
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
                  {Object.entries(ROLE_STYLE).map(([key, rs]) => {
                    const isSelected = form.role === key;
                    return (
                      <label
                        key={key}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          cursor: "pointer",
                          padding: "12px 16px",
                          border: `2px solid ${isSelected ? "#18181b" : "#e4e4e7"}`,
                          borderRadius: 10,
                          flex: 1,
                          fontSize: 13,
                          background: isSelected ? "#fafafa" : "#fff",
                          transition: "all 0.2s",
                        }}
                      >
                        <input
                          type="radio"
                          value={key}
                          checked={isSelected}
                          onChange={() => {
                            setF("role", key);
                            if (key !== "staff") {
                              setF("staff_type", "");
                            } else if (!form.staff_type) {
                              setF("staff_type", "cashier");
                            }
                          }}
                          style={{
                            accentColor: "#18181b",
                            width: 16,
                            height: 16,
                          }}
                        />
                        <div>
                          <div style={{ fontWeight: 800, color: "#18181b" }}>
                            {rs.label}
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              color: "#71717a",
                              marginTop: 2,
                            }}
                          >
                            {key === "admin"
                              ? "Full system access"
                              : "Assigned internal operations only"}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </Field>

              {form.role === "staff" && (
                <Field label="Staff Type *">
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 12,
                    }}
                  >
                    {Object.entries(STAFF_TYPE_STYLE).map(([key, rs]) => {
                      const isSelected = form.staff_type === key;
                      return (
                        <label
                          key={key}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            cursor: "pointer",
                            padding: "10px 14px",
                            border: `2px solid ${isSelected ? "#18181b" : "#e4e4e7"}`,
                            borderRadius: 10,
                            fontSize: 13,
                            background: isSelected ? "#fafafa" : "#fff",
                            transition: "all 0.2s",
                          }}
                        >
                          <input
                            type="radio"
                            value={key}
                            checked={isSelected}
                            onChange={() => setF("staff_type", key)}
                            style={{
                              accentColor: "#18181b",
                              width: 14,
                              height: 14,
                            }}
                          />
                          <div>
                            <div style={{ fontWeight: 800, color: "#18181b" }}>
                              {rs.label}
                            </div>
                            <div
                              style={{
                                fontSize: 11,
                                color: "#71717a",
                                marginTop: 2,
                              }}
                            >
                              {rs.desc}
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </Field>
              )}

              {modal === "edit" && (
                <Field label="Account Status">
                  <label
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 13,
                      fontWeight: 600,
                      color: "#18181b",
                      cursor: "pointer",
                      padding: "8px 12px",
                      background: "#fafafa",
                      border: "1px solid #e4e4e7",
                      borderRadius: 8,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={form.is_active}
                      onChange={(e) => setF("is_active", e.target.checked)}
                      style={{ accentColor: "#18181b", width: 16, height: 16 }}
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
                  marginTop: 28,
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
          <div style={{ ...modalBox, width: 440 }}>
            <h3
              style={{
                margin: "0 0 6px",
                fontSize: 20,
                fontWeight: 800,
                color: "#0a0a0a",
              }}
            >
              🔒 Reset Password
            </h3>
            <p style={{ fontSize: 13, color: "#52525b", margin: "0 0 24px" }}>
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
                        : "#e4e4e7",
                  }}
                  placeholder="Re-enter new password"
                />
                {pwForm.confirm && pwForm.confirm !== pwForm.new_password && (
                  <p
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#dc2626",
                      marginTop: 6,
                      marginBottom: 0,
                    }}
                  >
                    Passwords do not match.
                  </p>
                )}
              </Field>

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  justifyContent: "flex-end",
                  marginTop: 28,
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

function UserTable({
  title,
  users,
  loading,
  me,
  onEdit,
  onPassword,
  onDelete,
}) {
  return (
    <div style={card}>
      <div
        style={{
          padding: "16px 20px 14px",
          borderBottom: "1px solid #e4e4e7",
          background: "#fafafa",
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: 15,
            fontWeight: 800,
            color: "#0a0a0a",
            textTransform: "uppercase",
            letterSpacing: "1px",
          }}
        >
          {title}
        </h3>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 13,
            minWidth: 800,
          }}
        >
          <thead>
            <tr style={{ background: "#ffffff" }}>
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
                  bg: "#f4f4f5",
                  color: "#18181b",
                  border: "#e4e4e7",
                  label: u.role,
                };
                const isMe = u.id === me?.id;

                return (
                  <tr
                    key={u.id}
                    style={{
                      borderBottom: "1px solid #f4f4f5",
                      background: isMe ? "#fafafa" : "transparent",
                    }}
                  >
                    <td style={td}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                        }}
                      >
                        <div style={avatarStyle(u.role)}>
                          {u.name?.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, color: "#0a0a0a" }}>
                            {u.name}
                            {isMe && (
                              <span
                                style={{
                                  marginLeft: 8,
                                  fontSize: 10,
                                  color: "#ffffff",
                                  background: "#18181b",
                                  padding: "2px 8px",
                                  borderRadius: 12,
                                  fontWeight: 800,
                                }}
                              >
                                You
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td style={{ ...td, color: "#52525b" }}>{u.email}</td>
                    <td style={{ ...td, color: "#52525b" }}>
                      {u.phone || "—"}
                    </td>

                    <td style={td}>
                      <div
                        style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
                      >
                        <span
                          style={{
                            background: rs.bg,
                            color: rs.color,
                            border: `1px solid ${rs.border}`,
                            padding: "2px 10px",
                            borderRadius: 12,
                            fontSize: 11,
                            fontWeight: 700,
                          }}
                        >
                          {rs.label}
                        </span>

                        {u.role === "staff" && u.staff_type && (
                          <span
                            style={{
                              background: "#ffffff",
                              color: "#52525b",
                              border: "1px solid #d4d4d8",
                              padding: "2px 10px",
                              borderRadius: 12,
                              fontSize: 11,
                              fontWeight: 700,
                            }}
                          >
                            {STAFF_TYPE_STYLE[u.staff_type]?.label ||
                              u.staff_type}
                          </span>
                        )}
                      </div>
                    </td>

                    <td style={td}>
                      <span
                        style={{
                          background: u.is_active ? "#f4f4f5" : "#fef2f2",
                          color: u.is_active ? "#18181b" : "#991b1b",
                          border: `1px solid ${u.is_active ? "#e4e4e7" : "#fecaca"}`,
                          padding: "2px 10px",
                          borderRadius: 12,
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        {u.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>

                    <td style={{ ...td, color: "#71717a" }}>
                      {u.last_login ? (
                        new Date(u.last_login).toLocaleDateString("en-PH")
                      ) : (
                        <span style={{ color: "#a1a1aa" }}>Never</span>
                      )}
                    </td>

                    <td style={td}>
                      <div style={{ display: "flex", gap: 6 }}>
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
    </div>
  );
}

function SummaryCard({ label, value, color, icon }) {
  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 12,
        padding: "16px 20px",
        border: "1px solid #e4e4e7",
        borderLeft: `4px solid #18181b`,
        boxShadow: "0 1px 2px rgba(0,0,0,.02)",
        flex: 1,
        minWidth: 160,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div>
          <p
            style={{
              fontSize: 10,
              color: "#71717a",
              margin: 0,
              textTransform: "uppercase",
              letterSpacing: "1px",
              fontWeight: 800,
            }}
          >
            {label}
          </p>
          <p
            style={{
              fontSize: 26,
              fontWeight: 800,
              color: "#0a0a0a",
              margin: "6px 0 0",
              letterSpacing: "-0.02em",
            }}
          >
            {value}
          </p>
        </div>
        <span style={{ fontSize: 24 }}>{icon}</span>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <label
        style={{
          fontSize: 12,
          fontWeight: 800,
          color: "#18181b",
          display: "block",
          marginBottom: 8,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

const avatarStyle = (role) => ({
  width: 38,
  height: 38,
  borderRadius: "50%",
  background: role === "admin" ? "#18181b" : "#f4f4f5",
  color: role === "admin" ? "#ffffff" : "#18181b",
  border: `1px solid ${role === "admin" ? "#18181b" : "#e4e4e7"}`,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontWeight: 800,
  fontSize: 14,
  flexShrink: 0,
});

const pageTitle = {
  fontSize: 24,
  fontWeight: 800,
  color: "#0a0a0a",
  margin: 0,
  letterSpacing: "-0.02em",
};

const card = {
  background: "#fff",
  borderRadius: 16,
  border: "1px solid #e4e4e7",
  boxShadow: "0 1px 2px rgba(0,0,0,.02)",
  overflow: "hidden",
};

const th = {
  textAlign: "left",
  padding: "14px 16px",
  fontSize: 10,
  fontWeight: 800,
  color: "#71717a",
  textTransform: "uppercase",
  letterSpacing: "1px",
};

const td = {
  padding: "14px 16px",
  color: "#18181b",
  verticalAlign: "middle",
};

const centerCell = {
  textAlign: "center",
  padding: 40,
  color: "#71717a",
  fontSize: 13,
  fontWeight: 600,
};

const inputFull = {
  width: "100%",
  padding: "10px 14px",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  fontSize: 13,
  color: "#18181b",
  boxSizing: "border-box",
  outline: "none",
};

const overlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,.6)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
  padding: 20,
};

const modalBox = {
  background: "#fff",
  borderRadius: 16,
  padding: 32,
  width: 560,
  maxWidth: "100%",
  maxHeight: "90vh",
  overflowY: "auto",
  border: "1px solid #e4e4e7",
  boxShadow: "0 25px 60px rgba(0,0,0,.15)",
};

const btnPrimary = {
  padding: "10px 20px",
  background: "#18181b",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
  transition: "background 0.2s",
};

const btnGhost = {
  padding: "10px 20px",
  background: "#f4f4f5",
  color: "#18181b",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
  transition: "background 0.2s",
};

const btnEdit = {
  padding: "6px 14px",
  background: "#f4f4f5",
  color: "#18181b",
  border: "1px solid #e4e4e7",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 700,
  transition: "background 0.2s",
};

const btnPw = {
  padding: "6px 14px",
  background: "#ffffff",
  color: "#18181b",
  border: "1px solid #d4d4d8",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 700,
  transition: "background 0.2s",
};

const btnDel = {
  padding: "6px 14px",
  background: "#fef2f2",
  color: "#991b1b",
  border: "1px solid #fecaca",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 700,
  transition: "background 0.2s",
};
