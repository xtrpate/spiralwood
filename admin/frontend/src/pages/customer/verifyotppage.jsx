/**
 * pages/VerifyOtpPage.jsx
 * Standalone page at /verify-otp
 * Used when: user tries to login but email_not_verified
 */
import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import "./authpages.css";
import useAuthStore from "../../store/authStore";

export default function VerifyOtpPage() {
  const {
    verifyOtp,
    verifyResetOtp,
    resendOtp,
    forgotPassword,
    verifyPhoneOtp,
    resendPhoneOtp,
    login, // <--- Import login
  } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const isFromLogin = location.state?.fromLogin;

  // Get password passed from login page
  const [password] = useState(location.state?.password || "");

  const [email] = useState(location.state?.email || "");
  const [verificationStep, setVerificationStep] = useState(
    location.state?.startingStep || "email",
  );

  const [uiState, setUiState] = useState("form");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const otpRefs = useRef([]);
  const purpose = location.state?.purpose || "verify_email";
  const isForgotPassword = purpose === "forgot_password";

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const handleOtpChange = (index, val) => {
    if (!/^\d*$/.test(val)) return;
    const next = [...otp];
    next[index] = val.slice(-1);
    setOtp(next);
    if (val && index < 5) otpRefs.current[index + 1]?.focus();
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otp[index] && index > 0)
      otpRefs.current[index - 1]?.focus();
    if (e.key === "ArrowLeft" && index > 0) otpRefs.current[index - 1]?.focus();
    if (e.key === "ArrowRight" && index < 5)
      otpRefs.current[index + 1]?.focus();
  };

  const handleOtpPaste = (e) => {
    const text = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!text) return;
    const next = text.split("").concat(Array(6).fill("")).slice(0, 6);
    setOtp(next);
    otpRefs.current[Math.min(text.length, 5)]?.focus();
    e.preventDefault();
  };

  const handleVerify = async () => {
    const code = otp.join("");

    if (code.length < 6) {
      setError("Please enter all 6 digits.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      if (isForgotPassword) {
        const result = await verifyResetOtp(email, code);

        navigate("/reset-password", {
          state: {
            resetToken: result.resetToken,
          },
        });
      } else if (verificationStep === "email") {
        await verifyOtp(email, code);
        setSuccess("Email verified successfully.");
        setTimeout(() => {
          setSuccess("");
          setOtp(["", "", "", "", "", ""]);
          setVerificationStep("phone");
          setResendCooldown(60);
          setTimeout(() => otpRefs.current[0]?.focus(), 100);
        }, 1200);
      } else if (verificationStep === "phone") {
        // Trigger full-screen "Verifying..." overlay immediately
        setUiState("verifying");

        await verifyPhoneOtp(email, code);

        // Transition to "Verification successful" screen
        setUiState("success");

        setTimeout(async () => {
          // Transition to "Logging you in..." screen
          setUiState("logging_in");

          // Auto-Login using the password passed from the login page
          if (isFromLogin && password) {
            try {
              await login(email, password);
              navigate("/", { replace: true });
            } catch (loginErr) {
              navigate("/login");
            }
          } else {
            navigate("/login");
          }
        }, 1500);
      }
    } catch (err) {
      setUiState("form");
      setError(err.response?.data?.message || "Invalid or expired code.");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || !email) return;

    setError("");

    try {
      if (isForgotPassword) {
        await forgotPassword(email);
      } else if (verificationStep === "email") {
        await resendOtp(email);
      } else {
        await resendPhoneOtp(email);
      }

      setResendCooldown(60);
      setOtp(["", "", "", "", "", ""]);
      otpRefs.current[0]?.focus();
    } catch (err) {
      setError(err.response?.data?.message || "Could not resend code.");
    }
  };

  if (uiState === "verifying") {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(255, 255, 255, 0.85)",
          backdropFilter: "blur(5px)",
          WebkitBackdropFilter: "blur(5px)",
        }}
      >
        <svg
          className="spinner-icon"
          style={{
            width: "36px",
            height: "36px",
            color: "#111",
            marginBottom: "14px",
          }}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
        <h3
          style={{
            fontSize: "14px",
            fontWeight: "500",
            color: "#111",
            margin: 0,
            fontFamily: "'Montserrat', sans-serif",
          }}
        >
          Verifying...
        </h3>
      </div>
    );
  }

  if (uiState === "success") {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(255, 255, 255, 0.85)",
          backdropFilter: "blur(5px)",
          WebkitBackdropFilter: "blur(5px)",
        }}
      >
        <div
          style={{
            width: "52px",
            height: "52px",
            borderRadius: "50%",
            border: "2px solid #111",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "14px",
          }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#111"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
        <h3
          style={{
            fontSize: "14px",
            fontWeight: "500",
            color: "#111",
            margin: 0,
            fontFamily: "'Montserrat', sans-serif",
          }}
        >
          Verification successful
        </h3>
      </div>
    );
  }

  if (uiState === "logging_in") {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(255, 255, 255, 0.85)",
          backdropFilter: "blur(5px)",
          WebkitBackdropFilter: "blur(5px)",
        }}
      >
        <svg
          className="spinner-icon"
          style={{
            width: "36px",
            height: "36px",
            color: "#111",
            marginBottom: "14px",
          }}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
        <h3
          style={{
            fontSize: "14px",
            fontWeight: "500",
            color: "#111",
            margin: 0,
            fontFamily: "'Montserrat', sans-serif",
          }}
        >
          Logging you in...
        </h3>
      </div>
    );
  }

  return (
    <div className="auth-root">
      <div className="auth-split">
        <div className="auth-brand-panel">
          <div className="brand-logo">W</div>
          <h1>
            {isForgotPassword ? (
              <>
                Verify
                <br />
                <span>Reset Code</span>
              </>
            ) : verificationStep === "phone" ? (
              <>
                Verify Your
                <br />
                <span>Phone</span>
              </>
            ) : (
              <>
                Verify Your
                <br />
                <span>Email</span>
              </>
            )}
          </h1>
          <p>
            {isForgotPassword
              ? "We sent a 6-digit password reset code to your email. Enter it below to continue."
              : verificationStep === "phone"
                ? "We sent a 6-digit verification code to your phone. Enter it below to confirm your identity."
                : "We sent a 6-digit verification code to your email address. Enter it below to confirm your identity."}
          </p>
        </div>

        <div className="auth-card-panel" style={{ justifyContent: "center" }}>
          <div className="otp-header">
            <div className="otp-icon">
              {verificationStep === "phone" ? "📱" : "📧"}
            </div>
            <h2>
              {isForgotPassword
                ? "Verify Reset Code"
                : verificationStep === "phone"
                  ? "Verify Your Phone"
                  : isFromLogin
                    ? "Verify to Continue"
                    : "Check Your Email"}
            </h2>
            <p>
              {isForgotPassword
                ? "Enter the reset code we sent to your email."
                : verificationStep === "phone"
                  ? "Enter the 6-digit verification code we sent to your phone."
                  : "Enter the verification code we sent to your email."}
              <br />
              <strong>{email}</strong>
            </p>
          </div>

          {error && (
            <div className="alert alert-error" style={{ marginBottom: 16 }}>
              {error}
            </div>
          )}
          {success && (
            <div className="alert alert-success" style={{ marginBottom: 16 }}>
              {success}
            </div>
          )}

          <div className="otp-inputs" onPaste={handleOtpPaste}>
            {otp.map((digit, i) => (
              <input
                key={i}
                ref={(el) => (otpRefs.current[i] = el)}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleOtpChange(i, e.target.value)}
                onKeyDown={(e) => handleOtpKeyDown(i, e)}
                autoFocus={i === 0}
              />
            ))}
          </div>

          <button
            className="btn-auth"
            onClick={handleVerify}
            disabled={loading || otp.join("").length < 6}
          >
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
                Verifying...
              </>
            ) : isForgotPassword ? (
              "Verify Reset Code"
            ) : verificationStep === "phone" ? (
              "Verify Phone"
            ) : (
              "Verify Email"
            )}
          </button>

          <div className="otp-resend" style={{ marginTop: 20 }}>
            {resendCooldown > 0 ? (
              <span>
                Resend code in <strong>{resendCooldown}s</strong>
              </span>
            ) : (
              <>
                Didn't receive the code?{" "}
                <button onClick={handleResend} disabled={!email}>
                  Resend Code
                </button>
              </>
            )}
          </div>

          <div className="auth-switch" style={{ marginTop: 16 }}>
            <button
              onClick={() =>
                navigate(isForgotPassword ? "/forgot-password" : "/login")
              }
            >
              {isForgotPassword ? "← Back" : "← Back to Login"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
