import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import toast from "react-hot-toast";
import useAuthStore from "../store/authStore";
import "./customer/authpages.css";

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
  const location = useLocation();
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

    const redirectTo =
      location.state?.from?.pathname
        ? `${location.state.from.pathname}${location.state.from.search || ""}`
        : location.state?.redirectTo || null;

    try {
      const user = await login(form.email, form.password);
      toast.success("Login successful.");
      navigate(redirectTo || getDefaultRouteForUser(user), { replace: true });
    } catch (err) {
      toast.error(err?.response?.data?.message || "Login failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-root">
      <div className="auth-split">
        <div className="auth-card-panel">
          <button
            type="button"
            className="auth-close"
            onClick={() => navigate("/")}
            aria-label="Close"
          >
            ×
          </button>

          <div className="auth-card-header">
            <h2>Login</h2>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="field">
              <label>Username or email address *</label>
              <div className="field-input-wrap">
                <input
                  type="email"
                  className="no-icon"
                  placeholder=""
                  value={form.email}
                  onChange={(e) => setField("email", e.target.value)}
                  required
                  autoFocus
                />
              </div>
            </div>

            <div className="field">
              <label>Password *</label>
              <div className="field-input-wrap">
                <input
                  type="password"
                  className="no-icon"
                  placeholder=""
                  value={form.password}
                  onChange={(e) => setField("password", e.target.value)}
                  required
                />
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                marginTop: -2,
                marginBottom: 2,
              }}
            >
              <input
                id="remember-me"
                type="checkbox"
                style={{ width: 16, height: 16, cursor: "pointer" }}
              />
              <label
                htmlFor="remember-me"
                style={{ fontSize: 14, color: "#111111", cursor: "pointer" }}
              >
                Remember me
              </label>
            </div>

            <button type="submit" className="btn-auth" disabled={loading}>
              {loading ? "Logging in..." : "Log in"}
            </button>
          </form>

          <div className="auth-switch">
            <button type="button" onClick={() => navigate("/forgot-password")}>
              Lost your password?
            </button>
          </div>

          <div className="auth-switch">
            No account yet?{" "}
            <button type="button" onClick={() => navigate("/register")}>
              Create Account
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}