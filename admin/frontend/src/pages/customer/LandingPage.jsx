import React, { useState, useEffect } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import {
  ArrowRight,
  Hammer,
  Ruler,
  ShieldCheck,
  LogOut,
  LayoutDashboard,
} from "lucide-react";
import useAuthStore from "../../store/authStore";

// 🏠 Relative path to your cabinet image based on your description
import cabinetImg from "../assets/cabinet.png";

// ==========================================
// INTERNAL NAVBAR COMPONENT (transparent -> solid on scroll)
// ==========================================
const FloatingNavBar = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [isScrolled, setIsScrolled] = useState(false);

  // 👉 Detect scroll to change background
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 50) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Base styles for the navbar
  const navStyle = {
    position: "fixed",
    top: 0,
    left: 0,
    width: "100%",
    height: "80px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 50px",
    zIndex: 1000,
    transition: "all 0.3s ease-in-out",
    boxSizing: "border-box",
    fontFamily: "sans-serif",
  };

  // 👉 Styles added when scrolling down (like reference image)
  const scrolledStyles = isScrolled
    ? {
        backgroundColor: "rgba(26, 26, 46, 0.9)", // Semi-transparent dark blue
        backdropFilter: "blur(10px)", // Frosted glass effect
        boxShadow: "0 2px 10px rgba(0,0,0,0.2)",
      }
    : {
        backgroundColor: "transparent", // Start transparent
      };

  const linkStyle = {
    color: "white",
    textDecoration: "none",
    fontSize: "1rem",
    fontWeight: "500",
    cursor: "pointer",
    margin: "0 15px",
    opacity: 0.9,
    transition: "opacity 0.2s",
  };

  const logoStyle = {
    fontSize: "1.8rem",
    fontWeight: "bold",
    color: "#d2b48c", // Original tan color
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "10px",
  };

  const actionButtonStyle = {
    padding: "10px 20px",
    borderRadius: "20px", // Rounded like reference
    border: "2px solid #d2b48c",
    backgroundColor: "transparent",
    color: "#d2b48c",
    fontWeight: "bold",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    transition: "all 0.2s",
  };

  return (
    <nav style={{ ...navStyle, ...scrolledStyles }}>
      {/* LOGO */}
      <div style={logoStyle} onClick={() => navigate("/")}>
        {/* Placeholder Icon for Spiral */}
        <div
          style={{
            width: "30px",
            height: "30px",
            background: "#d2b48c",
            borderRadius: "50%",
          }}
        />
        SPIRAL WOOD
      </div>

      {/* NAVIGATION LINKS */}
      <div style={{ display: "flex", alignItems: "center" }}>
        <span style={linkStyle} onClick={() => navigate("/catalog")}>
          Catalog
        </span>
        <span style={linkStyle} onClick={() => navigate("/appointment")}>
          Custom Build
        </span>
        <span style={linkStyle} onClick={() => navigate("/about")}>
          Our Story
        </span>

        {/* AUTH BUTTONS */}
        {user ? (
          <div style={{ display: "flex", gap: "10px", marginLeft: "20px" }}>
            <button
              style={actionButtonStyle}
              onClick={() => {
                const route =
                  user.role === "admin"
                    ? "/admin/dashboard"
                    : user.staff_type === "delivery_rider"
                      ? "/staff/deliveries"
                      : "/staff/dashboard";
                navigate(route);
              }}
            >
              <LayoutDashboard size={16} /> Dashboard
            </button>
            <button
              style={{
                ...actionButtonStyle,
                borderColor: "#ff6b6b",
                color: "#ff6b6b",
              }}
              onClick={logout}
            >
              <LogOut size={16} /> Logout
            </button>
          </div>
        ) : (
          <button
            style={{ ...actionButtonStyle, marginLeft: "20px" }}
            onClick={() => navigate("/login")}
          >
            Sign In
          </button>
        )}
      </div>
    </nav>
  );
};

// ==========================================
// MAIN LANDING PAGE COMPONENT
// ==========================================
export default function LandingPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  // 👉 THE BOUNCER: Handle logged-in redirects
  if (user) {
    if (user.role === "admin") {
      return <Navigate to="/admin/dashboard" replace />;
    }
    if (user.role === "staff") {
      return (
        <Navigate
          to={
            user.staff_type === "delivery_rider"
              ? "/staff/deliveries"
              : "/staff/dashboard"
          }
          replace
        />
      );
    }
    return <Navigate to="/catalog" replace />;
  }

  // Common Tan color used throughout
  const tanColor = "#d2b48c";

  // Floating card styles (Reference picture style)
  const cardStyle = {
    backgroundColor: "rgba(255, 255, 255, 0.1)", // Translucent white
    backdropFilter: "blur(15px)", // Glass effect
    border: "1px solid rgba(255, 255, 255, 0.2)", // Subtle white border
    padding: "60px",
    borderRadius: "20px",
    maxWidth: "700px",
    textAlign: "left", // Left-aligned like reference picture
    boxShadow: "0 15px 35px rgba(0,0,0,0.3)",
    // Add some margin top to make room for navbar
    marginTop: "80px",
  };

  const heroHeadingStyle = {
    fontSize: "3.8rem",
    fontWeight: 800,
    marginBottom: "20px",
    lineHeight: "1.1",
    color: "white",
  };

  const heroSubTextStyle = {
    fontSize: "1.2rem",
    maxWidth: "600px",
    marginBottom: "50px",
    color: "rgba(255,255,255,0.8)",
    lineHeight: "1.6",
  };

  const primaryButtonStyle = {
    padding: "16px 32px",
    fontSize: "1rem",
    backgroundColor: tanColor,
    color: "#1a1a2e",
    border: "none",
    borderRadius: "30px", // Fully rounded like reference
    fontWeight: "bold",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    transition: "transform 0.2s",
  };

  const secondaryButtonStyle = {
    padding: "16px 32px",
    fontSize: "1rem",
    backgroundColor: "rgba(255,255,255,0.1)", // Translucent secondary
    backdropFilter: "blur(5px)",
    color: "white",
    border: "1px solid rgba(255,255,255,0.3)",
    borderRadius: "30px", // Fully rounded like reference
    fontWeight: "bold",
    cursor: "pointer",
    transition: "background 0.2s",
  };

  return (
    <div
      style={{
        backgroundColor: "#fdfbf9",
        minHeight: "100vh",
        fontFamily: "sans-serif",
      }}
    >
      {/* 👉 0. THE NAV BAR */}
      <FloatingNavBar />

      {/* 👉 1. HERO SECTION (With Background Image) */}
      <section
        style={{
          position: "relative",
          minHeight: "100vh", // Full screen
          display: "flex",
          alignItems: "center", // Center card vertically
          justifyContent: "center", // Center card horizontally
          backgroundImage: `url(${cabinetImg})`, // imported image
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          padding: "20px",
        }}
      >
        {/* Dark Overlay over the image for text readability */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backgroundColor: "rgba(0,0,0,0.5)", // 50% opacity black
            zIndex: 1,
          }}
        />

        {/* 👉 Floating Card for Content (zIndex puts it above overlay) */}
        <div style={{ ...cardStyle, zIndex: 2 }}>
          <h1 style={heroHeadingStyle}>
            Crafted for Your Space.{" "}
            <span style={{ color: tanColor }}>Built to Last.</span>
          </h1>
          <p style={heroSubTextStyle}>
            From premium ready-made wooden furniture to fully custom blueprints,
            Spiral Wood Services brings your exact vision to life.
          </p>

          <div
            style={{
              display: "flex",
              gap: "20px",
              justifyContent: "flex-start", // Left aligned
              flexWrap: "wrap",
            }}
          >
            {/* Primary Funnel to the Catalog */}
            <button
              onClick={() => navigate("/catalog")}
              style={primaryButtonStyle}
              onMouseEnter={(e) => (e.target.style.transform = "scale(1.05)")}
              onMouseLeave={(e) => (e.target.style.transform = "scale(1)")}
            >
              Shop Catalog <ArrowRight size={18} />
            </button>

            {/* Secondary Funnel to Appointments */}
            <button
              onClick={() => navigate("/appointment")}
              style={secondaryButtonStyle}
              onMouseEnter={(e) =>
                (e.target.style.backgroundColor = "rgba(255,255,255,0.2)")
              }
              onMouseLeave={(e) =>
                (e.target.style.backgroundColor = "rgba(255,255,255,0.1)")
              }
            >
              Book Custom Build
            </button>
          </div>
        </div>
      </section>

      {/* 2. THE "WHY CHOOSE US" SECTION (Remains relatively the same) */}
      <section
        style={{ padding: "100px 20px", maxWidth: "1200px", margin: "0 auto" }}
      >
        <h2
          style={{
            textAlign: "center",
            fontSize: "2.8rem",
            fontWeight: 800,
            color: "#1a1a2e",
            marginBottom: "70px",
          }}
        >
          The Spiral Wood Standard
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            gap: "40px",
          }}
        >
          {/* Card 1 */}
          <div
            style={{
              textAlign: "center",
              padding: "40px",
              backgroundColor: "white",
              borderRadius: "16px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.05)",
              border: "1px solid #eee",
            }}
          >
            <div
              style={{
                backgroundColor: "#f5ece3",
                width: "80px",
                height: "80px",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 30px",
              }}
            >
              <Hammer size={40} color="#8B4513" />
            </div>
            <h3
              style={{
                fontSize: "1.5rem",
                marginBottom: "15px",
                color: "#1a1a2e",
                fontWeight: "700",
              }}
            >
              Premium Materials
            </h3>
            <p style={{ color: "#666", lineHeight: "1.7", fontSize: "1rem" }}>
              We source only the highest quality, durable wood for furniture
              that lasts generations.
            </p>
          </div>

          {/* Card 2 */}
          <div
            style={{
              textAlign: "center",
              padding: "40px",
              backgroundColor: "white",
              borderRadius: "16px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.05)",
              border: "1px solid #eee",
            }}
          >
            <div
              style={{
                backgroundColor: "#f5ece3",
                width: "80px",
                height: "80px",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 30px",
              }}
            >
              <Ruler size={40} color="#8B4513" />
            </div>
            <h3
              style={{
                fontSize: "1.5rem",
                marginBottom: "15px",
                color: "#1a1a2e",
                fontWeight: "700",
              }}
            >
              Bespoke Blueprints
            </h3>
            <p style={{ color: "#666", lineHeight: "1.7", fontSize: "1rem" }}>
              Have a unique space? Upload your blueprints and our master
              craftsmen will build it exactly to spec.
            </p>
          </div>

          {/* Card 3 */}
          <div
            style={{
              textAlign: "center",
              padding: "40px",
              backgroundColor: "white",
              borderRadius: "16px",
              boxShadow: "0 10px 30px rgba(0,0,0,0.05)",
              border: "1px solid #eee",
            }}
          >
            <div
              style={{
                backgroundColor: "#f5ece3",
                width: "80px",
                height: "80px",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 30px",
              }}
            >
              <ShieldCheck size={40} color="#8B4513" />
            </div>
            <h3
              style={{
                fontSize: "1.5rem",
                marginBottom: "15px",
                color: "#1a1a2e",
                fontWeight: "700",
              }}
            >
              Reliable Warranty
            </h3>
            <p style={{ color: "#666", lineHeight: "1.7", fontSize: "1rem" }}>
              Every purchase is backed by our dedicated warranty service to
              guarantee your peace of mind.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
