import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api, { buildAssetUrl } from "../../services/api";
import toast from "react-hot-toast";

const STOCK_BADGE = {
  in_stock: { bg: "#d1fae5", color: "#065f46" },
  low_stock: { bg: "#fef9c3", color: "#854d0e" },
  out_of_stock: { bg: "#fee2e2", color: "#991b1b" },
};

export default function ProductsPage() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  // 👉 NEW: State to track selected products for bulk publishing
  const [selectedIds, setSelectedIds] = useState([]);

  const [filters, setFilters] = useState({
    search: "",
    type: "",
    status: "",
    page: 1,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/products", {
        params: { ...filters, limit: 20 },
      });
      setProducts(data.products);
      setTotal(data.total);
      setSelectedIds([]); // Clear selection when page changes
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleFeatured = async (id) => {
    try {
      const { data } = await api.patch(`/products/${id}/featured`);
      toast.success(
        data.is_featured ? "Marked as featured." : "Removed from featured.",
      );
      load();
    } catch {}
  };

  // 👉 NEW: Bulk Publish Function
  const handleBulkPublish = async (is_published) => {
    if (selectedIds.length === 0) {
      return toast.error("Please select at least one product first.");
    }

    try {
      // We will create this backend route next!
      await api.patch("/products/bulk-publish", {
        ids: selectedIds,
        is_published,
      });
      toast.success(`Product Published successfully!`);
      load();
    } catch (err) {
      toast.error("Failed to publish product.");
    }
  };

  const deleteProduct = async (id, name) => {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/products/${id}`);
      toast.success("Product deleted.");
      load();
    } catch {}
  };

  // Handle Select All Checkbox
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(products.map((p) => p.id));
    } else {
      setSelectedIds([]);
    }
  };

  // Handle Individual Checkbox
  const handleSelectOne = (id, checked) => {
    if (checked) {
      setSelectedIds((prev) => [...prev, id]);
    } else {
      setSelectedIds((prev) => prev.filter((selectedId) => selectedId !== id));
    }
  };

  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <h1 style={pageTitle}>Product Management</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() =>
              api
                .get("/products/report")
                .then((r) => console.log("Report:", r.data))
            }
            style={btnGhost}
          >
            📄 Export Report
          </button>
          <button
            onClick={() => navigate("/admin/products/new")}
            style={btnPrimary}
          >
            + Add Product
          </button>
        </div>
      </div>

      {/* 👉 NEW: Filters & Bulk Actions Row */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            placeholder="Search name or barcode..."
            value={filters.search}
            onChange={(e) =>
              setFilters((f) => ({ ...f, search: e.target.value, page: 1 }))
            }
            style={inputSm}
          />
          <select
            value={filters.type}
            onChange={(e) =>
              setFilters((f) => ({ ...f, type: e.target.value, page: 1 }))
            }
            style={inputSm}
          >
            <option value="">All Types</option>
            <option value="standard">Standard Prefab</option>
            <option value="blueprint">Blueprint</option>
          </select>
          <select
            value={filters.status}
            onChange={(e) =>
              setFilters((f) => ({ ...f, status: e.target.value, page: 1 }))
            }
            style={inputSm}
          >
            <option value="">All Stock Status</option>
            <option value="in_stock">In Stock</option>
            <option value="low_stock">Low Stock</option>
            <option value="out_of_stock">Out of Stock</option>
          </select>
        </div>

        {/* The Publish Buttons */}
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "#64748b", fontWeight: 600 }}>
            {selectedIds.length} Selected
          </span>
          <button
            onClick={() => handleBulkPublish(true)}
            style={btnPublishLive}
          >
            Publish Product
          </button>
          <button
            onClick={() => handleBulkPublish(false)}
            style={btnPublishDraft}
          >
            Unpublish Product
          </button>
        </div>
      </div>

      {/* Table */}
      <div
        style={{
          background: "#fff",
          borderRadius: 12,
          boxShadow: "0 1px 6px rgba(0,0,0,.08)",
          overflow: "hidden",
        }}
      >
        <table
          style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
        >
          <thead>
            <tr
              style={{
                background: "#f8fafc",
                borderBottom: "1px solid #e2e8f0",
              }}
            >
              <th style={{ ...th, width: 40, textAlign: "center" }}>
                <input
                  type="checkbox"
                  checked={
                    products.length > 0 &&
                    selectedIds.length === products.length
                  }
                  onChange={handleSelectAll}
                  style={{ cursor: "pointer" }}
                />
              </th>
              {[
                "Image",
                "Barcode",
                "Name",
                "Category", // 👉 NEW Column
                "Type",
                "Online Price",
                "Walk-in",
                "Stock",
                "Status",
                "Published",
                "Featured",
                "Actions",
              ].map((h) => (
                <th key={h} style={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={13} // Increased for checkboxes & category
                  style={{ textAlign: "center", padding: 40, color: "#64748b" }}
                >
                  Loading...
                </td>
              </tr>
            ) : products.length === 0 ? (
              <tr>
                <td
                  colSpan={13}
                  style={{ textAlign: "center", padding: 40, color: "#94a3b8" }}
                >
                  No products found.
                </td>
              </tr>
            ) : (
              products.map((p) => {
                const sb = STOCK_BADGE[p.stock_status] || {};
                return (
                  <tr
                    key={p.id}
                    style={{
                      borderBottom: "1px solid #f1f5f9",
                      background: selectedIds.includes(p.id)
                        ? "#f8fafc"
                        : "white",
                    }}
                  >
                    <td style={{ ...td, textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(p.id)}
                        onChange={(e) =>
                          handleSelectOne(p.id, e.target.checked)
                        }
                        style={{ cursor: "pointer" }}
                      />
                    </td>
                    <td style={td}>
                      {p.image_url ? (
                        <img
                          src={buildAssetUrl(p.image_url)}
                          alt={p.name}
                          style={{
                            width: 40,
                            height: 40,
                            objectFit: "cover",
                            borderRadius: 6,
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 40,
                            height: 40,
                            background: "#f1f5f9",
                            borderRadius: 6,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 18,
                          }}
                        >
                          📦
                        </div>
                      )}
                    </td>
                    <td style={td}>{p.barcode || "—"}</td>
                    <td style={{ ...td, fontWeight: 500, maxWidth: 180 }}>
                      {p.name}
                    </td>

                    {/* 👉 NEW: Category Cell */}
                    <td style={td}>
                      {p.category_name || p.category_id || "—"}
                    </td>

                    <td style={td}>
                      <span
                        style={{
                          background:
                            p.type === "standard" ? "#e0f2fe" : "#f3e8ff",
                          color: p.type === "standard" ? "#075985" : "#6b21a8",
                          padding: "2px 8px",
                          borderRadius: 12,
                          fontSize: 11,
                        }}
                      >
                        {p.type}
                      </span>
                    </td>
                    <td style={td}>
                      ₱ {Number(p.online_price).toLocaleString()}
                    </td>
                    <td style={td}>
                      ₱ {Number(p.walkin_price).toLocaleString()}
                    </td>
                    <td style={td}>{p.stock}</td>
                    <td style={td}>
                      <span
                        style={{
                          background: sb.bg,
                          color: sb.color,
                          padding: "2px 10px",
                          borderRadius: 12,
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        {p.stock_status?.replace("_", " ")}
                      </span>
                    </td>

                    {/* Published Status Badge */}
                    <td style={td}>
                      <span
                        style={{
                          background: p.is_published ? "#d1fae5" : "#fee2e2",
                          color: p.is_published ? "#065f46" : "#991b1b",
                          padding: "4px 8px",
                          borderRadius: 12,
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        {p.is_published ? "Live" : "Draft"}
                      </span>
                    </td>

                    <td style={{ ...td, textAlign: "center" }}>
                      <button
                        onClick={() => toggleFeatured(p.id)}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          fontSize: 18,
                        }}
                        title={
                          p.is_featured
                            ? "Remove from featured"
                            : "Mark as featured"
                        }
                      >
                        {p.is_featured ? "⭐" : "☆"}
                      </button>
                    </td>
                    <td style={td}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          onClick={() =>
                            navigate(`/admin/products/${p.id}/edit`)
                          }
                          style={btnEdit}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteProduct(p.id, p.name)}
                          style={btnDel}
                        >
                          Del
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {total > 20 && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              gap: 8,
              padding: 16,
            }}
          >
            <button
              disabled={filters.page <= 1}
              onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
              style={btnGhost}
            >
              ← Prev
            </button>
            <span
              style={{ padding: "6px 12px", fontSize: 13, color: "#64748b" }}
            >
              Page {filters.page} of {Math.ceil(total / 20)} ({total} total)
            </span>
            <button
              disabled={filters.page >= Math.ceil(total / 20)}
              onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
              style={btnGhost}
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const pageTitle = {
  fontSize: 22,
  fontWeight: 700,
  color: "#1e2a38",
  margin: 0,
};
const th = {
  textAlign: "left",
  padding: "12px 14px",
  fontSize: 11,
  fontWeight: 600,
  color: "#64748b",
  textTransform: "uppercase",
};
const td = { padding: "12px 14px", color: "#374151", verticalAlign: "middle" };
const inputSm = {
  padding: "7px 12px",
  border: "1px solid #d1d5db",
  borderRadius: 6,
  fontSize: 13,
  minWidth: 160,
};
const btnPrimary = {
  padding: "8px 18px",
  background: "#1e40af",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
};
const btnPublishLive = {
  padding: "7px 14px",
  background: "#10b981",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
};
const btnPublishDraft = {
  padding: "7px 14px",
  background: "#ef4444",
  color: "#fff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
};
const btnGhost = {
  padding: "7px 14px",
  background: "#f1f5f9",
  color: "#374151",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 12,
};
const btnEdit = {
  padding: "4px 12px",
  background: "#e0f2fe",
  color: "#0369a1",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 12,
};
const btnDel = {
  padding: "4px 12px",
  background: "#fee2e2",
  color: "#dc2626",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 12,
};
