import { useCallback } from "react";
import toast from "react-hot-toast";
import api from "../../../services/api";
import {
  flattenTraceObjectsByView,
  normalizeReferenceCalibration,
  normalizeReferenceCalibrationByView,
  normalizeTraceObjectsByView,
  sanitizeImportDimensions,
  sanitizeReferenceFile,
  sanitizeReferenceFiles,
} from "../data/referenceTraceUtils";
import { normalizeComponent, getComponentsBounds3D } from "../data/componentUtils";
import { snap } from "../data/utils";
import {
  buildBlueprintThumbnailDataUrl,
  inferFurnitureTypeFromComponents,
  mapFurnitureTypeToTemplateType,
} from "../data/blueprintPublishUtils";

export function useBlueprintPersistence({
  id,
  blueprint,
  setBlueprint,
  components,
  unit,
  editorMode,
  referenceFiles,
  referenceFile,
  importTemplateType,
  importDimensions,
  importComments,
  referenceCalibrationByView,
  traceObjectsByView,
  activeReferenceCalibration,
  conversionHandoffSummary,
  conversionCutListRows,
  estimatedPrice,
  designTotal,
  publishForm,
  setPublishModal,
  setSaving,
  setPublishing,
  worldSize,
  sheetSize,
  exportViews,
}) {
  const saveDesign = useCallback(async () => {
    if (!id || id === "new") {
      toast.error(
        "Create the blueprint record first before saving the design.",
      );
      return;
    }

    setSaving(true);

    try {
      const savedDesignData = blueprint?.design_data
        ? JSON.parse(blueprint.design_data)
        : {};

      const actualFurnitureType =
        inferFurnitureTypeFromComponents(components) ||
        blueprint?.furniture_type ||
        blueprint?.category ||
        "";

      const actualTemplateType =
        mapFurnitureTypeToTemplateType(actualFurnitureType) ||
        importTemplateType ||
        "";

      const exactSceneBounds = getComponentsBounds3D(
        Array.isArray(components) ? components : [],
      );

      const actualImportDimensions = exactSceneBounds
        ? {
            w: snap(Math.max(20, Number(exactSceneBounds.width) || 0)),
            h: snap(Math.max(20, Number(exactSceneBounds.height) || 0)),
            d: snap(Math.max(20, Number(exactSceneBounds.depth) || 0)),
          }
        : sanitizeImportDimensions(importDimensions);

      const generatedThumbnailUrl = buildBlueprintThumbnailDataUrl(
        components,
        blueprint?.title || "Blueprint",
      );

      const normalizedComponents = Array.isArray(components)
        ? components.map((component) => normalizeComponent(component))
        : [];

      const payload = {
        ...savedDesignData,
        unit,
        editorMode,
        components: normalizedComponents,
        reference_files: sanitizeReferenceFiles(referenceFiles),
        reference_file: sanitizeReferenceFile(
          referenceFiles?.front || referenceFile,
        ),

        furnitureType: actualFurnitureType,
        templateType: actualTemplateType,
        preview_template_type: actualTemplateType,
        importTemplateType: actualTemplateType,
        importDimensions: sanitizeImportDimensions(actualImportDimensions),
        importComments,

        blueprintSetup: {
          ...(savedDesignData?.blueprintSetup || {}),
          furnitureType: actualFurnitureType,
          overallWidth: actualImportDimensions.w,
          overallHeight: actualImportDimensions.h,
          overallDepth: actualImportDimensions.d,
          unit,
        },

        customerCustomization: {
          ...(savedDesignData?.customerCustomization || {}),
          default_dimensions: {
            w: actualImportDimensions.w,
            h: actualImportDimensions.h,
            d: actualImportDimensions.d,
          },
        },

        scene_bounds: exactSceneBounds
          ? {
              width_mm: Math.round(exactSceneBounds.width),
              height_mm: Math.round(exactSceneBounds.height),
              depth_mm: Math.round(exactSceneBounds.depth),
            }
          : null,

        worldSize,
        sheetSize,
        exportViews,
        referenceCalibrationByView: normalizeReferenceCalibrationByView(
          referenceCalibrationByView,
        ),
        traceObjectsByView: normalizeTraceObjectsByView(traceObjectsByView),

        referenceCalibration: normalizeReferenceCalibration(
          referenceCalibrationByView?.front || activeReferenceCalibration,
        ),
        traceObjects: flattenTraceObjectsByView(traceObjectsByView),
        conversionSummary: conversionHandoffSummary,
        conversionCutListRows,
      };

      const view3dPayload = {
        furnitureType: actualFurnitureType,
        templateType: actualTemplateType,
        importTemplateType: actualTemplateType,
        bounds: exactSceneBounds
          ? {
              width_mm: Math.round(exactSceneBounds.width),
              height_mm: Math.round(exactSceneBounds.height),
              depth_mm: Math.round(exactSceneBounds.depth),
            }
          : null,
        components: normalizedComponents,
      };

      await api.put(`/blueprints/${id}`, {
        design_data: JSON.stringify(payload),
        view_3d_data: JSON.stringify(view3dPayload),
        thumbnail_url:
          generatedThumbnailUrl || blueprint?.thumbnail_url || null,
        is_template: Number(blueprint?.is_template) ? 1 : 0,
        is_gallery: Number(blueprint?.is_gallery) ? 1 : 0,
        base_price: Math.max(
          0,
          Math.round(
            Number(estimatedPrice !== null ? estimatedPrice : designTotal || 0),
          ),
        ),
        title: publishForm?.name || blueprint?.title || "",
        description: publishForm?.description || blueprint?.description || "",
      });

      toast.success("Blueprint saved.");
    } catch (error) {
      console.error("saveDesign error:", error);
      toast.error(
        error?.response?.data?.message ||
          "Save failed. Check server connection.",
      );
    } finally {
      setSaving(false);
    }
  }, [
    id,
    blueprint,
    components,
    unit,
    editorMode,
    referenceFiles,
    referenceFile,
    importTemplateType,
    importDimensions,
    importComments,
    referenceCalibrationByView,
    traceObjectsByView,
    activeReferenceCalibration,
    conversionHandoffSummary,
    conversionCutListRows,
    estimatedPrice,
    designTotal,
    publishForm,
    setSaving,
    worldSize,
    sheetSize,
    exportViews,
  ]);

  const handlePublishProduct = useCallback(
    async (event) => {
      event.preventDefault();

      const productName = String(publishForm.name || "").trim();
      if (!productName) {
        toast.error("Product name is required.");
        return;
      }

      const automaticPrice = Math.max(
        0,
        Math.round(
          Number(estimatedPrice !== null ? estimatedPrice : designTotal || 0),
        ),
      );

      await saveDesign();
      setPublishing(true);

      try {
        const payload = {
          barcode: `BP-${Date.now()}`,
          name: productName,
          description: String(
            publishForm.description || "Custom blueprint product",
          ).trim(),
          category_id: 2,
          type: "blueprint",
          online_price: automaticPrice,
          walkin_price: automaticPrice,
          production_cost: 0,
          stock: 999,
          stock_status: "in_stock",
          reorder_point: 0,
          is_featured: 0,
          is_published: 1,
          blueprint_id: Number(id),
          variations: "[]",
          bill_of_materials: "[]",
          design_data: JSON.stringify({ components }),
        };

        await api.post("/products", payload);
        await api.put(`/blueprints/${id}`, {
          title: productName,
          description: payload.description,
          is_template: 1,
          is_gallery: 1,
          base_price: automaticPrice,
        });

        setBlueprint((previous) =>
          previous
            ? {
                ...previous,
                title: productName,
                description: payload.description,
                is_template: 1,
                is_gallery: 1,
                base_price: automaticPrice,
              }
            : previous,
        );

        toast.success("Blueprint published to the customer customize gallery.");
        setPublishModal(false);
      } catch (error) {
        console.error("Publish blueprint error:", error);
        toast.error(
          error?.response?.data?.message ||
            error?.message ||
            "Failed to publish blueprint.",
        );
      } finally {
        setPublishing(false);
      }
    },
    [
      publishForm,
      estimatedPrice,
      designTotal,
      saveDesign,
      setPublishing,
      id,
      components,
      setBlueprint,
      setPublishModal,
    ],
  );

  const handleUnpublishProduct = useCallback(async () => {
    if (
      !window.confirm(
        "Are you sure you want to unpublish the product linked to this blueprint?",
      )
    ) {
      return;
    }

    try {
      await api.patch(`/products/blueprint/${id}/unpublish`);
      await api.put(`/blueprints/${id}`, {
        is_template: 0,
        is_gallery: 0,
        base_price: 0,
      });
      setBlueprint((previous) =>
        previous
          ? { ...previous, is_template: 0, is_gallery: 0, base_price: 0 }
          : previous,
      );
      toast.success("Blueprint removed from the customer customize gallery.");
    } catch (error) {
      console.error("Unpublish Error:", error);
      toast.error(
        error?.response?.data?.message ||
          "Failed to unpublish. Ensure you have published it first.",
      );
    }
  }, [id, setBlueprint]);

  return {
    saveDesign,
    handlePublishProduct,
    handleUnpublishProduct,
  };
}
