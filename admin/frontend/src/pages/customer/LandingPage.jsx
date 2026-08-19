import React, { useEffect, useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import toast from "react-hot-toast";

import useAuthStore from "../../store/authStore";
import api, { buildAssetUrl } from "../../services/api";
import { useCart } from "./cartcontext";

import tutorialChooseDesign from "../assets/home-tutorial/home-tutorial-step-1-choose-design.png";
import tutorialSetSize from "../assets/home-tutorial/home-tutorial-step-2-set-size.png";
import tutorialEditParts from "../assets/home-tutorial/home-tutorial-step-3-edit-parts.png";
import tutorialChooseFinish from "../assets/home-tutorial/home-tutorial-step-4-choose-finish.png";
import tutorialReviewDesign from "../assets/home-tutorial/home-tutorial-step-5-review-design.png";
import tutorialSubmitRequest from "../assets/home-tutorial/home-tutorial-step-6-submit-request.png";

const HERO_SHOWCASE_SLIDES = [
  {
    src: tutorialChooseDesign,
    step: "1",
    label: "Choose Design",
    title: "Choose a design",
    description:
      "Choose a furniture design you want to customize. Check its preview, size, and details. Click View to check it first, or Customize to start editing.",
    alt: "Choose a furniture design from the WISDOM customer customization gallery",
  },
  {
    src: tutorialSetSize,
    step: "2",
    label: "Set Size",
    title: "Set size",
    description:
      "Adjust the width, height, and depth to fit your available space.",
    alt: "Set width height and depth in the WISDOM 3D furniture customizer",
  },
  {
    src: tutorialEditParts,
    step: "3",
    label: "Edit Parts",
    title: "Edit parts",
    description:
      "Select a furniture part and adjust only the section you want to change.",
    alt: "Edit individual furniture parts in the WISDOM 3D customizer",
  },
  {
    src: tutorialChooseFinish,
    step: "4",
    label: "Choose Finish",
    title: "Choose finish",
    description:
      "Pick the wood finish or color that matches the look you want.",
    alt: "Choose wood finish color in the WISDOM customizer",
  },
  {
    src: tutorialReviewDesign,
    step: "5",
    label: "Review Design",
    title: "Review design",
    description:
      "Check the final size, finish, and available 3D views before continuing.",
    alt: "Review the final customized furniture dimensions finish and 3D views",
  },
  {
    src: tutorialSubmitRequest,
    step: "6",
    label: "Submit Request",
    title: "Submit request",
    description:
      "Review your design, quantity, notes, and reference photos, then send your request for quotation.",
    alt: "Review a custom furniture request and submit it for quotation",
  },
];

let cachedProducts = null;
let cachedCatalogCategories = null;

const normalizeCategoryText = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const HOME_CATEGORY_SIGNALS = [
  "kitchen",
  "bathroom",
  "office",
  "living",
  "dining",
  "closet",
  "wardrobe",
  "tv",
  "console",
  "bedroom",
];

/* WISDOM HOME HERO CUSTOMIZE CTA V1.0.0 */
/* WISDOM HOME HERO EXACT SQUARE PEN ICON V1.0.7.3.5.9 */
const FurnitureEditIcon = () => (
  <svg
    className="wisdom-hero-customize-icon"
    viewBox="0 0 24 24"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.375 2.625a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.375-9.375Z" />
  </svg>
);

const resolveHomeCategory = (card, categories = []) => {
  const requestedName = normalizeCategoryText(card?.category);
  const requestedText = normalizeCategoryText(
    `${card?.label || ""} ${card?.category || ""}`,
  );

  const exact = categories.find(
    (category) => normalizeCategoryText(category?.name) === requestedName,
  );
  if (exact) return exact;

  for (const signal of HOME_CATEGORY_SIGNALS) {
    if (!requestedText.includes(signal)) continue;

    const semanticMatch = categories.find((category) =>
      normalizeCategoryText(category?.name).includes(signal),
    );
    if (semanticMatch) return semanticMatch;
  }

  return null;
};

export default function LandingPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [products, setProducts] = useState(cachedProducts || []);
  const [catalogCategories, setCatalogCategories] = useState(
    cachedCatalogCategories || [],
  );
  const [loading, setLoading] = useState(!cachedProducts);
  const { addToCart } = useCart();

  const [heroSlideIndex, setHeroSlideIndex] = useState(0);
  const [heroDragStartX, setHeroDragStartX] = useState(null);
  const [heroDragOffset, setHeroDragOffset] = useState(0);
  const [heroDragTravel, setHeroDragTravel] = useState(1);
  const [heroActivePointerId, setHeroActivePointerId] = useState(null);
  const [heroIsDragging, setHeroIsDragging] = useState(false);
  const [heroIsSettling, setHeroIsSettling] = useState(false);
  const [heroIsRebasing, setHeroIsRebasing] = useState(false);

  useEffect(() => {
    if (heroIsDragging || heroIsSettling || heroIsRebasing) return;

    const autoPlayTimer = setInterval(() => {
      setHeroSlideIndex((prev) => (prev + 1) % HERO_SHOWCASE_SLIDES.length);
      setHeroDragOffset(0);
    }, 3000);

    return () => clearInterval(autoPlayTimer);
  }, [heroSlideIndex, heroIsDragging, heroIsSettling, heroIsRebasing]);

  const goToHeroSlide = (nextIndex) => {
    const totalSlides = HERO_SHOWCASE_SLIDES.length;
    if (totalSlides <= 0 || heroIsDragging || heroIsSettling || heroIsRebasing)
      return;
    const boundedIndex = Math.max(0, Math.min(totalSlides - 1, nextIndex));
    setHeroSlideIndex(boundedIndex);
    setHeroDragOffset(0);
  };

  const getHeroDragDirection = (offset) => {
    if (offset < 0) return 1;
    if (offset > 0) return -1;
    return 0;
  };

  const clampHeroDragOffset = (rawOffset) => {
    const atFirstStep = heroSlideIndex === 0;
    const atLastStep = heroSlideIndex === HERO_SHOWCASE_SLIDES.length - 1;

    if ((atFirstStep && rawOffset > 0) || (atLastStep && rawOffset < 0)) {
      return Math.max(-28, Math.min(28, rawOffset * 0.12));
    }

    const limit = Math.max(1, heroDragTravel);
    return Math.max(-limit, Math.min(limit, rawOffset));
  };

  const clearHeroPointerState = () => {
    setHeroDragStartX(null);
    setHeroActivePointerId(null);
    setHeroIsDragging(false);
  };

  const finishHeroRebase = () => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        setHeroIsRebasing(false);
        setHeroIsSettling(false);
        clearHeroPointerState();
      });
    });
  };

  const settleHeroBack = () => {
    setHeroIsDragging(false);
    setHeroIsSettling(true);
    setHeroDragOffset(0);
    window.setTimeout(() => {
      setHeroIsSettling(false);
      clearHeroPointerState();
    }, 270);
  };

  const settleHeroToStep = (direction) => {
    const targetIndex = heroSlideIndex + direction;
    const isValidTarget =
      targetIndex >= 0 && targetIndex < HERO_SHOWCASE_SLIDES.length;
    if (!isValidTarget) {
      settleHeroBack();
      return;
    }

    setHeroIsDragging(false);
    setHeroIsSettling(true);

    // Move the rail to the exact measured neighbor position. This avoids the tiny offset mismatch
    // that previously caused the side card to twitch when the pointer was released.
    setHeroDragOffset(direction > 0 ? -heroDragTravel : heroDragTravel);

    window.setTimeout(() => {
      // Disable transform animation for the single rebase frame. The neighbor is already exactly
      // where the active card belongs, so swapping the index should be visually seamless.
      setHeroIsRebasing(true);
      setHeroSlideIndex(targetIndex);
      setHeroDragOffset(0);
      finishHeroRebase();
    }, 280);
  };

  const handleHeroPointerDown = (event) => {
    if (heroIsSettling || heroIsRebasing || !event.isPrimary) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;

    event.preventDefault();

    const stage = event.currentTarget;
    const stageRect = stage.getBoundingClientRect();
    const mainCard = stage.querySelector(".wisdom-home-tutorial__main-card");
    const nextCard = stage.querySelector(
      ".wisdom-home-tutorial__neighbor--next",
    );
    const previousCard = stage.querySelector(
      ".wisdom-home-tutorial__neighbor--previous",
    );

    // Use actual rendered card coordinates instead of estimating from viewport width.
    // This keeps JS travel perfectly aligned with CSS peek + gap at every screen size.
    let travel = 0;
    if (mainCard && nextCard) {
      travel = Math.abs(nextCard.offsetLeft - mainCard.offsetLeft);
    } else if (mainCard && previousCard) {
      travel = Math.abs(previousCard.offsetLeft - mainCard.offsetLeft);
    }

    if (!Number.isFinite(travel) || travel < 1) {
      const visiblePeek = Math.max(88, Math.min(128, stageRect.width * 0.1));
      travel = Math.max(260, stageRect.width - visiblePeek + 18);
    }

    if (stage.setPointerCapture) {
      stage.setPointerCapture(event.pointerId);
    }

    setHeroDragTravel(travel);
    setHeroDragStartX(event.clientX);
    setHeroActivePointerId(event.pointerId);
    setHeroDragOffset(0);
    setHeroIsDragging(true);
  };

  const handleHeroPointerMove = (event) => {
    if (!heroIsDragging || heroIsSettling || heroIsRebasing) return;
    if (heroActivePointerId !== event.pointerId || heroDragStartX == null)
      return;

    const rawOffset = event.clientX - heroDragStartX;
    setHeroDragOffset(clampHeroDragOffset(rawOffset));
  };

  const handleHeroPointerUp = (event) => {
    if (!heroIsDragging || heroIsSettling || heroIsRebasing) return;
    if (heroActivePointerId !== event.pointerId || heroDragStartX == null)
      return;

    if (
      event.currentTarget.releasePointerCapture &&
      event.currentTarget.hasPointerCapture?.(event.pointerId)
    ) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const finalOffset = clampHeroDragOffset(event.clientX - heroDragStartX);
    const direction = getHeroDragDirection(finalOffset);
    const progress = Math.min(
      1,
      Math.abs(finalOffset) / Math.max(1, heroDragTravel),
    );
    const canMoveNext =
      direction === 1 && heroSlideIndex < HERO_SHOWCASE_SLIDES.length - 1;
    const canMovePrevious = direction === -1 && heroSlideIndex > 0;

    if (progress >= 0.68 && (canMoveNext || canMovePrevious)) {
      settleHeroToStep(direction);
      return;
    }

    settleHeroBack();
  };

  const handleHeroPointerCancel = (event) => {
    if (heroActivePointerId !== event.pointerId) return;
    settleHeroBack();
  };

  const latestProducts = [...products]
    .filter((product) => Number(product?.is_featured || 0) === 1)
    .sort((a, b) => {
      const dateA = new Date(a?.created_at || 0).getTime();
      const dateB = new Date(b?.created_at || 0).getTime();

      if (dateA !== dateB) return dateB - dateA;
      return Number(b?.id || 0) - Number(a?.id || 0);
    })
    .slice(0, 4);

  const formatPrice = (value) => {
    const amount = Number(value || 0);
    const safeAmount = Number.isFinite(amount) ? amount : 0;

    return `\u20B1 ${safeAmount.toLocaleString("en-PH", {
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

  const isOutOfStock = (product) =>
    String(product?.stock_status || "").toLowerCase() === "out_of_stock" ||
    Number(product?.stock || 0) <= 0;

  const getAvailabilityText = (product) =>
    isOutOfStock(product) ? "Out of Stock" : "In Stock";

  const handleHomeCategoryClick = (card) => {
    const matchedCategory = resolveHomeCategory(card, catalogCategories);
    const params = new URLSearchParams();

    params.set("category", matchedCategory?.name || card?.category || "");

    if (matchedCategory?.id != null) {
      params.set("category_id", String(matchedCategory.id));
    }

    navigate(`/catalog?${params.toString()}`);
  };

  const handleBrowseFurnitureClick = () => {
    const target = document.getElementById("shop-by-category");
    if (!target) return;

    const headerOffset = 92;
    const startY = window.scrollY;
    const targetY = Math.max(
      0,
      startY + target.getBoundingClientRect().top - headerOffset,
    );
    const distance = targetY - startY;

    if (Math.abs(distance) < 2) return;

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
      window.scrollTo(0, targetY);
      return;
    }

    const duration = 520;
    const startTime = performance.now();
    const easeInOutCubic = (t) =>
      t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    const animateScroll = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeInOutCubic(progress);

      window.scrollTo(0, startY + distance * eased);

      if (progress < 1) {
        window.requestAnimationFrame(animateScroll);
      }
    };

    window.requestAnimationFrame(animateScroll);
  };
  const handleLatestView = (e, product) => {
    e.stopPropagation();
    navigate(`/catalog?q=${encodeURIComponent(product?.name || "")}`);
  };

  const handleLatestAddToCart = (e, product) => {
    e.stopPropagation();

    if (!product || isOutOfStock(product)) return;

    const stock = Number(product?.stock || 0);
    if (stock <= 0) return;

    addToCart({
      key: `${product.id}`,
      product_id: product.id,
      product_name: product.name,
      unit_price: parseFloat(getProductPrice(product)),
      production_cost: product.production_cost ?? 0,
      quantity: 1,
      max_stock: stock,
      image_url: product.image_url || null,
    });

    toast.success(`Added "${product.name}" to cart.`);
  };

  useEffect(() => {
    if (cachedProducts && cachedCatalogCategories) return;

    const fetchProducts = async () => {
      try {
        const res = await api.get(
          "/customer/products?type=standard&sort=newest&limit=60",
        );
        const list = Array.isArray(res.data)
          ? res.data
          : Array.isArray(res.data?.products)
            ? res.data.products
            : [];
        const categoryList = Array.isArray(res.data?.categories)
          ? res.data.categories
          : [];

        cachedProducts = list;
        cachedCatalogCategories = categoryList;
        setProducts(list);
        setCatalogCategories(categoryList);
      } catch (err) {
        console.error("Failed to load products", err);
        setProducts([]);
      } finally {
        setLoading(false);
      }
    };

    fetchProducts();
  }, []);

  if (user?.role === "admin") {
    return <Navigate to="/admin/dashboard" replace />;
  }

  if (loading) {
    return (
      <div
        style={{
          backgroundColor: "#fdfbf9",
          minHeight: "100vh",
          width: "100vw",
          marginLeft: "calc(50% - 50vw)",
          marginRight: "calc(50% - 50vw)",
          animation: "appt-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        }}
      >
        <div style={{ width: "100%", height: "65vh", background: "#e5e7eb" }} />
        <section
          style={{ padding: "26px 14px", maxWidth: "1820px", margin: "0 auto" }}
        >
          <div
            style={{
              height: "36px",
              width: "260px",
              background: "#e5e7eb",
              margin: "0 auto 30px",
              borderRadius: "6px",
            }}
          />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
              gap: "16px",
              marginBottom: "18px",
            }}
          >
            {[1, 2, 3, 4].map((i) => (
              <div key={i} style={{ height: "365px", background: "#f3f4f6" }} />
            ))}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
              gap: "16px",
            }}
          >
            {[1, 2, 3, 4].map((i) => (
              <div key={i} style={{ height: "365px", background: "#f3f4f6" }} />
            ))}
          </div>
        </section>
        <style>{`@keyframes appt-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .6; } }`}</style>
      </div>
    );
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
      {/* WISDOM HOME TUTORIAL TRUE MANUAL GRAB DRAG V1.0.13.7 */}
      {/* WISDOM HOME TUTORIAL SMOOTH RELEASE SETTLE V1.0.13.8 */}
      <section
        className="wisdom-home-tutorial"
        aria-label="How to customize furniture with WISDOM"
      >
        <style>{`
          /* WISDOM HOME GUIDED MOTION V1.0.0 START */

          /* First-load hero copy: restrained stagger, one time per page mount. */
          .wisdom-home-tutorial__kicker {
            animation: wisdomHomeHeroIntro 420ms 40ms
              cubic-bezier(0.22, 1, 0.36, 1) both;
          }

          .wisdom-home-tutorial__headline {
            animation: wisdomHomeHeroIntro 460ms 90ms
              cubic-bezier(0.22, 1, 0.36, 1) both;
          }

          .wisdom-home-tutorial__hero-summary {
            animation: wisdomHomeHeroIntro 440ms 145ms
              cubic-bezier(0.22, 1, 0.36, 1) both;
          }

          .wisdom-home-tutorial__cta {
            transition:
              transform 180ms cubic-bezier(0.22, 1, 0.36, 1),
              background-color 180ms ease,
              color 180ms ease,
              border-color 180ms ease !important;
            animation: wisdomHomeHeroIntro 420ms 205ms
              cubic-bezier(0.22, 1, 0.36, 1) both;
            will-change: transform;
          }

          .wisdom-home-tutorial__catalog-link {
            animation: wisdomHomeHeroIntro 420ms 250ms
              cubic-bezier(0.22, 1, 0.36, 1) both;
          }

          /* Active copy is keyed by step, so this runs only when the step changes. */
          .wisdom-home-tutorial__active-step {
            animation: wisdomHomeStepCopyIn 360ms
              cubic-bezier(0.22, 1, 0.36, 1) both !important;
          }

          /*
           * The existing drag rail owns the card transform.
           * Only the inner image receives a tiny reveal, and it is disabled
           * while dragging/settling/rebasing so manual swipe remains untouched.
           */
          .wisdom-home-tutorial__stage:not(.is-dragging):not(.is-settling):not(.is-rebasing)
            .wisdom-home-tutorial__main-card
            .wisdom-home-tutorial__image {
            animation: wisdomHomeHeroImageReveal 420ms
              cubic-bezier(0.22, 1, 0.36, 1) both;
          }

          /* Existing dynamic width now visibly communicates progress. */
          .wisdom-home-tutorial__progress-fill {
            transition: width 420ms cubic-bezier(0.22, 1, 0.36, 1) !important;
          }

          .wisdom-home-tutorial__progress-number,
          .wisdom-home-tutorial__card-dot {
            transition:
              transform 260ms cubic-bezier(0.22, 1, 0.36, 1),
              background-color 220ms ease,
              color 220ms ease,
              border-color 220ms ease,
              opacity 220ms ease !important;
          }

          .wisdom-home-tutorial__progress-step.is-active
            .wisdom-home-tutorial__progress-number {
            animation: wisdomHomeProgressSettle 340ms
              cubic-bezier(0.22, 1, 0.36, 1) both;
          }

          .wisdom-home-tutorial__card-dot.is-active {
            transform: scale(1.14);
          }

          /* CTA: premium micro-motion, no bounce/loop. */
          .wisdom-home-tutorial__cta-icon,
          .wisdom-home-tutorial__cta .wisdom-hero-customize-icon {
            transition: transform 200ms cubic-bezier(0.22, 1, 0.36, 1) !important;
          }

          .wisdom-home-tutorial__cta:hover {
            transform: translateY(-2px) !important;
          }

          .wisdom-home-tutorial__cta:hover .wisdom-home-tutorial__cta-icon {
            transform: translateX(2px);
          }

          .wisdom-home-tutorial__cta:hover .wisdom-hero-customize-icon {
            transform: rotate(7deg);
          }

          .wisdom-home-tutorial__cta:active {
            transform: translateY(0) scale(0.99) !important;
          }

          @keyframes wisdomHomeHeroIntro {
            from {
              opacity: 0;
              transform: translateY(8px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          @keyframes wisdomHomeStepCopyIn {
            from {
              opacity: 0;
              transform: translateY(7px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          @keyframes wisdomHomeHeroImageReveal {
            from {
              opacity: 0.72;
              transform: scale(0.992);
            }
            to {
              opacity: 1;
              transform: scale(1);
            }
          }

          @keyframes wisdomHomeProgressSettle {
            0% {
              transform: scale(0.94);
            }
            65% {
              transform: scale(1.06);
            }
            100% {
              transform: scale(1);
            }
          }

          @media (prefers-reduced-motion: reduce) {
            .wisdom-home-tutorial__kicker,
            .wisdom-home-tutorial__headline,
            .wisdom-home-tutorial__hero-summary,
            .wisdom-home-tutorial__active-step,
            .wisdom-home-tutorial__cta,
            .wisdom-home-tutorial__catalog-link,
            .wisdom-home-tutorial__main-card .wisdom-home-tutorial__image,
            .wisdom-home-tutorial__progress-step.is-active
              .wisdom-home-tutorial__progress-number {
              animation: none !important;
            }

            .wisdom-home-tutorial__progress-fill,
            .wisdom-home-tutorial__progress-number,
            .wisdom-home-tutorial__card-dot,
            .wisdom-home-tutorial__cta,
            .wisdom-home-tutorial__cta-icon,
            .wisdom-home-tutorial__cta .wisdom-hero-customize-icon {
              transition: none !important;
            }

            .wisdom-home-tutorial__cta:hover,
            .wisdom-home-tutorial__cta:active,
            .wisdom-home-tutorial__cta:hover .wisdom-home-tutorial__cta-icon,
            .wisdom-home-tutorial__cta:hover .wisdom-hero-customize-icon,
            .wisdom-home-tutorial__card-dot.is-active {
              transform: none !important;
            }
          }

          /* WISDOM HOME GUIDED MOTION V1.0.0 END */
        `}</style>

        <div className="wisdom-home-tutorial__frame">
          {(() => {
            const slide = HERO_SHOWCASE_SLIDES[heroSlideIndex];
            const hasPreviousSlide = heroSlideIndex > 0;
            const hasNextSlide =
              heroSlideIndex < HERO_SHOWCASE_SLIDES.length - 1;
            const previousSlide = hasPreviousSlide
              ? HERO_SHOWCASE_SLIDES[heroSlideIndex - 1]
              : null;
            const nextSlide = hasNextSlide
              ? HERO_SHOWCASE_SLIDES[heroSlideIndex + 1]
              : null;
            const previousPreviousSlide =
              heroSlideIndex > 1
                ? HERO_SHOWCASE_SLIDES[heroSlideIndex - 2]
                : null;
            const nextNextSlide =
              heroSlideIndex < HERO_SHOWCASE_SLIDES.length - 2
                ? HERO_SHOWCASE_SLIDES[heroSlideIndex + 2]
                : null;

            return (
              <>
                {/* LEFT COLUMN: Step Info & Buttons */}
                <div className="wisdom-home-tutorial__copy">
                  <div
                    className="wisdom-home-tutorial__active-step"
                    key={`copy-${slide.step}`}
                  >
                    <p className="wisdom-home-tutorial__eyebrow">
                      STEP {Number(slide.step)} OF {HERO_SHOWCASE_SLIDES.length}
                    </p>
                    <h2 className="wisdom-home-tutorial__step-title">
                      {slide.title}
                    </h2>
                    <p className="wisdom-home-tutorial__description">
                      {slide.description}
                    </p>
                  </div>

                  <button
                    type="button"
                    className="wisdom-home-tutorial__cta"
                    onClick={() => navigate("/customize")}
                  >
                    <span className="wisdom-home-tutorial__cta-label">
                      START CUSTOMIZING
                    </span>
                    <span
                      className="wisdom-home-tutorial__cta-icon"
                      aria-hidden="true"
                    >
                      <FurnitureEditIcon />
                    </span>
                  </button>

                  <button
                    type="button"
                    className="wisdom-home-tutorial__catalog-link"
                    onClick={handleBrowseFurnitureClick}
                  >
                    SHOP READY-MADE FURNITURE
                  </button>
                </div>

                {/* RIGHT COLUMN: Wider & Shorter Image Slider */}
                <div className="wisdom-home-tutorial__visual">
                  <div
                    className={`wisdom-home-tutorial__stage${heroIsDragging ? " is-dragging" : ""}${heroIsSettling ? " is-settling" : ""}${heroIsRebasing ? " is-rebasing" : ""}${heroDragOffset < 0 ? " is-moving-next" : ""}${heroDragOffset > 0 ? " is-moving-previous" : ""}`}
                    style={{
                      "--wisdom-drag-x": `${heroDragOffset}px`,
                      "--wisdom-drag-progress": Math.min(
                        1,
                        Math.abs(heroDragOffset) / Math.max(1, heroDragTravel),
                      ),
                    }}
                    onPointerDown={handleHeroPointerDown}
                    onPointerMove={handleHeroPointerMove}
                    onPointerUp={handleHeroPointerUp}
                    onPointerCancel={handleHeroPointerCancel}
                    aria-label="Hold the tutorial image and drag it manually left or right"
                  >
                    {previousPreviousSlide ? (
                      <article
                        className="wisdom-home-tutorial__neighbor wisdom-home-tutorial__neighbor--before-previous"
                        aria-hidden="true"
                      >
                        <div className="wisdom-home-tutorial__media">
                          <img
                            src={previousPreviousSlide.src}
                            alt=""
                            draggable="false"
                          />
                        </div>
                      </article>
                    ) : null}

                    {previousSlide ? (
                      <article
                        className="wisdom-home-tutorial__neighbor wisdom-home-tutorial__neighbor--previous"
                        aria-hidden="true"
                      >
                        <div className="wisdom-home-tutorial__media">
                          <img
                            src={previousSlide.src}
                            alt=""
                            draggable="false"
                          />
                        </div>
                      </article>
                    ) : null}

                    <article
                      className="wisdom-home-tutorial__main-card"
                      key={`main-${slide.step}`}
                    >
                      <div className="wisdom-home-tutorial__media">
                        <img
                          className={`wisdom-home-tutorial__image wisdom-home-tutorial__image--step-${heroSlideIndex + 1}`}
                          src={slide.src}
                          alt={slide.alt}
                          draggable="false"
                        />
                      </div>
                    </article>

                    {nextSlide ? (
                      <article
                        className="wisdom-home-tutorial__neighbor wisdom-home-tutorial__neighbor--next"
                        aria-hidden="true"
                      >
                        <div className="wisdom-home-tutorial__media">
                          <img src={nextSlide.src} alt="" draggable="false" />
                        </div>
                      </article>
                    ) : null}

                    {nextNextSlide ? (
                      <article
                        className="wisdom-home-tutorial__neighbor wisdom-home-tutorial__neighbor--after-next"
                        aria-hidden="true"
                      >
                        <div className="wisdom-home-tutorial__media">
                          <img
                            src={nextNextSlide.src}
                            alt=""
                            draggable="false"
                          />
                        </div>
                      </article>
                    ) : null}
                  </div>

                  <div
                    className="wisdom-home-tutorial__card-nav"
                    aria-label="Tutorial slide position"
                  >
                    <div className="wisdom-home-tutorial__card-dots">
                      {HERO_SHOWCASE_SLIDES.map((dotSlide, dotIndex) => (
                        <button
                          key={dotSlide.step}
                          type="button"
                          className={`wisdom-home-tutorial__card-dot${dotIndex === heroSlideIndex ? " is-active" : ""}`}
                          onClick={() => goToHeroSlide(dotIndex)}
                          aria-label={`Go to tutorial step ${dotIndex + 1}: ${dotSlide.label}`}
                          aria-current={
                            dotIndex === heroSlideIndex ? "step" : undefined
                          }
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </>
            );
          })()}

          {/* BOTTOM ROW: How It Works Tracker */}
          <div className="wisdom-home-tutorial__progress-wrap">
            <p className="wisdom-home-tutorial__progress-heading">
              HOW IT WORKS
            </p>
            <nav
              className="wisdom-home-tutorial__progress"
              aria-label="Customization tutorial steps"
            >
              <span
                className="wisdom-home-tutorial__progress-rail"
                aria-hidden="true"
              >
                <span
                  className="wisdom-home-tutorial__progress-fill"
                  style={{
                    width: `${HERO_SHOWCASE_SLIDES.length > 1 ? (heroSlideIndex / (HERO_SHOWCASE_SLIDES.length - 1)) * 100 : 0}%`,
                  }}
                />
              </span>

              {HERO_SHOWCASE_SLIDES.map((progressSlide, index) => (
                <button
                  key={progressSlide.step}
                  type="button"
                  className={`wisdom-home-tutorial__progress-step${index <= heroSlideIndex ? " is-reached" : ""}${index === heroSlideIndex ? " is-active" : ""}`}
                  onClick={() => goToHeroSlide(index)}
                  aria-current={index === heroSlideIndex ? "step" : undefined}
                  aria-label={`Step ${index + 1}: ${progressSlide.label}`}
                >
                  <span className="wisdom-home-tutorial__progress-number">
                    {index + 1}
                  </span>
                  <span className="wisdom-home-tutorial__progress-label">
                    {progressSlide.label}
                  </span>
                </button>
              ))}
            </nav>
          </div>
        </div>

        {/* SINGLE UNIFIED CSS BLOCK */}
        <style>{`
          .wisdom-home-tutorial {
            width: 100%;
            box-sizing: border-box;
            margin: 0;
            padding: clamp(16px, 2.5vh, 24px) clamp(28px, 4vw, 70px) 16px;
            display: flex;
            flex-direction: column;
            align-items: center;
            background: #ffffff;
            color: #111111;
            font-family: "Montserrat", sans-serif;
          }

          .wisdom-home-tutorial__header-section {
            width: 100%;
            max-width: 1000px;
            text-align: center;
            margin-bottom: clamp(16px, 2vh, 24px);
            display: flex;
            flex-direction: column;
            align-items: center;
          }

          .wisdom-home-tutorial__kicker {
            margin: 0 0 10px;
            color: #252525;
            font-size: 0.88rem;
            font-weight: 700;
            letter-spacing: 0.105em;
            text-transform: uppercase;
          }

          .wisdom-home-tutorial__headline {
            margin: 0 0 12px;
            color: #111111;
            font-size: clamp(1.5rem, 2vw, 2rem);
            font-weight: 800;
            line-height: 1.1;
            letter-spacing: -0.02em;
          }

          .wisdom-home-tutorial__hero-summary {
            margin: 0;
            color: #343434;
            font-size: 1.15rem;
            font-weight: 500;
            line-height: 1.5;
            max-width: 600px;
          }

          .wisdom-home-tutorial__frame {
            width: min(100%, 1680px);
            margin: 0 auto;
            display: grid;
            grid-template-columns: 260px minmax(0, 1fr);
            grid-template-areas:
              "copy visual"
              "progress progress";
            align-items: center;
            column-gap: clamp(40px, 6vw, 80px);
            row-gap: 12px;
          }

          .wisdom-home-tutorial__copy {
            grid-area: copy;
            display: flex;
            flex-direction: column;
            align-items: flex-start;
          }

          .wisdom-home-tutorial__active-step {
            width: 100%;
            margin-bottom: 24px;
            height: 190px; 
          }

          .wisdom-home-tutorial__eyebrow {
            margin: 0 0 10px;
            color: #595959;
            font-size: 0.86rem;
            font-weight: 600;
            letter-spacing: 0.11em;
          }

          .wisdom-home-tutorial__step-title {
            margin: 0 0 12px;
            color: #111111;
            font-size: clamp(1.2rem, 1.4vw, 1.45rem);
            font-weight: 700;
            line-height: 1.18;
            letter-spacing: -0.02em;
          }

          .wisdom-home-tutorial__description {
            margin: 0;
            color: #444444;
            font-size: 1.05rem;
            font-weight: 400;
            line-height: 1.58;
          }

          .wisdom-home-tutorial__cta,
          .wisdom-home-tutorial__catalog-link {
            width: 100%;
            max-width: 290px;
            min-height: 50px;
            box-sizing: border-box;
            border-radius: 999px;
            font-family: "Montserrat", sans-serif;
            font-size: 0.84rem;
            font-weight: 700;
            letter-spacing: 0.065em;
            transition: all 160ms ease;
            cursor: pointer;
          }

          .wisdom-home-tutorial__cta {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 32px;
            align-items: center;
            gap: 8px;
            padding: 5px 9px 5px 22px;
            border: 1px solid #111111;
            background: #111111;
            color: #ffffff;
            margin-bottom: 12px;
          }

          .wisdom-home-tutorial__cta:hover {
            background: #222222;
            transform: translateY(-1px);
          }

          .wisdom-home-tutorial__cta-label {
            text-align: center;
            white-space: nowrap;
          }

          .wisdom-home-tutorial__cta-icon {
            width: 32px;
            height: 32px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: 50%;
            background: #ffffff;
            color: #111111;
          }

          .wisdom-hero-customize-icon {
            width: 17px;
            height: 17px;
            stroke: currentColor;
            stroke-width: 1.6;
          }

          .wisdom-home-tutorial__catalog-link {
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 12px 24px;
            border: 1.4px solid #111111;
            background: #ffffff;
            color: #111111;
          }

          .wisdom-home-tutorial__catalog-link:hover {
            background: #111111;
            color: #ffffff;
            transform: translateY(-1px);
          }

          .wisdom-home-tutorial__visual {
            grid-area: visual;
            min-width: 0;
            position: relative;
          }

          .wisdom-home-tutorial__stage {
            --wisdom-card-peek: clamp(40px, 12vw, 160px);
            --wisdom-card-gap: 20px;
            --wisdom-card-width: calc(100% - (var(--wisdom-card-peek) * 2));
            position: relative;
            width: 100%;
            height: clamp(350px, 52vh, 680px);
            overflow: hidden;
            cursor: grab;
            touch-action: pan-y;
            user-select: none;
          }

          .wisdom-home-tutorial__stage.is-dragging {
            cursor: grabbing;
          }

          .wisdom-home-tutorial__main-card,
          .wisdom-home-tutorial__neighbor {
            position: absolute;
            top: 0;
            width: var(--wisdom-card-width);
            height: 100%;
            overflow: hidden;
            box-sizing: border-box;
            border: 1px solid #111111;
            border-radius: 4px;
            background: #ffffff;
            transform: translate3d(var(--wisdom-drag-x, 0px), 0, 0);
            transition: transform 280ms cubic-bezier(0.22, 0.78, 0.2, 1);
            will-change: transform;
          }

          .wisdom-home-tutorial__main-card::after,
          .wisdom-home-tutorial__neighbor::after {
            content: "";
            position: absolute;
            z-index: 20;
            left: 0;
            right: 0;
            bottom: 0;
            height: 1px;
            background: #111111;
            pointer-events: none;
          }

          .wisdom-home-tutorial__main-card {
            left: var(--wisdom-card-peek);
            z-index: 2;
          }
          
          .wisdom-home-tutorial__neighbor {
            z-index: 1;
            opacity: 0.96;
          }

          .wisdom-home-tutorial__neighbor--next {
            left: calc(var(--wisdom-card-peek) + var(--wisdom-card-width) + var(--wisdom-card-gap));
            transform-origin: left center;
            transform: translate3d(var(--wisdom-drag-x, 0px), 0, 0) scale(0.85);
          }

          .wisdom-home-tutorial__neighbor--previous {
            left: calc(var(--wisdom-card-peek) - var(--wisdom-card-width) - var(--wisdom-card-gap));
            transform-origin: right center;
            transform: translate3d(var(--wisdom-drag-x, 0px), 0, 0) scale(0.85);
          }

          .wisdom-home-tutorial__stage.is-dragging .wisdom-home-tutorial__main-card,
          .wisdom-home-tutorial__stage.is-dragging .wisdom-home-tutorial__neighbor,
          .wisdom-home-tutorial__stage.is-rebasing .wisdom-home-tutorial__main-card,
          .wisdom-home-tutorial__stage.is-rebasing .wisdom-home-tutorial__neighbor {
            transition: none !important;
          }

          .wisdom-home-tutorial__stage.is-moving-next .wisdom-home-tutorial__neighbor--next {
            transform: translate3d(var(--wisdom-drag-x, 0px), 0, 0) scale(calc(0.85 + (var(--wisdom-drag-progress, 0) * 0.15)));
          }

          .wisdom-home-tutorial__stage.is-moving-previous .wisdom-home-tutorial__neighbor--previous {
            transform: translate3d(var(--wisdom-drag-x, 0px), 0, 0) scale(calc(0.85 + (var(--wisdom-drag-progress, 0) * 0.15)));
          }

          .wisdom-home-tutorial__stage.is-moving-next .wisdom-home-tutorial__main-card {
            transform-origin: right center;
            transform: translate3d(var(--wisdom-drag-x, 0px), 0, 0) scale(calc(1 - (var(--wisdom-drag-progress, 0) * 0.15)));
          }

          .wisdom-home-tutorial__stage.is-moving-previous .wisdom-home-tutorial__main-card {
            transform-origin: left center;
            transform: translate3d(var(--wisdom-drag-x, 0px), 0, 0) scale(calc(1 - (var(--wisdom-drag-progress, 0) * 0.15)));
          }

          .wisdom-home-tutorial__neighbor--after-next {
            left: calc(var(--wisdom-card-peek) + (var(--wisdom-card-width) * 2) + (var(--wisdom-card-gap) * 2));
            transform-origin: left center;
            transform: translate3d(var(--wisdom-drag-x, 0px), 0, 0) scale(0.85);
          }

          .wisdom-home-tutorial__neighbor--before-previous {
            left: calc(var(--wisdom-card-peek) - (var(--wisdom-card-width) * 2) - (var(--wisdom-card-gap) * 2));
            transform-origin: right center;
            transform: translate3d(var(--wisdom-drag-x, 0px), 0, 0) scale(0.85);
          }

          .wisdom-home-tutorial__media {
            width: 100%;
            height: 100%;
            overflow: hidden;
            background: #fafafa;
          }

          .wisdom-home-tutorial__media img {
            width: 100%;
            height: 100%;
            object-fit: contain;
            object-position: center;
            background: #fafafa;
            pointer-events: none;
            user-select: none;
          }

          .wisdom-home-tutorial__card-nav {
            width: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            padding-right: 0;
            box-sizing: border-box;
            margin-top: 24px;
            margin-bottom: -8px;
          }

          .wisdom-home-tutorial__card-dots {
            display: flex;
            gap: 16px;
          }

          .wisdom-home-tutorial__card-dot {
            width: 8px;
            height: 8px;
            padding: 0;
            border: 0;
            border-radius: 50%;
            background: #d0d0d0;
            cursor: pointer;
            transition: background 150ms ease, transform 150ms ease;
          }

          .wisdom-home-tutorial__card-dot.is-active {
            background: #111111;
            transform: scale(1.1);
          }

          .wisdom-home-tutorial__progress-wrap {
            grid-area: progress;
            width: 100%;
            display: grid;
            grid-template-columns: 200px minmax(0, 1fr);
            align-items: start;
            column-gap: 24px;
            padding-top: 10px;
          }

          .wisdom-home-tutorial__progress-heading {
            margin: 8px 0 0;
            color: #111111;
            font-size: 1.05rem;
            font-weight: 700;
            letter-spacing: 0.08em;
            white-space: nowrap;
            text-transform: uppercase;
            transform: translateX(110px);
          }

          .wisdom-home-tutorial__progress {
            position: relative;
            width: 100%;
            display: grid;
            grid-template-columns: repeat(6, minmax(0, 1fr));
            align-items: start;
          }

          .wisdom-home-tutorial__progress-rail {
            position: absolute;
            z-index: 0;
            top: 19px;
            left: calc(100% / 12);
            right: calc(100% / 12);
            height: 1px;
            background: #cccccc;
          }

          .wisdom-home-tutorial__progress-fill {
            display: block;
            height: 100%;
            background: #111111;
            transition: width 220ms ease;
          }

          .wisdom-home-tutorial__progress-step {
            position: relative;
            z-index: 1;
            min-width: 0;
            background: transparent;
            border: none;
            cursor: pointer;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 10px;
          }

          .wisdom-home-tutorial__progress-number {
            width: 40px;
            height: 40px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            border: 1px solid #c8c8c8;
            border-radius: 3px;
            background: #ffffff;
            color: #111111;
            font-size: 0.82rem;
            font-weight: 600;
            transition: background 180ms ease, color 180ms ease, border-color 180ms ease;
          }

          .wisdom-home-tutorial__progress-step.is-reached .wisdom-home-tutorial__progress-number {
            border-color: #111111;
            background: #111111;
            color: #ffffff;
          }

          .wisdom-home-tutorial__progress-label {
            color: #5f5f5f;
            font-size: 0.95rem;
            font-weight: 500;
            text-align: center;
          }

          .wisdom-home-tutorial__progress-step.is-active .wisdom-home-tutorial__progress-label {
            color: #111111;
            font-weight: 700;
          }

          @media (max-width: 1050px) {
            .wisdom-home-tutorial__frame {
              grid-template-columns: 1fr;
              grid-template-areas:
                "visual"
                "copy"
                "progress";
              row-gap: 30px;
            }

            .wisdom-home-tutorial__copy {
              align-items: center;
              text-align: center;
            }

            .wisdom-home-tutorial__active-step {
              min-height: auto;
            }

            .wisdom-home-tutorial__progress-wrap {
              grid-template-columns: 1fr;
              justify-items: center;
              text-align: center;
              row-gap: 20px;
            }

            .wisdom-home-tutorial__progress-heading {
              transform: none;
              margin: 0;
            }
          }

          @media (max-width: 760px) {
            .wisdom-home-tutorial__headline {
              font-size: clamp(1.4rem, 4.5vw, 1.6rem);
            }

            .wisdom-home-tutorial__stage {
              height: 380px;
            }
            
            .wisdom-home-tutorial__active-step {
              height: auto;
              min-height: 140px;
            }

            .wisdom-home-tutorial__progress-number {
              width: 32px;
              height: 32px;
            }

            .wisdom-home-tutorial__progress-rail {
              top: 16px;
            }

            .wisdom-home-tutorial__progress-label {
              font-size: 0.75rem;
              white-space: normal;
            }
          }
        `}</style>
      </section>

      {/* SHOP BY CATEGORY */}
      <section
        id="shop-by-category"
        style={{
          padding: "26px 14px 8px",
          scrollMarginTop: "92px",
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
            gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
            gap: "16px",
            alignItems: "start",
            marginBottom: "18px",
          }}
        >
          {topCategoryCards.map((cat, i) => (
            <div
              key={`top-${i}`}
              onClick={() => handleHomeCategoryClick(cat)}
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
            gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
            gap: "16px",
            alignItems: "start",
          }}
        >
          {bottomCategoryCards.map((cat, i) => (
            <div
              key={`bottom-${i}`}
              onClick={() => handleHomeCategoryClick(cat)}
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
          New Products
        </h2>

        {latestProducts.length > 0 ? (
          <>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "center",
                gap: "22px",
                alignItems: "stretch",
              }}
            >
              {latestProducts.map((product) => {
                const isOut = isOutOfStock(product);

                return (
                  <div
                    key={product.id}
                    onClick={() =>
                      navigate(
                        `/catalog?q=${encodeURIComponent(product?.name || "")}`,
                      )
                    }
                    style={{
                      cursor: "pointer",
                      background: "#ffffff",
                      border: "1px solid #e7e7e7",
                      transition: "transform 0.18s ease",
                      display: "flex",
                      flexDirection: "column",
                      height: "100%",
                      width: "clamp(260px, calc((100% - 66px) / 4), 438px)",
                      maxWidth: "clamp(260px, calc((100% - 66px) / 4), 438px)",
                      flex: "0 1 clamp(260px, calc((100% - 66px) / 4), 438px)",
                      boxSizing: "border-box",
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
                        borderBottom: "1px solid #e7e7e7",
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
                        padding: "16px 18px 18px",
                        textAlign: "center",
                        display: "flex",
                        flexDirection: "column",
                        flex: 1,
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
                          color: "#111111",
                          marginBottom: "14px",
                          lineHeight: "1.3",
                          fontWeight: 500,
                        }}
                      >
                        {getAvailabilityText(product)}
                      </div>

                      <div
                        style={{
                          width: "100%",
                          maxWidth: "220px",
                          margin: "0 auto",
                        }}
                      >
                        <button
                          type="button"
                          onClick={(e) => handleLatestView(e, product)}
                          style={{
                            width: "100%",
                            background: "#111111",
                            color: "#ffffff",
                            border: "1px solid #111111",
                            padding: "12px 18px",
                            fontSize: "0.95rem",
                            fontWeight: 600,
                            cursor: "pointer",
                            fontFamily: "'Montserrat', sans-serif",
                          }}
                        >
                          View
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
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
            No new products available yet.
          </div>
        )}
      </section>
    </div>
  );
}
