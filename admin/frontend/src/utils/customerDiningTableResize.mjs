// WISDOM C5-1: read-only compatibility check and construction-aware resize
// for the exact nine-part Admin dining-table assembly (DT-*).
// No generic mesh scaling, stock consumption, pricing or metadata mutation.
const LIMITS = Object.freeze({
  width: Object.freeze([1400, 2200]),
  height: Object.freeze([700, 900]),
  depth: Object.freeze([750, 1100]),
});
const TOP_T = 40;
const LEG_SECTION = 80;
const APRON_H = 90;
const APRON_T = 25;
const INSET = 70;
const FIT_TOLERANCE_MM = 0.05;
const EXPECTED = Object.freeze({
  "DT-TOP": "dt_top_panel",
  "DT-FL": "dt_leg",
  "DT-FR": "dt_leg",
  "DT-BL": "dt_leg",
  "DT-BR": "dt_leg",
  "DT-AF": "dt_apron_long",
  "DT-AR": "dt_apron_long",
  "DT-AL": "dt_apron_short",
  "DT-AR2": "dt_apron_short",
});
const fail = (error = "This Dining Table construction is not verified for safe resizing.") => ({
  ok: false,
  error,
});
const finite = (n) => typeof n === "number" ? Number.isFinite(n) :
  typeof n === "string" && n.trim().length > 0 && Number.isFinite(Number(n));
const near = (actual, expected) => finite(actual) &&
  Math.abs(Number(actual) - expected) <= FIT_TOLERANCE_MM;
const codeOf = (part) => String(part?.partCode || "").trim().toUpperCase();
const rotationZero = (part) => ["rotationX", "rotationY", "rotationZ"].every((axis) => {
  const raw = part[axis] ?? 0;
  if (!finite(raw)) return false;
  const angle = ((Number(raw) % 360) + 360) % 360;
  return Math.min(Math.abs(angle), Math.abs(angle - 360)) <= 0.001;
});
const match = (part, spec) => Object.entries(spec).every(([key, value]) => near(part[key], value));

export function getCustomerDiningTableResizeSupport(parts = []) {
  if (!Array.isArray(parts) || parts.length !== 9) return fail();
  const byCode = new Map();
  const ids = new Set();
  const groups = new Set();
  for (const part of parts) {
    if (!part || typeof part !== "object") return fail();
    const code = codeOf(part);
    const id = String(part.id ?? "").trim();
    const group = String(part.groupId || part.assemblyId || "").trim();
    if (!Object.hasOwn(EXPECTED, code) || byCode.has(code) || !id || ids.has(id) || !group ||
      String(part.type || "").trim() !== EXPECTED[code] || part.locked === true ||
      part.visible === false || Number(part.is_deleted || 0) === 1 ||
      (part.assemblyType && String(part.assemblyType) !== "dining_table") ||
      (part.groupId && part.assemblyId && String(part.groupId) !== String(part.assemblyId)) ||
      !["x", "y", "z", "width", "height", "depth"].every((key) =>
        finite(part[key]) && (!["width", "height", "depth"].includes(key) || Number(part[key]) > 0)) ||
      !rotationZero(part) ||
      (part.qty !== undefined && (!Number.isSafeInteger(Number(part.qty)) || Number(part.qty) !== 1))) {
      return fail();
    }
    byCode.set(code, part);
    ids.add(id);
    groups.add(group);
  }
  if (byCode.size !== 9 || groups.size !== 1) return fail();
  const get = (code) => byCode.get(code);
  const top = get("DT-TOP");
  const x = Number(top.x), y = Number(top.y), z = Number(top.z);
  const width = Number(top.width), depth = Number(top.depth);
  const height = Number(get("DT-FL").height) + TOP_T;
  if (![width, height, depth].every(Number.isSafeInteger) ||
    Object.entries({ width, height, depth }).some(([axis, value]) =>
      value < LIMITS[axis][0] || value > LIMITS[axis][1])) return fail();
  if (!near(top.height, TOP_T)) return fail();
  const legY = y + TOP_T;
  const specs = {
    "DT-FL": { x: x + INSET, y: legY, z: z + INSET, width: LEG_SECTION, height: height - TOP_T, depth: LEG_SECTION },
    "DT-FR": { x: x + width - INSET - LEG_SECTION, y: legY, z: z + INSET, width: LEG_SECTION, height: height - TOP_T, depth: LEG_SECTION },
    "DT-BL": { x: x + INSET, y: legY, z: z + depth - INSET - LEG_SECTION, width: LEG_SECTION, height: height - TOP_T, depth: LEG_SECTION },
    "DT-BR": { x: x + width - INSET - LEG_SECTION, y: legY, z: z + depth - INSET - LEG_SECTION, width: LEG_SECTION, height: height - TOP_T, depth: LEG_SECTION },
    "DT-AF": { x: x + INSET + LEG_SECTION, y: legY, z: z + INSET, width: width - INSET * 2 - LEG_SECTION * 2, height: APRON_H, depth: APRON_T },
    "DT-AR": { x: x + INSET + LEG_SECTION, y: legY, z: z + depth - INSET - APRON_T, width: width - INSET * 2 - LEG_SECTION * 2, height: APRON_H, depth: APRON_T },
    "DT-AL": { x: x + INSET, y: legY, z: z + INSET + LEG_SECTION, width: APRON_T, height: APRON_H, depth: depth - INSET * 2 - LEG_SECTION * 2 },
    "DT-AR2": { x: x + width - INSET - APRON_T, y: legY, z: z + INSET + LEG_SECTION, width: APRON_T, height: APRON_H, depth: depth - INSET * 2 - LEG_SECTION * 2 },
  };
  if (Object.entries(specs).some(([code, spec]) => !match(get(code), spec))) return fail();
  return {
    ok: true, width, height, depth,
    minWidth: LIMITS.width[0], maxWidth: LIMITS.width[1],
    minHeight: LIMITS.height[0], maxHeight: LIMITS.height[1],
    minDepth: LIMITS.depth[0], maxDepth: LIMITS.depth[1],
    policy: "Provisional table sizing; Admin must verify joinery, strength, materials and quotation.",
  };
}

export function planCustomerDiningTableResize(parts = [], axis, targetMm) {
  const before = getCustomerDiningTableResizeSupport(parts);
  if (!before.ok) return before;
  if (!Object.hasOwn(LIMITS, axis)) return fail("Unsupported dimension.");
  const target = Number(targetMm);
  if (!finite(targetMm) || !Number.isSafeInteger(target) ||
    target < LIMITS[axis][0] || target > LIMITS[axis][1]) {
    return fail(`${axis[0].toUpperCase() + axis.slice(1)} must be ${LIMITS[axis][0]}-${LIMITS[axis][1]} mm.`);
  }
  if (target === before[axis]) {
    return { ok: true, parts: parts.map((part) => ({ ...part })), [axis]: target, unchanged: true };
  }
  const delta = target - before[axis];
  const newParts = parts.map((part) => {
    const changed = { ...part };
    const code = codeOf(part);
    if (axis === "width") {
      if (code === "DT-TOP" || code === "DT-AF" || code === "DT-AR") changed.width = Number(part.width) + delta;
      if (["DT-FR", "DT-BR", "DT-AR2"].includes(code)) changed.x = Number(part.x) + delta;
    } else if (axis === "height") {
      // Keep the feet at the same floor elevation: raise/lower the tabletop,
      // move apron anchors with it, and change ONLY leg lengths.
      changed.y = Number(part.y) - delta;
      if (["DT-FL", "DT-FR", "DT-BL", "DT-BR"].includes(code)) {
        changed.height = Number(part.height) + delta;
      }
    } else if (axis === "depth") {
      if (code === "DT-TOP" || code === "DT-AL" || code === "DT-AR2") changed.depth = Number(part.depth) + delta;
      if (["DT-BL", "DT-BR", "DT-AR"].includes(code)) changed.z = Number(part.z) + delta;
    }
    return changed;
  });
  const after = getCustomerDiningTableResizeSupport(newParts);
  if (!after.ok || after[axis] !== target ||
    ["width", "height", "depth"].some((other) => other !== axis && after[other] !== before[other])) {
    return fail("The requested size would break the verified nine-part table construction.");
  }
  return { ok: true, parts: newParts, [axis]: target, policy: after.policy };
}
