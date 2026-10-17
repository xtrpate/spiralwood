/**
 * WISDOM A3B1: validate newly generated physical parts before scene insertion.
 * Pure guard. Does not move/clamp parts, mutate React state, or touch saved designs.
 * Existing Blueprint workspace: x 0..worldWidth, z 0..worldDepth.
 * Physical floor in saved Y coordinates: bottom <= floorComponentY.
 */
import { getRotatedComponentBounds3D } from './rotationBounds.js';

const EPS = 1e-6;
const fail = (code, error, id = null) => ({
  ok: false, code, error, ...(id ? { id } : {}),
});
const finite = value => typeof value === 'number' && Number.isFinite(value);
const physical = part => part?.type !== 'reference_proxy' &&
  part?.isReference !== true && part?.isHumanReference !== true &&
  part?.visible !== false && Number(part?.is_deleted || 0) !== 1;

export function validateBlueprintGeneratedParts({
  parts, worldWidth, worldDepth, floorComponentY,
} = {}) {
  if (![worldWidth, worldDepth, floorComponentY].every(finite) ||
      worldWidth <= 0 || worldDepth <= 0 || floorComponentY <= 0)
    return fail('INVALID_WORKSPACE', 'Blueprint workspace dimensions are invalid.');
  if (!Array.isArray(parts) || !parts.length)
    return fail('NO_NEW_PARTS', 'There are no new furniture parts to place.');

  const seen = new Set();
  for (const part of parts) {
    if (!part || typeof part !== 'object' || !String(part.id ?? '').trim())
      return fail('INVALID_PART', 'Generated furniture part is missing an identity.');
    if (seen.has(part.id))
      return fail('DUPLICATE_PART', 'Generated furniture contains duplicate part IDs.', part.id);
    seen.add(part.id);
    if (!physical(part)) continue;
    if (['x','y','z','width','height','depth'].some(key => !finite(part[key])) ||
        ['width','height','depth'].some(key => part[key] <= 0) ||
        ['rotationX','rotationY','rotationZ'].some(key => part[key] != null && !finite(part[key])))
      return fail('INVALID_PART_GEOMETRY', 'Generated furniture has invalid dimensions or coordinates.', part.id);
    const bounds = getRotatedComponentBounds3D(part);
    if (!bounds || ![bounds.minX,bounds.maxX,bounds.minZ,bounds.maxZ,bounds.maxY].every(finite))
      return fail('INVALID_PART_GEOMETRY', 'Cannot calculate generated furniture bounds.', part.id);
    if (bounds.minX < -EPS || bounds.maxX > worldWidth + EPS ||
        bounds.minZ < -EPS || bounds.maxZ > worldDepth + EPS)
      return fail('PART_OUTSIDE_FLOOR', 'Cannot place furniture outside the blue floor. Choose another position or move other furniture first.', part.id);
    if (bounds.maxY > floorComponentY + EPS)
      return fail('PART_BELOW_FLOOR', 'Cannot place furniture below the blue floor.', part.id);
  }
  return {ok: true, partCount: parts.length};
}
