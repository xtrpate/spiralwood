// src/components/layout/AdminLayout.jsx – Sidebar + topbar shell
import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import api, { buildAssetUrl } from "../../services/api";
import useAuthStore from "../../store/authStore";
import toast from "react-hot-toast";
import { useCart } from "../../pages/customer/cartcontext";
import NotificationBell from "../NotificationBell";
import OversizedDeliveryEstimatorPanel from "../OversizedDeliveryEstimatorPanel";
import "./AdminLayout.css";

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
  const { clearCart } = useCart();

  const mainRef = useRef(null);
  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
  }, [location.pathname]);

  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [deliveryGate, setDeliveryGate] = useState({
    active: false,
    readyForQuote: true,
    message: "",
  });

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

  const estimationBlueprintId = useMemo(() => {
    const match = String(location.pathname || "").match(
      /^\/admin\/blueprints\/([1-9][0-9]*)\/estimation\/?$/,
    );

    return match ? Number(match[1]) : null;
  }, [location.pathname]);

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

  useEffect(() => {
    setDeliveryGate({
      active: Boolean(estimationBlueprintId),
      readyForQuote: !estimationBlueprintId,
      message: estimationBlueprintId
        ? "Wait for the oversized-delivery assessment to finish loading."
        : "",
    });
  }, [estimationBlueprintId]);

  const updateDeliveryGate = useCallback((nextGate) => {
    setDeliveryGate((current) => {
      const normalized = {
        active: Boolean(nextGate?.active),
        readyForQuote: Boolean(nextGate?.readyForQuote),
        message: String(nextGate?.message || ""),
      };

      if (
        current.active === normalized.active &&
        current.readyForQuote === normalized.readyForQuote &&
        current.message === normalized.message
      ) {
        return current;
      }

      return normalized;
    });
  }, []);

  const handleLogout = () => {
    setShowLogoutModal(true);
  };

  const confirmLogout = () => {
    setShowLogoutModal(false);
    logout();
    clearCart(false);
    navigate("/login");
  };

  const handleMainClickCapture = (event) => {
    if (!estimationBlueprintId || !deliveryGate.active) return;

    const target = event.target instanceof Element ? event.target : null;

    const button = target?.closest("button");
    if (!button) return;

    const label = String(button.textContent || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();

    if (!label.includes("send quote")) return;
    if (deliveryGate.readyForQuote) return;

    event.preventDefault();
    event.stopPropagation();

    toast.error(
      deliveryGate.message ||
        "Complete the oversized-delivery assessment before sending the quotation.",
    );
  };

  const visibleItems = NAV_ITEMS.filter(
    (item) => item.section || !item.roles || item.roles.includes(user?.role),
  );

  return (
    <div
      className="wisdom-admin-shell"
      style={{
        display: "flex",
        minHeight: "100vh",
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
            <span style={{ fontSize: 22 }}>🪵</span>
            {open && (
              <span
                style={{
                  fontWeight: 800,
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

          <NotificationBell />

          <span
            className="wisdom-admin-user-badge"
            style={{
              fontSize: 13,
              color: "#52525b",
              fontWeight: 500,
            }}
          >
            👤 {user?.name}{" "}
            <span
              style={{
                fontSize: 11,
                background: "#f4f4f5",
                color: "#18181b",
                padding: "3px 10px",
                borderRadius: 20,
                fontWeight: 600,
                letterSpacing: "0.02em",
                marginLeft: "4px",
              }}
            >
              {user?.role}
            </span>
          </span>

          <button
            onClick={handleLogout}
            style={{
              background: "#18181b",
              color: "#ffffff",
              border: "none",
              padding: "7px 18px",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 600,
              transition: "background 0.2s",
            }}
            onMouseEnter={(event) => {
              event.currentTarget.style.background = "#3f3f46";
            }}
            onMouseLeave={(event) => {
              event.currentTarget.style.background = "#18181b";
            }}
          >
            Logout
          </button>
        </header>

        <main
          ref={mainRef}
          style={{
            flex: 1,
            padding: 24,
            overflowY: "auto",
          }}
          onClickCapture={handleMainClickCapture}
        >
          {estimationBlueprintId && (
            <OversizedDeliveryEstimatorPanel
              key={estimationBlueprintId}
              blueprintId={estimationBlueprintId}
              onGateChange={updateDeliveryGate}
            />
          )}

          <Outlet />
        </main>
      </div>

      {showLogoutModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(4px)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              background: "#0a0a0a",
              width: "min(360px, 90vw)",
              padding: 24,
              borderRadius: 16,
              boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
              border: "1px solid #27272a",
              fontFamily: "Inter, sans-serif",
            }}
          >
            <h2
              style={{
                marginTop: 0,
                color: "#ffffff",
                fontWeight: 800,
                fontSize: 18,
                letterSpacing: "-0.01em",
                marginBottom: 8,
              }}
            >
              Sign out
            </h2>

            <p
              style={{
                fontSize: 13,
                color: "#a1a1aa",
                marginBottom: 24,
                lineHeight: 1.5,
              }}
            >
              Are you sure you want to log out of your account? You will need to
              sign back in to access the admin portal.
            </p>

            <div
              style={{
                display: "flex",
                gap: 12,
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={() => setShowLogoutModal(false)}
                style={{
                  padding: "9px 16px",
                  background: "transparent",
                  border: "1px solid #3f3f46",
                  color: "#e5e7eb",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  transition: "background 0.2s",
                }}
                onMouseEnter={(event) => {
                  event.currentTarget.style.background = "#27272a";
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.background = "transparent";
                }}
              >
                Cancel
              </button>

              <button
                onClick={confirmLogout}
                style={{
                  padding: "9px 16px",
                  background: "#ffffff",
                  color: "#0a0a0a",
                  border: "none",
                  borderRadius: 8,
                  cursor: "pointer",
                  fontWeight: 700,
                  fontSize: 13,
                  transition: "opacity 0.2s",
                }}
                onMouseEnter={(event) => {
                  event.currentTarget.style.opacity = "0.8";
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.opacity = "1";
                }}
              >
                Yes, log out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
