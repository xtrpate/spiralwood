import { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import "./authpages.css";
import useAuthStore from "../../store/authStore";

export default function PhoneOtpPage() {
  const {
    verifyPhoneOtp,
    resendPhoneOtp,
    changeRegistrationPhone,
    invalidateRegistrationPhoneOtp,
  } = useAuthStore();

  const navigate = useNavigate();
  const location = useLocation();

  const email = location.state?.email || "";
  const initialPhone = location.state?.phone || "";

  const [phoneDisplay, setPhoneDisplay] = useState(initialPhone);

  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(60);

  const [changingPhone, setChangingPhone] = useState(false);
  const [newPhone, setNewPhone] = useState("");
  const [changePhoneError, setChangePhoneError] = useState("");
  const [changePhoneLoading, setChangePhoneLoading] = useState(false);

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

      navigate("/login", {
        replace: true,
        state: {
          message: "Registered successfully! Your account is now ready.",
        },
      });
    } catch (err) {
      setError(
        err.response?.data?.message ||
          "Invalid or expired phone verification code.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleChangePhone = async () => {
    let value = newPhone.replace(/\D/g, "");

    if (value.startsWith("0")) {
      value = value.slice(1);
    }

    if (value.length > 10) {
      value = value.slice(0, 10);
    }

    setChangePhoneError("");

    if (value.length !== 10 || value[0] !== "9") {
      setChangePhoneError(
        "Please enter a valid 10-digit Philippine mobile number.",
      );
      return;
    }

    setChangePhoneLoading(true);

    try {
      const response = await changeRegistrationPhone(email, value);

      setOtp(["", "", "", "", "", ""]);
      setError("");
      setSuccess("");
      setChangePhoneError("");
      setChangingPhone(false);
      setNewPhone("");

      setResendCooldown(60);

      otpRefs.current[0]?.focus();

      const returnedPhone = response.phone || `63${value}`;

      const displayPhone = returnedPhone.startsWith("63")
        ? `0${returnedPhone.slice(2)}`
        : returnedPhone;

      setPhoneDisplay(displayPhone);
    } catch (err) {
      setChangePhoneError(
        err.response?.data?.message ||
          "Could not change your phone number right now.",
      );
    } finally {
      setChangePhoneLoading(false);
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
          {!changingPhone ? (
            <>
              <div className="otp-header">
                <div className="otp-icon">📱</div>

                <h2>Verify Your Phone</h2>

                <p>
                  Enter the 6-digit verification code we sent to your phone.
                  {phoneDisplay && (
                    <>
                      <br />
                      <strong>{phoneDisplay}</strong>
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
                <div
                  className="alert alert-success"
                  style={{ marginBottom: 16 }}
                >
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
                    onChange={(event) =>
                      handleOtpChange(index, event.target.value)
                    }
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
                Wrong phone number?{" "}
                <button
                  type="button"
                  onClick={async () => {
                    setChangePhoneError("");

                    try {
                      await invalidateRegistrationPhoneOtp(email);

                      setOtp(["", "", "", "", "", ""]);
                      setError("");
                      setSuccess("");

                      setChangingPhone(true);
                      setNewPhone("");
                      setResendCooldown(0);
                    } catch (err) {
                      setChangePhoneError(
                        err.response?.data?.message ||
                          "Could not open the change phone screen.",
                      );
                    }
                  }}
                  disabled={loading || !!success}
                >
                  Change phone number
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="otp-header">
                <div className="otp-icon">📱</div>

                <h2>Change Phone Number</h2>

                <p>
                  Enter your new phone number to receive a new verification
                  code.
                </p>
              </div>

              <div style={{ marginTop: 16 }}>
                <label
                  style={{
                    display: "block",
                    marginBottom: 6,
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  New Phone Number
                </label>

                <div
                  style={{
                    display: "flex",
                    border: "1px solid #ddd",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      padding: "0 10px",
                      whiteSpace: "nowrap",
                      color: "#555",
                      fontSize: 14,
                      background: "#f8f8f8",
                      borderRight: "1px solid #ddd",
                    }}
                  >
                    🇵🇭 +63
                  </div>

                  <input
                    type="tel"
                    inputMode="numeric"
                    maxLength={10}
                    value={newPhone}
                    onChange={(e) => {
                      let value = e.target.value.replace(/\D/g, "");

                      if (value.startsWith("0")) {
                        value = value.slice(1);
                      }

                      if (value.length > 10) {
                        value = value.slice(0, 10);
                      }

                      setNewPhone(value);
                    }}
                    placeholder="9XXXXXXXXX"
                    disabled={changePhoneLoading}
                    style={{
                      flex: 1,
                      minWidth: 0,
                      border: "none",
                      outline: "none",
                      padding: "11px 12px",
                      fontSize: 14,
                    }}
                  />
                </div>

                {changePhoneError && (
                  <div className="alert alert-error" style={{ marginTop: 8 }}>
                    {changePhoneError}
                  </div>
                )}

                <button
                  type="button"
                  className="btn-auth"
                  onClick={handleChangePhone}
                  disabled={changePhoneLoading}
                  style={{ marginTop: 10 }}
                >
                  {changePhoneLoading ? "Sending OTP..." : "Send OTP"}
                </button>

                <div className="auth-switch" style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    onClick={async () => {
                      setChangePhoneError("");

                      try {
                        await resendPhoneOtp(email);

                        setChangingPhone(false);
                        setNewPhone("");

                        setOtp(["", "", "", "", "", ""]);

                        setError("");
                        setSuccess("");
                        setResendCooldown(60);

                        otpRefs.current[0]?.focus();
                      } catch (err) {
                        setChangePhoneError(
                          err.response?.data?.message ||
                            "Could not send a new verification code.",
                        );
                      }
                    }}
                    disabled={changePhoneLoading}
                  >
                    Back to Verify Phone
                  </button>
                </div>
              </div>
            </>
          )}

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
