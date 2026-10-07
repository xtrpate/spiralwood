// data/initHelpers.js — Blueprint initialization helpers
// Separated to avoid circular dependency between utils.js and templateComponents.js
import { normalizeComponent } from "./componentUtils";

function resolveInitialComponents(savedData = {}) {
  const savedComponents = Array.isArray(savedData?.components)
    ? savedData.components
        .map(normalizeComponent)
        .filter((component) => component?.type !== "reference_proxy")
    : [];

  return savedComponents;
}

export { resolveInitialComponents };
