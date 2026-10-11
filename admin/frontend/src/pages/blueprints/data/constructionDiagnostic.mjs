/**
 * WISDOM A1 | Pure, read-only construction metadata diagnostic.
 *
 * IMPORTANT: This module DOES NOT certify construction or enable customer resize.
 * It deliberately returns all W/H/D capability flags as false. A subsequent,
 * separately reviewed construction-family profile must validate physical
 * geometry, joinery, thickness, clearance and floor-contact rules.
 *
 * No database calls, React imports, network calls, object mutations or writes.
 */

const KNOWN_ASSEMBLY_FAMILIES = new Set([
  'dining_table', 'coffee_table', 'wardrobe', 'base_cabinet',
  'wall_cabinet', 'tall_cabinet', 'cabinet', 'bookshelf',
  'bed_frame', 'dining_chair',
]);

const BOARD_FAMILIES = new Set([
  'wardrobe', 'base_cabinet', 'wall_cabinet', 'tall_cabinet',
  'cabinet', 'bookshelf',
]);
const TABLE_FAMILIES = new Set(['dining_table', 'coffee_table']);
const clean = (value) => String(value ?? '').trim();
const lower = (value) => clean(value).toLowerCase();
const finite = (value) => typeof value === 'number' && Number.isFinite(value);

function realFurniturePart(part) {
  if (!part || typeof part !== 'object' || Array.isArray(part)) return false;
  const type = lower(part.type);
  // The 1700-mm human reference is not a manufactured furniture component.
  return !(
    type === 'reference_proxy' || type === 'human_reference' ||
    type.startsWith('reference_') || part.isReference === true ||
    part.isHumanReference === true
  );
}

function declaredAssemblyId(part) {
  return clean(part.assemblyId || part.groupId);
}

function declaredAssemblyType(part) {
  return lower(part.assemblyType);
}

function categoryForFamily(family) {
  if (TABLE_FAMILIES.has(family)) return 'table';
  if (BOARD_FAMILIES.has(family)) return 'cabinet';
  if (family === 'bed_frame') return 'bed';
  if (family === 'dining_chair') return 'chair';
  return '';
}

function partPrefixCategory(type) {
  if (type.startsWith('dt_') || type.startsWith('ct_')) return 'table';
  if (type.startsWith('wr_')) return 'cabinet';
  if (type.startsWith('bed_')) return 'bed';
  return '';
}

/**
 * @param {object} params
 * @param {object[]} params.components - current or saved Blueprint components
 * @param {string} [params.furnitureType] - optional saved overall furnitureType
 * @returns {object} diagnostic report. NEVER a customer-resize permission.
 */
function diagnoseConstructionA1({ components = [], furnitureType = '' } = {}) {
  const issues = [];
  const issue = (code, message, partId = null) => {
    issues.push({ code, severity: 'review_required', message, partId });
  };

  if (!Array.isArray(components)) {
    issue('INVALID_COMPONENTS', 'Blueprint components must be an array.');
    components = [];
  }
  const parts = components.filter(realFurniturePart);
  const ids = new Map();
  const assemblies = new Set();
  const families = new Set();
  const declaredParents = [];

  if (!parts.length) issue('EMPTY_FURNITURE', 'No real production parts were found.');

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts[index];
    const id = clean(part.id);
    const ref = id || `part-index-${index}`;
    const groupId = clean(part.groupId);
    const assemblyId = clean(part.assemblyId);
    const assembly = declaredAssemblyId(part);
    const family = declaredAssemblyType(part);
    const partRole = lower(part.partRole);
    const assemblyRole = lower(part.assemblyRole);
    const partType = lower(part.type);

    if (!id) issue('MISSING_PART_ID', `Part ${index + 1} has no stable ID.`, ref);
    else if (ids.has(id)) issue('DUPLICATE_PART_ID', `Repeated part ID: ${id}.`, ref);
    else ids.set(id, part);

    if (!assembly) issue('MISSING_ASSEMBLY_ID', 'Part is missing groupId/assemblyId.', ref);
    else assemblies.add(assembly);
    if (groupId && assemblyId && groupId !== assemblyId) {
      issue('ASSEMBLY_ID_CONFLICT', 'groupId and assemblyId disagree.', ref);
    }
    if (!family) issue('MISSING_ASSEMBLY_TYPE', 'Part has no explicit assemblyType.', ref);
    else {
      families.add(family);
      if (!KNOWN_ASSEMBLY_FAMILIES.has(family)) {
        issue('UNKNOWN_ASSEMBLY_FAMILY', `No reviewed A1 family classification for ${family}.`, ref);
      }
    }

    if (!partRole && !assemblyRole) issue('MISSING_PART_ROLE', 'Part role is not defined.', ref);
    if (partRole && assemblyRole && partRole !== assemblyRole) {
      issue('PART_ROLE_CONFLICT', 'partRole and assemblyRole disagree; manual review required.', ref);
    }
    if (!clean(part.partCode)) {
      issue('MISSING_PART_CODE', 'Part has no traceable partCode.', ref);
    }

    for (const dimension of ['width', 'height', 'depth']) {
      if (!finite(part[dimension]) || part[dimension] <= 0) {
        issue('INVALID_DIMENSION', `Part ${dimension} must be a finite positive number in mm.`, ref);
      }
    }
    for (const axis of ['x', 'y', 'z']) {
      if (!finite(part[axis])) issue('INVALID_POSITION', `Part ${axis} must be a finite coordinate.`, ref);
    }
    if (!Number.isSafeInteger(part.qty) || part.qty <= 0) {
      issue('INVALID_PHYSICAL_QTY', 'Physical qty must be a positive integer.', ref);
    }
    if (!clean(part.material || part.wood_type)) {
      issue('MISSING_MATERIAL', 'Actual component material is missing.', ref);
    }

    for (const rotation of ['rotationX', 'rotationY', 'rotationZ']) {
      const value = part[rotation] ?? 0;
      if (!finite(value) || Math.abs(((value % 360) + 360) % 360) > 1e-8 &&
          Math.abs(((value % 360) + 360) % 360 - 360) > 1e-8) {
        issue('ROTATED_PART_REQUIRES_PROFILE', `Non-default ${rotation} needs construction-specific verification.`, ref);
      }
    }
    if (part.locked === true || part.is_deleted === true || Number(part.is_deleted) === 1 || part.visible === false) {
      issue('PART_STATE_REQUIRES_REVIEW', 'Locked, hidden or deleted part must be reviewed.', ref);
    }

    const prefixCategory = partPrefixCategory(partType);
    const familyCategory = categoryForFamily(family);
    if (prefixCategory && familyCategory && prefixCategory !== familyCategory) {
      issue('PART_FAMILY_CONFLICT', `Part type ${partType} conflicts with assemblyType ${family}.`, ref);
    }

    const parentId = clean(part.parentPartId);
    if (parentId) declaredParents.push({ partId: id, parentId, assembly, ref });
  }

  if (assemblies.size > 1) {
    issue('MULTIPLE_ASSEMBLIES', 'Multiple assemblies require a reviewed combined-construction profile.');
  }
  if (families.size > 1) {
    issue('MIXED_ASSEMBLY_FAMILIES', 'Different assembly types need explicit compatibility review.');
  }

  const familyCandidate = families.size === 1 ? [...families][0] : null;
  const furnitureCategory = lower(furnitureType);
  const familyCategory = categoryForFamily(familyCandidate);
  if (furnitureCategory && familyCategory && furnitureCategory !== familyCategory) {
    issue('FURNITURE_TYPE_CONFLICT', `Blueprint furnitureType ${furnitureCategory} conflicts with ${familyCandidate}.`);
  }

  const parentById = new Map();
  for (const { partId, parentId, assembly, ref } of declaredParents) {
    if (partId && partId === parentId) {
      issue('SELF_PARENT_REFERENCE', 'Part cannot reference itself as parent.', ref);
    } else if (!ids.has(parentId)) {
      issue('BROKEN_PARENT_REFERENCE', `Declared parent ${parentId} is missing.`, ref);
    } else if (declaredAssemblyId(ids.get(parentId)) !== assembly) {
      issue('CROSS_ASSEMBLY_PARENT', 'Parent and child must belong to the same reviewed assembly.', ref);
    }
    if (partId && ids.has(partId)) parentById.set(partId, parentId);
  }
  const reportedCycles = new Set();
  for (const startId of parentById.keys()) {
    const visited = new Set();
    let cursor = startId;
    while (parentById.has(cursor)) {
      if (visited.has(cursor)) {
        if (!reportedCycles.has(cursor)) {
          issue('PARENT_REFERENCE_CYCLE', 'Parent chain contains a cycle.', cursor);
          reportedCycles.add(cursor);
        }
        break;
      }
      visited.add(cursor);
      cursor = parentById.get(cursor);
    }
  }

  // A1 has NO reviewed family-specific geometry, fixed-section, or structural
  // resize certification. Keep these reasons even for complete metadata.
  issue('FIXED_SECTION_RULES_UNVERIFIED', 'Panel thickness, leg cross-sections, joinery, clearances and floor contact have not been certified.');
  issue('NO_VERIFIED_RESIZE_PROFILE', 'No approved axis-specific construction resize profile is attached.');

  const structuralIssueCount = issues.length - 2;
  return {
    diagnosticVersion: 'A1',
    status: structuralIssueCount ? 'incomplete_metadata' : 'profile_review_required',
    // Informational ONLY: this never enables customer resizing.
    metadataReadyForProfileReview: structuralIssueCount === 0 && parts.length > 0,
    familyCandidate,
    resizeEligible: false,
    customerEditable: { width: false, height: false, depth: false },
    fixedSectionSafetyVerified: false,
    carpenterReviewRequired: true,
    summary: {
      realPartCount: parts.length,
      assemblyCount: assemblies.size,
      familyCount: families.size,
      structuralIssueCount,
      totalIssueCount: issues.length,
    },
    issues,
  };
}

export { diagnoseConstructionA1 };
