import React from "react";

const formatMm = (value) =>
  `${Number(value || 0).toLocaleString()} mm`;

export default function OversizedDeliveryWarning({
  assessment,
  compact = false,
}) {
  if (!assessment || assessment.status !== "oversized") {
    return null;
  }

  const exceeded = Array.isArray(assessment.exceeded_dimensions)
    ? assessment.exceeded_dimensions
    : [];

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        border: "1px solid #f59e0b",
        background: "#fffbeb",
        padding: compact ? 10 : 12,
        display: "grid",
        gap: 8,
      }}
    >
      <div
        style={{
          color: "#92400e",
          fontSize: compact ? 11 : 12,
          fontWeight: 900,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        }}
      >
        Delivery notice
      </div>

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
  );
}
