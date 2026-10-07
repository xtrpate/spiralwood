import { snap } from "./utils";

const COMPAT_GRID_SIZE = 20;

export const DEFAULT_IMPORT_TEMPLATE_TYPE = "template_closet_wardrobe";
export const DEFAULT_IMPORT_DIMENSIONS = { w: 2400, h: 2400, d: 600 };

export function resolveImportTemplateType(savedData = {}, blueprintData = {}) {
  return (
    savedData?.templateType ||
    savedData?.importTemplateType ||
    savedData?.import_type ||
    blueprintData?.import_template_type ||
    DEFAULT_IMPORT_TEMPLATE_TYPE
  );
}

export function sanitizeImportDimensions(
  source = {},
  fallback = DEFAULT_IMPORT_DIMENSIONS,
) {
  return {
    w: Math.max(
      COMPAT_GRID_SIZE,
      snap(Number(source?.w ?? source?.width ?? fallback.w) || fallback.w),
    ),
    h: Math.max(
      COMPAT_GRID_SIZE,
      snap(Number(source?.h ?? source?.height ?? fallback.h) || fallback.h),
    ),
    d: Math.max(
      COMPAT_GRID_SIZE,
      snap(Number(source?.d ?? source?.depth ?? fallback.d) || fallback.d),
    ),
  };
}
