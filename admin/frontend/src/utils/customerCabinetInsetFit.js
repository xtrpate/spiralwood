// CUST-B3A — exact Blueprint #271 10-part cabinet snapshot only.
// Provisional INSET geometry preview; not a general cabinet resizer or
// approval of physical hinge/reveal tolerances. Admin master is untouched.
const BASE_PARTS = Object.freeze({
  'CB-SIDE-L': ['wr_side_panel', 'left_side_panel', 200, 2284, 160, 18, 876, 610],
  'CB-SIDE-R': ['wr_side_panel', 'right_side_panel', 1082, 2284, 160, 18, 876, 610],
  'CB-TOP': ['wr_top_panel', 'top_panel', 218, 2284, 160, 864, 18, 610],
  'CB-BOT': ['wr_bottom_panel', 'bottom_panel', 218, 3042, 160, 864, 18, 610],
  'CB-BACK': ['wr_back_panel', 'back_panel', 218, 2302, 160, 864, 740, 6],
  'CB-TOE-KICK': ['cabinet_toe_kick', 'toe_kick', 218, 3060, 702, 864, 100, 18],
  'CB-SH-01': ['wr_shelf', 'shelf', 220, 2560, 180, 860, 20, 600],
  'CB-SH-02': ['wr_shelf', 'shelf', 220, 2860, 180, 860, 20, 600],
  'CAB-DOOR-L': ['door_front_panel', 'door', 230, 2310, 760, 415, 820, 20],
  'CAB-DOOR-R': ['door_front_panel', 'door', 655, 2310, 760, 415, 820, 20],
});
const DIMENSIONS = ['x', 'y', 'z', 'width', 'height', 'depth'];
const CORRECTIONS = Object.freeze({
  'CB-SIDE-L': { depth: 620 },
  'CB-SIDE-R': { depth: 620 },
  'CB-TOP': { depth: 620 },
  'CB-BOT': { depth: 620 },
  'CB-SH-01': { depth: 578 },
  'CB-SH-02': { depth: 578 },
  'CAB-DOOR-L': { y: 2305, height: 734 },
  'CAB-DOOR-R': { y: 2305, height: 734 },
});
const codeOf = p => String(p?.partCode || '').trim().toUpperCase();
const equal = (a, b) => Number.isFinite(Number(a)) && Number(a) === b;
const fail = (message = 'This cabinet snapshot is not verified for inset-fit correction.') =>
  ({ ok: false, error: message });
const expectedFor = (code, corrected) => {
  const [type, partRole, ...values] = BASE_PARTS[code];
  const base = Object.fromEntries(DIMENSIONS.map((key, index) => [key, values[index]]));
  return { type, partRole, ...base, ...(corrected ? CORRECTIONS[code] : null) };
};

const matches = (parts, corrected) => {
  if (!Array.isArray(parts) || parts.length !== 10) return false;
  const ids = new Set();
  const seenCodes = new Set();
  for (const part of parts) {
    if (!part || !part.id || ids.has(part.id)) return false;
    ids.add(part.id);
    const code = codeOf(part);
    if (!Object.prototype.hasOwnProperty.call(BASE_PARTS, code) || seenCodes.has(code)) return false;
    seenCodes.add(code);
    const expect = expectedFor(code, corrected);
    if (String(part.type || '').toLowerCase() !== expect.type ||
        DIMENSIONS.some(key => !equal(part[key], expect[key])) ||
        ['rotationX','rotationY','rotationZ'].some(key => !equal(part[key] ?? 0, 0))) {
      return false;
    }
  }
  // Customer Viewer currently loads Cabinet #271 with every partRole blank,
  // while the published blueprint fixture has valid partRole values.
  // Allow *only* these two complete role layouts after checking ALL exact
  // codes, types, positions, dimensions, rotations and unique component IDs.
  // Mixed or unexpected nonempty roles must still fail closed.
  const allRolesBlank = parts.every(part => String(part.partRole ?? '').trim() === '');
  const allRolesVerified = parts.every(part =>
    String(part.partRole ?? '').trim().toLowerCase() === expectedFor(codeOf(part), corrected).partRole);
  return seenCodes.size === 10 && (allRolesBlank || allRolesVerified);
};
const bounds = parts => ({
  minX: Math.min(...parts.map(p => Number(p.x))),
  maxX: Math.max(...parts.map(p => Number(p.x) + Number(p.width))),
  minY: Math.min(...parts.map(p => Number(p.y))),
  maxY: Math.max(...parts.map(p => Number(p.y) + Number(p.height))),
  minZ: Math.min(...parts.map(p => Number(p.z))),
  maxZ: Math.max(...parts.map(p => Number(p.z) + Number(p.depth))),
});
const overlap = (a, b) => DIMENSIONS.slice(0, 3).every((axis, i) => {
  const dimension = ['width','height','depth'][i];
  return Math.min(Number(a[axis]) + Number(a[dimension]), Number(b[axis]) + Number(b[dimension])) >
    Math.max(Number(a[axis]), Number(b[axis]));
});
const hasClosedDoorCollision = parts => {
  const doors = parts.filter(p => codeOf(p).startsWith('CAB-DOOR-'));
  return doors.some(door => parts.some(part => part !== door && overlap(door, part)));
};

export function getCustomerCabinetInsetFitSupport(parts = []) {
  if (matches(parts, false)) return {
    ok: true, needsCorrection: true, width: 900, height: 876, depth: 620,
    policy: 'Provisional inset geometry; Admin must validate hinge hardware and manufacture tolerances.',
  };
  if (matches(parts, true)) return {
    ok: true, needsCorrection: false, width: 900, height: 876, depth: 620,
    policy: 'Provisional inset geometry; Admin must validate hinge hardware and manufacture tolerances.',
  };
  return fail();
}

export function planCustomerCabinetInsetFit(parts = []) {
  const support = getCustomerCabinetInsetFitSupport(parts);
  if (!support.ok) return support;
  if (!support.needsCorrection) return fail('Inset fit is already applied to this cabinet.');
  const candidate = parts.map(p => ({ ...p, ...(CORRECTIONS[codeOf(p)] || {}) }));
  const after = getCustomerCabinetInsetFitSupport(candidate);
  const a = bounds(parts);
  const b = bounds(candidate);
  if (!after.ok || after.needsCorrection || Object.keys(a).some(k => a[k] !== b[k]) ||
      a.maxX - a.minX !== 900 || a.maxY - a.minY !== 876 || a.maxZ - a.minZ !== 620 ||
      hasClosedDoorCollision(candidate) ||
      candidate.some((p, i) => p.id !== parts[i].id || p.material !== parts[i].material ||
        p.finish !== parts[i].finish || p.finish_id !== parts[i].finish_id ||
        p.woodFinish !== parts[i].woodFinish || p.finish_color !== parts[i].finish_color)) {
    return fail('Inset fit failed geometry or protected material/finish validation.');
  }
  return {
    ok: true, parts: candidate, width: 900, height: 876, depth: 620,
    policy: after.policy,
  };
}
