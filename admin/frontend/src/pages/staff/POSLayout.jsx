import { Outlet, NavLink } from "react-router-dom";
import {
  Home,
  LayoutDashboard,
  Search,
  ShoppingCart,
  Truck,
  CalendarClock,
  BarChart3,
  FileText,
  Package,
  LogOut,
  Menu,
  X,
  ChevronRight,
  ClipboardList,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import "./POSLayout.css";
import useAuthStore from "../../store/authStore";
import { useCart } from "../../pages/customer/cartcontext";
import NotificationBell from "../../components/NotificationBell";
import {
  MotionFeedbackOverlay,
  getMotionFeedbackDurations,
} from "../../components/MotionFeedbackOverlay";

export default function POSLayout() {
  const { user, logout, hasPermission } = useAuthStore();

  // WISDOM STAFF MOBILE SHELL PHASE A R3
  // WISDOM STAFF SHELL FINALIZATION PHASE A4 R1
  // Only operational staff roles use the adaptive phone/tablet shell.
  // Admin preserves the existing sidebar behavior.
  const hasStaffMobileShell =
    user?.role === "staff" &&
    ["cashier", "indoor", "delivery_rider"].includes(user?.staff_type);

  const [sidebarOpen, setSidebarOpen] = useState(() =>
    hasStaffMobileShell ? window.innerWidth >= 900 : window.innerWidth > 768,
  );
  const [mobileAccountOpen, setMobileAccountOpen] = useState(false);
  const [showMiniLogout, setShowMiniLogout] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [logoutFeedbackStatus, setLogoutFeedbackStatus] = useState("loading");
  const { clearCart } = useCart();

  const isAdmin = user?.role === "admin";
  const isCashier = user?.role === "staff" && user?.staff_type === "cashier";
  const isIndoorStaff = user?.role === "staff" && user?.staff_type === "indoor";
  const isDeliveryRider =
    user?.role === "staff" && user?.staff_type === "delivery_rider";

  const permissionNavItems = [
    {
      to: "/staff/admin/dashboard",
      icon: LayoutDashboard,
      label: "Dashboard",
      permission: "dashboard.view",
    },
    {
      to: "/staff/admin/products",
      icon: Search,
      label: "Products",
      permission: "products.view",
    },
    {
      to: "/staff/admin/inventory/raw",
      icon: Package,
      label: "Raw Materials",
      permission: "raw_materials.view",
    },
    {
      to: "/staff/admin/inventory/build",
      icon: Package,
      label: "Build Materials",
      permission: "build_materials.view",
    },
    {
      to: "/staff/admin/suppliers",
      icon: Package,
      label: "Suppliers",
      permission: "suppliers.view",
    },
    {
      to: "/staff/admin/stock-movements",
      icon: Package,
      label: "Stock Movements",
      permission: "stock_movements.view",
    },
    {
      to: "/staff/admin/stock-transfer",
      icon: Truck,
      label: "Stock Transfer",
      permission: "stock_movements.manage",
    },
    {
      to: "/staff/admin/physical-inventory",
      icon: Package,
      label: "Physical Inventory",
      permission: "physical_inventory.view",
    },
    {
      to: "/staff/admin/orders",
      icon: ShoppingCart,
      label: "Orders",
      permission: "orders.view",
    },
    {
      to: "/staff/admin/orders/cancellations",
      icon: FileText,
      label: "Cancellations",
      permission: "cancellations.view",
    },
    {
      to: "/staff/admin/tasks",
      icon: ClipboardList,
      label: "Task Assignments",
      permission: "task_assignments.view",
    },
    {
      to: "/staff/admin/appointments",
      icon: CalendarClock,
      label: "Appointments",
      permission: "appointments.view",
    },
    {
      to: "/staff/admin/delivery",
      icon: Truck,
      label: "Delivery Scheduling",
      permission: "delivery_scheduling.view",
    },
    {
      to: "/staff/admin/blueprints",
      icon: FileText,
      label: "Blueprint Management",
      permission: "blueprint_management.view",
    },
    {
      to: "/staff/admin/contracts",
      icon: FileText,
      label: "Contracts",
      permission: "contracts.view",
    },
    {
      to: "/staff/admin/warranty",
      icon: FileText,
      label: "Warranty",
      permission: "warranty.view",
    },
    {
      to: "/staff/admin/sales",
      icon: BarChart3,
      label: "Sales Reports",
      permission: "sales_report.view",
    },
    {
      to: "/staff/admin/customers",
      icon: Package,
      label: "Customers",
      permission: "customers.view",
    },
    {
      to: "/staff/admin/users",
      icon: FileText,
      label: "Users & Roles",
      permission: "users.view",
    },
    {
      to: "/staff/admin/audit-logs",
      icon: FileText,
      label: "Audit Logs",
      permission: "audit_logs.view",
    },
    {
      to: "/staff/admin/website/settings",
      icon: FileText,
      label: "Site Settings",
      permission: "site_settings.view",
    },
    {
      to: "/staff/admin/website/faqs",
      icon: FileText,
      label: "FAQs",
      permission: "faqs.view",
    },
    {
      to: "/staff/admin/website/pages",
      icon: FileText,
      label: "Page Content",
      permission: "page_content.view",
    },
    {
      to: "/staff/admin/backup",
      icon: FileText,
      label: "Backup",
      permission: "backup.view",
    },
  ];

  const navItems = useMemo(() => {
    if (isAdmin) {
      return [
        {
          to: "/admin/dashboard",
          icon: LayoutDashboard,
          label: "Admin Dashboard",
        },
      ];
    }

    let baseItems = [];

    if (isCashier) {
      baseItems = [
        { to: "/staff/products", icon: Search, label: "Product Search" },
        { to: "/staff/order", icon: ShoppingCart, label: "Process Order" },
        {
          to: "/staff/history",
          icon: ClipboardList,
          label: "Transaction History",
        },
        {
          to: "/staff/blueprint-payments",
          icon: FileText,
          label: "Blueprint Payments",
        },
        { to: "/staff/reports", icon: BarChart3, label: "Sales Reports" },
      ];
    } else if (isIndoorStaff) {
      baseItems = [
        { to: "/staff/dashboard", icon: Home, label: "Dashboard" },
        { to: "/staff/tasks", icon: ClipboardList, label: "My Tasks" },
        {
          to: "/staff/appointment",
          icon: CalendarClock,
          label: "Appointments",
        },
        { to: "/staff/inventory", icon: Package, label: "Inventory Lookup" },
      ];
    } else if (isDeliveryRider) {
      baseItems = [
        {
          to: "/staff/rider-dashboard",
          icon: Home,
          label: "Dashboard",
        },
        { to: "/staff/deliveries", icon: Truck, label: "Deliveries" },
        { to: "/staff/rider-history", icon: ClipboardList, label: "History" },
      ];
    }

    let additionalItems = [];
    const authorityLevel = String(
      user?.authority_level || "",
    ).toLowerCase();

    if (authorityLevel === "manager") {
      additionalItems = permissionNavItems
        .filter((item) => hasPermission(item.permission))
        .filter(
          (item) => !baseItems.some((baseItem) => baseItem.to === item.to),
        );
    } else if (hasPermission("stock_movements.manage")) {
      const standardStockTransferItem = permissionNavItems.find(
        (item) => item.to === "/staff/admin/stock-transfer",
      );

      if (
        standardStockTransferItem &&
        !baseItems.some(
          (baseItem) => baseItem.to === standardStockTransferItem.to,
        )
      ) {
        return [...baseItems, standardStockTransferItem];
      }
    }

    if (additionalItems.length > 0) {
      return [
        ...baseItems,
        { isHeader: true, label: "Manager Permissions" },
        ...additionalItems,
      ];
    }

    return baseItems;
  }, [
    isAdmin,
    isCashier,
    isIndoorStaff,
    isDeliveryRider,
    hasPermission,
    user?.authority_level,
  ]);

  const mobileNavItems = useMemo(() => {
    if (!hasStaffMobileShell) return [];

    const managerDividerIndex = navItems.findIndex((item) => item.isHeader);
    const coreItems =
      managerDividerIndex >= 0
        ? navItems.slice(0, managerDividerIndex)
        : navItems;

    return coreItems.filter((item) => !item.isHeader);
  }, [hasStaffMobileShell, navItems]);

  const mobileManagerItems = useMemo(() => {
    if (!hasStaffMobileShell) return [];

    const managerDividerIndex = navItems.findIndex((item) => item.isHeader);
    if (managerDividerIndex < 0) return [];

    return navItems
      .slice(managerDividerIndex + 1)
      .filter((item) => !item.isHeader);
  }, [hasStaffMobileShell, navItems]);

  const mobileNavLabel = (item) => {
    const labels = {
      "/staff/products": "Products",
      "/staff/order": "Order",
      "/staff/history": "History",
      "/staff/blueprint-payments": "Payments",
      "/staff/reports": "Reports",
      "/staff/dashboard": "Home",
      "/staff/tasks": "Tasks",
      "/staff/appointment": "Appointments",
      "/staff/inventory": "Inventory",
      "/staff/rider-dashboard": "Home",
      "/staff/deliveries": "Deliveries",
      "/staff/rider-history": "History",
    };

    return labels[item?.to] || item?.label || "Page";
  };

  // WISDOM ROLE BASED SIDEBAR IDENTITY V1
  const roleLabel = isAdmin
    ? "Administrator"
    : isCashier
      ? "Cashier"
      : isDeliveryRider
        ? "Delivery Staff"
        : isIndoorStaff
          ? "Furniture Specialist"
          : user?.role === "staff"
            ? "Staff"
            : user?.role || "User";

  const workspaceLabel = isAdmin
    ? "Admin Portal"
    : isCashier
      ? "POS System"
      : isDeliveryRider
        ? "Delivery"
        : isIndoorStaff
          ? "Staff Portal"
          : user?.role === "staff"
            ? "Staff Portal"
            : "System";

  useEffect(() => {
    if (!hasStaffMobileShell) return undefined;

    const compactQuery = window.matchMedia("(max-width: 899px)");

    const syncStaffNavigation = (event) => {
      setSidebarOpen(!event.matches);
      setMobileAccountOpen(false);
      setShowMiniLogout(false);
    };

    syncStaffNavigation(compactQuery);

    if (typeof compactQuery.addEventListener === "function") {
      compactQuery.addEventListener("change", syncStaffNavigation);

      return () =>
        compactQuery.removeEventListener("change", syncStaffNavigation);
    }

    compactQuery.addListener(syncStaffNavigation);
    return () => compactQuery.removeListener(syncStaffNavigation);
  }, [hasStaffMobileShell]);

  useEffect(() => {
    if (!hasStaffMobileShell) return undefined;

    const phoneQuery = window.matchMedia("(max-width: 767px)");

    const closeMobileAccountOffPhone = (event) => {
      if (!event.matches) setMobileAccountOpen(false);
    };

    closeMobileAccountOffPhone(phoneQuery);

    if (typeof phoneQuery.addEventListener === "function") {
      phoneQuery.addEventListener("change", closeMobileAccountOffPhone);

      return () =>
        phoneQuery.removeEventListener("change", closeMobileAccountOffPhone);
    }

    phoneQuery.addListener(closeMobileAccountOffPhone);
    return () => phoneQuery.removeListener(closeMobileAccountOffPhone);
  }, [hasStaffMobileShell]);

  const handleLogout = () => {
    if (signingOut) return;

    setLogoutConfirmOpen(false);
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
        window.location.href = "/login";
      }, durations.success);
    }, durations.loading);
  };

  const openLogoutConfirm = () => {
    setMobileAccountOpen(false);
    setLogoutConfirmOpen(true);
  };

  const closeLogoutConfirm = () => {
    setLogoutConfirmOpen(false);
  };

  return (
    <div
      className={`pos-root ${hasStaffMobileShell ? "pos-staff-workspace " : ""}${sidebarOpen ? "sidebar-open" : "sidebar-closed"}`}
    >
      {hasStaffMobileShell && (
        <header className="pos-mobile-staff-topbar">
          <div className="pos-mobile-staff-brand">
            <strong>WISDOM</strong>
            <span>{workspaceLabel}</span>
          </div>

          <div className="pos-mobile-staff-actions">
            <NotificationBell compact />
            <button
              type="button"
              className="pos-mobile-staff-account"
              onClick={() => setMobileAccountOpen(true)}
              aria-label="Open account"
              title="Account"
            >
              {user?.name?.charAt(0)?.toUpperCase() || "U"}
            </button>
          </div>
        </header>
      )}

      {hasStaffMobileShell && mobileAccountOpen && (
        <div
          className="pos-mobile-account-layer"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setMobileAccountOpen(false);
            }
          }}
        >
          <section
            className="pos-mobile-account-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-staff-account-title"
          >
            <div className="pos-mobile-account-handle" aria-hidden="true" />

            <div className="pos-mobile-account-header">
              <div className="pos-mobile-account-avatar" aria-hidden="true">
                {user?.name?.charAt(0)?.toUpperCase() || "U"}
              </div>

              <div className="pos-mobile-account-identity">
                <strong id="mobile-staff-account-title">
                  {user?.name || "Staff"}
                </strong>
                <span>{roleLabel}</span>
              </div>

              <button
                type="button"
                className="pos-mobile-account-close"
                onClick={() => setMobileAccountOpen(false)}
                aria-label="Close account"
                title="Close"
              >
                <X size={20} strokeWidth={2} />
              </button>
            </div>

            {mobileManagerItems.length > 0 && (
              <div className="pos-mobile-manager-tools">
                <div className="pos-mobile-account-section-label">
                  Manager Tools
                </div>

                <nav aria-label="Manager tools">
                  {mobileManagerItems.map((item) => (
                    <NavLink
                      key={`mobile-manager-${item.to}`}
                      to={item.to}
                      className="pos-mobile-manager-link"
                      onClick={() => setMobileAccountOpen(false)}
                    >
                      <item.icon
                        size={20}
                        strokeWidth={1.9}
                        aria-hidden="true"
                      />
                      <span>{item.label}</span>
                      <ChevronRight size={16} strokeWidth={1.8} aria-hidden="true" />
                    </NavLink>
                  ))}
                </nav>
              </div>
            )}

            <button
              type="button"
              className="pos-mobile-account-logout"
              onClick={openLogoutConfirm}
            >
              <LogOut size={19} strokeWidth={1.9} aria-hidden="true" />
              <span>Logout</span>
            </button>
          </section>
        </div>
      )}

      <div
        className="sidebar-overlay"
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      <aside className="pos-sidebar">
        <div
          className="sidebar-header"
          style={{ justifyContent: sidebarOpen ? "space-between" : "center" }}
        >
          {sidebarOpen && (
            <div className="sidebar-logo">
              <div className="logo-icon">W</div>
              <div className="logo-text">
                <span className="logo-name">WISDOM</span>
                <span className="logo-sub">{workspaceLabel}</span>
              </div>
            </div>
          )}
          <button
            className="sidebar-toggle"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item, index) => {
            // ðŸ‘‰ If the item is a header, render a title text or a divider line
            if (item.isHeader) {
              return sidebarOpen ? (
                <div key={`header-${index}`} className="sidebar-section-header">
                  {item.label}
                </div>
              ) : (
                <div key={`divider-${index}`} className="sidebar-divider" />
              );
            }

            // Otherwise, render the normal navigation link
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `nav-item ${isActive ? "active" : ""}`
                }
                onClick={() => {
                  if (window.innerWidth <= 768) {
                    setSidebarOpen(false);
                  }
                }}
              >
                <item.icon size={20} strokeWidth={1.9} />
                {sidebarOpen && <span>{item.label}</span>}
                {sidebarOpen && (
                  <ChevronRight size={14} className="nav-arrow" />
                )}
              </NavLink>
            );
          })}
        </nav>

        <div
          className="sidebar-footer"
          style={{
            flexDirection: sidebarOpen ? "row" : "column",
            justifyContent: sidebarOpen ? "flex-start" : "center",
            alignItems: "center",
            padding: sidebarOpen ? "16px 12px" : "16px 0",
            gap: sidebarOpen ? "8px" : "16px",
          }}
        >
          <div
            className="user-info"
            style={{
              flex: sidebarOpen ? 1 : "none",
              justifyContent: sidebarOpen ? "flex-start" : "center",
              width: sidebarOpen ? "auto" : "100%",
            }}
          >
            <div
              className="user-avatar-container"
              style={{
                position: "relative",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                margin: sidebarOpen ? "0" : "0 auto",
              }}
            >
              {showMiniLogout && !sidebarOpen && (
                <div
                  className="mini-logout-overlay"
                  onClick={() => setShowMiniLogout(false)}
                />
              )}

              {/* Stacked popup containing BOTH Logout and Notifications */}
              {!sidebarOpen && (
                <div
                  className={`mini-actions-popup ${showMiniLogout ? "visible" : ""}`}
                >
                  <button
                    className="mini-action-btn"
                    onClick={() => {
                      setShowMiniLogout(false);
                      openLogoutConfirm();
                    }}
                    title="Logout"
                    aria-label="Logout"
                  >
                    <LogOut size={18} />
                  </button>

                  {(isCashier || isIndoorStaff || isDeliveryRider) && (
                    <div className="mini-bell-wrapper">
                      <NotificationBell compact />
                    </div>
                  )}
                </div>
              )}

              <div
                className="user-avatar"
                onClick={() => {
                  if (!sidebarOpen) setShowMiniLogout(!showMiniLogout);
                }}
                style={{
                  cursor: sidebarOpen ? "default" : "pointer",
                }}
              >
                {user?.name?.charAt(0)?.toUpperCase() || "U"}
              </div>
            </div>

            {sidebarOpen && (
              <div className="user-details">
                <span className="user-name">{user?.name}</span>
                <span className="user-role">{roleLabel}</span>
              </div>
            )}
          </div>

          {/* Regular desktop layout when sidebar is OPEN */}
          {sidebarOpen && (isCashier || isIndoorStaff || isDeliveryRider) && (
            <NotificationBell compact />
          )}

          {sidebarOpen && (
            <button
              className="logout-btn"
              onClick={openLogoutConfirm}
              title="Logout"
              aria-label="Logout"
            >
              <LogOut size={18} />
            </button>
          )}
        </div>
      </aside>

      <main className="pos-main">
        <Outlet />
      </main>

      {hasStaffMobileShell && mobileNavItems.length > 0 && (
        <nav
          className={`pos-mobile-bottom-nav pos-mobile-bottom-nav-${mobileNavItems.length}`}
          aria-label={`${workspaceLabel} primary navigation`}
        >
          {mobileNavItems.map((item) => (
            <NavLink
              key={`mobile-${item.to}`}
              to={item.to}
              className={({ isActive }) =>
                `pos-mobile-bottom-item ${isActive ? "active" : ""}`
              }
              onClick={() => {
                setSidebarOpen(false);
                setMobileAccountOpen(false);
                setShowMiniLogout(false);
              }}
            >
              <item.icon size={22} strokeWidth={2.05} aria-hidden="true" />
              <span>{mobileNavLabel(item)}</span>
            </NavLink>
          ))}
        </nav>
      )}

      {logoutConfirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="staff-signout-title"
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
              closeLogoutConfirm();
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
            }}
          >
            <h3
              id="staff-signout-title"
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
                onClick={closeLogoutConfirm}
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
                onClick={handleLogout}
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
      )}

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
