/**
 * WISDOM U3 - Admin-only, nonpersistent 3D geometry preview.
 * This revalidates U2's full Admin review against the ORIGINAL scene for every
 * preview. It does NOT authorize saving, publication or customer resizing.
 */
import { reviewManualConstructionDraftU2 } from './universalManualReviewU2.mjs';
import { previewUniversalManualConstructionResize } from './universalManualConstructionU1.mjs';

const fail = (code, error) => ({ ok:false, code, error, previewOnly:true, customerResizable:false });
const AXES = ['width','height','depth'];
const isInt = value => typeof value === 'number' && Number.isSafeInteger(value);

export function planUniversalManualAdminPreviewU3(components, reviewSettings, requestedDimensions) {
  if (!requestedDimensions || typeof requestedDimensions !== 'object' || Array.isArray(requestedDimensions) ||
    Object.keys(requestedDimensions).length !== AXES.length ||
    AXES.some(axis => !isInt(requestedDimensions[axis]))) {
    return fail('INVALID_PREVIEW_DIMENSIONS', 'Enter whole-mm Width, Height and Depth before previewing.');
  }
  const reviewed = reviewManualConstructionDraftU2(components, reviewSettings);
  if (!reviewed.ok) return fail(reviewed.code || 'REVIEW_BLOCKED', reviewed.error || 'Complete U2 validation first.');
  const preview = previewUniversalManualConstructionResize(components, reviewed.draftProfile, requestedDimensions);
  if (!preview.ok) return fail(preview.code || 'PREVIEW_REJECTED', preview.error || 'The requested geometry is not supported.');
  // detached geometry; caller must render these in the viewer but NEVER write them
  // to the live Admin components state, history, Save or Publish payload.
  return {
    ok:true,
    previewOnly:true,
    customerResizable:false,
    parts:preview.parts,
    dimensions:preview.dimensions,
    partCount:preview.parts.length,
    warning:'ADMIN PREVIEW ONLY — changes are not saved, published or usable by Customer.',
  };
}
