"use strict";

// U4: Review preservation and backend re-check. Geometry REVIEW ONLY:
// this module never grants customer resizing, manufacturing approval, or
// changes to publication status. No SQL/schema changes.
const path = require('path');
const { pathToFileURL } = require('url');

const REVIEW_KEY = 'manualConstructionReviewU4';
const reviewerUrl = pathToFileURL(path.resolve(
  __dirname, '../../frontend/src/utils/universalManualReviewU2.mjs'
)).href;
const AXES = ['width', 'height', 'depth'];
const EDGES = ['start', 'end'];
const RULES = new Set(['min', 'max', 'center', 'quarter', 'three-quarter']);
const own = (obj, field) => Object.prototype.hasOwnProperty.call(obj, field);
const fail = (code, message) => ({ ok: false, code, message });
const stringify = (o) => JSON.stringify(o);
const clone = (o) => JSON.parse(stringify(o));

function strictSettings(input, parts) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      !input.rulesByPartId || !input.limits || !Array.isArray(input.confirmedPartIds) ||
      !input.pivots) return null;
  const ids = parts.map(p => String(p.id ?? '').trim());
  if (ids.some(id => !id) || new Set(ids).size !== ids.length ||
      input.confirmedPartIds.length !== ids.length ||
      new Set(input.confirmedPartIds.map(String)).size !== ids.length ||
      ids.some(id => !input.confirmedPartIds.includes(id)) ||
      Object.keys(input.rulesByPartId).length !== ids.length ||
      Object.keys(input.limits).length !== 3 ||
      Object.keys(input.pivots).length !== 3) return null;
  const rulesByPartId = {};
  for (const id of ids) {
    const partRules = input.rulesByPartId[id];
    if (!partRules || Object.keys(partRules).length !== 3) return null;
    const axes = {};
    for (const axis of AXES) {
      const pair = partRules[axis];
      if (!pair || Object.keys(pair).length !== 2 ||
          EDGES.some(edge => !RULES.has(pair[edge]))) return null;
      axes[axis] = { start: pair.start, end: pair.end };
    }
    rulesByPartId[id] = axes;
  }
  const limits = {};
  const pivots = {};
  for (const axis of AXES) {
    const range = input.limits[axis];
    if (!range || Object.keys(range).length !== 2 ||
        !Number.isSafeInteger(Number(range.min)) ||
        !Number.isSafeInteger(Number(range.max)) ||
        !String(range.min).trim() || !String(range.max).trim()) return null;
    limits[axis] = { min: Number(range.min), max: Number(range.max) };
    if (!['min', 'max', 'center'].includes(input.pivots[axis])) return null;
    pivots[axis] = input.pivots[axis];
  }
  return { rulesByPartId, limits, confirmedPartIds: ids, pivots };
}

async function reviewedResult(parts, settings) {
  const { reviewManualConstructionDraftU2 } = await import(reviewerUrl);
  return reviewManualConstructionDraftU2(parts, settings);
}

function ensureShape(incoming) {
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming))
    return fail('REVIEW_INVALID', 'Construction review must be an object.');
  if (own(incoming, 'customerResizable') && incoming.customerResizable !== false)
    return fail('PERMISSION_FORBIDDEN', 'A geometry review cannot grant Customer resizing.');
  return { ok: true };
}

/**
 * Validate an Admin-submitted review after the design_data JSON has been
 * normalized by mergeDesignData. The server, never the browser, builds the
 * canonical, non-customer profile and stamps the authenticated reviewer ID.
 */
async function normalizeManualReviewForSave({ parts, incoming, previous, actorId, now } = {}) {
  if (incoming == null) return { ok: true, value: null, action: 'none' };
  const shape = ensureShape(incoming);
  if (!shape.ok) return shape;
  if (!Array.isArray(parts) || parts.length > 300 || parts.length < 2)
    return fail('PART_COUNT', 'Review requires 2–300 physical parts.');

  if (incoming.status === 'submitted_for_review') {
    // Client claims that every checkbox was completed. We cannot certify a
    // human inspection; independently validate the complete geometry and all
    // 8 range corners under the authenticated Blueprint editor's identity.
    const settings = strictSettings(incoming.settings, parts);
    if (!settings) return fail('RULES_INVALID', 'Incomplete or unsupported per-part rules.');
    const test = await reviewedResult(parts, settings);
    if (!test.ok) return fail(test.code || 'GEOMETRY_REJECTED', test.error || 'Invalid construction geometry.');
    const reviewedBy = Number(actorId);
    if (!Number.isSafeInteger(reviewedBy) || reviewedBy <= 0)
      return fail('REVIEWER_INVALID', 'Authenticated editor identity is required.');
    return { ok: true, action: 'reviewed', value: {
      schemaVersion: 1,
      status: 'geometry_reviewed',
      customerResizable: false,
      approval: 'not_manufacturing_certified',
      reviewedBy,
      reviewedAt: now || new Date().toISOString(),
      cornerChecks: test.cornerChecks,
      settings,
      draftProfile: test.draftProfile,
    } };
  }

  // A previously saved review may be retained ONLY if its complete canonical
  // value is unchanged AND its original source geometry still matches.
  // A scene change removes the review instead of creating stale permission.
  if (incoming.status === 'geometry_reviewed') {
    if (!previous || stringify(incoming) !== stringify(previous))
      return fail('REVIEW_TAMPERED', 'Existing reviewed construction data was changed without a new Admin review.');
    const settings = strictSettings(previous.settings, parts);
    if (!settings) return { ok: true, action: 'invalidated', value: null };
    const test = await reviewedResult(parts, settings);
    if (!test.ok || stringify(test.draftProfile) !== stringify(previous.draftProfile))
      return { ok: true, action: 'invalidated', value: null };
    return { ok: true, action: 'retained', value: clone(previous) };
  }
  return fail('REVIEW_STATUS_INVALID', 'Unsupported construction review status.');
}

/** Reject publication of a *present* malformed review. Unreviewed manual
 * blueprints keep the existing C7 behavior and Customer Size Protection. */
async function checkStoredManualReviewForPublish({ parts, savedReview } = {}) {
  if (savedReview == null) return { ok: true, hasReview: false };
  if (!savedReview || savedReview.status !== 'geometry_reviewed' ||
      savedReview.customerResizable !== false ||
      savedReview.approval !== 'not_manufacturing_certified')
    return fail('REVIEW_STATUS_INVALID', 'Saved review is not a server-verified geometry-only review.');
  const check = await normalizeManualReviewForSave({ parts, incoming: savedReview, previous: savedReview });
  return check.ok && check.action === 'retained'
    ? { ok: true, hasReview: true }
    : fail('REVIEW_STALE', 'Blueprint geometry changed after its Admin construction review. Re-review before publishing.');
}

module.exports = { REVIEW_KEY, normalizeManualReviewForSave, checkStoredManualReviewForPublish };
