// C3: Read-only parts schedule from the exact saved customer component snapshot.
// Never use this display projection to overwrite saved production geometry or
// derive raw stock/sheet quantities. Admin is responsible for final quotation.
const finitePositive = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const wholeQuantity = (value) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
};

const flatPart = (component = {}) => {
  const descriptor = [
    component.partRole, component.assemblyRole, component.type,
    component.label, component.partCode,
  ].map((value) => String(value || '').toLowerCase()).join(' ');
  // C3-FIX2: Toe-kick board is a physical flat panel, even when the saved
  // type/role is cabinet_toe_kick / toe_kick rather than a '*panel' label.
  // Trust structural identity, not display label alone; exclude hardware.
  const identity = [
    component.partRole, component.assemblyRole, component.type, component.partCode,
  ].map((value) => String(value || '').toLowerCase()).join(' ');
  const toeKickBoard = /(?:^|[\s_-])toe[\s_-]*kick(?:$|[\s_-])/.test(identity) &&
    !/(?:bracket|clip|screw|bolt|hinge|handle|fastener|rod|metal|steel|glass)/.test(
      [identity, component.material, component.wood_type]
        .map((value) => String(value || '').toLowerCase()).join(' ')
    );
  // Existing Admin Blueprint inspector identifies these exact standard
  // wardrobe doors, table aprons, and coffee-table aprons as boards.
  // A display-only label cannot grant thickness (hardware stays excluded).
  const code = String(component.partCode || component.part_code || '').trim().toUpperCase();
  const type = String(component.type || '').trim().toLowerCase();
  const standardBoard = /^(?:WR-(?:DL|DR)|(?:DT|CT)-(?:AF|AR)|DT-(?:AL|AR2)|CT-(?:ASL|ASR))$/.test(code) ||
    /^(?:wr_door|dt_apron_long|dt_apron_short|ct_apron_long|ct_apron_short)$/.test(type);
  const blockedMaterial = /(?:metal|steel|glass|acrylic|hinge|screw|bolt|bracket|hardware|handle)/.test(
    [type, component.material, component.wood_type].map((value) => String(value || '').toLowerCase()).join(' ')
  );
  return /panel|board|shelf|tabletop|top slab|countertop|door front|drawer bottom|backing|back sheet|divider/.test(descriptor) ||
    toeKickBoard || (standardBoard && !blockedMaterial);
};

// Solid table legs are measured by cross-section, not panel thickness.
// Restrict section labelling to identified legs; do not guess from proportions.
const resolveLegSection = (component = {}) => {
  const code = String(component.partCode || component.part_code || '').trim().toUpperCase();
  const type = String(component.type || '').trim().toLowerCase();
  const isLeg = /^(?:CT|DT)-(?:FL|FR|BL|BR)$/.test(code) ||
    /^(?:ct_leg|dt_leg)$/.test(type);
  const width = finitePositive(component.width);
  const depth = finitePositive(component.depth);
  const height = finitePositive(component.height);
  return isLeg && width != null && depth != null && height != null
    ? { widthMm: width, depthMm: depth }
    : null;
};

// A single read-only display format is used by Cart, Checkout and Admin.
// Section is intentionally not misrepresented as board thickness.
export const formatCustomerPartThickness = (part = {}) => {
  const mm = (value) => Number(value).toLocaleString('en-PH', { maximumFractionDigits: 3 });
  if (finitePositive(part.thicknessMm) != null) {
    return `${mm(part.thicknessMm)} mm${part.thicknessAxis ? ` (${part.thicknessAxis})` : ''}`;
  }
  if (finitePositive(part.sectionWidthMm) != null && finitePositive(part.sectionDepthMm) != null) {
    return `${mm(part.sectionWidthMm)} × ${mm(part.sectionDepthMm)} mm (section)`;
  }
  return '—';
};

export const resolvePartThicknessFromGeometry = (component = {}) => {
  const explicit = finitePositive(component.thicknessMm ?? component.thickness_mm);
  const dimensions = [
    ['W', finitePositive(component.width)],
    ['H', finitePositive(component.height)],
    ['D', finitePositive(component.depth)],
  ];
  if (explicit != null) {
    const matchingAxis = dimensions.find((entry) => entry[1] === explicit);
    return { value: explicit, axis: matchingAxis?.[0] || '' };
  }
  if (!flatPart(component) || dimensions.some((entry) => entry[1] == null)) {
    return { value: null, axis: '' };
  }
  const sorted = [...dimensions].sort((a,b) => a[1]-b[1]);
  if (sorted[0][1] <= 60 && sorted[0][1] * 2 <= sorted[1][1]) {
    return { value: sorted[0][1], axis: sorted[0][0] };
  }
  return { value: null, axis: '' };
};

export const buildCustomerPartSchedule = (components = [], furnitureQuantity = 1) => {
  const orderQuantity = wholeQuantity(furnitureQuantity);
  return (Array.isArray(components) ? components : [])
    .map((part, index) => ({ part, index }))
    .filter(({part}) => part && typeof part === 'object' &&
      part.type !== 'reference_proxy' && Number(part.is_deleted || 0) !== 1)
    .map(({part,index}) => {
      const quantityPerUnit = wholeQuantity(part.qty ?? part.quantity);
      const thickness = resolvePartThicknessFromGeometry(part);
      const legSection = resolveLegSection(part);
      return {
        key: String(part.id || part.partCode || `part-${index}`),
        index,
        id: String(part.id || ''),
        code: String(part.partCode || part.part_code || ''),
        label: String(part.label || part.name || part.type || `Part ${index+1}`),
        width: finitePositive(part.width),
        height: finitePositive(part.height),
        depth: finitePositive(part.depth),
        thicknessMm: thickness.value,
        thicknessAxis: thickness.axis,
        sectionWidthMm: legSection?.widthMm ?? null,
        sectionDepthMm: legSection?.depthMm ?? null,
        material: String(part.material || part.wood_type || ''),
        requestedWood: String(part.requested_wood_type || ''),
        quantityPerUnit,
        totalQuantity: quantityPerUnit * orderQuantity,
        raw: part,
      };
    });
};

export const summarizeCustomerPartQuantities = (rows = []) => ({
  entries: rows.length,
  piecesPerFurniture: rows.reduce((sum, part) => sum + part.quantityPerUnit, 0),
  totalPieces: rows.reduce((sum, part) => sum + part.totalQuantity, 0),
});
