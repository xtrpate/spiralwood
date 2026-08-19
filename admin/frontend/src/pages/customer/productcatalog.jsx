import { useState, useEffect, useCallback } from "react";
import { Search, CheckCircle2, Filter, X } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";

import api, { buildAssetUrl } from "../../services/api";
import "./productcatalog.css";
import { useCart } from "./cartcontext";

const clampNumber = (value, min, max) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  if (num < min) return min;
  if (num > max) return max;
  return num;
};

const formatPeso = (value) => {
  const amount = Number(value || 0);
  const safeAmount = Number.isFinite(amount) ? amount : 0;

  return `\u20B1 ${safeAmount.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};
const formatTypeLabel = (type) => {
  const raw = String(type || "standard")
    .replace(/_/g, " ")
    .trim();
  if (!raw) return "Standard";
  return raw.replace(/\b\w/g, (char) => char.toUpperCase());
};

const UNMATCHED_CATEGORY_FILTER = "__unmatched_home_category__";

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
        objectFit: "contain",
        ...style,
        ...imgStyle,
      }}
      onError={() => setErrored(true)}
    />
  );
};

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

const StockBadge = ({ status, stock }) => {
  const stockCount = Number(stock || 0);
  const map = {
    in_stock: {
      cls: "stock-pill stock-available",
      label: `${stockCount} Stock`,
    },
    low_stock: {
      cls: "stock-pill stock-limited",
      label: `Only ${stockCount} Left`,
    },
    out_of_stock: {
      cls: "stock-pill stock-unavailable",
      label: "Out of Stock",
    },
  };

  const { cls, label } = map[status] || {
    cls: "stock-pill stock-available",
    label: `${stockCount} Available`,
  };

  if (status === "out_of_stock" || stockCount <= 0) {
    return <span className="stock-pill stock-unavailable">Out of Stock</span>;
  }

  return <span className={cls}>{label}</span>;
};

const isProductUnavailable = (product) =>
  !product ||
  product.stock_status === "out_of_stock" ||
  Number(product.stock || 0) <= 0;

export default function ProductCatalog() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [selectedImageUrl, setSelectedImageUrl] = useState("");
  const [isImageZoomOpen, setIsImageZoomOpen] = useState(false);
  const [total, setTotal] = useState(0);

  const { addToCart } = useCart();

  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState(() => {
    const requestedCategoryId = new URLSearchParams(location.search).get(
      "category_id",
    );

    return requestedCategoryId && /^\d+$/.test(requestedCategoryId)
      ? requestedCategoryId
      : "all";
  });
  const [stockFilter, setStockFilter] = useState("all");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [tempPriceMin, setTempPriceMin] = useState("");
  const [tempPriceMax, setTempPriceMax] = useState("");
  const [priceBounds, setPriceBounds] = useState({ min: 0, max: 0 });
  const [sortBy, setSortBy] = useState("name_asc");

  const [qty, setQty] = useState(1);
  const [cartMsg, setCartMsg] = useState("");
  const [urlMapped, setUrlMapped] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  const [toastMsg, setToastMsg] = useState("");
  const [isHiding, setIsHiding] = useState(false);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  const [mobileSortOpen, setMobileSortOpen] = useState(false);

  useEffect(() => {
    if (!toastMsg) return;

    // Start slide-out animation after 2.7 seconds
    const hideTimer = setTimeout(() => {
      setIsHiding(true);
    }, 2700);

    // Completely remove it from the screen at 3.0 seconds
    const removeTimer = setTimeout(() => {
      setToastMsg("");
      setIsHiding(false);
    }, 3000);

    return () => {
      clearTimeout(hideTimer);
      clearTimeout(removeTimer);
    };
  }, [toastMsg]);

  const fetchProducts = useCallback(async () => {
    setLoading(true);

    try {
      const params = {
        type: "standard",
        sort: sortBy,
      };

      if (search) params.q = search;
      if (catFilter !== "all") {
        params.category_id =
          catFilter === UNMATCHED_CATEGORY_FILTER ? -1 : catFilter;
      }
      if (stockFilter !== "all") params.stock_status = stockFilter;
      if (priceMin !== "") params.price_min = priceMin;
      if (priceMax !== "") params.price_max = priceMax;

      const res = await api.get("/customer/products", { params });

      const rawProducts = Array.isArray(res.data?.products)
        ? res.data.products
        : [];

      const visibleProducts = rawProducts.filter(
        (item) => String(item?.type || "").toLowerCase() !== "blueprint",
      );

      const backendCategories = Array.isArray(res.data?.categories)
        ? res.data.categories
        : [];

      const nextMin = Number(res.data?.priceRange?.min || 0);
      const nextMax = Number(res.data?.priceRange?.max || 0);

      setProducts(visibleProducts);
      setCategories(backendCategories);
      setTotal(Number(res.data?.total || visibleProducts.length || 0));
      setPriceBounds({
        min: nextMin,
        max: nextMax,
      });

      setTempPriceMin((prev) => {
        if (!nextMax) return "";
        if (priceMin !== "" || priceMax !== "") {
          const current = Number(prev || priceMin || nextMin);
          return String(clampNumber(current, nextMin, nextMax));
        }
        return "";
      });

      setTempPriceMax((prev) => {
        if (!nextMax) return "";
        if (priceMin !== "" || priceMax !== "") {
          const current = Number(prev || priceMax || nextMax);
          return String(clampNumber(current, nextMin, nextMax));
        }
        return "";
      });
    } catch (err) {
      console.error(err);
      setProducts([]);
      setCategories([]);
      setTotal(0);
      toast.error(
        err?.response?.data?.message || "Failed to load catalog products.",
      );
    } finally {
      setLoading(false);
    }
  }, [search, catFilter, stockFilter, priceMin, priceMax, sortBy]);

  useEffect(() => {
    if (mobileFilterOpen) return;
    const timer = setTimeout(fetchProducts, 300);
    return () => clearTimeout(timer);
  }, [fetchProducts, mobileFilterOpen]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const q = params.get("q") || "";
    const categoryName = params.get("category");
    const requestedCategoryId = params.get("category_id");

    setSearch(q);

    if (requestedCategoryId && /^\d+$/.test(requestedCategoryId)) {
      setCatFilter(requestedCategoryId);
    } else if (!categoryName) {
      setCatFilter("all");
    }

    setUrlMapped(false);
  }, [location.search]);

  useEffect(() => {
    if (urlMapped || categories.length === 0) return;

    const params = new URLSearchParams(location.search);
    const categoryName = params.get("category");
    const requestedCategoryId = params.get("category_id");

    if (requestedCategoryId && /^\d+$/.test(requestedCategoryId)) {
      const idMatch = categories.find(
        (cat) => String(cat.id) === requestedCategoryId,
      );

      setCatFilter(
        idMatch ? String(idMatch.id) : UNMATCHED_CATEGORY_FILTER,
      );
      setUrlMapped(true);
      return;
    }

    if (categoryName) {
      const match = categories.find(
        (cat) =>
          String(cat.name || "").trim().toLowerCase() ===
          categoryName.trim().toLowerCase(),
      );

      setCatFilter(
        match ? String(match.id) : UNMATCHED_CATEGORY_FILTER,
      );
    } else {
      setCatFilter("all");
    }

    setUrlMapped(true);
  }, [categories, location.search, urlMapped]);

  const openProduct = async (product) => {
    setSelected(product);
    setSelectedImageUrl(product?.image_url || "");
    setIsImageZoomOpen(false);
    setQty(isProductUnavailable(product) ? 0 : 1);
    setCartMsg("");

    try {
      const { data } = await api.get(`/customer/products/${product.id}`);

      setSelected((current) =>
        current?.id === product.id
          ? {
              ...current,
              ...data,
            }
          : current,
      );
    } catch (err) {
      // Keep the already-open catalog product as a safe one-image fallback.
      console.error("[product gallery detail]", err);
    }
  };

  const quickAddToCart = (product) => {
    if (isProductUnavailable(product)) return;

    const stock = Number(product.stock || 0);
    if (stock <= 0) return;

    addToCart({
      key: `${product.id}`,
      product_id: product.id,
      product_name: product.name,
      unit_price: parseFloat(product.online_price),
      production_cost: product.production_cost ?? 0,
      quantity: 1,
      max_stock: stock,
      image_url: product.image_url || null,
    });

    setToastMsg(`"${product.name}" successfully added to your cart!`);
    setIsHiding(false);
  };

  const handleCardAddToCart = (product) => {
    if (isProductUnavailable(product)) return;

    quickAddToCart(product);
  };

  const handleModalAddToCart = () => {
    if (!selected) return;

    const key = `${selected.id}`;
    const price = selected.online_price;
    const stock = Number(selected.stock ?? 0);
    const name = selected.name;

    if (stock <= 0) {
      setCartMsg("This item is currently out of stock.");
      return;
    }

    addToCart({
      key,
      product_id: selected.id,
      product_name: name,
      unit_price: parseFloat(price),
      production_cost: selected.production_cost ?? 0,
      quantity: Number(qty || 1),
      max_stock: stock,
      image_url: selected.image_url || null,
    });

    setToastMsg(`"${name}" successfully added to your cart!`);
    setIsHiding(false);
    setSelected(null);
  };

  const clearFilters = () => {
    setSearch("");
    setCatFilter("all");
    setStockFilter("all");
    setPriceMin("");
    setPriceMax("");
    setSortBy("name_asc");

    setTempPriceMin("");
    setTempPriceMax("");

    navigate(location.pathname, { replace: true });
  };

  const applyPriceFilter = () => {
    if (!priceBounds.max) return;

    let nextMin = Number(tempPriceMin || priceBounds.min);
    let nextMax = Number(tempPriceMax || priceBounds.max);

    if (!Number.isFinite(nextMin)) nextMin = priceBounds.min;
    if (!Number.isFinite(nextMax)) nextMax = priceBounds.max;

    nextMin = clampNumber(nextMin, priceBounds.min, priceBounds.max);
    nextMax = clampNumber(nextMax, priceBounds.min, priceBounds.max);

    if (nextMin > nextMax) {
      [nextMin, nextMax] = [nextMax, nextMin];
    }

    setTempPriceMin(String(nextMin));
    setTempPriceMax(String(nextMax));

    if (nextMin === priceBounds.min && nextMax === priceBounds.max) {
      setPriceMin("");
      setPriceMax("");
      return;
    }

    setPriceMin(String(nextMin));
    setPriceMax(String(nextMax));
  };

  const resetPriceFilter = () => {
    if (!priceBounds.max) return;
    setPriceMin("");
    setPriceMax("");
    setTempPriceMin("");
    setTempPriceMax("");
  };

  const hasActiveFilters =
    search ||
    catFilter !== "all" ||
    stockFilter !== "all" ||
    priceMin !== "" ||
    priceMax !== "";

  const sliderMin = Number(priceBounds.min || 0);
  const sliderMax = Number(priceBounds.max || 0);
  const safeSliderMax = sliderMax > sliderMin ? sliderMax : sliderMin + 1;

  const currentMin = clampNumber(
    Number(tempPriceMin || sliderMin),
    sliderMin,
    safeSliderMax,
  );
  const currentMax = clampNumber(
    Number(tempPriceMax || safeSliderMax),
    sliderMin,
    safeSliderMax,
  );

  const normalizedMin = Math.min(currentMin, currentMax);
  const normalizedMax = Math.max(currentMin, currentMax);

  const minPercent =
    ((normalizedMin - sliderMin) / (safeSliderMax - sliderMin)) * 100;
  const maxPercent =
    ((normalizedMax - sliderMin) / (safeSliderMax - sliderMin)) * 100;

  const selectedStock = Number(selected?.stock || 0);
  const selectedUnavailable = selected
    ? isProductUnavailable(selected)
    : false;

  const selectedImages = selected
    ? Array.isArray(selected.images) && selected.images.length > 0
      ? selected.images.filter((item) => item?.image_url)
      : selected.image_url
        ? [
            {
              id: null,
              image_url: selected.image_url,
              sort_order: 0,
              is_primary: 1,
            },
          ]
        : []
    : [];

  const detailRows = selected
    ? [
        { label: "CATEGORY", value: selected.category || "—" },
        {
          label: "STOCK",
          value: `${Number(selected.stock || 0).toLocaleString("en-PH")} units`,
        },
        {
          label: "WARRANTY",
          value: "1 year",
        },
      ]
    : [];

  return (
    <div className="catalog-page-shell">
      <div className="premium-toast-container">
        {toastMsg && (
          <div className={`premium-toast ${isHiding ? "hiding" : ""}`}>
            <CheckCircle2 size={20} color="#111111" />
            <span>{toastMsg}</span>
          </div>
        )}
      </div>

      <div className="catalog-page-head">
        <div className="catalog-page-copy">
          <h1>Product Catalog</h1>
          <p>
            Browse ready-made furniture and cabinet products designed for
            premium spaces, everyday storage, and custom woodwork needs.
          </p>
        </div>

        <div className="catalog-page-meta">
          {!loading && (
            <div className="catalog-results-info">
              Showing {products.length}
              {total && total !== products.length ? ` of ${total}` : ""} product
              {products.length !== 1 ? "s" : ""}
            </div>
          )}

          <div className="catalog-sort">
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
              <option value="name_asc">Name A–Z</option>
              <option value="name_desc">Name Z–A</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
              <option value="newest">Newest First</option>
            </select>
          </div>
        </div>
      </div>

      <div className="catalog-layout">
        <aside className="catalog-sidebar">
          <div className="sidebar-title">Refine by Category</div>

          <div className="filter-section">
            <div className="filter-options">
              <button
                type="button"
                className={`filter-option ${catFilter === "all" ? "active" : ""}`}
                onClick={() => setCatFilter("all")}
              >
                <span>All Categories</span>
                <span className="filter-count">{total}</span>
              </button>

              {categories.map((cat) => (
                <button
                  type="button"
                  key={cat.id}
                  className={`filter-option ${
                    catFilter === String(cat.id) ? "active" : ""
                  }`}
                  onClick={() => setCatFilter(String(cat.id))}
                >
                  <span>{cat.name}</span>
                  <span className="filter-count">
                    {Number(cat.product_count || 0)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="filter-section">
            <div className="sidebar-title sidebar-subtitle">
              Filter by Price
            </div>

            <div className="price-slider-shell">
              <div className="price-inputs">
                <input
                  type="number"
                  min={sliderMin}
                  max={safeSliderMax}
                  placeholder="MIN"
                  value={tempPriceMin}
                  onChange={(e) => setTempPriceMin(e.target.value)}
                />
                <span>—</span>
                <input
                  type="number"
                  min={sliderMin}
                  max={safeSliderMax}
                  placeholder="MAX"
                  value={tempPriceMax}
                  onChange={(e) => setTempPriceMax(e.target.value)}
                />
              </div>

              <div className="price-filter-actions">
                <button
                  type="button"
                  className="price-apply-btn"
                  onClick={applyPriceFilter}
                  disabled={!sliderMax}
                >
                  Filter
                </button>

                {(priceMin !== "" || priceMax !== "") && (
                  <button
                    type="button"
                    className="price-reset-btn"
                    onClick={resetPriceFilter}
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              className="clear-filters"
              onClick={clearFilters}
            >
              Clear All Filters
            </button>
          )}
        </aside>

        <div className="catalog-main">
          <div className="catalog-toolbar">
            <div className="catalog-search-shell">
              <div className="catalog-search">
                <Search size={16} />
                <input
                  type="text"
                  placeholder="Search products..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setTimeout(() => setSearchFocused(false), 200)}
                />
              </div>

              {searchFocused && search.trim().length > 0 && (
                <div className="catalog-search-dropdown">
                  {loading ? (
                    <div className="catalog-search-item-empty">
                      Searching...
                    </div>
                  ) : products.length === 0 ? (
                    <div className="catalog-search-item-empty">
                      No results found for "{search}"
                    </div>
                  ) : (
                    <>
                      {products.slice(0, 6).map((product) => (
                        <button
                          key={product.id}
                          type="button"
                          className="catalog-search-item"
                          onClick={() => {
                            openProduct(product);
                            setSearchFocused(false);
                          }}
                        >
                          <div className="catalog-search-item-thumb">
                            <img
                              src={buildAssetUrl(product.image_url)}
                              alt={product.name}
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                          </div>

                          <div className="catalog-search-item-copy">
                            <div className="catalog-search-item-name">
                              {product.name}
                            </div>
                            <div className="catalog-search-item-cat">
                              {product.category || "Uncategorized"}
                            </div>
                          </div>

                          <div className="catalog-search-item-price">
                            {formatPeso(product.online_price)}
                          </div>
                        </button>
                      ))}

                      {products.length > 6 && (
                        <div className="catalog-search-item-more">
                          View all {products.length} results in the catalog
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            <button
              className="mobile-filter-toggle"
              onClick={() => setMobileFilterOpen(true)}
            >
              <Filter size={20} />
            </button>

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
                  <button
                    type="button"
                    className="product-card-image-button"
                    onClick={() => openProduct(product)}
                  >
                    <div className="product-img-box">
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
                          objectPosition: "center",
                          padding: 0,
                        }}
                      />
                    </div>
                  </button>
                  <div className="product-card-body">
                    <div className="product-card-category">
                      {product.category || "Uncategorized"}
                    </div>

                    <div className="product-card-name">{product.name}</div>

                    <div className="product-card-price">
                      {formatPeso(product.online_price)}
                    </div>

                    <div className="product-card-stock-wrap">
                      <StockBadge
                        status={product.stock_status}
                        stock={product.stock}
                      />
                    </div>

                    <div className="product-card-actions">
                      <button
                        type="button"
                        className="btn-view"
                        onClick={() => openProduct(product)}
                      >
                        View
                      </button>

                      <button
                        type="button"
                        className="btn-add-cart"
                        disabled={isProductUnavailable(product)}
                        onClick={() => handleCardAddToCart(product)}
                      >
                        {isProductUnavailable(product)
                          ? "Unavailable"
                          : "Add to Cart"}
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {mobileFilterOpen && (
        <div
          className="mobile-filter-overlay"
          onClick={() => setMobileFilterOpen(false)}
        >
          <div
            className="mobile-filter-drawer"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mobile-filter-header">
              <h3>Filters & Sort</h3>
              <button onClick={() => setMobileFilterOpen(false)}>
                <X size={24} />
              </button>
            </div>

            <div className="mobile-filter-body">
              <div className="filter-section">
                <div className="sidebar-title">Sort By</div>
                <div className="mobile-custom-sort">
                  <button
                    type="button"
                    className="mobile-custom-sort-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMobileSortOpen((prev) => !prev);
                    }}
                  >
                    <span>
                      {{
                        name_asc: "Name A–Z",
                        name_desc: "Name Z–A",
                        price_asc: "Price: Low to High",
                        price_desc: "Price: High to Low",
                        newest: "Newest First",
                      }[sortBy] || "Name A–Z"}
                    </span>

                    <span className="mobile-custom-sort-arrow">⌄</span>
                  </button>

                  {mobileSortOpen && (
                    <div className="mobile-custom-sort-menu">
                      {[
                        ["name_asc", "Name A–Z"],
                        ["name_desc", "Name Z–A"],
                        ["price_asc", "Price: Low to High"],
                        ["price_desc", "Price: High to Low"],
                        ["newest", "Newest First"],
                      ].map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          className={`mobile-custom-sort-option ${
                            sortBy === value ? "active" : ""
                          }`}
                          onClick={() => {
                            setSortBy(value);
                            setMobileSortOpen(false);
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="filter-section">
                <div className="sidebar-title">Refine by Category</div>
                <div className="filter-options">
                  <button
                    type="button"
                    className={`filter-option ${catFilter === "all" ? "active" : ""}`}
                    onClick={() => setCatFilter("all")}
                  >
                    <span>All Categories</span>
                    <span className="filter-count">{total}</span>
                  </button>
                  {categories.map((cat) => (
                    <button
                      type="button"
                      key={cat.id}
                      className={`filter-option ${
                        catFilter === String(cat.id) ? "active" : ""
                      }`}
                      onClick={() => setCatFilter(String(cat.id))}
                    >
                      <span>{cat.name}</span>
                      <span className="filter-count">
                        {Number(cat.product_count || 0)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="filter-section">
                <div className="sidebar-title">Filter by Price</div>
                <div className="price-slider-shell">
                  <div className="price-inputs">
                    <input
                      type="number"
                      min={sliderMin}
                      max={safeSliderMax}
                      placeholder="MIN"
                      value={tempPriceMin}
                      onChange={(e) => setTempPriceMin(e.target.value)}
                    />
                    <span>—</span>
                    <input
                      type="number"
                      min={sliderMin}
                      max={safeSliderMax}
                      placeholder="MAX"
                      value={tempPriceMax}
                      onChange={(e) => setTempPriceMax(e.target.value)}
                    />
                  </div>
                  <div className="price-filter-actions">
                    <button
                      type="button"
                      className="price-apply-btn"
                      onClick={applyPriceFilter}
                      disabled={!sliderMax}
                    >
                      Apply Price
                    </button>
                    {(priceMin !== "" || priceMax !== "") && (
                      <button
                        type="button"
                        className="price-reset-btn"
                        onClick={resetPriceFilter}
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="mobile-filter-footer">
              <button
                className="clear-filters"
                onClick={clearFilters}
                disabled={!hasActiveFilters}
                style={{
                  opacity: hasActiveFilters ? 1 : 0.4,
                  cursor: hasActiveFilters ? "pointer" : "not-allowed",
                }}
              >
                Clear All Filters
              </button>
              <button
                className="price-apply-btn"
                onClick={() => setMobileFilterOpen(false)}
              >
                Show Results
              </button>
            </div>
          </div>
        </div>
      )}

      {selected && (
        <div
          className="detail-modal-overlay"
          onClick={(e) => e.target === e.currentTarget && setSelected(null)}
        >
          <div className="detail-modal">
            <div className="detail-modal-left">
              <button
                type="button"
                className="detail-main-image detail-main-image-zoom-trigger"
                onClick={() => setIsImageZoomOpen(true)}
                aria-label={`View larger image of ${selected.name}`}
              >
                <ProductImage
                  src={selectedImageUrl || selected.image_url}
                  alt={selected.name}
                  className="product-img-fallback"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    width: "100%",
                    height: "100%",
                  }}
                  imgStyle={{
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                    padding: "28px",
                  }}
                />

                <span className="detail-image-enlarge-label">View larger</span>
              </button>

              {selectedImages.length > 1 ? (
                <div className="detail-thumb-row product-gallery-row">
                  {selectedImages.map((image, index) => (
                    <button
                      key={image.id || `${image.image_url}-${index}`}
                      type="button"
                      className={`detail-thumb ${
                        (selectedImageUrl || selected.image_url) ===
                        image.image_url
                          ? "active"
                          : ""
                      }`}
                      onClick={() => setSelectedImageUrl(image.image_url)}
                      aria-label={`View ${selected.name} image ${index + 1}`}
                    >
                      <ProductImage
                        src={image.image_url}
                        alt={`${selected.name} view ${index + 1}`}
                        className="product-img-fallback"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: "100%",
                          height: "100%",
                        }}
                        imgStyle={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          padding: 0,
                        }}
                      />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="detail-modal-right">
              <div className="detail-category">
                {selected.category || "Uncategorized"}
              </div>

              <h2 className="detail-name">{selected.name}</h2>

              <div className="detail-price">
                {formatPeso(selected.online_price)}
              </div>

              {selected.description ? (
                <p className="detail-description">{selected.description}</p>
              ) : null}

              <div className="detail-section">
                <div className="detail-info-table">
                  {detailRows.map((row) => (
                    <div key={row.label} className="detail-info-row">
                      <span>{row.label}</span>
                      <strong>{row.value}</strong>
                    </div>
                  ))}
                </div>
              </div>

              <div className="detail-action-row">
                <div className="detail-qty-block">
                  <span className="detail-qty-label">Quantity</span>

                  <div className="qty-controls">
                    <button
                      type="button"
                      className="qty-btn"
                      disabled={selectedUnavailable}
                      onClick={() =>
                        setQty((value) => Math.max(1, Number(value || 1) - 1))
                      }
                    >
                      -
                    </button>

                    <input
                      type="number"
                      className="qty-val"
                      min={selectedUnavailable ? 0 : 1}
                      max={Math.max(selectedStock, 1)}
                      value={qty}
                      disabled={selectedUnavailable}
                      onChange={(e) => {
                        const newQty = parseInt(e.target.value, 10);
                        const maxStock = Math.max(selectedStock, 1);
                        if (!isNaN(newQty) && newQty > 0) {
                          setQty(Math.min(newQty, maxStock));
                        } else if (e.target.value === "") {
                          setQty("");
                        }
                      }}
                      onBlur={() => {
                        if (!qty || Number(qty) < 1) setQty(1);
                      }}
                    />

                    <button
                      type="button"
                      className="qty-btn"
                      disabled={selectedUnavailable}
                      onClick={() => {
                        const maxStock = Math.max(selectedStock, 1);
                        setQty((value) =>
                          Math.min(Number(value || 1) + 1, maxStock),
                        );
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="detail-button-row">
                  <button
                    type="button"
                    className="detail-add-btn"
                    disabled={selectedUnavailable}
                    onClick={handleModalAddToCart}
                  >
                    {selectedUnavailable ? "Unavailable" : "Add to Cart"}
                  </button>

                  <button
                    type="button"
                    className="detail-close-btn"
                    onClick={() => setSelected(null)}
                  >
                    Close
                  </button>
                </div>
              </div>

              {cartMsg ? <div className="detail-message">{cartMsg}</div> : null}
            </div>
          </div>
        </div>
      )}

      {selected && isImageZoomOpen && (
        <div
          className="product-image-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`${selected.name} enlarged product image`}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setIsImageZoomOpen(false);
            }
          }}
        >
          <button
            type="button"
            className="product-image-lightbox-close"
            onClick={() => setIsImageZoomOpen(false)}
            aria-label="Close enlarged product image"
          >
            &times;
          </button>

          <div className="product-image-lightbox-stage">
            <ProductImage
              src={selectedImageUrl || selected.image_url}
              alt={`${selected.name} enlarged`}
              className="product-img-fallback"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
                height: "100%",
              }}
              imgStyle={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                padding: 0,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
