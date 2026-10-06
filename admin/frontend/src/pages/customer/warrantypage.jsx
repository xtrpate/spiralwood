import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "react-router-dom";
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
const CUSTOMER_WARRANTY_PAGE_SIZE = 10;

const getInlineErrorFieldStyle = (hasError, extra = {}) =>
  hasError
    ? {
        ...extra,
        border: "1px solid #dc2626",
        boxShadow: "0 0 0 1px #dc2626",
      }
    : extra;

const InlineFieldError = ({ id, message }) =>
  message ? (
    <span
      id={id}
      role="alert"
      style={{
        display: "block",
        color: "#b91c1c",
        fontSize: 11,
        lineHeight: 1.2,
        whiteSpace: "normal",
        wordWrap: "break-word",
      }}
    >
      {message}
    </span>
  ) : null;

const DEFAULT_CLAIMS_PAGINATION = {
  page: 1,
  limit: CUSTOMER_WARRANTY_PAGE_SIZE,
  total: 0,
  totalPages: 0,
  hasNextPage: false,
  hasPreviousPage: false,
};

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

const FileUpload = ({
  label,
  hint,
  name,
  file,
  onChange,
  onClear,
  accept,
  typeHint,
  error,
  errorId,
}) => (
  <div style={{ position: "relative", paddingBottom: 24, flex: 1 }}>
    <div
      className="w-upload-box"
      style={
        error
          ? {
              outline: "1px solid #dc2626",
              outlineOffset: 2,
            }
          : undefined
      }
    >
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
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
            onChange={onChange}
          />
        </label>
      )}
    </div>

    <div style={{ position: "absolute", bottom: 0, left: 0, width: "100%" }}>
      <InlineFieldError id={errorId} message={error} />
    </div>
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
  const [fieldErrors, setFieldErrors] = useState({});
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
  const [claimsPage, setClaimsPage] = useState(1);
  const [claimsPagination, setClaimsPagination] = useState(
    DEFAULT_CLAIMS_PAGINATION,
  );
  const [loadingClaims, setLoadingClaims] = useState(true);
  const [claimsLoadError, setClaimsLoadError] = useState("");
  const [claimsLoadedSuccessfully, setClaimsLoadedSuccessfully] =
    useState(false);
  const [focusedClaimId, setFocusedClaimId] = useState(null);
  const [focusRetryNonce, setFocusRetryNonce] = useState(0);
  const [loading, setLoading] = useState(true);
  const [claimFocusFeedback, setClaimFocusFeedback] = useState(null);
  useEffect(() => {
    if (!claimFocusFeedback) return undefined;

    const handleClaimFocusFeedbackKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setClaimFocusFeedback(null);
      }
    };

    document.addEventListener("keydown", handleClaimFocusFeedbackKeyDown);

    return () => {
      document.removeEventListener("keydown", handleClaimFocusFeedbackKeyDown);
    };
  }, [claimFocusFeedback]);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState("");

  const claimsRequestSequenceRef = useRef(0);
  const focusRequestSequenceRef = useRef(0);

  useEffect(
    () => () => {
      claimsRequestSequenceRef.current += 1;
      focusRequestSequenceRef.current += 1;
    },
    [],
  );

  const fetchOrders = useCallback(async () => {
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
  }, []);

  const fetchClaims = useCallback(async (requestedPage) => {
    const pageToLoad = Number(requestedPage);

    if (!Number.isSafeInteger(pageToLoad) || pageToLoad < 1) {
      setClaimsLoadError("Unable to load your warranty claims right now.");
      return { ok: false, stale: false };
    }

    const requestId = ++claimsRequestSequenceRef.current;
    setLoadingClaims(true);
    setClaimsLoadedSuccessfully(false);

    try {
      const res = await api.get("/customer/warranty", {
        params: {
          page: pageToLoad,
          limit: CUSTOMER_WARRANTY_PAGE_SIZE,
        },
        suppressGlobalErrorToast: true,
      });

      const payload = res.data;
      const nextClaims = payload?.claims;
      const rawPagination = payload?.pagination;

      if (
        !Array.isArray(nextClaims) ||
        !rawPagination ||
        typeof rawPagination !== "object"
      ) {
        throw new Error("Invalid warranty claims response.");
      }

      const nextPagination = {
        page: Number(rawPagination.page),
        limit: Number(rawPagination.limit),
        total: Number(rawPagination.total),
        totalPages: Number(rawPagination.totalPages),
        hasNextPage: rawPagination.hasNextPage === true,
        hasPreviousPage: rawPagination.hasPreviousPage === true,
      };

      if (
        !Number.isSafeInteger(nextPagination.page) ||
        nextPagination.page < 1 ||
        !Number.isSafeInteger(nextPagination.limit) ||
        nextPagination.limit < 1 ||
        !Number.isSafeInteger(nextPagination.total) ||
        nextPagination.total < 0 ||
        !Number.isSafeInteger(nextPagination.totalPages) ||
        nextPagination.totalPages < 0
      ) {
        throw new Error("Invalid warranty claims pagination response.");
      }

      if (requestId !== claimsRequestSequenceRef.current) {
        return { ok: false, stale: true };
      }

      setClaims(nextClaims);
      setClaimsPagination(nextPagination);
      setClaimsPage(nextPagination.page);
      setClaimsLoadError("");
      setClaimsLoadedSuccessfully(true);

      return {
        ok: true,
        claims: nextClaims,
        pagination: nextPagination,
      };
    } catch {
      if (requestId !== claimsRequestSequenceRef.current) {
        return { ok: false, stale: true };
      }

      setClaimsLoadError("Unable to load your warranty claims right now.");
      return { ok: false, stale: false };
    } finally {
      if (requestId === claimsRequestSequenceRef.current) {
        setLoadingClaims(false);
      }
    }
  }, []);

  useEffect(() => {
    let active = true;

    const loadInitialData = async () => {
      await Promise.all([fetchClaims(1), fetchOrders()]);
      if (active) setLoading(false);
    };

    void loadInitialData();

    return () => {
      active = false;
    };
  }, [fetchClaims, fetchOrders]);

  const retryOrdersLoad = async () => {
    await fetchOrders();
  };

  const retryClaimsLoad = async () => {
    if (searchParams.get("focus_claim_id")) {
      setClaimFocusResolving(true);
      setFocusRetryNonce((value) => value + 1);
      return;
    }

    await fetchClaims(claimsPage);
  };

  useEffect(() => {
    const rawFocusId = searchParams.get("focus_claim_id");
    if (!rawFocusId || loading) {
      return;
    }

    const clearFocusParam = () => {
      const next = new URLSearchParams(searchParams);
      next.delete("focus_claim_id");
      setSearchParams(next, { replace: true });
    };

    const focusClaimId = parseFocusClaimId(rawFocusId);
    if (!focusClaimId) {
      setClaimFocusFeedback({
        title: "Warranty Claim Link Invalid",
        message:
          "This warranty claim link is invalid. Please open the Warranty page and select a claim from your claim history.",
      });
      clearFocusParam();
      setClaimFocusResolving(false);
      return;
    }

    const requestId = ++focusRequestSequenceRef.current;
    let active = true;

    const resolveFocusedClaim = async () => {
      setWarrantyCenterTab("claims");
      setClaimFocusResolving(true);

      try {
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const { data } = await api.get(`/customer/warranty/${focusClaimId}`, {
            params: { limit: CUSTOMER_WARRANTY_PAGE_SIZE },
            suppressGlobalErrorToast: true,
          });

          if (!active || requestId !== focusRequestSequenceRef.current) {
            return;
          }

          const exactClaim = data?.claim;
          const targetPage = Number(data?.pagination?.page);

          if (
            !exactClaim ||
            Number(exactClaim.id) !== focusClaimId ||
            !Number.isSafeInteger(targetPage) ||
            targetPage < 1
          ) {
            throw new Error("Invalid focused warranty claim response.");
          }

          const [claimsResult] = await Promise.all([
            fetchClaims(targetPage),
            fetchOrders(),
          ]);

          if (!active || requestId !== focusRequestSequenceRef.current) {
            return;
          }

          if (!claimsResult?.ok) {
            if (claimsResult?.stale) {
              setClaimFocusResolving(false);
              return;
            }
            throw new Error("Focused warranty claim page could not be loaded.");
          }

          const matchedClaim = claimsResult.claims.find(
            (claim) => Number(claim?.id) === focusClaimId,
          );

          if (matchedClaim) {
            setFocusedClaimId(focusClaimId);
            clearFocusParam();
            return;
          }
        }

        setClaimFocusFeedback({
          title: "Warranty Claim Could Not Be Opened",
          message:
            "The claim changed position while it was being opened. Please open it again from your warranty claim history.",
        });
        clearFocusParam();
        setClaimFocusResolving(false);
      } catch (err) {
        if (!active || requestId !== focusRequestSequenceRef.current) {
          return;
        }

        const status = Number(err?.response?.status);
        if ([403, 404, 410].includes(status)) {
          setClaimFocusFeedback({
            title: "Warranty Claim Not Available",
            message:
              "That warranty claim could not be found. It may no longer be available.",
          });
          clearFocusParam();
        } else {
          setClaimsLoadError("Unable to load your warranty claims right now.");
        }

        setClaimFocusResolving(false);
      }
    };

    void resolveFocusedClaim();

    return () => {
      active = false;
    };
  }, [
    focusRetryNonce,
    loading,
    searchParams,
    setSearchParams,
    fetchClaims,
    fetchOrders,
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

    setFieldErrors((prev) => ({
      ...prev,
      orderId: "",
      selectedOrderItemId: "",
      claimQuantity: "",
    }));

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
    setFieldErrors({});

    if (!orderId && !orderNumber.trim()) {
      setFieldErrors((prev) => ({
        ...prev,
        orderId: "Please select an eligible completed and paid order.",
      }));
      return;
    }

    const selectedItem = products.find(
      (item) => String(item.order_item_id) === String(selectedOrderItemId),
    );

    if (!selectedItem) {
      setFieldErrors((prev) => ({
        ...prev,
        selectedOrderItemId:
          "Please select the exact affected item from the order.",
      }));
      return;
    }

    const claimQty = Number(claimQuantity);

    if (
      !Number.isInteger(claimQty) ||
      claimQty < 1 ||
      claimQty > Number(selectedItem.quantity || 1)
    ) {
      setFieldErrors((prev) => ({
        ...prev,
        claimQuantity: `Claim quantity must be between 1 and ${Number(
          selectedItem.quantity || 1,
        )}.`,
      }));
      return;
    }

    if (!description.trim()) {
      setFieldErrors((prev) => ({
        ...prev,
        description: "Please describe the issue.",
      }));
      return;
    }

    if (!photoFile) {
      setFieldErrors((prev) => ({
        ...prev,
        photo: "Please upload a photo of the defect.",
      }));
      return;
    }

    if (!proofFile) {
      setFieldErrors((prev) => ({
        ...prev,
        proof: "Please upload your proof of purchase or receipt.",
      }));
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
        await Promise.all([fetchClaims(1), fetchOrders()]);
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
    setFieldErrors({});
    setShowForm(true);
    setWarrantyCenterTab("file");

    await Promise.all([fetchClaims(claimsPage), fetchOrders()]);
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
      await Promise.all([fetchClaims(claimsPage), fetchOrders()]);
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

  const loadClaimsPage = async (nextPage) => {
    if (loadingClaims) return;

    const lastPage = Math.max(1, claimsPagination.totalPages || 1);
    const targetPage = Math.min(Math.max(1, Number(nextPage) || 1), lastPage);

    if (targetPage === claimsPagination.page) return;
    await fetchClaims(targetPage);
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
          <span className="warranty-focus-spinner" aria-hidden="true" />
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
                <p>
                  Track review and service updates anytime from Your claims.
                </p>
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
                    {(claimsLoadedSuccessfully ||
                      claimsPagination.total > 0 ||
                      claims.length > 0) && <> ({claimsPagination.total})</>}
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
                              No completed and fully paid order items are
                              currently available for a new warranty claim.
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
                              <div>
                                <div className="wselect-wrap">
                                  <select
                                    className="winput wselect"
                                    value={orderId}
                                    onChange={handleOrderSelect}
                                    aria-invalid={Boolean(fieldErrors.orderId)}
                                    aria-describedby={
                                      fieldErrors.orderId
                                        ? "warranty-order-error"
                                        : undefined
                                    }
                                    style={getInlineErrorFieldStyle(
                                      Boolean(fieldErrors.orderId),
                                    )}
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

                                <InlineFieldError
                                  id="warranty-order-error"
                                  message={fieldErrors.orderId}
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

                                  setFieldErrors((prev) => ({
                                    ...prev,
                                    selectedOrderItemId: "",
                                    claimQuantity: "",
                                  }));
                                }}
                                aria-invalid={Boolean(
                                  fieldErrors.selectedOrderItemId,
                                )}
                                aria-describedby={
                                  fieldErrors.selectedOrderItemId
                                    ? "warranty-product-error"
                                    : undefined
                                }
                                style={getInlineErrorFieldStyle(
                                  Boolean(fieldErrors.selectedOrderItemId),
                                )}
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
                            <InlineFieldError
                              id="warranty-product-error"
                              message={fieldErrors.selectedOrderItemId}
                            />
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
                              aria-invalid={Boolean(fieldErrors.claimQuantity)}
                              aria-describedby={
                                fieldErrors.claimQuantity
                                  ? "warranty-quantity-error"
                                  : undefined
                              }
                              style={getInlineErrorFieldStyle(
                                Boolean(fieldErrors.claimQuantity),
                              )}
                              onChange={(e) => {
                                const value = e.target.value.replace(/\D/g, "");

                                setFieldErrors((prev) => ({
                                  ...prev,
                                  claimQuantity: "",
                                }));

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
                            <InlineFieldError
                              id="warranty-quantity-error"
                              message={fieldErrors.claimQuantity}
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
                              onChange={(e) => {
                                setDescription(e.target.value);

                                setFieldErrors((prev) => ({
                                  ...prev,
                                  description: "",
                                }));
                              }}
                              rows={4}
                              maxLength={MAX_WARRANTY_DESCRIPTION_LENGTH}
                              aria-invalid={Boolean(fieldErrors.description)}
                              aria-describedby={
                                fieldErrors.description
                                  ? "warranty-description-error"
                                  : undefined
                              }
                              style={getInlineErrorFieldStyle(
                                Boolean(fieldErrors.description),
                              )}
                            />
                            <div className="wchar-count">
                              {description.length}/
                              {MAX_WARRANTY_DESCRIPTION_LENGTH}
                            </div>
                            <InlineFieldError
                              id="warranty-description-error"
                              message={fieldErrors.description}
                            />
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
                              error={fieldErrors.photo}
                              errorId="warranty-photo-error"
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

                                  setFieldErrors((prev) => ({
                                    ...prev,
                                    photo:
                                      "Photo of the issue must be 5 MB or smaller.",
                                  }));
                                  return;
                                }

                                setFormError("");
                                setFieldErrors((prev) => ({
                                  ...prev,
                                  photo: "",
                                }));
                                setPhotoFile(file);
                              }}
                              onClear={() => {
                                setPhotoFile(null);

                                setFieldErrors((prev) => ({
                                  ...prev,
                                  photo: "",
                                }));
                              }}
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
                              error={fieldErrors.proof}
                              errorId="warranty-proof-error"
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

                                  setFieldErrors((prev) => ({
                                    ...prev,
                                    proof:
                                      "Proof of purchase must be 5 MB or smaller.",
                                  }));
                                  return;
                                }

                                setFormError("");
                                setFieldErrors((prev) => ({
                                  ...prev,
                                  proof: "",
                                }));
                                setProofFile(file);
                              }}
                              onClear={() => {
                                setProofFile(null);

                                setFieldErrors((prev) => ({
                                  ...prev,
                                  proof: "",
                                }));
                              }}
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
                    <>
                      <div className="wclaims-list" aria-busy={loadingClaims}>
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

                      {claimsPagination.total > 0 && (
                        <div className="warranty-claims-pagination">
                          <div className="warranty-claims-pagination-summary">
                            Showing{" "}
                            {(claimsPagination.page - 1) *
                              claimsPagination.limit +
                              1}
                            –
                            {Math.min(
                              (claimsPagination.page - 1) *
                                claimsPagination.limit +
                                claims.length,
                              claimsPagination.total,
                            )}{" "}
                            of {claimsPagination.total}
                          </div>

                          <div className="warranty-claims-pagination-controls">
                            <button
                              type="button"
                              disabled={
                                loadingClaims ||
                                !claimsPagination.hasPreviousPage
                              }
                              onClick={() =>
                                void loadClaimsPage(claimsPagination.page - 1)
                              }
                            >
                              Previous
                            </button>

                            <span>
                              Page {claimsPagination.page} of{" "}
                              {Math.max(1, claimsPagination.totalPages)}
                            </span>

                            <button
                              type="button"
                              disabled={
                                loadingClaims || !claimsPagination.hasNextPage
                              }
                              onClick={() =>
                                void loadClaimsPage(claimsPagination.page + 1)
                              }
                            >
                              Next
                            </button>
                          </div>
                        </div>
                      )}
                    </>
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

      {claimFocusFeedback && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="warranty-claim-feedback-title"
          aria-describedby="warranty-claim-feedback-message"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 11000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
            background: "rgba(15, 23, 42, 0.42)",
          }}
          onClick={() => setClaimFocusFeedback(null)}
        >
          <div
            style={{
              width: "100%",
              maxWidth: "420px",
              background: "#ffffff",
              border: "1px solid #d9d9dc",
              borderRadius: 6,
              boxShadow: "0 18px 46px rgba(0,0,0,0.18)",
              padding: "24px",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "12px",
              }}
            >
              <AlertCircle
                size={22}
                strokeWidth={2}
                aria-hidden="true"
                style={{
                  flexShrink: 0,
                  marginTop: 1,
                  color: "#111111",
                }}
              />

              <div>
                <h3
                  id="warranty-claim-feedback-title"
                  style={{
                    margin: 0,
                    color: "#111111",
                    fontSize: "21px",
                    fontWeight: 750,
                    lineHeight: 1.25,
                    letterSpacing: "-0.015em",
                  }}
                >
                  {claimFocusFeedback.title}
                </h3>

                <p
                  id="warranty-claim-feedback-message"
                  style={{
                    margin: "9px 0 0",
                    color: "#66666b",
                    fontSize: "14px",
                    fontWeight: 400,
                    lineHeight: 1.55,
                  }}
                >
                  {claimFocusFeedback.message}
                </p>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginTop: "22px",
              }}
            >
              <button
                type="button"
                onClick={() => setClaimFocusFeedback(null)}
                style={{
                  minWidth: "96px",
                  height: "40px",
                  padding: "0 14px",
                  border: "1px solid #111111",
                  borderRadius: 6,
                  background: "#111111",
                  color: "#ffffff",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: 650,
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
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
