import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../../services/api";
import { WOOD_FINISHES } from "../blueprints/data/furnitureTypes";
import { extractCustomerBlueprintScene } from "../customer/customerBlueprintAdapter";
import StaffProductionBlueprintViewer from "./StaffProductionBlueprintViewer";
import "./ProductionBlueprintView.css";

const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

const formatMm = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0
    ? `${Math.round(number).toLocaleString("en-PH")} mm`
    : "—";
};

const formatPartName = (part, index) =>
  part?.label || part?.name || part?.type || `Part ${index + 1}`;

const firstText = (...values) => {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
};

const findFinish = (finishId) => {
  const id = String(finishId || "").trim();
  if (!id) return null;

  return Array.isArray(WOOD_FINISHES)
    ? WOOD_FINISHES.find((item) => String(item?.id || "") === id) || null
    : null;
};

const resolvePartFinish = (part = {}) => {
  const solidHex = [part.fill, part.color, part.finish_color]
    .map((value) => String(value || "").trim())
    .find((value) => HEX_COLOR_RE.test(value));

  if (part?.color_mode === "solid" && solidHex) {
    return {
      key: `solid:${solidHex.toLowerCase()}`,
      label: `Custom color ${solidHex.toUpperCase()}`,
      color: solidHex,
    };
  }

  const finishId = firstText(part.finish_id, part.woodFinish, part.finish);
  const finishMatch = findFinish(finishId);

  if (finishMatch) {
    const previewColor = firstText(
      finishMatch.color,
      finishMatch.hex,
      finishMatch.previewColor,
      finishMatch.baseColor,
    );

    return {
      key: `finish:${finishMatch.id}`,
      label: finishMatch.label || finishMatch.id,
      color: HEX_COLOR_RE.test(previewColor) ? previewColor : "",
    };
  }

  if (finishId) {
    return {
      key: `finish:${finishId}`,
      label: finishId,
      color: "",
    };
  }

  if (solidHex) {
    return {
      key: `solid:${solidHex.toLowerCase()}`,
      label: `Custom color ${solidHex.toUpperCase()}`,
      color: solidHex,
    };
  }

  return { key: "none", label: "Original finish", color: "" };
};

const FinishValue = ({ value }) => (
  <span className="production-blueprint-finish-value">
    {value?.color ? (
      <i
        className="production-blueprint-finish-swatch"
        style={{ backgroundColor: value.color }}
        aria-hidden="true"
      />
    ) : null}
    <span>{value?.label || "—"}</span>
  </span>
);

export default function ProductionBlueprintView() {
  const { orderId } = useParams();
  const navigate = useNavigate();

  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const numericOrderId = Number(orderId);

    if (!Number.isInteger(numericOrderId) || numericOrderId <= 0) {
      setRecord(null);
      setError("This production work could not be found.");
      setLoading(false);
      return () => {
        active = false;
      };
    }

    setLoading(true);
    setError("");

    api
      .get(`/tasks/orders/${numericOrderId}/blueprint`)
      .then(({ data }) => {
        if (!active) return;
        setRecord(data || null);
      })
      .catch((err) => {
        if (!active) return;
        setRecord(null);
        setError(
          err?.response?.data?.message ||
            "This production Blueprint is not available for your account.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [orderId]);

  const blueprint = record?.blueprint || null;
  const scene = useMemo(
    () => (blueprint ? extractCustomerBlueprintScene(blueprint) : null),
    [blueprint],
  );

  const parts = Array.isArray(scene?.components) ? scene.components : [];
  const dimensions = scene?.defaultDimensions || {};
  const metadata = scene?.metadata || {};

  const partFinishes = useMemo(
    () => parts.map((part) => resolvePartFinish(part)),
    [parts],
  );

  const uniqueFinishes = useMemo(() => {
    const seen = new Map();
    partFinishes.forEach((finish) => seen.set(finish.key, finish));
    return [...seen.values()];
  }, [partFinishes]);

  const overallFinish =
    uniqueFinishes.length === 1
      ? uniqueFinishes[0]
      : uniqueFinishes.length > 1
        ? { key: "mixed", label: "Mixed finishes", color: "" }
        : { key: "none", label: "Original finish", color: "" };

  const materials = [
    ...new Set(
      parts
        .map((part) => firstText(part.material, part.wood_type))
        .filter(Boolean),
    ),
  ];

  const overallMaterial =
    materials.length === 1
      ? materials[0]
      : materials.length > 1
        ? "Mixed materials"
        : firstText(metadata.wood_type, blueprint?.primary_material) || "—";

  const hardware = firstText(metadata.hardware, blueprint?.hardware);
  const displayTitle =
    firstText(record?.order_item?.product_name, blueprint?.title) ||
    "Assigned Furniture";
  const isOrderDesign = record?.design_source === "order_customization";

  return (
    <div className="production-blueprint-page">
      <div className="production-blueprint-topbar">
        <button
          type="button"
          className="production-blueprint-back"
          onClick={() => navigate("/staff/tasks")}
        >
          ← Back to My Tasks
        </button>
        <span className="production-blueprint-readonly">Read Only</span>
      </div>

      {loading ? (
        <div className="production-blueprint-state">
          <strong>Loading production design...</strong>
          <span>Preparing the assigned furniture reference.</span>
        </div>
      ) : error || !blueprint ? (
        <div className="production-blueprint-state">
          <strong>Blueprint unavailable</strong>
          <span>{error || "No production Blueprint is linked to this work."}</span>
        </div>
      ) : (
        <div className="production-blueprint-document">
          <header className="production-blueprint-header">
            <h1>{displayTitle}</h1>
            <p>
              {record?.order?.order_number || `Order #${orderId}`} · Review the
              design, finish, and measurements before production.
            </p>
          </header>

          <section className="production-blueprint-summarybar">
            <div>
              <span>Design Preview</span>
              <strong>
                {formatMm(dimensions.width_mm)} × {formatMm(dimensions.height_mm)} ×{" "}
                {formatMm(dimensions.depth_mm)}
              </strong>
            </div>
            <span
              className={
                isOrderDesign
                  ? "production-blueprint-source production-blueprint-source-order"
                  : "production-blueprint-source"
              }
            >
              {isOrderDesign ? "Customer Order Design" : "Approved Blueprint"}
            </span>
          </section>

          <div className="production-blueprint-layout">
            <section className="production-blueprint-view-section">
              <StaffProductionBlueprintViewer blueprint={blueprint} />
            </section>

            <aside className="production-blueprint-details">
              <div className="production-blueprint-section-head">
                <h2>Production Details</h2>
                <p>Use these saved order details as the production reference.</p>
              </div>

              <div className="production-blueprint-detail-block">
                <h3>Dimensions</h3>
                <div className="production-blueprint-detail-row">
                  <span>Width</span>
                  <strong>{formatMm(dimensions.width_mm)}</strong>
                </div>
                <div className="production-blueprint-detail-row">
                  <span>Height</span>
                  <strong>{formatMm(dimensions.height_mm)}</strong>
                </div>
                <div className="production-blueprint-detail-row">
                  <span>Depth</span>
                  <strong>{formatMm(dimensions.depth_mm)}</strong>
                </div>
              </div>

              <div className="production-blueprint-detail-block">
                <div className="production-blueprint-detail-row">
                  <span>Material</span>
                  <strong>{overallMaterial}</strong>
                </div>
                <div className="production-blueprint-detail-row">
                  <span>Finish / Color</span>
                  <strong><FinishValue value={overallFinish} /></strong>
                </div>
                <div className="production-blueprint-detail-row">
                  <span>Order</span>
                  <strong>{record?.order?.order_number || "—"}</strong>
                </div>
                <div className="production-blueprint-detail-row">
                  <span>Parts</span>
                  <strong>{parts.length}</strong>
                </div>
                {hardware ? (
                  <div className="production-blueprint-detail-row">
                    <span>Hardware</span>
                    <strong>{hardware}</strong>
                  </div>
                ) : null}
              </div>

              <div
                className={
                  isOrderDesign
                    ? "production-blueprint-order-note"
                    : "production-blueprint-note"
                }
              >
                {isOrderDesign
                  ? "This is the saved customer order design. Follow its dimensions, material, finish, color, and part configuration for production."
                  : "This order has no saved customization snapshot, so the approved Blueprint is shown as the production reference."}
              </div>
            </aside>
          </div>

          <section className="production-blueprint-parts">
            <div className="production-blueprint-parts-head">
              <div>
                <h2>Parts & Measurements</h2>
                <p>Production dimensions, material, and finish for every saved part.</p>
              </div>
              <span>{parts.length} {parts.length === 1 ? "part" : "parts"}</span>
            </div>

            {parts.length === 0 ? (
              <div className="production-blueprint-empty-parts">
                No saved parts are available for this Blueprint.
              </div>
            ) : (
              <div className="production-blueprint-table-wrap">
                <table className="production-blueprint-table">
                  <thead>
                    <tr>
                      <th>Part</th>
                      <th>Width</th>
                      <th>Height</th>
                      <th>Depth</th>
                      <th>Material</th>
                      <th>Finish / Color</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parts.map((part, index) => (
                      <tr key={part.id || `${part.type || "part"}-${index}`}>
                        <td>{formatPartName(part, index)}</td>
                        <td>{formatMm(part.width)}</td>
                        <td>{formatMm(part.height)}</td>
                        <td>{formatMm(part.depth)}</td>
                        <td>{firstText(part.material, part.wood_type) || overallMaterial}</td>
                        <td><FinishValue value={partFinishes[index]} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
