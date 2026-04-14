import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail } from "lucide-react";
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
        <div className="auth-brand-panel">
          <div className="brand-logo">W</div>
          <h1>
            Reset Your
            <br />
            <span>Password</span>
          </h1>
          <p>
            Enter your email address and we will send you a password reset code.
          </p>
        </div>

        <div className="auth-card-panel">
          <div className="auth-card-header">
            <div className="mobile-logo">W</div>
            <h2>Forgot Password</h2>
            <p>Enter your registered email to continue.</p>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            {error && <div className="alert alert-error">{error}</div>}

            <div className="field">
              <label>Email Address</label>
              <div className="field-input-wrap">
                <Mail size={15} />
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
            </div>

            <button type="submit" className="btn-auth" disabled={loading}>
              {loading ? "Sending code…" : "Send Reset Code"}
            </button>
          </form>

          <div className="auth-switch" style={{ marginTop: 16 }}>
            <button onClick={() => navigate("/login")}>← Back to Login</button>
          </div>
        </div>
      </div>
    </div>
  );
}
