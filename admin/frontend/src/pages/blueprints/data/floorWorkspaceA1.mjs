/**
 * WISDOM A1 — pure, read-only geometry planning for the Admin Blueprint floor.
 * Coordinates here are saved component coordinates: x=0..worldWidth,
 * z=0..worldDepth. The 3D viewer maps those to a floor centered at world (0,0).
 *
 * No React state, 3D meshes, Save, Customer permissions, or database writes.
 * Consumers must explicitly commit the returned per-part x/z updates, once,
 * through the editor's existing history and change pipeline.
 */
import { getRotatedComponentBounds3D } from './rotationBounds.js';

const EPS = 1e-6;
const fail = (code, message) => ({ ok: false, code, error: message });
const isFiniteNumber = value => typeof value === 'number' && Number.isFinite(value);
const realPart = part => part && part.type !== 'reference_proxy' &&
  part.isReference !== true && part.isHumanReference !== true &&
  part.visible !== false && Number(part.is_deleted || 0) !== 1;

export function getBlueprintFloorWorkspace({ worldWidth, worldDepth } = {}) {
  if (!isFiniteNumber(worldWidth) || !isFiniteNumber(worldDepth) ||
      worldWidth <= 0 || worldDepth <= 0) {
    return fail('INVALID_WORKSPACE', 'Blueprint floor width and depth must be positive numbers.');
  }
  return {
    ok: true, minX: 0, maxX: worldWidth, minZ: 0, maxZ: worldDepth,
    centerX: worldWidth / 2, centerZ: worldDepth / 2,
    width: worldWidth, depth: worldDepth,
  };
}

function boxOf(part) {
  if (!realPart(part) || !String(part.id ?? '').trim() ||
      !['x', 'y', 'z', 'width', 'height', 'depth'].every(k => isFiniteNumber(part[k])) ||
      ['width', 'height', 'depth'].some(k => part[k] <= 0) ||
      ['rotationX', 'rotationY', 'rotationZ'].some(k =>
        part[k] != null && !isFiniteNumber(part[k]))) return null;
  return getRotatedComponentBounds3D(part);
}

export function getBlueprintFootprint(parts) {
  if (!Array.isArray(parts) || !parts.length)
    return fail('NO_PARTS', 'Select furniture parts first.');
  const boxes = parts.map(boxOf);
  if (boxes.some(box => !box))
    return fail('INVALID_PART_GEOMETRY', 'One or more selected parts have invalid geometry or are not furniture parts.');
  const minX = Math.min(...boxes.map(b => b.minX));
  const maxX = Math.max(...boxes.map(b => b.maxX));
  const minZ = Math.min(...boxes.map(b => b.minZ));
  const maxZ = Math.max(...boxes.map(b => b.maxZ));
  return {ok: true, minX, maxX, minZ, maxZ,
    centerX: (minX + maxX) / 2, centerZ: (minZ + maxZ) / 2,
    width: maxX - minX, depth: maxZ - minZ};
}

function insideFloor(box, floor) {
  return box.minX >= floor.minX - EPS && box.maxX <= floor.maxX + EPS &&
    box.minZ >= floor.minZ - EPS && box.maxZ <= floor.maxZ + EPS;
}

export function checkBlueprintFloorPlacement({ parts, worldWidth, worldDepth } = {}) {
  const floor = getBlueprintFloorWorkspace({ worldWidth, worldDepth });
  if (!floor.ok) return floor;
  const footprint = getBlueprintFootprint(parts);
  if (!footprint.ok) return footprint;
  return insideFloor(footprint, floor)
    ? { ok: true, footprint, floor }
    : fail('OUTSIDE_FLOOR', 'At least one furniture part extends beyond the Blueprint floor workspace.');
}

const groupKey = part => String(part.assemblyId || part.groupId || '').trim();

function validateSelection(components, selectedIds) {
  if (!Array.isArray(components) || !Array.isArray(selectedIds) || !selectedIds.length)
    return fail('NO_SELECTION', 'Select the furniture parts you want to center first.');
  const selected = new Set(selectedIds);
  if (selected.size !== selectedIds.length ||
      selectedIds.some(id => typeof id !== 'string' || !id.trim()))
    return fail('INVALID_SELECTION', 'Selection must contain unique, valid furniture part IDs.');
  const byId = new Map();
  for (const part of components) {
    if (!part?.id || byId.has(part.id))
      return fail('INVALID_SCENE', 'Blueprint scene has missing or duplicate part IDs.');
    byId.set(part.id, part);
  }
  if ([...selected].some(id => !byId.has(id)))
    return fail('INVALID_SELECTION', 'A selected part is no longer in this Blueprint.');
  const parts = [...selected].map(id => byId.get(id));
  if (parts.some(part => !realPart(part)))
    return fail('NON_FURNITURE_SELECTION', 'Select only visible physical furniture parts.');
  if (parts.some(part => part.locked === true))
    return fail('LOCKED_SELECTION', 'Unlock selected furniture parts before centering.');

  // Selection is explicit. Never silently select all parts in the whole scene.
  // If grouping metadata is available, do not detach a partial furniture group
  // or move two distinct groups as though they were one assembled furniture.
  const keys = new Set(parts.map(groupKey).filter(Boolean));
  if (keys.size > 1)
    return fail('MULTIPLE_ASSEMBLIES', 'Select only one furniture assembly at a time.');
  if (keys.size === 1) {
    const [key] = keys;
    if (parts.some(p => !groupKey(p) || groupKey(p) !== key))
      return fail('MIXED_SELECTION', 'Do not mix grouped and ungrouped furniture parts.');
    const missing = components.some(p => realPart(p) && groupKey(p) === key && !selected.has(p.id));
    if (missing)
      return fail('INCOMPLETE_ASSEMBLY', 'Select the whole furniture assembly before centering.');
  }
  return {ok: true, parts, selected};
}

// Strictly positive X/Z overlap; edge-touching is allowed. AABB is deliberately
// conservative for rotated panels so the utility does not approve a collision.
function overlapsFootprint(a, b) {
  return Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX) > EPS &&
    Math.min(a.maxZ, b.maxZ) - Math.max(a.minZ, b.minZ) > EPS;
}

/**
 * Returns a movement proposal only. Does NOT change components or the camera.
 * A1 does not guarantee ungrouped manual selections form a complete assembly;
 * the editor must require the Admin to explicitly select those parts.
 */
export function planBlueprintAutoCenter({
  components, selectedIds, worldWidth, worldDepth,
} = {}) {
  const floor = getBlueprintFloorWorkspace({ worldWidth, worldDepth });
  if (!floor.ok) return floor;
  const selection = validateSelection(components, selectedIds);
  if (!selection.ok) return selection;
  const bounds = getBlueprintFootprint(selection.parts);
  if (!bounds.ok) return bounds;
  if (bounds.width > floor.width + EPS || bounds.depth > floor.depth + EPS)
    return fail('FURNITURE_TOO_LARGE', 'Selected furniture is larger than the Blueprint floor.');

  const deltaX = floor.centerX - bounds.centerX;
  const deltaZ = floor.centerZ - bounds.centerZ;
  const next = {
    minX: bounds.minX + deltaX, maxX: bounds.maxX + deltaX,
    minZ: bounds.minZ + deltaZ, maxZ: bounds.maxZ + deltaZ,
  };
  if (!insideFloor(next, floor))
    return fail('OUTSIDE_FLOOR', 'Centered furniture would extend beyond the floor boundary.');

  for (const part of components) {
    if (selection.selected.has(part.id) || !realPart(part)) continue;
    const box = boxOf(part);
    if (!box) return fail('INVALID_SCENE', 'Other furniture has invalid geometry; centering is blocked.');
    if (overlapsFootprint(next, box))
      return fail('CENTER_OCCUPIED', 'Another furniture part is occupying the center of the Blueprint floor.');
  }

  const unchanged = Math.abs(deltaX) <= EPS && Math.abs(deltaZ) <= EPS;
  const updatesById = {};
  if (!unchanged) for (const part of selection.parts) {
    updatesById[part.id] = { x: part.x + deltaX, z: part.z + deltaZ };
  }
  return {ok: true, unchanged, updatesById, deltaX, deltaZ,
    selectedCount: selection.parts.length, originalBounds: bounds, nextBounds: next};
}
