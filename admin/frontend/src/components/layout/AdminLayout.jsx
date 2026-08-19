// src/components/layout/AdminLayout.jsx – Sidebar + topbar shell
import React, { useState, useEffect, useRef } from "react";
import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import { LogOut } from "lucide-react";
import api, { buildAssetUrl } from "../../services/api";
import useAuthStore from "../../store/authStore";
import toast from "react-hot-toast";
import { useCart } from "../../pages/customer/cartcontext";
import NotificationBell from "../NotificationBell";
import {
  MotionFeedbackOverlay,
  getMotionFeedbackDurations,
} from "../MotionFeedbackOverlay";

import "./AdminLayout.css";
import adminSystemIcon from "../../assets/admin-system-icon.png";

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
    path: "/admin/products",
    icon: "📦",
    roles: ["admin", "staff"],
  },
  { section: "Inventory" },
  {
    label: "Raw Materials",
    path: "/admin/inventory/raw",
    icon: "🪵",
    roles: ["admin", "staff"],
  },
  {
    label: "Build Materials",
    path: "/admin/inventory/build",
    icon: "🔧",
    roles: ["admin", "staff"],
  },
  {
    label: "Stock Movement",
    path: "/admin/inventory/movements",
    icon: "🔄",
    roles: ["admin", "staff"],
  },
  {
    label: "Suppliers",
    path: "/admin/inventory/suppliers",
    icon: "🏭",
    roles: ["admin", "staff"],
  },
  { section: "Blueprints" },
  {
    label: "Blueprint Mgmt",
    path: "/admin/blueprints",
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
    label: "Sales Reports",
    path: "/admin/sales",
    icon: "📈",
    roles: ["admin", "staff"],
  },
  {
    label: "POS QR Recovery",
    path: "/admin/pos-qr-recovery",
    icon: "💳",
    roles: ["admin"],
  },
  {
    label: "Warranty",
    path: "/admin/warranty",
    icon: "🛡️",
    roles: ["admin", "staff"],
  },
  {
    label: "Support",
    path: "/admin/support",
    icon: "💬",
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
  {
    label: "Audit Logs",
    path: "/admin/audit-logs",
    icon: "🧾",
    roles: ["admin"],
  },
  { section: "Website" },
  {
    label: "Site Settings",
    path: "/admin/website/settings",
    icon: "⚙️",
    roles: ["admin"],
  },
  {
    label: "FAQs",
    path: "/admin/website/faqs",
    icon: "❓",
    roles: ["admin"],
  },
  {
    label: "Page Content",
    path: "/admin/website/pages",
    icon: "📄",
    roles: ["admin"],
  },
  {
    label: "Backup",
    path: "/admin/backup",
    icon: "💾",
    roles: ["admin"],
  },
];

export default function AdminLayout() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(true);
  // WISDOM ADMIN OFFICIAL LOGO V1
  const [brandLogo, setBrandLogo] = useState("");
  const { clearCart } = useCart();

  const mainRef = useRef(null);
  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
  }, [location.pathname]);

  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [logoutFeedbackStatus, setLogoutFeedbackStatus] = useState("loading");
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .get("/website/settings")
      .then((res) => {
        if (active) {
          if (res.data?.display?.site_name) {
            document.title = res.data.display.site_name + " - Admin"; // Added " - Admin" to distinguish the tab
          }
          if (res.data?.display?.site_logo) {
            const faviconUrl = buildAssetUrl(res.data.display.site_logo);
            setBrandLogo(faviconUrl);
            let link = document.querySelector("link[rel~='icon']");
            if (!link) {
              link = document.createElement("link");
              link.rel = "icon";
              document.head.appendChild(link);
            }
            link.href = faviconUrl;
          }
        }
      })
      .catch((err) => console.error("Failed to load admin branding", err));

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (user && user.role === "customer") {
      toast.error("Access restricted. Redirecting to storefront.");
      navigate("/");
    }
  }, [user, navigate]);

  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  const handleLogout = () => {
    setShowLogoutModal(true);
  };

  const confirmLogout = () => {
    if (signingOut) return;

    setShowLogoutModal(false);
    setLogoutFeedbackStatus("loading");
    setSigningOut(true);

    const durations = getMotionFeedbackDurations();

    window.setTimeout(() => {
      setLogoutFeedbackStatus("success");

      window.setTimeout(() => {
        setSigningOut(false);
        setLogoutFeedbackStatus("loading");
        logout();
        clearCart(false);
        navigate("/login", { replace: true });
      }, durations.success);
    }, durations.loading);
  };

  const visibleItems = NAV_ITEMS.filter(
    (item) => item.section || !item.roles || item.roles.includes(user?.role),
  );

  return (
    <div
      className="wisdom-admin-shell"
      style={{
        display: "flex",
        height: "100vh",
        overflow: "hidden",
        fontFamily: "Inter, sans-serif",
      }}
    >
      {mobileOpen && (
        <div
          className="wisdom-sidebar-overlay"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside
        className={`wisdom-sidebar ${mobileOpen ? "mobile-open" : ""}`}
        style={{
          width: open ? 240 : 64,
          background: "#0a0a0a",
          color: "#e5e7eb",
          transition: "width .2s",
          overflow: "hidden",
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "20px 16px",
            borderBottom: "1px solid #27272a",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            {brandLogo && (
              <img
                src={brandLogo}
                alt="WISDOM logo"
                style={{
                  width: 28,
                  height: 28,
                  flex: "0 0 28px",
                  objectFit: "contain",
                  display: "block",
                }}
              />
            )}
            {open && (
              <span
                style={{
                  fontWeight: 600,
                  fontSize: 16,
                  color: "#ffffff",
                  whiteSpace: "nowrap",
                  letterSpacing: "0.02em",
                }}
              >
                WISDOM Admin
              </span>
            )}
          </div>

          <button
            type="button"
            className="wisdom-sidebar-close"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            ✕
          </button>
        </div>

        <nav
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "8px 0",
          }}
        >
          {visibleItems.map((item, i) => {
            if (item.section) {
              return open ? (
                <div
                  key={i}
                  style={{
                    padding: "12px 16px 4px",
                    fontSize: 10,
                    textTransform: "uppercase",
                    letterSpacing: 1.2,
                    color: "#71717a",
                    fontWeight: 700,
                  }}
                >
                  {item.section}
                </div>
              ) : (
                <div
                  key={i}
                  style={{
                    borderTop: "1px solid #27272a",
                    margin: "8px 0",
                  }}
                />
              );
            }

            return (
              <NavLink
                key={item.path}
                to={item.path}
                end
                onClick={() => setMobileOpen(false)}
                style={({ isActive }) => ({
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "9px 16px",
                  color: isActive ? "#ffffff" : "#a1a1aa",
                  background: isActive ? "#27272a" : "transparent",
                  textDecoration: "none",
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 500,
                  whiteSpace: "nowrap",
                  borderLeft: isActive
                    ? "3px solid #ffffff"
                    : "3px solid transparent",
                  transition: "all .15s",
                })}
              >
                <span style={{ fontSize: 16 }}>{item.icon}</span>
                {open && item.label}
              </NavLink>
            );
          })}

          {/* WISDOM ADMIN LOGOUT AFTER BACKUP V1 */}
          {/* WISDOM ADMIN WHITE BELL ALIGNED LOGOUT V1 */}
          {/* WISDOM ADMIN YELLOW BELL LOGOUT ALIGNMENT V1 */}
          <button
            type="button"
            onClick={handleLogout}
            title={!open ? "Logout" : undefined}
            aria-label="Logout"
            style={{
              width: "100%",
              minHeight: 36,
              padding: open ? "9px 21px" : "9px 0",
              border: "none",
              borderLeft: "3px solid transparent",
              background: "transparent",
              color: "#a1a1aa",
              display: "flex",
              alignItems: "center",
              justifyContent: open ? "flex-start" : "center",
              gap: 10,
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 13,
              fontWeight: 500,
              whiteSpace: "nowrap",
              textAlign: "left",
              transition: "all .15s",
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.background = "#18181b";
              event.currentTarget.style.color = "#ffffff";
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.background = "transparent";
              event.currentTarget.style.color = "#a1a1aa";
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 16,
                height: 16,
                flex: "0 0 16px",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <LogOut size={16} strokeWidth={1.8} />
            </span>
            {open && <span>Logout</span>}
          </button>
        </nav>

        <button
          className="wisdom-sidebar-collapse-toggle"
          onClick={() => setOpen((current) => !current)}
          style={{
            background: "#18181b",
            border: "none",
            borderTop: "1px solid #27272a",
            color: "#a1a1aa",
            padding: "14px 12px",
            cursor: "pointer",
            textAlign: "center",
            transition: "color 0.2s",
          }}
          onMouseEnter={(event) => {
            event.currentTarget.style.color = "#ffffff";
          }}
          onMouseLeave={(event) => {
            event.currentTarget.style.color = "#a1a1aa";
          }}
        >
          {open ? "◀" : "▶"}
        </button>
      </aside>
      <div
        className="wisdom-admin-main"
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          background: "#f4f4f5",
          minWidth: 0,
        }}
      >
        <header
          className="wisdom-admin-topbar"
          style={{
            position: "sticky",
            top: 0,
            zIndex: 100,
            background: "#ffffff",
            borderBottom: "1px solid #e4e4e7",
            padding: "12px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: 16,
          }}
        >
          <button
            type="button"
            className="wisdom-hamburger-btn"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
          >
            ☰
          </button>

          {/* WISDOM ADMIN HEADER COMPACT ACCOUNT V1 */}
          {/* WISDOM ADMIN HEADER SIZE ALIGNMENT V1.0.1 */}
          <NotificationBell headerCompact />

          <div
            aria-hidden="true"
            style={{
              width: 1,
              height: 32,
              background: "#e4e4e7",
              flexShrink: 0,
            }}
          />

          <div
            className="wisdom-admin-user-badge"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              minWidth: 0,
              minHeight: 38,
            }}
          >
            {user?.profile_photo ? (
              <img
                src={buildAssetUrl(user.profile_photo)}
                alt=""
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  objectFit: "cover",
                  flexShrink: 0,
                  border: "1px solid #e4e4e7",
                }}
              />
            ) : (
              <div
                aria-hidden="true"
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: "50%",
                  background: "#ffffff",
                  border: "1px solid #dedee3",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  flexShrink: 0,
                }}
              >
                <img
                  src={adminSystemIcon}
                  alt=""
                  style={{
                    width: 29,
                    height: 29,
                    objectFit: "contain",
                    display: "block",
                  }}
                />
              </div>
            )}

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                minWidth: 0,
                minHeight: 34,
                lineHeight: 1.2,
              }}
            >
              <span
                style={{
                  maxWidth: 170,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  color: "#18181b",
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {user?.name || "System Administrator"}
              </span>
              <span
                style={{
                  marginTop: 3,
                  color: "#71717a",
                  fontSize: 10.5,
                  fontWeight: 400,
                }}
              >
                {user?.role === "admin" ? "Admin" : "Staff"}
              </span>
            </div>
          </div>
        </header>

        <main
          ref={mainRef}
          style={{
            flex: 1,
            padding: 24,
            overflowY: "auto",
          }}
        >
          <Outlet />
        </main>
      </div>
      {showLogoutModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-logout-title"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 12000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
            background: "rgba(0,0,0,0.52)",
          }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setShowLogoutModal(false);
            }
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "390px",
              background: "#ffffff",
              border: "1px solid #d9d9dc",
              borderRadius: 6,
              boxShadow: "0 18px 46px rgba(0,0,0,0.18)",
              padding: "24px",
              fontFamily: "Inter, sans-serif",
            }}
          >
            <h3
              id="admin-logout-title"
              style={{
                margin: 0,
                color: "#111111",
                fontSize: "22px",
                fontWeight: 750,
                lineHeight: 1.2,
                letterSpacing: "-0.015em",
              }}
            >
              Logout
            </h3>

            <p
              style={{
                margin: "8px 0 0",
                color: "#66666b",
                fontSize: "14px",
                fontWeight: 400,
                lineHeight: 1.5,
              }}
            >
              Are you sure you want to log out?
            </p>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "8px",
                marginTop: "22px",
              }}
            >
              <button
                type="button"
                onClick={() => setShowLogoutModal(false)}
                style={{
                  minWidth: "96px",
                  height: "40px",
                  padding: "0 14px",
                  border: "1px solid #bfc0c4",
                  borderRadius: 6,
                  background: "#ffffff",
                  color: "#111111",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: 650,
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={confirmLogout}
                style={{
                  minWidth: "96px",
                  height: "40px",
                  padding: "0 14px",
                  border: "1px solid #111111",
                  borderRadius: 6,
                  background: "#111111",
                  color: "#ffffff",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: 650,
                }}
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}{" "}
      <MotionFeedbackOverlay
        open={signingOut}
        status={logoutFeedbackStatus}
        message={
          logoutFeedbackStatus === "success"
            ? "Logout successful"
            : "Logging out..."
        }
        blocking
      />
    </div>
  );
}
