import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Lock } from "lucide-react";
import "./authpages.css";
import useAuthStore from "../../store/authStore";

const calcStrength = (pw) => {
  let score = 0;

  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;

  const labels = ["", "Weak", "Fair", "Good", "Strong"];
  const colors = ["", "#e53935", "#fb8c00", "#fdd835", "#43a047"];

  return {
    score,
    label: labels[score] || "",
    color: colors[score] || "",
  };
};

export default function ResetPasswordPage() {
  const { resetPassword } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  const resetToken = location.state?.resetToken || "";
  useEffect(() => {
    if (!resetToken) {
      navigate("/forgot-password", { replace: true });
    }
  }, [resetToken, navigate]);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showCPw, setShowCPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const strength = calcStrength(password);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      await resetPassword(resetToken, password);
      navigate("/login", {
        state: {
          message: "Password reset successful. You can now sign in.",
        },
      });
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Could not reset your password. Please try again.",
      );
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
            <h2>Reset Password</h2>
            <p>Create a new password for your account.</p>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            {error && <div className="alert alert-error">{error}</div>}

            <div className="field">
              <label>New Password</label>
              <div
                className="field-input-wrap"
                style={{ position: "relative" }}
              >
                <Lock size={15} />
                <input
                  type={showPw ? "text" : "password"}
                  placeholder="Minimum 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  style={{ paddingRight: 76 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((prev) => !prev)}
                  aria-label={showPw ? "Hide password" : "Show password"}
                  title={showPw ? "Hide password" : "Show password"}
                  style={{
                    position: "absolute",
                    right: 14,
                    top: "50%",
                    transform: "translateY(-50%)",
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    padding: 0,
                    color: "#8b8b8b",
                    fontSize: "14px",
                    fontWeight: 500,
                  }}
                >
                  {showPw ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {password && (
              <div className="pw-strength">
                <div className="pw-strength-bar">
                  <div
                    className="pw-strength-fill"
                    style={{
                      width: `${(strength.score / 4) * 100}%`,
                      background: strength.color,
                    }}
                  />
                </div>

                <span
                  className="pw-strength-label"
                  style={{ color: strength.color }}
                >
                  {strength.label}
                </span>
              </div>
            )}

            <div className="field">
              <label>Confirm New Password</label>
              <div
                className="field-input-wrap"
                style={{ position: "relative" }}
              >
                <Lock size={15} />
                <input
                  type={showCPw ? "text" : "password"}
                  placeholder="Repeat your new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  style={{ paddingRight: 76 }}
                />
                <button
                  type="button"
                  onClick={() => setShowCPw((prev) => !prev)}
                  aria-label={showCPw ? "Hide password" : "Show password"}
                  title={showCPw ? "Hide password" : "Show password"}
                  style={{
                    position: "absolute",
                    right: 14,
                    top: "50%",
                    transform: "translateY(-50%)",
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    padding: 0,
                    color: "#8b8b8b",
                    fontSize: "14px",
                    fontWeight: 500,
                  }}
                >
                  {showCPw ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {confirmPassword && (
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color:
                    password === confirmPassword
                      ? "var(--auth-success)"
                      : "var(--auth-error)",
                  marginTop: 4,
                }}
              >
                {password === confirmPassword
                  ? "Passwords match"
                  : "Passwords do not match"}
              </div>
            )}

            <button type="submit" className="btn-auth" disabled={loading}>
              {loading ? (
                <>
                  <svg
                    className="spinner-icon"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                  >
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Resetting password...
                </>
              ) : (
                "Reset Password"
              )}
            </button>
          </form>

          <div className="auth-switch">
            <button onClick={() => navigate("/login")}>Back to Login</button>
          </div>
        </div>
      </div>
    </div>
  );
}
