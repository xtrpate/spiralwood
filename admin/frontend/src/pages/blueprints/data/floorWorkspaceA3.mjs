/**
 * WISDOM A3A: pure Blueprint workspace containment helpers.
 * Axis-aligned bounds are rotation-aware (Three.js XYZ) via existing U rotation bounds.
 * Component coordinates: X=[0,W], Z=[0,D], Y floor bottom=H-floorOffset.
 * Three.js world coordinates: X=[-W/2,+W/2], Z=[-D/2,+D/2].
 * These functions have NO side effects and never mutate saved Blueprint components.
 */
import { getRotatedComponentBounds3D } from './rotationBounds.js';

const EPS = 1e-6;
const GEOMETRY_FIELDS = new Set([
  'x','y','z','width','height','depth','rotationX','rotationY','rotationZ',
  'rotation_x','rotation_y','rotation_z',
]);
const fail = (code,error, id) => ({ok:false,code,error, ...(id ? {id} : {})});
const isValid = value => typeof value === 'number' && Number.isFinite(value);
export const hasBlueprintFloorGeometryChange = attrs => attrs &&
  typeof attrs === 'object' && Object.keys(attrs).some(k => GEOMETRY_FIELDS.has(k));
const editablePhysicalPart = part => part && part.type !== 'reference_proxy' &&
  part.isReference !== true && part.isHumanReference !== true &&
  part.visible !== false && Number(part.is_deleted||0) !== 1;

/** Strictly validate the proposed new geometry of only the parts being edited.
 * Never block non-geometry edits to legacy blueprints that are already out of bounds.
 * For multi-part edits, reject the whole batch, NEVER clamp individual parts.
 */
export function validateBlueprintFloorEdits({
  components, updatesById, worldWidth, worldDepth, floorComponentY,
} = {}) {
  if (![worldWidth,worldDepth,floorComponentY].every(isValid) ||
      worldWidth <= 0 || worldDepth <= 0 || floorComponentY <= 0)
    return fail('INVALID_WORKSPACE','Blueprint floor dimensions are invalid.');
  if (!Array.isArray(components) || !updatesById || typeof updatesById !== 'object' || Array.isArray(updatesById))
    return fail('INVALID_EDITS','Blueprint component changes are invalid.');
  const byId = new Map(components.filter(p=>p?.id).map(p=>[p.id,p]));
  for (const [id, attrs] of Object.entries(updatesById)) {
    const previous = byId.get(id);
    if (!previous || !attrs || typeof attrs !== 'object' || Array.isArray(attrs))
      return fail('INVALID_EDIT_PART','Cannot find a valid part for this change.',id);
    if (!Object.keys(attrs).some(key => GEOMETRY_FIELDS.has(key))) continue;
    const next = {...previous,...attrs};
    if (!editablePhysicalPart(next)) continue;
    if (['x','y','z','width','height','depth'].some(k=>!isValid(next[k])) ||
        ['rotationX','rotationY','rotationZ'].some(k=>next[k] != null && !isValid(next[k])))
      return fail('INVALID_PART_GEOMETRY','Part has invalid position, size, or rotation.',id);
    const b = getRotatedComponentBounds3D(next);
    if (!b || ![b.minX,b.maxX,b.minZ,b.maxZ,b.maxY].every(Number.isFinite))
      return fail('INVALID_PART_GEOMETRY','Unable to calculate the part footprint.',id);
    if (b.minX < -EPS || b.maxX > worldWidth + EPS || b.minZ < -EPS || b.maxZ > worldDepth + EPS)
      return fail('PART_OUTSIDE_FLOOR','Furniture must stay inside the blue floor boundary.',id);
    if (b.maxY > floorComponentY + EPS)
      return fail('PART_BELOW_FLOOR','Furniture cannot sink below the blue floor.',id);
  }
  return {ok:true};
}

/** Correct a whole Three.js world-space AABB uniformly, preserving its assembly.
 * Caller applies dx/dz to ONE mesh or ONE multi-part pivot, not individual parts.
 * A floor-oversized group must be rejected without any movement.
 */
export function getWorldFloorXZCorrection({
  minX,maxX,minZ,maxZ,worldWidth,worldDepth,
} = {}) {
  if (![minX,maxX,minZ,maxZ,worldWidth,worldDepth].every(isValid) ||
      worldWidth <= 0 || worldDepth <= 0 || maxX < minX || maxZ < minZ)
    return fail('INVALID_FOOTPRINT','Cannot calculate the current furniture floor bounds.');
  if (maxX-minX > worldWidth+EPS || maxZ-minZ > worldDepth+EPS)
    return fail('FURNITURE_TOO_LARGE','Furniture is larger than the available blue floor.');
  let dx=0, dz=0;
  const xLow=-worldWidth/2, xHigh=worldWidth/2;
  const zLow=-worldDepth/2, zHigh=worldDepth/2;
  if (minX<xLow) dx=xLow-minX;
  else if (maxX>xHigh) dx=xHigh-maxX;
  if (minZ<zLow) dz=zLow-minZ;
  else if (maxZ>zHigh) dz=zHigh-maxZ;
  return {ok:true,dx,dz};
}
