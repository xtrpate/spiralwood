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
  Boolean(String(decision.reason || "").trim());

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
    Number.isFinite(Number(savedDecision.additional_delivery_fee)) &&
    Number(savedDecision.additional_delivery_fee) >= 0 &&
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
  const feeText = String(form.additional_delivery_fee ?? "").trim();
  const parsedFee = feeText === "" ? Number.NaN : Number(feeText);
  const feeIsValid =
    feeText !== "" &&
    Number.isFinite(parsedFee) &&
    parsedFee >= 0 &&
    parsedFee <= 1000000;
  const additionalDeliveryFee =
    decision === "fee_required" && feeIsValid
      ? Number(parsedFee.toFixed(2))
      : 0;

  const complete =
    assessmentStatus === "standard" ||
    (assessmentStatus === "oversized" &&
      ["fee_required", "no_additional_fee"].includes(decision) &&
      Boolean(reason) &&
      (decision !== "fee_required" || feeIsValid));

  return {
    assessment_status: assessmentStatus,
    decision,
    additional_delivery_fee: additionalDeliveryFee,
    reason,
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
      String(saved.reason || "").trim()
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
        reason: String(
          savedDecision.reason || savedDecision.truck_type || "",
        ),
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
  const assessmentItems = Array.isArray(assessment?.items)
    ? assessment.items
    : [];
  const totalOrderedUnits = assessmentItems.reduce(
    (sum, item) => sum + Math.max(1, Number(item?.quantity || 1)),
    0,
  );
  const quantityCapacityItems = assessmentItems.filter(
    (item) => Boolean(item?.quantity_exceeds_capacity),
  );
  const hasQuantityCapacityIssue = quantityCapacityItems.length > 0;
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
          "Complete the oversized-delivery decision, then save the estimate.",
      };
    }

    if (!payload?.estimation?.id) {
      return {
        active: true,
        readyForQuote: false,
        message:
          "Save the estimate to save the quotation and delivery fee together.",
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
      onGateChange({
        ...gate,
        dirty: Boolean(
          payload?.estimation?.id &&
            assessmentStatus === "oversized" &&
            !draftMatchesSaved
        ),
      });
    }
  }, [
    assessmentStatus,
    draftMatchesSaved,
    gate,
    onGateChange,
    payload?.estimation?.id,
  ]);


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

  if (!assessment) {
    return null;
  }

  if (assessmentStatus === "standard") {
    return (
      <section style={panelCard}>
        <div style={panelHeader}>
          <div>
            <div style={warningTitle}>Delivery Capacity</div>
            <p style={warningText}>
              {totalOrderedUnits > 1
                ? "The ordered quantity fits within the estimated standard truck capacity. No additional delivery fee is required."
                : "This design fits within the standard truck capacity. No additional delivery fee is required."}
            </p>
          </div>
          <div style={savedBadge}>Standard fit</div>
        </div>

        <div style={panelBody}>
          <div style={infoGrid}>
            <div style={infoCard}>
              <span style={infoLabel}>Order</span>
              <strong>{order?.order_number || "Linked Blueprint order"}</strong>
              <span style={infoValue}>{order?.delivery_address || "No delivery address recorded"}</span>
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

            {totalOrderedUnits > 1 &&
            Number(assessmentItems[0]?.estimated_standard_truck_capacity_units) >
              0 ? (
              <div style={infoCard}>
                <span style={infoLabel}>Order Quantity</span>
                <strong>
                  {totalOrderedUnits} unit{totalOrderedUnits !== 1 ? "s" : ""}
                </strong>
                <span style={infoValue}>
                  Estimated standard capacity:{" "}
                  {assessmentItems[0].estimated_standard_truck_capacity_units}{" "}
                  unit
                  {Number(
                    assessmentItems[0].estimated_standard_truck_capacity_units,
                  ) !== 1
                    ? "s"
                    : ""}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </section>
    );
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
          <div style={warningTitle}>Delivery Capacity Review</div>
          <p style={warningText}>
            {hasQuantityCapacityIssue
              ? "The ordered quantity exceeds the estimated standard truck capacity. Review the delivery requirements and any additional fee before sending the quotation."
              : "This design exceeds the standard truck capacity. Review the delivery requirements and any additional fee before sending the quotation."}
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
                  <strong>
                    {item.product_name || "Custom Furniture"} · Qty{" "}
                    {Math.max(1, Number(item.quantity || 1))}
                  </strong>
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

        {quantityCapacityItems.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div style={subHeading}>Quantity Capacity</div>
            <div style={exceededGrid}>
              {quantityCapacityItems.map((item) => (
                <div
                  key={`quantity-${item.order_item_id || item.product_name}`}
                  style={exceededCard}
                >
                  <strong>{item.product_name || "Custom Furniture"}</strong>
                  <span>
                    Ordered: {Math.max(1, Number(item.quantity || 1))} units
                  </span>
                  <span>
                    Estimated standard capacity:{" "}
                    {Math.max(
                      0,
                      Number(
                        item.estimated_standard_truck_capacity_units || 0,
                      ),
                    )}{" "}
                    units
                  </span>
                  <span style={{ color: "#b45309", fontWeight: 700 }}>
                    Over by{" "}
                    {Math.max(0, Number(item.quantity_excess_units || 0))} units
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {Array.isArray(assessment?.exceeded_dimensions) &&
          assessment.exceeded_dimensions.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={subHeading}>Truck Limit Exceeded</div>
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
              <div style={{ width: "100%", maxWidth: 520 }}>
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
                <div style={{ width: "100%", maxWidth: 260 }}>
                  <label style={label}>Additional Delivery Fee</label>
                  <div style={moneyInputWrap}>
                    <span style={moneyPrefix}>₱</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={form.additional_delivery_fee}
                      onChange={(event) => {
                        if (readOnly) return;

                        const nextValue = event.target.value;
                        if (!/^\d*(?:\.\d{0,2})?$/.test(nextValue)) {
                          return;
                        }

                        const numericValue =
                          nextValue === "" ? 0 : Number(nextValue);

                        if (
                          !Number.isFinite(numericValue) ||
                          numericValue < 0 ||
                          numericValue > 1000000
                        ) {
                          return;
                        }

                        setForm((current) => ({
                          ...current,
                          additional_delivery_fee: nextValue,
                        }));
                      }}
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

              <div
                style={{
                  gridColumn: "1 / -1",
                  width: "100%",
                  maxWidth: 760,
                }}
              >
                <label style={label}>Assessment Notes</label>
                <textarea
                  rows={2}
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
                  placeholder="Describe the delivery requirement, vehicle needs if any, and explain the fee decision."
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
                      ? "Changes to the delivery decision will be saved with the estimate."
                      : "The estimate and delivery decision will be created together when you save."}
                </span>
              </div>
            </div>

          </div>
      </div>
    </section>
  );
}

const panelCard = {
  width: "100%",
  maxWidth: "none",
  margin: "0 0 20px",
  background: "#ffffff",
  border: "1px solid #d9d9dc",
  borderRadius: 6,
  overflow: "hidden",
  boxShadow: "none",
  fontFamily: "inherit",
};

const panelHeader = {
  padding: "18px 20px",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 16,
  flexWrap: "wrap",
  background: "#ffffff",
  borderBottom: "1px solid #e5e5e7",
};

const panelBody = {
  padding: 20,
  background: "#ffffff",
};

const warningTitle = {
  fontSize: 16,
  fontWeight: 700,
  color: "#18181b",
  letterSpacing: 0,
};

const warningText = {
  margin: "5px 0 0",
  fontSize: 12.5,
  fontWeight: 400,
  lineHeight: 1.55,
  color: "#66666b",
  maxWidth: 780,
};

const savedBadge = {
  flexShrink: 0,
  padding: "6px 10px",
  borderRadius: 4,
  background: "#f0fdf4",
  border: "1px solid #bbf7d0",
  color: "#166534",
  fontSize: 11,
  fontWeight: 600,
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
  padding: "15px 16px",
  border: "1px solid #e1e1e4",
  borderRadius: 4,
  background: "#ffffff",
  display: "grid",
  gap: 6,
  minHeight: 84,
  boxShadow: "none",
};

const infoLabel = {
  fontSize: 10,
  fontWeight: 600,
  color: "#73737a",
  textTransform: "uppercase",
  letterSpacing: "0.07em",
};

const infoValue = {
  fontSize: 11,
  fontWeight: 400,
  lineHeight: 1.45,
  color: "#73737a",
};

const subHeading = {
  fontSize: 11,
  fontWeight: 650,
  color: "#52525b",
  textTransform: "uppercase",
  letterSpacing: "0.07em",
  marginBottom: 9,
};

const itemList = {
  display: "grid",
  gap: 8,
};

const itemRow = {
  padding: "11px 13px",
  border: "1px solid #e1e1e4",
  borderRadius: 4,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  flexWrap: "wrap",
  gap: 10,
  fontSize: 12,
  fontWeight: 400,
  color: "#52525b",
  background: "#ffffff",
};

const exceededGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: 10,
};

const exceededCard = {
  padding: "13px 14px",
  border: "1px solid #f3d38a",
  borderRadius: 4,
  background: "#fffbeb",
  display: "grid",
  gap: 5,
  fontSize: 11,
  color: "#78350f",
};

const formSection = {
  marginTop: 18,
  padding: 18,
  border: "1px solid #e1e1e4",
  borderRadius: 4,
  background: "#ffffff",
  boxShadow: "none",
};

const fieldGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 520px))",
  gap: 14,
  justifyContent: "start",
  alignItems: "start",
};

const label = {
  display: "block",
  marginBottom: 6,
  fontSize: 12,
  fontWeight: 600,
  color: "#27272a",
};

const input = {
  width: "100%",
  minHeight: 38,
  padding: "8px 10px",
  border: "1px solid #d2d2d6",
  borderRadius: 4,
  boxSizing: "border-box",
  fontFamily: "inherit",
  fontSize: 13,
  fontWeight: 400,
  color: "#18181b",
  background: "#ffffff",
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
  padding: "12px 13px",
  border: "1px solid #eed99d",
  borderRadius: 4,
  background: "#fffbeb",
  display: "grid",
  gap: 4,
};

const decisionSummaryLabel = {
  fontSize: 10,
  fontWeight: 600,
  color: "#92400e",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
};

const decisionSummary = {
  fontSize: 14,
  fontWeight: 700,
  color: "#78350f",
};

const saveTogetherNote = {
  padding: "12px 13px",
  border: "1px solid #d9e2ee",
  borderRadius: 4,
  background: "#f8fafc",
  color: "#475569",
  fontSize: 11,
  fontWeight: 400,
  lineHeight: 1.5,
  display: "grid",
  gap: 3,
};

const saveTogetherTitle = {
  color: "#334155",
  fontSize: 11,
  fontWeight: 650,
};

const loadingCard = {
  width: "100%",
  maxWidth: "none",
  margin: "0 0 20px",
  padding: "15px 16px",
  borderRadius: 6,
  border: "1px solid #d9d9dc",
  background: "#ffffff",
  color: "#66666b",
  fontSize: 12,
  fontWeight: 500,
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
  borderRadius: 4,
  background: "#ffffff",
  color: "#991b1b",
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
};

const blockedCard = {
  ...panelCard,
  padding: 18,
  border: "1px solid #fecaca",
  background: "#ffffff",
};

const blockedStatus = {
  marginTop: 12,
  padding: "10px 12px",
  borderRadius: 4,
  background: "#fef2f2",
  fontSize: 12,
  fontWeight: 600,
  color: "#991b1b",
};
