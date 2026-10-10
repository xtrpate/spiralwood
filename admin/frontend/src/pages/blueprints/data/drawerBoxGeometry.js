// D1-C: Whole drawer-box geometry with a full-width underlaid floor.
// Cabinet component coordinates are minimum corners; increasing Y goes DOWN.
// A generated moving box has front, two side walls, back wall, and bottom.
// The underlaid bottom sits immediately below the side/back walls (no overlap).
// Drawer slide records are fixed to the cabinet and are not part of this plan.
const finite = (value) => typeof value === "number" && Number.isFinite(value);
const mm = (value) => Number(value.toFixed(3));

export function planCompleteDrawerBoxGeometry({
  boxX,
  boxZ,
  boxWidth,
  drawerDepth,
  slotY,
  bodyHeight,
  sideThickness,
  bottomThickness,
} = {}) {
  const inputs = [boxX, boxZ, boxWidth, drawerDepth, slotY, bodyHeight, sideThickness, bottomThickness];
  const fail = (reason) => ({ ok: false, reason });
  if (!inputs.every(finite)) return fail("Drawer box dimensions are not finite.");
  if (boxWidth <= 0 || drawerDepth <= 0 || bodyHeight <= 0 ||
      sideThickness <= 0 || bottomThickness <= 0) {
    return fail("Drawer box dimensions must be positive.");
  }
  const insideWidth = mm(boxWidth - 2 * sideThickness);
  const insideDepth = mm(drawerDepth - sideThickness);
  const wallHeight = mm(bodyHeight - bottomThickness);
  if (insideWidth <= 20 || insideDepth <= 20 || wallHeight <= 20) {
    return fail("Drawer box is too small for the selected wall and floor thicknesses.");
  }

  const leftSide = {
    x: mm(boxX), y: mm(slotY), z: mm(boxZ),
    width: mm(sideThickness), height: wallHeight, depth: mm(drawerDepth),
  };
  const rightSide = {
    x: mm(boxX + boxWidth - sideThickness), y: mm(slotY), z: mm(boxZ),
    width: mm(sideThickness), height: wallHeight, depth: mm(drawerDepth),
  };
  const back = {
    x: mm(boxX + sideThickness), y: mm(slotY), z: mm(boxZ),
    width: insideWidth, height: wallHeight, depth: mm(sideThickness),
  };
  const bottom = {
    x: mm(boxX), y: mm(slotY + wallHeight), z: mm(boxZ),
    width: mm(boxWidth), height: mm(bottomThickness), depth: mm(drawerDepth),
  };
  return { ok: true, reason: "", leftSide, rightSide, back, bottom };
}
