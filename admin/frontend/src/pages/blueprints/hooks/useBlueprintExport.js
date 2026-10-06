import { useCallback, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { getComponentsBounds3D } from "../data/componentUtils";
import { formatDims } from "../data/utils";
import { openBlueprintWindow } from "../data/editorUtils";
import {
  buildAllExportPages,
  buildBlueprintDocumentHtml,
} from "../export/exportBuilders";
import { downloadBlueprintPdf } from "../export/blueprintPdfDownload";

export function useBlueprintExport({
  components,
  blueprintTitle,
  unit,
  hasUnsavedDesignChanges = false,
  designValidationReport = null,
}) {
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const exportTargetComponents = useMemo(
    () =>
      (Array.isArray(components) ? components : []).filter(
        (component) => component && component.type !== "reference_proxy",
      ),
    [components],
  );

  const exportTargetBounds = useMemo(
    () => getComponentsBounds3D(exportTargetComponents),
    [exportTargetComponents],
  );

  const exportTargetLabel = useMemo(() => {
    if (!exportTargetComponents.length) return "Full Blueprint Layout";

    const groupLabels = [
      ...new Set(
        exportTargetComponents
          .map((component) => String(component?.groupLabel || "").trim())
          .filter(Boolean),
      ),
    ];

    if (groupLabels.length === 1) return groupLabels[0];
    if (exportTargetComponents.length === 1) {
      return exportTargetComponents[0]?.label || "Blueprint Object";
    }

    return "Full Blueprint Layout";
  }, [exportTargetComponents]);

  const exportTargetMaterials = useMemo(() => {
    if (!exportTargetComponents.length) return "—";
    return (
      [
        ...new Set(
          exportTargetComponents
            .map((component) => component.material)
            .filter(Boolean),
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

  const prepareExportDocument = useCallback(() => {
    if (!exportTargetComponents.length) {
      toast.error("No production parts are available for output.");
      return null;
    }

    try {
      const pages = buildAllExportPages({
        exportComponents: exportTargetComponents,
        selectedComp: null,
        selectedLabel: exportTargetLabel,
        selectedMaterialText: exportTargetMaterials,
        selectedBounds3D: exportTargetBounds,
        selectedDimsText: exportTargetDims,
        blueprintTitle: blueprintTitle || "Blueprint Design",
        unit,
      });

      if (!Array.isArray(pages) || !pages.length) {
        throw new Error("No Blueprint sheets were generated.");
      }

      return {
        pages,
        html: buildBlueprintDocumentHtml(pages),
      };
    } catch (error) {
      console.error("Blueprint output generation error:", error);
      toast.error("Failed to prepare Blueprint sheets.");
      return null;
    }
  }, [
    exportTargetComponents,
    exportTargetLabel,
    exportTargetMaterials,
    exportTargetBounds,
    exportTargetDims,
    blueprintTitle,
    unit,
  ]);

  const canCreateOfficialOutput = useCallback(() => {
    if (hasUnsavedDesignChanges) {
      toast.error("Save the Blueprint before downloading or printing.");
      return false;
    }

    const errors = Array.isArray(designValidationReport?.errors)
      ? designValidationReport.errors
      : [];

    if (errors.length) {
      toast.error(
        `Fix ${errors.length} Blueprint ${errors.length === 1 ? "error" : "errors"} before downloading or printing.`,
      );
      return false;
    }

    const warnings = Array.isArray(designValidationReport?.warnings)
      ? designValidationReport.warnings.filter(
          (warning) => warning?.code !== "UNSAVED_CHANGES",
        )
      : [];

    if (
      warnings.length &&
      !window.confirm(
        `Blueprint validation found ${warnings.length} ${warnings.length === 1 ? "warning" : "warnings"}. Continue with the official output?`,
      )
    ) {
      return false;
    }

    return true;
  }, [designValidationReport, hasUnsavedDesignChanges]);

  const previewExportSheets = useCallback(() => {
    const prepared = prepareExportDocument();
    if (!prepared) return;

    if (openBlueprintWindow(prepared.html, false)) {
      toast.success("Preview sheets opened.");
    }
  }, [prepareExportDocument]);

  const printExportSheets = useCallback(() => {
    if (!canCreateOfficialOutput()) return;

    const prepared = prepareExportDocument();
    if (!prepared) return;

    openBlueprintWindow(prepared.html, true);
  }, [canCreateOfficialOutput, prepareExportDocument]);

  const downloadExportPdf = useCallback(async () => {
    if (downloadingPdf || !canCreateOfficialOutput()) return;

    const prepared = prepareExportDocument();
    if (!prepared) return;

    setDownloadingPdf(true);
    try {
      await downloadBlueprintPdf({
        documentHtml: prepared.html,
        blueprintTitle: blueprintTitle || exportTargetLabel,
      });
      toast.success("Blueprint PDF downloaded.");
    } catch (error) {
      console.error("Blueprint PDF download error:", error);
      toast.error("Failed to download the Blueprint PDF.");
    } finally {
      setDownloadingPdf(false);
    }
  }, [
    blueprintTitle,
    canCreateOfficialOutput,
    downloadingPdf,
    exportTargetLabel,
    prepareExportDocument,
  ]);

  return {
    previewExportSheets,
    printExportSheets,
    downloadExportPdf,
    downloadingPdf,
  };
}
