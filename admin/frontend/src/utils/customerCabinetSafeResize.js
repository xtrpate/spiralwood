// CUST-B3: Manufacturing-geometry-preserving resizing for the verified
// 10-part Base Cabinet only. No generic scaling, no metadata edits.
// Dimensions remain provisional until the shop verifies materials and hinges.
const LIMITS = Object.freeze({ width: [800, 1000], height: [820, 930], depth: [550, 650] });
const TYPES = Object.freeze({
  'CB-SIDE-L': 'wr_side_panel', 'CB-SIDE-R': 'wr_side_panel',
  'CB-TOP': 'wr_top_panel', 'CB-BOT': 'wr_bottom_panel',
  'CB-BACK': 'wr_back_panel', 'CB-TOE-KICK': 'cabinet_toe_kick',
  'CB-SH-01': 'wr_shelf', 'CB-SH-02': 'wr_shelf',
  'CAB-DOOR-L': 'door_front_panel', 'CAB-DOOR-R': 'door_front_panel',
});
const PANEL = 18;
const SHELF = 20;
const BACK = 6;
const TOE_HEIGHT = 100;
const TOE_SETBACK = 50;
const REVEAL = 10;
const GAP = 10;
const DOOR = 20;
const SHELF_REAR_OFFSET = 20;
const SHELF_SIDE_OFFSET = 20;
const REAR_SHELF_CLEARANCE = 2;
const TOLERANCE = 0.05;
const value = (item, key) => Number(item[key]);
const close = (a, b) => Number.isFinite(Number(a)) && Number.isFinite(Number(b)) &&
  Math.abs(Number(a) - Number(b)) <= TOLERANCE;
const codeOf = (part) => String(part?.partCode || '').trim().toUpperCase();
const fail = (error = 'Only the verified 10-part Base Cabinet supports safe resizing.') => ({ ok: false, error });
const fits = (part, expected) => Object.entries(expected).every(([key, expectedValue]) =>
  close(value(part, key), expectedValue));

export function getCustomerCabinetResizeSupport(parts = []) {
  if (!Array.isArray(parts) || parts.length !== 10) return fail();
  const mapped = new Map();
  const ids = new Set();
  const groups = new Set();
  for (const part of parts) {
    const code = codeOf(part);
    if (!part || !Object.prototype.hasOwnProperty.call(TYPES, code) ||
      mapped.has(code) || !part.id || ids.has(String(part.id)) ||
      String(part.type || '') !== TYPES[code] ||
      String(part.assemblyType || '') !== 'base_cabinet' ||
      part.locked === true) return fail();
    const group = String(part.groupId || part.assemblyId || '').trim();
    if (!group || (part.groupId && part.assemblyId && part.groupId !== part.assemblyId)) return fail();
    if (!['x', 'y', 'z', 'width', 'height', 'depth'].every((key) =>
      Number.isFinite(value(part, key)) &&
      (['width', 'height', 'depth'].includes(key) ? value(part, key) > 0 : true))) return fail();
    if (!['rotationX', 'rotationY', 'rotationZ'].every((key) => close(part[key] || 0, 0))) return fail();
    groups.add(group);
    mapped.set(code, part);
    ids.add(String(part.id));
  }
  if (groups.size !== 1 || mapped.size !== 10) return fail();
  const get = (key) => mapped.get(key);
  const left = get('CB-SIDE-L'), right = get('CB-SIDE-R');
  const top = get('CB-TOP'), bottom = get('CB-BOT'), back = get('CB-BACK');
  const toe = get('CB-TOE-KICK');
  const shelves = [get('CB-SH-01'), get('CB-SH-02')];
  const doorLeft = get('CAB-DOOR-L'), doorRight = get('CAB-DOOR-R');
  const x = value(left, 'x'), y = value(left, 'y'), z = value(left, 'z');
  const width = value(right, 'x') + value(right, 'width') - x;
  const height = value(left, 'height'), depth = value(left, 'depth');
  if (Object.entries({ width, height, depth }).some(([axis, n]) =>
    !Number.isSafeInteger(n) || n < LIMITS[axis][0] || n > LIMITS[axis][1])) return fail();
  const innerW = width - PANEL * 2;
  const bottomY = y + height - TOE_HEIGHT - PANEL;
  const cavityY = y + PANEL;
  const cavityHeight = bottomY - cavityY;
  const frontZ = z + depth;
  const doorWidth = (innerW - 2 * REVEAL - GAP) / 2;
  const doorY = cavityY + REVEAL;
  const doorHeight = cavityHeight - 2 * REVEAL;
  const doorRearZ = frontZ - DOOR;
  if (doorWidth < 120 || doorHeight < 200 || cavityHeight < 250) return fail();
  if (!fits(left, { width: PANEL, depth }) ||
      !fits(right, { x: x + width - PANEL, y, z, width: PANEL, height, depth }) ||
      !fits(top, { x: x + PANEL, y, z, width: innerW, height: PANEL, depth }) ||
      !fits(bottom, { x: x + PANEL, y: bottomY, z, width: innerW, height: PANEL, depth }) ||
      !fits(back, { x: x + PANEL, y: cavityY, z, width: innerW,
        height: cavityHeight, depth: BACK }) ||
      !fits(toe, { x: x + PANEL, y: bottomY + PANEL,
        z: frontZ - TOE_SETBACK - PANEL, width: innerW,
        height: TOE_HEIGHT, depth: PANEL })) return fail();
  for (const [i, shelf] of shelves.entries()) {
    if (!fits(shelf, { x: x + SHELF_SIDE_OFFSET,
      z: z + SHELF_REAR_OFFSET, width: width - 2 * SHELF_SIDE_OFFSET,
      height: SHELF, depth: depth - SHELF_REAR_OFFSET - DOOR - REAR_SHELF_CLEARANCE })) return fail();
    if (value(shelf, 'z') + value(shelf, 'depth') > doorRearZ - REAR_SHELF_CLEARANCE + TOLERANCE ||
      value(shelf, 'x') < x + PANEL ||
      value(shelf, 'x') + value(shelf, 'width') > x + width - PANEL + TOLERANCE) return fail();
    const previousEnd = i === 0 ? cavityY : value(shelves[i - 1], 'y') + SHELF;
    if (value(shelf, 'y') - previousEnd < 120) return fail('Cabinet shelf clearance is too small.');
  }
  if (bottomY - (value(shelves[1], 'y') + SHELF) < 120) return fail('Cabinet bottom clearance is too small.');
  if (!fits(doorLeft, { x: x + PANEL + REVEAL, y: doorY, z: doorRearZ,
        width: doorWidth, height: doorHeight, depth: DOOR }) ||
      !fits(doorRight, { x: x + PANEL + REVEAL + doorWidth + GAP,
        y: doorY, z: doorRearZ, width: doorWidth, height: doorHeight, depth: DOOR }) ||
      doorLeft.doorHinge !== 'left' || doorRight.doorHinge !== 'right' ||
      doorLeft.partFunction !== 'door' || doorRight.partFunction !== 'door') return fail();
  return {
    ok: true, width, height, depth,
    minWidth: LIMITS.width[0], maxWidth: LIMITS.width[1],
    minHeight: LIMITS.height[0], maxHeight: LIMITS.height[1],
    minDepth: LIMITS.depth[0], maxDepth: LIMITS.depth[1],
    policy: 'Provisional custom cabinet sizing; Admin verifies materials, hinges and quotation.',
  };
}

export function planCustomerCabinetResize(parts = [], axis, targetMm) {
  const before = getCustomerCabinetResizeSupport(parts);
  if (!before.ok) return before;
  if (!Object.prototype.hasOwnProperty.call(LIMITS, axis)) return fail('Unsupported dimension.');
  const wanted = Number(targetMm);
  if (!Number.isSafeInteger(wanted) || wanted < LIMITS[axis][0] || wanted > LIMITS[axis][1]) {
    return fail(`${axis.charAt(0).toUpperCase() + axis.slice(1)} must be ${LIMITS[axis][0]}-${LIMITS[axis][1]} mm.`);
  }
  if (wanted === before[axis]) return { ok: true, parts: parts.map(p => ({ ...p })), [axis]: wanted, unchanged: true };
  const delta = wanted - before[axis];
  const left = parts.find(p => codeOf(p) === 'CB-SIDE-L');
  const bottom = parts.find(p => codeOf(p) === 'CB-BOT');
  const cavityTop = value(left, 'y') + PANEL;
  const cavityHeight = value(bottom, 'y') - cavityTop;
  const nextDoorWidth = (wanted - 2 * PANEL - 2 * REVEAL - GAP) / 2;
  const next = parts.map(part => {
    const p = { ...part };
    const code = codeOf(p);
    if (axis === 'width') {
      if (code === 'CB-SIDE-R') p.x = value(p, 'x') + delta;
      if (['CB-TOP', 'CB-BOT', 'CB-BACK', 'CB-TOE-KICK', 'CB-SH-01', 'CB-SH-02'].includes(code)) p.width = value(p, 'width') + delta;
      if (code === 'CAB-DOOR-L' || code === 'CAB-DOOR-R') p.width = nextDoorWidth;
      if (code === 'CAB-DOOR-R') p.x = value(left, 'x') + PANEL + REVEAL + nextDoorWidth + GAP;
    } else if (axis === 'height') {
      if (code === 'CB-SIDE-L' || code === 'CB-SIDE-R') p.height = value(p, 'height') + delta;
      if (code === 'CB-BACK' || code === 'CAB-DOOR-L' || code === 'CAB-DOOR-R') p.height = value(p, 'height') + delta;
      if (code === 'CB-BOT' || code === 'CB-TOE-KICK') p.y = value(p, 'y') + delta;
      if (code === 'CB-SH-01' || code === 'CB-SH-02') {
        p.y = Math.round(cavityTop + (value(p, 'y') - cavityTop) * (cavityHeight + delta) / cavityHeight);
      }
    } else if (axis === 'depth') {
      if (['CB-SIDE-L', 'CB-SIDE-R', 'CB-TOP', 'CB-BOT', 'CB-SH-01', 'CB-SH-02'].includes(code)) p.depth = value(p, 'depth') + delta;
      if (code === 'CB-TOE-KICK' || code === 'CAB-DOOR-L' || code === 'CAB-DOOR-R') p.z = value(p, 'z') + delta;
    }
    return p;
  });
  const after = getCustomerCabinetResizeSupport(next);
  if (!after.ok || after[axis] !== wanted ||
      ['width', 'height', 'depth'].some(k => k !== axis && after[k] !== before[k])) {
    return fail(after.error || 'Cabinet assembly changed outside the verified geometry.');
  }
  if (next.some((p, i) => ['id','partCode','type','assemblyId','groupId',
      'material','wood_type','finish','finish_id','woodFinish','finish_color',
      'grainDirection','doorHinge','partFunction','partRole'].some(k => p[k] !== parts[i][k]))) {
    return fail('Cabinet sizing changed protected identity, material or finish metadata.');
  }
  return { ok: true, parts: next, [axis]: wanted, policy: after.policy };
}
