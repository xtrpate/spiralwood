// src/pages/products/ProductFormPage.jsx – Create / Edit Product
import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api, { buildAssetUrl } from "../../services/api";
import toast from "react-hot-toast";

const DEFAULT = {
  name: "",
  barcode: "",
  description: "",
  category_id: "",
  type: "standard",
  online_price: "",
  walkin_price: "",
  production_cost: "",
  stock: "",
  reorder_point: "",
  is_featured: false,
};

// Hardcoded categories matching your shop design perfectly
const SHOP_CATEGORIES = [
  { id: 1, name: "Bedroom Furniture" },
  { id: 2, name: "Kitchen Furniture" },
  { id: 3, name: "Bathroom Furniture" },
  { id: 4, name: "Office Furniture" },
  { id: 5, name: "Living Room Furniture" },
  { id: 6, name: "Dining Room Furniture" },
  { id: 7, name: "Wardrobe & Closet" },
  { id: 8, name: "TV Console & Storage" },
];

export default function ProductFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [form, setForm] = useState(DEFAULT);
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState("");
  const [categories, setCategories] = useState(SHOP_CATEGORIES);
  const [rawMats, setRawMats] = useState([]);
  const [variations, setVariations] = useState([]);
  const [bom, setBom] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/inventory/raw").then((r) => setRawMats(r.data.rows || []));

    if (isEdit) {
      api.get(`/products/${id}`).then((r) => {
        const { variations: vars, bill_of_materials: b, ...rest } = r.data;
        setForm((prev) => ({ ...prev, ...rest }));
        setVariations(vars || []);
        setBom(b || []);
        if (rest.image_url) setPreview(buildAssetUrl(rest.image_url));
      });
    }
  }, [id, isEdit]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const addVariation = () =>
    setVariations((v) => [
      ...v,
      {
        type: "wood_type",
        value: "",
        name: "",
        unit_cost: "",
        selling_price: "",
        stock: 0,
      },
    ]);

  const setVar = (i, k, v) =>
    setVariations((vars) =>
      vars.map((va, idx) => (idx === i ? { ...va, [k]: v } : va)),
    );

  const removeVar = (i) =>
    setVariations((vars) => vars.filter((_, idx) => idx !== i));

  const addBom = () =>
    setBom((b) => [...b, { raw_material_id: "", quantity: "" }]);

  const setBomRow = (i, k, v) =>
    setBom((rows) => rows.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)));

  const removeBom = (i) => setBom((rows) => rows.filter((_, idx) => idx !== i));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const fd = new FormData();

      // 👉 THE FIX: Only append the exact fields the database expects.
      // This prevents 'category_name' or other joined fields from crashing the backend.
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

      allowedFields.forEach((key) => {
        if (form[key] !== undefined && form[key] !== null) {
          fd.append(key, form[key]);
        }
      });

      fd.append("variations", JSON.stringify(variations));
      fd.append("bill_of_materials", JSON.stringify(bom));
      if (image) fd.append("image", image);

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
    <div
      style={{
        maxWidth: 860,
        margin: "0 auto",
        paddingBottom: 40,
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <button onClick={() => navigate("/admin/products")} style={btnBack}>
          ← Back
        </button>
        <h1
          style={{
            fontSize: 24,
            fontWeight: 800,
            color: "#0a0a0a",
            margin: 0,
            letterSpacing: "-0.02em",
          }}
        >
          {isEdit ? "Edit Product" : "Add New Product"}
        </h1>
      </div>

      <form onSubmit={handleSubmit}>
        <Section title="Basic Information">
          <Row>
            <Field label="Product Name *">
              <input
                required
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                style={input}
                placeholder="e.g. Modern Oak Dining Table"
              />
            </Field>
            <Field label="Barcode">
              <input
                value={form.barcode}
                onChange={(e) => set("barcode", e.target.value)}
                style={input}
                placeholder="Optional"
              />
            </Field>
          </Row>
          <Row>
            <Field label="Category *">
              <select
                required
                value={form.category_id}
                onChange={(e) => set("category_id", e.target.value)}
                style={input}
              >
                <option value="">Select category...</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          </Row>
          <Row>
            <Field label="Type">
              <select
                value={form.type}
                onChange={(e) => set("type", e.target.value)}
                style={input}
              >
                <option value="standard">Standard Prefab</option>
                <option value="blueprint">Blueprint Product</option>
              </select>
            </Field>
            <Field label="Featured">
              <label
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 10,
                  marginTop: 8,
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#18181b",
                  background: "#fafafa",
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid #e4e4e7",
                }}
              >
                <input
                  type="checkbox"
                  checked={form.is_featured}
                  onChange={(e) => set("is_featured", e.target.checked)}
                  style={{ accentColor: "#18181b", width: 16, height: 16 }}
                />
                Show on homepage as featured
              </label>
            </Field>
          </Row>
          <Field label="Description">
            <textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={4}
              style={{ ...input, resize: "vertical", fontFamily: "inherit" }}
              placeholder="Describe the product details, materials, and features..."
            />
          </Field>
          <Field label="Product Image">
            <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
              {preview ? (
                <img
                  src={preview}
                  alt="preview"
                  style={{
                    width: 100,
                    height: 100,
                    objectFit: "cover",
                    borderRadius: 12,
                    border: "1px solid #e4e4e7",
                    background: "#fafafa",
                    padding: 4,
                  }}
                />
              ) : (
                <div
                  style={{
                    width: 100,
                    height: 100,
                    borderRadius: 12,
                    border: "1px dashed #d4d4d8",
                    background: "#fafafa",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 24,
                    color: "#a1a1aa",
                  }}
                >
                  🖼️
                </div>
              )}
              <div style={{ flex: 1 }}>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setImage(file);
                    setPreview(file ? URL.createObjectURL(file) : "");
                  }}
                  style={{ ...input, background: "#fafafa", cursor: "pointer" }}
                />
                <p
                  style={{
                    fontSize: 12,
                    color: "#71717a",
                    margin: "6px 0 0",
                    fontWeight: 500,
                  }}
                >
                  Upload a high-quality image. PNG or JPG format recommended.
                </p>
              </div>
            </div>
          </Field>
        </Section>

        <Section title="Pricing & Stock">
          <Row>
            <Field label="Online Price (₱) *">
              <input
                type="number"
                step="0.01"
                required
                value={form.online_price}
                onChange={(e) => set("online_price", e.target.value)}
                style={input}
                placeholder="0.00"
              />
            </Field>
            <Field label="Walk-in Price (₱) *">
              <input
                type="number"
                step="0.01"
                required
                value={form.walkin_price}
                onChange={(e) => set("walkin_price", e.target.value)}
                style={input}
                placeholder="0.00"
              />
            </Field>
            <Field label="Production Cost (₱)">
              <input
                type="number"
                step="0.01"
                value={form.production_cost}
                onChange={(e) => set("production_cost", e.target.value)}
                style={input}
                placeholder="0.00"
              />
            </Field>
          </Row>
          <Row>
            <Field label="Stock Quantity">
              <input
                type="number"
                value={form.stock}
                onChange={(e) => set("stock", e.target.value)}
                style={input}
                placeholder="0"
              />
            </Field>
            <Field label="Reorder Point">
              <input
                type="number"
                value={form.reorder_point}
                onChange={(e) => set("reorder_point", e.target.value)}
                style={input}
                placeholder="0"
              />
            </Field>
          </Row>
        </Section>

        <Section title="Product Variations (Wood Type / Design / Finish)">
          {variations.length === 0 ? (
            <p style={{ fontSize: 13, color: "#71717a", marginBottom: 16 }}>
              No variations added yet.
            </p>
          ) : null}

          {variations.map((v, i) => (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1.5fr 1fr 1fr auto",
                gap: 12,
                marginBottom: 12,
                alignItems: "end",
                background: "#fafafa",
                padding: "12px 16px",
                borderRadius: 12,
                border: "1px solid #e4e4e7",
              }}
            >
              <Field label="Type">
                <input
                  value={v.type}
                  onChange={(e) => setVar(i, "type", e.target.value)}
                  placeholder="wood_type"
                  style={input}
                />
              </Field>
              <Field label="Value">
                <input
                  value={v.value}
                  onChange={(e) => setVar(i, "value", e.target.value)}
                  placeholder="Plywood"
                  style={input}
                />
              </Field>
              <Field label="Label">
                <input
                  value={v.name}
                  onChange={(e) => setVar(i, "name", e.target.value)}
                  placeholder="Plywood (18mm)"
                  style={input}
                />
              </Field>
              <Field label="Unit Cost">
                <input
                  type="number"
                  value={v.unit_cost}
                  onChange={(e) => setVar(i, "unit_cost", e.target.value)}
                  style={input}
                  placeholder="0.00"
                />
              </Field>
              <Field label="Selling Price">
                <input
                  type="number"
                  value={v.selling_price}
                  onChange={(e) => setVar(i, "selling_price", e.target.value)}
                  style={input}
                  placeholder="0.00"
                />
              </Field>
              <button
                type="button"
                onClick={() => removeVar(i)}
                style={btnDel}
                title="Remove Variation"
              >
                ✕
              </button>
            </div>
          ))}
          <button type="button" onClick={addVariation} style={btnOutline}>
            + Add Variation
          </button>
        </Section>

        <Section title="Bill of Materials (Linked Raw Materials)">
          {bom.length === 0 ? (
            <p style={{ fontSize: 13, color: "#71717a", marginBottom: 16 }}>
              No materials linked yet.
            </p>
          ) : null}

          {bom.map((row, i) => (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1fr auto",
                gap: 12,
                marginBottom: 12,
                alignItems: "end",
                background: "#fafafa",
                padding: "12px 16px",
                borderRadius: 12,
                border: "1px solid #e4e4e7",
              }}
            >
              <Field label="Raw Material">
                <select
                  value={row.raw_material_id}
                  onChange={(e) =>
                    setBomRow(i, "raw_material_id", e.target.value)
                  }
                  style={input}
                >
                  <option value="">Select material...</option>
                  {rawMats.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.unit})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Quantity Required">
                <input
                  type="number"
                  step="0.01"
                  value={row.quantity}
                  onChange={(e) => setBomRow(i, "quantity", e.target.value)}
                  style={input}
                  placeholder="0.00"
                />
              </Field>
              <button
                type="button"
                onClick={() => removeBom(i)}
                style={btnDel}
                title="Remove Material"
              >
                ✕
              </button>
            </div>
          ))}
          <button type="button" onClick={addBom} style={btnOutline}>
            + Add Material
          </button>
        </Section>

        <div
          style={{
            display: "flex",
            gap: 12,
            justifyContent: "flex-end",
            marginTop: 32,
            paddingTop: 24,
            borderTop: "1px solid #e4e4e7",
          }}
        >
          <button
            type="button"
            onClick={() => navigate("/admin/products")}
            style={btnGhost}
          >
            Cancel
          </button>
          <button type="submit" disabled={saving} style={btnPrimary}>
            {saving ? "Saving..." : isEdit ? "Save Changes" : "Create Product"}
          </button>
        </div>
      </form>
    </div>
  );
}

const Section = ({ title, children }) => (
  <div
    style={{
      background: "#fff",
      borderRadius: 16,
      padding: 28,
      marginBottom: 20,
      border: "1px solid #e4e4e7",
      boxShadow: "0 1px 2px rgba(0,0,0,.02)",
    }}
  >
    <h3
      style={{
        fontSize: 16,
        fontWeight: 800,
        color: "#0a0a0a",
        marginTop: 0,
        marginBottom: 20,
        borderBottom: "1px solid #f4f4f5",
        paddingBottom: 14,
        letterSpacing: "-0.01em",
      }}
    >
      {title}
    </h3>
    {children}
  </div>
);

const Row = ({ children }) => (
  <div
    style={{
      display: "grid",
      gridTemplateColumns: `repeat(${React.Children.count(children)}, 1fr)`,
      gap: 16,
      marginBottom: 4,
    }}
  >
    {children}
  </div>
);

const Field = ({ label, children }) => (
  <div style={{ marginBottom: 12 }}>
    <label
      style={{
        fontSize: 11,
        fontWeight: 800,
        color: "#18181b",
        display: "block",
        marginBottom: 6,
        textTransform: "uppercase",
        letterSpacing: "1px",
      }}
    >
      {label}
    </label>
    {children}
  </div>
);

const input = {
  width: "100%",
  padding: "10px 14px",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  fontSize: 13,
  color: "#18181b",
  boxSizing: "border-box",
  outline: "none",
  background: "#ffffff",
};

const btnPrimary = {
  padding: "12px 24px",
  background: "#18181b",
  color: "#fff",
  border: "1px solid #18181b",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
  transition: "background 0.2s",
};

const btnGhost = {
  padding: "12px 20px",
  background: "#f4f4f5",
  color: "#18181b",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
  transition: "background 0.2s",
};

const btnOutline = {
  padding: "10px 18px",
  background: "#fff",
  border: "1px dashed #d4d4d8",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 700,
  color: "#52525b",
  transition: "all 0.2s",
};

const btnDel = {
  padding: "10px 14px",
  background: "#fef2f2",
  color: "#991b1b",
  border: "1px solid #fecaca",
  borderRadius: 8,
  cursor: "pointer",
  alignSelf: "flex-end",
  fontWeight: 800,
  transition: "background 0.2s",
};

const btnBack = {
  padding: "8px 12px",
  background: "#ffffff",
  color: "#52525b",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
  transition: "background 0.2s",
};
