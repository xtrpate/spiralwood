import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { buildAssetUrl } from "../../services/api";
import toast from "react-hot-toast";
import { Package2, CheckCircle2, CircleX, Globe2, EyeOff } from "lucide-react";
import CustomerBlueprintViewer from "../customer/CustomerBlueprintViewer";

// WISDOM PRODUCT MANAGEMENT PROFESSIONAL UI V2
// WISDOM UNIFIED PRODUCT PRICE V1
// WISDOM BLUEPRINT CATALOG FINAL POLISH V1
// WISDOM PRODUCT COST LABEL AND SUMMARY NUMBER FIX V1
// WISDOM BLUEPRINT PREVIEW PRICE SUMMARY FIX V1
const MAX_HOMEPAGE_NEW_PRODUCTS = 4;
const NEW_PRODUCT_LIMIT_MESSAGE =
  "You can show up to 4 new products on the homepage. Unmark one product first.";
const STOCK_BADGE = {
  in_stock: {
    background: "#f0fdf4",
    color: "#166534",
    border: "#bbf7d0",
    label: "In stock",
  },
  low_stock: {
    background: "#fff7ed",
    color: "#9a3412",
    border: "#fed7aa",
    label: "Low stock",
  },
  out_of_stock: {
    background: "#fef2f2",
    color: "#991b1b",
    border: "#fecaca",
    label: "Out of stock",
  },
};

const formatPeso = (value) =>
  `₱ ${Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const buildProductBlueprintPreview = (product = {}) => {
  if (!product?.blueprint_id) return null;

  const hasScene =
    Boolean(product?.blueprint_design_data) ||
    Boolean(product?.blueprint_view_3d_data);

  if (!hasScene && !product?.blueprint_thumbnail_url) return null;

  return {
    id: product.blueprint_id,
    title: product.blueprint_title || product.name || "Blueprint",
    thumbnail_url: product.blueprint_thumbnail_url || null,
    design_data: product.blueprint_design_data || null,
    view_3d_data: product.blueprint_view_3d_data || null,
  };
};

function ProductThumbnail({ product }) {
  const isBlueprint = product?.type === "blueprint";
  const [blueprint, setBlueprint] = useState(() =>
    isBlueprint ? buildProductBlueprintPreview(product) : null,
  );
  const [loadingBlueprint, setLoadingBlueprint] = useState(
    Boolean(isBlueprint && product?.blueprint_id && !blueprint),
  );

  useEffect(() => {
    if (!isBlueprint) {
      setBlueprint(null);
      setLoadingBlueprint(false);
      return undefined;
    }

    const inlineBlueprint = buildProductBlueprintPreview(product);
    if (inlineBlueprint) {
      setBlueprint(inlineBlueprint);
      setLoadingBlueprint(false);
      return undefined;
    }

    if (!product?.blueprint_id) {
      setBlueprint(null);
      setLoadingBlueprint(false);
      return undefined;
    }

    let active = true;
    setLoadingBlueprint(true);

    api
      .get(`/blueprints/${product.blueprint_id}`)
      .then(({ data }) => {
        if (!active || !data) return;

        setBlueprint({
          id: data.id || product.blueprint_id,
          title: data.title || product.name || "Blueprint",
          thumbnail_url: data.thumbnail_url || null,
          design_data: data.design_data || null,
          view_3d_data: data.view_3d_data || null,
        });
      })
      .catch(() => {
        if (active) setBlueprint(null);
      })
      .finally(() => {
        if (active) setLoadingBlueprint(false);
      });

    return () => {
      active = false;
    };
  }, [
    isBlueprint,
    product?.blueprint_id,
    product?.blueprint_title,
    product?.blueprint_thumbnail_url,
    product?.blueprint_design_data,
    product?.blueprint_view_3d_data,
    product?.name,
  ]);

  if (blueprint) {
    return (
      <div style={blueprintImage}>
        <CustomerBlueprintViewer
          blueprint={blueprint}
          readOnly
          showHumanControls={false}
          compact
          compactHeight={46}
          defaultPreset="isometric"
          defaultShowHuman={false}
        />
      </div>
    );
  }

  if (isBlueprint && loadingBlueprint) {
    return (
      <div style={blueprintImage} aria-label="Loading blueprint preview">
        <div style={blueprintPreviewLoading}>•••</div>
      </div>
    );
  }

  if (product?.image_url) {
    return (
      <img src={buildAssetUrl(product.image_url)} alt="" style={productImage} />
    );
  }

  return <div style={imagePlaceholder}>—</div>;
}

export default function ProductsPage() {
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [allProducts, setAllProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState([]);
  const [actionMenuId, setActionMenuId] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [filters, setFilters] = useState({
    search: "",
    category_id: "",
    type: "",
    status: "",
    is_active: "1",
    page: 1,
  });

  const buildListParams = useCallback(() => {
    const params = {
      search: filters.search || undefined,
      category_id: filters.category_id || undefined,
      type: filters.type || undefined,
      status: filters.status || undefined,
      page: filters.page,
      limit: 20,
    };

    if (filters.is_active !== "") {
      params.is_active = filters.is_active;
    }

    return params;
  }, [filters]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/products", {
        params: buildListParams(),
      });
      setProducts(data.products || []);
      setTotal(Number(data.total || 0));
      setSelectedIds([]);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to load products.");
    } finally {
      setLoading(false);
    }
  }, [buildListParams]);

  const loadSummary = useCallback(async () => {
    try {
      const [activeResponse, disabledResponse] = await Promise.all([
        api.get("/products", {
          params: { is_active: 1, page: 1, limit: 5000 },
        }),
        api.get("/products", {
          params: { is_active: 0, page: 1, limit: 5000 },
        }),
      ]);

      setAllProducts([
        ...(activeResponse.data?.products || []),
        ...(disabledResponse.data?.products || []),
      ]);
    } catch {
      // Keep the list usable even if the secondary summary request fails.
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    if (actionMenuId == null) return undefined;

    const closeMenu = () => setActionMenuId(null);
    const handleKeyDown = (event) => {
      if (event.key === "Escape") closeMenu();
    };

    document.addEventListener("click", closeMenu);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("click", closeMenu);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [actionMenuId]);

  const categories = useMemo(() => {
    const map = new Map();

    allProducts.forEach((product) => {
      const id = product.category_id;
      const name = product.category_name;
      if (id && name) map.set(String(id), name);
    });

    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allProducts]);

  const summary = useMemo(() => {
    const readyMade = allProducts.filter(
      (product) => product.type !== "blueprint",
    );

    return {
      total: allProducts.length,
      inStock: readyMade.filter(
        (product) => product.stock_status === "in_stock",
      ).length,
      outOfStock: readyMade.filter(
        (product) => product.stock_status === "out_of_stock",
      ).length,
      published: allProducts.filter(
        (product) => Number(product.is_published) === 1,
      ).length,
      unpublished: allProducts.filter(
        (product) => Number(product.is_published) !== 1,
      ).length,
    };
  }, [allProducts]);

  const newProductsCount = useMemo(
    () =>
      allProducts.filter(
        (product) =>
          product.type === "standard" && Number(product.is_featured) === 1,
      ).length,
    [allProducts],
  );

  const toggleFeatured = async (id) => {
    const targetProduct =
      allProducts.find((product) => Number(product.id) === Number(id)) ||
      products.find((product) => Number(product.id) === Number(id));

    if (!targetProduct) {
      toast.error("Product not found.");
      return;
    }

    if (targetProduct.type === "blueprint") {
      toast.error(
        "Only ready-made products can be shown as new products on the homepage.",
      );
      return;
    }

    const isCurrentlyFeatured = Number(targetProduct.is_featured || 0) === 1;

    if (!isCurrentlyFeatured && newProductsCount >= MAX_HOMEPAGE_NEW_PRODUCTS) {
      toast.error(NEW_PRODUCT_LIMIT_MESSAGE);
      return;
    }

    try {
      const { data } = await api.patch(`/products/${id}/featured`);
      toast.success(
        data.is_featured
          ? "Added to homepage New Products."
          : "Removed from homepage New Products.",
      );
      await Promise.all([load(), loadSummary()]);
    } catch (err) {
      toast.error(
        err?.response?.data?.message || "Failed to update new product status.",
      );
    }
  };

  const toggleActive = async (id, currentStatus) => {
    try {
      const { data } = await api.patch(`/products/${id}/active`, {
        is_active: !currentStatus,
      });
      toast.success(data.message || "Product status updated.");
      await Promise.all([load(), loadSummary()]);
    } catch {
      toast.error("Failed to update product status.");
    }
  };

  const handleBulkPublish = async (isPublished) => {
    if (selectedIds.length === 0) {
      return toast.error("Select at least one product first.");
    }

    try {
      await api.patch("/products/bulk-publish", {
        ids: selectedIds,
        is_published: isPublished,
      });

      toast.success(
        isPublished
          ? "Selected products published."
          : "Selected products unpublished.",
      );

      await Promise.all([load(), loadSummary()]);
    } catch {
      toast.error("Failed to update publishing status.");
    }
  };

  const updateSinglePublish = async (product, isPublished) => {
    if (!product?.id) return;

    try {
      await api.patch("/products/bulk-publish", {
        ids: [product.id],
        is_published: isPublished,
      });
      toast.success(
        isPublished ? "Product published." : "Product unpublished.",
      );
      await Promise.all([load(), loadSummary()]);
    } catch {
      toast.error("Failed to update publishing status.");
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete?.id) return;

    setDeleting(true);
    try {
      await api.delete(`/products/${pendingDelete.id}`);
      toast.success("Product deleted.");
      setPendingDelete(null);
      await Promise.all([load(), loadSummary()]);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to delete product.");
    } finally {
      setDeleting(false);
    }
  };

  const handleSelectAll = (event) => {
    setSelectedIds(
      event.target.checked ? products.map((product) => product.id) : [],
    );
  };

  const handleSelectOne = (id, checked) => {
    setSelectedIds((current) =>
      checked
        ? [...current, id]
        : current.filter((selectedId) => selectedId !== id),
    );
  };

  const updateFilter = (key, value) => {
    setFilters((current) => ({
      ...current,
      [key]: value,
      page: 1,
    }));
  };

  const pageCount = Math.max(1, Math.ceil(total / 20));

  return (
    <div style={page}>
      <div style={pageHeader}>
        <div>
          <h1 style={pageTitle}>Product Management</h1>
          <p style={pageSubtitle}>
            Manage products, pricing, publishing, and product availability.
          </p>
        </div>

        <div style={headerActions}>
          <span
            style={{
              color:
                newProductsCount >= MAX_HOMEPAGE_NEW_PRODUCTS
                  ? "#92400e"
                  : "#52525b",
              fontSize: 11.5,
              fontWeight: 600,
              whiteSpace: "nowrap",
            }}
          >
            New products: {newProductsCount} / {MAX_HOMEPAGE_NEW_PRODUCTS}
          </span>
          <button
            type="button"
            onClick={() =>
              api
                .get("/products/report")
                .then((response) => console.log("Report:", response.data))
            }
            style={btnSecondary}
          >
            Export report
          </button>
          <button
            type="button"
            onClick={() => navigate("/admin/products/new")}
            style={btnPrimary}
          >
            + Add product
          </button>
        </div>
      </div>

      <div style={toolbar}>
        <div style={searchWrap}>
          <span style={searchIcon} aria-hidden="true">
            ⌕
          </span>
          <input
            type="search"
            value={filters.search}
            onChange={(event) => updateFilter("search", event.target.value)}
            placeholder="Search product name or barcode"
            aria-label="Search products"
            style={searchInput}
          />
        </div>

        <select
          value={filters.category_id}
          onChange={(event) => updateFilter("category_id", event.target.value)}
          aria-label="Filter by category"
          style={filterControl}
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>

        <select
          value={filters.type}
          onChange={(event) => updateFilter("type", event.target.value)}
          aria-label="Filter by product type"
          style={filterControl}
        >
          <option value="">All product types</option>
          <option value="standard">Ready-made</option>
          <option value="blueprint">Blueprint</option>
        </select>

        <select
          value={filters.status}
          onChange={(event) => updateFilter("status", event.target.value)}
          aria-label="Filter by stock level"
          style={filterControl}
        >
          <option value="">All stock levels</option>
          <option value="in_stock">In stock</option>
          <option value="low_stock">Low stock</option>
          <option value="out_of_stock">Out of stock</option>
        </select>

        <select
          value={filters.is_active}
          onChange={(event) => updateFilter("is_active", event.target.value)}
          aria-label="Filter by record status"
          style={filterControl}
        >
          <option value="1">Active products</option>
          <option value="0">Disabled products</option>
          <option value="">All products</option>
        </select>

        {selectedIds.length > 0 ? (
          <div style={bulkActions}>
            <span style={selectedCount}>{selectedIds.length} selected</span>
            <button
              type="button"
              onClick={() => handleBulkPublish(true)}
              style={btnPrimarySmall}
            >
              Publish
            </button>
            <button
              type="button"
              onClick={() => handleBulkPublish(false)}
              style={btnSecondarySmall}
            >
              Unpublish
            </button>
          </div>
        ) : (
          <span style={publishHint}>
            Select products to publish or unpublish
          </span>
        )}
      </div>

      <div style={summaryGrid}>
        <SummaryCard
          label="Total products"
          value={summary.total}
          Icon={Package2}
          iconColor="#475569"
        />
        <SummaryCard
          label="In stock"
          value={summary.inStock}
          Icon={CheckCircle2}
          iconColor="#15803d"
        />
        <SummaryCard
          label="Out of stock"
          value={summary.outOfStock}
          Icon={CircleX}
          iconColor="#dc2626"
        />
        <SummaryCard
          label="Published"
          value={summary.published}
          Icon={Globe2}
          iconColor="#2563eb"
        />
        <SummaryCard
          label="Unpublished"
          value={summary.unpublished}
          Icon={EyeOff}
          iconColor="#71717a"
        />
      </div>

      <div style={tableCard}>
        <table style={table}>
          <colgroup>
            <col style={{ width: 38 }} />
            <col style={{ width: 58 }} />
            <col style={{ width: "18%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "13%" }} />
            <col style={{ width: "9%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "10%" }} />
            <col style={{ width: "7%" }} />
            <col style={{ width: "10%" }} />
          </colgroup>

          <thead>
            <tr style={tableHeadRow}>
              <th style={{ ...th, textAlign: "center" }}>
                <input
                  type="checkbox"
                  checked={
                    products.length > 0 &&
                    selectedIds.length === products.length
                  }
                  onChange={handleSelectAll}
                  aria-label="Select all products on this page"
                  style={checkbox}
                />
              </th>
              {[
                "Image",
                "Product",
                "Category",
                "Type",
                "Price",
                "Stock",
                "Status",
                "Published",
                "Featured",
                "Actions",
              ].map((heading) => (
                <th key={heading} style={th}>
                  {heading}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={11} style={emptyCell}>
                  Loading products...
                </td>
              </tr>
            ) : products.length === 0 ? (
              <tr>
                <td colSpan={11} style={emptyCell}>
                  No products found for the selected filters.
                </td>
              </tr>
            ) : (
              products.map((product) => {
                const isBlueprint = product.type === "blueprint";
                const isActive = Number(product.is_active) !== 0;
                const badge =
                  STOCK_BADGE[product.stock_status] || STOCK_BADGE.in_stock;

                return (
                  <tr
                    key={product.id}
                    style={{
                      ...tableRow,
                      opacity: isActive ? 1 : 0.6,
                      background: selectedIds.includes(product.id)
                        ? "#fafafa"
                        : "#ffffff",
                    }}
                  >
                    <td style={{ ...td, textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(product.id)}
                        onChange={(event) =>
                          handleSelectOne(product.id, event.target.checked)
                        }
                        aria-label={`Select ${product.name}`}
                        style={checkbox}
                      />
                    </td>

                    <td style={td}>
                      <ProductThumbnail product={product} />
                    </td>

                    <td style={td}>
                      <div style={productName}>{product.name}</div>
                      <div style={secondaryText}>
                        {product.barcode || "No barcode"}
                        {!isActive ? " · Disabled" : ""}
                      </div>
                    </td>

                    <td style={{ ...td, color: "#52525b" }}>
                      {product.category_name || "—"}
                    </td>

                    <td style={td}>
                      <span
                        style={{
                          ...neutralBadge,
                          ...(isBlueprint
                            ? {
                                background: "#eff6ff",
                                color: "#1d4ed8",
                                borderColor: "#bfdbfe",
                              }
                            : {
                                background: "#f5f3ff",
                                color: "#6d28d9",
                                borderColor: "#ddd6fe",
                              }),
                        }}
                      >
                        {isBlueprint ? "Blueprint" : "Ready-made"}
                      </span>
                    </td>

                    <td style={td}>
                      <div style={primaryValue}>
                        {isBlueprint
                          ? "After estimation"
                          : formatPeso(product.online_price)}
                      </div>
                    </td>

                    <td style={td}>
                      {isBlueprint ? (
                        <span style={madeToOrderBadge}>Made to order</span>
                      ) : (
                        <span style={primaryValue}>
                          {Number(product.stock || 0).toLocaleString("en-PH")}
                        </span>
                      )}
                    </td>

                    <td style={td}>
                      {isBlueprint ? (
                        <span style={blueprintStatusBadge}>
                          Build on request
                        </span>
                      ) : (
                        <span
                          style={{
                            ...statusBadge,
                            background: badge.background,
                            color: badge.color,
                            borderColor: badge.border,
                          }}
                        >
                          {badge.label}
                        </span>
                      )}
                    </td>

                    <td style={td}>
                      <span
                        style={
                          Number(product.is_published) === 1
                            ? publishedBadge
                            : unpublishedBadge
                        }
                      >
                        {Number(product.is_published) === 1
                          ? "Published"
                          : "Unpublished"}
                      </span>
                    </td>

                    <td style={{ ...td, textAlign: "center" }}>
                      {isBlueprint ? (
                        <span
                          title="New Products is only available for ready-made products"
                          aria-label="New Products is not available for blueprint products"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: 28,
                            height: 28,
                            color: "#a1a1aa",
                            fontSize: 14,
                          }}
                        >
                          {"\u2014"}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => toggleFeatured(product.id)}
                          style={featuredButton}
                          title={
                            Number(product.is_featured) === 1
                              ? "Remove from homepage New Products"
                              : "Show as new product on homepage"
                          }
                          aria-label={
                            Number(product.is_featured) === 1
                              ? `Remove ${product.name} from homepage New Products`
                              : `Show ${product.name} as a new product on homepage`
                          }
                        >
                          <span
                            style={{
                              color:
                                Number(product.is_featured) === 1
                                  ? "#c58a00"
                                  : "#a1a1aa",
                            }}
                          >
                            {Number(product.is_featured) === 1
                              ? "\u2605"
                              : "\u2606"}
                          </span>
                        </button>
                      )}
                    </td>

                    <td style={td}>
                      <div style={rowActions}>
                        <button
                          type="button"
                          onClick={() =>
                            navigate(`/admin/products/${product.id}/edit`)
                          }
                          style={btnEdit}
                        >
                          Edit
                        </button>

                        <div
                          style={moreWrap}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <button
                            type="button"
                            style={btnMore}
                            aria-label={`More actions for ${product.name}`}
                            aria-haspopup="menu"
                            aria-expanded={actionMenuId === product.id}
                            onClick={(event) => {
                              event.stopPropagation();
                              setActionMenuId((current) =>
                                current === product.id ? null : product.id,
                              );
                            }}
                          >
                            ⋯
                          </button>

                          {actionMenuId === product.id && (
                            <div role="menu" style={moreMenu}>
                              <button
                                type="button"
                                role="menuitem"
                                style={menuItem}
                                onClick={() => {
                                  setActionMenuId(null);
                                  updateSinglePublish(
                                    product,
                                    Number(product.is_published) !== 1,
                                  );
                                }}
                              >
                                {Number(product.is_published) === 1
                                  ? "Unpublish product"
                                  : "Publish product"}
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                style={menuItem}
                                onClick={() => {
                                  setActionMenuId(null);
                                  toggleActive(product.id, isActive);
                                }}
                              >
                                {isActive
                                  ? "Disable product"
                                  : "Enable product"}
                              </button>
                              <button
                                type="button"
                                role="menuitem"
                                style={{ ...menuItem, color: "#b42318" }}
                                onClick={() => {
                                  setActionMenuId(null);
                                  setPendingDelete(product);
                                }}
                              >
                                Delete product
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        <div style={tableFooter}>
          <span style={tableFooterText}>
            Showing {products.length} of {total.toLocaleString("en-PH")} product
            {total === 1 ? "" : "s"}
          </span>

          {pageCount > 1 && (
            <div style={pagination}>
              <button
                type="button"
                disabled={filters.page <= 1}
                onClick={() =>
                  setFilters((current) => ({
                    ...current,
                    page: current.page - 1,
                  }))
                }
                style={{
                  ...pageButton,
                  opacity: filters.page <= 1 ? 0.4 : 1,
                  cursor: filters.page <= 1 ? "not-allowed" : "pointer",
                }}
              >
                Previous
              </button>

              <span style={pageText}>
                Page {filters.page} of {pageCount}
              </span>

              <button
                type="button"
                disabled={filters.page >= pageCount}
                onClick={() =>
                  setFilters((current) => ({
                    ...current,
                    page: current.page + 1,
                  }))
                }
                style={{
                  ...pageButton,
                  opacity: filters.page >= pageCount ? 0.4 : 1,
                  cursor: filters.page >= pageCount ? "not-allowed" : "pointer",
                }}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>

      {pendingDelete && (
        <div style={modalBackdrop}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-product-title"
            style={dialog}
          >
            <div style={dialogEyebrow}>Permanent action</div>
            <h2 id="delete-product-title" style={dialogTitle}>
              Delete product?
            </h2>
            <p style={dialogText}>
              Permanently delete “{pendingDelete.name}”? This action cannot be
              undone.
            </p>

            <div style={dialogActions}>
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                style={btnSecondary}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                style={btnDanger}
                disabled={deleting}
              >
                {deleting ? "Deleting..." : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, Icon, iconColor }) {
  return (
    <div style={summaryCard}>
      <div>
        <div style={summaryLabel}>{label}</div>
        <div style={summaryValue}>
          {Number(value || 0).toLocaleString("en-PH")}
        </div>
      </div>
      {Icon ? (
        <Icon
          size={19}
          strokeWidth={1.65}
          aria-hidden="true"
          style={{
            color: iconColor || "#71717a",
            position: "absolute",
            top: 13,
            right: 14,
          }}
        />
      ) : null}
    </div>
  );
}

const page = { width: "100%", fontFamily: "inherit" };

const pageHeader = {
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 18,
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
  margin: "6px 0 0",
  color: "#71717a",
  fontSize: 13,
  fontWeight: 400,
  lineHeight: 1.45,
};

const headerActions = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
};

const toolbar = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  flexWrap: "wrap",
  marginBottom: 12,
};

const searchWrap = {
  position: "relative",
  width: 300,
  flex: "0 0 300px",
};

const searchIcon = {
  position: "absolute",
  left: 11,
  top: "50%",
  transform: "translateY(-50%)",
  color: "#71717a",
  fontSize: 14,
  pointerEvents: "none",
};

const searchInput = {
  width: "100%",
  height: 36,
  padding: "0 11px 0 31px",
  background: "#ffffff",
  color: "#27272a",
  border: "1px solid #d4d4d8",
  borderRadius: 2,
  fontFamily: "inherit",
  fontSize: 12,
  fontWeight: 400,
  outline: "none",
  boxSizing: "border-box",
};

const filterControl = {
  height: 36,
  minWidth: 142,
  padding: "0 10px",
  background: "#ffffff",
  color: "#27272a",
  border: "1px solid #d4d4d8",
  borderRadius: 2,
  fontFamily: "inherit",
  fontSize: 12,
  fontWeight: 400,
  outline: "none",
};

const bulkActions = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  marginLeft: "auto",
};

const selectedCount = {
  marginRight: 2,
  color: "#71717a",
  fontSize: 11.5,
  fontWeight: 500,
  whiteSpace: "nowrap",
};

const publishHint = {
  marginLeft: "auto",
  color: "#71717a",
  fontSize: 11.5,
  fontWeight: 400,
  whiteSpace: "nowrap",
};

const summaryGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
  gap: 10,
  marginBottom: 12,
};

const summaryCard = {
  minHeight: 74,
  padding: "13px 14px",
  background: "#ffffff",
  border: "1px solid #d9dce1",
  borderRadius: 2,
  boxShadow: "none",
  boxSizing: "border-box",
  position: "relative",
};

const summaryLabel = {
  color: "#666b73",
  fontSize: 9.5,
  fontWeight: 500,
  lineHeight: 1.3,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
};

const summaryValue = {
  marginTop: 7,
  color: "#18181b",
  fontSize: 22,
  fontWeight: 600,
  lineHeight: 1,
};

const tableCard = {
  position: "relative",
  background: "#ffffff",
  border: "1px solid #d9dce1",
  borderRadius: 2,
  overflow: "visible",
};

const table = {
  width: "100%",
  borderCollapse: "collapse",
  tableLayout: "fixed",
  fontFamily: "inherit",
};

const tableHeadRow = {
  background: "#fafafa",
  borderBottom: "1px solid #dedfe2",
};

const th = {
  padding: "10px 8px",
  color: "#71717a",
  fontSize: 9.5,
  fontWeight: 600,
  lineHeight: 1.25,
  letterSpacing: "0.08em",
  textAlign: "left",
  textTransform: "uppercase",
  verticalAlign: "middle",
  whiteSpace: "normal",
};

const td = {
  padding: "10px 8px",
  color: "#3f3f46",
  fontSize: 12,
  fontWeight: 400,
  lineHeight: 1.3,
  verticalAlign: "middle",
  overflowWrap: "anywhere",
};

const tableRow = {
  borderBottom: "1px solid #eeeeef",
};

const checkbox = {
  width: 14,
  height: 14,
  accentColor: "#18181b",
  cursor: "pointer",
};

const blueprintImage = {
  width: 46,
  height: 46,
  overflow: "hidden",
  background: "#f7f5f2",
  border: "1px solid #e4e4e7",
  borderRadius: 2,
  boxSizing: "border-box",
};

const blueprintPreviewLoading = {
  width: "100%",
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  color: "#a1a1aa",
  fontSize: 10,
  letterSpacing: 1,
};

const madeToOrderBadge = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 22,
  padding: "2px 7px",
  background: "#fffbeb",
  color: "#92400e",
  border: "1px solid #fde68a",
  borderRadius: 2,
  fontSize: 10.5,
  fontWeight: 500,
  whiteSpace: "nowrap",
};

const blueprintStatusBadge = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 22,
  padding: "2px 7px",
  background: "#eef2ff",
  color: "#4338ca",
  border: "1px solid #c7d2fe",
  borderRadius: 2,
  fontSize: 10.5,
  fontWeight: 500,
  whiteSpace: "nowrap",
};

const publishedBadge = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 22,
  padding: "2px 7px",
  background: "#f0fdf4",
  color: "#166534",
  border: "1px solid #bbf7d0",
  borderRadius: 2,
  fontSize: 10.5,
  fontWeight: 500,
  whiteSpace: "nowrap",
};

const unpublishedBadge = {
  ...publishedBadge,
  background: "#fafafa",
  color: "#71717a",
  border: "1px solid #e4e4e7",
};

const productImage = {
  width: 40,
  height: 40,
  display: "block",
  objectFit: "cover",
  background: "#fafafa",
  border: "1px solid #dedfe2",
  borderRadius: 2,
};

const imagePlaceholder = {
  width: 40,
  height: 40,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#fafafa",
  color: "#a1a1aa",
  border: "1px solid #dedfe2",
  borderRadius: 2,
};

const productName = {
  color: "#18181b",
  fontSize: 12.5,
  fontWeight: 600,
  lineHeight: 1.3,
};

const primaryValue = {
  color: "#18181b",
  fontSize: 12,
  fontWeight: 600,
  lineHeight: 1.3,
};

const secondaryText = {
  marginTop: 2,
  color: "#71717a",
  fontSize: 10,
  fontWeight: 400,
  lineHeight: 1.3,
};

const neutralBadge = {
  display: "inline-flex",
  alignItems: "center",
  minHeight: 21,
  padding: "0 7px",
  background: "#f4f4f5",
  color: "#3f3f46",
  border: "1px solid #d4d4d8",
  borderRadius: 2,
  fontSize: 10,
  fontWeight: 500,
  lineHeight: 1,
  whiteSpace: "nowrap",
};

const statusBadge = { ...neutralBadge };

const featuredButton = {
  width: 28,
  height: 28,
  padding: 0,
  background: "transparent",
  border: 0,
  borderRadius: 2,
  fontFamily: "inherit",
  fontSize: 17,
  lineHeight: 1,
  cursor: "pointer",
};

const rowActions = {
  display: "flex",
  alignItems: "center",
  gap: 5,
  flexWrap: "nowrap",
};

const moreWrap = {
  position: "relative",
  display: "inline-flex",
};

const moreMenu = {
  position: "absolute",
  top: "calc(100% + 5px)",
  right: 0,
  zIndex: 50,
  minWidth: 150,
  padding: 4,
  background: "#ffffff",
  border: "1px solid #d4d4d8",
  borderRadius: 2,
  boxShadow: "0 8px 20px rgba(0,0,0,0.10)",
};

const menuItem = {
  width: "100%",
  minHeight: 32,
  padding: "0 9px",
  display: "flex",
  alignItems: "center",
  background: "#ffffff",
  color: "#27272a",
  border: 0,
  borderRadius: 2,
  fontFamily: "inherit",
  fontSize: 11.5,
  fontWeight: 500,
  textAlign: "left",
  cursor: "pointer",
  whiteSpace: "nowrap",
};

const btnPrimary = {
  minHeight: 36,
  padding: "0 14px",
  background: "#18181b",
  color: "#ffffff",
  border: "1px solid #18181b",
  borderRadius: 2,
  fontFamily: "inherit",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};

const btnSecondary = {
  minHeight: 36,
  padding: "0 14px",
  background: "#ffffff",
  color: "#27272a",
  border: "1px solid #d4d4d8",
  borderRadius: 2,
  fontFamily: "inherit",
  fontSize: 12,
  fontWeight: 500,
  cursor: "pointer",
};

const btnPrimarySmall = {
  ...btnPrimary,
  minHeight: 32,
  padding: "0 11px",
  fontSize: 11.5,
};

const btnSecondarySmall = {
  ...btnSecondary,
  minHeight: 32,
  padding: "0 11px",
  fontSize: 11.5,
};

const btnEdit = {
  minHeight: 29,
  padding: "0 10px",
  background: "#ffffff",
  color: "#27272a",
  border: "1px solid #d4d4d8",
  borderRadius: 2,
  fontFamily: "inherit",
  fontSize: 11,
  fontWeight: 500,
  cursor: "pointer",
};

const btnMore = {
  width: 29,
  minWidth: 29,
  height: 29,
  padding: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#ffffff",
  color: "#18181b",
  border: "1px solid #d4d4d8",
  borderRadius: 2,
  fontFamily: "inherit",
  fontSize: 15,
  fontWeight: 600,
  lineHeight: 1,
  cursor: "pointer",
};

const tableFooter = {
  minHeight: 48,
  padding: "8px 12px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  borderTop: "1px solid #eeeeef",
};

const tableFooterText = {
  color: "#71717a",
  fontSize: 10.5,
  fontWeight: 400,
};

const pagination = {
  display: "flex",
  alignItems: "center",
  gap: 7,
};

const pageButton = {
  minHeight: 30,
  padding: "0 10px",
  background: "#ffffff",
  color: "#27272a",
  border: "1px solid #d4d4d8",
  borderRadius: 2,
  fontFamily: "inherit",
  fontSize: 10.5,
  fontWeight: 500,
};

const pageText = {
  color: "#52525b",
  fontSize: 10.5,
  fontWeight: 500,
};

const emptyCell = {
  padding: 42,
  color: "#71717a",
  fontSize: 12,
  fontWeight: 400,
  textAlign: "center",
};

const modalBackdrop = {
  position: "fixed",
  inset: 0,
  zIndex: 1000,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  background: "rgba(0,0,0,0.42)",
};

const dialog = {
  width: "min(430px, 100%)",
  padding: 20,
  background: "#ffffff",
  border: "1px solid #d4d4d8",
  borderRadius: 2,
  boxShadow: "0 18px 48px rgba(0,0,0,0.18)",
};

const dialogEyebrow = {
  marginBottom: 6,
  color: "#71717a",
  fontSize: 9.5,
  fontWeight: 600,
  letterSpacing: "0.1em",
  textTransform: "uppercase",
};

const dialogTitle = {
  margin: 0,
  color: "#18181b",
  fontSize: 18,
  fontWeight: 700,
};

const dialogText = {
  margin: "8px 0 20px",
  color: "#52525b",
  fontSize: 13,
  fontWeight: 400,
  lineHeight: 1.5,
};

const dialogActions = {
  display: "flex",
  justifyContent: "flex-end",
  gap: 8,
};

const btnDanger = {
  minHeight: 36,
  padding: "0 14px",
  background: "#b42318",
  color: "#ffffff",
  border: "1px solid #b42318",
  borderRadius: 2,
  fontFamily: "inherit",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
};
