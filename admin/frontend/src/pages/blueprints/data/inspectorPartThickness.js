// Read-only production dimension label for the Blueprint Properties inspector.
// All values come from the same width/height/depth geometry used by Cut Size.
// Do not persist a second, independent thickness field.
const LEG_CODE = /^(?:CT|DT)-(?:FL|FR|BL|BR)$/;

function getInspectorPartThickness(component) {
  if (!component || typeof component !== "object") return null;

  const dimensions = {
    width: Number(component.width),
    height: Number(component.height),
    depth: Number(component.depth),
  };
  if (!Object.values(dimensions).every((value) => Number.isFinite(value) && value > 0)) {
    return null;
  }

  const code = String(component.partCode || "").trim().toUpperCase();
  const type = String(component.type || "").trim().toLowerCase();
  const label = String(component.label || "").trim().toLowerCase();

  if (
    LEG_CODE.test(code) ||
    /(?:^|[_-])leg(?:$|[_-])/.test(type) ||
    /\bleg\b/.test(label)
  ) {
    return {
      kind: "section",
      label: "Leg Section (Width × Depth)",
      widthMm: dimensions.width,
      depthMm: dimensions.depth,
      explanation: "Legs use a cross-section, not a separate board thickness.",
    };
  }

  // Explicit axis for standard furniture components: do not mistake length for thickness.
  let axis = null;
  if (/^WR-(?:SL|SR)$/.test(code)) axis = "width";
  else if (/^WR-(?:TOP|BOT|SH\d+)$/.test(code)) axis = "height";
  else if (/^WR-(?:BKL|BKR|BKS|DL|DR)$/.test(code)) axis = "depth";
  else if (/^(?:CT|DT)-TOP$/.test(code) || code === "CT-SH") axis = "height";
  else if (/^(?:CT|DT)-(?:AF|AR)$/.test(code)) axis = "depth";
  else if (/^CT-(?:ASL|ASR)$/.test(code) || /^DT-(?:AL|AR2)$/.test(code)) axis = "width";

  if (!axis) {
    // For freeform rectangular board parts, infer thickness only when one axis
    // is unambiguously thinner than the other two. Avoid guessing for blocks.
    const ordered = Object.entries(dimensions).sort((a, b) => a[1] - b[1]);
    if (ordered[0][1] * 2 <= ordered[1][1]) axis = ordered[0][0];
  }

  if (!axis) {
    return {
      kind: "unspecified",
      label: "Thickness",
      explanation: "No distinct thickness axis; inspect Width, Height, and Depth.",
    };
  }

  const axisLabel = axis[0].toUpperCase() + axis.slice(1);
  return {
    kind: "thickness",
    label: "Thickness",
    thicknessMm: dimensions[axis],
    axis,
    explanation: `Read-only · taken from ${axisLabel}; automatically follows part resizing.`,
  };
}

export { getInspectorPartThickness };
