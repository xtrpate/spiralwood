import { Outlet, NavLink, useNavigate, useLocation } from "react-router-dom";
import useAuthStore from "../../store/authStore";
import { useCart } from "./cartcontext";
import api, { buildAssetUrl } from "../../services/api";
import {
  Home,
  Scissors,
  ShoppingBag,
  FileText,
  ShoppingCart,
  Package,
  Shield,
  Headphones,
  Info,
  CircleHelp,
  Mail,
  LogOut,
  Menu,
  X,
  Trash2,
  Settings,
  UserPlus,
  LogIn,
  Search,
  User,
  ChevronRight,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import logoImg from "../assets/logo1.png";
import brandHeaderImg from "../assets/spiral-wood-services-header-logo.png";
import LandingPage from "./LandingPage";
import "./customerlayout.css";
import "./profile.css";
import CustomerNotificationBell from "../../components/CustomerNotificationBell";
import CustomerBlueprintViewer from "./CustomerBlueprintViewer";

const navItems = [
  { to: "/", icon: Home, label: "Home" },
  { to: "/catalog", icon: ShoppingBag, label: "Products" },
  { to: "/appointment", icon: FileText, label: "Appointment" },
  { to: "/customize", icon: Scissors, label: "Customize" },
  { to: "/cart", icon: ShoppingCart, label: "Cart" },
  { to: "/orders", icon: Package, label: "My Orders" },
  { to: "/warranty", icon: Shield, label: "Warranty" },
  { to: "/support", icon: Headphones, label: "Support" },
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
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [activeOrdersCount, setActiveOrdersCount] = useState(0);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [itemToRemove, setItemToRemove] = useState(null);
  const [siteSettings, setSiteSettings] = useState(null);
  const isTrue = (val) =>
    val === "true" || val === true || val === 1 || val === "1";

  useEffect(() => {
    let active = true;
    api
      .get("/website/settings")
      .then((res) => {
        if (active) {
          setSiteSettings(res.data);

          // 1. Updates the Browser Tab title dynamically!
          if (res.data?.display?.site_name) {
            document.title = res.data.display.site_name;
          }

          // 2. 👉 Updates the Browser Tab Logo (Favicon) dynamically!
          if (res.data?.display?.site_logo) {
            // We use your existing buildAssetUrl function to get the full image path
            const faviconUrl = buildAssetUrl(res.data.display.site_logo);

            // Find the existing favicon tag, or create one if it doesn't exist
            let link = document.querySelector("link[rel~='icon']");
            if (!link) {
              link = document.createElement("link");
              link.rel = "icon";
              document.head.appendChild(link);
            }
            // Swap the image!
            link.href = faviconUrl;
          }
        }
      })
      .catch((err) => console.error("Failed to load site settings", err));

    return () => {
      active = false;
    };
  }, []);

  // this is for avatar on the navigation bar.
  const [avatarFailed, setAvatarFailed] = useState(false);
  useEffect(() => {
    setAvatarFailed(false);
  }, [customerUser?.profile_photo]);

  const accountRef = useRef(null);

  const miniCartRef = useRef(null);
  const cartButtonRef = useRef(null);
  const searchInputRef = useRef(null);
  const {
    cart,
    cartCount,
    cartTotal,

    updateQty,
    removeItem,
    miniCartOpen,
    openMiniCart,
    closeMiniCart,
    clearCart,
  } = useCart();

  const visibleNavItems = navItems.filter((item) => {
    if (!customerUser) {
      return ["Home", "Products", "Customize", "Cart"].includes(item.label);
    }
    return true;
  });

  useEffect(() => {
    setMenuOpen(false);
    setAccountOpen(false);
    closeMiniCart();

    const params = new URLSearchParams(location.search);
    setHeaderSearch(params.get("q") || "");

    if (location.pathname === "/" && !isAuthOverlayPage) {
      scrollToLandingTop();
    }
  }, [location.pathname, location.search, isAuthOverlayPage]);

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
    if (!miniCartOpen) return;

    requestAnimationFrame(() => {
      miniCartRef.current?.focus();
    });

    const handleMiniCartKeydown = (e) => {
      if (e.key === "Escape") {
        closeMiniCart();
        requestAnimationFrame(() => {
          cartButtonRef.current?.focus();
        });
      }
    };

    document.addEventListener("keydown", handleMiniCartKeydown);
    return () => {
      document.removeEventListener("keydown", handleMiniCartKeydown);
    };
  }, [miniCartOpen, closeMiniCart]);

  useEffect(() => {
    let active = true;

    if (!customerUser) {
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

  // 👉 ADD THIS EFFECT: Fetches products for the Top Navbar dropdown
  useEffect(() => {
    if (!headerSearch.trim() || !searchFocused) {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(async () => {
      setSearchLoading(true);

      try {
        const [productRes, blueprintRes] = await Promise.all([
          api.get("/customer/products", {
            params: {
              q: headerSearch,
              limit: 5,
              type: "standard",
            },
          }),
          api.get("/customer/blueprints", {
            params: {
              q: headerSearch,
              limit: 5,
            },
          }),
        ]);

        const rawProducts = Array.isArray(productRes.data?.products)
          ? productRes.data.products
          : [];

        const visibleProducts = rawProducts.filter(
          (item) => String(item?.type || "").toLowerCase() !== "blueprint",
        );

        const rawBlueprints = Array.isArray(blueprintRes.data?.blueprints)
          ? blueprintRes.data.blueprints
          : [];

        const mappedProducts = visibleProducts.slice(0, 5).map((item) => ({
          id: `product-${item.id}`,
          entityId: item.id,
          resultType: "product",
          title: item.name,
          subtitle: item.category || "Ready-Made Product",
          badge: "Ready-Made",
          imageUrl: item.image_url || "",
          priceText: `₱${parseFloat(item.online_price || 0).toLocaleString(
            "en-PH",
            {
              minimumFractionDigits: 2,
            },
          )}`,
          searchValue: item.name,
        }));

        const mappedBlueprints = rawBlueprints.slice(0, 5).map((item) => ({
          id: `template-${item.id}`,
          entityId: item.id,
          resultType: "template",
          title: item.title,
          subtitle:
            item.category_label || item.category || "Customize Template",
          badge: "Customize",
          imageUrl: item.preview_image_url || item.thumbnail_url || "",
          priceText: "Customize template",
          searchValue: item.title,
        }));

        setSearchResults([...mappedProducts, ...mappedBlueprints].slice(0, 8));
      } catch (err) {
        console.error("Navbar search error", err);
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [headerSearch, searchFocused]);

  const getAvatarUrl = (value) => {
    const raw = String(value || "").trim();
    if (!raw) return "";

    if (/^(https?:|data:|blob:)/i.test(raw)) {
      return buildAssetUrl(raw);
    }

    const cleaned = raw.replace(/\\/g, "/").replace(/^\/+/, "");
    const withPrefix = cleaned.startsWith("uploads/avatars/")
      ? `/${cleaned}`
      : `/uploads/avatars/${cleaned}`;

    return buildAssetUrl(withPrefix);
  };

  const avatarSrc =
    customerUser?.profile_photo && !avatarFailed
      ? getAvatarUrl(customerUser.profile_photo)
      : "";

  // WISDOM OFFICIAL PICKUP LOCATION V1
  // WISDOM CUSTOMER SITE SETTINGS WIRING V1.0.3
  const dynamicAddress =
    String(siteSettings?.display?.business_address || "").trim() ||
    "8 Laot Street, Near Gavino, Prenza I, Marilao, 3019 Bulacan";
  const dynamicName =
    siteSettings?.display?.site_name || "Spiral Wood Services";
  // WISDOM GOOGLE MAPS LINK V1
  const dynamicGoogleMapsUrl = String(
    siteSettings?.display?.google_maps_url || "",
  ).trim();

  // WISDOM GOOGLE MAPS PIN V1
  const businessLatitudeRaw = String(
    siteSettings?.display?.business_latitude || "",
  ).trim();
  const businessLongitudeRaw = String(
    siteSettings?.display?.business_longitude || "",
  ).trim();
  const dynamicGoogleMapsPlaceId = String(
    siteSettings?.display?.google_maps_place_id || "",
  ).trim();

  const businessLatitude = Number(businessLatitudeRaw);
  const businessLongitude = Number(businessLongitudeRaw);
  const hasBusinessCoordinates =
    businessLatitudeRaw !== "" &&
    businessLongitudeRaw !== "" &&
    Number.isFinite(businessLatitude) &&
    businessLatitude >= -90 &&
    businessLatitude <= 90 &&
    Number.isFinite(businessLongitude) &&
    businessLongitude >= -180 &&
    businessLongitude <= 180;

  const dynamicSiteLogo = siteSettings?.display?.site_logo
    ? buildAssetUrl(siteSettings.display.site_logo)
    : logoImg;

  const footerInfo = {
    address: dynamicAddress,
    phone: siteSettings?.display?.business_phone || "09530695310",
    mapUrl:
      hasBusinessCoordinates || dynamicGoogleMapsPlaceId
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
            hasBusinessCoordinates
              ? `${businessLatitude},${businessLongitude}`
              : dynamicAddress,
          )}${
            dynamicGoogleMapsPlaceId
              ? `&query_place_id=${encodeURIComponent(dynamicGoogleMapsPlaceId)}`
              : ""
          }`
        : dynamicGoogleMapsUrl ||
          `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
            dynamicAddress,
          )}`,
    email: siteSettings?.display?.business_email || "spiralwood@gmail.com",
    facebookName: dynamicName,
    facebookUrl:
      siteSettings?.display?.social_facebook || "https://www.facebook.com/",
  };

  const handleLogout = () => {
    setAccountOpen(false);
    setMenuOpen(false);
    closeMiniCart();
    setLogoutConfirmOpen(false);

    // clear visible cart only on logout
    // keep saved customer cart backup + cloud cart intact
    clearCart(false);

    logout();
    navigate("/login", { replace: true });
  };

  const openLogoutConfirm = () => {
    setAccountOpen(false);
    setLogoutConfirmOpen(true);
  };

  const closeLogoutConfirm = () => {
    setLogoutConfirmOpen(false);
  };

  const handleHeaderSearch = (e) => {
    e.preventDefault();
    const q = headerSearch.trim();

    if (!q) {
      searchInputRef.current?.focus();
      return;
    }

    const productMatches = searchResults.filter(
      (item) => item.resultType === "product",
    );
    const templateMatches = searchResults.filter(
      (item) => item.resultType === "template",
    );

    if (!productMatches.length && templateMatches.length) {
      navigate(`/customize?q=${encodeURIComponent(q)}`);
    } else {
      navigate(`/catalog?q=${encodeURIComponent(q)}`);
    }

    setMenuOpen(false);
    setSearchFocused(false);
  };

  const scrollToLandingTop = () => {
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
  };

  const handleGoHome = () => {
    setMenuOpen(false);
    setAccountOpen(false);
    closeMiniCart();

    if (location.pathname === "/" && !location.search) {
      scrollToLandingTop();
      return;
    }

    navigate("/");
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

  const parseCartEditorSnapshot = (value) => {
    if (!value) return {};
    if (typeof value === "object" && !Array.isArray(value)) return value;

    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed
        : {};
    } catch {
      return {};
    }
  };

  const buildLiveCartBlueprintPreview = (item = {}) => {
    const editorSnapshot = parseCartEditorSnapshot(item?.editor_snapshot);
    const components = Array.isArray(editorSnapshot?.components)
      ? editorSnapshot.components
      : [];

    if (!components.length) return null;

    return {
      id: item?.blueprint_id || item?.key || null,
      title:
        item?.base_blueprint_title || item?.product_name || "Custom Furniture",
      thumbnail_url: null,
      components,
      view_3d_data: {
        components,
        worldSize: editorSnapshot?.worldSize || null,
      },
    };
  };

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

  const BrandBlock = ({ compact = false, footer = false }) => {
    if (!footer) {
      return (
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: compact ? "16px" : "5px",
          }}
        >
          <img
            src={dynamicSiteLogo}
            alt="Spiral Wood Services"
            onError={(e) => {
              e.currentTarget.src = logoImg;
            }}
            style={{
              width: compact ? "38px" : "48px",
              height: compact ? "38px" : "48px",
              objectFit: "contain",
              flex: "0 0 auto",
            }}
          />
          <div
            className="cust-brand-copy"
            style={{ alignItems: "center", margin: 0 }}
          >
            <span
              className="cust-brand-name"
              style={{
                fontSize: compact ? "1.2rem" : "1.5rem",
                color: "#111111",
                letterSpacing: "0.15em",
                fontWeight: 800,
              }}
            >
              SPIRAL WOOD
            </span>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                width: "100%",
                gap: "8px",
                marginTop: "4px",
              }}
            >
              <div
                style={{ flex: 1, height: "1px", background: "#a1a1aa" }}
              ></div>
              <span
                className="cust-brand-sub"
                style={{
                  fontSize: compact ? "0.65rem" : "0.75rem",
                  color: "#777777",
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  margin: 0,
                }}
              >
                SERVICES
              </span>
              <div
                style={{ flex: 1, height: "1px", background: "#a1a1aa" }}
              ></div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="cust-brand-block compact footer">
        <div className="cust-brand-badge footer">
          <img
            src={dynamicSiteLogo}
            alt="Spiral Wood Services logo"
            onError={(e) => {
              e.currentTarget.src = logoImg;
            }}
            className="cust-brand-logo"
            style={{
              width: "42px",
              height: "42px",
              objectFit: "contain",
            }}
          />
        </div>

        <div className="cust-brand-copy">
          <span className="cust-brand-name">SPIRAL WOOD</span>
          <span className="cust-brand-sub">Services</span>
        </div>
      </div>
    );
  };

  return (
    <div className="cust-root">
      <div className="cust-topbar">
        <span className="cust-topbar-icon">⚠</span>
        <span>
          Notice: Delivery and installation schedules may vary during peak
          routing days.
        </span>
      </div>

      <header className="cust-navbar">
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

            <div style={{ position: "relative" }}>
              <form
                className="cust-header-search"
                onSubmit={handleHeaderSearch}
                style={{ margin: 0 }}
              >
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search furniture..."
                  value={headerSearch}
                  onChange={(e) => setHeaderSearch(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
                />
                <button type="submit" aria-label="Search">
                  <Search size={20} />
                </button>
              </form>

              {/* 👉 TOP NAVBAR DROPDOWN */}
              {searchFocused && headerSearch.trim().length > 0 && (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 8px)",
                    left: 0,
                    width: "380px",
                    background: "#ffffff",
                    border: "1px solid #e5e7eb",
                    boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1)",
                    maxHeight: "380px",
                    overflowY: "auto",
                    zIndex: 1000,
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  {searchLoading ? (
                    <div
                      style={{
                        padding: "16px",
                        color: "#64748b",
                        fontSize: "13px",
                        textAlign: "center",
                      }}
                    >
                      Searching products and templates...
                    </div>
                  ) : searchResults.length === 0 ? (
                    <div
                      style={{
                        padding: "16px",
                        color: "#64748b",
                        fontSize: "13px",
                        textAlign: "center",
                      }}
                    >
                      No ready-made products or customize templates found for "
                      {headerSearch}"
                    </div>
                  ) : (
                    searchResults.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => {
                          setSearchFocused(false);

                          if (item.resultType === "template") {
                            navigate(
                              `/customize?q=${encodeURIComponent(item.searchValue)}&template=${item.entityId}`,
                            );
                            return;
                          }

                          navigate(
                            `/catalog?q=${encodeURIComponent(item.searchValue)}`,
                          );
                        }}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          padding: "12px 16px",
                          cursor: "pointer",
                          borderBottom: "1px solid #f1f5f9",
                          transition: "background 0.2s",
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.background = "#f8fafc")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.background = "#ffffff")
                        }
                      >
                        <div
                          style={{
                            width: "44px",
                            height: "44px",
                            background: "#f8fafc",
                            overflow: "hidden",
                            flexShrink: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          {item.imageUrl ? (
                            <img
                              src={buildAssetUrl(item.imageUrl)}
                              alt={item.title}
                              style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                              }}
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                          ) : (
                            <span style={{ fontSize: "16px" }}>
                              {item.resultType === "template" ? "📐" : "🪵"}
                            </span>
                          )}
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              marginBottom: "2px",
                            }}
                          >
                            <div
                              style={{
                                fontSize: "13px",
                                fontWeight: "600",
                                color: "#0f172a",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                            >
                              {item.title}
                            </div>

                            <span
                              style={{
                                fontSize: "10px",
                                fontWeight: 700,
                                letterSpacing: "0.04em",
                                textTransform: "uppercase",
                                padding: "3px 6px",
                                border: "1px solid #d1d5db",
                                color: "#475569",
                                flexShrink: 0,
                              }}
                            >
                              {item.badge}
                            </span>
                          </div>

                          <div
                            style={{
                              fontSize: "12px",
                              color: "#64748b",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}
                          >
                            {item.subtitle}
                          </div>
                        </div>

                        <div
                          style={{
                            fontSize: "12px",
                            color: "#334155",
                            fontWeight: 600,
                            textAlign: "right",
                            flexShrink: 0,
                          }}
                        >
                          {item.priceText}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          <button
            type="button"
            className="cust-brand"
            onClick={handleGoHome}
            aria-label="Go to home"
          >
            <BrandBlock />
          </button>

          <div className="cust-header-right">
            {location.pathname !== "/cart" && (
              <button
                ref={cartButtonRef}
                type="button"
                className="cust-cart-summary-btn"
                onClick={() => {
                  setMenuOpen(false);
                  openMiniCart();
                }}
                aria-label="Open cart"
              >
                <span className="cust-cart-summary-total">
                  {formatPeso(cartTotal)}
                </span>

                <span className="cust-cart-summary-icon-wrap">
                  <ShoppingCart size={21} />
                  {renderCountBadge(cartCount)}
                </span>
              </button>
            )}

            {customerUser && <CustomerNotificationBell />}

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
                        onError={() => setAvatarFailed(true)}
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
                              onError={() => setAvatarFailed(true)}
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
                          navigate("/profilesettings");
                        }}
                      >
                        <Settings size={16} />
                        <span>Settings</span>
                      </button>

                      <button
                        type="button"
                        className="cust-dropdown-item"
                        onClick={openLogoutConfirm}
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
          menuOpen || miniCartOpen || logoutConfirmOpen ? "show" : ""
        }`}
        onClick={() => {
          setMenuOpen(false);
          closeMiniCart();
          if (logoutConfirmOpen) closeLogoutConfirm();
        }}
      />

      <aside className={`cust-side-drawer ${menuOpen ? "open" : ""}`}>
        <div className="cust-side-head">
          <button
            type="button"
            className="cust-side-brand cust-side-brand-home"
            onClick={handleGoHome}
            aria-label="Go to home"
          >
            <BrandBlock compact />
          </button>

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
        <div className="cust-side-footer-links">
          <div className="cust-side-footer-title">Company & Help</div>

          {isTrue(siteSettings?.display?.show_about_section) && (
            <NavLink
              to="/about"
              className="cust-side-footer-link"
              onClick={() => setMenuOpen(false)}
            >
              <Info size={16} />
              <span>About Us</span>
            </NavLink>
          )}

          {isTrue(siteSettings?.display?.show_faq_section) && (
            <NavLink
              to="/faq"
              className="cust-side-footer-link"
              onClick={() => setMenuOpen(false)}
            >
              <CircleHelp size={16} />
              <span>FAQs</span>
            </NavLink>
          )}

          {isTrue(siteSettings?.display?.show_contact_section) && (
            <NavLink
              to="/contact"
              className="cust-side-footer-link"
              onClick={() => setMenuOpen(false)}
            >
              <Mail size={16} />
              <span>Contact Us</span>
            </NavLink>
          )}
        </div>
      </aside>

      <aside
        ref={miniCartRef}
        className={`cust-mini-cart-drawer ${miniCartOpen ? "open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mini-cart-title"
        tabIndex={-1}
      >
        <div className="cust-mini-cart-head">
          <div className="cust-mini-cart-title">
            <span id="mini-cart-title">Cart</span>
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
                const liveBlueprintPreview = blueprint
                  ? buildLiveCartBlueprintPreview(item)
                  : null;
                const quantity = Number(item.quantity || 1);
                const lineTotal = Number(item.unit_price || 0) * quantity;
                const atMaxStock =
                  !blueprint &&
                  item.max_stock &&
                  quantity >= Number(item.max_stock);

                return (
                  <div className="cust-mini-cart-item" key={item.key}>
                    <div className="cust-mini-cart-thumb">
                      {blueprint ? (
                        liveBlueprintPreview ? (
                          <CustomerBlueprintViewer
                            blueprint={liveBlueprintPreview}
                            readOnly
                            showHumanControls={false}
                            compact
                            compactHeight={64}
                            defaultPreset="isometric"
                            defaultShowHuman={false}
                          />
                        ) : (
                          <div className="cust-mini-cart-thumb-fallback">
                            Design
                          </div>
                        )
                      ) : imageSrc ? (
                        <img
                          src={imageSrc}
                          alt={item.base_blueprint_title || item.product_name}
                        />
                      ) : (
                        <div className="cust-mini-cart-thumb-fallback">
                          Item
                        </div>
                      )}
                    </div>

                    <div className="cust-mini-cart-copy">
                      <div className="cust-mini-cart-item-top">
                        <strong>
                          {item.base_blueprint_title || item.product_name}
                        </strong>
                        <span className="cust-mini-cart-line-total">
                          {blueprint ? "For quotation" : formatPeso(lineTotal)}
                        </span>
                      </div>

                      {blueprint ? (
                        <span className="cust-mini-cart-meta">
                          Custom / Blueprint item
                        </span>
                      ) : null}

                      <div className="cust-mini-cart-item-actions">
                        {blueprint ? (
                          <span className="cust-mini-cart-blueprint-qty">
                            Qty {quantity}
                          </span>
                        ) : (
                          <div
                            className="cust-mini-cart-qty"
                            aria-label={`Quantity for ${item.product_name}`}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                if (quantity > 1) updateQty(item.key, -1);
                              }}
                              disabled={quantity <= 1}
                              aria-label={`Decrease ${item.product_name} quantity`}
                            >
                              {String.fromCharCode(8722)}
                            </button>

                            <span>{quantity}</span>

                            <button
                              type="button"
                              onClick={() => updateQty(item.key, 1)}
                              disabled={Boolean(atMaxStock)}
                              aria-label={`Increase ${item.product_name} quantity`}
                            >
                              +
                            </button>
                          </div>
                        )}

                        <button
                          type="button"
                          className="cust-mini-cart-remove"
                          onClick={() => setItemToRemove(item)}
                          aria-label={`Remove ${
                            item.base_blueprint_title || item.product_name
                          }`}
                          title="Remove item"
                        >
                          <Trash2 size={16} strokeWidth={1.8} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="cust-mini-cart-foot">
              <div className="cust-mini-cart-summary">
                <div className="cust-mini-cart-summary-row">
                  <span>Subtotal</span>
                  <strong>{formatPeso(cartTotal)}</strong>
                </div>

                <div className="cust-mini-cart-summary-row cust-mini-cart-summary-muted">
                  <span>Shipping</span>
                  <span>
                    {isMixedCart
                      ? "Varies by order type"
                      : hasBlueprintItems
                        ? "Calculated for custom order"
                        : "Free"}
                  </span>
                </div>

                <div className="cust-mini-cart-summary-divider" />

                <div className="cust-mini-cart-summary-row cust-mini-cart-summary-total">
                  <span>Estimated total</span>
                  <strong>{formatPeso(cartTotal)}</strong>
                </div>
              </div>

              <div className="cust-mini-cart-note">
                {isMixedCart
                  ? "Ready-made items include free delivery. Custom orders may have a separate delivery fee."
                  : hasBlueprintItems
                    ? "Custom orders may include a delivery fee."
                    : "Free delivery applies to ready-made products."}
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
      {/* WISDOM UNIFIED SIGN OUT UI V1 */}
      {logoutConfirmOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="customer-signout-title"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10050,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "390px",
              background: "#ffffff",
              border: "1px solid #d9d9dc",
              borderRadius: 0,
              boxShadow: "0 18px 46px rgba(0,0,0,0.18)",
              padding: "24px",
              pointerEvents: "auto",
            }}
          >
            <h3
              id="customer-signout-title"
              style={{
                margin: 0,
                color: "#111111",
                fontSize: "22px",
                fontWeight: 750,
                lineHeight: 1.2,
                letterSpacing: "-0.015em",
              }}
            >
              Sign out
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
              Are you sure you want to sign out?
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
                  borderRadius: 0,
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
                  borderRadius: 0,
                  background: "#111111",
                  color: "#ffffff",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: 650,
                }}
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {itemToRemove && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10050,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            pointerEvents: "auto",
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "400px",
              background: "#ffffff",
              border: "1px solid #e5e7eb",
              boxShadow: "0 20px 50px rgba(0,0,0,0.16)",
              padding: "28px",
            }}
          >
            <h3
              style={{ margin: "0 0 10px", fontSize: "22px", fontWeight: 700 }}
            >
              Remove Item
            </h3>
            <p
              style={{ margin: "0 0 24px", color: "#5f5f5f", fontSize: "15px" }}
            >
              Are you sure you want to remove "
              {itemToRemove.base_blueprint_title || itemToRemove.product_name}"
              from your cart?
            </p>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "12px",
              }}
            >
              <button
                type="button"
                onClick={() => setItemToRemove(null)}
                style={{
                  padding: "10px 20px",
                  border: "1px solid #d1d5db",
                  background: "white",
                  cursor: "pointer",
                }}
              >
                No
              </button>
              <button
                type="button"
                onClick={() => {
                  removeItem(itemToRemove.key);
                  setItemToRemove(null);
                }}
                style={{
                  padding: "10px 20px",
                  border: "1px solid #111",
                  background: "#111",
                  color: "#fff",
                  cursor: "pointer",
                }}
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}

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
              className="cust-auth-overlay"
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
              {/* WISDOM FOOTER LOCATION WORDING V1 */}
              <h4>LOCATION</h4>
              <p>{footerInfo.address}</p>
              <a
                href={footerInfo.mapUrl}
                target="_blank"
                rel="noreferrer"
                className="cust-footer-link"
              >
                View on Google Maps
              </a>
            </div>

            <div className="cust-footer-col">
              <h4>BUSINESS HOURS</h4>
              {siteSettings?.display?.operating_hours ? (
                <p style={{ whiteSpace: "pre-wrap" }}>
                  {siteSettings.display.operating_hours}
                </p>
              ) : (
                <>
                  <p>MONDAY - FRIDAY</p>
                  <strong>8:00 AM - 5:00 PM</strong>

                  <div className="cust-footer-spacer" />

                  <p>WEEKEND PRODUCTION</p>
                  <strong>By schedule / ongoing production</strong>
                </>
              )}

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
                <li>
                  <button type="button" onClick={() => navigate("/support")}>
                    Customer Support
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
              © {new Date().getFullYear()} {dynamicName}. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
