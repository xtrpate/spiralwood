// BP-CUST-15C: conservative height/depth reflow for the verified 43-part wardrobe.
// These are provisional configurator limits, not manufacturing certification.
// Return every part at once or an error; never mutate the original design.
import { getCustomerWardrobeWidthSupport } from "./customerWardrobeWidth";

const MIN_HEIGHT_MM = 2300;
const MAX_HEIGHT_MM = 2500;
const MIN_DEPTH_MM = 580;
const MAX_DEPTH_MM = 680;
const EPSILON = 1;
const close = (a, b) => Math.abs(Number(a) - Number(b)) <= EPSILON;
const hdCodeOf = (p) => String(p?.partCode || p?.part_code || p?.technicalId || "")
  .trim().toUpperCase();
const error = (message) => ({ ok: false, error: message });
const findPart = (parts, suffix) =>
  parts.find((p) => hdCodeOf(p) === `WRC-${suffix}`);
const isBaseShelf = (code) => /^WRC-B[1-4]-BASE$/.test(code);
const isCabinetSide = (code) => code === "WRC-SIDE-L" || code === "WRC-SIDE-R";
const isDivider = (code) => /^WRC-DIV-[123]$/.test(code);
const isDrawerPart = (code) => /^WRC-(?:B2-D[12]|B3-D1)-(?:F|SL|SR|BK|BOT|HDL)$/.test(code);
const isAdjustableShelf = (code) => code === "WRC-B2-S1" || code === "WRC-B2-S2";
const isCabinetShelf = (code) =>
  /^WRC-B[1-4]-(?:TOP|MID|BASE|S1|S2|DTOP)$/.test(code);
const isRod = (code) => /^WRC-B[134]-ROD$/.test(code);

// Require original manufacturer template anchors plus any prior safe width
// changes. Saved customized shelf depth, vertical position, and drawer depth
// can vary, but must remain inside the verified cabinet envelope.
export const getCustomerWardrobeHeightDepthSupport = (parts = []) => {
  const widthSupport = getCustomerWardrobeWidthSupport(parts);
  if (!widthSupport.ok) return error("This wardrobe layout is not verified for safe height or depth resizing.");

  const left = findPart(parts, "SIDE-L");
  const right = findPart(parts, "SIDE-R");
  const back = findPart(parts, "BACK");
  const dividers = [1, 2, 3].map((i) => findPart(parts, `DIV-${i}`));
  const ledge = findPart(parts, "B3-LEDGE");
  const ledgeSupport = findPart(parts, "B3-LEDGE-SUP");
  const base = [1, 2, 3, 4].map((i) => findPart(parts, `B${i}-BASE`));
  const rods = parts.filter((p) => isRod(hdCodeOf(p)));
  const minY = Number(left.y);
  const minZ = Number(ledge.z);
  const height = Number(left.height);
  const depth = Number(left.depth) + 20;
  const baseY = minY + height - 148;
  const safe = [height, depth, minY, minZ, baseY].every(Number.isFinite) &&
    height >= MIN_HEIGHT_MM && height <= MAX_HEIGHT_MM &&
    depth >= MIN_DEPTH_MM && depth <= MAX_DEPTH_MM &&
    close(right.y, minY) && close(right.height, height) &&
    close(back.y, minY + 18) && close(back.height, height - 18) &&
    dividers.every((p) => close(p.y, minY + 18) &&
      close(p.height, height - 18)) &&
    base.every((p) => close(p.y, baseY) && close(p.height, 18)) &&
    close(ledgeSupport.y, Number(ledge.y) + Number(ledge.height)) &&
    close(Number(ledgeSupport.y) + Number(ledgeSupport.height), baseY) &&
    close(left.z, minZ + 2) && close(right.z, minZ + 2) &&
    dividers.every((p) => close(p.z, minZ + 2) && close(p.depth, depth - 20)) &&
    close(left.depth, depth - 20) &&
    close(right.depth, depth - 20) &&
    close(back.z, minZ + 2) && close(back.depth, 12) &&
    close(ledge.depth, depth - 15) &&
    close(ledgeSupport.z, minZ + 31) &&
    close(ledgeSupport.depth, depth - 47) &&
    rods.length === 4;

  if (!safe) return error("Cabinet frame anchors do not match the verified wardrobe layout.");

  // Fixed cabinet shelves follow the front setback as cabinet depth changes.
  // Individually customized adjustable shelves keep their chosen depth.
  const baselineShelfDepth = depth - 68;
  const maxShelfDepth = depth - 44;
  for (const part of parts) {
    const code = hdCodeOf(part);
    if (isCabinetShelf(code)) {
      if (!close(part.z, minZ + 26) ||
          Number(part.depth) < 100 ||
          Number(part.depth) > maxShelfDepth + EPSILON ||
          (!isAdjustableShelf(code) &&
            !close(part.depth, baselineShelfDepth))) {
        return error("One of the shelves no longer fits the verified depth layout.");
      }
    }

    // All drawers remain anchored to the front, retaining their full
    // customized size. Reject unrecognized front positions or protrusions.
    if (isDrawerPart(code)) {
      const isHandle = code.endsWith("-HDL");
      const isFront = code.endsWith("-F");
      if (isHandle && !close(Number(part.z) + Number(part.depth), minZ + depth)) {
        return error("A drawer handle is not aligned with the cabinet front.");
      }
      if (isFront && !close(Number(part.z), minZ + depth - 35)) {
        return error("A drawer front is not aligned with the cabinet.");
      }
      if (!isFront && !isHandle &&
          (Number(part.z) < minZ + 26 ||
           Number(part.z) + Number(part.depth) > minZ + depth - 30)) {
        return error("A drawer body cannot fit inside this cabinet depth.");
      }
    }

    // The bottom shelves move, but cannot contact drawer assemblies or
    // user-adjusted shelves. Preserve at least 120 mm beneath contents.
    if (!isBaseShelf(code) && !isCabinetSide(code) && !isDivider(code) &&
        code !== "WRC-BACK" && code !== "WRC-B3-LEDGE-SUP" &&
        Number(part.y) + Number(part.height) > baseY - 120 &&
        // The default raised ledge support may touch the base by design.
        !isRod(code)) {
      return error("Not enough room below the furniture parts for a safe base shelf.");
    }
  }

  const extents = {
    minZ: Math.min(...parts.map((p) => Number(p.z))),
    maxZ: Math.max(...parts.map((p) => Number(p.z) + Number(p.depth))),
    minY: Math.min(...parts.map((p) => Number(p.y))),
    maxY: Math.max(...parts.map((p) => Number(p.y) + Number(p.height))),
  };
  if (!close(extents.maxZ - extents.minZ, depth) ||
      !close(extents.maxY - extents.minY, height)) {
    return error("The stored furniture bounds do not match its frame size.");
  }
  return {
    ok: true,
    width: widthSupport.width,
    height,
    depth,
    minHeight: MIN_HEIGHT_MM,
    maxHeight: MAX_HEIGHT_MM,
    minDepth: MIN_DEPTH_MM,
    maxDepth: MAX_DEPTH_MM,
    policy: "Provisional dimensions. All final sizes need shop review.",
  };
};

// Keep top-mounted shelves, rods and drawers in position; move the four base
// shelves downward or upward and extend the raised-ledge support to meet them.
export const planCustomerWardrobeHeight = (parts = [], targetHeight) => {
  const support = getCustomerWardrobeHeightDepthSupport(parts);
  if (!support.ok) return support;
  const wanted = Number(targetHeight);
  if (!Number.isSafeInteger(wanted) || wanted < support.minHeight ||
      wanted > support.maxHeight) {
    return error(`Height must be between ${support.minHeight} and ${support.maxHeight} mm.`);
  }
  const diff = wanted - support.height;
  const next = parts.map((part) => {
    const code = hdCodeOf(part);
    if (isCabinetSide(code) || isDivider(code) || code === "WRC-BACK" ||
        code === "WRC-B3-LEDGE-SUP") {
      return { ...part, height: Number(part.height) + diff };
    }
    if (isBaseShelf(code)) return { ...part, y: Number(part.y) + diff };
    return { ...part };
  });
  const check = getCustomerWardrobeHeightDepthSupport(next);
  if (!check.ok || !close(check.height, wanted) ||
      !close(check.width, support.width) || !close(check.depth, support.depth)) {
    return error(check.error || "Height change does not fit the wardrobe structure.");
  }
  return { ok: true, parts: next, height: wanted, policy: support.policy };
};

// Extend frame depth and fixed shelves without scaling their thickness.
// Move the WHOLE drawer assembly along the Z axis with the front. This is
// especially important for drawers a customer already shortened to 400 mm.
export const planCustomerWardrobeDepth = (parts = [], targetDepth) => {
  const support = getCustomerWardrobeHeightDepthSupport(parts);
  if (!support.ok) return support;
  const wanted = Number(targetDepth);
  if (!Number.isSafeInteger(wanted) || wanted < support.minDepth ||
      wanted > support.maxDepth) {
    return error(`Depth must be between ${support.minDepth} and ${support.maxDepth} mm.`);
  }
  const diff = wanted - support.depth;
  const minZ = Number(findPart(parts, "B3-LEDGE").z);

  const next = parts.map((part) => {
    const code = hdCodeOf(part);
    if (isCabinetSide(code) || isDivider(code) ||
        code === "WRC-B3-LEDGE" || code === "WRC-B3-LEDGE-SUP") {
      return { ...part, depth: Number(part.depth) + diff };
    }
    if (isCabinetShelf(code)) {
      // Preserve user-adjusted shelf depths if they still fit; only standard
      // baseline shelves follow the cabinet front.
      const standard = close(part.depth, support.depth - 68);
      const proposedDepth = standard ? Number(part.depth) + diff : Number(part.depth);
      if (proposedDepth > wanted - 44 + EPSILON) {
        return { ...part, depth: proposedDepth }; // validation will reject atomically
      }
      return { ...part, depth: proposedDepth };
    }
    if (isDrawerPart(code)) return { ...part, z: Number(part.z) + diff };
    if (isRod(code)) {
      // Deterministic half-depth move avoids rounding drift on Undo/Redo.
      const offset = code === "WRC-B3-ROD" &&
        Math.abs(Number(part.z) - (minZ + 414 +
          Math.floor((support.depth - 620) / 2))) <= EPSILON
        ? 414 : 362;
      return {
        ...part,
        z: minZ + offset + Math.floor((wanted - 620) / 2),
      };
    }
    return { ...part };
  });

  const check = getCustomerWardrobeHeightDepthSupport(next);
  if (!check.ok || !close(check.depth, wanted) ||
      !close(check.width, support.width) || !close(check.height, support.height)) {
    return error(check.error || "Depth change does not fit the wardrobe structure.");
  }
  return { ok: true, parts: next, depth: wanted, policy: support.policy };
};
