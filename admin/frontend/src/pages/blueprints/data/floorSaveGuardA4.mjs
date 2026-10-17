/**
 * WISDOM A4: last-chance Save guard for Admin Blueprint designs.
 *
 * Validate the current scene against the SAVED scene, not against the visual
 * grid and not against every legacy part. A changed/new part must fit the
 * workspace. Untouched, pre-existing out-of-bounds parts remain untouched.
 *
 * An existing Admin-reviewed manual construction scene must be re-reviewed
 * before any review-sensitive change is saved. The backend alone decides
 * whether to accept a new review; this helper never grants customer resizing.
 */
import { validateBlueprintCabinetRebuild } from './floorWorkspaceA3B2A.mjs';

const fail = (code, error) => ({ ok: false, code, error });
const REVIEW_FIELDS = [
  'id', 'type', 'assemblyId', 'groupId', 'groupType', 'parentPartId',
  'partRole', 'assemblyRole', 'partCode', 'partFunction', 'doorHinge',
  'motionGroupId', 'motionReferencePartId',
  'x', 'y', 'z', 'width', 'height', 'depth',
  'rotationX', 'rotationY', 'rotationZ',
  'rotation_x', 'rotation_y', 'rotation_z',
  'visible', 'is_deleted', 'isReference', 'isHumanReference',
  'profileKind', 'profilePlane', 'profileRadius', 'chamferSize',
  'profileContourPoints', 'profileContourBulges', 'profileCutouts',
  'profileEdgeNotches', 'profileFilletRadius', 'woodworkingOperations',
  'machiningPlane', 'machiningCutouts', 'machiningVersion',
];
const stableValue = value => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, stableValue(value[key])]));
  return value;
};
const comparableParts = parts => JSON.stringify(parts.map(part => {
  const entry = {};
  for (const field of REVIEW_FIELDS) {
    if (part?.[field] !== undefined) entry[field] = stableValue(part[field]);
  }
  return entry;
}).sort((a, b) => String(a.id ?? '').localeCompare(String(b.id ?? ''))));

export function validateBlueprintSaveA4({
  savedDesignData, nextComponents, worldSize, floorOffset = 40,
  stagedManualReviewU4 = null,
} = {}) {
  if (!Array.isArray(nextComponents))
    return fail('INVALID_SCENE', 'Cannot save: Blueprint parts are invalid.');

  const before = Array.isArray(savedDesignData?.components)
    ? savedDesignData.components : [];
  const floor = validateBlueprintCabinetRebuild({
    before,
    after: nextComponents,
    worldWidth: worldSize?.w,
    worldDepth: worldSize?.d,
    floorComponentY: Number(worldSize?.h) - Number(floorOffset),
  });
  if (!floor.ok) return { ...floor, reason: 'INVALID_FLOOR_PLACEMENT' };

  const reviewed = savedDesignData?.manualConstructionReviewU4;
  if (reviewed?.status === 'geometry_reviewed' && !stagedManualReviewU4 &&
      comparableParts(before) !== comparableParts(nextComponents)) {
    return fail('REVIEW_RECHECK_REQUIRED',
      'This Blueprint has a saved Furniture Size Review. The furniture structure or position changed. Open Furniture Size Review and re-review the updated parts before saving, to avoid silently invalidating the existing review.');
  }

  return { ok: true, checkedParts: floor.checkedParts };
}
