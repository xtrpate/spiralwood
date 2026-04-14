import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import toast from "react-hot-toast";
import useAuthStore from "../store/authStore";

const getDefaultRouteForUser = (user) => {
  if (!user) return "/login";
  if (user.role === "admin") return "/admin/dashboard";

  if (user.role === "staff") {
    if (user.staff_type === "delivery_rider") return "/staff/deliveries";
    if (user.staff_type === "cashier") return "/staff/order";
    if (user.staff_type === "indoor") return "/staff/dashboard";
    return "/login";
  }

  return "/catalog";
};

export default function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);

  const [form, setForm] = useState({
    email: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);

  const setField = (key, value) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const user = await login(form.email, form.password);
      toast.success("Login successful.");
      navigate(getDefaultRouteForUser(user), { replace: true });
    } catch (err) {
      toast.error(err?.response?.data?.message || "Login failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#f8fafc",
        padding: 20,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "#fff",
          border: "1px solid #e2e8f0",
          borderRadius: 18,
          padding: 24,
          boxShadow: "0 10px 30px rgba(15,23,42,.06)",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 24, color: "#0f172a" }}>WISDOM Login</h1>
        <p style={{ margin: "8px 0 20px", color: "#64748b", fontSize: 14 }}>
          One login form for admin, indoor staff, delivery rider, and customer.
        </p>

        <form onSubmit={handleSubmit}>
          <label style={labelStyle}>Email</label>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setField("email", e.target.value)}
            style={inputStyle}
            required
          />

          <label style={labelStyle}>Password</label>
          <input
            type="password"
            value={form.password}
            onChange={(e) => setField("password", e.target.value)}
            style={inputStyle}
            required
          />

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              marginTop: 18,
              padding: "12px 14px",
              borderRadius: 10,
              border: "none",
              background: "#1d4ed8",
              color: "#fff",
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div style={{ marginTop: 16, fontSize: 13, color: "#64748b" }}>
          <div style={{ marginBottom: 6 }}>
            Customer? <Link to="/register">Create account</Link>
          </div>
          <div>
            Forgot password? <Link to="/forgot-password">Reset here</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

const labelStyle = {
  display: "block",
  marginBottom: 6,
  marginTop: 12,
  fontSize: 13,
  fontWeight: 600,
  color: "#334155",
};

const inputStyle = {
  width: "100%",
  padding: "11px 12px",
  borderRadius: 10,
  border: "1px solid #cbd5e1",
  fontSize: 14,
  boxSizing: "border-box",
};