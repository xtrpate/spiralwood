import { useCallback, useMemo } from "react";
import toast from "react-hot-toast";
import { getComponentsBounds3D } from "../data/componentUtils";
import { formatDims } from "../data/utils";
import { openBlueprintWindow } from "../data/editorUtils";
import {
  buildAllExportPages,
  buildBlueprintDocumentHtml,
} from "../export/exportBuilders";

export function useBlueprintExport({
  components,
  selectedComp,
  selectedComponents,
  selectedLabel,
  blueprintTitle,
  unit,
}) {
  const exportTargetComponents = useMemo(
    () => (selectedComp ? selectedComponents : components),
    [selectedComp, selectedComponents, components],
  );

  const exportTargetBounds = useMemo(
    () => getComponentsBounds3D(exportTargetComponents),
    [exportTargetComponents],
  );

  const exportTargetLabel = useMemo(() => {
    if (selectedComp) return selectedLabel;
    return blueprintTitle || "Full Blueprint Layout";
  }, [selectedComp, selectedLabel, blueprintTitle]);

  const exportTargetMaterials = useMemo(() => {
    if (!exportTargetComponents.length) return "—";
    return (
      [
        ...new Set(
          exportTargetComponents.map((component) => component.material).filter(Boolean),
        ),
      ].join(", ") || "—"
    );
  }, [exportTargetComponents]);

  const exportTargetDims = useMemo(() => {
    if (!exportTargetBounds) return "—";
    return formatDims(
      exportTargetBounds.width,
      exportTargetBounds.height,
      exportTargetBounds.depth,
      unit,
    );
  }, [exportTargetBounds, unit]);

  const openExportSheets = useCallback(
    (autoPrint = false) => {
      if (!exportTargetComponents.length) {
        toast.error("Walang component na mae-export.");
        return;
      }

      const pages = buildAllExportPages({
        exportComponents: exportTargetComponents,
        selectedComp: selectedComp || exportTargetComponents[0],
        selectedLabel: exportTargetLabel,
        selectedMaterialText: exportTargetMaterials,
        selectedBounds3D: exportTargetBounds,
        selectedDimsText: exportTargetDims,
        blueprintTitle: blueprintTitle || "Blueprint Design",
        unit,
      });

      const html = buildBlueprintDocumentHtml(pages);
      const opened = openBlueprintWindow(html, autoPrint);

      if (!opened) return;

      if (!autoPrint) {
        toast.success("Export sheets opened.");
      }
    },
    [
      exportTargetComponents,
      selectedComp,
      exportTargetLabel,
      exportTargetMaterials,
      exportTargetBounds,
      exportTargetDims,
      blueprintTitle,
      unit,
    ],
  );

  return { openExportSheets };
}
