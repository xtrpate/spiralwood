const FURNITURE_TEMPLATE_TYPE_MAP = {
  cabinet: "template_closet_wardrobe",
  table: "template_dining_table",
  bed: "template_bed_frame",
  chair: "template_dining_chair",
  coffee_table: "template_coffee_table",
};

export function inferFurnitureTypeFromComponents(items = []) {
  const text = items
    .map(
      (item) =>
        `${item?.type || ""} ${item?.label || ""} ${item?.partCode || ""} ${item?.groupType || ""}`,
    )
    .join(" ")
    .toLowerCase();

  if (
    /(tabletop|apron|rail|stretcher|dining_table|coffee_table|side_table|console_table|desk|table)/.test(
      text,
    )
  ) {
    return "table";
  }

  if (/(chair|seat|backrest|back_rest|chair_leg|stool)/.test(text)) {
    return "chair";
  }

  if (/(bed|headboard|footboard|mattress)/.test(text)) {
    return "bed";
  }

  if (
    /(cabinet|wardrobe|drawer|shelf|door|panel|carcass|divider|closet|box)/.test(
      text,
    )
  ) {
    return "cabinet";
  }

  return "";
}

export function mapFurnitureTypeToTemplateType(furnitureType = "") {
  return (
    FURNITURE_TEMPLATE_TYPE_MAP[
      String(furnitureType || "").toLowerCase()
    ] || ""
  );
}

export function buildBlueprintThumbnailDataUrl(
  items = [],
  title = "Blueprint",
) {
  if (!Array.isArray(items) || !items.length) return "";

  const normalized = items
    .map((item) => ({
      x: Number(item?.x) || 0,
      y: Number(item?.y) || 0,
      width: Math.max(1, Number(item?.width) || 0),
      height: Math.max(1, Number(item?.height) || 0),
    }))
    .filter((item) => item.width > 0 && item.height > 0);

  if (!normalized.length) return "";

  const minX = Math.min(...normalized.map((item) => item.x));
  const minY = Math.min(...normalized.map((item) => item.y));
  const maxX = Math.max(...normalized.map((item) => item.x + item.width));
  const maxY = Math.max(...normalized.map((item) => item.y + item.height));

  const sceneWidth = Math.max(1, maxX - minX);
  const sceneHeight = Math.max(1, maxY - minY);

  const svgWidth = 420;
  const svgHeight = 280;
  const padding = 18;
  const drawWidth = svgWidth - padding * 2;
  const drawHeight = svgHeight - padding * 2;
  const scale = Math.min(drawWidth / sceneWidth, drawHeight / sceneHeight);

  const rects = normalized
    .slice(0, 80)
    .map((item, index) => {
      const x = padding + (item.x - minX) * scale;
      const y = padding + (item.y - minY) * scale;
      const width = Math.max(2, item.width * scale);
      const height = Math.max(2, item.height * scale);
      const fill = index % 2 === 0 ? "#d9c2a5" : "#c9b08f";

      return `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="2" ry="2" fill="${fill}" stroke="#5b4636" stroke-width="1" />`;
    })
    .join("");

  const safeTitle = String(title || "Blueprint")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">
      <rect width="100%" height="100%" fill="#efe7dc" />
      <rect x="10" y="10" width="${svgWidth - 20}" height="${svgHeight - 20}" rx="10" fill="#f7f2ea" stroke="#d7c7b2" />
      ${rects}
      <text x="${svgWidth / 2}" y="${svgHeight - 18}" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" font-weight="700" fill="#4b3b2c">${safeTitle}</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}
