const readPositiveMm = (value) => {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) && number > 0 ? number : null;
};

const roundMm = (value) => Math.round(value * 10) / 10;

/**
 * Calculates furniture fit against manually entered wall dimensions.
 *
 * Important:
 * - All dimensions are in millimeters.
 * - Wall measurements are supplied by the customer.
 * - This function does not detect or measure physical walls.
 * - It checks width and height only.
 * - It does not resize the furniture.
 */
export function calculateWallFit({
  furnitureDimensionsMm = {},
  wallDimensionsMm = {},
} = {}) {
  const furnitureWidth = readPositiveMm(furnitureDimensionsMm.width_mm);

  const furnitureHeight = readPositiveMm(furnitureDimensionsMm.height_mm);

  if (furnitureWidth === null || furnitureHeight === null) {
    return {
      status: "unavailable",
      message:
        "Configured furniture width and height are unavailable, so fit cannot be calculated.",
      measurementSource: "customer-entered-wall-dimensions",
      values: null,
    };
  }

  const wallWidth = readPositiveMm(wallDimensionsMm.width_mm);

  const wallHeight = readPositiveMm(wallDimensionsMm.height_mm);

  if (wallWidth === null || wallHeight === null) {
    return {
      status: "incomplete",
      message:
        "Enter both usable wall width and usable wall height to estimate the fit.",
      measurementSource: "customer-entered-wall-dimensions",
      values: null,
    };
  }

  const widthFits = furnitureWidth <= wallWidth;

  const heightFits = furnitureHeight <= wallHeight;

  const fits = widthFits && heightFits;

  return {
    status: fits ? "fits" : "does-not-fit",

    message: fits
      ? "Fits within the wall dimensions you entered. This is a dimensional estimate, not an AR-measured wall check."
      : "Does not fit within the wall dimensions you entered.",

    measurementSource: "customer-entered-wall-dimensions",

    values: {
      wallWidthMm: roundMm(wallWidth),
      wallHeightMm: roundMm(wallHeight),

      furnitureWidthMm: roundMm(furnitureWidth),

      furnitureHeightMm: roundMm(furnitureHeight),

      widthFits,
      heightFits,

      leftClearanceIfCenteredMm: widthFits
        ? roundMm((wallWidth - furnitureWidth) / 2)
        : null,

      rightClearanceIfCenteredMm: widthFits
        ? roundMm((wallWidth - furnitureWidth) / 2)
        : null,

      remainingHeightMm: heightFits
        ? roundMm(wallHeight - furnitureHeight)
        : null,

      excessWidthMm: widthFits ? 0 : roundMm(furnitureWidth - wallWidth),

      excessHeightMm: heightFits ? 0 : roundMm(furnitureHeight - wallHeight),
    },
  };
}
