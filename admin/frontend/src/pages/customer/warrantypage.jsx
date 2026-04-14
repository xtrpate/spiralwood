/**
 * pages/warrantypage.jsx
 * Warranty Page — policy info + file a claim form + my claims list
 */
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

/* ── Status badge ── */
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

/* ── File upload preview ── */
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

/* ════════════════════════════════════════
   Main Page
═════════════════════════════════════════ */
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
      <div className="warranty-hero">
        <ShieldCheck
          size={40}
          strokeWidth={1.5}
          className="warranty-hero-icon"
        />
        <div>
          <h1>Warranty & Claims</h1>
          <p>We stand behind the quality of every piece we build</p>
        </div>
      </div>

      <div className="warranty-policy-band">
        <div className="warranty-policy-inner">
          <div className="wpolicy-card wpolicy-covered">
            <div className="wpolicy-card-title">
              <CheckCircle size={18} /> What's Covered
            </div>
            <ul>
              <li>Manufacturing defects in materials or construction</li>
              <li>Structural failures under normal use conditions</li>
              <li>Defects present at the time of delivery/installation</li>
            </ul>
          </div>

          <div className="wpolicy-card wpolicy-notcovered">
            <div className="wpolicy-card-title">
              <AlertCircle size={18} /> What's Not Covered
            </div>
            <ul>
              <li>Damage caused by misuse, accidents, or negligence</li>
              <li>Normal wear and tear over time</li>
              <li>Modifications made by the customer or third parties</li>
              <li>Damage from improper cleaning or maintenance</li>
            </ul>
          </div>

          <div className="wpolicy-card wpolicy-duration">
            <div className="wpolicy-card-title">
              <Clock size={18} /> Warranty Period
            </div>
            <div className="wpolicy-period">1 Year</div>
            <p>
              From the date of delivery/installation. Claims must be filed
              within this period.
            </p>
            <p>
              Approved claims will be repaired at no additional cost to the
              customer.
            </p>
          </div>
        </div>
      </div>

      <div className="warranty-howto">
        <h2>How to File a Claim</h2>
        <div className="warranty-steps">
          {[
            {
              n: "1",
              title: "Submit a Claim",
              desc: "Fill out the form below with your order details, a description of the defect, a photo, and your proof of purchase.",
            },
            {
              n: "2",
              title: "We Review It",
              desc: "Our team will review your claim within 3–5 business days and may contact you for more information.",
            },
            {
              n: "3",
              title: "Repair Service",
              desc: "If approved, we'll schedule a repair at no cost to you. We'll reach out to arrange the details.",
            },
          ].map((step) => (
            <div key={step.n} className="warranty-step">
              <div className="warranty-step-num">{step.n}</div>
              <div>
                <strong>{step.title}</strong>
                <p>{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="warranty-form-section">
        <div className="warranty-form-wrap">
          {!showForm && !submitted && hasEligibleOrders && (
            <button
              className="warranty-open-btn"
              onClick={() => setShowForm(true)}
            >
              <ShieldCheck size={18} /> File a Warranty Claim
            </button>
          )}

          {!showForm && !submitted && !hasEligibleOrders && (
            <div className="warranty-no-eligible-card">
              <ShieldCheck size={20} className="warranty-no-eligible-icon" />
              <div>
                <strong>No warranty claims available right now</strong>
                <p>
                  You currently have no completed and paid orders eligible for a
                  new warranty claim.
                </p>
              </div>
            </div>
          )}

          {showForm && !submitted && (
            <div className="warranty-form-card">
              <div className="warranty-form-header">
                <h2>File a Warranty Claim</h2>
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
                          — Select a completed & paid order —
                        </option>
                        {visibleOrders.map((order) => (
                          <option key={order.id} value={order.id}>
                            {order.order_number} — {formatDate(order.created_at)}
                            {" — "}valid until {formatDate(order.warranty_expiry)}
                          </option>
                        ))}
                      </select>
                      <ChevronDown size={15} className="wselect-icon" />
                    </div>
                  ) : (
                    <input
                      type="text"
                      className="winput"
                      value="No eligible completed & paid orders available for warranty claim."
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
                    placeholder="e.g. 3-Door Wardrobe Cabinet, Kitchen Cabinet Set"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    maxLength={255}
                  />
                </div>

                <div className="wfield">
                  <label className="wlabel">
                    Describe the Issue <span className="wrequired">*</span>
                  </label>
                  <textarea
                    className="winput wtextarea"
                    placeholder="Please describe the manufacturing defect in detail — what is broken, where it is, and when you noticed it…"
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
                    hint="Required — clear photo showing the defect"
                    name="photo"
                    file={photoFile}
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => setPhotoFile(e.target.files?.[0] || null)}
                    onClear={() => setPhotoFile(null)}
                  />

                  <FileUpload
                    label="Proof of Purchase"
                    hint="Required — receipt or order confirmation"
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
                      <span className="wspinner" /> Submitting…
                    </>
                  ) : (
                    <>
                      <ShieldCheck size={16} /> Submit Claim
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {submitted && (
            <div className="warranty-success">
              <CheckCircle size={52} strokeWidth={1.5} />
              <h2>Claim Submitted!</h2>
              <p>
                Your warranty claim has been received. Our team will review it
                within 3–5 business days and contact you with updates.
              </p>
              <button
                className="wsubmit-btn"
                style={{ maxWidth: 260 }}
                onClick={resetForm}
              >
                Submit Another Claim
              </button>
            </div>
          )}
        </div>

        <div className="warranty-claims-wrap">
          <h2 className="warranty-claims-title">My Warranty Claims</h2>

          {loadingClaims ? (
            <div className="wclaims-loading">
              <span className="wspinner wspinner-dark" /> Loading claims…
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
        </div>
      </div>
    </div>
  );
}

function ClaimCard({ claim }) {
  const [open, setOpen] = useState(false);
  const isRejected = String(claim.status || "").toLowerCase() === "rejected";

  return (
    <div className={`wclaim-card ${open ? "open" : ""}`}>
      <div className="wclaim-top" onClick={() => setOpen((prev) => !prev)}>
        <div className="wclaim-left">
          <div className="wclaim-product">{claim.product_name}</div>
          <div className="wclaim-meta">
            {claim.order_number && <span>#{claim.order_number}</span>}
            <span>{formatDate(claim.created_at)}</span>
          </div>
        </div>

        <div className="wclaim-right">
          <StatusBadge status={claim.status} />
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </div>

      {open && (
        <div className="wclaim-body">
          <div className="wclaim-desc">
            <strong>Issue:</strong> {claim.description}
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
                📷 View Defect Photo
              </a>
            )}

            {claim.proof_url && (
              <a
                href={buildAssetUrl(claim.proof_url)}
                target="_blank"
                rel="noreferrer"
                className="wclaim-file-link"
              >
                🧾 View Proof of Purchase
              </a>
            )}

            {claim.replacement_receipt && (
              <a
                href={buildAssetUrl(claim.replacement_receipt)}
                target="_blank"
                rel="noreferrer"
                className="wclaim-file-link"
              >
                📄 View Replacement Receipt
              </a>
            )}
          </div>

          <div className="wclaim-meta" style={{ marginTop: 10 }}>
            <span>Warranty until {formatDate(claim.warranty_expiry)}</span>
            {claim.fulfilled_at && (
              <span>Fulfilled on {formatDate(claim.fulfilled_at)}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}