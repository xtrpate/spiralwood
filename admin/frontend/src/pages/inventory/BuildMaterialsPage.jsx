import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import api, { buildAssetUrl } from "../../services/api";
import toast from "react-hot-toast";

import "./BuildMaterialsPage.css";
// WISDOM BUILD MATERIALS UI POLISH V1.0.1
// WISDOM INVENTORY ROLE SEPARATION V1
// WISDOM BUILD MATERIALS STOCK FILTER V1
export default function BuildMaterialsPage() {
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [loading, setLoading] = useState(true);

  const [filters, setFilters] = useState(() => {
    const fromEdit = sessionStorage.getItem("wisdom_navigating_to_build_edit");

    if (fromEdit === "true") {
      try {
        const saved = sessionStorage.getItem("wisdom_build_filters");
        if (saved) return JSON.parse(saved);
      } catch (err) {}
    }

    return {
      search: "",
      stockFilter: "",
      categoryFilter: "",
      visibilityFilter: "",
      page: 1,
    };
  });

  const [actionMenuId, setActionMenuId] = useState(null);
  const [pendingArchive, setPendingArchive] = useState(null);
  const [bulkArchiveModal, setBulkArchiveModal] = useState(false);
  const [archiving, setArchiving] = useState(false);

  const [pendingUnpublish, setPendingUnpublish] = useState(null);
  const [unpublishing, setUnpublishing] = useState(false);

  const [pendingPublish, setPendingPublish] = useState(null);
  const [publishing, setPublishing] = useState(false);
  const [bulkPublishModal, setBulkPublishModal] = useState(false);
  const [bulkPublishing, setBulkPublishing] = useState(false);

  useEffect(() => {
    sessionStorage.removeItem("wisdom_navigating_to_build_edit");
  }, []);

  useEffect(() => {
    sessionStorage.setItem("wisdom_build_filters", JSON.stringify(filters));
  }, [filters]);

  const updateFilter = (key, value) => {
    setFilters((current) => ({
      ...current,
      [key]: value,
      page: 1,
    }));
  };

  useEffect(() => {
    api
      .get("/products/categories")
      .then((res) => {
        setCategories(
          Array.isArray(res.data?.categories) ? res.data.categories : [],
        );
      })
      .catch(() => {});
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Logic for active vs published state
      let isActive = "all";
      let isPublished = undefined;

      if (filters.visibilityFilter === "published") {
        isPublished = 1;
      }

      if (filters.visibilityFilter === "unpublished") {
        isPublished = 0;
      }

      if (filters.visibilityFilter === "archived") {
        isActive = 0;
      }

      const response = await api.get("/products", {
        params: {
          limit: 20,
          page: filters.page,
          search: filters.search || undefined,
          category_id: filters.categoryFilter || undefined,
          status: filters.stockFilter || undefined,
          is_published: isPublished,
          type: "standard",
          is_active: isActive,
        },
      });
      setProducts(response.data.products || []);
      setTotal(Number(response.data.total || 0));
    } catch (err) {
      toast.error("Failed to load materials.");
    } finally {
      setLoading(false);
    }
  }, [
    filters.page,
    filters.search,
    filters.categoryFilter,
    filters.stockFilter,
    filters.visibilityFilter,
  ]);

  useEffect(() => {
    loadData();
  }, [loadData]);

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

  const confirmPublish = async () => {
    if (!pendingPublish?.id) return;
    setPublishing(true);
    try {
      await api.patch("/products/bulk-publish", {
        ids: [pendingPublish.id],
        is_published: true,
      });
      toast.success("Added to product page.");
      setPendingPublish(null);
      loadData();
    } catch {
      toast.error("Failed to add to product page.");
    } finally {
      setPublishing(false);
    }
  };

  const confirmBulkPublish = async () => {
    if (selectedIds.length === 0) return;
    setBulkPublishing(true);
    try {
      await api.patch("/products/bulk-publish", {
        ids: selectedIds,
        is_published: true,
      });
      toast.success("Added to product page.");
      setBulkPublishModal(false);
      setSelectedIds([]);
      loadData();
    } catch {
      toast.error("Failed to add to product page.");
    } finally {
      setBulkPublishing(false);
    }
  };

  const confirmArchive = async () => {
    if (!pendingArchive?.id) return;
    setArchiving(true);
    try {
      await api.patch(`/products/${pendingArchive.id}/active`, {
        is_active: false,
      });
      toast.success("Build material archived.");
      setPendingArchive(null);
      loadData();
    } catch (err) {
      toast.error("Failed to archive material.");
    } finally {
      setArchiving(false);
    }
  };

  const confirmUnpublish = async () => {
    if (!pendingUnpublish?.id) return;
    setUnpublishing(true);
    try {
      await api.patch("/products/bulk-publish", {
        ids: [pendingUnpublish.id],
        is_published: false,
      });
      toast.success("Removed from product page.");
      setPendingUnpublish(null);
      loadData();
    } catch (err) {
      toast.error("Failed to remove from product page.");
    } finally {
      setUnpublishing(false);
    }
  };

  const handleRestore = async (id) => {
    try {
      await api.patch(`/products/${id}/active`, { is_active: true });
      toast.success("Build material restored.");
      loadData();
    } catch {
      toast.error("Failed to restore material.");
    }
  };

  const formatMoney = (value) => {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return "—";
    return amount.toLocaleString("en-PH", {
      style: "currency",
      currency: "PHP",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const getStatus = (product) => {
    const stock = Number(product.stock || 0);
    const reorderPoint = Number(product.reorder_point || 0);
    const status = String(product.stock_status || "").toLowerCase();

    if (status === "in_stock")
      return { key: "in_stock", label: "In stock", tone: "neutral" };
    if (status === "low_stock")
      return { key: "low_stock", label: "Low stock", tone: "warning" };
    if (status === "out_of_stock")
      return { key: "out_of_stock", label: "Out of stock", tone: "danger" };
    if (stock <= 0)
      return { key: "out_of_stock", label: "Out of stock", tone: "danger" };
    if (stock <= reorderPoint)
      return { key: "low_stock", label: "Low stock", tone: "warning" };
    return { key: "in_stock", label: "In stock", tone: "neutral" };
  };

  const totalPages = Math.max(1, Math.ceil(total / 20));

  // Bulk Actions
  const handleSelectAll = (event) => {
    setSelectedIds(event.target.checked ? products.map((p) => p.id) : []);
  };

  const handleSelectOne = (id, checked) => {
    setSelectedIds((current) =>
      checked ? [...current, id] : current.filter((sid) => sid !== id),
    );
  };

  const handleBulkPublish = async (isPublished) => {
    if (selectedIds.length === 0) return;
    try {
      await api.patch("/products/bulk-publish", {
        ids: selectedIds,
        is_published: isPublished,
      });
      toast.success(
        isPublished ? "Added to product page." : "Removed from product page.",
      );
      loadData();
    } catch {
      toast.error("Failed to update status.");
    }
  };

  const confirmBulkArchive = async () => {
    if (selectedIds.length === 0) return;
    setArchiving(true);
    try {
      await Promise.all(
        selectedIds.map((id) =>
          api.patch(`/products/${id}/active`, { is_active: false }),
        ),
      );
      toast.success("Selected materials archived.");
      setBulkArchiveModal(false);
      setSelectedIds([]);
      loadData();
    } catch {
      toast.error("Failed to archive some materials.");
    } finally {
      setArchiving(false);
    }
  };

  return (
    <div className="build-materials-admin">
      <div className="build-materials-header">
        <div>
          <h1>Build Materials</h1>
          <p>
            Review ready-made finished products kept in stock, including price,
            product cost, profit, and stock level.
          </p>
        </div>
        <button
          type="button"
          className="build-materials-primary-button"
          onClick={() => navigate("/admin/inventory/build/new")}
        >
          + Add item
        </button>
      </div>

      <div className="build-materials-toolbar">
        <div className="build-materials-toolbar-controls">
          <div className="build-materials-search-field">
            <label htmlFor="build-material-search">Search products</label>
            <input
              id="build-material-search"
              type="search"
              placeholder="Search by product name"
              value={filters.search}
              onChange={(event) => updateFilter("search", event.target.value)}
            />
          </div>
          <div className="build-materials-filter-field">
            <label htmlFor="build-material-category-filter">Category</label>
            <select
              id="build-material-category-filter"
              value={filters.categoryFilter}
              onChange={(event) =>
                updateFilter("categoryFilter", event.target.value)
              }
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="build-materials-filter-field">
            <label htmlFor="build-material-stock-filter">Stock level</label>
            <select
              id="build-material-stock-filter"
              value={filters.stockFilter}
              onChange={(event) =>
                updateFilter("stockFilter", event.target.value)
              }
            >
              <option value="">All stock levels</option>
              <option value="in_stock">In stock</option>
              <option value="low_stock">Low stock</option>
              <option value="out_of_stock">Out of stock</option>
            </select>
          </div>
          <div className="build-materials-filter-field">
            <label htmlFor="build-material-visibility-filter">Visibility</label>
            <select
              id="build-material-visibility-filter"
              value={filters.visibilityFilter}
              onChange={(event) =>
                updateFilter("visibilityFilter", event.target.value)
              }
            >
              <option value="">All products</option>
              <option value="published">Published</option>
              <option value="unpublished">Unpublished</option>
              <option value="archived">Archived</option>
            </select>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            flexWrap: "wrap",
            marginTop: 14,
          }}
        >
          {selectedIds.length > 0 ? (
            <div style={bulkActionsStyle}>
              <span style={selectedCountStyle}>
                {selectedIds.length} selected
              </span>
              <button
                type="button"
                onClick={() => setBulkPublishModal(true)}
                style={btnPrimarySmall}
              >
                Add to product page
              </button>
              <button
                type="button"
                onClick={() => handleBulkPublish(false)}
                style={btnSecondarySmall}
              >
                Remove from product page
              </button>
              <button
                type="button"
                onClick={() => {
                  const hasPublished = products.some(
                    (p) =>
                      selectedIds.includes(p.id) &&
                      Number(p.is_published) === 1,
                  );
                  if (hasPublished) {
                    toast.error(
                      "Please unpublish the selected products from the product page before you can archive them.",
                    );
                  } else {
                    setBulkArchiveModal(true);
                  }
                }}
                style={btnDangerSmall}
              >
                Archive
              </button>
            </div>
          ) : null}
          <div className="build-materials-count">
            {loading
              ? "Loading products..."
              : `${total.toLocaleString("en-PH")} product${
                  total === 1 ? "" : "s"
                } shown`}
          </div>
        </div>
      </div>

      <div className="build-materials-layout">
        <div className="build-materials-table-card">
          <div className="build-materials-table-scroll">
            <table>
              <thead>
                <tr>
                  <th style={{ textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={
                        products.length > 0 &&
                        selectedIds.length === products.length
                      }
                      onChange={handleSelectAll}
                      style={checkboxStyle}
                    />
                  </th>
                  <th>Image</th>
                  <th>Product</th>
                  <th>Walk-in Price</th>
                  <th>Product Cost</th>
                  <th>Profit</th>
                  <th>Available Stock</th>
                  <th>Reorder Point</th>
                  <th>Status</th>
                  <th style={{ textAlign: "center" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {!loading && products.length === 0 ? (
                  <tr>
                    <td colSpan="10" className="build-materials-empty">
                      No ready-made products match the selected filters.
                    </td>
                  </tr>
                ) : (
                  products.map((product) => {
                    const sellingPrice = Number(product.walkin_price || 0);
                    const productCost = Number(product.production_cost || 0);
                    const storedProfit = Number(product.profit_margin);
                    const hasSellingPrice =
                      Number.isFinite(sellingPrice) && sellingPrice > 0;
                    const hasProductCost =
                      Number.isFinite(productCost) && productCost > 0;
                    const profit =
                      hasSellingPrice && hasProductCost
                        ? Number.isFinite(storedProfit)
                          ? storedProfit
                          : sellingPrice - productCost
                        : null;
                    const margin =
                      Number.isFinite(profit) && hasSellingPrice
                        ? (profit / sellingPrice) * 100
                        : null;
                    const status = getStatus(product);
                    const isActive = Number(product.is_active) !== 0;

                    return (
                      <tr
                        key={product.id}
                        style={{
                          position: "relative",
                          zIndex: actionMenuId === product.id ? 50 : 0,
                          background: selectedIds.includes(product.id)
                            ? "#fafafa"
                            : "#ffffff",
                          opacity: isActive ? 1 : 0.6,
                        }}
                      >
                        <td style={{ textAlign: "center" }}>
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(product.id)}
                            onChange={(event) =>
                              handleSelectOne(product.id, event.target.checked)
                            }
                            style={checkboxStyle}
                          />
                        </td>
                        <td>
                          {product.image_url ? (
                            <img
                              src={buildAssetUrl(product.image_url)}
                              alt=""
                              style={productImageStyle}
                            />
                          ) : (
                            <div style={imagePlaceholderStyle}>—</div>
                          )}
                        </td>
                        <td>
                          <div className="build-materials-product-name">
                            {product.name}
                          </div>
                          {!isActive && (
                            <div
                              style={{
                                fontSize: 10,
                                color: "#71717a",
                                fontWeight: 500,
                                marginTop: 2,
                              }}
                            >
                              Archived
                            </div>
                          )}
                          {isActive && (
                            <span
                              style={{
                                fontSize: 10,
                                color:
                                  Number(product.is_published) === 1
                                    ? "#166534"
                                    : "#71717a",
                                fontWeight: 500,
                              }}
                            >
                              ●{" "}
                              {Number(product.is_published) === 1
                                ? "Published"
                                : "Unpublished"}
                            </span>
                          )}
                        </td>
                        <td>
                          {hasSellingPrice ? (
                            <span className="build-materials-money">
                              {formatMoney(sellingPrice)}
                            </span>
                          ) : (
                            <span className="build-materials-muted">
                              Not set
                            </span>
                          )}
                        </td>
                        <td>
                          {hasProductCost ? (
                            formatMoney(productCost)
                          ) : (
                            <span className="build-materials-muted">
                              Not set
                            </span>
                          )}
                        </td>
                        <td>
                          {Number.isFinite(profit) ? (
                            <div className="build-materials-profit">
                              <span>{formatMoney(profit)}</span>
                              {Number.isFinite(margin) && (
                                <small>{margin.toFixed(1)}% margin</small>
                              )}
                            </div>
                          ) : (
                            <span className="build-materials-muted">
                              Not available
                            </span>
                          )}
                        </td>
                        <td>
                          <span className="build-materials-stock">
                            {Number(product.stock || 0).toLocaleString("en-PH")}
                          </span>
                        </td>
                        <td>
                          {Number(product.reorder_point || 0).toLocaleString(
                            "en-PH",
                          )}
                        </td>
                        <td>
                          <span
                            className={`build-materials-status build-materials-status-${status.tone}`}
                          >
                            {status.label}
                          </span>
                        </td>

                        <td
                          style={{ position: "relative", overflow: "visible" }}
                        >
                          <div style={rowActions}>
                            <button
                              type="button"
                              onClick={() => {
                                sessionStorage.setItem(
                                  "wisdom_navigating_to_build_edit",
                                  "true",
                                );
                                navigate(
                                  `/admin/inventory/build/${product.id}/edit`,
                                );
                              }}
                              style={btnEditAction}
                            >
                              Edit
                            </button>

                            <div
                              style={moreWrap}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                type="button"
                                style={btnMore}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActionMenuId((current) =>
                                    current === product.id ? null : product.id,
                                  );
                                }}
                              >
                                ⋯
                              </button>

                              {actionMenuId === product.id && (
                                <div role="menu" style={moreMenu}>
                                  {!isActive ? (
                                    <button
                                      type="button"
                                      role="menuitem"
                                      style={menuItem}
                                      onClick={() => {
                                        setActionMenuId(null);
                                        handleRestore(product.id);
                                      }}
                                    >
                                      Restore material
                                    </button>
                                  ) : (
                                    <>
                                      {Number(product.is_published) === 1 ? (
                                        <button
                                          type="button"
                                          role="menuitem"
                                          style={menuItem}
                                          onClick={() => {
                                            setActionMenuId(null);
                                            setPendingUnpublish(product);
                                          }}
                                        >
                                          Remove from product page
                                        </button>
                                      ) : (
                                        <button
                                          type="button"
                                          role="menuitem"
                                          style={menuItem}
                                          onClick={() => {
                                            setActionMenuId(null);
                                            setPendingPublish(product);
                                          }}
                                        >
                                          Add to product page
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        role="menuitem"
                                        style={{
                                          ...menuItem,
                                          color: "#b42318",
                                        }}
                                        onClick={() => {
                                          setActionMenuId(null);
                                          if (
                                            Number(product.is_published) === 1
                                          ) {
                                            toast.error(
                                              "Please remove the product from the product page first before you can archive it.",
                                            );
                                          } else {
                                            setPendingArchive(product);
                                          }
                                        }}
                                      >
                                        Archive
                                      </button>
                                    </>
                                  )}
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
          </div>
          {total > 20 && (
            <div style={paginationFooter}>
              <span style={paginationText}>
                Showing {(filters.page - 1) * 20 + 1} to{" "}
                {Math.min(filters.page * 20, total)} of {total}
              </span>
              <div style={paginationControls}>
                <button
                  type="button"
                  disabled={filters.page <= 1}
                  onClick={() =>
                    setFilters((p) => ({ ...p, page: p.page - 1 }))
                  }
                  style={{
                    ...pageButton,
                    opacity: filters.page <= 1 ? 0.4 : 1,
                  }}
                >
                  Prev
                </button>
                <span style={pageText}>
                  {filters.page} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={filters.page >= totalPages}
                  onClick={() =>
                    setFilters((p) => ({ ...p, page: p.page + 1 }))
                  }
                  style={{
                    ...pageButton,
                    opacity: filters.page >= totalPages ? 0.4 : 1,
                  }}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {bulkPublishModal && (
        <div style={modalBackdrop}>
          <div role="dialog" aria-modal="true" style={dialog}>
            <div style={dialogEyebrow}>Bulk Action</div>
            <h2 style={dialogTitle}>Publish {selectedIds.length} Materials?</h2>
            <p style={dialogText}>
              Do you want to continue? This action will publish the selected
              products and will be shown on the front store.
            </p>
            <div style={dialogActions}>
              <button
                type="button"
                onClick={() => setBulkPublishModal(false)}
                style={btnSecondaryModal}
                disabled={bulkPublishing}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmBulkPublish}
                style={btnPrimaryModal}
                disabled={bulkPublishing}
              >
                {bulkPublishing ? "Publishing..." : "Add to product page"}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingPublish && (
        <div style={modalBackdrop}>
          <div role="dialog" aria-modal="true" style={dialog}>
            <div style={dialogEyebrow}>Publish Product</div>
            <h2 style={dialogTitle}>Publish "{pendingPublish.name}"?</h2>
            <p style={dialogText}>
              Do you want to continue? This action will publish the product and
              will be shown on the front store.
            </p>

            <div style={dialogActions}>
              <button
                type="button"
                onClick={() => setPendingPublish(null)}
                style={btnSecondaryModal}
                disabled={publishing}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmPublish}
                style={btnPrimaryModal}
                disabled={publishing}
              >
                {publishing ? "Publishing..." : "Add to product page"}
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkArchiveModal && (
        <div style={modalBackdrop}>
          <div role="dialog" aria-modal="true" style={dialog}>
            <div style={dialogEyebrow}>Bulk Action</div>
            <h2 style={dialogTitle}>Archive {selectedIds.length} Materials?</h2>
            <p style={dialogText}>
              This will remove the selected items from your active Build
              Materials inventory.
            </p>
            <div style={dialogActions}>
              <button
                type="button"
                onClick={() => setBulkArchiveModal(false)}
                style={btnSecondaryModal}
                disabled={archiving}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmBulkArchive}
                style={btnDanger}
                disabled={archiving}
              >
                {archiving ? "Archiving..." : "Archive materials"}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingUnpublish && (
        <div style={modalBackdrop}>
          <div role="dialog" aria-modal="true" style={dialog}>
            <div style={dialogEyebrow}>Remove Product</div>
            <h2 style={dialogTitle}>Remove "{pendingUnpublish.name}"?</h2>
            <p style={dialogText}>
              Are you sure you want to remove "{pendingUnpublish.name}" from the
              product page? Doing this will unpublish the product and completely
              hide it from the customer store.
            </p>

            <div style={dialogActions}>
              <button
                type="button"
                onClick={() => setPendingUnpublish(null)}
                style={btnSecondaryModal}
                disabled={unpublishing}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmUnpublish}
                style={btnDanger}
                disabled={unpublishing}
              >
                {unpublishing ? "Removing..." : "Remove from product page"}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingArchive && (
        <div style={modalBackdrop}>
          <div role="dialog" aria-modal="true" style={dialog}>
            <div style={dialogEyebrow}>Archive Material</div>
            <h2 style={dialogTitle}>Archive "{pendingArchive.name}"?</h2>
            <p style={dialogText}>
              This will remove the item from your active Build Materials
              inventory.
            </p>

            <div style={dialogActions}>
              <button
                type="button"
                onClick={() => setPendingArchive(null)}
                style={btnSecondaryModal}
                disabled={archiving}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmArchive}
                style={btnDanger}
                disabled={archiving}
              >
                {archiving ? "Archiving..." : "Archive material"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function StockMovementPage() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({
    type: "",
    from: "",
    to: "",
    page: 1,
  });
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({
    material_id: "",
    product_id: "",
    type: "in",
    quantity: "",
    notes: "",
  });
  const [rawMats, setRawMats] = useState([]);
  const [products, setProducts] = useState([]);

  const load = async () => {
    const { data } = await api.get("/inventory/movements", {
      params: { ...filters, limit: 30 },
    });
    setRows(data.rows);
    setTotal(data.total);
  };

  useEffect(() => {
    load();
  }, [filters]); // eslint-disable-line

  useEffect(() => {
    api.get("/inventory/raw").then((r) => setRawMats(r.data.rows || []));
    api
      .get("/products", { params: { limit: 100 } })
      .then((r) => setProducts(r.data.products || []));
  }, []);

  const resetForm = () => {
    setForm({
      material_id: "",
      product_id: "",
      type: "in",
      quantity: "",
      notes: "",
    });
  };

  const handleMaterialChange = (value) => {
    setForm((f) => ({
      ...f,
      material_id: value,
      product_id: value ? "" : f.product_id,
    }));
  };

  const handleProductChange = (value) => {
    setForm((f) => ({
      ...f,
      product_id: value,
      material_id: value ? "" : f.material_id,
    }));
  };

  const isMaterialTarget = Boolean(form.material_id);
  const isProductTarget = Boolean(form.product_id);

  const helperMessage =
    isProductTarget && form.type === "in"
      ? "Product stock-in ito. Automatic babawasan ang linked raw materials based sa BOM. Kapag kulang ang raw materials, hindi ito mase-save."
      : isProductTarget && form.type === "out"
        ? "Product stock-out ito. Mababawasan ang finished product stock. Kapag kulang ang product stock, hindi ito mase-save."
        : isMaterialTarget && form.type === "in"
          ? "Raw material stock-in ito. Pang-delivery o restock ng supplier."
          : isMaterialTarget && form.type === "out"
            ? "Raw material stock-out ito. Manual bawas ng raw material stock."
            : "Pumili ng Raw Material o Product. Isa lang ang puwedeng target bawat movement.";

  const handleSave = async (e) => {
    e.preventDefault();

    try {
      if (!form.material_id && !form.product_id) {
        toast.error("Pumili ng raw material o product.");
        return;
      }

      const payload = {
        material_id: form.material_id || null,
        product_id: form.product_id || null,
        type: form.type,
        quantity: Number(form.quantity),
        notes: form.notes?.trim() || null,
      };

      await api.post("/inventory/movements", payload);

      toast.success(
        payload.product_id && payload.type === "in"
          ? "Production recorded. Product stock added and BOM materials deducted."
          : "Stock movement recorded.",
      );

      setModal(false);
      resetForm();
      load();
    } catch (err) {
      // Global interceptor sa api.js na ang nag-a-toast ng error message —
      // hindi na natin uulitin dito. Ang catch lang ay para pigilan ang
      // uncaught crash at panatilihing bukas ang modal.
    }
  };

  return (
    <div>
      <div style={headerDiv}>
        <h1 style={title}>Stock Movement Tracking</h1>
        <button onClick={() => setModal(true)} style={btnPrimary}>
          + Record Movement
        </button>
      </div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <select
          value={filters.type}
          onChange={(e) =>
            setFilters((f) => ({ ...f, type: e.target.value, page: 1 }))
          }
          style={inputSm}
        >
          <option value="">All Types</option>
          <option value="in">In (Delivery)</option>
          <option value="out">Out (Sales/Production)</option>
          <option value="adjustment">Adjustment</option>
          <option value="return">Return</option>
        </select>
        <input
          type="date"
          value={filters.from}
          onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
          style={inputSm}
        />
        <input
          type="date"
          value={filters.to}
          onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
          style={inputSm}
        />
      </div>
      <div style={tableCard}>
        <table
          style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
        >
          <thead>
            <tr style={{ background: "#fafafa" }}>
              {[
                "Date",
                "Type",
                "Material / Product",
                "Supplier",
                "Qty",
                "Notes",
                "By",
              ].map((h) => (
                <th key={h} style={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              return (
                <tr key={r.id} style={{ borderBottom: "1px solid #f4f4f5" }}>
                  <td style={{ ...td, color: "#71717a" }}>
                    {new Date(r.created_at).toLocaleDateString("en-PH")}
                  </td>
                  <td style={td}>
                    <span
                      style={{
                        background: "#f4f4f5",
                        color: "#18181b",
                        border: "1px solid #e4e4e7",
                        padding: "2px 10px",
                        borderRadius: 12,
                        fontSize: 11,
                        fontWeight: 600,
                        textTransform: "capitalize",
                      }}
                    >
                      {r.type}
                    </span>
                  </td>
                  <td style={{ ...td, fontWeight: 600, color: "#0a0a0a" }}>
                    {r.material_name || r.product_name || "—"}
                  </td>
                  <td style={td}>{r.supplier_name || "—"}</td>
                  <td
                    style={{
                      ...td,
                      fontWeight: 700,
                      color:
                        r.type === "in" || r.type === "return"
                          ? "#18181b"
                          : "#52525b",
                    }}
                  >
                    {r.type === "in" || r.type === "return" ? "+" : "-"}
                    {r.quantity}
                  </td>
                  <td style={td}>{r.notes || "—"}</td>
                  <td style={{ ...td, color: "#71717a" }}>
                    {r.created_by_name}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modal && (
        <div style={overlayStyle}>
          <div style={modalBox}>
            <h3
              style={{
                margin: "0 0 20px",
                fontSize: 18,
                fontWeight: 800,
                color: "#0a0a0a",
              }}
            >
              Record Stock Movement
            </h3>
            <form onSubmit={handleSave}>
              <div style={{ marginBottom: 12 }}>
                <label style={labelSm}>Movement Type *</label>
                <select
                  required
                  value={form.type}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, type: e.target.value }))
                  }
                  style={inputFull}
                >
                  <option value="in">In – Delivery / Production</option>
                  <option value="out">Out – Sales / Usage</option>
                  <option value="adjustment">Adjustment</option>
                  <option value="return">Return</option>
                </select>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={labelSm}>Raw Material</label>
                <select
                  value={form.material_id}
                  onChange={(e) => handleMaterialChange(e.target.value)}
                  style={inputFull}
                >
                  <option value="">None</option>
                  {rawMats.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label style={labelSm}>Product / Build Material</label>
                <select
                  value={form.product_id}
                  onChange={(e) => handleProductChange(e.target.value)}
                  style={inputFull}
                >
                  <option value="">None</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div
                style={{
                  marginBottom: 16,
                  padding: "12px 14px",
                  borderRadius: 8,
                  background: "#f4f4f5",
                  border: "1px solid #e4e4e7",
                  color: "#52525b",
                  fontSize: 12,
                  lineHeight: 1.5,
                }}
              >
                {helperMessage}
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={labelSm}>Quantity *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  min="0.01"
                  value={form.quantity}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, quantity: e.target.value }))
                  }
                  style={inputFull}
                />
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={labelSm}>Notes / Reference</label>
                <textarea
                  value={form.notes}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, notes: e.target.value }))
                  }
                  rows={2}
                  style={{ ...inputFull, resize: "vertical" }}
                />
              </div>
              <div
                style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}
              >
                <button
                  type="button"
                  onClick={() => setModal(false)}
                  style={btnGhost}
                >
                  Cancel
                </button>
                <button type="submit" style={btnPrimary}>
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Suppliers Page
// ────────────────────────────────────────────────────────────────────────────
export function SuppliersPage() {
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);
  const [suppliers, setSuppliers] = useState([]);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({
    name: "",
    address: "",
    contact_number: "",
    email: "",
  });

  const load = () => api.get("/suppliers").then((r) => setSuppliers(r.data));
  useEffect(() => {
    load();
  }, []);

  const openAdd = () => {
    setForm({ name: "", address: "", contact_number: "", email: "" });
    setModal("add");
  };
  const openEdit = (s) => {
    setForm(s);
    setModal("edit");
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      if (modal === "add") await api.post("/suppliers", form);
      else await api.put(`/suppliers/${form.id}`, form);
      setModal(null);
      load();
    } catch (error) {
      // Global interceptor sa api.js na ang nag-a-toast ng error message.
      // Ang catch lang ay para pigilan ang "Uncaught runtime errors"
      // crash at panatilihing bukas ang modal.
    }
  };

  return (
    <div>
      <div style={headerDiv}>
        <h1 style={title}>Supplier Management</h1>
        <button onClick={openAdd} style={btnPrimary}>
          + Add Supplier
        </button>
      </div>
      <div style={tableCard}>
        <table
          style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}
        >
          <thead>
            <tr style={{ background: "#fafafa" }}>
              {["Name", "Address", "Contact", "Email", "Actions"].map((h) => (
                <th key={h} style={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s) => (
              <tr key={s.id} style={{ borderBottom: "1px solid #f4f4f5" }}>
                <td style={td}>
                  <strong style={{ color: "#0a0a0a" }}>{s.name}</strong>
                </td>
                <td style={{ ...td, color: "#52525b" }}>{s.address || "—"}</td>
                <td style={td}>{s.contact_number || "—"}</td>
                <td style={{ ...td, color: "#52525b" }}>{s.email || "—"}</td>
                <td style={td}>
                  <button onClick={() => openEdit(s)} style={btnEdit}>
                    Edit
                  </button>
                  <button
                    onClick={async () => {
                      if (window.confirm("Delete supplier?")) {
                        try {
                          await api.delete(`/suppliers/${s.id}`);
                          load();
                        } catch (error) {
                          // Global interceptor na ang nag-a-toast ng error.
                        }
                      }
                    }}
                    style={{
                      ...btnEdit,
                      background: "#fef2f2",
                      color: "#991b1b",
                      border: "1px solid #fecaca",
                      marginLeft: 6,
                    }}
                  >
                    Del
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modal && (
        <div style={overlayStyle}>
          <div style={modalBox}>
            <h3
              style={{
                margin: "0 0 20px",
                fontSize: 18,
                fontWeight: 800,
                color: "#0a0a0a",
              }}
            >
              {modal === "add" ? "Add Supplier" : "Edit Supplier"}
            </h3>
            <form onSubmit={handleSave}>
              {[
                ["Company Name *", "name", "text", true],
                ["Address", "address", "text"],
                ["Contact Number", "contact_number", "text"],
                ["Email", "email", "email"],
              ].map(([label, key, type, req]) => (
                <div key={key} style={{ marginBottom: 12 }}>
                  <label style={labelSm}>{label}</label>
                  <input
                    type={type || "text"}
                    required={req}
                    value={form[key] || ""}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, [key]: e.target.value }))
                    }
                    style={inputFull}
                  />
                </div>
              ))}
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  justifyContent: "flex-end",
                  marginTop: 20,
                }}
              >
                <button
                  type="button"
                  onClick={() => setModal(null)}
                  style={btnGhost}
                >
                  Cancel
                </button>
                <button type="submit" style={btnPrimary}>
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shared Styles ───────────────────────────────────────────────────────────
const headerDiv = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 20,
};
const title = {
  fontSize: 24,
  fontWeight: 800,
  color: "#0a0a0a",
  margin: 0,
  letterSpacing: "-0.02em",
};
const tableCard = {
  background: "#fff",
  borderRadius: 12,
  border: "1px solid #e4e4e7",
  boxShadow: "0 1px 2px rgba(0,0,0,.02)",
  overflow: "hidden",
};
const th = {
  textAlign: "left",
  padding: "13px 16px",
  fontSize: 10,
  fontWeight: 800,
  color: "#71717a",
  textTransform: "uppercase",
  letterSpacing: 1,
};
const td = {
  padding: "14px 16px",
  color: "#18181b",
  verticalAlign: "middle",
};
const inputSm = {
  padding: "8px 12px",
  border: "1px solid #e4e4e7",
  borderRadius: 6,
  fontSize: 13,
  minWidth: 140,
  outline: "none",
  color: "#18181b",
};
const inputFull = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #e4e4e7",
  borderRadius: 8,
  fontSize: 13,
  boxSizing: "border-box",
  outline: "none",
  color: "#18181b",
};
const labelSm = {
  fontSize: 12,
  fontWeight: 700,
  color: "#52525b",
  display: "block",
  marginBottom: 6,
};
const btnPrimary = {
  padding: "9px 18px",
  background: "#18181b",
  color: "#ffffff",
  border: "none",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
  transition: "background 0.2s",
};
const btnGhost = {
  padding: "9px 18px",
  background: "#f4f4f5",
  color: "#18181b",
  border: "1px solid #e4e4e7",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
  transition: "background 0.2s",
};
const btnEdit = {
  padding: "5px 14px",
  background: "#f4f4f5",
  color: "#18181b",
  border: "1px solid #e4e4e7",
  borderRadius: 6,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 600,
};
const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,.6)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};
const modalBox = {
  background: "#fff",
  borderRadius: 16,
  padding: 32,
  width: 480,
  maxHeight: "85vh",
  overflowY: "auto",
  border: "1px solid #e4e4e7",
  boxShadow: "0 20px 60px rgba(0,0,0,.15)",
};

const rowActions = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 5,
};
const btnEditAction = {
  minHeight: 29,
  padding: "0 10px",
  background: "#18181b",
  color: "#ffffff",
  border: "1px solid #18181b",
  borderRadius: 2,
  fontFamily: "inherit",
  fontSize: 11,
  fontWeight: 500,
  cursor: "pointer",
};
const moreWrap = {
  position: "relative",
  display: "inline-flex",
  zIndex: 2,
};
const btnMore = {
  width: 29,
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
const moreMenu = {
  position: "absolute",
  top: "calc(100% + 5px)",
  right: 0,
  zIndex: 50,
  minWidth: 170,
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
const btnSecondaryModal = {
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

const btnPrimaryModal = {
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

const checkboxStyle = {
  width: 14,
  height: 14,
  accentColor: "#18181b",
  cursor: "pointer",
};
const productImageStyle = {
  width: 40,
  height: 40,
  display: "block",
  objectFit: "cover",
  background: "#fafafa",
  border: "1px solid #dedfe2",
  borderRadius: 2,
};
const imagePlaceholderStyle = {
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
const paginationFooter = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "12px 16px",
  borderTop: "1px solid #e4e4e7",
  background: "#ffffff",
};
const paginationText = {
  color: "#71717a",
  fontSize: 11,
};
const paginationControls = {
  display: "flex",
  alignItems: "center",
  gap: 10,
};
const pageButton = {
  padding: "4px 10px",
  background: "#ffffff",
  border: "1px solid #d4d4d8",
  borderRadius: 2,
  fontSize: 11,
  cursor: "pointer",
  color: "#18181b",
};
const pageText = {
  fontSize: 11,
  fontWeight: 600,
  color: "#3f3f46",
};
const bulkActionsStyle = {
  display: "flex",
  alignItems: "center",
  gap: 6,
};
const selectedCountStyle = {
  fontSize: 11,
  fontWeight: 600,
  color: "#18181b",
  marginRight: 4,
};
const btnPrimarySmall = {
  padding: "4px 10px",
  background: "#18181b",
  color: "#ffffff",
  border: "1px solid #18181b",
  borderRadius: 2,
  fontSize: 11,
  cursor: "pointer",
};
const btnSecondarySmall = {
  padding: "4px 10px",
  background: "#ffffff",
  color: "#18181b",
  border: "1px solid #d4d4d8",
  borderRadius: 2,
  fontSize: 11,
  cursor: "pointer",
};
const btnDangerSmall = {
  padding: "4px 10px",
  background: "#fef2f2",
  color: "#991b1b",
  border: "1px solid #fecaca",
  borderRadius: 2,
  fontSize: 11,
  cursor: "pointer",
};
