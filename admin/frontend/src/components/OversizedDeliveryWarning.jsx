import React, { useState } from "react";

const formatMm = (value) =>
  `${Number(value || 0).toLocaleString()} mm`;

export default function OversizedDeliveryWarning({
  assessment,
  compact = false,
}) {
  /* WISDOM DELIVERY NOTICE DEFAULT OPEN BATCH 1 STABLE V1.4.5
     Show the warning immediately; customer may minimize and reopen it. */
  const [compactExpanded, setCompactExpanded] = useState(true);

  if (!assessment || assessment.status !== "oversized") {
    return null;
  }

  const exceeded = Array.isArray(assessment.exceeded_dimensions)
    ? assessment.exceeded_dimensions
    : [];

  const showDetails = !compact || compactExpanded;

  return (
    <div
      style={{
        border: "1px solid #f59e0b",
        background: "#fffbeb",
        padding: compact ? 10 : 12,
        display: "grid",
        gap: showDetails ? 8 : 0,
      }}
    >
      {compact ? (
        <button
          type="button"
          onClick={() => setCompactExpanded((current) => !current)}
          aria-expanded={compactExpanded}
          aria-label={
            compactExpanded
              ? "Minimize delivery notice"
              : "Show delivery notice details"
          }
          style={{
            width: "100%",
            minHeight: 24,
            padding: 0,
            border: 0,
            background: "transparent",
            color: "#92400e",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            font: "inherit",
            fontSize: 11,
            fontWeight: 900,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            textAlign: "left",
            cursor: "pointer",
          }}
        >
          <span>Delivery notice</span>
          <span
            aria-hidden="true"
            style={{
              flex: "0 0 auto",
              minWidth: 18,
              textAlign: "center",
              fontSize: 16,
              lineHeight: 1,
              fontWeight: 700,
              letterSpacing: 0,
            }}
          >
            {compactExpanded ? "−" : "+"}
          </span>
        </button>
      ) : (
        <div
          role="status"
          aria-live="polite"
          style={{
            color: "#92400e",
            fontSize: 12,
            fontWeight: 900,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
          }}
        >
          Delivery notice
        </div>
      )}

      {showDetails ? (
        <div
          role={compact ? "status" : undefined}
          aria-live={compact ? "polite" : undefined}
          style={{ display: "grid", gap: 8 }}
        >
          <div
            style={{
              color: "#78350f",
              fontSize: compact ? 11 : 12,
              lineHeight: 1.55,
            }}
          >
            This furniture is larger than our standard truck limit. A larger
            truck may be needed. We will check the delivery and tell you if there
            is an extra fee.
          </div>

          {exceeded.length > 0 ? (
            <div
              style={{
                display: "grid",
                gap: 4,
                paddingTop: 2,
              }}
            >
              {exceeded.map((item) => (
                <div
                  key={item.key}
                  style={{
                    color: "#92400e",
                    fontSize: compact ? 10 : 11,
                    fontWeight: 700,
                  }}
                >
                  {item.label}: {formatMm(item.actual_mm)}
                  {" · "}Truck limit: {formatMm(item.limit_mm)}
                  {" · "}Over by: {formatMm(item.excess_mm)}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
