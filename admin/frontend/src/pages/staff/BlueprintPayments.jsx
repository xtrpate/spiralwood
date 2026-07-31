import { useState } from "react";
import toast from "react-hot-toast";
import { useNavigate } from "react-router-dom";
import api from "../../services/api";

const formatMoney = (value) =>
  `₱${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

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

const pageWrap = {
  maxWidth: 640,
  margin: "0 auto",
  padding: "24px 20px",
};

const card = {
  background: "#ffffff",
  border: "1px solid #e4e4e7",
  borderRadius: 16,
  padding: "20px 24px",
  boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
  marginBottom: 20,
};

const title = {
  margin: "0 0 16px",
  fontSize: 18,
  fontWeight: 800,
  color: "#0a0a0a",
};

const labelSm = {
  display: "block",
  fontSize: 12,
  fontWeight: 700,
  color: "#52525b",
  marginBottom: 6,
};

const inputFull = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #d4d4d8",
  borderRadius: 8,
  fontSize: 14,
  boxSizing: "border-box",
};

const btnPrimary = {
  padding: "10px 16px",
  background: "#18181b",
  color: "#ffffff",
  border: "1px solid #18181b",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
};

const infoRow = {
  display: "flex",
  justifyContent: "space-between",
  padding: "8px 0",
  borderBottom: "1px solid #f4f4f5",
  fontSize: 14,
};

const infoNotice = {
  background: "#fafafa",
  border: "1px solid #e4e4e7",
  borderRadius: 10,
  padding: "12px 14px",
  fontSize: 13,
  color: "#3f3f46",
  marginTop: 12,
};

const successBox = {
  background: "#f0fdf4",
  border: "1px solid #bbf7d0",
  borderRadius: 10,
  padding: "14px 16px",
  fontSize: 13,
  color: "#166534",
  marginTop: 16,
};

const btnSecondarySm = {
  padding: "8px 14px",
  background: "#ffffff",
  color: "#18181b",
  border: "1px solid #d4d4d8",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 700,
};

function InfoRow({ label, value }) {
  return (
    <div style={infoRow}>
      <span style={{ color: "#71717a" }}>{label}</span>
      <span style={{ fontWeight: 700, color: "#0a0a0a" }}>{value}</span>
    </div>
  );
}

export default function BlueprintPayments() {
  const navigate = useNavigate();
  const [orderNumberInput, setOrderNumberInput] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [summary, setSummary] = useState(null);

  const [customAmount, setCustomAmount] = useState("");
  const [recording, setRecording] = useState(false);
  const [recordError, setRecordError] = useState("");
  const [lastPaymentResult, setLastPaymentResult] = useState(null);

  const handleSearch = async (e) => {
    e.preventDefault();

    const trimmed = orderNumberInput.trim();
    if (!trimmed) {
      setSearchError("Enter an order number.");
      return;
    }

    setSearching(true);
    setSearchError("");
    setRecordError("");
    setSummary(null);
    setLastPaymentResult(null);

    try {
      const { data } = await api.get(
        "/pos/blueprint-cash-payments/lookup",
        { params: { order_number: trimmed } },
      );
      setSummary(data);
    } catch (err) {
      setSearchError(
        err?.response?.data?.message || "Failed to look up order.",
      );
    } finally {
      setSearching(false);
    }
  };

  const refreshSummary = async () => {
    if (!summary?.order_number) return;
    try {
      const { data } = await api.get(
        "/pos/blueprint-cash-payments/lookup",
        { params: { order_number: summary.order_number } },
      );
      setSummary(data);
    } catch (err) {
      setRecordError(
        err?.response?.data?.message || "Failed to refresh order.",
      );
    }
  };

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

    setRecording(true);
    setLastPaymentResult(null);
    try {
      const { data } = await api.post(
        `/pos/blueprint-cash-payments/${summary.order_id}`,
        { amount: trimmedAmount },
      );
      setRecordError("");
      toast.success(data?.message || "Cash payment recorded successfully.");
      setCustomAmount("");
      setLastPaymentResult(data);
      await refreshSummary();
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
  const showFirstPaymentMinimum = Boolean(summary) && verifiedTotal === 0;
  const showAdditionalMinimum =
    Boolean(summary) &&
    verifiedTotal > 0 &&
    verifiedTotal < minimumRequiredTotal;

  return (
    <div style={pageWrap}>
      <div style={card}>
        <h2 style={title}>Blueprint Payments</h2>
        <form onSubmit={handleSearch}>
          <label style={labelSm}>Order Number</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type="text"
              value={orderNumberInput}
              onChange={(e) => setOrderNumberInput(e.target.value)}
              placeholder="SWS-20260730-0006"
              style={inputFull}
              disabled={searching}
            />
            <button
              type="submit"
              style={btnPrimary}
              disabled={searching || !orderNumberInput.trim()}
            >
              {searching ? "Searching..." : "Search"}
            </button>
          </div>
          {searchError ? (
            <div style={infoNotice}>{searchError}</div>
          ) : null}
        </form>
      </div>

      {summary ? (
        <div style={card}>
          <h2 style={title}>{summary.order_number}</h2>

          <InfoRow label="Order type" value={summary.order_type} />
          <InfoRow label="Order status" value={summary.order_status} />
          <InfoRow
            label="Payment status"
            value={summary.payment_status || "-"}
          />
          <InfoRow label="Total" value={formatMoney(summary.total)} />
          {showFirstPaymentMinimum ? (
            <InfoRow
              label="Minimum first payment (30%)"
              value={formatMoney(minimumRequiredTotal)}
            />
          ) : null}
          {showAdditionalMinimum ? (
            <InfoRow
              label="Minimum additional payment needed to reach 30%"
              value={formatMoney(summary.minimum_additional_payment || 0)}
            />
          ) : null}
          <InfoRow
            label="Verified amount"
            value={formatMoney(verifiedTotal)}
          />
          <InfoRow
            label="Remaining balance"
            value={formatMoney(summary.remaining_balance)}
          />

          {recordError ? (
            <div style={infoNotice}>{recordError}</div>
          ) : null}

          {lastPaymentResult ? (
            <div style={successBox}>
              <div style={{ fontWeight: 800, marginBottom: 4 }}>
                Payment recorded successfully.
              </div>
              <div>Receipt #: {lastPaymentResult.receipt_number}</div>
              {lastPaymentResult.payment_label ? (
                <div style={{ textTransform: "capitalize" }}>
                  Payment type: {lastPaymentResult.payment_label.replace("_", " ")}
                </div>
              ) : null}
              <button
                type="button"
                style={{ ...btnSecondarySm, marginTop: 10 }}
                onClick={() =>
                  navigate(`/staff/blueprint-receipt/${lastPaymentResult.receipt_id}`)
                }
              >
                View Receipt
              </button>
            </div>
          ) : null}

          {summary.can_record_payment ? (
            <div style={{ marginTop: 16 }}>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  marginBottom: 12,
                }}
              >
                {(summary.quick_amounts || []).map((amount) => {
                  const amountStr = Number(amount).toFixed(2);
                  return (
                    <button
                      key={amountStr}
                      type="button"
                      style={btnPrimary}
                      disabled={recording}
                      onClick={() => recordPayment(amountStr)}
                    >
                      {recording ? "Recording..." : `Record ${formatMoney(amountStr)}`}
                    </button>
                  );
                })}
              </div>

              <label style={labelSm}>Custom amount</label>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="0.00"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  style={inputFull}
                  disabled={recording}
                />
                <button
                  type="button"
                  style={btnPrimary}
                  disabled={recording || !customAmount.trim()}
                  onClick={() => {
                    const trimmed = customAmount.trim();
                    if (!trimmed) {
                      setRecordError("Enter a valid payment amount.");
                      return;
                    }
                    recordPayment(trimmed);
                  }}
                >
                  Record
                </button>
              </div>
            </div>
          ) : (
            <div style={infoNotice}>
              {summary.reason_message ||
                "Cash at Store recording is not available for this order."}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}