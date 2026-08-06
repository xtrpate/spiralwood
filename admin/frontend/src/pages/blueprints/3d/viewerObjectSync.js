import * as THREE from "three";
import { clearObject3DChildren } from "./sceneSetup";

const OUTLINE_COLOR = 0x38bdf8;

function configureObjectFromComponent({ object, component, worldPosition }) {
  object.position.set(worldPosition.x, worldPosition.y, worldPosition.z);
  object.rotation.x = THREE.MathUtils.degToRad(component.rotationX || 0);
  object.rotation.y = THREE.MathUtils.degToRad(component.rotationY || 0);
  object.rotation.z = THREE.MathUtils.degToRad(component.rotationZ || 0);
  object.scale.set(1, 1, 1);
  object.userData.id = component.id;
  object.updateMatrixWorld(true);
}

export function rebuildViewerObjects({
  rootGroup,
  components,
  normalizeComponent,
  createFurnitureObject,
  worldFromComponent,
  selectedIds = [],
  selectedId = null,
  edit3DId = null,
}) {
  if (!rootGroup) {
    return {
      entryMap: new Map(),
      selectableMeshes: [],
    };
  }

  clearObject3DChildren(rootGroup);

  const entryMap = new Map();
  const selectableMeshes = [];
  const activeSelectedIds = new Set(selectedIds || []);

  (components || []).forEach((rawComponent) => {
    const component = normalizeComponent(rawComponent);
    const selected =
      selectedId === component.id || activeSelectedIds.has(component.id);
    const editing = edit3DId === component.id;

    const object = createFurnitureObject(
      component,
      selected,
      editing,
      selectableMeshes,
    );

    configureObjectFromComponent({
      object,
      component,
      worldPosition: worldFromComponent(component),
    });

    rootGroup.add(object);
    entryMap.set(component.id, { obj: object, comp: component });
  });

  return {
    entryMap,
    selectableMeshes,
  };
}

export function clearViewerSelectionOutlines(outlineGroup) {
  clearObject3DChildren(outlineGroup);
}

export function syncViewerSelectionOutlines({
  outlineGroup,
  entryMap,
  activeIds = [],
}) {
  if (!outlineGroup) return;

  clearViewerSelectionOutlines(outlineGroup);

  const uniqueActiveIds = new Set((activeIds || []).filter(Boolean));
  uniqueActiveIds.forEach((id) => {
    const entry = entryMap?.get?.(id);
    if (!entry?.obj) return;

    const helper = new THREE.BoxHelper(entry.obj, OUTLINE_COLOR);
    helper.material.depthTest = false;
    helper.material.transparent = true;
    helper.material.opacity = 0.55;
    helper.material.toneMapped = false;
    helper.renderOrder = 999;

    outlineGroup.add(helper);
    helper.updateMatrixWorld(true);
  });
}
