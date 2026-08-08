export function getSelectionBoundsXYZ(items = []) {
  if (!Array.isArray(items) || !items.length) return null;

  const minX = Math.min(...items.map((c) => Number(c.x) || 0));
  const minY = Math.min(...items.map((c) => Number(c.y) || 0));
  const minZ = Math.min(...items.map((c) => Number(c.z) || 0));

  const maxX = Math.max(
    ...items.map((c) => (Number(c.x) || 0) + (Number(c.width) || 0)),
  );
  const maxY = Math.max(
    ...items.map((c) => (Number(c.y) || 0) + (Number(c.height) || 0)),
  );
  const maxZ = Math.max(
    ...items.map((c) => (Number(c.z) || 0) + (Number(c.depth) || 0)),
  );

  return {
    minX,
    minY,
    minZ,
    maxX,
    maxY,
    maxZ,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    centerZ: (minZ + maxZ) / 2,
    width: maxX - minX,
    height: maxY - minY,
    depth: maxZ - minZ,
  };
}
