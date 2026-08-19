// src/pages/products/ProductFormPage.jsx – Create / Edit Product
import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api, { buildAssetUrl } from "../../services/api";
import toast from "react-hot-toast";
import CustomerBlueprintViewer from "../customer/CustomerBlueprintViewer";

// WISDOM PRODUCT FORM PROFESSIONAL UI V2
// WISDOM UNIFIED PRODUCT PRICE V1
// WISDOM BLUEPRINT CATALOG FINAL POLISH V1
// WISDOM PRODUCT COST LABEL AND SUMMARY NUMBER FIX V1
const DEFAULT = {
  name: "",
  barcode: "",
  description: "",
  category_id: "",
  type: "standard",

  online_price: "",
  walkin_price: "",
  production_cost: "",
  stock: 0,
  reorder_point: 0,
  is_featured: false,
};

const MAX_PRODUCT_IMAGES = 6;

export default function ProductFormPage() {
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [form, setForm] = useState(DEFAULT);
  const [galleryItems, setGalleryItems] = useState([]);
  const [galleryMessage, setGalleryMessage] = useState("");
  const [bom, setBom] = useState([]);
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);

  const isBlueprint = form.type === "blueprint";

  useEffect(() => {
    let active = true;

    const loadCategories = async () => {
      setCategoriesLoading(true);

      try {
        const { data } = await api.get("/products/categories");
        if (!active) return;

        setCategories(
          Array.isArray(data?.categories) ? data.categories : [],
        );
      } catch {
        if (active) setCategories([]);
      } finally {
        if (active) setCategoriesLoading(false);
      }
    };

    loadCategories();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isEdit) return;

    api.get(`/products/${id}`).then((response) => {
      const {
        bill_of_materials: savedBom,
        images: savedImages,
        ...rest
      } = response.data;
      const unifiedPrice =
        rest.online_price ?? rest.walkin_price ?? "";

      setForm((current) => ({
        ...current,
        ...rest,
        online_price: unifiedPrice,
        walkin_price: unifiedPrice,
      }));
      setBom(savedBom || []);

      if (rest.category_id && rest.category_name) {
        setCategories((current) => {
          const exists = current.some(
            (category) => String(category.id) === String(rest.category_id),
          );

          if (exists) return current;

          return [
            ...current,
            { id: rest.category_id, name: rest.category_name },
          ].sort((a, b) => String(a.name).localeCompare(String(b.name)));
        });
      }

      const normalizedGallery = Array.isArray(savedImages)
        ? [...savedImages]
            .sort(
              (a, b) =>
                Number(a.sort_order || 0) - Number(b.sort_order || 0),
            )
            .filter((item) => item?.image_url)
            .slice(0, MAX_PRODUCT_IMAGES)
            .map((item) => ({
              key: item.id
                ? `existing-${item.id}`
                : `legacy-${rest.id || id}`,
              kind: item.id ? "existing" : "legacy",
              id: item.id || null,
              image_url: item.image_url,
              preview: buildAssetUrl(item.image_url),
              name: item.id ? `Saved image ${item.id}` : "Current product image",
            }))
        : [];

      if (normalizedGallery.length > 0) {
        setGalleryItems(normalizedGallery);
      } else if (rest.image_url) {
        setGalleryItems([
          {
            key: `legacy-${rest.id || id}`,
            kind: "legacy",
            id: null,
            image_url: rest.image_url,
            preview: buildAssetUrl(rest.image_url),
            name: "Current product image",
          },
        ]);
      } else {
        setGalleryItems([]);
      }
    });
  }, [id, isEdit]);

  const set = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));

  const moveGalleryItem = (fromIndex, toIndex) => {
    setGalleryItems((current) => {
      if (
        fromIndex < 0 ||
        fromIndex >= current.length ||
        toIndex < 0 ||
        toIndex >= current.length ||
        fromIndex === toIndex
      ) {
        return current;
      }

      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
    setGalleryMessage("");
  };

  const makeGalleryMain = (index) => {
    if (index <= 0) return;
    moveGalleryItem(index, 0);
  };

  const removeGalleryItem = (index) => {
    setGalleryItems((current) => {
      const target = current[index];

      if (target?.kind === "new" && target.preview) {
        URL.revokeObjectURL(target.preview);
      }

      return current.filter((_, itemIndex) => itemIndex !== index);
    });
    setGalleryMessage("");
  };

  const addGalleryFiles = (fileList) => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;

    const available = MAX_PRODUCT_IMAGES - galleryItems.length;

    if (available <= 0) {
      setGalleryMessage(
        `You can add up to ${MAX_PRODUCT_IMAGES} product images.`,
      );
      return;
    }

    const accepted = files.slice(0, available);
    const now = Date.now();

    const additions = accepted.map((file, index) => ({
      key: `new-${now}-${index}-${file.name}`,
      kind: "new",
      id: null,
      file,
      image_url: null,
      preview: URL.createObjectURL(file),
      name: file.name,
    }));

    setGalleryItems((current) => [...current, ...additions]);

    if (files.length > available) {
      setGalleryMessage(
        `Only ${available} more image${
          available === 1 ? "" : "s"
        } can be added. Maximum is ${MAX_PRODUCT_IMAGES}.`,
      );
    } else {
      setGalleryMessage("");
    }
  };

  // WISDOM PRODUCT BOM UI REMOVED V2
  // Existing saved BOM data is preserved but is no longer edited here.

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);

    try {
      const fd = new FormData();

      const allowedFields = [
        "name",
        "barcode",
        "description",
        "category_id",
        "type",

        "online_price",
        "walkin_price",
        "production_cost",
        "stock",
        "reorder_point",
        "is_featured",
      ];

      const normalizedForm = isBlueprint
        ? {
            ...form,
            online_price: 0,
            walkin_price: 0,
            production_cost: 0,
            stock: 0,
            reorder_point: 0,
            is_featured: false,
          }
        : {
            ...form,
            walkin_price: form.online_price,
          };

      allowedFields.forEach((key) => {
        if (
          normalizedForm[key] !== undefined &&
          normalizedForm[key] !== null
        ) {
          fd.append(key, normalizedForm[key]);
        }
      });

      fd.append("bill_of_materials", JSON.stringify(bom));

      if (!isBlueprint) {
        const newItems = galleryItems.filter(
          (item) => item.kind === "new" && item.file,
        );
        const newIndexByKey = new Map(
          newItems.map((item, index) => [item.key, index]),
        );

        newItems.forEach((item) => {
          fd.append("images", item.file);
        });

        const galleryOrder = galleryItems.map((item) => {
          if (item.kind === "existing") {
            return {
              type: "existing",
              id: Number(item.id),
            };
          }

          if (item.kind === "legacy") {
            return {
              type: "legacy",
            };
          }

          return {
            type: "new",
            index: newIndexByKey.get(item.key),
          };
        });

        fd.append("gallery_order", JSON.stringify(galleryOrder));
      }

      // Multiple Cloudinary uploads can legitimately take longer than the shared
      // 30-second Axios default. Keep the longer timeout local to Product saves
      // so the rest of the application retains its normal request timeout.
      const productSaveRequestConfig = {
        timeout: 180000,
      };

      if (isEdit) {
        await api.put(`/products/${id}`, fd, productSaveRequestConfig);
        toast.success("Product updated successfully.");
      } else {
        await api.post("/products", fd, productSaveRequestConfig);
        toast.success("Product created successfully.");
      }

      navigate("/admin/products");
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to save product.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={page}>
      <div style={pageHeader}>
        <button
          type="button"
          onClick={() => navigate("/admin/products")}
          style={btnBack}
        >
          ← Back to products
        </button>

        <div>
          <h1 style={pageTitle}>
            {isEdit ? "Edit Product" : "Add New Product"}
          </h1>
          <p style={pageSubtitle}>
            {isEdit
              ? "Update product details, pricing, inventory settings, and visibility."
              : "Add the product information customers and staff need to see."}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <Section
          title="Basic information"
          description="Product identity and customer-facing details."
        >
          <Row>
            <Field label="Product name" required>
              <input
                required
                value={form.name}
                onChange={(event) => set("name", event.target.value)}
                style={input}
                placeholder="Example: Modern Oak Dining Table"
              />
            </Field>

            <Field label="Barcode">
              <input
                value={form.barcode || ""}
                onChange={(event) => set("barcode", event.target.value)}
                style={input}
                placeholder="Optional"
              />
            </Field>
          </Row>

          <Row>
            <Field label="Category" required>
              <select
                required
                value={form.category_id}
                onChange={(event) => set("category_id", event.target.value)}
                style={input}
                disabled={categoriesLoading || categories.length === 0}
              >
                <option value="">
                  {categoriesLoading
                    ? "Loading categories..."
                    : categories.length === 0
                      ? "No product categories available"
                      : "Select category"}
                </option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Product type">
              <input
                value={isBlueprint ? "Blueprint product" : "Ready-made product"}
                readOnly
                style={readOnlyInput}
              />
              <div style={helperText}>
                {isBlueprint
                  ? "Blueprint product type is linked to Blueprint Management and cannot be changed here."
                  : isEdit
                    ? "Product type cannot be changed after creation."
                    : "Products created here are ready-made. Publish Blueprint products from Blueprint Management."}
              </div>
            </Field>
          </Row>

          {!isBlueprint && (
            <Row>

              <Field label="Featured">
                <label style={featuredControl}>
                  <input
                    type="checkbox"
                    checked={Boolean(form.is_featured)}
                    onChange={(event) =>
                      set("is_featured", event.target.checked)
                    }
                    style={checkbox}
                  />
                  <span>Show as new product on homepage (maximum 4)</span>
                </label>
              </Field>
            </Row>
          )}


          <Field label="Description">
            <textarea
              value={form.description || ""}
              onChange={(event) => set("description", event.target.value)}
              rows={3}
              style={{
                ...input,
                minHeight: 82,
                paddingTop: 10,
                resize: "vertical",
              }}
              placeholder="Describe the product, materials, or key features"
            />
          </Field>
        </Section>

        {isBlueprint ? (
          <Section
            title="Blueprint preview"
            description="This preview comes from the linked Blueprint design and stays consistent with Orders and the customer Customize Gallery."
          >
            {form.blueprint_id &&
            (form.blueprint_design_data ||
              form.blueprint_view_3d_data ||
              form.blueprint_thumbnail_url) ? (
              <div style={blueprintPreviewPanel}>
                <CustomerBlueprintViewer
                  blueprint={{
                    id: form.blueprint_id,
                    title: form.blueprint_title || form.name || "Blueprint",
                    thumbnail_url: form.blueprint_thumbnail_url || null,
                    design_data: form.blueprint_design_data || null,
                    view_3d_data: form.blueprint_view_3d_data || null,
                  }}
                  readOnly
                  showHumanControls={false}
                  compact
                  compactHeight={150}
                  defaultPreset="isometric"
                  defaultShowHuman={false}
                />
              </div>
            ) : (
              <div style={infoBox}>
                <div style={infoTitle}>Preview comes from Blueprint Management</div>
                <div style={infoText}>
                  Publish this product from a saved Blueprint design to show its furniture preview here.
                </div>
              </div>
            )}
          </Section>
        ) : (
          <Section
            title="Product images"
            description="Add up to 6 product views. The first image is the main image shown across the catalog."
          >
            <div style={galleryToolbar}>
              <div>
                <div style={galleryCount}>
                  {galleryItems.length} of {MAX_PRODUCT_IMAGES} images
                </div>
                <div style={helperText}>
                  Add front, side, detail, or lifestyle views when available.
                </div>
              </div>

              <label
                style={{
                  ...btnSecondary,
                  opacity:
                    galleryItems.length >= MAX_PRODUCT_IMAGES ? 0.5 : 1,
                  cursor:
                    galleryItems.length >= MAX_PRODUCT_IMAGES
                      ? "not-allowed"
                      : "pointer",
                }}
              >
                Add images
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  hidden
                  disabled={galleryItems.length >= MAX_PRODUCT_IMAGES}
                  onChange={(event) => {
                    addGalleryFiles(event.target.files);
                    event.target.value = "";
                  }}
                />
              </label>
            </div>

            {galleryMessage ? (
              <div style={galleryMessageStyle}>{galleryMessage}</div>
            ) : null}

            {galleryItems.length > 0 ? (
              <div style={galleryGrid}>
                {galleryItems.map((item, index) => (
                  <div key={item.key} style={galleryCard}>
                    <div style={galleryImageBox}>
                      {item.preview ? (
                        <img
                          src={item.preview}
                          alt={`${form.name || "Product"} view ${index + 1}`}
                          style={galleryImage}
                        />
                      ) : (
                        <span style={previewPlaceholder}>No image</span>
                      )}

                      {index === 0 ? (
                        <span style={galleryMainBadge}>Main</span>
                      ) : null}
                    </div>

                    <div style={galleryCardFooter}>
                      <div style={galleryImageName} title={item.name}>
                        {index === 0 ? "Main image" : `Image ${index + 1}`}
                      </div>

                      <div style={galleryActionRow}>
                        {index > 0 ? (
                          <button
                            type="button"
                            style={galleryMiniButton}
                            onClick={() => makeGalleryMain(index)}
                          >
                            Make main
                          </button>
                        ) : null}

                        <button
                          type="button"
                          style={{
                            ...galleryIconButton,
                            opacity: index === 0 ? 0.35 : 1,
                          }}
                          disabled={index === 0}
                          onClick={() => moveGalleryItem(index, index - 1)}
                          aria-label="Move image left"
                          title="Move left"
                        >
                          &larr;
                        </button>

                        <button
                          type="button"
                          style={{
                            ...galleryIconButton,
                            opacity:
                              index === galleryItems.length - 1 ? 0.35 : 1,
                          }}
                          disabled={index === galleryItems.length - 1}
                          onClick={() => moveGalleryItem(index, index + 1)}
                          aria-label="Move image right"
                          title="Move right"
                        >
                          &rarr;
                        </button>

                        <button
                          type="button"
                          style={galleryRemoveButton}
                          onClick={() => removeGalleryItem(index)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={galleryEmpty}>
                <div style={galleryEmptyTitle}>No product image selected</div>
                <div style={helperText}>
                  You can save the product without an image and add images later.
                </div>
              </div>
            )}

            <div style={helperText}>
              JPG, PNG, or WEBP. The Main image remains the compatibility image
              used by existing catalog, cart, POS, and order displays.
            </div>
          </Section>
        )}

        <Section
          title="Pricing and inventory"
          description={
            isBlueprint
              ? "Blueprint templates do not have a fixed selling price. The customer quotation is calculated after customization and project estimation."
              : "Set one selling price and the inventory settings. Physical stock changes are recorded through Stock Movement."
          }
        >
          {isBlueprint ? (
            <div style={infoBox}>
              <div style={infoTitle}>Quotation after estimation</div>
              <div style={infoText}>
                Customer changes can affect materials, dimensions, and labor, so this blueprint has no fixed product price or ready-made stock.
              </div>
            </div>
          ) : (
            <>
              <Row>
                <Field label="Price" required>
                  <MoneyInput
                    value={form.online_price}
                    onChange={(value) =>
                      setForm((current) => ({
                        ...current,
                        online_price: value,
                        walkin_price: value,
                      }))
                    }
                  />
                  <div style={helperText}>
                    The same selling price is used online and in store.
                  </div>
                </Field>

                <Field label="Product cost">
                  <MoneyInput
                    value={form.production_cost}
                    onChange={(value) => set("production_cost", value)}
                    required={false}
                  />
                  <div style={helperText}>
                    Cost per ready-made item. Used to calculate profit in Build Materials.
                  </div>
                </Field>
              </Row>

              <Row>
                <Field label="Stock on hand">
                  <input
                    type="number"
                    value={Number(form.stock || 0)}
                    readOnly
                    style={readOnlyInput}
                  />
                  <div style={helperText}>
                    Use Stock Movement to add or remove ready-made inventory.
                  </div>
                </Field>

                <Field label="Reorder point">
                  <input
                    type="number"
                    min="0"
                    value={form.reorder_point ?? 0}
                    onChange={(event) => set("reorder_point", event.target.value)}
                    style={input}
                    placeholder="0"
                  />
                  <div style={helperText}>
                    Low-stock reminder level for ready-made inventory.
                  </div>
                </Field>
              </Row>
            </>
          )}
        </Section>

        {/* WISDOM PRODUCT BOM UI REMOVED V2 */}

        <div style={footerActions}>
          <button
            type="button"
            onClick={() => navigate("/admin/products")}
            style={btnSecondary}
            disabled={saving}
          >
            Cancel
          </button>
          <button type="submit" disabled={saving} style={btnPrimary}>
            {saving
              ? "Saving..."
              : isEdit
                ? "Save changes"
                : "Create product"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Section({ title, description, children }) {
  return (
    <section style={section}>
      <div style={sectionHeader}>
        <h2 style={sectionTitle}>{title}</h2>
        {description && <p style={sectionDescription}>{description}</p>}
      </div>
      {children}
    </section>
  );
}

function Row({ children, columns }) {
  return (
    <div
      style={{
        ...row,
        gridTemplateColumns: `repeat(${columns || React.Children.count(children)}, minmax(0, 1fr))`,
      }}
    >
      {children}
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <div style={field}>
      <label style={fieldLabel}>
        {label}
        {required ? <span style={requiredMark}> *</span> : null}
      </label>
      {children}
    </div>
  );
}

function MoneyInput({ value, onChange, required = true }) {
  return (
    <div style={moneyField}>
      <span style={moneyPrefix}>₱</span>
      <input
        type="number"
        step="0.01"
        min="0"
        required={required}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        style={moneyInput}
        placeholder="0.00"
      />
    </div>
  );
}

const page = {
  width: "min(1040px, 100%)",
  margin: "0 auto",
  paddingBottom: 36,
  fontFamily: "inherit",
};

const pageHeader = {
  display: "flex",
  alignItems: "flex-start",
  gap: 14,
  marginBottom: 16,
};

const pageTitle = {
  margin: 0,
  color: "#18181b",
  fontSize: 24,
  fontWeight: 700,
  lineHeight: 1.2,
  letterSpacing: "-0.02em",
};

const pageSubtitle = {
  margin: "5px 0 0",
  color: "#71717a",
  fontSize: 12.5,
  fontWeight: 400,
  lineHeight: 1.45,
};

const section = {
  padding: 20,
  marginBottom: 12,
  background: "#ffffff",
  border: "1px solid #d9dce1",
  borderRadius: 2,
  boxShadow: "none",
};

const sectionHeader = {
  paddingBottom: 12,
  marginBottom: 16,
  borderBottom: "1px solid #eeeeef",
};

const sectionTitle = {
  margin: 0,
  color: "#18181b",
  fontSize: 15,
  fontWeight: 700,
  lineHeight: 1.25,
};

const sectionDescription = {
  margin: "4px 0 0",
  color: "#71717a",
  fontSize: 11,
  fontWeight: 400,
  lineHeight: 1.4,
};

const row = {
  display: "grid",
  gap: 14,
  alignItems: "start",
};

const field = {
  minWidth: 0,
  marginBottom: 13,
};

const fieldLabel = {
  display: "block",
  marginBottom: 6,
  color: "#3f3f46",
  fontSize: 11,
  fontWeight: 600,
  lineHeight: 1.2,
};

const requiredMark = { color: "#991b1b" };

const input = {
  width: "100%",
  height: 37,
  padding: "0 10px",
  border: "1px solid #d4d4d8",
  borderRadius: 2,
  background: "#ffffff",
  color: "#27272a",
  fontFamily: "inherit",
  fontSize: 12,
  fontWeight: 400,
  lineHeight: 1.4,
  outline: "none",
  boxSizing: "border-box",
};

const readOnlyInput = {
  ...input,
  background: "#f7f7f8",
  color: "#52525b",
};

const featuredControl = {
  minHeight: 37,
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  padding: "0 10px",
  background: "#ffffff",
  color: "#3f3f46",
  border: "1px solid #d4d4d8",
  borderRadius: 2,
  fontSize: 11.5,
  fontWeight: 400,
  cursor: "pointer",
};

const checkbox = {
  width: 14,
  height: 14,
  accentColor: "#18181b",
};

const previewPlaceholder = {
  color: "#a1a1aa",
  fontSize: 11,
  fontWeight: 400,
};

const galleryToolbar = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 14,
  marginBottom: 14,
};

const galleryCount = {
  color: "#27272a",
  fontSize: 11.5,
  fontWeight: 600,
};

const galleryMessageStyle = {
  marginBottom: 12,
  padding: "8px 10px",
  border: "1px solid #e4e4e7",
  background: "#fafafa",
  color: "#52525b",
  fontSize: 10.5,
  lineHeight: 1.4,
};

const galleryGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
  gap: 10,
  marginBottom: 10,
};

const galleryCard = {
  minWidth: 0,
  border: "1px solid #dedfe2",
  background: "#ffffff",
};

const galleryImageBox = {
  position: "relative",
  height: 132,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
  background: "#f7f5f2",
  borderBottom: "1px solid #eeeeef",
};

const galleryImage = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
};

const galleryMainBadge = {
  position: "absolute",
  top: 8,
  left: 8,
  padding: "4px 7px",
  background: "#18181b",
  color: "#ffffff",
  fontSize: 9.5,
  fontWeight: 600,
  letterSpacing: "0.03em",
};

const galleryCardFooter = {
  padding: 9,
};

const galleryImageName = {
  marginBottom: 8,
  overflow: "hidden",
  color: "#3f3f46",
  fontSize: 10.5,
  fontWeight: 600,
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const galleryActionRow = {
  display: "flex",
  alignItems: "center",
  gap: 5,
  flexWrap: "wrap",
};

const galleryMiniButton = {
  minHeight: 27,
  padding: "0 7px",
  border: "1px solid #d4d4d8",
  background: "#ffffff",
  color: "#27272a",
  fontFamily: "inherit",
  fontSize: 9.5,
  fontWeight: 500,
  cursor: "pointer",
};

const galleryIconButton = {
  width: 28,
  minHeight: 27,
  padding: 0,
  border: "1px solid #d4d4d8",
  background: "#ffffff",
  color: "#27272a",
  fontFamily: "inherit",
  fontSize: 11,
  cursor: "pointer",
};

const galleryRemoveButton = {
  minHeight: 27,
  padding: "0 7px",
  border: 0,
  background: "transparent",
  color: "#71717a",
  fontFamily: "inherit",
  fontSize: 9.5,
  fontWeight: 500,
  cursor: "pointer",
};

const galleryEmpty = {
  marginBottom: 10,
  padding: "22px 14px",
  border: "1px dashed #cfd1d5",
  background: "#fafafa",
  textAlign: "center",
};

const galleryEmptyTitle = {
  color: "#3f3f46",
  fontSize: 11.5,
  fontWeight: 600,
};

const helperText = {
  marginTop: 6,
  color: "#71717a",
  fontSize: 10,
  fontWeight: 400,
  lineHeight: 1.4,
};

const moneyField = {
  height: 37,
  display: "flex",
  alignItems: "center",
  overflow: "hidden",
  border: "1px solid #d4d4d8",
  borderRadius: 2,
  background: "#ffffff",
};

const moneyPrefix = {
  paddingLeft: 10,
  color: "#71717a",
  fontSize: 12,
  fontWeight: 500,
};

const moneyInput = {
  flex: 1,
  minWidth: 0,
  height: "100%",
  padding: "0 10px 0 5px",
  border: 0,
  outline: "none",
  background: "transparent",
  color: "#27272a",
  fontFamily: "inherit",
  fontSize: 12,
  fontWeight: 400,
};

const blueprintPreviewPanel = {
  height: 150,
  overflow: "hidden",
  background: "#f7f5f2",
  border: "1px solid #e4e4e7",
  borderRadius: 2,
};

const infoBox = {
  padding: "11px 12px",
  background: "#fafafa",
  border: "1px solid #dedfe2",
  borderRadius: 2,
};

const infoTitle = {
  color: "#27272a",
  fontSize: 11.5,
  fontWeight: 600,
};

const infoText = {
  marginTop: 3,
  color: "#71717a",
  fontSize: 10.5,
  fontWeight: 400,
  lineHeight: 1.4,
};

const footerActions = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
  paddingTop: 3,
};

const btnPrimary = {
  minHeight: 37,
  padding: "0 15px",
  background: "#18181b",
  color: "#ffffff",
  border: "1px solid #18181b",
  borderRadius: 2,
  fontFamily: "inherit",
  fontSize: 11.5,
  fontWeight: 600,
  cursor: "pointer",
};

const btnSecondary = {
  minHeight: 37,
  padding: "0 13px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#ffffff",
  color: "#27272a",
  border: "1px solid #d4d4d8",
  borderRadius: 2,
  fontFamily: "inherit",
  fontSize: 11.5,
  fontWeight: 500,
  cursor: "pointer",
  boxSizing: "border-box",
};

const btnBack = {
  ...btnSecondary,
  minHeight: 33,
  padding: "0 10px",
  whiteSpace: "nowrap",
};

const btnText = {
  minHeight: 32,
  padding: "0 7px",
  background: "transparent",
  color: "#52525b",
  border: 0,
  borderRadius: 2,
  fontFamily: "inherit",
  fontSize: 11,
  fontWeight: 500,
  cursor: "pointer",
};
