import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import "./motion-feedback.css";

const LOGIN_FEEDBACK_KEY = "wisdom_login_feedback";

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export const getMotionFeedbackDurations = () =>
  prefersReducedMotion()
    ? { loading: 550, success: 500 }
    : { loading: 700, success: 550 };

export function MotionFeedbackOverlay({
  open,
  status = "loading",
  message,
  blocking = false,
}) {
  const success = status === "success";

  if (!open) return null;

  return (
    <div
      className={`wisdom-motion-feedback ${blocking ? "is-blocking" : ""}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="wisdom-motion-feedback-content">
        {success ? (
          <span className="wisdom-motion-success-icon" aria-hidden="true">
            <span className="wisdom-motion-success-circle" />
            <svg
              className="wisdom-motion-success-check"
              viewBox="0 0 24 24"
            >
              <path
                className="wisdom-motion-success-check-path"
                d="m5.5 12.5 4 4 9-10"
              />
            </svg>
          </span>
        ) : (
          <span className="wisdom-motion-spinner" aria-hidden="true" />
        )}

        <span className="wisdom-motion-feedback-message wisdom-motion-feedback-message-reveal">
          {message || (success ? "Done" : "Please wait...")}
        </span>
      </div>
    </div>
  );
}

export function SessionLoginFeedback() {
  const location = useLocation();
  const [feedback, setFeedback] = useState({
    open: false,
    status: "loading",
  });

  useEffect(() => {
    let showFeedback = false;

    try {
      showFeedback = sessionStorage.getItem(LOGIN_FEEDBACK_KEY) === "success";
      if (showFeedback) {
        sessionStorage.removeItem(LOGIN_FEEDBACK_KEY);
      }
    } catch {
      showFeedback = false;
    }

    if (!showFeedback) {
      setFeedback({ open: false, status: "loading" });
      return undefined;
    }

    const durations = getMotionFeedbackDurations();
    setFeedback({ open: true, status: "loading" });

    let successTimer = null;
    let closeTimer = null;

    successTimer = window.setTimeout(() => {
      setFeedback({ open: true, status: "success" });
      closeTimer = window.setTimeout(() => {
        setFeedback({ open: false, status: "success" });
      }, durations.success);
    }, durations.loading);

    return () => {
      if (successTimer) window.clearTimeout(successTimer);
      if (closeTimer) window.clearTimeout(closeTimer);
    };
  }, [location.pathname]);

  return (
    <MotionFeedbackOverlay
      open={feedback.open}
      status={feedback.status}
      message={
        feedback.status === "success" ? "Login successful" : "Logging in..."
      }
      blocking
    />
  );
}
