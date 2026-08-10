import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const CUSTOMER_JOURNEY_STEPS = [
  {
    key: "submitted",
    label: "Request submitted",
    description: "We received your furniture request.",
  },
  {
    key: "review",
    label: "Design review",
    description: "We check your design, size, materials, and delivery details.",
  },
  {
    key: "quotation",
    label: "Quotation",
    description: "You review the project price and details.",
  },
  {
    key: "approval-payment",
    label: "Approval & payment",
    description: "You approve the quotation and complete the required payment.",
  },
  {
    key: "production",
    label: "Production",
    description: "Your approved furniture is made by our team.",
  },
  {
    key: "delivery",
    label: "Delivery",
    description: "Your finished furniture is scheduled and delivered.",
  },
];

const getCustomerJourneyState = ({
  orderStatus = "",
  estimationStatus = "",
  paymentStatus = "",
  deliveryStatus = "",
  balanceDue = 0,
  verifiedPaymentTotal = 0,
} = {}) => {
  const order = String(orderStatus || "").trim().toLowerCase();
  const estimation = String(estimationStatus || "").trim().toLowerCase();
  const payment = String(paymentStatus || "").trim().toLowerCase();
  const delivery = String(deliveryStatus || "").trim().toLowerCase();
  const remainingBalance = Math.max(0, Number(balanceDue) || 0);
  const verifiedTotal = Math.max(0, Number(verifiedPaymentTotal) || 0);

  let currentIndex = 1;
  let title = "We are reviewing your design";
  let description =
    "We received your furniture request. Our team is checking your design, size, materials, and delivery details before preparing your quotation.";
  let actionTitle = "No action needed";
  let actionText =
    "You do not need to do anything right now. We will notify you when your quotation is ready.";
  let isComplete = false;
  let isCancelled = false;

  if (order === "cancelled") {
    currentIndex = 0;
    title = "This request was cancelled";
    description =
      "This furniture request is no longer moving forward. You can review the saved request details below or start a new request.";
    actionTitle = "Request closed";
    actionText = "No further action is required for this request.";
    isCancelled = true;
  } else if (order === "completed") {
    currentIndex = CUSTOMER_JOURNEY_STEPS.length - 1;
    title = "Your project is complete";
    description =
      "Your furniture has been delivered and this project is complete. Thank you for choosing Spiral Wood Services.";
    actionTitle = "Completed";
    actionText = "No further action is needed for this project.";
    isComplete = true;
  } else if (order === "delivered") {
    currentIndex = 5;
    title = "Your furniture has been delivered";
    description =
      "Your furniture has arrived. You can review your payment and project records below.";
    if (payment !== "paid" && remainingBalance > 0) {
      actionTitle = "Payment action needed";
      actionText =
        "Please follow the remaining balance instructions shown below to complete your payment.";
    } else {
      actionTitle = "Delivery complete";
      actionText = "No action is needed from you right now.";
    }
  } else if (order === "shipping" || delivery === "in_transit") {
    currentIndex = 5;
    title = "Your furniture is on the way";
    description =
      "Your furniture is in the delivery stage. Please make sure someone is available to receive it.";
    actionTitle = remainingBalance > 0 ? "Prepare for delivery" : "No action needed";
    actionText =
      remainingBalance > 0
        ? "Please review the remaining balance instructions below and prepare for delivery."
        : "No action is needed right now. We will update you when delivery is completed.";
  } else if (order === "production") {
    currentIndex = 4;
    title = "Your furniture is in production";
    description =
      "Your approved furniture is now being made by our team. We will update you when it is ready for delivery.";
    actionTitle = "No action needed";
    actionText = "You do not need to do anything right now.";
  } else if (order === "contract_released") {
    currentIndex = 3;
    title = "Your project is preparing for production";
    description =
      "Your quotation has been approved and your project details are being finalized before production.";
    if (payment === "unpaid") {
      actionTitle = "Payment action needed";
      actionText =
        "Complete the required down payment below so your project can continue.";
    } else {
      actionTitle = "No action needed";
      actionText =
        "Your verified payment is recorded. We will update you when production begins.";
    }
  } else if (estimation === "sent") {
    currentIndex = 2;
    title = "Your quotation is ready";
    description =
      "Review the project price and details below. You can approve the quotation, request changes, or reject it.";
    actionTitle = "Action needed";
    actionText = "Review your quotation below and choose how you want to continue.";
  } else if (estimation === "rejected") {
    currentIndex = 2;
    title = "Your quotation needs an update";
    description =
      "A quotation change has been requested. Our team will review the request and prepare the next update.";
    actionTitle = "No action needed";
    actionText =
      "You can use Message our team below if you need to add more details.";
  } else if (estimation === "approved") {
    currentIndex = 3;
    title =
      verifiedTotal > 0
        ? "Your payment has been recorded"
        : "Your quotation is approved";
    description =
      verifiedTotal > 0
        ? "Your approved quotation and verified payment are recorded. We will continue preparing your project for production."
        : "Your quotation is approved. Complete the required down payment so your project can continue.";
    if (payment === "unpaid" || verifiedTotal <= 0) {
      actionTitle = "Action needed";
      actionText =
        "Choose a payment method and complete the required down payment below.";
    } else {
      actionTitle = "No action needed";
      actionText =
        "Your payment is recorded. We will update you when the next project stage begins.";
    }
  } else {
    currentIndex = 1;
    title =
      estimation === "draft"
        ? "Your quotation is being prepared"
        : "We are reviewing your design";
    description =
      "We received your furniture request. Our team is checking your design, materials, and delivery requirements before preparing your quotation.";
    actionTitle = "No action needed";
    actionText =
      "You do not need to do anything right now. We will notify you when your quotation is ready.";
  }

  const steps = CUSTOMER_JOURNEY_STEPS.map((step, index) => {
    let state = "upcoming";
    if (isComplete || index < currentIndex) state = "complete";
    else if (index === currentIndex) state = "current";

    if (isCancelled && index === 0) state = "complete";
    if (isCancelled && index > 0) state = "upcoming";

    return { ...step, state };
  });

  return {
    title,
    description,
    actionTitle,
    actionText,
    currentStageLabel: isCancelled
      ? "Request cancelled"
      : isComplete
        ? "Completed"
        : CUSTOMER_JOURNEY_STEPS[currentIndex]?.label || "Design review",
    steps,
    isCancelled,
    isComplete,
  };
};
const getSubmittedItemProgressLabel = ({
  orderStatus = "",
  estimationStatus = "",
} = {}) => {
  const order = String(orderStatus || "").trim().toLowerCase();
  const estimation = String(estimationStatus || "").trim().toLowerCase();

  if (order === "completed") return "Completed";
  if (order === "delivered") return "Delivered";
  if (order === "shipping") return "Shipping";
  if (order === "production") return "In production";
  if (order === "cancelled") return "Cancelled";
  if (order === "contract_released") return "Contract ready";

  if (estimation === "approved") return "Approved";
  if (estimation === "sent") return "Quotation ready";
  if (estimation === "rejected") return "Revision needed";
  if (estimation === "draft") return "Quote in progress";

  return "Quote needed";
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

// Payment History table display maps. Kept separate from the
// component-scoped PAYMENT_METHOD_LABELS used elsewhere on this page
// (that one intentionally shows "Cash at Store" for the payment-method
// selector) -- the history table always shows the plain method name.
const HISTORY_PAYMENT_METHOD_LABELS = {
  cash: "Cash",
  paymongo: "Online Payment",
  gcash: "GCash",
  bank_transfer: "Bank Transfer",
};

const HISTORY_PAYMENT_LABEL_TEXT = {
  down_payment: "Down Payment",
  partial_payment: "Partial Payment",
  balance_payment: "Balance Payment",
  full_payment: "Full Payment",
};

const HISTORY_STATUS_TEXT = {
  verified: "Verified",
  pending: "Pending",
  rejected: "Rejected",
};

const HISTORY_STATUS_COLORS = {
  verified: { background: "#f0fdf4", color: "#166534", border: "#bbf7d0" },
  pending: { background: "#fffbeb", color: "#92400e", border: "#fde68a" },
  rejected: { background: "#fef2f2", color: "#991b1b", border: "#fecaca" },
};

const historyTdStyle = {
  padding: "10px",
  borderBottom: "1px solid #f4f4f5",
  color: "#18181b",
  verticalAlign: "top",
};

function HistoryStatusBadge({ status }) {
  const key = String(status || "").trim().toLowerCase();
  const colors =
    HISTORY_STATUS_COLORS[key] || {
      background: "#f4f4f5",
      color: "#3f3f46",
      border: "#e4e4e7",
    };
  return (
    <span
      style={{
        display: "inline-block",
        padding: "3px 10px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        border: "1px solid",
        whiteSpace: "nowrap",
        background: colors.background,
        color: colors.color,
        borderColor: colors.border,
      }}
    >
      {HISTORY_STATUS_TEXT[key] || (status ? status : "Unknown")}
    </span>
  );
}

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
      label: "Spiral Wood Services",
      roleClass: "is-admin",
    };
  }

  if (role === "staff") {
    return {
      label: "Spiral Wood Services",
      roleClass: "is-staff",
    };
  }

  if (role === "system") {
    return {
      label: "Spiral Wood Services",
      roleClass: "is-system",
    };
  }

  return {
    label: "You",
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
  const discussionFileInputRef = useRef(null);
  const discussionInputRef = useRef(null);
  const discussionThreadRef = useRef(null);
  const [selectingMethod, setSelectingMethod] = useState(false);
  const [selectionError, setSelectionError] = useState("");
  const [selectingRemainingMethod, setSelectingRemainingMethod] = useState(false);
  const [payingRemainingBalance, setPayingRemainingBalance] = useState(false);
  const [remainingMethodError, setRemainingMethodError] = useState("");

  const [paymentHistory, setPaymentHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");

  const loadPaymentHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const res = await api.get(`/customer/custom-orders/${id}/receipts`);
      setPaymentHistory(
        Array.isArray(res.data?.payment_history) ? res.data.payment_history : [],
      );
    } catch (err) {
      setPaymentHistory([]);
      setHistoryError(
        err.response?.data?.message || "Failed to load payment history.",
      );
    } finally {
      setHistoryLoading(false);
    }
  }, [id]);

  const loadRequestDetail = useCallback(
    async (showLoader = true) => {
      if (showLoader) setLoading(true);
      setError("");

      try {
        const res = await api.get(`/customer/custom-orders/${id}`);
        setRequestData(res.data);
        // Loaded here (rather than in a separate mount-only effect) so
        // that payment history also refreshes every time this succeeds
        // -- including right after a PayMongo verification attempt below,
        // with no manual page reload required.
        await loadPaymentHistory();
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
    [id, loadPaymentHistory],
  );

  useEffect(() => {
    const verifyPayment = async () => {
      const params = new URLSearchParams(window.location.search);

      const isInitialVerify = params.get("verify_success") === "true";
      const isRemainingVerify = params.get("verify_remaining_success") === "true";

      if (!isInitialVerify && !isRemainingVerify) {
        loadRequestDetail(true);
        return;
      }

      const paramKey = isInitialVerify ? "verify_success" : "verify_remaining_success";
      const endpoint = isInitialVerify
        ? `/customer/custom-orders/${id}/verify-payment`
        : `/customer/custom-orders/${id}/remaining-balance/verify-payment`;

      let isSuccess = false;

      try {
        const res = await api.post(endpoint);

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
          params.delete(paramKey);
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

  const additionalDeliveryFee = Math.max(
    0,
    Number(
      latestEstimation?.additional_delivery_fee ??
        requestData?.oversized_delivery_quote?.additional_delivery_fee ??
        0,
    ) || 0,
  );

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
  const paymentMethodFieldLabel =
    verifiedPaymentTotal > 0 ? "Initial payment method" : "Selected payment method";
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

  // PHASE 5 — Blueprint Rider Final Cash Collection. The backend
  // (selectRemainingPaymentMethod / getCustomOrderById) re-derives and
  // locks every one of these conditions itself; these are display-only.
  const storedRemainingPaymentMethod = String(
    paymentSummary.remaining_payment_method || "",
  )
    .trim()
    .toLowerCase();
  const deliveryStatusForRemainingMethod = String(
    paymentSummary.delivery_status || "",
  )
    .trim()
    .toLowerCase();
  const canSelectRemainingPaymentMethod = Boolean(
    paymentSummary.can_select_remaining_payment_method,
  );
  const remainingPaymentMethodLocked = Boolean(
    paymentSummary.remaining_payment_method_locked,
  );
  const remainingPaymentMethod =
    storedRemainingPaymentMethod ||
    (canSelectRemainingPaymentMethod ? "cash" : "");
  const remainingPaymentMethodDefaulted =
    !storedRemainingPaymentMethod &&
    canSelectRemainingPaymentMethod &&
    remainingPaymentMethod === "cash";
  const REMAINING_METHOD_LABELS = {
    cash: "Cash on Delivery",
    paymongo: "Online Payment",
  };

  // PHASE 5B — Blueprint Remaining Balance Online Payment. The backend
  // (createRemainingBalancePayMongoCheckout) re-derives and locks every
  // one of these itself; this is display-only, for showing/hiding the
  // "Pay Remaining Balance Online" button. An already-active PayMongo
  // session does not hide the button — clicking it safely reuses (or
  // safely replaces, if expired) the existing session server-side.
  const canPayRemainingBalanceOnline =
    remainingPaymentMethod === "paymongo" &&
    String(requestData?.payment_status || "").trim().toLowerCase() !== "paid" &&
    Number(verifiedPaymentTotal || 0) > 0 &&
    balanceDue > 0 &&
    ["scheduled", "in_transit"].includes(deliveryStatusForRemainingMethod) &&
    !["cancelled", "completed"].includes(orderStatusKey) &&
    !Boolean(paymentSummary.has_pending_payment);

  const estimationStatusKey = String(latestEstimation?.status || "")
    .trim()
    .toLowerCase();

  const customerQuotationItemsV141 = useMemo(
    () =>
      (Array.isArray(latestEstimation?.items) ? latestEstimation.items : [])
        .filter((item) => !item?.raw_material_id),
    [latestEstimation],
  );

  const customerJourney = getCustomerJourneyState({
    orderStatus: orderStatusKey,
    estimationStatus: estimationStatusKey,
    paymentStatus: requestData?.payment_status,
    deliveryStatus: deliveryStatusForRemainingMethod,
    balanceDue,
    verifiedPaymentTotal,
  });

  const submittedItemProgressLabel = getSubmittedItemProgressLabel({
    orderStatus: orderStatusKey,
    estimationStatus: estimationStatusKey,
  });

  const showPaymentInStatus =
    Number(verifiedPaymentTotal || 0) > 0 ||
    estimationStatusKey === "approved" ||
    [
      "contract_released",
      "production",
      "shipping",
      "delivered",
      "completed",
    ].includes(orderStatusKey);

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

  useEffect(() => {
    const thread = discussionThreadRef.current;
    if (!thread) return undefined;

    const frame = window.requestAnimationFrame(() => {
      thread.scrollTo({
        top: thread.scrollHeight,
        behavior: discussionThread.length > 0 ? "smooth" : "auto",
      });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [discussionThread.length]);

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
    const allowedExtensions = [".jpg", ".jpeg", ".jfif", ".png", ".webp", ".pdf"];
    const maxSize = 8 * 1024 * 1024;
    const accepted = [];

    picked.forEach((file) => {
      const lowerName = String(file?.name || "").toLowerCase();
      const hasAllowedExtension = allowedExtensions.some((ext) =>
        lowerName.endsWith(ext),
      );

      if (!hasAllowedExtension) {
        toast.error(
          `${file.name || "Attachment"} is not supported. Use JPG, JPEG, JFIF, PNG, WEBP, or PDF.`,
        );
        return;
      }

      if (Number(file?.size || 0) > maxSize) {
        toast.error(`${file.name} is larger than 8MB.`);
        return;
      }

      accepted.push(file);
    });

    setDiscussionFiles((prev) => {
      const next = [...prev, ...accepted].slice(0, 5);
      if (prev.length + accepted.length > 5) {
        toast.error("You can attach up to 5 files per message.");
      }
      return next;
    });

    e.target.value = "";
  };

  const handleRemoveDiscussionFile = (index) => {
    setDiscussionFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const resizeDiscussionInput = (element) => {
    if (!element) return;
    element.style.height = "38px";
    const nextHeight = Math.min(Math.max(element.scrollHeight, 38), 116);
    element.style.height = `${nextHeight}px`;
    element.style.overflowY = element.scrollHeight > 116 ? "auto" : "hidden";
  };

  const handleDiscussionMessageChange = (e) => {
    setDiscussionMessage(e.target.value);
    resizeDiscussionInput(e.currentTarget);
  };

  const handleDiscussionKeyDown = (e) => {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent?.isComposing) return;

    e.preventDefault();
    if (discussionSubmitting) return;

    const form = e.currentTarget.form;
    if (form) form.requestSubmit();
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
      if (discussionInputRef.current) {
        discussionInputRef.current.style.height = "38px";
        discussionInputRef.current.style.overflowY = "hidden";
      }
      await loadRequestDetail(false);
      toast.success(
        discussionFiles.length
          ? "Message and attachment sent."
          : "Message sent.",
      );
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

  // PHASE 5B — Blueprint Remaining Balance Online Payment.
  const handlePayRemainingBalanceOnline = async () => {
    if (!requestData?.id || payingRemainingBalance) return;

    setPayingRemainingBalance(true);

    try {
      const res = await api.post(
        `/customer/custom-orders/${requestData.id}/remaining-balance/pay`,
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
    } finally {
      setPayingRemainingBalance(false);
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

  // PHASE 5 — Blueprint Rider Final Cash Collection.
  const handleSelectRemainingPaymentMethod = async (method) => {
    if (selectingRemainingMethod) return;

    setSelectingRemainingMethod(true);
    setRemainingMethodError("");

    try {
      await api.post(
        `/customer/custom-orders/${requestData.id}/remaining-payment-method`,
        { remaining_payment_method: method },
      );
      await loadRequestDetail(false);
    } catch (err) {
      setRemainingMethodError(
        err.response?.data?.message ||
          err.response?.data?.error ||
          "Failed to update the remaining payment method.",
      );
    } finally {
      setSelectingRemainingMethod(false);
    }
  };

  const handlePayRemainingBalanceOnlineInstead = async () => {
    if (
      !requestData?.id ||
      selectingRemainingMethod ||
      payingRemainingBalance
    ) {
      return;
    }

    setSelectingRemainingMethod(true);
    setPayingRemainingBalance(true);
    setRemainingMethodError("");

    try {
      if (storedRemainingPaymentMethod !== "paymongo") {
        await api.post(
          `/customer/custom-orders/${requestData.id}/remaining-payment-method`,
          { remaining_payment_method: "paymongo" },
        );
      }

      const res = await api.post(
        `/customer/custom-orders/${requestData.id}/remaining-balance/pay`,
      );

      if (!res.data?.payment_url) {
        setRemainingMethodError("Unable to launch online payment.");
        return;
      }

      window.location.href = res.data.payment_url;
    } catch (err) {
      setRemainingMethodError(
        err.response?.data?.message ||
          err.response?.data?.error ||
          "Unable to start online payment for the remaining balance.",
      );
    } finally {
      setSelectingRemainingMethod(false);
      setPayingRemainingBalance(false);
    }
  };
  return (
    <div className="crd-page">
      <div className="page-hero">
        <div>
          <h1>Request details</h1>
          <p>Review your submitted request and current status.</p>

          {requestData ? (
            <div className="crd-request-meta-v12">
              <span>
                <span className="crd-request-meta-label-v12">Request</span>
                <span className="crd-request-number-value-v16">
                  {requestData.order_number || "-"}
                </span>
              </span>
              <span className="crd-request-meta-separator-v12" aria-hidden="true">
                /
              </span>
              <span>
                <span className="crd-request-meta-label-v12">Submitted</span>
                {formatDate(requestData.created_at)}
              </span>
            </div>
          ) : null}
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
          <section
            className={`crd-journey-hero-v2 ${
              customerJourney.isCancelled ? "is-cancelled" : ""
            }`}
            aria-labelledby="crd-current-stage-title"
          >
            <div className="crd-journey-current-v2">
              <div className="crd-journey-eyebrow-v2">Current stage</div>
              <h2 id="crd-current-stage-title">{customerJourney.title}</h2>
              <p>{customerJourney.description}</p>

              <div className="crd-journey-action-v2">
                <strong>{customerJourney.actionTitle}</strong>
                <span>{customerJourney.actionText}</span>
              </div>
            </div>

            <div className="crd-journey-process-v2">
              <div className="crd-journey-process-title-v2">
                What happens next
              </div>
              <ol className="crd-journey-steps-v2">
                {customerJourney.steps.map((step, index) => (
                  <li
                    key={step.key}
                    className={`crd-journey-step-v2 is-${step.state}`}
                    aria-current={step.state === "current" ? "step" : undefined}
                  >
                    <div className="crd-journey-step-marker-v2">
                      {step.state === "complete" ? "✓" : index + 1}
                    </div>
                    <div className="crd-journey-step-copy-v2">
                      <strong>{step.label}</strong>
                      <span>{step.description}</span>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          <div className="checkout-layout crd-layout">
            <div
              className="checkout-form-panel wisdom-request-details-main-v11 crd-customer-journey-v2"
            >
              <div className="checkout-section wisdom-request-overview-v11">
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

                    <DetailValue label={paymentMethodFieldLabel}>
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
                <div className="checkout-section wisdom-request-quotation-v11">
                  <div className="checkout-section-header">
                    <div className="checkout-section-num">02</div>
                    <h3>Your quotation</h3>

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
                        <div>Item</div>
                        <div>Qty</div>
                        <div>Unit price</div>
                        <div>Amount</div>
                      </div>

                      {customerQuotationItemsV141.length ? (
                        customerQuotationItemsV141.map((item) => (
                          <div key={item.id} className="crd-table-row">
                            <div className="crd-table-desc">
                              {item.description || "Quotation item"}
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

                    <div
                      className={`crd-grid-split crd-quote-bottom-v141 ${
                        canDecideOnQuote ? "" : "is-summary-only"
                      }`}
                    >
                      {canDecideOnQuote ? (
                        <div className="crd-panel crd-quote-review-v141">
                          <h4>Review quotation</h4>
                          <p className="crd-quote-review-copy-v141">
                            Review the quotation details, then choose an option.
                          </p>

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
                        </div>
                      ) : null}

                      <div className="crd-panel crd-panel-soft crd-quote-summary-v141">
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

                        {additionalDeliveryFee > 0 ? (
                          <DetailValue label="Additional Delivery Fee">
                            {formatMoney(additionalDeliveryFee)}
                          </DetailValue>
                        ) : null}

                        {Number(latestEstimation.discount || 0) > 0 ? (
                          <DetailValue label="Discount">
                            {formatMoney(latestEstimation.discount || 0)}
                          </DetailValue>
                        ) : null}

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
              ) : (
                <div className="checkout-section wisdom-request-quotation-v11">
                  <div className="checkout-section-header">
                    <div className="checkout-section-num">02</div>
                    <h3>Quotation</h3>
                  </div>

                  <div className="checkout-section-body">
                    {quotationActionBlocked || quotationIntegrityWarning ? (
                      <div className="crd-info-box pending">
                        {quotationMessage ||
                          "Your quotation cannot be shown right now. Please check again later or message our team if you need help."}
                      </div>
                    ) : (
                      <div className="crd-quotation-waiting-v2">
                        <div className="crd-quotation-waiting-label-v2">
                          Quotation status
                        </div>
                        <h4>Quotation is being prepared</h4>
                        <p>
                          Our team is reviewing your furniture design and
                          checking the materials and delivery requirements.
                        </p>
                        <div className="crd-quotation-waiting-action-v2">
                          <strong>No action needed from you right now.</strong>
                          <span>
                            We will notify you when your quotation is ready to
                            review.
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {quotationAvailable &&
              latestEstimation &&
              !quotationActionBlocked &&
              !quotationIntegrityWarning &&
              estimationStatusKey === "approved" ? (
                <div className="checkout-section wisdom-request-payment-v11">
                  <div className="checkout-section-header">
                    <div className="checkout-section-num">03</div>
                    <h3>Payment</h3>
                  </div>

                  <div className="checkout-section-body">
                    <div className="crd-grid-split">
                      <div className="crd-panel crd-panel-soft wisdom-payment-summary-v16">
                        <h4>Payment summary</h4>

                        <DetailValue label="Quoted total">
                          {formatMoney(quotedTotal || 0)}
                        </DetailValue>

                        <DetailValue label="Required down payment (30%)">
                          {formatMoney(downPaymentDue || 0)}
                        </DetailValue>

                        {verifiedPaymentTotal > 0 ? (
                          <DetailValue label="Amount paid">
                            {formatMoney(verifiedPaymentTotal || 0)}
                          </DetailValue>
                        ) : null}

                        {verifiedPaymentTotal > 0 ? (
                          <div className="wisdom-payment-due-v16">
                            <span>Remaining balance</span>
                            <strong>{formatMoney(balanceDue || 0)}</strong>
                          </div>
                        ) : (
                          <>
                            <div className="wisdom-payment-due-v16 is-initial">
                              <span>Amount due now</span>
                              <strong>{formatMoney(downPaymentDue || 0)}</strong>
                            </div>

                            <DetailValue label="Balance after down payment">
                              {formatMoney(
                                Math.max(
                                  Number(quotedTotal || 0) -
                                    Number(downPaymentDue || 0),
                                  0,
                                ),
                              )}
                            </DetailValue>
                          </>
                        )}

                        <p className="crd-panel-copy muted wisdom-payment-helper-v16">
                          {requestData.payment_status === "partial" ||
                          requestData.payment_status === "paid"
                            ? "Verified payments are reflected in your current balance."
                            : hasPendingPaymentTransaction
                              ? "Your payment is currently awaiting verification."
                              : normalizedOrderPaymentMethod === "cash"
                                ? "Pay the required down payment at the Spiral Wood store."
                                : normalizedOrderPaymentMethod === "paymongo"
                                  ? "Complete the required down payment through secure online payment."
                                  : "Choose a payment method to continue."}
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
                          <div className="crd-panel wisdom-payment-method-choice-v16">
                            <h4>Choose payment method</h4>

                            <div className="crd-grid-split">
                              <div className="crd-panel crd-panel-soft">
                                <h4>Cash at Store</h4>
                                <p className="crd-panel-copy muted">
                                  Pay the required down payment at the Spiral Wood store.
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
                                  Pay securely with GCash, Maya, online banking, or card.
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

              {/* PHASE 5 — Blueprint Rider Final Cash Collection */}
              {(canSelectRemainingPaymentMethod ||
                remainingPaymentMethodLocked) &&
              balanceDue > 0 ? (
                <div className="checkout-section wisdom-request-remaining-payment-v184">
                  <div className="checkout-section-header">
                    <div className="checkout-section-num">03B</div>
                    <h3>Remaining balance payment</h3>
                  </div>

                  <div className="checkout-section-body">
                    {remainingMethodError ? (
                      <div className="crd-info-box pending wisdom-remaining-error-v184">
                        {remainingMethodError}
                      </div>
                    ) : null}

                    <div className="wisdom-remaining-current-v184">
                      <div>
                        <div className="wisdom-remaining-method-line-v184">
                          <h4>
                            {REMAINING_METHOD_LABELS[remainingPaymentMethod] ||
                              "Cash on Delivery"}
                          </h4>

                          <span className="wisdom-remaining-method-badge-v184">
                            {remainingPaymentMethodDefaulted
                              ? "Default method"
                              : remainingPaymentMethodLocked
                                ? "Confirmed method"
                                : "Current method"}
                          </span>
                        </div>

                        <p>
                          {remainingPaymentMethod === "paymongo"
                            ? "Pay the remaining balance securely online."
                            : "Pay the remaining balance directly to the rider upon delivery."}
                        </p>
                      </div>

                      <div className="wisdom-remaining-amount-v184">
                        <span>Remaining balance</span>
                        <strong>{formatMoney(balanceDue)}</strong>
                      </div>
                    </div>

                    {!remainingPaymentMethodLocked &&
                    remainingPaymentMethod !== "paymongo" ? (
                      <div className="wisdom-remaining-online-option-v184">
                        <div>
                          <h4>Prefer to pay online?</h4>
                          <p>
                            Pay the exact remaining balance through secure
                            online payment instead.
                          </p>
                        </div>

                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={
                            selectingRemainingMethod || payingRemainingBalance
                          }
                          onClick={handlePayRemainingBalanceOnlineInstead}
                        >
                          {selectingRemainingMethod || payingRemainingBalance
                            ? "Opening online payment..."
                            : "Pay online instead"}
                        </button>
                      </div>
                    ) : null}

                    {remainingPaymentMethod === "paymongo" ? (
                      <div className="wisdom-remaining-online-option-v184 is-selected">
                        <div>
                          <h4>Online payment</h4>
                          <p>
                            Complete the remaining balance using secure online
                            checkout.
                          </p>
                        </div>

                        <div className="wisdom-remaining-online-actions-v184">
                          {canPayRemainingBalanceOnline ? (
                            <button
                              type="button"
                              className="btn btn-primary"
                              disabled={payingRemainingBalance}
                              onClick={handlePayRemainingBalanceOnline}
                            >
                              {payingRemainingBalance
                                ? "Opening online payment..."
                                : "Continue online payment"}
                            </button>
                          ) : null}

                          {canSelectRemainingPaymentMethod &&
                          !remainingPaymentMethodLocked ? (
                            <button
                              type="button"
                              className="btn btn-secondary"
                              disabled={selectingRemainingMethod}
                              onClick={() =>
                                handleSelectRemainingPaymentMethod("cash")
                              }
                            >
                              Use Cash on Delivery instead
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}

                    {remainingPaymentMethodLocked ? (
                      <p className="wisdom-remaining-locked-note-v184">
                        This payment method can no longer be changed for this
                        delivery.
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {requestData &&
              (historyLoading || historyError || paymentHistory.length > 0) ? (
                <div className="checkout-section wisdom-request-payment-history-v11">
                  <div className="checkout-section-header">
                    <div className="checkout-section-num">PH</div>
                    <h3>Payment activity</h3>
                  </div>

                  <div className="checkout-section-body">
                    {historyLoading ? (
                      <div className="crd-info-box muted">
                        Loading payment history...
                      </div>
                    ) : historyError ? (
                      <div className="crd-info-box pending">{historyError}</div>
                    ) : paymentHistory.length === 0 ? (
                      <div className="crd-info-box muted">
                        No payment transactions found.
                      </div>
                    ) : (
                      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                        <table
                          style={{
                            width: "100%",
                            minWidth: 560,
                            borderCollapse: "collapse",
                            fontSize: 13,
                          }}
                        >
                          <thead>
                            <tr>
                              {[
                                "Date & Time",
                                "Payment Type",
                                "Method",
                                "Amount",
                                "Status",
                                "Receipt",
                              ].map((col) => (
                                <th
                                  key={col}
                                  style={{
                                    textAlign: "left",
                                    padding: "8px 10px",
                                    fontSize: 11,
                                    fontWeight: 800,
                                    textTransform: "uppercase",
                                    letterSpacing: "0.03em",
                                    color: "#71717a",
                                    borderBottom: "1px solid #e4e4e7",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {col}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {paymentHistory.map((row) => {
                              const method = String(row.payment_method || "")
                                .trim()
                                .toLowerCase();
                              const canViewReceipt =
                                String(row.status || "").trim().toLowerCase() ===
                                  "verified" &&
                                Boolean(row.receipt_id) &&
                                Boolean(row.receipt_number);
                              const isVerifiedNoReceipt =
                                String(row.status || "").trim().toLowerCase() ===
                                  "verified" && !canViewReceipt;

                              return (
                                <tr key={row.payment_transaction_id}>
                                  <td style={historyTdStyle}>
                                    {formatDate(row.created_at)}
                                  </td>
                                  <td style={historyTdStyle}>
                                    {HISTORY_PAYMENT_LABEL_TEXT[row.payment_label] ||
                                      "Payment"}
                                  </td>
                                  <td style={historyTdStyle}>
                                    {HISTORY_PAYMENT_METHOD_LABELS[method] ||
                                      (method ? prettifyText(method) : "—")}
                                  </td>
                                  <td style={{ ...historyTdStyle, fontWeight: 700 }}>
                                    {formatMoney(row.amount)}
                                  </td>
                                  <td style={historyTdStyle}>
                                    <HistoryStatusBadge status={row.status} />
                                  </td>
                                  <td style={historyTdStyle}>
                                    {canViewReceipt ? (
                                      <button
                                        type="button"
                                        className="btn btn-secondary"
                                        style={{ fontSize: 12, padding: "6px 12px" }}
                                        onClick={() =>
                                          navigate(
                                            `/custom-requests/${id}/receipts/${row.receipt_id}`,
                                          )
                                        }
                                      >
                                        View Receipt
                                      </button>
                                    ) : isVerifiedNoReceipt ? (
                                      <span style={{ color: "#a1a1aa", fontSize: 12 }}>
                                        Receipt unavailable
                                      </span>
                                    ) : (
                                      <span style={{ color: "#a1a1aa", fontSize: 12 }}>
                                        —
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              <div className="checkout-section wisdom-request-items-v11">
                <div className="checkout-section-header">
                  <div className="checkout-section-num">04</div>
                  <h3>Your furniture request</h3>

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
                        <div
                          className={`checkout-item-thumb crd-design-thumb-v2 ${
                            canPreview ? "is-clickable" : ""
                          }`}
                          onClick={
                            canPreview ? () => setPreviewItem(item) : undefined
                          }
                          onKeyDown={
                            canPreview
                              ? (event) => {
                                  if (
                                    event.key === "Enter" ||
                                    event.key === " "
                                  ) {
                                    event.preventDefault();
                                    setPreviewItem(item);
                                  }
                                }
                              : undefined
                          }
                          role={canPreview ? "button" : undefined}
                          tabIndex={canPreview ? 0 : undefined}
                          aria-label={
                            canPreview
                              ? `View your submitted design for ${getDisplayTitle(item)}`
                              : undefined
                          }
                          title={
                            canPreview
                              ? "Open your submitted blueprint and 3D design"
                              : undefined
                          }
                        >
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

                          {canPreview ? (
                            <span className="crd-design-thumb-hint-v2">
                              View design
                            </span>
                          ) : null}
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
                              <div className="crd-design-access-v2">
                                <div className="crd-design-access-copy-v2">
                                  <span className="crd-design-access-label-v2">
                                    Your submitted design
                                  </span>
                                  <span className="crd-design-access-help-v2">
                                    Open the blueprint and 3D design you submitted.
                                  </span>
                                </div>

                                <button
                                  type="button"
                                  className="crd-design-view-btn-v2"
                                  onClick={() => setPreviewItem(item)}
                                >
                                  <svg
                                    viewBox="0 0 24 24"
                                    width="16"
                                    height="16"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="1.8"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    aria-hidden="true"
                                  >
                                    <path d="M3 7.5 12 3l9 4.5-9 4.5-9-4.5Z" />
                                    <path d="m3 12 9 4.5 9-4.5" />
                                    <path d="m3 16.5 9 4.5 9-4.5" />
                                  </svg>
                                  <span>View your design</span>
                                  <span
                                    className="crd-design-view-arrow-v2"
                                    aria-hidden="true"
                                  >
                                    →
                                  </span>
                                </button>
                              </div>
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
                          {submittedItemProgressLabel}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="checkout-section wisdom-request-project-v11">
                <div className="checkout-section-header">
                  <div className="checkout-section-num">05</div>
                  <h3>Delivery details</h3>
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

                    {String(requestData.notes || "").trim() ? (
                      <div>
                        <label className="crd-field-label">Customer notes</label>
                        <div className="crd-read-box crd-read-box-copy">
                          {requestData.notes}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="checkout-section wisdom-request-messages-v11 crd-messenger-v2">
                <div className="checkout-section-header crd-messenger-section-head-v2">
                  <div className="checkout-section-num">06</div>
                  <div>
                    <h3>Message our team</h3>
                    <p>Ask about your quotation, payment, production, delivery, or request details.</p>
                  </div>
                </div>

                <div className="checkout-section-body crd-messenger-body-v2">
                  <div className="crd-chat-wrap wisdom-request-chat-v13 crd-messenger-shell-v2">
                    <div className="crd-chat-card">
                      <div className="crd-chat-card-head crd-messenger-head-v2">
                        <div>
                          <strong>Spiral Wood Services</strong>
                          <span>Project conversation</span>
                        </div>
                      </div>

                      <div
                        ref={discussionThreadRef}
                        className={`crd-chat-thread ${
                          discussionThread.length ? "has-messages" : "is-empty"
                        }`}
                      >
                        {!discussionThread.length ? (
                          <div className="crd-chat-empty crd-messenger-empty-v2">
                            <div className="crd-messenger-empty-icon-v2" aria-hidden="true">
                              <svg
                                viewBox="0 0 24 24"
                                width="22"
                                height="22"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.7"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
                              </svg>
                            </div>
                            <strong>No conversation yet</strong>
                            <span>
                              You can message us if you have a question, want
                              to clarify your furniture request, or need to send
                              an update.
                            </span>
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
                      className="crd-chat-form wisdom-request-chat-form-v13 crd-messenger-composer-v2"
                    >
                      {discussionFiles.length ? (
                        <div className="crd-messenger-file-chips-v2">
                          {discussionFiles.map((file, index) => (
                            <div
                              key={`${file.name}_${index}`}
                              className="crd-messenger-file-chip-v2"
                            >
                              <span className="crd-messenger-file-icon-v2" aria-hidden="true">
                                <svg
                                  viewBox="0 0 24 24"
                                  width="14"
                                  height="14"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                  <path d="M14 2v6h6" />
                                </svg>
                              </span>
                              <span className="crd-messenger-file-name-v2">
                                {file.name}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleRemoveDiscussionFile(index)}
                                className="crd-messenger-file-remove-v2"
                                aria-label={`Remove ${file.name}`}
                                title="Remove attachment"
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      <div className="crd-messenger-compose-row-v2">
                        <input
                          ref={discussionFileInputRef}
                          type="file"
                          multiple
                          accept=".jpg,.jpeg,.jfif,.png,.webp,.pdf"
                          onChange={handleDiscussionFilesChange}
                          className="crd-messenger-hidden-file-v2"
                          tabIndex={-1}
                        />

                        <button
                          type="button"
                          className="crd-messenger-icon-btn-v2 crd-messenger-attach-v2"
                          onClick={() => discussionFileInputRef.current?.click()}
                          aria-label="Attach files"
                          title="Attach files"
                          disabled={discussionSubmitting || discussionFiles.length >= 5}
                        >
                          <svg
                            viewBox="0 0 24 24"
                            width="18"
                            height="18"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                          </svg>
                        </button>

                        <textarea
                          ref={discussionInputRef}
                          rows={1}
                          value={discussionMessage}
                          onChange={handleDiscussionMessageChange}
                          onKeyDown={handleDiscussionKeyDown}
                          placeholder="Type a message..."
                          className="crd-control crd-textarea crd-messenger-input-v2"
                          aria-label="Message our team"
                        />

                        <button
                          type="submit"
                          className="crd-messenger-send-v2"
                          disabled={
                            discussionSubmitting ||
                            (!discussionMessage.trim() && !discussionFiles.length)
                          }
                          aria-label="Send message"
                          title="Send message"
                        >
                          {discussionSubmitting ? (
                            <span className="crd-messenger-sending-v2">…</span>
                          ) : (
                            <svg
                              viewBox="0 0 24 24"
                              width="18"
                              height="18"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M22 2 11 13" />
                              <path d="m22 2-7 20-4-9-9-4Z" />
                            </svg>
                          )}
                        </button>
                      </div>

                      <div className="crd-messenger-helper-v2">
                        <span>Enter to send · Shift + Enter for a new line</span>
                        <span>Up to 5 images or PDFs · 8MB each</span>
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            </div>

            <div className="checkout-summary wisdom-request-status-v11 crd-project-summary-v2">
              <div className="checkout-summary-header">
                <h3>Your project</h3>
              </div>

              <div className="checkout-summary-totals">
                <div className="summary-row">
                  <span>Current stage</span>
                  <span className="crd-current-stage-value-v2">
                    {customerJourney.currentStageLabel}
                  </span>
                </div>

                <div className="summary-row">
                  <span>Quotation</span>
                  <span className="crd-summary-total">
                    {quotedTotal > 0 ? formatMoney(quotedTotal) : "Not ready yet"}
                  </span>
                </div>

                {showPaymentInStatus ? (
                  <div className="summary-row">
                    <span>Payment</span>
                    <span>{payMeta.label}</span>
                  </div>
                ) : null}

                <div className="crd-whats-next-v12">Your next step</div>
                <p className="summary-note crd-next-step-copy-v2">
                  {customerJourney.actionText}
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