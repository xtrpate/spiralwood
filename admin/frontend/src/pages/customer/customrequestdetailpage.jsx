import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import api, { buildAssetUrl } from "../../services/api";
import CustomerTemplateWorkbench from "./CustomerTemplateWorkbench";
import "./customizepage.css";
import "./customrequestdetailpage.css";

const STATUS_META = {
  contract_released: {
    label: "Contract released",
    color: "#111111",
    bg: "#f3f4f6",
  },
  pending: {
    label: "Pending review",
    color: "#111111",
    bg: "#f8f8f8",
  },
  confirmed: {
    label: "Confirmed",
    color: "#111111",
    bg: "#f3f4f6",
  },
  production: {
    label: "In production",
    color: "#111111",
    bg: "#f3f4f6",
  },
  shipping: {
    label: "Shipping",
    color: "#111111",
    bg: "#f3f4f6",
  },
  delivered: {
    label: "Delivered",
    color: "#111111",
    bg: "#f3f4f6",
  },
  completed: {
    label: "Completed",
    color: "#111111",
    bg: "#f3f4f6",
  },
  cancelled: {
    label: "Cancelled",
    color: "#111111",
    bg: "#f3f4f6",
  },
};

const ESTIMATION_STATUS_META = {
  draft: { label: "Draft", color: "#111111", bg: "#f8f8f8" },
  sent: { label: "Quotation ready", color: "#111111", bg: "#f3f4f6" },
  approved: { label: "Quotation approved", color: "#111111", bg: "#f3f4f6" },
  rejected: { label: "Revision needed", color: "#111111", bg: "#f3f4f6" },
};

const PAY_STATUS_META = {
  unpaid: { label: "Unpaid", color: "#111111", bg: "#f8f8f8" },
  partial: {
    label: "Partially Paid",
    color: "#111111",
    bg: "#f3f4f6",
  },
  paid: { label: "Paid", color: "#111111", bg: "#f3f4f6" },
};

const resolveImageSrc = (src) => {
  const raw = String(src || "").trim();
  if (!raw) return "";

  if (
    raw.startsWith("http://") ||
    raw.startsWith("https://") ||
    raw.startsWith("data:") ||
    raw.startsWith("blob:") ||
    raw.startsWith("/template-previews/") ||
    raw.startsWith("/images/") ||
    raw.startsWith("/assets/") ||
    raw.startsWith("/payments/")
  ) {
    return raw;
  }

  return buildAssetUrl(raw);
};

const resolveAttachmentUrl = (src) => {
  const raw = String(src || "").trim();
  if (!raw) return "";

  if (
    raw.startsWith("http://") ||
    raw.startsWith("https://") ||
    raw.startsWith("data:") ||
    raw.startsWith("blob:") ||
    raw.startsWith("/payments/")
  ) {
    return raw;
  }

  return buildAssetUrl(raw);
};

const formatDate = (value) => {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatMm = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? `${Math.round(n)} mm` : "—";
};

const formatMoney = (value) =>
  "₱" +
  Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const prettifyText = (value, fallback = "Custom furniture") => {
  const raw = String(value || "").trim();
  if (!raw) return fallback;

  return raw
    .replace(/[_-]+/g, " ")
    .replace(/([a-zA-Z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-zA-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

const formatTemplateLabel = (item = {}) => {
  if (item?.template_profile) {
    return `${prettifyText(item.template_profile, "Furniture")} Template`;
  }

  if (item?.template_category) {
    return prettifyText(item.template_category, "Admin blueprint design");
  }

  return "Admin blueprint design";
};

const getDisplayTitle = (item = {}) => {
  return prettifyText(
    item.base_blueprint_title || item.product_name,
    "Custom furniture",
  );
};

const hasEditorSnapshot = (item = {}) =>
  Array.isArray(item?.editor_snapshot?.components) &&
  item.editor_snapshot.components.length > 0;

const getItemDisplayDims = (item = {}) => {
  const components = Array.isArray(item?.editor_snapshot?.components)
    ? item.editor_snapshot.components
    : [];

  if (!components.length) {
    return {
      width: Number(item.width) || 0,
      height: Number(item.height) || 0,
      depth: Number(item.depth) || 0,
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  components.forEach((comp) => {
    const x = Number(comp?.x) || 0;
    const y = Number(comp?.y) || 0;
    const z = Number(comp?.z) || 0;
    const w = Math.max(0, Number(comp?.width) || 0);
    const h = Math.max(0, Number(comp?.height) || 0);
    const d = Math.max(0, Number(comp?.depth) || 0);

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);

    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
    maxZ = Math.max(maxZ, z + d);
  });

  return {
    width: Math.round(maxX - minX) || Number(item.width) || 0,
    height: Math.round(maxY - minY) || Number(item.height) || 0,
    depth: Math.round(maxZ - minZ) || Number(item.depth) || 0,
  };
};

const buildPreviewBlueprint = (item = {}) => {
  const components = Array.isArray(item?.editor_snapshot?.components)
    ? item.editor_snapshot.components
    : [];

  const worldSize =
    item?.editor_snapshot?.worldSize &&
    typeof item.editor_snapshot.worldSize === "object"
      ? item.editor_snapshot.worldSize
      : { w: 6400, h: 3200, d: 5200 };

  const dims = getItemDisplayDims(item);

  return {
    id: item.blueprint_id || item.product_id || item.id,
    title: getDisplayTitle(item),
    thumbnail_url: item.image_url || item.preview_image_url || "",
    preview_image_url: item.preview_image_url || item.image_url || "",
    default_dimensions: {
      width_mm: dims.width,
      height_mm: dims.height,
      depth_mm: dims.depth,
    },
    bounds: {
      width: dims.width,
      height: dims.height,
      depth: dims.depth,
    },
    design_data: {
      components,
      worldSize,
      bounds: {
        width: dims.width,
        height: dims.height,
        depth: dims.depth,
      },
    },
    view_3d_data: {
      components,
      worldSize,
      bounds: {
        width: dims.width,
        height: dims.height,
        depth: dims.depth,
      },
    },
    metadata: {
      wood_type: item.wood_type || "",
      finish_color: item.finish_color || item.color || "",
      door_style: item.door_style || "",
      hardware: item.hardware || "",
    },
  };
};

const isImageAttachment = (attachment = {}) => {
  const mime = String(attachment?.mime_type || "").toLowerCase();
  const url = String(attachment?.file_url || "").toLowerCase();

  return mime.startsWith("image/") || /\.(jpg|jpeg|png|webp)$/i.test(url);
};

const getSenderMeta = (entry = {}) => {
  const role = String(entry?.sender_role || "")
    .trim()
    .toLowerCase();

  if (role === "admin") {
    return {
      label: entry?.sender_name || "Admin",
      roleClass: "is-admin",
    };
  }

  if (role === "staff") {
    return {
      label: entry?.sender_name || "Staff",
      roleClass: "is-staff",
    };
  }

  if (role === "system") {
    return {
      label: "System",
      roleClass: "is-system",
    };
  }

  return {
    label: entry?.sender_name || "You",
    roleClass: "is-you",
  };
};

const DetailValue = ({ label, children }) => (
  <div className="summary-row">
    <span>{label}</span>
    <strong>{children}</strong>
  </div>
);

export default function CustomRequestDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();

  const [requestData, setRequestData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [previewItem, setPreviewItem] = useState(null);
  const [decisionLoading, setDecisionLoading] = useState("");

  const [discussionMessage, setDiscussionMessage] = useState("");
  const [discussionFiles, setDiscussionFiles] = useState([]);
  const [discussionSubmitting, setDiscussionSubmitting] = useState(false);
  const [selectingMethod, setSelectingMethod] = useState(false);
  const [selectionError, setSelectionError] = useState("");

  const loadRequestDetail = useCallback(
    async (showLoader = true) => {
      if (showLoader) setLoading(true);
      setError("");

      try {
        const res = await api.get(`/customer/custom-orders/${id}`);
        setRequestData(res.data);
      } catch (err) {
        setError(
          err.response?.data?.message ||
            err.response?.data?.error ||
            "Failed to load request details.",
        );
      } finally {
        if (showLoader) setLoading(false);
      }
    },
    [id],
  );

  useEffect(() => {
    const verifyPayment = async () => {
      const params = new URLSearchParams(window.location.search);

      if (params.get("verify_success") !== "true") {
        loadRequestDetail(true);
        return;
      }

      let isSuccess = false;

      try {
        const res = await api.post(
          `/customer/custom-orders/${id}/verify-payment`,
        );

        // 👉 FIX: Strictly check the boolean sent by the backend
        if (res.data && res.data.success === false) {
          toast.error(res.data.message || "Payment is still processing.");
        } else {
          toast.success(res.data.message || "Payment verified successfully.");
          isSuccess = true;
        }
      } catch (err) {
        toast.error(err.response?.data?.message || "Unable to verify payment.");
      } finally {
        // 👉 FIX: Only delete the URL trigger if it actually worked!
        if (isSuccess) {
          params.delete("verify_success");
          const url =
            window.location.pathname +
            (params.toString() ? `?${params.toString()}` : "");
          window.history.replaceState({}, "", url);
        }
        await loadRequestDetail(true);
      }
    };

    verifyPayment();
  }, [id, loadRequestDetail]);

  const statusMeta = useMemo(
    () =>
      STATUS_META[requestData?.status] || {
        label: prettifyText(requestData?.status, "Unknown"),
        color: "#111111",
        bg: "#f3f4f6",
      },
    [requestData],
  );

  const payMeta = useMemo(
    () =>
      PAY_STATUS_META[requestData?.payment_status] || {
        label: prettifyText(requestData?.payment_status, "Unknown"),
        color: "#111111",
        bg: "#f3f4f6",
      },
    [requestData],
  );

  const PAYMENT_METHOD_LABELS = {
    paymongo: "Online Payment",
    cash: "Cash at Store",
    gcash: "GCash",
    bank_transfer: "Bank Transfer",
    cod: "Cash on Delivery",
    cop: "Cash on Pick-up",
  };

  const normalizedOrderPaymentMethod = String(
    requestData?.payment_method || "",
  )
    .trim()
    .toLowerCase();

  const isKnownPaymentMethod = ["cash", "paymongo"].includes(
    normalizedOrderPaymentMethod,
  );
  const isHistoricalUnsupportedMethod =
    Boolean(normalizedOrderPaymentMethod) && !isKnownPaymentMethod;

  const displayPaymentMethod = normalizedOrderPaymentMethod
    ? PAYMENT_METHOD_LABELS[normalizedOrderPaymentMethod] ||
      prettifyText(normalizedOrderPaymentMethod, "Unknown")
    : "Not selected yet";

  const latestEstimation = requestData?.latest_estimation || null;

  // Backend quotation-state fields — source of truth for whether a
  // quotation is safe to display/act on. Never inferred from
  // latestEstimation.status alone, since a lifecycle-blocked order
  // always has latest_estimation = null from the backend regardless of
  // what a stale record's own status field might have said.
  const quotationAvailable = Boolean(requestData?.quotation_available);
  const quotationActionBlocked = Boolean(requestData?.quotation_action_blocked);
  const quotationIntegrityWarning = Boolean(
    requestData?.quotation_integrity_warning,
  );
  const quotationMessage = requestData?.quotation_message || null;

  const orderStatusKey = String(requestData?.status || "")
    .trim()
    .toLowerCase();

  const estimationMeta = useMemo(() => {
    const statusKey = String(latestEstimation?.status || "")
      .trim()
      .toLowerCase();

    return (
      ESTIMATION_STATUS_META[statusKey] || {
        label: prettifyText(statusKey, "No quotation yet"),
        color: "#111111",
        bg: "#f3f4f6",
      }
    );
  }, [latestEstimation]);

  // payment_summary is always an object (never null) so every downstream
  // read below can use plain dot access without repeating `?.` — the
  // backend already sends `{}`-shaped defaults when there's nothing to
  // report.
  const paymentSummary = requestData?.payment_summary || {};

  // Lifecycle-safe fallback chain — order.total is NEVER used here. When
  // the backend deliberately blocks/hides a quotation it returns
  // quoted_total: 0, and 0 is the correct, meaningful value to show in
  // that case (not a stale order.total that could itself be corrupted).
  const quotedTotal = Number(
    paymentSummary.quoted_total ?? latestEstimation?.grand_total ?? 0,
  );

  // Every payment-summary value and action below comes from the backend's
  // lifecycle-safe response. The write endpoints still revalidate all
  // ownership, lifecycle, stage, payment, and amount rules under lock.
  const downPaymentDue = Number(paymentSummary.down_payment_due ?? 0);
  const balanceDue = Number(paymentSummary.balance_due ?? 0);
  const verifiedPaymentTotal = Number(paymentSummary.total_verified ?? 0);
  const latestPayment = paymentSummary.latest_transaction || null;
  const paymentMethodChangeLocked = Boolean(
    paymentSummary.payment_method_change_locked,
  );
  const hasPendingPaymentTransaction =
    Number(paymentSummary.total_pending || 0) > 0;
  const canChooseMethod =
    requestData?.payment_status === "unpaid" &&
    Number(verifiedPaymentTotal || 0) <= 0 &&
    !hasPendingPaymentTransaction &&
    !paymentMethodChangeLocked;
  const estimationStatusKey = String(latestEstimation?.status || "")
    .trim()
    .toLowerCase();

  // Quotation action buttons (approve / request revision / reject) may
  // appear only when every one of these is true — mirrored exactly
  // inside handleEstimationDecision before the request is actually sent,
  // since a hidden/disabled button here is only UX protection and the
  // backend remains the real security boundary.
  const canDecideOnQuote =
    quotationAvailable &&
    !quotationActionBlocked &&
    !quotationIntegrityWarning &&
    Boolean(latestEstimation) &&
    estimationStatusKey === "sent" &&
    orderStatusKey === "confirmed";

  const previewBlueprint = useMemo(
    () => (previewItem ? buildPreviewBlueprint(previewItem) : null),
    [previewItem],
  );

  const discussionThread = useMemo(
    () =>
      Array.isArray(requestData?.discussion) ? requestData.discussion : [],
    [requestData],
  );

  const handleEstimationDecision = async (action) => {
    if (!requestData?.id || !latestEstimation?.id) return;

    // Same checks used to decide whether the buttons are even shown — a
    // hidden/disabled button is only UX protection, so this is checked
    // again here rather than trusted from the render alone.
    if (!canDecideOnQuote) {
      toast.error(
        "This quotation can no longer be acted on. Please refresh the page.",
      );
      return;
    }

    let endpoint = "";
    let payload = {};
    let successMessage = "";

    if (action === "accept") {
      endpoint = `/customer/custom-orders/${requestData.id}/estimate/accept`;
      successMessage = "Quotation approved successfully.";
    }

    if (action === "request-revision") {
      const note = window.prompt("Enter your revision note:", "");
      if (note === null) return;

      endpoint = `/customer/custom-orders/${requestData.id}/estimate/request-revision`;
      payload = { note: String(note || "").trim() };
      successMessage = "Revision request sent successfully.";
    }

    if (action === "reject") {
      const reason = window.prompt("Enter your reason for rejection:", "");
      if (reason === null) return;

      endpoint = `/customer/custom-orders/${requestData.id}/estimate/reject`;
      payload = { reason: String(reason || "").trim() };
      successMessage = "Quotation rejected successfully.";
    }

    if (!endpoint) return;

    setDecisionLoading(action);
    try {
      await api.post(endpoint, payload);
      await loadRequestDetail(false);
      toast.success(successMessage);
    } catch (err) {
      toast.error(
        err.response?.data?.message ||
          err.response?.data?.error ||
          "Failed to process quotation decision.",
      );
    } finally {
      setDecisionLoading("");
    }
  };

  const handleDiscussionFilesChange = (e) => {
    const picked = Array.from(e.target.files || []);
    setDiscussionFiles((prev) => [...prev, ...picked].slice(0, 5));
    e.target.value = "";
  };

  const handleRemoveDiscussionFile = (index) => {
    setDiscussionFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSendDiscussionMessage = async (e) => {
    e.preventDefault();

    if (!requestData?.id) return;

    if (!discussionMessage.trim() && !discussionFiles.length) {
      toast.error("Write a message or upload at least one attachment.");
      return;
    }

    const formData = new FormData();
    formData.append("message", discussionMessage.trim());

    discussionFiles.forEach((file) => {
      formData.append("attachments", file);
    });

    setDiscussionSubmitting(true);
    try {
      await api.post(
        `/customer/custom-orders/${requestData.id}/messages`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        },
      );

      setDiscussionMessage("");
      setDiscussionFiles([]);
      await loadRequestDetail(false);
      toast.success("Message sent successfully.");
    } catch (err) {
      toast.error(
        err.response?.data?.message ||
          err.response?.data?.error ||
          "Failed to send message.",
      );
    } finally {
      setDiscussionSubmitting(false);
    }
  };

  const handlePayNow = async () => {
    if (!requestData?.id) return;

    try {
      const res = await api.post(
        `/customer/custom-orders/${requestData.id}/pay`,
      );

      if (!res.data?.payment_url) {
        toast.error("Unable to launch PayMongo checkout.");
        return;
      }

      window.location.href = res.data.payment_url;
    } catch (err) {
      console.error(err);

      toast.error(
        err.response?.data?.message ||
          err.response?.data?.error ||
          "Failed to launch PayMongo checkout.",
      );
    }
  };

  const handleSelectPaymentMethod = async (method) => {
    if (selectingMethod) return;

    setSelectingMethod(true);
    setSelectionError("");

    try {
      await api.post(
        `/customer/custom-orders/${requestData.id}/payment-method`,
        { payment_method: method },
      );
      await loadRequestDetail(false);
    } catch (err) {
      setSelectionError(
        err.response?.data?.message ||
          err.response?.data?.error ||
          "Failed to update payment method.",
      );
    } finally {
      setSelectingMethod(false);
    }
  };

  return (
    <div className="crd-page">
      <div className="page-hero">
        <div>
          <h1>Request details</h1>
          <p>Review your submitted request and current status.</p>
        </div>

        <div className="crd-top-actions">
          <button
            className="btn btn-secondary"
            onClick={() => navigate("/orders")}
          >
            Back to orders
          </button>

          <Link to="/customize" className="btn btn-primary">
            New request
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="checkout-section">
          <div className="checkout-section-body">
            <p>Loading request details…</p>
          </div>
        </div>
      ) : error ? (
        <div className="checkout-section">
          <div className="checkout-section-body">
            <div className="alert alert-error">{error}</div>
          </div>
        </div>
      ) : !requestData ? (
        <div className="checkout-section">
          <div className="checkout-section-body">
            <p>Request not found.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="checkout-layout crd-layout">
            <div className="checkout-form-panel">
              <div className="checkout-section">
                <div className="checkout-section-header">
                  <div className="checkout-section-num">01</div>
                  <h3>Request overview</h3>
                </div>

                <div className="checkout-section-body">
                  <div
                    className="crd-overview-grid"
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(280px, 1fr))",
                      gap: "24px",
                    }}
                  >
                    <DetailValue label="Request number">
                      {requestData.order_number || "—"}
                    </DetailValue>

                    <DetailValue label="Submitted on">
                      {formatDate(requestData.created_at)}
                    </DetailValue>

                    <div className="summary-row">
                      <span>Status</span>
                      <span
                        className="crd-status-pill"
                        style={{
                          background: statusMeta.bg,
                          color: statusMeta.color,
                        }}
                      >
                        {statusMeta.label}
                      </span>
                    </div>

                    <div className="summary-row">
                      <span>Payment status</span>
                      <span
                        className="crd-status-pill"
                        style={{
                          background: payMeta.bg,
                          color: payMeta.color,
                        }}
                      >
                        {payMeta.label}
                      </span>
                    </div>

                    <DetailValue label="Payment method">
                      {displayPaymentMethod}
                    </DetailValue>

                    <DetailValue label="Quoted total">
                      {quotedTotal > 0
                        ? formatMoney(quotedTotal)
                        : "To be quoted by admin"}
                    </DetailValue>
                  </div>
                </div>
              </div>

              {latestEstimation ? (
                <div className="checkout-section">
                  <div className="checkout-section-header">
                    <div className="checkout-section-num">02</div>
                    <h3>Quotation breakdown</h3>

                    <span
                      className="crd-status-pill"
                      style={{
                        marginLeft: "auto",
                        background: estimationMeta.bg,
                        color: estimationMeta.color,
                      }}
                    >
                      {estimationMeta.label}
                    </span>
                  </div>

                  <div className="checkout-section-body">
                    <div className="crd-table">
                      <div className="crd-table-head">
                        <div>Description</div>
                        <div>Qty</div>
                        <div>Rate</div>
                        <div>Amount</div>
                      </div>

                      {(latestEstimation.items || []).length ? (
                        latestEstimation.items.map((item) => (
                          <div key={item.id} className="crd-table-row">
                            <div className="crd-table-desc">
                              {item.description || "Material item"}
                            </div>
                            <div>{item.quantity || 0}</div>
                            <div>{formatMoney(item.unit_cost || 0)}</div>
                            <div className="crd-table-amount">
                              {formatMoney(item.subtotal || 0)}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="crd-table-empty">
                          No quotation line items available yet.
                        </div>
                      )}
                    </div>

                    <div className="crd-grid-split">
                      <div className="crd-panel">
                        <h4>Admin notes</h4>

                        {String(latestEstimation.notes || "").trim() ? (
                          <div className="crd-panel-copy">
                            {latestEstimation.notes}
                          </div>
                        ) : (
                          <div className="crd-panel-copy muted">
                            No admin notes were attached to this quotation.
                          </div>
                        )}

                        {canDecideOnQuote ? (
                          <div className="crd-action-row">
                            <button
                              type="button"
                              className="btn btn-primary"
                              disabled={decisionLoading === "accept"}
                              onClick={() => handleEstimationDecision("accept")}
                            >
                              {decisionLoading === "accept"
                                ? "Approving..."
                                : "Approve quotation"}
                            </button>

                            <button
                              type="button"
                              className="btn btn-secondary"
                              disabled={decisionLoading === "request-revision"}
                              onClick={() =>
                                handleEstimationDecision("request-revision")
                              }
                            >
                              {decisionLoading === "request-revision"
                                ? "Sending..."
                                : "Request revision"}
                            </button>

                            <button
                              type="button"
                              className="crd-danger-btn"
                              disabled={decisionLoading === "reject"}
                              onClick={() => handleEstimationDecision("reject")}
                            >
                              {decisionLoading === "reject"
                                ? "Rejecting..."
                                : "Reject quotation"}
                            </button>
                          </div>
                        ) : null}
                      </div>

                      <div className="crd-panel crd-panel-soft">
                        <h4>Quotation summary</h4>

                        <DetailValue label="Materials">
                          {formatMoney(latestEstimation.material_cost || 0)}
                        </DetailValue>

                        <DetailValue label="Labor">
                          {formatMoney(latestEstimation.labor_cost || 0)}
                        </DetailValue>

                        <DetailValue label="Logistics">
                          {formatMoney(latestEstimation.overhead_cost || 0)}
                        </DetailValue>

                        <DetailValue label="Discount">
                          {formatMoney(latestEstimation.discount || 0)}
                        </DetailValue>

                        <DetailValue label="VAT">
                          {formatMoney(latestEstimation.tax || 0)}
                        </DetailValue>

                        <DetailValue label="Subtotal">
                          {formatMoney(latestEstimation.subtotal || 0)}
                        </DetailValue>

                        <div className="summary-row crd-grand-total">
                          <span>Grand total</span>
                          <strong>
                            {formatMoney(latestEstimation.grand_total || 0)}
                          </strong>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : quotationMessage ? (
                <div className="checkout-section">
                  <div className="checkout-section-header">
                    <div className="checkout-section-num">02</div>
                    <h3>Quotation status</h3>
                  </div>

                  <div className="checkout-section-body">
                    <div
                      className={
                        quotationActionBlocked || quotationIntegrityWarning
                          ? "crd-info-box pending"
                          : "crd-info-box muted"
                      }
                    >
                      {quotationMessage}
                    </div>
                  </div>
                </div>
              ) : null}

              {quotationAvailable &&
              latestEstimation &&
              !quotationActionBlocked &&
              !quotationIntegrityWarning &&
              estimationStatusKey === "approved" ? (
                <div className="checkout-section">
                  <div className="checkout-section-header">
                    <div className="checkout-section-num">03</div>
                    <h3>Payment</h3>
                  </div>

                  <div className="checkout-section-body">
                    <div className="crd-grid-split">
                      <div className="crd-panel crd-panel-soft">
                        <h4>Payment Summary</h4>

                        <DetailValue label="Quoted total">
                          {formatMoney(quotedTotal || 0)}
                        </DetailValue>

                        <DetailValue label="30% Down Payment">
                          {formatMoney(downPaymentDue || 0)}
                        </DetailValue>

                        <DetailValue label="Amount Paid">
                          {formatMoney(verifiedPaymentTotal || 0)}
                        </DetailValue>

                        <DetailValue label="Remaining Balance">
                          {formatMoney(balanceDue || 0)}
                        </DetailValue>

                        <p className="crd-panel-copy muted">
                          {requestData.payment_status === "partial" ||
                          requestData.payment_status === "paid"
                            ? "Your verified payments are reflected below. Contact us if you have questions about this order's payment history."
                            : hasPendingPaymentTransaction
                              ? "A payment is currently awaiting verification for this order."
                              : isHistoricalUnsupportedMethod
                                ? "A supported payment method must be selected before continuing."
                                : normalizedOrderPaymentMethod === "cash"
                                  ? "Your payment will remain unpaid until the 30% cash down payment is received and verified at the Spiral Wood store."
                                  : normalizedOrderPaymentMethod === "paymongo"
                                    ? "Payments are securely processed online. Once your payment is completed, your payment status will automatically update without requiring manual verification."
                                    : "Choose Cash at Store or Online Payment to continue with the required 30% down payment."}
                        </p>

                        {latestPayment ? (
                          <div className="crd-info-box">
                            <div className="crd-info-title">
                              Latest Transaction
                            </div>

                            <div>
                              <strong>Status:</strong>{" "}
                              {prettifyText(latestPayment.status)}
                            </div>

                            <div>
                              <strong>Amount Paid:</strong>{" "}
                              {formatMoney(latestPayment.amount || 0)}
                            </div>

                            <div>
                              <strong>Payment Method:</strong>{" "}
                              {latestPayment.payment_method
                                ? PAYMENT_METHOD_LABELS[
                                    String(latestPayment.payment_method)
                                      .trim()
                                      .toLowerCase()
                                  ] ||
                                  prettifyText(
                                    latestPayment.payment_method,
                                    "Unknown",
                                  )
                                : "No payment recorded yet"}
                            </div>

                            <div>
                              <strong>Paid On:</strong>{" "}
                              {formatDate(latestPayment.created_at)}
                            </div>
                          </div>
                        ) : null}
                      </div>

                      {selectionError ? (
                        <div
                          className="crd-info-box pending"
                          style={{ gridColumn: "1 / -1" }}
                        >
                          {selectionError}
                        </div>
                      ) : null}

                      {requestData.payment_status === "partial" ||
                      requestData.payment_status === "paid" ? (
                        <div className="crd-panel">
                          <h4>Payment Method</h4>
                          <div
                            className="crd-info-box"
                            style={{ marginTop: 0 }}
                          >
                            <div className="crd-info-title">
                              {displayPaymentMethod}
                            </div>
                            <p style={{ margin: "8px 0 0" }}>
                              The payment method for this order can no
                              longer be changed.
                            </p>
                          </div>
                        </div>
                      ) : hasPendingPaymentTransaction ? (
                        <div className="crd-panel">
                          <h4>Payment Method</h4>
                          <div
                            className="crd-info-box pending"
                            style={{ marginTop: 0 }}
                          >
                            <div className="crd-info-title">
                              {displayPaymentMethod}
                            </div>
                            <p style={{ margin: "8px 0 0" }}>
                              A payment is currently awaiting verification for
                              this order. Your payment method cannot be
                              changed while a payment is pending review.
                            </p>
                          </div>
                        </div>
                      ) : !normalizedOrderPaymentMethod ? (
                        canChooseMethod ? (
                          <div className="crd-panel">
                            <h4>Choose a Payment Method</h4>

                            <div className="crd-grid-split">
                              <div className="crd-panel crd-panel-soft">
                                <h4>Cash at Store</h4>
                                <p className="crd-panel-copy muted">
                                  Pay the required 30% down payment at the
                                  Spiral Wood physical store.
                                </p>
                                <div className="summary-row">
                                  <span>30% Down Payment</span>
                                  <strong>
                                    {formatMoney(downPaymentDue)}
                                  </strong>
                                </div>
                                <button
                                  type="button"
                                  className="btn btn-primary"
                                  disabled={selectingMethod}
                                  onClick={() =>
                                    handleSelectPaymentMethod("cash")
                                  }
                                >
                                  Choose Cash at Store
                                </button>
                              </div>

                              <div className="crd-panel crd-panel-soft">
                                <h4>Online Payment</h4>
                                <p className="crd-panel-copy muted">
                                  Pay securely via GCash, Maya, Online
                                  Banking, or Credit/Debit Card.
                                </p>
                                <div className="summary-row">
                                  <span>30% Down Payment</span>
                                  <strong>
                                    {formatMoney(downPaymentDue)}
                                  </strong>
                                </div>
                                <button
                                  type="button"
                                  className="btn btn-primary"
                                  disabled={selectingMethod}
                                  onClick={() =>
                                    handleSelectPaymentMethod("paymongo")
                                  }
                                >
                                  Choose Online Payment
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="crd-panel">
                            <h4>Payment Method</h4>
                            <div
                              className="crd-info-box pending"
                              style={{ marginTop: 0 }}
                            >
                              <div className="crd-info-title">
                                Not selected yet
                              </div>
                              <p style={{ margin: "8px 0 0" }}>
                                Payment method selection is currently
                                unavailable for this order.
                              </p>
                            </div>
                          </div>
                        )
                      ) : normalizedOrderPaymentMethod === "cash" ? (
                        <div className="crd-panel">
                          <h4>Cash at Store</h4>

                          <div
                            className="crd-info-box"
                            style={{ marginTop: 0 }}
                          >
                            <div className="crd-info-title">
                              Your quotation has been approved.
                            </div>
                            <p style={{ margin: "8px 0 0" }}>
                              Pay the required{" "}
                              <strong>30% down payment</strong> at the Spiral
                              Wood physical store.
                            </p>
                          </div>

                          <div className="crd-payment-breakdown">
                            <div className="summary-row">
                              <span>Quoted Total</span>
                              <strong>{formatMoney(quotedTotal)}</strong>
                            </div>
                            <div className="summary-row">
                              <span>30% Down Payment</span>
                              <strong>{formatMoney(downPaymentDue)}</strong>
                            </div>
                          </div>

                          {canChooseMethod ? (
                            <button
                              type="button"
                              className="btn btn-secondary crd-small-btn"
                              disabled={selectingMethod}
                              onClick={() =>
                                handleSelectPaymentMethod("paymongo")
                              }
                            >
                              Change to Online Payment
                            </button>
                          ) : null}
                        </div>
                      ) : normalizedOrderPaymentMethod === "paymongo" ? (
                        <div className="crd-panel">
                          <h4>Secure Online Payment</h4>

                          <div
                            className="crd-info-box"
                            style={{ marginTop: 0 }}
                          >
                            <div className="crd-info-title">
                              Your quotation has been approved and is ready
                              for payment.
                            </div>

                            <p style={{ margin: "8px 0 0" }}>
                              To continue with production, please complete
                              the required
                              <strong> 30% down payment </strong>
                              using our secure PayMongo payment gateway.
                            </p>

                            <p style={{ margin: "12px 0 0" }}>
                              Supported payment methods:
                            </p>

                            <ul className="crd-payment-method-list">
                              <li>GCash</li>
                              <li>Maya</li>
                              <li>Online Banking</li>
                              <li>Credit / Debit Card</li>
                            </ul>
                          </div>

                          <div className="crd-payment-breakdown">
                            <div className="summary-row">
                              <span>Quoted Total</span>
                              <strong>{formatMoney(quotedTotal)}</strong>
                            </div>

                            <div className="summary-row">
                              <span>30% Down Payment</span>
                              <strong>{formatMoney(downPaymentDue)}</strong>
                            </div>

                            <div className="summary-row">
                              <span>Amount Paid</span>
                              <strong>
                                {formatMoney(verifiedPaymentTotal)}
                              </strong>
                            </div>

                            <div className="summary-row">
                              <span>Remaining Balance</span>
                              <strong>{formatMoney(balanceDue)}</strong>
                            </div>
                          </div>

                          <button
                            type="button"
                            className="btn btn-primary crd-paymongo-btn"
                            disabled={
                              normalizedOrderPaymentMethod !== "paymongo" ||
                              requestData.payment_status !== "unpaid" ||
                              Number(verifiedPaymentTotal || 0) > 0 ||
                              Number(paymentSummary.total_pending || 0) > 0 ||
                              downPaymentDue <= 0
                            }
                            onClick={handlePayNow}
                          >
                            <div>Pay 30% Down Payment</div>
                            <strong>{formatMoney(downPaymentDue)}</strong>
                          </button>

                          <div className="crd-help-text">
                            You will be redirected to our secure checkout
                            page to complete your payment.
                          </div>

                          {canChooseMethod ? (
                            <button
                              type="button"
                              className="btn btn-secondary crd-small-btn"
                              disabled={selectingMethod}
                              onClick={() =>
                                handleSelectPaymentMethod("cash")
                              }
                            >
                              Change to Cash at Store
                            </button>
                          ) : null}
                        </div>
                      ) : (
                        <div className="crd-panel">
                          <h4>Payment Method</h4>
                          <div
                            className="crd-info-box pending"
                            style={{ marginTop: 0 }}
                          >
                            <div className="crd-info-title">
                              {displayPaymentMethod}
                            </div>
                            <p style={{ margin: "8px 0 0" }}>
                              A supported payment method must be selected to
                              continue.
                            </p>
                          </div>

                          {canChooseMethod ? (
                            <div
                              className="crd-grid-split"
                              style={{ marginTop: 16 }}
                            >
                              <div className="crd-panel crd-panel-soft">
                                <h4>Cash at Store</h4>
                                <button
                                  type="button"
                                  className="btn btn-primary"
                                  disabled={selectingMethod}
                                  onClick={() =>
                                    handleSelectPaymentMethod("cash")
                                  }
                                >
                                  Choose Cash at Store
                                </button>
                              </div>
                              <div className="crd-panel crd-panel-soft">
                                <h4>Online Payment</h4>
                                <button
                                  type="button"
                                  className="btn btn-primary"
                                  disabled={selectingMethod}
                                  onClick={() =>
                                    handleSelectPaymentMethod("paymongo")
                                  }
                                >
                                  Choose Online Payment
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="checkout-section">
                <div className="checkout-section-header">
                  <div className="checkout-section-num">04</div>
                  <h3>Submitted items</h3>

                  <span className="crd-mini-meta">
                    {requestData.total_items || 0} design
                    {(requestData.total_items || 0) !== 1 ? "s" : ""} •{" "}
                    {requestData.total_units || 0} unit
                    {(requestData.total_units || 0) !== 1 ? "s" : ""}
                  </span>
                </div>

                <div className="checkout-items-preview">
                  {(requestData.items || []).map((item) => {
                    const dims = getItemDisplayDims(item);
                    const canPreview = hasEditorSnapshot(item);

                    return (
                      <div key={item.id} className="checkout-item-row">
                        <div className="checkout-item-thumb">
                          {item.image_url || item.preview_image_url ? (
                            <img
                              src={resolveImageSrc(
                                item.image_url || item.preview_image_url,
                              )}
                              alt={getDisplayTitle(item)}
                              className="crd-thumb-img"
                              onError={(e) => {
                                e.target.style.display = "none";
                                if (e.target.nextSibling) {
                                  e.target.nextSibling.style.display = "flex";
                                }
                              }}
                            />
                          ) : null}

                          <div
                            className="crd-thumb-fallback"
                            style={{
                              display:
                                item.image_url || item.preview_image_url
                                  ? "none"
                                  : "flex",
                            }}
                          >
                            Item
                          </div>
                        </div>

                        <div className="checkout-item-details">
                          <div
                            className="crd-item-head"
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "flex-start",
                              width: "100%",
                            }}
                          >
                            <div style={{ paddingRight: "16px" }}>
                              <div className="checkout-item-name">
                                {getDisplayTitle(item)}
                              </div>

                              <div className="crd-item-subtitle">
                                {formatTemplateLabel(item)} • Submitted draft
                              </div>
                            </div>

                            {canPreview ? (
                              <button
                                type="button"
                                className="btn btn-secondary crd-small-btn"
                                onClick={() => setPreviewItem(item)}
                              >
                                View design
                              </button>
                            ) : null}
                          </div>

                          <div className="custom-cart-specs crd-tag-wrap">
                            {item.wood_type && (
                              <span className="custom-spec-tag">
                                {prettifyText(item.wood_type, item.wood_type)}
                              </span>
                            )}

                            {(item.finish_color || item.color) && (
                              <span className="custom-spec-tag">
                                {prettifyText(
                                  item.finish_color || item.color,
                                  item.finish_color || item.color,
                                )}
                              </span>
                            )}

                            {item.door_style && (
                              <span className="custom-spec-tag">
                                {prettifyText(item.door_style, item.door_style)}
                              </span>
                            )}

                            {item.hardware && (
                              <span className="custom-spec-tag">
                                {prettifyText(item.hardware, item.hardware)}
                              </span>
                            )}

                            {(dims.width || dims.height || dims.depth) && (
                              <span className="custom-spec-tag">
                                W {formatMm(dims.width)} • H{" "}
                                {formatMm(dims.height)} • D{" "}
                                {formatMm(dims.depth)}
                              </span>
                            )}
                          </div>

                          {item.comments ? (
                            <div
                              className="checkout-item-sub"
                              style={{ marginTop: 6 }}
                            >
                              {item.comments}
                            </div>
                          ) : null}

                          {Array.isArray(item.reference_photos) &&
                          item.reference_photos.length ? (
                            <div className="crd-ref-wrap">
                              <div className="crd-field-label">
                                Reference photos
                              </div>

                              <div className="crd-ref-grid">
                                {item.reference_photos.map((photo) => (
                                  <a
                                    key={photo.id}
                                    href={resolveAttachmentUrl(photo.file_url)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="crd-ref-photo"
                                  >
                                    <img
                                      src={resolveAttachmentUrl(photo.file_url)}
                                      alt={photo.file_name || "Reference photo"}
                                    />
                                  </a>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>

                        <div className="checkout-item-qty">
                          ×{item.quantity || 1}
                        </div>

                        <div className="checkout-item-price crd-quote-note">
                          Quote needed
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="checkout-section">
                <div className="checkout-section-header">
                  <div className="checkout-section-num">05</div>
                  <h3>Project details</h3>
                </div>

                <div className="checkout-section-body">
                  <div className="crd-form-grid">
                    <div>
                      <label className="crd-field-label">
                        Delivery address
                      </label>
                      <div className="crd-read-box">
                        {requestData.delivery_address ||
                          "No delivery address provided."}
                      </div>
                    </div>

                    <div>
                      <label className="crd-field-label">Customer notes</label>

                      {String(requestData.notes || "").trim() ? (
                        <div className="crd-read-box crd-read-box-copy">
                          {requestData.notes}
                        </div>
                      ) : (
                        <div className="crd-read-box muted">
                          No additional notes were submitted for this request.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="checkout-section">
                <div className="checkout-section-header">
                  <div className="checkout-section-num">06</div>
                  <h3>Chat</h3>
                </div>

                <div className="checkout-section-body">
                  <div className="crd-chat-wrap">
                    <div className="crd-chat-card">
                      <div className="crd-chat-card-head">Chat history</div>

                      <div className="crd-chat-thread">
                        {!discussionThread.length ? (
                          <div className="crd-chat-empty">
                            No messages yet. You can send a message below.
                          </div>
                        ) : (
                          discussionThread.map((entry) => {
                            const sender = getSenderMeta(entry);

                            return (
                              <div
                                key={entry.id}
                                className={`crd-chat-entry ${sender.roleClass}`}
                              >
                                <div className="crd-chat-entry-top">
                                  <div className="crd-chat-sender">
                                    {sender.label}
                                  </div>

                                  <div className="crd-chat-date">
                                    {formatDate(entry.created_at)}
                                  </div>
                                </div>

                                {entry.message ? (
                                  <div className="crd-chat-message">
                                    {entry.message}
                                  </div>
                                ) : null}

                                {Array.isArray(entry.attachments) &&
                                entry.attachments.length ? (
                                  <div className="crd-chat-attachments">
                                    {entry.attachments.map((attachment) => {
                                      const href = resolveAttachmentUrl(
                                        attachment.file_url,
                                      );

                                      return isImageAttachment(attachment) ? (
                                        <a
                                          key={attachment.id}
                                          href={href}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="crd-attachment-thumb"
                                        >
                                          <img
                                            src={href}
                                            alt={
                                              attachment.file_name ||
                                              "Attachment"
                                            }
                                          />
                                        </a>
                                      ) : (
                                        <a
                                          key={attachment.id}
                                          href={href}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="crd-attachment-file"
                                        >
                                          <div className="crd-attachment-name">
                                            {attachment.file_name ||
                                              "Attachment"}
                                          </div>
                                          <div className="crd-attachment-open">
                                            Open attachment
                                          </div>
                                        </a>
                                      );
                                    })}
                                  </div>
                                ) : null}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>

                    <form
                      onSubmit={handleSendDiscussionMessage}
                      className="crd-chat-form"
                    >
                      <div className="crd-chat-form-title">Send message</div>

                      <textarea
                        rows={4}
                        value={discussionMessage}
                        onChange={(e) => setDiscussionMessage(e.target.value)}
                        placeholder="Write your clarification, concern, or request update here."
                        className="crd-control crd-textarea"
                      />

                      <div>
                        <label className="crd-field-label">Attachments</label>

                        <input
                          type="file"
                          multiple
                          accept=".jpg,.jpeg,.png,.webp,.pdf"
                          onChange={handleDiscussionFilesChange}
                          className="crd-file-input"
                        />

                        <div className="crd-help-text">
                          You may upload up to 5 attachments per message.
                        </div>
                      </div>

                      {discussionFiles.length ? (
                        <div className="crd-file-list">
                          {discussionFiles.map((file, index) => (
                            <div
                              key={`${file.name}_${index}`}
                              className="crd-file-row"
                            >
                              <div className="crd-file-meta">
                                <div className="crd-file-name">{file.name}</div>
                                <div className="crd-file-size">
                                  {Math.round((file.size || 0) / 1024)} KB
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  handleRemoveDiscussionFile(index)
                                }
                                className="crd-remove-btn"
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      <div className="crd-chat-form-actions">
                        <button
                          type="submit"
                          className="btn btn-primary"
                          disabled={discussionSubmitting}
                        >
                          {discussionSubmitting ? "Sending..." : "Send message"}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            </div>

            <div className="checkout-summary">
              <div className="checkout-summary-header">
                <h3>Request status</h3>
              </div>

              <div className="checkout-summary-totals">
                <div className="summary-row">
                  <span>Current status</span>
                  <span style={{ color: statusMeta.color, fontWeight: 700 }}>
                    {statusMeta.label}
                  </span>
                </div>

                <div className="summary-row">
                  <span>Payment</span>
                  <span style={{ color: payMeta.color, fontWeight: 700 }}>
                    {payMeta.label}
                  </span>
                </div>

                <div className="summary-row">
                  <span>Payment method</span>
                  <span>{displayPaymentMethod}</span>
                </div>

                <div className="summary-row">
                  <span>Total</span>
                  <span className="crd-summary-total">
                    {quotedTotal > 0
                      ? formatMoney(quotedTotal)
                      : "To be quoted by admin"}
                  </span>
                </div>

                <p className="summary-note" style={{ marginTop: 12 }}>
                  Your request has been received. The admin will review your
                  submitted design, dimensions, finish, and notes before sending
                  the quotation.
                </p>
              </div>
            </div>
          </div>

          {previewItem && previewBlueprint ? (
            <div
              className="crd-preview-backdrop"
              onClick={() => setPreviewItem(null)}
            >
              <div
                className="crd-preview-modal"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="crd-preview-head">
                  <div>
                    <h2>{getDisplayTitle(previewItem)}</h2>
                    <p>Read-only preview of the submitted design.</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setPreviewItem(null)}
                    className="crd-preview-close"
                  >
                    ×
                  </button>
                </div>

                <div className="crd-preview-body">
                  <CustomerTemplateWorkbench
                    blueprint={previewBlueprint}
                    readOnly
                  />
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}