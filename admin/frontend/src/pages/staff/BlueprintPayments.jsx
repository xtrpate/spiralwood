import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { RefreshCw, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";
import CustomerBlueprintViewer from "../customer/CustomerBlueprintViewer";
import { downloadPickupAcknowledgementPdf } from "../../utils/pickupAcknowledgementPdf";
import "./BlueprintPayments.css";

const formatMoney = (value) =>
  `\u20B1${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const PAYMENT_METHOD_LABELS = {
  cash: "Cash",
  paymongo: "Online Payment",
  gcash: "GCash",
  bank_transfer: "Bank Transfer",
};

const PAYMENT_LABEL_TEXT = {
  down_payment: "Down Payment",
  partial_payment: "Partial Payment",
  balance_payment: "Balance Payment",
  full_payment: "Full Payment",
};

const PAYMENT_STATUS_TEXT = {
  unpaid: "Unpaid",
  partial: "Partial",
  paid: "Paid",
  pending: "Pending Review",
};

const ORDER_STATUS_TEXT = {
  pending: "Pending",
  confirmed: "Confirmed",
  contract_released: "Contract Released",
  production: "Production",
  ready_for_pickup: "Ready for Pickup",
  shipping: "Shipping",
  delivered: "Delivered",
  completed: "Completed",
  cancelled: "Cancelled",
};

const HISTORY_STATUS_TEXT = {
  verified: "Verified",
  pending: "Pending",
  rejected: "Rejected",
};

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

const normalize = (value) => String(value || "").trim().toLowerCase();

const getPaymentStatus = (order) => {
  if (Number(order?.pending_payment_count || 0) > 0) return "pending";
  const value = normalize(order?.payment_status);
  return PAYMENT_STATUS_TEXT[value] ? value : "unpaid";
};

const matchesPaymentFilter = (order, filter) => {
  if (filter === "all") return true;

  const paymentStatus = getPaymentStatus(order);
  const remaining = Number(order?.remaining_balance || 0);

  if (filter === "due") {
    return remaining > 0.009 && paymentStatus !== "pending";
  }

  return paymentStatus === filter;
};

function PaymentBadge({ status }) {
  const key = normalize(status);
  return (
    <span className={`bp-payment-badge bp-payment-${key || "unpaid"}`}>
      {PAYMENT_STATUS_TEXT[key] || "Unpaid"}
    </span>
  );
}

function BlueprintPreview({ blueprint, title, size = "list" }) {
  const designData = blueprint?.blueprint_design_data || null;
  const view3dData = blueprint?.blueprint_view_3d_data || null;
  const draftEditorSnapshot = blueprint?.draft_editor_snapshot || null;
  const draftComponents = Array.isArray(draftEditorSnapshot?.components)
    ? draftEditorSnapshot.components
    : [];
  const hasDraftScene = draftComponents.length > 0;
  const hasSavedSceneSource = Boolean(designData || view3dData || hasDraftScene);
  const compactHeight = size === "detail" ? 64 : 56;

  if (!hasSavedSceneSource) {
    return (
      <div
        className={`bp-thumb bp-thumb-${size} bp-thumb-fallback`}
        aria-label="Blueprint preview unavailable"
        title="Blueprint preview unavailable"
      >
        <span aria-hidden="true">—</span>
      </div>
    );
  }

  const liveBlueprint = {
    id:
      blueprint?.blueprint_id ||
      blueprint?.order_id ||
      blueprint?.id ||
      `blueprint-payment-${blueprint?.order_number || "preview"}`,
    title: title || blueprint?.blueprint_title || "Blueprint",
    thumbnail_url: null,
    components: hasDraftScene ? draftComponents : undefined,
    design_data:
      designData ||
      (hasDraftScene
        ? {
            components: draftComponents,
            worldSize: draftEditorSnapshot?.worldSize || null,
          }
        : null),
    view_3d_data:
      view3dData ||
      (hasDraftScene
        ? {
            components: draftComponents,
            worldSize: draftEditorSnapshot?.worldSize || null,
          }
        : null),
  };

  return (
    <div className={`bp-thumb bp-thumb-${size} bp-thumb-live`}>
      <CustomerBlueprintViewer
        blueprint={liveBlueprint}
        readOnly
        showHumanControls={false}
        compact
        compactHeight={compactHeight}
        defaultPreset="isometric"
        defaultShowHuman={false}
      />
    </div>
  );
}

function PickupSignaturePad({ value, onChange, disabled = false }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const hasStrokeRef = useRef(Boolean(value));

  const prepareCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#18181b";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  useEffect(() => {
    prepareCanvas();
  }, [prepareCanvas]);

  const pointFromEvent = (event) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    if (!(rect.width > 0) || !(rect.height > 0)) return null;
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const start = (event) => {
    if (disabled) return;
    const canvas = canvasRef.current;
    const point = pointFromEvent(event);
    if (!canvas || !point) return;
    canvas.setPointerCapture?.(event.pointerId);
    const ctx = canvas.getContext("2d");
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    drawingRef.current = true;
  };

  const move = (event) => {
    if (disabled || !drawingRef.current) return;
    const canvas = canvasRef.current;
    const point = pointFromEvent(event);
    if (!canvas || !point) return;
    const ctx = canvas.getContext("2d");
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    hasStrokeRef.current = true;
  };

  const finish = () => {
    if (disabled || !drawingRef.current) return;
    drawingRef.current = false;
    if (hasStrokeRef.current && canvasRef.current) {
      onChange(canvasRef.current.toDataURL("image/png"));
    }
  };

  const clear = () => {
    if (disabled) return;
    prepareCanvas();
    hasStrokeRef.current = false;
    onChange("");
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={720}
        height={220}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={finish}
        style={{
          display: "block",
          width: "100%",
          height: 180,
          border: "1px solid #d4d4d8",
          background: "#ffffff",
          touchAction: "none",
          cursor: disabled ? "not-allowed" : "crosshair",
        }}
        aria-label="Recipient signature area"
      />
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginTop: 8 }}>
        <small style={{ color: "#71717a" }}>Sign using a mouse, finger, or stylus.</small>
        <button type="button" className="bp-secondary-button" disabled={disabled} onClick={clear}>
          Clear signature
        </button>
      </div>
    </div>
  );
}

function OrderStatusBadge({ status }) {
  const key = normalize(status);
  return (
    <span className={`bp-order-status-badge bp-order-status-${key || "unknown"}`}>
      {ORDER_STATUS_TEXT[key] || status || "-"}
    </span>
  );
}

export default function BlueprintPayments() {
  const navigate = useNavigate();

  const [orders, setOrders] = useState([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("all");

  const [summary, setSummary] = useState(null);
  const [selectedOrderNumber, setSelectedOrderNumber] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const [customAmount, setCustomAmount] = useState("");
  const [recording, setRecording] = useState(false);
  const [releasingPickup, setReleasingPickup] = useState(false);
  const [pickupModalOpen, setPickupModalOpen] = useState(false);
  const [pickupRecipientType, setPickupRecipientType] = useState("customer");
  const [pickupRecipientName, setPickupRecipientName] = useState("");
  const [pickupSignature, setPickupSignature] = useState("");
  const [pickupNote, setPickupNote] = useState("");
  const [recordError, setRecordError] = useState("");
  const [lastPaymentResult, setLastPaymentResult] = useState(null);

  const loadOrders = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setListLoading(true);
    setListError("");

    try {
      const { data } = await api.get("/pos/blueprint-cash-payments");
      setOrders(Array.isArray(data?.orders) ? data.orders : []);
    } catch (err) {
      setListError(
        err?.response?.data?.message || "Failed to load blueprint payments.",
      );
    } finally {
      if (!quiet) setListLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const filteredOrders = useMemo(() => {
    const query = normalize(searchQuery);

    return orders.filter((order) => {
      if (!matchesPaymentFilter(order, paymentFilter)) return false;
      if (!query) return true;

      return [
        order.order_number,
        order.customer_name,
        order.blueprint_title,
      ].some((value) => normalize(value).includes(query));
    });
  }, [orders, paymentFilter, searchQuery]);

  const stats = useMemo(() => {
    const total = orders.length;
    let needsPayment = 0;
    let paid = 0;
    let pending = 0;

    orders.forEach((order) => {
      const status = getPaymentStatus(order);
      const remaining = Number(order.remaining_balance || 0);

      if (status === "paid" || remaining <= 0.009) {
        paid += 1;
      } else if (status === "pending") {
        pending += 1;
      } else {
        needsPayment += 1;
      }
    });

    return { total, needsPayment, paid, pending };
  }, [orders]);

  const openOrder = useCallback(async (orderNumber) => {
    const trimmed = String(orderNumber || "").trim();
    if (!trimmed) return;

    setSelectedOrderNumber(trimmed);
    setDetailLoading(true);
    setDetailError("");
    setRecordError("");
    setLastPaymentResult(null);

    try {
      const { data } = await api.get(
        "/pos/blueprint-cash-payments/lookup",
        { params: { order_number: trimmed } },
      );
      setSummary(data);
    } catch (err) {
      setSummary(null);
      setDetailError(
        err?.response?.data?.message || "Failed to load blueprint order.",
      );
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const refreshSummary = useCallback(async () => {
    const orderNumber = summary?.order_number || selectedOrderNumber;
    if (!orderNumber) return;

    try {
      const { data } = await api.get(
        "/pos/blueprint-cash-payments/lookup",
        { params: { order_number: orderNumber } },
      );
      setSummary(data);
    } catch (err) {
      setRecordError(
        err?.response?.data?.message || "Failed to refresh payment details.",
      );
    }
  }, [selectedOrderNumber, summary?.order_number]);

  const recordPayment = async (amountRaw) => {
    if (recording) return;

    const trimmedAmount = String(amountRaw || "").trim();
    if (!summary || !trimmedAmount) return;

    setRecordError("");

    const amountCents = parseStrictPreviewCents(trimmedAmount);
    const remainingBeforeCents = parseTrustedDisplayCents(
      summary.remaining_balance,
    );

    if (amountCents === null || remainingBeforeCents === null) {
      setRecordError("Enter a valid payment amount.");
      return;
    }

    const remainingAfterCents = Math.max(
      0,
      remainingBeforeCents - amountCents,
    );

    let previewStatus = "Partial";
    if (amountCents === remainingBeforeCents) {
      previewStatus = "Paid";
    } else if (amountCents > remainingBeforeCents) {
      previewStatus =
        "Above the current balance - the server will validate the amount";
    }

    const confirmed = window.confirm(
      `Confirm cash payment of ${formatMoney(amountCents / 100)} for ${summary.order_number}.\n\n` +
        `Current balance: ${formatMoney(remainingBeforeCents / 100)}\n` +
        `Balance after payment: ${formatMoney(remainingAfterCents / 100)}\n\n` +
        `Payment result: ${previewStatus}.`,
    );

    if (!confirmed) return;

    setRecording(true);
    setLastPaymentResult(null);

    try {
      const { data } = await api.post(
        `/pos/blueprint-cash-payments/${summary.order_id}`,
        { amount: trimmedAmount },
      );

      toast.success(data?.message || "Cash payment recorded.");
      setCustomAmount("");
      setLastPaymentResult(data);

      await Promise.all([
        refreshSummary(),
        loadOrders({ quiet: true }),
      ]);
    } catch (err) {
      setRecordError(
        err?.response?.data?.message ||
          "Failed to record cash payment. Please try again.",
      );
    } finally {
      setRecording(false);
    }
  };

  const openPickupAcknowledgement = () => {
    if (!summary?.order_id) return;
    setRecordError("");
    setPickupRecipientType("customer");
    setPickupRecipientName(String(summary.customer_name || "").trim());
    setPickupSignature("");
    setPickupNote("");
    setPickupModalOpen(true);
  };

  const confirmPickup = async () => {
    if (!summary?.order_id || releasingPickup) return;
    const recipientName = pickupRecipientName.trim();
    if (!recipientName) {
      setRecordError("Enter the name of the person receiving the furniture.");
      return;
    }
    if (!pickupSignature) {
      setRecordError("The customer or recipient must sign before pickup can be confirmed.");
      return;
    }

    try {
      setReleasingPickup(true);
      setRecordError("");
      const { data } = await api.post(
        "/pos/blueprint-cash-payments/" + summary.order_id + "/picked-up",
        {
          recipient_type: pickupRecipientType,
          received_by_name: recipientName,
          signature_data: pickupSignature,
          note: pickupNote.trim(),
        },
      );
      toast.success(data?.message || "Pickup confirmed.");
      setPickupModalOpen(false);
      setPickupSignature("");
      await Promise.all([refreshSummary(), loadOrders({ quiet: true })]);
    } catch (err) {
      const message = err.response?.data?.message || "Failed to confirm pickup.";
      setRecordError(message);
      toast.error(message);
    } finally {
      setReleasingPickup(false);
    }
  };

  const downloadPickupProof = () => {
    if (!summary?.pickup_acknowledgement) return;
    try {
      downloadPickupAcknowledgementPdf({
        acknowledgement: summary.pickup_acknowledgement,
        order: summary,
      });
      toast.success("Pickup acknowledgement PDF downloaded.");
    } catch (err) {
      console.error("[BlueprintPayments Pickup PDF]", err);
      toast.error("Failed to generate pickup acknowledgement PDF.");
    }
  };

  const verifiedTotal = Number(summary?.verified_total || 0);
  const minimumRequiredTotal = Number(summary?.minimum_required_total || 0);
  const orderTotal = Number(summary?.total || 0);
  const showFirstPaymentMinimum =
    Boolean(summary) &&
    orderTotal > 0 &&
    minimumRequiredTotal > 0 &&
    verifiedTotal === 0;
  const showAdditionalMinimum =
    Boolean(summary) &&
    orderTotal > 0 &&
    minimumRequiredTotal > 0 &&
    verifiedTotal > 0 &&
    verifiedTotal < minimumRequiredTotal;

  return (
    <div className="bp-payments-page">
      <header className="bp-page-header">
        <div>
          <h1>Blueprint Payments</h1>
          <p>
            Find blueprint orders, check balances, and record in-store cash
            payments.
          </p>
        </div>
      </header>

      <section className="bp-stats-grid" aria-label="Blueprint payment summary">
        <div className="bp-stat-card">
          <span>Needs Payment</span>
          <strong>{stats.needsPayment}</strong>
        </div>
        <div className="bp-stat-card">
          <span>Pending Review</span>
          <strong>{stats.pending}</strong>
        </div>
        <div className="bp-stat-card">
          <span>Paid</span>
          <strong>{stats.paid}</strong>
        </div>
        <div className="bp-stat-card">
          <span>Total Blueprints</span>
          <strong>{stats.total}</strong>
        </div>
      </section>

      <section className="bp-toolbar">
        <div className="bp-search">
          <Search size={16} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search order, customer, or blueprint"
          />
        </div>

        <select
          value={paymentFilter}
          onChange={(e) => setPaymentFilter(e.target.value)}
          aria-label="Payment status"
        >
          <option value="all">All payments</option>
          <option value="due">Needs payment</option>
          <option value="partial">Partial</option>
          <option value="pending">Pending review</option>
          <option value="paid">Paid</option>
        </select>

        <button
          type="button"
          className="bp-secondary-button bp-refresh-button"
          onClick={() => loadOrders()}
          disabled={listLoading}
        >
          <RefreshCw size={15} />
          {listLoading ? "Loading" : "Refresh"}
        </button>

        <span className="bp-result-count">
          {filteredOrders.length} of {orders.length} orders
        </span>
      </section>

      {listError ? <div className="bp-notice bp-notice-error">{listError}</div> : null}

      <div className="bp-workspace">
        <section className="bp-list-panel" aria-label="Blueprint orders">
          <div className="bp-panel-heading">
            <div>
              <h2>Blueprint Orders</h2>
              <p>Select an order to view payment details.</p>
            </div>
          </div>

          <div className="bp-order-list">
            {listLoading ? (
              <div className="bp-empty-state">
                <strong>Loading blueprint orders...</strong>
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="bp-empty-state">
                <strong>No blueprint orders found</strong>
                <span>Try another search or payment filter.</span>
              </div>
            ) : (
              filteredOrders.map((order) => {
                const paymentStatus = getPaymentStatus(order);
                const selected = order.order_number === selectedOrderNumber;

                return (
                  <button
                    key={order.order_id}
                    type="button"
                    className={`bp-order-row ${selected ? "is-selected" : ""}`}
                    onClick={() => openOrder(order.order_number)}
                  >
                    <BlueprintPreview
                      blueprint={order}
                      title={order.blueprint_title}
                    />

                    <div className="bp-order-main">
                      <strong>{order.blueprint_title || "Blueprint"}</strong>
                      <span className="bp-order-number">
                        {order.order_number}
                      </span>
                      <small>{order.customer_name || "Customer"}</small>
                    </div>

                    <div className="bp-order-status">
                      <PaymentBadge status={paymentStatus} />
                      <OrderStatusBadge status={order.order_status} />
                    </div>

                    <div className="bp-order-money">
                      <strong>{formatMoney(order.total)}</strong>
                      <span>Paid {formatMoney(order.verified_total)}</span>
                      <span
                        className={`bp-order-balance ${
                          Number(order.remaining_balance || 0) > 0.009
                            ? "is-due"
                            : ""
                        }`}
                      >
                        Balance {formatMoney(order.remaining_balance)}
                      </span>
                    </div>

                  </button>
                );
              })
            )}
          </div>
        </section>

        <aside className="bp-detail-panel" aria-label="Payment details">
          {!selectedOrderNumber ? (
            <div className="bp-detail-empty">
              <strong>Select a blueprint order</strong>
              <span>
                Choose an order from the list to view its balance and payment
                history.
              </span>
            </div>
          ) : detailLoading ? (
            <div className="bp-detail-empty">
              <strong>Loading payment details...</strong>
            </div>
          ) : detailError ? (
            <div className="bp-detail-empty">
              <strong>Could not load this order</strong>
              <span>{detailError}</span>
            </div>
          ) : summary ? (
            <>
              <div className="bp-detail-header">
                <BlueprintPreview
                  blueprint={summary}
                  title={summary.blueprint_title}
                  size="detail"
                />
                <div>
                  <h2>{summary.blueprint_title || "Blueprint"}</h2>
                  <p className="bp-detail-order-number">
                    {summary.order_number}
                  </p>
                  <span>{summary.customer_name || "Customer"}</span>
                </div>
              </div>

              <div className="bp-detail-status-row">
                <PaymentBadge
                  status={
                    Number(
                      orders.find(
                        (order) =>
                          order.order_number === summary.order_number,
                      )?.pending_payment_count || 0,
                    ) > 0
                      ? "pending"
                      : summary.payment_status
                  }
                />
                <OrderStatusBadge status={summary.order_status} />
              </div>

              <div className="bp-money-summary">
                <div>
                  <span>Total</span>
                  <strong>{formatMoney(summary.total)}</strong>
                </div>
                <div>
                  <span>Paid</span>
                  <strong>{formatMoney(verifiedTotal)}</strong>
                </div>
                <div className="bp-balance-block">
                  <span>Balance</span>
                  <strong>{formatMoney(summary.remaining_balance)}</strong>
                </div>
              </div>

              {showFirstPaymentMinimum ? (
                <div className="bp-info-line">
                  <span>First payment minimum</span>
                  <strong>{formatMoney(minimumRequiredTotal)}</strong>
                </div>
              ) : null}

              {showAdditionalMinimum ? (
                <div className="bp-info-line">
                  <span>Minimum payment now</span>
                  <strong>
                    {formatMoney(summary.minimum_additional_payment || 0)}
                  </strong>
                </div>
              ) : null}

              {recordError ? (
                <div className="bp-notice bp-notice-error">{recordError}</div>
              ) : null}

              {lastPaymentResult ? (
                <div className="bp-notice bp-notice-success">
                  <strong>Payment recorded</strong>
                  <span>Receipt {lastPaymentResult.receipt_number}</span>
                  <button
                    type="button"
                    className="bp-secondary-button"
                    onClick={() =>
                      navigate(
                        `/staff/blueprint-receipt/${lastPaymentResult.receipt_id}`,
                      )
                    }
                  >
                    View Receipt
                  </button>
                </div>
              ) : null}

              <section className="bp-payment-section">
                <div className="bp-section-heading">
                  <h3>Record Payment</h3>
                  <p>Cash received at the store.</p>
                </div>

                {summary.can_record_payment ? (
                  <>
                    {Array.isArray(summary.quick_amounts) &&
                    summary.quick_amounts.length > 0 ? (
                      <div className="bp-quick-actions">
                        {summary.quick_amounts.map((amount) => {
                          const amountStr = Number(amount).toFixed(2);

                          return (
                            <button
                              key={amountStr}
                              type="button"
                              className="bp-primary-button"
                              disabled={recording}
                              onClick={() => recordPayment(amountStr)}
                            >
                              {recording
                                ? "Recording..."
                                : `Pay ${formatMoney(amountStr)}`}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}

                    <label className="bp-field-label" htmlFor="bp-custom-amount">
                      Custom amount
                    </label>
                    <div className="bp-custom-payment">
                      <input
                        id="bp-custom-amount"
                        type="text"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={customAmount}
                        onChange={(e) => setCustomAmount(e.target.value)}
                        disabled={recording}
                      />
                      <button
                        type="button"
                        className="bp-primary-button"
                        disabled={recording || !customAmount.trim()}
                        onClick={() => recordPayment(customAmount)}
                      >
                        Record Payment
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="bp-notice">
                    {summary.reason_message ||
                      "Cash payment is not available for this order."}
                  </div>
                )}
              </section>

              {summary.fulfillment_method === "pickup" ? (
                <section className="bp-history-section">
                  <div className="bp-section-heading">
                    <div>
                      <p className="bp-eyebrow">Store pickup</p>
                      <h3>Pickup Release</h3>
                    </div>
                  </div>

                  {summary.pickup_acknowledgement ? (
                    <div className="bp-notice bp-notice-success">
                      <strong>Pickup completed</strong>
                      <span>
                        Received by {summary.pickup_acknowledgement.received_by_name || "Recipient"}
                        {summary.pickup_acknowledgement.acknowledged_at
                          ? " on " + new Date(summary.pickup_acknowledgement.acknowledged_at).toLocaleString("en-PH")
                          : ""}.
                      </span>
                      <button type="button" className="bp-secondary-button" onClick={downloadPickupProof}>
                        Pickup Acknowledgement
                      </button>
                    </div>
                  ) : (
                    <>
                      <p className="bp-help-text">
                        The customer or authorized representative must be present, fully paid, and sign the pickup acknowledgement before release.
                      </p>
                      <button
                        type="button"
                        className="bp-primary-button"
                        disabled={
                          releasingPickup ||
                          summary.order_status !== "ready_for_pickup" ||
                          Number(summary.remaining_balance || 0) > 0.009 ||
                          Boolean(summary.has_pending_payment) ||
                          summary.payment_status !== "paid"
                        }
                        onClick={openPickupAcknowledgement}
                      >
                        Proceed to Pickup
                      </button>
                      {summary.order_status !== "ready_for_pickup" ? (
                        <p className="bp-help-text">Production must be complete before pickup release.</p>
                      ) : Boolean(summary.has_pending_payment) ? (
                        <p className="bp-help-text">Resolve the pending payment before pickup release.</p>
                      ) : Number(summary.remaining_balance || 0) > 0.009 || summary.payment_status !== "paid" ? (
                        <p className="bp-help-text">Full verified payment is required before pickup release.</p>
                      ) : null}
                    </>
                  )}
                </section>
              ) : null}

              <section className="bp-history-section">
                <div className="bp-section-heading">
                  <h3>Payment History</h3>
                  <p>Recorded payments for this blueprint order.</p>
                </div>

                {Array.isArray(summary.payment_history) &&
                summary.payment_history.length > 0 ? (
                  <div className="bp-history-list">
                    {summary.payment_history.map((row) => {
                      const method = normalize(row.payment_method);
                      const historyStatus = normalize(row.status);
                      const canViewReceipt =
                        historyStatus === "verified" &&
                        Boolean(row.receipt_id) &&
                        Boolean(row.receipt_number);

                      return (
                        <div
                          className="bp-history-row"
                          key={row.payment_transaction_id}
                        >
                          <div className="bp-history-main">
                            <strong>
                              {PAYMENT_LABEL_TEXT[row.payment_label] ||
                                "Payment"}
                            </strong>
                            <span>
                              {PAYMENT_METHOD_LABELS[method] ||
                                row.payment_method ||
                                "-"}
                            </span>
                            <small>
                              {row.created_at
                                ? new Date(row.created_at).toLocaleString(
                                    "en-PH",
                                  )
                                : "-"}
                            </small>
                          </div>

                          <div className="bp-history-amount">
                            <strong>{formatMoney(row.amount)}</strong>
                            <span>
                              {HISTORY_STATUS_TEXT[historyStatus] ||
                                row.status ||
                                "-"}
                            </span>
                          </div>

                          {canViewReceipt ? (
                            <button
                              type="button"
                              className="bp-secondary-button"
                              onClick={() =>
                                navigate(
                                  `/staff/blueprint-receipt/${row.receipt_id}`,
                                )
                              }
                            >
                              Receipt
                            </button>
                          ) : (
                            <span className="bp-history-processor">
                              {row.processor_display || ""}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="bp-empty-history">No payments recorded yet.</div>
                )}
              </section>
            </>
          ) : null}
        </aside>
      </div>

      {pickupModalOpen ? (
        <div
          role="presentation"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2000,
            background: "rgba(0,0,0,0.48)",
            display: "grid",
            placeItems: "center",
            padding: 20,
          }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !releasingPickup) {
              setPickupModalOpen(false);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="pickup-ack-title"
            style={{
              width: "min(720px, 100%)",
              maxHeight: "92vh",
              overflowY: "auto",
              background: "#ffffff",
              border: "1px solid #d4d4d8",
              padding: 24,
              boxSizing: "border-box",
            }}
          >
            <p className="bp-eyebrow" style={{ marginTop: 0 }}>Store pickup</p>
            <h2 id="pickup-ack-title" style={{ margin: "0 0 8px" }}>Pickup Acknowledgement</h2>
            <p style={{ margin: "0 0 18px", lineHeight: 1.6, color: "#52525b" }}>
              Complete this only while the customer or authorized representative is physically receiving the furniture.
            </p>

            <div style={{ display: "grid", gap: 16 }}>
              <div>
                <label className="bp-field-label">Recipient type</label>
                <select
                  value={pickupRecipientType}
                  onChange={(event) => {
                    const next = event.target.value;
                    setPickupRecipientType(next);
                    if (next === "customer") {
                      setPickupRecipientName(String(summary?.customer_name || "").trim());
                    } else {
                      setPickupRecipientName("");
                    }
                  }}
                  disabled={releasingPickup}
                  style={{ width: "100%", minHeight: 40 }}
                >
                  <option value="customer">Customer</option>
                  <option value="authorized_representative">Authorized Representative</option>
                </select>
              </div>

              <div>
                <label className="bp-field-label" htmlFor="pickup-received-by">Received by</label>
                <input
                  id="pickup-received-by"
                  type="text"
                  maxLength={150}
                  value={pickupRecipientName}
                  onChange={(event) => setPickupRecipientName(event.target.value)}
                  disabled={releasingPickup}
                  placeholder="Full name of recipient"
                  style={{ width: "100%", minHeight: 40, boxSizing: "border-box" }}
                />
              </div>

              <div style={{ padding: 14, background: "#fafafa", border: "1px solid #e4e4e7", lineHeight: 1.6 }}>
                <strong>Acknowledgement</strong>
                <p style={{ margin: "6px 0 0" }}>
                  I confirm that I received the furniture listed for this order from Spiral Wood Services.
                </p>
              </div>

              <div>
                <label className="bp-field-label">Recipient signature</label>
                <PickupSignaturePad
                  value={pickupSignature}
                  onChange={setPickupSignature}
                  disabled={releasingPickup}
                />
              </div>

              <div>
                <label className="bp-field-label" htmlFor="pickup-note">Pickup note (optional)</label>
                <textarea
                  id="pickup-note"
                  rows={3}
                  maxLength={500}
                  value={pickupNote}
                  onChange={(event) => setPickupNote(event.target.value)}
                  disabled={releasingPickup}
                  placeholder="Add a short handoff note if needed"
                  style={{ width: "100%", boxSizing: "border-box", resize: "vertical" }}
                />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
              <button
                type="button"
                className="bp-secondary-button"
                disabled={releasingPickup}
                onClick={() => setPickupModalOpen(false)}
              >
                Back
              </button>
              <button
                type="button"
                className="bp-primary-button"
                disabled={releasingPickup || !pickupRecipientName.trim() || !pickupSignature}
                onClick={confirmPickup}
              >
                {releasingPickup ? "Confirming Pickup..." : "Confirm Pickup"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
