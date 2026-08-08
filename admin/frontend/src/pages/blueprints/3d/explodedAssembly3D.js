function compactText(value = "") {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function getAssemblyKey(component) {
  if (!component?.id) return null;

  if (component.groupId) {
    return `group:${component.groupId}`;
  }

  if (component.groupLabel && component.groupType) {
    return `label:${compactText(component.groupType)}:${compactText(
      component.groupLabel,
    )}`;
  }

  return `single:${component.id}`;
}

function normalizeDirection(vector) {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  if (length < 0.0001) return null;

  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  };
}

function fallbackDirection(component = {}) {
  const text = `${compactText(component.partCode)} ${compactText(
    component.label,
  )}`.toLowerCase();

  if (/\b(top|upper)\b/.test(text)) {
    return { x: 0, y: 1, z: 0 };
  }

  if (/\b(lower|bottom|shelf)\b/.test(text)) {
    return { x: 0, y: -1, z: 0 };
  }

  if (/\bleft\b/.test(text)) {
    return { x: -1, y: 0, z: 0 };
  }

  if (/\bright\b/.test(text)) {
    return { x: 1, y: 0, z: 0 };
  }

  if (/\b(front)\b/.test(text)) {
    return { x: 0, y: 0, z: -1 };
  }

  if (/\b(back|rear)\b/.test(text)) {
    return { x: 0, y: 0, z: 1 };
  }

  return { x: 0, y: 1, z: 0 };
}

function getTargetAssemblyKeys(components = [], selectedIds = []) {
  const selectedSet = new Set((selectedIds || []).filter(Boolean));

  if (!selectedSet.size) {
    return new Set(
      (components || [])
        .map(getAssemblyKey)
        .filter((key) => key && !key.startsWith("single:")),
    );
  }

  const keys = new Set();

  (components || []).forEach((component) => {
    if (!selectedSet.has(component?.id)) return;

    const key = getAssemblyKey(component);
    if (key) keys.add(key);
  });

  return keys;
}

function buildExplodedAssemblyOffsets({
  components = [],
  selectedIds = [],
  strength = 55,
  worldFromComponent,
} = {}) {
  const offsets = new Map();
  const source = Array.isArray(components) ? components.filter(Boolean) : [];

  source.forEach((component) => {
    if (component?.id) {
      offsets.set(component.id, { x: 0, y: 0, z: 0 });
    }
  });

  if (
    source.length < 2 ||
    typeof worldFromComponent !== "function" ||
    clampNumber(strength, 0, 100) <= 0
  ) {
    return offsets;
  }

  const targetKeys = getTargetAssemblyKeys(source, selectedIds);
  if (!targetKeys.size) return offsets;

  const groups = new Map();

  source.forEach((component) => {
    const key = getAssemblyKey(component);
    if (!key || !targetKeys.has(key)) return;

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(component);
  });

  const strengthRatio = clampNumber(strength, 0, 100) / 100;

  groups.forEach((items) => {
    if (items.length < 2) return;

    const worldItems = items.map((component) => ({
      component,
      world: worldFromComponent(component),
    }));

    const center = worldItems.reduce(
      (sum, item) => ({
        x: sum.x + item.world.x,
        y: sum.y + item.world.y,
        z: sum.z + item.world.z,
      }),
      { x: 0, y: 0, z: 0 },
    );

    center.x /= worldItems.length;
    center.y /= worldItems.length;
    center.z /= worldItems.length;

    const extents = worldItems.reduce(
      (acc, item) => ({
        minX: Math.min(acc.minX, item.world.x),
        maxX: Math.max(acc.maxX, item.world.x),
        minY: Math.min(acc.minY, item.world.y),
        maxY: Math.max(acc.maxY, item.world.y),
        minZ: Math.min(acc.minZ, item.world.z),
        maxZ: Math.max(acc.maxZ, item.world.z),
      }),
      {
        minX: Infinity,
        maxX: -Infinity,
        minY: Infinity,
        maxY: -Infinity,
        minZ: Infinity,
        maxZ: -Infinity,
      },
    );

    const spread = Math.hypot(
      extents.maxX - extents.minX,
      extents.maxY - extents.minY,
      extents.maxZ - extents.minZ,
    );

    const largestPartDimension = Math.max(
      ...items.map((component) =>
        Math.max(
          Number(component.width) || 0,
          Number(component.height) || 0,
          Number(component.depth) || 0,
        ),
      ),
      1,
    );

    const fullDistance = clampNumber(
      Math.max(largestPartDimension * 0.32, spread * 0.45, 180),
      180,
      900,
    );

    const distance = fullDistance * strengthRatio;

    worldItems.forEach(({ component, world }) => {
      const relative = {
        x: world.x - center.x,
        y: world.y - center.y,
        z: world.z - center.z,
      };

      const direction =
        normalizeDirection(relative) || fallbackDirection(component);

      offsets.set(component.id, {
        x: direction.x * distance,
        y: direction.y * distance,
        z: direction.z * distance,
      });
    });
  });

  return offsets;
}

export {
  buildExplodedAssemblyOffsets,
  getAssemblyKey,
  getTargetAssemblyKeys,
};