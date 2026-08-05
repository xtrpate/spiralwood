import React, { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import api from "../services/api";

const money = (value) =>
  `₱ ${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const mm = (value) =>
  `${Number(value || 0).toLocaleString("en-PH", {
    maximumFractionDigits: 0,
  })} mm`;

const hasAssessmentNote = (decision = {}) =>
  Boolean(
    String(decision.reason || "").trim() ||
      String(decision.truck_type || "").trim(),
  );

const isSavedDecisionComplete = (payload = null) => {
  const assessment = payload?.assessment;
  const savedDecision = payload?.estimation?.decision || {};
  const status = String(assessment?.status || "").trim().toLowerCase();
  const decision = String(savedDecision.decision || "")
    .trim()
    .toLowerCase();

  if (status === "standard") return true;
  if (status !== "oversized") return false;

  if (
    decision === "fee_required" &&
    Number(savedDecision.additional_delivery_fee || 0) > 0 &&
    hasAssessmentNote(savedDecision)
  ) {
    return true;
  }

  return (
    decision === "no_additional_fee" &&
    Number(savedDecision.additional_delivery_fee || 0) === 0 &&
    hasAssessmentNote(savedDecision)
  );
};

export default function OversizedDeliveryEstimatorPanel({
  blueprintId,
  onGateChange,
}) {
  const [payload, setPayload] = useState(null);
  const [form, setForm] = useState({
    decision: "pending",
    additional_delivery_fee: "",
    reason: "",
    truck_type: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!blueprintId) return;

    setLoading(true);
    setError("");

    try {
      const response = await api.get(
        `/oversized-delivery/blueprints/${blueprintId}`,
      );
      const nextPayload = response.data || null;
      const savedDecision = nextPayload?.estimation?.decision || {};

      setPayload(nextPayload);
      setForm({
        decision:
          String(savedDecision.decision || "").trim() || "pending",
        additional_delivery_fee:
          Number(savedDecision.additional_delivery_fee || 0) > 0
            ? String(savedDecision.additional_delivery_fee)
            : "",
        reason: String(savedDecision.reason || ""),
        truck_type: String(savedDecision.truck_type || ""),
      });
    } catch (requestError) {
      console.error("Failed to load oversized-delivery assessment:", requestError);
      const message =
        requestError?.response?.data?.message ||
        "Unable to load the oversized-delivery assessment.";
      setError(message);
      setPayload(null);
    } finally {
      setLoading(false);
    }
  }, [blueprintId]);

  useEffect(() => {
    load();
  }, [load]);

  const gate = useMemo(() => {
    if (!blueprintId) {
      return {
        active: false,
        readyForQuote: true,
        message: "",
      };
    }

    if (loading) {
      return {
        active: true,
        readyForQuote: false,
        message:
          "Wait for the oversized-delivery assessment to finish loading.",
      };
    }

    if (error) {
      return {
        active: true,
        readyForQuote: false,
        message:
          "The delivery-size assessment could not be verified. Refresh the page before sending the quotation.",
      };
    }

    const assessmentStatus = String(
      payload?.assessment?.status || "",
    ).toLowerCase();

    if (assessmentStatus === "standard") {
      return {
        active: true,
        readyForQuote: true,
        message: "",
      };
    }

    if (
      assessmentStatus === "not_configured" ||
      assessmentStatus === "manual_review"
    ) {
      return {
        active: true,
        readyForQuote: false,
        message:
          "Complete the standard-truck limits and furniture dimensions before sending the quotation.",
      };
    }

    if (!payload?.estimation?.id) {
      return {
        active: true,
        readyForQuote: false,
        message:
          "Save the estimate draft first, then complete the oversized-delivery decision.",
      };
    }

    if (!isSavedDecisionComplete(payload)) {
      return {
        active: true,
        readyForQuote: false,
        message:
          "Complete and save the oversized-delivery fee decision before sending the quotation.",
      };
    }

    return {
      active: true,
      readyForQuote: true,
      message: "",
    };
  }, [blueprintId, error, loading, payload]);

  useEffect(() => {
    if (typeof onGateChange === "function") {
      onGateChange(gate);
    }
  }, [gate, onGateChange]);

  const assessment = payload?.assessment || null;
  const estimation = payload?.estimation || null;
  const order = payload?.order || null;
  const assessmentStatus = String(assessment?.status || "").toLowerCase();
  const estimationStatus = String(estimation?.status || "").toLowerCase();
  const readOnly = Boolean(estimation?.id && estimationStatus !== "draft");
  const savedComplete = isSavedDecisionComplete(payload);

  const saveDecision = async () => {
    if (!estimation?.id) {
      toast.error(
        "Save the estimate draft first before recording the delivery decision.",
      );
      return;
    }

    if (readOnly) {
      toast.error(
        "The quotation was already sent or finalized and can no longer be changed.",
      );
      return;
    }

    const normalizedDecision = String(form.decision || "")
      .trim()
      .toLowerCase();
    const reason = String(form.reason || "").trim();
    const truckType = String(form.truck_type || "").trim();
    const fee = Number(form.additional_delivery_fee);

    if (
      !["fee_required", "no_additional_fee"].includes(
        normalizedDecision,
      )
    ) {
      toast.error(
        "Choose an additional larger-truck fee or No additional fee required.",
      );
      return;
    }

    if (!reason && !truckType) {
      toast.error(
        "Enter a reason or truck type for the delivery assessment.",
      );
      return;
    }

    if (
      normalizedDecision === "fee_required" &&
      (!Number.isFinite(fee) || fee <= 0)
    ) {
      toast.error("Enter an additional delivery fee greater than zero.");
      return;
    }

    setSaving(true);

    try {
      const response = await api.patch(
        `/oversized-delivery/blueprints/${blueprintId}/decision`,
        {
          decision: normalizedDecision,
          additional_delivery_fee:
            normalizedDecision === "fee_required" ? fee : 0,
          reason,
          truck_type: truckType,
        },
      );

      const nextPayload = {
        ...(payload || {}),
        order: response.data?.order || order,
        assessment: response.data?.assessment || assessment,
        estimation: response.data?.estimation || estimation,
      };

      setPayload(nextPayload);

      window.dispatchEvent(
        new CustomEvent("wisdom:oversized-delivery-updated", {
          detail: {
            blueprintId: String(blueprintId),
            estimation: nextPayload?.estimation || null,
          },
        }),
      );

      const nextDecision = nextPayload?.estimation?.decision || {};
      setForm({
        decision:
          String(nextDecision.decision || "").trim() || normalizedDecision,
        additional_delivery_fee:
          Number(nextDecision.additional_delivery_fee || 0) > 0
            ? String(nextDecision.additional_delivery_fee)
            : "",
        reason: String(nextDecision.reason || reason),
        truck_type: String(nextDecision.truck_type || truckType),
      });

      toast.success(
        response.data?.message ||
          "Oversized-delivery decision saved.",
      );
    } catch (requestError) {
      console.error("Failed to save oversized-delivery decision:", requestError);
      toast.error(
        requestError?.response?.data?.message ||
          "Unable to save the oversized-delivery decision.",
      );
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={loadingCard}>
        Checking standard-truck capacity and saved furniture dimensions...
      </div>
    );
  }

  if (error) {
    return (
      <div style={errorCard}>
        <div>
          <strong>Delivery assessment unavailable</strong>
          <div style={smallText}>{error}</div>
        </div>
        <button type="button" onClick={load} style={retryButton}>
          Retry
        </button>
      </div>
    );
  }

  if (!assessment || assessmentStatus === "standard") {
    return null;
  }

  if (
    assessmentStatus === "not_configured" ||
    assessmentStatus === "manual_review"
  ) {
    return (
      <section style={blockedCard}>
        <div style={warningTitle}>
          ⚠ Delivery Size Assessment Required
        </div>
        <p style={warningText}>
          {assessmentStatus === "not_configured"
            ? "The standard truck internal width, height, and depth limits are incomplete. Enter the actual measured cargo limits under Website Maintenance → Delivery Capacity."
            : "The saved blueprint does not contain complete width, height, and depth data. Review and save the furniture dimensions before sending the quotation."}
        </p>
        <div style={blockedStatus}>
          Final quotation sending is blocked until this is resolved.
        </div>
      </section>
    );
  }

  if (assessmentStatus !== "oversized") {
    return null;
  }

  return (
    <section style={panelCard}>
      <div style={panelHeader}>
        <div>
          <div style={warningTitle}>⚠ Oversized Design</div>
          <p style={warningText}>
            Customer dimensions exceed the configured standard-truck
            limit. Assess the larger-truck arrangement before sending the
            final quotation.
          </p>
        </div>

        <div style={savedComplete ? savedBadge : pendingBadge}>
          {savedComplete ? "Decision saved" : "Pending assessment"}
        </div>
      </div>

      <div style={panelBody}>
        <div style={infoGrid}>
          <div style={infoCard}>
            <span style={infoLabel}>Order</span>
            <strong>{order?.order_number || "Linked blueprint order"}</strong>
            <span style={infoValue}>
              {order?.delivery_address || "No delivery address recorded"}
            </span>
          </div>

          <div style={infoCard}>
            <span style={infoLabel}>Pinned Location</span>
            <strong>
              {Number.isFinite(Number(order?.delivery_lat)) &&
              Number.isFinite(Number(order?.delivery_lng))
                ? `${Number(order.delivery_lat).toFixed(6)}, ${Number(
                    order.delivery_lng,
                  ).toFixed(6)}`
                : "No pinned coordinates"}
            </strong>
            <span style={infoValue}>
              Location and distance remain part of the admin fee
              assessment.
            </span>
          </div>

          <div style={infoCard}>
            <span style={infoLabel}>Standard Truck Limits</span>
            <strong>
              W {mm(assessment?.standard_truck_limits_mm?.width_mm)} · H{" "}
              {mm(assessment?.standard_truck_limits_mm?.height_mm)} · D{" "}
              {mm(assessment?.standard_truck_limits_mm?.depth_mm)}
            </strong>
            <span style={infoValue}>Configured usable cargo dimensions</span>
          </div>
        </div>

        {Array.isArray(assessment?.items) && assessment.items.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={subHeading}>Furniture dimensions</div>
            <div style={itemList}>
              {assessment.items.map((item) => (
                <div
                  key={item.order_item_id || item.product_name}
                  style={itemRow}
                >
                  <strong>{item.product_name || "Custom Furniture"}</strong>
                  <span>
                    W {mm(item?.dimensions_mm?.width_mm)} · H{" "}
                    {mm(item?.dimensions_mm?.height_mm)} · D{" "}
                    {mm(item?.dimensions_mm?.depth_mm)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {Array.isArray(assessment?.exceeded_dimensions) &&
          assessment.exceeded_dimensions.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={subHeading}>Exceeded dimensions</div>
              <div style={exceededGrid}>
                {assessment.exceeded_dimensions.map((entry, index) => (
                  <div
                    key={`${entry.key || entry.label}-${index}`}
                    style={exceededCard}
                  >
                    <strong>{entry.label || entry.key}</strong>
                    <span>Actual: {mm(entry.actual_mm)}</span>
                    <span>Limit: {mm(entry.limit_mm)}</span>
                    <span style={{ color: "#b45309", fontWeight: 800 }}>
                      Over by {mm(entry.excess_mm)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

        {!estimation?.id ? (
          <div style={draftRequiredBox}>
            Save the estimation draft first. The delivery decision and
            additional fee can only be attached to a saved draft.
          </div>
        ) : (
          <div style={formSection}>
            <div style={subHeading}>Admin delivery decision</div>

            <div style={fieldGrid}>
              <div style={{ gridColumn: "1 / -1" }}>
                <label style={label}>Decision</label>
                <select
                  value={form.decision}
                  onChange={(event) =>
                    !readOnly &&
                    setForm((current) => ({
                      ...current,
                      decision: event.target.value,
                      additional_delivery_fee:
                        event.target.value === "fee_required"
                          ? current.additional_delivery_fee
                          : "",
                    }))
                  }
                  disabled={readOnly}
                  style={{
                    ...input,
                    ...(readOnly ? disabledInput : {}),
                  }}
                >
                  <option value="pending">Pending admin assessment</option>
                  <option value="fee_required">
                    Larger truck — additional fee required
                  </option>
                  <option value="no_additional_fee">
                    No additional fee required
                  </option>
                </select>
              </div>

              {form.decision === "fee_required" && (
                <div>
                  <label style={label}>
                    Additional Delivery Fee (₱)
                  </label>
                  <input
                    type="number"
                    min="0.01"
                    max="1000000"
                    step="0.01"
                    value={form.additional_delivery_fee}
                    onChange={(event) =>
                      !readOnly &&
                      setForm((current) => ({
                        ...current,
                        additional_delivery_fee: event.target.value,
                      }))
                    }
                    disabled={readOnly}
                    style={{
                      ...input,
                      ...(readOnly ? disabledInput : {}),
                    }}
                    placeholder="0.00"
                  />
                </div>
              )}

              <div>
                <label style={label}>Truck Type / Arrangement</label>
                <input
                  value={form.truck_type}
                  maxLength={100}
                  onChange={(event) =>
                    !readOnly &&
                    setForm((current) => ({
                      ...current,
                      truck_type: event.target.value,
                    }))
                  }
                  disabled={readOnly}
                  style={{
                    ...input,
                    ...(readOnly ? disabledInput : {}),
                  }}
                  placeholder="e.g. 14-ft truck, third-party larger truck"
                />
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={label}>Reason / Assessment Note</label>
                <textarea
                  rows={3}
                  maxLength={500}
                  value={form.reason}
                  onChange={(event) =>
                    !readOnly &&
                    setForm((current) => ({
                      ...current,
                      reason: event.target.value,
                    }))
                  }
                  disabled={readOnly}
                  style={{
                    ...input,
                    resize: "vertical",
                    ...(readOnly ? disabledInput : {}),
                  }}
                  placeholder="Explain why a larger truck is needed, or why no additional fee is required."
                />
              </div>
            </div>

            <div style={decisionFooter}>
              <div style={decisionSummary}>
                {form.decision === "fee_required"
                  ? `Quotation delivery addition: ${money(
                      form.additional_delivery_fee,
                    )}`
                  : form.decision === "no_additional_fee"
                    ? "No additional delivery fee will be added."
                    : "Additional delivery fee: Pending admin assessment"}
              </div>

              <button
                type="button"
                onClick={saveDecision}
                disabled={saving || readOnly}
                style={{
                  ...saveButton,
                  ...(saving || readOnly ? disabledButton : {}),
                }}
              >
                {saving ? "Saving..." : "Save Delivery Decision"}
              </button>
            </div>

            {readOnly && (
              <div style={lockedNote}>
                The quotation was already sent or finalized. This
                oversized-delivery decision is locked.
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

const panelCard = {
  maxWidth: 1180,
  margin: "0 auto 20px",
  background: "#fff",
  border: "1px solid #f59e0b",
  borderRadius: 16,
  overflow: "hidden",
  boxShadow: "0 1px 2px rgba(0,0,0,.03)",
};

const panelHeader = {
  padding: "18px 22px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "flex-start",
  gap: 16,
  background: "#fffbeb",
  borderBottom: "1px solid #fde68a",
};

const panelBody = {
  padding: 22,
};

const warningTitle = {
  fontSize: 15,
  fontWeight: 900,
  color: "#92400e",
  letterSpacing: "0.02em",
};

const warningText = {
  margin: "6px 0 0",
  fontSize: 12,
  lineHeight: 1.55,
  color: "#78350f",
  maxWidth: 760,
};

const savedBadge = {
  flexShrink: 0,
  padding: "7px 11px",
  borderRadius: 999,
  background: "#dcfce7",
  border: "1px solid #bbf7d0",
  color: "#166534",
  fontSize: 11,
  fontWeight: 800,
};

const pendingBadge = {
  ...savedBadge,
  background: "#fef3c7",
  border: "1px solid #fde68a",
  color: "#92400e",
};

const infoGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
};

const infoCard = {
  padding: 14,
  border: "1px solid #e4e4e7",
  borderRadius: 12,
  background: "#fafafa",
  display: "grid",
  gap: 6,
};

const infoLabel = {
  fontSize: 10,
  fontWeight: 800,
  color: "#71717a",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

const infoValue = {
  fontSize: 11,
  lineHeight: 1.45,
  color: "#71717a",
};

const subHeading = {
  fontSize: 12,
  fontWeight: 900,
  color: "#18181b",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: 8,
};

const itemList = {
  display: "grid",
  gap: 8,
};

const itemRow = {
  padding: "10px 12px",
  border: "1px solid #e4e4e7",
  borderRadius: 10,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
  fontSize: 12,
  color: "#52525b",
};

const exceededGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
  gap: 10,
};

const exceededCard = {
  padding: 12,
  border: "1px solid #fde68a",
  borderRadius: 10,
  background: "#fffbeb",
  display: "grid",
  gap: 4,
  fontSize: 11,
  color: "#78350f",
};

const formSection = {
  marginTop: 18,
  paddingTop: 18,
  borderTop: "1px solid #e4e4e7",
};

const fieldGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 14,
};

const label = {
  display: "block",
  marginBottom: 7,
  fontSize: 12,
  fontWeight: 800,
  color: "#18181b",
};

const input = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #d4d4d8",
  borderRadius: 8,
  boxSizing: "border-box",
  fontSize: 13,
  color: "#18181b",
  background: "#fff",
  outline: "none",
};

const disabledInput = {
  background: "#f4f4f5",
  color: "#71717a",
  cursor: "not-allowed",
};

const decisionFooter = {
  marginTop: 16,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 14,
  flexWrap: "wrap",
};

const decisionSummary = {
  fontSize: 12,
  fontWeight: 800,
  color: "#78350f",
};

const saveButton = {
  padding: "10px 16px",
  border: "1px solid #18181b",
  borderRadius: 8,
  background: "#18181b",
  color: "#fff",
  fontSize: 12,
  fontWeight: 800,
  cursor: "pointer",
};

const disabledButton = {
  opacity: 0.6,
  cursor: "not-allowed",
};

const draftRequiredBox = {
  marginTop: 16,
  padding: "12px 14px",
  border: "1px solid #fde68a",
  borderRadius: 10,
  background: "#fffbeb",
  color: "#92400e",
  fontSize: 12,
  fontWeight: 700,
  lineHeight: 1.5,
};

const lockedNote = {
  marginTop: 12,
  padding: "10px 12px",
  borderRadius: 8,
  background: "#f4f4f5",
  color: "#52525b",
  fontSize: 11,
};

const loadingCard = {
  maxWidth: 1180,
  margin: "0 auto 20px",
  padding: "14px 16px",
  borderRadius: 12,
  border: "1px solid #e4e4e7",
  background: "#fff",
  color: "#71717a",
  fontSize: 12,
  fontWeight: 700,
};

const errorCard = {
  ...loadingCard,
  border: "1px solid #fecaca",
  background: "#fef2f2",
  color: "#991b1b",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 12,
};

const smallText = {
  marginTop: 4,
  fontSize: 11,
  lineHeight: 1.45,
};

const retryButton = {
  padding: "8px 12px",
  border: "1px solid #991b1b",
  borderRadius: 7,
  background: "#fff",
  color: "#991b1b",
  fontSize: 11,
  fontWeight: 800,
  cursor: "pointer",
};

const blockedCard = {
  ...panelCard,
  padding: 18,
  border: "1px solid #fca5a5",
  background: "#fef2f2",
};

const blockedStatus = {
  marginTop: 10,
  fontSize: 12,
  fontWeight: 900,
  color: "#991b1b",
};
