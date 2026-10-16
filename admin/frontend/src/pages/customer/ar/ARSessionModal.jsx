import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { QRCodeSVG } from "qrcode.react";
import { calculateWallFit } from "./furnitureSpatialSolver.mjs";

import "./ar-roomle.css";

import "./ar-roomle.css";

const formatMm = (value) => {
  const number = Number(value);

  return Number.isFinite(number) && number > 0 ? Math.round(number) : "—";
};

const formatFitMm = (value) => {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number.toLocaleString(undefined, {
        maximumFractionDigits: 1,
      })
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

  const [wallWidthMm, setWallWidthMm] = useState("");

  const [wallHeightMm, setWallHeightMm] = useState("");

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
    if (!open) {
      setCopied(false);
      setWallWidthMm("");
      setWallHeightMm("");
    }
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

  const preparing = status === "preparing" || status === "uploading";

  const wallFit = calculateWallFit({
    furnitureDimensionsMm: dimensionsMm,

    wallDimensionsMm: {
      width_mm: wallWidthMm,
      height_mm: wallHeightMm,
    },
  });

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
          aria-label="Close AR view"
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
              WISDOM is preparing the exact configured furniture for real-world
              placement.
            </p>
          </div>
        ) : null}

        {status === "error" ? (
          <div className="wisdom-ar-state-panel">
            <div className="wisdom-ar-error-mark">!</div>
            <h2 id="wisdom-ar-modal-title">AR view could not be prepared</h2>
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
              <h2 id="wisdom-ar-modal-title">View Furniture in Your Room</h2>

              <p className="wisdom-ar-lead">
                Scan the QR code with your phone to view your furniture using
                its configured dimensions.
              </p>

              <div className="wisdom-ar-size-card">
                <span>FURNITURE DIMENSIONS</span>

                <strong>
                  {formatMm(dimensionsMm?.width_mm)} ×{" "}
                  {formatMm(dimensionsMm?.height_mm)} ×{" "}
                  {formatMm(dimensionsMm?.depth_mm)} mm
                </strong>
              </div>

              <section
                aria-labelledby="wisdom-ar-wall-fit-title"
                style={{
                  marginTop: 18,
                  padding: 14,
                  border: "1px solid #e5e7eb",
                  background: "#ffffff",
                  boxSizing: "border-box",
                }}
              >
                <h3
                  id="wisdom-ar-wall-fit-title"
                  style={{
                    margin: "0 0 6px",
                    color: "#111827",
                    fontSize: 16,
                    lineHeight: 1.35,
                    fontWeight: 700,
                  }}
                >
                  Check furniture fit against a wall
                </h3>

                <p
                  style={{
                    margin: "0 0 14px",
                    color: "#64748b",
                    fontSize: 12,
                    lineHeight: 1.6,
                  }}
                >
                  Enter the usable wall width and height. Use the clear space
                  available for the furniture, not the dimensions of an entire
                  wall that includes obstructions.
                </p>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                    gap: 10,
                  }}
                >
                  <label
                    style={{
                      display: "grid",
                      gap: 6,
                      minWidth: 0,
                      color: "#374151",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    Usable wall width (mm)
                    <input
                      type="number"
                      inputMode="numeric"
                      min="1"
                      step="1"
                      value={wallWidthMm}
                      onChange={(event) => setWallWidthMm(event.target.value)}
                      placeholder="2400"
                      aria-label="Usable wall width in millimeters"
                      style={{
                        width: "100%",
                        minHeight: 40,
                        boxSizing: "border-box",
                        border: "1px solid #111827",
                        borderRadius: 0,
                        padding: "0 10px",
                        background: "#ffffff",
                        color: "#111827",
                        font: "inherit",
                        fontSize: 14,
                      }}
                    />
                  </label>

                  <label
                    style={{
                      display: "grid",
                      gap: 6,
                      minWidth: 0,
                      color: "#374151",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    Usable wall height (mm)
                    <input
                      type="number"
                      inputMode="numeric"
                      min="1"
                      step="1"
                      value={wallHeightMm}
                      onChange={(event) => setWallHeightMm(event.target.value)}
                      placeholder="2600"
                      aria-label="Usable wall height in millimeters"
                      style={{
                        width: "100%",
                        minHeight: 40,
                        boxSizing: "border-box",
                        border: "1px solid #111827",
                        borderRadius: 0,
                        padding: "0 10px",
                        background: "#ffffff",
                        color: "#111827",
                        font: "inherit",
                        fontSize: 14,
                      }}
                    />
                  </label>
                </div>

                <div
                  role="status"
                  aria-live="polite"
                  style={{
                    marginTop: 14,
                    paddingTop: 12,
                    borderTop: "1px solid #e5e7eb",
                  }}
                >
                  <strong
                    style={{
                      display: "block",
                      marginBottom: 5,
                      color: "#111827",
                      fontSize: 13,
                      lineHeight: 1.4,
                    }}
                  >
                    {wallFit.status === "fits"
                      ? "Fits within entered wall dimensions"
                      : wallFit.status === "does-not-fit"
                        ? "Does not fit within entered wall dimensions"
                        : wallFit.status === "unavailable"
                          ? "Fit calculation unavailable"
                          : "Enter wall dimensions to check the fit"}
                  </strong>

                  <p
                    style={{
                      margin: 0,
                      color: "#64748b",
                      fontSize: 12,
                      lineHeight: 1.6,
                    }}
                  >
                    {wallFit.message}
                  </p>

                  {wallFit.values ? (
                    <div
                      style={{
                        display: "grid",
                        gap: 8,
                        marginTop: 12,
                        color: "#374151",
                        fontSize: 12,
                        lineHeight: 1.5,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 12,
                        }}
                      >
                        <span>Entered wall width</span>

                        <strong>
                          {formatFitMm(wallFit.values.wallWidthMm)} mm
                        </strong>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 12,
                        }}
                      >
                        <span>Entered wall height</span>

                        <strong>
                          {formatFitMm(wallFit.values.wallHeightMm)} mm
                        </strong>
                      </div>

                      {wallFit.values.widthFits ? (
                        <div>
                          Centered side clearance:{" "}
                          {formatFitMm(
                            wallFit.values.leftClearanceIfCenteredMm,
                          )}{" "}
                          mm left and right.
                        </div>
                      ) : (
                        <div>
                          Excess width:{" "}
                          {formatFitMm(wallFit.values.excessWidthMm)} mm.
                        </div>
                      )}

                      {wallFit.values.heightFits ? (
                        <div>
                          Difference between wall height and furniture height:{" "}
                          {formatFitMm(wallFit.values.remainingHeightMm)} mm.
                        </div>
                      ) : (
                        <div>
                          Excess height:{" "}
                          {formatFitMm(wallFit.values.excessHeightMm)} mm.
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>

                <p
                  style={{
                    margin: "12px 0 0",
                    color: "#6b7280",
                    fontSize: 11,
                    lineHeight: 1.6,
                  }}
                >
                  This is a calculation using dimensions you entered, not a
                  measurement from your phone camera. It does not account for
                  mounting requirements, skirting, electrical outlets, doors,
                  windows, installation tolerances, or other obstructions. Check
                  those separately before installation.
                </p>
              </section>

              <div className="wisdom-ar-url-row">
                <span title={sessionUrl}>{sessionUrl}</span>
                <button type="button" onClick={copyUrl}>
                  {copied ? "Copied" : "Copy URL"}
                </button>
              </div>

              <a className="wisdom-ar-open-device-link" href={sessionUrl}>
                Open AR on This Device
              </a>

              {isLocalhost ? (
                <p className="wisdom-ar-local-note">
                  A QR code containing localhost cannot be opened on another
                  device. Use the secure WISDOM website to scan the QR code with
                  your phone.
                </p>
              ) : (
                <p className="wisdom-ar-ready-note">
                  View the furniture at its configured dimensions to see how it
                  fits in your space.
                </p>
              )}

              {/* AR PLACEMENT GUIDANCE */}
              <div
                className="wisdom-ar-prototype-note"
                role="note"
                aria-label="AR placement guidance"
              >
                <span className="wisdom-ar-prototype-icon" aria-hidden="true">
                  i
                </span>
                <p>
                  <strong>Placement guidance:</strong> For better results, use
                  good lighting and slowly move your phone to detect the floor.
                  Placement accuracy may vary depending on your device and
                  surroundings.
                </p>
              </div>

              <p className="wisdom-ar-expiry-note">
                This AR viewing link expires about 2 hours after it is created.
              </p>
            </div>
          </div>
        ) : null}
      </section>
    </div>,
    document.body,
  );
}
