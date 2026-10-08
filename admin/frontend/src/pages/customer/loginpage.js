import { useEffect, useState } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import useAuthStore from "../../store/authStore";

import { Mail, Lock, Eye, EyeOff } from "lucide-react";
import "./authpages.css";

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuthStore();

  const [form, setForm] = useState({ email: "", password: "" });
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({
    email: "",
    password: "",
  });

  const getInlineErrorFieldStyle = (hasError, extra = {}) =>
    hasError
      ? {
          ...extra,
          border: "1px solid #dc2626",
          boxShadow: "0 0 0 1px #dc2626",
        }
      : extra;

  const InlineFieldError = ({ id, message }) =>
    message ? (
      <span
        id={id}
        role="alert"
        style={{
          display: "block",
          marginTop: 5,
          color: "#b91c1c",
          fontSize: 12,
          lineHeight: 1.35,
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        {message}
      </span>
    ) : null;

  const validateField = (field, value) => {
    let message = "";

    if (field === "email") {
      if (!value.trim()) {
        message = "Email address is required.";
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
        message = "Enter a valid email address.";
      }
    }

    if (field === "password") {
      if (!value) {
        message = "Password is required.";
      }
    }

    setFieldErrors((prev) => ({
      ...prev,
      [field]: message,
    }));

    return message;
  };

  const set = (k, v) => {
    setForm((p) => ({ ...p, [k]: v }));

    if (fieldErrors[k]) {
      setFieldErrors((prev) => ({
        ...prev,
        [k]: "",
      }));
    }
  };

  useEffect(() => {
    if (location.state?.message) {
      setInfo(location.state.message);
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");

    const emailError = validateField("email", form.email);
    const passwordError = validateField("password", form.password);

    if (emailError || passwordError) {
      return;
    }

    setLoading(true);

    try {
      const user = await login(form.email, form.password);

      if (user.role === "admin") {
        navigate("/admin/dashboard", { replace: true });
      } else if (user.role === "staff") {
        navigate("/staff/dashboard", { replace: true });
      } else {
        navigate(location.state?.redirectTo || "/catalog", {
          replace: true,
        });
      }
    } catch (err) {
      const code = err.response?.data?.code;
      const message = err.response?.data?.message;
      const emailFromServer = err.response?.data?.email;

      if (code === "EMAIL_NOT_VERIFIED" || code === "PHONE_NOT_VERIFIED") {
        navigate("/verify-otp", {
          state: {
            email: emailFromServer || form.email,
            password: form.password,
            startingStep: code === "PHONE_NOT_VERIFIED" ? "phone" : "email",
          },
          fromLogin: true,
        });
        return;
      }

      if (code === "ACCOUNT_INACTIVE") {
        setError("Your account has been deactivated. Please contact support.");
        return;
      }

      setError(message || "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-root">
      <div className="auth-split">
        <div className="auth-brand-panel">
          <div className="brand-logo">W</div>
          <h1>
            Welcome to
            <br />
            <span>Spiral Wood</span>
          </h1>
          <p>
            Your one-stop destination for premium custom cabinetry and wood
            furniture. Order products, track your builds, and manage everything
            from one place.
          </p>

          <div className="brand-features">
            {[
              { icon: "🪵", text: "Browse & order custom wood furniture" },
              { icon: "📐", text: "Choose from our blueprint gallery" },
              {
                icon: "📦",
                text: "Track your order from production to delivery",
              },
              { icon: "🛡️", text: "Warranty support for eligible orders" },
            ].map((f) => (
              <div className="brand-feature" key={f.text}>
                <div className="brand-feature-icon">{f.icon}</div>
                <span>{f.text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="auth-card-panel">
          <div className="auth-card-header">
            <div className="mobile-logo">W</div>
            <h2>Sign In</h2>
            <p>Welcome back! Enter your credentials to continue.</p>
          </div>

          <div className="auth-tabs">
            <button className="auth-tab active">Sign In</button>
            <button className="auth-tab" onClick={() => navigate("/register")}>
              Create Account
            </button>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            {error && <div className="alert alert-error">{error}</div>}
            {info && <div className="alert alert-success">{info}</div>}

            <div className="field">
              <label>Email Address</label>
              <div
                className="field-input-wrap"
                style={getInlineErrorFieldStyle(Boolean(fieldErrors.email))}
              >
                <Mail size={15} />
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  onBlur={(e) => validateField("email", e.target.value)}
                  autoFocus
                  aria-invalid={Boolean(fieldErrors.email)}
                  aria-describedby={
                    fieldErrors.email ? "login-email-error" : undefined
                  }
                />
              </div>

              <InlineFieldError
                id="login-email-error"
                message={fieldErrors.email}
              />
            </div>

            <div className="field">
              <label>Password</label>
              <div
                className="field-input-wrap"
                style={getInlineErrorFieldStyle(Boolean(fieldErrors.password))}
              >
                <Lock size={15} />
                <input
                  type={showPw ? "text" : "password"}
                  placeholder="••••••••"
                  value={form.password}
                  onChange={(e) => set("password", e.target.value)}
                  onBlur={(e) => validateField("password", e.target.value)}
                  style={{ paddingRight: 40 }}
                  aria-invalid={Boolean(fieldErrors.password)}
                  aria-describedby={
                    fieldErrors.password ? "login-password-error" : undefined
                  }
                />
                <button
                  type="button"
                  className="pw-toggle"
                  onClick={() => setShowPw(!showPw)}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>

              <InlineFieldError
                id="login-password-error"
                message={fieldErrors.password}
              />
            </div>

            <div style={{ textAlign: "right", marginTop: -8 }}>
              <Link
                to="/forgot-password"
                style={{
                  fontSize: 13,
                  color: "var(--wood-dark)",
                  fontWeight: 600,
                  textDecoration: "none",
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                Forgot password?
              </Link>
            </div>

            <button type="submit" className="btn-auth" disabled={loading}>
              {loading ? "Signing in…" : "Sign In"}
            </button>
          </form>

          <div className="auth-switch" style={{ marginTop: 20 }}>
            Don't have an account?{" "}
            <button onClick={() => navigate("/register")}>Create one</button>
          </div>

          <p
            style={{
              textAlign: "center",
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 12,
              color: "#bbb",
              marginTop: 24,
              lineHeight: 1.6,
            }}
          >
            By signing in, you agree to our Terms of Service
            <br />
            and Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  );
}
