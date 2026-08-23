import { useCallback, useRef } from "react";
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
  editorStateSignature,
  onDesignSaved,
  publishForm,
  setPublishModal,
  setSaving,
  setPublishing,
  setPublishFeedbackStatus,
  worldSize,
  sheetSize,
  exportViews,
}) {
  const publishInFlightRef = useRef(false);

  const saveDesign = useCallback(async () => {
    const savingEditorStateSignature = editorStateSignature;

    if (!id || id === "new") {
      toast.error(
        "Create the blueprint record first before saving the design.",
      );
      return;
    }

    setSaving(true);

    try {
      let savedDesignData = {};
      if (blueprint?.design_data) {
        try {
          savedDesignData =
            typeof blueprint.design_data === "string"
              ? JSON.parse(blueprint.design_data)
              : blueprint.design_data || {};
        } catch (parseError) {
          console.warn(
            "Invalid local blueprint.design_data; saving current editor state instead:",
            parseError,
          );
          savedDesignData = {};
        }
      }

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

      const response = await api.put(`/blueprints/${id}`, {
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
        // Normal Save uses Blueprint metadata only. Publish form values are
        // temporary and are applied only by the Publish workflow.
        title: blueprint?.title || "",
        description: blueprint?.description || "",
      });

      const savedBlueprintPatch = response?.data?.blueprint || {};
      const fallbackDesignData = JSON.stringify(payload);

      setBlueprint((previous) => {
        const base = previous || blueprint || {};
        return {
          ...base,
          ...savedBlueprintPatch,
          design_data:
            savedBlueprintPatch.design_data ?? fallbackDesignData,
          view_3d_data:
            savedBlueprintPatch.view_3d_data ??
            JSON.stringify(view3dPayload),
          thumbnail_url:
            savedBlueprintPatch.thumbnail_url ??
            generatedThumbnailUrl ??
            base.thumbnail_url ??
            null,
        };
      });

      if (typeof onDesignSaved === "function") {
        onDesignSaved(savingEditorStateSignature);
      }

      toast.success("Blueprint saved.");
      return {
        ok: true,
        blueprint: savedBlueprintPatch,
      };
    } catch (error) {
      console.error("saveDesign error:", error);
      toast.error(
        error?.response?.data?.message ||
          "Save failed. Check server connection.",
      );
      return {
        ok: false,
        error,
      };
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
    editorStateSignature,
    onDesignSaved,
    publishForm,
    setSaving,
    setBlueprint,
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

      const categoryId = Number(publishForm.category_id || 0);
      if (!Number.isInteger(categoryId) || categoryId <= 0) {
        toast.error("Select a furniture category before publishing.");
        return;
      }

      // Blueprint gallery templates intentionally have no fixed selling price.
      const automaticPrice = 0;

      // Lock immediately so repeated Publish clicks cannot queue extra saves
      // while the first publish request is still starting.
      if (publishInFlightRef.current) {
        return;
      }

      publishInFlightRef.current = true;
      setPublishFeedbackStatus("loading");
      setPublishing(true);

      try {
        const saveResult = await saveDesign();
        if (!saveResult?.ok) {
          return;
        }
        const productDescription =
          String(
            publishForm.description || "Custom blueprint product.",
          ).trim() || "Custom blueprint product.";

        // First publish creates the linked Product. Republish updates the same
        // Product instead of creating another Product row.
        const publishResponse = await api.put(
          `/products/blueprint/${id}/publish`,
          {
            name: productName,
            description: productDescription,
            category_id: categoryId,
          },
        );

        const publishedBlueprint = publishResponse?.data?.blueprint || {};
        const publishedProduct = publishResponse?.data?.product || {};

        setBlueprint((previous) =>
          previous
            ? {
                ...previous,
                ...publishedBlueprint,
                title: publishedBlueprint.title || productName,
                description:
                  publishedBlueprint.description || productDescription,
                is_template: 1,
                is_gallery: 1,
                base_price:
                  publishedBlueprint.base_price ?? automaticPrice,
              }
            : previous,
        );

        if (Number(publishedProduct.is_active) === 0) {
          toast(
            "Blueprint Product updated, but it is disabled and hidden from customers.",
          );
        }

        setPublishFeedbackStatus("success");

        await new Promise((resolve) => {
          window.setTimeout(resolve, 700);
        });

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
        publishInFlightRef.current = false;
        setPublishing(false);
        setPublishFeedbackStatus("loading");
      }
    },
    [
      publishForm,
      estimatedPrice,
      designTotal,
      saveDesign,
      setPublishing,
      setPublishFeedbackStatus,
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
