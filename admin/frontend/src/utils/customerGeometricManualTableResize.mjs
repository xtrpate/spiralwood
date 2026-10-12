/**
 * WISDOM G2: Reusable geometric recognition for new hand-built five-part tables.
 * Not keyed to Blueprint ID, dimensions, position or randomly generated part codes.
 * Fail-closed for unverified/complex assemblies; provisional structural limits.
 * Admin still checks tabletop span, material strength and joinery before production.
 */
const LIMITS = Object.freeze({
  width: Object.freeze([500, 1600]),
  height: Object.freeze([550, 950]),
  depth: Object.freeze([450, 1300]),
});
const EPS = 0.05;
const fail = (error = 'This hand-built furniture layout is not verified for automatic resizing.') => ({ ok: false, error });
const near = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= EPS;
const numberField = (part, field) => {
  const raw = part?.[field];
  return (typeof raw === 'number' && Number.isFinite(raw)) ||
    (typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw)));
};
const n = (part, key) => Number(part[key]);
const zeroRotation = part => ['rotationX','rotationY','rotationZ'].every(key => {
  if (part[key] == null) return true;
  if (!numberField(part, key)) return false;
  const degrees = ((n(part, key) % 360) + 360) % 360;
  return near(degrees, 0) || near(degrees, 360);
});
const physicalPart = part => part && typeof part === 'object' && !Array.isArray(part) &&
  ['x','y','z','width','height','depth'].every(key => numberField(part,key) &&
    (!['width','height','depth'].includes(key) || n(part,key) > 0));
const member = part => String(part.groupId || part.assemblyId || '').trim();

export function getCustomerGeometricManualTableSupport(parts = []) {
  if (!Array.isArray(parts) || parts.length !== 5) return fail();
  const ids = new Set(), codes = new Set();
  const tops = [], legs = [], members = new Set();
  for (const part of parts) {
    if (!physicalPart(part) || !zeroRotation(part) || part.locked === true ||
      part.visible === false || Number(part.is_deleted || 0) === 1 ||
      part.isReference === true || part.isHumanReference === true ||
      part.parentPartId ||
      (part.groupId && part.assemblyId && String(part.groupId) !== String(part.assemblyId)) ||
      (part.assemblyType && !['custom','assembly','manual_table'].includes(String(part.assemblyType))) ||
      (part.qty != null && (!Number.isSafeInteger(Number(part.qty)) || Number(part.qty) !== 1))) return fail();
    const id = String(part.id || '').trim();
    const code = String(part.partCode || '').trim();
    const material = String(part.material || part.wood_type || '').trim();
    if (!id || ids.has(id) || !code || codes.has(code) || !material) return fail();
    ids.add(id); codes.add(code); members.add(member(part));
    if (part.type === 'furniture_board_panel' && part.partRole === 'board_panel' && /^PNL-[A-Z0-9-]+$/i.test(code)) tops.push(part);
    else if (part.type === 'furniture_leg' && part.partRole === 'leg' && /^LEG-[A-Z0-9-]+$/i.test(code)) legs.push(part);
    else return fail();
  }
  // The entire table must be ungrouped OR belong to one coherent manual group.
  if (members.size !== 1 || tops.length !== 1 || legs.length !== 4) return fail();
  const top = tops[0];
  const x = n(top,'x'), y = n(top,'y'), z = n(top,'z');
  const width = n(top,'width'), depth = n(top,'depth'), thickness = n(top,'height');
  const sampleLeg = legs[0];
  const legWidth = n(sampleLeg,'width'), legDepth = n(sampleLeg,'depth');
  const legStartY = n(sampleLeg,'y'), legLength = n(sampleLeg,'height');
  const floorY = legStartY + legLength;
  const height = floorY - y;
  const overlap = y + thickness - legStartY;
  if (![width,depth,height].every(Number.isSafeInteger) ||
    Object.entries({width,height,depth}).some(([axis,value]) => value < LIMITS[axis][0] || value > LIMITS[axis][1]) ||
    thickness < 12 || thickness > 55 ||
    legWidth < 30 || legWidth > 120 || legDepth < 30 || legDepth > 120 ||
    legLength < 450 || legLength > 940 ||
    overlap < -EPS || overlap > thickness - 1 ||
    y < 0 || floorY <= legStartY) return fail();
  if (!legs.every(part => near(n(part,'width'),legWidth) && near(n(part,'depth'),legDepth) &&
    near(n(part,'height'),legLength) && near(n(part,'y'),legStartY))) return fail();

  const leftX = Math.min(...legs.map(part => n(part,'x')));
  const rightX = Math.max(...legs.map(part => n(part,'x')));
  const nearZ = Math.min(...legs.map(part => n(part,'z')));
  const farZ = Math.max(...legs.map(part => n(part,'z')));
  if (rightX - leftX < 200 || farZ - nearZ < 200) return fail();
  for (const [legX,legZ] of [[leftX,nearZ],[leftX,farZ],[rightX,nearZ],[rightX,farZ]]) {
    if (legs.filter(part => near(n(part,'x'),legX) && near(n(part,'z'),legZ)).length !== 1) return fail();
  }
  const insets = {
    left: leftX - x,
    right: x + width - rightX - legWidth,
    near: nearZ - z,
    far: z + depth - farZ - legDepth,
  };
  // Supports must fit underneath the tabletop. Require realistic overhangs;
  // horizontal clearance must remain after any proposed resize.
  if (Object.values(insets).some(value => value < -EPS || value > 300)) return fail();
  const minWidth = Math.max(LIMITS.width[0], Math.ceil(insets.left + insets.right + 2*legWidth + 200));
  const minDepth = Math.max(LIMITS.depth[0], Math.ceil(insets.near + insets.far + 2*legDepth + 200));
  if (minWidth > width || minDepth > depth) return fail();
  return {
    ok: true, geometricManualTable: true,
    width, height, depth, tabletopThickness: thickness,
    legWidth, legDepth, overlap, floorY, insets,
    minWidth, maxWidth: LIMITS.width[1],
    minHeight: LIMITS.height[0], maxHeight: LIMITS.height[1],
    minDepth, maxDepth: LIMITS.depth[1],
    policy: 'Geometry-only; Admin must review tabletop bending, leg joints, and production feasibility.',
  };
}

export function planCustomerGeometricManualTableResize(parts = [], axis, targetMm) {
  const before = getCustomerGeometricManualTableSupport(parts);
  if (!before.ok) return before;
  if (!Object.hasOwn(LIMITS, axis)) return fail('Unsupported dimension.');
  const wanted = Number(targetMm);
  const min = before['min' + axis[0].toUpperCase() + axis.slice(1)];
  const max = before['max' + axis[0].toUpperCase() + axis.slice(1)];
  if (!Number.isSafeInteger(wanted) || wanted < min || wanted > max) {
    return fail(`${axis[0].toUpperCase()+axis.slice(1)} must be ${min}-${max} mm.`);
  }
  const delta = wanted - before[axis];
  if (!delta) return {ok:true, parts:parts.map(part => ({...part})), [axis]:wanted, unchanged:true};
  const leftX = Math.min(...parts.filter(p => p.partRole === 'leg').map(p => n(p,'x')));
  const nearZ = Math.min(...parts.filter(p => p.partRole === 'leg').map(p => n(p,'z')));
  const next = parts.map(part => {
    const p = {...part};
    const top = part.partRole === 'board_panel';
    if (axis === 'width') {
      if (top) p.width = n(part,'width') + delta;
      else if (n(part,'x') > leftX + EPS) p.x = n(part,'x') + delta;
    } else if (axis === 'depth') {
      if (top) p.depth = n(part,'depth') + delta;
      else if (n(part,'z') > nearZ + EPS) p.z = n(part,'z') + delta;
    } else if (axis === 'height') {
      p.y = n(part,'y') - delta;
      if (!top) p.height = n(part,'height') + delta;
    }
    return p;
  });
  const after = getCustomerGeometricManualTableSupport(next);
  if (!after.ok || after[axis] !== wanted ||
    ['width','height','depth'].some(other => other !== axis && after[other] !== before[other]) ||
    !near(before.tabletopThickness,after.tabletopThickness) ||
    !near(before.legWidth,after.legWidth) || !near(before.legDepth,after.legDepth) ||
    !near(before.floorY,after.floorY) || !near(before.overlap,after.overlap) ||
    Object.keys(before.insets).some(k => !near(before.insets[k],after.insets[k]))) {
    return fail('Resizing would disturb the tabletop/leg attachment or floor contact.');
  }
  return {ok:true,parts:next,[axis]:wanted,policy:after.policy};
}
