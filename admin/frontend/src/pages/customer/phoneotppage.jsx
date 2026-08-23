import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import "./authpages.css";
import useAuthStore from "../../store/authStore";

export default function PhoneOtpPage() {
  const { verifyPhoneOtp, resendPhoneOtp } = useAuthStore();

  const navigate = useNavigate();
  const location = useLocation();

  const email = location.state?.email || "";
  const phone = location.state?.phone || "";

  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(60);

  const otpRefs = useRef([]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return;

    const timer = setTimeout(() => {
      setResendCooldown((current) => current - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [resendCooldown]);

  useEffect(() => {
    if (!email) {
      navigate("/register", { replace: true });
    }
  }, [email, navigate]);

  const handleOtpChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;

    const next = [...otp];
    next[index] = value.slice(-1);
    setOtp(next);

    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (index, event) => {
    if (event.key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }

    if (event.key === "ArrowLeft" && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }

    if (event.key === "ArrowRight" && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpPaste = (event) => {
    const text = event.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6);

    if (!text) return;

    const next = text.split("").concat(Array(6).fill("")).slice(0, 6);

    setOtp(next);

    otpRefs.current[Math.min(text.length, 5)]?.focus();

    event.preventDefault();
  };

  const handleVerify = async () => {
    const code = otp.join("");

    if (code.length < 6) {
      setError("Please enter all 6 digits.");
      return;
    }

    setError("");
    setSuccess("");
    setLoading(true);

    try {
      await verifyPhoneOtp(email, code);

      setSuccess(
        "Phone number verified successfully. Your account is now ready.",
      );

      setTimeout(() => {
        navigate("/login");
      }, 1500);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Invalid or expired phone verification code.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || !email) return;

    setError("");
    setSuccess("");
    setOtp(["", "", "", "", "", ""]);

    try {
      await resendPhoneOtp(email);

      setResendCooldown(60);

      otpRefs.current[0]?.focus();
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Could not resend the phone verification code.",
      );
    }
  };

  return (
    <div
      className="auth-root"
      style={{ marginTop: "60px", marginBottom: "60px" }}
    >
      <div className="auth-split">
        <div className="auth-brand-panel">
          <div className="brand-logo">W</div>

          <h1>
            Verify Your
            <br />
            <span>Phone</span>
          </h1>

          <p>
            We sent a 6-digit verification code to your phone number. Enter it
            below to verify your phone and complete your registration.
          </p>
        </div>

        <div className="auth-card-panel" style={{ justifyContent: "center" }}>
          <div className="otp-header">
            <div className="otp-icon">📱</div>

            <h2>Verify Your Phone</h2>

            <p>
              Enter the 6-digit verification code we sent to your phone.
              {phone && (
                <>
                  <br />
                  <strong>{phone}</strong>
                </>
              )}
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
            {otp.map((digit, index) => (
              <input
                key={index}
                ref={(element) => {
                  otpRefs.current[index] = element;
                }}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(event) => handleOtpChange(index, event.target.value)}
                onKeyDown={(event) => handleOtpKeyDown(index, event)}
                autoFocus={index === 0}
                disabled={loading || !!success}
              />
            ))}
          </div>

          <button
            className="btn-auth"
            onClick={handleVerify}
            disabled={loading || !!success || otp.join("").length < 6}
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
            ) : (
              "Verify Phone"
            )}
          </button>

          <div className="otp-resend" style={{ marginTop: 20 }}>
            {resendCooldown > 0 ? (
              <span>
                Resend code in <strong>{resendCooldown}s</strong>
              </span>
            ) : (
              <>
                Didn't receive it?{" "}
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={!email || loading || !!success}
                >
                  Resend Code
                </button>
              </>
            )}
          </div>

          <div className="auth-switch" style={{ marginTop: 16 }}>
            <button type="button" onClick={() => navigate("/login")}>
              ← Back to Login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
