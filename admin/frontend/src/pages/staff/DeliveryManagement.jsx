import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Navigation, UploadCloud, FileText } from "lucide-react";
import api, { buildAssetUrl } from "../../services/api";
import useAuthStore from "../../store/authStore";
import "./RiderScreen.css";

const normalize = (value) => String(value || "").toLowerCase();

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

const formatDateTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

const toDeliveryDateKey = (value) => {
  const raw = String(value || "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
};

const getLocalTodayKey = () => {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
};

const isRiderActiveDelivery = (delivery) =>
  ["scheduled", "in_transit"].includes(normalize(delivery?.status));

const isRiderOverdueDelivery = (delivery, todayKey = getLocalTodayKey()) => {
  if (!isRiderActiveDelivery(delivery)) return false;
  const scheduledKey = toDeliveryDateKey(delivery?.scheduled_date);
  return Boolean(scheduledKey && scheduledKey < todayKey);
};

const formatStatus = (value) => {
  if (!value) return "—";
  return String(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

// WISDOM RIDER COMPLETED STATUS STYLE V1
const getStatusMeta = (status) => {
  const normalized = normalize(status);
  switch (normalized) {
    case "scheduled":
      return { bg: "#ffffff", border: "#d4d4d8", text: "#52525b" };
    case "in_transit":
      return { bg: "#f4f4f5", border: "#e4e4e7", text: "#18181b" };
    case "delivered":
      return { bg: "#f4f4f5", border: "#bfc1c5", text: "#18181b" };
    case "completed":
      return { bg: "#0a0a0a", border: "#0a0a0a", text: "#ffffff" };
    case "failed":
      return { bg: "#fef2f2", border: "#fecaca", text: "#991b1b" };
    default:
      return { bg: "#fafafa", border: "#e4e4e7", text: "#71717a" };
  }
};

export default function DeliveryManagement() {
  const { user } = useAuthStore();
  const isDeliveryRider =
    user?.role === "staff" && user?.staff_type === "delivery_rider";

  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [receiptFiles, setReceiptFiles] = useState({});
  const [collectionForms, setCollectionForms] = useState({});

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [failureModal, setFailureModal] = useState(null);
  const [failureReasonInput, setFailureReasonInput] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const [focusedDeliveryId, setFocusedDeliveryId] = useState(null);
  const [expandedDeliveryId, setExpandedDeliveryId] = useState(null);

  const loadDeliveries = useCallback(async () => {
    setLoading(true);
    setError("");
    setSuccess("");

    try {
      const res = await api.get("/pos/deliveries");
      const list = Array.isArray(res.data) ? res.data : [];
      setDeliveries(list);
    } catch (err) {
      console.error("Delivery load error:", err?.response?.data || err);
      setError(
        err?.response?.data?.message ||
          `Failed to load deliveries.${
            err?.response?.status ? ` (HTTP ${err.response.status})` : ""
          }`,
      );
      setDeliveries([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDeliveries();
  }, [loadDeliveries]);

  // Notification double-click focus support: clears any status/search
  // filter that would hide the record, locates it, scrolls it into
  // view, and briefly highlights it. Fails safely if the delivery no
  // longer exists — never guesses a record from message text.
  useEffect(() => {
    const focusId = searchParams.get("focus_delivery_id");
    if (!focusId || loading) return;

    const numericId = Number(focusId);
    const match = deliveries.find((d) => Number(d.id) === numericId);

    if (!match) {
      const next = new URLSearchParams(searchParams);
      next.delete("focus_delivery_id");
      setSearchParams(next, { replace: true });
      return;
    }

    setStatusFilter("all");
    setSearch("");
    setFocusedDeliveryId(numericId);
    setExpandedDeliveryId(numericId);

    const scrollTimer = setTimeout(() => {
      document
        .getElementById(`delivery-card-${numericId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);

    const highlightTimer = setTimeout(() => setFocusedDeliveryId(null), 4000);

    const next = new URLSearchParams(searchParams);
    next.delete("focus_delivery_id");
    setSearchParams(next, { replace: true });

    return () => {
      clearTimeout(scrollTimer);
      clearTimeout(highlightTimer);
    };
  }, [searchParams, loading, deliveries]);

  // PHASE 5 correction — automatic payment-status refresh for blueprint
  // deliveries still waiting on the customer's remaining-payment choice
  // or on PayMongo confirmation. Never reloads the page and never
  // touches receiptFiles/collectionForms — only the deliveries list is
  // re-fetched, silently, in the background.
  const deliveriesRef = useRef(deliveries);
  useEffect(() => {
    deliveriesRef.current = deliveries;
  }, [deliveries]);

  const isAutoRefreshingRef = useRef(false);

  const needsAutoRefresh = useCallback((list) => {
    return (list || []).some((d) => {
      if (normalize(d.order_type) !== "blueprint") return false;
      if (!["scheduled", "in_transit"].includes(normalize(d.status))) {
        return false;
      }
      // Cash is the default remaining-balance method. A null/blank DB
      // value means the customer did not opt into Online Payment.
      const method = normalize(d.remaining_payment_method) || "cash";
      const balance = Number(d.payment_balance || 0);
      if (method === "paymongo" && balance > 0.009) return true;
      return false;
    });
  }, []);

  const silentRefreshDeliveries = useCallback(async () => {
    // Prevent overlapping requests — if a refresh is still in flight,
    // skip this tick entirely rather than queueing another call.
    if (isAutoRefreshingRef.current) return;
    isAutoRefreshingRef.current = true;

    try {
      const res = await api.get("/pos/deliveries");
      const list = Array.isArray(res.data) ? res.data : [];
      setDeliveries(list);
    } catch (err) {
      // Temporary failure: keep whatever is currently on screen and
      // simply try again on the next 5-second tick. Never surface this
      // as a blocking error and never clear existing state.
      console.error(
        "Background payment-status refresh failed:",
        err?.response?.data || err,
      );
    } finally {
      isAutoRefreshingRef.current = false;
    }
  }, []);

  useEffect(() => {
    const intervalId = setInterval(() => {
      if (needsAutoRefresh(deliveriesRef.current)) {
        silentRefreshDeliveries();
      }
    }, 5000);

    return () => clearInterval(intervalId);
  }, [needsAutoRefresh, silentRefreshDeliveries]);

  const handleReceiptChange = (id, file) => {
    setReceiptFiles((prev) => ({
      ...prev,
      [id]: file || null,
    }));
  };

  const getCollectionForm = (delivery) => {
    const defaultAmount =
      Number(delivery.payment_balance || 0) > 0
        ? Number(delivery.payment_balance || 0).toFixed(2)
        : "";

    const saved = collectionForms[delivery.id] || {};

    return {
      amount: defaultAmount,
      payment_method: saved.payment_method || "cash",
      collection_notes: saved.collection_notes || "",
    };
  };

  const updateCollectionForm = (deliveryId, key, value) => {
    setCollectionForms((prev) => {
      const current = prev[deliveryId] || {
        amount: "",
        payment_method: "cash",
        collection_notes: "",
      };

      return {
        ...prev,
        [deliveryId]: {
          ...current,
          [key]: value,
        },
      };
    });
  };

  const validateReceiptFile = (file) => {
    if (!file) return null;

    const isImage = String(file.type || "").startsWith("image/");
    const isPdf = file.type === "application/pdf";

    if (!isImage && !isPdf) {
      return "Only image or PDF files are allowed for Proof of Delivery upload.";
    }

    const maxFileSize = 5 * 1024 * 1024;
    if (file.size > maxFileSize) {
      return "Proof of Delivery file is too large. Maximum allowed size is 5 MB.";
    }

    return null;
  };

  const validateCollectionForm = (
    delivery,
    collectionForm,
    { requireAmount = false } = {},
  ) => {
    const paymentBalance = Number(delivery.payment_balance || 0);
    const rawAmount = String(collectionForm?.amount ?? "").trim();
    const amount = Number(rawAmount || 0);
    const paymentMethod = String(
      collectionForm?.payment_method || "cash",
    ).toLowerCase();
    const isStandardCodDelivery =
      normalize(delivery.order_type) === "standard" &&
      normalize(delivery.payment_method) === "cod";

    if (paymentBalance <= 0.009) {
      return "";
    }

    if (paymentMethod !== "cash") {
      return "Cash is the only allowed payment method for rider collection.";
    }

    if (requireAmount && !rawAmount) {
      return "Please enter the amount collected by the rider before completing this delivery.";
    }

    if (rawAmount && (!Number.isFinite(amount) || amount <= 0)) {
      return "Collected amount must be greater than zero.";
    }

    if (
      isStandardCodDelivery &&
      rawAmount &&
      Math.abs(amount - Number(paymentBalance.toFixed(2))) > 0.009
    ) {
      return `Collect the exact remaining balance of ₱${paymentBalance.toLocaleString(
        "en-PH",
        { minimumFractionDigits: 2 },
      )} before completing this COD delivery.`;
    }

    if (!isStandardCodDelivery && rawAmount && amount > paymentBalance + 0.01) {
      return `Collected amount cannot exceed the remaining balance of ₱${paymentBalance.toLocaleString(
        "en-PH",
        { minimumFractionDigits: 2 },
      )}.`;
    }

    return "";
  };

  const saveDeliveryUpdate = async ({
    delivery,
    nextStatus,
    requireReceipt = false,
    allowReceiptOnly = false,
    successMessage,
    failureReason,
    onSuccess,
  }) => {
    const selectedFile = receiptFiles[delivery.id] || null;
    const hasExistingReceipt = Boolean(delivery.signed_receipt);
    const currentStatus = normalize(delivery.status || "scheduled");
    const targetStatus = normalize(nextStatus || currentStatus);
    const collectionForm = getCollectionForm(delivery);

    // PHASE 5: blueprint orders have their own backend-computed
    // balance/method gating (see updateDeliveryStatus's isolated
    // branch); the legacy client-side collected-amount validation below
    // does not apply to them and must be skipped entirely.
    const isBlueprintDelivery = normalize(delivery.order_type) === "blueprint";

    const collectionError =
      isBlueprintDelivery || targetStatus === "failed"
        ? ""
        : validateCollectionForm(delivery, collectionForm, {
            requireAmount: targetStatus === "delivered",
          });

    if (collectionError) {
      setError(collectionError);
      setSuccess("");
      return;
    }

    const fileError = validateReceiptFile(selectedFile);
    if (fileError) {
      setError(fileError);
      setSuccess("");
      return;
    }

    // PHASE 5: a blueprint delivery being completed always needs a
    // FRESH photo — an old deliveries.signed_receipt from an earlier
    // in_transit upload never satisfies this, unlike the generic path.
    if (isBlueprintDelivery && targetStatus === "delivered" && !selectedFile) {
      setError(
        "Please upload a fresh Proof of Delivery photo to complete this delivery.",
      );
      setSuccess("");
      return;
    }

    if (requireReceipt && !hasExistingReceipt && !selectedFile) {
      setError("Please upload the proof of delivery first.");
      setSuccess("");
      return;
    }

    if (!allowReceiptOnly && targetStatus === currentStatus && !selectedFile) {
      setSuccess("No changes to save.");
      return;
    }

    setSavingId(delivery.id);
    setError("");
    setSuccess("");

    try {
      const fd = new FormData();
      fd.append("status", targetStatus);
      fd.append("notes", delivery.notes ?? "");

      if (targetStatus === "failed") {
        fd.append("failure_reason", failureReason || "");
      }

      // PHASE 5: never send collected_amount/payment_method for
      // blueprint orders — the backend computes and controls both, and
      // ignores these fields entirely for order_type = 'blueprint'.
      if (targetStatus === "delivered" && !isBlueprintDelivery) {
        fd.append("collected_amount", collectionForm.amount || "");
        fd.append("payment_method", collectionForm.payment_method || "cash");
        fd.append("collection_notes", collectionForm.collection_notes || "");
      }

      if (selectedFile) {
        fd.append("receipt", selectedFile);
      }

      const { data } = await api.patch(
        `/pos/deliveries/${delivery.id}/status`,
        fd,
        { headers: { "Content-Type": "multipart/form-data" } },
      );

      setReceiptFiles((prev) => ({
        ...prev,
        [delivery.id]: null,
      }));

      if (targetStatus === "delivered") {
        setCollectionForms((prev) => ({
          ...prev,
          [delivery.id]: {
            amount: "",
            payment_method: "cash",
            collection_notes: "",
          },
        }));
      }

      setSuccess(
        data?.message ||
          successMessage ||
          (selectedFile
            ? "Delivery proof uploaded successfully."
            : "Delivery updated successfully."),
      );

      await loadDeliveries();

      if (onSuccess) onSuccess();
    } catch (err) {
      console.error("Delivery update error:", err?.response?.data || err);
      setError(
        err?.response?.data?.message ||
          `Failed to update delivery.${
            err?.response?.status ? ` (HTTP ${err.response.status})` : ""
          }`,
      );
    } finally {
      setSavingId(null);
    }
  };

  const STATUS_FILTERS = [
    { value: "all", label: "All" },
    { value: "scheduled", label: "Scheduled" },
    { value: "in_transit", label: "In Transit" },
    { value: "delivered", label: "Delivered" },
    { value: "failed", label: "Failed" },
    { value: "completed", label: "Completed" },
  ];

  const filteredDeliveries = useMemo(() => {
    const keyword = search.trim().toLowerCase();

    return deliveries.filter((item) => {
      const matchesStatus =
        statusFilter === "all" || normalize(item.status) === statusFilter;

      if (!matchesStatus) return false;
      if (!keyword) return true;

      return [
        String(item.order_number || ""),
        String(item.customer_name || ""),
        String(item.address || ""),
        String(item.status || ""),
        String(item.driver_name || ""),
      ].some((field) => field.toLowerCase().includes(keyword));
    });
  }, [deliveries, search, statusFilter]);

  return (
    <div className="rider-page-shell">
      <div className="rider-card" style={{ padding: "16px" }}>
        <div>
          <h2 style={pageTitle}>
            {isDeliveryRider ? "Deliveries" : "Delivery Management"}
          </h2>
          <p style={pageSubtitle}>
            {isDeliveryRider
              ? "Manage assigned deliveries that still need action."
              : "Monitor assigned deliveries and review delivery proof uploads."}
          </p>
        </div>
      </div>

      <div
        className="rider-card rider-work-filter-card"
        style={{ padding: "16px", marginBottom: "16px" }}
      >
        <input
          type="text"
          className="rider-work-search"
          placeholder="Search order, customer, address, or status"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={searchInput}
        />
        {isDeliveryRider && (
          <div style={statusFilterRow}>
            {STATUS_FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setStatusFilter(option.value)}
                style={
                  statusFilter === option.value
                    ? statusFilterButtonActive
                    : statusFilterButton
                }
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {error ? <div style={alertError}>{error}</div> : null}
      {success ? <div style={alertSuccess}>{success}</div> : null}

      {loading ? (
        <div style={emptyCard}>Loading deliveries...</div>
      ) : filteredDeliveries.length === 0 ? (
        <div style={emptyCard}>No deliveries found.</div>
      ) : (
        <div style={cardList}>
          {filteredDeliveries.map((delivery) => {
            const status = normalize(delivery.status || "scheduled");
            const statusMeta = getStatusMeta(status);
            const selectedFile = receiptFiles[delivery.id] || null;
            const hasReceipt = Boolean(delivery.signed_receipt);
            const deliveryMapHref = getGoogleMapsHref(
              delivery.delivery_lat,
              delivery.delivery_lng,
            );

            // 👉 NEW: Added isCompleted boolean
            const canStartTransit = status === "scheduled";
            const canCompleteDelivery = status === "in_transit";
            const isDelivered = status === "delivered";
            const isCompleted = status === "completed";
            const isFailed = status === "failed";

            // 👉 NEW: Summary should show for both Delivered AND Completed
            const showSummary = isDelivered || isCompleted;

            const paymentBalance = Number(delivery.payment_balance || 0);
            const collectionForm = getCollectionForm(delivery);

            // PHASE 5 — Blueprint Rider Final Cash Collection. This
            // entire block only ever changes behavior for blueprint
            // orders; every variable/branch below defaults to the
            // original standard/walk-in/COD/COP behavior when false.
            const isBlueprintDelivery =
              normalize(delivery.order_type) === "blueprint";
            const isStandardCodDelivery =
              !isBlueprintDelivery &&
              normalize(delivery.order_type) === "standard" &&
              normalize(delivery.payment_method) === "cod";
            // Keep rider UI consistent with backend completion logic:
            // NULL/blank means the default Cash on Delivery method.
            const remainingPaymentMethod =
              normalize(delivery.remaining_payment_method) || "cash";
            const pendingPaymentCount = Number(
              delivery.pending_payment_count || 0,
            );
            const standardCodHasPendingPayment =
              isStandardCodDelivery &&
              paymentBalance > 0.009 &&
              pendingPaymentCount > 0;
            const blueprintHasPendingCollection =
              isBlueprintDelivery && pendingPaymentCount > 0;
            const blueprintAwaitingOnline =
              isBlueprintDelivery &&
              remainingPaymentMethod === "paymongo" &&
              paymentBalance > 0.009;
            // Defensive only. With the default-Cash rule above, a normal
            // NULL value is never treated as a missing customer choice.
            const blueprintMethodRequired =
              isBlueprintDelivery &&
              !remainingPaymentMethod &&
              paymentBalance > 0.009;
            const blueprintReadyForCashConfirm =
              isBlueprintDelivery &&
              remainingPaymentMethod === "cash" &&
              paymentBalance > 0.009 &&
              !blueprintHasPendingCollection;

            const hasOutstandingBalance = paymentBalance > 0.009;
            const rawCollectedAmount = String(
              collectionForm.amount ?? "",
            ).trim();
            const parsedCollectedAmount = Number(rawCollectedAmount || 0);

            const hasCollectedAmountValue = rawCollectedAmount !== "";
            const collectedAmountInvalid =
              hasCollectedAmountValue &&
              (!Number.isFinite(parsedCollectedAmount) ||
                parsedCollectedAmount <= 0);

            const collectedAmountExceedsBalance =
              hasCollectedAmountValue &&
              parsedCollectedAmount > paymentBalance + 0.01;
            const collectedAmountDoesNotMatchCodBalance =
              isStandardCodDelivery &&
              hasOutstandingBalance &&
              hasCollectedAmountValue &&
              Math.abs(
                parsedCollectedAmount - Number(paymentBalance.toFixed(2)),
              ) > 0.009;

            const completeDeliveryDisabled = isBlueprintDelivery
              ? savingId === delivery.id ||
                !selectedFile || // PHASE 5: always a FRESH photo, never hasReceipt fallback
                blueprintHasPendingCollection ||
                blueprintAwaitingOnline ||
                blueprintMethodRequired
              : savingId === delivery.id ||
                (!hasReceipt && !selectedFile) ||
                standardCodHasPendingPayment ||
                (canCompleteDelivery &&
                  hasOutstandingBalance &&
                  (!hasCollectedAmountValue ||
                    collectedAmountInvalid ||
                    collectedAmountExceedsBalance ||
                    collectedAmountDoesNotMatchCodBalance));

            const canUploadProof = isBlueprintDelivery
              ? true
              : !standardCodHasPendingPayment &&
                (!canCompleteDelivery ||
                  !hasOutstandingBalance ||
                  (hasCollectedAmountValue &&
                    !collectedAmountInvalid &&
                    !collectedAmountExceedsBalance &&
                    !collectedAmountDoesNotMatchCodBalance));

            return (
              <div
                key={delivery.id}
                id={`delivery-card-${delivery.id}`}
                className="rider-card rider-delivery-card"
                style={{
                  padding: "16px",
                  border: `2px solid ${
                    status === "delivered"
                      ? "#0a0a0a"
                      : status === "completed"
                        ? "#0a0a0a"
                        : status === "scheduled"
                          ? "#0a0a0a"
                          : status === "in_transit"
                            ? "#0a0a0a"
                            : status === "failed"
                              ? "#ef4444"
                              : statusMeta.border
                  }`,
                  ...(focusedDeliveryId === delivery.id
                    ? { boxShadow: "0 0 0 3px #0a0a0a" }
                    : null),
                }}
              >
                <div style={deliveryHeader}>
                  <div>
                    <div style={deliveryOrderNo}>
                      {delivery.order_number || "—"}
                    </div>
                    <div style={deliveryCustomer}>
                      {delivery.customer_name || "Walk-in Customer"}
                    </div>
                  </div>

                  <span
                    style={{
                      background: statusMeta.bg,
                      color: statusMeta.text,
                      border: `1px solid ${statusMeta.border}`,
                      padding: "4px 10px",
                      borderRadius: 0,
                      fontSize: 11,
                      fontWeight: 700,
                      alignSelf: "flex-start",
                      textTransform: "uppercase",
                      letterSpacing: "1px",
                    }}
                  >
                    {formatStatus(delivery.status)}
                  </span>
                </div>

                <div className="rider-details-grid">
                  <InfoCard
                    label="Address"
                    value={
                      <div className="rider-delivery-address-value">
                        <span>{delivery.address || "—"}</span>
                        {!deliveryMapHref && isBlueprintDelivery ? (
                          <small>Location pin unavailable</small>
                        ) : null}
                      </div>
                    }
                  />
                  <InfoCard
                    label="Scheduled"
                    value={
                      <div>
                        <div>{formatDateTime(delivery.scheduled_date)}</div>
                        {isDeliveryRider && isRiderOverdueDelivery(delivery) ? (
                          <span style={overdueScheduleText}>Overdue</span>
                        ) : null}
                      </div>
                    }
                  />
                  {!isDeliveryRider ? (
                    <InfoCard
                      label="Driver"
                      value={delivery.driver_name || "Unassigned"}
                    />
                  ) : null}
                  <InfoCard
                    label="Proof Status"
                    value={hasReceipt ? "Uploaded" : "Awaiting upload"}
                    tone={hasReceipt ? "#18181b" : "#71717a"}
                  />
                  <InfoCard
                    label="Remaining Balance"
                    value={`₱ ${paymentBalance.toLocaleString("en-PH", {
                      minimumFractionDigits: 2,
                    })}`}
                    tone="#18181b"
                  />
                </div>

                {/* WISDOM RIDER SCHEDULED ACTION FLOW V1 */}
                <div
                  className={`rider-delivery-card-actions${
                    canStartTransit ? " is-scheduled" : ""
                  }`}
                >
                  {canStartTransit ? (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          saveDeliveryUpdate({
                            delivery,
                            nextStatus: "in_transit",
                            successMessage:
                              "Delivery marked as in transit successfully.",
                          })
                        }
                        disabled={savingId === delivery.id}
                        className="rider-v2-btn rider-v2-btn-primary rider-delivery-start-action"
                      >
                        {savingId === delivery.id
                          ? "Saving..."
                          : "Start Delivery"}
                      </button>

                      {deliveryMapHref ? (
                        <a
                          href={deliveryMapHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rider-v2-btn rider-v2-btn-secondary rider-delivery-map-action"
                        >
                          <Navigation size={14} strokeWidth={2} />
                          Open Map
                        </a>
                      ) : null}
                    </>
                  ) : (
                    <>
                      {deliveryMapHref ? (
                        <a
                          href={deliveryMapHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rider-v2-btn rider-v2-btn-secondary rider-delivery-map-action"
                        >
                          <Navigation size={14} strokeWidth={2} />
                          Open Map
                        </a>
                      ) : null}

                      <button
                        type="button"
                        className="rider-v2-btn rider-v2-btn-secondary rider-delivery-detail-toggle"
                        onClick={() =>
                          setExpandedDeliveryId((current) =>
                            current === delivery.id ? null : delivery.id,
                          )
                        }
                      >
                        {expandedDeliveryId === delivery.id
                          ? "Hide Details"
                          : "View Details"}
                      </button>
                    </>
                  )}
                </div>
                {!canStartTransit && expandedDeliveryId === delivery.id ? (
                  <div className="rider-delivery-expanded">
                    {delivery.notes ? (
                      <div style={notesBox}>
                        <div style={notesLabel}>Notes</div>
                        <div style={notesText}>{delivery.notes}</div>
                      </div>
                    ) : null}

                    {canCompleteDelivery && (
                      <div style={actionSection}>
                        {isBlueprintDelivery ? (
                          <div style={{ marginBottom: "16px" }}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: "12px",
                              }}
                            >
                              <div style={sectionTitle}>Remaining Balance</div>
                              {blueprintMethodRequired ||
                              blueprintAwaitingOnline ? (
                                <span
                                  style={{
                                    fontSize: 11,
                                    color: "#71717a",
                                    fontStyle: "italic",
                                  }}
                                >
                                  Checking payment status automatically...
                                </span>
                              ) : null}
                            </div>

                            {blueprintMethodRequired ? (
                              <div style={helperText}>
                                The customer has not yet chosen how to pay the
                                remaining balance. Delivery cannot be completed
                                yet.
                              </div>
                            ) : remainingPaymentMethod === "paymongo" ? (
                              <>
                                <div style={helperText}>
                                  {blueprintAwaitingOnline
                                    ? "Awaiting Online Payment Confirmation"
                                    : "Online Payment Confirmed"}
                                </div>
                                <div
                                  style={{
                                    marginTop: "12px",
                                    display: "grid",
                                    gridTemplateColumns:
                                      "repeat(auto-fit, minmax(180px, 1fr))",
                                    gap: "12px",
                                  }}
                                >
                                  <div>
                                    <label style={infoLabel}>
                                      Cash to Collect
                                    </label>
                                    <input
                                      type="text"
                                      value="₱0.00"
                                      readOnly
                                      style={{
                                        ...searchInput,
                                        background: "#fafafa",
                                        color: "#18181b",
                                        fontWeight: 700,
                                        cursor: "not-allowed",
                                      }}
                                    />
                                  </div>
                                </div>
                              </>
                            ) : blueprintHasPendingCollection ? (
                              <div style={helperText}>
                                Cash collection is awaiting admin verification.
                              </div>
                            ) : blueprintReadyForCashConfirm ? (
                              <>
                                <div style={helperText}>
                                  Payment Method: Cash on Delivery. Collect the
                                  exact remaining balance below from the
                                  customer, then complete the delivery.
                                </div>
                                <div
                                  style={{
                                    marginTop: "12px",
                                    display: "grid",
                                    gridTemplateColumns:
                                      "repeat(auto-fit, minmax(180px, 1fr))",
                                    gap: "12px",
                                  }}
                                >
                                  <div>
                                    <label style={infoLabel}>
                                      Amount to Collect
                                    </label>
                                    <input
                                      type="text"
                                      value={`₱${paymentBalance.toLocaleString(
                                        "en-PH",
                                        { minimumFractionDigits: 2 },
                                      )}`}
                                      readOnly
                                      style={{
                                        ...searchInput,
                                        background: "#fafafa",
                                        color: "#18181b",
                                        fontWeight: 700,
                                        cursor: "not-allowed",
                                      }}
                                    />
                                  </div>
                                  <div>
                                    <label style={infoLabel}>
                                      Payment Method
                                    </label>
                                    <input
                                      type="text"
                                      value="Cash"
                                      readOnly
                                      style={{
                                        ...searchInput,
                                        background: "#fafafa",
                                        color: "#18181b",
                                        fontWeight: 700,
                                        cursor: "not-allowed",
                                      }}
                                    />
                                  </div>
                                </div>
                              </>
                            ) : (
                              <div style={helperText}>
                                This order has no outstanding balance.
                              </div>
                            )}
                          </div>
                        ) : (
                          hasOutstandingBalance && (
                            <div style={{ marginBottom: "16px" }}>
                              <div style={sectionTitle}>
                                Remaining Balance Collection
                              </div>
                              <div style={helperText}>
                                {standardCodHasPendingPayment
                                  ? "A payment is already awaiting admin review. Complete Delivery is locked until it is verified or rejected."
                                  : isStandardCodDelivery
                                    ? "Collect the exact remaining balance from the customer. Admin will verify the cash collection before the order can be completed."
                                    : "Record the amount collected from the customer during delivery. Admin will verify this payment before the order can be completed."}
                              </div>

                              <div
                                style={{
                                  marginTop: "12px",
                                  display: "grid",
                                  gridTemplateColumns:
                                    "repeat(auto-fit, minmax(180px, 1fr))",
                                  gap: "12px",
                                }}
                              >
                                <div>
                                  <label style={infoLabel}>
                                    {isStandardCodDelivery
                                      ? "Amount to Collect"
                                      : "Collected Amount"}
                                  </label>
                                  {isStandardCodDelivery ? (
                                    <input
                                      type="text"
                                      value={`₱${paymentBalance.toLocaleString(
                                        "en-PH",
                                        { minimumFractionDigits: 2 },
                                      )}`}
                                      readOnly
                                      style={{
                                        ...searchInput,
                                        background: "#fafafa",
                                        color: "#18181b",
                                        fontWeight: 700,
                                        cursor: "not-allowed",
                                      }}
                                    />
                                  ) : (
                                    <input
                                      type="number"
                                      min="0"
                                      max={paymentBalance.toFixed(2)}
                                      step="0.01"
                                      value={collectionForm.amount}
                                      onChange={(e) =>
                                        updateCollectionForm(
                                          delivery.id,
                                          "amount",
                                          e.target.value,
                                        )
                                      }
                                      style={searchInput}
                                      placeholder={`Max ${paymentBalance.toFixed(2)}`}
                                    />
                                  )}
                                  {!isStandardCodDelivery &&
                                    (!hasCollectedAmountValue ||
                                      collectedAmountInvalid ||
                                      collectedAmountExceedsBalance) && (
                                      <div
                                        style={{
                                          marginTop: 6,
                                          fontSize: "12px",
                                          color: "#b91c1c",
                                          fontWeight: 600,
                                        }}
                                      >
                                        {!hasCollectedAmountValue
                                          ? "Collected amount is required before completing delivery."
                                          : collectedAmountInvalid
                                            ? "Collected amount must be greater than zero."
                                            : `Collected amount cannot exceed ₱${paymentBalance.toLocaleString(
                                                "en-PH",
                                                { minimumFractionDigits: 2 },
                                              )}.`}
                                      </div>
                                    )}
                                </div>

                                <div>
                                  <label style={infoLabel}>
                                    Payment Method
                                  </label>
                                  <input
                                    type="text"
                                    value="Cash"
                                    readOnly
                                    style={{
                                      ...searchInput,
                                      background: "#fafafa",
                                      color: "#18181b",
                                      fontWeight: 700,
                                      cursor: "not-allowed",
                                    }}
                                  />
                                </div>

                                <div style={{ gridColumn: "1 / -1" }}>
                                  <label style={infoLabel}>
                                    Collection Note
                                  </label>
                                  <textarea
                                    rows={2}
                                    value={collectionForm.collection_notes}
                                    onChange={(e) =>
                                      updateCollectionForm(
                                        delivery.id,
                                        "collection_notes",
                                        e.target.value,
                                      )
                                    }
                                    style={{
                                      ...searchInput,
                                      minHeight: 88,
                                      resize: "vertical",
                                      fontFamily: "inherit",
                                    }}
                                    placeholder="Example: Full remaining balance collected during turnover."
                                  />
                                </div>
                              </div>
                            </div>
                          )
                        )}

                        <div style={sectionTitle}>
                          {isBlueprintDelivery
                            ? "Upload Proof of Delivery Photo"
                            : "Proof of Delivery"}
                        </div>
                        <div style={helperText}>
                          {isBlueprintDelivery
                            ? "A fresh photo is required every time to complete this delivery."
                            : "Upload the Proof of Delivery photo first, then complete the delivery."}
                        </div>

                        <div style={proofPanel}>
                          <div style={proofStatusRow}>
                            <span style={proofStatusLabel}>
                              {isBlueprintDelivery
                                ? selectedFile
                                  ? "Fresh photo selected."
                                  : "Upload a fresh Proof of Delivery photo to continue."
                                : hasReceipt
                                  ? "Proof already uploaded. Choose another file to replace it."
                                  : "No proof uploaded yet"}
                            </span>

                            {hasReceipt && delivery.signed_receipt ? (
                              <a
                                href={buildAssetUrl(delivery.signed_receipt)}
                                target="_blank"
                                rel="noreferrer"
                                style={viewLink}
                              >
                                View Current Proof
                              </a>
                            ) : null}
                          </div>

                          <ProofUploadField
                            inputId={`delivery-proof-${delivery.id}`}
                            disabled={
                              savingId === delivery.id || !canUploadProof
                            }
                            selectedFile={selectedFile}
                            onSelect={(file) =>
                              handleReceiptChange(delivery.id, file)
                            }
                            title={
                              selectedFile
                                ? "Proof selected"
                                : "Upload delivery proof"
                            }
                            helper="JPG, PNG, or PDF up to 5 MB"
                          />

                          {!canUploadProof && (
                            <div
                              style={{
                                marginTop: "8px",
                                fontSize: "12px",
                                color: "#b91c1c",
                                fontWeight: 600,
                              }}
                            >
                              Enter a valid collected amount first before
                              uploading proof of delivery.
                            </div>
                          )}
                        </div>

                        <div className="rider-button-row">
                          <button
                            onClick={() =>
                              saveDeliveryUpdate({
                                delivery,
                                nextStatus: "delivered",
                                requireReceipt: true,
                                successMessage:
                                  "Delivery completed successfully with proof of delivery.",
                              })
                            }
                            disabled={completeDeliveryDisabled}
                            className={`rider-btn ${completeDeliveryDisabled ? "rider-btn-disabled" : "rider-btn-primary"}`}
                          >
                            {savingId === delivery.id
                              ? "Saving..."
                              : "Complete Delivery"}
                          </button>
                        </div>
                      </div>
                    )}

                    {canCompleteDelivery && (
                      <div style={{ ...actionSection, marginTop: "8px" }}>
                        <div className="rider-button-row">
                          <button
                            onClick={() => {
                              setFailureModal(delivery);
                              setFailureReasonInput("");
                            }}
                            disabled={savingId === delivery.id}
                            className="rider-btn rider-btn-undo"
                          >
                            {savingId === delivery.id
                              ? "Saving..."
                              : "Mark as Failed"}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* 👉 NEW: showSummary covers both Delivered and Completed statuses */}
                    {showSummary && (
                      <div style={actionSection}>
                        <div style={sectionTitle}>Delivery Summary</div>
                        <div style={helperText}>
                          {isCompleted
                            ? "This order has been successfully completed. You may close this card."
                            : "This delivery has been dropped off. Waiting for admin verification."}
                        </div>

                        <div style={summaryRow}>
                          <div style={summaryItem}>
                            <span style={summaryLabel}>Delivered On</span>
                            <span style={summaryValue}>
                              {formatDateTime(delivery.delivered_date)}
                            </span>
                          </div>
                        </div>

                        <div style={{ marginTop: 12 }}>
                          {hasReceipt && delivery.signed_receipt ? (
                            <a
                              href={buildAssetUrl(delivery.signed_receipt)}
                              target="_blank"
                              rel="noreferrer"
                              style={viewLink}
                            >
                              View Proof of Delivery
                            </a>
                          ) : (
                            <div style={helperText}>
                              This older record has no uploaded proof yet.
                            </div>
                          )}

                          {/* 👉 NEW: The entire upload and Undo section is strictly hidden if Completed */}
                          {isDelivered && (
                            <>
                              <div style={{ ...proofPanel, marginTop: 12 }}>
                                <div style={proofStatusRow}>
                                  <span style={proofStatusLabel}>
                                    {hasReceipt
                                      ? "Need to replace the uploaded proof?"
                                      : "Upload proof for this delivered record"}
                                  </span>
                                </div>

                                <ProofUploadField
                                  inputId={`delivery-proof-replace-${delivery.id}`}
                                  disabled={savingId === delivery.id}
                                  selectedFile={selectedFile}
                                  onSelect={(file) =>
                                    handleReceiptChange(delivery.id, file)
                                  }
                                  title={
                                    hasReceipt
                                      ? "Replace delivery proof"
                                      : "Upload delivery proof"
                                  }
                                  helper="JPG, PNG, or PDF up to 5 MB"
                                />

                                <div className="rider-button-row">
                                  <button
                                    onClick={() =>
                                      saveDeliveryUpdate({
                                        delivery,
                                        nextStatus: "delivered",
                                        allowReceiptOnly: true,
                                        successMessage: hasReceipt
                                          ? "Proof of delivery replaced successfully."
                                          : "Proof of delivery uploaded successfully.",
                                      })
                                    }
                                    disabled={
                                      savingId === delivery.id || !selectedFile
                                    }
                                    className={`rider-btn ${savingId === delivery.id || !selectedFile ? "rider-btn-disabled" : "rider-btn-secondary"}`}
                                  >
                                    {savingId === delivery.id
                                      ? "Saving..."
                                      : hasReceipt
                                        ? "Replace Proof"
                                        : "Upload Proof"}
                                  </button>
                                </div>
                              </div>

                              <div
                                style={{
                                  marginTop: "24px",
                                  paddingTop: "16px",
                                  borderTop: "1px dashed #e4e4e7",
                                }}
                              >
                                <div style={sectionTitle}>
                                  Need Corrections?
                                </div>
                                <div style={helperText}>
                                  If you accidentally marked this as delivered,
                                  you can undo it to correct the collection
                                  amount or proof of delivery.
                                </div>
                                <div className="rider-button-row">
                                  <button
                                    onClick={() => {
                                      if (
                                        window.confirm(
                                          "Are you sure you want to undo this delivery? It will be moved back to 'In Transit'.",
                                        )
                                      ) {
                                        saveDeliveryUpdate({
                                          delivery,
                                          nextStatus: "in_transit",
                                          successMessage:
                                            "Delivery reverted to In Transit successfully.",
                                        });
                                      }
                                    }}
                                    disabled={savingId === delivery.id}
                                    className={`rider-btn ${savingId === delivery.id ? "rider-btn-disabled" : "rider-btn-undo"}`}
                                  >
                                    {savingId === delivery.id
                                      ? "Undoing..."
                                      : "Undo Delivery"}
                                  </button>
                                </div>
                              </div>
                            </>
                          )}

                          {/* 👉 NEW: Give the rider a way to dismiss the card once completed */}
                          {isCompleted && (
                            <div
                              className="rider-button-row"
                              style={{ marginTop: 24 }}
                            >
                              <button
                                onClick={() => setExpandedDeliveryId(null)}
                                className="rider-btn rider-btn-secondary"
                              >
                                Dismiss
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {isFailed && (
                      <div style={actionSection}>
                        <div style={sectionTitle}>Delivery Failed</div>
                        <div style={helperText}>
                          This delivery was marked as failed. Contact the admin
                          for reassignment or rescheduling.
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {failureModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "16px",
          }}
          onClick={() => {
            if (savingId !== failureModal.id) {
              setFailureModal(null);
              setFailureReasonInput("");
            }
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: 0,
              padding: "24px",
              width: "100%",
              maxWidth: "420px",
              boxShadow: "0 20px 50px rgba(0,0,0,0.2)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                fontSize: "16px",
                fontWeight: 700,
                color: "#18181b",
                marginBottom: "4px",
              }}
            >
              Mark Delivery as Failed
            </div>
            <div
              style={{
                fontSize: "13px",
                color: "#71717a",
                marginBottom: "16px",
              }}
            >
              {failureModal.order_number || "—"}
            </div>
            <label
              style={{
                fontSize: "12px",
                fontWeight: 600,
                color: "#52525b",
                display: "block",
                marginBottom: "6px",
              }}
            >
              Reason (required)
            </label>
            <textarea
              value={failureReasonInput}
              onChange={(e) => setFailureReasonInput(e.target.value)}
              maxLength={500}
              rows={4}
              disabled={savingId === failureModal.id}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 0,
                border: "1px solid #e4e4e7",
                fontSize: "13px",
                fontFamily: "inherit",
                resize: "vertical",
                boxSizing: "border-box",
              }}
              placeholder="Explain why this delivery could not be completed..."
            />
            <div
              style={{
                fontSize: "11px",
                color: "#a1a1aa",
                marginTop: "4px",
                textAlign: "right",
              }}
            >
              {failureReasonInput.trim().length}/500
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
                marginTop: "20px",
              }}
            >
              <button
                onClick={() => {
                  setFailureModal(null);
                  setFailureReasonInput("");
                }}
                disabled={savingId === failureModal.id}
                className="rider-btn rider-btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const trimmedReason = failureReasonInput.trim();
                  saveDeliveryUpdate({
                    delivery: failureModal,
                    nextStatus: "failed",
                    failureReason: trimmedReason,
                    onSuccess: () => {
                      setFailureModal(null);
                      setFailureReasonInput("");
                    },
                  });
                }}
                disabled={
                  savingId === failureModal.id ||
                  !failureReasonInput.trim() ||
                  failureReasonInput.trim().length > 500
                }
                className={`rider-btn ${
                  savingId === failureModal.id ||
                  !failureReasonInput.trim() ||
                  failureReasonInput.trim().length > 500
                    ? "rider-btn-disabled"
                    : "rider-btn-undo"
                }`}
              >
                {savingId === failureModal.id ? "Saving..." : "Confirm Failure"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ProofUploadField({
  inputId,
  disabled,
  selectedFile,
  onSelect,
  title,
  helper,
}) {
  return (
    <label
      htmlFor={inputId}
      className={`rider-proof-upload${disabled ? " is-disabled" : ""}`}
    >
      <input
        id={inputId}
        className="rider-proof-upload-input"
        type="file"
        accept="image/*,.pdf"
        disabled={disabled}
        onChange={(event) => onSelect(event.target.files?.[0] || null)}
      />

      <div className="rider-proof-upload-icon">
        <UploadCloud size={20} strokeWidth={1.8} />
      </div>

      <div className="rider-proof-upload-copy">
        <strong>{title}</strong>
        <span>{helper}</span>
        {selectedFile ? (
          <span className="rider-proof-selected">
            <FileText size={13} strokeWidth={1.8} />
            {selectedFile.name}
          </span>
        ) : null}
      </div>

      <span className="rider-proof-upload-action">
        {selectedFile ? "Change File" : "Select File"}
      </span>
    </label>
  );
}

function InfoCard({ label, value, tone }) {
  return (
    <div
      className="rider-card rider-delivery-info-card"
      style={{ padding: "12px", background: "#fafafa" }}
    >
      <div className="rider-delivery-info-label" style={infoLabel}>
        {label}
      </div>
      <div
        className="rider-delivery-info-value"
        style={{ ...infoValue, color: tone || "#18181b" }}
      >
        {value}
      </div>
    </div>
  );
}

const pageShell = {
  padding: "24px",
  display: "flex",
  flexDirection: "column",
  gap: "16px",
  fontFamily: "'Inter', sans-serif",
};

const heroCard = {
  background: "#ffffff",
  border: "1px solid #e4e4e7",
  borderRadius: 0,
  padding: "18px 20px",
  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
};

const pageTitle = {
  margin: 0,
  fontSize: "24px",
  fontWeight: 800,
  color: "#0a0a0a",
  letterSpacing: "-0.02em",
};

const pageSubtitle = {
  margin: "8px 0 0",
  color: "#52525b",
  fontSize: "13px",
  lineHeight: 1.6,
};

const searchCard = {
  background: "#ffffff",
  border: "1px solid #e4e4e7",
  borderRadius: 0,
  padding: "14px",
  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
};

const searchInput = {
  width: "100%",
  padding: "12px 14px",
  borderRadius: 0,
  border: "1px solid #e4e4e7",
  outline: "none",
  fontSize: "13px",
  color: "#18181b",
  boxSizing: "border-box",
};

const statusFilterRow = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
  marginTop: "12px",
};

const statusFilterButton = {
  padding: "6px 14px",
  borderRadius: 0,
  border: "1px solid #e4e4e7",
  background: "#fafafa",
  color: "#71717a",
  fontSize: "12px",
  fontWeight: 600,
  cursor: "pointer",
};

const statusFilterButtonActive = {
  ...statusFilterButton,
  background: "#0a0a0a",
  border: "1px solid #0a0a0a",
  color: "#ffffff",
};

const alertError = {
  padding: "12px 14px",
  borderRadius: 0,
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#991b1b",
  fontSize: "13px",
  fontWeight: 600,
};

const alertSuccess = {
  padding: "12px 14px",
  borderRadius: 0,
  background: "#fafafa",
  border: "1px solid #e4e4e7",
  color: "#18181b",
  fontSize: "13px",
  fontWeight: 600,
};

const emptyCard = {
  background: "#ffffff",
  border: "1px solid #e4e4e7",
  borderRadius: 0,
  padding: "40px",
  color: "#71717a",
  fontSize: "13px",
  fontWeight: 600,
  textAlign: "center",
};

const cardList = {
  display: "grid",
  gap: "16px",
};

const deliveryCard = {
  background: "#ffffff",
  border: "1px solid #e4e4e7",
  borderRadius: 0,
  padding: "24px",
  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
};

const deliveryHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: "12px",
  marginBottom: "16px",
  flexWrap: "wrap",
};

const deliveryOrderNo = {
  fontSize: "18px",
  fontWeight: 800,
  color: "#0a0a0a",
  marginBottom: "4px",
  letterSpacing: "-0.01em",
};

const deliveryCustomer = {
  fontSize: "14px",
  color: "#52525b",
  fontWeight: 600,
};

const infoCard = {
  border: "1px solid #e4e4e7",
  borderRadius: 0,
  padding: "14px",
  background: "#fafafa",
};

const infoLabel = {
  fontSize: "10px",
  fontWeight: 800,
  color: "#71717a",
  textTransform: "uppercase",
  letterSpacing: "1px",
  marginBottom: "6px",
};

const infoValue = {
  fontSize: "14px",
  fontWeight: 700,
  color: "#18181b",
  lineHeight: 1.5,
  wordBreak: "break-word",
};

const notesBox = {
  marginTop: "16px",
  padding: "16px",
  border: "1px solid #e4e4e7",
  borderRadius: 0,
  background: "#fafafa",
};

const notesLabel = {
  fontSize: "10px",
  fontWeight: 800,
  color: "#71717a",
  textTransform: "uppercase",
  letterSpacing: "1px",
  marginBottom: "8px",
};

const notesText = {
  fontSize: "13px",
  color: "#18181b",
  lineHeight: 1.6,
};

const actionSection = {
  marginTop: "20px",
  paddingTop: "20px",
  borderTop: "1px solid #e4e4e7",
};

const sectionTitle = {
  fontSize: "15px",
  fontWeight: 800,
  color: "#0a0a0a",
  marginBottom: "6px",
  letterSpacing: "-0.01em",
};

const helperText = {
  fontSize: "13px",
  color: "#52525b",
  lineHeight: 1.6,
};

const proofPanel = {
  marginTop: "16px",
  padding: "16px",
  border: "1px dashed #d4d4d8",
  borderRadius: 0,
  background: "#fafafa",
};

const proofStatusRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "12px",
  flexWrap: "wrap",
  marginBottom: "12px",
};

const proofStatusLabel = {
  fontSize: "13px",
  fontWeight: 700,
  color: "#18181b",
};

const fileInput = {
  fontSize: "13px",
  marginBottom: "8px",
  color: "#52525b",
};

const selectedFileText = {
  fontSize: "12px",
  color: "#71717a",
  fontWeight: 600,
};

// 👉 NOTE: We removed the hardcoded button styles here because they are now controlled dynamically by RiderScreen.css!

const summaryRow = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "12px",
  marginTop: "16px",
};

const summaryItem = {
  border: "1px solid #e4e4e7",
  borderRadius: 0,
  padding: "16px",
  background: "#fafafa",
};

const summaryLabel = {
  display: "block",
  fontSize: "10px",
  fontWeight: 800,
  color: "#71717a",
  textTransform: "uppercase",
  letterSpacing: "1px",
  marginBottom: "6px",
};

const summaryValue = {
  display: "block",
  fontSize: "14px",
  fontWeight: 700,
  color: "#18181b",
};

const overdueScheduleText = {
  display: "inline-block",
  marginTop: "4px",
  color: "#18181b",
  fontSize: "10px",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};

const viewLink = {
  display: "inline-flex",
  alignItems: "center",
  padding: "8px 14px",
  borderRadius: 0,
  background: "#f4f4f5",
  color: "#18181b",
  border: "1px solid #e4e4e7",
  textDecoration: "none",
  fontSize: "12px",
  fontWeight: 700,
  transition: "background 0.2s",
};
