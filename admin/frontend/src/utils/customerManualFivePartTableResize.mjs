/**
 * WISDOM | Manual five-part table resizing (geometry only).
 *
 * Eligible only when a single manually placed tabletop and four identical,
 * axis-aligned, freestanding legs form a consistent rectangular 2x2 layout.
 * The tabletop thickness, leg cross-sections, 4 independent asymmetrical
 * insets, existing tabletop/leg overlap, and feet-to-floor elevation remain
 * invariant. Never automatically infer or insert braces/joinery.
 *
 * Provisional dimensional envelope for this supported manual construction.
 * This is NOT a furniture strength assessment or manufacturing certification.
 * Admin must review actual joinery/support and the final quotation.
 */
const LIMITS = Object.freeze({
  width: Object.freeze([900, 1250]),
  height: Object.freeze([650, 800]),
  depth: Object.freeze([850, 1150]),
});
const TOLERANCE_MM = 0.05;
const CODES = Object.freeze({ top: /^PNL-[A-Z0-9-]+$/i, leg: /^LEG-[A-Z0-9-]+$/i });
const fail = (error = 'This manual table layout has not been verified for size changes.') => ({ ok: false, error });
const close = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= TOLERANCE_MM;
const mm = (part, field) => Number(part[field]);
const hasNumber = (part, field) => {
  const raw = part[field];
  return (typeof raw === 'number' && Number.isFinite(raw)) ||
    (typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw)));
};
const zeroRotation = part => ['rotationX', 'rotationY', 'rotationZ'].every(field => {
  if (part[field] == null) return true;
  if (!hasNumber(part, field)) return false;
  const degrees = ((mm(part, field) % 360) + 360) % 360;
  return close(degrees, 0) || close(degrees, 360);
});
const measuredPart = part => part && typeof part === 'object' && !Array.isArray(part) &&
  ['x', 'y', 'z', 'width', 'height', 'depth'].every(field =>
    hasNumber(part, field) && (!['width', 'height', 'depth'].includes(field) || mm(part, field) > 0));

export function getCustomerManualFivePartTableSupport(parts = []) {
  if (!Array.isArray(parts) || parts.length !== 5) return fail();
  const ids = new Set();
  const codes = new Set();
  const tops = [];
  const legs = [];
  for (const part of parts) {
    if (!measuredPart(part) || !zeroRotation(part) || part.locked === true ||
      part.visible === false || Number(part.is_deleted ?? 0) === 1 ||
      part.isReference === true || part.isHumanReference === true ||
      part.groupId || part.assemblyId || part.parentPartId ||
      part.assemblyType ||
      (part.qty != null && (!Number.isSafeInteger(Number(part.qty)) || Number(part.qty) !== 1))) {
      return fail();
    }
    const id = String(part.id ?? '').trim();
    const code = String(part.partCode ?? '').trim();
    const material = String(part.material ?? part.wood_type ?? '').trim();
    if (!id || ids.has(id) || !code || codes.has(code) || !material) return fail();
    ids.add(id);
    codes.add(code);
    if (part.type === 'furniture_board_panel' && part.partRole === 'board_panel' && CODES.top.test(code)) {
      tops.push(part);
    } else if (part.type === 'furniture_leg' && part.partRole === 'leg' && CODES.leg.test(code)) {
      legs.push(part);
    } else return fail();
  }
  if (tops.length !== 1 || legs.length !== 4) return fail();
  const top = tops[0];
  const t = mm(top, 'height');
  const width = mm(top, 'width');
  const depth = mm(top, 'depth');
  // Manual table #288 uses a 9-mm inset overlap between legs and tabletop.
  // Reject zero-contact / detached / fully overlapping legs.
  if (t < 12 || t > 45 || !Number.isSafeInteger(width) || !Number.isSafeInteger(depth)) return fail();
  const leg = legs[0];
  const section = mm(leg, 'width');
  const topY = mm(top, 'y');
  const legY = mm(leg, 'y');
  const legLength = mm(leg, 'height');
  const height = legY + legLength - topY;
  const overlap = topY + t - legY;
  if (!Number.isSafeInteger(height) ||
    section < 40 || section > 100 || !close(mm(leg, 'depth'), section) ||
    overlap < 3 || overlap > t - 3 || legLength < 500 ||
    Object.entries({ width, height, depth }).some(([axis, n]) => n < LIMITS[axis][0] || n > LIMITS[axis][1])) return fail();
  const leftX = Math.min(...legs.map(p => mm(p, 'x')));
  const rightX = Math.max(...legs.map(p => mm(p, 'x')));
  const backZ = Math.min(...legs.map(p => mm(p, 'z')));
  const frontZ = Math.max(...legs.map(p => mm(p, 'z')));
  if (rightX - leftX < 400 || frontZ - backZ < 400) return fail();
  const combinations = [
    [leftX, backZ], [leftX, frontZ], [rightX, backZ], [rightX, frontZ],
  ];
  for (const [x, z] of combinations) {
    const matching = legs.filter(p => close(mm(p, 'x'), x) && close(mm(p, 'z'), z));
    if (matching.length !== 1) return fail();
  }
  if (!legs.every(p => close(mm(p, 'width'), section) && close(mm(p, 'depth'), section) &&
    close(mm(p, 'height'), legLength) && close(mm(p, 'y'), legY))) return fail();

  const insets = {
    left: leftX - mm(top, 'x'),
    right: mm(top, 'x') + width - rightX - section,
    back: backZ - mm(top, 'z'),
    front: mm(top, 'z') + depth - frontZ - section,
  };
  if (Object.values(insets).some(value => value < 10 || value > 250)) return fail();
  if (insets.left + insets.right + 2 * section >= LIMITS.width[0] ||
    insets.front + insets.back + 2 * section >= LIMITS.depth[0]) return fail();
  return {
    ok: true, manualFivePart: true,
    width, height, depth, tabletopThickness: t, legSection: section,
    overlap, insets,
    minWidth: LIMITS.width[0], maxWidth: LIMITS.width[1],
    minHeight: LIMITS.height[0], maxHeight: LIMITS.height[1],
    minDepth: LIMITS.depth[0], maxDepth: LIMITS.depth[1],
    policy: 'Geometry-only sizing; Admin must verify tabletop support, leg joinery, and final production feasibility.',
  };
}

export function planCustomerManualFivePartTableResize(parts = [], axis, targetMm) {
  const before = getCustomerManualFivePartTableSupport(parts);
  if (!before.ok) return before;
  if (!Object.prototype.hasOwnProperty.call(LIMITS, axis)) return fail('Unsupported dimension.');
  if (!Number.isSafeInteger(targetMm) || targetMm < LIMITS[axis][0] || targetMm > LIMITS[axis][1]) {
    const label = axis.charAt(0).toUpperCase() + axis.slice(1);
    return fail(`${label} must be ${LIMITS[axis][0]}-${LIMITS[axis][1]} mm.`);
  }
  const delta = targetMm - before[axis];
  if (delta === 0) return { ok: true, parts: parts.map(part => ({ ...part })), [axis]: targetMm, unchanged: true };
  const top = parts.find(p => p.partRole === 'board_panel');
  const leftX = Math.min(...parts.filter(p => p.partRole === 'leg').map(p => Number(p.x)));
  const backZ = Math.min(...parts.filter(p => p.partRole === 'leg').map(p => Number(p.z)));
  const nextParts = parts.map(part => {
    const next = { ...part };
    if (axis === 'width') {
      if (part === top) next.width = Number(part.width) + delta;
      else if (Number(part.x) > leftX + TOLERANCE_MM) next.x = Number(part.x) + delta;
    } else if (axis === 'depth') {
      if (part === top) next.depth = Number(part.depth) + delta;
      else if (Number(part.z) > backZ + TOLERANCE_MM) next.z = Number(part.z) + delta;
    } else if (axis === 'height') {
      // Hold the four feet on the original floor elevation.
      next.y = Number(part.y) - delta;
      if (part !== top) next.height = Number(part.height) + delta;
    }
    return next;
  });
  const after = getCustomerManualFivePartTableSupport(nextParts);
  if (!after.ok || after[axis] !== targetMm ||
    ['width', 'height', 'depth'].some(other => other !== axis && after[other] !== before[other]) ||
    Object.entries(before.insets).some(([key, n]) => !close(n, after.insets[key])) ||
    !close(after.overlap, before.overlap) ||
    !close(after.tabletopThickness, before.tabletopThickness) ||
    !close(after.legSection, before.legSection)) {
    return fail('The resize would break this manual table\'s checked part alignment.');
  }
  return { ok: true, parts: nextParts, [axis]: targetMm, policy: after.policy };
}
