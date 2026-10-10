// D1: Fit Drawer Builder layouts to actual unobstructed cabinet openings.
// Pure geometry planner. Never changes existing parts, inventory, or pricing.
const positive = (value) => Number.isFinite(Number(value)) && Number(value) > 0;
const validRect = (rect) => rect && ["x", "y", "z", "width", "height", "depth"].every(
  (name) => Number.isFinite(Number(rect[name])) &&
    (!["width", "height", "depth"].includes(name) || positive(rect[name])),
);

export function planDrawerOpeningTargets({
  scope = "whole",
  drawerCount = 3,
  overallRect = null,
  bayRects = [],
  openingRects = [],
  shelfParts = [],
  dividerParts = [],
  frontOverlay = 0,
  drawerGap = 0,
} = {}) {
  const fail = (reason) => ({
    ok: false, reason, targets: [], frontOverlay: 0,
    shelfFitted: false, overlayReduced: false,
  });
  const count = Number(drawerCount);
  if (!Number.isInteger(count) || count < 1 || count > 8) {
    return fail("Drawer Count must be between 1 and 8.");
  }
  if (!["whole", "bay", "opening"].includes(scope)) {
    return fail("Unknown drawer layout scope.");
  }
  if (!validRect(overallRect)) {
    return fail("Cabinet interior bounds are invalid.");
  }
  const bays = Array.isArray(bayRects) ? bayRects : [];
  const openings = Array.isArray(openingRects) ? openingRects : [];
  const shelves = (Array.isArray(shelfParts) ? shelfParts : []).filter((part) => positive(part?.height));
  const dividers = (Array.isArray(dividerParts) ? dividerParts : []).filter((part) => positive(part?.width));
  const hasShelves = shelves.length > 0;
  const hasDividers = dividers.length > 0;

  let targets = [];
  let shelfFitted = false;

  if (scope === "whole" && hasDividers) {
    return fail("This cabinet has dividers. Whole Cabinet Opening would cut across them. Choose Each Cabinet Bay or Each Shelf Opening instead.");
  }
  if (scope === "whole" && hasShelves) {
    // D1-B: Drawer Count is the TOTAL requested, not the number of openings.
    // Preserve fixed shelves by assigning complete drawer assemblies to their
    // existing unobstructed openings; never place a drawer across a shelf.
    if (bays.length !== 1 || !openings.length) {
      return fail("Whole Cabinet Opening with shelves needs one measurable cabinet bay. Use Each Shelf Opening for complex layouts.");
    }
    const gap = Number(drawerGap);
    if (!Number.isFinite(gap) || gap < 0) {
      return fail("Drawer Gap must be zero or greater.");
    }
    // Mirrors the Drawer Builder's minimum 80-mm slot-height check.
    const minSlotHeight = 80;
    const candidates = openings
      .map((rect, originalIndex) => ({
        rect,
        originalIndex,
        capacity: validRect(rect)
          ? Math.min(8, Math.max(0, Math.floor((Number(rect.height) + gap + 0.00001) / (minSlotHeight + gap))))
          : 0,
      }))
      .filter((item) => item.capacity > 0);
    const totalCapacity = candidates.reduce((sum, item) => sum + item.capacity, 0);
    if (totalCapacity < count) {
      return fail(`Drawer Count ${count} cannot fit in the ${openings.length} clear cabinet opening(s) with an 80 mm minimum drawer slot and ${gap} mm gap. Maximum supported count for these openings: ${totalCapacity}. Reduce Drawer Count or change shelf positions.`);
    }
    // Prefer a taller opening for a single drawer. For equal heights, prefer
    // the opening with lower Y; only selected openings receive drawer parts.
    const ranked = [...candidates].sort((a, b) =>
      Number(b.rect.height) - Number(a.rect.height) ||
      Number(a.rect.y) - Number(b.rect.y) ||
      a.originalIndex - b.originalIndex,
    );
    const allocation = new Map();
    let remaining = count;
    for (const item of ranked) {
      if (!remaining) break;
      allocation.set(item.originalIndex, 1);
      remaining -= 1;
    }
    // For extra drawers, give the next slot to the opening with the most
    // remaining height per drawer; never exceed its valid slot capacity.
    while (remaining) {
      const available = ranked.filter((item) =>
        (allocation.get(item.originalIndex) || 0) < item.capacity,
      );
      if (!available.length) {
        return fail("Insufficient drawer slots in the selected cabinet openings.");
      }
      available.sort((a, b) => {
        const aCount = allocation.get(a.originalIndex) || 0;
        const bCount = allocation.get(b.originalIndex) || 0;
        const aHeight = (Number(a.rect.height) - gap * aCount) / (aCount + 1);
        const bHeight = (Number(b.rect.height) - gap * bCount) / (bCount + 1);
        return bHeight - aHeight || a.originalIndex - b.originalIndex;
      });
      const picked = available[0];
      allocation.set(picked.originalIndex, (allocation.get(picked.originalIndex) || 0) + 1);
      remaining -= 1;
    }
    shelfFitted = true;
    targets = openings.flatMap((rect, index) => {
      const targetDrawerCount = allocation.get(index) || 0;
      return targetDrawerCount ? [{ ...rect, targetDrawerCount }] : [];
    });
  } else if (scope === "bay") {
    if (hasShelves) {
      return fail("Each Cabinet Bay would cross existing shelves. Choose Each Shelf Opening to keep the shelves clear.");
    }
    targets = bays.map((rect) => ({ ...rect, targetDrawerCount: count }));
  } else if (scope === "opening") {
    targets = openings.map((rect) => ({ ...rect, targetDrawerCount: count }));
  } else {
    targets = [{ ...overallRect, targetDrawerCount: count, bayIndex: 1 }];
  }
  if (!targets.length || targets.some((rect) => !validRect(rect))) {
    return fail("No valid cabinet opening found for this drawer layout.");
  }

  const requestedOverlay = Number(frontOverlay);
  if (!Number.isFinite(requestedOverlay) || requestedOverlay < 0) {
    return fail("Drawer front overlay must be zero or greater.");
  }

  // Adjacent fronts must leave at least a 2 mm visible gap across each
  // structural shelf/divider; never silently overlap front panels.
  const barriers = [];
  if (targets.length > 1 || scope === "opening") {
    barriers.push(...shelves.map((part) => Number(part.height)));
    barriers.push(...dividers.map((part) => Number(part.width)));
  }
  const minimumBarrier = barriers.length ? Math.min(...barriers) : Infinity;
  const maxSafeOverlay = Number.isFinite(minimumBarrier)
    ? Math.max(0, (minimumBarrier - 2) / 2)
    : requestedOverlay;
  const resolvedOverlay = Math.min(requestedOverlay, maxSafeOverlay);
  const round = (value) => Number(value.toFixed(3));

  return {
    ok: true,
    reason: "",
    targets,
    shelfFitted,
    frontOverlay: round(resolvedOverlay),
    overlayReduced: resolvedOverlay < requestedOverlay - 0.001,
  };
}
