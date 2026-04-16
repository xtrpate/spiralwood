import React from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { ArrowRight, Hammer, Ruler, ShieldCheck } from "lucide-react";
import useAuthStore from "../../store/authStore";

// 🏠 Relative path to your cabinet image
import cabinetImg from "../assets/cabinet.png";

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

  return (
    <div
      style={{
        backgroundColor: "#fdfbf9",
        minHeight: "100vh",
        fontFamily: "sans-serif",
      }}
    >
      {/* 👉 1. HERO SECTION (Full Edge-to-Edge Background) */}
      <section
        style={{
          width: "100%",
          minHeight: "85vh",
          backgroundImage: `url(${cabinetImg})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end", // Pushes the card to the right
          padding: "5% 8%", // Keeps the card away from the exact edges
          boxSizing: "border-box",
        }}
      >
        {/* 👉 Solid White Promo Card (Like the reference image) */}
        <div
          style={{
            backgroundColor: "#ffffff",
            padding: "60px 40px",
            maxWidth: "550px",
            textAlign: "center",
            boxShadow: "0 15px 40px rgba(0,0,0,0.15)", // Soft shadow to lift it off the image
          }}
        >
          <h1
            style={{
              fontSize: "3.2rem",
              fontWeight: 900,
              marginBottom: "20px",
              lineHeight: "1.2",
              color: "#1a1a2e", // Dark text for the white card
              textTransform: "uppercase",
            }}
          >
            Crafted for Your Space.
            <br />
            <span style={{ color: "#d2b48c" }}>Built to Last.</span>
          </h1>

          {/* Subtle divider line like in the reference */}
          <div
            style={{
              height: "2px",
              width: "60%",
              backgroundColor: "#eee",
              margin: "0 auto 20px",
            }}
          />

          <p
            style={{
              fontSize: "1.1rem",
              marginBottom: "40px",
              color: "#555",
              lineHeight: "1.6",
            }}
          >
            From premium ready-made wooden furniture to fully custom blueprints,
            Spiral Wood Services brings your exact vision to life.
          </p>

          <div
            style={{
              display: "flex",
              gap: "15px",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            {/* Primary Button */}
            <button
              onClick={() => navigate("/catalog")}
              style={{
                padding: "16px 32px",
                fontSize: "1rem",
                backgroundColor: "#1a1a2e", // Dark solid button
                color: "#ffffff",
                border: "none",
                fontWeight: "bold",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "8px",
                transition: "background 0.2s",
              }}
              onMouseEnter={(e) => (e.target.style.backgroundColor = "#333")}
              onMouseLeave={(e) => (e.target.style.backgroundColor = "#1a1a2e")}
            >
              Shop the Catalog <ArrowRight size={18} />
            </button>

            {/* Secondary Button */}
            <button
              onClick={() => navigate("/appointment")}
              style={{
                padding: "16px 32px",
                fontSize: "1rem",
                backgroundColor: "transparent",
                color: "#1a1a2e",
                border: "2px solid #1a1a2e",
                fontWeight: "bold",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
              onMouseEnter={(e) => {
                e.target.style.backgroundColor = "#1a1a2e";
                e.target.style.color = "#ffffff";
              }}
              onMouseLeave={(e) => {
                e.target.style.backgroundColor = "transparent";
                e.target.style.color = "#1a1a2e";
              }}
            >
              Custom Build
            </button>
          </div>
        </div>
      </section>

      {/* 2. THE "WHY CHOOSE US" SECTION */}
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
