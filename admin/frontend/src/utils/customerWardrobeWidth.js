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

const verifyWardrobePartGeometry = (parts, map) => {
  const left = map.get("WRC-SIDE-L");
  const right = map.get("WRC-SIDE-R");
  const back = map.get("WRC-BACK");
  const d1 = map.get("WRC-DIV-1");
  const d2 = map.get("WRC-DIV-2");
  const d3 = map.get("WRC-DIV-3");
  const near = (a, b, tolerance = 2) =>
    Math.abs(Number(a) - Number(b)) <= tolerance;
  // Material thickness is fixed; it never scales with furniture size.
  if (
    !near(left.width, 18, 0.01) || !near(right.width, 18, 0.01) ||
    !near(d1.width, 18, 0.01) || !near(d2.width, 20, 0.01) ||
    !near(d3.width, 18, 0.01) || !near(back.depth, 12, 0.01) ||
    !near(back.x, Number(left.x) + 21)
  ) return false;

  const edges = [
    [Number(left.x) + Number(left.width), Number(d1.x)],
    [Number(d1.x) + Number(d1.width), Number(d2.x)],
    [Number(d2.x) + Number(d2.width), Number(d3.x)],
    [Number(d3.x) + Number(d3.width), Number(right.x)],
  ];
  const shelfCodes = /^WRC-B[1-4]-(TOP|MID|BASE|S1|S2|DTOP)$/;
  const drawerCodes = /^WRC-B(?:2-D[12]|3-D1)-(F|SL|SR|BK|BOT|HDL)$/;
  const minY = Number(left.y);
  const cabinetBottom = minY + Number(left.height);
  const fixedShelfY = {
    "WRC-B1-TOP": 365, "WRC-B2-TOP": 365,
    "WRC-B3-TOP": 365, "WRC-B4-TOP": 365,
    "WRC-B1-MID": 1300, "WRC-B2-DTOP": 1400,
    "WRC-B3-DTOP": 1640,
  };

  for (const p of parts) {
    const code = codeOf(p);
    const bayMatch = /^WRC-B([1-4])-/.exec(code);
    if (!bayMatch) continue;
    const [start, end] = edges[Number(bayMatch[1]) - 1];
    // Rod connectors overlap a supporting wall by a few mm by design.
    const tolerance = code.endsWith("-ROD") ? 8 : 2;
    if (Number(p.x) < start - tolerance ||
        Number(p.x) + Number(p.width) > end + tolerance ||
        Number(p.y) < minY ||
        Number(p.y) + Number(p.height) > cabinetBottom) return false;
    if (shelfCodes.test(code) && !near(p.height, 18, 0.01))
      return false;
    if (Object.hasOwn(fixedShelfY, code) &&
        !near(p.y, minY + fixedShelfY[code])) return false;
    if (/^WRC-B[1-4]-BASE$/.test(code) &&
        !near(p.y, cabinetBottom - 148)) return false;
    if (drawerCodes.test(code)) {
      if (code.endsWith("-F") && !near(p.depth, 18, 0.01))
        return false;
      if ((code.endsWith("-SL") || code.endsWith("-SR")) &&
          !near(p.width, 12, 0.01)) return false;
      if (code.endsWith("-BK") && !near(p.depth, 12, 0.01))
        return false;
      if (code.endsWith("-BOT") && !near(p.height, 6, 0.01))
        return false;
    }
  }

  const frontFits = (prefix, shelfCode, previousFront = null) => {
    const front = map.get(`WRC-${prefix}-F`);
    const shelf = map.get(`WRC-${shelfCode}`);
    const floorY = previousFront
      ? Number(previousFront.y) + Number(previousFront.height)
      : Number(shelf.y) + Number(shelf.height);
    return Number(front.y) >= floorY + 2 &&
      Number(front.x) >= Number(shelf.x) - 2 &&
      Number(front.x) + Number(front.width) <=
        Number(shelf.x) + Number(shelf.width) + 2;
  };
  if (!frontFits("B2-D1", "B2-DTOP") ||
      !frontFits("B2-D2", "B2-DTOP", map.get("WRC-B2-D1-F")) ||
      !frontFits("B3-D1", "B3-DTOP")) return false;

  const ledge = map.get("WRC-B3-LEDGE");
  const ledgeSupport = map.get("WRC-B3-LEDGE-SUP");
  if (!near(Number(ledge.x) + Number(ledge.width), d3.x) ||
      !near(Number(ledgeSupport.x) + 2, ledge.x) ||
      !near(ledge.y, minY + 1320) ||
      !near(ledge.height, 18, 0.01) ||
      !near(ledgeSupport.width, 19, 0.01)) return false;

  // The four rods are not independently editable. All original anchors must
  // be preserved through width, height and depth changes.
  const minZ = Number(ledge.z);
  const overallDepth = Number(left.depth) + 20;
  const rodZShift = Math.floor((overallDepth - 620) / 2);
  const rods = parts.filter((p) => codeOf(p).endsWith("-ROD"));
  if (rods.length !== 4) return false;
  for (const rod of rods) {
    const code = codeOf(rod);
    let x, width, yOffset, zOffset;
    if (code === "WRC-B1-ROD") {
      [x, width, yOffset, zOffset] = [
        edges[0][0], edges[0][1] - edges[0][0] + 1, 500, 362,
      ];
    } else if (code === "WRC-B4-ROD") {
      [x, width, yOffset, zOffset] = [
        edges[3][0] + 9, edges[3][1] - edges[3][0] - 17, 500, 362,
      ];
    } else if (code === "WRC-B3-ROD" &&
        near(rod.y, minY + 1372)) {
      [x, width, yOffset, zOffset] = [
        edges[2][0] + 337, edges[2][1] - edges[2][0] - 332, 1372, 414,
      ];
    } else if (code === "WRC-B3-ROD") {
      [x, width, yOffset, zOffset] = [
        edges[2][0] + 8, edges[2][1] - edges[2][0] - 34, 500, 362,
      ];
    } else return false;
    if (!near(rod.x, x) || !near(rod.width, width) ||
        !near(rod.y, minY + yOffset) ||
        !near(rod.z, minZ + zOffset + rodZShift) ||
        !near(rod.height, 16, 0.01) ||
        !near(rod.depth, 16, 0.01)) return false;
  }

  // Adjustable shelves must never cross other parts. Nearby dividers may
  // touch within 1 mm of the original assembly tolerance.
  const intersects = (a, b) =>
    ["x", "y", "z"].every((axis, i) =>
      Math.min(
        Number(a[axis]) + Number(a[["width", "height", "depth"][i]]),
        Number(b[axis]) + Number(b[["width", "height", "depth"][i]]),
      ) - Math.max(Number(a[axis]), Number(b[axis])) > 1);
  for (const code of ["WRC-B2-S1", "WRC-B2-S2"]) {
    const shelf = map.get(code);
    if (parts.some((other) => other !== shelf && intersects(shelf, other)))
      return false;
  }
  return true;
};


// Only the known 43-part scene is eligible. All other wardrobes stay protected.
export const getCustomerWardrobeWidthSupport = (parts = []) => {
  const unsupported =
    "This wardrobe layout is not verified for width resizing. Its original size is protected.";
  if (!Array.isArray(parts) || parts.length !== WARDROBE_PART_CODES.length + 1) {
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
    rightBay < HANGING_BAY_MIN_MM || rightBay > HANGING_BAY_MAX_MM ||
    Math.abs(leftBay - rightBay) > 1
  ) {
    return errorResult(unsupported);
  }

  if (!verifyWardrobePartGeometry(parts, map)) {
    return errorResult("The stored wardrobe parts do not fit the verified cabinet layout.");
  }

  return {
    ok: true,
    width,
    openings: { bay1: leftBay, bay2, bay3, bay4: rightBay },
    minWidth: width - leftBay - rightBay + 2 * HANGING_BAY_MIN_MM,
    maxWidth: width - leftBay - rightBay + 2 * HANGING_BAY_MAX_MM,
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
  // Calculate from the requested total rather than splitting the delta.
  // This prevents a 1 mm drift after repeated odd-number width changes.
  const hangingTotal =
    support.openings.bay1 + support.openings.bay4 + delta;
  const bay1 = Math.floor(hangingTotal / 2);
  const bay4 = hangingTotal - bay1;
  const leftChange = bay1 - support.openings.bay1;
  const rightChange = bay4 - support.openings.bay4;

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
