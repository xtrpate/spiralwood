/**
 * components/customerlayout.jsx
 * Unified cart navbar:
 * - one visible Cart tab only
 * - /custom-cart hidden from navigation
 * - cart badge uses unified cart count
 */
import { Outlet, NavLink, useNavigate } from "react-router-dom";
import useAuthStore from "../../store/authStore";
import { useCart } from "./cartcontext";
// 👉 FIX: Removed the raw axios import
import api, { buildAssetUrl } from "../../services/api";
import {
  Home,
  Scissors,
  ShoppingBag,
  FileText,
  ShoppingCart,
  Package,
  Shield,
  HelpCircle,
  LogOut,
  Menu,
  X,
  Settings,
  UserPlus,
  LogIn,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import "./customerlayout.css";
import "./profile.css";

const navItems = [
  { to: "/", icon: Home, label: "Home" },
  { to: "/catalog", icon: ShoppingBag, label: "Products" },
  { to: "/appointment", icon: FileText, label: "Appointment" },
  { to: "/customize", icon: Scissors, label: "Customize" },
  { to: "/cart", icon: ShoppingCart, label: "Cart" },
  { to: "/orders", icon: Package, label: "My Orders" },
  { to: "/warranty", icon: Shield, label: "Warranty" },
  { to: "/faq", icon: HelpCircle, label: "FAQ" },
];

export default function CustomerLayout() {
  const { user, logout } = useAuthStore();
  const customerUser = user?.role === "customer" ? user : null;

  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // 👉 1. THE SCROLL STATE
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      // Trigger transparency when scrolled down more than 50px
      setIsScrolled(window.scrollY > 50);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // 👉 2. THE NAVIGATION BOUNCER
  const visibleNavItems = navItems.filter((item) => {
    if (!customerUser) {
      // Guests ONLY see these 4 links
      return ["Home", "Products", "Customize", "Cart"].includes(item.label);
    } else {
      // Logged-in users see everything EXCEPT Home (using logo instead)
      if (item.label === "Home") return false;
      return true;
    }
  });

  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const { cartCount } = useCart();
  const [activeOrdersCount, setActiveOrdersCount] = useState(0);

  useEffect(() => {
    if (customerUser) {
      // 👉 FIX: Swapped axios for your authenticated 'api' instance
      api
        .get("/customer/orders")
        .then((res) => {
          const activeOrders = res.data.filter(
            (o) => !["completed", "cancelled"].includes(o.status),
          );
          setActiveOrdersCount(activeOrders.length);
        })
        .catch(console.error);
    } else {
      setActiveOrdersCount(0);
    }
  }, [customerUser]);

  const avatarSrc = customerUser?.profile_photo
    ? buildAssetUrl(customerUser.profile_photo)
    : "";

  return (
    <div className="cust-root">
      {/* 👉 3. DYNAMIC SCROLL STYLING */}
      <header
        className="cust-navbar"
        style={{
          backgroundColor: isScrolled ? "rgba(26, 26, 46, 0.85)" : "#1a1a2e",
          backdropFilter: isScrolled ? "blur(12px)" : "none",
          borderBottom: isScrolled
            ? "1px solid rgba(255,255,255,0.05)"
            : "none",
          transition: "all 0.3s ease-in-out",
        }}
      >
        <div className="navbar-inner">
          <div
            className="navbar-brand"
            onClick={() => navigate(customerUser ? "/catalog" : "/")}
            style={{ cursor: "pointer" }}
          >
            <div className="nav-logo">W</div>
            <div className="nav-brand-text">
              <span className="nav-brand-name">SPIRAL WOOD</span>
              <span className="nav-brand-sub">Services</span>
            </div>
          </div>

          <nav className="navbar-links">
            {visibleNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `nav-link ${isActive ? "active" : ""}`
                }
              >
                <item.icon size={15} />
                <span>{item.label}</span>

                {item.to === "/cart" && cartCount > 0 && (
                  <span
                    style={{
                      background: "#c62828",
                      color: "white",
                      borderRadius: "50%",
                      width: 16,
                      height: 16,
                      fontSize: 10,
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginLeft: 4,
                    }}
                  >
                    {cartCount}
                  </span>
                )}

                {item.to === "/orders" && activeOrdersCount > 0 && (
                  <span
                    style={{
                      background: "#c62828",
                      color: "white",
                      borderRadius: "50%",
                      width: 16,
                      height: 16,
                      fontSize: 10,
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      marginLeft: 4,
                    }}
                  >
                    {activeOrdersCount}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="navbar-right">
            {customerUser ? (
              <div className="nav-user-wrapper" ref={dropdownRef}>
                <button
                  className="nav-user-btn"
                  onClick={() => setDropdownOpen((o) => !o)}
                  title="Account menu"
                >
                  <div className="nav-avatar">
                    {avatarSrc ? (
                      <img
                        src={avatarSrc}
                        alt="avatar"
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          borderRadius: "50%",
                        }}
                      />
                    ) : (
                      customerUser?.name?.charAt(0).toUpperCase()
                    )}
                  </div>

                  <span className="nav-username">
                    {customerUser?.name?.split(" ")[0]}
                  </span>

                  <div className="nav-hamburger-dots">
                    <span />
                    <span />
                    <span />
                  </div>
                </button>

                {dropdownOpen && (
                  <div className="nav-dropdown">
                    <div className="nav-dropdown-user">
                      <div className="nav-dropdown-avatar">
                        {avatarSrc ? (
                          <img src={avatarSrc} alt="avatar" />
                        ) : (
                          customerUser?.name?.charAt(0).toUpperCase()
                        )}
                      </div>

                      <div>
                        <span className="nav-dropdown-name">
                          {customerUser?.name}
                        </span>
                        <span className="nav-dropdown-email">
                          {customerUser?.email}
                        </span>
                      </div>
                    </div>

                    <div className="nav-dropdown-divider" />

                    <button
                      className="nav-dropdown-item"
                      onClick={() => {
                        setDropdownOpen(false);
                        navigate("/profilesettings");
                      }}
                    >
                      <Settings size={15} /> Settings
                    </button>

                    <div className="nav-dropdown-divider" />

                    <button
                      className="nav-dropdown-item danger"
                      onClick={handleLogout}
                    >
                      <LogOut size={15} /> Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  gap: "10px",
                  alignItems: "center",
                  marginRight: "10px",
                }}
              >
                <button
                  className="nav-signin-btn"
                  onClick={() => navigate("/login")}
                  style={{
                    padding: "8px 20px",
                    backgroundColor: "transparent",
                    color: "#d2b48c",
                    border: "1px solid transparent",
                    cursor: "pointer",
                    fontWeight: "bold",
                    transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => (e.target.style.borderColor = "#d2b48c")}
                  onMouseLeave={(e) =>
                    (e.target.style.borderColor = "transparent")
                  }
                >
                  Sign In
                </button>

                <button
                  onClick={() => navigate("/register")}
                  style={{
                    background: "#8B4513",
                    color: "white",
                    border: "none",
                    borderRadius: "20px",
                    fontWeight: "600",
                    cursor: "pointer",
                    padding: "8px 24px",
                    transition: "transform 0.2s",
                  }}
                  onMouseEnter={(e) =>
                    (e.target.style.transform = "scale(1.05)")
                  }
                  onMouseLeave={(e) => (e.target.style.transform = "scale(1)")}
                >
                  Sign Up
                </button>
              </div>
            )}

            <button
              className="nav-hamburger"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <nav className="mobile-nav">
            {visibleNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `mobile-nav-link ${isActive ? "active" : ""}`
                }
                onClick={() => setMobileOpen(false)}
              >
                <item.icon size={16} />
                <span>{item.label}</span>

                {item.to === "/cart" && cartCount > 0 && (
                  <span
                    style={{
                      background: "#c62828",
                      color: "white",
                      padding: "2px 6px",
                      borderRadius: "10px",
                      fontSize: "10px",
                      marginLeft: "auto",
                    }}
                  >
                    {cartCount}
                  </span>
                )}

                {item.to === "/orders" && activeOrdersCount > 0 && (
                  <span
                    style={{
                      background: "#c62828",
                      color: "white",
                      padding: "2px 6px",
                      borderRadius: "10px",
                      fontSize: "10px",
                      marginLeft: "auto",
                    }}
                  >
                    {activeOrdersCount} Active
                  </span>
                )}
              </NavLink>
            ))}

            {customerUser ? (
              <>
                <NavLink
                  to="/profilesettings"
                  className={({ isActive }) =>
                    `mobile-nav-link ${isActive ? "active" : ""}`
                  }
                  onClick={() => setMobileOpen(false)}
                >
                  <Settings size={16} />
                  <span>Settings</span>
                </NavLink>

                <button className="mobile-logout" onClick={handleLogout}>
                  <LogOut size={16} /> Sign Out
                </button>
              </>
            ) : (
              <>
                <NavLink
                  to="/login"
                  className="mobile-nav-link"
                  onClick={() => setMobileOpen(false)}
                >
                  <LogIn size={16} />
                  <span>Sign In</span>
                </NavLink>

                <NavLink
                  to="/register"
                  className="mobile-nav-link"
                  onClick={() => setMobileOpen(false)}
                >
                  <UserPlus size={16} />
                  <span>Sign Up</span>
                </NavLink>
              </>
            )}
          </nav>
        )}
      </header>

      <main className="cust-main">
        <Outlet />
      </main>

      <footer className="cust-footer">
        <div className="footer-inner">
          <div className="footer-brand">
            <div
              className="nav-logo"
              style={{ width: 32, height: 32, fontSize: 14 }}
            >
              W
            </div>
            <span>Spiral Wood Services</span>
          </div>
          <p>
            © {new Date().getFullYear()} Spiral Wood Services. All rights
            reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
