// ADM-B3E1 — orthographic blueprint PDF depth ordering, export-only.
// 3D objects, part sizes, data persistence, and other view projections are unchanged.
// The cabinet's front is toward increasing Z (doors near maxZ; back at minZ).
// Draw far-to-near: front ascending Z; back descending Z.
export function sortOrthographicPartsByDepth(items, view) {
  if (!Array.isArray(items)) return [];
  if (view !== "front" && view !== "back") return items;

  const direction = view === "front" ? 1 : -1;
  const withDepth = items.map((item, index) => {
    const component = item?.comp || {};
    const z = Number(component.z);
    const depth = Number(component.depth);
    const centerZ =
      (Number.isFinite(z) ? z : 0) +
      (Number.isFinite(depth) && depth > 0 ? depth / 2 : 0);
    return { item, index, centerZ };
  });

  withDepth.sort((a, b) => {
    const diff = direction * (a.centerZ - b.centerZ);
    return Math.abs(diff) > 0.000001 ? diff : a.index - b.index;
  });

  return withDepth.map(({ item }) => item);
}
