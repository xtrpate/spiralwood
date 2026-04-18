import React, { useEffect, useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";

import useAuthStore from "../../store/authStore";
import api, { buildAssetUrl } from "../../services/api";

// 🏠 Relative path to your cabinet image
import cabinetImg from "../assets/cabinet.png";

export default function LandingPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [products, setProducts] = useState([]);

  const latestProducts = [...products]
    .sort((a, b) => {
      const dateA = new Date(a?.created_at || 0).getTime();
      const dateB = new Date(b?.created_at || 0).getTime();

      if (dateA !== dateB) return dateB - dateA;
      return Number(b?.id || 0) - Number(a?.id || 0);
    })
    .slice(0, 4);

  const formatPrice = (value) => {
    const num = Number(value || 0);
    return `₱${num.toLocaleString("en-PH", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const getProductImage = (product) => {
    return (
      buildAssetUrl(product?.image_url) ||
      buildAssetUrl(product?.thumbnail_url) ||
      buildAssetUrl(product?.image) ||
      "/images/placeholder.png"
    );
  };

  const getProductPrice = (product) => {
    return (
      product?.online_price ??
      product?.walkin_price ??
      product?.selling_price ??
      product?.price ??
      0
    );
  };

  const getAvailabilityText = (product) => {
    const isOut =
      String(product?.stock_status || "").toLowerCase() === "out_of_stock" ||
      Number(product?.stock || 0) <= 0;

    return isOut
      ? "Out of stock"
      : "Available (Estimated 1-5 working days)";
  };

  const getAvailabilityColor = (product) => {
    const isOut =
      String(product?.stock_status || "").toLowerCase() === "out_of_stock" ||
      Number(product?.stock || 0) <= 0;

    return isOut ? "#d32f2f" : "#17b7d6";
  };

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const res = await api.get("/customer/products");
        const list = Array.isArray(res.data)
          ? res.data
          : Array.isArray(res.data?.products)
          ? res.data.products
          : [];

        setProducts(list);
      } catch (err) {
        console.error("Failed to load products", err);
        setProducts([]);
      }
    };

    fetchProducts();
  }, []);

  if (user?.role === "admin") {
    return <Navigate to="/admin/dashboard" replace />;
  }

  if (user?.role === "staff") {
    return (
      <Navigate
        to={
          user.staff_type === "delivery_rider"
            ? "/staff/deliveries"
            : "/staff/dashboard"
        }
        replace
      />
    );
  }

  const topCategoryCards = [
    {
      label: "BEDROOM FURNITURE",
      category: "Closet / Wardrobe",
      img: "/images/closet.png",
    },
    {
      label: "KITCHEN FURNITURE",
      category: "Kitchen Cabinet",
      img: "/images/kitchen.png",
    },
    {
      label: "BATHROOM FURNITURE",
      category: "Bathroom Cabinet",
      img: "/images/bathroom.png",
    },
    {
      label: "OFFICE FURNITURE",
      category: "Office Furniture",
      img: "/images/office.png",
    },
  ];

  const bottomCategoryCards = [
    {
      label: "LIVING ROOM FURNITURE",
      category: "Living Room Furniture",
      img: "/images/living-room.png",
    },
    {
      label: "DINING ROOM FURNITURE",
      category: "Dining Room Furniture",
      img: "/images/dining-room.png",
    },
    {
      label: "WARDROBE & CLOSET",
      category: "Closet / Wardrobe",
      img: "/images/wardrobe-closet.png",
    },
    {
      label: "TV CONSOLE & STORAGE",
      category: "TV Console & Storage",
      img: "/images/tv-console-storage.png",
    },
  ];

  return (
    <div
      style={{
        backgroundColor: "#fdfbf9",
        minHeight: "100vh",
        fontFamily: "'Montserrat', sans-serif",
        width: "100vw",
        marginLeft: "calc(50% - 50vw)",
        marginRight: "calc(50% - 50vw)",
      }}
    >
      {/* HERO */}
      <section
        style={{
          width: "100%",
          padding: 0,
          margin: 0,
          backgroundColor: "#fdfbf9",
          lineHeight: 0,
          overflow: "hidden",
        }}
      >
        <img
          src={cabinetImg}
          alt="Custom furniture and built-in solutions"
          style={{
            width: "100%",
            height: "auto",
            display: "block",
          }}
        />
      </section>

      {/* SHOP BY CATEGORY */}
      <section
        style={{
          padding: "26px 14px 8px",
          maxWidth: "1820px",
          margin: "0 auto",
          width: "100%",
        }}
      >
        <h2
          style={{
            textAlign: "center",
            fontSize: "1.95rem",
            fontWeight: 700,
            color: "#111111",
            marginBottom: "30px",
            lineHeight: "1.2",
            letterSpacing: "0",
          }}
        >
          Shop by category
        </h2>

        {/* TOP ROW */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: "16px",
            alignItems: "start",
            marginBottom: "18px",
          }}
        >
          {topCategoryCards.map((cat, i) => (
            <div
              key={`top-${i}`}
              onClick={() =>
                navigate(`/catalog?category=${encodeURIComponent(cat.category)}`)
              }
              style={{
                cursor: "pointer",
                borderRadius: "0",
                overflow: "visible",
                background: "transparent",
                boxShadow: "none",
                transition: "transform 0.18s ease",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.transform = "translateY(-2px)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.transform = "translateY(0)")
              }
            >
              <div
                style={{
                  height: "365px",
                  backgroundImage: cat.img ? `url(${cat.img})` : "none",
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  backgroundRepeat: "no-repeat",
                  backgroundColor: "#dcdcdc",
                }}
              />

              <div
                style={{
                  padding: "14px 8px 6px",
                  textAlign: "center",
                  fontFamily: "'Montserrat', sans-serif",
                  fontWeight: 700,
                  fontSize: "1.09rem",
                  color: "#111111",
                  letterSpacing: "1px",
                  lineHeight: "1.2",
                  textTransform: "uppercase",
                  background: "transparent",
                }}
              >
                {cat.label}
              </div>
            </div>
          ))}
        </div>

        {/* BOTTOM ROW */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: "16px",
            alignItems: "start",
          }}
        >
          {bottomCategoryCards.map((cat, i) => (
            <div
              key={`bottom-${i}`}
              onClick={() =>
                navigate(`/catalog?category=${encodeURIComponent(cat.category)}`)
              }
              style={{
                cursor: "pointer",
                borderRadius: "0",
                overflow: "visible",
                background: "transparent",
                boxShadow: "none",
                transition: "transform 0.18s ease",
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.transform = "translateY(-2px)")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.transform = "translateY(0)")
              }
            >
              <div
                style={{
                  height: "365px",
                  backgroundImage: cat.img ? `url(${cat.img})` : "none",
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                  backgroundRepeat: "no-repeat",
                  backgroundColor: "#dcdcdc",
                }}
              />

              <div
                style={{
                  padding: "14px 8px 6px",
                  textAlign: "center",
                  fontFamily: "'Montserrat', sans-serif",
                  fontWeight: 700,
                  fontSize: "1.09rem",
                  color: "#111111",
                  letterSpacing: "1px",
                  lineHeight: "1.2",
                  textTransform: "uppercase",
                  background: "transparent",
                }}
              >
                {cat.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* LATEST ARRIVALS */}
      <section
        style={{
          padding: "46px 14px 20px",
          maxWidth: "1820px",
          margin: "0 auto",
          width: "100%",
        }}
      >
        <h2
          style={{
            textAlign: "center",
            fontSize: "2rem",
            fontWeight: 600,
            color: "#111111",
            marginBottom: "30px",
            lineHeight: "1.2",
          }}
        >
          Latest Products
        </h2>

        {latestProducts.length > 0 ? (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: "22px",
                alignItems: "start",
              }}
            >
              {latestProducts.map((product) => (
                <div
                  key={product.id}
                  onClick={() => navigate("/catalog")}
                  style={{
                    cursor: "pointer",
                    background: "transparent",
                    transition: "transform 0.18s ease",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.transform = "translateY(-2px)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.transform = "translateY(0)")
                  }
                >
                  <div
                    style={{
                      position: "relative",
                      background: "#f3f3f3",
                      overflow: "hidden",
                    }}
                  >
                    <img
                      src={getProductImage(product)}
                      alt={product?.name || "Product"}
                      style={{
                        width: "100%",
                        height: "340px",
                        objectFit: "cover",
                        display: "block",
                        backgroundColor: "#efefef",
                      }}
                    />

                    <div
                      style={{
                        position: "absolute",
                        top: "14px",
                        left: "14px",
                        width: "58px",
                        height: "58px",
                        borderRadius: "50%",
                        background: "#111111",
                        color: "#ffffff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "0.95rem",
                        fontWeight: 500,
                      }}
                    >
                      New
                    </div>
                  </div>

                  <div
                    style={{
                      padding: "16px 8px 0",
                      textAlign: "center",
                    }}
                  >
                    <div
                      style={{
                        fontFamily: "'Montserrat', sans-serif",
                        fontWeight: 500,
                        fontSize: "1rem",
                        color: "#111111",
                        lineHeight: "1.35",
                        minHeight: "54px",
                        marginBottom: "10px",
                      }}
                    >
                      {product?.name || "Untitled Product"}
                    </div>

                    <div
                      style={{
                        fontSize: "1rem",
                        fontWeight: 700,
                        color: "#111111",
                        marginBottom: "8px",
                      }}
                    >
                      {formatPrice(getProductPrice(product))}
                    </div>

                    <div
                      style={{
                        fontSize: "0.95rem",
                        color: getAvailabilityColor(product),
                        marginBottom: "16px",
                        lineHeight: "1.3",
                      }}
                    >
                      {getAvailabilityText(product)}
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate("/catalog");
                      }}
                      style={{
                        background: "#111111",
                        color: "#ffffff",
                        border: "none",
                        padding: "12px 28px",
                        fontSize: "0.98rem",
                        fontWeight: 500,
                        cursor: "pointer",
                      }}
                    >
                      Select options
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div
              style={{
                textAlign: "center",
                marginTop: "26px",
              }}
            >
              <button
                type="button"
                onClick={() => navigate("/catalog")}
                style={{
                  background: "transparent",
                  color: "#111111",
                  border: "1px solid #111111",
                  padding: "12px 24px",
                  fontSize: "0.95rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                View All Products
              </button>
            </div>
          </>
        ) : (
          <div
            style={{
              textAlign: "center",
              color: "#666",
              fontSize: "1rem",
              padding: "20px 0",
            }}
          >
            No products available yet.
          </div>
        )}
      </section>
    </div>
  );
}