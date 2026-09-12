// src/components/layout/AdminLayout.jsx – Sidebar + topbar shell
import React, { useState, useEffect, useRef } from "react";
import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import {
  ArrowLeftRight,
  BarChart3,
  Boxes,
  Building2,
  Calendar,
  ClipboardList,
  Database,
  Download,
  FileText,
  HelpCircle,
  History,
  Home,
  LogOut,
  Package,
  RefreshCw,
  RotateCcw,
  Ruler,
  Settings,
  Shield,
  ShoppingCart,
  Truck,
  UserCog,
  Users,
  Wrench,
} from "lucide-react";
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

const getLogoUrl = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (/^(https?:|data:|blob:)/i.test(raw)) {
    return buildAssetUrl(raw);
  }

  const cleaned = raw.replace(/\\/g, "/").replace(/^\/+/, "");
  return buildAssetUrl(`/${cleaned}`);
};

const NAV_ITEMS = [
  { section: "Dashboard" },
  {
    label: "Dashboard",
    path: "/admin/dashboard",
    icon: Home,
    permission: "dashboard.view",
    roles: ["admin", "staff"],
  },

  { section: "Maintenance" },
  {
    label: "Products",
    path: "/admin/products",
    permission: "products.view",
    icon: Package,
    roles: ["admin", "staff"],
  },
  {
    label: "Raw Materials",
    path: "/admin/inventory/raw",
    permission: "raw_materials.view",
    icon: Boxes,
    roles: ["admin", "staff"],
  },
  {
    label: "Build Materials",
    path: "/admin/inventory/build",
    permission: "build_materials.view",
    icon: Wrench,
    roles: ["admin", "staff"],
  },
  {
    label: "Suppliers",
    path: "/admin/inventory/suppliers",
    permission: "suppliers.view",
    icon: Building2,
    roles: ["admin", "staff"],
  },

  { section: "Transactions" },
  {
    label: "Stock Movements",
    path: "/admin/inventory/movements",
    permission: "stock_movements.view",
    icon: RefreshCw,
    roles: ["admin", "staff"],
  },
  {
    label: "Stock Transfer",
    path: "/admin/inventory/transfers",
    icon: ArrowLeftRight,
    permission: "stock_movements.manage",
    roles: ["admin", "staff"],
  },
  {
    label: "Physical Inventory",
    path: "/admin/inventory/physical-inventory",
    icon: ClipboardList,
    permission: "stock_movements.manage",
    roles: ["admin", "staff"],
  },
  {
    label: "Orders",
    path: "/admin/orders",
    permission: "orders.view",
    icon: ShoppingCart,
    roles: ["admin", "staff"],
  },
  {
    label: "Cancellations",
    path: "/admin/orders/cancellations",
    permission: "cancellations_refunds.view",
    icon: RotateCcw,
    roles: ["admin", "staff"],
  },
  {
    label: "POS QR Recovery",
    path: "/admin/pos-qr-recovery",
    icon: RotateCcw,
    permission: "pos_qr_recovery.view",
    roles: ["admin", "staff"],
  },
  // POS QR Recovery remains routed and functional, but is intentionally
  // hidden from the Admin sidebar for the current evaluation build.

  { section: "Operations" },
  {
    label: "Task Assignments",
    path: "/admin/tasks",
    permission: "task_assignments.view",
    icon: ClipboardList,
    roles: ["admin", "staff"],
  },
  {
    label: "Appointments",
    path: "/admin/appointments",
    icon: Calendar,
    permission: "appointments.view",
    roles: ["admin", "staff"],
  },
  {
    label: "Delivery Scheduling",
    path: "/admin/delivery",
    icon: Truck,
    permission: "delivery_scheduling.view",
    roles: ["admin", "staff"],
  },

  { section: "Blueprints & Production" },
  {
    label: "Blueprint Management",
    path: "/admin/blueprints",
    permission: "blueprint_management.view",
    icon: Ruler,
    roles: ["admin", "staff"],
  },
  {
    label: "Contracts",
    path: "/admin/contracts",
    icon: FileText,
    permission: "contracts.view",
    roles: ["admin", "staff"],
  },

  { section: "Customer Service" },
  {
    label: "Warranty",
    path: "/admin/warranty",
    permission: "warranty.view",
    icon: Shield,
    roles: ["admin", "staff"],
  },

  { section: "Reports" },
  {
    label: "Inventory Report",
    path: "/admin/reports/current-inventory",
    icon: Boxes,
    permission: "stock_movements.view",
    roles: ["admin", "staff"],
  },
  {
    label: "Stock In Report",
    path: "/admin/reports/daily-stock-in",
    icon: Download,
    permission: "stock_movements.view",
    roles: ["admin", "staff"],
  },
  {
    label: "Delivery Report",
    path: "/admin/reports/deliveries",
    icon: Truck,
    roles: ["admin"],
  },
  {
    label: "Sales Report",
    path: "/admin/sales",
    permission: "sales_report.view",
    icon: BarChart3,
    roles: ["admin", "staff"],
  },

  { section: "Administration" },
  {
    label: "Customers",
    path: "/admin/customers",
    icon: Users,
    permission: "customers.view",
    roles: ["admin", "staff"],
  },
  {
    label: "Users & Roles",
    path: "/admin/users",
    icon: UserCog,
    permission: "users.view",
    roles: ["admin", "staff"],
  },
  {
    label: "Audit Logs",
    path: "/admin/audit-logs",
    icon: History,
    permission: "audit_logs.view",
    roles: ["admin", "staff"],
  },

  { section: "Website" },
  {
    label: "Site Settings",
    path: "/admin/website/settings",
    icon: Settings,
    permission: "site_settings.view",
    roles: ["admin", "staff"],
  },
  {
    label: "FAQs",
    path: "/admin/website/faqs",
    icon: HelpCircle,
    permission: "faqs.view",
    roles: ["admin", "staff"],
  },
  {
    label: "Page Content",
    path: "/admin/website/pages",
    icon: FileText,
    permission: "page_content.view",
    roles: ["admin", "staff"],
  },
  {
    label: "Backup",
    path: "/admin/backup",
    icon: Database,
    permission: "backup.view",
    roles: ["admin", "staff"],
  },
];

export default function AdminLayout() {
  const { user, logout, hasPermission } = useAuthStore();
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
            document.title = res.data.display.site_name + " - Admin";
          }
          if (res.data?.display?.site_logo) {
            const faviconUrl = getLogoUrl(res.data.display.site_logo);
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

  const baseVisibleItems = NAV_ITEMS.filter((item) => {
    if (item.section) return true;

    const roleAllowed = !item.roles || item.roles.includes(user?.role);

    // 👉 FIX: Automatically allow viewing for Administrators, otherwise check specific permissions
    const permissionAllowed =
      user?.role === "admin" ||
      !item.permission ||
      hasPermission(item.permission);

    return roleAllowed && permissionAllowed;
  });

  // 👉 EXTRA POLISH: Hide empty section headers so your sidebar looks perfectly clean
  const visibleItems = baseVisibleItems.filter((item, index, array) => {
    if (!item.section) return true;
    const nextItem = array[index + 1];
    return nextItem && !nextItem.section; // Only keep the section header if it has links under it
  });

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
                onError={(e) => {
                  e.currentTarget.style.display = "none";
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

            const Icon = item.icon;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                end
                title={!open ? item.label : undefined}
                onClick={() => setMobileOpen(false)}
                style={({ isActive }) => ({
                  display: "flex",
                  alignItems: "center",
                  justifyContent: open ? "flex-start" : "center",
                  gap: open ? 10 : 0,
                  margin: "2px 8px",
                  padding: open ? "9px 10px" : "9px 0",
                  color: isActive ? "#ffffff" : "#a1a1aa",
                  background: isActive ? "#27272a" : "transparent",
                  borderRadius: 6,
                  textDecoration: "none",
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 500,
                  whiteSpace: "nowrap",
                  transition: "background .15s, color .15s",
                })}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 18,
                    height: 18,
                    flex: "0 0 18px",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon size={16} strokeWidth={1.7} />
                </span>
                {open && <span>{item.label}</span>}
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
