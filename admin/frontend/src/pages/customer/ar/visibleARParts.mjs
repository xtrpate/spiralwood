// AR-R4A: Consistent, read-only inclusion policy for Customer Viewer and AR.
// Mirrors customerGeometryBounds.mjs: hidden or deleted parts are not visible furniture.
export const isVisibleFurniturePart = (component) =>
  Boolean(component && typeof component === "object" && !Array.isArray(component)) &&
  component.visible !== false &&
  Number(component.is_deleted || 0) !== 1;
