import React, { useEffect, useRef, useState } from "react";
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
    description: "Choose a furniture design you want to customize. Check its preview, size, and details. Click View to check it first, or Customize to start editing.",
    alt: "Choose a furniture design from the WISDOM customer customization gallery",
  },
  {
    src: tutorialSetSize,
    step: "2",
    label: "Set Size",
    title: "Set size",
    description: "Adjust the width, height, and depth to fit your available space.",
    alt: "Set width height and depth in the WISDOM 3D furniture customizer",
  },
  {
    src: tutorialEditParts,
    step: "3",
    label: "Edit Parts",
    title: "Edit parts",
    description: "Select a furniture part and adjust only the section you want to change.",
    alt: "Edit individual furniture parts in the WISDOM 3D customizer",
  },
  {
    src: tutorialChooseFinish,
    step: "4",
    label: "Choose Finish",
    title: "Choose finish",
    description: "Pick the wood finish or color that matches the look you want.",
    alt: "Choose wood finish color in the WISDOM customizer",
  },
  {
    src: tutorialReviewDesign,
    step: "5",
    label: "Review Design",
    title: "Review design",
    description: "Check the final size, finish, and available 3D views before continuing.",
    alt: "Review the final customized furniture dimensions finish and 3D views",
  },
  {
    src: tutorialSubmitRequest,
    step: "6",
    label: "Submit Request",
    title: "Submit request",
    description: "Review your design, quantity, notes, and reference photos, then send your request for quotation.",
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
  const [heroIsAutoLooping, setHeroIsAutoLooping] = useState(false);
  const heroStageRef = useRef(null);
  const heroAutoAdvanceRef = useRef(null);

  const goToHeroSlide = (nextIndex) => {
    const totalSlides = HERO_SHOWCASE_SLIDES.length;
    if (
      totalSlides <= 0 ||
      heroIsDragging ||
      heroIsSettling ||
      heroIsRebasing ||
      heroIsAutoLooping
    )
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

  const measureHeroTravel = (direction = 1) => {
    const stage = heroStageRef.current;

    if (!stage) {
      return Math.max(1, heroDragTravel);
    }

    const stageRect = stage.getBoundingClientRect();
    const mainCard = stage.querySelector(".wisdom-home-tutorial__main-card");
    const neighborCard = stage.querySelector(
      direction > 0
        ? ".wisdom-home-tutorial__neighbor--next"
        : ".wisdom-home-tutorial__neighbor--previous",
    );

    let travel =
      mainCard && neighborCard
        ? Math.abs(neighborCard.offsetLeft - mainCard.offsetLeft)
        : 0;

    if (!Number.isFinite(travel) || travel < 1) {
      const visiblePeek = Math.max(88, Math.min(128, stageRect.width * 0.1));
      travel = Math.max(260, stageRect.width - visiblePeek + 18);
    }

    return travel;
  };

  const settleHeroToStep = (
    direction,
    targetIndexOverride = null,
    travelOverride = null,
    clearAutoLoop = false,
  ) => {
    const targetIndex = Number.isInteger(targetIndexOverride)
      ? targetIndexOverride
      : heroSlideIndex + direction;
    const isValidTarget =
      targetIndex >= 0 && targetIndex < HERO_SHOWCASE_SLIDES.length;

    if (!isValidTarget) {
      settleHeroBack();
      return;
    }

    const settleTravel =
      Number.isFinite(travelOverride) && travelOverride > 0
        ? travelOverride
        : heroDragTravel;

    setHeroIsDragging(false);
    setHeroIsSettling(true);

    // Autoplay uses this exact same measured rail motion as a completed manual drag.
    setHeroDragOffset(direction > 0 ? -settleTravel : settleTravel);

    window.setTimeout(() => {
      // Disable transform animation for the single rebase frame. The incoming neighbor is already
      // at the active-card position, so swapping the slide index remains visually seamless.
      setHeroIsRebasing(true);
      setHeroSlideIndex(targetIndex);
      setHeroDragOffset(0);

      if (clearAutoLoop) {
        setHeroIsAutoLooping(false);
      }

      finishHeroRebase();
    }, 280);
  };

  const autoAdvanceHero = () => {
    if (
      heroIsDragging ||
      heroIsSettling ||
      heroIsRebasing ||
      heroIsAutoLooping
    ) {
      return;
    }

    const lastIndex = HERO_SHOWCASE_SLIDES.length - 1;

    if (heroSlideIndex < lastIndex) {
      const travel = measureHeroTravel(1);
      setHeroDragTravel(travel);
      settleHeroToStep(1, null, travel);
      return;
    }

    // At Step 6, temporarily render Step 1 as the next rail card first.
    // Two animation frames let the browser place it before the same settle animation starts.
    setHeroIsAutoLooping(true);

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const nextCard = heroStageRef.current?.querySelector(
          ".wisdom-home-tutorial__neighbor--next",
        );

        if (!nextCard) {
          setHeroIsAutoLooping(false);
          return;
        }

        const travel = measureHeroTravel(1);
        setHeroDragTravel(travel);
        settleHeroToStep(1, 0, travel, true);
      });
    });
  };

  heroAutoAdvanceRef.current = autoAdvanceHero;

  useEffect(() => {
    if (
      heroIsDragging ||
      heroIsSettling ||
      heroIsRebasing ||
      heroIsAutoLooping
    ) {
      return undefined;
    }

    const autoPlayTimer = window.setTimeout(() => {
      heroAutoAdvanceRef.current?.();
    }, 3000);

    return () => {
      window.clearTimeout(autoPlayTimer);
    };
  }, [
    heroSlideIndex,
    heroIsDragging,
    heroIsSettling,
    heroIsRebasing,
    heroIsAutoLooping,
  ]);

  const handleHeroPointerDown = (event) => {
    if (
      heroIsAutoLooping ||
      heroIsSettling ||
      heroIsRebasing ||
      !event.isPrimary
    )
      return;
    if (event.pointerType === "mouse" && event.button !== 0) return;

    event.preventDefault();

    const stage = event.currentTarget;
    const stageRect = stage.getBoundingClientRect();
    const mainCard = stage.querySelector(".wisdom-home-tutorial__main-card");
    const nextCard = stage.querySelector(".wisdom-home-tutorial__neighbor--next");
    const previousCard = stage.querySelector(".wisdom-home-tutorial__neighbor--previous");

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
    if (heroActivePointerId !== event.pointerId || heroDragStartX == null) return;

    const rawOffset = event.clientX - heroDragStartX;
    setHeroDragOffset(clampHeroDragOffset(rawOffset));
  };

  const handleHeroPointerUp = (event) => {
    if (!heroIsDragging || heroIsSettling || heroIsRebasing) return;
    if (heroActivePointerId !== event.pointerId || heroDragStartX == null) return;

    if (event.currentTarget.releasePointerCapture && event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const finalOffset = clampHeroDragOffset(event.clientX - heroDragStartX);
    const direction = getHeroDragDirection(finalOffset);
    const progress = Math.min(1, Math.abs(finalOffset) / Math.max(1, heroDragTravel));
    const canMoveNext = direction === 1 && heroSlideIndex < HERO_SHOWCASE_SLIDES.length - 1;
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
        const res = await api.get("/customer/products?type=standard&sort=newest&limit=60");
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
      <section className="wisdom-home-tutorial" aria-label="How to customize furniture with WISDOM">
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
              : heroIsAutoLooping
                ? HERO_SHOWCASE_SLIDES[0]
                : null;
            const previousPreviousSlide =
              heroSlideIndex > 1
                ? HERO_SHOWCASE_SLIDES[heroSlideIndex - 2]
                : null;
            const nextNextSlide =
              heroSlideIndex < HERO_SHOWCASE_SLIDES.length - 2
                ? HERO_SHOWCASE_SLIDES[heroSlideIndex + 2]
                : heroIsAutoLooping
                  ? HERO_SHOWCASE_SLIDES[1]
                  : null;

            return (
              <>
                <div className="wisdom-home-tutorial__copy">
                  <p className="wisdom-home-tutorial__kicker">
                    CUSTOM FURNITURE &amp; BUILT-IN SOLUTIONS
                  </p>

                  <h1 className="wisdom-home-tutorial__headline">
                    <span>START CUSTOMIZING YOUR FURNITURE</span>
                    <span>IN 6 SIMPLE STEPS.</span>
                  </h1>

                  <p className="wisdom-home-tutorial__hero-summary">
                    Make it fit your space, match your style, and work for your needs.
                  </p>

                  <div className="wisdom-home-tutorial__active-step" key={`copy-${slide.step}`}>
                    <p className="wisdom-home-tutorial__eyebrow">
                      STEP {Number(slide.step)} OF {HERO_SHOWCASE_SLIDES.length}
                    </p>
                    <h2 className="wisdom-home-tutorial__step-title">{slide.title}</h2>
                    <p className="wisdom-home-tutorial__description">{slide.description}</p>
                  </div>

                  <button
                    type="button"
                    className="wisdom-home-tutorial__cta"
                    onClick={() => navigate("/customize")}
                  >
                    <span className="wisdom-home-tutorial__cta-label">START CUSTOMIZING</span>
                    <span className="wisdom-home-tutorial__cta-icon" aria-hidden="true">
                      <FurnitureEditIcon />
                    </span>
                  </button>

                  {/* WISDOM HOME DUAL CUSTOMER PATH V1.0.13.10 */}
                  {/* WISDOM HOME BROWSE FURNITURE BUTTON + CATEGORY SCROLL V1.0.13.11 */}
                  <button
                    type="button"
                    className="wisdom-home-tutorial__catalog-link"
                    onClick={handleBrowseFurnitureClick}
                  >
                    SHOP READY-MADE FURNITURE
                  </button>
                </div>

                <div className="wisdom-home-tutorial__visual">
                  <div
                    ref={heroStageRef}
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
                      <article className="wisdom-home-tutorial__neighbor wisdom-home-tutorial__neighbor--before-previous" aria-hidden="true">
                        <div className="wisdom-home-tutorial__media">
                          <img src={previousPreviousSlide.src} alt="" draggable="false" />
                        </div>
                      </article>
                    ) : null}

                    {previousSlide ? (
                      <article className="wisdom-home-tutorial__neighbor wisdom-home-tutorial__neighbor--previous" aria-hidden="true">
                        <div className="wisdom-home-tutorial__media">
                          <img src={previousSlide.src} alt="" draggable="false" />
                        </div>
                      </article>
                    ) : null}

                    <article className="wisdom-home-tutorial__main-card" key={`main-${slide.step}`}>
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
                      <article className="wisdom-home-tutorial__neighbor wisdom-home-tutorial__neighbor--next" aria-hidden="true">
                        <div className="wisdom-home-tutorial__media">
                          <img src={nextSlide.src} alt="" draggable="false" />
                        </div>
                      </article>
                    ) : null}

                    {nextNextSlide ? (
                      <article className="wisdom-home-tutorial__neighbor wisdom-home-tutorial__neighbor--after-next" aria-hidden="true">
                        <div className="wisdom-home-tutorial__media">
                          <img src={nextNextSlide.src} alt="" draggable="false" />
                        </div>
                      </article>
                    ) : null}
                  </div>
</div>
              </>
            );
          })()}

          <div className="wisdom-home-tutorial__progress-wrap">
                          {/* WISDOM HOME TUTORIAL CENTERED DOTS + HOW IT WORKS FIX V1.0.13.9.2 */}
              <style>{`
                /* WISDOM HOME TUTORIAL HOW IT WORKS LEFT SHIFT V1.0.13.9.3 */
                /* Center the six dots under the active/main picture only.
                   The narrow neighboring-card preview is excluded. */
                @media (min-width: 1051px) {
                  .wisdom-home-tutorial__card-nav {
                    left: 0 !important;
                    right: auto !important;
                    width: calc(100% - clamp(88px, 8vw, 128px)) !important;
                    box-sizing: border-box !important;
                    justify-content: center !important;
                  }

                  .wisdom-home-tutorial__progress-wrap {
                    grid-template-columns: 220px minmax(0, 1fr) !important;
                    align-items: start !important;
                    column-gap: 24px !important;
                  }

                  .wisdom-home-tutorial__progress-heading {
                    margin: 8px 0 0 !important;
                    padding-left: 8px !important;
                    color: #111111 !important;
                    font-size: 1rem !important;
                    font-weight: 700 !important;
                    line-height: 1.15 !important;
                    letter-spacing: 0.075em !important;
                    white-space: nowrap !important;
                  }
                }

                @media (min-width: 721px) and (max-width: 1050px) {
                  .wisdom-home-tutorial__card-nav {
                    left: 0 !important;
                    right: auto !important;
                    width: calc(100% - 74px) !important;
                    box-sizing: border-box !important;
                    justify-content: center !important;
                  }

                  .wisdom-home-tutorial__progress-heading {
                    margin: 4px 0 0 !important;
                    padding-left: 0 !important;
                    font-size: 0.96rem !important;
                    font-weight: 700 !important;
                    line-height: 1.15 !important;
                  }
                }

                @media (max-width: 720px) {
                  .wisdom-home-tutorial__card-nav {
                    left: 0 !important;
                    right: auto !important;
                    width: calc(100% - 52px) !important;
                    box-sizing: border-box !important;
                    justify-content: center !important;
                  }

                  .wisdom-home-tutorial__progress-heading {
                    margin: 0 !important;
                    padding-left: 0 !important;
                    font-size: 0.92rem !important;
                    font-weight: 700 !important;
                    line-height: 1.15 !important;
                  }
                }
              `}</style>
                            {/* WISDOM HOME TUTORIAL HOW IT WORKS DIRECT RIGHT OFFSET V1.0.13.9.7 */}
              <style>{`
                @media (min-width: 1051px) {
                  .wisdom-home-tutorial__progress-heading {
                    transform: translateX(130px) !important;
                  }
                }

                @media (min-width: 721px) and (max-width: 1050px) {
                  .wisdom-home-tutorial__progress-heading {
                    transform: translateX(54px) !important;
                  }
                }

                @media (max-width: 720px) {
                  .wisdom-home-tutorial__progress-heading {
                    transform: none !important;
                  }
                }
              `}</style>
              <p className="wisdom-home-tutorial__progress-heading">HOW IT WORKS</p>
            <nav className="wisdom-home-tutorial__progress" aria-label="Customization tutorial steps">
              <span className="wisdom-home-tutorial__progress-rail" aria-hidden="true">
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
                  <span className="wisdom-home-tutorial__progress-number">{index + 1}</span>
                  <span className="wisdom-home-tutorial__progress-label">{progressSlide.label}</span>
                </button>
              ))}
            </nav>
          </div>
        </div>

        <style>{`
          .wisdom-home-tutorial {
            width: 100%;
            min-height: calc(100vh - 92px);
            box-sizing: border-box;
            margin: 0;
            padding: clamp(24px, 3vh, 34px) clamp(28px, 4vw, 70px) 22px;
            display: flex;
            align-items: center;
            overflow: hidden;
            background: #ffffff;
            color: #111111;
            font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
          }

          .wisdom-home-tutorial__frame {
            width: min(100%, 1680px);
            margin: 0 auto;
            display: grid;
            grid-template-columns: minmax(470px, 0.72fr) minmax(0, 1.28fr);
            grid-template-areas:
              "copy visual"
              "progress progress";
            align-items: start;
            column-gap: clamp(42px, 4vw, 70px);
            row-gap: clamp(18px, 2.1vh, 24px);
          }

          .wisdom-home-tutorial__copy {
            grid-area: copy;
            min-width: 0;
            align-self: start;
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            justify-content: flex-start;
            padding: clamp(6px, 1.2vh, 14px) 0 0;
          }

          .wisdom-home-tutorial__headline {
            margin: 0;
            color: #111111;
            font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
            font-size: clamp(2.75rem, 3.25vw, 3.75rem);
            font-weight: 700;
            line-height: 1.04;
            letter-spacing: -0.045em;
          }

          .wisdom-home-tutorial__headline span {
            display: block;
            white-space: nowrap;
          }

          .wisdom-home-tutorial__value {
            width: min(100%, 455px);
            margin-top: 16px;
          }

          .wisdom-home-tutorial__value-title {
            color: #111111;
            font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
            font-size: 0.78rem;
            font-weight: 700;
            line-height: 1.3;
            letter-spacing: 0.075em;
          }

          .wisdom-home-tutorial__value-copy {
            margin: 5px 0 0;
            color: #656565;
            font-size: 0.93rem;
            line-height: 1.45;
          }
          .wisdom-home-tutorial__active-step {
            width: min(100%, 455px);
            height: 248px;
            box-sizing: border-box;
            margin-top: clamp(15px, 1.8vh, 20px);
          }

          .wisdom-home-tutorial__eyebrow {
            margin: 0 0 10px;
            color: #555555;
            font-size: 0.72rem;
            font-weight: 500;
            line-height: 1.2;
            letter-spacing: 0.12em;
          }

          .wisdom-home-tutorial__step-title {
            margin: 0;
            color: #111111;
            font-size: clamp(1.42rem, 1.45vw, 1.72rem);
            font-weight: 700;
            line-height: 1.16;
            letter-spacing: -0.025em;
          }

          .wisdom-home-tutorial__description,
          .wisdom-home-tutorial__detail {
            max-width: 48ch;
            margin: 0;
            color: #333333;
            font-size: clamp(0.94rem, 0.93vw, 1.02rem);
            font-weight: 400;
            line-height: 1.55;
            letter-spacing: -0.006em;
          }

          .wisdom-home-tutorial__description {
            margin-top: 14px;
          }

          .wisdom-home-tutorial__detail {
            margin-top: 9px;
            color: #656565;
          }

          .wisdom-home-tutorial__cta {
            width: min(100%, 310px);
            min-height: 56px;
            align-self: center;
            margin-top: 8px;
            padding: 14px 26px;
            border: 1px solid #111111;
            border-radius: 4px;
            background: #111111;
            color: #ffffff;
            font-size: 0.78rem;
            font-weight: 700;
            letter-spacing: 0.075em;
            cursor: pointer;
          }

          .wisdom-home-tutorial__cta:hover {
            background: #ffffff;
            color: #111111;
          }

          .wisdom-home-tutorial__catalog-link {
            width: min(100%, 310px);
            min-height: 50px;
            align-self: center;
            margin-top: 10px;
            padding: 12px 24px;
            border: 1px solid #111111;
            border-radius: 4px;
            background: #ffffff;
            color: #111111;
            font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
            font-size: 0.78rem;
            font-weight: 700;
            line-height: 1.25;
            letter-spacing: 0.075em;
            cursor: pointer;
            transition:
              background 0.18s ease,
              color 0.18s ease;
          }

          .wisdom-home-tutorial__catalog-link:hover {
            background: #111111;
            color: #ffffff;
          }

          .wisdom-home-tutorial__catalog-link:focus-visible {
            outline: 2px solid #111111;
            outline-offset: 4px;
          }

          .wisdom-home-tutorial__visual {
            grid-area: visual;
            min-width: 0;
            align-self: start;
            position: relative;
            overflow: hidden;
            padding-bottom: 54px;
          }

          .wisdom-home-tutorial__stage {
            --wisdom-card-peek: clamp(88px, 8vw, 128px);
            --wisdom-card-gap: clamp(14px, 1.35vw, 20px);
            position: relative;
            width: 100%;
            height: clamp(500px, 56vh, 590px);
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
            width: calc(100% - var(--wisdom-card-peek));
            height: 100%;
            overflow: hidden;
            border: 1px solid #e4e4e4;
            border-radius: 7px;
            background: #ffffff;
            box-shadow: 0 7px 20px rgba(0, 0, 0, 0.04);
            transform: translate3d(var(--wisdom-drag-x, 0px), 0, 0);
            transition: transform 280ms cubic-bezier(0.22, 0.78, 0.2, 1);
            will-change: transform;
          }

          .wisdom-home-tutorial__stage.is-dragging .wisdom-home-tutorial__main-card,
          .wisdom-home-tutorial__stage.is-dragging .wisdom-home-tutorial__neighbor,
          .wisdom-home-tutorial__stage.is-rebasing .wisdom-home-tutorial__main-card,
          .wisdom-home-tutorial__stage.is-rebasing .wisdom-home-tutorial__neighbor {
            transition: none !important;
          }

          .wisdom-home-tutorial__main-card {
            left: 0;
            z-index: 2;
          }

          .wisdom-home-tutorial__neighbor {
            z-index: 1;
            opacity: 0.96;
          }

          .wisdom-home-tutorial__neighbor--next {
            left: calc(100% - var(--wisdom-card-peek) + var(--wisdom-card-gap));
          }

          .wisdom-home-tutorial__neighbor--previous {
            left: calc(-1 * (100% - var(--wisdom-card-peek) + var(--wisdom-card-gap)));
          }

          /* WISDOM HOME TUTORIAL GROWING PREVIEW TRANSITION V1.0.13.13 */
          .wisdom-home-tutorial__neighbor--next {
            transform-origin: left center;
            transform:
              translate3d(var(--wisdom-drag-x, 0px), 0, 0)
              scale(0.78);
          }

          .wisdom-home-tutorial__neighbor--previous {
            transform-origin: right center;
            transform:
              translate3d(var(--wisdom-drag-x, 0px), 0, 0)
              scale(0.78);
          }

          .wisdom-home-tutorial__stage.is-moving-next
            .wisdom-home-tutorial__neighbor--next {
            transform:
              translate3d(var(--wisdom-drag-x, 0px), 0, 0)
              scale(calc(0.78 + (var(--wisdom-drag-progress, 0) * 0.22)));
          }

          .wisdom-home-tutorial__stage.is-moving-previous
            .wisdom-home-tutorial__neighbor--previous {
            transform:
              translate3d(var(--wisdom-drag-x, 0px), 0, 0)
              scale(calc(0.78 + (var(--wisdom-drag-progress, 0) * 0.22)));
          }

          /* WISDOM HOME TUTORIAL SYMMETRIC GROW + SHRINK TRANSITION V1.0.13.14 */
          .wisdom-home-tutorial__stage.is-moving-next
            .wisdom-home-tutorial__main-card {
            transform-origin: right center;
            transform:
              translate3d(var(--wisdom-drag-x, 0px), 0, 0)
              scale(calc(1 - (var(--wisdom-drag-progress, 0) * 0.22)));
          }

          .wisdom-home-tutorial__stage.is-moving-previous
            .wisdom-home-tutorial__main-card {
            transform-origin: left center;
            transform:
              translate3d(var(--wisdom-drag-x, 0px), 0, 0)
              scale(calc(1 - (var(--wisdom-drag-progress, 0) * 0.22)));
          }

          /* WISDOM HOME TUTORIAL CONTINUOUS NEXT PEEK V1.0.13.15 */
          .wisdom-home-tutorial__neighbor--after-next {
            left: calc(
              200%
              - var(--wisdom-card-peek)
              - var(--wisdom-card-peek)
              + var(--wisdom-card-gap)
              + var(--wisdom-card-gap)
            );
            transform-origin: left center;
            transform:
              translate3d(var(--wisdom-drag-x, 0px), 0, 0)
              scale(0.78);
          }

          .wisdom-home-tutorial__neighbor--before-previous {
            left: calc(
              -200%
              + var(--wisdom-card-peek)
              + var(--wisdom-card-peek)
              - var(--wisdom-card-gap)
              - var(--wisdom-card-gap)
            );
            transform-origin: right center;
            transform:
              translate3d(var(--wisdom-drag-x, 0px), 0, 0)
              scale(0.78);
          }

          .wisdom-home-tutorial__media {
            width: 100%;
            height: 100%;
            min-width: 0;
            min-height: 0;
            overflow: hidden;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #fafafa;
          }

          .wisdom-home-tutorial__image,
          .wisdom-home-tutorial__neighbor img {
            width: 100%;
            height: 100%;
            display: block;
            object-fit: contain;
            object-position: center;
            background: #fafafa;
            pointer-events: none;
            user-select: none;
            -webkit-user-drag: none;
          }

          .wisdom-home-tutorial__image--step-1,
          .wisdom-home-tutorial__image--step-6 {
            object-position: center top;
          }

          .wisdom-home-tutorial__card-nav {
            position: absolute;
            left: 0;
            right: var(--wisdom-card-peek);
            bottom: 0;
            height: 48px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: #ffffff;
          }

          .wisdom-home-tutorial__card-dots {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
          }

          .wisdom-home-tutorial__card-dot {
            width: 8px;
            height: 8px;
            flex: 0 0 8px;
            padding: 0;
            border: 0;
            border-radius: 50%;
            background: #d0d0d0;
            cursor: pointer;
            transition: background 150ms ease, transform 150ms ease;
          }

          .wisdom-home-tutorial__card-dot.is-active {
            background: #111111;
            transform: scale(1.08);
          }

          .wisdom-home-tutorial__progress-wrap {
            grid-area: progress;
            width: 100%;
            display: grid;
            grid-template-columns: 190px minmax(0, 1fr);
            align-items: center;
            column-gap: 30px;
          }

          .wisdom-home-tutorial__progress-heading {
            margin: 0;
            color: #171717;
            font-size: 0.82rem;
            font-weight: 700;
            letter-spacing: 0.09em;
            white-space: nowrap;
          }

          .wisdom-home-tutorial__progress {
            position: relative;
            width: 100%;
            margin: 0;
            display: grid;
            grid-template-columns: repeat(6, minmax(0, 1fr));
            align-items: start;
            gap: 0;
          }

          .wisdom-home-tutorial__progress-rail {
            position: absolute;
            z-index: 0;
            top: 19px;
            left: calc(100% / 12);
            right: calc(100% / 12);
            height: 1px;
            overflow: hidden;
            background: #cccccc;
            pointer-events: none;
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
            padding: 0 8px;
            border: 0;
            background: transparent;
            color: #111111;
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
            line-height: 1;
            transition: background 180ms ease, color 180ms ease, border-color 180ms ease;
          }

          .wisdom-home-tutorial__progress-step.is-reached .wisdom-home-tutorial__progress-number {
            border-color: #111111;
            background: #111111;
            color: #ffffff;
          }

          .wisdom-home-tutorial__progress-label {
            color: #585858;
            font-size: 0.82rem;
            font-weight: 400;
            line-height: 1.25;
            text-align: center;
            white-space: nowrap;
          }

          .wisdom-home-tutorial__progress-step.is-reached .wisdom-home-tutorial__progress-label {
            color: #232323;
          }

          .wisdom-home-tutorial__progress-step.is-active .wisdom-home-tutorial__progress-label {
            color: #111111;
            font-weight: 700;
          }

          .wisdom-home-tutorial__progress-step:focus-visible .wisdom-home-tutorial__progress-number,
          .wisdom-home-tutorial__card-dot:focus-visible,
          .wisdom-home-tutorial__cta:focus-visible {
            outline: 2px solid #111111;
            outline-offset: 3px;
          }

          @media (max-width: 1320px) {
            .wisdom-home-tutorial__frame {
              grid-template-columns: minmax(420px, 0.72fr) minmax(0, 1.28fr);
              column-gap: 34px;
            }

            .wisdom-home-tutorial__headline {
              font-size: clamp(2.45rem, 3vw, 3.2rem);
            }

            .wisdom-home-tutorial__main-card,
            .wisdom-home-tutorial__neighbor,
            .wisdom-home-tutorial__stage {
              height: 490px;
            }
          }

          @media (max-width: 1050px) {
            .wisdom-home-tutorial {
              min-height: auto;
              padding: 34px 24px 42px;
            }

            .wisdom-home-tutorial__frame {
              grid-template-columns: 1fr;
              grid-template-areas:
                "copy"
                "visual"
                "progress";
              row-gap: 28px;
            }

            .wisdom-home-tutorial__copy {
              padding-top: 0;
            }

            .wisdom-home-tutorial__headline span {
              white-space: normal;
            }

            .wisdom-home-tutorial__active-step {
              height: auto;
              min-height: 220px;
            }

            .wisdom-home-tutorial__visual {
              width: 100%;
            }

            .wisdom-home-tutorial__stage {
              --wisdom-card-peek: 74px;
              height: 480px;
            }

            .wisdom-home-tutorial__progress-wrap {
              grid-template-columns: 1fr;
              row-gap: 18px;
            }
          }

          @media (max-width: 720px) {
            .wisdom-home-tutorial {
              padding: 26px 16px 36px;
            }

            .wisdom-home-tutorial__headline {
              font-size: clamp(2.1rem, 10.5vw, 2.85rem);
            }

            .wisdom-home-tutorial__value {
              margin-top: 14px;
            }

            .wisdom-home-tutorial__value-title {
              font-size: 0.72rem;
            }

            .wisdom-home-tutorial__value-copy {
              font-size: 0.88rem;
            }

            .wisdom-home-tutorial__active-step {
              margin-top: 18px;
              min-height: 236px;
            }

            .wisdom-home-tutorial__cta {
              width: 100%;
              align-self: center;
              margin-top: 18px;
            }

            .wisdom-home-tutorial__stage {
              --wisdom-card-peek: 52px;
              --wisdom-card-gap: 10px;
              height: 430px;
            }

            .wisdom-home-tutorial__main-card,
            .wisdom-home-tutorial__neighbor {
              border-radius: 6px;
            }

            .wisdom-home-tutorial__progress-heading {
              font-size: 0.78rem;
            }

            .wisdom-home-tutorial__progress-number {
              width: 34px;
              height: 34px;
            }

            .wisdom-home-tutorial__progress-rail {
              top: 16px;
            }

            .wisdom-home-tutorial__progress-label {
              font-size: 0.68rem;
              white-space: normal;
            }
          }
        `}</style>
      </section>
      {/* WISDOM HOME SMOOTH BROWSE + HEADLINE READABILITY + CARD BORDER V1.0.13.12 */}
      <style>{`
        .wisdom-home-tutorial__headline {
          line-height: 1.12 !important;
          letter-spacing: -0.025em !important;
        }

        .wisdom-home-tutorial__headline span + span {
          margin-top: 0.035em;
        }

        .wisdom-home-tutorial__main-card,
        .wisdom-home-tutorial__neighbor {
          border: 1px solid #111111 !important;
          border-radius: 4px !important;
        }

        @media (max-width: 760px) {
          .wisdom-home-tutorial__headline {
            line-height: 1.1 !important;
            letter-spacing: -0.018em !important;
          }
        }
      `}</style>
      {/* WISDOM HOME HERO FINAL VALUE + CTA POSITION V1.0.6.3 */}
      <style>{`
        .wisdom-home-tutorial__value-title {
          color: #111111 !important;
          font-size: 1.02rem !important;
          font-weight: 800 !important;
          line-height: 1.28 !important;
          letter-spacing: 0.02em !important;
        }

        .wisdom-home-tutorial__value-copy {
          color: #333333 !important;
          font-size: 1rem !important;
          font-weight: 500 !important;
          line-height: 1.42 !important;
        }

        @media (min-width: 1051px) {
          .wisdom-home-tutorial__value {
            margin-top: 12px !important;
          }

          .wisdom-home-tutorial__active-step {
            height: 210px !important;
            margin-top: 14px !important;
          }

          .wisdom-home-tutorial__cta {
            margin-top: 8px !important;
          }
        }

        @media (max-width: 1050px) {
          .wisdom-home-tutorial__value-title {
            font-size: 0.94rem !important;
          }

          .wisdom-home-tutorial__value-copy {
            font-size: 0.94rem !important;
          }
        }
      `}</style>
      {/* WISDOM HOME HERO CENTER TAGLINE V1.0.6.4 */}
      <style>{`
        .wisdom-home-tutorial__headline,
        .wisdom-home-tutorial__value {
          width: min(100%, 620px);
          box-sizing: border-box;
        }

        .wisdom-home-tutorial__value {
          text-align: center !important;
        }

        @media (max-width: 1050px) {
          .wisdom-home-tutorial__headline,
          .wisdom-home-tutorial__value {
            width: 100%;
          }
        }
      `}</style>
      {/* WISDOM HOME HERO LIFT HEADLINE + TAGLINE V1.0.6.5 */}
      <style>{`
        @media (min-width: 1051px) {
          .wisdom-home-tutorial__headline,
          .wisdom-home-tutorial__value {
            transform: translateY(-26px);
          }
        }

        @media (min-width: 721px) and (max-width: 1050px) {
          .wisdom-home-tutorial__headline,
          .wisdom-home-tutorial__value {
            transform: translateY(-14px);
          }
        }

        @media (max-width: 720px) {
          .wisdom-home-tutorial__headline,
          .wisdom-home-tutorial__value {
            transform: none;
          }
        }
      `}</style>
      {/* WISDOM HOME HERO LIFT MORE V1.0.6.6 */}
      <style>{`
        @media (min-width: 1051px) {
          .wisdom-home-tutorial__headline,
          .wisdom-home-tutorial__value {
            transform: translateY(-38px) !important;
          }
        }

        @media (min-width: 721px) and (max-width: 1050px) {
          .wisdom-home-tutorial__headline,
          .wisdom-home-tutorial__value {
            transform: translateY(-20px) !important;
          }
        }

        @media (max-width: 720px) {
          .wisdom-home-tutorial__headline,
          .wisdom-home-tutorial__value {
            transform: none !important;
          }
        }
      `}</style>
      {/* WISDOM HOME HERO TYPOGRAPHY CLEANUP V1.0.6.8.1 */}
      <style>{`
        .wisdom-home-tutorial {
          font-family: "Montserrat", sans-serif !important;
        }

        .wisdom-home-tutorial__headline {
          font-family: "Montserrat", sans-serif !important;
          font-weight: 800 !important;
          line-height: 1.06 !important;
          letter-spacing: -0.032em !important;
        }

        .wisdom-home-tutorial__headline span + span {
          margin-top: 0.04em !important;
        }

        .wisdom-home-tutorial__value-title {
          font-family: "Montserrat", sans-serif !important;
          font-weight: 700 !important;
          line-height: 1.3 !important;
          letter-spacing: 0.015em !important;
        }

        .wisdom-home-tutorial__value-copy {
          font-family: "Montserrat", sans-serif !important;
          font-weight: 400 !important;
          line-height: 1.45 !important;
          letter-spacing: -0.01em !important;
        }

        @media (min-width: 1051px) {
          .wisdom-home-tutorial__headline {
            font-size: clamp(2.8rem, 3.22vw, 3.72rem) !important;
          }

          .wisdom-home-tutorial__value-title {
            font-size: 0.98rem !important;
          }

          .wisdom-home-tutorial__value-copy {
            font-size: 0.96rem !important;
          }
        }

        @media (max-width: 1050px) {
          .wisdom-home-tutorial__headline {
            font-weight: 800 !important;
          }

          .wisdom-home-tutorial__value-title {
            font-weight: 700 !important;
          }

          .wisdom-home-tutorial__value-copy {
            font-weight: 400 !important;
          }
        }
      `}</style>
      {/* WISDOM HOME HERO OPTION A MARKETING V1.0.6.9 */}
      <style>{`
        .wisdom-home-tutorial,
        .wisdom-home-tutorial__headline,
        .wisdom-home-tutorial__value-title,
        .wisdom-home-tutorial__value-copy,
        .wisdom-home-tutorial__invitation,
        .wisdom-home-tutorial__eyebrow,
        .wisdom-home-tutorial__step-title,
        .wisdom-home-tutorial__description,
        .wisdom-home-tutorial__detail,
        .wisdom-home-tutorial__cta,
        .wisdom-home-tutorial__catalog-link,
        .wisdom-home-tutorial__progress-heading,
        .wisdom-home-tutorial__progress-number,
        .wisdom-home-tutorial__progress-label {
          font-family: "Montserrat", sans-serif !important;
        }

        .wisdom-home-tutorial__headline {
          font-weight: 800 !important;
        }

        .wisdom-home-tutorial__value-title {
          font-weight: 700 !important;
        }

        .wisdom-home-tutorial__value-copy {
          font-weight: 400 !important;
        }

        .wisdom-home-tutorial__invitation {
          width: min(100%, 620px);
          margin: 13px 0 0;
          color: #111111;
          font-size: 0.9rem;
          font-weight: 600;
          line-height: 1.4;
          letter-spacing: -0.008em;
          text-align: center;
        }

        @media (min-width: 1051px) {
          .wisdom-home-tutorial__headline,
          .wisdom-home-tutorial__value {
            position: relative;
            left: -26px;
          }

          .wisdom-home-tutorial__invitation {
            position: relative;
            left: -26px;
          }
        }

        @media (min-width: 721px) and (max-width: 1050px) {
          .wisdom-home-tutorial__headline,
          .wisdom-home-tutorial__value,
          .wisdom-home-tutorial__invitation {
            left: 0;
          }
        }

        @media (max-width: 720px) {
          .wisdom-home-tutorial__invitation {
            width: 100%;
            margin-top: 11px;
            font-size: 0.86rem;
          }
        }
      `}</style>
      {/* WISDOM HOME HERO INVITATION ALIGN V1.0.6.10 */}
      <style>{`
        .wisdom-home-tutorial__invitation {
          position: static !important;
          left: auto !important;
          width: min(100%, 455px) !important;
          margin: 4px 0 8px !important;
          color: #111111 !important;
          font-family: "Montserrat", sans-serif !important;
          font-size: 1.04rem !important;
          font-weight: 650 !important;
          line-height: 1.4 !important;
          letter-spacing: -0.012em !important;
          text-align: left !important;
          align-self: flex-start !important;
        }

        .wisdom-home-tutorial__active-step {
          margin-top: 0 !important;
        }

        @media (max-width: 1050px) {
          .wisdom-home-tutorial__invitation {
            width: 100% !important;
            font-size: 0.98rem !important;
          }
        }

        @media (max-width: 720px) {
          .wisdom-home-tutorial__invitation {
            margin: 6px 0 9px !important;
            font-size: 0.94rem !important;
          }
        }
      `}</style>
      {/* WISDOM HOME HERO INVITATION HIGHLIGHT V1.0.6.11 + WISDOM HOME HERO INVITATION FONT BUMP V1.0.6.12 */}
      <style>{`
        .wisdom-home-tutorial__invitation {
          width: min(100%, 640px) !important;
          max-width: 640px !important;
          margin: 4px 0 10px !important;
          color: #111111 !important;
          font-family: "Montserrat", sans-serif !important;
          font-size: 1.42rem !important;
          font-weight: 700 !important;
          line-height: 1.38 !important;
          letter-spacing: -0.018em !important;
          text-align: left !important;
          text-wrap: balance !important;
          align-self: flex-start !important;
        }

        @media (max-width: 1200px) {
          .wisdom-home-tutorial__invitation {
            width: min(100%, 580px) !important;
            max-width: 580px !important;
            font-size: 1.30rem !important;
          }
        }

        @media (max-width: 900px) {
          .wisdom-home-tutorial__invitation {
            width: 100% !important;
            max-width: none !important;
            font-size: 1.18rem !important;
            line-height: 1.4 !important;
          }
        }
      `}</style>
      {/* WISDOM HOME HERO INVITATION ONE LINE V1.0.6.13 */}
      <style>{`
        @media (min-width: 1051px) {
          .wisdom-home-tutorial__invitation {
            width: max-content !important;
            max-width: none !important;
            margin: 4px 0 10px !important;
            color: #111111 !important;
            font-family: "Montserrat", sans-serif !important;
            font-size: 1.52rem !important;
            font-weight: 700 !important;
            line-height: 1.22 !important;
            letter-spacing: -0.022em !important;
            text-align: left !important;
            white-space: nowrap !important;
            text-wrap: nowrap !important;
            overflow: visible !important;
            align-self: flex-start !important;
          }
        }

        @media (min-width: 901px) and (max-width: 1050px) {
          .wisdom-home-tutorial__invitation {
            width: max-content !important;
            max-width: none !important;
            font-size: 1.34rem !important;
            font-weight: 700 !important;
            line-height: 1.25 !important;
            white-space: nowrap !important;
            text-wrap: nowrap !important;
          }
        }

        @media (max-width: 900px) {
          .wisdom-home-tutorial__invitation {
            width: 100% !important;
            max-width: 100% !important;
            font-size: 1.18rem !important;
            line-height: 1.35 !important;
            white-space: normal !important;
            text-wrap: balance !important;
          }
        }
      `}</style>
      {/* WISDOM HOME HERO INVITATION HIERARCHY V1.0.6.14 */}
      <style>{`
        @media (min-width: 1051px) {
          .wisdom-home-tutorial__invitation {
            position: relative !important;
            left: -26px !important;
            width: max-content !important;
            max-width: none !important;
            margin: 4px 0 10px !important;
            color: #111111 !important;
            font-family: "Montserrat", sans-serif !important;
            font-size: 1.58rem !important;
            font-weight: 700 !important;
            line-height: 1.22 !important;
            letter-spacing: -0.022em !important;
            text-align: left !important;
            white-space: nowrap !important;
            text-wrap: nowrap !important;
          }

          .wisdom-home-tutorial__step-title {
            font-size: 1.34rem !important;
            font-weight: 700 !important;
            line-height: 1.18 !important;
            letter-spacing: -0.02em !important;
          }
        }

        @media (min-width: 901px) and (max-width: 1050px) {
          .wisdom-home-tutorial__invitation {
            position: static !important;
            left: auto !important;
            width: max-content !important;
            max-width: none !important;
            font-size: 1.42rem !important;
            white-space: nowrap !important;
            text-wrap: nowrap !important;
          }

          .wisdom-home-tutorial__step-title {
            font-size: 1.28rem !important;
          }
        }

        @media (max-width: 900px) {
          .wisdom-home-tutorial__invitation {
            width: 100% !important;
            max-width: 100% !important;
            font-size: 1.28rem !important;
            line-height: 1.32 !important;
            white-space: normal !important;
            text-wrap: balance !important;
          }

          .wisdom-home-tutorial__step-title {
            font-size: 1.18rem !important;
            line-height: 1.22 !important;
          }
        }
      `}</style>
      {/* WISDOM HOME HERO 6-STEP FOCUS V1.0.7.1 */}
      <style>{`
        .wisdom-home-tutorial,
        .wisdom-home-tutorial button,
        .wisdom-home-tutorial__kicker,
        .wisdom-home-tutorial__headline,
        .wisdom-home-tutorial__hero-summary,
        .wisdom-home-tutorial__eyebrow,
        .wisdom-home-tutorial__step-title,
        .wisdom-home-tutorial__description,
        .wisdom-home-tutorial__progress-heading,
        .wisdom-home-tutorial__progress-label {
          font-family: "Montserrat", sans-serif !important;
        }

        .wisdom-home-tutorial__copy {
          padding-top: 4px !important;
          overflow: visible !important;
        }

        /* WISDOM HOME HERO LEFT ALIGNMENT V1.0.7.2.3 */
        @media (min-width: 1051px) {
          .wisdom-home-tutorial__copy {
            position: relative !important;
            left: -24px !important;
            max-width: 500px !important;
          }

          .wisdom-home-tutorial__cta,
          .wisdom-home-tutorial__catalog-link {
            width: 292px !important;
            max-width: 100% !important;
            align-self: flex-start !important;
            margin-left: 0 !important;
            margin-right: auto !important;
          }
        }

        .wisdom-home-tutorial__kicker {
          width: min(100%, 560px);
          margin: 0 0 12px;
          color: #444444;
          font-size: 0.82rem;
          font-weight: 700;
          line-height: 1.25;
          letter-spacing: 0.09em;
        }

        /* WISDOM HOME HERO HEADLINE COPY V1.0.7.2.5 */
        .wisdom-home-tutorial__headline {
          position: static !important;
          left: auto !important;
          top: auto !important;
          transform: none !important;
          width: min(100%, 560px) !important;
          max-width: 560px !important;
          margin: 0 !important;
          color: #111111 !important;
          font-size: clamp(1.42rem, 1.55vw, 1.68rem) !important;
          font-weight: 700 !important;
          line-height: 1.18 !important;
          letter-spacing: -0.025em !important;
        }

        @media (min-width: 1051px) {
          .wisdom-home-tutorial__headline span {
            white-space: nowrap !important;
          }
        }

        .wisdom-home-tutorial__headline span {
          display: block !important;
          white-space: nowrap !important;
        }

        .wisdom-home-tutorial__hero-summary {
          width: min(100%, 468px);
          max-width: 468px;
          margin: 15px 0 0;
          color: #4f4f4f;
          font-size: 0.98rem;
          font-weight: 400;
          line-height: 1.5;
          letter-spacing: -0.006em;
        }

        /* WISDOM HOME HERO VISUAL BALANCE V1.0.7.2 */
        .wisdom-home-tutorial__active-step {
          width: min(100%, 400px) !important;
          height: 168px !important;
          margin-top: 22px !important;
        }

        .wisdom-home-tutorial__eyebrow {
          margin: 0 0 8px !important;
          color: #666666 !important;
          font-size: 0.72rem !important;
          font-weight: 500 !important;
          line-height: 1.2 !important;
          letter-spacing: 0.11em !important;
        }

        .wisdom-home-tutorial__step-title {
          margin: 0 !important;
          color: #111111 !important;
          font-size: clamp(1.36rem, 1.4vw, 1.62rem) !important;
          font-weight: 700 !important;
          line-height: 1.16 !important;
          letter-spacing: -0.024em !important;
        }

        .wisdom-home-tutorial__description {
          max-width: 46ch !important;
          margin: 12px 0 0 !important;
          color: #444444 !important;
          font-size: clamp(0.94rem, 0.92vw, 1rem) !important;
          font-weight: 400 !important;
          line-height: 1.55 !important;
          letter-spacing: -0.006em !important;
        }

        @media (max-width: 1200px) {
          .wisdom-home-tutorial__headline {
            font-size: clamp(2.28rem, 3.2vw, 3rem) !important;
          }

          .wisdom-home-tutorial__hero-summary {
            max-width: 500px;
            font-size: 0.96rem;
          }
        }

        @media (max-width: 1050px) {
          .wisdom-home-tutorial__kicker,
          .wisdom-home-tutorial__hero-summary {
            width: 100%;
            max-width: none;
          }

          .wisdom-home-tutorial__headline span {
            white-space: normal !important;
          }

          .wisdom-home-tutorial__active-step {
            height: auto !important;
            min-height: 188px;
            margin-top: 20px !important;
          }
        }

        @media (max-width: 720px) {
          .wisdom-home-tutorial__kicker {
            margin-bottom: 9px;
            font-size: 0.72rem;
          }

          .wisdom-home-tutorial__headline {
            font-size: clamp(2.05rem, 10vw, 2.72rem) !important;
            line-height: 1.04 !important;
          }

          .wisdom-home-tutorial__hero-summary {
            margin-top: 13px;
            font-size: 0.94rem;
            line-height: 1.5;
          }

          .wisdom-home-tutorial__active-step {
            margin-top: 18px !important;
          }
        }
      `}</style>
      {/* WISDOM HOME HERO TWO-LINE + BORDER FIX V1.0.7.3.3.1 */}
      <style>{`
        .wisdom-home-tutorial,
        .wisdom-home-tutorial button,
        .wisdom-home-tutorial__kicker,
        .wisdom-home-tutorial__headline,
        .wisdom-home-tutorial__hero-summary,
        .wisdom-home-tutorial__eyebrow,
        .wisdom-home-tutorial__step-title,
        .wisdom-home-tutorial__description,
        .wisdom-home-tutorial__progress-heading,
        .wisdom-home-tutorial__progress-label,
        .wisdom-home-tutorial__progress-step {
          font-family: "Montserrat", sans-serif !important;
        }

        .wisdom-home-tutorial__kicker {
          color: #252525 !important;
          font-weight: 700 !important;
          letter-spacing: 0.105em !important;
        }

        .wisdom-home-tutorial__headline {
          color: #111111 !important;
        }

        .wisdom-home-tutorial__headline span {
          display: block !important;
        }

        .wisdom-home-tutorial__hero-summary {
          color: #343434 !important;
          text-wrap: pretty !important;
        }

        .wisdom-home-tutorial__step-title {
          color: #111111 !important;
          font-weight: 700 !important;
        }

        .wisdom-home-tutorial__description {
          color: #444444 !important;
          line-height: 1.58 !important;
        }

        .wisdom-home-tutorial__progress-heading {
          color: #111111 !important;
          font-weight: 700 !important;
          letter-spacing: 0.08em !important;
        }

        .wisdom-home-tutorial__progress-label {
          color: #5f5f5f !important;
          font-weight: 500 !important;
        }

        .wisdom-home-tutorial__progress-step.is-active .wisdom-home-tutorial__progress-label {
          color: #111111 !important;
          font-weight: 700 !important;
        }

        /*
          The card already has a border and height:100%.
          Without border-box, that border adds to the 100% height and the stage's
          overflow:hidden clips the bottom edge. Keeping the border inside the
          declared height restores the missing bottom line without touching images.
        */
        .wisdom-home-tutorial__main-card,
        .wisdom-home-tutorial__neighbor {
          box-sizing: border-box !important;
          border: 1px solid #111111 !important;
        }

        .wisdom-home-tutorial__media,
        .wisdom-home-tutorial__image,
        .wisdom-home-tutorial__neighbor img {
          box-sizing: border-box !important;
        }

        @media (min-width: 1051px) {
          .wisdom-home-tutorial__copy {
            position: relative !important;
            left: -20px !important;
            max-width: 620px !important;
            padding-top: 4px !important;
            overflow: visible !important;
          }

          .wisdom-home-tutorial__kicker {
            width: min(100%, 620px) !important;
            margin: 0 0 13px !important;
            font-size: 0.86rem !important;
            line-height: 1.28 !important;
          }

          .wisdom-home-tutorial__headline {
            position: static !important;
            left: auto !important;
            top: auto !important;
            transform: none !important;
            width: min(100%, 620px) !important;
            max-width: 620px !important;
            margin: 0 !important;
            font-size: clamp(2.16rem, 2.34vw, 2.54rem) !important;
            font-weight: 700 !important;
            line-height: 1.03 !important;
            letter-spacing: -0.032em !important;
          }

          .wisdom-home-tutorial__headline span {
            white-space: nowrap !important;
          }

          .wisdom-home-tutorial__hero-summary {
            width: min(100%, 510px) !important;
            max-width: 510px !important;
            margin: 18px 0 0 !important;
            font-size: 1.12rem !important;
            font-weight: 500 !important;
            line-height: 1.58 !important;
            letter-spacing: -0.008em !important;
          }

          .wisdom-home-tutorial__active-step {
            width: min(100%, 430px) !important;
            height: 182px !important;
            margin-top: 25px !important;
          }

          .wisdom-home-tutorial__eyebrow {
            color: #595959 !important;
            font-size: 0.84rem !important;
            font-weight: 600 !important;
            letter-spacing: 0.11em !important;
            margin-bottom: 10px !important;
          }

          .wisdom-home-tutorial__step-title {
            font-size: 1.3rem !important;
            line-height: 1.18 !important;
            margin-bottom: 13px !important;
          }

          .wisdom-home-tutorial__description {
            font-size: 1.08rem !important;
          }

          .wisdom-home-tutorial__cta,
          .wisdom-home-tutorial__catalog-link {
            width: 300px !important;
            max-width: 100% !important;
            align-self: center !important;
            margin-left: auto !important;
            margin-right: auto !important;
          }

          .wisdom-home-tutorial__cta {
            box-shadow: 0 10px 22px rgba(0, 0, 0, 0.08) !important;
          }

          .wisdom-home-tutorial__catalog-link {
            border: 1.4px solid #111111 !important;
            color: #111111 !important;
            background: #ffffff !important;
          }

          .wisdom-home-tutorial__progress-heading {
            font-size: 1.02rem !important;
          }

          .wisdom-home-tutorial__progress-label {
            font-size: 1rem !important;
          }
        }

        @media (min-width: 721px) and (max-width: 1050px) {
          .wisdom-home-tutorial__copy {
            position: static !important;
            left: auto !important;
            max-width: none !important;
          }

          .wisdom-home-tutorial__headline {
            transform: none !important;
            width: 100% !important;
            max-width: 680px !important;
            font-size: clamp(1.82rem, 3.1vw, 2.08rem) !important;
            line-height: 1.08 !important;
          }

          .wisdom-home-tutorial__headline span {
            white-space: normal !important;
          }

          .wisdom-home-tutorial__hero-summary {
            font-size: 1.05rem !important;
          }

          .wisdom-home-tutorial__step-title {
            font-size: 1.16rem !important;
          }

          .wisdom-home-tutorial__description {
            font-size: 1rem !important;
          }

          .wisdom-home-tutorial__progress-label {
            font-size: 0.98rem !important;
          }

          .wisdom-home-tutorial__cta,
          .wisdom-home-tutorial__catalog-link {
            align-self: center !important;
            margin-left: auto !important;
            margin-right: auto !important;
          }
        }

        @media (max-width: 720px) {
          .wisdom-home-tutorial__headline {
            transform: none !important;
            width: 100% !important;
            max-width: none !important;
            font-size: clamp(1.6rem, 6.5vw, 1.92rem) !important;
            line-height: 1.1 !important;
            letter-spacing: -0.022em !important;
          }

          .wisdom-home-tutorial__headline span {
            white-space: normal !important;
          }

          .wisdom-home-tutorial__hero-summary {
            font-size: 1.02rem !important;
          }

          .wisdom-home-tutorial__step-title {
            font-size: 1.14rem !important;
          }

          .wisdom-home-tutorial__description {
            font-size: 1rem !important;
          }

          .wisdom-home-tutorial__progress-heading {
            font-size: 0.98rem !important;
          }

          .wisdom-home-tutorial__progress-label {
            font-size: 0.95rem !important;
          }

          .wisdom-home-tutorial__cta,
          .wisdom-home-tutorial__catalog-link {
            align-self: center !important;
            margin-left: auto !important;
            margin-right: auto !important;
          }
        }
      `}</style>
      {/* WISDOM HOME HERO BOTTOM BORDER OVERLAY FIX V1.0.7.3.4.1 */}
      <style>{`
        /*
          The stage clips transformed cards. Instead of relying only on the card's
          outer border, draw the bottom edge INSIDE the card so it cannot be clipped.
        */
        .wisdom-home-tutorial__main-card::after,
        .wisdom-home-tutorial__neighbor::after {
          content: "";
          position: absolute;
          z-index: 20;
          left: 0;
          right: 0;
          bottom: 0;
          height: 1.5px;
          background: #111111;
          pointer-events: none;
        }
      `}</style>
      {/* WISDOM HOME HERO HEADLINE + BORDER BALANCE V1.0.7.3.4.2 */}
      <style>{`
        /*
          BORDER:
          Keep every visible edge at exactly 1px.
          The bottom edge is drawn inside the card so stage overflow cannot clip it.
        */
        .wisdom-home-tutorial__main-card,
        .wisdom-home-tutorial__neighbor {
          box-sizing: border-box !important;
          border: 1px solid #111111 !important;
          border-bottom-color: transparent !important;
        }

        .wisdom-home-tutorial__main-card::after,
        .wisdom-home-tutorial__neighbor::after {
          content: "";
          position: absolute;
          z-index: 20;
          left: 0;
          right: 0;
          bottom: 0;
          height: 1px !important;
          background: #111111 !important;
          pointer-events: none;
        }

        /*
          HEADLINE:
          Keep Montserrat, uppercase, bold, and exactly two lines on desktop.
          Reduce only enough to fit safely before the image, while preserving
          stronger hierarchy than the body copy.
        */
        @media (min-width: 1051px) {
          .wisdom-home-tutorial__copy {
            left: -28px !important;
            max-width: 610px !important;
          }

          .wisdom-home-tutorial__headline {
            width: 610px !important;
            max-width: 610px !important;
            font-family: "Montserrat", sans-serif !important;
            font-size: clamp(1.82rem, 1.9vw, 1.9rem) !important;
            font-weight: 700 !important;
            line-height: 1.06 !important;
            letter-spacing: -0.055em !important;
            overflow: visible !important;
          }

          .wisdom-home-tutorial__headline span {
            display: block !important;
            white-space: nowrap !important;
          }
        }

        @media (min-width: 721px) and (max-width: 1050px) {
          .wisdom-home-tutorial__headline span {
            white-space: normal !important;
          }
        }

        @media (max-width: 720px) {
          .wisdom-home-tutorial__headline span {
            white-space: normal !important;
          }
        }
      `}</style>
      {/* WISDOM HOME HERO FONT VISIBILITY BOOST V1.0.7.3.4.3 */}
      <style>{`
        /*
          Small readability increase only.
          Keep the two-line desktop headline and preserve the safe gap before
          the tutorial image.
        */
        @media (min-width: 1051px) {
          .wisdom-home-tutorial__copy {
            left: -30px !important;
            max-width: 620px !important;
          }

          .wisdom-home-tutorial__kicker {
            font-size: 0.9rem !important;
            line-height: 1.3 !important;
          }

          .wisdom-home-tutorial__headline {
            width: 620px !important;
            max-width: 620px !important;
            font-size: clamp(1.9rem, 1.98vw, 2rem) !important;
            line-height: 1.05 !important;
            letter-spacing: -0.06em !important;
          }

          .wisdom-home-tutorial__headline span {
            white-space: nowrap !important;
          }

          .wisdom-home-tutorial__hero-summary {
            width: min(100%, 520px) !important;
            max-width: 520px !important;
            font-size: 1.16rem !important;
            line-height: 1.56 !important;
          }

          .wisdom-home-tutorial__eyebrow {
            font-size: 0.88rem !important;
          }

          .wisdom-home-tutorial__step-title {
            font-size: 1.34rem !important;
            line-height: 1.18 !important;
          }

          .wisdom-home-tutorial__description {
            font-size: 1.12rem !important;
            line-height: 1.56 !important;
          }

          .wisdom-home-tutorial__cta,
          .wisdom-home-tutorial__catalog-link {
            font-size: 0.86rem !important;
          }

          .wisdom-home-tutorial__progress-heading {
            font-size: 1.07rem !important;
          }

          .wisdom-home-tutorial__progress-label {
            font-size: 1.03rem !important;
          }
        }

        @media (min-width: 721px) and (max-width: 1050px) {
          .wisdom-home-tutorial__headline {
            font-size: clamp(1.88rem, 3.2vw, 2.12rem) !important;
          }

          .wisdom-home-tutorial__hero-summary {
            font-size: 1.08rem !important;
          }

          .wisdom-home-tutorial__step-title {
            font-size: 1.2rem !important;
          }

          .wisdom-home-tutorial__description {
            font-size: 1.04rem !important;
          }

          .wisdom-home-tutorial__progress-label {
            font-size: 1rem !important;
          }
        }

        @media (max-width: 720px) {
          .wisdom-home-tutorial__headline {
            font-size: clamp(1.64rem, 6.6vw, 1.96rem) !important;
          }

          .wisdom-home-tutorial__hero-summary {
            font-size: 1.04rem !important;
          }

          .wisdom-home-tutorial__step-title {
            font-size: 1.16rem !important;
          }

          .wisdom-home-tutorial__description {
            font-size: 1.02rem !important;
          }
        }
      `}</style>
      {/* WISDOM HOME HERO REMOTE SAFE DIRECT FINAL V1.0.7.3.4.9 */}
      <style>{`
        /*
          Final micro-adjustments from the current approved homepage:
          - headline a little larger but still two lines / no image overlap
          - STEP X OF 6 + title + description slightly lower
          - CTA buttons stay fixed
        */

        @media (min-width: 1051px) {
          .wisdom-home-tutorial__headline {
            width: 624px !important;
            max-width: 624px !important;
            font-size: clamp(1.95rem, 2.02vw, 2.04rem) !important;
            line-height: 1.04 !important;
            letter-spacing: -0.063em !important;
          }

          .wisdom-home-tutorial__headline span {
            display: block !important;
            white-space: nowrap !important;
          }

          .wisdom-home-tutorial__active-step {
            transform: translateY(16px) !important;
          }
        }

        @media (min-width: 721px) and (max-width: 1050px) {
          .wisdom-home-tutorial__headline {
            font-size: clamp(1.91rem, 3.25vw, 2.14rem) !important;
          }

          .wisdom-home-tutorial__headline span {
            white-space: normal !important;
          }

          .wisdom-home-tutorial__active-step {
            transform: translateY(11px) !important;
          }
        }

        @media (max-width: 720px) {
          .wisdom-home-tutorial__headline {
            font-size: clamp(1.67rem, 6.7vw, 1.98rem) !important;
          }

          .wisdom-home-tutorial__headline span {
            white-space: normal !important;
          }

          .wisdom-home-tutorial__active-step {
            transform: translateY(8px) !important;
          }
        }
      `}</style>
                  {/* WISDOM HOME HERO PILL CTA BUTTONS V1.0.7.3.5.5 */}
      <style>{`
        /*
          Primary CTA follows the rounded reference style:
          black pill + white circular edit/blueprint icon badge.
          Secondary CTA keeps the same pill shape without an icon.
        */
        .wisdom-home-tutorial__cta,
        .wisdom-home-tutorial__catalog-link {
          width: 300px !important;
          max-width: 100% !important;
          min-height: 54px !important;
          box-sizing: border-box !important;
          border-radius: 999px !important;
          font-family: "Montserrat", sans-serif !important;
          font-size: 0.84rem !important;
          font-weight: 700 !important;
          line-height: 1.2 !important;
          letter-spacing: 0.065em !important;
          transition:
            background 160ms ease,
            color 160ms ease,
            border-color 160ms ease,
            transform 160ms ease !important;
        }

        .wisdom-home-tutorial__cta {
          display: grid !important;
          grid-template-columns: minmax(0, 1fr) 42px !important;
          align-items: center !important;
          gap: 8px !important;
          padding: 5px 6px 5px 22px !important;
          border: 1px solid #111111 !important;
          background: #111111 !important;
          color: #ffffff !important;
          box-shadow: none !important;
        }

        .wisdom-home-tutorial__cta-label {
          min-width: 0;
          text-align: center;
          white-space: nowrap;
        }

        .wisdom-home-tutorial__cta-icon {
          width: 42px;
          height: 42px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          justify-self: end;
          flex: 0 0 42px;
          border-radius: 50%;
          background: #ffffff;
          color: #111111;
        }

        .wisdom-hero-customize-icon {
          width: 21px;
          height: 21px;
          display: block;
          fill: none;
          stroke: currentColor;
          stroke-width: 1.6;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .wisdom-home-tutorial__cta:hover {
          background: #222222 !important;
          color: #ffffff !important;
          transform: translateY(-1px);
        }

        .wisdom-home-tutorial__catalog-link {
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          margin-top: 9px !important;
          padding: 12px 24px !important;
          border: 1px solid #111111 !important;
          background: #ffffff !important;
          color: #111111 !important;
          box-shadow: none !important;
        }

        .wisdom-home-tutorial__catalog-link:hover {
          background: #111111 !important;
          color: #ffffff !important;
          transform: translateY(-1px);
        }

        .wisdom-home-tutorial__cta:focus-visible,
        .wisdom-home-tutorial__catalog-link:focus-visible {
          outline: 2px solid #111111 !important;
          outline-offset: 4px !important;
        }

        @media (max-width: 720px) {
          .wisdom-home-tutorial__cta,
          .wisdom-home-tutorial__catalog-link {
            width: 100% !important;
          }

          .wisdom-home-tutorial__cta {
            grid-template-columns: minmax(0, 1fr) 40px !important;
            padding: 5px 6px 5px 18px !important;
          }

          .wisdom-home-tutorial__cta-icon {
            width: 40px;
            height: 40px;
          }

          .wisdom-hero-customize-icon {
            width: 20px;
            height: 20px;
          }
        }
      `}</style>
                  {/* WISDOM HOME HERO HEADLINE LINE GAP V1.0.7.3.5.7 */}
      <style>{`
        /*
          Small visual separation only between the two desktop headline lines.
          Font size, width, alignment, and overall hero position stay unchanged.
        */
        @media (min-width: 1051px) {
          .wisdom-home-tutorial__headline span + span {
            margin-top: 0.10em !important;
          }
        }

        @media (min-width: 721px) and (max-width: 1050px) {
          .wisdom-home-tutorial__headline span + span {
            margin-top: 0.08em !important;
          }
        }

        @media (max-width: 720px) {
          .wisdom-home-tutorial__headline span + span {
            margin-top: 0.06em !important;
          }
        }
      `}</style>
                  <style>{`
        /*
          Exact square + pencil reference style.
          Keep the existing white circular CTA badge and pill buttons.
        */
        .wisdom-home-tutorial__cta-icon .wisdom-hero-customize-icon {
          width: 23px !important;
          height: 23px !important;
          fill: none !important;
          stroke: #111111 !important;
          stroke-width: 1.65 !important;
          stroke-linecap: round !important;
          stroke-linejoin: round !important;
        }

        @media (max-width: 720px) {
          .wisdom-home-tutorial__cta-icon .wisdom-hero-customize-icon {
            width: 22px !important;
            height: 22px !important;
          }
        }
      `}</style>
                  {/* WISDOM HOME HERO CTA ICON CIRCLE SMALLER V1.0.7.3.6.0 */}
      <style>{`
        /*
          Match the compact reference:
          keep the pill button size, but make the white circular edit badge
          noticeably smaller and lighter.
        */
        .wisdom-home-tutorial__cta {
          grid-template-columns: minmax(0, 1fr) 32px !important;
          gap: 8px !important;
          padding-right: 9px !important;
        }

        .wisdom-home-tutorial__cta-icon {
          width: 32px !important;
          height: 32px !important;
          flex: 0 0 32px !important;
          border-radius: 50% !important;
          box-shadow: none !important;
        }

        .wisdom-home-tutorial__cta-icon .wisdom-hero-customize-icon {
          width: 17px !important;
          height: 17px !important;
        }

        @media (max-width: 720px) {
          .wisdom-home-tutorial__cta {
            grid-template-columns: minmax(0, 1fr) 30px !important;
            padding-right: 8px !important;
          }

          .wisdom-home-tutorial__cta-icon {
            width: 30px !important;
            height: 30px !important;
            flex-basis: 30px !important;
          }

          .wisdom-home-tutorial__cta-icon .wisdom-hero-customize-icon {
            width: 16px !important;
            height: 16px !important;
          }
        }
      `}</style>
{/* SHOP BY CATEGORY */}
      <section id="shop-by-category"
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
