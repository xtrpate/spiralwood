import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import api, { buildAssetUrl } from "../../services/api";
import {
  Search,
  ScanLine,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  ArrowRight,
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



export default function ProductSearch() {
  const [query, setQuery] = useState("");
  const [barcode, setBarcode] = useState("");
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
  const [searching, setSearching] = useState(true);
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [barcodeMessage, setBarcodeMessage] = useState("");
  const [barcodeMessageType, setBarcodeMessageType] = useState("info");
  const [brokenImages, setBrokenImages] = useState({});

  const navigate = useNavigate();
  const barcodeRef = useRef(null);

  const showMessage = useCallback((message, type = "info") => {
    setBarcodeMessage(message);
    setBarcodeMessageType(type);
  }, []);

  const clearMessage = useCallback(() => {
    setBarcodeMessage("");
    setBarcodeMessageType("info");
  }, []);

  const normalizeProduct = useCallback((product) => {
    const stock = Number(product?.stock ?? 0);
    const walkinPrice = Number(
      product?.walkin_price ?? product?.online_price ?? 0
    );
    const productionCost = Number(product?.production_cost ?? 0);

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

    const variations = Array.isArray(product?.variations)
      ? product.variations.map((variation) => {
          const variationStock = Number(variation?.stock ?? 0);

          return {
            ...variation,
            variation_name:
              variation?.variation_name || variation?.name || "Variation",
            stock: variationStock,
            selling_price: Number(
              variation?.selling_price ?? variation?.walkin_price ?? walkinPrice
            ),
            unit_cost: Number(variation?.unit_cost ?? productionCost),
            stock_status:
              variationStock <= 0
                ? "out_of_stock"
                : variationStock <= 5
                ? "low_stock"
                : "in_stock",
          };
        })
      : [];

    return {
      ...product,
      type: String(product?.type || "standard").toLowerCase(),
      name: product?.name || "Unnamed Product",
      barcode: String(product?.barcode ?? "").trim(),
      stock,
      walkin_price: walkinPrice,
      production_cost: productionCost,
      image_url: buildAssetUrl(
        product?.image_url ||
          product?.product_image ||
          product?.image ||
          product?.photo ||
          ""
      ),
      category:
        product?.category_name || product?.category || product?.type || "Product",
      stock_status: stockStatus,
      variations,
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
              (product) => String(product?.type || "standard").toLowerCase() === "standard"
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
        "error"
      );
    } finally {
      setSearching(false);
    }
  }, [normalizeProduct, showMessage]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    sessionStorage.setItem("pos_cart", JSON.stringify(cart));
  }, [cart]);

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
        const variationNames = Array.isArray(product.variations)
          ? product.variations.map((variation) => variation.variation_name)
          : [];

        const haystacks = [
          product.name,
          product.barcode,
          product.category,
          ...variationNames,
        ];

        return haystacks.some((value) =>
          String(value || "").toLowerCase().includes(trimmed)
        );
      });

      setProducts(filtered);
      setSearching(false);
    }, 250);

    return () => clearTimeout(timer);
  }, [query, allProducts]);

  const addToCart = useCallback(
    (product, variation = null) => {
      const key = variation ? `${product.id}-${variation.id}` : `${product.id}`;
      const stockLimit = Number(variation?.stock ?? product?.stock ?? 0);
      const displayName = variation
        ? `${product.name} (${variation.variation_name})`
        : product.name;

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
            item.key === key
              ? { ...item, quantity: item.quantity + 1 }
              : item
          );
        }

        added = true;
        feedback = `${displayName} has been added to the cart.`;

        return [
          ...prev,
          {
            key,
            product_id: product.id,
            variation_id: variation?.id || null,
            product_name: displayName,
            unit_price: Number(
              variation?.selling_price ?? product?.walkin_price ?? 0
            ),
            production_cost: Number(
              variation?.unit_cost ?? product?.production_cost ?? 0
            ),
            quantity: 1,
            max_stock: stockLimit,
          },
        ];
      });

      if (feedback) {
        showMessage(feedback, feedbackType);
      }

      return added;
    },
    [showMessage]
  );

  const searchByBarcode = useCallback(
    async (rawCode) => {
      const code = String(rawCode || "").trim();

      if (!code) {
        showMessage("Please enter or scan a barcode first.", "info");
        setProducts(allProducts);
        barcodeRef.current?.focus();
        return;
      }

      setBarcodeLoading(true);

      try {
        let product =
          allProducts.find(
            (item) =>
              String(item.barcode || "").toLowerCase() === code.toLowerCase()
          ) || null;

        if (!product) {
          const res = await api.get(
            `/pos/products?barcode=${encodeURIComponent(code)}`
          );

          const results = Array.isArray(res.data)
            ? res.data
                .map(normalizeProduct)
                .filter(
                  (item) => String(item?.type || "standard").toLowerCase() === "standard"
                )
            : [];

          product =
            results.find(
              (item) =>
                String(item.barcode || "").toLowerCase() === code.toLowerCase()
            ) || null;
        }

        if (!product) {
          setProducts([]);
          showMessage(`No product found for barcode "${code}".`, "error");
          return;
        }

        setProducts([product]);

        if (product.variations?.length > 0) {
          showMessage(
            `${product.name} was found. Please choose a variation to continue.`,
            "info"
          );
          return;
        }

        if (product.stock <= 0) {
          showMessage(`${product.name} is currently out of stock.`, "error");
          return;
        }

        const added = addToCart(product);

        if (added) {
          setBarcode("");
        }
      } catch (error) {
        console.error("BARCODE SEARCH ERROR:", error);
        setProducts([]);
        showMessage(
          "Barcode search could not be completed. Please try again.",
          "error"
        );
      } finally {
        setBarcodeLoading(false);
        barcodeRef.current?.focus();
      }
    },
    [addToCart, allProducts, normalizeProduct, showMessage]
  );

  const updateQty = useCallback(
    (key, delta) => {
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
          .filter(Boolean)
      );

      if (feedback) {
        showMessage(feedback, feedbackType);
      }
    },
    [showMessage]
  );

  const removeItem = useCallback(
    (key) => {
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
    [showMessage]
  );

  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.unit_price * item.quantity, 0),
    [cart]
  );

  const cartItemCount = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart]
  );

  const proceedToCheckout = useCallback(() => {
    if (cart.length === 0) {
      showMessage(
        "Your cart is empty. Please add at least one product before checkout.",
        "info"
      );
      return;
    }

    sessionStorage.setItem("pos_cart", JSON.stringify(cart));
    navigate("/staff/order");
  }, [cart, navigate, showMessage]);

  return (
    <div className="search-layout">
      <div className="search-panel">
        <div className="page-header">
          <h1>Product Search & Cart</h1>
          <p>
            Browse products, search by keyword, or scan a barcode to add items
            faster.
          </p>
        </div>

        <div className="barcode-bar">
          <ScanLine size={18} className="search-icon" />
          <input
            ref={barcodeRef}
            type="text"
            placeholder="Scan or enter barcode..."
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            onFocus={() => {
              if (barcodeMessage) clearMessage();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                searchByBarcode(barcode);
              }
            }}
          />
          <button
            type="button"
            className="barcode-btn"
            onClick={() => searchByBarcode(barcode)}
            disabled={barcodeLoading}
          >
            {barcodeLoading ? "Searching..." : "Scan"}
          </button>
        </div>

        {barcodeMessage && (
          <div className={`barcode-message ${barcodeMessageType}`}>
            {barcodeMessage}
          </div>
        )}

        <div className="search-bar">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            placeholder="Search products by name, category, variation, or barcode..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => {
              if (barcodeMessageType !== "error") {
                clearMessage();
              }
            }}
          />
          <button
            type="button"
            className="barcode-focus-btn"
            onClick={() => barcodeRef.current?.focus()}
            title="Focus barcode input"
          >
            <ScanLine size={16} />
          </button>
        </div>

        <div className="search-results">
          {searching && <p className="search-hint">Loading products...</p>}

          {!searching && query.trim() && products.length === 0 && (
            <p className="search-hint">No products found for "{query}".</p>
          )}

          {!searching && !query.trim() && !barcode.trim() && products.length > 0 && (
            <p className="search-hint">
              Showing available products. Use the search box or scan a barcode
              above.
            </p>
          )}

          {!searching && !query.trim() && !barcode.trim() && products.length === 0 && (
            <p className="search-hint">No available products found.</p>
          )}

          <div className="product-grid">
            {products
              .filter(
                (product) => String(product?.type || "standard").toLowerCase() === "standard"
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
                    <div className="product-category">{product.category}</div>
                    <div className="product-price">
                      ₱{formatCurrency(product.walkin_price)}
                    </div>

                    <div className={`stock-chip ${statusClass}`}>
                      {formatStockStatus(product.stock_status || statusClass)} (
                      {product.stock})
                    </div>
                  </div>

                  {product.variations?.length > 0 ? (
                    <div className="variation-list">
                      {product.variations.map((variation) => (
                        <button
                          key={variation.id}
                          type="button"
                          className="var-btn"
                          onClick={() => addToCart(product, variation)}
                          disabled={variation.stock <= 0}
                          title={
                            variation.stock <= 0
                              ? "Out of stock"
                              : `Add ${variation.variation_name}`
                          }
                        >
                          <span>
                            {variation.variation_name} ({variation.stock})
                          </span>
                          <span>
                            ₱{formatCurrency(variation.selling_price)}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="add-btn"
                      onClick={() => addToCart(product)}
                      disabled={product.stock <= 0}
                    >
                      <Plus size={16} /> Add to Cart
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="cart-panel">
        <div className="cart-header">
          <ShoppingCart size={20} />
          <span>
            Cart ({cartItemCount} item{cartItemCount !== 1 ? "s" : ""})
          </span>
        </div>

        {cart.length === 0 ? (
          <div className="cart-empty">
            Cart is empty.
            <br />
            Search and add products to begin.
          </div>
        ) : (
          <>
            <div className="cart-items">
              {cart.map((item) => (
                <div key={item.key} className="cart-item">
                  <div className="cart-item-name">{item.product_name}</div>
                  <div className="cart-item-price">
                    ₱{formatCurrency(item.unit_price * item.quantity)}
                  </div>
                  <div className="cart-item-controls">
                    <button type="button" onClick={() => updateQty(item.key, -1)}>
                      <Minus size={13} />
                    </button>
                    <span>{item.quantity}</span>
                    <button type="button" onClick={() => updateQty(item.key, 1)}>
                      <Plus size={13} />
                    </button>
                    <button
                      type="button"
                      className="remove-btn"
                      onClick={() => removeItem(item.key)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="cart-summary">
              <div className="cart-total">
                <span>Total</span>
                <span>₱{formatCurrency(cartTotal)}</span>
              </div>

              <button
                type="button"
                className="checkout-btn"
                onClick={proceedToCheckout}
              >
                Proceed to Checkout <ArrowRight size={16} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}