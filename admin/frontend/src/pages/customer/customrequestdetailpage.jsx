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

const getRequestLifecycleMessage = ({
  orderStatus = "",
  estimationStatus = "",
  paymentStatus = "",
} = {}) => {
  const order = String(orderStatus || "").trim().toLowerCase();
  const estimation = String(estimationStatus || "").trim().toLowerCase();
  const payment = String(paymentStatus || "").trim().toLowerCase();

  if (order === "completed") {
    return "This order has been completed successfully. Thank you for choosing Spiral Wood Services.";
  }

  if (order === "delivered") {
    return payment === "paid"
      ? "Your furniture has been delivered and payment is complete."
      : "Your furniture has been delivered. Review the remaining payment details below.";
  }

  if (order === "shipping") {
    return "Your furniture is on the way. Review the delivery and remaining payment details below.";
  }

  if (order === "production") {
    return "Your approved furniture is now in production. You can review payment and project updates below.";
  }

  if (order === "contract_released") {
    return "Your quotation is approved and the contract has been released. Review the payment and project details below.";
  }

  if (order === "cancelled") {
    return "This request has been cancelled. Review the order details below for the latest recorded information.";
  }

  if (order === "confirmed") {
    if (estimation === "sent") {
      return "Your quotation is ready for review. Approve it, request a revision, or reject it below.";
    }

    if (estimation === "approved") {
      if (payment === "unpaid") {
        return "Your quotation is approved. Complete the required down payment to continue.";
      }

      if (payment === "partial") {
        return "Your quotation is approved and the down payment is verified. Your project is ready for the next production step.";
      }

      if (payment === "paid") {
        return "Your quotation is approved and payment is complete. Your project is ready for production.";
      }

      return "Your quotation is approved. Review the next payment and project steps below.";
    }

    if (estimation === "rejected") {
      return "A quotation revision is needed. Review the quotation and discussion updates below.";
    }

    return "Your request is confirmed. The admin is preparing the quotation and project details.";
  }

  return "Your request has been received. The admin will review the submitted design and project details before preparing the quotation.";
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
  const [selectingRemainingMethod, setSelectingRemainingMethod] = useState(false);
  const [payingRemainingBalance, setPayingRemainingBalance] = useState(false);
  const [remainingMethodError, setRemainingMethodError] = useState("");

  const [paymentHistory, setPaymentHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [activeRequestTab, setActiveRequestTab] = useState("overview");

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
  const remainingPaymentMethod = String(
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
  const REMAINING_METHOD_LABELS = {
    cash: "Cash",
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

  const requestLifecycleMessage = getRequestLifecycleMessage({
    orderStatus: orderStatusKey,
    estimationStatus: estimationStatusKey,
    paymentStatus: requestData?.payment_status,
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
          <div className="checkout-layout crd-layout">
            <div
              className={`checkout-form-panel wisdom-request-details-main-v11 wisdom-request-tab-${activeRequestTab}-v12`}
            >
              <div
                className="wisdom-request-tabs-v12"
                role="tablist"
                aria-label="Request details sections"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeRequestTab === "overview"}
                  className={
                    activeRequestTab === "overview"
                      ? "wisdom-request-tab-btn-v12 is-active"
                      : "wisdom-request-tab-btn-v12"
                  }
                  onClick={() => setActiveRequestTab("overview")}
                >
                  Overview
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeRequestTab === "quotation"}
                  className={
                    activeRequestTab === "quotation"
                      ? "wisdom-request-tab-btn-v12 is-active"
                      : "wisdom-request-tab-btn-v12"
                  }
                  onClick={() => setActiveRequestTab("quotation")}
                >
                  Quotation &amp; Payment
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={activeRequestTab === "messages"}
                  className={
                    activeRequestTab === "messages"
                      ? "wisdom-request-tab-btn-v12 is-active"
                      : "wisdom-request-tab-btn-v12"
                  }
                  onClick={() => setActiveRequestTab("messages")}
                >
                  Messages
                </button>
              </div>
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
              ) : quotationMessage ? (
                <div className="checkout-section wisdom-request-quotation-v11">
                  <div className="checkout-section-header">
                    <div className="checkout-section-num">02</div>
                    <h3>Quotation &amp; payment</h3>
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
              {remainingPaymentMethodLocked ? (
                <div className="checkout-section">
                  <div className="checkout-section-header">
                    <div className="checkout-section-num">03B</div>
                    <h3>Remaining Balance Payment Method</h3>
                  </div>
                  <div style={{ padding: "0 4px 4px" }}>
                    <p>
                      Locked for this delivery:{" "}
                      <strong>
                        {REMAINING_METHOD_LABELS[remainingPaymentMethod] ||
                          "Not set"}
                      </strong>
                    </p>
                    <p className="crd-mini-meta">
                      This can no longer be changed for this order.
                    </p>
                  </div>
                </div>
              ) : canSelectRemainingPaymentMethod ? (
                <div className="checkout-section">
                  <div className="checkout-section-header">
                    <div className="checkout-section-num">03B</div>
                    <h3>Choose Payment Method for Remaining Balance</h3>
                  </div>

                  {remainingMethodError ? (
                    <div className="crd-alert crd-alert-error">
                      {remainingMethodError}
                    </div>
                  ) : null}

                  <div className="crd-payment-method-grid">
                    <div className="crd-payment-method-card">
                      <h4>Cash</h4>
                      <p>
                        Pay the exact remaining balance to the assigned
                        rider upon delivery.
                      </p>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={
                          selectingRemainingMethod ||
                          remainingPaymentMethod === "cash"
                        }
                        onClick={() =>
                          handleSelectRemainingPaymentMethod("cash")
                        }
                      >
                        {remainingPaymentMethod === "cash"
                          ? "Selected: Cash"
                          : "Choose Cash"}
                      </button>
                    </div>

                    <div className="crd-payment-method-card">
                      <h4>Online Payment</h4>
                      <p>Pay the exact remaining balance online.</p>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        disabled={
                          selectingRemainingMethod ||
                          remainingPaymentMethod === "paymongo"
                        }
                        onClick={() =>
                          handleSelectRemainingPaymentMethod("paymongo")
                        }
                      >
                        {remainingPaymentMethod === "paymongo"
                          ? "Selected: Online Payment"
                          : "Choose Online Payment"}
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* PHASE 5B — Blueprint Remaining Balance Online Payment */}
              {canPayRemainingBalanceOnline ? (
                <div className="checkout-section">
                  <div className="checkout-section-header">
                    <div className="checkout-section-num">03C</div>
                    <h3>Pay Remaining Balance Online</h3>
                  </div>
                  <div style={{ padding: "0 4px 4px" }}>
                    <div className="summary-row">
                      <span>Remaining Balance</span>
                      <strong>{formatMoney(balanceDue)}</strong>
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary crd-paymongo-btn"
                      disabled={payingRemainingBalance}
                      onClick={handlePayRemainingBalanceOnline}
                    >
                      <div>
                        {payingRemainingBalance
                          ? "Redirecting..."
                          : "Pay Remaining Balance Online"}
                      </div>
                      <strong>{formatMoney(balanceDue)}</strong>
                    </button>
                    <div className="crd-help-text">
                      You will be redirected to our secure checkout page to
                      complete your payment.
                    </div>
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
                  <h3>Submitted design</h3>

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

              <div className="checkout-section wisdom-request-messages-v11">
                <div className="checkout-section-header">
                  <div className="checkout-section-num">06</div>
                  <h3>Messages</h3>
                </div>

                <div className="checkout-section-body">
                  <div className="crd-chat-wrap wisdom-request-chat-v13">
                    <div className="crd-chat-card">
                      <div className="crd-chat-card-head">Conversation</div>

                      <div className="crd-chat-thread">
                        {!discussionThread.length ? (
                          <div className="crd-chat-empty">
                            No messages yet. Send a message to our team below.
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
                      className="crd-chat-form wisdom-request-chat-form-v13"
                    >
                      <div className="crd-chat-form-title">Send message</div>

                      <textarea
                        rows={4}
                        value={discussionMessage}
                        onChange={(e) => setDiscussionMessage(e.target.value)}
                        placeholder="Write your clarification, concern, or request update here."
                        className="crd-control crd-textarea wisdom-chat-input-v13"
                      />

                      <div>
                        <label className="crd-field-label wisdom-chat-attachments-label-v13">Attach files</label>

                        <input
                          type="file"
                          multiple
                          accept=".jpg,.jpeg,.png,.webp,.pdf"
                          onChange={handleDiscussionFilesChange}
                          className="crd-file-input wisdom-chat-file-input-v13"
                        />

                        <div className="crd-help-text">
                          Up to 5 JPG, PNG, WEBP, or PDF files.
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

                      <div className="crd-chat-form-actions wisdom-chat-send-v13">
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

            <div className="checkout-summary wisdom-request-status-v11">
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

                {showPaymentInStatus ? (
                  <>
                    <div className="summary-row">
                      <span>Payment</span>
                      <span style={{ color: payMeta.color, fontWeight: 700 }}>
                        {payMeta.label}
                      </span>
                    </div>

                    <div className="summary-row">
                      <span>{paymentMethodFieldLabel}</span>
                      <span>{displayPaymentMethod}</span>
                    </div>
                  </>
                ) : null}

                <div className="summary-row">
                  <span>Total</span>
                  <span className="crd-summary-total">
                    {quotedTotal > 0
                      ? formatMoney(quotedTotal)
                      : "Pending quotation"}
                  </span>
                </div>

                <div className="crd-whats-next-v12">What's next</div>
                <p className="summary-note" style={{ marginTop: 6 }}>
                  {requestLifecycleMessage}
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