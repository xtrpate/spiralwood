import { Link, useLocation, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCustomCart } from "./customcartcontext";
import api, { buildAssetUrl } from "../../services/api";
import CustomerTemplateWorkbench from "./CustomerTemplateWorkbench";
import CustomerBlueprintViewer from "./CustomerBlueprintViewer";
import {
  getCustomReferencePhotos,
  saveCustomReferencePhotos,
} from "../../utils/customReferencePhotoStore";
import "./customizepage.css";

const resolveImage = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (
    raw.startsWith("http://") ||
    raw.startsWith("https://") ||
    raw.startsWith("data:") ||
    raw.startsWith("blob:") ||
    raw.startsWith("/template-previews/") ||
    raw.startsWith("/images/") ||
    raw.startsWith("/assets/")
  ) {
    return raw;
  }

  return buildAssetUrl(raw);
};

const formatMm = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? `${Math.round(n)} mm` : "—";
};

const hasEditorSnapshot = (item) =>
  Array.isArray(item?.editor_snapshot?.components) &&
  item.editor_snapshot.components.length > 0;

const getItemDisplayDims = (item = {}) => {
  const components = Array.isArray(item?.editor_snapshot?.components)
    ? item.editor_snapshot.components
    : [];

  if (!components.length) {
    return {
      width: Number(item.width) || 0,
      height: Number(item.height) || 0,
      depth: Number(item.depth) || 0,
    };
  }

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  components.forEach((comp) => {
    const x = Number(comp?.x) || 0;
    const y = Number(comp?.y) || 0;
    const z = Number(comp?.z) || 0;
    const w = Math.max(0, Number(comp?.width) || 0);
    const h = Math.max(0, Number(comp?.height) || 0);
    const d = Math.max(0, Number(comp?.depth) || 0);

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);

    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
    maxZ = Math.max(maxZ, z + d);
  });

  const width = Math.round(maxX - minX) || Number(item.width) || 0;
  const height = Math.round(maxY - minY) || Number(item.height) || 0;
  const depth = Math.round(maxZ - minZ) || Number(item.depth) || 0;

  return { width, height, depth };
};

const buildCartPreviewBlueprint = (item) => {
  const components = Array.isArray(item?.editor_snapshot?.components)
    ? item.editor_snapshot.components
    : [];

  const worldSize =
    item?.editor_snapshot?.worldSize &&
    typeof item.editor_snapshot.worldSize === "object"
      ? item.editor_snapshot.worldSize
      : { w: 6400, h: 3200, d: 5200 };

  const dims = getItemDisplayDims(item);

  return {
    id: item.blueprint_id || item.product_id || item.key,
    title: item.base_blueprint_title || item.product_name || "Custom Furniture",
    thumbnail_url: item.image_url || item.preview_image_url || "",
    preview_image_url: item.preview_image_url || item.image_url || "",
    default_dimensions: {
      width_mm: dims.width,
      height_mm: dims.height,
      depth_mm: dims.depth,
    },
    bounds: {
      width: dims.width,
      height: dims.height,
      depth: dims.depth,
    },
    design_data: {
      components,
      worldSize,
      bounds: {
        width: dims.width,
        height: dims.height,
        depth: dims.depth,
      },
    },
    view_3d_data: {
      components,
      worldSize,
      bounds: {
        width: dims.width,
        height: dims.height,
        depth: dims.depth,
      },
    },
    metadata: {
      wood_type: item.wood_type || "",
      finish_color: item.finish_color || item.color || "",
      door_style: item.door_style || "",
      hardware: item.hardware || "",
    },
  };
};

/* WISDOM CUSTOM DESIGN REVIEW EDIT BEFORE SUBMIT V1.0.0 */
const parseSafeObject = (value) => {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value;

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
};

const normalizeEditorWorldSize = (value, fallback = null) => {
  const source =
    value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const fallbackSource =
    fallback && typeof fallback === "object" && !Array.isArray(fallback)
      ? fallback
      : {};

  const pick = (primary, secondary, defaultValue) => {
    const first = Number(primary);
    if (Number.isFinite(first) && first > 0) return first;
    const second = Number(secondary);
    if (Number.isFinite(second) && second > 0) return second;
    return defaultValue;
  };

  return {
    w: pick(
      source.w ?? source.width_mm ?? source.width,
      fallbackSource.w ?? fallbackSource.width_mm ?? fallbackSource.width,
      6400,
    ),
    h: pick(
      source.h ?? source.height_mm ?? source.height,
      fallbackSource.h ?? fallbackSource.height_mm ?? fallbackSource.height,
      3200,
    ),
    d: pick(
      source.d ?? source.depth_mm ?? source.depth,
      fallbackSource.d ?? fallbackSource.depth_mm ?? fallbackSource.depth,
      5200,
    ),
  };
};

const buildEditableCartBlueprint = (baseBlueprint = {}, item = {}) => {
  const editorSnapshot = parseSafeObject(item?.editor_snapshot);
  const savedComponents = Array.isArray(editorSnapshot?.components)
    ? editorSnapshot.components
    : [];

  const baseDesignData = parseSafeObject(baseBlueprint?.design_data);
  const baseView3dData = parseSafeObject(baseBlueprint?.view_3d_data);
  const dims = getItemDisplayDims(item);

  const worldSize = normalizeEditorWorldSize(
    editorSnapshot?.worldSize,
    baseDesignData?.worldSize || baseView3dData?.worldSize,
  );

  const designData = savedComponents.length
    ? {
        ...baseDesignData,
        components: savedComponents,
        worldSize,
      }
    : baseDesignData;

  const view3dData = savedComponents.length
    ? {
        ...baseView3dData,
        components: savedComponents,
        worldSize,
      }
    : baseView3dData;

  return {
    ...baseBlueprint,
    id: item?.blueprint_id || baseBlueprint?.id,
    title:
      item?.base_blueprint_title ||
      item?.product_name ||
      baseBlueprint?.title ||
      "Custom Furniture",
    primary_material:
      item?.wood_type ||
      baseBlueprint?.primary_material ||
      baseBlueprint?.wood_type ||
      "",
    wood_type:
      item?.wood_type ||
      baseBlueprint?.wood_type ||
      baseBlueprint?.primary_material ||
      "",
    finish_color:
      item?.finish_color || item?.color || baseBlueprint?.finish_color || "",
    color:
      item?.color || item?.finish_color || baseBlueprint?.color || "",
    door_style: item?.door_style || baseBlueprint?.door_style || "",
    hardware: item?.hardware || baseBlueprint?.hardware || "",
    default_dimensions: {
      ...parseSafeObject(baseBlueprint?.default_dimensions),
      width_mm: dims.width,
      height_mm: dims.height,
      depth_mm: dims.depth,
    },
    design_data: designData,
    view_3d_data: view3dData,
    ...(savedComponents.length ? { components: savedComponents } : {}),
  };
};

export default function CustomCartPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const {
    customCart,
    setCustomCart,
    updateCustomQty,
    removeFromCustomCart,
    removeManyFromCustomCart,
    clearCustomCart,
  } = useCustomCart();

  const [previewItem, setPreviewItem] = useState(null);
  const [selectedKeys, setSelectedKeys] = useState([]);
  const [referencePhotoPreviews, setReferencePhotoPreviews] = useState({});

  const [editItem, setEditItem] = useState(null);
  const [editBlueprint, setEditBlueprint] = useState(null);
  const [editReferencePhotos, setEditReferencePhotos] = useState([]);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const editObjectUrlsRef = useRef([]);

  useEffect(() => {
    let cancelled = false;
    const objectUrls = [];

    const loadPreviews = async () => {
      const entries = await Promise.all(
        (Array.isArray(customCart) ? customCart : []).map(async (item) => {
          try {
            const storedPhotos = await getCustomReferencePhotos(item?.key);
            const previews = storedPhotos
              .filter((photo) => photo?.blob instanceof Blob)
              .map((photo) => {
                const dataUrl = URL.createObjectURL(photo.blob);
                objectUrls.push(dataUrl);
                return { ...photo, data_url: dataUrl };
              });
            return [item?.key, previews];
          } catch (error) {
            console.error("Failed to load reference photo previews:", error);
            return [item?.key, []];
          }
        }),
      );

      if (cancelled) {
        objectUrls.forEach((url) => URL.revokeObjectURL(url));
        return;
      }

      setReferencePhotoPreviews(
        Object.fromEntries(entries.filter(([key]) => key)),
      );
    };

    loadPreviews();

    return () => {
      cancelled = true;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [customCart]);

  useEffect(() => {
    const validKeys = new Set((customCart || []).map((item) => item.key));

    setSelectedKeys((prev) => {
      const kept = prev.filter((key) => validKeys.has(key));
      if (kept.length) return [kept[0]];

      const firstKey = (customCart || [])[0]?.key;
      return firstKey ? [firstKey] : [];
    });
  }, [customCart]);

  useEffect(() => {
    if (!previewItem) return;

    const stillExists = customCart.some((item) => item.key === previewItem.key);
    if (!stillExists) {
      setPreviewItem(null);
    }
  }, [customCart, previewItem]);

  const previewBlueprint = useMemo(
    () => (previewItem ? buildCartPreviewBlueprint(previewItem) : null),
    [previewItem],
  );

  const releaseEditObjectUrls = useCallback(() => {
    editObjectUrlsRef.current.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore object URL cleanup errors
      }
    });
    editObjectUrlsRef.current = [];
  }, []);

  const closeEditDesign = useCallback(() => {
    releaseEditObjectUrls();
    setEditItem(null);
    setEditBlueprint(null);
    setEditReferencePhotos([]);
    setEditLoading(false);
    setEditError("");
    setEditSaving(false);

    const params = new URLSearchParams(location.search);
    const returnTo = String(params.get("returnTo") || "").trim();

    /* Only the known checkout route is allowed as a return target.
       Save, X, and backdrop close all use this same close path. */
    if (returnTo === "custom-checkout") {
      navigate("/custom-checkout", { replace: true });
      return;
    }

    if (params.has("edit")) {
      params.delete("edit");
      params.delete("returnTo");
      const nextSearch = params.toString();
      const nextUrl =
        location.pathname + (nextSearch ? "?" + nextSearch : "");
      navigate(nextUrl, { replace: true });
    }
  }, [location.pathname, location.search, navigate, releaseEditObjectUrls]);

  const openEditDesign = useCallback(
    async (item) => {
      if (!item?.key) return;

      releaseEditObjectUrls();
      setPreviewItem(null);
      setEditItem(item);
      setEditBlueprint(null);
      setEditReferencePhotos([]);
      setEditError("");
      setEditLoading(true);

      try {
        if (!item?.blueprint_id) {
          throw new Error(
            "This saved design is missing its Blueprint reference and cannot be safely edited.",
          );
        }

        const response = await api.get(
          "/customer/blueprints/" + item.blueprint_id,
        );

        let storedPhotos = [];
        try {
          storedPhotos = await getCustomReferencePhotos(item.key);
        } catch (photoError) {
          console.error("Failed to load saved reference photos:", photoError);
        }

        const preparedPhotos = storedPhotos.map((photo) => {
          if (!(photo?.blob instanceof Blob)) return photo;
          const dataUrl = URL.createObjectURL(photo.blob);
          editObjectUrlsRef.current.push(dataUrl);
          return { ...photo, data_url: dataUrl };
        });

        setEditReferencePhotos(preparedPhotos);
        setEditBlueprint(buildEditableCartBlueprint(response.data || {}, item));
      } catch (error) {
        console.error("Failed to open saved design for editing:", error);
        setEditError(
          error.response?.data?.message ||
            error.message ||
            "Failed to load this saved design for editing.",
        );
      } finally {
        setEditLoading(false);
      }
    },
    [releaseEditObjectUrls],
  );

  useEffect(() => () => releaseEditObjectUrls(), [releaseEditObjectUrls]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const editKey = String(params.get("edit") || "").trim();

    if (!editKey || editItem || !customCart.length) return;

    const matched = customCart.find((item) => item?.key === editKey);
    if (matched) {
      openEditDesign(matched);
    }
  }, [customCart, editItem, location.search, openEditDesign]);

  const handleSaveEditedDesign = async (draft = {}) => {
    if (!editItem?.key || !editBlueprint || editSaving) return;

    setEditSaving(true);
    setEditError("");

    try {
      const nextReferencePhotos = await saveCustomReferencePhotos(
        editItem.key,
        Array.isArray(draft?.reference_photos)
          ? draft.reference_photos
          : editReferencePhotos,
      );

      const nextComponents = Array.isArray(draft?.editor_snapshot?.components)
        ? draft.editor_snapshot.components
        : Array.isArray(draft?.components)
          ? draft.components
          : Array.isArray(editItem?.editor_snapshot?.components)
            ? editItem.editor_snapshot.components
            : [];

      const nextWorldSize = normalizeEditorWorldSize(
        draft?.editor_snapshot?.worldSize || draft?.worldSize,
        editItem?.editor_snapshot?.worldSize,
      );

      const toPositiveDimension = (value, fallback) => {
        const parsed = Number(value);
        if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed);
        const fallbackParsed = Number(fallback);
        return Number.isFinite(fallbackParsed) && fallbackParsed > 0
          ? Math.round(fallbackParsed)
          : 0;
      };

      const width = toPositiveDimension(
        draft?.width ?? draft?.defaultDimensions?.width_mm,
        editItem.width,
      );
      const height = toPositiveDimension(
        draft?.height ?? draft?.defaultDimensions?.height_mm,
        editItem.height,
      );
      const depth = toPositiveDimension(
        draft?.depth ?? draft?.defaultDimensions?.depth_mm,
        editItem.depth,
      );

      const requestedQuantity = Number(draft?.quantity);
      const quantity =
        Number.isSafeInteger(requestedQuantity) && requestedQuantity > 0
          ? requestedQuantity
          : Math.max(1, Number(editItem.quantity || 1));

      const comments = String(
        draft?.initial_message ?? draft?.comments ?? editItem.comments ?? "",
      ).trim();

      const woodType = draft?.wood_type || editItem.wood_type || "";
      const finishColor =
        draft?.finish_color ||
        draft?.color ||
        editItem.finish_color ||
        editItem.color ||
        "";
      const doorStyle = draft?.door_style || editItem.door_style || "";
      const hardware = draft?.hardware || editItem.hardware || "";

      const updatedItem = {
        ...editItem,
        quantity,
        width,
        height,
        depth,
        wood_type: woodType,
        finish_color: finishColor,
        color: finishColor,
        door_style: doorStyle,
        hardware,
        comments,
        initial_message: comments,
        reference_photos: nextReferencePhotos,
        customization_snapshot: {
          ...parseSafeObject(editItem?.customization_snapshot),
          ...parseSafeObject(draft?.customization_snapshot),
          width,
          height,
          depth,
          width_mm: width,
          height_mm: height,
          depth_mm: depth,
          wood_type: woodType,
          finish_color: finishColor,
          color: finishColor,
          door_style: doorStyle,
          hardware,
          comments,
          initial_message: comments,
          reference_photo_count: nextReferencePhotos.length,
          template_profile: editItem.template_profile || null,
        },
        editor_snapshot: {
          worldSize: nextWorldSize,
          components: nextComponents,
        },
      };

      setCustomCart((current) =>
        (Array.isArray(current) ? current : []).map((item) =>
          item?.key === editItem.key ? updatedItem : item,
        ),
      );

      closeEditDesign();
    } catch (error) {
      console.error("Failed to save edited custom design:", error);
      setEditError(
        error.message || "Failed to save your design changes. Please try again.",
      );
      setEditSaving(false);
    }
  };

  const selectedItems = useMemo(() => {
    const selectedSet = new Set(selectedKeys);
    return (customCart || [])
      .filter((item) => selectedSet.has(item.key))
      .slice(0, 1);
  }, [customCart, selectedKeys]);

  const selectedItem = selectedItems[0] || null;

  const toggleSelected = (key) => {
    setSelectedKeys((prev) => (prev[0] === key ? [] : [key]));
  };

  const handleRemoveSelected = () => {
    if (!selectedItem?.key) return;
    removeManyFromCustomCart([selectedItem.key]);
    setSelectedKeys([]);
  };

  const handleProceedSelectedCheckout = () => {
    const selectedKeysArray = Array.from(selectedKeys || []).slice(0, 1);

    if (selectedKeysArray.length !== 1) {
      return;
    }

    try {
      sessionStorage.setItem(
        "cust_selected_custom_checkout",
        JSON.stringify(selectedKeysArray),
      );
    } catch (error) {
      console.error("[custom cart] failed to save selected checkout keys", error);
      return;
    }

    navigate("/custom-checkout");
  };

  return (
    <div style={{ padding: "24px", maxWidth: "1200px", margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "12px",
          marginBottom: "24px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>Custom Designs</h1>
          <p style={{ margin: "8px 0 0", color: "#666" }}>
            Submit one design per request. Each design receives its own quotation, payment, and project workflow.
          </p>
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <Link
            to="/customize"
            style={{
              textDecoration: "none",
              padding: "10px 14px",
              borderRadius: "10px",
              border: "1px solid #d0d7de",
              color: "#111",
            }}
          >
            Back to Customize
          </Link>

          {customCart.length > 0 ? (
            <button
              type="button"
              onClick={clearCustomCart}
              style={{
                padding: "10px 14px",
                borderRadius: "10px",
                border: "1px solid #d0d7de",
                background: "#fff",
                cursor: "pointer",
              }}
            >
              Clear Cart
            </button>
          ) : null}
        </div>
      </div>

      {!customCart.length ? (
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: "16px",
            padding: "32px",
            background: "#fff",
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: "40px", marginBottom: "12px" }}>🪵</div>
          <h2 style={{ margin: "0 0 8px" }}>Your custom cart is empty</h2>
          <p style={{ margin: "0 0 18px", color: "#666" }}>
            Add a furniture template from the Customize page first.
          </p>

          <Link
            to="/customize"
            style={{
              textDecoration: "none",
              display: "inline-block",
              padding: "12px 16px",
              borderRadius: "10px",
              background: "#111827",
              color: "#fff",
            }}
          >
            Go to Customize Page
          </Link>
        </div>
      ) : (
        <div style={{ display: "grid", gap: "16px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
              marginBottom: "2px",
            }}
          >
            <div style={{ color: "#334155", fontSize: "14px", fontWeight: 700 }}>
              {selectedItem
                ? `Selected for this request • Qty ${Math.max(
                    1,
                    Number(selectedItem.quantity || 1),
                  )}`
                : "Choose one design to submit"}
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={handleRemoveSelected}
                disabled={!selectedKeys.length}
                style={{
                  padding: "10px 14px",
                  borderRadius: "10px",
                  border: "1px solid #ef4444",
                  background: selectedKeys.length ? "#fff" : "#f8fafc",
                  color: selectedKeys.length ? "#ef4444" : "#94a3b8",
                  cursor: selectedKeys.length ? "pointer" : "not-allowed",
                  fontWeight: 700,
                }}
              >
                Remove Selected
              </button>
            </div>
          </div>

          {customCart.map((item) => {
            const imageSrc = resolveImage(item.image_url || item.preview_image_url);
            const dims = getItemDisplayDims(item);
            const isSelected = selectedKeys.includes(item.key);

            const showEditedCardPreview = hasEditorSnapshot(item);

            return (
              <div
                key={item.key}
                style={{
                  display: "grid",
                  gridTemplateColumns: "32px 180px 1fr",
                  gap: "16px",
                  border: isSelected ? "1.5px solid #3b82f6" : "1px solid #e5e7eb",
                  borderRadius: "16px",
                  padding: "16px",
                  background: isSelected ? "#f8fbff" : "#fff",
                }}
              >
                <div style={{ paddingTop: 6 }}>
                  <input
                    type="radio"
                    name="custom-design-selection"
                    checked={isSelected}
                    onChange={() => toggleSelected(item.key)}
                    style={{
                      width: 18,
                      height: 18,
                      cursor: "pointer",
                    }}
                  />
                </div>

                <div
                  style={{
                    width: "100%",
                    height: "160px",
                    borderRadius: "12px",
                    overflow: "hidden",
                    background: "#f3f4f6",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: showEditedCardPreview ? "1px solid #dbeafe" : "none",
                  }}
                >
                  {showEditedCardPreview ? (
                    <CustomerBlueprintViewer
                      blueprint={buildCartPreviewBlueprint(item)}
                      readOnly
                      showHumanControls={false}
                      compact
                      compactHeight={160}
                      defaultPreset="isometric"
                      defaultShowHuman={false}
                    />
                  ) : imageSrc ? (
                    <img
                      src={imageSrc}
                      alt={
                        item.base_blueprint_title ||
                        item.product_name ||
                        "Custom item"
                      }
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <div style={{ color: "#888" }}>No image</div>
                  )}
                </div>

                <div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "12px",
                      alignItems: "start",
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <h3 style={{ margin: 0 }}>
                        {item.base_blueprint_title ||
                          item.product_name ||
                          "Custom Furniture"}
                      </h3>
                      <p style={{ margin: "6px 0 0", color: "#666" }}>
                        Admin furniture template • Customer-edited draft
                      </p>
                    </div>

                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      {hasEditorSnapshot(item) ? (
                        <button
                          type="button"
                          onClick={() => setPreviewItem(item)}
                          style={{
                            padding: "8px 12px",
                            borderRadius: "10px",
                            border: "1px solid #111827",
                            background: "#111827",
                            color: "#fff",
                            cursor: "pointer",
                          }}
                        >
                          View Edited Design
                        </button>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => openEditDesign(item)}
                        className="custom-review-edit-btn"
                      >
                        Edit Design
                      </button>

                      <button
                        type="button"
                        onClick={() => removeFromCustomCart(item.key)}
                        style={{
                          padding: "8px 12px",
                          borderRadius: "10px",
                          border: "1px solid #ef4444",
                          background: "#fff",
                          color: "#ef4444",
                          cursor: "pointer",
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
                      gap: "10px",
                      marginTop: "14px",
                    }}
                  >
                    <div>
                      <strong>Quantity:</strong>{" "}
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 8,
                          marginLeft: 6,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() =>
                            Number(item.quantity || 1) > 1 &&
                            updateCustomQty(item.key, -1)
                          }
                          disabled={Number(item.quantity || 1) <= 1}
                          aria-label={`Decrease ${
                            item.base_blueprint_title ||
                            item.product_name ||
                            "custom design"
                          } quantity`}
                          style={{
                            width: 28,
                            height: 28,
                            border: "1px solid #d4d4d8",
                            borderRadius: 4,
                            background: "#fff",
                            cursor:
                              Number(item.quantity || 1) > 1
                                ? "pointer"
                                : "not-allowed",
                          }}
                        >
                          −
                        </button>
                        <span style={{ minWidth: 20, textAlign: "center" }}>
                          {Math.max(1, Number(item.quantity || 1))}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateCustomQty(item.key, 1)}
                          aria-label={`Increase ${
                            item.base_blueprint_title ||
                            item.product_name ||
                            "custom design"
                          } quantity`}
                          style={{
                            width: 28,
                            height: 28,
                            border: "1px solid #d4d4d8",
                            borderRadius: 4,
                            background: "#fff",
                            cursor: "pointer",
                          }}
                        >
                          +
                        </button>
                      </span>
                    </div>
                    <div>
                      <strong>Wood:</strong> {item.wood_type || "—"}
                    </div>
                    <div>
                      <strong>Finish:</strong> {item.finish_color || item.color || "—"}
                    </div>
                    <div>
                      <strong>Door Style:</strong> {item.door_style || "—"}
                    </div>
                    <div>
                      <strong>Hardware:</strong> {item.hardware || "—"}
                    </div>
                    <div>
                      <strong>Width:</strong> {formatMm(dims.width)}
                    </div>
                    <div>
                      <strong>Height:</strong> {formatMm(dims.height)}
                    </div>
                    <div>
                      <strong>Depth:</strong> {formatMm(dims.depth)}
                    </div>
                  </div>

                  {item.comments ? (
                    <div style={{ marginTop: "12px" }}>
                      <strong>Initial Message to Admin:</strong>
                      <p style={{ margin: "6px 0 0", color: "#444" }}>
                        {item.comments}
                      </p>
                    </div>
                  ) : null}

                  {(referencePhotoPreviews[item.key] || []).length ? (
                    <div style={{ marginTop: "12px" }}>
                      <strong>Reference Photos:</strong>

                      <div
                        style={{
                          display: "flex",
                          gap: "8px",
                          flexWrap: "wrap",
                          marginTop: "8px",
                        }}
                      >
                        {referencePhotoPreviews[item.key].map((photo) => (
                          <img
                            key={photo.id}
                            src={photo.data_url}
                            alt={photo.name || "Reference"}
                            style={{
                              width: 72,
                              height: 72,
                              objectFit: "cover",
                              borderRadius: 10,
                              border: "1px solid #e5e7eb",
                              background: "#f8fafc",
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "12px",
              flexWrap: "wrap",
              marginTop: "8px",
            }}
          >
            <div style={{ color: "#475569", fontSize: "14px" }}>
              {selectedItem
                ? `This design will become one custom request for ${Math.max(
                    1,
                    Number(selectedItem.quantity || 1),
                  )} unit${
                    Math.max(1, Number(selectedItem.quantity || 1)) !== 1
                      ? "s"
                      : ""
                  }.`
                : "Select one design to continue."}
              {customCart.length > 1 ? (
                <span style={{ color: "#94a3b8", marginLeft: 8 }}>
                  Other saved designs can be submitted separately.
                </span>
              ) : null}
            </div>

            <button
              type="button"
              onClick={handleProceedSelectedCheckout}
              disabled={!selectedItems.length}
              style={{
                display: "inline-block",
                padding: "12px 18px",
                borderRadius: "12px",
                border: "none",
                background: selectedItems.length ? "#111827" : "#94a3b8",
                color: "#fff",
                fontWeight: 700,
                cursor: selectedItems.length ? "pointer" : "not-allowed",
              }}
            >
              Proceed to Quotation
            </button>
          </div>
        </div>
      )}

      {editItem ? (
        <div
          className="custom-review-edit-backdrop"
          onClick={closeEditDesign}
        >
          <div
            className="custom-review-edit-shell"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="custom-review-edit-header">
              <div>
                <h2>Edit Saved Design</h2>
                <p>
                  Continue from the exact design you saved. Saving here updates
                  this same custom design instead of creating a second request.
                </p>
              </div>

              <button
                type="button"
                className="custom-review-edit-close"
                onClick={closeEditDesign}
                aria-label="Close edit design"
              >
                ×
              </button>
            </div>

            <div className="custom-review-edit-body">
              {editLoading ? (
                <div className="custom-review-edit-state">
                  Loading your saved design…
                </div>
              ) : editError ? (
                <div className="custom-review-edit-error">{editError}</div>
              ) : editBlueprint ? (
                <CustomerTemplateWorkbench
                  key={`edit_${editItem.key}`}
                  blueprint={editBlueprint}
                  readOnly={false}
                  confirmLabel={editSaving ? "Saving…" : "Save Design Changes"}
                  initialQuantity={Math.max(1, Number(editItem.quantity || 1))}
                  initialComments={
                    editItem.comments || editItem.initial_message || ""
                  }
                  initialReferencePhotos={editReferencePhotos}
                  onConfirm={handleSaveEditedDesign}
                />
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {previewItem && previewBlueprint ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            zIndex: 9999,
          }}
          onClick={() => setPreviewItem(null)}
        >
          <div
            style={{
              width: "min(1280px, 96vw)",
              maxHeight: "92vh",
              overflow: "auto",
              background: "#fff",
              borderRadius: "20px",
              boxShadow: "0 24px 60px rgba(0,0,0,.28)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "12px",
                padding: "18px 20px",
                borderBottom: "1px solid #e5e7eb",
              }}
            >
              <div>
                <h2 style={{ margin: 0 }}>
                  {previewItem.base_blueprint_title ||
                    previewItem.product_name ||
                    "Custom Furniture"}
                </h2>
                <p style={{ margin: "6px 0 0", color: "#64748b" }}>
                  Read-only preview of the exact edited customer draft
                </p>
              </div>

              <button
                type="button"
                onClick={() => setPreviewItem(null)}
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  border: "1px solid #cbd5e1",
                  background: "#fff",
                  cursor: "pointer",
                  fontSize: 20,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>

            <div style={{ padding: 16 }}>
              <CustomerTemplateWorkbench blueprint={previewBlueprint} readOnly />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}