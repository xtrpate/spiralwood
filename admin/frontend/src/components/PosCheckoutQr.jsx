import { useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

const DEFAULT_TTL_MS = 15 * 60 * 1000;
const POLL_INTERVAL_MS = 5000;

const MYSQL_TIMESTAMP_WITHOUT_ZONE =
  /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/;

const parseTimestamp = (value) => {
  if (!value) return null;

  const rawValue = String(value).trim();
  const normalizedValue = MYSQL_TIMESTAMP_WITHOUT_ZONE.test(rawValue)
    ? `${rawValue.replace(" ", "T")}Z`
    : rawValue;

  const timestamp = Date.parse(normalizedValue);
  return Number.isFinite(timestamp) ? timestamp : null;
};

const formatCountdown = (seconds) => {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
};

export default function PosCheckoutQr({
  checkoutUrl,
  expiresAt,
  createdAt,
  onPoll,
  pollingDisabled = false,
}) {
  const onPollRef = useRef(onPoll);
  const pollInFlightRef = useRef(false);

  useEffect(() => {
    onPollRef.current = onPoll;
  }, [onPoll]);

  const expiryTimestamp = useMemo(() => {
    const now = Date.now();
    const serverExpiry = parseTimestamp(expiresAt);
    const localCreated = parseTimestamp(createdAt);
    const localExpiry =
      localCreated === null ? null : localCreated + DEFAULT_TTL_MS;

    // Prefer the authoritative server expiry when it is still in the future.
    if (serverExpiry !== null && serverExpiry > now) return serverExpiry;

    // Local Windows + remote UTC MySQL can serialize a DATETIME eight hours
    // early. For a newly created/restored browser attempt, keep the original
    // browser creation time as a safe countdown fallback.
    if (localExpiry !== null && localExpiry > now) return localExpiry;

    return serverExpiry ?? localExpiry;
  }, [expiresAt, createdAt]);

  const [remainingSeconds, setRemainingSeconds] = useState(null);

  useEffect(() => {
    const updateRemaining = () => {
      if (expiryTimestamp === null) {
        setRemainingSeconds(null);
        return;
      }

      setRemainingSeconds(
        Math.max(0, Math.ceil((expiryTimestamp - Date.now()) / 1000)),
      );
    };

    updateRemaining();
    const timer = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(timer);
  }, [expiryTimestamp]);

  useEffect(() => {
    if (
      !checkoutUrl ||
      pollingDisabled ||
      typeof onPollRef.current !== "function"
    ) {
      return undefined;
    }

    const poll = async () => {
      if (pollInFlightRef.current) return;

      pollInFlightRef.current = true;
      try {
        await onPollRef.current();
      } finally {
        pollInFlightRef.current = false;
      }
    };

    const timer = window.setInterval(poll, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [checkoutUrl, pollingDisabled]);

  if (!checkoutUrl) return null;

  const isExpired = remainingSeconds === 0;

  return (
    <div className="pos-qr-checkout-grid">
      <div className="pos-qr-code-card">
        <div className="pos-qr-code-frame">
          <QRCodeSVG
            value={checkoutUrl}
            size={224}
            level="M"
            marginSize={4}
            bgColor="#ffffff"
            fgColor="#000000"
            title="PayMongo checkout QR code"
          />
        </div>

        <div
          className={`pos-qr-countdown ${
            isExpired ? "pos-qr-countdown-expired" : ""
          }`}
        >
          {remainingSeconds === null
            ? "15-minute reservation"
            : isExpired
              ? "Reservation expired - checking status"
              : `Expires in ${formatCountdown(remainingSeconds)}`}
        </div>
      </div>

      <div className="pos-qr-scan-guide">
        <div className="pos-qr-scan-label">SCAN TO PAY</div>
        <h4 className="pos-qr-scan-title">
          Customer scans this QR code using a phone
        </h4>
        <ol className="pos-qr-scan-steps">
          <li>Open the phone Camera or Google Lens.</li>
          <li>Scan the QR code shown on the cashier screen.</li>
          <li>Complete payment on the PayMongo Checkout page.</li>
        </ol>
        <p className="pos-qr-auto-note">
          WISDOM checks the payment automatically every 5 seconds. The
          cashier does not need to press Verify Payment after a successful
          checkout.
        </p>
      </div>
    </div>
  );
}
