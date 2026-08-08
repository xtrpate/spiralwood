// data/designValidation.js
// Batch 33: read-only Blueprint design validation.
// This module never mutates components and never replaces final carpenter review.

const REAL_COMPONENT_FILTER = (component) =>
  component && component.type !== "reference_proxy";

const roundMetric = (value, precision = 3) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  const factor = 10 ** precision;
  return Math.round(numeric * factor) / factor;
};

const cleanText = (value) => String(value ?? "").trim();

const getAssemblyId = (component = {}) =>
  cleanText(component.assemblyId || component.groupId) || null;

const getAssemblyName = (component = {}) =>
  cleanText(component.assemblyName || component.groupLabel);

const getAssemblyType = (component = {}) =>
  cleanText(component.assemblyType || component.groupType).toLowerCase();

const getPartCode = (component = {}) => cleanText(component.partCode);

const getPartRole = (component = {}) =>
  cleanText(component.partRole || component.assemblyRole).toLowerCase();

const getBox = (component = {}) => {
  const x = Number(component.x);
  const y = Number(component.y);
  const z = Number(component.z);
  const width = Number(component.width);
  const height = Number(component.height);
  const depth = Number(component.depth);

  if (
    ![x, y, z, width, height, depth].every((value) =>
      Number.isFinite(value),
    )
  ) {
    return null;
  }

  return {
    minX: x,
    minY: y,
    minZ: z,
    maxX: x + width,
    maxY: y + height,
    maxZ: z + depth,
    width,
    height,
    depth,
  };
};

const getBounds = (items = []) => {
  const boxes = items.map(getBox).filter(Boolean);
  if (!boxes.length) return null;

  return {
    minX: Math.min(...boxes.map((box) => box.minX)),
    minY: Math.min(...boxes.map((box) => box.minY)),
    minZ: Math.min(...boxes.map((box) => box.minZ)),
    maxX: Math.max(...boxes.map((box) => box.maxX)),
    maxY: Math.max(...boxes.map((box) => box.maxY)),
    maxZ: Math.max(...boxes.map((box) => box.maxZ)),
  };
};

const axisGap = (aMin, aMax, bMin, bMax) =>
  Math.max(0, bMin - aMax, aMin - bMax);

const boxDistance = (a, b) => {
  if (!a || !b) return Infinity;

  const dx = axisGap(a.minX, a.maxX, b.minX, b.maxX);
  const dy = axisGap(a.minY, a.maxY, b.minY, b.maxY);
  const dz = axisGap(a.minZ, a.maxZ, b.minZ, b.maxZ);

  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

const makeIssue = ({
  severity,
  code,
  title,
  message,
  componentId = null,
  assemblyId = null,
  partCode = "",
}) => ({
  severity,
  code,
  title,
  message,
  componentId,
  assemblyId,
  partCode,
});

const stableComponentSnapshot = (component = {}) => ({
  id: component.id || "",
  assemblyId: getAssemblyId(component) || "",
  assemblyName: getAssemblyName(component),
  assemblyType: getAssemblyType(component),
  parentPartId: component.parentPartId || "",
  partRole: getPartRole(component),
  partCode: getPartCode(component),
  type: component.type || "",
  label: component.label || "",
  x: roundMetric(component.x),
  y: roundMetric(component.y),
  z: roundMetric(component.z),
  width: roundMetric(component.width),
  height: roundMetric(component.height),
  depth: roundMetric(component.depth),
  rotationX: roundMetric(component.rotationX, 1),
  rotationY: roundMetric(component.rotationY, 1),
  rotationZ: roundMetric(component.rotationZ, 1),
  material: cleanText(component.material || component.wood_type),
  finish: cleanText(component.finish || component.finish_id),
  qty: Number(component.qty) || 1,
  profileVersion: Number(component.profileVersion) || 0,
  profileKind: cleanText(component.profileKind),
  profilePlane: cleanText(component.profilePlane),
  profileRadius: roundMetric(component.profileRadius),
  chamferSize: roundMetric(component.chamferSize),
  notchEdge: cleanText(component.notchEdge),
  notchWidth: roundMetric(component.notchWidth),
  notchDepth: roundMetric(component.notchDepth),
  profileTopRatio: roundMetric(component.profileTopRatio),
  profileOvalRoundness: roundMetric(component.profileOvalRoundness),
  profileContourPoints: Array.isArray(component.profileContourPoints)
    ? component.profileContourPoints
        .map((point) =>
          Array.isArray(point) && point.length >= 2
            ? [
                roundMetric(point[0], 6),
                roundMetric(point[1], 6),
              ]
            : null,
        )
        .filter(Boolean)
    : [],
  profileContourBulges: Array.isArray(component.profileContourBulges)
    ? component.profileContourBulges.map((value) =>
        roundMetric(value, 6),
      )
    : [],
  profileCutouts: Array.isArray(component.profileCutouts)
    ? component.profileCutouts.map((item) => ({
        id: cleanText(item?.id),
        type: cleanText(item?.type),
        u: roundMetric(item?.u),
        v: roundMetric(item?.v),
        diameter: roundMetric(item?.diameter),
        width: roundMetric(item?.width),
        height: roundMetric(item?.height),
      }))
    : [],
  profileEdgeNotches: Array.isArray(component.profileEdgeNotches)
    ? component.profileEdgeNotches.map((item) => ({
        id: cleanText(item?.id),
        edgeIndex: Number(item?.edgeIndex) || 0,
        offset: roundMetric(item?.offset),
        width: roundMetric(item?.width),
        depth: roundMetric(item?.depth),
      }))
    : [],
  profileFilletRadius: roundMetric(component.profileFilletRadius),
  woodworkingOperations: Array.isArray(component.woodworkingOperations)
    ? component.woodworkingOperations.map((item) => ({
        id: cleanText(item?.id),
        type: cleanText(item?.type),
        surface: cleanText(item?.surface),
        direction: cleanText(item?.direction),
        edge: cleanText(item?.edge),
        u: roundMetric(item?.u),
        v: roundMetric(item?.v),
        offset: roundMetric(item?.offset),
        length: roundMetric(item?.length),
        width: roundMetric(item?.width),
        depth: roundMetric(item?.depth),
        diameter: roundMetric(item?.diameter),
        note: cleanText(item?.note),
      }))
    : [],
  locked: Boolean(component.locked),
});

function getDesignComponentSignature(components = []) {
  if (!Array.isArray(components)) return "[]";

  return JSON.stringify(
    components
      .filter(REAL_COMPONENT_FILTER)
      .map(stableComponentSnapshot)
      .sort((a, b) => String(a.id).localeCompare(String(b.id))),
  );
}

function getSavedDesignComponentSignature(designData) {
  if (!designData) return null;

  try {
    const parsed =
      typeof designData === "string" ? JSON.parse(designData) : designData;

    if (!parsed || !Array.isArray(parsed.components)) {
      return null;
    }

    return getDesignComponentSignature(parsed.components);
  } catch {
    return null;
  }
}

const findCabinetShell = (assemblyItems = []) => {
  const byCode = (pattern) =>
    assemblyItems.find((item) => pattern.test(getPartCode(item)));

  const sidePanels = assemblyItems
    .filter((item) => {
      const type = cleanText(item.type).toLowerCase();
      const code = getPartCode(item);
      return type === "wr_side_panel" || /^CB-SIDE-/i.test(code);
    })
    .sort((a, b) => Number(a.x) - Number(b.x));

  const left = byCode(/^CB-SIDE-L$/i) || sidePanels[0] || null;
  const right =
    byCode(/^CB-SIDE-R$/i) || sidePanels[sidePanels.length - 1] || null;
  const top =
    byCode(/^CB-TOP$/i) ||
    assemblyItems.find(
      (item) => cleanText(item.type).toLowerCase() === "wr_top_panel",
    ) ||
    null;
  const bottom =
    byCode(/^CB-BOT$/i) ||
    assemblyItems.find(
      (item) => cleanText(item.type).toLowerCase() === "wr_bottom_panel",
    ) ||
    null;
  const back =
    byCode(/^CB-BACK$/i) ||
    assemblyItems.find(
      (item) => cleanText(item.type).toLowerCase() === "wr_back_panel",
    ) ||
    null;

  if (!left || !right || !top || !bottom || !back) {
    return {
      complete: false,
      left,
      right,
      top,
      bottom,
      back,
      missing: [
        !left ? "Left Side" : null,
        !right ? "Right Side" : null,
        !top ? "Top" : null,
        !bottom ? "Bottom" : null,
        !back ? "Back" : null,
      ].filter(Boolean),
    };
  }

  const leftBox = getBox(left);
  const rightBox = getBox(right);
  const topBox = getBox(top);
  const bottomBox = getBox(bottom);
  const backBox = getBox(back);

  if (!leftBox || !rightBox || !topBox || !bottomBox || !backBox) {
    return {
      complete: false,
      left,
      right,
      top,
      bottom,
      back,
      missing: ["valid shell dimensions"],
    };
  }

  const inner = {
    minX: leftBox.maxX,
    maxX: rightBox.minX,
    minY: topBox.maxY,
    maxY: bottomBox.minY,
    minZ: backBox.maxZ,
    maxZ: Math.max(leftBox.maxZ, rightBox.maxZ, topBox.maxZ, bottomBox.maxZ),
  };

  return {
    complete: true,
    left,
    right,
    top,
    bottom,
    back,
    inner,
    outer: getBounds([left, right, top, bottom, back]),
    missing: [],
  };
};

const isCabinetBoxAssembly = (assemblyItems = []) =>
  assemblyItems.some((item) => /^CB-(SIDE|TOP|BOT|BACK)/i.test(getPartCode(item)));

const isPanelLikePart = (component = {}) => {
  const role = getPartRole(component);
  const type = cleanText(component.type).toLowerCase();

  return (
    /panel|shelf|door|drawer_(front|side|back|bottom)|apron|rail/.test(role) ||
    /panel|shelf|door|drawer_(front|side|back|bottom)|apron|rail/.test(type)
  );
};

function buildDesignValidationReport({
  components = [],
  worldDimensions = null,
  hasUnsavedChanges = false,
} = {}) {
  const errors = [];
  const warnings = [];
  const notices = [];
  const realComponents = Array.isArray(components)
    ? components.filter(REAL_COMPONENT_FILTER)
    : [];

  if (!realComponents.length) {
    errors.push(
      makeIssue({
        severity: "error",
        code: "EMPTY_DESIGN",
        title: "No production parts",
        message:
          "The design has no editable production parts. Add or convert furniture parts before production review.",
      }),
    );
  }

  const ids = new Set();
  const componentById = new Map();

  realComponents.forEach((component, index) => {
    const id = cleanText(component.id);

    if (!id) {
      errors.push(
        makeIssue({
          severity: "error",
          code: "MISSING_COMPONENT_ID",
          title: "Component has no ID",
          message: `${component.label || `Part ${index + 1}`} has no stable component ID.`,
          partCode: getPartCode(component),
        }),
      );
    } else if (ids.has(id)) {
      errors.push(
        makeIssue({
          severity: "error",
          code: "DUPLICATE_COMPONENT_ID",
          title: "Duplicate component ID",
          message: `Component ID ${id} is used more than once.`,
          componentId: id,
          partCode: getPartCode(component),
        }),
      );
    } else {
      ids.add(id);
      componentById.set(id, component);
    }

    const dimensions = [
      ["width", Number(component.width)],
      ["height", Number(component.height)],
      ["depth", Number(component.depth)],
    ];

    const invalidDimension = dimensions.find(
      ([, value]) => !Number.isFinite(value) || value <= 0,
    );

    if (invalidDimension) {
      errors.push(
        makeIssue({
          severity: "error",
          code: "INVALID_DIMENSION",
          title: "Invalid part dimension",
          message: `${component.label || "Part"} has invalid ${invalidDimension[0]} (${String(
            invalidDimension[1],
          )}). Dimensions must be greater than 0 mm.`,
          componentId: id || null,
          assemblyId: getAssemblyId(component),
          partCode: getPartCode(component),
        }),
      );
    }

    const material = cleanText(component.material || component.wood_type);
    if (!material) {
      errors.push(
        makeIssue({
          severity: "error",
          code: "MISSING_MATERIAL",
          title: "Missing material",
          message: `${component.label || "Part"} has no assigned material.`,
          componentId: id || null,
          assemblyId: getAssemblyId(component),
          partCode: getPartCode(component),
        }),
      );
    }

    if (
      component.parentPartId &&
      !componentById.has(String(component.parentPartId)) &&
      !realComponents.some(
        (item) => String(item.id) === String(component.parentPartId),
      )
    ) {
      errors.push(
        makeIssue({
          severity: "error",
          code: "BROKEN_PARENT_LINK",
          title: "Broken parent-part link",
          message: `${component.label || "Part"} points to missing parent part ${component.parentPartId}.`,
          componentId: id || null,
          assemblyId: getAssemblyId(component),
          partCode: getPartCode(component),
        }),
      );
    }

    const box = getBox(component);
    if (box && worldDimensions) {
      const worldW = Number(worldDimensions.w);
      const worldH = Number(worldDimensions.h);
      const worldD = Number(worldDimensions.d);

      if ([worldW, worldH, worldD].every(Number.isFinite)) {
        const completelyOutside =
          box.maxX < 0 ||
          box.maxY < 0 ||
          box.maxZ < 0 ||
          box.minX > worldW ||
          box.minY > worldH ||
          box.minZ > worldD;

        const partiallyOutside =
          box.minX < 0 ||
          box.minY < 0 ||
          box.minZ < 0 ||
          box.maxX > worldW ||
          box.maxY > worldH ||
          box.maxZ > worldD;

        if (completelyOutside) {
          errors.push(
            makeIssue({
              severity: "error",
              code: "PART_OUTSIDE_WORKSPACE",
              title: "Part outside design workspace",
              message: `${component.label || "Part"} is completely outside the Blueprint workspace.`,
              componentId: id || null,
              assemblyId: getAssemblyId(component),
              partCode: getPartCode(component),
            }),
          );
        } else if (partiallyOutside) {
          warnings.push(
            makeIssue({
              severity: "warning",
              code: "PART_CROSSES_WORKSPACE",
              title: "Part crosses workspace boundary",
              message: `${component.label || "Part"} extends beyond the configured Blueprint workspace.`,
              componentId: id || null,
              assemblyId: getAssemblyId(component),
              partCode: getPartCode(component),
            }),
          );
        }
      }
    }

    if (isPanelLikePart(component)) {
      const numericDims = [
        Number(component.width),
        Number(component.height),
        Number(component.depth),
      ].filter((value) => Number.isFinite(value) && value > 0);

      if (numericDims.length === 3) {
        const thickness = Math.min(...numericDims);
        if (thickness < 3 || thickness > 120) {
          warnings.push(
            makeIssue({
              severity: "warning",
              code: "UNUSUAL_THICKNESS",
              title: "Unusual panel thickness",
              message: `${component.label || "Part"} has an inferred thickness of ${roundMetric(
                thickness,
                1,
              )} mm. Verify this before production.`,
              componentId: id || null,
              assemblyId: getAssemblyId(component),
              partCode: getPartCode(component),
            }),
          );
        }
      }
    }
  });

  const assemblyMap = new Map();
  realComponents.forEach((component) => {
    const assemblyId = getAssemblyId(component);
    if (!assemblyId) return;
    if (!assemblyMap.has(assemblyId)) assemblyMap.set(assemblyId, []);
    assemblyMap.get(assemblyId).push(component);
  });

  assemblyMap.forEach((assemblyItems, assemblyId) => {
    const assemblyNames = new Set(
      assemblyItems.map(getAssemblyName).filter(Boolean),
    );
    const assemblyTypes = new Set(
      assemblyItems.map(getAssemblyType).filter(
        (value) => value && value !== "assembly",
      ),
    );

    if (assemblyNames.size > 1 || assemblyTypes.size > 1) {
      errors.push(
        makeIssue({
          severity: "error",
          code: "CORRUPTED_ASSEMBLY_METADATA",
          title: "Conflicting assembly metadata",
          message: `Assembly ${assemblyId} contains conflicting names or furniture types.`,
          assemblyId,
        }),
      );
    }

    const seenPartCodes = new Map();
    assemblyItems.forEach((item) => {
      const code = getPartCode(item).toUpperCase();
      if (!code) return;
      if (!seenPartCodes.has(code)) {
        seenPartCodes.set(code, item);
        return;
      }

      warnings.push(
        makeIssue({
          severity: "warning",
          code: "DUPLICATE_PART_CODE",
          title: "Duplicate part code",
          message: `${code} is used more than once in ${
            getAssemblyName(item) || "the same assembly"
          }.`,
          componentId: item.id || null,
          assemblyId,
          partCode: code,
        }),
      );
    });

    const geometryMap = new Map();
    assemblyItems.forEach((item) => {
      const box = getBox(item);
      if (!box) return;
      const key = [
        cleanText(item.type).toLowerCase(),
        roundMetric(box.minX, 1),
        roundMetric(box.minY, 1),
        roundMetric(box.minZ, 1),
        roundMetric(box.width, 1),
        roundMetric(box.height, 1),
        roundMetric(box.depth, 1),
      ].join("|");

      if (geometryMap.has(key)) {
        warnings.push(
          makeIssue({
            severity: "warning",
            code: "DUPLICATE_GEOMETRY",
            title: "Possible overlapping duplicate",
            message: `${item.label || "Part"} occupies the same geometry as another ${item.type || "part"}.`,
            componentId: item.id || null,
            assemblyId,
            partCode: getPartCode(item),
          }),
        );
      } else {
        geometryMap.set(key, item.id);
      }
    });

    if (assemblyItems.length > 1) {
      assemblyItems.forEach((item) => {
        const itemBox = getBox(item);
        if (!itemBox) return;

        let nearestDistance = Infinity;
        assemblyItems.forEach((other) => {
          if (other.id === item.id) return;
          nearestDistance = Math.min(
            nearestDistance,
            boxDistance(itemBox, getBox(other)),
          );
        });

        if (nearestDistance > 250) {
          warnings.push(
            makeIssue({
              severity: "warning",
              code: "FLOATING_PART",
              title: "Possible floating part",
              message: `${item.label || "Part"} is more than ${Math.round(
                nearestDistance,
              )} mm from every other part in its assembly.`,
              componentId: item.id || null,
              assemblyId,
              partCode: getPartCode(item),
            }),
          );
        }
      });
    }

    if (isCabinetBoxAssembly(assemblyItems)) {
      const shell = findCabinetShell(assemblyItems);

      if (!shell.complete) {
        errors.push(
          makeIssue({
            severity: "error",
            code: "MISSING_CABINET_PANEL",
            title: "Incomplete cabinet shell",
            message: `Cabinet assembly is missing: ${shell.missing.join(", ")}.`,
            assemblyId,
          }),
        );
      } else {
        const tolerance = 2;
        const shelves = assemblyItems.filter(
          (item) =>
            getPartRole(item) === "shelf" ||
            cleanText(item.type).toLowerCase() === "wr_shelf",
        );

        shelves.forEach((shelf) => {
          const box = getBox(shelf);
          if (!box) return;

          if (
            box.minX < shell.inner.minX - tolerance ||
            box.maxX > shell.inner.maxX + tolerance ||
            box.minY < shell.inner.minY - tolerance ||
            box.maxY > shell.inner.maxY + tolerance
          ) {
            warnings.push(
              makeIssue({
                severity: "warning",
                code: "SHELF_OUTSIDE_SIDES",
                title: "Shelf outside cabinet sides",
                message: `${shelf.label || "Shelf"} extends outside the cabinet inner side/top/bottom limits.`,
                componentId: shelf.id || null,
                assemblyId,
                partCode: getPartCode(shelf),
              }),
            );
          }
        });

        const generatedDoors = assemblyItems.filter(
          (item) =>
            item?.doorBuilderGenerated ||
            getPartRole(item) === "door" ||
            /^CAB-DOOR/i.test(getPartCode(item)),
        );

        generatedDoors.forEach((door) => {
          const box = getBox(door);
          if (!box || !shell.outer) return;

          const toleranceMm = 120;
          if (
            box.minX < shell.outer.minX - toleranceMm ||
            box.maxX > shell.outer.maxX + toleranceMm ||
            box.minY < shell.outer.minY - toleranceMm ||
            box.maxY > shell.outer.maxY + toleranceMm
          ) {
            errors.push(
              makeIssue({
                severity: "error",
                code: "DOOR_LARGER_THAN_OPENING",
                title: "Door exceeds cabinet opening",
                message: `${door.label || "Door"} extends beyond the cabinet shell by more than the allowed front tolerance.`,
                componentId: door.id || null,
                assemblyId,
                partCode: getPartCode(door),
              }),
            );
          }
        });

        const drawerGroups = new Map();
        assemblyItems
          .filter((item) => item?.drawerBuilderGenerated)
          .forEach((item) => {
            const drawerId =
              cleanText(item.drawerAssemblyId) ||
              `${assemblyId}-drawer-${Number(item.drawerIndex) || 0}`;
            if (!drawerGroups.has(drawerId)) drawerGroups.set(drawerId, []);
            drawerGroups.get(drawerId).push(item);
          });

        drawerGroups.forEach((drawerParts, drawerId) => {
          const roles = drawerParts.map(getPartRole);
          const sideCount = roles.filter((role) => role === "drawer_side").length;
          const slideCount = roles.filter(
            (role) => role === "drawer_slide",
          ).length;
          const frontCount = roles.filter(
            (role) => role === "drawer_front",
          ).length;
          const backCount = roles.filter(
            (role) => role === "drawer_back",
          ).length;
          const bottomCount = roles.filter(
            (role) => role === "drawer_bottom",
          ).length;
          const handleCount = roles.filter(
            (role) => role === "drawer_handle",
          ).length;

          if (
            frontCount !== 1 ||
            sideCount !== 2 ||
            backCount !== 1 ||
            bottomCount !== 1
          ) {
            errors.push(
              makeIssue({
                severity: "error",
                code: "INCOMPLETE_DRAWER_STRUCTURE",
                title: "Incomplete drawer structure",
                message: `Drawer ${drawerId} requires 1 front, 2 sides, 1 back, and 1 bottom.`,
                assemblyId,
              }),
            );
          }

          if (handleCount !== 1 || slideCount !== 2) {
            warnings.push(
              makeIssue({
                severity: "warning",
                code: "INCOMPLETE_DRAWER_HARDWARE",
                title: "Incomplete drawer hardware",
                message: `Drawer ${drawerId} should have 1 handle and 2 slide records.`,
                assemblyId,
              }),
            );
          }

          const sample = drawerParts[0] || {};
          const clearanceFields = [
            ["left", Number(sample.drawerLeftClearance)],
            ["right", Number(sample.drawerRightClearance)],
            ["bottom", Number(sample.drawerBottomClearance)],
          ];

          const badClearance = clearanceFields.find(
            ([, value]) => !Number.isFinite(value) || value < 0,
          );

          if (badClearance) {
            errors.push(
              makeIssue({
                severity: "error",
                code: "INVALID_DRAWER_CLEARANCE",
                title: "Invalid drawer clearance",
                message: `Drawer ${drawerId} has invalid ${badClearance[0]} clearance.`,
                assemblyId,
              }),
            );
          }

          const structuralParts = drawerParts.filter((item) =>
            ["drawer_side", "drawer_back", "drawer_bottom"].includes(
              getPartRole(item),
            ),
          );
          const drawerBounds = getBounds(structuralParts);

          if (
            drawerBounds &&
            (drawerBounds.minX < shell.inner.minX - tolerance ||
              drawerBounds.maxX > shell.inner.maxX + tolerance ||
              drawerBounds.minY < shell.inner.minY - tolerance ||
              drawerBounds.maxY > shell.inner.maxY + tolerance ||
              drawerBounds.minZ < shell.inner.minZ - tolerance ||
              drawerBounds.maxZ > shell.inner.maxZ + tolerance)
          ) {
            errors.push(
              makeIssue({
                severity: "error",
                code: "DRAWER_OUTSIDE_OPENING",
                title: "Drawer box exceeds cabinet opening",
                message: `Drawer ${drawerId} has structural parts outside the cabinet inner opening.`,
                assemblyId,
              }),
            );
          }
        });
      }
    }
  });

  if (hasUnsavedChanges) {
    warnings.push(
      makeIssue({
        severity: "warning",
        code: "UNSAVED_CHANGES",
        title: "Unsaved design changes",
        message:
          "The current component state differs from the last saved Blueprint design.",
      }),
    );
  }

  notices.push({
    severity: "notice",
    code: "INVENTORY_NOT_LINKED",
    title: "Inventory check not available yet",
    message:
      "Current Blueprint parts are not linked to live inventory records, so stock sufficiency is not evaluated in Batch 33.",
  });

  notices.push({
    severity: "notice",
    code: "CARPENTER_REVIEW_REQUIRED",
    title: "Final carpenter review still required",
    message:
      "Automated validation supports review but does not replace final checking by an experienced carpenter before production.",
  });

  return {
    passed: errors.length === 0,
    status:
      errors.length > 0
        ? "blocked"
        : warnings.length > 0
          ? "passed_with_warnings"
          : "passed",
    errors,
    warnings,
    notices,
    summary: {
      totalParts: realComponents.length,
      assemblyCount: assemblyMap.size,
      errorCount: errors.length,
      warningCount: warnings.length,
      noticeCount: notices.length,
    },
  };
}

export {
  buildDesignValidationReport,
  getDesignComponentSignature,
  getSavedDesignComponentSignature,
};
