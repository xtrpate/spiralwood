/**
 * U13: enforce exact reviewed W/H/D when a Customer saves a Cart re-edit.
 *
 * The existing U12 verifier compares EVERY saved physical part to the newly
 * planned result from a freshly server-verified U4 review. Legacy whole-mm
 * snapped coordinates may be recovered, but arbitrary geometry and identity
 * changes fail closed. This helper restores exact 0.5mm coordinates BEFORE
 * Cart / Checkout independently measure the saved 3D part snapshot.
 *
 * Not an engineering certification; only the existing reviewed U4 range and
 * signed source shape may be reused. Unverified families are left untouched.
 */
import { restoreReviewedManualCartGeometryU12 } from './customerReviewedManualCartEditU12.mjs';
import { manualWorldFrameU8 } from './universalManualWorldBoundsU8.mjs';

const AXES = ['width','height','depth'];
const fail = () => ({
  ok: false,
  applies: true,
  error: 'Saved manual geometry does not match the Admin-reviewed design and dimensions. Reopen the design from your Cart and apply a supported size before saving.',
});

export function prepareReviewedManualCartSaveU13(authorization, savedParts, requested) {
  // Do NOT promote unreviewed, stale or generic furniture into manual editing.
  // Their existing protected editing behavior remains unchanged.
  if (authorization?.verified !== true) {
    return { ok: true, applies: false, parts: savedParts };
  }
  const restored = restoreReviewedManualCartGeometryU12(authorization, savedParts, requested);
  if (!restored.ok) return fail();

  const frame = manualWorldFrameU8(restored.parts);
  if (!frame || AXES.some(axis =>
    !Number.isSafeInteger(requested?.[axis]) ||
    Math.abs(frame[axis]?.size - requested[axis]) > 0.001)) {
    return fail();
  }
  return {
    ok: true,
    applies: true,
    parts: restored.parts,
    dimensions: restored.dimensions,
  };
}
