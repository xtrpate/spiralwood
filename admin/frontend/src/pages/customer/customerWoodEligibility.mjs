// A customer wood request applies only to structural wooden furniture parts.
// Unknown materials and hardware fail closed; Admin decides actual production materials.
const NON_WOOD_MATERIAL = /\b(?:steel|stainless|metal|iron|alumini?um|brass|copper|glass|mirror|acrylic|plastic|pvc|rubber|fabric|leather|foam|upholstery|ceramic|concrete|wire|electrical)\b/i;
const WOOD_MATERIAL = /\b(?:wood|wooden|plywood|timber|lumber|mdf|hdf|fibreboard|fiberboard|particleboard|blockboard|melamine|mahogany|pine|acacia|narra|tanguile|gmelina|rubberwood|teak|oak|maple|walnut|bamboo)\b/i;
const HARDWARE_IDENTITY = /(?:^|[\s_-])(?:hardware|hinge|handle|knob|pull|slide|slider|runner|caster|wheel|latch|lockset|bolt|screw|nail|bracket|fastener|rod|pipe|tube|track|bearing|led|wiring)(?=$|[\s_-])/i;
const WOOD_PART_IDENTITY = /(?:^|[\s_-])(?:panel|shelf|shelves|board|tabletop|top|bottom|side|door|front|back|drawer|divider|leg|apron|plinth|toe|kick|rail|frame|slat|seat|headboard|footboard|armrest|backrest|support|brace|post|beam|carcass|cabinet)(?=$|[\s_-])/i;

export function isCustomerWoodEligibleComponent(component = {}) {
  if (!component || typeof component !== "object" || component.type === "reference_proxy") return false;
  const material = String(component.material ?? component.wood_type ?? "").trim();
  const identity = [component.type, component.partRole, component.partCode, component.partFunction]
    .filter(Boolean).join(" ");
  const label = [component.label, component.name, component.category].filter(Boolean).join(" ");
  // Material and explicit part role outweigh broad category names.
  if (NON_WOOD_MATERIAL.test(material)) return false;
  if (HARDWARE_IDENTITY.test(identity)) return false;
  if (HARDWARE_IDENTITY.test(label) && !WOOD_PART_IDENTITY.test(identity)) return false;
  if (WOOD_MATERIAL.test(material)) return true;
  // Legacy wooden panels can lack material metadata; accept only recognizable
  // wooden part roles, never completely unknown geometry/hardware.
  return WOOD_PART_IDENTITY.test(identity) || WOOD_PART_IDENTITY.test(label);
}

export function getCustomerWoodEligibleTargetIds(components = [], targetIds = []) {
  const selected = new Set(Array.isArray(targetIds) ? targetIds : []);
  return new Set((Array.isArray(components) ? components : [])
    .filter((component) => selected.has(component?.id) &&
      isCustomerWoodEligibleComponent(component))
    .map((component) => component.id));
}
