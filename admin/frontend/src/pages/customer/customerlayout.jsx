import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import useAuthStore from "../../store/authStore";
import { useCart } from "./cartcontext";
<<<<<<< HEAD
// 👉 FIX: Removed the raw axios import
=======
>>>>>>> e0754d8c228afd1fa087871ba6560f0f5bd1a3d4
import api, { buildAssetUrl } from "../../services/api";
import {
  Home,
  Scissors,
  ShoppingBag,
  FileText,
  ShoppingCart,
  Package,
  Shield,
  LogOut,
  Menu,
  X,
  Settings,
  UserPlus,
  LogIn,
  Search,
  User,
  ChevronRight,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import logoImg from "../assets/logo.png";
import LandingPage from "./LandingPage";
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
];

export default function CustomerLayout() {
  const { user, logout } = useAuthStore();
  const customerUser = user?.role === "customer" ? user : null;

  const navigate = useNavigate();
  const location = useLocation();

  const authOverlayPaths = [
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/verify-otp",
    "/pending-approval",
  ];
  const isAuthOverlayPage = authOverlayPaths.includes(location.pathname);

  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [headerSearch, setHeaderSearch] = useState("");
  const [isScrolled, setIsScrolled] = useState(false);
  const [activeOrdersCount, setActiveOrdersCount] = useState(0);

  const accountRef = useRef(null);
  const {
    cart,
    cartCount,
    cartTotal,
    removeItem,
    miniCartOpen,
    openMiniCart,
    closeMiniCart,
  } = useCart();

  const visibleNavItems = navItems.filter((item) => {
    if (!customerUser) {
      return ["Home", "Products", "Customize", "Cart"].includes(item.label);
    }
    if (item.label === "Home") return false;
    return true;
  });

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    setAccountOpen(false);
    closeMiniCart();

    const params = new URLSearchParams(location.search);
    setHeaderSearch(params.get("q") || "");
  }, [location.pathname, location.search]);

  useEffect(() => {
    const handler = (e) => {
      if (accountRef.current && !accountRef.current.contains(e.target)) {
        setAccountOpen(false);
      }
    };

    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
<<<<<<< HEAD
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
=======
    let active = true;

    if (!customerUser) {
>>>>>>> e0754d8c228afd1fa087871ba6560f0f5bd1a3d4
      setActiveOrdersCount(0);
      return;
    }

    (async () => {
      try {
        const res = await api.get("/customer/orders");
        const orders = Array.isArray(res.data) ? res.data : [];
        const activeOrders = orders.filter(
          (o) =>
            !["completed", "cancelled"].includes(
              String(o.status || "").toLowerCase(),
            ),
        );

        if (active) setActiveOrdersCount(activeOrders.length);
      } catch (err) {
        console.error("Failed to load active orders count", err);
        if (active) setActiveOrdersCount(0);
      }
    })();

    return () => {
      active = false;
    };
  }, [customerUser]);

  const avatarSrc = customerUser?.profile_photo
    ? buildAssetUrl(customerUser.profile_photo)
    : "";

  const footerInfo = {
    address: "8 Sitio Laot, Prenza 1, Marilao, Bulacan",
    phone: "09530695310",
    mapUrl:
      "https://www.google.com/maps/search/?api=1&query=8+Sitio+Laot,+Prenza+1,+Marilao,+Bulacan",
    email: "spiralwood@gmail.com",
    facebookName: "Spiral Wood Services",
    facebookUrl: "https://www.facebook.com/",
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const handleHeaderSearch = (e) => {
    e.preventDefault();
    const q = headerSearch.trim();

    if (q) {
      navigate(`/catalog?q=${encodeURIComponent(q)}`);
    } else {
      navigate("/catalog");
    }

    setMenuOpen(false);
  };

  const renderCountBadge = (count) => {
    if (!count || count <= 0) return null;
    return <span className="cust-count-badge">{count}</span>;
  };

   const formatPeso = (value) =>
    `₱${Number(value || 0).toLocaleString("en-PH", {
      minimumFractionDigits: 2,
    })}`;

  const resolveCartImage = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return "";

    if (
      raw.startsWith("http://") ||
      raw.startsWith("https://") ||
      raw.startsWith("data:") ||
      raw.startsWith("blob:") ||
      raw.startsWith("/template-previews/") ||
      raw.startsWith("/images/") ||
      raw.startsWith("/assets/")
    ) {
      return raw;
    }

    return buildAssetUrl(raw);
  };

  const isBlueprintItem = (item = {}) =>
    String(item?.cart_type || item?.item_type || "")
      .trim()
      .toLowerCase() === "blueprint";

  const hasBlueprintItems = cart.some((item) => isBlueprintItem(item));
  const hasStandardItems = cart.some((item) => !isBlueprintItem(item));
  const isMixedCart = hasBlueprintItems && hasStandardItems;

  const miniCartCheckoutLabel = !customerUser
    ? "Sign in to Continue"
    : isMixedCart
      ? "Review in Cart"
      : "Checkout";

  const handleMiniCartCheckout = () => {
    if (!cart.length) return;

    closeMiniCart();

    if (!customerUser) {
      navigate("/login", {
        state: {
          redirectTo: "/cart",
        },
      });
      return;
    }

    if (isMixedCart) {
      navigate("/cart");
      return;
    }

    const keys = cart.map((item) => item.key);

    if (hasBlueprintItems) {
      sessionStorage.setItem(
        "cust_selected_custom_checkout",
        JSON.stringify(keys),
      );
      navigate("/custom-checkout");
      return;
    }

    sessionStorage.setItem("cust_selected_keys", JSON.stringify(keys));
    navigate("/checkout");
  };

  const BrandBlock = ({ compact = false, footer = false }) => (
    <div
      className={`cust-brand-block ${compact ? "compact" : ""} ${
        footer ? "footer" : ""
      }`}
    >
      <div className={`cust-brand-badge ${footer ? "footer" : "header"}`}>
        <img
          src={logoImg}
          alt="Spiral Wood Services logo"
          className="cust-brand-logo"
        />
      </div>

      <div className="cust-brand-copy">
        <span className="cust-brand-name">SPIRAL WOOD</span>
        <span className="cust-brand-sub">Services</span>
      </div>
    </div>
  );

  return (
    <div className="cust-root">
      <div className="cust-topbar">
        <span className="cust-topbar-icon">⚠</span>
        <span>
          Notice: Delivery and installation schedules may vary during peak
          routing days.
        </span>
      </div>

      <header className={`cust-navbar ${isScrolled ? "scrolled" : ""}`}>
        <div className="cust-header-main">
          <div className="cust-header-left">
            <button
              type="button"
              className="cust-menu-btn"
              onClick={() => setMenuOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={18} />
              <span>Menu</span>
            </button>

            <form className="cust-header-search" onSubmit={handleHeaderSearch}>
              <input
                type="text"
                placeholder="Search furniture..."
                value={headerSearch}
                onChange={(e) => setHeaderSearch(e.target.value)}
              />
              <button type="submit" aria-label="Search">
                <Search size={20} />
              </button>
            </form>
          </div>

          <button
            type="button"
            className="cust-brand"
            onClick={() => navigate("/")}
            aria-label="Go to home"
          >
            <BrandBlock />
          </button>

          <div className="cust-header-right">
            <button
              type="button"
              className="cust-icon-btn"
              onClick={() => {
                setMenuOpen(false);
                openMiniCart();
              }}
              aria-label="Open cart"
            >
              <ShoppingCart size={21} />
              {renderCountBadge(cartCount)}
            </button>

            <div className="cust-account-wrap" ref={accountRef}>
              <button
                type="button"
                className="cust-icon-btn"
                onClick={() => setAccountOpen((v) => !v)}
                aria-label="Open account menu"
              >
                {customerUser ? (
                  <div className="cust-avatar-shell">
                    {avatarSrc ? (
                      <img
                        src={avatarSrc}
                        alt="avatar"
                        className="cust-avatar-img"
                      />
                    ) : (
                      <span>
                        {customerUser?.name?.charAt(0)?.toUpperCase() || "U"}
                      </span>
                    )}
                  </div>
                ) : (
                  <User size={21} />
                )}
              </button>

              {accountOpen && (
                <div className="cust-account-dropdown">
                  {customerUser ? (
                    <>
                      <div className="cust-account-user">
                        <div className="cust-account-avatar">
                          {avatarSrc ? (
                            <img
                              src={avatarSrc}
                              alt="avatar"
                              className="cust-avatar-img"
                            />
                          ) : (
                            <span>
                              {customerUser?.name?.charAt(0)?.toUpperCase() ||
                                "U"}
                            </span>
                          )}
                        </div>

                        <div className="cust-account-user-copy">
                          <strong>{customerUser?.name || "Customer"}</strong>
                          <span>{customerUser?.email || ""}</span>
                        </div>
                      </div>

                      <div className="cust-dropdown-divider" />

                      <button
                        type="button"
                        className="cust-dropdown-item"
                        onClick={() => {
                          setAccountOpen(false);
                          navigate("/orders");
                        }}
                      >
                        <Package size={16} />
                        <span>My Orders</span>
                      </button>

                      <button
                        type="button"
                        className="cust-dropdown-item"
                        onClick={() => {
                          setAccountOpen(false);
                          navigate("/profilesettings");
                        }}
                      >
                        <Settings size={16} />
                        <span>Settings</span>
                      </button>

                      <button
                        type="button"
                        className="cust-dropdown-item"
                        onClick={handleLogout}
                      >
                        <LogOut size={16} />
                        <span>Sign Out</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="cust-dropdown-item"
                        onClick={() => {
                          setAccountOpen(false);
                          navigate("/login");
                        }}
                      >
                        <LogIn size={16} />
                        <span>Sign In</span>
                      </button>

                      <button
                        type="button"
                        className="cust-dropdown-item"
                        onClick={() => {
                          setAccountOpen(false);
                          navigate("/register");
                        }}
                      >
                        <UserPlus size={16} />
                        <span>Sign Up</span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <div
        className={`cust-drawer-overlay ${
          menuOpen || miniCartOpen ? "show" : ""
        }`}
        onClick={() => {
          setMenuOpen(false);
          closeMiniCart();
        }}
      />

      <aside className={`cust-side-drawer ${menuOpen ? "open" : ""}`}>
        <div className="cust-side-head">
          <div className="cust-side-brand">
            <BrandBlock compact />
          </div>

          <button
            type="button"
            className="cust-side-close"
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        {customerUser ? (
          <div className="cust-side-summary">
            <div className="cust-side-summary-card">
              <span>Cart</span>
              <strong>{cartCount}</strong>
            </div>
            <div className="cust-side-summary-card">
              <span>Active Orders</span>
              <strong>{activeOrdersCount}</strong>
            </div>
          </div>
        ) : null}

        <nav className="cust-side-nav">
          {visibleNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `cust-side-link ${isActive ? "active" : ""}`
              }
              onClick={() => setMenuOpen(false)}
            >
              <div className="cust-side-link-left">
                <item.icon size={18} />
                <span>{item.label}</span>
              </div>

              <div className="cust-side-link-right">
                {item.to === "/cart" && cartCount > 0 ? (
                  <span className="cust-mini-pill">{cartCount}</span>
                ) : null}

                {item.to === "/orders" && activeOrdersCount > 0 ? (
                  <span className="cust-mini-pill">{activeOrdersCount}</span>
                ) : null}

                <ChevronRight size={15} />
              </div>
            </NavLink>
          ))}
        </nav>
         {customerUser ? (
          <div className="cust-side-footer">
            <button
              type="button"
              className="cust-side-secondary"
              onClick={() => {
                setMenuOpen(false);
                navigate("/profilesettings");
              }}
            >
              <Settings size={16} />
              Settings
            </button>

            <button
              type="button"
              className="cust-side-primary"
              onClick={handleLogout}
            >
              <LogOut size={16} />
              Sign Out
            </button>
          </div>
        ) : null}  
      </aside>

      <aside className={`cust-mini-cart-drawer ${miniCartOpen ? "open" : ""}`}>
        <div className="cust-mini-cart-head">
          <div className="cust-mini-cart-title">
            <span>Cart</span>
            <small>
              {cartCount} item{cartCount !== 1 ? "s" : ""}
            </small>
          </div>

          <button
            type="button"
            className="cust-mini-cart-close"
            onClick={closeMiniCart}
            aria-label="Close cart"
          >
            <X size={20} />
          </button>
        </div>

        {cart.length === 0 ? (
          <div className="cust-mini-cart-empty">
            <div className="cust-mini-cart-empty-icon">🛒</div>
            <h3>No products in the cart.</h3>
            <p>Browse products first before proceeding to checkout.</p>

            <button
              type="button"
              className="cust-mini-cart-shop-btn"
              onClick={() => {
                closeMiniCart();
                navigate("/catalog");
              }}
            >
              Return to shop
            </button>
          </div>
        ) : (
          <>
            <div className="cust-mini-cart-list">
              {cart.map((item) => {
                const blueprint = isBlueprintItem(item);
                const imageSrc = resolveCartImage(
                  item.image_url || item.preview_image_url,
                );

                return (
                  <div className="cust-mini-cart-item" key={item.key}>
                    <div className="cust-mini-cart-thumb">
                      {imageSrc ? (
                        <img src={imageSrc} alt={item.product_name} />
                      ) : (
                        <div className="cust-mini-cart-thumb-fallback">
                          {blueprint ? "📐" : "🪵"}
                        </div>
                      )}
                    </div>

                    <div className="cust-mini-cart-copy">
                      <strong>
                        {item.base_blueprint_title || item.product_name}
                      </strong>

                      <span className="cust-mini-cart-meta">
                        {blueprint
                          ? "Custom / Blueprint item"
                          : `Qty ${item.quantity}`}
                      </span>

                      <span className="cust-mini-cart-price">
                        {blueprint
                          ? "Price to be quoted"
                          : `${item.quantity} × ${formatPeso(item.unit_price)}`}
                      </span>
                    </div>

                    <button
                      type="button"
                      className="cust-mini-cart-remove"
                      onClick={() => removeItem(item.key)}
                      aria-label={`Remove ${item.product_name}`}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="cust-mini-cart-foot">
              <div className="cust-mini-cart-row">
                <span>Subtotal</span>
                <strong>{formatPeso(cartTotal)}</strong>
              </div>

              <div className="cust-mini-cart-note">
                {isMixedCart
                  ? "Mixed ready-made and custom items detected. Finish selection in the cart page."
                  : hasBlueprintItems
                    ? "Custom / blueprint items continue through quotation-based checkout."
                    : "Shipping and final totals will be calculated at checkout."}
              </div>

              <div className="cust-mini-cart-actions">
                <button
                  type="button"
                  className="cust-mini-cart-view"
                  onClick={() => {
                    closeMiniCart();
                    navigate("/cart");
                  }}
                >
                  View cart
                </button>

                <button
                  type="button"
                  className={`cust-mini-cart-checkout ${
                    !customerUser ? "cust-mini-cart-checkout-guest" : ""
                  }`}
                  onClick={handleMiniCartCheckout}
                >
                  {miniCartCheckoutLabel}
                </button>
              </div>
            </div>
          </>
        )}
      </aside>

      <main
        className="cust-main"
        style={
          isAuthOverlayPage
            ? {
                maxWidth: "none",
                padding: 0,
                position: "relative",
              }
            : undefined
        }
      >
        {isAuthOverlayPage ? (
          <>
            <div style={{ position: "relative", zIndex: 1 }}>
              <LandingPage />
            </div>

            <div
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 260,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "110px 24px 32px",
                background: "rgba(0,0,0,0.38)",
                backdropFilter: "blur(2px)",
              }}
            >
              <Outlet />
            </div>
          </>
        ) : (
          <Outlet />
        )}
      </main>

      <footer className="cust-footer">
        <div className="cust-footer-inner">
          <div className="cust-footer-grid">
            <div className="cust-footer-col">
              <h4>PICKUP LOCATION ADDRESS</h4>
              <p>{footerInfo.address}</p>
              <a
                href={footerInfo.mapUrl}
                target="_blank"
                rel="noreferrer"
                className="cust-footer-link"
              >
                Map / Navigation Link
              </a>
            </div>

            <div className="cust-footer-col">
              <h4>BUSINESS HOURS</h4>
              <p>MONDAY - FRIDAY</p>
              <strong>8:00 AM - 5:00 PM</strong>

              <div className="cust-footer-spacer" />

              <p>WEEKEND PRODUCTION</p>
              <strong>By schedule / ongoing production</strong>

              <div className="cust-footer-spacer" />

              <p>CONTACT NUMBER</p>
              <strong>{footerInfo.phone}</strong>
            </div>

            <div className="cust-footer-col">
              <h4>MY ACCOUNT</h4>
              <ul className="cust-footer-list">
                <li>
                  <button type="button" onClick={() => navigate("/cart")}>
                    My Shopping Cart
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => navigate("/profilesettings")}
                  >
                    Account Settings
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => navigate("/orders")}>
                    Track my Order
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => navigate("/warranty")}>
                    Warranty
                  </button>
                </li>
              </ul>
            </div>

            <div className="cust-footer-col">
              <h4>CUSTOMER CARE</h4>
              <ul className="cust-footer-list">
                <li>
                  <a href={`tel:${footerInfo.phone}`}>{footerInfo.phone}</a>
                </li>
                <li>
                  <a href={`mailto:${footerInfo.email}`}>{footerInfo.email}</a>
                </li>
                <li>
                  <a
                    href={footerInfo.facebookUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Facebook: {footerInfo.facebookName}
                  </a>
                </li>
                <li>
                  <button type="button" onClick={() => navigate("/catalog")}>
                    Browse Products
                  </button>
                </li>
                <li>
                  <button type="button" onClick={() => navigate("/customize")}>
                    Customize Furniture
                  </button>
                </li>
              </ul>
            </div>
          </div>

          <div className="cust-footer-bottom">
            <div className="footer-brand">
              <BrandBlock compact footer />
            </div>

            <p>
              © {new Date().getFullYear()} Spiral Wood Services. All rights
              reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}