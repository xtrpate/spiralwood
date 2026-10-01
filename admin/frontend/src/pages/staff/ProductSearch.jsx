import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import api, { buildAssetUrl } from "../../services/api";
import {
  Search,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  ArrowRight,
  X,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import "./ProductSearch.css";

const formatCurrency = (value) =>
  Number(value || 0).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const formatStockStatus = (value) =>
  String(value || "in_stock")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());

const POS_QR_STORAGE_KEY = "pos_qr_attempt";

const readStoredQrAttempt = () => {
  try {
    const raw = sessionStorage.getItem(POS_QR_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

const readStoredCart = () => {
  try {
    const raw = sessionStorage.getItem("pos_cart");
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const reconcileCartWithProducts = (currentCart, currentProducts) => {
  const productsById = new Map(
    (Array.isArray(currentProducts) ? currentProducts : []).map((product) => [
      Number(product?.id),
      product,
    ]),
  );

  let changed = false;
  let removedCount = 0;
  let adjustedCount = 0;
  const nextCart = [];

  for (const item of Array.isArray(currentCart) ? currentCart : []) {
    const productId = Number(item?.product_id);
    const product = productsById.get(productId);
    const price = Number(product?.price);
    const stock = Math.max(0, Math.floor(Number(product?.stock ?? 0)));

    if (
      !Number.isSafeInteger(productId) ||
      productId <= 0 ||
      !product ||
      product.cashier_sale_available !== true ||
      !Number.isFinite(price) ||
      price <= 0 ||
      stock <= 0
    ) {
      changed = true;
      removedCount += 1;
      continue;
    }

    const oldQuantity = Number(item?.quantity);
    const safeQuantity =
      Number.isSafeInteger(oldQuantity) && oldQuantity > 0 ? oldQuantity : 1;
    const quantity = Math.min(safeQuantity, stock);

    const nextItem = {
      ...item,
      key: String(product.id),
      product_id: product.id,
      product_name: product.name,
      unit_price: price,
      quantity,
      max_stock: stock,
      image_url: product.image_url || item?.image_url || "",
      wood_type: product.material || item?.wood_type || "",
      dimensions: product.dimensions || item?.dimensions || "",
    };

    const itemChanged =
      String(item?.key) !== String(nextItem.key) ||
      Number(item?.product_id) !== Number(nextItem.product_id) ||
      String(item?.product_name || "") !== String(nextItem.product_name || "") ||
      Number(item?.unit_price) !== Number(nextItem.unit_price) ||
      Number(item?.quantity) !== Number(nextItem.quantity) ||
      Number(item?.max_stock) !== Number(nextItem.max_stock) ||
      String(item?.image_url || "") !== String(nextItem.image_url || "");

    if (itemChanged) {
      changed = true;
      adjustedCount += 1;
    }

    nextCart.push(nextItem);
  }

  return {
    cart: nextCart,
    changed,
    removedCount,
    adjustedCount,
  };
};

export default function ProductSearch() {
  const [query, setQuery] = useState("");
  const [allProducts, setAllProducts] = useState([]);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState(() => {
    try {
      const saved = sessionStorage.getItem("pos_cart");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [activeQrAttempt] = useState(() => readStoredQrAttempt());
  const cartLocked = Boolean(activeQrAttempt?.checkout_token);
  const [searching, setSearching] = useState(true);
  const [searchMessage, setSearchMessage] = useState("");
  const [searchMessageType, setSearchMessageType] = useState("info");
  const cartRefreshNoticeRef = useRef("");
  const [brokenImages, setBrokenImages] = useState({});
  const [mobileCartOpen, setMobileCartOpen] = useState(false);

  const navigate = useNavigate();

  const showMessage = useCallback((message, type = "info") => {
    setSearchMessage(message);
    setSearchMessageType(type);
  }, []);

  const clearMessage = useCallback(() => {
    setSearchMessage("");
    setSearchMessageType("info");
  }, []);

  useEffect(() => {
    const notice = cartRefreshNoticeRef.current;
    if (!notice) return;

    cartRefreshNoticeRef.current = "";
    showMessage(notice, "info");
  }, [cart, showMessage]);

  const normalizeProduct = useCallback((product) => {
    const stock = Number(product?.stock ?? 0);
    const salePrice = Number(product?.price ?? 0);
    const cashierSaleAvailable =
      product?.cashier_sale_available !== false &&
      Number.isFinite(salePrice) &&
      salePrice > 0;
    let stockStatus = String(product?.stock_status ?? "").toLowerCase();

    if (!stockStatus) {
      if (stock <= 0) {
        stockStatus = "out_of_stock";
      } else if (stock <= 5) {
        stockStatus = "low_stock";
      } else {
        stockStatus = "in_stock";
      }
    }

    // 👉 RULE 7: Smart Dimension Formatting
    const w = product?.width_mm || product?.width || 0;
    const h = product?.height_mm || product?.height || 0;
    const d = product?.depth_mm || product?.depth || 0;
    const dims =
      w || h || d ? `${w}W x ${d}D x ${h}H mm` : product?.dimensions || "";

    return {
      ...product,
      type: String(product?.type || "standard").toLowerCase(),
      name: product?.name || "Unnamed Product",
      barcode: String(product?.barcode ?? "").trim(),
      stock,
      price: cashierSaleAvailable ? salePrice : null,
      cashier_sale_available: cashierSaleAvailable,
      image_url: buildAssetUrl(
        product?.image_url ||
          product?.product_image ||
          product?.image ||
          product?.photo ||
          "",
      ),
      category:
        product?.category_name ||
        product?.category ||
        product?.type ||
        "Product",
      stock_status: stockStatus,

      // 👉 RULE 7: Extract Rich Details
      description: product?.description || "",
      material: product?.material || product?.wood_type || "",
      dimensions: dims,
    };
  }, []);

  const loadProducts = useCallback(async () => {
    setSearching(true);

    try {
      const res = await api.get("/pos/products");
      const rows = Array.isArray(res.data)
        ? res.data
            .map(normalizeProduct)
            .filter(
              (product) =>
                String(product?.type || "standard").toLowerCase() ===
                "standard",
            )
        : [];

      setAllProducts(rows);
      setProducts(rows);
    } catch (error) {
      console.error("LOAD PRODUCTS ERROR:", error);
      setAllProducts([]);
      setProducts([]);
      showMessage(
        "Unable to load products right now. Please refresh and try again.",
        "error",
      );
    } finally {
      setSearching(false);
    }
  }, [normalizeProduct, showMessage]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  // Revalidate a persisted cashier cart against the live product rows when
  // Product Search opens. This is deliberately skipped while an online/QR
  // attempt owns the cart; that lifecycle is handled separately.
  useEffect(() => {
    if (cartLocked) return undefined;

    const storedCart = readStoredCart();
    const productIds = [
      ...new Set(
        storedCart
          .map((item) => Number(item?.product_id))
          .filter(
            (productId) =>
              Number.isSafeInteger(productId) && productId > 0,
          ),
      ),
    ];

    if (productIds.length === 0) return undefined;

    let active = true;

    api
      .get("/pos/products", {
        params: { ids: productIds.join(",") },
      })
      .then((response) => {
        if (!active) return;

        const liveProducts = Array.isArray(response.data)
          ? response.data.map(normalizeProduct)
          : [];
        const requestedProductIds = new Set(productIds);

        // Use the latest React cart state when the request returns. This keeps
        // add/remove/quantity actions made while the refresh was in flight.
        setCart((currentCart) => {
          const targetedCurrentCart = currentCart.filter((item) =>
            requestedProductIds.has(Number(item?.product_id)),
          );
          const reconciliation = reconcileCartWithProducts(
            targetedCurrentCart,
            liveProducts,
          );

          if (!reconciliation.changed) return currentCart;

          const refreshedById = new Map(
            reconciliation.cart.map((item) => [
              Number(item.product_id),
              item,
            ]),
          );

          const nextCart = currentCart.flatMap((item) => {
            const productId = Number(item?.product_id);

            // A product added after this refresh request began was never part
            // of the request, so preserve it exactly as the cashier entered it.
            if (!requestedProductIds.has(productId)) {
              return [item];
            }

            const refreshedItem = refreshedById.get(productId);

            // If the requested product became unavailable, remove only that
            // product. A product the cashier already removed is not recreated.
            return refreshedItem ? [refreshedItem] : [];
          });

          const details = [];
          if (reconciliation.adjustedCount > 0) {
            details.push(
              `${reconciliation.adjustedCount} cart item(s) were refreshed to the latest price or stock.`,
            );
          }
          if (reconciliation.removedCount > 0) {
            details.push(
              `${reconciliation.removedCount} unavailable cart item(s) were removed.`,
            );
          }

          cartRefreshNoticeRef.current = details.join(" ");
          return nextCart;
        });
      })
      .catch((error) => {
        if (!active) return;
        console.error("CART REFRESH ERROR:", error);
        showMessage(
          "The saved cart could not be refreshed. Review the products before checkout.",
          "error",
        );
      });

    return () => {
      active = false;
    };
  }, [cartLocked, normalizeProduct, showMessage]);

  useEffect(() => {
    sessionStorage.setItem("pos_cart", JSON.stringify(cart));
  }, [cart]);

  // WISDOM CASHIER CLEAN R5
  // Mobile cart presentation only. Existing cart data and checkout stay intact.
  useEffect(() => {
    if (cart.length === 0 && mobileCartOpen) {
      setMobileCartOpen(false);
    }
  }, [cart.length, mobileCartOpen]);

  useEffect(() => {
    if (!mobileCartOpen) return undefined;

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setMobileCartOpen(false);
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileCartOpen]);

  useEffect(() => {
    const trimmed = query.trim().toLowerCase();

    if (!trimmed) {
      setProducts(allProducts);
      setSearching(false);
      return;
    }

    setSearching(true);

    const timer = setTimeout(() => {
      const filtered = allProducts.filter((product) => {
        const haystacks = [
          product.name,
          product.category,
          product.material, // 👉 Let them search by wood type too!
        ];

        return haystacks.some((value) =>
          String(value || "")
            .toLowerCase()
            .includes(trimmed),
        );
      });

      setProducts(filtered);
      setSearching(false);
    }, 250);

    return () => clearTimeout(timer);
  }, [query, allProducts]);

  const addToCart = useCallback(
    (product) => {
      if (cartLocked) {
        showMessage(
          "An online payment attempt is active. Return to that payment before changing the cart.",
          "error",
        );
        return false;
      }

      const key = `${product.id}`;
      const stockLimit = Number(product?.stock ?? 0);
      const displayName = product.name;
      const unitPrice = Number(product?.price);

      if (
        product?.cashier_sale_available !== true ||
        !Number.isFinite(unitPrice) ||
        unitPrice <= 0
      ) {
        showMessage(
          `${displayName} does not have a valid selling price for cashier sale.`,
          "error",
        );
        return false;
      }

      if (stockLimit <= 0) {
        showMessage(`${displayName} is currently out of stock.`, "error");
        return false;
      }

      let feedback = "";
      let feedbackType = "success";
      let added = false;

      setCart((prev) => {
        const existing = prev.find((item) => item.key === key);

        if (existing) {
          if (existing.quantity >= existing.max_stock) {
            feedback = `Only ${existing.max_stock} unit(s) are available for ${existing.product_name}.`;
            feedbackType = "error";
            return prev;
          }

          added = true;
          feedback = `${existing.product_name} quantity has been updated in the cart.`;

          return prev.map((item) =>
            item.key === key ? { ...item, quantity: item.quantity + 1 } : item,
          );
        }

        added = true;
        feedback = `${displayName} has been added to the cart.`;

        return [
          ...prev,
          {
            key,
            product_id: product.id,
            product_name: displayName,
            unit_price: unitPrice,
            quantity: 1,
            max_stock: stockLimit,
            image_url: product.image_url || "",

            // 👉 RULE 7: Send details to checkout screen
            wood_type: product.material,
            dimensions: product.dimensions,
          },
        ];
      });

      if (feedback) {
        showMessage(feedback, feedbackType);
      }

      return added;
    },
    [cartLocked, showMessage],
  );

  const updateQty = useCallback(
    (key, delta) => {
      if (cartLocked) {
        showMessage(
          "The cart is locked while an online payment attempt is active.",
          "error",
        );
        return;
      }

      let feedback = "";
      let feedbackType = "error";

      setCart((prev) =>
        prev
          .map((item) => {
            if (item.key !== key) return item;

            const newQty = item.quantity + delta;

            if (newQty <= 0) {
              return null;
            }

            if (newQty > item.max_stock) {
              feedback = `Only ${item.max_stock} unit(s) are available for ${item.product_name}.`;
              return item;
            }

            return { ...item, quantity: newQty };
          })
          .filter(Boolean),
      );

      if (feedback) {
        showMessage(feedback, feedbackType);
      }
    },
    [cartLocked, showMessage],
  );

  const removeItem = useCallback(
    (key) => {
      if (cartLocked) {
        showMessage(
          "The cart is locked while an online payment attempt is active.",
          "error",
        );
        return;
      }

      let removedName = "";

      setCart((prev) => {
        const target = prev.find((item) => item.key === key);
        removedName = target?.product_name || "";
        return prev.filter((item) => item.key !== key);
      });

      if (removedName) {
        showMessage(`${removedName} has been removed from the cart.`, "info");
      }
    },
    [cartLocked, showMessage],
  );

  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.unit_price * item.quantity, 0),
    [cart],
  );

  const cartItemCount = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart],
  );

  const getCartItemImage = useCallback(
    (item) => {
      const directImage = String(item?.image_url || "").trim();
      if (directImage) return directImage;

      const matchedProduct = allProducts.find(
        (product) => String(product?.id) === String(item?.product_id),
      );

      return matchedProduct?.image_url || "";
    },
    [allProducts],
  );

  const proceedToCheckout = useCallback(() => {
    if (cartLocked) {
      navigate("/staff/order");
      return;
    }

    if (cart.length === 0) {
      showMessage(
        "Your cart is empty. Please add at least one product before checkout.",
        "info",
      );
      return;
    }

    sessionStorage.setItem("pos_cart", JSON.stringify(cart));
    navigate("/staff/order");
  }, [cart, cartLocked, navigate, showMessage]);

  return (
    <div
      className={"search-layout" + (cart.length > 0 ? " has-mobile-cart" : "")}
    >
      <div className="search-panel">
        <div className="page-header">
          <h1>Product Search & Cart</h1>
          <p>Search and add products to the current sale.</p>
        </div>

        {cartLocked && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              flexWrap: "wrap",
              marginBottom: 18,
              padding: "14px 16px",
              border: "1px solid #f59e0b",
              borderRadius: 10,
              background: "#fffbeb",
              color: "#92400e",
              fontSize: 13,
              fontWeight: 700,
            }}
          >
            <span>
              An online payment attempt is active. The reserved cart cannot be
              changed until that payment is resolved.
            </span>
            <button
              type="button"
              onClick={() => navigate("/staff/order")}
              style={{
                border: 0,
                borderRadius: 8,
                padding: "9px 14px",
                background: "#18181b",
                color: "#ffffff",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Return to Active Payment
            </button>
          </div>
        )}

        <div className="pos-search-tools">
          <div className="search-bar">
            <Search size={18} className="search-icon" />
            <input
              id="cashier-product-search"
              name="cashier_product_search"
              type="text"
              placeholder="Search products, categories, or materials"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => {
                if (searchMessageType !== "error") {
                  clearMessage();
                }
              }}
            />
          </div>
        </div>

        {searchMessage && (
          <div className={`pos-search-message ${searchMessageType}`}>
            {searchMessage}
          </div>
        )}

        {cart.length > 0 && (
          <button
            type="button"
            className="mobile-cart-trigger"
            onClick={() => setMobileCartOpen(true)}
            aria-expanded={mobileCartOpen}
            aria-controls="cashier-cart-panel"
          >
            <span className="mobile-cart-trigger-label">
              <ShoppingCart size={17} />
              Cart ({cartItemCount})
            </span>
            <strong>₱{formatCurrency(cartTotal)}</strong>
            <span className="mobile-cart-trigger-action">View</span>
          </button>
        )}

        <div className="search-results">
          {searching && <p className="search-hint">Loading products...</p>}

          {!searching && query.trim() && products.length === 0 && (
            <p className="search-hint">No products found for "{query}".</p>
          )}

          {!searching && !query.trim() && products.length > 0 && (
              <p className="search-hint">
                {products.length} available product
                {products.length !== 1 ? "s" : ""}
              </p>
            )}

          {!searching && !query.trim() && products.length === 0 && (
              <p className="search-hint">No available products found.</p>
            )}

          <div className="product-grid">
            {products
              .filter(
                (product) =>
                  String(product?.type || "standard").toLowerCase() ===
                  "standard",
              )
              .map((product) => {
                const statusClass =
                  product.stock <= 0
                    ? "out_of_stock"
                    : product.stock_status === "low_stock"
                      ? "low_stock"
                      : "in_stock";

                return (
                  <div key={product.id} className="product-card">
                    {product.image_url && !brokenImages[product.id] ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="product-img"
                        onError={() =>
                          setBrokenImages((prev) => ({
                            ...prev,
                            [product.id]: true,
                          }))
                        }
                      />
                    ) : (
                      <div className="product-img-placeholder">📦</div>
                    )}

                    <div className="product-info">
                      <div className="product-name">{product.name}</div>
                      <div className="product-card-meta">
                        <div className="product-price">
                          {product.cashier_sale_available ? (
                            <>
                              {"\u20B1"}
                              {formatCurrency(product.price)}
                            </>
                          ) : (
                            "Price unavailable"
                          )}
                        </div>

                        <div className={`stock-chip ${statusClass}`}>
                          {formatStockStatus(
                            product.stock_status || statusClass,
                          )}{" "}
                          ({product.stock})
                        </div>
                      </div>
                    </div>

                    <div className="product-card-action">
                      <button
                        type="button"
                        className="add-btn"
                        onClick={() => addToCart(product)}
                        disabled={
                          product.stock <= 0 ||
                          cartLocked ||
                          !product.cashier_sale_available
                        }
                      >
                        <Plus size={15} />{" "}
                        {product.cashier_sale_available
                          ? "Add to Cart"
                          : "Unavailable"}
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      {mobileCartOpen && (
        <button
          type="button"
          className="mobile-cart-backdrop"
          onClick={() => setMobileCartOpen(false)}
          aria-label="Close cart"
        />
      )}

      <div
        id="cashier-cart-panel"
        className={"cart-panel" + (mobileCartOpen ? " is-mobile-open" : "")}
      >
        <div className="cart-header">
          <ShoppingCart size={18} />
          <span>
            Cart ({cartItemCount} item{cartItemCount !== 1 ? "s" : ""})
          </span>
          <button
            type="button"
            className="mobile-cart-close"
            onClick={() => setMobileCartOpen(false)}
            aria-label="Close cart"
          >
            <X size={18} />
          </button>
        </div>

        {cart.length === 0 ? (
          <div className="cart-empty">
            <ShoppingCart size={28} strokeWidth={1.6} />
            <strong>No items in cart</strong>
            <span>Search for a product to begin this sale.</span>
          </div>
        ) : (
          <>
            <div className="cart-items">
              {cart.map((item) => (
                <div key={item.key} className="cart-item">
                  <div className="cart-item-compact">
                    <div className="cart-item-quantity">x{item.quantity}</div>

                    <div className="cart-item-thumb">
                      {getCartItemImage(item) &&
                      !brokenImages[`cart-${item.key}`] ? (
                        <img
                          src={getCartItemImage(item)}
                          alt={item.product_name}
                          onError={() =>
                            setBrokenImages((prev) => ({
                              ...prev,
                              [`cart-${item.key}`]: true,
                            }))
                          }
                        />
                      ) : (
                        <div className="cart-item-thumb-fallback">Box</div>
                      )}
                    </div>

                    <div className="cart-item-copy">
                      <div className="cart-item-name">{item.product_name}</div>
                      <div className="cart-item-price">
                        ₱{formatCurrency(item.unit_price)}
                      </div>

                      <div
                        className="mobile-cart-item-controls"
                        aria-label={`Quantity for ${item.product_name}`}
                      >
                        <button
                          type="button"
                          onClick={() => updateQty(item.key, -1)}
                          disabled={cartLocked}
                          aria-label={`Decrease ${item.product_name} quantity`}
                        >
                          <Minus size={14} />
                        </button>
                        <span>{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateQty(item.key, 1)}
                          disabled={
                            cartLocked || item.quantity >= item.max_stock
                          }
                          aria-label={`Increase ${item.product_name} quantity`}
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="remove-btn"
                      onClick={() => removeItem(item.key)}
                      disabled={cartLocked}
                      aria-label={`Remove ${item.product_name} from cart`}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="cart-summary">
              <div className="cart-total">
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 800,
                    color: "#71717a",
                    textTransform: "uppercase",
                    letterSpacing: "1px",
                  }}
                >
                  Total
                </span>
                <span
                  style={{
                    fontSize: 24,
                    fontWeight: 800,
                    color: "#0a0a0a",
                    letterSpacing: "-0.02em",
                  }}
                >
                  ₱{formatCurrency(cartTotal)}
                </span>
              </div>

              <button
                type="button"
                className="checkout-btn"
                onClick={proceedToCheckout}
              >
                {cartLocked ? "Return to Active Payment" : "Proceed to Checkout"}{" "}
                <ArrowRight size={16} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
