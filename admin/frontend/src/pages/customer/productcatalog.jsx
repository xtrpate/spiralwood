/**
 * pages/ProductCatalog.jsx
 * Updated: Connected to global CartContext and removed floating orange cart
 */
import { useState, useEffect, useCallback } from "react";
import { Search, ShoppingCart, Eye, Plus, Minus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import api, { buildAssetUrl } from "../../services/api";
import "./productcatalog.css";
import { useCart } from "./cartcontext";


/* ── Image component with fallback ── */
const ProductImage = ({ src, alt, className, style, imgStyle }) => {
  const [errored, setErrored] = useState(false);
  const resolvedSrc = buildAssetUrl(src);

  if (!resolvedSrc || errored) {
    return (
      <div className={className} style={style}>
        <div className="product-img-placeholder-icon">🪵</div>
        <div className="product-img-alt">{alt}</div>
      </div>
    );
  }

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      className={className}
      style={{
        width: "100%",
        height: "100%",
        objectFit: "cover",
        ...style,
        ...imgStyle,
      }}
      onError={() => setErrored(true)}
    />
  );
};

/* ── Skeleton loader card ── */
const SkeletonCard = () => (
  <div className="product-skeleton">
    <div className="skeleton-img" />
    <div className="skeleton-body">
      <div className="skeleton-line short" />
      <div className="skeleton-line medium" />
      <div className="skeleton-line" />
    </div>
  </div>
);

/* ── Stock badge ── */
const StockBadge = ({ status }) => {
  const map = {
    in_stock: { cls: "badge-green", label: "In Stock" },
    low_stock: { cls: "badge-yellow", label: "Low Stock" },
    out_of_stock: { cls: "badge-red", label: "Out of Stock" },
  };
  const { cls, label } = map[status] || { cls: "badge-gray", label: status };
  return <span className={`badge ${cls} product-card-stock`}>{label}</span>;
};

export default function ProductCatalog() {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  // 👉 NEW: Tap directly into the official CartContext
  const { addToCart } = useCart();

  /* Filters */
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("standard");
  const [stockFilter, setStockFilter] = useState("all");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [sortBy, setSortBy] = useState("name_asc");

  /* Modal state */
  const [selVariation, setSelVariation] = useState(null);
  const [qty, setQty] = useState(1);
  const [cartMsg, setCartMsg] = useState("");

  /* ── Fetch products ── */
  const fetchProducts = useCallback(async () => {
    setLoading(true);

    try {
      const params = {};
      if (search) params.q = search;
      if (catFilter !== "all") params.category_id = catFilter;
            params.type = "standard";
      if (stockFilter !== "all") params.stock_status = stockFilter;
      if (priceMin) params.price_min = priceMin;
      if (priceMax) params.price_max = priceMax;
      params.sort = sortBy;

      const res = await api.get("/customer/products", { params });

      const rawProducts = Array.isArray(res.data?.products) ? res.data.products : [];
      const visibleProducts = rawProducts.filter(
        (item) => String(item?.type || "").toLowerCase() !== "blueprint",
      );

      setProducts(visibleProducts);
      setCategories(
        Array.isArray(res.data?.categories) ? res.data.categories : [],
      );
    } catch (err) {
      console.error(err);
      setProducts([]);
      setCategories([]);
      toast.error(
        err?.response?.data?.message || "Failed to load catalog products.",
      );
    } finally {
      setLoading(false);
    }
  }, [search, catFilter, typeFilter, stockFilter, priceMin, priceMax, sortBy]);

  useEffect(() => {
    const t = setTimeout(fetchProducts, 350);
    return () => clearTimeout(t);
  }, [fetchProducts]);

  /* Open modal */
  const openProduct = (product) => {
    setSelected(product);
    setSelVariation(null);
    setQty(1);
    setCartMsg("");
  };

  const needsOptionSelection = (product) =>
    (product.variations?.length || 0) > 0;

  const quickAddToCart = (product) => {
    if (!product || product.stock_status === "out_of_stock") return;

    if (needsOptionSelection(product)) {
      openProduct(product);
      return;
    }

    const stock = Number(product.stock || 0);
    if (stock <= 0) return;

    // 👉 Send data to the official CartContext
    addToCart({
      key: `${product.id}`,
      product_id: product.id,
      variation_id: null,
      product_name: product.name,
      unit_price: parseFloat(product.online_price),
      production_cost: product.production_cost ?? 0,
      quantity: 1,
      max_stock: stock,
      image_url: product.image_url || null,
    });
  };

  /* Add to cart from Modal */
  const handleModalAddToCart = () => {
    if (!selected) return;
    const hasVariations = selected.variations?.length > 0;
    if (hasVariations && !selVariation) {
      setCartMsg("Please select a variation first.");
      return;
    }
    const key = selVariation
      ? `${selected.id}-${selVariation.id}`
      : `${selected.id}`;
    const price = selVariation?.selling_price ?? selected.online_price;
    const stock = selVariation?.stock ?? selected.stock;
    const name = selVariation
      ? `${selected.name} (${selVariation.variation_name})`
      : selected.name;

    // 👉 Send data to the official CartContext
    addToCart({
      key,
      product_id: selected.id,
      variation_id: selVariation?.id || null,
      product_name: name,
      unit_price: parseFloat(price),
      production_cost: selVariation?.unit_cost ?? selected.production_cost ?? 0,
      quantity: qty,
      max_stock: stock,
      image_url: selected.image_url || null,
    });

    setCartMsg(`✓ Added ${qty} × "${name}" to cart!`);
    setTimeout(() => setCartMsg(""), 3000);
  };

  const clearFilters = () => {
    setSearch("");
    setCatFilter("all");
    setTypeFilter("standard");
    setStockFilter("all");
    setPriceMin("");
    setPriceMax("");
    setSortBy("name_asc");
  };

  const hasActiveFilters =
    search ||
    catFilter !== "all" ||
    typeFilter !== "all" ||
    stockFilter !== "all" ||
    priceMin ||
    priceMax;

  const formatTypeLabel = (type) => {
    if (!type) return "";
    if (type === "standard") return "Ready-Made";
    if (type === "blueprint") return "Blueprint / Custom";
    return type.replace(/_/g, " ");
  };

  const formatStockLabel = (status) => {
    if (status === "in_stock") return "In Stock";
    if (status === "low_stock") return "Low Stock";
    if (status === "out_of_stock") return "Out of Stock";
    return status || "Available";
  };

  const getProductSpecs = (product) =>
    [
      formatTypeLabel(product.type),
      product.material || product.wood_type || product.finish,
      product.dimensions,
    ]
      .filter(Boolean)
      .slice(0, 3);

  const activeFilterChips = [
    search && {
      key: "search",
      label: `Search: ${search}`,
      onRemove: () => setSearch(""),
    },
    catFilter !== "all" && {
      key: "category",
      label: `Category: ${
        categories.find((cat) => String(cat.id) === catFilter)?.name ||
        "Selected"
      }`,
      onRemove: () => setCatFilter("all"),
    },
    typeFilter !== "all" && {
      key: "type",
      label: `Type: ${formatTypeLabel(typeFilter)}`,
      onRemove: () => setTypeFilter("all"),
    },
    stockFilter !== "all" && {
      key: "stock",
      label: `Availability: ${formatStockLabel(stockFilter)}`,
      onRemove: () => setStockFilter("all"),
    },
    priceMin && {
      key: "priceMin",
      label: `Min: ₱${Number(priceMin).toLocaleString("en-PH")}`,
      onRemove: () => setPriceMin(""),
    },
    priceMax && {
      key: "priceMax",
      label: `Max: ₱${Number(priceMax).toLocaleString("en-PH")}`,
      onRemove: () => setPriceMax(""),
    },
  ].filter(Boolean);

  return (
    <div>
      {/* Page hero */}
      <div className="catalog-breadcrumbs">
        <button type="button" onClick={() => navigate("/")}>
          Home
        </button>
        <span>/</span>
        <span>Products</span>
      </div>

      <div className="page-hero catalog-hero">
        <div className="catalog-hero-copy">
          <span className="catalog-eyebrow">Spiral Wood Collection</span>
          <h1>Product Catalog</h1>
          <p>
            Browse ready-made furniture and cabinet products designed for
            premium spaces, everyday storage, and custom woodwork needs.
          </p>

          <div className="catalog-trust-row">
            <span className="catalog-trust-pill">Premium Woodwork</span>
            <span className="catalog-trust-pill">Ready-Made &amp; Custom</span>
            <span className="catalog-trust-pill">Order Tracking Available</span>
            <span className="catalog-trust-pill">Warranty Supported</span>
          </div>
        </div>

        {/* 👉 THE ORANGE BOX WAS DELETED FROM HERE! */}
      </div>

      <div className="catalog-layout">
        {/* ── Sidebar ── */}
        <aside className="catalog-sidebar">
          <div className="sidebar-title">Filters</div>

          <div className="filter-section">
            <span className="filter-label">Category</span>
            <div className="filter-options">
              <button
                className={`filter-option ${catFilter === "all" ? "active" : ""}`}
                onClick={() => setCatFilter("all")}
              >
                All Categories{" "}
                <span className="filter-count">{products.length}</span>
              </button>
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  className={`filter-option ${catFilter === String(cat.id) ? "active" : ""}`}
                  onClick={() => setCatFilter(String(cat.id))}
                >
                  {cat.name}
                  <span className="filter-count">
                    {products.filter((p) => p.category_id === cat.id).length}
                  </span>
                </button>
              ))}
            </div>
          </div>

          

          <div className="filter-section">
            <span className="filter-label">Availability</span>
            <div className="filter-options">
              {[
                { val: "all", label: "All" },
                { val: "in_stock", label: "In Stock" },
                { val: "low_stock", label: "Low Stock" },
                { val: "out_of_stock", label: "Out of Stock" },
              ].map((opt) => (
                <button
                  key={opt.val}
                  className={`filter-option ${stockFilter === opt.val ? "active" : ""}`}
                  onClick={() => setStockFilter(opt.val)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-section">
            <span className="filter-label">Price Range (₱)</span>
            <div className="price-inputs">
              <input
                type="number"
                placeholder="Min"
                value={priceMin}
                onChange={(e) => setPriceMin(e.target.value)}
              />
              <span>—</span>
              <input
                type="number"
                placeholder="Max"
                value={priceMax}
                onChange={(e) => setPriceMax(e.target.value)}
              />
            </div>
          </div>

          {hasActiveFilters && (
            <button className="clear-filters" onClick={clearFilters}>
              ✕ Clear All Filters
            </button>
          )}
        </aside>

        {/* ── Main ── */}
        <div className="catalog-main">
          <div className="catalog-toolbar">
            <div className="catalog-search">
              <Search size={16} />
              <input
                type="text"
                placeholder="Search products..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="catalog-sort">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="name_asc">Name A–Z</option>
                <option value="name_desc">Name Z–A</option>
                <option value="price_asc">Price: Low to High</option>
                <option value="price_desc">Price: High to Low</option>
                <option value="newest">Newest First</option>
              </select>
            </div>
          </div>

          <div className="catalog-results-bar">
            {!loading && (
              <div className="catalog-results-info">
                Showing <strong>{products.length}</strong> product
                {products.length !== 1 ? "s" : ""}
                {hasActiveFilters && " (filtered)"}
              </div>
            )}

            {hasActiveFilters && (
              <button
                type="button"
                className="catalog-clear-inline"
                onClick={clearFilters}
              >
                Clear all filters
              </button>
            )}
          </div>

          {activeFilterChips.length > 0 && (
            <div className="catalog-active-filters">
              {activeFilterChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  className="active-filter-chip"
                  onClick={chip.onRemove}
                >
                  <span>{chip.label}</span> ×
                </button>
              ))}
            </div>
          )}

          <div className="product-grid">
            {loading ? (
              Array(8)
                .fill(0)
                .map((_, i) => <SkeletonCard key={i} />)
            ) : products.length === 0 ? (
              <div className="catalog-empty">
                <div className="catalog-empty-icon">🪵</div>
                <h3>No products found</h3>
                <p>Try adjusting your filters or search term.</p>
              </div>
            ) : (
              products.map((product) => (
                <div key={product.id} className="product-card">
                  {/* ── Product image ── */}
                  <div
                    className="product-img-box"
                    onClick={() => openProduct(product)}
                  >
                    <div className="product-card-badges">
                      {Boolean(Number(product.is_featured)) && (
                        <span className="badge badge-brown">Featured</span>
                      )}
                      {product.type === "blueprint" && (
                        <span className="badge badge-blue">Custom</span>
                      )}
                    </div>
                    <ProductImage
                      src={product.image_url}
                      alt={product.name}
                      className="product-img-fallback"
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                        width: "100%",
                        height: "100%",
                        position: "absolute",
                        inset: 0,
                      }}
                      imgStyle={{
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  </div>

                  <div className="product-card-body">
                    <div className="product-card-category">
                      {product.category || "Uncategorized"}
                    </div>

                    <div className="product-card-name">{product.name}</div>

                    <div className="product-card-desc">
                      {product.description || "Premium quality wood product."}
                    </div>

                    {getProductSpecs(product).length > 0 && (
                      <div className="product-card-specs">
                        {getProductSpecs(product).map((spec, index) => (
                          <span
                            key={`${product.id}-spec-${index}`}
                            className="product-spec-chip"
                          >
                            {spec}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="product-card-footer">
                      <div className="product-card-price-wrap">
                        <span className="product-card-price-label">
                          {product.type === "blueprint"
                            ? "Starting at"
                            : "Price"}
                        </span>
                        <div className="product-card-price">
                          ₱
                          {parseFloat(product.online_price).toLocaleString(
                            "en-PH",
                            { minimumFractionDigits: 2 },
                          )}
                        </div>
                      </div>

                      <StockBadge status={product.stock_status} />
                    </div>
                  </div>

                  <div className="product-card-actions">
                    {needsOptionSelection(product) ? (
                      <button
                        className="btn-view single-action"
                        onClick={() => openProduct(product)}
                      >
                        <Eye size={15} />
                        View Options
                      </button>
                    ) : (
                      <>
                        <button
                          className="btn-view"
                          onClick={() => openProduct(product)}
                        >
                          <Eye size={15} />
                          View Details
                        </button>

                        <button
                          className="btn-add-cart"
                          disabled={product.stock_status === "out_of_stock"}
                          onClick={() => quickAddToCart(product)}
                        >
                          <ShoppingCart size={15} />
                          {product.stock_status === "out_of_stock"
                            ? "Out of Stock"
                            : "Add to Cart"}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Product Detail Modal ── */}
      {selected && (
        <div
          className="modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setSelected(null)}
        >
          <div className="modal-box">
            {/* Modal image */}
            <div className="modal-img-box">
              <button className="modal-close" onClick={() => setSelected(null)}>
                ×
              </button>
              <ProductImage
                src={selected.image_url}
                alt={selected.name}
                style={{
                  width: "100%",
                  height: "100%",
                  borderRadius: "16px 16px 0 0",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                }}
                imgStyle={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  borderRadius: "16px 16px 0 0",
                }}
              />
            </div>

            <div className="modal-body">
              <div className="modal-category">
                {selected.category || "Uncategorized"}
              </div>
              <div className="modal-name">{selected.name}</div>
              <div className="modal-price">
                ₱
                {parseFloat(
                  selVariation?.selling_price ?? selected.online_price,
                ).toLocaleString("en-PH", { minimumFractionDigits: 2 })}
              </div>

              {selected.description && (
                <p className="modal-desc">{selected.description}</p>
              )}

              <div className="modal-meta">
                <div className="modal-meta-item">
                  <label>Type</label>
                  <span style={{ textTransform: "capitalize" }}>
                    {selected.type}
                  </span>
                </div>
                <div className="modal-meta-item">
                  <label>Availability</label>
                  <StockBadge status={selected.stock_status} />
                </div>
                <div className="modal-meta-item">
                  <label>Stock</label>
                  <span>{selected.stock} units</span>
                </div>
                <div className="modal-meta-item">
                  <label>Category</label>
                  <span>{selected.category || "—"}</span>
                </div>
              </div>

              {selected.variations?.length > 0 && (
                <div className="modal-variations">
                  <h4>Select Variation</h4>
                  <div className="variation-grid">
                    {selected.variations.map((v) => (
                      <button
                        key={v.id}
                        className={`var-chip ${selVariation?.id === v.id ? "selected" : ""}`}
                        onClick={() => setSelVariation(v)}
                        disabled={v.stock <= 0}
                      >
                        {v.variation_name}
                        {v.stock <= 0 && " (Out)"}
                        {v.stock > 0 &&
                          ` — ₱${parseFloat(v.selling_price).toLocaleString("en-PH")}`}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="modal-qty">
                <label>Quantity</label>
                <div className="qty-controls">
                  <button
                    className="qty-btn"
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                  >
                    <Minus size={14} />
                  </button>
                  <span className="qty-val">{qty}</span>
                  <button
                    className="qty-btn"
                    onClick={() => {
                      const maxStock = selVariation?.stock ?? selected.stock;
                      setQty((q) => Math.min(q + 1, maxStock));
                    }}
                  >
                    <Plus size={14} />
                  </button>
                </div>
              </div>

              {cartMsg && (
                <div
                  style={{
                    background: cartMsg.startsWith("✓") ? "#e8f5e9" : "#fce4ec",
                    color: cartMsg.startsWith("✓") ? "#2e7d32" : "#c62828",
                    padding: "10px 14px",
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 600,
                    marginBottom: 16,
                  }}
                >
                  {cartMsg}
                </div>
              )}

              <div className="modal-actions">
                <button
                  className="btn btn-primary"
                  style={{ flex: 1, justifyContent: "center" }}
                  disabled={selected.stock_status === "out_of_stock"}
                  onClick={handleModalAddToCart}
                >
                  <ShoppingCart size={16} /> Add to Cart
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => setSelected(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
