import React, { useCallback, useEffect, useMemo, useState } from "react";
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


const buildDraftDecision = (form = {}, assessment = null) => {
  const assessmentStatus = String(assessment?.status || "")
    .trim()
    .toLowerCase();
  const decision = String(form.decision || "")
    .trim()
    .toLowerCase();
  const reason = String(form.reason || "").trim();
  const truckType = String(form.truck_type || "").trim();
  const parsedFee = Number(form.additional_delivery_fee);
  const additionalDeliveryFee =
    decision === "fee_required" && Number.isFinite(parsedFee)
      ? Math.max(0, parsedFee)
      : 0;

  const complete =
    assessmentStatus === "standard" ||
    (assessmentStatus === "oversized" &&
      ["fee_required", "no_additional_fee"].includes(decision) &&
      Boolean(reason || truckType) &&
      (decision !== "fee_required" || additionalDeliveryFee > 0));

  return {
    assessment_status: assessmentStatus,
    decision,
    additional_delivery_fee: additionalDeliveryFee,
    reason,
    truck_type: truckType,
    complete,
  };
};

const isDraftSameAsSaved = (draft = {}, saved = {}) => {
  const savedDecision = String(saved.decision || "")
    .trim()
    .toLowerCase();
  const savedFee =
    savedDecision === "fee_required"
      ? Math.max(0, Number(saved.additional_delivery_fee || 0))
      : 0;

  return (
    String(draft.decision || "").trim().toLowerCase() === savedDecision &&
    Number(draft.additional_delivery_fee || 0) === savedFee &&
    String(draft.reason || "").trim() ===
      String(saved.reason || "").trim() &&
    String(draft.truck_type || "").trim() ===
      String(saved.truck_type || "").trim()
  );
};

const getDraftStorageKey = (blueprintId) =>
  `wisdom_oversized_delivery_draft:${blueprintId}`;

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
  const [error, setError] = useState("");
  const [notApplicable, setNotApplicable] = useState(false);

  const load = useCallback(async () => {
    if (!blueprintId) return;

    setLoading(true);
    setError("");
    setNotApplicable(false);

    try {
      const response = await api.get(
        `/oversized-delivery/blueprints/${blueprintId}`,
      );
      const nextPayload = response.data || null;
      const savedDecision = nextPayload?.estimation?.decision || {};

      setNotApplicable(false);
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
      const statusCode = Number(requestError?.response?.status || 0);
      const message =
        requestError?.response?.data?.message ||
        "Unable to load the oversized-delivery assessment.";
      const isExpectedNoLinkedOrder =
        statusCode === 404 &&
        String(message).trim() ===
          "No customer order is currently linked to this blueprint.";

      if (isExpectedNoLinkedOrder) {
        setNotApplicable(true);
        setError("");
        setPayload(null);

        try {
          window.sessionStorage.removeItem(
            getDraftStorageKey(blueprintId),
          );
        } catch {
          // Nothing else is required when storage is unavailable.
        }

        window.dispatchEvent(
          new CustomEvent(
            "wisdom:oversized-delivery-draft-changed",
            {
              detail: {
                blueprintId: String(blueprintId),
                oversized_delivery: null,
              },
            },
          ),
        );
      } else {
        console.error(
          "Failed to load oversized-delivery assessment:",
          requestError,
        );
        setNotApplicable(false);
        setError(message);
        setPayload(null);
      }
    } finally {
      setLoading(false);
    }
  }, [blueprintId]);

  useEffect(() => {
    load();
  }, [load]);

  const assessment = payload?.assessment || null;
  const estimation = payload?.estimation || null;
  const order = payload?.order || null;
  const assessmentStatus = String(assessment?.status || "").toLowerCase();
  const estimationStatus = String(estimation?.status || "").toLowerCase();
  const readOnly = Boolean(estimation?.id && estimationStatus !== "draft");
  const savedComplete = isSavedDecisionComplete(payload);

  const draftDecision = useMemo(
    () => buildDraftDecision(form, assessment),
    [assessment, form],
  );
  const draftComplete = Boolean(draftDecision.complete);
  const draftMatchesSaved = useMemo(
    () =>
      Boolean(
        savedComplete &&
          isDraftSameAsSaved(
            draftDecision,
            estimation?.decision || {},
          ),
      ),
    [draftDecision, estimation, savedComplete],
  );

  useEffect(() => {
    if (!blueprintId || notApplicable) return;

    const detail = {
      blueprintId: String(blueprintId),
      oversized_delivery: draftDecision,
    };

    try {
      window.sessionStorage.setItem(
        getDraftStorageKey(blueprintId),
        JSON.stringify(draftDecision),
      );
    } catch {
      // The custom event still keeps the estimation page synchronized.
    }

    window.dispatchEvent(
      new CustomEvent("wisdom:oversized-delivery-draft-changed", {
        detail,
      }),
    );
  }, [blueprintId, draftDecision, notApplicable]);

  useEffect(() => {
    const handleEstimationSaved = (event) => {
      if (
        String(event?.detail?.blueprintId || "") ===
        String(blueprintId || "")
      ) {
        load();
      }
    };

    window.addEventListener(
      "wisdom:estimation-saved",
      handleEstimationSaved,
    );

    return () => {
      window.removeEventListener(
        "wisdom:estimation-saved",
        handleEstimationSaved,
      );
    };
  }, [blueprintId, load]);

  const gate = useMemo(() => {
    if (!blueprintId) {
      return {
        active: false,
        readyForQuote: true,
        message: "",
      };
    }

    if (notApplicable) {
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

    if (!draftComplete) {
      return {
        active: true,
        readyForQuote: false,
        message:
          "Complete the oversized-delivery decision, then click Save Estimate.",
      };
    }

    if (!payload?.estimation?.id) {
      return {
        active: true,
        readyForQuote: false,
        message:
          "Click Save Estimate to save the quotation and delivery fee together.",
      };
    }

    if (!isSavedDecisionComplete(payload) || !draftMatchesSaved) {
      return {
        active: true,
        readyForQuote: false,
        message:
          "Save the estimate to apply the oversized-delivery decision before sending the quotation.",
      };
    }

    return {
      active: true,
      readyForQuote: true,
      message: "",
    };
  }, [
    blueprintId,
    draftComplete,
    draftMatchesSaved,
    error,
    loading,
    notApplicable,
    payload,
  ]);

  useEffect(() => {
    if (typeof onGateChange === "function") {
      onGateChange(gate);
    }
  }, [gate, onGateChange]);


  if (notApplicable) {
    return null;
  }

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
          Delivery Capacity Review Required
        </div>
        <p style={warningText}>
          {assessmentStatus === "not_configured"
            ? "The standard truck capacity is incomplete. Enter the usable internal width, height, and depth under Website Maintenance → Delivery Capacity."
            : "The blueprint does not contain complete furniture dimensions. Review and save the width, height, and depth before sending the quotation."}
        </p>
        <div style={blockedStatus}>
          Resolve this requirement before sending the quotation.
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
          <div style={warningTitle}>Oversized Delivery Review</div>
          <p style={warningText}>
            The furniture exceeds the standard truck capacity. Review the delivery arrangement and confirm any additional fee before sending the quotation.
          </p>
        </div>

        <div
          style={
            draftMatchesSaved
              ? savedBadge
              : draftComplete
                ? readyBadge
                : pendingBadge
          }
        >
          {draftMatchesSaved
            ? "Decision saved"
            : draftComplete
              ? "Ready to save"
              : "Pending assessment"}
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
            <span style={infoLabel}>Delivery Location</span>
            <strong>
              {Number.isFinite(Number(order?.delivery_lat)) &&
              Number.isFinite(Number(order?.delivery_lng))
                ? `${Number(order.delivery_lat).toFixed(6)}, ${Number(
                    order.delivery_lng,
                  ).toFixed(6)}`
                : "No pinned coordinates"}
            </strong>
            <span style={infoValue}>
              Use the saved location when assessing distance and delivery requirements.
            </span>
          </div>

          <div style={infoCard}>
            <span style={infoLabel}>Standard Truck Capacity</span>
            <strong>
              W {mm(assessment?.standard_truck_limits_mm?.width_mm)} · H{" "}
              {mm(assessment?.standard_truck_limits_mm?.height_mm)} · D{" "}
              {mm(assessment?.standard_truck_limits_mm?.depth_mm)}
            </strong>
            <span style={infoValue}>Usable internal cargo dimensions</span>
          </div>
        </div>

        {Array.isArray(assessment?.items) && assessment.items.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={subHeading}>Furniture Dimensions</div>
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
              <div style={subHeading}>Capacity Exceeded</div>
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

        <div style={formSection}>
            <div style={subHeading}>Delivery Decision</div>

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
                  <option value="pending">Select a delivery decision</option>
                  <option value="fee_required">
                    Larger truck required
                  </option>
                  <option value="no_additional_fee">
                    No additional fee required
                  </option>
                </select>
              </div>

              {form.decision === "fee_required" && (
                <div>
                  <label style={label}>Additional Delivery Fee</label>
                  <div style={moneyInputWrap}>
                    <span style={moneyPrefix}>₱</span>
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
                        ...moneyInput,
                        ...(readOnly ? disabledInput : {}),
                      }}
                      placeholder="0.00"
                    />
                  </div>
                </div>
              )}

              <div>
                <label style={label}>Delivery Arrangement</label>
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
                  placeholder="e.g. 14-foot truck or third-party delivery vehicle"
                />
              </div>

              <div style={{ gridColumn: "1 / -1" }}>
                <label style={label}>Assessment Notes</label>
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
                  placeholder="Describe the delivery requirement and explain the fee decision."
                />
              </div>
            </div>

            <div style={decisionFooter}>
              <div style={decisionSummaryCard}>
                <span style={decisionSummaryLabel}>Quotation Impact</span>
                <strong style={decisionSummary}>
                  {form.decision === "fee_required"
                    ? money(form.additional_delivery_fee)
                    : form.decision === "no_additional_fee"
                      ? "No additional charge"
                      : "Pending decision"}
                </strong>
              </div>

              <div style={saveTogetherNote}>
                <strong style={saveTogetherTitle}>Saved with the estimate</strong>
                <span>
                  {readOnly
                    ? "This delivery decision is locked because the quotation has already been sent or finalized."
                    : estimation?.id
                      ? "Changes to the delivery decision will be saved when you click Save Estimate."
                      : "The estimate and delivery decision will be created together when you click Save Estimate."}
                </span>
              </div>
            </div>

          </div>
      </div>
    </section>
  );
}

const panelCard = {
  maxWidth: 1240,
  margin: "0 auto 24px",
  background: "#fff",
  border: "1px solid #e4e4e7",
  borderTop: "4px solid #d97706",
  borderRadius: 16,
  overflow: "hidden",
  boxShadow: "0 10px 30px rgba(24,24,27,.05)",
};

const panelHeader = {
  padding: "20px 24px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 18,
  flexWrap: "wrap",
  background: "#fff",
  borderBottom: "1px solid #e4e4e7",
};

const panelBody = {
  padding: 24,
  background: "#fafafa",
};

const warningTitle = {
  fontSize: 17,
  fontWeight: 850,
  color: "#18181b",
  letterSpacing: "-0.01em",
};

const warningText = {
  margin: "6px 0 0",
  fontSize: 13,
  lineHeight: 1.55,
  color: "#52525b",
  maxWidth: 780,
};

const savedBadge = {
  flexShrink: 0,
  padding: "7px 12px",
  borderRadius: 999,
  background: "#ecfdf3",
  border: "1px solid #bbf7d0",
  color: "#166534",
  fontSize: 11,
  fontWeight: 800,
};

const pendingBadge = {
  ...savedBadge,
  background: "#fffbeb",
  border: "1px solid #fde68a",
  color: "#92400e",
};

const readyBadge = {
  ...savedBadge,
  background: "#eff6ff",
  border: "1px solid #bfdbfe",
  color: "#1d4ed8",
};

const infoGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: 12,
};

const infoCard = {
  padding: "16px 18px",
  border: "1px solid #e4e4e7",
  borderRadius: 12,
  background: "#fff",
  display: "grid",
  gap: 7,
  minHeight: 88,
  boxShadow: "0 1px 2px rgba(24,24,27,.03)",
};

const infoLabel = {
  fontSize: 10,
  fontWeight: 800,
  color: "#71717a",
  textTransform: "uppercase",
  letterSpacing: "0.1em",
};

const infoValue = {
  fontSize: 11,
  lineHeight: 1.45,
  color: "#71717a",
};

const subHeading = {
  fontSize: 11,
  fontWeight: 850,
  color: "#52525b",
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  marginBottom: 10,
};

const itemList = {
  display: "grid",
  gap: 8,
};

const itemRow = {
  padding: "11px 14px",
  border: "1px solid #e4e4e7",
  borderRadius: 10,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 10,
  fontSize: 12,
  color: "#52525b",
  background: "#fff",
};

const exceededGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: 10,
};

const exceededCard = {
  padding: "14px 16px",
  border: "1px solid #fcd34d",
  borderRadius: 10,
  background: "#fffbeb",
  display: "grid",
  gap: 5,
  fontSize: 11,
  color: "#78350f",
};

const formSection = {
  marginTop: 20,
  padding: 20,
  border: "1px solid #e4e4e7",
  borderRadius: 14,
  background: "#fff",
  boxShadow: "0 1px 2px rgba(24,24,27,.03)",
};

const fieldGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
  gap: 16,
};

const label = {
  display: "block",
  marginBottom: 7,
  fontSize: 12,
  fontWeight: 800,
  color: "#27272a",
};

const input = {
  width: "100%",
  minHeight: 42,
  padding: "10px 12px",
  border: "1px solid #d4d4d8",
  borderRadius: 9,
  boxSizing: "border-box",
  fontSize: 13,
  color: "#18181b",
  background: "#fff",
  outline: "none",
};

const moneyInputWrap = {
  position: "relative",
};

const moneyPrefix = {
  position: "absolute",
  left: 13,
  top: "50%",
  transform: "translateY(-50%)",
  color: "#71717a",
  fontSize: 13,
  fontWeight: 800,
  zIndex: 1,
};

const moneyInput = {
  paddingLeft: 32,
};

const disabledInput = {
  background: "#f4f4f5",
  color: "#71717a",
  cursor: "not-allowed",
};

const decisionFooter = {
  marginTop: 18,
  paddingTop: 18,
  borderTop: "1px solid #e4e4e7",
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 12,
};

const decisionSummaryCard = {
  padding: "12px 14px",
  border: "1px solid #fde68a",
  borderRadius: 10,
  background: "#fffbeb",
  display: "grid",
  gap: 4,
};

const decisionSummaryLabel = {
  fontSize: 10,
  fontWeight: 800,
  color: "#92400e",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

const decisionSummary = {
  fontSize: 14,
  fontWeight: 850,
  color: "#78350f",
};

const saveTogetherNote = {
  padding: "12px 14px",
  border: "1px solid #dbeafe",
  borderRadius: 10,
  background: "#f8fbff",
  color: "#334155",
  fontSize: 11,
  fontWeight: 600,
  lineHeight: 1.5,
  display: "grid",
  gap: 3,
};

const saveTogetherTitle = {
  color: "#1e3a8a",
  fontSize: 11,
  fontWeight: 850,
};

const loadingCard = {
  maxWidth: 1240,
  margin: "0 auto 24px",
  padding: "16px 18px",
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
  borderRadius: 8,
  background: "#fff",
  color: "#991b1b",
  fontSize: 11,
  fontWeight: 800,
  cursor: "pointer",
};

const blockedCard = {
  ...panelCard,
  padding: 20,
  border: "1px solid #fecaca",
  borderTop: "4px solid #dc2626",
  background: "#fff",
};

const blockedStatus = {
  marginTop: 12,
  padding: "10px 12px",
  borderRadius: 8,
  background: "#fef2f2",
  fontSize: 12,
  fontWeight: 850,
  color: "#991b1b",
};
