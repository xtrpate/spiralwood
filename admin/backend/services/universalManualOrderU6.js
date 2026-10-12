"use strict";
/**
 * WISDOM U6 — server-side authorization of geometry for a CUSTOM QUOTATION REQUEST.
 * Does not certify woodworking/joinery, set prices, release stock or approve production.
 * Applies only to a Blueprint with a present, independently-verified U4 profile.
 */
const path = require('path');
const { pathToFileURL } = require('url');
const { checkStoredManualReviewForPublish } = require('./universalManualReviewU4');
const engineUrl = pathToFileURL(path.resolve(__dirname,
  '../../frontend/src/utils/universalManualConstructionU1.mjs')).href;
const AXES = ['width', 'height', 'depth'];
const GEOMETRY = ['x', 'y', 'z', 'width', 'height', 'depth'];
const STABLE_TEXT = ['partCode', 'type', 'partRole', 'groupId', 'assemblyId',
  'assemblyType', 'parentPartId', 'partFunction', 'doorHinge', 'motionGroupId',
  'motionReferencePartId'];
const MAX_PARTS = 300;
const fail = (code) => ({ ok: false, code, message: 'The reviewed manual furniture has changed or contains invalid geometry. Reopen Customer Customize and review the design.' });
const near = (a,b) => typeof a === 'number' && typeof b === 'number' &&
  Number.isFinite(a) && Number.isFinite(b) && Math.abs(a-b)<=0.051;
const id = x => String(x ?? '').trim();
const norm = x => String(x ?? '').trim();
const rotation = (p,k) => p[k] == null ? 0 : Number(p[k]);

function equalPart(canonical, submitted) {
  if (id(canonical.id) !== id(submitted.id)) return false;
  if (STABLE_TEXT.some(key => norm(canonical[key]) !== norm(submitted[key]))) return false;
  if (GEOMETRY.some(key => !near(canonical[key], submitted[key]))) return false;
  if (['rotationX','rotationY','rotationZ'].some(k => !near(rotation(canonical,k), rotation(submitted,k)))) return false;
  if (Number(canonical.qty ?? 1) !== Number(submitted.qty ?? 1)) return false;
  if (submitted.locked === true || submitted.visible === false || Number(submitted.is_deleted || 0) === 1 ||
      submitted.isReference === true || submitted.isHumanReference === true) return false;
  return true;
}

function snapshotDimensionsAgree(item, wanted) {
  if (norm(item.unit).toLowerCase() !== 'mm') return false;
  if (!AXES.every(axis => Number.isSafeInteger(item[axis]) && item[axis] === wanted[axis])) return false;
  const dimensions = item.customization_snapshot;
  if (dimensions != null && (typeof dimensions !== 'object' || Array.isArray(dimensions))) return false;
  // U10: both supported snapshot representations must agree with the
  // verified top-level dimensions. A correct *_mm value cannot excuse a
  // conflicting plain value (such as width: 999, width_mm: 850).
  for (const axis of AXES) {
    for (const field of [axis, `${axis}_mm`]) {
      const supplied = dimensions?.[field];
      if (supplied != null && (!Number.isSafeInteger(supplied) || supplied !== wanted[axis])) return false;
    }
  }
  return true;
}

/** Verify one request against DB-sourced parts/profile, never client-supplied profile.
 * Checks CURRENT order snapshot before any order row or upload is stored. */
async function authorizeUniversalManualOrderU6({ designData, item } = {}) {
  if (!designData || typeof designData !== 'object' || Array.isArray(designData))
    return fail('BLUEPRINT_INVALID');
  const review = designData.manualConstructionReviewU4;
  if (review == null) return { ok: true, applies: false }; // Legacy/template workflows unchanged.
  const original = designData.components;
  const submitted = item?.editor_snapshot?.components;
  if (!Array.isArray(original) || !Array.isArray(submitted) || original.length < 2 ||
      original.length > MAX_PARTS || submitted.length !== original.length)
    return fail('PART_COUNT');

  const verified = await checkStoredManualReviewForPublish({parts:original,savedReview:review});
  if (verified.ok !== true || verified.hasReview !== true ||
      review.draftProfile?.status !== 'draft' ||
      review.draftProfile?.customerResizable !== false ||
      review.draftProfile?.approval !== 'not_reviewed') return fail('REVIEW_STALE');

  const target = Object.fromEntries(AXES.map(axis => [axis,item[axis]]));
  if (!snapshotDimensionsAgree(item,target)) return fail('DIMENSIONS_MISMATCH');
  const { previewUniversalManualConstructionResize } = await import(engineUrl);
  const planned = previewUniversalManualConstructionResize(original,review.draftProfile,target);
  if (!planned.ok || !Array.isArray(planned.parts) || planned.parts.length !== submitted.length)
    return fail(planned.code || 'GEOMETRY_REJECTED');

  const expected = new Map(planned.parts.map(p => [id(p.id),p]));
  if (expected.size !== submitted.length || new Set(submitted.map(p => id(p?.id))).size !== submitted.length ||
      submitted.some(p => !p || !equalPart(expected.get(id(p.id)) || {},p)))
    return fail('SNAPSHOT_MISMATCH');

  return { ok:true, applies:true, dimensions:target, partCount:submitted.length };
}
module.exports={ authorizeUniversalManualOrderU6 };
