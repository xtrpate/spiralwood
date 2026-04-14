import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import api, { buildAssetUrl } from "../../services/api";
import CustomerTemplateWorkbench from "./CustomerTemplateWorkbench";
import "./customizepage.css";

const STATUS_META = {
  contract_released: {
    label: "Contract Released",
    color: "#7c3aed",
    bg: "#f5f3ff",
  },
  pending: {
    label: "Pending Review",
    color: "#9a3412",
    bg: "#fff7ed",
  },
  confirmed: {
    label: "Confirmed",
    color: "#1d4ed8",
    bg: "#eff6ff",
  },
  production: {
    label: "In Production",
    color: "#7c3aed",
    bg: "#f5f3ff",
  },
  shipping: {
    label: "Shipping",
    color: "#0f766e",
    bg: "#ecfeff",
  },
  delivered: {
    label: "Delivered",
    color: "#166534",
    bg: "#f0fdf4",
  },
  completed: {
    label: "Completed",
    color: "#166534",
    bg: "#dcfce7",
  },
  cancelled: {
    label: "Cancelled",
    color: "#b91c1c",
    bg: "#fef2f2",
  },
};

const ESTIMATION_STATUS_META = {
  draft: { label: "Draft", color: "#475569", bg: "#f8fafc" },
  sent: { label: "Quotation Ready", color: "#1d4ed8", bg: "#eff6ff" },
  approved: { label: "Quotation Approved", color: "#166534", bg: "#f0fdf4" },
  rejected: { label: "Revision Needed", color: "#b45309", bg: "#fff7ed" },
};

const PAY_STATUS_META = {
  unpaid: { label: "Unpaid", color: "#b91c1c", bg: "#fef2f2" },
  partial: {
    label: "Partial / Proof Submitted",
    color: "#c2410c",
    bg: "#fff7ed",
  },
  paid: { label: "Paid", color: "#166534", bg: "#f0fdf4" },
};

const PAY_METHOD_LABELS = {
  cod: "Cash on Delivery",
  cop: "Cash on Pick-up",
  gcash: "GCash",
  bank_transfer: "Bank Transfer",
  cash: "Cash",
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
    raw.startsWith("/assets/")
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
    raw.startsWith("blob:")
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

const prettifyText = (value, fallback = "Custom Furniture") => {
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
    return prettifyText(item.template_category, "Admin Blueprint Design");
  }

  return "Admin Blueprint Design";
};

const getDisplayTitle = (item = {}) => {
  return prettifyText(
    item.base_blueprint_title || item.product_name,
    "Custom Furniture",
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

  return (
    mime.startsWith("image/") ||
    /\.(jpg|jpeg|png|webp)$/i.test(url)
  );
};

const getSenderMeta = (entry = {}) => {
  const role = String(entry?.sender_role || "").trim().toLowerCase();

  if (role === "admin") {
    return {
      label: entry?.sender_name || "Admin",
      color: "#7c3aed",
      bg: "#f5f3ff",
      border: "#ddd6fe",
    };
  }

  if (role === "staff") {
    return {
      label: entry?.sender_name || "Staff",
      color: "#0f766e",
      bg: "#ecfeff",
      border: "#a5f3fc",
    };
  }

  if (role === "system") {
    return {
      label: "System",
      color: "#475569",
      bg: "#f8fafc",
      border: "#e2e8f0",
    };
  }

  return {
    label: entry?.sender_name || "You",
    color: "#166534",
    bg: "#f0fdf4",
    border: "#bbf7d0",
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
  const [downPaymentMethod, setDownPaymentMethod] = useState("gcash");
  const [downPaymentFile, setDownPaymentFile] = useState(null);
  const [downPaymentSubmitting, setDownPaymentSubmitting] = useState(false);

  const [discussionMessage, setDiscussionMessage] = useState("");
  const [discussionFiles, setDiscussionFiles] = useState([]);
  const [discussionSubmitting, setDiscussionSubmitting] = useState(false);

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
            "Failed to load custom request detail.",
        );
      } finally {
        if (showLoader) setLoading(false);
      }
    },
    [id],
  );

  useEffect(() => {
    loadRequestDetail(true);
  }, [loadRequestDetail]);

  const statusMeta = useMemo(
    () =>
      STATUS_META[requestData?.status] || {
        label: prettifyText(requestData?.status, "Unknown"),
        color: "#334155",
        bg: "#f8fafc",
      },
    [requestData],
  );

  const payMeta = useMemo(
    () =>
      PAY_STATUS_META[requestData?.payment_status] || {
        label: prettifyText(requestData?.payment_status, "Unknown"),
        color: "#334155",
        bg: "#f8fafc",
      },
    [requestData],
  );

  const latestEstimation = requestData?.latest_estimation || null;

  const estimationMeta = useMemo(() => {
    const statusKey = String(latestEstimation?.status || "")
      .trim()
      .toLowerCase();

    return (
      ESTIMATION_STATUS_META[statusKey] || {
        label: prettifyText(statusKey, "No Quotation Yet"),
        color: "#334155",
        bg: "#f8fafc",
      }
    );
  }, [latestEstimation]);

  const quotedTotal = Number(
    latestEstimation?.grand_total || requestData?.total || 0,
  );

  const paymentSummary = requestData?.payment_summary || null;
  const downPaymentDue = Number(
    paymentSummary?.down_payment_due ||
      requestData?.down_payment ||
      (quotedTotal > 0 ? quotedTotal * 0.3 : 0),
  );

  const latestPayment = paymentSummary?.latest_transaction || null;
  const hasPendingDownPayment =
    String(latestPayment?.status || "").trim().toLowerCase() === "pending";

  const hasVerifiedDownPayment = Boolean(
    paymentSummary?.has_verified_down_payment,
  );

  const canDecideOnQuote =
    String(latestEstimation?.status || "")
      .trim()
      .toLowerCase() === "sent";

  const canSubmitDownPayment =
    String(latestEstimation?.status || "")
      .trim()
      .toLowerCase() === "approved" &&
    !hasPendingDownPayment &&
    !hasVerifiedDownPayment;

  const previewBlueprint = useMemo(
    () => (previewItem ? buildPreviewBlueprint(previewItem) : null),
    [previewItem],
  );

  const discussionThread = useMemo(
    () => (Array.isArray(requestData?.discussion) ? requestData.discussion : []),
    [requestData],
  );

  const handleEstimationDecision = async (action) => {
    if (!requestData?.id || !latestEstimation?.id) return;

    let endpoint = "";
    let payload = {};
    let successMessage = "";

    if (action === "accept") {
      endpoint = `/customer/custom-orders/${requestData.id}/estimate/accept`;
      successMessage = "Quotation approved successfully.";
    }

    if (action === "request-revision") {
      const note = window.prompt(
        "Enter your revision note for the admin:",
        "",
      );

      if (note === null) return;

      endpoint = `/customer/custom-orders/${requestData.id}/estimate/request-revision`;
      payload = { note: String(note || "").trim() };
      successMessage = "Revision request sent successfully.";
    }

    if (action === "reject") {
      const reason = window.prompt(
        "Enter your reason for rejecting this quotation:",
        "",
      );

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

  const handleSubmitDownPayment = async (e) => {
    e.preventDefault();

    if (!requestData?.id) return;

    if (!downPaymentFile) {
      toast.error("Upload your proof of payment first.");
      return;
    }

    const formData = new FormData();
    formData.append("payment_method", downPaymentMethod);
    formData.append("proof", downPaymentFile);

    setDownPaymentSubmitting(true);
    try {
      await api.post(
        `/customer/custom-orders/${requestData.id}/down-payment`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        },
      );

      await loadRequestDetail(false);
      setDownPaymentFile(null);
      toast.success("30% down payment proof submitted successfully.");
    } catch (err) {
      toast.error(
        err.response?.data?.message ||
          err.response?.data?.error ||
          "Failed to submit 30% down payment.",
      );
    } finally {
      setDownPaymentSubmitting(false);
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
      toast.success("Discussion message sent successfully.");
    } catch (err) {
      toast.error(
        err.response?.data?.message ||
          err.response?.data?.error ||
          "Failed to send discussion message.",
      );
    } finally {
      setDiscussionSubmitting(false);
    }
  };

  return (
    <div>
      <div
        className="page-hero"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1>Custom Request Detail</h1>
          <p>Review your submitted custom request and current status.</p>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            className="btn btn-secondary"
            onClick={() => navigate("/orders")}
          >
            ← Back to Orders
          </button>

          <Link to="/customize" className="btn btn-primary">
            Customize More
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="checkout-section">
          <div className="checkout-section-body">
            <p>Loading custom request detail…</p>
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
            <p>Custom request not found.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="checkout-layout">
            <div className="checkout-form-panel">
              <div className="checkout-section">
                <div className="checkout-section-header">
                  <div className="checkout-section-num">#</div>
                  <h3>Request Overview</h3>
                </div>

                <div className="checkout-section-body">
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(220px, 1fr))",
                      gap: 12,
                    }}
                  >
                    <DetailValue label="Request Number">
                      {requestData.order_number || "—"}
                    </DetailValue>

                    <DetailValue label="Submitted On">
                      {formatDate(requestData.created_at)}
                    </DetailValue>

                    <div className="summary-row">
                      <span>Status</span>
                      <span
                        style={{
                          display: "inline-flex",
                          padding: "6px 10px",
                          borderRadius: 999,
                          background: statusMeta.bg,
                          color: statusMeta.color,
                          fontWeight: 700,
                        }}
                      >
                        {statusMeta.label}
                      </span>
                    </div>

                    <div className="summary-row">
                      <span>Payment Status</span>
                      <span
                        style={{
                          display: "inline-flex",
                          padding: "6px 10px",
                          borderRadius: 999,
                          background: payMeta.bg,
                          color: payMeta.color,
                          fontWeight: 700,
                        }}
                      >
                        {payMeta.label}
                      </span>
                    </div>

                    <DetailValue label="Preferred Payment">
                      {PAY_METHOD_LABELS[requestData.payment_method] ||
                        requestData.payment_method ||
                        "—"}
                    </DetailValue>

                    <DetailValue label="Quoted Total">
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
                    <div
                      className="checkout-section-num"
                      style={{
                        background: "linear-gradient(135deg,#1d4ed8,#60a5fa)",
                        fontSize: 13,
                      }}
                    >
                      ₱
                    </div>
                    <h3>Quotation Breakdown</h3>

                    <span
                      style={{
                        marginLeft: "auto",
                        display: "inline-flex",
                        padding: "6px 10px",
                        borderRadius: 999,
                        background: estimationMeta.bg,
                        color: estimationMeta.color,
                        fontWeight: 700,
                        fontSize: 12,
                      }}
                    >
                      {estimationMeta.label}
                    </span>
                  </div>

                  <div className="checkout-section-body">
                    <div
                      style={{
                        border: "1px solid #e2e8f0",
                        borderRadius: 14,
                        overflow: "hidden",
                        marginBottom: 16,
                      }}
                    >
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "minmax(0,1fr) 90px 120px 120px",
                          gap: 12,
                          padding: "12px 14px",
                          background: "#f8fafc",
                          borderBottom: "1px solid #e2e8f0",
                          fontWeight: 700,
                          fontSize: 12,
                          color: "#475569",
                        }}
                      >
                        <div>Description</div>
                        <div>Qty</div>
                        <div>Rate</div>
                        <div>Amount</div>
                      </div>

                      {(latestEstimation.items || []).length ? (
                        latestEstimation.items.map((item) => (
                          <div
                            key={item.id}
                            style={{
                              display: "grid",
                              gridTemplateColumns:
                                "minmax(0,1fr) 90px 120px 120px",
                              gap: 12,
                              padding: "12px 14px",
                              borderBottom: "1px solid #f1f5f9",
                              alignItems: "center",
                            }}
                          >
                            <div
                              style={{ color: "#0f172a", fontWeight: 600 }}
                            >
                              {item.description || "Material Item"}
                            </div>
                            <div style={{ color: "#475569" }}>
                              {item.quantity || 0}
                            </div>
                            <div style={{ color: "#475569" }}>
                              {formatMoney(item.unit_cost || 0)}
                            </div>
                            <div
                              style={{
                                color: "#D2691E",
                                fontWeight: 700,
                              }}
                            >
                              {formatMoney(item.subtotal || 0)}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div style={{ padding: 16, color: "#64748b" }}>
                          No quotation line items available yet.
                        </div>
                      )}
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1.2fr .8fr",
                        gap: 16,
                      }}
                    >
                      <div
                        style={{
                          border: "1px solid #e2e8f0",
                          borderRadius: 14,
                          padding: 16,
                          background: "#fff",
                        }}
                      >
                        <h4 style={{ margin: "0 0 10px", color: "#0f172a" }}>
                          Admin Notes
                        </h4>

                        {String(latestEstimation.notes || "").trim() ? (
                          <div
                            style={{
                              color: "#334155",
                              lineHeight: 1.6,
                              whiteSpace: "pre-wrap",
                            }}
                          >
                            {latestEstimation.notes}
                          </div>
                        ) : (
                          <div style={{ color: "#64748b" }}>
                            No admin notes were attached to this quotation.
                          </div>
                        )}

                        {canDecideOnQuote ? (
                          <div
                            style={{
                              marginTop: 16,
                              display: "flex",
                              gap: 10,
                              flexWrap: "wrap",
                            }}
                          >
                            <button
                              type="button"
                              className="btn btn-primary"
                              disabled={decisionLoading === "accept"}
                              onClick={() =>
                                handleEstimationDecision("accept")
                              }
                            >
                              {decisionLoading === "accept"
                                ? "Approving..."
                                : "Accept Quotation"}
                            </button>

                            <button
                              type="button"
                              className="btn btn-secondary"
                              disabled={
                                decisionLoading === "request-revision"
                              }
                              onClick={() =>
                                handleEstimationDecision("request-revision")
                              }
                            >
                              {decisionLoading === "request-revision"
                                ? "Sending..."
                                : "Request Revision"}
                            </button>

                            <button
                              type="button"
                              disabled={decisionLoading === "reject"}
                              onClick={() =>
                                handleEstimationDecision("reject")
                              }
                              style={{
                                border: "none",
                                borderRadius: 12,
                                padding: "12px 18px",
                                background: "#fee2e2",
                                color: "#b91c1c",
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              {decisionLoading === "reject"
                                ? "Rejecting..."
                                : "Reject Quotation"}
                            </button>
                          </div>
                        ) : null}
                      </div>

                      <div
                        style={{
                          border: "1px solid #e2e8f0",
                          borderRadius: 14,
                          padding: 16,
                          background: "#fffaf5",
                        }}
                      >
                        <h4 style={{ margin: "0 0 10px", color: "#0f172a" }}>
                          Quotation Summary
                        </h4>

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

                        <div
                          className="summary-row"
                          style={{
                            marginTop: 10,
                            paddingTop: 12,
                            borderTop: "1px solid #e2e8f0",
                          }}
                        >
                          <span style={{ fontWeight: 700 }}>Grand Total</span>
                          <strong
                            style={{ color: "#D2691E", fontSize: 18 }}
                          >
                            {formatMoney(latestEstimation.grand_total || 0)}
                          </strong>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {String(latestEstimation?.status || "").trim().toLowerCase() ===
              "approved" ? (
                <div className="checkout-section">
                  <div className="checkout-section-header">
                    <div
                      className="checkout-section-num"
                      style={{
                        background: "linear-gradient(135deg,#d97706,#f59e0b)",
                        fontSize: 12,
                        fontWeight: 800,
                      }}
                    >
                      30%
                    </div>
                    <h3>Required Down Payment</h3>
                  </div>

                  <div className="checkout-section-body">
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 16,
                      }}
                    >
                      <div
                        style={{
                          border: "1px solid #e2e8f0",
                          borderRadius: 14,
                          padding: 16,
                          background: "#fffaf5",
                        }}
                      >
                        <h4 style={{ margin: "0 0 12px", color: "#0f172a" }}>
                          Payment Requirement
                        </h4>

                        <DetailValue label="Quoted Total">
                          {formatMoney(quotedTotal || 0)}
                        </DetailValue>

                        <DetailValue label="Required 30% Down Payment">
                          {formatMoney(downPaymentDue || 0)}
                        </DetailValue>

                        <DetailValue label="Remaining Balance">
                          {formatMoney(
                            paymentSummary?.balance_due ||
                              Math.max(quotedTotal - downPaymentDue, 0),
                          )}
                        </DetailValue>

                        <p
                          style={{
                            marginTop: 14,
                            color: "#64748b",
                            lineHeight: 1.6,
                          }}
                        >
                          Your custom order will not move forward to contract
                          release or production until the 30% down payment is
                          submitted and verified by the admin.
                        </p>

                        {latestPayment ? (
                          <div
                            style={{
                              marginTop: 14,
                              padding: 12,
                              borderRadius: 12,
                              background: "#f8fafc",
                              border: "1px solid #e2e8f0",
                              color: "#334155",
                            }}
                          >
                            <div
                              style={{
                                fontWeight: 700,
                                marginBottom: 6,
                              }}
                            >
                              Latest Payment Submission
                            </div>
                            <div>
                              Status:{" "}
                              <strong>
                                {prettifyText(
                                  latestPayment.status,
                                  "Pending",
                                )}
                              </strong>
                            </div>
                            <div>
                              Amount:{" "}
                              <strong>
                                {formatMoney(latestPayment.amount || 0)}
                              </strong>
                            </div>
                            <div>
                              Method:{" "}
                              <strong>
                                {prettifyText(
                                  latestPayment.payment_method,
                                  "Payment Method",
                                )}
                              </strong>
                            </div>
                            <div>
                              Submitted:{" "}
                              <strong>
                                {formatDate(latestPayment.created_at)}
                              </strong>
                            </div>
                          </div>
                        ) : null}
                      </div>

                      <div
                        style={{
                          border: "1px solid #e2e8f0",
                          borderRadius: 14,
                          padding: 16,
                          background: "#fff",
                        }}
                      >
                        <h4 style={{ margin: "0 0 12px", color: "#0f172a" }}>
                          Submit 30% Down Payment Proof
                        </h4>

                        {hasVerifiedDownPayment ? (
                          <div
                            style={{
                              padding: 14,
                              borderRadius: 12,
                              background: "#f0fdf4",
                              border: "1px solid #bbf7d0",
                              color: "#166534",
                              fontWeight: 600,
                            }}
                          >
                            Your 30% down payment is already verified.
                          </div>
                        ) : hasPendingDownPayment ? (
                          <div
                            style={{
                              padding: 14,
                              borderRadius: 12,
                              background: "#fff7ed",
                              border: "1px solid #fed7aa",
                              color: "#b45309",
                              fontWeight: 600,
                            }}
                          >
                            Your payment proof is already submitted and waiting
                            for admin verification.
                          </div>
                        ) : canSubmitDownPayment ? (
                          <form onSubmit={handleSubmitDownPayment}>
                            <label
                              style={{
                                display: "block",
                                fontSize: 12,
                                fontWeight: 700,
                                color: "#475569",
                                marginBottom: 6,
                              }}
                            >
                              Payment Method
                            </label>

                            <select
                              value={downPaymentMethod}
                              onChange={(e) =>
                                setDownPaymentMethod(e.target.value)
                              }
                              style={{
                                width: "100%",
                                minHeight: 46,
                                borderRadius: 12,
                                border: "1px solid #cbd5e1",
                                padding: "10px 12px",
                                marginBottom: 14,
                              }}
                            >
                              <option value="gcash">GCash</option>
                              <option value="bank_transfer">
                                Bank Transfer
                              </option>
                              <option value="cash">Cash</option>
                            </select>

                            <label
                              style={{
                                display: "block",
                                fontSize: 12,
                                fontWeight: 700,
                                color: "#475569",
                                marginBottom: 6,
                              }}
                            >
                              Upload Payment Proof
                            </label>

                            <input
                              type="file"
                              accept=".jpg,.jpeg,.png,.pdf"
                              onChange={(e) =>
                                setDownPaymentFile(
                                  e.target.files?.[0] || null,
                                )
                              }
                              style={{
                                width: "100%",
                                marginBottom: 14,
                              }}
                            />

                            <button
                              type="submit"
                              className="btn btn-primary"
                              disabled={downPaymentSubmitting}
                            >
                              {downPaymentSubmitting
                                ? "Submitting..."
                                : `Submit ${formatMoney(
                                    downPaymentDue || 0,
                                  )} Down Payment`}
                            </button>
                          </form>
                        ) : (
                          <div
                            style={{
                              padding: 14,
                              borderRadius: 12,
                              background: "#f8fafc",
                              border: "1px solid #e2e8f0",
                              color: "#64748b",
                            }}
                          >
                            Approve the quotation first before submitting the
                            30% down payment.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              <div className="checkout-section">
                <div className="checkout-section-header">
                  <div
                    className="checkout-section-num"
                    style={{
                      background: "linear-gradient(135deg,#2d6a4f,#52b788)",
                      fontSize: 13,
                    }}
                  >
                    ✂️
                  </div>
                  <h3>Requested Custom Items</h3>
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: 12,
                      color: "#aaa",
                    }}
                  >
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
                              style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                                borderRadius: 8,
                              }}
                              onError={(e) => {
                                e.target.style.display = "none";
                                if (e.target.nextSibling) {
                                  e.target.nextSibling.style.display = "flex";
                                }
                              }}
                            />
                          ) : null}

                          <div
                            style={{
                              display:
                                item.image_url || item.preview_image_url
                                  ? "none"
                                  : "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              height: "100%",
                              fontSize: 20,
                            }}
                          >
                            🪵
                          </div>
                        </div>

                        <div className="checkout-item-details">
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 12,
                              alignItems: "flex-start",
                              flexWrap: "wrap",
                            }}
                          >
                            <div>
                              <div className="checkout-item-name">
                                {getDisplayTitle(item)}
                              </div>

                              <div
                                style={{
                                  fontSize: 12,
                                  color: "#64748b",
                                  marginTop: 4,
                                  fontWeight: 500,
                                }}
                              >
                                {formatTemplateLabel(item)} • Submitted custom
                                draft
                              </div>
                            </div>

                            {canPreview ? (
                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => setPreviewItem(item)}
                                style={{
                                  padding: "8px 12px",
                                  minHeight: "unset",
                                  fontSize: 12,
                                  fontWeight: 700,
                                }}
                              >
                                View Submitted Design
                              </button>
                            ) : null}
                          </div>

                          <div
                            className="custom-cart-specs"
                            style={{ marginTop: 8 }}
                          >
                            {item.wood_type && (
                              <span className="custom-spec-tag">
                                🪵{" "}
                                {prettifyText(item.wood_type, item.wood_type)}
                              </span>
                            )}

                            {(item.finish_color || item.color) && (
                              <span className="custom-spec-tag">
                                🎨{" "}
                                {prettifyText(
                                  item.finish_color || item.color,
                                  item.finish_color || item.color,
                                )}
                              </span>
                            )}

                            {item.door_style && (
                              <span className="custom-spec-tag">
                                🚪{" "}
                                {prettifyText(
                                  item.door_style,
                                  item.door_style,
                                )}
                              </span>
                            )}

                            {item.hardware && (
                              <span className="custom-spec-tag">
                                🔩 {prettifyText(item.hardware, item.hardware)}
                              </span>
                            )}

                            {(dims.width || dims.height || dims.depth) && (
                              <span className="custom-spec-tag">
                                📐 W{formatMm(dims.width)} • H
                                {formatMm(dims.height)} • D
                                {formatMm(dims.depth)}
                              </span>
                            )}
                          </div>

                          {item.comments ? (
                            <div
                              className="checkout-item-sub"
                              style={{ marginTop: 6 }}
                            >
                              💬 {item.comments}
                            </div>
                          ) : null}

                          {Array.isArray(item.reference_photos) &&
                          item.reference_photos.length ? (
                            <div style={{ marginTop: 10 }}>
                              <div
                                style={{
                                  fontSize: 12,
                                  fontWeight: 700,
                                  color: "#475569",
                                  marginBottom: 8,
                                }}
                              >
                                Reference Photos
                              </div>

                              <div
                                style={{
                                  display: "flex",
                                  gap: 8,
                                  flexWrap: "wrap",
                                }}
                              >
                                {item.reference_photos.map((photo) => (
                                  <a
                                    key={photo.id}
                                    href={resolveAttachmentUrl(photo.file_url)}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{
                                      display: "block",
                                      width: 72,
                                      height: 72,
                                      borderRadius: 10,
                                      overflow: "hidden",
                                      border: "1px solid #e2e8f0",
                                      background: "#f8fafc",
                                    }}
                                  >
                                    <img
                                      src={resolveAttachmentUrl(photo.file_url)}
                                      alt={photo.file_name || "Reference photo"}
                                      style={{
                                        width: "100%",
                                        height: "100%",
                                        objectFit: "cover",
                                      }}
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

                        <div
                          className="checkout-item-price"
                          style={{ fontSize: 12, color: "#aaa" }}
                        >
                          Quote Needed
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="checkout-section">
                <div className="checkout-section-header">
                  <div className="checkout-section-num">i</div>
                  <h3>Project / Delivery Information</h3>
                </div>

                <div className="checkout-section-body">
                  <div
                    style={{
                      display: "grid",
                      gap: 14,
                    }}
                  >
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: 12,
                          fontWeight: 700,
                          color: "#475569",
                          marginBottom: 6,
                        }}
                      >
                        Delivery Address
                      </label>
                      <div
                        style={{
                          border: "1px solid #e2e8f0",
                          borderRadius: 12,
                          padding: "12px 14px",
                          background: "#f8fafc",
                          color: "#0f172a",
                          minHeight: 48,
                          display: "flex",
                          alignItems: "center",
                        }}
                      >
                        {requestData.delivery_address ||
                          "No delivery address provided."}
                      </div>
                    </div>

                    <div>
                      <label
                        style={{
                          display: "block",
                          fontSize: 12,
                          fontWeight: 700,
                          color: "#475569",
                          marginBottom: 6,
                        }}
                      >
                        Customer Notes
                      </label>

                      {String(requestData.notes || "").trim() ? (
                        <div
                          style={{
                            border: "1px solid #e2e8f0",
                            borderRadius: 12,
                            padding: "14px",
                            background: "#f8fafc",
                            color: "#0f172a",
                            whiteSpace: "pre-wrap",
                            lineHeight: 1.55,
                          }}
                        >
                          {requestData.notes}
                        </div>
                      ) : (
                        <div
                          style={{
                            border: "1px dashed #cbd5e1",
                            borderRadius: 12,
                            padding: "14px",
                            background: "#f8fafc",
                            color: "#64748b",
                          }}
                        >
                          No additional notes were submitted for this request.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="checkout-section">
                <div className="checkout-section-header">
                  <div
                    className="checkout-section-num"
                    style={{
                      background: "linear-gradient(135deg,#0f766e,#14b8a6)",
                      fontSize: 13,
                    }}
                  >
                    💬
                  </div>
                  <h3>Discussion / Chat</h3>
                </div>

                <div className="checkout-section-body">
                  <div
                    style={{
                      display: "grid",
                      gap: 14,
                    }}
                  >
                    <div
                      style={{
                        border: "1px solid #e2e8f0",
                        borderRadius: 16,
                        background: "#fff",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          padding: "14px 16px",
                          borderBottom: "1px solid #e2e8f0",
                          background: "#f8fafc",
                          fontWeight: 700,
                          color: "#0f172a",
                        }}
                      >
                        Request Conversation
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gap: 12,
                          padding: 16,
                          maxHeight: 420,
                          overflowY: "auto",
                        }}
                      >
                        {!discussionThread.length ? (
                          <div
                            style={{
                              padding: 16,
                              borderRadius: 12,
                              background: "#f8fafc",
                              color: "#64748b",
                              border: "1px dashed #cbd5e1",
                            }}
                          >
                            No discussion messages yet. You may send a message
                            to the admin below.
                          </div>
                        ) : (
                          discussionThread.map((entry) => {
                            const sender = getSenderMeta(entry);

                            return (
                              <div
                                key={entry.id}
                                style={{
                                  border: `1px solid ${sender.border}`,
                                  background: sender.bg,
                                  borderRadius: 14,
                                  padding: 14,
                                }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    gap: 12,
                                    alignItems: "flex-start",
                                    flexWrap: "wrap",
                                    marginBottom: 8,
                                  }}
                                >
                                  <div
                                    style={{
                                      fontWeight: 800,
                                      color: sender.color,
                                    }}
                                  >
                                    {sender.label}
                                  </div>

                                  <div
                                    style={{
                                      fontSize: 12,
                                      color: "#64748b",
                                    }}
                                  >
                                    {formatDate(entry.created_at)}
                                  </div>
                                </div>

                                {entry.message ? (
                                  <div
                                    style={{
                                      color: "#0f172a",
                                      lineHeight: 1.6,
                                      whiteSpace: "pre-wrap",
                                    }}
                                  >
                                    {entry.message}
                                  </div>
                                ) : null}

                                {Array.isArray(entry.attachments) &&
                                entry.attachments.length ? (
                                  <div
                                    style={{
                                      display: "flex",
                                      gap: 10,
                                      flexWrap: "wrap",
                                      marginTop: 12,
                                    }}
                                  >
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
                                          style={{
                                            display: "block",
                                            width: 90,
                                            height: 90,
                                            borderRadius: 12,
                                            overflow: "hidden",
                                            border: "1px solid #dbeafe",
                                            background: "#fff",
                                          }}
                                        >
                                          <img
                                            src={href}
                                            alt={
                                              attachment.file_name ||
                                              "Attachment"
                                            }
                                            style={{
                                              width: "100%",
                                              height: "100%",
                                              objectFit: "cover",
                                            }}
                                          />
                                        </a>
                                      ) : (
                                        <a
                                          key={attachment.id}
                                          href={href}
                                          target="_blank"
                                          rel="noreferrer"
                                          style={{
                                            minWidth: 180,
                                            maxWidth: 260,
                                            padding: "10px 12px",
                                            borderRadius: 12,
                                            border: "1px solid #e2e8f0",
                                            background: "#fff",
                                            textDecoration: "none",
                                            color: "#0f172a",
                                          }}
                                        >
                                          <div
                                            style={{
                                              fontWeight: 700,
                                              marginBottom: 4,
                                            }}
                                          >
                                            {attachment.file_name || "Attachment"}
                                          </div>
                                          <div
                                            style={{
                                              fontSize: 12,
                                              color: "#64748b",
                                            }}
                                          >
                                            Open file
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
                      style={{
                        border: "1px solid #e2e8f0",
                        borderRadius: 16,
                        background: "#fff",
                        padding: 16,
                        display: "grid",
                        gap: 12,
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 700,
                          color: "#0f172a",
                        }}
                      >
                        Send Message to Admin
                      </div>

                      <textarea
                        rows={4}
                        value={discussionMessage}
                        onChange={(e) =>
                          setDiscussionMessage(e.target.value)
                        }
                        placeholder="Write your clarification, preferred style, sizing concern, or request update here..."
                        style={{
                          width: "100%",
                          borderRadius: 12,
                          border: "1px solid #cbd5e1",
                          padding: 12,
                          font: "inherit",
                          resize: "vertical",
                          boxSizing: "border-box",
                        }}
                      />

                      <div>
                        <label
                          style={{
                            display: "block",
                            fontSize: 12,
                            fontWeight: 700,
                            color: "#475569",
                            marginBottom: 6,
                          }}
                        >
                          Attach Images or PDF
                        </label>

                        <input
                          type="file"
                          multiple
                          accept=".jpg,.jpeg,.png,.webp,.pdf"
                          onChange={handleDiscussionFilesChange}
                        />

                        <div
                          style={{
                            marginTop: 8,
                            fontSize: 12,
                            color: "#64748b",
                          }}
                        >
                          You may upload up to 5 attachments per message.
                        </div>
                      </div>

                      {discussionFiles.length ? (
                        <div
                          style={{
                            display: "grid",
                            gap: 8,
                          }}
                        >
                          {discussionFiles.map((file, index) => (
                            <div
                              key={`${file.name}_${index}`}
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                gap: 10,
                                padding: "10px 12px",
                                borderRadius: 12,
                                background: "#f8fafc",
                                border: "1px solid #e2e8f0",
                              }}
                            >
                              <div
                                style={{
                                  minWidth: 0,
                                }}
                              >
                                <div
                                  style={{
                                    fontWeight: 700,
                                    color: "#0f172a",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {file.name}
                                </div>
                                <div
                                  style={{
                                    fontSize: 12,
                                    color: "#64748b",
                                  }}
                                >
                                  {Math.round((file.size || 0) / 1024)} KB
                                </div>
                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  handleRemoveDiscussionFile(index)
                                }
                                style={{
                                  border: "1px solid #fecaca",
                                  background: "#fff1f2",
                                  color: "#be123c",
                                  borderRadius: 10,
                                  padding: "8px 10px",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                }}
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      <div
                        style={{
                          display: "flex",
                          justifyContent: "flex-end",
                        }}
                      >
                        <button
                          type="submit"
                          className="btn btn-primary"
                          disabled={discussionSubmitting}
                        >
                          {discussionSubmitting
                            ? "Sending..."
                            : "Send Discussion Message"}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            </div>

            <div className="checkout-summary">
              <div className="checkout-summary-header">
                <h3>Request Status</h3>
              </div>

              <div className="checkout-summary-totals">
                <div className="summary-row">
                  <span>Current Status</span>
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
                  <span>Preferred Method</span>
                  <span>
                    {PAY_METHOD_LABELS[requestData.payment_method] ||
                      requestData.payment_method ||
                      "—"}
                  </span>
                </div>

                <div className="summary-row">
                  <span>Total</span>
                  <span style={{ color: "#D2691E", fontWeight: 700 }}>
                    {quotedTotal > 0
                      ? formatMoney(quotedTotal)
                      : "To be quoted by admin"}
                  </span>
                </div>

                <p className="summary-note" style={{ marginTop: 12 }}>
                  Your request has been saved successfully. Admin will review
                  your submitted design, dimensions, finish, and notes before
                  providing the quotation.
                </p>
              </div>
            </div>
          </div>

          {previewItem && previewBlueprint ? (
            <div
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(15, 23, 42, 0.55)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "24px",
                zIndex: 9999,
              }}
              onClick={() => setPreviewItem(null)}
            >
              <div
                style={{
                  width: "min(1280px, 96vw)",
                  maxHeight: "92vh",
                  overflow: "auto",
                  background: "#fff",
                  borderRadius: "20px",
                  boxShadow: "0 24px 60px rgba(0,0,0,.28)",
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "12px",
                    padding: "18px 20px",
                    borderBottom: "1px solid #e5e7eb",
                  }}
                >
                  <div>
                    <h2 style={{ margin: 0 }}>
                      {getDisplayTitle(previewItem)}
                    </h2>
                    <p
                      style={{
                        margin: "6px 0 0",
                        color: "#64748b",
                      }}
                    >
                      Read-only preview of the exact submitted customer draft
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setPreviewItem(null)}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 12,
                      border: "1px solid #cbd5e1",
                      background: "#fff",
                      cursor: "pointer",
                      fontSize: 20,
                      lineHeight: 1,
                    }}
                  >
                    ×
                  </button>
                </div>

                <div style={{ padding: 16 }}>
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