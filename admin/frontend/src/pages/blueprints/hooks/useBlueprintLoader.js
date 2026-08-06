import { useEffect } from "react";
import toast from "react-hot-toast";
import api from "../../../services/api";
import {
  createEmptyReferenceFiles,
  getReferenceFilesFromBlueprint,
  getReferenceFileFromBlueprint,
  getEditorMode,
} from "../data/utils";
import { resolveInitialComponents } from "../data/initHelpers";
import {
  DEFAULT_IMPORT_DIMENSIONS,
  DEFAULT_IMPORT_TEMPLATE_TYPE,
  createEmptyReferenceCalibrationByView,
  createEmptyTraceObjectsByView,
  normalizeReferenceCalibrationByView,
  normalizeTraceObjectsByView,
  resolveImportTemplateType,
  sanitizeImportDimensions,
} from "../data/referenceTraceUtils";
import {
  createImportedFurnitureComponents,
  createImportedDiningChairComponents,
} from "../data/templateComponents";

export function useBlueprintLoader({
  id,
  worldDimensions,
  createTemplateTypeMap,
  setBlueprint,
  setComponents,
  setSelectedId,
  setEdit3DId,
  setEstimatedPrice,
  setLockedFields,
  setUnit,
  setReferenceFiles,
  setReferenceFile,
  setEditorMode,
  setImportTemplateType,
  setImportDimensions,
  setImportComments,
  setReferenceCalibrationByView,
  setTraceObjectsByView,
  setSelectedTraceId,
  setView,
}) {
  useEffect(() => {
    if (!id || id === "new") {
      setReferenceFiles(createEmptyReferenceFiles());
      setReferenceFile(null);
      setEditorMode("editable");
      setImportTemplateType(DEFAULT_IMPORT_TEMPLATE_TYPE);
      setImportDimensions(DEFAULT_IMPORT_DIMENSIONS);
      setImportComments("");

      setView("front");
      setComponents([]);
      setSelectedId(null);
      setEdit3DId(null);
      setReferenceCalibrationByView(createEmptyReferenceCalibrationByView());
      setTraceObjectsByView(createEmptyTraceObjectsByView());
      setSelectedTraceId(null);
      return;
    }

    api
      .get(`/blueprints/${id}/estimation`)
      .then((res) => setEstimatedPrice(res.data?.grand_total || null))
      .catch(() => setEstimatedPrice(null));

    api
      .get(`/blueprints/${id}`)
      .then((response) => {
        const blueprintData = response.data;
        setBlueprint(blueprintData);

        let parsedLockedFields = [];
        let saved = {};

        try {
          parsedLockedFields = JSON.parse(blueprintData.locked_fields || "[]");
        } catch (error) {
          console.error("Invalid locked_fields JSON:", error);
          parsedLockedFields = [];
        }

        try {
          saved = JSON.parse(blueprintData.design_data || "{}");
        } catch (error) {
          console.error("Invalid design_data JSON:", error);
          saved = {};
        }

        const loadedTemplateType = resolveImportTemplateType(
          saved,
          blueprintData,
        );
        const loadedImportDimensions = sanitizeImportDimensions(
          saved.importDimensions ||
            saved.referenceDimensions ||
            blueprintData.import_dimensions ||
            blueprintData.reference_dimensions ||
            DEFAULT_IMPORT_DIMENSIONS,
          DEFAULT_IMPORT_DIMENSIONS,
        );

        const loadedReferenceFiles = getReferenceFilesFromBlueprint(
          saved,
          blueprintData,
        );
        const referenceFile = getReferenceFileFromBlueprint(
          saved,
          blueprintData,
          "front",
        );
        const resolvedMode = getEditorMode(saved, loadedReferenceFiles);

        let loadedComponents = resolveInitialComponents(
          {
            ...saved,
            importTemplateType: loadedTemplateType,
            importDimensions: loadedImportDimensions,
          },
          referenceFile,
          blueprintData,
          worldDimensions,
        );

        const loadedStartMode =
          saved.startMode || saved?.blueprintSetup?.startMode || "scratch";
        const loadedFurnitureType =
          saved.furnitureType ||
          saved?.blueprintSetup?.furnitureType ||
          "cabinet";

        if (!loadedComponents.length && loadedStartMode === "template") {
          const templateType =
            createTemplateTypeMap[loadedFurnitureType] ||
            DEFAULT_IMPORT_TEMPLATE_TYPE;

          loadedComponents =
            templateType === "template_dining_chair"
              ? createImportedDiningChairComponents(
                  {
                    importTemplateType: templateType,
                    importDimensions: loadedImportDimensions,
                  },
                  null,
                  { title: blueprintData.title || "Chair Template" },
                  worldDimensions,
                )
              : createImportedFurnitureComponents(
                  {
                    importTemplateType: templateType,
                    importDimensions: loadedImportDimensions,
                  },
                  null,
                  {
                    title: blueprintData.title || "Furniture Template",
                    import_template_type: templateType,
                  },
                  worldDimensions,
                );
        }

        setLockedFields(
          Array.isArray(parsedLockedFields) ? parsedLockedFields : [],
        );
        setComponents(loadedComponents);
        setSelectedId(loadedComponents[0]?.id || null);
        setEdit3DId(null);
        setUnit(saved.unit || "mm");
        setReferenceFiles(loadedReferenceFiles);
        setReferenceFile(
          loadedReferenceFiles?.front ||
            loadedReferenceFiles?.back ||
            loadedReferenceFiles?.left ||
            loadedReferenceFiles?.right ||
            loadedReferenceFiles?.top ||
            referenceFile ||
            null,
        );
        setEditorMode(resolvedMode);
        setImportTemplateType(loadedTemplateType);
        setImportDimensions(loadedImportDimensions);
        setImportComments(saved.importComments || "");

        const normalizedCalibrationByView = normalizeReferenceCalibrationByView(
          saved.referenceCalibrationByView ||
            saved.reference_calibration_by_view ||
            saved.referenceCalibration,
        );
        const normalizedTraceObjectsByView = normalizeTraceObjectsByView(
          saved.traceObjectsByView ||
            saved.trace_objects_by_view ||
            saved.traceObjects,
        );

        setReferenceCalibrationByView(normalizedCalibrationByView);
        setTraceObjectsByView(normalizedTraceObjectsByView);
        setSelectedTraceId(null);
        setView("front");
      })
      .catch(() => toast.error("Failed to load blueprint."));

    // Keep the same reload behavior as the original editor: reload only when
    // the route blueprint id changes. State setters are stable React values.

  }, [id]);
}
