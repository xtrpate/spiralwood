// src/components/layout/AdminLayout.jsx – Sidebar + topbar shell
import React, {
  Suspense,
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import {
  Outlet,
  NavLink,
  Link,
  useNavigate,
  useLocation,
} from "react-router-dom";
import {
  ArrowLeftRight,
  BarChart3,
  Box,
  Boxes,
  Building2,
  Calendar,
  CalendarCheck2,
  ChartCandlestick,
  ChevronRight,
  ClipboardList,
  Database,
  Download,
  FileText,
  HelpCircle,
  History,
  Home,
  LogOut,
  Menu,
  Package,
  RefreshCw,
  RotateCcw,
  Ruler,
  Settings,
  ShelvingUnit,
  Shield,
  ShoppingCart,
  Truck,
  UserCog,
  Users,
  Wrench,
  TrendingUp,
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
  // ============================================================
  // TOP-LEVEL NAVIGATION
  // ============================================================
  {
    label: "Products",
    path: "/admin/products",
    permission: "products.view",
    icon: Package,
    roles: ["admin", "staff"],
  },
  {
    label: "Orders",
    path: "/admin/orders",
    permission: "orders.view",
    icon: ShoppingCart,
    roles: ["admin"],
  },
  {
    label: "Task Assignments",
    path: "/admin/tasks",
    permission: "task_assignments.view",
    icon: ClipboardList,
    roles: ["admin", "staff"],
  },
  {
    label: "Delivery Scheduling",
    path: "/admin/delivery",
    permission: "delivery_scheduling.view",
    icon: Truck,
    roles: ["admin", "staff"],
  },

  // ============================================================
  // MAINTENANCE
  // ============================================================
  { section: "Maintenance", icon: Wrench },

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
    icon: Box,
    roles: ["admin", "staff"],
  },
  {
    label: "Suppliers",
    path: "/admin/inventory/suppliers",
    permission: "suppliers.view",
    icon: Building2,
    roles: ["admin", "staff"],
  },

  // ============================================================
  // TRANSACTIONS
  // ============================================================
  { section: "Transactions", icon: ArrowLeftRight },

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
    label: "Cancellations",
    path: "/admin/orders/cancellations",
    permission: "cancellations.view",
    icon: RotateCcw,
    roles: ["admin", "staff"],
  },

  // ============================================================
  // OPERATIONS
  // ============================================================
  { section: "Operations", icon: CalendarCheck2 },

  {
    label: "Appointments",
    path: "/admin/appointments",
    icon: Calendar,
    permission: "appointments.view",
    roles: ["admin", "staff"],
  },
  {
    label: "Warranty",
    path: "/admin/warranty",
    permission: "warranty.view",
    icon: Shield,
    roles: ["admin", "staff"],
  },

  // ============================================================
  // BLUEPRINTS
  // ============================================================
  { section: "Blueprints", icon: Ruler },

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

  // ============================================================
  // REPORTS
  //
  // Reports itself is NOT a dropdown.
  // Each individual report is a dropdown.
  // ============================================================
  { section: "Reports", icon: FileText },

  {
    label: "Inventory Report",
    reportGroup: true,
    permission: "stock_movements.view",
    roles: ["admin", "staff"],
    icon: ShelvingUnit,
    children: [
      {
        label: "Raw Materials",
        path: "/admin/reports/current-inventory?tab=raw",
        icon: Boxes,
      },
      {
        label: "Ready-made Products",
        path: "/admin/reports/current-inventory?tab=ready_made",
        icon: Package,
      },
    ],
  },

  {
    label: "Stock Report",
    reportGroup: true,
    permission: "stock_movements.view",
    roles: ["admin", "staff"],
    icon: ChartCandlestick,
    children: [
      {
        label: "Stock Movements",
        path: "/admin/reports/stock?tab=movements",
        icon: RefreshCw,
      },
      {
        label: "Stock Transfers",
        path: "/admin/reports/stock?tab=transfers",
        icon: ArrowLeftRight,
      },
    ],
  },

  {
    label: "Operations Report",
    reportGroup: true,
    permission: "task_assignments.view",
    roles: ["admin", "staff"],
    icon: CalendarCheck2,
    children: [
      {
        label: "Task Assignments",
        path: "/admin/reports/operations?tab=tasks",
        icon: ClipboardList,
      },
      {
        label: "Appointments",
        path: "/admin/reports/operations?tab=appointments",
        icon: Calendar,
      },
      {
        label: "Deliveries",
        path: "/admin/reports/operations?tab=delivery",
        icon: Truck,
      },
      {
        label: "Warranty Claims",
        path: "/admin/reports/operations?tab=warranty",
        icon: Shield,
      },
    ],
  },

  {
    label: "Transaction Report",
    reportGroup: true,
    permission: "orders.view",
    roles: ["admin", "staff"],
    icon: ArrowLeftRight,
    children: [
      {
        label: "Orders",
        path: "/admin/reports/transactions?tab=orders",
        icon: ShoppingCart,
      },
      {
        label: "Cancellations",
        path: "/admin/reports/transactions?tab=cancellations",
        icon: RotateCcw,
      },
    ],
  },

  {
    label: "Sales & Profitability Report",
    reportGroup: true,
    permission: "sales_report.view",
    roles: ["admin", "staff"],
    icon: TrendingUp,
    children: [
      {
        label: "Sales",
        path: "/admin/sales",
        icon: TrendingUp,
      },
      {
        label: "Profitability",
        path: "/admin/reports/sales-profitability",
        icon: BarChart3,
      },
    ],
  },

  // ============================================================
  // ADMINISTRATION
  // ============================================================
  { section: "Administration", icon: Shield },

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

  // ============================================================
  // WEBSITE
  // ============================================================
  { section: "Website", icon: Settings },

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

const getSectionForPath = (pathname) => {
  let currentSection = null;

  for (const item of NAV_ITEMS) {
    if (item.section) {
      currentSection = item.section;
    } else if (
      item.path &&
      (pathname === item.path || pathname.startsWith(`${item.path}/`))
    ) {
      return currentSection;
    }
  }

  return null;
};

function AdminRouteLoadingFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        minHeight: "40vh",
        display: "grid",
        placeItems: "center",
        padding: "32px 16px",
        color: "#71717a",
        fontSize: 13,
      }}
    >
      Loading...
    </div>
  );
}

export default function AdminLayout() {
  const { user, logout, hasPermission } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(true);
  const [openSection, setOpenSection] = useState("Dashboard");
  const [openReportGroup, setOpenReportGroup] = useState(null);
  const [sidebarHovering, setSidebarHovering] = useState(false);
  // WISDOM ADMIN OFFICIAL LOGO V1
  const [brandLogo, setBrandLogo] = useState("");
  const { clearCart } = useCart();

  const mainRef = useRef(null);
  useEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
  }, [location.pathname]);

  useLayoutEffect(() => {
    const activeSection = getSectionForPath(location.pathname);

    if (activeSection) {
      setOpenSection(activeSection);
    }

    const activeReportGroup = NAV_ITEMS.find(
      (item) =>
        item.reportGroup &&
        item.children?.some(
          (child) => location.pathname === child.path.split("?")[0],
        ),
    );

    if (activeReportGroup) {
      setOpenReportGroup(activeReportGroup.label);
      setOpenSection("Reports");
    }
  }, [location.pathname]);

  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [logoutFeedbackStatus, setLogoutFeedbackStatus] = useState("loading");
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebarExpanded = open || sidebarHovering || mobileOpen;

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

    const permissionAllowed =
      !item.permission || hasPermission(item.permission);

    return roleAllowed && permissionAllowed;
  });

  const visibleItems = baseVisibleItems.filter((item, index, array) => {
    if (!item.section) return true;
    const nextItem = array[index + 1];
    return nextItem && !nextItem.section; // Only keep the section header if it has links under it
  });

  let currentSection = null;

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
        onMouseEnter={() => setSidebarHovering(true)}
        onMouseLeave={() => setSidebarHovering(false)}
        style={{
          width: sidebarExpanded ? 240 : 64,
          background: "#0a0a0a",
          color: "#e5e7eb",
          transition: "width .2s ease",
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
            {sidebarExpanded && (
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

        {hasPermission("dashboard.view") && (
          <div
            style={{
              padding: "12px 0 4px 0",
            }}
          >
            <NavLink
              to="/admin/dashboard"
              end
              className="wisdom-sidebar-link wisdom-sidebar-primary-link"
              title={!sidebarExpanded ? "Dashboard" : undefined}
              onClick={() => setMobileOpen(false)}
              style={({ isActive }) => ({
                display: "flex",
                alignItems: "center",
                justifyContent: sidebarExpanded ? "flex-start" : "center",
                gap: sidebarExpanded ? 10 : 0,
                margin: sidebarExpanded ? "0 8px" : "0",
                padding: sidebarExpanded ? "9px 10px" : "10px 0",
                color: isActive ? "#ffffff" : "#a1a1aa",
                background: isActive ? "#27272a" : "transparent",
                borderRadius: 6,
                textDecoration: "none",
                fontSize: 13.5,
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
                <Home size={16} strokeWidth={1.7} />
              </span>
              {sidebarExpanded && <span>Dashboard</span>}
            </NavLink>
          </div>
        )}

        <nav
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "8px 0",
          }}
        >
          {visibleItems.map((item, i) => {
            // ==========================================================
            // SECTION TITLE / DROPDOWN
            // Reports is a permanent heading.
            // All other sections are collapsible.
            // ==========================================================
            if (item.section) {
              currentSection = item.section;
              const SectionIcon = item.icon;

              // Reports is NOT a dropdown.
              if (item.section === "Reports") {
                return (
                  <div
                    key={`section-${item.section}`}
                    className="wisdom-sidebar-section-heading"
                    title={!sidebarExpanded ? item.section : undefined}
                    style={
                      !sidebarExpanded
                        ? {
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            margin: "12px 8px",
                            padding: "12px 0",
                          }
                        : {}
                    }
                  >
                    {!sidebarExpanded && SectionIcon ? (
                      <span
                        style={{
                          color: "#71717a",
                          display: "flex",
                          justifyContent: "center",
                          width: "100%",
                        }}
                      >
                        <SectionIcon size={18} strokeWidth={1.8} />
                      </span>
                    ) : (
                      sidebarExpanded && item.section
                    )}
                  </div>
                );
              }

              const sectionIsOpen = openSection === item.section;

              return (
                <button
                  key={`section-${item.section}`}
                  type="button"
                  className={`wisdom-sidebar-section-toggle ${
                    sectionIsOpen ? "is-open" : ""
                  }`}
                  onClick={() => {
                    setOpenSection((current) =>
                      current === item.section ? null : item.section,
                    );
                    setOpenReportGroup(null);
                    if (!open && !sidebarHovering && !mobileOpen) setOpen(true);
                  }}
                  aria-expanded={sectionIsOpen}
                  title={!sidebarExpanded ? item.section : undefined}
                  aria-label={`${sectionIsOpen ? "Collapse" : "Expand"} ${
                    item.section
                  }`}
                  style={
                    !sidebarExpanded
                      ? {
                          justifyContent: "center",
                          padding: "10px 0",
                          margin: "12px 8px",
                          width: "calc(100% - 16px)",
                        }
                      : {}
                  }
                >
                  {!sidebarExpanded && SectionIcon ? (
                    <span
                      style={{
                        color: sectionIsOpen ? "#ffffff" : "#71717a",
                        display: "flex",
                        justifyContent: "center",
                        width: "100%",
                      }}
                    >
                      <SectionIcon size={18} strokeWidth={1.8} />
                    </span>
                  ) : (
                    <>
                      <span className="wisdom-sidebar-section-toggle-label">
                        {sidebarExpanded && item.section}
                      </span>

                      {sidebarExpanded && (
                        <ChevronRight
                          size={14}
                          strokeWidth={1.8}
                          className="wisdom-sidebar-section-chevron"
                          aria-hidden="true"
                        />
                      )}
                    </>
                  )}
                </button>
              );
            }

            // ==========================================================
            // REPORT GROUP
            // Reports itself is NOT collapsible.
            // Each individual report is collapsible.
            // ==========================================================
            if (currentSection === "Reports" && item.reportGroup) {
              const reportIsOpen = openReportGroup === item.label;
              const GroupIcon = item.icon;

              const visibleChildren = (item.children || []).filter((child) => {
                return true;
              });

              if (
                !item.roles?.includes(user?.role) ||
                (item.permission && !hasPermission(item.permission))
              ) {
                return null;
              }

              return (
                <div
                  key={`report-group-${item.label}`}
                  className="wisdom-sidebar-report-group"
                >
                  <button
                    type="button"
                    className={`wisdom-sidebar-report-toggle ${
                      reportIsOpen ? "is-open" : ""
                    }`}
                    onClick={() => {
                      setOpenReportGroup((current) =>
                        current === item.label ? null : item.label,
                      );
                      setOpenSection("Reports");
                      if (!open && !sidebarHovering && !mobileOpen)
                        setOpen(true);
                    }}
                    aria-expanded={reportIsOpen}
                    title={!sidebarExpanded ? item.label : undefined}
                    style={
                      !sidebarExpanded
                        ? {
                            justifyContent: "center",
                            padding: "10px 0",
                          }
                        : {}
                    }
                  >
                    {!sidebarExpanded && GroupIcon ? (
                      <span
                        className="wisdom-sidebar-child-icon"
                        style={{
                          color: reportIsOpen ? "#ffffff" : "#a1a1aa",
                        }}
                      >
                        <GroupIcon size={18} strokeWidth={1.7} />
                      </span>
                    ) : (
                      <>
                        <span className="wisdom-sidebar-report-label">
                          {sidebarExpanded && item.label}
                        </span>

                        {sidebarExpanded && (
                          <ChevronRight
                            size={15}
                            strokeWidth={1.8}
                            className={`wisdom-sidebar-chevron ${
                              reportIsOpen ? "is-open" : ""
                            }`}
                            aria-hidden="true"
                          />
                        )}
                      </>
                    )}
                  </button>

                  {sidebarExpanded && reportIsOpen && (
                    <div className="wisdom-sidebar-report-children">
                      {visibleChildren.map((child) => {
                        const ChildIcon = child.icon;
                        const [basePath, query] = child.path.split("?");
                        const isMatch = query
                          ? location.pathname === basePath &&
                            (location.search.includes(query) ||
                              (!location.search &&
                                (query === "tab=orders" ||
                                  query === "tab=tasks" ||
                                  query === "tab=raw" ||
                                  query === "tab=movements")))
                          : location.pathname === basePath;

                        return (
                          <Link
                            key={`${item.label}-${child.path}-${child.label}`}
                            to={child.path}
                            className="wisdom-sidebar-report-child"
                            aria-current={isMatch ? "page" : undefined}
                            onClick={() => setMobileOpen(false)}
                          >
                            <span
                              className="wisdom-sidebar-child-icon"
                              aria-hidden="true"
                            >
                              {ChildIcon && (
                                <ChildIcon size={15} strokeWidth={1.7} />
                              )}
                            </span>

                            <span>{child.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            // ==========================================================
            // NORMAL SECTION CHILD
            // ==========================================================
            if (currentSection) {
              if (!sidebarExpanded || currentSection !== openSection) {
                return null;
              }

              const Icon = item.icon;

              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end
                  className="wisdom-sidebar-link wisdom-sidebar-subnav-link"
                  title={!sidebarExpanded ? item.label : undefined}
                  onClick={() => setMobileOpen(false)}
                  style={({ isActive }) => {
                    const [basePath, query] = item.path.split("?");
                    const isMatch = query
                      ? isActive && location.search.includes(query)
                      : isActive;
                    return {
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-start",
                      gap: 10,
                      margin: "2px 8px 2px 18px",
                      padding: "9px 10px",
                      color: isMatch ? "#ffffff" : "#a1a1aa",
                      background: isMatch ? "#27272a" : "transparent",
                      borderRadius: 6,
                      textDecoration: "none",
                      fontSize: 13.5,
                      fontWeight: isMatch ? 600 : 500,
                      whiteSpace: "nowrap",
                      transition: "background .15s, color .15s",
                    };
                  }}
                >
                  <span
                    className="wisdom-sidebar-child-icon"
                    aria-hidden="true"
                  >
                    {Icon && <Icon size={16} strokeWidth={1.7} />}
                  </span>

                  {sidebarExpanded && <span>{item.label}</span>}
                </NavLink>
              );
            }

            // ==========================================================
            // TOP-LEVEL NAVIGATION
            // Products / Orders / Task Assignments / Delivery Scheduling
            // ==========================================================
            const Icon = item.icon;

            return (
              <NavLink
                key={item.path}
                to={item.path}
                end
                className="wisdom-sidebar-link wisdom-sidebar-primary-link"
                title={!sidebarExpanded ? item.label : undefined}
                onClick={() => setMobileOpen(false)}
                style={({ isActive }) => {
                  const [basePath, query] = item.path.split("?");
                  const isMatch = query
                    ? isActive && location.search.includes(query)
                    : isActive;
                  return {
                    display: "flex",
                    alignItems: "center",
                    justifyContent: sidebarExpanded ? "flex-start" : "center",
                    gap: sidebarExpanded ? 10 : 0,
                    margin: sidebarExpanded ? "2px 8px" : "2px 0",
                    padding: sidebarExpanded ? "9px 10px" : "10px 0",
                    color: isMatch ? "#ffffff" : "#a1a1aa",
                    background: isMatch ? "#27272a" : "transparent",
                    borderRadius: 6,
                    textDecoration: "none",
                    fontSize: 13.5,
                    fontWeight: isMatch ? 600 : 500,
                    whiteSpace: "nowrap",
                    transition: "background .15s, color .15s",
                  };
                }}
              >
                <span className="wisdom-sidebar-child-icon" aria-hidden="true">
                  {Icon && <Icon size={17} strokeWidth={1.7} />}
                </span>

                {sidebarExpanded && <span>{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>

        {/* LOGOUT BUTTON - Outside <nav> to pin to bottom */}
        <div
          style={{
            padding: sidebarExpanded ? "8px 16px" : "8px 0",
            borderTop: "1px solid #27272a",
          }}
        >
          <button
            type="button"
            className="wisdom-sidebar-logout"
            onClick={handleLogout}
            title={!sidebarExpanded ? "Logout" : undefined}
            aria-label="Logout"
            style={{
              width: "100%",
              minHeight: 36,
              padding: sidebarExpanded ? "9px 12px" : "10px 0",
              border: "none",
              borderRadius: 6,
              background: "transparent",
              color: "#a1a1aa",
              display: "flex",
              alignItems: "center",
              justifyContent: sidebarExpanded ? "flex-start" : "center",
              gap: 10,
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 13,
              fontWeight: 500,
              whiteSpace: "nowrap",
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
                width: 18,
                height: 18,
                flex: "0 0 18px",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <LogOut size={16} strokeWidth={1.8} />
            </span>
            {sidebarExpanded && <span>Logout</span>}
          </button>
        </div>

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
          <button
            type="button"
            className="wisdom-sidebar-header-toggle"
            onClick={() => {
              setOpen((current) => !current);
              setSidebarHovering(false);
            }}
            aria-label={open ? "Minimize sidebar" : "Expand sidebar"}
            title={open ? "Minimize sidebar" : "Expand sidebar"}
          >
            <Menu size={20} strokeWidth={1.8} />
          </button>

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
                {user?.role === "admin"
                  ? String(user?.authority_level || "").toLowerCase() ===
                    "admin"
                    ? "Super Admin"
                    : "Manager"
                  : "Staff"}
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
          <Suspense fallback={<AdminRouteLoadingFallback />}>
            <Outlet />
          </Suspense>
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
