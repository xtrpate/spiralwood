// 3d/proceduralMaterialFactory.js
// Procedural, dependency-free material surfaces for Blueprint 3D.
// Visual rendering only: never changes saved component geometry or business data.
import * as THREE from "three";

const TEXTURE_SIZE = 256;
const textureCache = new Map();

function hashString(value = "") {
  let hash = 2166136261;
  const text = String(value || "");
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function createRandom(seed = 1) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function getText(comp = {}) {
  return [
    comp.material,
    comp.wood_type,
    comp.finish,
    comp.finish_id,
    comp.woodFinish,
    comp.label,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function resolveSpecies(text = "") {
  if (text.includes("walnut")) return "walnut";
  if (text.includes("mahogany")) return "mahogany";
  if (text.includes("teak")) return "teak";
  if (text.includes("pine")) return "pine";
  if (text.includes("maple")) return "maple";
  if (text.includes("beech")) return "beech";
  if (text.includes("ash")) return "ash";
  if (text.includes("oak")) return "oak";
  return "wood";
}

function classifySurface(comp = {}, role = "front") {
  const text = getText(comp);
  const normalizedRole = String(role || "front").toLowerCase();

  if (
    normalizedRole === "metal" ||
    /metal|steel|aluminum|aluminium|chrome/.test(text)
  ) {
    if (
      normalizedRole === "metal" ||
      !/wood|plywood|laminate|veneer/.test(text)
    ) {
      return { kind: "metal", species: "metal" };
    }
  }

  if (
    normalizedRole === "fabric" ||
    normalizedRole === "mattress" ||
    /upholstery|fabric|cushion|leather|foam/.test(text)
  ) {
    if (normalizedRole !== "frame" && normalizedRole !== "carcass") {
      return { kind: "fabric", species: "fabric" };
    }
  }

  if (normalizedRole === "countertop") {
    return { kind: "solid-surface", species: "stone" };
  }

  if (/solid surface|quartz|granite|stone|marble/.test(text)) {
    return { kind: "solid-surface", species: "stone" };
  }

  const species = resolveSpecies(text);

  if (/laminated|laminate|melamine/.test(text)) {
    return { kind: "laminate", species };
  }

  if (/marine plywood|plywood/.test(text)) {
    return { kind: "plywood", species };
  }

  if (/mdf|particle|panel board|engineered/.test(text)) {
    return { kind: "engineered", species };
  }

  if (
    /veneer|solid wood|wood|oak|walnut|mahogany|teak|pine|maple|beech|ash/.test(
      text,
    )
  ) {
    return { kind: "wood", species };
  }

  if (normalizedRole === "metal") return { kind: "metal", species: "metal" };
  if (normalizedRole === "fabric" || normalizedRole === "mattress") {
    return { kind: "fabric", species: "fabric" };
  }

  return { kind: "neutral", species: "neutral" };
}

function getGrainDirection(comp = {}) {
  const raw = String(
    comp.grainDirection ?? comp.grain_direction ?? comp.grain ?? "",
  )
    .trim()
    .toLowerCase();

  return ["width", "height", "depth", "none"].includes(raw) ? raw : "width";
}

function getGrainRotation(direction = "width") {
  if (direction === "height") return Math.PI / 2;
  if (direction === "depth") return Math.PI / 4;
  return 0;
}

function drawWoodPattern(ctx, random, species, intensity = 1) {
  ctx.fillStyle = "rgb(238,238,238)";
  ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);

  const speciesStrength =
    {
      walnut: 1.35,
      mahogany: 1.2,
      teak: 1.08,
      pine: 0.78,
      maple: 0.62,
      beech: 0.72,
      ash: 0.9,
      oak: 1,
      wood: 0.88,
    }[species] || 0.88;

  const strength = speciesStrength * intensity;

  for (let band = 0; band < 54; band += 1) {
    const baseY = (band / 54) * TEXTURE_SIZE + (random() - 0.5) * 5;
    const alpha = 0.08 + random() * 0.15 * strength;
    const shade = 40 + Math.floor(random() * 50);
    ctx.strokeStyle = `rgba(${shade},${shade},${shade},${alpha})`;
    ctx.lineWidth = 0.45 + random() * 1.4;
    ctx.beginPath();

    for (let x = -8; x <= TEXTURE_SIZE + 8; x += 8) {
      const wave =
        Math.sin(x * 0.045 + band * 0.71) * (1.2 + random() * 1.8) +
        Math.sin(x * 0.013 + band) * 2.2;
      const y = baseY + wave;
      if (x === -8) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    ctx.stroke();
  }

  if (species === "pine") {
    for (let i = 0; i < 7; i += 1) {
      const x = random() * TEXTURE_SIZE;
      const y = random() * TEXTURE_SIZE;
      const rx = 4 + random() * 8;
      const ry = 1.5 + random() * 3.5;
      ctx.strokeStyle = `rgba(80,80,80,${0.05 + random() * 0.05})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  for (let i = 0; i < 650; i += 1) {
    const shade = 150 + Math.floor(random() * 90);
    ctx.fillStyle = `rgba(${shade},${shade},${shade},${0.015 + random() * 0.035})`;
    ctx.fillRect(
      random() * TEXTURE_SIZE,
      random() * TEXTURE_SIZE,
      0.5 + random() * 1.3,
      0.5 + random() * 1.3,
    );
  }
}

function drawPlywoodPattern(ctx, random, species) {
  drawWoodPattern(ctx, random, species, 0.7);
  for (let i = 0; i < 14; i += 1) {
    const y = random() * TEXTURE_SIZE;
    ctx.strokeStyle = `rgba(95,95,95,${0.018 + random() * 0.025})`;
    ctx.lineWidth = 0.6 + random() * 0.8;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(TEXTURE_SIZE, y + (random() - 0.5) * 2);
    ctx.stroke();
  }
}

function drawLaminatePattern(ctx, random, species) {
  drawWoodPattern(ctx, random, species, 0.38);
  const wash = ctx.createLinearGradient(0, 0, 0, TEXTURE_SIZE);
  wash.addColorStop(0, "rgba(255,255,255,0.05)");
  wash.addColorStop(0.5, "rgba(255,255,255,0.015)");
  wash.addColorStop(1, "rgba(210,210,210,0.035)");
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
}

function drawEngineeredPattern(ctx, random) {
  ctx.fillStyle = "rgb(236,236,236)";
  ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  for (let i = 0; i < 1800; i += 1) {
    const shade = 150 + Math.floor(random() * 95);
    const alpha = 0.018 + random() * 0.055;
    ctx.fillStyle = `rgba(${shade},${shade},${shade},${alpha})`;
    const size = 0.5 + random() * 1.6;
    ctx.fillRect(random() * TEXTURE_SIZE, random() * TEXTURE_SIZE, size, size);
  }
}

function drawFabricPattern(ctx, random) {
  ctx.fillStyle = "rgb(238,238,238)";
  ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  for (let x = 0; x < TEXTURE_SIZE; x += 4) {
    const shade = 150 + Math.floor(random() * 50);
    ctx.strokeStyle = `rgba(${shade},${shade},${shade},0.075)`;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, TEXTURE_SIZE);
    ctx.stroke();
  }
  for (let y = 0; y < TEXTURE_SIZE; y += 4) {
    const shade = 160 + Math.floor(random() * 45);
    ctx.strokeStyle = `rgba(${shade},${shade},${shade},0.065)`;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(TEXTURE_SIZE, y);
    ctx.stroke();
  }
}

function drawMetalPattern(ctx, random) {
  ctx.fillStyle = "rgb(232,232,232)";
  ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  for (let x = 0; x < TEXTURE_SIZE; x += 2) {
    const shade = 175 + Math.floor(random() * 70);
    ctx.strokeStyle = `rgba(${shade},${shade},${shade},${0.035 + random() * 0.04})`;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, TEXTURE_SIZE);
    ctx.stroke();
  }
}

function drawSolidSurfacePattern(ctx, random) {
  ctx.fillStyle = "rgb(242,242,242)";
  ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  for (let i = 0; i < 520; i += 1) {
    const shade = 145 + Math.floor(random() * 95);
    ctx.fillStyle = `rgba(${shade},${shade},${shade},${0.025 + random() * 0.045})`;
    const r = 0.35 + random() * 1.1;
    ctx.beginPath();
    ctx.arc(
      random() * TEXTURE_SIZE,
      random() * TEXTURE_SIZE,
      r,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
}

function createPatternCanvas(profile, key) {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_SIZE;
  canvas.height = TEXTURE_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const random = createRandom(hashString(key));

  switch (profile.kind) {
    case "wood":
      drawWoodPattern(ctx, random, profile.species, 1);
      break;
    case "plywood":
      drawPlywoodPattern(ctx, random, profile.species);
      break;
    case "laminate":
      drawLaminatePattern(ctx, random, profile.species);
      break;
    case "engineered":
      drawEngineeredPattern(ctx, random);
      break;
    case "fabric":
      drawFabricPattern(ctx, random);
      break;
    case "metal":
      drawMetalPattern(ctx, random);
      break;
    case "solid-surface":
      drawSolidSurfacePattern(ctx, random);
      break;
    default:
      return null;
  }

  return canvas;
}

function createTexturePair(profile, direction, role) {
  const key = `${profile.kind}|${profile.species}|${direction}|${role}`;
  if (textureCache.has(key)) return textureCache.get(key);

  const canvas = createPatternCanvas(profile, key);
  if (!canvas) {
    const empty = { map: null, bumpMap: null };
    textureCache.set(key, empty);
    return empty;
  }

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;

  // WISDOM WOOD TEXTURE SEAM FIX V1
  // The generated wood canvas does not have matching opposite edges.
  // Mirrored wrapping joins the same edge pixels together for wood-like
  // materials, removing the obvious rectangular cut-and-paste seams.
  const isWoodLike = ["wood", "plywood", "laminate"].includes(profile.kind);
  map.wrapS = isWoodLike
    ? THREE.MirroredRepeatWrapping
    : THREE.RepeatWrapping;
  map.wrapT = isWoodLike
    ? THREE.MirroredRepeatWrapping
    : THREE.RepeatWrapping;

  // Keep visible grain, but reduce how often the texture tile repeats.
  const repeatScale = isWoodLike ? 2.2 : 3.5;
  map.repeat.set(repeatScale, repeatScale);
  map.center.set(0.5, 0.5);
  map.rotation = getGrainRotation(direction);
  map.anisotropy = 4;
  map.needsUpdate = true;

  const bumpMap = map.clone();
  bumpMap.colorSpace = THREE.NoColorSpace;
  bumpMap.needsUpdate = true;

  const pair = { map, bumpMap };
  textureCache.set(key, pair);
  return pair;
}

function getSurfaceDefaults(profile, role) {
  const normalizedRole = String(role || "front").toLowerCase();
  const roleRoughness =
    normalizedRole === "inside"
      ? 0.72
      : normalizedRole === "carcass" || normalizedRole === "frame"
        ? 0.58
        : 0.46;

  switch (profile.kind) {
    case "wood":
      return {
        roughness: roleRoughness,
        metalness: 0.01,
        clearcoat: normalizedRole === "front" ? 0.2 : 0.08,
        clearcoatRoughness: 0.42,
        bumpScale: 0.28,
        reflectivity: 0.42,
      };
    case "plywood":
      return {
        roughness: Math.max(roleRoughness, 0.58),
        metalness: 0,
        clearcoat: normalizedRole === "front" ? 0.1 : 0.04,
        clearcoatRoughness: 0.56,
        bumpScale: 0.11,
        reflectivity: 0.34,
      };
    case "laminate":
      return {
        roughness: normalizedRole === "inside" ? 0.48 : 0.34,
        metalness: 0.01,
        clearcoat: 0.3,
        clearcoatRoughness: 0.28,
        bumpScale: 0.035,
        reflectivity: 0.54,
      };
    case "engineered":
      return {
        roughness: 0.68,
        metalness: 0,
        clearcoat: 0.04,
        clearcoatRoughness: 0.72,
        bumpScale: 0.07,
        reflectivity: 0.28,
      };
    case "fabric":
      return {
        roughness: 0.94,
        metalness: 0,
        clearcoat: 0,
        clearcoatRoughness: 1,
        bumpScale: 0.12,
        reflectivity: 0.18,
        sheen: 0.28,
        sheenRoughness: 0.86,
      };
    case "metal":
      return {
        roughness: 0.24,
        metalness: 0.9,
        clearcoat: 0.24,
        clearcoatRoughness: 0.2,
        bumpScale: 0.025,
        reflectivity: 0.68,
      };
    case "solid-surface":
      return {
        roughness: 0.28,
        metalness: 0.01,
        clearcoat: 0.36,
        clearcoatRoughness: 0.22,
        bumpScale: 0.018,
        reflectivity: 0.58,
      };
    default:
      return {
        roughness: roleRoughness,
        metalness: 0.02,
        clearcoat: 0.12,
        clearcoatRoughness: 0.48,
        bumpScale: 0,
        reflectivity: 0.4,
      };
  }
}

function createProceduralFurnitureMaterial(
  comp = {},
  color = "#d9c2a5",
  role = "front",
  overrides = {},
) {
  const profile = classifySurface(comp, role);
  const direction = ["wood", "plywood", "laminate"].includes(profile.kind)
    ? getGrainDirection(comp)
    : "none";
  const defaults = getSurfaceDefaults(profile, role);
  const textures = createTexturePair(profile, direction, role);

  const params = {
    color: new THREE.Color(color || "#d9c2a5"),
    roughness: defaults.roughness,
    metalness: defaults.metalness,
    clearcoat: defaults.clearcoat,
    clearcoatRoughness: defaults.clearcoatRoughness,
    reflectivity: defaults.reflectivity,
    transparent: false,
    opacity: 1,
    ...overrides,
  };

  if (textures.map) params.map = textures.map;
  if (textures.bumpMap && defaults.bumpScale > 0) {
    params.bumpMap = textures.bumpMap;
    params.bumpScale = defaults.bumpScale;
  }
  if (Number(defaults.sheen) > 0) {
    params.sheen = defaults.sheen;
    params.sheenRoughness = defaults.sheenRoughness;
    params.sheenColor = new THREE.Color(color || "#d9c2a5").lerp(
      new THREE.Color("#ffffff"),
      0.22,
    );
  }

  const material = new THREE.MeshPhysicalMaterial(params);
  material.userData.surfaceKind = profile.kind;
  material.userData.surfaceSpecies = profile.species;
  material.userData.grainDirection = direction;
  return material;
}

export { classifySurface, createProceduralFurnitureMaterial };
