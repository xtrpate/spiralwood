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

function getSemanticDirection(component = {}) {
  const code = compactText(component.partCode).toUpperCase();
  const label = compactText(component.label).toLowerCase();
  const type = compactText(component.type).toLowerCase();
  const text = `${label} ${type}`;
  const codeTokens = new Set(code.split(/[^A-Z0-9]+/).filter(Boolean));

  const front = /\bfront\b/.test(text) || codeTokens.has("FL") || codeTokens.has("FR");
  const rear =
    /\b(back|rear)\b/.test(text) || codeTokens.has("BL") || codeTokens.has("BR");
  const left = /\bleft\b/.test(text) || codeTokens.has("FL") || codeTokens.has("BL");
  const right = /\bright\b/.test(text) || codeTokens.has("FR") || codeTokens.has("BR");

  // Vertical assembly layers get priority over generic side wording.
  if (/\b(top|upper)\b/.test(text)) {
    return { x: 0, y: 1, z: 0 };
  }

  if (/\b(lower|bottom)\b/.test(text)) {
    return { x: 0, y: -1, z: 0 };
  }

  // Common furniture corner parts (legs/posts) separate diagonally in plan.
  if (front && left) return normalizeDirection({ x: -1, y: 0, z: -1 });
  if (front && right) return normalizeDirection({ x: 1, y: 0, z: -1 });
  if (rear && left) return normalizeDirection({ x: -1, y: 0, z: 1 });
  if (rear && right) return normalizeDirection({ x: 1, y: 0, z: 1 });

  // Head/foot wording is useful for bed assemblies even without front/rear labels.
  if (/\bhead(board)?\b/.test(text)) return { x: 0, y: 0, z: 1 };
  if (/\bfoot(board)?\b/.test(text)) return { x: 0, y: 0, z: -1 };

  if (front) return { x: 0, y: 0, z: -1 };
  if (rear) return { x: 0, y: 0, z: 1 };
  if (left) return { x: -1, y: 0, z: 0 };
  if (right) return { x: 1, y: 0, z: 0 };

  return null;
}

function clampExplodedOffsetToFloor(
  component,
  offset,
  floorY,
  worldMinYFromComponent,
) {
  if (!Number.isFinite(floorY) || typeof worldMinYFromComponent !== "function") {
    return offset;
  }

  const rawMinY = worldMinYFromComponent(component);
  if (rawMinY == null) return offset;

  const minY = Number(rawMinY);
  if (!Number.isFinite(minY)) return offset;

  const displayedMinY = minY + offset.y;
  if (displayedMinY >= floorY) return offset;

  return {
    ...offset,
    y: offset.y + (floorY - displayedMinY),
  };
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
  floorY = null,
  worldMinYFromComponent = null,
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

    // Keep the exploded drawing readable without the old over-wide star burst.
    const fullDistance = clampNumber(
      Math.max(largestPartDimension * 0.24, spread * 0.3, 160),
      160,
      650,
    );

    const distance = fullDistance * strengthRatio;

    worldItems.forEach(({ component, world }) => {
      const relative = {
        x: world.x - center.x,
        y: world.y - center.y,
        z: world.z - center.z,
      };

      const direction =
        getSemanticDirection(component) ||
        normalizeDirection(relative) ||
        { x: 0, y: 1, z: 0 };

      const rawOffset = {
        x: direction.x * distance,
        y: direction.y * distance,
        z: direction.z * distance,
      };

      offsets.set(
        component.id,
        clampExplodedOffsetToFloor(
          component,
          rawOffset,
          floorY,
          worldMinYFromComponent,
        ),
      );
    });
  });

  return offsets;
}

export {
  buildExplodedAssemblyOffsets,
  getAssemblyKey,
  getTargetAssemblyKeys,
};
