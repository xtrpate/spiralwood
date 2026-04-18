import { useEffect, useMemo, useState } from "react";
import api, { buildAssetUrl } from "../../services/api";
import {
  ShieldCheck,
  AlertCircle,
  CheckCircle,
  Clock,
  Upload,
  X,
  ChevronDown,
  ChevronUp,
  FileText,
} from "lucide-react";
import "./warrantypage.css";

const StatusBadge = ({ status }) => {
  const normalized = String(status || "").toLowerCase();

  const map = {
    pending: { cls: "wbadge-pending", label: "Pending" },
    reviewing: { cls: "wbadge-reviewing", label: "Under Review" },
    approved: { cls: "wbadge-approved", label: "Approved" },
    rejected: { cls: "wbadge-rejected", label: "Rejected" },
    fulfilled: { cls: "wbadge-resolved", label: "Fulfilled" },
    resolved: { cls: "wbadge-resolved", label: "Resolved" },
  };

  const { cls, label } = map[normalized] || {
    cls: "wbadge-pending",
    label: status || "Pending",
  };

  return <span className={`wbadge ${cls}`}>{label}</span>;
};

const formatDate = (str) => {
  if (!str) return "—";

  const parsed = new Date(str);
  if (Number.isNaN(parsed.getTime())) return "—";

  return parsed.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const FileUpload = ({ label, hint, name, file, onChange, onClear, accept }) => (
  <div className="w-upload-box">
    <div className="w-upload-label">{label}</div>
    {hint && <div className="w-upload-hint">{hint}</div>}

    {file ? (
      <div className="w-upload-preview">
        {file.type?.startsWith("image/") ? (
          <img
            src={URL.createObjectURL(file)}
            alt="preview"
            className="w-upload-img"
          />
        ) : (
          <div className="w-upload-pdf">
            <FileText size={28} />
            <span>{file.name}</span>
          </div>
        )}

        <button type="button" className="w-upload-clear" onClick={onClear}>
          <X size={14} />
        </button>
      </div>
    ) : (
      <label className="w-upload-trigger">
        <Upload size={20} />
        <span>Click to upload</span>
        <span className="w-upload-types">JPG, PNG, PDF · max 5 MB</span>
        <input
          type="file"
          name={name}
          accept={accept}
          hidden
          onChange={onChange}
        />
      </label>
    )}
  </div>
);

const SummaryStat = ({ label, value }) => (
  <div className="warranty-summary-card">
    <div className="warranty-summary-label">{label}</div>
    <div className="warranty-summary-value">{value}</div>
  </div>
);

export default function WarrantyPage() {
  const [orders, setOrders] = useState([]);

  const [orderId, setOrderId] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [productName, setProductName] = useState("");
  const [description, setDescription] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  const [proofFile, setProofFile] = useState(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState("");
  const [showForm, setShowForm] = useState(false);

  const [claims, setClaims] = useState([]);
  const [loadingClaims, setLoadingClaims] = useState(true);

  useEffect(() => {
    fetchClaims();
    fetchOrders();
  }, []);

  const fetchOrders = async () => {
    try {
      const res = await api.get("/customer/warranty/orders");
      setOrders(Array.isArray(res.data) ? res.data : []);
    } catch {
      setOrders([]);
    }
  };

  const fetchClaims = async () => {
    setLoadingClaims(true);
    try {
      const res = await api.get("/customer/warranty");
      setClaims(Array.isArray(res.data) ? res.data : []);
    } catch {
      setClaims([]);
    } finally {
      setLoadingClaims(false);
    }
  };

  const visibleOrders = useMemo(() => {
    const claimedOrderIds = new Set(
      claims
        .map((claim) => String(claim.order_id || "").trim())
        .filter(Boolean),
    );

    return orders.filter(
      (order) => !claimedOrderIds.has(String(order.id || "").trim()),
    );
  }, [orders, claims]);

  const hasEligibleOrders = visibleOrders.length > 0;

  useEffect(() => {
    if (!orderId) return;

    const stillExists = visibleOrders.some(
      (order) => String(order.id) === String(orderId),
    );

    if (!stillExists) {
      setOrderId("");
      setOrderNumber("");
    }
  }, [orderId, visibleOrders]);

  useEffect(() => {
    if (!hasEligibleOrders && showForm) {
      setShowForm(false);
    }
  }, [hasEligibleOrders, showForm]);

  const handleOrderSelect = (e) => {
    const val = e.target.value;
    setOrderId(val);

    const found = visibleOrders.find((order) => String(order.id) === val);
    setOrderNumber(found?.order_number || "");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");

    if (!orderId && !orderNumber.trim()) {
      setFormError("Please select an eligible completed and paid order.");
      return;
    }

    if (!productName.trim()) {
      setFormError("Please enter the product name.");
      return;
    }

    if (!description.trim()) {
      setFormError("Please describe the issue.");
      return;
    }

    if (!photoFile) {
      setFormError("Please upload a photo of the defect.");
      return;
    }

    if (!proofFile) {
      setFormError("Please upload your proof of purchase or receipt.");
      return;
    }

    const formData = new FormData();
    formData.append("product_name", productName.trim());
    formData.append("description", description.trim());
    formData.append("photo", photoFile);
    formData.append("proof", proofFile);

    if (orderId) formData.append("order_id", orderId);
    if (orderNumber) formData.append("order_number", orderNumber);

    setSubmitting(true);

    try {
      await api.post("/customer/warranty", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      await Promise.all([fetchClaims(), fetchOrders()]);

      if (orderId) {
        setOrders((prev) =>
          prev.filter((order) => String(order.id) !== String(orderId)),
        );
      }

      setSubmitted(true);
      setFormError("");
    } catch (err) {
      setFormError(
        err?.response?.data?.message ||
          "Something went wrong. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = async () => {
    setOrderId("");
    setOrderNumber("");
    setProductName("");
    setDescription("");
    setPhotoFile(null);
    setProofFile(null);
    setSubmitted(false);
    setFormError("");
    setShowForm(false);

    await Promise.all([fetchClaims(), fetchOrders()]);
  };

  return (
    <div className="warranty-page">
      <div className="warranty-shell">
        <section className="warranty-hero">
          <div className="warranty-hero-copy">
            <div className="warranty-eyebrow">Customer Support</div>
            <h1>Warranty & Claims</h1>
            <p>
              Submit a warranty request for eligible completed and paid orders.
              We review claims carefully and coordinate approved repairs with
              clear status updates.
            </p>
          </div>

          <div className="warranty-hero-panel">
            <div className="warranty-hero-panel-title">
              Claim Service Overview
            </div>
            <div className="warranty-hero-panel-list">
              <div>• 1-year warranty coverage</div>
              <div>• Completed and paid orders only</div>
              <div>• Review within 3–5 business days</div>
              <div>• Approved repairs at no added cost</div>
            </div>
          </div>
        </section>

        <section className="warranty-summary-grid">
          <SummaryStat label="Warranty Period" value="1 Year" />
          <SummaryStat
            label="Eligible Orders"
            value={hasEligibleOrders ? String(visibleOrders.length) : "0"}
          />
          <SummaryStat label="Submitted Claims" value={String(claims.length)} />
          <SummaryStat label="Review Window" value="3–5 Days" />
        </section>

        <section className="warranty-section">
          <div className="warranty-section-head">
            <h2>Coverage Summary</h2>
            <p>
              Clear information first, before the customer fills out the form.
            </p>
          </div>

          <div className="warranty-policy-grid">
            <div className="wpolicy-card">
              <div className="wpolicy-card-title">
                <CheckCircle size={18} />
                <span>What's Covered</span>
              </div>
              <ul>
                <li>Manufacturing defects in materials or workmanship</li>
                <li>Structural issues under normal intended use</li>
                <li>Defects present after delivery or installation</li>
              </ul>
            </div>

            <div className="wpolicy-card">
              <div className="wpolicy-card-title">
                <AlertCircle size={18} />
                <span>What's Not Covered</span>
              </div>
              <ul>
                <li>Misuse, accidents, negligence, or improper handling</li>
                <li>Normal wear and tear over time</li>
                <li>Unauthorized modifications by customer or third parties</li>
                <li>Damage from improper cleaning or maintenance</li>
              </ul>
            </div>

            <div className="wpolicy-card wpolicy-highlight">
              <div className="wpolicy-card-title">
                <Clock size={18} />
                <span>Claim Conditions</span>
              </div>
              <div className="wpolicy-period">1 Year</div>
              <p>Claims must be filed within the active warranty period.</p>
              <p>
                Only completed and paid orders are eligible for a new claim.
              </p>
            </div>
          </div>
        </section>

        <section className="warranty-section">
          <div className="warranty-section-head">
            <h2>How the Process Works</h2>
            <p>
              Keep the flow obvious so the customer understands what happens
              next.
            </p>
          </div>

          <div className="warranty-process-grid">
            {[
              {
                title: "1. Check Eligibility",
                desc: "Choose a completed and paid order that is still within the warranty period.",
              },
              {
                title: "2. Submit Details",
                desc: "Provide the product name, issue description, defect photo, and proof of purchase.",
              },
              {
                title: "3. Claim Review",
                desc: "Our team reviews your submission and may contact you if more details are needed.",
              },
              {
                title: "4. Repair Coordination",
                desc: "Approved claims move forward to repair scheduling and service completion.",
              },
            ].map((step) => (
              <div key={step.title} className="warranty-process-card">
                <strong>{step.title}</strong>
                <p>{step.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="warranty-main-grid">
          <div className="warranty-left-column">
            <div className="warranty-requirements-card">
              <div className="warranty-requirements-head">
                <ShieldCheck size={18} />
                <span>Before You Submit</span>
              </div>
              <ul>
                <li>Select an eligible completed and paid order.</li>
                <li>Prepare one clear photo showing the defect.</li>
                <li>Prepare your receipt or proof of purchase.</li>
                <li>Describe the issue clearly so review is faster.</li>
              </ul>
            </div>

            <div className="warranty-form-wrap">
              {!showForm && !submitted && hasEligibleOrders && (
                <button
                  type="button"
                  className="warranty-open-btn"
                  onClick={() => setShowForm(true)}
                >
                  <ShieldCheck size={18} />
                  <span>File a Warranty Claim</span>
                </button>
              )}

              {!showForm && !submitted && !hasEligibleOrders && (
                <div className="warranty-no-eligible-card">
                  <ShieldCheck size={20} className="warranty-no-eligible-icon" />
                  <div>
                    <strong>No warranty claims available right now</strong>
                    <p>
                      You currently have no completed and paid orders eligible
                      for a new warranty claim.
                    </p>
                  </div>
                </div>
              )}

              {showForm && !submitted && (
                <div className="warranty-form-card">
                  <div className="warranty-form-header">
                    <div>
                      <h2>Submit Warranty Claim</h2>
                      <p className="warranty-form-subtext">
                        Complete the required details below.
                      </p>
                    </div>

                    <button
                      type="button"
                      className="warranty-form-close"
                      onClick={() => setShowForm(false)}
                    >
                      <X size={18} />
                    </button>
                  </div>

                  <form onSubmit={handleSubmit} className="warranty-form">
                    <div className="wfield">
                      <label className="wlabel">
                        Eligible Order <span className="wrequired">*</span>
                      </label>

                      {hasEligibleOrders ? (
                        <div className="wselect-wrap">
                          <select
                            className="winput wselect"
                            value={orderId}
                            onChange={handleOrderSelect}
                          >
                            <option value="">
                              Select a completed and paid order
                            </option>
                            {visibleOrders.map((order) => (
                              <option key={order.id} value={order.id}>
                                {order.order_number} — {formatDate(order.created_at)}
                                {" — "}valid until{" "}
                                {formatDate(order.warranty_expiry)}
                              </option>
                            ))}
                          </select>
                          <ChevronDown size={15} className="wselect-icon" />
                        </div>
                      ) : (
                        <input
                          type="text"
                          className="winput"
                          value="No eligible completed and paid orders available."
                          readOnly
                        />
                      )}
                    </div>

                    <div className="wfield">
                      <label className="wlabel">
                        Product / Item Name <span className="wrequired">*</span>
                      </label>
                      <input
                        type="text"
                        className="winput"
                        placeholder="e.g. 3-Door Wardrobe Cabinet"
                        value={productName}
                        onChange={(e) => setProductName(e.target.value)}
                        maxLength={255}
                      />
                    </div>

                    <div className="wfield">
                      <label className="wlabel">
                        Issue Description <span className="wrequired">*</span>
                      </label>
                      <textarea
                        className="winput wtextarea"
                        placeholder="Describe the defect clearly — what is affected, where it appears, and when you noticed it."
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={4}
                        maxLength={1000}
                      />
                      <div className="wchar-count">{description.length}/1000</div>
                    </div>

                    <div className="wfield-row">
                      <FileUpload
                        label="Photo of Defect"
                        hint="Required — upload a clear image of the issue"
                        name="photo"
                        file={photoFile}
                        accept="image/jpeg,image/png,image/webp"
                        onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
                        onClear={() => setPhotoFile(null)}
                      />

                      <FileUpload
                        label="Proof of Purchase"
                        hint="Required — upload your receipt or confirmation"
                        name="proof"
                        file={proofFile}
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                        onClear={() => setProofFile(null)}
                      />
                    </div>

                    {formError && <div className="werror">{formError}</div>}

                    <button
                      type="submit"
                      className="wsubmit-btn"
                      disabled={submitting || !hasEligibleOrders}
                    >
                      {submitting ? (
                        <>
                          <span className="wspinner" />
                          <span>Submitting…</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck size={16} />
                          <span>Submit Claim</span>
                        </>
                      )}
                    </button>
                  </form>
                </div>
              )}

              {submitted && (
                <div className="warranty-success">
                  <CheckCircle size={52} strokeWidth={1.5} />
                  <h2>Claim Submitted</h2>
                  <p>
                    Your warranty request has been received. Our team will
                    review it within 3–5 business days and contact you for the
                    next step.
                  </p>
                  <button
                    type="button"
                    className="wsubmit-btn"
                    style={{ maxWidth: 260 }}
                    onClick={resetForm}
                  >
                    Submit Another Claim
                  </button>
                </div>
              )}
            </div>
          </div>

          <aside className="warranty-claims-wrap">
            <div className="warranty-claims-head">
              <div>
                <h2 className="warranty-claims-title">Submitted Claims</h2>
                <p className="warranty-claims-subtitle">
                  Track your claim status and review uploaded files.
                </p>
              </div>
              <div className="warranty-claims-count">{claims.length}</div>
            </div>

            {loadingClaims ? (
              <div className="wclaims-loading">
                <span className="wspinner wspinner-dark" />
                <span>Loading claims…</span>
              </div>
            ) : claims.length === 0 ? (
              <div className="wclaims-empty">
                <ShieldCheck size={36} strokeWidth={1} />
                <p>You haven't filed any warranty claims yet.</p>
              </div>
            ) : (
              <div className="wclaims-list">
                {claims.map((claim) => (
                  <ClaimCard key={claim.id} claim={claim} />
                ))}
              </div>
            )}
          </aside>
        </section>
      </div>
    </div>
  );
}

function ClaimCard({ claim }) {
  const [open, setOpen] = useState(false);
  const isRejected = String(claim.status || "").toLowerCase() === "rejected";

  return (
    <div className={`wclaim-card ${open ? "open" : ""}`}>
      <button
        type="button"
        className="wclaim-top"
        onClick={() => setOpen((prev) => !prev)}
      >
        <div className="wclaim-left">
          <div className="wclaim-product">
            {claim.product_name || "Warranty Claim"}
          </div>
          <div className="wclaim-meta">
            {claim.order_number && <span>Order #{claim.order_number}</span>}
            <span>Submitted {formatDate(claim.created_at)}</span>
          </div>
        </div>

        <div className="wclaim-right">
          <StatusBadge status={claim.status} />
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {open && (
        <div className="wclaim-body">
          <div className="wclaim-info-grid">
            <div className="wclaim-info-card">
              <div className="wclaim-info-label">Issue</div>
              <div className="wclaim-desc">{claim.description}</div>
            </div>

            <div className="wclaim-info-card">
              <div className="wclaim-info-label">Warranty Valid Until</div>
              <div className="wclaim-info-value">
                {formatDate(claim.warranty_expiry)}
              </div>
            </div>
          </div>

          {claim.admin_note && (
            <div className="wclaim-admin-note">
              <strong>{isRejected ? "Rejection Reason:" : "Admin Note:"}</strong>{" "}
              {claim.admin_note}
            </div>
          )}

          <div className="wclaim-files">
            {claim.photo_url && (
              <a
                href={buildAssetUrl(claim.photo_url)}
                target="_blank"
                rel="noreferrer"
                className="wclaim-file-link"
              >
                View Defect Photo
              </a>
            )}

            {claim.proof_url && (
              <a
                href={buildAssetUrl(claim.proof_url)}
                target="_blank"
                rel="noreferrer"
                className="wclaim-file-link"
              >
                View Proof of Purchase
              </a>
            )}

            {claim.replacement_receipt && (
              <a
                href={buildAssetUrl(claim.replacement_receipt)}
                target="_blank"
                rel="noreferrer"
                className="wclaim-file-link"
              >
                View Replacement Receipt
              </a>
            )}
          </div>

          {claim.fulfilled_at && (
            <div className="wclaim-footer-note">
              Fulfilled on {formatDate(claim.fulfilled_at)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}