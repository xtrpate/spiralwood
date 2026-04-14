import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Mail, Lock, KeyRound, Eye, EyeOff } from "lucide-react";
import "./authpages.css";
import useAuthStore from "../../store/authStore";

export default function ResetPasswordPage() {
  const { forgotPassword, resetPassword } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState(location.state?.email || "");
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showCPw, setShowCPw] = useState(false);
  const [info, setInfo] = useState(location.state?.message || "");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (location.state?.message) {
      setInfo(location.state.message);
    }
  }, [location.state]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setInfo("");

    if (otp.trim().length !== 6) {
      setError("Please enter the 6-digit reset code.");
      return;
    }

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
      await resetPassword(email, otp, password);
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

  const handleResend = async () => {
    if (!email) {
      setError("Please enter your email first.");
      return;
    }

    setError("");
    setInfo("");
    setResending(true);

    try {
      await forgotPassword(email);
      setInfo("A new reset code has been sent to your email.");
    } catch (err) {
      setError(
        err.response?.data?.message || "Could not resend the reset code.",
      );
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="auth-root">
      <div className="auth-split">
        <div className="auth-brand-panel">
          <div className="brand-logo">W</div>
          <h1>
            Create New
            <br />
            <span>Password</span>
          </h1>
          <p>
            Enter the code sent to your email and choose a new password for your
            account.
          </p>
        </div>

        <div className="auth-card-panel">
          <div className="auth-card-header">
            <div className="mobile-logo">W</div>
            <h2>Reset Password</h2>
            <p>Complete the fields below to update your password.</p>
          </div>

          <form className="auth-form" onSubmit={handleSubmit}>
            {error && <div className="alert alert-error">{error}</div>}
            {info && <div className="alert alert-success">{info}</div>}

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
                />
              </div>
            </div>

            <div className="field">
              <label>Reset Code</label>
              <div className="field-input-wrap">
                <KeyRound size={15} />
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="6-digit code"
                  value={otp}
                  onChange={(e) =>
                    setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  required
                />
              </div>
            </div>

            <div className="field">
              <label>New Password</label>
              <div className="field-input-wrap">
                <Lock size={15} />
                <input
                  type={showPw ? "text" : "password"}
                  placeholder="Minimum 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  style={{ paddingRight: 40 }}
                />
                <button
                  type="button"
                  className="pw-toggle"
                  onClick={() => setShowPw(!showPw)}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <div className="field">
              <label>Confirm New Password</label>
              <div className="field-input-wrap">
                <Lock size={15} />
                <input
                  type={showCPw ? "text" : "password"}
                  placeholder="Repeat your new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  style={{ paddingRight: 40 }}
                />
                <button
                  type="button"
                  className="pw-toggle"
                  onClick={() => setShowCPw(!showCPw)}
                >
                  {showCPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button type="submit" className="btn-auth" disabled={loading}>
              {loading ? "Resetting password…" : "Reset Password"}
            </button>
          </form>

          <div
            className="auth-switch"
            style={{
              marginTop: 16,
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <button onClick={handleResend} disabled={resending}>
              {resending ? "Sending again…" : "Send another code"}
            </button>
            <button onClick={() => navigate("/login")}>Back to Login</button>
          </div>
        </div>
      </div>
    </div>
  );
}
