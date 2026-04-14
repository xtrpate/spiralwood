/**
 * pages/PendingApprovalPage.jsx
 * Shown after email verification OR when login returns PENDING_APPROVAL
 */
import { useNavigate } from "react-router-dom";
import "./authpages.css";

export default function PendingApprovalPage() {
  const navigate = useNavigate();

  return (
    <div className="auth-root">
      <div className="auth-split">
        <div className="auth-brand-panel">
          <div className="brand-logo">W</div>
          <h1>
            Almost
            <br />
            <span>There!</span>
          </h1>
          <p>
            Your email has been verified. Our admin team will review your
            account shortly. We'll send you an email once you're approved.
          </p>
        </div>

        <div className="auth-card-panel" style={{ justifyContent: "center" }}>
          <div className="pending-screen">
            <div className="pending-icon">🎉</div>
            <h2>Email Verified!</h2>
            <p>Your account has been submitted for review.</p>

            <div className="pending-steps">
              <h4>What happens next?</h4>
              {[
                "Our admin team reviews your account within 1–2 business days.",
                "You'll receive an email notification once your account is approved.",
                "After approval, sign in to start browsing and ordering.",
              ].map((s, i) => (
                <div className="pending-step" key={i}>
                  <div className="pending-step-num">{i + 1}</div>
                  <span>{s}</span>
                </div>
              ))}
            </div>

            <button className="btn-auth" onClick={() => navigate("/login")}>
              Back to Login
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
