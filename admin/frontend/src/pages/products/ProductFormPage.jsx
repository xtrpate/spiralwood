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

export default function ProductFormPage() {
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [form, setForm] = useState(DEFAULT);
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState("");
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
      const { bill_of_materials: savedBom, ...rest } = response.data;
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

      if (rest.image_url) {
        setPreview(buildAssetUrl(rest.image_url));
      }
    });
  }, [id, isEdit]);

  const set = (key, value) =>
    setForm((current) => ({ ...current, [key]: value }));

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

      if (image) {
        fd.append("image", image);
      }

      if (isEdit) {
        await api.put(`/products/${id}`, fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        toast.success("Product updated successfully.");
      } else {
        await api.post("/products", fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
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
            title="Product image"
            description="Use a clear product photo. PNG or JPG is recommended."
          >
            <div style={imagePanel}>
              <div style={previewBox}>
                {preview ? (
                  <img src={preview} alt="" style={previewImage} />
                ) : (
                  <span style={previewPlaceholder}>No image</span>
                )}
              </div>

              <div style={imageDetails}>
                <div style={imageStatus}>
                  {image
                    ? image.name
                    : preview
                      ? "Current product image"
                      : "No image selected"}
                </div>

                <div style={imageActions}>
                  <label style={btnSecondary}>
                    {preview ? "Replace image" : "Choose image"}
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(event) => {
                        const file = event.target.files?.[0] || null;
                        setImage(file);

                        if (file) {
                          setPreview(URL.createObjectURL(file));
                        }
                      }}
                    />
                  </label>

                  {image && (
                    <button
                      type="button"
                      onClick={() => {
                        setImage(null);
                        setPreview("");
                      }}
                      style={btnText}
                    >
                      Clear selection
                    </button>
                  )}
                </div>

                <div style={helperText}>
                  Recommended: a clean, high-quality image with the product clearly
                  visible.
                </div>
              </div>
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

const imagePanel = {
  display: "flex",
  alignItems: "center",
  gap: 15,
  padding: 12,
  background: "#fafafa",
  border: "1px dashed #cfd1d5",
  borderRadius: 2,
};

const previewBox = {
  width: 86,
  height: 86,
  flex: "0 0 86px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
  background: "#ffffff",
  border: "1px solid #dedfe2",
  borderRadius: 2,
};

const previewImage = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
};

const previewPlaceholder = {
  color: "#a1a1aa",
  fontSize: 11,
  fontWeight: 400,
};

const imageDetails = {
  flex: 1,
  minWidth: 0,
};

const imageStatus = {
  marginBottom: 8,
  color: "#3f3f46",
  fontSize: 11.5,
  fontWeight: 500,
};

const imageActions = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  flexWrap: "wrap",
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
