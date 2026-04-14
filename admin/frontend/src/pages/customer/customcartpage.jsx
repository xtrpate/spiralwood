import { Link, useNavigate } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useCustomCart } from "./customcartcontext";
import { buildAssetUrl } from "../../services/api";
import CustomerTemplateWorkbench from "./CustomerTemplateWorkbench";

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

const getEditedPreviewColor = (item = {}) => {
  const direct = String(item?.finish_color || item?.color || "").trim();
  if (direct) return direct;

  const components = Array.isArray(item?.editor_snapshot?.components)
    ? item.editor_snapshot.components
    : [];

  const colored = components.find((comp) => {
    const fill = String(comp?.fill || comp?.finish_color || comp?.color || "").trim();
    return fill && fill !== "#d6c3ab";
  });

  return String(
    colored?.fill || colored?.finish_color || colored?.color || "#d6c3ab",
  ).trim();
};
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

export default function CustomCartPage() {
  const navigate = useNavigate();

  const {
    customCart,
    removeFromCustomCart,
    removeManyFromCustomCart,
    clearCustomCart,
  } = useCustomCart();

  const [previewItem, setPreviewItem] = useState(null);
  const [selectedKeys, setSelectedKeys] = useState([]);

  useEffect(() => {
    const validKeys = new Set((customCart || []).map((item) => item.key));

    setSelectedKeys((prev) => {
      const kept = prev.filter((key) => validKeys.has(key));
      if (kept.length) return kept;

      return (customCart || []).map((item) => item.key);
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

  const selectedItems = useMemo(() => {
    const selectedSet = new Set(selectedKeys);
    return (customCart || []).filter((item) => selectedSet.has(item.key));
  }, [customCart, selectedKeys]);

  const totalUnits = customCart.reduce(
    (sum, item) => sum + Math.max(1, Number(item.quantity || 1)),
    0,
  );

  const selectedUnits = selectedItems.reduce(
    (sum, item) => sum + Math.max(1, Number(item.quantity || 1)),
    0,
  );

  const allSelected =
    customCart.length > 0 && selectedKeys.length === customCart.length;

  const toggleSelected = (key) => {
    setSelectedKeys((prev) =>
      prev.includes(key)
        ? prev.filter((itemKey) => itemKey !== key)
        : [...prev, key],
    );
  };

  const handleSelectAll = () => {
    setSelectedKeys((customCart || []).map((item) => item.key));
  };

  const handleClearSelection = () => {
    setSelectedKeys([]);
  };

  const handleRemoveSelected = () => {
    if (!selectedKeys.length) return;
    removeManyFromCustomCart(selectedKeys);
    setSelectedKeys([]);
  };

  const handleProceedSelectedCheckout = () => {
    const selectedKeysArray = Array.from(selectedKeys || []);

    if (!selectedKeysArray.length) {
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
          <h1 style={{ margin: 0 }}>Custom Cart</h1>
          <p style={{ margin: "8px 0 0", color: "#666" }}>
            Review your customized furniture requests before checkout.
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
              Selected: {selectedItems.length} design
              {selectedItems.length !== 1 ? "s" : ""} • {selectedUnits} unit
              {selectedUnits !== 1 ? "s" : ""}
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={allSelected ? handleClearSelection : handleSelectAll}
                style={{
                  padding: "10px 14px",
                  borderRadius: "10px",
                  border: "1px solid #d0d7de",
                  background: "#fff",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                {allSelected ? "Clear Selection" : "Select All"}
              </button>

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
            const editedPreviewColor = getEditedPreviewColor(item);
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
                    type="checkbox"
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
                    <div
                      style={{
                        width: "100%",
                        height: "100%",
                        background: "linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%)",
                        display: "flex",
                        flexDirection: "column",
                        justifyContent: "space-between",
                        padding: "12px",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 800,
                            letterSpacing: 0.3,
                            color: "#0f172a",
                            background: "#ffffff",
                            border: "1px solid #e2e8f0",
                            borderRadius: 999,
                            padding: "4px 8px",
                          }}
                        >
                          Edited 3D Draft
                        </span>

                        <span
                          title={editedPreviewColor}
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: "999px",
                            background: editedPreviewColor || "#d6c3ab",
                            border: "2px solid #ffffff",
                            boxShadow: "0 0 0 1px #cbd5e1",
                            flexShrink: 0,
                          }}
                        />
                      </div>

                      <div
                        style={{
                          flex: 1,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#64748b",
                          fontWeight: 700,
                          fontSize: 13,
                          textAlign: "center",
                          padding: "10px 6px",
                        }}
                      >
                        Customized preview saved
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr",
                          gap: 4,
                          fontSize: 11,
                          color: "#334155",
                        }}
                      >
                        <div>
                          W {Math.round(dims.width || 0)} • H {Math.round(dims.height || 0)} • D{" "}
                          {Math.round(dims.depth || 0)} mm
                        </div>
                        <div style={{ color: "#64748b" }}>
                          {item.finish_color || item.color || "Custom finish applied"}
                        </div>
                      </div>
                    </div>
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
                      <strong>Qty:</strong> {item.quantity || 1}
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

                  {Array.isArray(item.reference_photos) &&
                    item.reference_photos.length ? (
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
                          {item.reference_photos.map((photo) => (
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
              {selectedItems.length} selected design
              {selectedItems.length !== 1 ? "s" : ""} • {selectedUnits} selected
              unit{selectedUnits !== 1 ? "s" : ""}
              <span style={{ color: "#94a3b8", marginLeft: 8 }}>
                (All cart: {customCart.length} design
                {customCart.length !== 1 ? "s" : ""} • {totalUnits} unit
                {totalUnits !== 1 ? "s" : ""})
              </span>
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
              Proceed Selected to Custom Checkout
            </button>
          </div>
        </div>
      )}

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