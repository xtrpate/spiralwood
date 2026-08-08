export function buildConversionCutListRows(convertedComponents = []) {
  if (!convertedComponents.length) return [];

  const rowMap = new Map();

  convertedComponents.forEach((component) => {
    const partFamily = component?.handoffPartFamily || "other";
    const partRole = component?.handoffPartRole || "other";
    const material = component?.material || "—";

    const widthMm = Math.max(
      0,
      Number(component?.handoffWidthMm) || Number(component?.width) || 0,
    );
    const heightMm = Math.max(
      0,
      Number(component?.handoffHeightMm) || Number(component?.height) || 0,
    );
    const depthMm = Math.max(
      0,
      Number(component?.handoffDepthMm) || Number(component?.depth) || 0,
    );
    const thicknessMm = Math.max(
      0,
      Number(component?.handoffThicknessMm) || 0,
    );

    const estimationUnit = component?.handoffEstimationUnit || "other";
    const cutListType = component?.handoffCutListType || "other";
    const costBasis = component?.handoffCostBasis || "other";
    const quantity = Math.max(
      1,
      Number(component?.handoffQty) || Number(component?.qty) || 1,
    );

    const areaSqM =
      Number(component?.handoffAreaSqM) ||
      (widthMm > 0 && heightMm > 0
        ? Number(((widthMm * heightMm) / 1_000_000).toFixed(4))
        : 0);

    const volumeCuM =
      Number(component?.handoffVolumeCuM) ||
      (widthMm > 0 && heightMm > 0 && depthMm > 0
        ? Number(((widthMm * heightMm * depthMm) / 1_000_000_000).toFixed(4))
        : 0);

    const key = [
      partFamily,
      partRole,
      String(material).trim().toLowerCase(),
      widthMm,
      heightMm,
      depthMm,
      thicknessMm,
      estimationUnit,
      cutListType,
      costBasis,
    ].join("|");

    if (!rowMap.has(key)) {
      rowMap.set(key, {
        id: key,
        partFamily,
        partRole,
        material,
        widthMm,
        heightMm,
        depthMm,
        thicknessMm,
        estimationUnit,
        cutListType,
        costBasis,
        qty: 0,
        partCount: 0,
        totalAreaSqM: 0,
        totalVolumeCuM: 0,
        sampleLabel: component?.label || "Converted Part",
      });
    }

    const row = rowMap.get(key);
    row.qty += quantity;
    row.partCount += 1;
    row.totalAreaSqM = Number(
      (row.totalAreaSqM + areaSqM * quantity).toFixed(4),
    );
    row.totalVolumeCuM = Number(
      (row.totalVolumeCuM + volumeCuM * quantity).toFixed(4),
    );
  });

  return Array.from(rowMap.values()).sort((first, second) => {
    if ((first.partFamily || "") < (second.partFamily || "")) return -1;
    if ((first.partFamily || "") > (second.partFamily || "")) return 1;
    if ((first.partRole || "") < (second.partRole || "")) return -1;
    if ((first.partRole || "") > (second.partRole || "")) return 1;
    if ((first.material || "") < (second.material || "")) return -1;
    if ((first.material || "") > (second.material || "")) return 1;
    if (first.widthMm !== second.widthMm) return first.widthMm - second.widthMm;
    if (first.heightMm !== second.heightMm) {
      return first.heightMm - second.heightMm;
    }
    return first.depthMm - second.depthMm;
  });
}
