'use strict';

// C7-1: Publication-data integrity only. This is NOT a manufacturing approval,
// structural fit certification, or authorization for customer resizing.
function isRealFurniturePart(part) {
  if (!part || typeof part !== 'object' || Array.isArray(part)) return false;
  const type = String(part.type || '').trim().toLowerCase();
  return type !== 'reference_proxy' && type !== 'human_reference' &&
    !type.startsWith('reference_') && part.isReference !== true &&
    part.isHumanReference !== true;
}

// design_data and view_3d_data commonly serialize the SAME components.
// Choose the primary scene rather than concatenating and falsely flagging IDs.
function selectCanonicalPublicationScene(designParts = [], viewParts = []) {
  const design = Array.isArray(designParts) ? designParts : [];
  const view = Array.isArray(viewParts) ? viewParts : [];
  return design.some(isRealFurniturePart) ? design : view;
}

function validateBlueprintPublicationParts(sceneParts = []) {
  const issues = [];
  const add = (code, message, partId = null) => {
    if (issues.length < 25) issues.push({ code, message, partId });
  };
  if (!Array.isArray(sceneParts)) {
    return { ok: false, issues: [{ code: 'INVALID_SCENE', message: 'Saved Blueprint parts must be an array.', partId: null }] };
  }
  const parts = sceneParts.filter(isRealFurniturePart);
  if (parts.length === 0) {
    add('NO_PRODUCTION_PARTS', 'No real production parts are available to publish.');
  }

  const seenIds = new Set();
  for (let index = 0; index < parts.length && issues.length < 25; index += 1) {
    const part = parts[index];
    const id = String(part.id ?? '').trim();
    const ref = id || `part-${index + 1}`;
    const partCode = String(part.partCode ?? part.part_code ?? '').trim();
    const material = String(part.material ?? part.wood_type ?? '').trim();
    if (!id) add('MISSING_PART_ID', 'A production part is missing its stable ID.', ref);
    else if (seenIds.has(id)) add('DUPLICATE_PART_ID', 'A production part ID is duplicated.', ref);
    else seenIds.add(id);
    if (!partCode) add('MISSING_PART_CODE', 'A production part needs a traceable Part Code.', ref);
    if (!material) add('MISSING_MATERIAL', 'A production part needs an actual material.', ref);

    for (const axis of ['width', 'height', 'depth']) {
      const raw = part[axis];
      const n = Number(raw);
      if (raw == null || String(raw).trim() === '' || !Number.isFinite(n) || n <= 0) {
        add('INVALID_PART_DIMENSION', `Production part ${axis} must be greater than zero (mm).`, ref);
      }
    }
    for (const axis of ['x', 'y', 'z']) {
      const raw = part[axis];
      if (raw == null || String(raw).trim() === '' || !Number.isFinite(Number(raw))) {
        add('INVALID_PART_POSITION', `Production part ${axis} position must be a finite number.`, ref);
      }
    }
    const rawQty = part.qty;
    if (rawQty == null || String(rawQty).trim() === '' ||
        !Number.isSafeInteger(Number(rawQty)) || Number(rawQty) < 1) {
      add('INVALID_PART_QUANTITY', 'Production part quantity must be a positive whole number.', ref);
    }
  }
  return { ok: issues.length === 0, issues };
}

module.exports = {
  isRealFurniturePart,
  selectCanonicalPublicationScene,
  validateBlueprintPublicationParts,
};
