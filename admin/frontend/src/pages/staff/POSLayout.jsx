import { Outlet, NavLink } from "react-router-dom";
import {
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
  MessageSquare,
} from "lucide-react";
import { useMemo, useState } from "react";
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
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth > 768);
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
      permission: "stock_transfer.view",
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
      permission: "cancellations_refunds.view",
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
          to: "/staff/support",
          icon: MessageSquare,
          label: "Support",
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
        { to: "/staff/dashboard", icon: LayoutDashboard, label: "Dashboard" },
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
          icon: LayoutDashboard,
          label: "Dashboard",
        },
        { to: "/staff/deliveries", icon: Truck, label: "Deliveries" },
        { to: "/staff/rider-history", icon: ClipboardList, label: "History" },
      ];
    }

    let additionalItems = [];

    if (String(user?.authority_level || "").toLowerCase() === "manager") {
      additionalItems = permissionNavItems
        .filter((item) => hasPermission(item.permission))
        .filter(
          (item) => !baseItems.some((baseItem) => baseItem.to === item.to),
        );
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
    setLogoutConfirmOpen(true);
  };

  const closeLogoutConfirm = () => {
    setLogoutConfirmOpen(false);
  };

  return (
    <div
      className={`pos-root ${sidebarOpen ? "sidebar-open" : "sidebar-closed"}`}
    >
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
            // 👉 If the item is a header, render a title text or a divider line
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
                <item.icon size={20} />
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
