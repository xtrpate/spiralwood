import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import api from "../../services/api";

const STATUS_OPTIONS = [
  { value: "all", label: "All unresolved" },
  { value: "provider_unknown", label: "Provider unknown" },
  { value: "awaiting_payment", label: "Awaiting payment" },
];

const LIMIT_OPTIONS = [25, 50, 100];

const RELEASE_REASONS = [
  {
    value: "dashboard_no_session_found",
    label: "No session found in PayMongo Dashboard",
  },
  {
    value: "session_confirmed_unusable",
    label: "Session confirmed unusable",
  },
  {
    value: "duplicate_abandoned_attempt",
    label: "Duplicate or abandoned attempt",
  },
  { value: "other", label: "Other approved reason" },
];

const EMPTY_MANUAL_RELEASE = {
  open: false,
  attemptId: null,
  loadingPreliminary: false,
  preliminaryItems: [],
  reasonCode: "",
  freshItems: [],
  confirmationToken: null,
  expiresAt: null,
  quantitiesChanged: false,
  reviewedRefreshedQuantities: false,
  error: "",
};

const pageStyles = {
  page: {
    display: "grid",
    gap: 18,
    color: "#18181b",
  },
  card: {
    background: "#ffffff",
    border: "1px solid #e4e4e7",
    borderRadius: 14,
    boxShadow: "0 6px 22px rgba(24, 24, 27, 0.05)",
  },
  button: {
    border: "none",
    borderRadius: 8,
    padding: "9px 13px",
    fontSize: 12,
    fontWeight: 700,
    cursor: "pointer",
    transition: "opacity 0.15s ease, transform 0.15s ease",
  },
  input: {
    width: "100%",
    border: "1px solid #d4d4d8",
    borderRadius: 8,
    padding: "9px 10px",
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box",
  },
  label: {
    display: "block",
    marginBottom: 6,
    fontSize: 12,
    fontWeight: 700,
    color: "#3f3f46",
  },
};

const normalizeReservedItems = (items) =>
  (Array.isArray(items) ? items : [])
    .map((item) => ({
      product_id: Number(item?.product_id),
      product_name:
        typeof item?.product_name === "string" && item.product_name.trim()
          ? item.product_name.trim()
          : null,
      quantity: Number(item?.quantity),
    }))
    .filter(
      (item) =>
        Number.isSafeInteger(item.product_id) &&
        item.product_id > 0 &&
        Number.isSafeInteger(item.quantity) &&
        item.quantity > 0,
    )
    .sort((a, b) => a.product_id - b.product_id);

const quantitiesMatch = (left, right) => {
  const normalizedLeft = normalizeReservedItems(left);
  const normalizedRight = normalizeReservedItems(right);

  if (normalizedLeft.length !== normalizedRight.length) return false;

  return normalizedLeft.every(
    (item, index) =>
      item.product_id === normalizedRight[index].product_id &&
      item.quantity === normalizedRight[index].quantity,
  );
};

const formatCurrency = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "Unavailable";

  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(parsed);
};

const formatDateTime = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("en-PH", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const statusLabel = (status) =>
  status === "provider_unknown"
    ? "Provider unknown"
    : status === "awaiting_payment"
      ? "Awaiting payment"
      : status || "Unknown";

function StatusBadge({ status }) {
  const isUnknown = status === "provider_unknown";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: 999,
        padding: "5px 9px",
        fontSize: 11,
        fontWeight: 800,
        background: isUnknown ? "#fef3c7" : "#dbeafe",
        color: isUnknown ? "#92400e" : "#1e40af",
        whiteSpace: "nowrap",
      }}
    >
      {statusLabel(status)}
    </span>
  );
}

function ReservedItemsTable({ items, fallbackNames = [] }) {
  const namesByProductId = useMemo(() => {
    const map = new Map();
    normalizeReservedItems(fallbackNames).forEach((item) => {
      if (item.product_name) map.set(item.product_id, item.product_name);
    });
    return map;
  }, [fallbackNames]);

  const normalized = normalizeReservedItems(items);

  if (normalized.length === 0) {
    return (
      <p style={{ margin: 0, color: "#71717a", fontSize: 13 }}>
        No active reservation quantities were returned.
      </p>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontSize: 12,
          minWidth: 420,
        }}
      >
        <thead>
          <tr style={{ background: "#f4f4f5" }}>
            <th style={{ textAlign: "left", padding: 9 }}>Product</th>
            <th style={{ textAlign: "left", padding: 9 }}>Product ID</th>
            <th style={{ textAlign: "right", padding: 9 }}>Reserved Qty</th>
          </tr>
        </thead>
        <tbody>
          {normalized.map((item) => (
            <tr key={item.product_id} style={{ borderTop: "1px solid #e4e4e7" }}>
              <td style={{ padding: 9, fontWeight: 700 }}>
                {item.product_name || namesByProductId.get(item.product_id) || "Product"}
              </td>
              <td style={{ padding: 9 }}>{item.product_id}</td>
              <td style={{ padding: 9, textAlign: "right", fontWeight: 800 }}>
                {item.quantity}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CompletionResult({ result, onClose }) {
  if (!result) return null;

  return (
    <section
      style={{
        ...pageStyles.card,
        borderColor: "#86efac",
        background: "#f0fdf4",
        padding: 16,
      }}
      aria-live="polite"
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div style={{ fontSize: 13, color: "#166534", fontWeight: 800 }}>
            Payment recovery completed
          </div>
          <div style={{ marginTop: 4, fontSize: 12, color: "#3f6212" }}>
            The unresolved attempt is no longer in the recovery queue.
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            ...pageStyles.button,
            background: "transparent",
            color: "#166534",
            padding: "4px 7px",
          }}
        >
          Dismiss
        </button>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: 10,
          marginTop: 14,
        }}
      >
        <div>
          <div style={{ fontSize: 11, color: "#4d7c0f" }}>Order</div>
          <div style={{ fontSize: 14, fontWeight: 800 }}>
            {result.order_number || `#${result.order_id || "—"}`}
          </div>
          {result.order_id && (
            <Link
              to={`/admin/orders/${result.order_id}`}
              style={{ fontSize: 12, color: "#166534", fontWeight: 700 }}
            >
              Open order
            </Link>
          )}
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#4d7c0f" }}>Payment Transaction</div>
          <div style={{ fontSize: 14, fontWeight: 800 }}>
            {result.payment_transaction_id || "—"}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#4d7c0f" }}>Receipt</div>
          <div style={{ fontSize: 14, fontWeight: 800 }}>
            {result.receipt_number || `#${result.receipt_id || "—"}`}
          </div>
          {result.receipt_id && (
            <Link
              to={`/staff/receipt/${result.receipt_id}`}
              style={{ fontSize: 12, color: "#166534", fontWeight: 700 }}
            >
              Open receipt
            </Link>
          )}
        </div>
        <div>
          <div style={{ fontSize: 11, color: "#4d7c0f" }}>Total</div>
          <div style={{ fontSize: 14, fontWeight: 800 }}>
            {formatCurrency(result.total)}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function PosQrRecoveryPage() {
  const [attempts, setAttempts] = useState([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [limit, setLimit] = useState(50);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [recoveryActionsEnabled, setRecoveryActionsEnabled] = useState(null);

  const [selectedAttemptId, setSelectedAttemptId] = useState(null);
  const selectedAttemptIdRef = useRef(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const [attachSessionIds, setAttachSessionIds] = useState({});
  const [busyAttemptIds, setBusyAttemptIds] = useState({});
  const [completionResult, setCompletionResult] = useState(null);

  const [manualRelease, setManualRelease] = useState(EMPTY_MANUAL_RELEASE);
  const [tokenSecondsRemaining, setTokenSecondsRemaining] = useState(0);

  const isAttemptBusy = useCallback(
    (attemptId) => Boolean(busyAttemptIds[attemptId]),
    [busyAttemptIds],
  );

  const setAttemptBusy = useCallback((attemptId, busy) => {
    setBusyAttemptIds((current) => {
      if (busy) return { ...current, [attemptId]: true };
      const next = { ...current };
      delete next[attemptId];
      return next;
    });
  }, []);

  const removeAttemptLocally = useCallback((attemptId) => {
    setAttempts((current) => current.filter((item) => item.id !== attemptId));
    setSelectedAttemptId((current) => (current === attemptId ? null : current));
    setDetail((current) => (current?.id === attemptId ? null : current));
    setDetailError("");
  }, []);

  const clearManualToken = useCallback((message = "") => {
    setManualRelease((current) => ({
      ...current,
      confirmationToken: null,
      expiresAt: null,
      freshItems: [],
      quantitiesChanged: false,
      reviewedRefreshedQuantities: false,
      error: message,
    }));
    setTokenSecondsRemaining(0);
  }, []);

  const closeManualRelease = useCallback(() => {
    setManualRelease(EMPTY_MANUAL_RELEASE);
    setTokenSecondsRemaining(0);
  }, []);

  const loadAttempts = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setListLoading(true);
      setListError("");

      try {
        const params = { limit };
        if (statusFilter !== "all") params.status = statusFilter;

        const response = await api.get("/pos/qr-payments/recovery/attempts", {
          params,
        });
        const nextAttempts = Array.isArray(response.data?.attempts)
          ? response.data.attempts
          : [];

        setAttempts(nextAttempts);
        setRecoveryActionsEnabled(
          response.data?.recovery_actions_enabled === true,
        );

        const currentSelectedAttemptId = selectedAttemptIdRef.current;
        if (
          currentSelectedAttemptId &&
          !nextAttempts.some((item) => item.id === currentSelectedAttemptId)
        ) {
          setSelectedAttemptId(null);
          setDetail(null);
          setDetailError("");
        }

        return nextAttempts;
      } catch (error) {
        setListError(
          error.response?.data?.message || "Unable to load recovery attempts.",
        );
        return null;
      } finally {
        if (!silent) setListLoading(false);
      }
    },
    [limit, statusFilter],
  );

  const fetchAttemptDetail = useCallback(
    async (
      attemptId,
      { select = true, silent = false, updateDetail = select } = {},
    ) => {
      if (select) setSelectedAttemptId(attemptId);
      if (updateDetail && !silent) setDetailLoading(true);
      if (updateDetail) setDetailError("");

      try {
        const response = await api.get(
          `/pos/qr-payments/recovery/attempts/${attemptId}`,
        );
        const nextDetail = response.data?.attempt || null;
        if (updateDetail) setDetail(nextDetail);
        setRecoveryActionsEnabled(
          response.data?.recovery_actions_enabled === true,
        );
        return { kind: "found", attempt: nextDetail };
      } catch (error) {
        const status = error.response?.status;
        const message =
          error.response?.data?.message || "Unable to load attempt details.";

        if (status === 404) {
          removeAttemptLocally(attemptId);
          return { kind: "not_found", message };
        }

        if (status === 409) {
          if (updateDetail) {
            setDetail(null);
            setDetailError(message);
          }
          return { kind: "conflict", message };
        }

        if (updateDetail) setDetailError(message);
        return { kind: "error", message };
      } finally {
        if (updateDetail && !silent) setDetailLoading(false);
      }
    },
    [removeAttemptLocally],
  );

  const reconcileAttempt = useCallback(
    async (attemptId) => {
      const shouldUpdateDetail = selectedAttemptId === attemptId;
      const outcome = await fetchAttemptDetail(attemptId, {
        select: shouldUpdateDetail,
        silent: true,
        updateDetail: shouldUpdateDetail,
      });
      await loadAttempts({ silent: true });
      return outcome;
    },
    [fetchAttemptDetail, loadAttempts, selectedAttemptId],
  );

  const handleActionError = useCallback(
    async (error, attemptId, { clearToken = false } = {}) => {
      const status = error.response?.status;
      const message =
        error.response?.data?.message || "The recovery action failed.";

      if (status === 403) {
        setRecoveryActionsEnabled(false);
        if (clearToken) clearManualToken(message);
        return;
      }

      if (status === 404 || status === 409) {
        if (clearToken) clearManualToken(message);
        const outcome = await reconcileAttempt(attemptId);
        if (clearToken && outcome.kind === "not_found") {
          closeManualRelease();
        }
        return;
      }

      // 502 deliberately does not refetch or clear forms/tokens. The
      // current UI state remains available for a safe retry.
      if (status === 502) return;
    },
    [clearManualToken, closeManualRelease, reconcileAttempt],
  );

  useEffect(() => {
    selectedAttemptIdRef.current = selectedAttemptId;
  }, [selectedAttemptId]);

  useEffect(() => {
    loadAttempts();
  }, [loadAttempts]);

  useEffect(() => {
    const token = manualRelease.confirmationToken;
    const expiresAt = Number(manualRelease.expiresAt);
    if (!token || !Number.isSafeInteger(expiresAt) || expiresAt <= 0) {
      setTokenSecondsRemaining(0);
      return undefined;
    }

    const updateCountdown = () => {
      const remainingMs = expiresAt * 1000 - Date.now();
      if (remainingMs <= 0) {
        clearManualToken(
          "The confirmation expired. Generate a new confirmation before releasing stock.",
        );
        return false;
      }
      setTokenSecondsRemaining(Math.ceil(remainingMs / 1000));
      return true;
    };

    if (!updateCountdown()) return undefined;
    const timer = window.setInterval(() => {
      if (!updateCountdown()) window.clearInterval(timer);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [manualRelease.confirmationToken, manualRelease.expiresAt, clearManualToken]);

  const handleSelectAttempt = async (attemptId) => {
    if (selectedAttemptId === attemptId && detail?.id === attemptId) {
      setSelectedAttemptId(null);
      setDetail(null);
      setDetailError("");
      return;
    }
    await fetchAttemptDetail(attemptId);
  };

  const handleAttachSession = async (attemptId) => {
    if (isAttemptBusy(attemptId) || !recoveryActionsEnabled) return;

    const providerSessionId = String(attachSessionIds[attemptId] || "").trim();
    if (!/^cs_[A-Za-z0-9]{8,80}$/.test(providerSessionId)) {
      toast.error("Enter a valid PayMongo Checkout Session ID beginning with cs_.");
      return;
    }

    setAttemptBusy(attemptId, true);
    try {
      const response = await api.post(
        `/pos/qr-payments/attempts/${attemptId}/attach-session`,
        { provider_session_id: providerSessionId },
      );

      const outcome = await reconcileAttempt(attemptId);
      if (outcome.kind === "not_found") {
        const payload = response.data || {};
        if (payload.order_id || payload.receipt_id || payload.payment_transaction_id) {
          setCompletionResult(payload);
        }
        setAttachSessionIds((current) => {
          const next = { ...current };
          delete next[attemptId];
          return next;
        });
      }

      toast.success(response.data?.message || "Session attachment processed.");
    } catch (error) {
      await handleActionError(error, attemptId);
    } finally {
      setAttemptBusy(attemptId, false);
    }
  };

  const handleVerifyPayment = async (attemptId) => {
    if (isAttemptBusy(attemptId) || !recoveryActionsEnabled) return;

    setAttemptBusy(attemptId, true);
    try {
      const response = await api.post(
        `/pos/qr-payments/attempts/${attemptId}/recovery-verify`,
      );
      const outcome = await reconcileAttempt(attemptId);

      if (outcome.kind === "not_found") {
        const payload = response.data || {};
        if (payload.order_id || payload.receipt_id || payload.payment_transaction_id) {
          setCompletionResult(payload);
        }
      }

      toast.success(response.data?.message || "Payment status refreshed.");
    } catch (error) {
      await handleActionError(error, attemptId);
    } finally {
      setAttemptBusy(attemptId, false);
    }
  };

  const openManualRelease = async (attemptId) => {
    if (isAttemptBusy(attemptId) || !recoveryActionsEnabled) return;

    const preliminaryFromCurrentDetail =
      detail?.id === attemptId ? normalizeReservedItems(detail.reserved_items) : [];

    setManualRelease({
      ...EMPTY_MANUAL_RELEASE,
      open: true,
      attemptId,
      loadingPreliminary: true,
      preliminaryItems: preliminaryFromCurrentDetail,
    });

    const outcome = await fetchAttemptDetail(attemptId, {
      select: true,
      silent: true,
    });

    if (outcome.kind === "not_found") {
      closeManualRelease();
      return;
    }

    if (outcome.kind !== "found" || outcome.attempt?.status !== "provider_unknown") {
      setManualRelease((current) => ({
        ...current,
        loadingPreliminary: false,
        error:
          outcome.message ||
          "This attempt is no longer eligible for manual release.",
      }));
      return;
    }

    setManualRelease((current) => ({
      ...current,
      loadingPreliminary: false,
      preliminaryItems: normalizeReservedItems(outcome.attempt.reserved_items),
    }));
  };

  const handleReasonChange = (reasonCode) => {
    setManualRelease((current) => ({
      ...current,
      reasonCode,
      confirmationToken: null,
      expiresAt: null,
      freshItems: [],
      quantitiesChanged: false,
      reviewedRefreshedQuantities: false,
      error: "",
    }));
    setTokenSecondsRemaining(0);
  };

  const generateReleaseConfirmation = async () => {
    const attemptId = manualRelease.attemptId;
    if (
      !attemptId ||
      !manualRelease.reasonCode ||
      isAttemptBusy(attemptId) ||
      !recoveryActionsEnabled
    ) {
      return;
    }

    setAttemptBusy(attemptId, true);
    setManualRelease((current) => ({ ...current, error: "" }));

    try {
      const response = await api.post(
        `/pos/qr-payments/attempts/${attemptId}/manual-release/request`,
        { reason_code: manualRelease.reasonCode },
      );

      // Deliberately read only these three approved fields. Any other
      // response field, including checkout_token, is ignored.
      const reservedItems = normalizeReservedItems(response.data?.reserved_items);
      const confirmationToken = response.data?.confirmation_token;
      const expiresAt = Number(response.data?.expires_at);

      if (
        reservedItems.length === 0 ||
        typeof confirmationToken !== "string" ||
        confirmationToken.length === 0 ||
        !Number.isSafeInteger(expiresAt) ||
        expiresAt * 1000 - Date.now() <= 0
      ) {
        throw new Error("The confirmation response was incomplete or already expired.");
      }

      const changed = !quantitiesMatch(
        manualRelease.preliminaryItems,
        reservedItems,
      );

      setManualRelease((current) => ({
        ...current,
        freshItems: reservedItems,
        confirmationToken,
        expiresAt,
        quantitiesChanged: changed,
        reviewedRefreshedQuantities: false,
        error: "",
      }));
    } catch (error) {
      if (!error.response) {
        clearManualToken(
          error.message || "Unable to generate a release confirmation.",
        );
      } else {
        await handleActionError(error, attemptId, { clearToken: true });
      }
    } finally {
      setAttemptBusy(attemptId, false);
    }
  };

  const confirmManualReleaseAction = async () => {
    const attemptId = manualRelease.attemptId;
    const token = manualRelease.confirmationToken;
    const reasonCode = manualRelease.reasonCode;
    const remainingMs = Number(manualRelease.expiresAt) * 1000 - Date.now();

    if (
      !attemptId ||
      !token ||
      !reasonCode ||
      remainingMs <= 0 ||
      (manualRelease.quantitiesChanged &&
        !manualRelease.reviewedRefreshedQuantities) ||
      isAttemptBusy(attemptId) ||
      !recoveryActionsEnabled
    ) {
      return;
    }

    setAttemptBusy(attemptId, true);
    try {
      const response = await api.post(
        `/pos/qr-payments/attempts/${attemptId}/manual-release/confirm`,
        {
          reason_code: reasonCode,
          confirmation_token: token,
        },
      );

      // Clear the in-memory token immediately on success, before any
      // follow-up request or UI transition.
      closeManualRelease();
      await reconcileAttempt(attemptId);
      toast.success(response.data?.message || "Stock reservation released.");
    } catch (error) {
      await handleActionError(error, attemptId, { clearToken: true });
    } finally {
      setAttemptBusy(attemptId, false);
    }
  };

  const selectedListAttempt = attempts.find(
    (attempt) => attempt.id === selectedAttemptId,
  );
  const manualBusy = manualRelease.attemptId
    ? isAttemptBusy(manualRelease.attemptId)
    : false;
  const confirmDisabled =
    !manualRelease.confirmationToken ||
    tokenSecondsRemaining <= 0 ||
    manualBusy ||
    !recoveryActionsEnabled ||
    (manualRelease.quantitiesChanged &&
      !manualRelease.reviewedRefreshedQuantities);

  return (
    <div style={pageStyles.page}>
      <header>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 14,
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 25, letterSpacing: "-0.02em" }}>
              POS QR Recovery
            </h1>
            <p
              style={{
                margin: "7px 0 0",
                color: "#71717a",
                fontSize: 13,
                maxWidth: 720,
                lineHeight: 1.55,
              }}
            >
              Review unresolved POS QR payments. Attach only an existing PayMongo
              Checkout Session, verify an attached payment, or safely release a
              provider-unknown reservation after confirmation.
            </p>
          </div>
          <button
            type="button"
            onClick={() => loadAttempts()}
            disabled={listLoading}
            style={{
              ...pageStyles.button,
              background: "#18181b",
              color: "#ffffff",
              opacity: listLoading ? 0.55 : 1,
            }}
          >
            {listLoading ? "Refreshing…" : "Refresh list"}
          </button>
        </div>
      </header>

      {recoveryActionsEnabled === false && (
        <div
          style={{
            border: "1px solid #fbbf24",
            background: "#fffbeb",
            color: "#92400e",
            borderRadius: 10,
            padding: "12px 14px",
            fontSize: 13,
            fontWeight: 700,
          }}
          role="status"
        >
          Recovery actions are disabled. You can still inspect unresolved attempts,
          but Attach Session, Verify Payment, and Manual Release are unavailable.
        </div>
      )}

      <CompletionResult
        result={completionResult}
        onClose={() => setCompletionResult(null)}
      />

      <section style={{ ...pageStyles.card, padding: 16 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 12,
            alignItems: "end",
          }}
        >
          <label>
            <span style={pageStyles.label}>Status</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              style={pageStyles.input}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span style={pageStyles.label}>Rows</span>
            <select
              value={limit}
              onChange={(event) => setLimit(Number(event.target.value))}
              style={pageStyles.input}
            >
              {LIMIT_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section style={pageStyles.card}>
        {listError && (
          <div
            style={{
              margin: 16,
              padding: 12,
              borderRadius: 8,
              background: "#fef2f2",
              color: "#991b1b",
              fontSize: 13,
            }}
          >
            {listError}
          </div>
        )}

        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              minWidth: 930,
              fontSize: 12,
            }}
          >
            <thead>
              <tr style={{ background: "#f4f4f5", color: "#52525b" }}>
                <th style={{ textAlign: "left", padding: 12 }}>Attempt</th>
                <th style={{ textAlign: "left", padding: 12 }}>Status</th>
                <th style={{ textAlign: "left", padding: 12 }}>Cashier</th>
                <th style={{ textAlign: "left", padding: 12 }}>Customer</th>
                <th style={{ textAlign: "right", padding: 12 }}>Total</th>
                <th style={{ textAlign: "left", padding: 12 }}>Session</th>
                <th style={{ textAlign: "left", padding: 12 }}>Updated</th>
                <th style={{ textAlign: "right", padding: 12 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {attempts.map((attempt) => {
                const busy = isAttemptBusy(attempt.id);
                const attachValue = attachSessionIds[attempt.id] || "";
                const isSelected = selectedAttemptId === attempt.id;

                return (
                  <React.Fragment key={attempt.id}>
                    <tr
                      style={{
                        borderTop: "1px solid #e4e4e7",
                        background: isSelected ? "#fafafa" : "#ffffff",
                      }}
                    >
                      <td style={{ padding: 12, fontWeight: 800 }}>#{attempt.id}</td>
                      <td style={{ padding: 12 }}>
                        <StatusBadge status={attempt.status} />
                      </td>
                      <td style={{ padding: 12 }}>
                        <div style={{ fontWeight: 700 }}>
                          {attempt.cashier?.name || "Unknown cashier"}
                        </div>
                        <div style={{ color: "#71717a", marginTop: 2 }}>
                          ID {attempt.cashier?.id || "—"}
                        </div>
                      </td>
                      <td style={{ padding: 12 }}>
                        <div style={{ fontWeight: 700 }}>
                          {attempt.customer_name || "Snapshot unavailable"}
                        </div>
                        <div style={{ color: "#71717a", marginTop: 2 }}>
                          {attempt.item_count === null
                            ? "Totals unavailable"
                            : `${attempt.item_count} item${attempt.item_count === 1 ? "" : "s"}`}
                        </div>
                      </td>
                      <td style={{ padding: 12, textAlign: "right", fontWeight: 800 }}>
                        {attempt.total === null
                          ? "Unavailable"
                          : formatCurrency(attempt.total)}
                      </td>
                      <td style={{ padding: 12 }}>
                        {attempt.session_attached ? "Attached" : "Not attached"}
                      </td>
                      <td style={{ padding: 12 }}>{formatDateTime(attempt.updated_at)}</td>
                      <td style={{ padding: 12 }}>
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "flex-end",
                            gap: 7,
                            flexWrap: "wrap",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => handleSelectAttempt(attempt.id)}
                            disabled={busy}
                            style={{
                              ...pageStyles.button,
                              background: "#e4e4e7",
                              color: "#18181b",
                              opacity: busy ? 0.55 : 1,
                            }}
                          >
                            {isSelected ? "Hide details" : "View details"}
                          </button>

                          {attempt.status === "provider_unknown" && (
                            <button
                              type="button"
                              onClick={() => openManualRelease(attempt.id)}
                              disabled={busy || !recoveryActionsEnabled}
                              style={{
                                ...pageStyles.button,
                                background: "#fee2e2",
                                color: "#991b1b",
                                opacity:
                                  busy || !recoveryActionsEnabled ? 0.5 : 1,
                              }}
                            >
                              Manual Release
                            </button>
                          )}

                          {attempt.status === "awaiting_payment" &&
                            attempt.session_attached && (
                              <button
                                type="button"
                                onClick={() => handleVerifyPayment(attempt.id)}
                                disabled={busy || !recoveryActionsEnabled}
                                style={{
                                  ...pageStyles.button,
                                  background: "#18181b",
                                  color: "#ffffff",
                                  opacity:
                                    busy || !recoveryActionsEnabled ? 0.5 : 1,
                                }}
                              >
                                {busy ? "Working…" : "Verify Payment"}
                              </button>
                            )}
                        </div>
                      </td>
                    </tr>

                    {attempt.status === "provider_unknown" && (
                      <tr style={{ background: "#fafafa", borderTop: "1px solid #e4e4e7" }}>
                        <td colSpan={8} style={{ padding: "10px 12px 14px" }}>
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "minmax(260px, 520px) auto",
                              gap: 8,
                              alignItems: "end",
                              maxWidth: 700,
                            }}
                          >
                            <label>
                              <span style={pageStyles.label}>
                                Existing PayMongo Checkout Session ID
                              </span>
                              <input
                                type="text"
                                value={attachValue}
                                onChange={(event) =>
                                  setAttachSessionIds((current) => ({
                                    ...current,
                                    [attempt.id]: event.target.value,
                                  }))
                                }
                                placeholder="cs_..."
                                autoComplete="off"
                                disabled={busy || !recoveryActionsEnabled}
                                style={pageStyles.input}
                              />
                            </label>
                            <button
                              type="button"
                              onClick={() => handleAttachSession(attempt.id)}
                              disabled={
                                busy ||
                                !recoveryActionsEnabled ||
                                !String(attachValue).trim()
                              }
                              style={{
                                ...pageStyles.button,
                                background: "#18181b",
                                color: "#ffffff",
                                minHeight: 36,
                                opacity:
                                  busy ||
                                  !recoveryActionsEnabled ||
                                  !String(attachValue).trim()
                                    ? 0.5
                                    : 1,
                              }}
                            >
                              {busy ? "Working…" : "Attach Session"}
                            </button>
                          </div>
                          <div style={{ marginTop: 6, color: "#71717a", fontSize: 11 }}>
                            Use only a Checkout Session already found in the PayMongo
                            Dashboard. This page never creates a new session.
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {!listLoading && attempts.length === 0 && !listError && (
          <div style={{ padding: 34, textAlign: "center", color: "#71717a" }}>
            <div style={{ fontSize: 28 }}>✓</div>
            <div style={{ marginTop: 8, fontSize: 14, fontWeight: 800, color: "#3f3f46" }}>
              No unresolved POS QR attempts
            </div>
            <div style={{ marginTop: 4, fontSize: 12 }}>
              The recovery queue is currently clear.
            </div>
          </div>
        )}

        {listLoading && (
          <div style={{ padding: 34, textAlign: "center", color: "#71717a" }}>
            Loading unresolved attempts…
          </div>
        )}
      </section>

      {selectedAttemptId && (
        <section style={{ ...pageStyles.card, padding: 18 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div>
              <h2 style={{ margin: 0, fontSize: 18 }}>
                Attempt #{selectedAttemptId} details
              </h2>
              {selectedListAttempt && (
                <div style={{ marginTop: 6 }}>
                  <StatusBadge status={selectedListAttempt.status} />
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => fetchAttemptDetail(selectedAttemptId)}
              disabled={detailLoading || isAttemptBusy(selectedAttemptId)}
              style={{
                ...pageStyles.button,
                background: "#e4e4e7",
                color: "#18181b",
              }}
            >
              Refresh details
            </button>
          </div>

          {detailLoading && (
            <p style={{ color: "#71717a", fontSize: 13 }}>Loading details…</p>
          )}

          {detailError && (
            <div
              style={{
                marginTop: 14,
                padding: 12,
                borderRadius: 8,
                background: "#fff7ed",
                color: "#9a3412",
                fontSize: 13,
              }}
            >
              {detailError}
            </div>
          )}

          {detail && detail.id === selectedAttemptId && (
            <div style={{ display: "grid", gap: 17, marginTop: 16 }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                  gap: 10,
                }}
              >
                {[
                  ["Cashier", detail.cashier?.name || "Unknown"],
                  ["Customer", detail.checkout_summary?.customer_name || "—"],
                  ["Customer phone", detail.checkout_summary?.customer_phone || "—"],
                  ["Total", formatCurrency(detail.checkout_summary?.total)],
                  ["Session", detail.session_attached ? "Attached" : "Not attached"],
                  ["Updated", formatDateTime(detail.updated_at)],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    style={{
                      border: "1px solid #e4e4e7",
                      borderRadius: 9,
                      padding: 11,
                    }}
                  >
                    <div style={{ fontSize: 11, color: "#71717a" }}>{label}</div>
                    <div style={{ marginTop: 4, fontSize: 13, fontWeight: 800 }}>
                      {value}
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <h3 style={{ fontSize: 14, margin: "0 0 9px" }}>Checkout items</h3>
                <div style={{ overflowX: "auto" }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      minWidth: 620,
                      fontSize: 12,
                    }}
                  >
                    <thead>
                      <tr style={{ background: "#f4f4f5" }}>
                        <th style={{ padding: 9, textAlign: "left" }}>Product</th>
                        <th style={{ padding: 9, textAlign: "right" }}>Qty</th>
                        <th style={{ padding: 9, textAlign: "right" }}>Unit price</th>
                        <th style={{ padding: 9, textAlign: "right" }}>Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detail.checkout_summary?.items || []).map((item) => (
                        <tr key={item.product_id} style={{ borderTop: "1px solid #e4e4e7" }}>
                          <td style={{ padding: 9, fontWeight: 700 }}>{item.product_name}</td>
                          <td style={{ padding: 9, textAlign: "right" }}>{item.quantity}</td>
                          <td style={{ padding: 9, textAlign: "right" }}>
                            {formatCurrency(item.unit_price)}
                          </td>
                          <td style={{ padding: 9, textAlign: "right", fontWeight: 800 }}>
                            {formatCurrency(item.subtotal)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div>
                <h3 style={{ fontSize: 14, margin: "0 0 9px" }}>
                  Active stock reservations
                </h3>
                <ReservedItemsTable items={detail.reserved_items} />
              </div>

              {detail.checkout_summary?.delivery && (
                <div
                  style={{
                    border: "1px solid #e4e4e7",
                    borderRadius: 9,
                    padding: 12,
                    fontSize: 12,
                    lineHeight: 1.55,
                  }}
                >
                  <strong>Delivery:</strong> {detail.checkout_summary.delivery.address}
                  <br />
                  <strong>Requested date:</strong>{" "}
                  {detail.checkout_summary.delivery.requested_date || "Not specified"}
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {manualRelease.open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="manual-release-title"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.62)",
            padding: 18,
          }}
        >
          <div
            style={{
              width: "min(720px, 96vw)",
              maxHeight: "92vh",
              overflowY: "auto",
              background: "#ffffff",
              borderRadius: 15,
              boxShadow: "0 24px 60px rgba(0,0,0,0.3)",
              padding: 20,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: 12,
              }}
            >
              <div>
                <h2 id="manual-release-title" style={{ margin: 0, fontSize: 19 }}>
                  Manual Release — Attempt #{manualRelease.attemptId}
                </h2>
                <p
                  style={{
                    margin: "7px 0 0",
                    color: "#71717a",
                    fontSize: 12,
                    lineHeight: 1.5,
                  }}
                >
                  Use this only after confirming that no usable PayMongo Checkout
                  Session can complete this payment.
                </p>
              </div>
              <button
                type="button"
                onClick={closeManualRelease}
                disabled={manualBusy}
                aria-label="Close manual release modal"
                style={{
                  ...pageStyles.button,
                  background: "#f4f4f5",
                  color: "#18181b",
                  padding: "6px 9px",
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ marginTop: 18 }}>
              <h3 style={{ fontSize: 13, margin: "0 0 8px" }}>
                Preliminary reservation details
              </h3>
              {manualRelease.loadingPreliminary ? (
                <p style={{ color: "#71717a", fontSize: 13 }}>
                  Loading current reservation quantities…
                </p>
              ) : (
                <ReservedItemsTable items={manualRelease.preliminaryItems} />
              )}
            </div>

            <label style={{ display: "block", marginTop: 18 }}>
              <span style={pageStyles.label}>Release reason</span>
              <select
                value={manualRelease.reasonCode}
                onChange={(event) => handleReasonChange(event.target.value)}
                disabled={
                  manualRelease.loadingPreliminary ||
                  manualBusy ||
                  !recoveryActionsEnabled
                }
                style={pageStyles.input}
              >
                <option value="">Select one approved reason</option>
                {RELEASE_REASONS.map((reason) => (
                  <option key={reason.value} value={reason.value}>
                    {reason.label}
                  </option>
                ))}
              </select>
            </label>

            <div style={{ marginTop: 13 }}>
              <button
                type="button"
                onClick={generateReleaseConfirmation}
                disabled={
                  !manualRelease.reasonCode ||
                  manualRelease.loadingPreliminary ||
                  manualBusy ||
                  !recoveryActionsEnabled
                }
                style={{
                  ...pageStyles.button,
                  background: "#27272a",
                  color: "#ffffff",
                  opacity:
                    !manualRelease.reasonCode ||
                    manualRelease.loadingPreliminary ||
                    manualBusy ||
                    !recoveryActionsEnabled
                      ? 0.5
                      : 1,
                }}
              >
                {manualBusy ? "Generating…" : "Generate Confirmation"}
              </button>
            </div>

            {manualRelease.confirmationToken && (
              <div
                style={{
                  marginTop: 17,
                  border: manualRelease.quantitiesChanged
                    ? "1px solid #f59e0b"
                    : "1px solid #86efac",
                  background: manualRelease.quantitiesChanged
                    ? "#fffbeb"
                    : "#f0fdf4",
                  borderRadius: 10,
                  padding: 13,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 800 }}>
                  Fresh authoritative reservation quantities
                </div>
                <div style={{ marginTop: 9 }}>
                  <ReservedItemsTable
                    items={manualRelease.freshItems}
                    fallbackNames={manualRelease.preliminaryItems}
                  />
                </div>
                <div style={{ marginTop: 10, fontSize: 12, fontWeight: 700 }}>
                  Confirmation expires in {tokenSecondsRemaining} second
                  {tokenSecondsRemaining === 1 ? "" : "s"}.
                </div>

                {manualRelease.quantitiesChanged && (
                  <label
                    style={{
                      display: "flex",
                      gap: 9,
                      alignItems: "flex-start",
                      marginTop: 12,
                      fontSize: 12,
                      fontWeight: 800,
                      color: "#92400e",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={manualRelease.reviewedRefreshedQuantities}
                      onChange={(event) =>
                        setManualRelease((current) => ({
                          ...current,
                          reviewedRefreshedQuantities: event.target.checked,
                        }))
                      }
                    />
                    <span>I reviewed the refreshed reservation quantities.</span>
                  </label>
                )}
              </div>
            )}

            {manualRelease.error && (
              <div
                style={{
                  marginTop: 13,
                  padding: 11,
                  borderRadius: 8,
                  background: "#fef2f2",
                  color: "#991b1b",
                  fontSize: 12,
                }}
              >
                {manualRelease.error}
              </div>
            )}

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 9,
                marginTop: 20,
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                onClick={closeManualRelease}
                disabled={manualBusy}
                style={{
                  ...pageStyles.button,
                  background: "#e4e4e7",
                  color: "#18181b",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmManualReleaseAction}
                disabled={confirmDisabled}
                style={{
                  ...pageStyles.button,
                  background: "#b91c1c",
                  color: "#ffffff",
                  opacity: confirmDisabled ? 0.45 : 1,
                }}
              >
                {manualBusy ? "Releasing…" : "Confirm Manual Release"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
