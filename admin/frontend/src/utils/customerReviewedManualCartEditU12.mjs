/**
 * U12: Restore sub-mm U4 reviewed geometry lost by older Cart normalizers.
 * This is NOT an authorization bypass: the source and profile must come from
 * the freshly server-verified Customer Blueprint GET response. Every saved
 * physical part must match a newly planned, reviewed W/H/D shape exactly or
 * its legacy whole-mm rounding. Anything else stays Size Protected.
 */
import { previewUniversalManualConstructionResize } from './universalManualConstructionU1.mjs';

const AXES = ['width', 'height', 'depth'];
const GEOMETRY = ['x', 'y', 'z', ...AXES];
const IDENTITY = [
  'partCode', 'type', 'partRole', 'assemblyId', 'groupId',
  'parentPartId', 'partFunction', 'doorHinge',
  'motionGroupId', 'motionReferencePartId', 'material', 'wood_type',
];
const numeric = v => typeof v === 'number' && Number.isFinite(v);
const same = (a,b) => String(a ?? '') === String(b ?? '');
const geomMatch = (saved, expected) => numeric(saved) && numeric(expected) &&
  (Math.abs(saved - expected) <= 0.051 ||
    (Number.isSafeInteger(saved) && saved === Math.round(expected)));
const fail = reason => ({ ok: false, reason });

export function restoreReviewedManualCartGeometryU12(authorization, savedParts, dimensions) {
  if (authorization?.verified !== true || authorization?.previewOnly !== true ||
      authorization?.profile?.status !== 'draft' ||
      authorization?.profile?.customerResizable !== false ||
      authorization?.profile?.approval !== 'not_reviewed' ||
      !Array.isArray(authorization.sourceParts) || !Array.isArray(savedParts) ||
      savedParts.length !== authorization.sourceParts.length ||
      savedParts.length < 2 || savedParts.length > 300)
    return fail('Missing verified U4 source or matching Cart parts');

  const requested = {};
  for (const axis of AXES) {
    const value = dimensions?.[axis];
    if (!Number.isSafeInteger(value) || value <= 0)
      return fail('Invalid saved size');
    requested[axis] = value;
  }
  const planned = previewUniversalManualConstructionResize(
    authorization.sourceParts, authorization.profile, requested,
  );
  if (!planned.ok || !Array.isArray(planned.parts))
    return fail('Saved dimensions are not supported by verified review');

  const byId = new Map(planned.parts.map(p => [String(p.id), p]));
  if (byId.size !== planned.parts.length) return fail('Duplicate reviewed part IDs');
  const ids = new Set();
  const restored = [];
  for (const saved of savedParts) {
    if (!saved || typeof saved !== 'object' || Array.isArray(saved))
      return fail('Invalid Cart part');
    const id = String(saved.id || '');
    if (!id || ids.has(id) || !byId.has(id)) return fail('Cart part identities changed');
    ids.add(id);
    const expected = byId.get(id);
    if (IDENTITY.some(key => !same(saved[key],expected[key])) ||
        Number(saved.qty ?? 1) !== Number(expected.qty ?? 1) ||
        ['rotationX','rotationY','rotationZ'].some(key =>
          !numeric(Number(saved[key] ?? 0)) || Number(saved[key] ?? 0) !== Number(expected[key] ?? 0)))
      return fail('Cart construction identity changed');
    if (GEOMETRY.some(key => !geomMatch(saved[key],expected[key])))
      return fail('Cart geometry differs from the reviewed resize');
    restored.push({
      ...saved,
      ...Object.fromEntries(GEOMETRY.map(key => [key,expected[key]])),
    });
  }
  return { ok: true, parts: restored, dimensions: requested };
}
