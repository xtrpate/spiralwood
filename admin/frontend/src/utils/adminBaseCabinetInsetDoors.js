// WISDOM ADM-B3B: explicit read-only plan for a two-shelf base cabinet inset door pair.
// The plan NEVER mutates input components; physical hinge/edge clearance still needs Admin review.
const mm = (v) => Number(Number(v).toFixed(3));
const numeric = (v) => Number(v);
const approx = (a, b, tolerance = 0.05) => Math.abs(numeric(a) - numeric(b)) <= tolerance;
const failure = (reason) => ({ supported: false, reason });

export function planBaseCabinetInsetPair(items, settings = {}) {
  if (!Array.isArray(items) || ![8, 10].includes(items.length)) {
    return failure('Inset Pair requires exactly the 8-part two-shelf Base Cabinet (or its existing 2-door version).');
  }
  const expected = {
    'CB-SIDE-L': 'wr_side_panel',
    'CB-SIDE-R': 'wr_side_panel',
    'CB-TOP': 'wr_top_panel',
    'CB-BOT': 'wr_bottom_panel',
    'CB-BACK': 'wr_back_panel',
    'CB-TOE-KICK': 'cabinet_toe_kick',
  };
  const normalizedCode = (item) => String(item?.partCode || '').toUpperCase().trim();
  const isSupportedShelfCode = (code) => /^(?:CB-SH0[12]|CB-SH-0[12]|CB-SH-1-0[12])$/.test(code);
  const parts = new Map();
  for (const part of items) {
    const code = normalizedCode(part);
    if (!part || parts.has(code) || !part.id) return failure('Duplicate or missing part identity.');
    if (!Object.values(part).length) return failure('Invalid Cabinet part data.');
    if (!['base_cabinet', ''].includes(String(part.assemblyType || '').toLowerCase())) {
      return failure('Only Base Cabinet assemblies support this inset-fit layout.');
    }
    const expectedType = expected[code];
    if (expectedType) {
      if (String(part.type || '').toLowerCase() !== expectedType) return failure(`Incorrect ${code} part type.`);
    } else if (isSupportedShelfCode(code)) {
      if (String(part.type || '').toLowerCase() !== 'wr_shelf') return failure('Unexpected shelf type.');
    } else if (!['CAB-DOOR-L', 'CAB-DOOR-R'].includes(code) || String(part.type || '').toLowerCase() !== 'door_front_panel') {
      return failure(`Unexpected component ${code || '(missing code)'}; inset adjustment blocked.`);
    }
    for (const f of ['x', 'y', 'z', 'width', 'height', 'depth']) {
      if (!Number.isFinite(numeric(part[f])) || (['width','height','depth'].includes(f) && numeric(part[f]) <= 0)) {
        return failure(`${code} has invalid ${f}.`);
      }
    }
    parts.set(code, part);
  }
  if (Object.keys(expected).some((code) => !parts.has(code))) return failure('Cabinet shell or two shelves are missing.');
  if (items.length === 10 && (!parts.has('CAB-DOOR-L') || !parts.has('CAB-DOOR-R'))) {
    return failure('Unexpected existing doors.');
  }
  const groups = new Set(items.map((p) => String(p.groupId || p.assemblyId || '').trim()));
  if (groups.size !== 1 || groups.has('')) return failure('Cabinet parts must belong to one identified assembly.');

  const left = parts.get('CB-SIDE-L');
  const right = parts.get('CB-SIDE-R');
  const top = parts.get('CB-TOP');
  const bottom = parts.get('CB-BOT');
  const back = parts.get('CB-BACK');
  const toe = parts.get('CB-TOE-KICK');
  const shelves = [...parts.values()].filter((item) => isSupportedShelfCode(normalizedCode(item))).sort((a,b) => numeric(a.y)-numeric(b.y));
  if (shelves.length !== 2) return failure('Exactly two recognized fixed shelves are required.');
  const shelfCodes = new Set(shelves.map(normalizedCode));
  if (!((shelfCodes.has('CB-SH01') && shelfCodes.has('CB-SH02')) ||
        (shelfCodes.has('CB-SH-01') && shelfCodes.has('CB-SH-02')) ||
        (shelfCodes.has('CB-SH-1-01') && shelfCodes.has('CB-SH-1-02')))) {
    return failure('Shelf codes are inconsistent with the supported Base Cabinet builders.');
  }
  const outerWidth = numeric(right.x) + numeric(right.width) - numeric(left.x);
  const outerHeight = numeric(left.height);
  const outerDepth = numeric(left.depth);
  const frontZ = numeric(left.z) + outerDepth;
  const carcassLeftX = numeric(left.x) + numeric(left.width);
  const carcassRightX = numeric(right.x);
  const sameFront = (p) => approx(numeric(p.z) + numeric(p.depth), frontZ);

  if (![left, right, top, bottom].every(sameFront) ||
      !approx(left.y, right.y) || !approx(left.y, top.y) ||
      !approx(left.z, right.z) || !approx(left.z, top.z) ||
      !approx(left.z, bottom.z) ||
      !approx(numeric(top.x), carcassLeftX) ||
      !approx(numeric(bottom.x), carcassLeftX) ||
      !approx(numeric(top.width), carcassRightX - carcassLeftX) ||
      !approx(numeric(bottom.width), carcassRightX - carcassLeftX) ||
      !approx(numeric(top.height), numeric(bottom.height)) ||
      !approx(numeric(left.width), numeric(right.width))) {
    return failure('Base Cabinet frame alignment differs from the verified builder structure.');
  }
  if (outerWidth < 300 || outerWidth > 1200 || outerHeight < 800 || outerHeight > 950 || outerDepth < 500 || outerDepth > 650 ||
      numeric(bottom.y) <= numeric(top.y) + numeric(top.height) + 150 ||
      numeric(bottom.y) + numeric(bottom.height) > numeric(left.y) + outerHeight + 0.05 ||
      numeric(back.z) < numeric(left.z) - 0.05 ||
      numeric(back.z) + numeric(back.depth) > frontZ - 30 ||
      numeric(toe.y) < numeric(bottom.y) - 0.05) {
    return failure('Base Cabinet physical opening/bounds do not match supported frame construction.');
  }

  const reveal = numeric(settings.reveal ?? 10);
  const centerGap = numeric(settings.centerGap ?? 10);
  const doorThickness = numeric(settings.doorThickness ?? 20);
  const rearClearance = 2; // provisional minimum planar clearance at closed doors
  if (![reveal, centerGap, doorThickness].every(Number.isFinite) ||
      reveal < 10 || reveal > 15 || centerGap < 6 || centerGap > 20 ||
      doorThickness < 12 || doorThickness > 25) {
    return failure('Inset Pair supports reveal 10–15 mm, center gap 6–20 mm, and door thickness 12–25 mm. Hinge selection still requires review.');
  }

  const openingWidth = carcassRightX - carcassLeftX;
  const eachDoorWidth = (openingWidth - 2 * reveal - centerGap) / 2;
  const doorStartY = numeric(top.y) + numeric(top.height) + reveal;
  const doorEndY = numeric(bottom.y) - reveal;
  const doorHeight = doorEndY - doorStartY;
  const doorRearZ = frontZ - doorThickness;
  if (eachDoorWidth < 120 || doorHeight < 150 || doorRearZ <= numeric(back.z) + numeric(back.depth) + 30) {
    return failure('Inset doors will not fit inside the real top/bottom cabinet opening.');
  }

  const shelfUpdates = [];
  for (const shelf of shelves) {
    if (numeric(shelf.x) < carcassLeftX - 0.05 ||
        numeric(shelf.x) - carcassLeftX > 10 ||
        numeric(shelf.x) + numeric(shelf.width) > carcassRightX + 0.05 ||
        carcassRightX - (numeric(shelf.x)+numeric(shelf.width)) > 10 ||
        numeric(shelf.y) <= numeric(top.y) + numeric(top.height) ||
        numeric(shelf.y) + numeric(shelf.height) >= numeric(bottom.y) ||
        numeric(shelf.z) < numeric(left.z) ||
        numeric(shelf.z) + numeric(shelf.depth) > frontZ + 0.05) {
      return failure('Shelf dimensions or placement differ from the supported two-shelf layout.');
    }
    const trimmedDepth = Math.min(numeric(shelf.depth), doorRearZ - rearClearance - numeric(shelf.z));
    if (trimmedDepth < 120) return failure('Not enough shelf depth after door-clearance correction.');
    if (numeric(shelf.z) + trimmedDepth > doorRearZ - rearClearance + 0.05) return failure('Shelf front clearance check failed.');
    shelfUpdates.push({ id: shelf.id, depth: mm(trimmedDepth) });
  }
  if (shelves[0].y >= shelves[1].y) return failure('Shelf levels must be ordered and distinct.');

  const firstX = carcassLeftX + reveal;
  const baseDoor = { y: mm(doorStartY), z: mm(doorRearZ), width: mm(eachDoorWidth), height: mm(doorHeight), depth: mm(doorThickness) };
  const doors = [
    { ...baseDoor, x: mm(firstX), doorLeaf: 'left', doorHinge: 'left', label: 'Cabinet Left Door', partCode: 'CAB-DOOR-L' },
    { ...baseDoor, x: mm(firstX + eachDoorWidth + centerGap), doorLeaf: 'right', doorHinge: 'right', label: 'Cabinet Right Door', partCode: 'CAB-DOOR-R' },
  ];
  return {
    supported: true,
    doors,
    shelfUpdates,
    measurements: { outerWidth: mm(outerWidth), outerHeight: mm(outerHeight), outerDepth: mm(outerDepth), openingHeight: mm(doorHeight), sideReveal: mm(reveal), centerGap: mm(centerGap), rearClearance },
  };
}
