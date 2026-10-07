import { useEffect } from "react";
import toast from "react-hot-toast";
import api from "../../../services/api";
import { resolveInitialComponents } from "../data/initHelpers";
import {
  DEFAULT_IMPORT_DIMENSIONS,
  DEFAULT_IMPORT_TEMPLATE_TYPE,
  resolveImportTemplateType,
  sanitizeImportDimensions,
} from "../data/blueprintCompatibilityUtils";
import {
  createFurnitureTemplateComponents,
  createDiningChairComponentsFromMetadata,
} from "../data/templateComponents";

export function useBlueprintLoader({
  id,
  worldDimensions,
  createTemplateTypeMap,
  setBlueprint,
  setComponents,
  setSelectedId,
  setSelectedIds,
  setEdit3DId,
  setEstimatedPrice,
  setLockedFields,
  setUnit,
  setImportTemplateType,
  setImportDimensions,
  setView,
}) {
  useEffect(() => {
    if (!id || id === "new") {
      setImportTemplateType(DEFAULT_IMPORT_TEMPLATE_TYPE);
      setImportDimensions(DEFAULT_IMPORT_DIMENSIONS);

      setBlueprint(null);
      setEstimatedPrice(null);
      setLockedFields([]);
      setUnit("mm");
      setView("front");
      setComponents([]);
      setSelectedId(null);
      setSelectedIds([]);
      setEdit3DId(null);
      return;
    }

    let active = true;

    api
      .get(`/blueprints/${id}/estimation`)
      .then((res) => {
        if (!active) return;
        setEstimatedPrice(res.data?.grand_total || null);
      })
      .catch(() => {
        if (active) setEstimatedPrice(null);
      });

    api
      .get(`/blueprints/${id}`)
      .then((response) => {
        if (!active) return;

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

        let loadedComponents = resolveInitialComponents(saved);

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
              ? createDiningChairComponentsFromMetadata(
                  {
                    importTemplateType: templateType,
                    importDimensions: loadedImportDimensions,
                  },
                  { title: blueprintData.title || "Chair Template" },
                  worldDimensions,
                )
              : createFurnitureTemplateComponents(
                  {
                    importTemplateType: templateType,
                    importDimensions: loadedImportDimensions,
                  },
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
        setSelectedIds([]);
        setEdit3DId(null);
        setUnit(saved.unit || "mm");
        setImportTemplateType(loadedTemplateType);
        setImportDimensions(loadedImportDimensions);
        setView("front");
      })
      .catch(() => {
        if (active) toast.error("Failed to load blueprint.");
      });

    // Late responses from the previously opened Blueprint must never overwrite
    // the state of the Blueprint that is now active in the route.
    return () => {
      active = false;
    };

    // Keep the same reload behavior as the original editor: reload only when
    // the route blueprint id changes. State setters are stable React values.
  }, [id]);
}
