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

export default function ProductFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const [form, setForm] = useState(DEFAULT);
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState("");
  const [categories, setCategories] = useState([]);
  const [rawMats, setRawMats] = useState([]);
  const [variations, setVariations] = useState([]);
  const [bom, setBom] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/inventory/raw").then((r) => setRawMats(r.data.rows || []));

    api.get("/products/report").then((r) => {
      const rows = Array.isArray(r.data?.categories) ? r.data.categories : [];
      setCategories(rows);
    });

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
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      fd.append("variations", JSON.stringify(variations));
      fd.append("bill_of_materials", JSON.stringify(bom));
      if (image) fd.append("image", image);

      if (isEdit) {
        await api.put(`/products/${id}`, fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        toast.success("Product updated.");
      } else {
        await api.post("/products", fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        toast.success("Product created.");
      }
      navigate("/admin/products");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 860, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 24,
        }}
      >
        <button onClick={() => navigate("/admin/products")} style={btnBack}>
          ← Back
        </button>
        <h1
          style={{ fontSize: 20, fontWeight: 700, color: "#1e2a38", margin: 0 }}
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
              />
            </Field>
            <Field label="Barcode">
              <input
                value={form.barcode}
                onChange={(e) => set("barcode", e.target.value)}
                style={input}
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
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 8,
                }}
              >
                <input
                  type="checkbox"
                  checked={form.is_featured}
                  onChange={(e) => set("is_featured", e.target.checked)}
                />
                Show on homepage as featured
              </label>
            </Field>
          </Row>
          <Field label="Description">
            <textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              rows={3}
              style={{ ...input, resize: "vertical" }}
            />
          </Field>
          <Field label="Product Image">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                setImage(file);
                setPreview(file ? URL.createObjectURL(file) : "");
              }}
              style={input}
            />
            {preview && (
              <img
                src={preview}
                alt="preview"
                style={{
                  width: 80,
                  height: 80,
                  objectFit: "cover",
                  borderRadius: 8,
                  marginTop: 8,
                }}
              />
            )}
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
              />
            </Field>
            <Field label="Production Cost (₱)">
              <input
                type="number"
                step="0.01"
                value={form.production_cost}
                onChange={(e) => set("production_cost", e.target.value)}
                style={input}
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
              />
            </Field>
            <Field label="Reorder Point">
              <input
                type="number"
                value={form.reorder_point}
                onChange={(e) => set("reorder_point", e.target.value)}
                style={input}
              />
            </Field>
          </Row>
        </Section>

        <Section title="Product Variations (Wood Type / Design / Finish)">
          {variations.map((v, i) => (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr auto",
                gap: 8,
                marginBottom: 8,
                alignItems: "end",
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
                />
              </Field>
              <Field label="Selling Price">
                <input
                  type="number"
                  value={v.selling_price}
                  onChange={(e) => setVar(i, "selling_price", e.target.value)}
                  style={input}
                />
              </Field>
              <button type="button" onClick={() => removeVar(i)} style={btnDel}>
                ✕
              </button>
            </div>
          ))}
          <button type="button" onClick={addVariation} style={btnOutline}>
            + Add Variation
          </button>
        </Section>

        <Section title="Bill of Materials (Linked Raw Materials)">
          {bom.map((row, i) => (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1fr auto",
                gap: 8,
                marginBottom: 8,
                alignItems: "end",
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
              <Field label="Quantity">
                <input
                  type="number"
                  step="0.01"
                  value={row.quantity}
                  onChange={(e) => setBomRow(i, "quantity", e.target.value)}
                  style={input}
                />
              </Field>
              <button type="button" onClick={() => removeBom(i)} style={btnDel}>
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
            marginTop: 24,
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
      borderRadius: 12,
      padding: 24,
      marginBottom: 16,
      boxShadow: "0 1px 6px rgba(0,0,0,.08)",
    }}
  >
    <h3
      style={{
        fontSize: 15,
        fontWeight: 600,
        color: "#1e2a38",
        marginTop: 0,
        marginBottom: 16,
        borderBottom: "1px solid #f1f5f9",
        paddingBottom: 10,
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
      marginBottom: 8,
    }}
  >
    {children}
  </div>
);
const Field = ({ label, children }) => (
  <div>
    <label
      style={{
        fontSize: 12,
        fontWeight: 600,
        color: "#374151",
        display: "block",
        marginBottom: 4,
      }}
    >
      {label}
    </label>
    {children}
  </div>
);
const input = {
  width: "100%",
  padding: "8px 12px",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  fontSize: 13,
  boxSizing: "border-box",
};
const btnPrimary = {
  padding: "10px 24px",
  background: "#1e40af",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 14,
  fontWeight: 600,
};
const btnGhost = {
  padding: "10px 24px",
  background: "#f1f5f9",
  color: "#374151",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 14,
};
const btnOutline = {
  padding: "7px 16px",
  background: "#fff",
  border: "1px dashed #94a3b8",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 12,
  color: "#64748b",
};
const btnDel = {
  padding: "8px 12px",
  background: "#fee2e2",
  color: "#dc2626",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  alignSelf: "flex-end",
};
const btnBack = {
  padding: "6px 14px",
  background: "#f1f5f9",
  color: "#374151",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 13,
};
