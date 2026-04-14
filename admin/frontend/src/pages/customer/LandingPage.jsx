import React from "react";
import { useNavigate, Navigate } from "react-router-dom"; // 👉 Added Navigate
import { ArrowRight, Hammer, Ruler, Truck, ShieldCheck } from "lucide-react";
import useAuthStore from "../../store/authStore"; // 👉 Added Auth Store

export default function LandingPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore(); // 👉 Get the logged-in user

  // 👉 THE BOUNCER: If the user is logged in, redirect them immediately to the catalog
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
    <div style={{ backgroundColor: "#fdfbf9", minHeight: "100vh" }}>
      {/* 1. HERO SECTION */}
      <section
        style={{
          padding: "100px 20px",
          textAlign: "center",
          backgroundColor: "#1a1a2e",
          color: "white",
        }}
      >
        <h1
          style={{ fontSize: "3.5rem", fontWeight: 800, marginBottom: "20px" }}
        >
          Crafted for Your Space.{" "}
          <span style={{ color: "#d2b48c" }}>Built to Last.</span>
        </h1>
        <p
          style={{
            fontSize: "1.2rem",
            maxWidth: "600px",
            margin: "0 auto 40px",
            color: "#ccc",
          }}
        >
          From premium ready-made wooden furniture to fully custom blueprints,
          Spiral Wood Services brings your exact vision to life.
        </p>

        <div
          style={{
            display: "flex",
            gap: "20px",
            justifyContent: "center",
            flexWrap: "wrap",
          }}
        >
          {/* Funnels to the Catalog */}
          <button
            onClick={() => navigate("/catalog")}
            style={{
              padding: "14px 28px",
              fontSize: "1.1rem",
              backgroundColor: "#d2b48c",
              color: "#1a1a2e",
              border: "none",
              borderRadius: "6px",
              fontWeight: "bold",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            Shop the Catalog <ArrowRight size={18} />
          </button>

          {/* Funnels to Appointments */}
          <button
            onClick={() => navigate("/appointment")}
            style={{
              padding: "14px 28px",
              fontSize: "1.1rem",
              backgroundColor: "transparent",
              color: "white",
              border: "2px solid white",
              borderRadius: "6px",
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            Book a Custom Build
          </button>
        </div>
      </section>

      {/* 2. THE "WHY CHOOSE US" SECTION */}
      <section
        style={{ padding: "80px 20px", maxWidth: "1200px", margin: "0 auto" }}
      >
        <h2
          style={{
            textAlign: "center",
            fontSize: "2.5rem",
            color: "#1a1a2e",
            marginBottom: "50px",
          }}
        >
          The Spiral Wood Standard
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
            gap: "40px",
          }}
        >
          <div
            style={{
              textAlign: "center",
              padding: "20px",
              backgroundColor: "white",
              borderRadius: "12px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
            }}
          >
            <div
              style={{
                backgroundColor: "#f5ece3",
                width: "60px",
                height: "60px",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 20px",
              }}
            >
              <Hammer size={30} color="#8B4513" />
            </div>
            <h3
              style={{
                fontSize: "1.3rem",
                marginBottom: "10px",
                color: "#1a1a2e",
              }}
            >
              Premium Materials
            </h3>
            <p style={{ color: "#666", lineHeight: "1.6" }}>
              We source only the highest quality, durable wood for furniture
              that lasts generations.
            </p>
          </div>

          <div
            style={{
              textAlign: "center",
              padding: "20px",
              backgroundColor: "white",
              borderRadius: "12px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
            }}
          >
            <div
              style={{
                backgroundColor: "#f5ece3",
                width: "60px",
                height: "60px",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 20px",
              }}
            >
              <Ruler size={30} color="#8B4513" />
            </div>
            <h3
              style={{
                fontSize: "1.3rem",
                marginBottom: "10px",
                color: "#1a1a2e",
              }}
            >
              Bespoke Blueprints
            </h3>
            <p style={{ color: "#666", lineHeight: "1.6" }}>
              Have a unique space? Upload your blueprints and our master
              craftsmen will build it exactly to spec.
            </p>
          </div>

          <div
            style={{
              textAlign: "center",
              padding: "20px",
              backgroundColor: "white",
              borderRadius: "12px",
              boxShadow: "0 4px 12px rgba(0,0,0,0.05)",
            }}
          >
            <div
              style={{
                backgroundColor: "#f5ece3",
                width: "60px",
                height: "60px",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 20px",
              }}
            >
              <ShieldCheck size={30} color="#8B4513" />
            </div>
            <h3
              style={{
                fontSize: "1.3rem",
                marginBottom: "10px",
                color: "#1a1a2e",
              }}
            >
              Reliable Warranty
            </h3>
            <p style={{ color: "#666", lineHeight: "1.6" }}>
              Every purchase is backed by our dedicated warranty service to
              guarantee your peace of mind.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
