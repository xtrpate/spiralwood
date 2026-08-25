import { useMemo } from "react";
import { WOOD_FINISHES } from "../blueprints/data/furnitureTypes";
import { extractCustomerBlueprintScene } from "../customer/customerBlueprintAdapter";
import StaffProductionBlueprintViewer from "../staff/StaffProductionBlueprintViewer";
import "../staff/ProductionBlueprintView.css";
import "./AdminSubmittedDesignPreview.css";

const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

const formatMm = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0
    ? `${Math.round(number).toLocaleString("en-PH")} mm`
    : "—";
};

const firstText = (...values) => {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
};

const formatPartName = (part, index) =>
  part?.label || part?.name || part?.type || `Part ${index + 1}`;

const findFinish = (finishId) => {
  const id = String(finishId || "").trim();
  if (!id || !Array.isArray(WOOD_FINISHES)) return null;

  return (
    WOOD_FINISHES.find((item) => String(item?.id || "") === id) || null
  );
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

export default function AdminSubmittedDesignPreview({
  blueprint,
  item,
  orderNumber = "",
}) {
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
        : {
            key: "requested",
            label:
              firstText(
                item?.requested_finish_color,
                metadata?.finish_color,
              ) || "Original finish",
            color: "",
          };

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
        : firstText(item?.requested_wood_type, metadata?.wood_type) || "—";

  const hardware = firstText(item?.requested_hardware, metadata?.hardware);

  if (!blueprint) return null;

  return (
    <div className="admin-submitted-design-preview">
      <section className="production-blueprint-summarybar admin-submitted-design-summary">
        <div>
          <span>Design Preview</span>
          <strong>
            {formatMm(dimensions.width_mm)} × {formatMm(dimensions.height_mm)} ×{" "}
            {formatMm(dimensions.depth_mm)}
          </strong>
        </div>

        <span className="production-blueprint-source production-blueprint-source-order">
          Submitted Customer Design
        </span>
      </section>

      <div className="production-blueprint-layout admin-submitted-design-layout">
        <section className="production-blueprint-view-section">
          <StaffProductionBlueprintViewer
            blueprint={blueprint}
            cleanFurnitureSelfShadow
          />
        </section>

        <aside className="production-blueprint-details">
          <div className="production-blueprint-section-head">
            <h2>Design Details</h2>
            <p>
              Exact values saved with the customer&apos;s submitted furniture
              design.
            </p>
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
              <strong>
                <FinishValue value={overallFinish} />
              </strong>
            </div>

            {orderNumber ? (
              <div className="production-blueprint-detail-row">
                <span>Order</span>
                <strong>{orderNumber}</strong>
              </div>
            ) : null}

            <div className="production-blueprint-detail-row">
              <span>Order Type</span>
              <strong>Made to Order</strong>
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

          <div className="admin-submitted-design-note">
            Read only. Doors and drawers can be opened for inspection without
            changing the customer&apos;s saved design.
          </div>
        </aside>
      </div>

      <section className="production-blueprint-parts admin-submitted-design-parts">
        <div className="production-blueprint-parts-head">
          <div>
            <h2>Parts &amp; Measurements</h2>
            <p>
              Saved dimensions, material, and finish for every furniture part.
            </p>
          </div>

          <span>
            {parts.length} {parts.length === 1 ? "part" : "parts"}
          </span>
        </div>

        {parts.length === 0 ? (
          <div className="production-blueprint-empty-parts">
            No saved parts are available for this submitted design.
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
                    <td>
                      {firstText(part.material, part.wood_type) ||
                        overallMaterial}
                    </td>
                    <td>
                      <FinishValue value={partFinishes[index]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
