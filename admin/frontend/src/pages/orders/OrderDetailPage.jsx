// src/pages/orders/OrderDetailPage.jsx – compact polished detail view (Admin)
import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api, { buildAssetUrl } from "../../services/api";
import toast from "react-hot-toast";
import AdminSubmittedDesignPreview from "./AdminSubmittedDesignPreview";
import OrderDiscussionPanel from "./OrderDiscussionPanel";
import "../../components/motion-feedback.css";

const parseMapCoordinate = (value) => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const getGoogleMapsHref = (lat, lng) => {
  const latitude = parseMapCoordinate(lat);
  const longitude = parseMapCoordinate(lng);

  if (
    latitude === null ||
    longitude === null ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
};

const STATUS_STYLE = {
  pending: { bg: "#fff7ed", color: "#c2410c", border: "#fed7aa" },
  confirmed: { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" },
  contract_released: { bg: "#faf5ff", color: "#7e22ce", border: "#e9d5ff" },
  production: { bg: "#faf5ff", color: "#7e22ce", border: "#e9d5ff" },
  shipping: { bg: "#fff7ed", color: "#c2410c", border: "#fed7aa" },
  delivered: { bg: "#ecfdf5", color: "#047857", border: "#a7f3d0" },
  completed: { bg: "#ecfdf5", color: "#047857", border: "#a7f3d0" },
  cancelled: { bg: "#fef2f2", color: "#b91c1c", border: "#fecaca" },
};

const STATUS_LABELS = {
  pending: "Pending",
  confirmed: "Confirmed",
  contract_released: "Contract Released",
  production: "Production",
  shipping: "Shipping",
  delivered: "Delivered",
  completed: "Completed",
  cancelled: "Cancelled",
};

const ONLINE_STANDARD_DELIVERY_TIMELINE = [
  "pending",
  "confirmed",
  "shipping",
  "delivered",
  "completed",
];

const ONLINE_STANDARD_PICKUP_TIMELINE = ["pending", "confirmed", "completed"];

const BLUEPRINT_TIMELINE = [
  "pending",
  "confirmed",
  "contract_released",
  "production",
  "shipping",
  "delivered",
  "completed",
];

const WALKIN_PICKUP_TIMELINE = ["pending", "confirmed", "completed"];

const WALKIN_DELIVERY_TIMELINE = [
  "pending",
  "confirmed",
  "shipping",
  "delivered",
  "completed",
];

const WALKIN_BLUEPRINT_TIMELINE = [
  "pending",
  "confirmed",
  "contract_released",
  "production",
  "completed",
];

const DETAIL_TABS = [
  { key: "overview", label: "Overview" },
  { key: "payment", label: "Payment" },
  { key: "fulfillment", label: "Delivery" },
  { key: "blueprint", label: "Blueprint" },
  { key: "discussion", label: "Discussion" },
];

const STATUS_TRANSITIONS = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["contract_released", "production", "cancelled"],
  contract_released: ["production", "cancelled"],
  production: ["shipping", "cancelled"],
  shipping: ["delivered", "completed"],
  delivered: ["completed"],
  completed: [],
  cancelled: [],
};

const PAYMENT_STYLE = {
  unpaid: { bg: "#fff7ed", color: "#c2410c", border: "#fed7aa" },
  paid: { bg: "#ecfdf5", color: "#047857", border: "#a7f3d0" },
  partial: { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" },
  pending: { bg: "#fff7ed", color: "#c2410c", border: "#fed7aa" },
  verified: { bg: "#ecfdf5", color: "#047857", border: "#a7f3d0" },
  rejected: { bg: "#fef2f2", color: "#b91c1c", border: "#fecaca" },
};

const TASK_STYLE = {
  pending: { bg: "#ffffff", color: "#52525b", border: "#d4d4d8" },
  in_progress: { bg: "#f4f4f5", color: "#18181b", border: "#e4e4e7" },
  blocked: { bg: "#fff7ed", color: "#a16207", border: "#fde68a" },
  completed: { bg: "#0a0a0a", color: "#ffffff", border: "#0a0a0a" },
};

const normalize = (value) => String(value || "").toLowerCase();

function normalizeTaskRole(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

const BLUEPRINT_TASK_ROLE_OPTIONS = [
  "Cutting Machine",
  "Edge Banding",
  "Horizontal Drilling",
  "Retouching",
  "Packing",
];

const REQUIRED_BLUEPRINT_TASK_ROLES =
  BLUEPRINT_TASK_ROLE_OPTIONS.map(normalizeTaskRole);

const getTaskRoleLabel = (role) =>
  BLUEPRINT_TASK_ROLE_OPTIONS.find(
    (option) => normalizeTaskRole(option) === normalizeTaskRole(role),
  ) || titleCase(role);

const titleCase = (value) => {
  const str = String(value || "").replace(/_/g, " ");
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : "—";
};

const prettify = (value) =>
  String(value ?? "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

const formatMoney = (value) =>
  `₱ ${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
  })}`;

const formatDateTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("en-PH", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
};

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("en-PH", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
};

const getStatusLabel = (status) =>
  STATUS_LABELS[normalize(status)] || titleCase(status);

const getChannelMeta = (channel) => {
  const key = normalize(channel);
  return key === "online"
    ? { label: "Online", bg: "#f4f4f5", color: "#18181b", border: "#e4e4e7" }
    : { label: "Walk-in", bg: "#ffffff", color: "#52525b", border: "#d4d4d8" };
};

const getTone = (
  styleMap,
  key,
  fallback = { bg: "#f4f4f5", color: "#18181b", border: "#e4e4e7" },
) => styleMap[normalize(key)] || fallback;

const getTimelineStepState = (steps, currentStatus, stepKey) => {
  const currentIndex = steps.indexOf(currentStatus);
  const stepIndex = steps.indexOf(stepKey);

  if (currentIndex === -1) {
    return stepIndex === 0 ? "current" : "upcoming";
  }

  if (stepIndex < currentIndex) return "done";
  if (stepIndex === currentIndex) return "current";
  return "upcoming";
};

const getTimelineNote = (
  step,
  {
    order,
    blueprintTasks,
    hasBlueprintTasks,
    completedBlueprintTasks,
    hasSignedDeliveryReceipt,
    isWalkInOrder,
  },
) => {
  switch (step) {
    case "pending":
      return order?.created_at
        ? `Created ${formatDate(order.created_at)}`
        : "Awaiting review";

    case "confirmed":
      return normalize(
        order?.payment_status_display || order?.payment_status,
      ) === "paid"
        ? "Payment settled"
        : titleCase(
            order?.payment_status_display || order?.payment_status || "unpaid",
          );

    case "contract_released":
      return order?.contract ? "Contract available" : "Waiting for contract";

    case "production":
      if (hasBlueprintTasks) {
        return `${completedBlueprintTasks.length}/${blueprintTasks.length} blueprint task${
          blueprintTasks.length === 1 ? "" : "s"
        } completed`;
      }
      return "Ready for production";

    case "shipping":
      if (order?.delivery?.scheduled_date) {
        return `Scheduled ${formatDate(order.delivery.scheduled_date)}`;
      }
      return order?.delivery
        ? "Delivery prepared"
        : "Awaiting delivery schedule";

    case "delivered":
      if (isWalkInOrder) {
        return order?.delivery?.delivered_date
          ? `Delivered ${formatDate(order.delivery.delivered_date)}`
          : order?.delivery
            ? "Delivery completed"
            : "Not yet delivered";
      }

      return hasSignedDeliveryReceipt
        ? "Proof of Delivery uploaded"
        : order?.delivery
          ? "Awaiting Proof of Delivery"
          : "Not yet delivered";

    case "completed":
      return normalize(
        order?.payment_status_display || order?.payment_status,
      ) === "paid"
        ? "Transaction closed"
        : "Order finalized";
    default:
      return "";
  }
};

const safeParseUrls = (raw) => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter(Boolean);
    if (typeof parsed === "string" && parsed.trim()) return [parsed];
  } catch {
    return [raw]; // If it's just a normal URL string, return it in an array
  }
  return [];
};

const getProofType = (url) => {
  const cleanUrl = String(url || "")
    .split("?")[0]
    .toLowerCase();

  if (/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/.test(cleanUrl)) return "image";
  if (/\.pdf$/.test(cleanUrl)) return "pdf";
  return "other";
};

const hasCustomEditorSnapshot = (item) =>
  Array.isArray(item?.editor_snapshot?.components) &&
  item.editor_snapshot.components.length > 0;

const getCustomRequestDims = (item = {}) => {
  const components = Array.isArray(item?.editor_snapshot?.components)
    ? item.editor_snapshot.components
    : [];

  if (!components.length) {
    return {
      width: Number(item.requested_width) || 0,
      height: Number(item.requested_height) || 0,
      depth: Number(item.requested_depth) || 0,
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
    width: Math.round(maxX - minX) || Number(item.requested_width) || 0,
    height: Math.round(maxY - minY) || Number(item.requested_height) || 0,
    depth: Math.round(maxZ - minZ) || Number(item.requested_depth) || 0,
  };
};

const buildCustomRequestPreviewBlueprint = (item) => {
  const components = Array.isArray(item?.editor_snapshot?.components)
    ? item.editor_snapshot.components
    : [];

  const worldSize =
    item?.editor_snapshot?.worldSize &&
    typeof item.editor_snapshot.worldSize === "object"
      ? item.editor_snapshot.worldSize
      : { w: 6400, h: 3200, d: 5200 };

  const dims = getCustomRequestDims(item);

  return {
    id: item.product_id || item.id,
    title: item.display_name || item.product_name || "Custom Furniture",
    thumbnail_url: item.preview_image_url || "",
    preview_image_url: item.preview_image_url || "",
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
      wood_type: item.requested_wood_type || "",
      finish_color: item.requested_finish_color || "",
      door_style: item.requested_door_style || "",
      hardware: item.requested_hardware || "",
    },
  };
};

export default function OrderDetailPage() {
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);
  const { id } = useParams();
  const navigate = useNavigate();

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);

  const [statusModal, setStatusModal] = useState(false);
  const [newStatus, setNewStatus] = useState("");
  const [statusModalMode, setStatusModalMode] = useState("general");
  // Guards against double-submit: without this, a fast double-click (or a
  // slow network) can fire handleStatusUpdate twice concurrently — the
  // first call succeeds, then the second arrives after the status has
  // already changed and gets rejected as an "invalid transition",
  // producing a confusing error+error+success toast sequence even
  // though the update itself worked correctly.
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const paymentReviewLockRef = useRef(false);
  const [reviewingPayment, setReviewingPayment] = useState({
    id: null,
    action: "",
  });
  const [paymentVerifyFeedback, setPaymentVerifyFeedback] = useState({
    id: null,
    status: "idle",
  });
  const [recordingCashPayment, setRecordingCashPayment] = useState(false);
  const [cashPaymentError, setCashPaymentError] = useState("");
  const [customCashAmount, setCustomCashAmount] = useState("");

  const [proofPreview, setProofPreview] = useState({
    open: false,
    url: "",
    type: "other",
  });

  const [deliveryReceiptPreview, setDeliveryReceiptPreview] = useState({
    open: false,
    url: "",
    type: "other",
  });

  const [customRequestPreviewItem, setCustomRequestPreviewItem] =
    useState(null);
  const [customRequestActionLoading, setCustomRequestActionLoading] =
    useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const canUseDiscussion = normalize(order?.order_type) === "blueprint";

  const [reassignModal, setReassignModal] = useState(false);
  const [reassignableStaff, setReassignableStaff] = useState([]);
  const [loadingReassignable, setLoadingReassignable] = useState(false);
  const [reassigning, setReassigning] = useState(false);
  const [reassignStaffId, setReassignStaffId] = useState("");
  const [updatingTaskId, setUpdatingTaskId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/orders/${id}`);
      setOrder(data);
      setNewStatus(data.status);
    } catch (err) {
      toast.error(
        err?.response?.data?.message || "Failed to load order details.",
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [id]); // eslint-disable-line

  useEffect(() => {
    if (activeTab === "discussion" && !canUseDiscussion) {
      setActiveTab("overview");
    }
  }, [activeTab, canUseDiscussion]);

  // WISDOM ADMIN STATUS FIRST-CLICK FIX V1
  // A freshly opened controlled <select> can visually show its first option
  // for one render while newStatus still contains the previous/current order
  // status. Resolve against the actual selectable modal options so the first
  // submit always uses the same valid status the admin sees on screen.
  const handleStatusUpdate = async () => {
    if (updatingStatus) return;

    const normalizedModalStatuses = statusModalStatuses.map((status) =>
      normalize(status),
    );
    const selectedStatus = normalize(newStatus);
    const fallbackStatus = normalize(statusModalStatuses[0] || "");

    const nextStatus =
      selectedStatus &&
      selectedStatus !== currentOrderStatus &&
      normalizedModalStatuses.includes(selectedStatus)
        ? selectedStatus
        : fallbackStatus;

    if (
      !nextStatus ||
      nextStatus === currentOrderStatus ||
      !normalizedModalStatuses.includes(nextStatus)
    ) {
      toast.error("Select a valid next status first.");
      return;
    }

    const blueprintTasks = Array.isArray(order?.blueprint_tasks)
      ? order.blueprint_tasks
      : [];
    const hasBlueprintTasks = blueprintTasks.length > 0;

    if (
      isBlueprintOrder &&
      ["shipping", "delivered", "completed"].includes(nextStatus)
    ) {
      if (!hasRequiredBlueprintTaskPacket) {
        toast.error(
          `Create all required production tasks first: ${missingRequiredBlueprintTaskRoles
            .map(getTaskRoleLabel)
            .join(", ")}.`,
        );
        return;
      }
      if (!allBlueprintTasksCompleted) {
        toast.error(
          `Complete all required production tasks first: ${incompleteRequiredBlueprintTaskRoles
            .map(getTaskRoleLabel)
            .join(", ")}.`,
        );
        return;
      }
    }

    // 👉 NEW: Strict Payment Verification Check
    if (
      !isBlueprintOrder &&
      nextStatus === "shipping" &&
      normalizedPaymentMethod !== "cod" &&
      paymentBalance > 0
    ) {
      toast.error("The payment need to be verified first.");
      return;
    }

    // 👉 NEW: Strict Delivery Rider Checks
    if (
      hasDeliveryRequirement &&
      ["delivered", "completed"].includes(nextStatus)
    ) {
      if (!order?.delivery) {
        toast.error("You need to assign a delivery rider first.");
        return;
      }
      if (!hasSignedDeliveryReceipt) {
        toast.error("It must be delivered and finished by the rider first.");
        return;
      }
    }

    if (
      isBlueprintOrder &&
      nextStatus === "production" &&
      !hasRequiredBlueprintDownPayment
    ) {
      toast.error(
        "Blueprint orders require at least a 30% verified down payment before moving to production.",
      );
      return;
    }

    setUpdatingStatus(true);
    try {
      await api.patch(`/orders/${id}/status`, { status: nextStatus });
      toast.success(`Status updated to "${titleCase(nextStatus)}".`);
      setStatusModal(false);
      setStatusModalMode("general");
      load();
    } catch (err) {
      toast.error(
        err?.response?.data?.message || "Failed to update order status.",
      );
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleAccept = async () => {
    try {
      await api.post(`/orders/${id}/accept`);
      toast.success("Order accepted.");
      load();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to accept order.");
    }
  };

  const handleDecline = async () => {
    const reason = window.prompt("Enter reason for declining:");
    if (reason === null) return;

    try {
      await api.post(`/orders/${id}/decline`, { reason });
      toast.success("Order declined.");
      load();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to decline order.");
    }
  };

  const verifyPayment = async (paymentId, action) => {
    if (paymentReviewLockRef.current) return;
    paymentReviewLockRef.current = true;
    setReviewingPayment({ id: paymentId, action });
    if (action === "verified") {
      setPaymentVerifyFeedback({ id: paymentId, status: "loading" });
    }
    try {
      const { data } = await api.post(`/orders/${id}/verify-payment`, {
        payment_id: paymentId,
        action,
      });
      if (action === "verified") {
        setPaymentVerifyFeedback({ id: paymentId, status: "success" });

        await new Promise((resolve) => {
          window.setTimeout(resolve, 700);
        });
      }

      toast.success(data?.message || `Payment ${action}.`);
      await load();
    } catch (err) {
      // api.js's shared interceptor already toasts status 400 (generic
      // message block), 403, 422, 500, and network/no-response errors. It
      // intentionally does NOT toast 401 (session cleanup/redirect only)
      // or 404. Only fall back locally for 404, so no failure is ever
      // shown to the admin twice.
      if (err?.response?.status === 404) {
        toast.error(
          err?.response?.data?.message ||
            `Failed to mark payment as ${action}.`,
        );
      }
    } finally {
      paymentReviewLockRef.current = false;
      setReviewingPayment({ id: null, action: "" });
      setPaymentVerifyFeedback({ id: null, status: "idle" });
    }
  };

  // Strict preview-only parser for the SUBMITTED amount -- rejects
  // everything the backend's parseStrictMoneyToCents rejects (empty,
  // zero, negative, plus signs, commas, currency symbols, letters,
  // scientific notation, more than two decimal places). Used only to
  // decide whether the confirmation dialog may open and to format the
  // confirmation text -- the raw trimmed string, never a value derived
  // from this parser, is what gets sent to the backend. Returns null
  // for invalid input; never silently truncates extra decimal digits.
  const parseStrictPreviewCents = (value) => {
    const str = String(value ?? "").trim();
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(str);
    if (!match) return null;
    const whole = match[1];
    const frac = (match[2] || "").padEnd(2, "0");
    const centsStr = `${whole}${frac}`;
    if (!/^\d+$/.test(centsStr)) return null;
    const cents = Number(centsStr);
    if (!Number.isSafeInteger(cents) || cents <= 0) return null;
    return cents;
  };

  // Same anchored-regex, no-floating-point approach, but for a TRUSTED
  // server-supplied decimal (e.g. remaining_balance), which may
  // legitimately be zero.
  const parseTrustedDisplayCents = (value) => {
    const str = String(value ?? "").trim();
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(str);
    if (!match) return null;
    const whole = match[1];
    const frac = (match[2] || "").padEnd(2, "0");
    const centsStr = `${whole}${frac}`;
    if (!/^\d+$/.test(centsStr)) return null;
    const cents = Number(centsStr);
    if (!Number.isSafeInteger(cents) || cents < 0) return null;
    return cents;
  };

  const recordBlueprintCashPayment = async (amountRaw) => {
    if (recordingCashPayment) return;

    const summary = order?.blueprint_cash_payment;
    const trimmedAmount = String(amountRaw || "").trim();
    if (!summary || !trimmedAmount) return;

    setCashPaymentError("");

    const amountCents = parseStrictPreviewCents(trimmedAmount);
    const remainingBeforeCents = parseTrustedDisplayCents(
      summary.remaining_balance,
    );

    if (amountCents === null || remainingBeforeCents === null) {
      setCashPaymentError("Enter a valid payment amount.");
      return;
    }

    const remainingAfterCents = Math.max(0, remainingBeforeCents - amountCents);

    let previewStatus;
    if (amountCents === remainingBeforeCents) {
      previewStatus = "Paid";
    } else if (amountCents < remainingBeforeCents) {
      previewStatus = "Partial";
    } else {
      previewStatus =
        "exceeds the displayed remaining balance -- the server will validate this";
    }

    const confirmed = window.confirm(
      `Confirm that ${formatMoney(amountCents / 100)} was received in cash at the store for order ${summary.order_number}.\n\n` +
        `Current remaining balance: ${formatMoney(remainingBeforeCents / 100)}\n` +
        `Remaining balance after this payment: ${formatMoney(remainingAfterCents / 100)}\n\n` +
        `This cash payment will be recorded as immediately verified. ` +
        `Resulting payment status: ${previewStatus}.`,
    );
    if (!confirmed) return;

    setRecordingCashPayment(true);
    try {
      const { data } = await api.post(`/pos/blueprint-cash-payments/${id}`, {
        amount: trimmedAmount,
      });
      setCashPaymentError("");
      toast.success(data?.message || "Cash payment recorded successfully.");
      setCustomCashAmount("");
      await load();
    } catch (err) {
      setCashPaymentError(
        err?.response?.data?.message ||
          "Failed to record cash payment. Please try again.",
      );
    } finally {
      setRecordingCashPayment(false);
    }
  };

  const openProofPreview = (url) => {
    const resolvedUrl = buildAssetUrl(url);
    setProofPreview({
      open: true,
      url: resolvedUrl,
      type: getProofType(resolvedUrl),
    });
  };

  const closeProofPreview = () => {
    setProofPreview({
      open: false,
      url: "",
      type: "other",
    });
  };

  const openDeliveryReceiptPreview = (url) => {
    const resolvedUrl = buildAssetUrl(url);
    setDeliveryReceiptPreview({
      open: true,
      url: resolvedUrl,
      type: getProofType(resolvedUrl),
    });
  };

  const closeDeliveryReceiptPreview = () => {
    setDeliveryReceiptPreview({
      open: false,
      url: "",
      type: "other",
    });
  };

  const openCustomRequestPreview = (item) => {
    setCustomRequestPreviewItem(item || null);
  };

  const closeCustomRequestPreview = () => {
    setCustomRequestPreviewItem(null);
  };

  const handleCustomRequestAction = async (action) => {
    if (!order?.id) return;

    let payload = {};

    if (action === "reject") {
      const reason = window.prompt("Enter rejection reason:");
      if (reason === null) return;
      payload = { reason };
    }

    setCustomRequestActionLoading(action);

    try {
      const { data } = await api.post(
        `/orders/${order.id}/custom-request/${action}`,
        payload,
      );

      toast.success(data?.message || "Custom request updated.");
      load();
    } catch (err) {
      toast.error(
        err?.response?.data?.message || "Failed to update custom request.",
      );
    } finally {
      setCustomRequestActionLoading("");
    }
  };

  const openAssignModal = () => {
    if (!blueprintId) {
      toast.error("This order is not linked to a blueprint.");
      return;
    }

    if (!canAssignBlueprintStaff) {
      toast.error(
        "Staff assignment is only available after contract release or during production.",
      );
      return;
    }

    if (hasBlueprintTasks) {
      toast.error(
        "This production order already has a primary indoor staff assignment.",
      );
      return;
    }

    const params = new URLSearchParams({
      assign_order_id: String(order?.id || id),
    });
    navigate(`/admin/tasks?${params.toString()}`);
  };

  const openReassignModal = async () => {
    setLoadingReassignable(true);
    try {
      const { data } = await api.get(`/orders/${id}/assignable-staff`);
      setReassignableStaff(Array.isArray(data?.staff) ? data.staff : []);
      setReassignStaffId("");
      setReassignModal(true);
    } catch (err) {
      if (err.response?.status === 404) {
        toast.error(err.response?.data?.message || "Order not found.");
      }
    } finally {
      setLoadingReassignable(false);
    }
  };

  const handleReassignStaff = async () => {
    if (!reassignStaffId) {
      toast.error("Please select a staff member.");
      return;
    }

    setReassigning(true);
    try {
      const { data } = await api.patch(`/orders/${id}/reassign-staff`, {
        staff_id: Number(reassignStaffId),
      });
      toast.success(
        data?.message || "Production staff reassigned successfully.",
      );
      setReassignModal(false);
      load();
    } catch (err) {
      if (err.response?.status === 404) {
        toast.error(err.response?.data?.message || "Order not found.");
      }
    } finally {
      setReassigning(false);
    }
  };

  const handleTaskStatusUpdate = async (taskId, nextStatus) => {
    setUpdatingTaskId(taskId);

    try {
      const { data } = await api.patch(`/orders/${id}/tasks/${taskId}/status`, {
        status: nextStatus,
      });

      toast.success(
        data?.message || `Task marked as "${titleCase(nextStatus)}".`,
      );
      load();
    } catch (err) {
      toast.error(
        err?.response?.data?.message || "Failed to update task status.",
      );
    } finally {
      setUpdatingTaskId(null);
    }
  };

  if (loading) return <div style={center}>Loading order...</div>;
  if (!order) return <div style={center}>Order not found.</div>;

  const normalizedOrderStatus = normalize(order?.status);
  const statusTone = getTone(STATUS_STYLE, normalizedOrderStatus);
  const channelMeta = getChannelMeta(order?.channel || order?.type);
  const normalizedPaymentStatus = normalize(
    order?.payment_status_display || order?.payment_status || "unpaid",
  );
  const normalizedPaymentMethod = normalize(order?.payment_method);
  const isCashLikePaymentMethod = ["cash", "cod", "cop"].includes(
    normalizedPaymentMethod,
  );
  const orderPaymentTone = getTone(PAYMENT_STYLE, normalizedPaymentStatus);
  const PAY_METHOD_LABELS = {
    cod: "Cash on Delivery",
    cop: "Cash on Pick-up",
    gcash: "GCash",
    bank_transfer: "Bank Transfer",
    paymongo: "Online Payment",
    cash: "Cash",
  };

  const blueprintTasks = Array.isArray(order?.blueprint_tasks)
    ? order.blueprint_tasks
    : [];

  const hasBlueprintTasks = blueprintTasks.length > 0;

  const activeBlueprintTasks = blueprintTasks.filter((task) =>
    ["pending", "in_progress", "blocked"].includes(normalize(task?.status)),
  );

  const completedBlueprintTasks = blueprintTasks.filter(
    (task) => normalize(task?.status) === "completed",
  );

  const existingBlueprintTaskRoles = new Set(
    blueprintTasks
      .map((task) => normalizeTaskRole(task?.task_role))
      .filter(Boolean),
  );

  const completedBlueprintTaskRoles = new Set(
    completedBlueprintTasks
      .map((task) => normalizeTaskRole(task?.task_role))
      .filter(Boolean),
  );

  const missingRequiredBlueprintTaskRoles =
    REQUIRED_BLUEPRINT_TASK_ROLES.filter(
      (role) => !existingBlueprintTaskRoles.has(role),
    );

  const incompleteRequiredBlueprintTaskRoles =
    REQUIRED_BLUEPRINT_TASK_ROLES.filter(
      (role) => !completedBlueprintTaskRoles.has(role),
    );

  const hasRequiredBlueprintTaskPacket =
    missingRequiredBlueprintTaskRoles.length === 0;

  const allBlueprintTasksCompleted =
    incompleteRequiredBlueprintTaskRoles.length === 0;

  // A task that is actively being worked on must be put on hold first.
  // Pending and On Hold work can then move together to the replacement staff.
  const hasInProgressTask = blueprintTasks.some(
    (task) => normalize(task?.status) === "in_progress",
  );
  const remainingCountByStaffId = blueprintTasks.reduce((acc, task) => {
    if (
      ["pending", "blocked"].includes(normalize(task?.status)) &&
      task?.assigned_to
    ) {
      acc[task.assigned_to] = (acc[task.assigned_to] || 0) + 1;
    }
    return acc;
  }, {});
  const transferPreviewCount = reassignStaffId
    ? blueprintTasks.filter(
        (task) =>
          ["pending", "blocked"].includes(normalize(task?.status)) &&
          String(task?.assigned_to || "") !== String(reassignStaffId),
      ).length
    : 0;

  const isDeliveryPhaseOrDone = [
    "shipping",
    "delivered",
    "completed",
    "cancelled",
  ].includes(normalizedOrderStatus);

  const currentOrderStatus = normalizedOrderStatus;
  const currentChannel = normalize(order?.channel || order?.type);
  const isWalkInOrder =
    currentChannel === "walkin" || currentChannel === "walk-in";

  const isOnlineOrder = currentChannel === "online";
  const hasPaymentRecords =
    Array.isArray(order?.payments) && order.payments.length > 0;
  const hasPendingPaymentActions =
    hasPaymentRecords &&
    order.payments.some((payment) => normalize(payment?.status) === "pending");
  const verifiedPaymentTotal = Number(order?.payment_verified_total || 0);
  const paymentBalance = Number(order?.payment_balance || 0);
  const hasContractTerms = Boolean(
    String(order?.contract?.materials_used || "").trim(),
  );
  const totalAmount = Number(order?.total_amount || order?.total || 0);
  const requiredBlueprintDownPayment = Number((totalAmount * 0.3).toFixed(2));

  const blueprintId =
    order?.contract?.blueprint_id || order?.blueprint_id || null;
  const canAssignBlueprintStaff =
    Boolean(blueprintId) &&
    ["contract_released", "production"].includes(normalize(order?.status));

  const hasBlueprintFlow = Boolean(
    blueprintId || order?.contract || hasBlueprintTasks,
  );

  const isBlueprintOrder =
    normalize(order?.order_type) === "blueprint" ||
    Boolean(blueprintId || order?.contract);
  const hasDeliveryRequirement = Boolean(
    order?.delivery ||
    String(order?.delivery_address || "").trim() ||
    String(order?.requested_delivery_date || "").trim(),
  );

  const latestEstimation = order?.latest_estimation || null;
  const hasEstimation = Boolean(latestEstimation?.id);
  const estimationStatus = normalize(latestEstimation?.status);
  const estimationApproved = estimationStatus === "approved";
  const estimationSentToCustomer = estimationStatus === "sent";
  const estimationRejectedByCustomer = estimationStatus === "rejected";

  const isStandardOrder = !isBlueprintOrder;

  const isWalkInStandardOrder = isWalkInOrder && isStandardOrder;
  const isWalkInPickupOrder = isWalkInStandardOrder && !hasDeliveryRequirement;
  const isWalkInDeliveryOrder = isWalkInStandardOrder && hasDeliveryRequirement;

  const isOnlineStandardOrder = isOnlineOrder && isStandardOrder;
  const isOnlineStandardPickupOrder =
    isOnlineStandardOrder && normalizedPaymentMethod === "cop";

  const isOnlineStandardDeliveryOrder =
    isOnlineStandardOrder && !isOnlineStandardPickupOrder;
  const requiresDeliveryReceiptForCompletion = hasDeliveryRequirement;
  const needsContractFirst =
    isBlueprintOrder &&
    normalizedOrderStatus === "confirmed" &&
    estimationApproved &&
    !order?.contract;
  const hasRequiredBlueprintDownPayment =
    normalizedPaymentStatus === "paid" ||
    verifiedPaymentTotal >= Math.max(0, requiredBlueprintDownPayment - 0.01);

  const standardNeedsFullPaymentBeforeFulfillment =
    !isWalkInOrder &&
    !isBlueprintOrder &&
    normalizedPaymentMethod !== "cod" &&
    paymentBalance > 0;

  const blueprintNeedsDownPaymentBeforeProduction =
    isBlueprintOrder &&
    ["confirmed", "contract_released"].includes(normalizedOrderStatus) &&
    !hasRequiredBlueprintDownPayment;
  const effectiveStatusTransitions = isBlueprintOrder
    ? isWalkInOrder
      ? {
          pending: ["confirmed", "cancelled"],
          confirmed: ["contract_released", "cancelled"],
          contract_released: ["production", "cancelled"],
          production: ["completed", "cancelled"],
          shipping: ["completed"],
          delivered: ["completed"],
          completed: [],
          cancelled: [],
        }
      : {
          pending: ["confirmed", "cancelled"],
          confirmed: ["contract_released", "cancelled"],
          contract_released: ["production", "cancelled"],
          production: ["shipping", "cancelled"],
          shipping: ["delivered", "completed"],
          delivered: ["completed"],
          completed: [],
          cancelled: [],
        }
    : isWalkInPickupOrder
      ? {
          pending: ["confirmed", "cancelled"],
          confirmed: ["completed", "cancelled"],
          contract_released: ["production", "cancelled"],
          production: ["completed", "cancelled"],
          shipping: ["completed"],
          delivered: ["completed"],
          completed: [],
          cancelled: [],
        }
      : isWalkInDeliveryOrder
        ? {
            pending: ["confirmed", "cancelled"],
            confirmed: ["shipping", "cancelled"],
            contract_released: ["production", "cancelled"],
            production: ["shipping", "cancelled"],
            shipping: ["delivered", "cancelled"],
            delivered: ["completed"],
            completed: [],
            cancelled: [],
          }
        : isOnlineStandardPickupOrder
          ? {
              pending: ["confirmed", "cancelled"],
              confirmed: ["completed", "cancelled"],
              contract_released: ["production", "cancelled"],
              production: ["completed", "cancelled"],
              shipping: ["completed"],
              delivered: ["completed"],
              completed: [],
              cancelled: [],
            }
          : {
              pending: ["confirmed", "cancelled"],
              confirmed: ["shipping", "cancelled"],
              contract_released: ["production", "cancelled"],
              production: ["shipping", "cancelled"],
              shipping: ["delivered", "completed"],
              delivered: ["completed"],
              completed: [],
              cancelled: [],
            };
  const allowedNextStatuses =
    effectiveStatusTransitions[currentOrderStatus] || [];
  const hasSignedDeliveryReceipt = Boolean(order?.delivery?.signed_receipt);
  const selectableNextStatuses = allowedNextStatuses.filter((status) => {
    const normalizedStatus = normalize(status);

    const blockedByIncompleteTasks =
      isBlueprintOrder &&
      ["shipping", "delivered", "completed"].includes(normalizedStatus) &&
      (!hasRequiredBlueprintTaskPacket || !allBlueprintTasksCompleted);

    const blockedByMissingReceipt =
      !isWalkInOrder &&
      normalizedStatus === "completed" &&
      (!order?.delivery || !hasSignedDeliveryReceipt);

    const blockedByUnsettledPayment =
      normalizedStatus === "completed" && paymentBalance > 0;

    const blockedByStandardFullPayment =
      !isWalkInOrder &&
      !isBlueprintOrder &&
      normalizedPaymentMethod !== "cod" &&
      ["shipping", "delivered"].includes(normalize(status)) &&
      paymentBalance > 0;

    const blockedByBlueprintDownPayment =
      isBlueprintOrder &&
      normalizedStatus === "production" &&
      !hasRequiredBlueprintDownPayment;

    return !(
      blockedByIncompleteTasks ||
      blockedByMissingReceipt ||
      blockedByUnsettledPayment ||
      blockedByStandardFullPayment ||
      blockedByBlueprintDownPayment
    );
  });

  const isCancelOnlyModal = statusModalMode === "cancel";
  const statusModalStatuses = isCancelOnlyModal
    ? allowedNextStatuses.filter((status) => normalize(status) === "cancelled")
    : selectableNextStatuses;
  const hasVerifiedCustomerPayment = verifiedPaymentTotal > 0;

  // For standard orders, the delivery phase begins immediately after it is confirmed.
  // For blueprint orders, it begins later at the shipping phase.
  const isDeliveryPhase = isBlueprintOrder
    ? ["shipping", "delivered", "completed"].includes(normalizedOrderStatus)
    : ["confirmed", "shipping", "delivered", "completed"].includes(
        normalizedOrderStatus,
      );

  const shouldShowMissingDeliverySection =
    requiresDeliveryReceiptForCompletion && !order?.delivery && isDeliveryPhase;

  const shouldShowStatusButton =
    currentOrderStatus !== "pending" &&
    selectableNextStatuses.length > 0 &&
    !needsContractFirst;

  const shouldShowFulfillmentTab = Boolean(
    order?.delivery ||
    order?.contract ||
    shouldShowMissingDeliverySection ||
    ["production", "shipping", "delivered", "completed"].includes(
      normalizedOrderStatus,
    ),
  );

  const nextStepLabel =
    normalizedOrderStatus === "pending"
      ? "Review order"
      : normalizedOrderStatus === "confirmed"
        ? isWalkInPickupOrder
          ? "Complete order"
          : isWalkInDeliveryOrder
            ? "Schedule delivery"
            : isOnlineStandardPickupOrder
              ? paymentBalance > 0
                ? "Await payment before completion"
                : "Complete order"
              : isOnlineStandardDeliveryOrder
                ? normalizedPaymentMethod === "cod"
                  ? "Prepare delivery"
                  : paymentBalance > 0
                    ? "Await full payment before shipping"
                    : "Prepare delivery"
                : isBlueprintOrder
                  ? !hasEstimation
                    ? "Create estimate"
                    : estimationSentToCustomer
                      ? "Waiting for customer approval"
                      : estimationRejectedByCustomer
                        ? "Revise and resend estimate"
                        : !estimationApproved
                          ? "Send estimate"
                          : !order?.contract
                            ? "Generate contract"
                            : "Review order"
                  : "Review order"
        : normalizedOrderStatus === "contract_released"
          ? "Move to production"
          : normalizedOrderStatus === "production"
            ? isWalkInOrder
              ? "Complete order when finished"
              : "Prepare delivery"
            : normalizedOrderStatus === "shipping"
              ? "Confirm delivery"
              : normalizedOrderStatus === "delivered"
                ? requiresDeliveryReceiptForCompletion &&
                  !hasSignedDeliveryReceipt
                  ? "Review proof and complete"
                  : "Complete order"
                : normalizedOrderStatus === "completed"
                  ? "Order closed"
                  : normalizedOrderStatus === "cancelled"
                    ? "Order closed"
                    : "Review order";

  const timelineSteps = isWalkInPickupOrder
    ? WALKIN_PICKUP_TIMELINE
    : isWalkInDeliveryOrder
      ? WALKIN_DELIVERY_TIMELINE
      : isOnlineStandardPickupOrder
        ? ONLINE_STANDARD_PICKUP_TIMELINE
        : isOnlineStandardDeliveryOrder
          ? ONLINE_STANDARD_DELIVERY_TIMELINE
          : isBlueprintOrder || hasBlueprintFlow
            ? isWalkInOrder && !hasDeliveryRequirement
              ? WALKIN_BLUEPRINT_TIMELINE
              : BLUEPRINT_TIMELINE
            : ONLINE_STANDARD_DELIVERY_TIMELINE;

  const timelineCurrentKey =
    normalizedOrderStatus === "cancelled"
      ? order?.delivery
        ? "shipping"
        : hasBlueprintTasks
          ? "production"
          : normalizedPaymentStatus === "paid"
            ? "confirmed"
            : "pending"
      : currentOrderStatus;

  const assignmentPhaseText =
    normalizedOrderStatus === "shipping"
      ? "Ready for delivery"
      : normalizedOrderStatus === "delivered"
        ? "Delivered, awaiting final completion"
        : normalizedOrderStatus === "completed"
          ? "Order completed"
          : normalizedOrderStatus === "cancelled"
            ? "Order cancelled"
            : allBlueprintTasksCompleted
              ? "All required production tasks completed"
              : canAssignBlueprintStaff
                ? missingRequiredBlueprintTaskRoles.length > 0
                  ? `Assign remaining: ${missingRequiredBlueprintTaskRoles
                      .map(getTaskRoleLabel)
                      .join(", ")}`
                  : `Complete remaining: ${incompleteRequiredBlueprintTaskRoles
                      .map(getTaskRoleLabel)
                      .join(", ")}`
                : "Waiting for production";

  const customRequestItems = Array.isArray(order?.custom_request_items)
    ? order.custom_request_items
    : [];

  const hasCustomRequestItems = customRequestItems.length > 0;
  const orderItems = Array.isArray(order?.items) ? order.items : [];
  const readyMadeAssemblyChoice =
    normalize(order?.order_type) === "standard"
      ? normalize(
          orderItems.find((item) =>
            ["included", "none"].includes(
              normalize(item?.requested_assembly_choice),
            ),
          )?.requested_assembly_choice,
        )
      : "";
  const readyMadeAssemblyLabel =
    readyMadeAssemblyChoice === "included"
      ? "Included (Free)"
      : readyMadeAssemblyChoice === "none"
        ? "Not Requested"
        : "";
  const shouldShowOrderItems =
    !hasCustomRequestItems ||
    orderItems.some(
      (item) =>
        Number(item?.unit_price || 0) > 0 || Number(item?.subtotal || 0) > 0,
    );
  const customerAddressText = String(order?.customer_address || "").trim();
  const deliveryAddressText = String(order?.delivery_address || "").trim();
  const shouldShowCustomerAddress = Boolean(
    customerAddressText &&
    customerAddressText.toLowerCase() !== deliveryAddressText.toLowerCase(),
  );
  const customRequestPreviewBlueprint = customRequestPreviewItem
    ? buildCustomRequestPreviewBlueprint(customRequestPreviewItem)
    : null;

  const needsCustomRequestAdminReview =
    hasCustomRequestItems && normalizedOrderStatus === "pending";
  const summaryCards = [
    {
      label: "Payment",
      value: titleCase(
        order?.payment_status_display || order?.payment_status || "unpaid",
      ),
      tone: orderPaymentTone,
    },
    {
      label: "Total",
      value: formatMoney(totalAmount),
      tone: { bg: "#ffffff", color: "#18181b", border: "#d4d4d8" },
    },
    {
      label: "Date Placed",
      value: formatDate(order?.created_at),
      tone: { bg: "#ffffff", color: "#52525b", border: "#d4d4d8" },
    },
    hasBlueprintFlow
      ? {
          label: "Production Tasks",
          value: hasBlueprintTasks
            ? `${completedBlueprintTasks.length}/${blueprintTasks.length}`
            : "Ready",
          tone: { bg: "#ffffff", color: "#52525b", border: "#d4d4d8" },
        }
      : {
          label: "Next Step",
          value: nextStepLabel,
          tone: { bg: "#ffffff", color: "#52525b", border: "#d4d4d8" },
        },
  ];

  const visibleTabs = DETAIL_TABS.filter((tab) => {
    if (tab.key === "blueprint")
      return Boolean(blueprintId || order.contract || hasBlueprintTasks);

    if (tab.key === "discussion") return canUseDiscussion;

    if (tab.key === "fulfillment") return shouldShowFulfillmentTab;

    if (tab.key === "payment")
      return Boolean(
        hasPaymentRecords || normalizedPaymentStatus || isOnlineOrder,
      );

    return true;
  });

  return (
    <div style={pageShell}>
      <div style={heroCard}>
        <div style={heroTop}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={eyebrow}>Order details</div>

            <div style={heroTitleRow}>
              <button onClick={() => navigate("/admin/orders")} style={btnBack}>
                ← Orders
              </button>

              <h1 style={pageTitle}>
                Order #{String(order.id).padStart(5, "0")}
              </h1>

              {order?.order_number ? (
                <span
                  aria-label="Order reference number"
                  style={{
                    ...pill,
                    background: "#ffffff",
                    color: "#18181b",
                    border: "1px solid #d4d4d8",
                    fontFamily: "monospace",
                    letterSpacing: "0.2px",
                  }}
                >
                  {order.order_number}
                </span>
              ) : null}

              <span
                style={{
                  ...pill,
                  background: statusTone.bg,
                  color: statusTone.color,
                  border: `1px solid ${statusTone.border}`,
                }}
              >
                {getStatusLabel(order.status)}
              </span>

              <span
                style={{
                  ...pill,
                  background: channelMeta.bg,
                  color: channelMeta.color,
                  border: `1px solid ${channelMeta.border}`,
                }}
              >
                {channelMeta.label}
              </span>
            </div>

            <p style={pageSubtitle}>
              {isBlueprintOrder
                ? "Review the customer request, payment, and production progress."
                : "Review payment and delivery progress for this order."}
            </p>
          </div>

          <div style={heroActions}>
            {normalizedOrderStatus === "pending" && isOnlineStandardOrder && (
              <>
                <button onClick={handleAccept} style={btnAccept}>
                  Accept
                </button>
                <button onClick={handleDecline} style={btnDecline}>
                  Decline
                </button>
              </>
            )}

            {isBlueprintOrder &&
              normalizedOrderStatus === "confirmed" &&
              blueprintId &&
              (!hasEstimation ||
                estimationRejectedByCustomer ||
                estimationStatus === "draft") && (
                <button
                  onClick={() =>
                    navigate(`/admin/blueprints/${blueprintId}/estimation`)
                  }
                  style={btnPrimary}
                >
                  {hasEstimation ? "Revise Estimate" : "Create Estimate"}
                </button>
              )}

            {isBlueprintOrder &&
              normalizedOrderStatus === "confirmed" &&
              blueprintId &&
              estimationSentToCustomer && (
                <span style={mutedBadge}>
                  Waiting for customer quotation decision.
                </span>
              )}

            {needsContractFirst && (
              <>
                <button
                  onClick={() =>
                    navigate("/admin/contracts", {
                      state: {
                        contractDraft: {
                          blueprint_id: String(blueprintId),
                          order_id: String(order.id),
                        },
                      },
                    })
                  }
                  style={btnPrimary}
                >
                  Generate Contract
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStatusModalMode("cancel");
                    setNewStatus("cancelled");
                    setStatusModal(true);
                  }}
                  style={btnDecline}
                >
                  Cancel Order
                </button>
              </>
            )}

            {shouldShowStatusButton && (
              <button
                onClick={() => {
                  setStatusModalMode("general");
                  setNewStatus(selectableNextStatuses[0] || currentOrderStatus);
                  setStatusModal(true);
                }}
                style={btnPrimary}
              >
                Update Status
              </button>
            )}
          </div>
        </div>

        <div style={statsGrid}>
          {summaryCards.map((card) => (
            <div key={card.label} style={statCard}>
              <div style={statTop}>
                <div style={statLabel}>{card.label}</div>
                <span
                  style={{
                    ...toneDot,
                    background: card.tone.color,
                    boxShadow: `0 0 0 3px ${card.tone.border}`,
                  }}
                />
              </div>
              <div style={statValue}>{card.value}</div>
            </div>
          ))}
        </div>
        {standardNeedsFullPaymentBeforeFulfillment && (
          <div style={{ ...alertWarning, marginTop: 10 }}>
            Standard delivery orders require full payment before they can move
            to shipping or delivered.
          </div>
        )}

        {blueprintNeedsDownPaymentBeforeProduction && (
          <div style={{ ...alertWarning, marginTop: 10 }}>
            Blueprint orders require at least a 30% verified down payment before
            they can move to production.
          </div>
        )}

        <div style={detailTabRow}>
          {visibleTabs.map((tab) => {
            const isActive = activeTab === tab.key;

            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                style={{
                  ...detailTabButton,
                  background: isActive ? "#18181b" : "#ffffff",
                  color: isActive ? "#ffffff" : "#52525b",
                  borderColor: isActive ? "#18181b" : "#e4e4e7",
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
      {activeTab === "overview" && (
        <>
          <Section title="Progress">
            {normalizedOrderStatus === "cancelled" && (
              <div style={timelineCancelNotice}>
                This order has been cancelled. Progress stopped before
                completion.
              </div>
            )}

            <div style={timelineScroller}>
              <div
                style={{
                  ...timelineRail,
                  gridTemplateColumns: `repeat(${timelineSteps.length}, minmax(0, 1fr))`,
                }}
              >
                {timelineSteps.map((step, index) => {
                  const stepState = getTimelineStepState(
                    timelineSteps,
                    timelineCurrentKey,
                    step,
                  );

                  const stepTone = getTone(STATUS_STYLE, step);
                  const note =
                    stepState === "upcoming"
                      ? ""
                      : getTimelineNote(step, {
                          order,
                          blueprintTasks,
                          hasBlueprintTasks,
                          completedBlueprintTasks,
                          hasSignedDeliveryReceipt,
                          isWalkInOrder,
                        });

                  const isDoneStep = stepState === "done";
                  const isCurrentStep = stepState === "current";

                  const leftLineActive =
                    normalizedOrderStatus !== "cancelled" &&
                    index > 0 &&
                    (isDoneStep || isCurrentStep);

                  const rightLineActive =
                    normalizedOrderStatus !== "cancelled" &&
                    index < timelineSteps.length - 1 &&
                    isDoneStep;

                  return (
                    <div key={step} style={timelineStep}>
                      <div style={timelineTopLine}>
                        <div
                          style={{
                            ...timelineLine,
                            background:
                              index === 0
                                ? "transparent"
                                : leftLineActive
                                  ? "#18181b"
                                  : "#e4e4e7",
                          }}
                        />

                        <div
                          style={{
                            ...timelineDot,
                            ...(stepState === "done"
                              ? {
                                  background: "#18181b", // Force black fill
                                  borderColor: "#18181b",
                                  color: "#ffffff", // Force white checkmark
                                }
                              : stepState === "current"
                                ? step === "completed" &&
                                  normalizedOrderStatus === "completed"
                                  ? {
                                      background: "#18181b", // Force black fill
                                      borderColor: "#18181b",
                                      color: "#ffffff", // Force white checkmark
                                      boxShadow: `0 0 0 4px #f4f4f5`, // Clean gray outer ring
                                    }
                                  : {
                                      background: stepTone.bg,
                                      borderColor: stepTone.border,
                                      color: stepTone.color,
                                      boxShadow: `0 0 0 3px #ffffff`,
                                    }
                                : {}),
                          }}
                        >
                          {stepState === "done" ||
                          (stepState === "current" &&
                            step === "completed" &&
                            normalizedOrderStatus === "completed")
                            ? "✓"
                            : index + 1}
                        </div>

                        <div
                          style={{
                            ...timelineLine,
                            background:
                              index === timelineSteps.length - 1
                                ? "transparent"
                                : rightLineActive
                                  ? "#18181b"
                                  : "#e4e4e7",
                          }}
                        />
                      </div>

                      <div
                        style={{
                          ...timelineStepTitle,
                          color:
                            stepState === "upcoming" ? "#a1a1aa" : "#0a0a0a",
                        }}
                      >
                        {getStatusLabel(step)}
                      </div>

                      {note ? <div style={timelineStepNote}>{note}</div> : null}
                    </div>
                  );
                })}
              </div>
            </div>
          </Section>

          <div style={sectionGrid}>
            <Section title="Customer">
              <InfoRow label="Name" value={order.customer_name || "—"} />
              <InfoRow label="Email" value={order.customer_email || "—"} />
              <InfoRow label="Phone" value={order.customer_phone || "—"} />
              {shouldShowCustomerAddress ? (
                <InfoRow label="Address" value={customerAddressText} />
              ) : null}
              {deliveryAddressText && (
                <InfoRow
                  label="Delivery Address"
                  value={
                    <>
                      {order.delivery_address}
                      {(() => {
                        const mapsHref = getGoogleMapsHref(
                          order.delivery_lat,
                          order.delivery_lng,
                        );
                        return mapsHref ? (
                          <a
                            href={mapsHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              marginLeft: 8,
                              fontSize: 12,
                              fontWeight: 700,
                              color: "#2563eb",
                              whiteSpace: "nowrap",
                            }}
                          >
                            Open in Google Maps ↗
                          </a>
                        ) : isBlueprintOrder ? (
                          <span
                            style={{
                              marginLeft: 8,
                              fontSize: 12,
                              fontWeight: 700,
                              color: "#a1a1aa",
                              whiteSpace: "nowrap",
                            }}
                          >
                            Location pin unavailable
                          </span>
                        ) : null;
                      })()}
                    </>
                  }
                />
              )}
            </Section>

            <Section title="Order Details">
              <InfoRow
                label="Order Type"
                value={isBlueprintOrder ? "Blueprint" : "Standard"}
              />
              <InfoRow
                label="Payment Method"
                value={
                  PAY_METHOD_LABELS[normalize(order.payment_method)] ||
                  titleCase(order.payment_method) ||
                  "—"
                }
              />
              {readyMadeAssemblyLabel ? (
                <InfoRow label="Assembly" value={readyMadeAssemblyLabel} />
              ) : null}
              <InfoRow label="Channel" value={channelMeta.label} />
            </Section>
          </div>
          {hasCustomRequestItems && (
            <Section title="Customization Request">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                  marginBottom: 14,
                }}
              >
                <div style={{ maxWidth: 720 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 800,
                      color: "#0a0a0a",
                      marginBottom: 6,
                    }}
                  >
                    Customer submission
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "#52525b",
                      lineHeight: 1.6,
                    }}
                  >
                    Review the dimensions, finish, hardware, and saved design
                    before approving the request for estimation.
                  </div>
                </div>

                {needsCustomRequestAdminReview ? (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      onClick={() => handleCustomRequestAction("approve")}
                      disabled={customRequestActionLoading === "approve"}
                      style={btnAccept}
                    >
                      {customRequestActionLoading === "approve"
                        ? "Approving..."
                        : "Approve for estimate"}
                    </button>

                    <button
                      onClick={() => handleCustomRequestAction("reject")}
                      disabled={customRequestActionLoading === "reject"}
                      style={btnDecline}
                    >
                      {customRequestActionLoading === "reject"
                        ? "Rejecting..."
                        : "Reject"}
                    </button>
                  </div>
                ) : (
                  <span style={mutedBadge}>Request already reviewed.</span>
                )}
              </div>

              <div style={{ display: "grid", gap: 12 }}>
                {customRequestItems.map((item) => {
                  const dims = getCustomRequestDims(item);
                  const canPreview = hasCustomEditorSnapshot(item);

                  return (
                    <div
                      key={item.id}
                      style={{
                        border: "1px solid #e4e4e7",
                        borderRadius: 14,
                        padding: 14,
                        background: "#fff",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 12,
                          alignItems: "flex-start",
                          flexWrap: "wrap",
                          marginBottom: 10,
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontSize: 15,
                              fontWeight: 800,
                              color: "#0a0a0a",
                              marginBottom: 4,
                            }}
                          >
                            {item.display_name ||
                              item.product_name ||
                              "Custom Furniture"}
                          </div>

                          <div style={{ fontSize: 12, color: "#71717a" }}>
                            Submitted design
                          </div>
                        </div>

                        {canPreview ? (
                          <button
                            onClick={() => openCustomRequestPreview(item)}
                            style={btnView}
                          >
                            View Submitted Design
                          </button>
                        ) : null}
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit, minmax(180px, 1fr))",
                          gap: 10,
                        }}
                      >
                        <MiniInfo
                          label="Wood Type"
                          value={item.requested_wood_type || "—"}
                        />
                        <MiniInfo
                          label="Finish"
                          value={item.requested_finish_color || "—"}
                        />

                        {String(item.requested_door_style || "").trim() ? (
                          <MiniInfo
                            label="Door Style"
                            value={item.requested_door_style}
                          />
                        ) : null}

                        {String(item.requested_hardware || "").trim() ? (
                          <MiniInfo
                            label="Hardware"
                            value={item.requested_hardware}
                          />
                        ) : null}

                        <MiniInfo
                          label="Dimensions"
                          value={`W ${dims.width || 0} • H ${dims.height || 0} • D ${dims.depth || 0} ${item.requested_unit || "mm"}`}
                        />
                        <MiniInfo
                          label="Quantity"
                          value={String(item.quantity || 1)}
                        />
                        <MiniInfo
                          label="Assembly"
                          value={
                            item.requested_assembly_choice === "included"
                              ? "Included (Free)"
                              : item.requested_assembly_choice === "none"
                                ? "Not Requested"
                                : "Not specified"
                          }
                        />
                      </div>

                      {item.requested_comments ? (
                        <div style={textBlock}>
                          <div style={textBlockTitle}>Customer comments</div>
                          <p style={multilineText}>{item.requested_comments}</p>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </Section>
          )}
          {isBlueprintOrder && (
            <Section title="Quotation">
              {!hasEstimation ? (
                <EmptyText>No quotation has been created yet.</EmptyText>
              ) : (
                <>
                  <InfoRow
                    label="Status"
                    value={
                      estimationSentToCustomer
                        ? "Sent to customer"
                        : estimationRejectedByCustomer
                          ? "Revision requested"
                          : titleCase(latestEstimation.status)
                    }
                  />
                  <InfoRow
                    label="Version"
                    value={`v${latestEstimation.version || 1}`}
                  />
                  <InfoRow
                    label="Updated"
                    value={formatDateTime(latestEstimation.updated_at)}
                  />
                  <InfoRow
                    label="Quoted Total"
                    value={formatMoney(latestEstimation.grand_total)}
                    bold
                  />

                  {blueprintId &&
                    normalizedOrderStatus === "confirmed" &&
                    estimationSentToCustomer && (
                      <div style={{ marginTop: 12 }}>
                        <span style={mutedBadge}>
                          Waiting for the customer to review the quotation.
                        </span>
                      </div>
                    )}
                </>
              )}
            </Section>
          )}
          {shouldShowOrderItems && (
            <Section title="Items">
              <TableShell>
                <table style={table}>
                  <thead>
                    <tr style={theadRow}>
                      {["Product", "Quantity", "Unit Price", "Subtotal"].map(
                        (h) => (
                          <th key={h} style={th}>
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {orderItems.map((item, i) => (
                      <tr key={i} style={tbodyRow}>
                        <td
                          style={{ ...td, fontWeight: 600, color: "#18181b" }}
                        >
                          {item.product_name}
                        </td>
                        <td style={td}>{item.quantity}</td>
                        <td style={td}>{formatMoney(item.unit_price)}</td>
                        <td
                          style={{ ...td, fontWeight: 700, color: "#0a0a0a" }}
                        >
                          {formatMoney(item.subtotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={tfootRow}>
                      <td
                        colSpan={3}
                        style={{
                          ...td,
                          textAlign: "right",
                          fontWeight: 600,
                          color: "#52525b",
                        }}
                      >
                        Total
                      </td>
                      <td style={{ ...td, fontWeight: 800, color: "#0a0a0a" }}>
                        {formatMoney(totalAmount)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </TableShell>
            </Section>
          )}
        </>
      )}

      {activeTab === "payment" && (
        <>
          {(() => {
            const cashSummary = order?.blueprint_cash_payment || null;
            const isBlueprintOrder =
              String(order?.order_type || "").toLowerCase() === "blueprint";

            if (!isBlueprintOrder || !cashSummary) return null;

            const verifiedTotal = Number(cashSummary.verified_total || 0);
            const minimumRequiredTotal = Number(
              cashSummary.minimum_required_total || 0,
            );
            const showFirstPaymentMinimum = verifiedTotal === 0;
            const showAdditionalMinimum =
              verifiedTotal > 0 && verifiedTotal < minimumRequiredTotal;

            return (
              <Section title="Payment Requirements">
                <InfoRow
                  label="Quoted total"
                  value={formatMoney(cashSummary.total || 0)}
                />
                {showFirstPaymentMinimum ? (
                  <InfoRow
                    label="Minimum first payment (30%)"
                    value={formatMoney(minimumRequiredTotal)}
                  />
                ) : null}
                {showAdditionalMinimum ? (
                  <InfoRow
                    label="Minimum additional payment needed to reach 30%"
                    value={formatMoney(
                      cashSummary.minimum_additional_payment || 0,
                    )}
                  />
                ) : null}
                <InfoRow
                  label="Paid amount"
                  value={formatMoney(verifiedTotal)}
                />
                <InfoRow
                  label="Balance"
                  value={formatMoney(cashSummary.remaining_balance || 0)}
                />

                {cashPaymentError ? (
                  <div style={infoNotice}>{cashPaymentError}</div>
                ) : null}

                {cashSummary.can_record_payment ? (
                  <div style={{ marginTop: 12 }}>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 8,
                        marginBottom: 12,
                      }}
                    >
                      {(cashSummary.quick_amounts || []).map((amount) => {
                        // Quick amounts come from the backend already
                        // rounded to two decimals -- converting a
                        // trusted, already-clean value into a fixed
                        // two-decimal string here is safe and explicit,
                        // never a re-derivation of precision from user
                        // input.
                        const amountStr = Number(amount).toFixed(2);
                        return (
                          <button
                            key={amountStr}
                            type="button"
                            style={btnAccept}
                            disabled={recordingCashPayment}
                            onClick={() =>
                              recordBlueprintCashPayment(amountStr)
                            }
                          >
                            {recordingCashPayment
                              ? "Recording..."
                              : `Record ${formatMoney(amountStr)}`}
                          </button>
                        );
                      })}
                    </div>

                    <div style={{ marginTop: 8 }}>
                      <label style={labelSm}>Custom amount</label>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="0.00"
                          value={customCashAmount}
                          onChange={(e) => setCustomCashAmount(e.target.value)}
                          style={inputFull}
                          disabled={recordingCashPayment}
                        />
                        <button
                          type="button"
                          style={btnSecondary}
                          disabled={
                            recordingCashPayment || !customCashAmount.trim()
                          }
                          onClick={() => {
                            const trimmed = customCashAmount.trim();
                            if (!trimmed) {
                              setCashPaymentError(
                                "Enter a valid payment amount.",
                              );
                              return;
                            }
                            // No client-side rounding/reshaping of the
                            // raw string -- the backend's strict parser
                            // is the sole authority on precision and
                            // format.
                            recordBlueprintCashPayment(trimmed);
                          }}
                        >
                          Record
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={infoNotice}>
                    {cashSummary.reason_message ||
                      "Cash at Store recording is not available for this order."}
                  </div>
                )}
              </Section>
            );
          })()}

          <Section title="Payment Transactions">
            {!hasPaymentRecords ? (
              normalizedPaymentStatus === "paid" && isCashLikePaymentMethod ? (
                <div style={infoNotice}>
                  Paid via{" "}
                  {PAY_METHOD_LABELS[normalize(order?.payment_method)] ||
                    titleCase(order?.payment_method)}{" "}
                  No separate payment transaction was recorded.
                </div>
              ) : isOnlineOrder && normalizedPaymentStatus === "paid" ? (
                <div style={infoNotice}>
                  This order is marked as paid, but no payment transaction
                  record is linked yet.
                </div>
              ) : isOnlineOrder ? (
                <EmptyText>No payment transactions yet.</EmptyText>
              ) : (
                <EmptyText>No payment records yet.</EmptyText>
              )
            ) : (
              <TableShell>
                <table style={table}>
                  <thead>
                    <tr style={theadRow}>
                      {[
                        "Amount",
                        "Method",
                        "Status",
                        "Proof",
                        "Verified By",
                        "Date",
                        ...(hasPendingPaymentActions ? ["Actions"] : []),
                      ].map((h) => (
                        <th key={h} style={th}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {order.payments.map((payment) => {
                      const paymentTone = getTone(
                        PAYMENT_STYLE,
                        payment.status,
                      );

                      return (
                        <tr key={payment.id} style={tbodyRow}>
                          <td
                            style={{ ...td, fontWeight: 700, color: "#0a0a0a" }}
                          >
                            {formatMoney(payment.amount)}
                          </td>
                          <td style={td}>
                            {PAY_METHOD_LABELS[
                              normalize(payment.payment_method)
                            ] || titleCase(payment.payment_method)}
                          </td>
                          <td style={td}>
                            <span
                              style={{
                                ...pill,
                                background: paymentTone.bg,
                                color: paymentTone.color,
                                border: `1px solid ${paymentTone.border}`,
                              }}
                            >
                              {titleCase(payment.status)}
                            </span>
                          </td>
                          <td style={td}>
                            {payment.proof_url ? (
                              <div
                                style={{
                                  display: "flex",
                                  gap: 8,
                                  flexWrap: "wrap",
                                }}
                              >
                                {safeParseUrls(payment.proof_url).map(
                                  (url, idx, arr) => (
                                    <button
                                      key={idx}
                                      type="button"
                                      onClick={() => openProofPreview(url)}
                                      style={previewLinkButton}
                                    >
                                      View Proof {arr.length > 1 ? idx + 1 : ""}
                                    </button>
                                  ),
                                )}
                              </div>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td style={{ ...td, color: "#71717a" }}>
                            {payment.verified_by || "—"}
                          </td>
                          <td style={{ ...td, color: "#71717a" }}>
                            {formatDate(payment.created_at)}
                          </td>
                          {hasPendingPaymentActions ? (
                            <td style={td}>
                              {normalize(payment.status) === "pending" ? (
                                <div style={inlineActions}>
                                  {paymentVerifyFeedback.id === payment.id &&
                                  paymentVerifyFeedback.status === "success" ? (
                                    <div
                                      role="status"
                                      aria-live="polite"
                                      style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        gap: 8,
                                        minHeight: 34,
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      <span
                                        className="wisdom-motion-success-icon is-filled"
                                        aria-hidden="true"
                                        style={{ width: 28, height: 28 }}
                                      >
                                        <span className="wisdom-motion-success-circle is-filled" />
                                        <svg
                                          className="wisdom-motion-success-check is-filled"
                                          viewBox="0 0 24 24"
                                          style={{ width: 16, height: 16 }}
                                        >
                                          <path
                                            className="wisdom-motion-success-check-path"
                                            d="m5.5 12.5 4 4 9-10"
                                          />
                                        </svg>
                                      </span>
                                      <span
                                        style={{
                                          fontSize: 12,
                                          fontWeight: 700,
                                          color: "#18181b",
                                        }}
                                      >
                                        Payment verified successfully
                                      </span>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() =>
                                        verifyPayment(payment.id, "verified")
                                      }
                                      disabled={reviewingPayment.id !== null}
                                      style={btnAccept}
                                    >
                                      {reviewingPayment.id === payment.id &&
                                      reviewingPayment.action === "verified"
                                        ? "Verifying..."
                                        : "Verify"}
                                    </button>
                                  )}
                                  <button
                                    onClick={() =>
                                      verifyPayment(payment.id, "rejected")
                                    }
                                    disabled={reviewingPayment.id !== null}
                                    style={btnDecline}
                                  >
                                    {reviewingPayment.id === payment.id &&
                                    reviewingPayment.action === "rejected"
                                      ? "Rejecting..."
                                      : "Reject"}
                                  </button>
                                </div>
                              ) : (
                                <span style={mutedInline}>
                                  No action needed
                                </span>
                              )}
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableShell>
            )}
          </Section>
          {!order?.blueprint_cash_payment && (
            <Section title="Payment Summary">
              <InfoRow
                label="Paid Amount"
                value={formatMoney(verifiedPaymentTotal)}
              />
              <InfoRow
                label="Balance"
                value={formatMoney(paymentBalance)}
                bold
              />

              {normalizedOrderStatus === "delivered" &&
                paymentBalance > 0 &&
                !hasPendingPaymentActions && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ ...alertWarning, marginBottom: 12 }}>
                      This order still has an unpaid remaining balance. The
                      assigned rider should record the on-site collection from
                      the delivery page first, then admin can verify the pending
                      payment here before marking the order as completed.
                    </div>
                  </div>
                )}

              {hasPendingPaymentActions && (
                <div style={{ marginTop: 14 }}>
                  <div style={infoNotice}>
                    A payment proof is waiting for admin verification in the
                    payment transactions table above.
                  </div>
                </div>
              )}
            </Section>
          )}
        </>
      )}

      {activeTab === "fulfillment" && (
        <>
          {!(
            order.delivery ||
            order.contract ||
            shouldShowMissingDeliverySection
          ) ? (
            <Section title="Fulfillment">
              <EmptyText>
                No fulfillment records yet. Delivery details and contract
                handoff will appear here after the order moves forward.
              </EmptyText>
            </Section>
          ) : (
            <div style={detailPairGrid}>
              {order.delivery ? (
                <Section title="Delivery">
                  <InfoRow
                    label="Scheduled"
                    value={
                      order.delivery.scheduled_date
                        ? formatDateTime(order.delivery.scheduled_date)
                        : "—"
                    }
                  />
                  <InfoRow
                    label="Status"
                    value={titleCase(order.delivery.status)}
                  />
                  <InfoRow
                    label="Delivered"
                    value={
                      order.delivery.delivered_date
                        ? formatDateTime(order.delivery.delivered_date)
                        : "—"
                    }
                  />
                  <InfoRow
                    label="Address"
                    value={
                      <>
                        {order.delivery.address || "—"}
                        {(() => {
                          const mapsHref = getGoogleMapsHref(
                            order.delivery_lat,
                            order.delivery_lng,
                          );
                          return mapsHref ? (
                            <a
                              href={mapsHref}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{
                                marginLeft: 8,
                                fontSize: 12,
                                fontWeight: 700,
                                color: "#2563eb",
                                whiteSpace: "nowrap",
                              }}
                            >
                              Open in Google Maps ↗
                            </a>
                          ) : isBlueprintOrder ? (
                            <span
                              style={{
                                marginLeft: 8,
                                fontSize: 12,
                                fontWeight: 700,
                                color: "#a1a1aa",
                                whiteSpace: "nowrap",
                              }}
                            >
                              Location pin unavailable
                            </span>
                          ) : null;
                        })()}
                      </>
                    }
                  />
                  <InfoRow
                    label="Delivery Proof"
                    value={
                      order.delivery.signed_receipt ? (
                        <div
                          style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
                        >
                          {safeParseUrls(order.delivery.signed_receipt).map(
                            (url, idx, arr) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => openDeliveryReceiptPreview(url)}
                                style={previewLinkButton}
                              >
                                View Proof {arr.length > 1 ? idx + 1 : ""}
                              </button>
                            ),
                          )}
                        </div>
                      ) : (
                        "Awaiting rider upload"
                      )
                    }
                  />

                  {!order.delivery.signed_receipt &&
                    ["shipping", "delivered"].includes(
                      normalizedOrderStatus,
                    ) && (
                      <div style={noticeBox}>
                        <div style={noticeTitle}>
                          Waiting for delivery proof
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: "#52525b",
                            lineHeight: 1.6,
                          }}
                        >
                          The assigned rider should upload the signed delivery
                          proof from the rider delivery page.
                        </div>
                      </div>
                    )}
                </Section>
              ) : shouldShowMissingDeliverySection ? (
                <Section title="Delivery">
                  <div
                    style={{
                      background: "#fafafa",
                      border: "1px solid #e4e4e7",
                      color: "#18181b",
                      borderRadius: 12,
                      padding: "10px 14px",
                      fontSize: 12,
                      fontWeight: 800,
                      marginBottom: 8,
                    }}
                  >
                    This order is already in the delivery phase, but no delivery
                    record is linked yet.
                  </div>

                  <div
                    style={{
                      fontSize: 12,
                      color: "#52525b",
                      lineHeight: 1.5,
                      marginBottom: 16, // Added spacing for the button
                    }}
                  >
                    Create or link a delivery record before adding delivery
                    proof.
                  </div>

                  <button
                    onClick={() => {
                      const params = new URLSearchParams({
                        schedule_order_id: String(order?.id || id),
                      });
                      navigate(`/admin/delivery?${params.toString()}`);
                    }}
                    style={btnPrimary}
                  >
                    Assign Delivery
                  </button>
                </Section>
              ) : null}

              {order.contract && (
                <Section title="Contract">
                  <InfoRow
                    label="Generated On"
                    value={formatDateTime(order.contract.created_at)}
                  />
                  <InfoRow
                    label="Warranty Terms"
                    value={order.contract.warranty_terms || "—"}
                  />

                  {hasContractTerms && (
                    <div style={textBlock}>
                      <div style={textBlockTitle}>Contract Terms</div>
                      <p style={multilineText}>
                        {order.contract.materials_used}
                      </p>
                    </div>
                  )}
                </Section>
              )}
            </div>
          )}
        </>
      )}

      {activeTab === "blueprint" && (
        <>
          {(blueprintId || order.contract || hasBlueprintTasks) && (
            <Section title="Blueprint Assignment">
              <InfoRow
                label="Blueprint Reference"
                value={
                  blueprintId ? (
                    <button
                      onClick={() =>
                        navigate(`/admin/blueprints/${blueprintId}/design`)
                      }
                      style={linkButton}
                    >
                      BP-{String(blueprintId).padStart(5, "0")}
                    </button>
                  ) : (
                    "—"
                  )
                }
              />
              <InfoRow label="Assignment Phase" value={assignmentPhaseText} />
              <InfoRow
                label="Active Assignment Count"
                value={String(activeBlueprintTasks.length)}
              />
              <InfoRow
                label="Completed Task Count"
                value={String(completedBlueprintTasks.length)}
              />
              {needsContractFirst && (
                <div style={{ ...alertWarning, marginTop: 12 }}>
                  Generate the contract first from Contracts before moving this
                  blueprint order into production or assigning staff.
                </div>
              )}

              {blueprintTasks.length > 0 ? (
                <div style={taskList}>
                  <div style={taskListHeader}>Current Blueprint Tasks</div>

                  {blueprintTasks.map((task) => {
                    const taskStatus = normalize(task.status);
                    const taskTone = getTone(TASK_STYLE, taskStatus);
                    const isActive = [
                      "pending",
                      "in_progress",
                      "blocked",
                    ].includes(taskStatus);

                    return (
                      <div key={task.id} style={taskCard}>
                        <div style={taskTop}>
                          <div>
                            <div style={taskTitle}>
                              {task.task_role || "Task"}
                            </div>
                            <div style={taskMeta}>
                              Assigned to {task.assigned_to_name || "—"} • by{" "}
                              {task.assigned_by_name || "—"}
                            </div>
                          </div>

                          <span
                            style={{
                              ...pill,
                              background: taskTone.bg,
                              color: taskTone.color,
                              border: `1px solid ${taskTone.border}`,
                            }}
                          >
                            {taskStatus === "blocked" ? "On Hold" : titleCase(task.status)}
                          </span>
                        </div>

                        <div style={taskDetailsGrid}>
                          <MiniInfo
                            label="Due Date"
                            value={
                              task.due_date
                                ? formatDateTime(task.due_date)
                                : "—"
                            }
                          />
                          <MiniInfo
                            label="Note"
                            value={task.description || "—"}
                          />
                        </div>

                        <div style={taskActions}>
                          {isDeliveryPhaseOrDone ? (
                            <span style={mutedBadge}>
                              Production packet locked during
                              delivery/completion
                            </span>
                          ) : (
                            <span style={mutedBadge}>
                              Staff updates this step from the Production Work
                              Queue
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyText>No blueprint staff assignments yet.</EmptyText>
              )}

              {canAssignBlueprintStaff && !hasBlueprintTasks && (
                <div style={{ marginTop: 12 }}>
                  <button
                    onClick={openAssignModal}
                    disabled={!blueprintId}
                    style={{
                      ...btnPrimary,
                      opacity: !blueprintId ? 0.75 : 1,
                      cursor: !blueprintId ? "not-allowed" : "pointer",
                    }}
                    title="Open Task Assignments and assign production staff"
                  >
                    Assign Indoor Staff
                  </button>
                </div>
              )}

              {canAssignBlueprintStaff && hasBlueprintTasks && (
                <div style={{ marginTop: 12 }}>
                  {allBlueprintTasksCompleted ? (
                    <span style={mutedBadge}>
                      All production steps for this order are completed.
                    </span>
                  ) : (
                    <button
                      onClick={openReassignModal}
                      disabled={loadingReassignable}
                      style={{
                        ...btnPrimary,
                        opacity: loadingReassignable ? 0.75 : 1,
                        cursor: loadingReassignable ? "not-allowed" : "pointer",
                      }}
                      title="Reassign primary indoor staff"
                    >
                      {loadingReassignable
                        ? "Loading Staff..."
                        : "Reassign Production Staff"}
                    </button>
                  )}
                </div>
              )}
            </Section>
          )}
        </>
      )}
      {activeTab === "discussion" && canUseDiscussion && (
        <OrderDiscussionPanel
          orderId={order?.id || id}
          enabled={canUseDiscussion}
        />
      )}
      {customRequestPreviewItem && customRequestPreviewBlueprint && (
        <div style={overlay} onClick={closeCustomRequestPreview}>
          <div
            style={{
              ...modalBox,
              width: 1480,
              maxWidth: "96vw",
              maxHeight: "92vh",
              overflowY: "auto",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={modalHeader}>
              <div>
                <h3 style={modalTitle}>
                  {customRequestPreviewItem.display_name ||
                    customRequestPreviewItem.product_name ||
                    "Custom Furniture"}
                </h3>
                <p style={modalSubtitle}>
                  Review the exact submitted design, movable parts, and measurements.
                </p>
              </div>
            </div>

            <div style={{ paddingTop: 6 }}>
              <AdminSubmittedDesignPreview
                blueprint={customRequestPreviewBlueprint}
                item={customRequestPreviewItem}
                orderNumber={order?.order_number || ""}
              />
            </div>

            <div style={modalActions}>
              <button onClick={closeCustomRequestPreview} style={btnPrimary}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {proofPreview.open && (
        <div style={overlay}>
          <div style={{ ...modalBox, width: 820, maxWidth: "96vw" }}>
            <div style={modalHeader}>
              <div>
                <h3 style={modalTitle}>Payment Proof Preview</h3>
                <p style={modalSubtitle}>
                  Review the uploaded payment proof before verifying the
                  transaction.
                </p>
              </div>
            </div>

            <div style={proofPreviewBox}>
              {proofPreview.type === "image" ? (
                <img
                  src={buildAssetUrl(proofPreview.url)}
                  alt="Payment proof"
                  style={proofPreviewImage}
                />
              ) : proofPreview.type === "pdf" ? (
                <iframe
                  src={buildAssetUrl(proofPreview.url)}
                  title="Payment proof preview"
                  style={proofPreviewFrame}
                />
              ) : (
                <div style={proofPreviewFallback}>
                  Inline preview is not available for this file type.
                </div>
              )}
            </div>

            <div style={modalActions}>
              <a
                href={proofPreview.url}
                target="_blank"
                rel="noreferrer"
                style={btnSecondaryLink}
              >
                Open in New Tab
              </a>
              <button onClick={closeProofPreview} style={btnPrimary}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {deliveryReceiptPreview.open && (
        <div style={overlay}>
          <div style={{ ...modalBox, width: 820, maxWidth: "96vw" }}>
            <div style={modalHeader}>
              <div>
                <h3 style={modalTitle}>Proof of Delivery</h3>
                <p style={modalSubtitle}>
                  Review the uploaded Proof of Delivery photo for this order.
                </p>
              </div>
            </div>

            <div style={proofPreviewBox}>
              {deliveryReceiptPreview.type === "image" ? (
                <img
                  src={deliveryReceiptPreview.url}
                  alt="Proof of Delivery"
                  style={proofPreviewImage}
                />
              ) : deliveryReceiptPreview.type === "pdf" ? (
                <iframe
                  src={deliveryReceiptPreview.url}
                  title="Proof of Delivery preview"
                  style={proofPreviewFrame}
                />
              ) : (
                <div style={proofPreviewFallback}>
                  Inline preview is not available for this file type.
                </div>
              )}
            </div>

            <div style={modalActions}>
              <a
                href={deliveryReceiptPreview.url}
                target="_blank"
                rel="noreferrer"
                style={btnSecondaryLink}
              >
                Open in New Tab
              </a>
              <button onClick={closeDeliveryReceiptPreview} style={btnPrimary}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {statusModal && (
        <div style={overlay}>
          <div style={modalBox}>
            <div style={modalHeader}>
              <div>
                <h3 style={modalTitle}>
                  {isCancelOnlyModal ? "Cancel Order" : "Update Order Status"}
                </h3>
                <p style={modalSubtitle}>
                  {isCancelOnlyModal
                    ? "Review the non-refundable cancellation notice before continuing."
                    : "Choose the next valid status for this order."}
                </p>
              </div>
            </div>

            {normalize(newStatus) === "cancelled" && (
              <div style={alertWarning}>
                {hasVerifiedCustomerPayment ? (
                  <>
                    This order has a verified customer payment of{" "}
                    <strong>{formatMoney(verifiedPaymentTotal)}</strong>.{" "}
                    Cancelling will not refund, reverse, or remove that payment.
                    The payment record will remain, while only unused blueprint
                    material reservations will be released.
                  </>
                ) : (
                  <>
                    Cancelling will close this order and release any unused
                    blueprint material reservations. No refund transaction will
                    be created.
                  </>
                )}
              </div>
            )}

            {hasBlueprintTasks && !allBlueprintTasksCompleted && (
              <div style={alertWarning}>
                Shipping, delivered, and completed are locked until all
                blueprint tasks are marked completed.
              </div>
            )}

            {/* 👉 NEW: Warnings for Rider Assignments */}
            {hasDeliveryRequirement &&
              !order?.delivery &&
              ["delivered", "completed"].includes(newStatus) && (
                <div style={alertWarning}>
                  You need to assign a delivery rider first.
                </div>
              )}

            {hasDeliveryRequirement &&
              order?.delivery &&
              !hasSignedDeliveryReceipt &&
              ["delivered", "completed"].includes(newStatus) && (
                <div style={alertWarning}>
                  It must be delivered and finished by the rider first.
                </div>
              )}

            {/* 👉 NEW: Warning for Payment Verification */}
            {!isBlueprintOrder &&
              newStatus === "shipping" &&
              normalizedPaymentMethod !== "cod" &&
              paymentBalance > 0 && (
                <div style={alertWarning}>
                  The payment need to be verified first.
                </div>
              )}

            {paymentBalance > 0 && newStatus === "completed" && (
              <div style={alertWarning}>
                Completed is locked until the remaining balance is fully paid.
              </div>
            )}

            {blueprintNeedsDownPaymentBeforeProduction &&
              newStatus === "production" && (
                <div style={alertWarning}>
                  Production is locked for blueprint orders until at least 30%
                  verified down payment is completed.
                </div>
              )}

            <label style={labelSm}>New Status</label>
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              style={{ ...inputFull, marginBottom: 20 }}
              disabled={updatingStatus || isCancelOnlyModal}
            >
              {!statusModalStatuses.length && (
                <option value="">No further status available</option>
              )}

              {statusModalStatuses.map((status) => {
                const normalizedStatus = normalize(status);

                const blockedByIncompleteTasks =
                  isBlueprintOrder &&
                  ["shipping", "delivered", "completed"].includes(
                    normalizedStatus,
                  ) &&
                  (!hasRequiredBlueprintTaskPacket ||
                    !allBlueprintTasksCompleted);

                const blockedByUnverifiedPayment =
                  !isBlueprintOrder &&
                  normalizedStatus === "shipping" &&
                  normalizedPaymentMethod !== "cod" &&
                  paymentBalance > 0;

                const blockedByNoRiderAssigned =
                  hasDeliveryRequirement &&
                  ["delivered", "completed"].includes(normalizedStatus) &&
                  !order?.delivery;

                const blockedByRiderNotFinished =
                  hasDeliveryRequirement &&
                  ["delivered", "completed"].includes(normalizedStatus) &&
                  order?.delivery &&
                  !hasSignedDeliveryReceipt;

                const blockedByUnsettledPayment =
                  normalizedStatus === "completed" && paymentBalance > 0;

                const blockedByBlueprintDownPayment =
                  isBlueprintOrder &&
                  normalizedStatus === "production" &&
                  !hasRequiredBlueprintDownPayment;

                // 👉 NEW: Block manual shipping/delivered for ALL managed deliveries
                const blockedByManagedDelivery =
                  hasDeliveryRequirement &&
                  ["shipping", "delivered"].includes(normalizedStatus);

                const isBlocked =
                  blockedByIncompleteTasks ||
                  blockedByUnverifiedPayment ||
                  blockedByNoRiderAssigned ||
                  blockedByRiderNotFinished ||
                  blockedByUnsettledPayment ||
                  blockedByBlueprintDownPayment ||
                  blockedByManagedDelivery;

                return (
                  <option key={status} disabled={isBlocked}>
                    {getStatusLabel(status)}
                    {blockedByIncompleteTasks
                      ? " — complete blueprint tasks first"
                      : blockedByUnverifiedPayment
                        ? " — the payment need to be verified first"
                        : blockedByManagedDelivery
                          ? " — rider will update this automatically"
                          : blockedByNoRiderAssigned
                            ? " — you need to assign a delivery rider first"
                            : blockedByRiderNotFinished
                              ? " — rider must finish delivery first"
                              : blockedByBlueprintDownPayment
                                ? " — 30% verified down payment required first"
                                : blockedByUnsettledPayment
                                  ? " — full payment required first"
                                  : ""}
                  </option>
                );
              })}
            </select>

            {(() => {
              const normalizedNewStatus = normalize(newStatus);
              const newStatusBlocked =
                (isBlueprintOrder &&
                  ["shipping", "delivered", "completed"].includes(
                    normalizedNewStatus,
                  ) &&
                  (!hasRequiredBlueprintTaskPacket ||
                    !allBlueprintTasksCompleted)) ||
                (!isBlueprintOrder &&
                  normalizedNewStatus === "shipping" &&
                  normalizedPaymentMethod !== "cod" &&
                  paymentBalance > 0) ||
                (hasDeliveryRequirement &&
                  ["delivered", "completed"].includes(normalizedNewStatus) &&
                  !order?.delivery) ||
                (hasDeliveryRequirement &&
                  ["delivered", "completed"].includes(normalizedNewStatus) &&
                  order?.delivery &&
                  !hasSignedDeliveryReceipt) ||
                (normalizedNewStatus === "completed" && paymentBalance > 0) ||
                (isBlueprintOrder &&
                  normalizedNewStatus === "production" &&
                  !hasRequiredBlueprintDownPayment) ||
                (hasDeliveryRequirement &&
                  ["shipping", "delivered"].includes(normalizedNewStatus));

              return (
                <div style={modalActions}>
                  <button
                    onClick={() => {
                      setStatusModal(false);
                      setStatusModalMode("general");
                    }}
                    style={btnGhost}
                    disabled={updatingStatus}
                  >
                    {isCancelOnlyModal ? "Keep Order" : "Cancel"}
                  </button>
                  <button
                    onClick={handleStatusUpdate}
                    style={isCancelOnlyModal ? btnDecline : btnPrimary}
                    disabled={
                      !statusModalStatuses.length ||
                      updatingStatus ||
                      newStatusBlocked
                    }
                  >
                    {updatingStatus
                      ? "Updating…"
                      : isCancelOnlyModal
                        ? "Confirm Cancellation"
                        : "Update Status"}
                  </button>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {reassignModal && (
        <div style={overlay}>
          <div style={{ ...modalBox, width: 540 }}>
            <div style={modalHeader}>
              <div>
                <h3 style={modalTitle}>Reassign Production Staff</h3>
                <p style={modalSubtitle}>
                  Order #{String(order.id).padStart(5, "0")}
                </p>
              </div>
            </div>

            <div style={{ marginTop: 8 }}>
              {blueprintTasks.map((t) => (
                <div
                  key={t.id}
                  style={{ fontSize: 13, color: "#52525b", marginBottom: 4 }}
                >
                  {t.task_role}:{" "}
                  <strong>
                    {normalize(t.status) === "blocked"
                      ? "On Hold"
                      : titleCase(t.status)}
                  </strong>
                  {t.assigned_to_name ? ` — ${t.assigned_to_name}` : ""}
                </div>
              ))}
            </div>

            {hasInProgressTask && (
              <div style={{ ...alertWarning, marginTop: 16 }}>
                Put the active production step on hold before reassigning staff.
              </div>
            )}

            <div style={{ marginTop: 16 }}>
              <label style={labelSm}>New Primary Indoor Staff</label>
              <select
                value={reassignStaffId}
                onChange={(e) => setReassignStaffId(e.target.value)}
                style={inputFull}
                disabled={hasInProgressTask}
              >
                <option value="">— Select Staff —</option>
                {reassignableStaff.map((staff) => {
                  const remaining = remainingCountByStaffId[staff.id] || 0;
                  return (
                    <option key={staff.id} value={staff.id}>
                      {staff.name}
                      {remaining > 0
                        ? ` — owns ${remaining} remaining step${remaining === 1 ? "" : "s"}`
                        : ""}
                    </option>
                  );
                })}
              </select>
            </div>

            {reassignStaffId && (
              <div style={{ marginTop: 8, fontSize: 12, color: "#52525b" }}>
                {transferPreviewCount > 0
                  ? `${transferPreviewCount} remaining production step${transferPreviewCount === 1 ? "" : "s"} will transfer to this staff member. On Hold work stays On Hold until resumed.`
                  : "This staff member already owns every remaining production step. Submitting will make no changes."}
              </div>
            )}

            <div style={{ marginTop: 12, fontSize: 12, color: "#71717a" }}>
              Completed steps remain attributed to their original staff member.
              On Hold steps remain on hold for the new staff until resumed. Due
              dates are unchanged.
            </div>

            <div style={modalActions}>
              <button onClick={() => setReassignModal(false)} style={btnGhost}>
                Cancel
              </button>
              <button
                onClick={handleReassignStaff}
                disabled={reassigning || hasInProgressTask || !reassignStaffId}
                style={btnPrimary}
              >
                {reassigning ? "Reassigning..." : "Reassign Staff"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={sectionCard}>
      <div style={sectionHeader}>
        <h3 style={sectionTitle}>{title}</h3>
      </div>
      {children}
    </div>
  );
}

function InfoRow({ label, value, bold }) {
  return (
    <div style={infoRow}>
      <span style={infoLabel}>{label}</span>
      <span style={{ ...infoValue, fontWeight: bold ? 800 : 600 }}>
        {value}
      </span>
    </div>
  );
}

function MiniInfo({ label, value }) {
  return (
    <div style={miniInfoCard}>
      <div style={miniInfoLabel}>{label}</div>
      <div style={miniInfoValue}>{value}</div>
    </div>
  );
}

function EmptyText({ children }) {
  return <p style={emptyText}>{children}</p>;
}

function TableShell({ children }) {
  return <div style={tableShell}>{children}</div>;
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const pageShell = {
  maxWidth: 1260, // Compact centered Admin Order detail
  margin: "0 auto",
  display: "flex",
  flexDirection: "column",
  gap: 12,
  color: "#202124",
};

const heroCard = {
  background: "#ffffff",
  border: "1px solid #dfe2e5",
  borderRadius: 0,
  padding: "14px 16px",
};

const heroTop = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 10,
  flexWrap: "wrap",
  marginBottom: 10,
};

const eyebrow = {
  fontSize: 9.5,
  fontWeight: 600,
  letterSpacing: ".35px",
  textTransform: "uppercase",
  color: "#62676e",
  marginBottom: 8,
};

const heroTitleRow = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  flexWrap: "wrap",
};

const pageTitle = {
  margin: 0,
  fontSize: 25,
  lineHeight: 1.15,
  fontWeight: 700,
  color: "#17191c",
  letterSpacing: "-0.025em",
};

const pageSubtitle = {
  margin: "7px 0 0",
  fontSize: 12.5,
  color: "#73777e",
  lineHeight: 1.45,
  maxWidth: 620,
};

const heroActions = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

const detailTabRow = {
  display: "flex",
  gap: 6,
  flexWrap: "wrap",
  marginTop: 12,
  paddingTop: 12,
  borderTop: "1px solid #dfe2e5",
};

const detailTabButton = {
  padding: "0 14px",
  height: 36,
  borderRadius: 0,
  border: "1px solid #dfe2e5",
  background: "#ffffff",
  color: "#25282c",
  fontSize: 11.5,
  fontWeight: 600,
  cursor: "pointer",
  transition: "all 0.2s ease",
};

const statsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: 8,
};

const statCard = {
  background: "#ffffff",
  border: "1px solid #dfe2e5",
  borderRadius: 0,
  padding: "12px 14px",
  minHeight: 72,
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
};

const statTop = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 8,
  marginBottom: 8,
};

const toneDot = {
  display: "inline-block",
  width: 8,
  height: 8,
  borderRadius: 999,
  flexShrink: 0,
};

const statLabel = {
  fontSize: 9.5,
  fontWeight: 600,
  letterSpacing: ".35px",
  textTransform: "uppercase",
  color: "#62676e",
};

const statValue = {
  fontSize: 23,
  fontWeight: 700,
  color: "#17191c",
  lineHeight: 1,
};

const sectionGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
  gap: 12,
};

const detailPairGrid = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
  alignItems: "start",
};

const sectionCard = {
  background: "#ffffff",
  border: "1px solid #dfe2e5",
  borderRadius: 0,
  padding: "14px 16px",
};

const sectionHeader = {
  marginBottom: 10,
  paddingBottom: 8,
  borderBottom: "1px solid #eff0f1",
};

const sectionTitle = {
  margin: 0,
  fontSize: 16,
  fontWeight: 700,
  color: "#1e2023",
};

const infoRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 12,
  padding: "6px 0",
  borderBottom: "1px solid #fafafa",
};

const infoLabel = {
  fontSize: 11.5,
  color: "#777c82",
  fontWeight: 600,
  minWidth: 120,
};

const infoValue = {
  fontSize: 12.5,
  color: "#34383d",
  textAlign: "right",
  maxWidth: "72%",
  wordBreak: "break-word",
  lineHeight: 1.45,
};

const tableShell = {
  width: "100%",
  overflowX: "auto",
  border: "1px solid #dfe2e5",
  borderRadius: 0,
};

const table = {
  width: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
  minWidth: 680,
};

const theadRow = { background: "#fafafa" };
const tbodyRow = { background: "#ffffff" };
const tfootRow = { background: "#fafafa" };

const th = {
  textAlign: "left",
  padding: "8px 12px",
  fontSize: 9.5,
  fontWeight: 600,
  color: "#60656d",
  textTransform: "uppercase",
  letterSpacing: ".35px",
  borderBottom: "1px solid #e4e6e9",
};

const td = {
  padding: "9px 12px",
  color: "#34383d",
  fontSize: 11.5,
  borderBottom: "1px solid #eff0f1",
  verticalAlign: "middle",
};

const emptyText = {
  margin: 0,
  fontSize: 12.5,
  color: "#777c82",
  lineHeight: 1.5,
};

const infoNotice = {
  background: "#fafafa",
  border: "1px solid #dfe2e5",
  color: "#34383d",
  borderRadius: 4,
  padding: "10px 14px",
  fontSize: 12,
  fontWeight: 600,
};

const noticeBox = {
  marginTop: 16,
  padding: 14,
  background: "#fafafa",
  borderRadius: 4,
  border: "1px dashed #d9dce0",
};

const noticeTitle = {
  fontSize: 12,
  fontWeight: 700,
  color: "#1e2023",
  marginBottom: 10,
};

const textBlock = {
  marginTop: 16,
  padding: 14,
  borderRadius: 4,
  background: "#fafafa",
  border: "1px solid #dfe2e5",
};

const textBlockTitle = {
  fontSize: 9.5,
  fontWeight: 600,
  color: "#60656d",
  marginBottom: 8,
  textTransform: "uppercase",
  letterSpacing: ".35px",
};

const multilineText = {
  margin: 0,
  fontSize: 12.5,
  color: "#34383d",
  lineHeight: 1.6,
  whiteSpace: "pre-wrap",
};

const taskList = {
  marginTop: 16,
  border: "1px solid #dfe2e5",
  borderRadius: 4,
  overflow: "hidden",
};

const taskListHeader = {
  padding: "10px 14px",
  background: "#fafafa",
  borderBottom: "1px solid #dfe2e5",
  fontSize: 9.5,
  fontWeight: 600,
  color: "#60656d",
  textTransform: "uppercase",
  letterSpacing: ".35px",
};

const taskCard = {
  padding: 14,
  borderBottom: "1px solid #eff0f1",
  background: "#ffffff",
};

const taskTop = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 10,
  marginBottom: 12,
};

const taskTitle = {
  fontSize: 13,
  fontWeight: 700,
  color: "#1e2023",
  marginBottom: 4,
};

const taskMeta = {
  fontSize: 11.5,
  color: "#777c82",
  lineHeight: 1.5,
};

const taskDetailsGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
  gap: 10,
  marginBottom: 12,
};

const miniInfoCard = {
  background: "#fafafa",
  border: "1px solid #dfe2e5",
  borderRadius: 4,
  padding: 10,
};

const miniInfoLabel = {
  fontSize: 9.5,
  fontWeight: 600,
  color: "#60656d",
  textTransform: "uppercase",
  letterSpacing: ".35px",
  marginBottom: 6,
};

const miniInfoValue = {
  fontSize: 12.5,
  fontWeight: 600,
  color: "#1e2023",
  lineHeight: 1.5,
  wordBreak: "break-word",
};

const taskActions = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
  alignItems: "center",
};

const timelineCancelNotice = {
  marginBottom: 16,
  padding: "10px 14px",
  background: "#fef2f2",
  border: "1px solid #fecaca",
  borderRadius: 4,
  fontSize: 12.5,
  fontWeight: 600,
  color: "#991b1b",
};

const timelineScroller = {
  width: "100%",
  overflowX: "auto",
  paddingBottom: 4,
};

const timelineRail = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
  alignItems: "start",
  columnGap: 0,
  rowGap: 0,
  width: "100%",
  minWidth: 640,
};

const timelineStep = {
  minWidth: 0,
  display: "flex",
  flexDirection: "column",
};

const timelineTopLine = {
  display: "flex",
  alignItems: "center",
  marginBottom: 12,
};
const timelineLine = {
  flex: 1,
  height: 4,
  borderRadius: 999,
  background: "#e4e6e9",
};

const timelineDot = {
  width: 28,
  height: 28,
  borderRadius: 999,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 11.5,
  fontWeight: 700,
  border: "1px solid #d9dce0",
  background: "#ffffff",
  color: "#777c82",
  flexShrink: 0,
};

const timelineStepTitle = {
  fontSize: 11.5,
  fontWeight: 700,
  color: "#1e2023",
  marginBottom: 6,
  lineHeight: 1.35,
  textAlign: "center",
  padding: "0 8px",
};

const timelineStepNote = {
  fontSize: 10.5,
  color: "#777c82",
  lineHeight: 1.45,
  textAlign: "center",
  padding: "0 8px",
};

const mutedBadge = {
  fontSize: 11.5,
  fontWeight: 600,
  color: "#777c82",
  background: "#fafafa",
  border: "1px solid #dfe2e5",
  borderRadius: 4,
  padding: "6px 12px",
};

const pill = {
  display: "inline-flex",
  alignItems: "center",
  padding: "4px 10px",
  borderRadius: 4,
  fontSize: 10.5,
  fontWeight: 600,
  whiteSpace: "nowrap",
};

const inlineActions = {
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const mutedInline = {
  fontSize: 11.5,
  color: "#777c82",
};

const previewLinkButton = {
  background: "none",
  border: "none",
  padding: 0,
  color: "#1e2023",
  fontWeight: 700,
  fontSize: 11.5,
  cursor: "pointer",
  textDecoration: "underline",
};

const proofPreviewBox = {
  border: "1px solid #dfe2e5",
  borderRadius: 4,
  background: "#fafafa",
  padding: 14,
  minHeight: 320,
  maxHeight: "70vh",
  overflow: "auto",
};

const proofPreviewImage = {
  display: "block",
  maxWidth: "100%",
  width: "100%",
  height: "auto",
  borderRadius: 4,
};

const proofPreviewFrame = {
  width: "100%",
  height: "65vh",
  border: "none",
  borderRadius: 4,
  background: "#ffffff",
};

const proofPreviewFallback = {
  minHeight: 220,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
  color: "#777c82",
  fontSize: 12.5,
  fontWeight: 600,
  padding: 20,
};

const btnSecondaryLink = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 14px",
  height: 36,
  background: "#ffffff",
  color: "#25282c",
  border: "1px solid #d9dce0",
  borderRadius: 4,
  fontSize: 11.5,
  fontWeight: 600,
  textDecoration: "none",
  transition: "background 0.2s",
};

const linkButton = {
  background: "none",
  border: "none",
  color: "#1e2023",
  fontWeight: 700,
  cursor: "pointer",
  padding: 0,
  fontSize: 12.5,
  textDecoration: "underline",
};

const overlay = {
  position: "fixed",
  inset: 0,
  background: "rgba(0, 0, 0, 0.6)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
  padding: 20,
};

const modalBox = {
  background: "#fff",
  borderRadius: 4,
  padding: 24,
  width: 480,
  maxWidth: "100%",
  border: "1px solid #dfe2e5",
};

const modalHeader = {
  marginBottom: 16,
};

const modalTitle = {
  margin: 0,
  fontSize: 18,
  fontWeight: 700,
  color: "#1e2023",
  letterSpacing: "-0.01em",
};

const modalSubtitle = {
  margin: "6px 0 0",
  fontSize: 12.5,
  color: "#777c82",
  lineHeight: 1.5,
};

const alertWarning = {
  background: "#fefce8",
  border: "1px solid #fde047",
  color: "#a16207",
  borderRadius: 4,
  padding: "10px 14px",
  fontSize: 11.5,
  fontWeight: 600,
  marginBottom: 12,
};

const formGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 14,
};

const modalActions = {
  display: "flex",
  gap: 12,
  justifyContent: "flex-end",
  marginTop: 24,
  flexWrap: "wrap",
};

const labelSm = {
  fontSize: 11.5,
  fontWeight: 600,
  color: "#1e2023",
  display: "block",
  marginBottom: 8,
};

const inputFull = {
  width: "100%",
  height: 38,
  borderRadius: 4,
  border: "1px solid #d4d7db",
  background: "#fff",
  padding: "0 12px",
  fontSize: 12,
  color: "#25282c",
  boxSizing: "border-box",
  outline: "none",
};

const center = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: 320,
  color: "#777c82",
  fontSize: 13,
  fontWeight: 600,
};

const btnBack = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  height: 32,
  padding: "0 12px",
  background: "#ffffff",
  color: "#25282c",
  border: "1px solid #d9dce0",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 11.5,
  fontWeight: 600,
  transition: "all 0.2s",
};

const btnGhost = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  height: 36,
  padding: "0 14px",
  background: "#ffffff",
  color: "#25282c",
  border: "1px solid #d9dce0",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 11.5,
  fontWeight: 600,
  transition: "all 0.2s",
};

const btnPrimary = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  height: 36,
  padding: "0 14px",
  background: "#18181b",
  color: "#ffffff",
  border: "1px solid #18181b",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 11.5,
  fontWeight: 600,
  transition: "background 0.2s",
};

const btnView = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  height: 32,
  padding: "0 12px",
  background: "#ffffff",
  color: "#25282c",
  border: "1px solid #d9dce0",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 11.5,
  fontWeight: 600,
  transition: "background 0.2s",
};

const btnSecondary = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  height: 36,
  padding: "0 14px",
  background: "#ffffff",
  color: "#25282c",
  border: "1px solid #d9dce0",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 11.5,
  fontWeight: 600,
  transition: "background 0.2s",
};

const btnAccept = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  height: 36,
  padding: "0 14px",
  background: "#18181b",
  color: "#ffffff",
  border: "1px solid #18181b",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 11.5,
  fontWeight: 600,
  transition: "background 0.2s",
};

const btnDecline = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  height: 36,
  padding: "0 14px",
  background: "#fef2f2",
  color: "#991b1b",
  border: "1px solid #fecaca",
  borderRadius: 4,
  cursor: "pointer",
  fontSize: 11.5,
  fontWeight: 600,
  transition: "background 0.2s",
};
