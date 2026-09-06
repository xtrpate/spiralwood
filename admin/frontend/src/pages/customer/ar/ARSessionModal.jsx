import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";

import "./ar-roomle.css";

const formatMm = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0
    ? Math.round(number)
    : "—";
};

export default function ARSessionModal({
  open,
  status,
  sessionUrl,
  error,
  dimensionsMm,
  onClose,
  onRetry,
}) {
  const [copied, setCopied] = useState(false);

  const isLocalhost = useMemo(() => {
    try {
      return new URL(sessionUrl).hostname === "localhost";
    } catch (_error) {
      return false;
    }
  }, [sessionUrl]);

  useEffect(() => {
    if (!open || typeof document === "undefined") {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onClose?.();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) setCopied(false);
  }, [open]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  const copyUrl = async () => {
    if (!sessionUrl) return;

    try {
      await navigator.clipboard.writeText(sessionUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (_error) {
      setCopied(false);
    }
  };

  const preparing =
    status === "preparing" || status === "uploading";

  return createPortal(
    <div
      className="wisdom-ar-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose?.();
        }
      }}
    >
      <section
        className="wisdom-ar-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wisdom-ar-modal-title"
      >
        <button
          type="button"
          className="wisdom-ar-modal-close"
          onClick={onClose}
          aria-label="Close AR preview"
        >
          ×
        </button>

        {preparing ? (
          <div className="wisdom-ar-state-panel">
            <div className="wisdom-ar-spinner" aria-hidden="true" />
            <h2 id="wisdom-ar-modal-title">
              {status === "uploading"
                ? "Creating your AR link"
                : "Preparing your furniture"}
            </h2>
            <p>
              WISDOM is preparing the exact configured furniture
              for real-world placement.
            </p>
          </div>
        ) : null}

        {status === "error" ? (
          <div className="wisdom-ar-state-panel">
            <div className="wisdom-ar-error-mark">!</div>
            <h2 id="wisdom-ar-modal-title">
              AR preview could not be prepared
            </h2>
            <p>{error}</p>
            <button
              type="button"
              className="wisdom-ar-primary-button"
              onClick={onRetry}
            >
              Try again
            </button>
          </div>
        ) : null}

        {status === "ready" ? (
          <div className="wisdom-ar-ready-grid">
            <div className="wisdom-ar-qr-panel">
              <div className="wisdom-ar-qr-frame">
                <QRCodeSVG
                  value={sessionUrl}
                  size={210}
                  level="M"
                  marginSize={2}
                />
              </div>
            </div>

            <div className="wisdom-ar-ready-copy">
              <h2 id="wisdom-ar-modal-title">
                Show in your room (AR)
              </h2>

              <p className="wisdom-ar-lead">
                Scan the QR code using your phone. The furniture
                opens at its configured real-world size.
              </p>

              <div className="wisdom-ar-size-card">
                <span>AR MODEL SIZE</span>
                <strong>
                  {formatMm(dimensionsMm?.width_mm)} ×{" "}
                  {formatMm(dimensionsMm?.height_mm)} ×{" "}
                  {formatMm(dimensionsMm?.depth_mm)} mm
                </strong>
              </div>

              <div className="wisdom-ar-url-row">
                <span title={sessionUrl}>{sessionUrl}</span>
                <button type="button" onClick={copyUrl}>
                  {copied ? "Copied" : "Copy URL"}
                </button>
              </div>

              <a
                className="wisdom-ar-open-device-link"
                href={sessionUrl}
              >
                Open on this device
              </a>

              {isLocalhost ? (
                <p className="wisdom-ar-local-note">
                  A phone cannot reach a QR that starts with
                  localhost. Use the included local HTTPS AR test
                  helper, or test from the deployed HTTPS website.
                </p>
              ) : (
                <p className="wisdom-ar-ready-note">
                  Keep the furniture at its configured scale when
                  checking whether it fits your room.
                </p>
              )}

              {/* WISDOM AR PROTOTYPE NOTICE */}
              <div
                className="wisdom-ar-prototype-note"
                role="note"
                aria-label="AR prototype notice"
              >
                <span
                  className="wisdom-ar-prototype-icon"
                  aria-hidden="true"
                >
                  i
                </span>
                <p>
                  <strong>Prototype notice:</strong> This AR preview
                  is still under development. Furniture is shown at
                  its configured real-world size, but placement and
                  tracking accuracy may vary by device, lighting, and
                  environment.
                </p>
              </div>

              <p className="wisdom-ar-expiry-note">
                This temporary AR link expires automatically in
                about 2 hours.
              </p>
            </div>
          </div>
        ) : null}
      </section>
    </div>,
    document.body,
  );
}
