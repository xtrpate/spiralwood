/**
 * WISDOM A3: read-only, family-level geometric construction review.
 *
 * This file is deliberately NOT connected to Customer, Save, Publish or Admin
 * resize. A passing geometry candidate is NOT a structural engineering,
 * fabrication, carpenter or Customer W/H/D resize approval.
 *
 * It only examines axis-aligned A1-complete single assemblies; no writes.
 */
import { diagnoseConstructionA1 } from './constructionDiagnostic.mjs';

const EPS = 0.5; // mm numerical placement tolerance, not a joinery clearance
const TABLE_FAMILIES = new Set(['dining_table', 'coffee_table']);
const SHELL_FAMILIES = new Set(['wardrobe', 'base_cabinet', 'wall_cabinet', 'tall_cabinet', 'cabinet', 'bookshelf']);
const near = (a, b) => Math.abs(a - b) <= EPS;
const end = (p, axis) => p[axis] + p[{ x: 'width', y: 'height', z: 'depth' }[axis]];
const role = (p) => String(p.partRole || p.assemblyRole || '').trim().toLowerCase();
const inSpan = (innerMin, innerMax, outerMin, outerMax) =>
  innerMin >= outerMin - EPS && innerMax <= outerMax + EPS;

function reviewFurnitureGeometryA3({ components = [], furnitureType = '' } = {}) {
  const meta = diagnoseConstructionA1({ components, furnitureType });
  const issues = [];
  const issue = (code, detail, part = null) => issues.push({
    code, detail, partId: part?.id || null,
    severity: 'manual_review_required',
  });
  const result = (status, inspectedCount = 0) => ({
    version: 'A3', status, family: meta.familyCandidate,
    geometryCandidateForReview: status === 'geometry_candidate_for_manual_review',
    metadataReady: meta.metadataReadyForProfileReview,
    inspectedPartCount: inspectedCount, issues,
    // Hard safety boundary: neither this nor A1 can authorize editing.
    resizeEligible: false,
    customerEditable: { width: false, height: false, depth: false },
    fixedSectionResizingApproved: false,
    carpenterReviewRequired: true,
    manufacturingApproved: false,
  });

  if (!meta.metadataReadyForProfileReview) {
    issue('A1_METADATA_NOT_READY', 'Correct A1 metadata issues before geometry review.');
    return result('blocked_metadata');
  }
  const family = meta.familyCandidate;
  if (!TABLE_FAMILIES.has(family) && !SHELL_FAMILIES.has(family)) {
    issue('FAMILY_PROFILE_NOT_YET_REVIEWED', `No A3 geometry profile for ${family}.`);
    return result('family_profile_pending');
  }
  const parts = components.filter((p) => p &&
    p.type !== 'reference_proxy' && p.type !== 'human_reference' &&
    !String(p.type || '').startsWith('reference_') &&
    p.isReference !== true && p.isHumanReference !== true);
  const get = (name) => parts.filter((p) => role(p) === name);
  const only = (name) => {
    const candidates = get(name);
    if (candidates.length !== 1) {
      issue('REQUIRED_PART_ROLE_COUNT', `Expected one ${name}, found ${candidates.length}.`);
      return null;
    }
    return candidates[0];
  };
  const withinBox = (p, b, axes = ['x', 'y', 'z']) => axes.every((axis) =>
    inSpan(p[axis], end(p, axis), b[axis], end(b, axis)));

  if (TABLE_FAMILIES.has(family)) {
    const top = only('top_panel');
    const legs = get('leg');
    const rails = get('apron_rail');
    if (legs.length !== 4) issue('FOUR_LEG_PROFILE_REQUIRED', `Four-leg table geometry only; found ${legs.length} legs.`);
    if (rails.length < 2) issue('TABLE_APRONS_MISSING', 'Table requires separately validated apron rails.');
    if (top && legs.length === 4) {
      const first = legs[0];
      for (const leg of legs) {
        if (!near(leg.y, end(top, 'y'))) issue('LEG_TOP_NOT_JOINED', 'Leg must meet tabletop underside.', leg);
        if (!near(end(leg, 'y'), end(first, 'y'))) issue('UNEVEN_FLOOR_CONTACT', 'All legs must meet the same floor plane.', leg);
        if (!near(leg.width, leg.depth) || !near(leg.width, first.width) || !near(leg.depth, first.depth)) {
          issue('LEG_SECTION_CONFLICT', 'All four table legs must have matching square cross sections.', leg);
        }
        if (!inSpan(leg.x, end(leg, 'x'), top.x, end(top, 'x')) ||
            !inSpan(leg.z, end(leg, 'z'), top.z, end(top, 'z'))) {
          issue('LEG_OUTSIDE_TOP', 'Leg footprint must sit inside tabletop projection.', leg);
        }
      }
      // Require separated corners, not four duplicated legs on one side.
      const cx = top.x + top.width / 2;
      const cz = top.z + top.depth / 2;
      const corners = new Set(legs.map((leg) =>
        `${leg.x + leg.width / 2 < cx ? 'L' : 'R'}-${leg.z + leg.depth / 2 < cz ? 'F' : 'B'}`));
      if (corners.size !== 4) issue('MISSING_SUPPORT_CORNER', 'Four legs must occupy four distinct tabletop corner regions.');
      for (const rail of rails) {
        if (!near(rail.y, end(top, 'y'))) issue('APRON_NOT_UNDER_TOP', 'Apron must start below the tabletop.', rail);
        if (!inSpan(rail.x, end(rail, 'x'), top.x, end(top, 'x')) ||
            !inSpan(rail.z, end(rail, 'z'), top.z, end(top, 'z'))) {
          issue('APRON_OUTSIDE_TOP', 'Apron must remain inside tabletop footprint.', rail);
        }
        if (rail.height >= first.height) issue('APRON_EXCEEDS_LEG', 'Apron height must be below leg length.', rail);
      }
      if (rails.length >= 2) {
        const railHeight = rails[0].height;
        if (rails.some((p) => !near(p.height, railHeight))) {
          issue('APRON_HEIGHT_MISMATCH', 'Apron heights differ.');
        }
        const longitudinal = rails.filter((p) => p.width > p.depth);
        const transverse = rails.filter((p) => p.depth > p.width);
        if (longitudinal.length !== 2 || transverse.length !== 2) {
          issue('APRON_ORIENTATION_UNVERIFIED', 'Expected two longitudinal and two transverse rails.');
        } else if (!near(longitudinal[0].depth, longitudinal[1].depth) ||
          !near(transverse[0].width, transverse[1].width) ||
          !near(longitudinal[0].depth, transverse[0].width)) {
          issue('APRON_SECTION_CONFLICT', 'Fixed apron sections are inconsistent.');
        }
      }
      for (const shelf of get('shelf')) {
        if (shelf.y <= end(top, 'y') || end(shelf, 'y') >= end(first, 'y') ||
            !inSpan(shelf.x, end(shelf, 'x'), top.x, end(top, 'x')) ||
            !inSpan(shelf.z, end(shelf, 'z'), top.z, end(top, 'z'))) {
          issue('SHELF_OUTSIDE_TABLE_INTERIOR', 'Shelf does not fit between tabletop and leg floor.', shelf);
        }
      }
    }
  } else {
    // Board-shell family. We do not assume exact blueprint IDs or part counts.
    const left = only('left_side_panel');
    const right = only('right_side_panel');
    const top = only('top_panel');
    const bottom = only('bottom_panel');
    if (left && right && top && bottom) {
      if (!near(left.y, right.y) || !near(left.height, right.height) ||
          !near(left.z, right.z) || !near(left.depth, right.depth) ||
          !near(left.width, right.width)) {
        issue('SIDE_PANEL_MISMATCH', 'Side panels have inconsistent height, depth or thickness.');
      }
      const innerLeft = end(left, 'x');
      const innerRight = right.x;
      if (innerRight <= innerLeft) issue('NO_CABINET_INTERIOR', 'Side panels do not leave an interior opening.');
      for (const panel of [top, bottom]) {
        if (!near(panel.x, innerLeft) || !near(end(panel, 'x'), innerRight) ||
            !near(panel.height, left.width) || !near(panel.z, left.z) ||
            !near(panel.depth, left.depth)) {
          issue('TOP_BOTTOM_FIT', 'Top or bottom panel does not fit between side panels at consistent thickness.', panel);
        }
      }
      if (!near(top.y, left.y) || !near(end(bottom, 'y'), end(left, 'y'))) {
        issue('TOP_BOTTOM_VERTICAL_FIT', 'Top/bottom do not meet upper/lower side-panel edges.');
      }
      for (const shelf of get('shelf')) {
        if (!inSpan(shelf.x, end(shelf, 'x'), innerLeft, innerRight) ||
            shelf.y < end(top, 'y') - EPS || end(shelf, 'y') > bottom.y + EPS ||
            !inSpan(shelf.z, end(shelf, 'z'), left.z, end(left, 'z'))) {
          issue('SHELF_OUTSIDE_OPENING', 'Shelf must be within cabinet side and top/bottom opening.', shelf);
        }
        if (!near(shelf.height, top.height)) {
          issue('SHELF_SECTION_MISMATCH', 'Shelf panel thickness differs from top panel.', shelf);
        }
      }
      const doors = get('door');
      for (const door of doors) {
        if (!inSpan(door.x, end(door, 'x'), left.x, end(right, 'x')) ||
            !inSpan(door.y, end(door, 'y'), left.y, end(left, 'y')) ||
            !inSpan(door.z, end(door, 'z'), left.z, end(left, 'z'))) {
          issue('DOOR_OUTSIDE_SHELL', 'Door does not fit inside shell envelope.', door);
        }
      }
      for (let i = 0; i < doors.length; i++) {
        for (let j = i + 1; j < doors.length; j++) {
          const a = doors[i], b = doors[j];
          const cross = (axis) => Math.min(end(a, axis), end(b, axis)) - Math.max(a[axis], b[axis]);
          if (cross('x') > EPS && cross('y') > EPS && cross('z') > EPS) {
            issue('OVERLAPPING_DOORS', 'Door panels overlap in 3D without a reviewed joint.', a);
          }
        }
      }
      for (const back of get('back_panel')) {
        if (!withinBox(back, { x: left.x, y: left.y, z: left.z,
          width: end(right, 'x') - left.x, height: left.height, depth: left.depth })) {
          issue('BACK_PANEL_OUTSIDE_SHELL', 'Back panel extends outside cabinet shell.', back);
        }
      }
    }
  }
  return result(issues.length ? 'geometry_review_required' : 'geometry_candidate_for_manual_review', parts.length);
}

export { reviewFurnitureGeometryA3 };
