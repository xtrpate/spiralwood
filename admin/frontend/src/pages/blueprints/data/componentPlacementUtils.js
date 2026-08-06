import { snap } from "./utils";

const BASE_MARGIN = 120;
const GAP_X = 180;
const GAP_Z = 240;

export function getPlacedGenericComponentData({
  typeDef,
  placed,
  worldWidth,
  worldHeight,
  worldDepth,
  floorOffset,
}) {
  const startX = snap(worldWidth * 0.36);
  const startZ = snap(worldDepth * 0.28);
  const floorY = worldHeight - floorOffset;

  const generic = placed.filter((component) => !component.groupType);

  const layoutPlaced = (() => {
    let cursorX = startX;
    let cursorZ = startZ;
    let rowDepth = 0;
    const rows = [];

    generic.forEach((component) => {
      if (cursorX + component.width > worldWidth - BASE_MARGIN) {
        cursorX = startX;
        cursorZ += rowDepth + GAP_Z;
        rowDepth = 0;
      }

      rows.push({ x: cursorX, z: cursorZ, component });
      cursorX += component.width + GAP_X;
      rowDepth = Math.max(rowDepth, component.depth);
    });

    return { rows, cursorX, cursorZ, rowDepth };
  })();

  let x = layoutPlaced.cursorX;
  let z = layoutPlaced.cursorZ;

  if (x + typeDef.w > worldWidth - BASE_MARGIN) {
    x = startX;
    z += layoutPlaced.rowDepth + GAP_Z;
  }

  const cabinetish = generic.filter((component) =>
    [
      "base_cabinet",
      "upper_cabinet",
      "kitchen_cabinet",
      "tv_stand",
      "sideboard",
      "wardrobe",
      "bookshelf",
      "bookcase",
      "dresser",
      "nightstand",
    ].includes(component.type),
  );
  const lastCabinetish = cabinetish[cabinetish.length - 1];

  switch (typeDef.type) {
    case "upper_cabinet":
      return {
        x,
        y: floorY - typeDef.h - 900,
        z,
        width: typeDef.w,
        height: typeDef.h,
        depth: typeDef.d,
        rotationY: 0,
      };

    case "countertop": {
      const host = generic
        .filter((component) =>
          [
            "base_cabinet",
            "kitchen_cabinet",
            "sideboard",
            "tv_stand",
          ].includes(component.type),
        )
        .slice(-1)[0];

      if (host) {
        return {
          x: host.x,
          y: host.y - typeDef.h,
          z: host.z,
          width: Math.max(typeDef.w, host.width),
          height: typeDef.h,
          depth: Math.max(typeDef.d, host.depth),
          rotationY: 0,
        };
      }

      return {
        x,
        y: floorY - typeDef.h - 900,
        z,
        width: typeDef.w,
        height: typeDef.h,
        depth: typeDef.d,
        rotationY: 0,
      };
    }

    case "door_single":
    case "door_double":
    case "shelf":
    case "hardware": {
      const host = lastCabinetish;

      if (host) {
        return {
          x:
            host.x +
            snap(
              Math.max(
                0,
                (host.width - Math.min(typeDef.w, host.width)) / 2,
              ),
            ),
          y:
            typeDef.type === "shelf"
              ? host.y + snap(Math.max(40, host.height * 0.3))
              : host.y +
                snap(
                  Math.max(
                    0,
                    (host.height - Math.min(typeDef.h, host.height)) / 2,
                  ),
                ),
          z:
            typeDef.type === "shelf"
              ? host.z + 20
              : host.z + Math.max(0, host.depth - typeDef.d),
          width:
            typeDef.type === "hardware"
              ? typeDef.w
              : Math.min(typeDef.w, Math.max(typeDef.w, host.width)),
          height:
            typeDef.type === "hardware"
              ? typeDef.h
              : Math.min(typeDef.h, host.height),
          depth:
            typeDef.type === "shelf"
              ? Math.min(typeDef.d, host.depth - 20)
              : typeDef.d,
          rotationY: host.rotationY || 0,
        };
      }

      return {
        x,
        y: floorY - typeDef.h,
        z,
        width: typeDef.w,
        height: typeDef.h,
        depth: typeDef.d,
        rotationY: 0,
      };
    }

    default:
      return {
        x,
        y: floorY - typeDef.h,
        z,
        width: typeDef.w,
        height: typeDef.h,
        depth: typeDef.d,
        rotationY: 0,
      };
  }
}
