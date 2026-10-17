/**
 * WISDOM A3B2-A: preflight full proposed furniture rebuilds.
 * Only NEW or geometry-CHANGED physical parts are tested; existing untouched
 * legacy furniture is not silently moved, rewritten, or invalidated.
 * Pure, no React dependencies or side effects.
 */
import { validateBlueprintGeneratedParts } from './floorWorkspaceA3B.mjs';

const GEOMETRY = [
  'x', 'y', 'z', 'width', 'height', 'depth',
  'rotationX', 'rotationY', 'rotationZ',
  'rotation_x', 'rotation_y', 'rotation_z',
];
const fail = (code, error, id) => ({
  ok: false, code, error, ...(id ? { id } : {}),
});
const key = p => String(p?.id ?? '').trim();
const needsCheck = (previous, next) => !previous ||
  previous.type !== next.type ||
  previous.visible !== next.visible ||
  previous.is_deleted !== next.is_deleted ||
  previous.isReference !== next.isReference ||
  previous.isHumanReference !== next.isHumanReference ||
  GEOMETRY.some(field => !Object.is(previous[field], next[field]));

/** Validate the final proposed array BEFORE any history/selection/setComponents.
 * Supports remove-only operations. Rejects duplicate IDs and corrupted changed
 * objects, while not blocking an unchanged pre-existing out-of-bounds part.
 */
export function validateBlueprintCabinetRebuild({
  before, after, worldWidth, worldDepth, floorComponentY,
} = {}) {
  if (!Array.isArray(before) || !Array.isArray(after))
    return fail('INVALID_REBUILD', 'Cannot validate the cabinet replacement.');
  const current = new Map(before.filter(p => p && key(p)).map(p => [key(p), p]));
  const visited = new Set();
  const edited = [];
  for (const part of after) {
    if (!part || typeof part !== 'object' || !key(part))
      return fail('INVALID_PART', 'A cabinet part has a missing identity.');
    const id = key(part);
    if (visited.has(id))
      return fail('DUPLICATE_PART', 'The cabinet replacement contains duplicate part IDs.', id);
    visited.add(id);
    if (needsCheck(current.get(id), part)) edited.push(part);
  }
  if (!edited.length) return { ok: true, checkedParts: 0 };
  const result = validateBlueprintGeneratedParts({
    parts: edited, worldWidth, worldDepth, floorComponentY,
  });
  if (!result.ok) return result;
  return { ok: true, checkedParts: edited.length };
}
