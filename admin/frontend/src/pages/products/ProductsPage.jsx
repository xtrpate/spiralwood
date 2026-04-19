import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api, { buildAssetUrl } from "../../services/api";
import toast from "react-hot-toast";

const STOCK_BADGE = {
  in_stock: { bg: "#f4f4f5", color: "#18181b", border: "#e4e4e7" },
  low_stock: { bg: "#ffffff", color: "#52525b", border: "#d4d4d8" },
  out_of_stock: { bg: "#fef2f2", color: "#991b1b", border: "#fecaca" },
};

export default function ProductsPage() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

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

  const handleBulkPublish = async (is_published) => {
    if (selectedIds.length === 0) {
      return toast.error("Please select at least one product first.");
    }

    try {
      await api.patch("/products/bulk-publish", {
        ids: selectedIds,
        is_published,
      });

      toast.success(
        is_published
          ? "Product published successfully."
          : "Product unpublished successfully.",
      );

      load();
    } catch (err) {
      toast.error("Failed to update product status.");
    }
  };

  const deleteProduct = async (id, name) => {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/products/${id}`);
      toast.success("Product deleted.");
      load();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to delete product.");
    }
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(products.map((p) => p.id));
    } else {
      setSelectedIds([]);
    }
  };

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
        <div style={{ display: "flex", gap: 10 }}>
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

      {/* Filters & Bulk Actions Row */}
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
          <span style={{ fontSize: 13, color: "#71717a", fontWeight: 600 }}>
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
          borderRadius: 16,
          border: "1px solid #e4e4e7",
          boxShadow: "0 1px 2px rgba(0,0,0,.02)",
          overflow: "hidden",
        }}
      >
        <table
          style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
        >
          <thead>
            <tr
              style={{
                background: "#fafafa",
                borderBottom: "1px solid #e4e4e7",
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
                "Category",
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
                  colSpan={13}
                  style={{
                    textAlign: "center",
                    padding: 40,
                    color: "#71717a",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  Loading...
                </td>
              </tr>
            ) : products.length === 0 ? (
              <tr>
                <td
                  colSpan={13}
                  style={{
                    textAlign: "center",
                    padding: 40,
                    color: "#71717a",
                    fontSize: 13,
                    fontWeight: 600,
                  }}
                >
                  No products found.
                </td>
              </tr>
            ) : (
              products.map((p) => {
                const sb = STOCK_BADGE[p.stock_status] || {
                  bg: "#f4f4f5",
                  color: "#18181b",
                  border: "#e4e4e7",
                };
                return (
                  <tr
                    key={p.id}
                    style={{
                      borderBottom: "1px solid #f4f4f5",
                      background: selectedIds.includes(p.id)
                        ? "#fafafa"
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
                            borderRadius: 8,
                            border: "1px solid #e4e4e7",
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 40,
                            height: 40,
                            background: "#f4f4f5",
                            borderRadius: 8,
                            border: "1px solid #e4e4e7",
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
                    <td style={{ ...td, color: "#71717a", fontSize: 12 }}>
                      {p.barcode || "—"}
                    </td>
                    <td
                      style={{
                        ...td,
                        fontWeight: 700,
                        maxWidth: 180,
                        color: "#0a0a0a",
                      }}
                    >
                      {p.name}
                    </td>

                    <td style={{ ...td, color: "#52525b" }}>
                      {p.category_name || p.category_id || "—"}
                    </td>

                    <td style={td}>
                      <span
                        style={{
                          background:
                            p.type === "blueprint" ? "#18181b" : "#f4f4f5",
                          color: p.type === "blueprint" ? "#ffffff" : "#18181b",
                          border: `1px solid ${p.type === "blueprint" ? "#18181b" : "#e4e4e7"}`,
                          padding: "2px 10px",
                          borderRadius: 12,
                          fontSize: 11,
                          fontWeight: 600,
                          textTransform: "capitalize",
                        }}
                      >
                        {p.type}
                      </span>
                    </td>
                    <td style={td}>
                      ₱ {Number(p.online_price).toLocaleString()}
                    </td>
                    <td style={{ ...td, color: "#71717a" }}>
                      ₱ {Number(p.walkin_price).toLocaleString()}
                    </td>
                    <td style={{ ...td, fontWeight: 600 }}>{p.stock}</td>
                    <td style={td}>
                      <span
                        style={{
                          background: sb.bg,
                          color: sb.color,
                          border: `1px solid ${sb.border}`,
                          padding: "2px 10px",
                          borderRadius: 12,
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        {p.stock_status?.replace("_", " ")}
                      </span>
                    </td>

                    <td style={td}>
                      <span
                        style={{
                          background: p.is_published ? "#f4f4f5" : "#fef2f2",
                          color: p.is_published ? "#18181b" : "#991b1b",
                          border: `1px solid ${p.is_published ? "#e4e4e7" : "#fecaca"}`,
                          padding: "2px 10px",
                          borderRadius: 12,
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        {p.is_published ? "Published" : "Draft"}
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
                          opacity: p.is_featured ? 1 : 0.4,
                        }}
                        title={
                          p.is_featured
                            ? "Remove from featured"
                            : "Mark as featured"
                        }
                      >
                        ⭐
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
              alignItems: "center",
              gap: 12,
              padding: "16px 20px",
              background: "#fafafa",
            }}
          >
            <button
              disabled={filters.page <= 1}
              onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}
              style={{ ...btnGhost, opacity: filters.page <= 1 ? 0.5 : 1 }}
            >
              ← Prev
            </button>
            <span style={{ fontSize: 13, color: "#71717a", fontWeight: 600 }}>
              Page {filters.page} of {Math.ceil(total / 20)} ({total} total)
            </span>
            <button
              disabled={filters.page >= Math.ceil(total / 20)}
              onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}
              style={{
                ...btnGhost,
                opacity: filters.page >= Math.ceil(total / 20) ? 0.5 : 1,
              }}
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
  fontSize: 24,
  fontWeight: 800,
  color: "#0a0a0a",
  margin: 0,
  letterSpacing: "-0.02em",
};
const th = {
  textAlign: "left",
  padding: "14px 16px",
  fontSize: 10,
  fontWeight: 800,
  color: "#71717a",
  textTransform: "uppercase",
  letterSpacing: "1px",
};
const td = { padding: "12px 16px", color: "#18181b", verticalAlign: "middle" };
const inputSm = {
  padding: "8px 12px",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  fontSize: 13,
  minWidth: 160,
  outline: "none",
  color: "#18181b",
};
const btnPrimary = {
  padding: "9px 18px",
  background: "#18181b",
  color: "#fff",
  border: "1px solid #18181b",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 700,
  transition: "background 0.2s",
};
const btnPublishLive = {
  padding: "9px 16px",
  background: "#18181b",
  color: "#fff",
  border: "1px solid #18181b",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 700,
  transition: "background 0.2s",
};
const btnPublishDraft = {
  padding: "9px 16px",
  background: "#ffffff",
  color: "#18181b",
  border: "1px solid #d4d4d8",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 700,
  transition: "background 0.2s",
};
const btnGhost = {
  padding: "9px 16px",
  background: "#f4f4f5",
  color: "#18181b",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 700,
  transition: "background 0.2s",
};
const btnEdit = {
  padding: "6px 14px",
  background: "#f4f4f5",
  color: "#18181b",
  border: "1px solid #e4e4e7",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 700,
  transition: "background 0.2s",
};
const btnDel = {
  padding: "6px 14px",
  background: "#fef2f2",
  color: "#991b1b",
  border: "1px solid #fecaca",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 700,
  transition: "background 0.2s",
};
