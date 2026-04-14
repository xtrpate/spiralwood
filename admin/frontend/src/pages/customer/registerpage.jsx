import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  User,
  Mail,
  Lock,
  Phone,
  MapPin,
  Eye,
  EyeOff,
  CheckCircle,
} from "lucide-react";
import "./authpages.css";
import useAuthStore from "../../store/authStore";

/* ── Password strength helper ── */
const calcStrength = (pw) => {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const labels = ["", "Weak", "Fair", "Good", "Strong"];
  const colors = ["", "#e53935", "#fb8c00", "#fdd835", "#43a047"];
  return { score, label: labels[score] || "", color: colors[score] || "" };
};

export default function RegisterPage() {
  const { register, verifyOtp, resendOtp } = useAuthStore();
  const navigate = useNavigate();

  /* ── Steps: 'form' | 'otp' | 'success' ── */
  const [step, setStep] = useState("form");
  const [showPw, setShowPw] = useState(false);
  const [showCPw, setShowCPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState("");

  /* ── OTP state ── */
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [otpError, setOtpError] = useState("");
  const [otpLoading, setOtpLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const otpRefs = useRef([]);

  /* ── Form data ── */
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    address: "",
    password: "",
    confirm_password: "",
    agreed: false,
  });

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const strength = calcStrength(form.password);

  /* ── Cooldown timer ── */
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  /* ── Step 1: Submit registration ── */
  const handleRegister = async (e) => {
    e.preventDefault();
    setError("");

    if (form.password !== form.confirm_password)
      return setError("Passwords do not match.");
    if (form.password.length < 8)
      return setError("Password must be at least 8 characters.");
    if (!form.agreed)
      return setError("Please agree to the Terms of Service to continue.");

    setLoading(true);
    try {
      await register({
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        phone: form.phone,
        address: form.address,
        password: form.password,
      });
      setRegisteredEmail(form.email);
      setResendCooldown(60);
      setStep("otp");
    } catch (err) {
      setError(
        err.response?.data?.message || "Registration failed. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  };

  /* ── OTP input handling ── */
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

  /* ── Step 2: Verify OTP ── */
  const handleVerifyOtp = async () => {
    const code = otp.join("");
    if (code.length < 6) return setOtpError("Please enter all 6 digits.");
    setOtpError("");
    setOtpLoading(true);
    try {
      await verifyOtp(registeredEmail, code);
      setStep("success");
    } catch (err) {
      setOtpError(
        err.response?.data?.message ||
          "Invalid or expired OTP. Please try again.",
      );
    } finally {
      setOtpLoading(false);
    }
  };

  /* ── Resend OTP ── */
  const handleResend = async () => {
    if (resendCooldown > 0) return;
    try {
      await resendOtp(registeredEmail);
      setResendCooldown(60);
      setOtp(["", "", "", "", "", ""]);
      otpRefs.current[0]?.focus();
    } catch {}
  };

  /* ─────────────── RENDER ─────────────── */

  /* Step 3: Pending */
  /* Step 3: Success */
  if (step === "success") {
    return (
      <div className="auth-root">
        <div className="auth-split">
          <div className="auth-brand-panel">
            <div className="brand-logo">W</div>
            <h1>
              Account
              <br />
              <span>Ready!</span>
            </h1>
            <p>
              Your email has been verified successfully. You can now sign in and
              start browsing products, placing orders, and tracking your
              account.
            </p>
          </div>

          <div className="auth-card-panel" style={{ justifyContent: "center" }}>
            <div className="pending-screen">
              <div className="pending-icon">✅</div>
              <h2>Email Verified Successfully</h2>
              <p>Your customer account is now ready to use.</p>
              <p style={{ fontWeight: 600, color: "var(--text-dark)" }}>
                {registeredEmail}
              </p>

              <div className="pending-steps">
                <h4>What happens next?</h4>
                {[
                  "Sign in using your email and password.",
                  "Browse the product catalog and request appointments.",
                  "Track your orders and account activity online.",
                ].map((s, i) => (
                  <div className="pending-step" key={i}>
                    <div className="pending-step-num">{i + 1}</div>
                    <span>{s}</span>
                  </div>
                ))}
              </div>

              <button
                className="btn-auth"
                style={{ marginTop: 8 }}
                onClick={() => navigate("/login")}
              >
                Go to Login
              </button>

              <p
                style={{
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 12,
                  color: "#bbb",
                  marginTop: 16,
                  lineHeight: 1.6,
                }}
              >
                Need help? Contact us at support@spiralwood.com
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* Step 2: OTP */
  if (step === "otp") {
    return (
      <div className="auth-root">
        <div className="auth-split">
          <div className="auth-brand-panel">
            <div className="brand-logo">W</div>
            <h1>
              Verify Your
              <br />
              <span>Email</span>
            </h1>
            <p>
              We sent a 6-digit verification code to your email. Enter it to
              confirm your identity and continue your registration.
            </p>
          </div>
          <div className="auth-card-panel" style={{ justifyContent: "center" }}>
            {/* Step dots */}
            <div className="step-indicator">
              <div className="step-dot done" />
              <div className="step-dot active" />
              <div className="step-dot" />
            </div>

            <div className="otp-header">
              <div className="otp-icon">📧</div>
              <h2>Check Your Email</h2>
              <p>
                We sent a 6-digit code to
                <br />
                <strong>{registeredEmail}</strong>
              </p>
            </div>

            {otpError && (
              <div className="alert alert-error" style={{ marginBottom: 16 }}>
                {otpError}
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
              onClick={handleVerifyOtp}
              disabled={otpLoading || otp.join("").length < 6}
            >
              {otpLoading ? "Verifying…" : "Verify Email"}
            </button>

            <div className="otp-resend" style={{ marginTop: 20 }}>
              {resendCooldown > 0 ? (
                <span>
                  Resend code in <strong>{resendCooldown}s</strong>
                </span>
              ) : (
                <>
                  Didn't receive it?{" "}
                  <button onClick={handleResend}>Resend Code</button>
                </>
              )}
            </div>

            <div className="auth-switch" style={{ marginTop: 16 }}>
              <button
                onClick={() => {
                  setStep("form");
                  setOtp(["", "", "", "", "", ""]);
                }}
              >
                ← Back to Registration
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* Step 1: Registration Form */
  return (
    <div className="auth-root">
      <div className="auth-split">
        {/* Left brand panel */}
        <div className="auth-brand-panel">
          <div className="brand-logo">W</div>
          <h1>
            Join
            <br />
            <span>Spiral Wood</span>
          </h1>
          <p>
            Create your customer account to browse our full catalog, place
            custom orders, and track every step of your build.
          </p>
          <div className="brand-features">
            {[
              { icon: "✅", text: "Free to register, no hidden fees" },
              { icon: "🔒", text: "Your data is safe and encrypted" },
              { icon: "📱", text: "Get updates via email at every stage" },
              { icon: "🏆", text: "Trusted by hundreds of happy customers" },
            ].map((f) => (
              <div className="brand-feature" key={f.text}>
                <div className="brand-feature-icon">{f.icon}</div>
                <span>{f.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right card */}
        <div className="auth-card-panel">
          <div className="auth-card-header">
            <div className="mobile-logo">W</div>
            <h2>Create Account</h2>
            <p>Fill in your details to get started.</p>
          </div>

          {/* Step dots */}
          <div className="step-indicator">
            <div className="step-dot active" />
            <div className="step-dot" />
            <div className="step-dot" />
          </div>

          {/* Tab switcher */}
          <div className="auth-tabs">
            <button className="auth-tab" onClick={() => navigate("/login")}>
              Sign In
            </button>
            <button className="auth-tab active">Create Account</button>
          </div>

          <form className="auth-form" onSubmit={handleRegister}>
            {error && <div className="alert alert-error">{error}</div>}

            {/* Name row */}
            <div className="form-row">
              <div className="field">
                <label>First Name *</label>
                <div className="field-input-wrap">
                  <User size={15} />
                  <input
                    type="text"
                    placeholder="Juan"
                    value={form.first_name}
                    onChange={(e) => set("first_name", e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="field">
                <label>Last Name *</label>
                <div className="field-input-wrap">
                  <User size={15} />
                  <input
                    type="text"
                    placeholder="dela Cruz"
                    value={form.last_name}
                    onChange={(e) => set("last_name", e.target.value)}
                    required
                  />
                </div>
              </div>
            </div>

            {/* Email */}
            <div className="field">
              <label>Email Address *</label>
              <div className="field-input-wrap">
                <Mail size={15} />
                <input
                  type="email"
                  placeholder="juan@example.com"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Phone */}
            <div className="field">
              <label>Phone Number *</label>
              <div className="field-input-wrap">
                <Phone size={15} />
                <input
                  type="tel"
                  placeholder="09XXXXXXXXX"
                  value={form.phone}
                  onChange={(e) => set("phone", e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Address */}
            <div className="field">
              <label>Home Address *</label>
              <div className="field-input-wrap">
                <MapPin size={15} />
                <input
                  type="text"
                  placeholder="Street, Barangay, City, Province"
                  value={form.address}
                  onChange={(e) => set("address", e.target.value)}
                  required
                />
              </div>
            </div>

            {/* Password */}
            <div className="field">
              <label>Password *</label>
              <div className="field-input-wrap">
                <Lock size={15} />
                <input
                  type={showPw ? "text" : "password"}
                  placeholder="Min. 8 characters"
                  value={form.password}
                  onChange={(e) => set("password", e.target.value)}
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
              {form.password && (
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
            </div>

            {/* Confirm Password */}
            <div className="field">
              <label>Confirm Password *</label>
              <div className="field-input-wrap">
                <Lock size={15} />
                <input
                  type={showCPw ? "text" : "password"}
                  placeholder="Repeat your password"
                  value={form.confirm_password}
                  onChange={(e) => set("confirm_password", e.target.value)}
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
              {form.confirm_password && (
                <div
                  style={{
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: 12,
                    fontWeight: 600,
                    color:
                      form.password === form.confirm_password
                        ? "var(--success)"
                        : "var(--error)",
                    marginTop: 4,
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  {form.password === form.confirm_password ? (
                    <>
                      <CheckCircle size={13} /> Passwords match
                    </>
                  ) : (
                    "✗ Passwords do not match"
                  )}
                </div>
              )}
            </div>

            {/* Terms */}
            <div className="terms-check">
              <input
                type="checkbox"
                id="terms"
                checked={form.agreed}
                onChange={(e) => set("agreed", e.target.checked)}
              />
              <label htmlFor="terms">
                I agree to the{" "}
                <a href="/terms" target="_blank" rel="noreferrer">
                  Terms of Service
                </a>{" "}
                and{" "}
                <a href="/privacy" target="_blank" rel="noreferrer">
                  Privacy Policy
                </a>
                . I understand I need to verify my email before I can log in.
              </label>
            </div>

            <button type="submit" className="btn-auth" disabled={loading}>
              {loading ? "Creating account…" : "Create Account"}
            </button>
          </form>

          <div className="auth-switch" style={{ marginTop: 16 }}>
            Already have an account?{" "}
            <button onClick={() => navigate("/login")}>Sign in</button>
          </div>
        </div>
      </div>
    </div>
  );
}
