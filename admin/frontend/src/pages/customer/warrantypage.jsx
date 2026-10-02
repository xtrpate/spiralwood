import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
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
import {
  MotionFeedbackOverlay,
  getMotionFeedbackDurations,
} from "../../components/MotionFeedbackOverlay";
import "./warrantypage.css";

const MAX_WARRANTY_DESCRIPTION_LENGTH = 1000;
const MAX_WARRANTY_FILE_SIZE_BYTES = 5 * 1024 * 1024;

const StatusBadge = ({ status }) => {
  const normalized = String(status || "").toLowerCase();

  const map = {
    pending: { cls: "wbadge-pending", label: "Pending" },
    reviewing: { cls: "wbadge-reviewing", label: "Under Review" },
    approved: { cls: "wbadge-approved", label: "Approved" },
    rejected: { cls: "wbadge-rejected", label: "Rejected" },
    fulfilled: { cls: "wbadge-resolved", label: "Fulfilled" },
    resolved: { cls: "wbadge-resolved", label: "Resolved" },
    cancelled: { cls: "wbadge-cancelled", label: "Cancelled" },
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
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const parseFocusClaimId = (value) => {
  const raw = String(value ?? "").trim();
  if (!/^\d+$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
};

const FileUpload = ({ label, hint, name, file, onChange, onClear, accept, typeHint }) => (
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
        <span className="w-upload-types">{typeHint}</span>
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

const WarrantyLoadError = ({ message, detail, onRetry, retrying }) => (
  <div className="warranty-load-error" role="alert">
    <AlertCircle size={18} aria-hidden="true" />
    <div className="warranty-load-error-copy">
      <strong>{message}</strong>
      <p>{detail}</p>
    </div>
    <button
      type="button"
      className="warranty-load-retry"
      onClick={onRetry}
      disabled={retrying}
    >
      {retrying ? "Retrying…" : "Try again"}
    </button>
  </div>
);

export default function WarrantyPage() {
  const [orders, setOrders] = useState([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [ordersLoadError, setOrdersLoadError] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const initialFocusClaimParam = searchParams.get("focus_claim_id");

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  const [orderId, setOrderId] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [selectedOrderItemId, setSelectedOrderItemId] = useState("");
  const [claimQuantity, setClaimQuantity] = useState("1");
  const [products, setProducts] = useState([]);
  const [description, setDescription] = useState("");
  const [photoFile, setPhotoFile] = useState(null);
  const [proofFile, setProofFile] = useState(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [warrantyCenterTab, setWarrantyCenterTab] = useState(() =>
    initialFocusClaimParam ? "claims" : "file",
  );
  const [claimFocusResolving, setClaimFocusResolving] = useState(() =>
    Boolean(initialFocusClaimParam),
  );

  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackStatus, setFeedbackStatus] = useState("loading");
  const [feedbackMsg, setFeedbackMsg] = useState("");

  const [claims, setClaims] = useState([]);
  const [loadingClaims, setLoadingClaims] = useState(true);
  const [claimsLoadError, setClaimsLoadError] = useState("");
  const [claimsLoadedSuccessfully, setClaimsLoadedSuccessfully] =
    useState(false);
  const [focusedClaimId, setFocusedClaimId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState("");

  useEffect(() => {
    const loadInitialData = async () => {
      await Promise.all([fetchClaims(), fetchOrders()]);
      setLoading(false);
    };

    loadInitialData();
  }, []);

  const fetchOrders = async () => {
    setLoadingOrders(true);
    try {
      const res = await api.get("/customer/warranty/orders", {
        suppressGlobalErrorToast: true,
      });
      if (!Array.isArray(res.data)) {
        throw new Error("Invalid warranty eligibility response.");
      }
      setOrders(res.data);
      setOrdersLoadError("");
      return true;
    } catch {
      setOrdersLoadError("Unable to load warranty eligibility right now.");
      return false;
    } finally {
      setLoadingOrders(false);
    }
  };

  const fetchClaims = async () => {
    setLoadingClaims(true);
    setClaimsLoadedSuccessfully(false);
    try {
      const res = await api.get("/customer/warranty", {
        suppressGlobalErrorToast: true,
      });
      if (!Array.isArray(res.data)) {
        throw new Error("Invalid warranty claims response.");
      }
      setClaims(res.data);
      setClaimsLoadError("");
      setClaimsLoadedSuccessfully(true);
      return true;
    } catch {
      setClaimsLoadError("Unable to load your warranty claims right now.");
      return false;
    } finally {
      setLoadingClaims(false);
    }
  };

  const retryOrdersLoad = async () => {
    await fetchOrders();
  };

  const retryClaimsLoad = async () => {
    if (searchParams.get("focus_claim_id")) {
      setClaimFocusResolving(true);
    }
    await fetchClaims();
  };

  useEffect(() => {
    const rawFocusId = searchParams.get("focus_claim_id");
    if (!rawFocusId || loading || loadingClaims) {
      return;
    }

    if (!claimsLoadedSuccessfully) {
      setClaimFocusResolving(false);
      return;
    }

    const clearFocusParam = () => {
      const next = new URLSearchParams(searchParams);
      next.delete("focus_claim_id");
      setSearchParams(next, { replace: true });
    };

    const focusClaimId = parseFocusClaimId(rawFocusId);
    if (!focusClaimId) {
      toast.error("Invalid warranty claim link.");
      clearFocusParam();
      setClaimFocusResolving(false);
      return;
    }

    const matchedClaim = claims.find(
      (claim) => Number(claim?.id) === focusClaimId,
    );
    if (!matchedClaim) {
      toast.error(
        "That warranty claim could not be found. It may no longer be available.",
      );
      clearFocusParam();
      setClaimFocusResolving(false);
      return;
    }

    setWarrantyCenterTab("claims");
    setFocusedClaimId(focusClaimId);
    clearFocusParam();
  }, [
    claims,
    claimsLoadedSuccessfully,
    loading,
    loadingClaims,
    searchParams,
    setSearchParams,
  ]);

  useLayoutEffect(() => {
    if (
      !focusedClaimId ||
      loading ||
      loadingClaims ||
      warrantyCenterTab !== "claims"
    ) {
      return undefined;
    }

    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById(
        `warranty-claim-${focusedClaimId}`,
      );

      if (target) {
        target.scrollIntoView({ behavior: "auto", block: "center" });
      }

      setClaimFocusResolving(false);
    });

    const highlightTimer = window.setTimeout(
      () => setFocusedClaimId(null),
      4000,
    );

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(highlightTimer);
    };
  }, [focusedClaimId, loading, loadingClaims, warrantyCenterTab]);

  const visibleOrders = orders;

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

    const orderProducts = Array.isArray(found?.products)
      ? found.products
      : JSON.parse(found?.products || "[]");

    setProducts(orderProducts);
    setSelectedOrderItemId("");
    setClaimQuantity("1");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError("");

    if (!orderId && !orderNumber.trim()) {
      setFormError("Please select an eligible completed and paid order.");
      return;
    }

    const selectedItem = products.find(
      (item) => String(item.order_item_id) === String(selectedOrderItemId),
    );
    if (!selectedItem) {
      setFormError("Please select the exact affected item from the order.");
      return;
    }
    const claimQty = Number(claimQuantity);
    if (
      !Number.isInteger(claimQty) ||
      claimQty < 1 ||
      claimQty > Number(selectedItem.quantity || 1)
    ) {
      setFormError(
        `Claim quantity must be between 1 and ${Number(selectedItem.quantity || 1)}.`,
      );
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
    formData.append("order_item_id", selectedOrderItemId);
    formData.append("claim_quantity", String(claimQty));
    formData.append("description", description.trim());
    formData.append("photo", photoFile);
    formData.append("proof", proofFile);

    if (orderId) formData.append("order_id", orderId);
    if (orderNumber) formData.append("order_number", orderNumber);

    setSubmitting(true);
    setFeedbackOpen(true);
    setFeedbackStatus("loading");
    setFeedbackMsg("Uploading files and submitting claim...");

    try {
      await api.post("/customer/warranty", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setFeedbackStatus("success");
      setFeedbackMsg("Claim submitted successfully!");

      const durations = getMotionFeedbackDurations();
      setTimeout(async () => {
        setFeedbackOpen(false);
        setSubmitted(true);
        setFormError("");
        await Promise.all([fetchClaims(), fetchOrders()]);
      }, durations.success);
    } catch (err) {
      setFeedbackOpen(false);
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
    setSelectedOrderItemId("");
    setClaimQuantity("1");
    setDescription("");
    setPhotoFile(null);
    setProofFile(null);
    setSubmitted(false);
    setFormError("");
    setShowForm(true);
    setWarrantyCenterTab("file");

    await Promise.all([fetchClaims(), fetchOrders()]);
  };

  const openCancelModal = (claim) => {
    setCancelError("");
    setCancelTarget(claim);
  };

  const closeCancelModal = () => {
    if (cancelBusy) return;
    setCancelError("");
    setCancelTarget(null);
  };

  const handleCancelClaim = async () => {
    if (!cancelTarget?.id || cancelBusy) return;

    setCancelBusy(true);
    setCancelError("");

    try {
      await api.patch(`/customer/warranty/${cancelTarget.id}/cancel`);
      await Promise.all([fetchClaims(), fetchOrders()]);
      setCancelTarget(null);
    } catch (err) {
      setCancelError(
        err?.response?.data?.message ||
          "Unable to cancel this warranty claim. Please try again.",
      );
    } finally {
      setCancelBusy(false);
    }
  };

  return (
    <div
      className={`warranty-page${
        claimFocusResolving ? " warranty-page-resolving-focus" : ""
      }`}
    >
      {claimFocusResolving && (
        <div
          className="warranty-focus-loading"
          role="status"
          aria-label="Loading warranty claim"
        >
          <span
            className="warranty-focus-spinner"
            aria-hidden="true"
          />
        </div>
      )}

      <div className="warranty-shell">
        {/* 👉 STATIC HEADER - ALWAYS VISIBLE */}
        <section className="warranty-page-head">
          <div className="warranty-page-copy">
            <h1>Warranty & Claims</h1>
            <p>
              Get help with eligible furniture issues covered by your warranty.
              Review the coverage below, then submit and track your claim in one
              place.
            </p>
          </div>
        </section>
        {loading ? (
          /* 👉 SKELETON BODY (Header is no longer hidden!) */
          <div
            style={{
              animation: "appt-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
            }}
          >
            <div
              className="warranty-summary-grid"
              style={{ marginBottom: "40px" }}
            >
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="warranty-summary-card"
                  style={{
                    height: "100px",
                    background: "#ffffff",
                    border: "1px solid #e5e7eb",
                  }}
                >
                  <div
                    style={{
                      height: "12px",
                      width: "60%",
                      background: "#f3f4f6",
                      marginBottom: "16px",
                    }}
                  />
                  <div
                    style={{
                      height: "32px",
                      width: "40%",
                      background: "#e5e7eb",
                    }}
                  />
                </div>
              ))}
            </div>

            <div className="warranty-section">
              <div
                style={{
                  height: "32px",
                  width: "250px",
                  background: "#e5e7eb",
                  marginBottom: "12px",
                }}
              />
              <div
                style={{
                  height: "16px",
                  width: "400px",
                  background: "#f3f4f6",
                  marginBottom: "32px",
                }}
              />
              <div className="warranty-policy-grid">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="wpolicy-card"
                    style={{
                      height: "240px",
                      background: "#ffffff",
                      border: "1px solid #e5e7eb",
                    }}
                  >
                    <div
                      style={{
                        height: "24px",
                        width: "50%",
                        background: "#f3f4f6",
                        marginBottom: "24px",
                      }}
                    />
                    <div
                      style={{
                        height: "120px",
                        width: "100%",
                        background: "#f3f4f6",
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
            <style>{`@keyframes appt-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .6; } }`}</style>
          </div>
        ) : (
          <>
            <section
              className="warranty-glance-v2"
              aria-label="Warranty at a glance"
            >
              <div className="warranty-glance-card-v2">
                <div className="warranty-glance-label-v2">
                  Warranty coverage
                </div>
                <div className="warranty-glance-value-v2">
                  See eligible order
                </div>
                <p>
                  Coverage starts from the customer handoff date. Check the
                  valid-until date shown for each eligible order.
                </p>
              </div>

              <div className="warranty-glance-card-v2">
                <div className="warranty-glance-label-v2">Claim review</div>
                <div className="warranty-glance-value-v2">Status updates</div>
                <p>Track review and service updates anytime from Your claims.</p>
              </div>
            </section>
            <section className="warranty-section">
              <div className="warranty-section-head">
                <h2>Warranty coverage</h2>
                <p>Check what is covered before filing a claim.</p>
              </div>

              <div className="warranty-policy-grid">
                <div className="wpolicy-card">
                  <div className="wpolicy-card-title">
                    <CheckCircle size={18} />
                    <span>What's covered</span>
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
                    <span>What's not covered</span>
                  </div>
                  <ul>
                    <li>Misuse, accidents, negligence, or improper handling</li>
                    <li>Normal wear and tear over time</li>
                    <li>
                      Unauthorized modifications by the customer or third
                      parties
                    </li>
                    <li>Damage from improper cleaning or maintenance</li>
                  </ul>
                </div>

                <div className="wpolicy-card wpolicy-highlight">
                  <div className="wpolicy-card-title">
                    <Clock size={18} />
                    <span>Claim conditions</span>
                  </div>
                  <ul className="wpolicy-condition-list-v2">
                    <li>
                      File the claim while the order's warranty is still active.
                    </li>
                    <li>The order must be completed and fully paid.</li>
                    <li>
                      Approved repairs or replacements covered by the warranty
                      are provided at no additional cost.
                    </li>
                  </ul>
                </div>
              </div>
            </section>
            <section className="warranty-section warranty-process-section-v2">
              <div className="warranty-section-head">
                <h2>How to file a claim</h2>
                <p>Four simple steps from submission to review.</p>
              </div>

              <div className="warranty-process-grid">
                {[
                  {
                    title: "1. Choose your order",
                    desc: "Select an eligible completed and paid order.",
                  },
                  {
                    title: "2. Describe the issue",
                    desc: "Tell us what happened and which item is affected.",
                  },
                  {
                    title: "3. Add supporting files",
                    desc: "Upload a clear defect photo and your proof of purchase.",
                  },
                  {
                    title: "4. Track your claim",
                    desc: "Follow the review status and service updates from this page.",
                  },
                ].map((step) => (
                  <div key={step.title} className="warranty-process-card">
                    <strong>{step.title}</strong>
                    <p>{step.desc}</p>
                  </div>
                ))}
              </div>
            </section>
            <section
              className={`warranty-main-grid warranty-center-v21 ${
                warrantyCenterTab === "file" ? "is-file-tab" : "is-claims-tab"
              }`}
            >
              <div className="warranty-center-head-v21">
                <div>
                  <h2>Warranty center</h2>
                  <p>
                    Submit a new claim or review your existing warranty
                    requests.
                  </p>
                </div>

                <div
                  className="warranty-center-tabs-v21"
                  role="tablist"
                  aria-label="Warranty center"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={warrantyCenterTab === "file"}
                    className={
                      warrantyCenterTab === "file"
                        ? "warranty-center-tab-v21 is-active"
                        : "warranty-center-tab-v21"
                    }
                    onClick={() => {
                      setWarrantyCenterTab("file");
                    }}
                  >
                    File a claim
                  </button>

                  <button
                    type="button"
                    role="tab"
                    aria-selected={warrantyCenterTab === "claims"}
                    className={
                      warrantyCenterTab === "claims"
                        ? "warranty-center-tab-v21 is-active"
                        : "warranty-center-tab-v21"
                    }
                    onClick={() => setWarrantyCenterTab("claims")}
                  >
                    Your claims
                    {(claimsLoadedSuccessfully || claims.length > 0) && (
                      <> ({claims.length})</>
                    )}
                  </button>
                </div>
              </div>

              {warrantyCenterTab === "file" && (
                <div className="warranty-left-column">
                  <div className="warranty-form-wrap">
                    {ordersLoadError && (
                      <WarrantyLoadError
                        message={ordersLoadError}
                        detail="We could not confirm the latest eligible orders. Existing order information remains available when possible."
                        onRetry={retryOrdersLoad}
                        retrying={loadingOrders}
                      />
                    )}

                    {!showForm && !submitted && hasEligibleOrders && (
                      <button
                        type="button"
                        className="warranty-open-btn warranty-open-btn-v21"
                        onClick={() => setShowForm(true)}
                      >
                        <ShieldCheck size={18} />
                        <span>File a warranty claim</span>
                      </button>
                    )}

                    {!showForm &&
                      !submitted &&
                      !loadingOrders &&
                      !ordersLoadError &&
                      !hasEligibleOrders && (
                      <div className="warranty-no-eligible-card">
                        <ShieldCheck
                          size={20}
                          className="warranty-no-eligible-icon"
                        />
                        <div>
                          <strong>
                            No eligible orders for a new claim right now
                          </strong>
                          <p>
                            No completed and fully paid order items are currently
                            available for a new warranty claim.
                          </p>
                        </div>
                      </div>
                    )}

                    {showForm && !submitted && (
                      <div className="warranty-form-card">
                        <div className="warranty-form-header">
                          <div>
                            <h2>Submit a warranty claim</h2>
                            <p className="warranty-form-subtext">
                              Tell us about the issue and add the required
                              files.
                            </p>
                          </div>
                        </div>

                        <form
                          onSubmit={(e) => e.preventDefault()}
                          className="warranty-form"
                        >
                          <div className="wfield">
                            <label className="wlabel">
                              Eligible order{" "}
                              <span className="wrequired">*</span>
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
                                      {order.order_number} — valid until{" "}
                                      {formatDate(order.warranty_expiry)}
                                    </option>
                                  ))}
                                </select>
                                <ChevronDown
                                  size={15}
                                  className="wselect-icon"
                                />
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
                              Affected product{" "}
                              <span className="wrequired">*</span>
                            </label>
                            <div className="wselect-wrap">
                              <select
                                className="winput wselect"
                                value={selectedOrderItemId}
                                onChange={(e) => {
                                  setSelectedOrderItemId(e.target.value);
                                  setClaimQuantity("1");
                                }}
                              >
                                <option value="">
                                  Select the affected product
                                </option>

                                {products.map((item) => (
                                  <option
                                    key={item.order_item_id}
                                    value={item.order_item_id}
                                  >
                                    {item.product_name} — Qty {item.quantity}
                                  </option>
                                ))}
                              </select>

                              <ChevronDown size={15} className="wselect-icon" />
                            </div>
                          </div>

                          <div className="wfield">
                            <label className="wlabel">
                              Claim quantity{" "}
                              <span className="wrequired">*</span>
                            </label>
                            <input
                              className="winput"
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={claimQuantity}
                              onChange={(e) => {
                                const value = e.target.value.replace(/\D/g, "");

                                if (!value) {
                                  setClaimQuantity("");
                                  return;
                                }

                                const numericValue = Number(value);

                                // Claim quantity cannot be 0.
                                if (numericValue < 1) {
                                  setClaimQuantity("1");
                                  return;
                                }

                                const selectedQuantity = Number(
                                  products.find(
                                    (item) =>
                                      String(item.order_item_id) ===
                                      String(selectedOrderItemId),
                                  )?.quantity || 1,
                                );

                                // Claim quantity cannot exceed the quantity purchased.
                                if (numericValue > selectedQuantity) {
                                  setClaimQuantity(String(selectedQuantity));
                                  return;
                                }

                                setClaimQuantity(String(numericValue));
                              }}
                              disabled={!selectedOrderItemId}
                            />
                          </div>

                          <div className="wfield">
                            <label className="wlabel">
                              Describe the issue{" "}
                              <span className="wrequired">*</span>
                            </label>
                            <textarea
                              className="winput wtextarea"
                              placeholder="Describe the defect clearly — what is affected, where it appears, and when you noticed it."
                              value={description}
                              onChange={(e) => setDescription(e.target.value)}
                              rows={4}
                              maxLength={MAX_WARRANTY_DESCRIPTION_LENGTH}
                            />
                            <div className="wchar-count">
                              {description.length}/
                              {MAX_WARRANTY_DESCRIPTION_LENGTH}
                            </div>
                          </div>

                          <div className="wfield-row">
                            <FileUpload
                              label={
                                <>
                                  Photo of the issue{" "}
                                  <span className="wrequired">*</span>
                                </>
                              }
                              hint="Required — upload a clear image of the issue"
                              name="photo"
                              file={photoFile}
                              accept="image/jpeg,image/png,image/webp,.jfif"
                              typeHint="JPG, JPEG, PNG, WEBP, JFIF · max 5 MB"
                              onChange={(e) => {
                                const file = e.target.files?.[0] || null;

                                if (!file) {
                                  setPhotoFile(null);
                                  return;
                                }

                                if (file.size > MAX_WARRANTY_FILE_SIZE_BYTES) {
                                  e.target.value = "";
                                  setPhotoFile(null);
                                  setFormError(
                                    "Photo of the issue must be 5 MB or smaller.",
                                  );
                                  return;
                                }

                                setFormError("");
                                setPhotoFile(file);
                              }}
                              onClear={() => setPhotoFile(null)}
                            />

                            <FileUpload
                              label={
                                <>
                                  Proof of purchase{" "}
                                  <span className="wrequired">*</span>
                                </>
                              }
                              hint="Required — upload your receipt or confirmation"
                              name="proof"
                              file={proofFile}
                              accept="image/jpeg,image/png,image/webp,.jfif,application/pdf"
                              typeHint="JPG, JPEG, PNG, WEBP, JFIF, PDF · max 5 MB"
                              onChange={(e) => {
                                const file = e.target.files?.[0] || null;

                                if (!file) {
                                  setProofFile(null);
                                  return;
                                }

                                if (file.size > MAX_WARRANTY_FILE_SIZE_BYTES) {
                                  e.target.value = "";
                                  setProofFile(null);
                                  setFormError(
                                    "Proof of purchase must be 5 MB or smaller.",
                                  );
                                  return;
                                }

                                setFormError("");
                                setProofFile(file);
                              }}
                              onClear={() => setProofFile(null)}
                            />
                          </div>

                          {formError && (
                            <div className="werror">{formError}</div>
                          )}

                          <button
                            type="button"
                            onClick={handleSubmit}
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
                                <span>Submit claim</span>
                              </>
                            )}
                          </button>
                        </form>
                      </div>
                    )}

                    {submitted && (
                      <div className="warranty-success">
                        <CheckCircle size={52} strokeWidth={1.5} />
                        <h2>Claim submitted</h2>
                        <p>
                          Your warranty request has been received. Our team will
                          review it and post the latest status and next steps in
                          Your claims.
                        </p>
                        <button
                          type="button"
                          className="wsubmit-btn"
                          style={{ maxWidth: 260 }}
                          onClick={resetForm}
                        >
                          Submit another claim
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {warrantyCenterTab === "claims" && (
                <aside className="warranty-claims-wrap">
                  <div className="warranty-claims-head">
                    <div>
                      <h2 className="warranty-claims-title">Your claims</h2>
                      <p className="warranty-claims-subtitle">
                        View the latest status, files, and service updates for
                        your warranty requests.
                      </p>
                    </div>
                  </div>

                  {claimsLoadError && (
                    <WarrantyLoadError
                      message={claimsLoadError}
                      detail="We could not confirm the latest claim history. Existing claims remain on screen when available."
                      onRetry={retryClaimsLoad}
                      retrying={loadingClaims}
                    />
                  )}

                  {loadingClaims && claims.length === 0 && !claimsLoadError ? (
                    <div
                      style={{
                        animation:
                          "appt-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
                        display: "grid",
                        gap: "10px",
                      }}
                    >
                      {[1, 2, 3].map((i) => (
                        <div
                          key={i}
                          style={{
                            height: "86px",
                            background: "#ffffff",
                            border: "1px solid #e5e7eb",
                            padding: "16px",
                          }}
                        >
                          <div
                            style={{
                              height: "18px",
                              width: "60%",
                              background: "#f3f4f6",
                              marginBottom: "8px",
                            }}
                          />
                          <div
                            style={{
                              height: "14px",
                              width: "40%",
                              background: "#f3f4f6",
                            }}
                          />
                        </div>
                      ))}
                      <style>{`@keyframes appt-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .6; } }`}</style>
                    </div>
                  ) : claimsLoadedSuccessfully && claims.length === 0 ? (
                    <div className="wclaims-empty">
                      <ShieldCheck size={36} strokeWidth={1} />
                      <p>You haven't filed any warranty claims yet.</p>
                    </div>
                  ) : (
                    <div className="wclaims-list">
                      {claims.map((claim) => {
                        const isFocused =
                          Number(claim?.id) === Number(focusedClaimId);

                        return (
                          <ClaimCard
                            key={claim.id}
                            claim={claim}
                            onCancel={openCancelModal}
                            forceOpen={isFocused}
                            focused={isFocused}
                          />
                        );
                      })}
                    </div>
                  )}
                </aside>
              )}
            </section>
          </>
        )}
      </div>

      {cancelTarget && (
        <div
          className="warranty-cancel-overlay"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeCancelModal();
          }}
        >
          <div
            className="warranty-cancel-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="warranty-cancel-title"
          >
            <div className="warranty-cancel-modal-head">
              <div>
                <div className="warranty-cancel-eyebrow">Warranty Claim</div>
                <h2 id="warranty-cancel-title">Cancel this claim?</h2>
              </div>

              <button
                type="button"
                className="warranty-cancel-close"
                onClick={closeCancelModal}
                disabled={cancelBusy}
                aria-label="Close cancellation dialog"
              >
                <X size={18} />
              </button>
            </div>

            <div className="warranty-cancel-modal-body">
              <p>
                Cancel this warranty claim? The claim will remain in your
                history, but it will no longer be reviewed.
              </p>

              <div className="warranty-cancel-warning">
                You may submit a new claim for the same eligible order after
                cancellation, as long as its warranty is still valid.
              </div>

              {cancelError && (
                <div className="warranty-cancel-error">{cancelError}</div>
              )}
            </div>

            <div className="warranty-cancel-actions">
              <button
                type="button"
                className="warranty-cancel-keep-btn"
                onClick={closeCancelModal}
                disabled={cancelBusy}
              >
                Keep claim
              </button>
              <button
                type="button"
                className="warranty-cancel-confirm-btn"
                onClick={handleCancelClaim}
                disabled={cancelBusy}
              >
                {cancelBusy ? "Cancelling…" : "Cancel claim"}
              </button>
            </div>
          </div>
        </div>
      )}
      <MotionFeedbackOverlay
        open={feedbackOpen}
        status={feedbackStatus}
        message={feedbackMsg}
        blocking
      />
    </div>
  );
}

function ClaimCard({ claim, onCancel, forceOpen = false, focused = false }) {
  const [open, setOpen] = useState(false);
  const normalizedStatus = String(claim.status || "").toLowerCase();

  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);
  const isRejected = normalizedStatus === "rejected";
  const isPending = normalizedStatus === "pending";
  const isCancelled = normalizedStatus === "cancelled";

  return (
    <div
      id={`warranty-claim-${claim.id}`}
      className={`wclaim-card ${open ? "open" : ""} ${
        focused ? "wclaim-notification-focus" : ""
      }`}
    >
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
              <div className="wclaim-info-label">Warranty valid until</div>
              <div className="wclaim-info-value">
                {formatDate(claim.warranty_expiry)}
              </div>
            </div>
          </div>

          {claim.admin_note && (
            <div className="wclaim-admin-note">
              <strong>{isRejected ? "Reason:" : "Service update:"}</strong>{" "}
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
                View issue photo
              </a>
            )}

            {claim.proof_url && (
              <a
                href={buildAssetUrl(claim.proof_url)}
                target="_blank"
                rel="noreferrer"
                className="wclaim-file-link"
              >
                View Proof of purchase
              </a>
            )}

            {claim.replacement_receipt && (
              <a
                href={buildAssetUrl(claim.replacement_receipt)}
                target="_blank"
                rel="noreferrer"
                className="wclaim-file-link"
              >
                View service receipt
              </a>
            )}
          </div>

          {claim.fulfilled_at && (
            <div className="wclaim-footer-note">
              Fulfilled on {formatDate(claim.fulfilled_at)}
            </div>
          )}

          {isCancelled && (
            <div className="wclaim-footer-note">
              Cancelled on {formatDate(claim.updated_at)}
            </div>
          )}

          {isPending && (
            <div className="wclaim-actions">
              <button
                type="button"
                className="wclaim-cancel-btn"
                onClick={() => onCancel(claim)}
              >
                Cancel claim
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
