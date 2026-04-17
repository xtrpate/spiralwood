import { useState } from "react";
import { useNavigate } from "react-router-dom";
import "./authpages.css";
import useAuthStore from "../../store/authStore";

export default function ForgotPasswordPage() {
  const { forgotPassword } = useAuthStore();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await forgotPassword(email);
      navigate("/reset-password", {
        state: {
          email,
          message: "We sent a 6-digit password reset code to your email.",
        },
      });
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Could not process your request. Please try again.",
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
            <h2>Forgot Password</h2>
            <p>Enter your registered email to continue.</p>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            {error && <div className="alert alert-error">{error}</div>}

            <div className="field">
              <label>Email Address</label>
              <div className="field-input-wrap">
                <input
                  type="email"
                  className="no-icon"
                  placeholder=""
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
            </div>

            <button type="submit" className="btn-auth" disabled={loading}>
              {loading ? "Sending code..." : "Send Reset Code"}
            </button>
          </form>

          <div className="auth-switch">
            <button type="button" onClick={() => navigate("/login")}>
              Back to Login
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