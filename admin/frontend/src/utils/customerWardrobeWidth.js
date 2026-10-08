// BP-CUST-15B: width changes for the verified four-bay, 43-part wardrobe only.
// This is a conservative configurator policy, not factory certification.
// Never apply a partial change; return a complete new scene or an error.
const WARDROBE_PART_CODES = [
  "SIDE-L", "SIDE-R", "BACK", "DIV-1", "DIV-2", "DIV-3",
  "B1-TOP", "B2-TOP", "B3-TOP", "B4-TOP",
  "B1-ROD", "B3-ROD", "B4-ROD", "B1-MID",
  "B2-S1", "B2-S2", "B2-DTOP", "B3-DTOP",
  "B3-LEDGE", "B3-LEDGE-SUP",
  "B1-BASE", "B2-BASE", "B3-BASE", "B4-BASE",
  "B2-D1-F", "B2-D1-SL", "B2-D1-SR", "B2-D1-BK",
  "B2-D1-BOT", "B2-D1-HDL",
  "B2-D2-F", "B2-D2-SL", "B2-D2-SR", "B2-D2-BK",
  "B2-D2-BOT", "B2-D2-HDL",
  "B3-D1-F", "B3-D1-SL", "B3-D1-SR", "B3-D1-BK",
  "B3-D1-BOT", "B3-D1-HDL",
].map((suffix) => `WRC-${suffix}`);

const EXPECTED_CODES = new Set(WARDROBE_PART_CODES);
// Pilot rule: preserve the two drawer bays and allow only modest changes in
// the hanging bays. The shop must confirm these opening limits before quoting.
const HANGING_BAY_MIN_MM = 600;
const HANGING_BAY_MAX_MM = 900;
const FIT_TOLERANCE_MM = 2;

const codeOf = (part) =>
  String(part?.partCode || part?.part_code || part?.technicalId || "")
    .trim()
    .toUpperCase();

const closeTo = (left, right) =>
  Math.abs(left - right) <= FIT_TOLERANCE_MM;

const safePart = (part) =>
  part &&
  ["x", "y", "z", "width", "height", "depth"].every((key) =>
    Number.isFinite(Number(part[key])),
  ) &&
  ["width", "height", "depth"].every((key) => Number(part[key]) > 0) &&
  ["rotationX", "rotationY", "rotationZ"].every((key) =>
    Math.abs(Number(part[key] || 0)) < 0.0001,
  );

const errorResult = (message) => ({ ok: false, error: message });

// Only the known 43-part scene is eligible. All other wardrobes stay protected.
export const getCustomerWardrobeWidthSupport = (parts = []) => {
  const unsupported =
    "This wardrobe layout is not verified for width resizing. Its original size is protected.";
  if (!Array.isArray(parts) || parts.length !== WARDROBE_PART_CODES.length) {
    return errorResult(unsupported);
  }
  const map = new Map();
  const counts = new Map();
  for (const part of parts) {
    const code = codeOf(part);
    if (!EXPECTED_CODES.has(code) || !safePart(part)) {
      return errorResult(unsupported);
    }
    const nextCount = (counts.get(code) || 0) + 1;
    // The supplied 43-part template intentionally has TWO Bay 3 rods
    // with the same WRC-B3-ROD code at different positions.
    if (nextCount > (code === "WRC-B3-ROD" ? 2 : 1)) {
      return errorResult(unsupported);
    }
    counts.set(code, nextCount);
    if (!map.has(code)) map.set(code, part);
  }
  if (map.size !== EXPECTED_CODES.size ||
      [...EXPECTED_CODES].some((code) =>
        counts.get(code) !== (code === "WRC-B3-ROD" ? 2 : 1)
      )) return errorResult(unsupported);

  const left = map.get("WRC-SIDE-L");
  const right = map.get("WRC-SIDE-R");
  const back = map.get("WRC-BACK");
  const div1 = map.get("WRC-DIV-1");
  const div2 = map.get("WRC-DIV-2");
  const div3 = map.get("WRC-DIV-3");
  const innerLeft = Number(left.x) + Number(left.width);
  const div1Right = Number(div1.x) + Number(div1.width);
  const div2Right = Number(div2.x) + Number(div2.width);
  const div3Right = Number(div3.x) + Number(div3.width);
  const leftBay = Number(div1.x) - innerLeft;
  const bay2 = Number(div2.x) - div1Right;
  const bay3 = Number(div3.x) - div2Right;
  const rightBay = Number(right.x) - div3Right;
  const width = Number(right.x) + Number(right.width) - Number(left.x);

  if (
    ![width, leftBay, bay2, bay3, rightBay].every(Number.isFinite) ||
    [leftBay, bay2, bay3, rightBay].some((space) => space <= 0) ||
    !closeTo(Number(back.x) + Number(back.width), Number(right.x)) ||
    !closeTo(Number(left.y), Number(right.y)) ||
    !closeTo(Number(left.height), Number(right.height)) ||
    !closeTo(Number(div1.height), Number(div2.height)) ||
    !closeTo(Number(div2.height), Number(div3.height)) ||
    !closeTo(Number(left.z), Number(right.z)) ||
    !closeTo(Number(div1.z), Number(div2.z)) ||
    !closeTo(Number(div2.z), Number(div3.z))
  ) {
    return errorResult(unsupported);
  }

  for (const [bay, start, end] of [
    ["B1", innerLeft, Number(div1.x)],
    ["B4", div3Right, Number(right.x)],
  ]) {
    for (const suffix of bay === "B1" ? ["TOP", "MID", "BASE"] : ["TOP", "BASE"]) {
      const shelf = map.get(`WRC-${bay}-${suffix}`);
      if (!closeTo(Number(shelf.x), start) ||
          !closeTo(Number(shelf.x) + Number(shelf.width), end)) {
        return errorResult(unsupported);
      }
    }
  }
  if (
    leftBay < HANGING_BAY_MIN_MM || leftBay > HANGING_BAY_MAX_MM ||
    rightBay < HANGING_BAY_MIN_MM || rightBay > HANGING_BAY_MAX_MM
  ) {
    return errorResult(unsupported);
  }

  return {
    ok: true,
    width,
    openings: { bay1: leftBay, bay2, bay3, bay4: rightBay },
    minWidth: width + 2 * (HANGING_BAY_MIN_MM - Math.min(leftBay, rightBay)),
    maxWidth: width + 2 * (HANGING_BAY_MAX_MM - Math.max(leftBay, rightBay)),
    policy: "Provisional 600-900 mm hanging-bay openings; final size needs shop review.",
  };
};

// Shift bays 2 and 3 together; keep their drawers, shelves, ledge, and
// custom finishes/sizes unchanged. Reflow the two simpler hanging bays only.
export const planCustomerWardrobeWidth = (parts = [], targetWidthMm) => {
  const support = getCustomerWardrobeWidthSupport(parts);
  if (!support.ok) return support;
  const targetWidth = Number(targetWidthMm);
  if (!Number.isSafeInteger(targetWidth) || targetWidth <= 0) {
    return errorResult("Enter a valid whole-number width in millimeters.");
  }
  const delta = targetWidth - support.width;
  const leftChange = Math.floor(delta / 2);
  const rightChange = delta - leftChange;
  const bay1 = support.openings.bay1 + leftChange;
  const bay4 = support.openings.bay4 + rightChange;

  if (
    bay1 < HANGING_BAY_MIN_MM || bay1 > HANGING_BAY_MAX_MM ||
    bay4 < HANGING_BAY_MIN_MM || bay4 > HANGING_BAY_MAX_MM
  ) {
    return errorResult(
      "Width is outside the provisional hanging-bay limits. Try a smaller change.",
    );
  }

  const nextParts = parts.map((part) => {
    const code = codeOf(part);
    const next = { ...part };
    if (code === "WRC-SIDE-L") return next;
    if (code === "WRC-SIDE-R") {
      next.x = Number(part.x) + delta;
    } else if (code === "WRC-BACK") {
      next.width = Number(part.width) + delta;
    } else if (code.startsWith("WRC-DIV-")) {
      next.x = Number(part.x) + leftChange;
    } else if (code.startsWith("WRC-B1-")) {
      next.width = Number(part.width) + leftChange;
    } else if (code.startsWith("WRC-B4-")) {
      next.x = Number(part.x) + leftChange;
      next.width = Number(part.width) + rightChange;
    } else {
      // Bay 2 and Bay 3 move as rigid assemblies. Never scale drawer parts.
      next.x = Number(part.x) + leftChange;
    }
    return next;
  });

  // All widths and immutable thicknesses must survive the proposed change.
  if (nextParts.some((part) => !safePart(part))) {
    return errorResult("The new width would create an invalid furniture part.");
  }
  const check = getCustomerWardrobeWidthSupport(nextParts);
  if (!check.ok || !closeTo(check.width, targetWidth) ||
      !closeTo(check.openings.bay2, support.openings.bay2) ||
      !closeTo(check.openings.bay3, support.openings.bay3)) {
    return errorResult("The new width could not preserve the cabinet structure.");
  }
  return {
    ok: true,
    parts: nextParts,
    width: targetWidth,
    openings: check.openings,
    policy: support.policy,
  };
};
