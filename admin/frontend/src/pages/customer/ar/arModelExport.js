/* WISDOM ROOMLE-STYLE AR V1.0.16 - double-sided AR export hardening */
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter";
import { USDZExporter } from "three/examples/jsm/exporters/USDZExporter";

import { createFurnitureObject } from "../../blueprints/3d/createFurnitureObjects";

const WORLD_W = 6400;
const WORLD_H = 3200;
const WORLD_D = 5200;
const MM_TO_METERS = 0.001;
const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

const toNum = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const isHexColor = (value) =>
  HEX_COLOR_RE.test(String(value || "").trim());

const getSolidColorHex = (component = {}) => {
  const candidates = [
    component?.fill,
    component?.color,
    component?.finish_color,
  ];

  for (const value of candidates) {
    const text = String(value || "").trim();
    if (isHexColor(text)) return text;
  }

  return "";
};

const normalizeComponent = (component = {}) => {
  const finish = String(
    component?.finish ??
      component?.finish_id ??
      component?.woodFinish ??
      "",
  ).trim();

  const fill = String(
    component?.fill ??
      component?.color ??
      component?.finish_color ??
      "",
  ).trim();

  return {
    ...component,
    id:
      component?.id ??
      `ar_${Math.random().toString(36).slice(2, 10)}`,
    x: toNum(component?.x, 0),
    y: toNum(component?.y, 0),
    z: toNum(component?.z, 0),
    width: Math.max(
      1,
      toNum(component?.width ?? component?.width_mm, 1),
    ),
    height: Math.max(
      1,
      toNum(component?.height ?? component?.height_mm, 1),
    ),
    depth: Math.max(
      1,
      toNum(component?.depth ?? component?.depth_mm, 1),
    ),
    rotationX: toNum(component?.rotationX, 0),
    rotationY: toNum(component?.rotationY, 0),
    rotationZ: toNum(component?.rotationZ, 0),
    fill: fill || "#d9c2a5",
    color: String(component?.color ?? fill ?? "").trim(),
    finish,
    finish_id: String(component?.finish_id ?? finish).trim(),
    woodFinish: String(component?.woodFinish ?? finish).trim(),
    finish_color: String(
      component?.finish_color ?? component?.color ?? fill ?? "",
    ).trim(),
    color_mode: String(component?.color_mode || "").trim(),
    material:
      String(
        component?.material ??
          component?.wood_type ??
          "Marine Plywood",
      ).trim() || "Marine Plywood",
  };
};

const applySolidColorOverride = (object3d, hex) => {
  if (!object3d || !isHexColor(hex)) return;

  object3d.traverse((child) => {
    if (!child?.isMesh || !child.material) return;

    const patch = (material) => {
      if (!material) return material;

      const cloned = material.clone();
      cloned.map = null;
      cloned.normalMap = null;
      cloned.roughnessMap = null;
      cloned.metalnessMap = null;

      if (cloned.color) {
        cloned.color = new THREE.Color(hex);
      }

      cloned.side = THREE.DoubleSide;
      cloned.shadowSide = THREE.DoubleSide;
      cloned.needsUpdate = true;
      return cloned;
    };

    child.material = Array.isArray(child.material)
      ? child.material.map(patch)
      : patch(child.material);
  });
};

const removePreviewOnlyObjects = (object3d) => {
  const removals = [];

  object3d.traverse((child) => {
    if (child === object3d) return;

    if (
      child.isLine ||
      child.isLineSegments ||
      child.isPoints ||
      child.isSprite ||
      child.isCamera ||
      child.isLight
    ) {
      removals.push(child);
    }
  });

  removals.forEach((child) => {
    child.parent?.remove(child);
  });
};

const hardenArMeshGeometry = (object3d) => {
  object3d.traverse((child) => {
    if (!child?.isMesh || !child.geometry) return;

    const geometry = child.geometry.clone();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    if (geometry.attributes?.normal) {
      geometry.deleteAttribute("normal");
    }

    geometry.computeVertexNormals();
    child.geometry = geometry;
  });
};

const bakeCoreGltfEmissive = (material) => {
  const rawIntensity = Number(material?.emissiveIntensity);
  const intensity = Number.isFinite(rawIntensity)
    ? Math.max(0, rawIntensity)
    : 1;

  if (material?.emissive?.isColor) {
    material.emissive.r = Math.min(
      1,
      Math.max(0, material.emissive.r * intensity),
    );
    material.emissive.g = Math.min(
      1,
      Math.max(0, material.emissive.g * intensity),
    );
    material.emissive.b = Math.min(
      1,
      Math.max(0, material.emissive.b * intensity),
    );
  }

  // Three.js r165 GLTFExporter emits KHR_materials_emissive_strength
  // whenever MeshStandardMaterial.emissiveIntensity !== exactly 1.0.
  // Scene Viewer supports core glTF emissiveFactor but not that extension,
  // so bake the intensity into emissive color and force the scalar to 1.
  material.emissiveIntensity = 1;

  return material;
};

const normalizeUnsupportedMaterials = (object3d) => {
  object3d.traverse((child) => {
    if (!child?.isMesh || !child.material) return;

    const normalize = (material) => {
      if (!material) {
        return material;
      }

      if (
        material.isMeshStandardMaterial &&
        !material.isMeshPhysicalMaterial
      ) {
        const cloned = material.clone();
        cloned.side = THREE.DoubleSide;
        cloned.shadowSide = THREE.DoubleSide;
        return bakeCoreGltfEmissive(cloned);
      }

      const standard = new THREE.MeshStandardMaterial({
        color: material.color?.clone?.() || new THREE.Color("#d9c2a5"),
        map: material.map || null,
        normalMap: material.normalMap || null,
        roughnessMap: material.roughnessMap || null,
        metalnessMap: material.metalnessMap || null,
        aoMap: material.aoMap || null,
        emissive:
          material.emissive?.clone?.() || new THREE.Color("#000000"),
        emissiveMap: material.emissiveMap || null,
        emissiveIntensity: Number.isFinite(Number(material.emissiveIntensity))
          ? Math.max(0, Number(material.emissiveIntensity))
          : 1,
        roughness: Number.isFinite(Number(material.roughness))
          ? Number(material.roughness)
          : 0.7,
        metalness: Number.isFinite(Number(material.metalness))
          ? Number(material.metalness)
          : 0,
        transparent: Boolean(material.transparent),
        opacity: Number.isFinite(Number(material.opacity))
          ? Number(material.opacity)
          : 1,
        alphaTest: Number(material.alphaTest || 0),
        side: THREE.DoubleSide,
      });

      standard.shadowSide = THREE.DoubleSide;

      standard.name = material.name || "";
      return bakeCoreGltfEmissive(standard);
    };

    child.material = Array.isArray(child.material)
      ? child.material.map(normalize)
      : normalize(child.material);

    child.castShadow = false;
    child.receiveShadow = false;
  });
};

const readTargetDimensions = (source = {}) => {
  const read = (key) => {
    const number = Number(source?.[key]);
    return Number.isFinite(number) && number > 0 ? number : 0;
  };

  const target = {
    width_mm: read("width_mm"),
    height_mm: read("height_mm"),
    depth_mm: read("depth_mm"),
  };

  if (!target.width_mm || !target.height_mm || !target.depth_mm) {
    throw new Error("The configured furniture size is unavailable.");
  }

  return target;
};

const getBoxSize = (object3d) => {
  object3d.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(object3d);

  if (box.isEmpty()) {
    throw new Error("The furniture has no exportable 3D geometry.");
  }

  const size = new THREE.Vector3();
  box.getSize(size);

  return { box, size };
};

const scaleAssemblyToConfiguredBounds = (assembly, target) => {
  const initial = getBoxSize(assembly);

  const scaleX = target.width_mm / initial.size.x;
  const scaleY = target.height_mm / initial.size.y;
  const scaleZ = target.depth_mm / initial.size.z;

  if (
    ![scaleX, scaleY, scaleZ].every(
      (value) =>
        Number.isFinite(value) &&
        value > 0.01 &&
        value < 100,
    )
  ) {
    throw new Error("The furniture scale could not be normalized for AR.");
  }

  assembly.scale.set(scaleX, scaleY, scaleZ);
  assembly.updateMatrixWorld(true);

  const scaled = getBoxSize(assembly);
  const center = new THREE.Vector3();
  scaled.box.getCenter(center);

  assembly.position.x -= center.x;
  assembly.position.y -= scaled.box.min.y;
  assembly.position.z -= center.z;
  assembly.updateMatrixWorld(true);
};

const assertFinalRealWorldSize = (scene, target) => {
  const { size } = getBoxSize(scene);

  const expected = {
    x: target.width_mm * MM_TO_METERS,
    y: target.height_mm * MM_TO_METERS,
    z: target.depth_mm * MM_TO_METERS,
  };

  const actual = {
    x: size.x,
    y: size.y,
    z: size.z,
  };

  const withinTolerance = (axis) => {
    const tolerance = Math.max(0.002, expected[axis] * 0.005);
    return Math.abs(actual[axis] - expected[axis]) <= tolerance;
  };

  if (
    !withinTolerance("x") ||
    !withinTolerance("y") ||
    !withinTolerance("z")
  ) {
    throw new Error(
      "The AR model did not preserve the configured real-world size.",
    );
  }
};

const bakeGroundedStaticScene = (sourceScene) => {
  sourceScene.updateMatrixWorld(true);

  const bakedRoot = new THREE.Group();
  bakedRoot.name = "WISDOM_Grounded_Export_Root";

  sourceScene.traverseVisible((object) => {
    if (!object?.isMesh || !object.geometry || !object.material) {
      return;
    }

    const geometry = object.geometry.clone();
    geometry.applyMatrix4(object.matrixWorld);
    geometry.computeBoundingBox();

    const material = Array.isArray(object.material)
      ? object.material.map((item) => {
          if (!item?.clone) return item;
          const cloned = item.clone();
          cloned.side = THREE.DoubleSide;
          cloned.shadowSide = THREE.DoubleSide;
          cloned.needsUpdate = true;
          return cloned;
        })
      : (() => {
          const cloned = object.material.clone();
          cloned.side = THREE.DoubleSide;
          cloned.shadowSide = THREE.DoubleSide;
          cloned.needsUpdate = true;
          return cloned;
        })();

    geometry.computeVertexNormals();

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = object.name || "WISDOM_Furniture_Part";
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.matrixAutoUpdate = true;

    bakedRoot.add(mesh);
  });

  if (!bakedRoot.children.length) {
    throw new Error("The furniture has no static geometry for AR.");
  }

  bakedRoot.updateMatrixWorld(true);

  const initialBox = new THREE.Box3().setFromObject(bakedRoot);

  if (initialBox.isEmpty()) {
    throw new Error("The furniture AR bounds could not be calculated.");
  }

  const center = new THREE.Vector3();
  initialBox.getCenter(center);

  // Scene Viewer anchors the model at its local origin. Bake the correction
  // into the vertices themselves so the exported root remains identity:
  // X/Z = horizontal center of the furniture, Y = exact bottom of the feet.
  const correction = new THREE.Matrix4().makeTranslation(
    -center.x,
    -initialBox.min.y,
    -center.z,
  );

  bakedRoot.children.forEach((mesh) => {
    mesh.geometry.applyMatrix4(correction);
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();
  });

  bakedRoot.position.set(0, 0, 0);
  bakedRoot.rotation.set(0, 0, 0);
  bakedRoot.scale.set(1, 1, 1);
  bakedRoot.updateMatrixWorld(true);

  const groundedBox = new THREE.Box3().setFromObject(bakedRoot);
  const groundedCenter = new THREE.Vector3();
  groundedBox.getCenter(groundedCenter);

  const floorTolerance = 0.0005;
  const centerTolerance = 0.0005;

  if (
    Math.abs(groundedBox.min.y) > floorTolerance ||
    Math.abs(groundedCenter.x) > centerTolerance ||
    Math.abs(groundedCenter.z) > centerTolerance
  ) {
    throw new Error(
      "The AR model could not be grounded at its base origin.",
    );
  }

  const groundedScene = new THREE.Scene();
  groundedScene.name = "WISDOM_AR_GROUNDED";
  groundedScene.add(bakedRoot);
  groundedScene.updateMatrixWorld(true);

  return groundedScene;
};

const buildARScene = (components, dimensionsMm) => {
  const target = readTargetDimensions(dimensionsMm);
  const safeComponents = (Array.isArray(components) ? components : [])
    .map(normalizeComponent)
    .filter(
      (component) =>
        component.width > 0 &&
        component.height > 0 &&
        component.depth > 0,
    );

  if (!safeComponents.length) {
    throw new Error("No furniture parts are available for AR.");
  }

  const assembly = new THREE.Group();
  assembly.name = "WISDOM_Furniture_Assembly";

  const dummySelectable = [];

  safeComponents.forEach((component) => {
    const object = createFurnitureObject(
      component,
      false,
      false,
      dummySelectable,
    );

    if (!object) return;

    removePreviewOnlyObjects(object);
    normalizeUnsupportedMaterials(object);

    const solidHex = getSolidColorHex(component);

    if (
      solidHex &&
      (component.color_mode === "solid" ||
        (!component.finish &&
          !component.finish_id &&
          !component.woodFinish))
    ) {
      applySolidColorOverride(object, solidHex);
    }

    hardenArMeshGeometry(object);

    object.position.set(
      component.x + component.width / 2 - WORLD_W / 2,
      WORLD_H / 2 - (component.y + component.height / 2),
      component.z + component.depth / 2 - WORLD_D / 2,
    );

    object.rotation.set(
      THREE.MathUtils.degToRad(component.rotationX || 0),
      THREE.MathUtils.degToRad(component.rotationY || 0),
      THREE.MathUtils.degToRad(component.rotationZ || 0),
    );

    assembly.add(object);
  });

  if (!assembly.children.length) {
    throw new Error("The furniture could not be rebuilt for AR.");
  }

  scaleAssemblyToConfiguredBounds(assembly, target);

  const meterRoot = new THREE.Group();
  meterRoot.name = "WISDOM_Real_World_Meters";
  meterRoot.scale.setScalar(MM_TO_METERS);
  meterRoot.add(assembly);

  const scene = new THREE.Scene();
  scene.name = "WISDOM_AR";
  scene.add(meterRoot);
  scene.updateMatrixWorld(true);

  assertFinalRealWorldSize(scene, target);

  const groundedScene = bakeGroundedStaticScene(scene);
  assertFinalRealWorldSize(groundedScene, target);

  // The exported scene now has an identity root at the exact center of the
  // furniture base, with the lowest furniture geometry at Y=0.
  return { scene: groundedScene, dimensionsMm: target };
};

const validateGlb = (arrayBuffer) => {
  if (!(arrayBuffer instanceof ArrayBuffer) || arrayBuffer.byteLength < 12) {
    return false;
  }

  const bytes = new Uint8Array(arrayBuffer);

  return (
    bytes[0] === 0x67 &&
    bytes[1] === 0x6c &&
    bytes[2] === 0x54 &&
    bytes[3] === 0x46 &&
    new DataView(arrayBuffer).getUint32(4, true) === 2
  );
};

const parseGlbJson = (arrayBuffer) => {
  if (!validateGlb(arrayBuffer)) {
    throw new Error("Android AR model export failed.");
  }

  const view = new DataView(arrayBuffer);
  const jsonChunkLength = view.getUint32(12, true);
  const jsonChunkType = view.getUint32(16, true);

  // glTF JSON chunk type: ASCII "JSON" = 0x4E4F534A.
  if (
    jsonChunkType !== 0x4e4f534a ||
    jsonChunkLength <= 0 ||
    20 + jsonChunkLength > arrayBuffer.byteLength
  ) {
    throw new Error("Android AR model JSON is invalid.");
  }

  const jsonBytes = new Uint8Array(
    arrayBuffer,
    20,
    jsonChunkLength,
  );

  const jsonText = new TextDecoder()
    .decode(jsonBytes)
    .replace(/\u0000+$/g, "")
    .trim();

  return JSON.parse(jsonText);
};

const assertGroundedGlbOutput = (arrayBuffer) => {
  const gltf = parseGlbJson(arrayBuffer);
  const nodes = Array.isArray(gltf?.nodes) ? gltf.nodes : [];
  const meshes = Array.isArray(gltf?.meshes) ? gltf.meshes : [];
  const accessors = Array.isArray(gltf?.accessors) ? gltf.accessors : [];

  const nearly = (value, target = 0, tolerance = 0.000001) =>
    Math.abs(Number(value) - target) <= tolerance;

  const assertIdentityMeshNode = (node) => {
    if (Array.isArray(node?.matrix)) {
      const identity = [
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1,
      ];

      if (
        node.matrix.length !== 16 ||
        node.matrix.some(
          (value, index) => !nearly(value, identity[index]),
        )
      ) {
        throw new Error(
          "Android AR model contains a transformed mesh after grounding.",
        );
      }
    }

    if (
      Array.isArray(node?.translation) &&
      node.translation.some((value) => !nearly(value))
    ) {
      throw new Error(
        "Android AR model contains a translated mesh after grounding.",
      );
    }

    if (
      Array.isArray(node?.scale) &&
      node.scale.some((value) => !nearly(value, 1))
    ) {
      throw new Error(
        "Android AR model contains a scaled mesh after grounding.",
      );
    }

    if (Array.isArray(node?.rotation)) {
      const rotation = node.rotation;
      const identityRotation =
        rotation.length === 4 &&
        nearly(rotation[0]) &&
        nearly(rotation[1]) &&
        nearly(rotation[2]) &&
        nearly(rotation[3], 1);

      if (!identityRotation) {
        throw new Error(
          "Android AR model contains a rotated mesh after grounding.",
        );
      }
    }
  };

  const bounds = {
    minX: Infinity,
    minY: Infinity,
    minZ: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
    maxZ: -Infinity,
  };

  let positionAccessorCount = 0;

  nodes.forEach((node) => {
    if (!Number.isInteger(node?.mesh)) return;

    assertIdentityMeshNode(node);

    const mesh = meshes[node.mesh];
    const primitives = Array.isArray(mesh?.primitives)
      ? mesh.primitives
      : [];

    primitives.forEach((primitive) => {
      const accessorIndex = primitive?.attributes?.POSITION;
      if (!Number.isInteger(accessorIndex)) return;

      const accessor = accessors[accessorIndex];
      const min = accessor?.min;
      const max = accessor?.max;

      if (
        !Array.isArray(min) ||
        min.length < 3 ||
        !Array.isArray(max) ||
        max.length < 3 ||
        ![...min.slice(0, 3), ...max.slice(0, 3)].every(
          (value) => Number.isFinite(Number(value)),
        )
      ) {
        throw new Error(
          "Android AR model is missing mesh bounds needed for floor validation.",
        );
      }

      positionAccessorCount += 1;
      bounds.minX = Math.min(bounds.minX, Number(min[0]));
      bounds.minY = Math.min(bounds.minY, Number(min[1]));
      bounds.minZ = Math.min(bounds.minZ, Number(min[2]));
      bounds.maxX = Math.max(bounds.maxX, Number(max[0]));
      bounds.maxY = Math.max(bounds.maxY, Number(max[1]));
      bounds.maxZ = Math.max(bounds.maxZ, Number(max[2]));
    });
  });

  if (!positionAccessorCount) {
    throw new Error(
      "Android AR model has no mesh bounds for floor validation.",
    );
  }

  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;
  const floorTolerance = 0.001;
  const centerTolerance = 0.001;

  if (Math.abs(bounds.minY) > floorTolerance) {
    throw new Error(
      "Android AR model base is not exported at floor level.",
    );
  }

  if (
    Math.abs(centerX) > centerTolerance ||
    Math.abs(centerZ) > centerTolerance
  ) {
    throw new Error(
      "Android AR model base is not centered on its placement origin.",
    );
  }
};

const assertSceneViewerCompatibility = (arrayBuffer) => {
  const gltf = parseGlbJson(arrayBuffer);

  const supportedExtensions = new Set([
    "KHR_materials_unlit",
    "KHR_texture_transform",
  ]);

  const unsupportedExtensions = [
    ...(Array.isArray(gltf?.extensionsUsed)
      ? gltf.extensionsUsed
      : []),
    ...(Array.isArray(gltf?.extensionsRequired)
      ? gltf.extensionsRequired
      : []),
  ].filter((name, index, list) =>
    name &&
    list.indexOf(name) === index &&
    !supportedExtensions.has(name),
  );

  if (unsupportedExtensions.length) {
    throw new Error(
      `Android AR model uses unsupported Scene Viewer extensions: ${unsupportedExtensions.join(", ")}`,
    );
  }

  const meshes = Array.isArray(gltf?.meshes) ? gltf.meshes : [];

  for (const mesh of meshes) {
    const primitives = Array.isArray(mesh?.primitives)
      ? mesh.primitives
      : [];

    for (const primitive of primitives) {
      const attributes = primitive?.attributes || {};
      const attributeNames = Object.keys(attributes);

      if (attributeNames.includes("COLOR_0")) {
        throw new Error(
          "Android AR model contains vertex colors unsupported by Scene Viewer.",
        );
      }

      if (
        attributeNames.some((name) =>
          /^TEXCOORD_[1-9]\d*$/.test(name),
        )
      ) {
        throw new Error(
          "Android AR model contains more than one UV set per mesh.",
        );
      }

      if (
        Array.isArray(primitive?.targets) &&
        primitive.targets.length
      ) {
        throw new Error(
          "Android AR model contains morph targets unsupported by Scene Viewer.",
        );
      }

      const mode =
        primitive?.mode === undefined
          ? 4
          : Number(primitive.mode);

      if (![4, 5, 6].includes(mode)) {
        throw new Error(
          `Android AR model uses unsupported primitive mode: ${mode}`,
        );
      }
    }
  }
};

const toUsdzBytes = (value) => {
  if (value instanceof Uint8Array) {
    return value;
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }

  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(
      value.buffer,
      value.byteOffset,
      value.byteLength,
    );
  }

  return null;
};

const validateUsdz = (bytes) =>
  Boolean(
    bytes &&
      bytes.byteLength >= 4 &&
      bytes[0] === 0x50 &&
      bytes[1] === 0x4b &&
      [0x03, 0x05, 0x07].includes(bytes[2]) &&
      [0x04, 0x06, 0x08].includes(bytes[3]),
  );

const disposeScene = (scene) => {
  const materials = new Set();
  const textures = new Set();

  scene.traverse((object) => {
    object.geometry?.dispose?.();

    const list = Array.isArray(object.material)
      ? object.material
      : object.material
        ? [object.material]
        : [];

    list.forEach((material) => {
      if (!material) return;
      materials.add(material);

      [
        "map",
        "normalMap",
        "roughnessMap",
        "metalnessMap",
        "aoMap",
        "emissiveMap",
        "alphaMap",
      ].forEach((key) => {
        if (material[key]) textures.add(material[key]);
      });
    });
  });

  materials.forEach((material) => material.dispose?.());
  textures.forEach((texture) => texture.dispose?.());
};

export async function createARModelFiles(
  components,
  dimensionsMm,
) {
  const { scene, dimensionsMm: normalizedDimensions } =
    buildARScene(components, dimensionsMm);

  try {
    const gltfExporter = new GLTFExporter();
    const usdzExporter = new USDZExporter();

    const glbBuffer = await gltfExporter.parseAsync(scene, {
      binary: true,
      onlyVisible: true,
      maxTextureSize: 1024,
    });

    if (!validateGlb(glbBuffer)) {
      throw new Error("Android AR model export failed.");
    }

    assertSceneViewerCompatibility(glbBuffer);
    assertGroundedGlbOutput(glbBuffer);

    const usdzOutput = await usdzExporter.parseAsync(scene, {
      quickLookCompatible: true,
      includeAnchoringProperties: true,
      maxTextureSize: 1024,
      ar: {
        anchoring: { type: "plane" },
        planeAnchoring: { alignment: "horizontal" },
      },
    });

    const usdzBytes = toUsdzBytes(usdzOutput);

    if (!validateUsdz(usdzBytes)) {
      throw new Error("iPhone AR model export failed.");
    }

    return {
      glb: new File(
        [glbBuffer],
        "wisdom-furniture.glb",
        { type: "model/gltf-binary" },
      ),
      usdz: new File(
        [usdzBytes],
        "wisdom-furniture.usdz",
        { type: "model/vnd.usdz+zip" },
      ),
      dimensionsMm: normalizedDimensions,
    };
  } finally {
    disposeScene(scene);
  }
}
