// src/components/layout/AdminLayout.jsx – Sidebar + topbar shell
import React, { useState, useEffect } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import useAuthStore from "../../store/authStore";
import toast from "react-hot-toast";

const NAV_ITEMS = [
  { section: "Dashboard" },
  {
    label: "Dashboard",
    path: "/admin/dashboard",
    icon: "📊",
    roles: ["admin"],
  },

  { section: "Management" },
  {
    label: "Task Assignments",
    path: "/admin/tasks",
    icon: "📋",
    roles: ["admin", "staff"],
  },
  {
    label: "Appointments",
    path: "/admin/appointments",
    icon: "📅",
    roles: ["admin"],
  },
  {
    label: "Delivery Scheduling",
    path: "/admin/delivery",
    icon: "🚚",
    roles: ["admin"],
  },

  {
    label: "Products",
    path: "/admin/products", // 👉 Added /admin
    icon: "📦",
    roles: ["admin", "staff"],
  },
  { section: "Inventory" },
  {
    label: "Raw Materials",
    path: "/admin/inventory/raw", // 👉 Added /admin
    icon: "🪵",
    roles: ["admin", "staff"],
  },
  {
    label: "Build Materials",
    path: "/admin/inventory/build", // 👉 Added /admin
    icon: "🔧",
    roles: ["admin", "staff"],
  },
  {
    label: "Stock Movement",
    path: "/admin/inventory/movements", // 👉 Added /admin
    icon: "🔄",
    roles: ["admin", "staff"],
  },
  {
    label: "Suppliers",
    path: "/admin/inventory/suppliers", // 👉 Added /admin
    icon: "🏭",
    roles: ["admin", "staff"],
  },
  { section: "Blueprints" },
  {
    label: "Blueprint Mgmt",
    path: "/admin/blueprints", // 👉 Added /admin
    icon: "🗺️",
    roles: ["admin", "staff"],
  },
  {
    label: "Contracts",
    path: "/admin/contracts",
    icon: "📝",
    roles: ["admin"],
  },
  { section: "Sales & Orders" },
  {
    label: "Orders",
    path: "/admin/orders",
    icon: "🛒",
    roles: ["admin", "staff"],
  },
  {
    label: "Cancellations",
    path: "/admin/orders/cancellations", // 👉 Added /admin
    icon: "❌",
    roles: ["admin"],
  },
  {
    label: "Sales Reports",
    path: "/admin/sales", // 👉 Added /admin
    icon: "📈",
    roles: ["admin", "staff"],
  },
  {
    label: "Warranty",
    path: "/admin/warranty", // 👉 Added /admin
    icon: "🛡️",
    roles: ["admin", "staff"],
  },
  { section: "Management" },
  {
    label: "Customers",
    path: "/admin/customers",
    icon: "👥",
    roles: ["admin"],
  },
  {
    label: "Users & Roles",
    path: "/admin/users",
    icon: "🔑",
    roles: ["admin"],
  },
  { section: "Website" },
  {
    label: "Site Settings",
    path: "/admin/website/settings", // 👉 Added /admin
    icon: "⚙️",
    roles: ["admin"],
  },
  { label: "FAQs", path: "/admin/website/faqs", icon: "❓", roles: ["admin"] },
  {
    label: "Page Content",
    path: "/admin/website/pages", // 👉 Added /admin
    icon: "📄",
    roles: ["admin"],
  },
  { label: "Backup", path: "/admin/backup", icon: "💾", roles: ["admin"] },
];

export default function AdminLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(true);

  useEffect(() => {
    if (user && user.role === "customer") {
      toast.error("Access restricted. Redirecting to storefront.");
      navigate("/");
    }
  }, [user, navigate]);

  const handleLogout = () => {
    clearCart();
    logout();
    toast.success("Logged out.");
    navigate("/login");
  };

  const visibleItems = NAV_ITEMS.filter(
    (item) => item.section || !item.roles || item.roles.includes(user?.role),
  );

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        fontFamily: "Inter, sans-serif",
      }}
    >
      {/* ── Sidebar ──────────────────────────────────────────────────────── */}
      <aside
        style={{
          width: open ? 240 : 64,
          background: "#1e2a38",
          color: "#cdd6e0",
          transition: "width .2s",
          overflow: "hidden",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Brand */}
        <div
          style={{
            padding: "20px 16px",
            borderBottom: "1px solid #2d3d50",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span style={{ fontSize: 22 }}>🪵</span>
          {open && (
            <span
              style={{
                fontWeight: 700,
                fontSize: 16,
                color: "#fff",
                whiteSpace: "nowrap",
              }}
            >
              WISDOM Admin
            </span>
          )}
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
          {visibleItems.map((item, i) => {
            if (item.section) {
              return open ? (
                <div
                  key={i}
                  style={{
                    padding: "12px 16px 4px",
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                    color: "#6b7d93",
                  }}
                >
                  {item.section}
                </div>
              ) : (
                <div
                  key={i}
                  style={{ borderTop: "1px solid #2d3d50", margin: "8px 0" }}
                />
              );
            }
            return (
              <NavLink
                key={item.path}
                to={item.path}
                style={({ isActive }) => ({
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 16px",
                  color: isActive ? "#fff" : "#9db3c8",
                  background: isActive ? "#2d4a6e" : "transparent",
                  textDecoration: "none",
                  fontSize: 13,
                  whiteSpace: "nowrap",
                  borderLeft: isActive
                    ? "3px solid #4a9eff"
                    : "3px solid transparent",
                  transition: "all .15s",
                })}
              >
                <span style={{ fontSize: 16 }}>{item.icon}</span>
                {open && item.label}
              </NavLink>
            );
          })}
        </nav>

        {/* Toggle */}
        <button
          onClick={() => setOpen((o) => !o)}
          style={{
            background: "#2d3d50",
            border: "none",
            color: "#9db3c8",
            padding: 12,
            cursor: "pointer",
            textAlign: "center",
          }}
        >
          {open ? "◀" : "▶"}
        </button>
      </aside>

      {/* ── Main Area ────────────────────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          background: "#f0f4f8",
          minWidth: 0,
        }}
      >
        {/* Topbar */}
        <header
          style={{
            background: "#fff",
            borderBottom: "1px solid #e2e8f0",
            padding: "12px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 16,
          }}
        >
          <span style={{ fontSize: 13, color: "#64748b" }}>
            👤 {user?.name}{" "}
            <span
              style={{
                fontSize: 11,
                background: "#e0f2fe",
                color: "#0369a1",
                padding: "2px 8px",
                borderRadius: 20,
              }}
            >
              {user?.role}
            </span>
          </span>
          <button
            onClick={handleLogout}
            style={{
              background: "#ef4444",
              color: "#fff",
              border: "none",
              padding: "6px 16px",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            Logout
          </button>
        </header>

        {/* Page Content */}
        <main style={{ flex: 1, padding: 24, overflowY: "auto" }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
