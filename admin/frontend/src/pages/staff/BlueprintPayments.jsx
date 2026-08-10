import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { FileText, RefreshCw, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import api, { buildAssetUrl } from "../../services/api";
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

function BlueprintThumb({ src, title, size = "list" }) {
  const [failed, setFailed] = useState(false);
  const assetUrl = buildAssetUrl(src);

  if (!assetUrl || failed) {
    return (
      <div
        className={`bp-thumb bp-thumb-${size} bp-thumb-fallback`}
        aria-label="Blueprint preview unavailable"
        title="Blueprint preview unavailable"
      >
        <FileText size={18} aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className={`bp-thumb bp-thumb-${size}`}>
      <img
        src={assetUrl}
        alt={title || "Blueprint"}
        onError={() => setFailed(true)}
      />
    </div>
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
                    <BlueprintThumb
                      src={order.thumbnail_url}
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
                      <span>
                        {ORDER_STATUS_TEXT[normalize(order.order_status)] ||
                          order.order_status ||
                          "-"}
                      </span>
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
                <BlueprintThumb
                  src={summary.thumbnail_url}
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
                <span>
                  {ORDER_STATUS_TEXT[normalize(summary.order_status)] ||
                    summary.order_status ||
                    "-"}
                </span>
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
    </div>
  );
}