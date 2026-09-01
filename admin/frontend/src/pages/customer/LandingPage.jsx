import React, { useEffect, useRef, useState } from "react";
import { useNavigate, Navigate, useLocation } from "react-router-dom";
import useAuthStore from "../../store/authStore";
import api from "../../services/api";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { createFurnitureObject } from "../blueprints/3d/createFurnitureObjects";
import { createCoffeeTableTemplateComponents } from "../blueprints/data/standardTemplateBuilders";
import homepageWardrobeHero from "../../assets/homepage/wardrobe-custom-hero.png";
import homepageFitTable from "../../assets/homepage/editorial/made-to-fit-table.png";
import homepageStorageWardrobe from "../../assets/homepage/editorial/storage-wardrobe.png";
import homepageFinishCabinet from "../../assets/homepage/editorial/finish-cabinet.png";
import homepageFinishCabinetWarmOak from "../../assets/homepage/editorial/finish-cabinet-warm-oak.png";
import homepageFinishCabinetWalnut from "../../assets/homepage/editorial/finish-cabinet-walnut.png";
import homepageFinishCabinetDarkWalnut from "../../assets/homepage/editorial/finish-cabinet-dark-walnut.png";




/* WISDOM HOMEPAGE SHOWCASE + SHOP CATEGORY V6 */
/* WISDOM HOMEPAGE WOOD FINISH INTERACTION V6.4 */
const HOME_FINISH_OPTIONS = [
  {
    key: "light",
    label: "Natural Oak",
    image: homepageFinishCabinet,
    swatch: "#d7b27b",
    isDark: false,
  },
  {
    key: "warm",
    label: "Warm Oak",
    image: homepageFinishCabinetWarmOak,
    swatch: "#9a5b34",
    isDark: false,
  },
  {
    key: "walnut",
    label: "Walnut",
    image: homepageFinishCabinetWalnut,
    swatch: "#6b3f27",
    isDark: false,
  },
  {
    key: "dark",
    label: "Dark Walnut",
    image: homepageFinishCabinetDarkWalnut,
    swatch: "#2d2926",
    isDark: true,
  },
];

const HOME_READY_MADE_CATEGORIES = [
  {
    label: "Bedroom Furniture",
    category: "Closet / Wardrobe",
    img: "/images/closet.png",
  },
  {
    label: "Kitchen Furniture",
    category: "Kitchen Cabinet",
    img: "/images/kitchen.png",
  },
  {
    label: "Bathroom Furniture",
    category: "Bathroom Cabinet",
    img: "/images/bathroom.png",
  },
  {
    label: "Office Furniture",
    category: "Office Furniture",
    img: "/images/office.png",
  },
  {
    label: "Living Room Furniture",
    category: "Living Room Furniture",
    img: "/images/living-room.png",
  },
  {
    label: "Dining Room Furniture",
    category: "Dining Room Furniture",
    img: "/images/dining-room.png",
  },
  {
    label: "Wardrobe & Closet",
    category: "Closet / Wardrobe",
    img: "/images/wardrobe-closet.png",
  },
  {
    label: "TV Console & Storage",
    category: "TV Console & Storage",
    img: "/images/tv-console-storage.png",
  },
];

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

const normalizeHomeCategoryText = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const resolveHomeReadyMadeCategory = (card, categories = []) => {
  const requestedName = normalizeHomeCategoryText(card?.category);
  const requestedText = normalizeHomeCategoryText(
    `${card?.label || ""} ${card?.category || ""}`,
  );

  const exact = categories.find(
    (category) =>
      normalizeHomeCategoryText(category?.name) === requestedName,
  );

  if (exact) return exact;

  for (const signal of HOME_CATEGORY_SIGNALS) {
    if (!requestedText.includes(signal)) continue;

    const semanticMatch = categories.find((category) =>
      normalizeHomeCategoryText(category?.name).includes(signal),
    );

    if (semanticMatch) return semanticMatch;
  }

  return null;
};

const scrollToHomepageSection = (id) => {
  const target = document.getElementById(id);
  if (!target) return;

  // WISDOM SHOP BY CATEGORY SCROLL ALIGN V6.3
  // Let the section start at the viewport top; the sticky header naturally
  // covers the section's top padding so the heading lands neatly below it.
  const targetY = Math.max(
    0,
    window.scrollY + target.getBoundingClientRect().top,
  );

  window.scrollTo({
    top: targetY,
    behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
      ? "auto"
      : "smooth",
  });
};

/* WISDOM HOMEPAGE REFRESH + FAST GLIDE TOP V1.1.0
   Custom requestAnimationFrame glide for the footer Top control.
   It intentionally starts promptly and eases as it reaches the hero so the
   motion stays visible without feeling slow or like an instant teleport. */
const glideHomepageToTop = () => {
  const startY = Math.max(
    0,
    window.scrollY || document.documentElement.scrollTop || 0,
  );

  if (startY <= 1) {
    window.scrollTo(0, 0);
    return;
  }

  const duration = Math.min(
    720,
    Math.max(460, Math.round(startY * 0.11)),
  );
  const startedAt = window.performance.now();

  const easeOutCubic = (progress) =>
    1 - Math.pow(1 - progress, 3);

  const step = (now) => {
    const elapsed = now - startedAt;
    const progress = Math.min(1, elapsed / duration);
    const eased = easeOutCubic(progress);
    const nextY = Math.max(
      0,
      Math.round(startY * (1 - eased)),
    );

    window.scrollTo(0, nextY);

    if (progress < 1) {
      window.requestAnimationFrame(step);
    } else {
      window.scrollTo(0, 0);
    }
  };

  window.requestAnimationFrame(step);
};

/* WISDOM HOMEPAGE ACTUAL 3D TEMPLATE V1.2.3
   Corrected homepage marketing preview rules:
   - Uses the exact WISDOM coffee-table template assembly.
   - No preview card, no frame, no floor, and no furniture shadows.
   - 3D view: rotate-only with fixed camera distance.
   - Front / Side / Back: functional view presets that visibly switch.
   - Framing stays wide enough so the furniture remains fully visible. */
const HOME_3D_REVIEW_VIEWS = ["3D", "Front", "Side", "Back"];

function HomepageFurniture3DReview() {
  const hostRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const renderFrameRef = useRef(null);
  const transitionFrameRef = useRef(null);
  const viewPositionsRef = useRef({});
  const centerRef = useRef(new THREE.Vector3());
  const radiusRef = useRef(1200);
  const activeViewRef = useRef("3D");

  const [activeView, setActiveView] = useState("3D");
  const [isUnavailable, setIsUnavailable] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    let renderer = null;
    let scene = null;
    let controls = null;
    let resizeObserver = null;
    let intersectionObserver = null;
    let fallbackResize = null;
    let disposed = false;
    let isVisible = true;

    try {
      scene = new THREE.Scene();

      const camera = new THREE.PerspectiveCamera(34, 1, 1, 12000);
      cameraRef.current = camera;

      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });

      renderer.setPixelRatio(Math.min(Math.max(1, Number(window.devicePixelRatio || 1)), 1.5));
      renderer.setClearColor(0x000000, 0);
      renderer.shadowMap.enabled = false;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.02;

      renderer.domElement.setAttribute("aria-hidden", "true");
      renderer.domElement.style.display = "block";
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      renderer.domElement.style.background = "transparent";
      renderer.domElement.style.border = "0";
      renderer.domElement.style.outline = "0";
      renderer.domElement.style.boxShadow = "none";
      renderer.domElement.style.touchAction = "none";

      host.replaceChildren(renderer.domElement);

      scene.add(new THREE.AmbientLight(0xffffff, 0.42));

      const hemi = new THREE.HemisphereLight(0xfffcf8, 0xe5cdb5, 0.72);
      scene.add(hemi);

      const key = new THREE.DirectionalLight(0xfffaf4, 1.5);
      key.position.set(1200, 1350, 1450);
      key.castShadow = false;
      scene.add(key);

      const fill = new THREE.DirectionalLight(0xf6e7d7, 0.42);
      fill.position.set(-1000, 700, 900);
      fill.castShadow = false;
      scene.add(fill);

      const rim = new THREE.DirectionalLight(0xffffff, 0.18);
      rim.position.set(500, 500, -1200);
      rim.castShadow = false;
      scene.add(rim);

      const parts = createCoffeeTableTemplateComponents(
        0,
        0,
        3200,
        "homepage_coffee_table",
        "Coffee Table",
      );

      const minX = Math.min(...parts.map((part) => part.x));
      const minY = Math.min(...parts.map((part) => part.y));
      const minZ = Math.min(...parts.map((part) => part.z));
      const maxX = Math.max(...parts.map((part) => part.x + part.width));
      const maxY = Math.max(...parts.map((part) => part.y + part.height));
      const maxZ = Math.max(...parts.map((part) => part.z + part.depth));

      const sourceCenterX = (minX + maxX) / 2;
      const sourceCenterY = (minY + maxY) / 2;
      const sourceCenterZ = (minZ + maxZ) / 2;

      const assembly = new THREE.Group();
      assembly.name = "homepage-wisdom-coffee-table";

      parts.forEach((part) => {
        const selectableMeshes = [];
        const object = createFurnitureObject(part, false, false, selectableMeshes);

        object.position.set(
          part.x + part.width / 2 - sourceCenterX,
          sourceCenterY - (part.y + part.height / 2),
          part.z + part.depth / 2 - sourceCenterZ,
        );

        object.rotation.set(
          THREE.MathUtils.degToRad(part.rotationX || 0),
          THREE.MathUtils.degToRad(part.rotationY || 0),
          THREE.MathUtils.degToRad(part.rotationZ || 0),
        );

        object.traverse((child) => {
          if (!child?.isMesh) return;
          child.castShadow = false;
          child.receiveShadow = false;

          const materials = Array.isArray(child.material) ? child.material : child.material ? [child.material] : [];
          materials.forEach((material) => {
            if (!material) return;
            if (typeof material.roughness === "number") material.roughness = Math.min(1, Math.max(0.42, material.roughness));
            if (typeof material.metalness === "number") material.metalness = 0;
            if (material.map) {
              material.map.anisotropy = Math.max(1, renderer.capabilities.getMaxAnisotropy?.() || 1);
              material.map.needsUpdate = true;
            }
            material.needsUpdate = true;
          });
        });

        assembly.add(object);
      });

      scene.add(assembly);

      const bounds = new THREE.Box3().setFromObject(assembly);
      const center = bounds.getCenter(new THREE.Vector3());
      const size = bounds.getSize(new THREE.Vector3());
      const sphere = bounds.getBoundingSphere(new THREE.Sphere());
      const radius = Math.max(1, sphere.radius);

      centerRef.current.copy(center);
      radiusRef.current = radius;

      controls = new OrbitControls(camera, renderer.domElement);
      controlsRef.current = controls;
      controls.enableDamping = true;
      controls.dampingFactor = 0.06;
      controls.enablePan = false;
      controls.enableZoom = false;
      controls.enableRotate = true;
      controls.rotateSpeed = 0.75;
      // Keep the table readable as furniture: allow free horizontal orbit
      // without letting the camera reach an almost top-down angle where only
      // the tabletop is visible.
      controls.minPolarAngle = 0.82;
      controls.maxPolarAngle = Math.PI / 2 - 0.08;
      controls.target.copy(center);

      const getFitDistance = (width, height) => {
        const aspect = Math.max(1, width) / Math.max(1, height);
        const vFov = THREE.MathUtils.degToRad(camera.fov);
        const hFov =
          2 * Math.atan(Math.tan(vFov / 2) * aspect);

        const horizontalSpan = Math.hypot(size.x, size.z);
        const verticalSpan =
          size.y + Math.min(size.x, size.z) * 0.68;

        const distanceByWidth =
          (horizontalSpan / 2) /
          Math.max(0.15, Math.tan(hFov / 2));

        const distanceByHeight =
          (verticalSpan / 2) /
          Math.max(0.15, Math.tan(vFov / 2));

        return Math.max(
          radius * 1.72,
          distanceByWidth * 1.08,
          distanceByHeight * 1.08,
        );
      };

      const updateViewPositions = () => {
        const width = Math.max(1, host.clientWidth || 720);
        const height = Math.max(1, host.clientHeight || 410);

        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();

        const distance = getFitDistance(width, height);
        const frontBiasY = Math.max(18, size.y * 0.06);
        const threeDirection = new THREE.Vector3(1.02, 0.30, 1.08).normalize();

        viewPositionsRef.current = {
          "3D": center.clone().add(threeDirection.clone().multiplyScalar(distance)),
          Front: center.clone().add(new THREE.Vector3(0, frontBiasY, distance)),
          Side: center.clone().add(new THREE.Vector3(distance, frontBiasY, 0)),
          Back: center.clone().add(new THREE.Vector3(0, frontBiasY, -distance)),
        };

        controls.minDistance = distance;
        controls.maxDistance = distance;
      };

      const settleCurrentView = () => {
        updateViewPositions();
        const next = viewPositionsRef.current[activeViewRef.current] || viewPositionsRef.current["3D"];
        if (next) camera.position.copy(next);
        controls.target.copy(center);
        controls.enableRotate = activeViewRef.current === "3D";
        controls.enabled = activeViewRef.current === "3D";
        controls.update();
        camera.lookAt(center);
        renderer.render(scene, camera);
      };

      settleCurrentView();

      const renderLoop = () => {
        if (disposed) return;
        renderFrameRef.current = window.requestAnimationFrame(renderLoop);
        if (!isVisible || !renderer || !camera) return;
        if (controls.enabled && activeViewRef.current === "3D" && !transitionFrameRef.current) {
          controls.update();
        }
        renderer.render(scene, camera);
      };

      renderLoop();

      if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(() => {
          if (transitionFrameRef.current) {
            window.cancelAnimationFrame(transitionFrameRef.current);
            transitionFrameRef.current = null;
          }
          settleCurrentView();
        });
        resizeObserver.observe(host);
      } else {
        fallbackResize = () => settleCurrentView();
        window.addEventListener("resize", fallbackResize);
      }

      if (typeof IntersectionObserver !== "undefined") {
        intersectionObserver = new IntersectionObserver(([entry]) => {
          isVisible = Boolean(entry?.isIntersecting);
        }, { threshold: 0.02 });
        intersectionObserver.observe(host);
      }

      return () => {
        disposed = true;

        if (renderFrameRef.current) {
          window.cancelAnimationFrame(renderFrameRef.current);
          renderFrameRef.current = null;
        }
        if (transitionFrameRef.current) {
          window.cancelAnimationFrame(transitionFrameRef.current);
          transitionFrameRef.current = null;
        }

        resizeObserver?.disconnect();
        intersectionObserver?.disconnect();
        if (fallbackResize) window.removeEventListener("resize", fallbackResize);

        controls?.dispose();

        const geometries = new Set();
        const materials = new Set();
        const textures = new Set();

        scene?.traverse((child) => {
          if (child?.geometry) geometries.add(child.geometry);
          const list = Array.isArray(child?.material)
            ? child.material
            : child?.material
              ? [child.material]
              : [];
          list.forEach((material) => {
            if (!material) return;
            materials.add(material);
            [material.map, material.normalMap, material.roughnessMap, material.metalnessMap, material.bumpMap].forEach((texture) => {
              if (texture) textures.add(texture);
            });
          });
        });

        textures.forEach((texture) => texture.dispose?.());
        materials.forEach((material) => material.dispose?.());
        geometries.forEach((geometry) => geometry.dispose?.());
        renderer?.dispose();

        if (renderer?.domElement && renderer.domElement.parentNode === host) {
          host.removeChild(renderer.domElement);
        }

        cameraRef.current = null;
        controlsRef.current = null;
        viewPositionsRef.current = {};
      };
    } catch (error) {
      console.error("Homepage actual 3D template failed:", error);
      setIsUnavailable(true);
      try {
        controls?.dispose();
        renderer?.dispose();
      } catch {
        // Ignore cleanup problems.
      }
      return undefined;
    }
  }, []);

  const changeView = (nextView) => {
    if (!HOME_3D_REVIEW_VIEWS.includes(nextView)) return;

    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const destination = viewPositionsRef.current[nextView];
    const center = centerRef.current;

    activeViewRef.current = nextView;
    setActiveView(nextView);

    if (!camera || !controls || !destination) return;

    if (transitionFrameRef.current) {
      window.cancelAnimationFrame(transitionFrameRef.current);
      transitionFrameRef.current = null;
    }

    controls.enabled = false;
    controls.enableRotate = false;
    camera.up.set(0, 1, 0);

    const start = camera.position.clone();
    const target = destination.clone();

    const finish = () => {
      camera.position.copy(target);
      camera.lookAt(center);
      controls.target.copy(center);
      controls.enableRotate = nextView === "3D";
      controls.enabled = nextView === "3D";
      controls.update();
      transitionFrameRef.current = null;
    };

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduceMotion) {
      finish();
      return;
    }

    const startTime = window.performance.now();
    const duration = 420;

    const animate = (now) => {
      const progress = Math.min(1, (now - startTime) / duration);
      const eased = progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      camera.position.lerpVectors(start, target, eased);
      camera.lookAt(center);

      if (progress < 1) {
        transitionFrameRef.current = window.requestAnimationFrame(animate);
      } else {
        finish();
      }
    };

    transitionFrameRef.current = window.requestAnimationFrame(animate);
  };

  return (
    <div className="wisdom-home-actual-3d">
      <style>{`
        .wisdom-home-actual-3d {
          position: relative;
          width: min(100%, 760px);
          height: clamp(355px, 31vw, 430px);
          min-width: 0;
          margin: 0 auto;
          background: transparent;
          border: 0;
          border-radius: 0;
          box-shadow: none;
          overflow: visible;
        }

        .wisdom-home-actual-3d__canvas {
          position: absolute;
          inset: 0;
          background: transparent;
          border: 0;
          border-radius: 0;
          outline: 0;
          box-shadow: none;
          overflow: hidden;
        }

        .wisdom-home-actual-3d__canvas canvas {
          display: block;
          width: 100%;
          height: 100%;
          background: transparent !important;
          border: 0 !important;
          border-radius: 0 !important;
          outline: 0 !important;
          box-shadow: none !important;
        }

        .wisdom-home-actual-3d__canvas.is-3d canvas {
          cursor: grab;
        }

        .wisdom-home-actual-3d__canvas.is-3d canvas:active {
          cursor: grabbing;
        }

        /* WISDOM HOMEPAGE EXPLORE 360 PERSISTENT V1.2.5
           Remove the floating panel, shift the label farther left, and rely
           on stronger typography so the guide stays readable without a border
           or box around it. */
        .wisdom-home-actual-3d__360-guide {
          position: absolute;
          left: clamp(2px, 0.9%, 14px);
          top: clamp(48px, 11.5%, 72px);
          z-index: 18;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 4px;
          max-width: 176px;
          padding: 0;
          border-radius: 0;
          background: none;
          border: none;
          box-shadow: none;
          color: #111111;
          pointer-events: none;
          user-select: none;
          -webkit-user-select: none;
        }

        .wisdom-home-actual-3d__360-guide-title {
          font-size: clamp(0.94rem, 0.98vw, 1.08rem);
          font-weight: 600;
          line-height: 1.14;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #111111;
        }

        .wisdom-home-actual-3d
          .wisdom-home-editorial__control.is-view {
          z-index: 20;
          pointer-events: auto !important;
        }

        .wisdom-home-actual-3d button.wisdom-home-editorial__view-option {
          position: relative;
          z-index: 21;
          border: 0;
          outline: 0;
          background: transparent;
          font: inherit;
          cursor: pointer;
          pointer-events: auto !important;
          -webkit-tap-highlight-color: transparent;
        }

        .wisdom-home-actual-3d button.wisdom-home-editorial__view-option.is-active {
          background: #111111;
          color: #ffffff;
        }

        .wisdom-home-actual-3d button.wisdom-home-editorial__view-option:focus-visible {
          outline: 2px solid #111111;
          outline-offset: 2px;
        }

        .wisdom-home-actual-3d__fallback {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #6b645d;
          font-size: 0.78rem;
          text-align: center;
        }

        @media (max-width: 900px) {
          .wisdom-home-actual-3d {
            height: 360px;
          }
        }

        @media (max-width: 640px) {
          .wisdom-home-actual-3d {
            width: min(100%, 560px);
            height: 290px;
          }
        }
      `}</style>

      <div
        ref={hostRef}
        className={"wisdom-home-actual-3d__canvas" + (activeView === "3D" ? " is-3d" : "")}
        aria-label="Read-only interactive WISDOM coffee table preview"
      >
        {isUnavailable ? (
          <div className="wisdom-home-actual-3d__fallback">
            3D preview unavailable in this browser.
          </div>
        ) : null}
      </div>

      {!isUnavailable ? (
        <div
          className="wisdom-home-actual-3d__360-guide"
          aria-hidden="true"
        >
          <span className="wisdom-home-actual-3d__360-guide-title">
            Explore in 360°
          </span>
        </div>
      ) : null}

      <div
        className="wisdom-home-editorial__control is-view"
        role="group"
        aria-label="Furniture preview view"
      >
        {HOME_3D_REVIEW_VIEWS.map((view) => (
          <button
            key={view}
            type="button"
            className={"wisdom-home-editorial__view-option" + (activeView === view ? " is-active" : "")}
            aria-pressed={activeView === view}
            onClick={() => changeView(view)}
          >
            {view}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuthStore();
  const [catalogCategories, setCatalogCategories] = useState([]);
  const [homeFinishKey, setHomeFinishKey] = useState("light");

  const activeHomeFinish =
    HOME_FINISH_OPTIONS.find((option) => option.key === homeFinishKey) ||
    HOME_FINISH_OPTIONS[0];


  useEffect(() => {
    HOME_FINISH_OPTIONS.slice(1).forEach((option) => {
      const image = new Image();
      image.src = option.image;
    });
  }, []);

  useEffect(() => {
    let active = true;

    api
      .get("/customer/products", {
        params: {
          type: "standard",
          sort: "name_asc",
          limit: 1,
        },
      })
      .then((response) => {
        if (!active) return;

        const categories = Array.isArray(response.data?.categories)
          ? response.data.categories
          : [];

        setCatalogCategories(categories);
      })
      .catch((error) => {
        console.error("Failed to load homepage ready-made categories", error);
        if (active) setCatalogCategories([]);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (location.hash !== "#shop-by-category") return undefined;

    const frame = window.requestAnimationFrame(() => {
      scrollToHomepageSection("shop-by-category");
    });

    return () => window.cancelAnimationFrame(frame);
  }, [location.hash]);

  /* WISDOM HOMEPAGE REFRESH + FAST GLIDE TOP V1.1.0
     On a hard refresh of the plain homepage, browsers can restore the old
     scroll position after React mounts. Keep / at the canonical hero/top,
     while explicit section hashes keep their intended deep-link behavior. */
  useEffect(() => {
    if (location.pathname !== "/" || location.hash) return undefined;

    const supportsScrollRestoration =
      "scrollRestoration" in window.history;
    const previousScrollRestoration = supportsScrollRestoration
      ? window.history.scrollRestoration
      : null;

    if (supportsScrollRestoration) {
      window.history.scrollRestoration = "manual";
    }

    const forceHomeTop = () => {
      window.scrollTo({
        top: 0,
        left: 0,
        behavior: "auto",
      });
    };

    forceHomeTop();

    const frame = window.requestAnimationFrame(forceHomeTop);
    const timer = window.setTimeout(forceHomeTop, 80);

    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);

      if (supportsScrollRestoration && previousScrollRestoration) {
        window.history.scrollRestoration = previousScrollRestoration;
      }
    };
  }, [location.pathname, location.hash]);

  const handleBrowseReadyMade = () => {
    scrollToHomepageSection("shop-by-category");
  };

  const handleBackToTop = () => {
    glideHomepageToTop();
  };

  const handleHomeCategoryClick = (card) => {
    const matchedCategory = resolveHomeReadyMadeCategory(
      card,
      catalogCategories,
    );

    const params = new URLSearchParams();
    params.set("category", matchedCategory?.name || card?.category || "");

    if (matchedCategory?.id != null) {
      params.set("category_id", String(matchedCategory.id));
    }

    navigate(`/catalog?${params.toString()}`);
  };

  useEffect(() => {
    const sections = Array.from(
      document.querySelectorAll(".wisdom-home-editorial-reveal"),
    );

    if (!sections.length) return undefined;

    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
      sections.forEach((section) => section.classList.add("is-visible"));
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      {
        threshold: 0.16,
        rootMargin: "0px 0px -7% 0px",
      },
    );

    sections.forEach((section) => observer.observe(section));

    return () => observer.disconnect();
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
      {/* WISDOM HOMEPAGE CLEAN IMAGE HERO V1 */
/* WISDOM HOMEPAGE CLEAN HERO POLISH V1.1 */
/* WISDOM HOMEPAGE HERO REFERENCE TUNE V4 */}
      <section
        className="wisdom-home-clean-hero"
        aria-labelledby="wisdom-home-clean-hero-title"
      >
        <style>{`
          .wisdom-home-clean-hero,
          .wisdom-home-clean-hero button {
            font-family: "Montserrat", sans-serif;
          }

          .wisdom-home-clean-hero {
            width: 100%;
            min-height: calc(100vh - 88px);
            box-sizing: border-box;
            display: flex;
            align-items: center;
            padding:
              clamp(46px, 5vw, 72px)
              clamp(24px, 5vw, 86px)
              clamp(50px, 5vw, 78px);
            background: #fdfbf9;
            border-bottom: 1px solid #e8e4df;
            overflow: hidden;
          }

          .wisdom-home-clean-hero__inner {
            width: min(100%, 1600px);
            margin: 0 auto;
            display: grid;
            grid-template-columns: minmax(390px, 0.88fr) minmax(0, 1.12fr);
            align-items: center;
            gap: clamp(48px, 5vw, 82px);
          }

          .wisdom-home-clean-hero__copy {
            min-width: 0;
            max-width: 560px;
            animation: wisdomHomeCleanCopyIn 620ms
              cubic-bezier(0.22, 1, 0.36, 1) both;
          }

          .wisdom-home-clean-hero__title {
            margin: 0;
            max-width: 535px;
            color: #111111;
            font-size: clamp(2.3rem, 3vw, 3.28rem);
            font-weight: 400;
            line-height: 1.1;
            letter-spacing: -0.035em;
            text-wrap: balance;
          }

          .wisdom-home-clean-hero__summary {
            width: min(100%, 520px);
            margin: 24px 0 0;
            color: #55504a;
            font-size: clamp(0.96rem, 1vw, 1.05rem);
            font-weight: 400;
            line-height: 1.62;
          }

          .wisdom-home-clean-hero__actions {
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
            margin-top: 30px;
          }

          .wisdom-home-clean-hero__primary,
          .wisdom-home-clean-hero__secondary {
            min-height: 48px;
            border-radius: 999px;
            font: inherit;
            font-size: 0.94rem;
            font-weight: 500;
            letter-spacing: 0;
            cursor: pointer;
            transition:
              transform 180ms ease,
              background-color 180ms ease,
              color 180ms ease,
              border-color 180ms ease;
          }

          .wisdom-home-clean-hero__primary {
            min-width: 194px;
            padding: 0 28px;
            border: 1px solid #111111;
            background: #111111;
            color: #ffffff;
          }

          .wisdom-home-clean-hero__secondary {
            min-width: 184px;
            padding: 0 28px;
            border: 1px solid #111111;
            background: transparent;
            color: #111111;
          }

          .wisdom-home-clean-hero__primary:hover,
          .wisdom-home-clean-hero__secondary:hover {
            transform: translateY(-2px);
          }

          .wisdom-home-clean-hero__primary:hover {
            background: #252525;
          }

          .wisdom-home-clean-hero__secondary:hover {
            background: #111111;
            color: #ffffff;
          }

          .wisdom-home-clean-hero__benefits {
            display: flex;
            flex-wrap: wrap;
            gap: 10px 24px;
            margin-top: 28px;
            padding-top: 17px;
            border-top: 1px solid #ddd8d1;
          }

          .wisdom-home-clean-hero__benefit {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            color: #514c46;
            font-size: 0.74rem;
            font-weight: 560;
          }

          .wisdom-home-clean-hero__benefit::before {
            content: "";
            width: 5px;
            height: 5px;
            flex: 0 0 5px;
            border-radius: 50%;
            background: #111111;
          }

          .wisdom-home-clean-hero__visual {
            width: min(100%, 900px);
            min-width: 0;
            justify-self: end;
            opacity: 0;
            transform: translateY(16px) scale(0.99);
            animation: wisdomHomeCleanVisualIn 760ms 80ms
              cubic-bezier(0.22, 1, 0.36, 1) forwards;
          }

          .wisdom-home-clean-hero__image-wrap {
            overflow: hidden;
            border: 1px solid #d8d2ca;
            border-radius: 4px;
            background: #f1ebe4;
            box-shadow: 0 22px 58px rgba(47, 36, 28, 0.09);
          }

          .wisdom-home-clean-hero__image {
            width: 100%;
            height: auto;
            display: block;
            object-fit: cover;
            background: #f1ebe4;
            transition: transform 520ms cubic-bezier(0.22, 1, 0.36, 1);
          }

          .wisdom-home-clean-hero__image-wrap:hover
            .wisdom-home-clean-hero__image {
            transform: scale(1.012);
          }

          /* WISDOM HOMEPAGE REFRESH + FAST GLIDE TOP V1.1.0 */
          .wisdom-home-back-to-top {
            width: 100%;
            min-height: 112px;
            border: 0;
            border-top: 1px solid #e8e4df;
            background: #ffffff;
            color: #111111;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 7px;
            padding: 22px 16px 24px;
            font: inherit;
            font-size: 0.82rem;
            font-weight: 500;
            line-height: 1;
            cursor: pointer;
            transition: background-color 180ms ease;
          }

          .wisdom-home-back-to-top:hover {
            background: #faf9f7;
          }

          .wisdom-home-back-to-top__arrow {
            width: 9px;
            height: 9px;
            border-top: 1.25px solid currentColor;
            border-left: 1.25px solid currentColor;
            transform: rotate(45deg);
            transform-origin: center;
          }

          .wisdom-home-back-to-top:focus-visible {
            outline: 2px solid #111111;
            outline-offset: -5px;
          }

          @media (max-width: 640px) {
            .wisdom-home-back-to-top {
              min-height: 92px;
              padding-top: 18px;
              padding-bottom: 20px;
              font-size: 0.78rem;
            }
          }

          @keyframes wisdomHomeCleanCopyIn {
            from {
              opacity: 0;
              transform: translateY(18px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          @keyframes wisdomHomeCleanVisualIn {
            to {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }

          @media (max-width: 1080px) {
            .wisdom-home-clean-hero {
              min-height: auto;
            }

            .wisdom-home-clean-hero__inner {
              grid-template-columns: 1fr;
              gap: 38px;
            }

            .wisdom-home-clean-hero__copy {
              max-width: 760px;
            }

            .wisdom-home-clean-hero__summary {
              max-width: 650px;
            }
          }

          @media (max-width: 680px) {
            .wisdom-home-clean-hero {
              padding: 40px 16px 48px;
            }

            .wisdom-home-clean-hero__title {
              font-size: clamp(2.05rem, 9vw, 2.7rem);
            }

            .wisdom-home-clean-hero__summary {
              margin-top: 17px;
              font-size: 0.95rem;
            }

            .wisdom-home-clean-hero__actions {
              display: grid;
              grid-template-columns: 1fr;
              gap: 10px;
              margin-top: 25px;
            }

            .wisdom-home-clean-hero__primary,
            .wisdom-home-clean-hero__secondary {
              width: 100%;
              min-width: 0;
            }

            .wisdom-home-clean-hero__benefits {
              display: grid;
              grid-template-columns: 1fr;
              gap: 9px;
              margin-top: 24px;
            }
          }


          /* WISDOM HOMEPAGE SHOWCASE V6 POLISH */
          .wisdom-home-editorial__section:nth-of-type(even) {
            background: #faf8f5;
          }

          .wisdom-home-editorial__inner {
            min-height: clamp(500px, 58vh, 620px);
            padding: clamp(58px, 6vw, 84px) 0;
            gap: clamp(46px, 5.5vw, 86px);
          }

          .wisdom-home-editorial__visual {
            min-height: 350px;
          }

          .wisdom-home-editorial__image {
            max-width: 740px;
            max-height: 485px;
          }

          .wisdom-home-editorial__image.is-wide {
            max-width: 780px;
          }

          .wisdom-home-editorial__image.is-tall {
            width: min(100%, 520px);
            max-height: 500px;
          }

          .wisdom-home-editorial__title {
            font-size: clamp(2.05rem, 3vw, 3.25rem);
          }

          .wisdom-home-editorial__body {
            margin-top: 20px;
            line-height: 1.65;
          }

          .wisdom-home-editorial__detail {
            margin-top: 18px;
          }

          .wisdom-home-editorial__statement {
            padding: clamp(70px, 7vw, 98px) 24px;
          }

          .wisdom-home-editorial__statement h2 {
            font-size: clamp(2.25rem, 3.75vw, 3.85rem);
          }

          .wisdom-home-editorial__visual {
            isolation: isolate;
          }

          .wisdom-home-editorial__control {
            position: absolute;
            z-index: 4;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 7px;
            border: 1px solid rgba(35, 31, 28, 0.12);
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.94);
            box-shadow: 0 12px 28px rgba(46, 38, 31, 0.11);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            color: #27231f;
            pointer-events: none;
          }

          .wisdom-home-editorial__control.is-dimensions {
            right: 5%;
            bottom: 28px;
            gap: 4px;
          }

          .wisdom-home-editorial__dimension {
            min-width: 66px;
            display: grid;
            grid-template-columns: 20px auto;
            align-items: center;
            gap: 4px;
            padding: 7px 9px;
            border-radius: 999px;
            font-size: 0.67rem;
            line-height: 1;
            white-space: nowrap;
          }

          .wisdom-home-editorial__dimension b {
            width: 20px;
            height: 20px;
            display: grid;
            place-items: center;
            border-radius: 50%;
            background: #111111;
            color: #ffffff;
            font-size: 0.62rem;
            font-weight: 600;
          }

          .wisdom-home-editorial__control.is-storage {
            right: 3%;
            bottom: 24px;
            padding: 8px;
          }

          .wisdom-home-editorial__storage-option,
          .wisdom-home-editorial__view-option {
            min-height: 33px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 0 12px;
            border-radius: 999px;
            color: #655e57;
            font-size: 0.68rem;
            font-weight: 500;
            white-space: nowrap;
          }

          .wisdom-home-editorial__storage-option.is-active,
          .wisdom-home-editorial__view-option.is-active {
            background: #111111;
            color: #ffffff;
          }

          .wisdom-home-editorial__control.is-finish {
            right: 10%;
            bottom: 30px;
            padding: 8px 10px;
            /* WISDOM HOME WOOD FINISH CLICK FIX V6.4.2 */
            pointer-events: auto !important;
            z-index: 5;
          }

          .wisdom-home-editorial__swatch {
            position: relative;
            width: 34px;
            height: 34px;
            flex: 0 0 34px;
            border: 1px solid rgba(0, 0, 0, 0.12);
            border-radius: 50%;
            background: var(--swatch);
            box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.22);
          }

          .wisdom-home-editorial__swatch.is-active::after {
            content: "✓";
            position: absolute;
            inset: 0;
            display: grid;
            place-items: center;
            color: #24211e;
            font-size: 0.9rem;
            font-weight: 700;
          }

          .wisdom-home-editorial__swatch.is-dark.is-active::after {
            color: #ffffff;
          }


          /* WISDOM HOMEPAGE WOOD FINISH INTERACTION V6.4 */
          /* WISDOM HOMEPAGE WOOD FINISH ALIGNMENT FIX V6.4.5.2 */
          .wisdom-home-editorial__finish-stage {
            width: min(100%, 520px);
            display: flex;
            align-items: center;
            justify-content: center;
            transform-origin: 50% 50%;
            transition: transform 300ms cubic-bezier(0.22, 1, 0.36, 1);
            will-change: transform;
          }

          .wisdom-home-editorial__finish-stage.is-light,
          .wisdom-home-editorial__finish-stage.is-warm {
            transform: none;
          }

          .wisdom-home-editorial__finish-stage.is-walnut {
            transform:
              translate3d(-0.95%, 0.04%, 0)
              scaleX(0.992)
              scaleY(0.993);
          }

          /* WISDOM HOMEPAGE DARK WALNUT IMAGE REPLACE V6.4.6
             The replacement Dark Walnut PNG is normalized to the original
             cabinet canvas, so it no longer needs a finish-specific scale. */
          .wisdom-home-editorial__finish-stage.is-dark {
            transform: none;
          }

          .wisdom-home-editorial__finish-stage
            .wisdom-home-editorial__image.is-tall {
            width: min(100%, 520px);
            max-height: 500px;
          }

          .wisdom-home-editorial__image.is-finish-preview {
            transform-origin: 50% 88%;
            animation: wisdom-home-finish-swap 280ms
              cubic-bezier(0.22, 1, 0.36, 1);
            will-change: opacity, transform;
          }

          .wisdom-home-editorial__swatch {
            display: block;
            margin: 0;
            padding: 0;
            appearance: none;
            -webkit-appearance: none;
            cursor: pointer;
            transition:
              transform 180ms ease,
              box-shadow 180ms ease,
              border-color 180ms ease;
          }

          .wisdom-home-editorial__swatch:hover {
            transform: translateY(-1px) scale(1.045);
          }

          .wisdom-home-editorial__swatch.is-active {
            transform: scale(1.06);
            border-color: rgba(17, 17, 17, 0.32);
            box-shadow:
              0 0 0 2px #ffffff,
              0 0 0 3px rgba(17, 17, 17, 0.12),
              inset 0 0 0 1px rgba(255, 255, 255, 0.22);
          }

          .wisdom-home-editorial__swatch:focus-visible {
            outline: 2px solid #111111;
            outline-offset: 3px;
          }

          @keyframes wisdom-home-finish-swap {
            from {
              opacity: 0.38;
              transform: translateY(4px) scale(0.985);
            }
            to {
              opacity: 1;
              transform: translateY(0) scale(1);
            }
          }

          @media (prefers-reduced-motion: reduce) {
            .wisdom-home-editorial__finish-stage {
              transition: none;
            }

            .wisdom-home-editorial__image.is-finish-preview {
              animation: none;
            }

            .wisdom-home-editorial__swatch {
              transition: none;
            }
          }

          .wisdom-home-editorial__control.is-view {
            left: 50%;
            bottom: 28px;
            transform: translateX(-50%);
            padding: 7px;
          }

          .wisdom-home-shop {
            width: 100%;
            box-sizing: border-box;
            padding: clamp(72px, 7vw, 104px) 24px
              clamp(82px, 8vw, 116px);
            border-top: 1px solid #ebe7e2;
            background: #ffffff;
          }

          .wisdom-home-shop__inner {
            width: min(100%, 1480px);
            margin: 0 auto;
          }

          .wisdom-home-shop__head {
            width: min(100%, 720px);
            margin: 0 auto clamp(34px, 4vw, 52px);
            text-align: center;
          }

          .wisdom-home-shop__eyebrow {
            margin: 0 0 13px;
            color: #736c65;
            font-size: 0.69rem;
            font-weight: 600;
            letter-spacing: 0.12em;
            text-transform: uppercase;
          }

          .wisdom-home-shop__title {
            margin: 0;
            color: #111111;
            font-size: clamp(2.15rem, 3.6vw, 3.65rem);
            font-weight: 400;
            line-height: 1.08;
            letter-spacing: -0.043em;
          }

          .wisdom-home-shop__copy {
            margin: 18px auto 0;
            color: #625b55;
            font-size: 0.98rem;
            line-height: 1.65;
          }

          .wisdom-home-shop__grid {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 14px;
          }

          /* WISDOM SHOP BY CATEGORY REMOVE BORDER V6.2 */
          .wisdom-home-shop__card {
            position: relative;
            min-height: 0;
            padding: 0;
            overflow: hidden;
            border: none;
            border-radius: 0;
            background: #ffffff;
            color: #111111;
            cursor: pointer;
            text-align: center;
          }

          .wisdom-home-shop__card-image {
            display: block;
            width: 100%;
            height: 238px;
            overflow: hidden;
            background: #f6f2ed;
          }

          .wisdom-home-shop__card img {
            width: 100%;
            height: 100%;
            display: block;
            object-fit: cover;
            transition: transform 360ms cubic-bezier(0.22, 1, 0.36, 1);
          }

          .wisdom-home-shop__card:hover img {
            transform: scale(1.025);
          }

          .wisdom-home-shop__card-label {
            min-height: 58px;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 12px 14px;
            box-sizing: border-box;
            background: #ffffff;
            color: #111111;
            font-size: 0.88rem;
            font-weight: 700;
            line-height: 1.25;
            letter-spacing: 0.035em;
            text-align: center;
            text-transform: uppercase;
          }

          @media (max-width: 1020px) {
            .wisdom-home-editorial__inner,
            .wisdom-home-editorial__section.is-reverse
              .wisdom-home-editorial__inner {
              min-height: auto;
              gap: 26px;
              padding: 62px 0 72px;
            }

            .wisdom-home-editorial__visual {
              min-height: 310px;
            }

            .wisdom-home-editorial__control.is-storage,
            .wisdom-home-editorial__control.is-finish {
              right: 5%;
            }

            .wisdom-home-shop__grid {
              grid-template-columns: repeat(2, minmax(0, 1fr));
            }
          }

          @media (max-width: 640px) {
            .wisdom-home-editorial__inner,
            .wisdom-home-editorial__section.is-reverse
              .wisdom-home-editorial__inner {
              padding: 48px 0 58px;
            }

            .wisdom-home-editorial__visual {
              min-height: 250px;
            }

            .wisdom-home-editorial__control {
              transform: scale(0.88);
              transform-origin: bottom right;
            }

            .wisdom-home-editorial__control.is-view {
              transform: translateX(-50%) scale(0.88);
              transform-origin: bottom center;
            }

            .wisdom-home-shop {
              padding-left: 16px;
              padding-right: 16px;
            }

            .wisdom-home-shop__grid {
              grid-template-columns: 1fr;
              gap: 10px;
            }

            .wisdom-home-shop__card-image {
              height: 220px;
              min-height: 220px;
            }
          }

          @media (prefers-reduced-motion: reduce) {
            .wisdom-home-clean-hero__copy,
            .wisdom-home-clean-hero__visual,
            .wisdom-home-clean-hero__primary,
            .wisdom-home-clean-hero__secondary,
            .wisdom-home-clean-hero__image {
              animation: none !important;
              transition: none !important;
              transform: none !important;
              opacity: 1 !important;
            }
          }
        `}</style>

        <div className="wisdom-home-clean-hero__inner">
          <div className="wisdom-home-clean-hero__copy">
            <h1
              id="wisdom-home-clean-hero-title"
              className="wisdom-home-clean-hero__title"
            >
              Furniture designed around your space.
            </h1>

            <p className="wisdom-home-clean-hero__summary">
              Customize the size, layout, and wood finish in 3D, or browse
              ready made furniture from Spiral Wood.
            </p>

            <div className="wisdom-home-clean-hero__actions">
              <button
                type="button"
                className="wisdom-home-clean-hero__primary"
                onClick={() => navigate("/customize")}
              >
                Customize a Design
              </button>

              <button
                type="button"
                className="wisdom-home-clean-hero__secondary"
                onClick={handleBrowseReadyMade}
              >
                Shop Ready Made
              </button>
            </div>

            <div className="wisdom-home-clean-hero__benefits">
              <span className="wisdom-home-clean-hero__benefit">
                Made to your dimensions
              </span>
              <span className="wisdom-home-clean-hero__benefit">
                Flexible layouts
              </span>
              <span className="wisdom-home-clean-hero__benefit">
                Wood finish choices
              </span>
            </div>
          </div>

          <div className="wisdom-home-clean-hero__visual">
            <div className="wisdom-home-clean-hero__image-wrap">
              <img
                src={homepageWardrobeHero}
                alt="Custom wardrobe with wood-finish customization controls"
                className="wisdom-home-clean-hero__image"
              />
            </div>
          </div>
        </div>
      </section>

      {/* WISDOM HOMEPAGE EDITORIAL SHOWCASE V5 */}
      <div className="wisdom-home-editorial">
        <style>{`
          .wisdom-home-editorial,
          .wisdom-home-editorial button {
            font-family: "Montserrat", sans-serif;
          }

          .wisdom-home-editorial {
            width: 100%;
            background: #ffffff;
            color: #111111;
          }

          .wisdom-home-editorial__section {
            width: 100%;
            box-sizing: border-box;
            border-top: 1px solid #ece8e3;
            background: #ffffff;
          }

          .wisdom-home-editorial__inner {
            width: min(100% - 48px, 1500px);
            min-height: clamp(610px, 72vh, 760px);
            margin: 0 auto;
            padding: clamp(76px, 8vw, 126px) 0;
            box-sizing: border-box;
            display: grid;
            grid-template-columns: minmax(0, 1.05fr) minmax(360px, 0.82fr);
            align-items: center;
            gap: clamp(58px, 7vw, 118px);
          }

          .wisdom-home-editorial__section.is-reverse
            .wisdom-home-editorial__inner {
            grid-template-columns: minmax(360px, 0.82fr) minmax(0, 1.05fr);
          }

          .wisdom-home-editorial__section.is-reverse
            .wisdom-home-editorial__visual {
            order: 2;
          }

          .wisdom-home-editorial__section.is-reverse
            .wisdom-home-editorial__copy {
            order: 1;
          }

          .wisdom-home-editorial__visual {
            min-width: 0;
            min-height: 440px;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
          }

          .wisdom-home-editorial__image {
            width: 100%;
            max-width: 780px;
            max-height: 560px;
            display: block;
            object-fit: contain;
            object-position: center;
            background: transparent;
            border: 0;
            box-shadow: none;
          }

          .wisdom-home-editorial__image.is-tall {
            width: min(100%, 610px);
            max-height: 585px;
          }

          .wisdom-home-editorial__image.is-wide {
            max-width: 820px;
          }

          .wisdom-home-editorial__copy {
            width: min(100%, 520px);
            min-width: 0;
          }

          .wisdom-home-editorial__eyebrow {
            margin: 0 0 18px;
            color: #716a63;
            font-size: 0.72rem;
            font-weight: 600;
            line-height: 1.3;
            letter-spacing: 0.11em;
            text-transform: uppercase;
          }

          .wisdom-home-editorial__title {
            margin: 0;
            color: #111111;
            font-size: clamp(2.2rem, 3.35vw, 3.55rem);
            font-weight: 400;
            line-height: 1.08;
            letter-spacing: -0.042em;
            text-wrap: balance;
          }

          .wisdom-home-editorial__body {
            margin: 24px 0 0;
            color: #55504a;
            font-size: clamp(1rem, 1.08vw, 1.08rem);
            font-weight: 400;
            line-height: 1.72;
            text-wrap: pretty;
          }

          .wisdom-home-editorial__detail {
            margin: 22px 0 0;
            color: #26221f;
            font-size: 0.79rem;
            font-weight: 550;
            line-height: 1.5;
            letter-spacing: 0.045em;
          }

          .wisdom-home-editorial-reveal {
            opacity: 0;
            transform: translateY(26px);
            transition:
              opacity 680ms cubic-bezier(0.22, 1, 0.36, 1),
              transform 680ms cubic-bezier(0.22, 1, 0.36, 1);
          }

          .wisdom-home-editorial-reveal.is-visible {
            opacity: 1;
            transform: translateY(0);
          }

          .wisdom-home-editorial__statement {
            border-top: 1px solid #ece8e3;
            padding: clamp(86px, 9vw, 142px) 24px;
            background: #f8f5f1;
            text-align: center;
          }

          .wisdom-home-editorial__statement-inner {
            width: min(100%, 980px);
            margin: 0 auto;
          }

          .wisdom-home-editorial__statement h2 {
            margin: 0;
            color: #111111;
            font-size: clamp(2.35rem, 4.35vw, 4.65rem);
            font-weight: 400;
            line-height: 1.06;
            letter-spacing: -0.046em;
            text-wrap: balance;
          }

          .wisdom-home-editorial__statement p {
            width: min(100%, 700px);
            margin: 26px auto 0;
            color: #5c5650;
            font-size: clamp(1rem, 1.08vw, 1.08rem);
            line-height: 1.72;
          }

          .wisdom-home-editorial__final {
            border-top: 1px solid #e5e0da;
            padding: clamp(82px, 8vw, 126px) 24px;
            background: #111111;
            color: #ffffff;
            text-align: center;
          }

          .wisdom-home-editorial__final-inner {
            width: min(100%, 850px);
            margin: 0 auto;
          }

          .wisdom-home-editorial__final h2 {
            margin: 0;
            font-size: clamp(2.25rem, 4vw, 4.1rem);
            font-weight: 400;
            line-height: 1.08;
            letter-spacing: -0.043em;
            text-wrap: balance;
          }

          .wisdom-home-editorial__final p {
            width: min(100%, 650px);
            margin: 22px auto 0;
            color: #cfcac5;
            font-size: 1.02rem;
            line-height: 1.7;
          }

          .wisdom-home-editorial__actions {
            display: flex;
            align-items: center;
            justify-content: center;
            flex-wrap: wrap;
            gap: 12px;
            margin-top: 31px;
          }

          .wisdom-home-editorial__primary,
          .wisdom-home-editorial__secondary {
            min-height: 50px;
            min-width: 198px;
            padding: 0 27px;
            border-radius: 999px;
            font: inherit;
            font-size: 0.92rem;
            font-weight: 500;
            letter-spacing: 0;
            cursor: pointer;
            transition:
              transform 170ms ease,
              background-color 170ms ease,
              color 170ms ease,
              border-color 170ms ease;
          }

          .wisdom-home-editorial__primary {
            border: 1px solid #ffffff;
            background: #ffffff;
            color: #111111;
          }

          .wisdom-home-editorial__secondary {
            border: 1px solid #ffffff;
            background: transparent;
            color: #ffffff;
          }

          .wisdom-home-editorial__primary:hover,
          .wisdom-home-editorial__secondary:hover {
            transform: translateY(-2px);
          }

          .wisdom-home-editorial__primary:hover {
            background: #eae7e3;
            border-color: #eae7e3;
          }

          .wisdom-home-editorial__secondary:hover {
            background: #ffffff;
            color: #111111;
          }

          @media (max-width: 1020px) {
            .wisdom-home-editorial__inner,
            .wisdom-home-editorial__section.is-reverse
              .wisdom-home-editorial__inner {
              width: min(100% - 40px, 900px);
              min-height: auto;
              grid-template-columns: 1fr;
              gap: 34px;
              padding: 76px 0 88px;
            }

            .wisdom-home-editorial__section.is-reverse
              .wisdom-home-editorial__visual,
            .wisdom-home-editorial__section.is-reverse
              .wisdom-home-editorial__copy {
              order: initial;
            }

            .wisdom-home-editorial__visual {
              min-height: 360px;
              order: 1;
            }

            .wisdom-home-editorial__copy {
              width: min(100%, 660px);
              order: 2;
            }

            .wisdom-home-editorial__image {
              max-height: 490px;
            }
          }

          @media (max-width: 640px) {
            .wisdom-home-editorial__inner,
            .wisdom-home-editorial__section.is-reverse
              .wisdom-home-editorial__inner {
              width: min(100% - 28px, 620px);
              padding: 58px 0 68px;
              gap: 25px;
            }

            .wisdom-home-editorial__visual {
              min-height: 285px;
            }

            .wisdom-home-editorial__image {
              max-height: 360px;
            }

            .wisdom-home-editorial__image.is-tall {
              width: min(100%, 390px);
              max-height: 430px;
            }

            .wisdom-home-editorial__title {
              font-size: clamp(2rem, 9.2vw, 2.75rem);
            }

            .wisdom-home-editorial__body {
              margin-top: 18px;
              font-size: 0.96rem;
              line-height: 1.68;
            }

            .wisdom-home-editorial__statement {
              padding: 68px 18px;
            }

            .wisdom-home-editorial__final {
              padding: 68px 18px 76px;
            }

            .wisdom-home-editorial__actions {
              display: grid;
              grid-template-columns: 1fr;
              width: min(100%, 380px);
              margin-left: auto;
              margin-right: auto;
            }

            .wisdom-home-editorial__primary,
            .wisdom-home-editorial__secondary {
              width: 100%;
            }
          }

          @media (prefers-reduced-motion: reduce) {
            .wisdom-home-editorial-reveal {
              opacity: 1 !important;
              transform: none !important;
              transition: none !important;
            }
          }
        `}</style>

        <section className="wisdom-home-editorial__section">
          <div className="wisdom-home-editorial__inner wisdom-home-editorial-reveal">
            <div className="wisdom-home-editorial__visual">
              <img
                src={homepageFitTable}
                alt="Light wood dining table shown as a custom furniture example"
                className="wisdom-home-editorial__image is-wide"
              />
              <div
                className="wisdom-home-editorial__control is-dimensions"
                aria-hidden="true"
              >
                <span className="wisdom-home-editorial__dimension">
                  <b>W</b>
                  <span>Width</span>
                </span>
                <span className="wisdom-home-editorial__dimension">
                  <b>H</b>
                  <span>Height</span>
                </span>
                <span className="wisdom-home-editorial__dimension">
                  <b>D</b>
                  <span>Depth</span>
                </span>
              </div>
            </div>

            <div className="wisdom-home-editorial__copy">
              <p className="wisdom-home-editorial__eyebrow">
                Custom dimensions
              </p>
              <h2 className="wisdom-home-editorial__title">
                Made to fit the space you have.
              </h2>
              <p className="wisdom-home-editorial__body">
                Adjust the width, height, and depth around your room before
                moving forward with a custom furniture design.
              </p>
              <p className="wisdom-home-editorial__detail">
                Width / Height / Depth
              </p>
            </div>
          </div>
        </section>

        <section className="wisdom-home-editorial__section is-reverse">
          <div className="wisdom-home-editorial__inner wisdom-home-editorial-reveal">
            <div className="wisdom-home-editorial__visual">
              <img
                src={homepageStorageWardrobe}
                alt="Wide custom wardrobe with shelves drawers and hanging sections"
                className="wisdom-home-editorial__image is-wide"
              />
              <div
                className="wisdom-home-editorial__control is-storage"
                aria-hidden="true"
              >
                <span className="wisdom-home-editorial__storage-option">
                  Shelves
                </span>
                <span className="wisdom-home-editorial__storage-option is-active">
                  Drawers
                </span>
                <span className="wisdom-home-editorial__storage-option">
                  Hanging
                </span>
              </div>
            </div>

            <div className="wisdom-home-editorial__copy">
              <p className="wisdom-home-editorial__eyebrow">
                Flexible storage
              </p>
              <h2 className="wisdom-home-editorial__title">
                Storage designed around what you need.
              </h2>
              <p className="wisdom-home-editorial__body">
                Plan shelves, drawers, hanging space, and compartments around
                what the furniture needs to hold and how you want to use it.
              </p>
              <p className="wisdom-home-editorial__detail">
                Shelves / Drawers / Compartments
              </p>
            </div>
          </div>
        </section>

        <section className="wisdom-home-editorial__section">
          <div className="wisdom-home-editorial__inner wisdom-home-editorial-reveal">
            <div className="wisdom-home-editorial__visual">
              {/* WISDOM HOMEPAGE WOOD FINISH ALIGNMENT FIX V6.4.5.2 */}
              <div
                className={`wisdom-home-editorial__finish-stage is-${activeHomeFinish.key}`}
              >
                <img
                  key={activeHomeFinish.key}
                  src={activeHomeFinish.image}
                  alt={`${activeHomeFinish.label} cabinet finish preview`}
                  className="wisdom-home-editorial__image is-tall is-finish-preview"
                />
              </div>
              <div
                className="wisdom-home-editorial__control is-finish"
                role="group"
                aria-label="Preview cabinet wood finish"
              >
                {HOME_FINISH_OPTIONS.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    className={`wisdom-home-editorial__swatch${
                      option.key === homeFinishKey ? " is-active" : ""
                    }${option.isDark ? " is-dark" : ""}`}
                    style={{ "--swatch": option.swatch }}
                    onClick={() => setHomeFinishKey(option.key)}
                    aria-label={`Preview ${option.label} finish`}
                    aria-pressed={option.key === homeFinishKey}
                    title={option.label}
                  />
                ))}
              </div>
            </div>

            <div className="wisdom-home-editorial__copy">
              <p className="wisdom-home-editorial__eyebrow">
                Wood finish
              </p>
              <h2 className="wisdom-home-editorial__title">
                Find the finish that feels right.
              </h2>
              <p className="wisdom-home-editorial__body">
                Compare the look of wood tones and color choices while the
                furniture is still being planned, so the final design feels
                right in your space.
              </p>
            </div>
          </div>
        </section>

        <section className="wisdom-home-editorial__section is-reverse">
          <div className="wisdom-home-editorial__inner wisdom-home-editorial-reveal">
            <div className="wisdom-home-editorial__visual">
              <HomepageFurniture3DReview />
            </div>

            <div className="wisdom-home-editorial__copy">
              <p className="wisdom-home-editorial__eyebrow">
                3D review
              </p>
              <h2 className="wisdom-home-editorial__title">
                See the design before it is built.
              </h2>
              <p className="wisdom-home-editorial__body">
                Review the furniture in 3D from different angles before
                submitting the design for quotation.
              </p>
              <p className="wisdom-home-editorial__detail">
                Review first. Decide with more confidence.
              </p>
            </div>
          </div>
        </section>

        <section className="wisdom-home-editorial__statement">
          <div className="wisdom-home-editorial__statement-inner wisdom-home-editorial-reveal">
            <h2>Designed digitally. Built for real spaces.</h2>
            <p>
              WISDOM connects furniture customization with the actual Spiral
              Wood workflow, giving the approved dimensions, layout, and
              finish a clearer reference before production.
            </p>
          </div>
        </section>


        <section
          id="shop-by-category"
          className="wisdom-home-shop"
          aria-labelledby="wisdom-home-shop-title"
        >
          <div className="wisdom-home-shop__inner">
            <div className="wisdom-home-shop__head wisdom-home-editorial-reveal">
              <p className="wisdom-home-shop__eyebrow">Ready made furniture</p>
              <h2
                id="wisdom-home-shop-title"
                className="wisdom-home-shop__title"
              >
                Shop by category.
              </h2>
              <p className="wisdom-home-shop__copy">
                Choose a furniture category, then browse the available
                ready made pieces from Spiral Wood.
              </p>
            </div>

            <div className="wisdom-home-shop__grid wisdom-home-editorial-reveal">
              {HOME_READY_MADE_CATEGORIES.map((card) => (
                <button
                  key={card.label}
                  type="button"
                  className="wisdom-home-shop__card"
                  onClick={() => handleHomeCategoryClick(card)}
                >
                  <span className="wisdom-home-shop__card-image">
                    <img src={card.img} alt="" aria-hidden="true" />
                  </span>
                  <span className="wisdom-home-shop__card-label">
                    {card.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="wisdom-home-editorial__final">
          <div className="wisdom-home-editorial__final-inner wisdom-home-editorial-reveal">
            <h2>Choose how you want to furnish your space.</h2>
            <p>
              Start with a customizable design or browse ready made furniture
              from Spiral Wood.
            </p>

            <div className="wisdom-home-editorial__actions">
              <button
                type="button"
                className="wisdom-home-editorial__primary"
                onClick={() => navigate("/customize")}
              >
                Customize a Design
              </button>

              <button
                type="button"
                className="wisdom-home-editorial__secondary"
                onClick={handleBrowseReadyMade}
              >
                Shop Ready Made
              </button>
            </div>
          </div>
        </section>
      </div>

      <button
        type="button"
        className="wisdom-home-back-to-top"
        onClick={handleBackToTop}
        aria-label="Back to top"
      >
        <span
          className="wisdom-home-back-to-top__arrow"
          aria-hidden="true"
        />
        <span>Top</span>
      </button>
    </div>
  );
}
