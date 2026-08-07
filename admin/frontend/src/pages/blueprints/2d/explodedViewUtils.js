function compactText(value = "") {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function compareExplodedParts(a, b) {
  const groupA = [
    compactText(a?.groupLabel),
    compactText(a?.groupType),
    compactText(a?.groupId),
  ].join("|");

  const groupB = [
    compactText(b?.groupLabel),
    compactText(b?.groupType),
    compactText(b?.groupId),
  ].join("|");

  const groupCompare = groupA.localeCompare(groupB, undefined, {
    numeric: true,
    sensitivity: "base",
  });

  if (groupCompare !== 0) return groupCompare;

  const partCompare = compactText(a?.partCode).localeCompare(
    compactText(b?.partCode),
    undefined,
    {
      numeric: true,
      sensitivity: "base",
    },
  );

  if (partCompare !== 0) return partCompare;

  const labelCompare = compactText(a?.label).localeCompare(
    compactText(b?.label),
    undefined,
    {
      numeric: true,
      sensitivity: "base",
    },
  );

  if (labelCompare !== 0) return labelCompare;

  return compactText(a?.id).localeCompare(compactText(b?.id), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function getExplodedAssemblyItems(allComponents = [], component = null) {
  if (!component?.id) return [];

  if (component.groupId) {
    const grouped = allComponents.filter(
      (item) => item?.groupId === component.groupId,
    );

    if (grouped.length) return grouped;
  }

  if (component.groupLabel && component.groupType) {
    const looseAssembly = allComponents.filter(
      (item) =>
        item?.groupLabel === component.groupLabel &&
        item?.groupType === component.groupType,
    );

    if (looseAssembly.length > 1 && looseAssembly.length <= 12) {
      return looseAssembly;
    }
  }

  return [component];
}

function sortExplodedComponents(components = []) {
  return [...components].filter(Boolean).sort(compareExplodedParts);
}

function resolveExplodedPreviewComponents(
  selectedComponents = [],
  allComponents = [],
) {
  const all = Array.isArray(allComponents) ? allComponents.filter(Boolean) : [];
  const selected = Array.isArray(selectedComponents)
    ? selectedComponents.filter(Boolean)
    : [];

  if (!selected.length) {
    return sortExplodedComponents(all);
  }

  const allById = new Map(
    all.filter((item) => item?.id).map((item) => [item.id, item]),
  );
  const result = new Map();

  selected.forEach((selectedItem) => {
    const current = allById.get(selectedItem?.id) || selectedItem;

    getExplodedAssemblyItems(all, current).forEach((item) => {
      if (item?.id) result.set(item.id, item);
    });
  });

  return sortExplodedComponents(
    result.size ? Array.from(result.values()) : selected,
  );
}

export {
  compareExplodedParts,
  getExplodedAssemblyItems,
  sortExplodedComponents,
  resolveExplodedPreviewComponents,
};