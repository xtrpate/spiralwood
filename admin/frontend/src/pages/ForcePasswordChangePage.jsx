import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import useAuthStore from "../store/authStore";
import "./customer/authpages.css";

const nextRouteFor = (user) => {
  if (user?.role === "admin") return "/admin/dashboard";
  if (user?.role === "staff") {
    if (user.staff_type === "delivery_rider") return "/staff/rider-dashboard";
    if (user.staff_type === "cashier") return "/staff/order";
    return "/staff/dashboard";
  }
  return "/";
};

export default function ForcePasswordChangePage() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const completeTemporaryPasswordChange = useAuthStore(
    (state) => state.completeTemporaryPasswordChange,
  );

  useEffect(() => {
    if (!user) return;
    if (Number(user.must_change_password) !== 1) {
      navigate(nextRouteFor(user), { replace: true });
    }
  }, [navigate, user]);

  const [form, setForm] = useState({
    current_password: "",
    new_password: "",
    confirm_password: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const setField = (key, value) => {
    if (error) setError("");
    setForm((current) => ({ ...current, [key]: value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setError("");

    if (form.new_password.length < 8) {
      setError("New password must be at least 8 characters.");
      return;
    }
    if (form.new_password !== form.confirm_password) {
      setError("New passwords do not match.");
      return;
    }
    if (form.current_password === form.new_password) {
      setError("Choose a new password that is different from the temporary password.");
      return;
    }

    setLoading(true);
    try {
      const updatedUser = await completeTemporaryPasswordChange(
        form.current_password,
        form.new_password,
      );
      navigate(nextRouteFor(updatedUser), { replace: true });
    } catch (err) {
      setError(
        err?.response?.data?.message ||
          err?.message ||
          "Password could not be changed.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-root">
      <div className="auth-split">
        <div className="auth-card-panel">
          <div className="auth-card-header">
            <h2>CHANGE TEMPORARY PASSWORD</h2>
          </div>

          <p style={{ margin: "0 0 18px", color: "#666", fontSize: 14, lineHeight: 1.6 }}>
            {user?.name ? `${user.name}, ` : ""}your administrator issued a temporary password.
            Create your own password before continuing to WISDOM.
          </p>

          <form className="auth-form" onSubmit={submit}>
            <div className="field">
              <label>Temporary Password</label>
              <div className="field-input-wrap">
                <input
                  className="no-icon"
                  type="password"
                  value={form.current_password}
                  onChange={(e) => setField("current_password", e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
            </div>

            <div className="field">
              <label>New Password</label>
              <div className="field-input-wrap">
                <input
                  className="no-icon"
                  type="password"
                  minLength={8}
                  value={form.new_password}
                  onChange={(e) => setField("new_password", e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </div>
            </div>

            <div className="field">
              <label>Confirm New Password</label>
              <div className="field-input-wrap">
                <input
                  className="no-icon"
                  type="password"
                  minLength={8}
                  value={form.confirm_password}
                  onChange={(e) => setField("confirm_password", e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </div>
            </div>

            <button type="submit" className="btn-auth" disabled={loading}>
              {loading ? "Saving..." : "Save New Password"}
            </button>

            {error ? (
              <div
                style={{
                  marginTop: 10,
                  color: "#b91c1c",
                  background: "#fef2f2",
                  border: "1px solid #fecaca",
                  padding: "10px 12px",
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {error}
              </div>
            ) : null}
          </form>
        </div>
      </div>
    </div>
  );
}
