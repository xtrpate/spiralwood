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

export default function POSLayout() {
  const { user, logout } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { clearCart } = useCart();

  const isAdmin = user?.role === "admin";
  const isCashier = user?.role === "staff" && user?.staff_type === "cashier";
  const isIndoorStaff = user?.role === "staff" && user?.staff_type === "indoor";
  const isDeliveryRider =
    user?.role === "staff" && user?.staff_type === "delivery_rider";

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

    if (isCashier) {
      return [
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
    }

    if (isIndoorStaff) {
      return [
        { to: "/staff/dashboard", icon: LayoutDashboard, label: "Dashboard" },
        { to: "/staff/tasks", icon: ClipboardList, label: "My Tasks" },
        {
          to: "/staff/appointment",
          icon: CalendarClock,
          label: "Appointments",
        },
        { to: "/staff/inventory", icon: Package, label: "Inventory Lookup" },
      ];
    }

    if (isDeliveryRider) {
      return [
        {
          to: "/staff/rider-dashboard",
          icon: LayoutDashboard,
          label: "Dashboard",
        },
        { to: "/staff/deliveries", icon: Truck, label: "Deliveries" },
        { to: "/staff/rider-history", icon: ClipboardList, label: "History" },
      ];
    }

    return [];
  }, [isAdmin, isCashier, isIndoorStaff, isDeliveryRider]);

  const roleLabel = isAdmin
    ? "Administrator"
    : isCashier
      ? "Cashier"
      : isDeliveryRider
        ? "Delivery Rider"
        : isIndoorStaff
          ? "Indoor Staff"
          : user?.role || "User";

  const handleLogout = () => {
    logout();
    clearCart(false);
    window.location.href = "/login";
  };

  return (
    <div
      className={`pos-root ${sidebarOpen ? "sidebar-open" : "sidebar-closed"}`}
    >
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
                <span className="logo-sub">POS System</span>
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
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `nav-item ${isActive ? "active" : ""}`
              }
            >
              <item.icon size={20} />
              {sidebarOpen && <span>{item.label}</span>}
              {sidebarOpen && <ChevronRight size={14} className="nav-arrow" />}
            </NavLink>
          ))}
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
          {!sidebarOpen && (isCashier || isIndoorStaff || isDeliveryRider) && (
            <NotificationBell compact />
          )}

          <div
            className="user-info"
            style={{
              flex: sidebarOpen ? 1 : "none",
              justifyContent: sidebarOpen ? "flex-start" : "center",
              width: sidebarOpen ? "auto" : "100%",
            }}
          >
            <div
              className="user-avatar"
              style={{ margin: sidebarOpen ? "0" : "0 auto" }}
            >
              {user?.name?.charAt(0)?.toUpperCase() || "U"}
            </div>
            {sidebarOpen && (
              <div className="user-details">
                <span className="user-name">{user?.name}</span>
                <span className="user-role">{roleLabel}</span>
              </div>
            )}
          </div>

          {sidebarOpen && (isCashier || isIndoorStaff || isDeliveryRider) && (
            <NotificationBell compact />
          )}

          {sidebarOpen && (
            <button
              className="logout-btn"
              onClick={handleLogout}
              title="Logout"
            >
              <LogOut size={18} />
            </button>
          )}
        </div>
      </aside>

      <main className="pos-main">
        <Outlet />
      </main>
    </div>
  );
}
