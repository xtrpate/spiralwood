// Pure, non-destructive planning for merging manual furniture parts.
// Does not modify coordinates, dimensions, material, or quantity.
const membershipId = (part) => String(part?.groupId || part?.assemblyId || "").trim();
const membershipName = (part) => String(part?.groupLabel || part?.assemblyName || "").trim();

export function planManualAssemblyMerge({
  components = [],
  selectedIds = [],
  targetAssemblyId,
  isLocked = () => false,
} = {}) {
  const targetId = String(targetAssemblyId || "").trim();
  const parts = Array.isArray(components) ? components : [];
  const ids = new Set(Array.isArray(selectedIds) ? selectedIds.filter(Boolean) : []);
  const fail = (reason) => ({ ok: false, reason, changesById: {}, count: 0 });
  if (!targetId) return fail("No destination assembly selected.");

  const targetMembers = parts.filter((part) => membershipId(part) === targetId);
  if (!targetMembers.length) return fail("Destination assembly no longer exists.");
  const target = targetMembers[0];
  const targetType = String(target.assemblyType || target.groupType || "").toLowerCase();
  if (targetType !== "custom" && targetType !== "assembly") {
    return fail("Only manual custom assemblies can receive parts.");
  }
  if (targetMembers.some((part) => isLocked(part))) {
    return fail("Unlock the destination assembly before merging parts.");
  }
  const name = membershipName(target);
  if (!name) return fail("Destination assembly has no name.");

  const selected = parts.filter((part) => ids.has(part.id));
  if (selected.length !== ids.size) return fail("Selection changed. Select the parts again.");
  const moving = selected.filter((part) => membershipId(part) !== targetId);
  if (!moving.length) return fail("Select other parts or assemblies to add first.");
  if (moving.some((part) => isLocked(part))) {
    return fail("Unlock all selected parts before merging.");
  }

  // Never silently split another assembly: its entire membership must be selected.
  const sourceIds = new Set(moving.map(membershipId).filter(Boolean));
  for (const sourceId of sourceIds) {
    const sourceMembers = parts.filter((part) => membershipId(part) === sourceId);
    if (sourceMembers.some((part) => !ids.has(part.id))) {
      return fail("Select every part of each source assembly before merging.");
    }
    if (sourceMembers.some((part) => {
      const type = String(part.assemblyType || part.groupType || "").toLowerCase();
      return type !== "custom" && type !== "assembly";
    })) {
      return fail("Template assemblies cannot be merged into a manual custom assembly.");
    }
  }

  const changesById = {};
  for (const part of moving) {
    changesById[part.id] = {
      assemblyId: targetId,
      assemblyName: name,
      assemblyType: "custom",
      groupId: targetId,
      groupLabel: name,
      groupType: "assembly",
    };
  }
  return { ok: true, reason: "", count: moving.length, changesById, assemblyName: name };
}
