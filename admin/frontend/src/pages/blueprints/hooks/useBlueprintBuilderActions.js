import { useCallback } from "react";
import toast from "react-hot-toast";

import {
  applyWoodFinish,
  createAssemblyPart,
  getDefaultFinishId,
  getNextAssemblyOrigin,
  normalizeComponent,
} from "../data/componentUtils";
import { clamp, makeGroupId, snap } from "../data/utils";

export function useBlueprintBuilderActions({
  components,
  setComponents,
  editorMode,
  pushHistory,
  isLocked,
  setSelectedId,
  setSelectedIds,
  setEdit3DId,
  setTransformMode,
  view,
  getCabinetBuilderContext3D,
  worldHeight,
  floorOffset = 40,
  gridSize = 20,
}) {
  const GRID_SIZE = gridSize;
  const FLOOR_OFFSET = floorOffset;
  const WORLD_H = worldHeight;

  const buildCabinetBox3D = useCallback(
    (options = {}) => {
      if (editorMode !== "editable") {
        toast.error("Reference mode ito. Lumipat muna sa editable mode.");
        return;
      }

      if (view !== "3d") {
        toast.error("Sa 3D view lang puwede gamitin ang Cabinet Box Builder.");
        return;
      }

      const builderType = String(options.builderType || "").trim().toLowerCase();

      if (builderType === "base") {
        const cleanMm = (value, fallback, minimum = 1) => {
          const parsed = Number(value);
          const resolved = Number.isFinite(parsed) ? parsed : fallback;
          return Math.max(
            minimum,
            Number(Number(resolved).toFixed(3)),
          );
        };

        const outerWidth = cleanMm(options.width, 900, 300);
        const outerHeight = cleanMm(options.height, 900, 400);
        const outerDepth = cleanMm(options.depth, 600, 250);
        const thickness = cleanMm(options.thickness, 18, 1);
        const backThickness = cleanMm(options.backThickness, 6, 1);
        const toeKickHeight = Math.max(
          0,
          Number(Number(options.toeKickHeight ?? 100).toFixed(3)),
        );
        const requestedToeKickSetback = Math.max(
          0,
          Number(Number(options.toeKickSetback ?? 50).toFixed(3)),
        );
        const shelfCount = Math.max(
          0,
          Math.min(8, Math.round(Number(options.shelfCount) || 0)),
        );
        const dividerCount = Math.max(
          0,
          Math.min(4, Math.round(Number(options.dividerCount) || 0)),
        );

        if (thickness * 2 >= outerWidth) {
          toast.error(
            "Panel thickness is too large for the selected cabinet width.",
          );
          return;
        }

        if (backThickness >= outerDepth) {
          toast.error(
            "Back thickness must be smaller than the cabinet depth.",
          );
          return;
        }

        const availableCarcassHeight =
          outerHeight - toeKickHeight - thickness * 2;

        if (availableCarcassHeight < 100) {
          toast.error(
            "Cabinet height is too small for the panel thickness and toe-kick height.",
          );
          return;
        }

        const innerWidth = outerWidth - thickness * 2;
        const innerDepth = outerDepth - backThickness;
        const dividerSpace = dividerCount * thickness;
        const usableBayWidth = innerWidth - dividerSpace;

        if (usableBayWidth < (dividerCount + 1) * 80) {
          toast.error(
            "Cabinet width is too small for the selected divider count and panel thickness.",
          );
          return;
        }

        const maxToeKickSetback = Math.max(
          0,
          outerDepth - backThickness - thickness,
        );
        const toeKickSetback = Math.min(
          requestedToeKickSetback,
          maxToeKickSetback,
        );

        const origin = getNextAssemblyOrigin(components);
        const originX = snap(origin.x);
        const originZ = snap(origin.z);
        const floorY = WORLD_H - FLOOR_OFFSET;
        const topY = Number((floorY - outerHeight).toFixed(3));
        const bottomPanelY = Number(
          (floorY - toeKickHeight - thickness).toFixed(3),
        );
        const cavityTopY = Number((topY + thickness).toFixed(3));
        const cavityHeight = Number(
          (bottomPanelY - cavityTopY).toFixed(3),
        );

        const material = "Marine Plywood";
        const defaultFinish = getDefaultFinishId(material);
        const finishData = defaultFinish
          ? applyWoodFinish({ material }, defaultFinish)
          : { material, fill: "#d9c2a5", finish: "" };

        const usedNames = new Set(
          components
            .map((item) =>
              String(
                item?.groupLabel || item?.assemblyName || "",
              ).trim(),
            )
            .filter(Boolean),
        );

        let buildNumber = 1;
        while (usedNames.has(`Base Cabinet ${buildNumber}`)) {
          buildNumber += 1;
        }

        const groupId = makeGroupId();
        const groupLabel = `Base Cabinet ${buildNumber}`;

        const part = (overrides) =>
          createAssemblyPart({
            groupId,
            groupLabel,
            groupType: "assembly",
            assemblyType: "base_cabinet",
            material: finishData.material || material,
            finish: finishData.finish || "",
            fill: finishData.fill || "#d9c2a5",
            unitPrice: 0,
            groupUnitPrice: 0,
            qty: 1,
            locked: false,
            ...overrides,
          });

        const parts = [
          part({
            type: "wr_side_panel",
            partRole: "left_side_panel",
            label: "Left Side Panel",
            partCode: "CB-SIDE-L",
            x: originX,
            y: topY,
            z: originZ,
            width: thickness,
            height: outerHeight,
            depth: outerDepth,
          }),
          part({
            type: "wr_side_panel",
            partRole: "right_side_panel",
            label: "Right Side Panel",
            partCode: "CB-SIDE-R",
            x: Number((originX + outerWidth - thickness).toFixed(3)),
            y: topY,
            z: originZ,
            width: thickness,
            height: outerHeight,
            depth: outerDepth,
          }),
          part({
            type: "wr_top_panel",
            partRole: "top_panel",
            label: "Top Panel",
            partCode: "CB-TOP",
            x: Number((originX + thickness).toFixed(3)),
            y: topY,
            z: originZ,
            width: innerWidth,
            height: thickness,
            depth: outerDepth,
          }),
          part({
            type: "wr_bottom_panel",
            partRole: "bottom_panel",
            label: "Bottom Panel",
            partCode: "CB-BOT",
            x: Number((originX + thickness).toFixed(3)),
            y: bottomPanelY,
            z: originZ,
            width: innerWidth,
            height: thickness,
            depth: outerDepth,
          }),
          part({
            type: "wr_back_panel",
            partRole: "back_panel",
            label: "Back Panel",
            partCode: "CB-BACK",
            x: Number((originX + thickness).toFixed(3)),
            y: cavityTopY,
            z: originZ,
            width: innerWidth,
            height: cavityHeight,
            depth: backThickness,
            material: "Panel Board",
          }),
        ];

        if (toeKickHeight > 0) {
          parts.push(
            part({
              type: "cabinet_toe_kick",
              partRole: "toe_kick",
              label: "Toe Kick",
              partCode: "CB-TOE-KICK",
              x: Number((originX + thickness).toFixed(3)),
              y: Number((floorY - toeKickHeight).toFixed(3)),
              z: Number(
                (
                  originZ +
                  outerDepth -
                  toeKickSetback -
                  thickness
                ).toFixed(3),
              ),
              width: innerWidth,
              height: toeKickHeight,
              depth: thickness,
            }),
          );
        }

        const bayCount = dividerCount + 1;
        const bayWidth = Number(
          ((innerWidth - dividerSpace) / bayCount).toFixed(3),
        );

        for (
          let dividerIndex = 1;
          dividerIndex <= dividerCount;
          dividerIndex += 1
        ) {
          const dividerX = Number(
            (
              originX +
              thickness +
              bayWidth * dividerIndex +
              thickness * (dividerIndex - 1)
            ).toFixed(3),
          );

          parts.push(
            part({
              type: "wr_divider",
              partRole: "divider",
              label: `Divider ${dividerIndex}`,
              partCode: `CB-DIV${String(dividerIndex).padStart(2, "0")}`,
              x: dividerX,
              y: cavityTopY,
              z: Number((originZ + backThickness).toFixed(3)),
              width: thickness,
              height: cavityHeight,
              depth: innerDepth,
            }),
          );
        }

        if (shelfCount > 0) {
          const shelfTravel = Math.max(0, cavityHeight - thickness);

          for (let level = 1; level <= shelfCount; level += 1) {
            const shelfY = Number(
              (
                cavityTopY +
                (shelfTravel * level) / (shelfCount + 1)
              ).toFixed(3),
            );

            for (let bay = 0; bay < bayCount; bay += 1) {
              const shelfX = Number(
                (
                  originX +
                  thickness +
                  bay * (bayWidth + thickness)
                ).toFixed(3),
              );

              const baySuffix =
                bayCount > 1
                  ? `-B${String(bay + 1).padStart(2, "0")}`
                  : "";

              parts.push(
                part({
                  type: "wr_shelf",
                  partRole: "shelf",
                  label:
                    bayCount > 1
                      ? `Fixed Shelf ${level} Bay ${bay + 1}`
                      : `Fixed Shelf ${level}`,
                  partCode: `CB-SH${String(level).padStart(2, "0")}${baySuffix}`,
                  x: shelfX,
                  y: shelfY,
                  z: Number((originZ + backThickness).toFixed(3)),
                  width: bayWidth,
                  height: thickness,
                  depth: innerDepth,
                }),
              );
            }
          }
        }

        pushHistory(components);
        setComponents((prev) => [...prev, ...parts]);
        setSelectedIds(parts.map((item) => item.id));
        setSelectedId(parts[0]?.id || null);
        setEdit3DId(parts[0]?.id || null);
        setTransformMode("translate");

        toast.success(
          `${groupLabel} generated (${parts.length} part${parts.length !== 1 ? "s" : ""}).`,
        );
        return;
      }
      if (builderType === "wall") {
        const cleanMm = (value, fallback, minimum = 1) => {
          const parsed = Number(value);
          const resolved = Number.isFinite(parsed) ? parsed : fallback;
          return Math.max(
            minimum,
            Number(Number(resolved).toFixed(3)),
          );
        };

        const outerWidth = cleanMm(options.width, 900, 300);
        const outerHeight = cleanMm(options.height, 720, 300);
        const outerDepth = cleanMm(options.depth, 350, 200);
        const thickness = cleanMm(options.thickness, 18, 1);
        const backThickness = cleanMm(options.backThickness, 6, 1);
        const bottomHeightFromFloor = Math.max(
          0,
          Number(Number(options.bottomHeightFromFloor ?? 1400).toFixed(3)),
        );
        const shelfCount = Math.max(
          0,
          Math.min(8, Math.round(Number(options.shelfCount) || 0)),
        );
        const dividerCount = Math.max(
          0,
          Math.min(4, Math.round(Number(options.dividerCount) || 0)),
        );

        if (thickness * 2 >= outerWidth) {
          toast.error(
            "Panel thickness is too large for the selected wall cabinet width.",
          );
          return;
        }

        if (thickness * 2 >= outerHeight) {
          toast.error(
            "Panel thickness is too large for the selected wall cabinet height.",
          );
          return;
        }

        if (backThickness >= outerDepth) {
          toast.error(
            "Back thickness must be smaller than the wall cabinet depth.",
          );
          return;
        }

        const innerWidth = outerWidth - thickness * 2;
        const innerHeight = outerHeight - thickness * 2;
        const innerDepth = outerDepth - backThickness;
        const dividerSpace = dividerCount * thickness;
        const usableBayWidth = innerWidth - dividerSpace;

        if (usableBayWidth < (dividerCount + 1) * 80) {
          toast.error(
            "Wall cabinet width is too small for the selected divider count and panel thickness.",
          );
          return;
        }

        const origin = getNextAssemblyOrigin(components);
        const originX = snap(origin.x);
        const originZ = snap(origin.z);
        const floorY = WORLD_H - FLOOR_OFFSET;

        if (bottomHeightFromFloor + outerHeight > floorY) {
          toast.error(
            "Wall cabinet is too high for the current Blueprint workspace. Lower Bottom Height or cabinet Height.",
          );
          return;
        }

        const bottomY = Number(
          (floorY - bottomHeightFromFloor).toFixed(3),
        );
        const topY = Number((bottomY - outerHeight).toFixed(3));
        const cavityTopY = Number((topY + thickness).toFixed(3));
        const bottomPanelY = Number(
          (bottomY - thickness).toFixed(3),
        );

        const material = "Marine Plywood";
        const defaultFinish = getDefaultFinishId(material);
        const finishData = defaultFinish
          ? applyWoodFinish({ material }, defaultFinish)
          : { material, fill: "#d9c2a5", finish: "" };

        const usedNames = new Set(
          components
            .map((item) =>
              String(
                item?.groupLabel || item?.assemblyName || "",
              ).trim(),
            )
            .filter(Boolean),
        );

        let buildNumber = 1;
        while (usedNames.has(`Wall Cabinet ${buildNumber}`)) {
          buildNumber += 1;
        }

        const groupId = makeGroupId();
        const groupLabel = `Wall Cabinet ${buildNumber}`;

        const part = (overrides) =>
          createAssemblyPart({
            groupId,
            groupLabel,
            groupType: "assembly",
            assemblyType: "wall_cabinet",
            material: finishData.material || material,
            finish: finishData.finish || "",
            fill: finishData.fill || "#d9c2a5",
            unitPrice: 0,
            groupUnitPrice: 0,
            qty: 1,
            locked: false,
            ...overrides,
          });

        const parts = [
          part({
            type: "wr_side_panel",
            partRole: "left_side_panel",
            label: "Left Side Panel",
            partCode: "CB-SIDE-L",
            x: originX,
            y: topY,
            z: originZ,
            width: thickness,
            height: outerHeight,
            depth: outerDepth,
          }),
          part({
            type: "wr_side_panel",
            partRole: "right_side_panel",
            label: "Right Side Panel",
            partCode: "CB-SIDE-R",
            x: Number((originX + outerWidth - thickness).toFixed(3)),
            y: topY,
            z: originZ,
            width: thickness,
            height: outerHeight,
            depth: outerDepth,
          }),
          part({
            type: "wr_top_panel",
            partRole: "top_panel",
            label: "Top Panel",
            partCode: "CB-TOP",
            x: Number((originX + thickness).toFixed(3)),
            y: topY,
            z: originZ,
            width: innerWidth,
            height: thickness,
            depth: outerDepth,
          }),
          part({
            type: "wr_bottom_panel",
            partRole: "bottom_panel",
            label: "Bottom Panel",
            partCode: "CB-BOT",
            x: Number((originX + thickness).toFixed(3)),
            y: bottomPanelY,
            z: originZ,
            width: innerWidth,
            height: thickness,
            depth: outerDepth,
          }),
          part({
            type: "wr_back_panel",
            partRole: "back_panel",
            label: "Back Panel",
            partCode: "CB-BACK",
            x: Number((originX + thickness).toFixed(3)),
            y: cavityTopY,
            z: originZ,
            width: innerWidth,
            height: innerHeight,
            depth: backThickness,
            material: "Panel Board",
          }),
        ];

        const bayCount = dividerCount + 1;
        const bayWidth = Number(
          ((innerWidth - dividerSpace) / bayCount).toFixed(3),
        );

        for (
          let dividerIndex = 1;
          dividerIndex <= dividerCount;
          dividerIndex += 1
        ) {
          const dividerX = Number(
            (
              originX +
              thickness +
              bayWidth * dividerIndex +
              thickness * (dividerIndex - 1)
            ).toFixed(3),
          );

          parts.push(
            part({
              type: "wr_divider",
              partRole: "divider",
              label: `Divider ${dividerIndex}`,
              partCode: `CB-DIV${String(dividerIndex).padStart(2, "0")}`,
              x: dividerX,
              y: cavityTopY,
              z: Number((originZ + backThickness).toFixed(3)),
              width: thickness,
              height: innerHeight,
              depth: innerDepth,
            }),
          );
        }

        if (shelfCount > 0) {
          const shelfTravel = Math.max(0, innerHeight - thickness);

          for (let level = 1; level <= shelfCount; level += 1) {
            const shelfY = Number(
              (
                cavityTopY +
                (shelfTravel * level) / (shelfCount + 1)
              ).toFixed(3),
            );

            for (let bay = 0; bay < bayCount; bay += 1) {
              const shelfX = Number(
                (
                  originX +
                  thickness +
                  bay * (bayWidth + thickness)
                ).toFixed(3),
              );

              const baySuffix =
                bayCount > 1
                  ? `-B${String(bay + 1).padStart(2, "0")}`
                  : "";

              parts.push(
                part({
                  type: "wr_shelf",
                  partRole: "shelf",
                  label:
                    bayCount > 1
                      ? `Fixed Shelf ${level} Bay ${bay + 1}`
                      : `Fixed Shelf ${level}`,
                  partCode: `CB-SH${String(level).padStart(2, "0")}${baySuffix}`,
                  x: shelfX,
                  y: shelfY,
                  z: Number((originZ + backThickness).toFixed(3)),
                  width: bayWidth,
                  height: thickness,
                  depth: innerDepth,
                }),
              );
            }
          }
        }

        pushHistory(components);
        setComponents((prev) => [...prev, ...parts]);
        setSelectedIds(parts.map((item) => item.id));
        setSelectedId(parts[0]?.id || null);
        setEdit3DId(parts[0]?.id || null);
        setTransformMode("translate");

        toast.success(
          `${groupLabel} generated (${parts.length} part${parts.length !== 1 ? "s" : ""}).`,
        );
        return;
      }
      const outerWidth = snap(
        Math.max(GRID_SIZE * 4, Number(options.width) || 1200),
      );
      const outerHeight = snap(
        Math.max(GRID_SIZE * 5, Number(options.height) || 2000),
      );
      const outerDepth = snap(
        Math.max(GRID_SIZE * 3, Number(options.depth) || 600),
      );
      const maxThickness = snap(
        Math.max(
          GRID_SIZE,
          Math.min(
            100,
            Math.floor(outerWidth / 3),
            Math.floor(outerHeight / 3),
            Math.floor(outerDepth / 3),
          ),
        ),
      );
      const thickness = snap(
        clamp(Number(options.thickness) || GRID_SIZE, GRID_SIZE, maxThickness),
      );
      const shelfCount = Math.max(
        0,
        Math.min(8, Math.round(Number(options.shelfCount) || 0)),
      );
      const withDivider = Boolean(options.withDivider);
      const backThickness = GRID_SIZE;

      if (
        outerWidth - thickness * 2 < GRID_SIZE ||
        outerHeight - thickness * 2 < GRID_SIZE ||
        outerDepth - backThickness < GRID_SIZE
      ) {
        toast.error(
          "Cabinet size is too small for the chosen thickness. Increase size or lower thickness.",
        );
        return;
      }

      const origin = getNextAssemblyOrigin(components);
      const originX = snap(origin.x);
      const originZ = snap(origin.z);
      const floorY = WORLD_H - FLOOR_OFFSET;
      const topY = snap(floorY - outerHeight);

      const material = "Marine Plywood";
      const defaultFinish = getDefaultFinishId(material);
      const finishData = defaultFinish
        ? applyWoodFinish({ material }, defaultFinish)
        : { material, fill: "#d9c2a5", finish: "" };

      const buildCount =
        [
          ...new Set(
            components
              .filter((c) => c.groupType === "assembly")
              .map((c) => c.groupId),
          ),
        ].length + 1;

      const groupId = makeGroupId();
      const groupLabel = `Cabinet Box ${buildCount}`;
      const part = (overrides) =>
        createAssemblyPart({
          groupId,
          groupLabel,
          material: finishData.material || material,
          finish: finishData.finish || "",
          fill: finishData.fill || "#d9c2a5",
          ...overrides,
        });

      const innerWidth = outerWidth - thickness * 2;
      const innerHeight = outerHeight - thickness * 2;
      const innerDepth = outerDepth - backThickness;

      const parts = [
        part({
          type: "wr_side_panel",
          label: "Left Side Panel",
          partCode: "CB-SIDE-L",
          x: originX,
          y: topY,
          z: originZ,
          width: thickness,
          height: outerHeight,
          depth: outerDepth,
        }),
        part({
          type: "wr_side_panel",
          label: "Right Side Panel",
          partCode: "CB-SIDE-R",
          x: originX + outerWidth - thickness,
          y: topY,
          z: originZ,
          width: thickness,
          height: outerHeight,
          depth: outerDepth,
        }),
        part({
          type: "wr_top_panel",
          label: "Top Panel",
          partCode: "CB-TOP",
          x: originX + thickness,
          y: topY,
          z: originZ,
          width: innerWidth,
          height: thickness,
          depth: outerDepth,
        }),
        part({
          type: "wr_bottom_panel",
          label: "Bottom Panel",
          partCode: "CB-BOT",
          x: originX + thickness,
          y: floorY - thickness,
          z: originZ,
          width: innerWidth,
          height: thickness,
          depth: outerDepth,
        }),
        part({
          type: "wr_back_panel",
          label: "Back Panel",
          partCode: "CB-BACK",
          x: originX + thickness,
          y: topY + thickness,
          z: originZ,
          width: innerWidth,
          height: innerHeight,
          depth: backThickness,
          material: "Panel Board",
        }),
      ];

      let dividerLeftShelfWidth = innerWidth;
      let dividerRightShelfWidth = 0;
      let dividerRightShelfX = originX + thickness;

      if (withDivider && innerWidth - thickness >= GRID_SIZE * 2) {
        const dividerLeftWidth = snap(
          Math.max(
            GRID_SIZE,
            Math.floor((innerWidth - thickness) / 2 / GRID_SIZE) * GRID_SIZE,
          ),
        );
        dividerRightShelfWidth = snap(
          Math.max(GRID_SIZE, innerWidth - thickness - dividerLeftWidth),
        );
        dividerLeftShelfWidth = dividerLeftWidth;
        dividerRightShelfX = originX + thickness + dividerLeftWidth + thickness;

        parts.push(
          part({
            type: "wr_divider",
            partRole: "divider",
            label: "Center Divider",
            partCode: "CB-DIV",
            x: originX + thickness + dividerLeftWidth,
            y: topY + thickness,
            z: originZ + backThickness,
            width: thickness,
            height: innerHeight,
            depth: innerDepth,
          }),
        );
      }

      if (shelfCount > 0) {
        const innerTopY = topY + thickness;
        const shelfTravel = Math.max(0, innerHeight - thickness);

        for (let index = 1; index <= shelfCount; index += 1) {
          const shelfY = snap(
            innerTopY + (shelfTravel * index) / (shelfCount + 1),
          );

          if (withDivider && dividerRightShelfWidth >= GRID_SIZE) {
            parts.push(
              part({
                type: "wr_shelf",
                partRole: "shelf",
                label: `Fixed Shelf ${index} Left`,
                partCode: `CB-SH${String(index).padStart(2, "0")}L`,
                x: originX + thickness,
                y: shelfY,
                z: originZ + backThickness,
                width: dividerLeftShelfWidth,
                height: thickness,
                depth: innerDepth,
              }),
            );
            parts.push(
              part({
                type: "wr_shelf",
                partRole: "shelf",
                label: `Fixed Shelf ${index} Right`,
                partCode: `CB-SH${String(index).padStart(2, "0")}R`,
                x: dividerRightShelfX,
                y: shelfY,
                z: originZ + backThickness,
                width: dividerRightShelfWidth,
                height: thickness,
                depth: innerDepth,
              }),
            );
          } else {
            parts.push(
              part({
                type: "wr_shelf",
                partRole: "shelf",
                label: `Fixed Shelf ${index}`,
                partCode: `CB-SH${String(index).padStart(2, "0")}`,
                x: originX + thickness,
                y: shelfY,
                z: originZ + backThickness,
                width: innerWidth,
                height: thickness,
                depth: innerDepth,
              }),
            );
          }
        }
      }

      pushHistory(components);
      setComponents((prev) => [...prev, ...parts]);
      setSelectedIds(parts.map((item) => item.id));
      setSelectedId(parts[0]?.id || null);
      setEdit3DId(parts[0]?.id || null);
      setTransformMode("translate");

      toast.success(
        `${groupLabel} generated (${parts.length} part${parts.length !== 1 ? "s" : ""}).`,
      );
    },
    [components, editorMode, view, WORLD_H, pushHistory],
  );


  const buildSimpleTable3D = useCallback(
    (options = {}) => {
      if (editorMode !== "editable") {
        toast.error("Reference mode ito. Lumipat muna sa editable mode.");
        return;
      }

      if (view !== "3d") {
        toast.error("Sa 3D view lang puwede gamitin ang Simple Table Builder.");
        return;
      }

      const cleanMm = (value, fallback, minimum = 1) => {
        const parsed = Number(value);
        const resolved = Number.isFinite(parsed) ? parsed : fallback;
        return Math.max(minimum, Math.round(resolved));
      };

      const width = cleanMm(options.width, 1400, 400);
      const depth = cleanMm(options.depth, 800, 400);
      const height = cleanMm(options.height, 760, 300);
      const tabletopThickness = cleanMm(options.tabletopThickness, 36, 1);
      const legSize = cleanMm(options.legSize, 70, 20);
      const apronHeight = cleanMm(options.apronHeight, 90, 20);
      const apronThickness = cleanMm(options.apronThickness, 25, 1);

      if (tabletopThickness >= height) {
        toast.error("Tabletop thickness must be smaller than the total table height.");
        return;
      }

      const legHeight = height - tabletopThickness;
      if (apronHeight > legHeight) {
        toast.error("Apron height must fit below the tabletop.");
        return;
      }

      if (apronThickness > legSize) {
        toast.error("Apron thickness must not be larger than the leg size.");
        return;
      }

      // Batch 30 intentionally keeps the simple builder compact: the corner
      // inset is automatic while the production dimensions stay user-defined.
      const preferredLegInset = 40;
      const maxInsetX = Math.floor((width - legSize * 2 - 40) / 2);
      const maxInsetZ = Math.floor((depth - legSize * 2 - 40) / 2);
      const legInset = Math.max(
        0,
        Math.min(preferredLegInset, maxInsetX, maxInsetZ),
      );

      const innerSpanX = width - (legInset + legSize) * 2;
      const innerSpanZ = depth - (legInset + legSize) * 2;

      if (innerSpanX < 40 || innerSpanZ < 40) {
        toast.error(
          "Table width/depth is too small for the selected leg size. Increase the table size or reduce Leg Size.",
        );
        return;
      }

      const origin = getNextAssemblyOrigin(components);
      const originX = snap(origin.x);
      const originZ = snap(origin.z);
      const floorY = WORLD_H - FLOOR_OFFSET;
      const topY = Math.round(floorY - height);
      const legY = topY + tabletopThickness;

      const leftX = originX + legInset;
      const rightX = originX + width - legInset - legSize;
      const frontZ = originZ + legInset;
      const backZ = originZ + depth - legInset - legSize;

      const material = "Oak Wood";
      const defaultFinish = getDefaultFinishId(material);
      const finishData = defaultFinish
        ? applyWoodFinish({ material }, defaultFinish)
        : { material, fill: "#d9c2a5", finish: "" };

      const simpleTableIds = new Set(
        components
          .filter((item) =>
            /^Simple Table \d+$/i.test(
              String(item?.groupLabel || item?.assemblyName || "").trim(),
            ),
          )
          .map((item) => item.groupId || item.assemblyId)
          .filter(Boolean),
      );

      let buildNumber = simpleTableIds.size + 1;
      const usedNames = new Set(
        components
          .map((item) =>
            String(item?.groupLabel || item?.assemblyName || "").trim(),
          )
          .filter(Boolean),
      );

      while (usedNames.has(`Simple Table ${buildNumber}`)) {
        buildNumber += 1;
      }

      const groupId = makeGroupId();
      const groupLabel = `Simple Table ${buildNumber}`;

      const part = (overrides) =>
        createAssemblyPart({
          groupId,
          groupLabel,
          groupType: "assembly",
          assemblyType: "dining_table",
          material: finishData.material || material,
          finish: finishData.finish || "",
          fill: finishData.fill || "#d9c2a5",
          unitPrice: 0,
          groupUnitPrice: 0,
          qty: 1,
          locked: false,
          ...overrides,
        });

      const parts = [
        part({
          type: "dt_top_panel",
          label: "Top Panel",
          partCode: "DT-TOP",
          partRole: "top_panel",
          x: originX,
          y: topY,
          z: originZ,
          width,
          height: tabletopThickness,
          depth,
        }),

        part({
          type: "dt_leg",
          label: "Front Leg L",
          partCode: "DT-FL",
          partRole: "leg",
          x: leftX,
          y: legY,
          z: frontZ,
          width: legSize,
          height: legHeight,
          depth: legSize,
        }),
        part({
          type: "dt_leg",
          label: "Front Leg R",
          partCode: "DT-FR",
          partRole: "leg",
          x: rightX,
          y: legY,
          z: frontZ,
          width: legSize,
          height: legHeight,
          depth: legSize,
        }),
        part({
          type: "dt_leg",
          label: "Back Leg L",
          partCode: "DT-BL",
          partRole: "leg",
          x: leftX,
          y: legY,
          z: backZ,
          width: legSize,
          height: legHeight,
          depth: legSize,
        }),
        part({
          type: "dt_leg",
          label: "Back Leg R",
          partCode: "DT-BR",
          partRole: "leg",
          x: rightX,
          y: legY,
          z: backZ,
          width: legSize,
          height: legHeight,
          depth: legSize,
        }),

        part({
          type: "table_apron_long",
          label: "Front Apron",
          partCode: "DT-AF",
          partRole: "apron_rail",
          x: leftX + legSize,
          y: legY,
          z: frontZ,
          width: innerSpanX,
          height: apronHeight,
          depth: apronThickness,
        }),
        part({
          type: "table_apron_long",
          label: "Rear Apron",
          partCode: "DT-AR",
          partRole: "apron_rail",
          x: leftX + legSize,
          y: legY,
          z: backZ + legSize - apronThickness,
          width: innerSpanX,
          height: apronHeight,
          depth: apronThickness,
        }),
        part({
          type: "table_apron_short",
          label: "Left Apron",
          partCode: "DT-AL",
          partRole: "apron_rail",
          x: leftX,
          y: legY,
          z: frontZ + legSize,
          width: apronThickness,
          height: apronHeight,
          depth: innerSpanZ,
        }),
        part({
          type: "table_apron_short",
          label: "Right Apron",
          partCode: "DT-AR2",
          partRole: "apron_rail",
          x: rightX + legSize - apronThickness,
          y: legY,
          z: frontZ + legSize,
          width: apronThickness,
          height: apronHeight,
          depth: innerSpanZ,
        }),
      ];

      pushHistory(components);
      setComponents((prev) => [...prev, ...parts]);
      setSelectedIds(parts.map((item) => item.id));
      setSelectedId(parts[0]?.id || null);
      setEdit3DId(parts[0]?.id || null);
      setTransformMode("translate");

      toast.success(`${groupLabel} generated (9 parts).`);
    },
    [components, editorMode, view, WORLD_H, pushHistory],
  );

  const createDoorPairFrontParts3D = useCallback(
    (ctx, rect, options = {}, codePrefix = "FRONT", labelPrefix = "Front") => {
      const reveal = snap(Math.max(0, Number(options.reveal) || 0));
      const frontGap = snap(Math.max(0, Number(options.frontGap) || 0));
      const frontThickness = snap(
        Math.max(GRID_SIZE, Number(options.frontThickness) || ctx.thickness),
      );

      const usableWidth = snap(Math.max(GRID_SIZE, rect.width - reveal * 2));
      const usableHeight = snap(Math.max(GRID_SIZE, rect.height - reveal * 2));
      const baseX = snap(rect.x + reveal);
      const baseY = snap(rect.y + reveal);
      const baseZ = snap(ctx.frontZ - frontThickness);

      if (usableWidth < GRID_SIZE * 2 + frontGap) {
        return [
          ctx.buildPart({
            type: "door_front_panel",
            partRole: "door",
            doorLeaf: "single",
            label: `${labelPrefix} Door`,
            partCode: `${codePrefix}`,
            x: baseX,
            y: baseY,
            z: baseZ,
            width: usableWidth,
            height: usableHeight,
            depth: frontThickness,
          }),
        ];
      }

      const safeGap = snap(
        Math.min(frontGap, Math.max(0, usableWidth - GRID_SIZE * 2)),
      );
      const eachWidth = snap((usableWidth - safeGap) / 2);

      return [
        ctx.buildPart({
          type: "door_front_panel",
          partRole: "door",
          doorLeaf: "left",
          label: `${labelPrefix} Left Door`,
          partCode: `${codePrefix}-L`,
          x: baseX,
          y: baseY,
          z: baseZ,
          width: eachWidth,
          height: usableHeight,
          depth: frontThickness,
        }),
        ctx.buildPart({
          type: "door_front_panel",
          partRole: "door",
          doorLeaf: "right",
          label: `${labelPrefix} Right Door`,
          partCode: `${codePrefix}-R`,
          x: snap(baseX + eachWidth + safeGap),
          y: baseY,
          z: baseZ,
          width: eachWidth,
          height: usableHeight,
          depth: frontThickness,
        }),
      ];
    },
    [],
  );

  const createDrawerStackFrontParts3D = useCallback(
    (
      ctx,
      rect,
      options = {},
      codePrefix = "DRAWER",
      labelPrefix = "Drawer",
    ) => {
      const reveal = snap(Math.max(0, Number(options.reveal) || 0));
      const frontGap = snap(Math.max(0, Number(options.frontGap) || 0));
      const drawerCount = Math.max(
        2,
        Math.min(8, Number(options.drawerCount) || 3),
      );
      const frontThickness = snap(
        Math.max(GRID_SIZE, Number(options.frontThickness) || ctx.thickness),
      );

      const usableWidth = snap(Math.max(GRID_SIZE, rect.width - reveal * 2));
      const usableHeight = snap(
        Math.max(GRID_SIZE * 2, rect.height - reveal * 2),
      );
      const baseX = snap(rect.x + reveal);
      const baseY = snap(rect.y + reveal);
      const baseZ = snap(ctx.frontZ - frontThickness);

      const maxGap = Math.max(0, usableHeight - GRID_SIZE * 2 * drawerCount);
      const safeGap = snap(
        Math.min(frontGap, maxGap / Math.max(1, drawerCount - 1)),
      );
      const eachHeight = snap(
        Math.floor(
          (usableHeight - safeGap * Math.max(0, drawerCount - 1)) / drawerCount,
        ),
      );

      if (eachHeight < GRID_SIZE * 2) {
        toast.error(
          "Not enough opening height for the requested drawer count.",
        );
        return [];
      }

      const parts = [];

      for (let index = 0; index < drawerCount; index += 1) {
        parts.push(
          ctx.buildPart({
            type: "drawer_front_panel",
            label: `${labelPrefix} ${index + 1}`,
            partCode: `${codePrefix}-${String(index + 1).padStart(2, "0")}`,
            x: baseX,
            y: snap(baseY + index * (eachHeight + safeGap)),
            z: baseZ,
            width: usableWidth,
            height: eachHeight,
            depth: frontThickness,
          }),
        );
      }

      return parts;
    },
    [],
  );


  const buildCabinetShelfLayout3D = useCallback(
    (options = {}) => {
      if (editorMode !== "editable") {
        toast.error("Reference mode ito. Lumipat muna sa editable mode.");
        return;
      }

      const ctx = getCabinetBuilderContext3D();
      if (!ctx) return;

      const lockedAssemblyPart = (ctx.assemblyItems || []).find((item) =>
        isLocked?.(item),
      );

      if (lockedAssemblyPart) {
        toast.error(
          "Cannot rebuild shelves. Unlock all parts in the cabinet assembly first.",
        );
        return;
      }

      const shelfCount = Math.max(
        0,
        Math.min(8, Math.round(Number(options.shelfCount) || 0)),
      );

      const shelfThickness = snap(
        Math.max(
          GRID_SIZE,
          Number(options.shelfThickness) ||
            (ctx.shelfParts?.length
              ? Math.min(
                  ...ctx.shelfParts.map(
                    (item) => Number(item.height) || ctx.thickness || GRID_SIZE,
                  ),
                )
              : ctx.thickness || GRID_SIZE),
        ),
      );

      const bays =
        Array.isArray(ctx.bayRects) && ctx.bayRects.length
          ? ctx.bayRects
          : [
              {
                bayIndex: 1,
                x: ctx.overallRect.x,
                y: ctx.overallRect.y,
                z: ctx.overallRect.z,
                width: ctx.overallRect.width,
                height: ctx.overallRect.height,
                depth: ctx.overallRect.depth,
              },
            ];

      const availableHeight = Math.max(
        GRID_SIZE,
        Number(ctx.overallRect?.height) || 0,
      );
      const totalShelfThickness = shelfThickness * shelfCount;
      const clearSpace = availableHeight - totalShelfThickness;

      if (shelfCount > 0 && clearSpace < GRID_SIZE * (shelfCount + 1)) {
        toast.error(
          "Not enough cabinet height for this shelf count. Reduce shelves or increase cabinet height.",
        );
        return;
      }

      const gap =
        shelfCount > 0 ? clearSpace / Math.max(1, shelfCount + 1) : 0;
      const newShelves = [];

      for (let level = 1; level <= shelfCount; level += 1) {
        const shelfY = snap(
          ctx.overallRect.y +
            gap * level +
            shelfThickness * Math.max(0, level - 1),
        );

        bays.forEach((bay, bayOffset) => {
          newShelves.push(
            ctx.buildPart({
              type: "wr_shelf",
              label:
                bays.length > 1
                  ? `Fixed Shelf ${level} Bay ${bay.bayIndex || bayOffset + 1}`
                  : `Fixed Shelf ${level}`,
              partCode:
                bays.length > 1
                  ? `CB-SH-B${bay.bayIndex || bayOffset + 1}-${String(level).padStart(2, "0")}`
                  : `CB-SH-${String(level).padStart(2, "0")}`,
              partRole: "shelf",
              x: snap(bay.x),
              y: shelfY,
              z: snap(bay.z),
              width: snap(bay.width),
              height: shelfThickness,
              depth: snap(bay.depth),
            }),
          );
        });
      }

      const removeShelfAndFrontIds = new Set([
        ...(ctx.shelfParts || []).map((item) => item.id),
        ...(ctx.frontParts || []).map((item) => item.id),
      ]);

      pushHistory(
        Array.isArray(components)
          ? components.map((item) => normalizeComponent(item))
          : [],
      );

      const preserved = components.filter(
        (item) => !removeShelfAndFrontIds.has(item.id),
      );
      const nextComponents = preserved.concat(newShelves);

      setComponents(nextComponents);

      const assemblyId =
        ctx.assemblyItems?.[0]?.assemblyId ||
        ctx.assemblyItems?.[0]?.groupId ||
        null;
      const nextAssemblySelection = nextComponents
        .filter(
          (item) =>
            assemblyId &&
            (item.assemblyId === assemblyId || item.groupId === assemblyId),
        )
        .map((item) => item.id);

      setSelectedIds(
        nextAssemblySelection.length
          ? nextAssemblySelection
          : newShelves.map((item) => item.id),
      );
      setSelectedId(ctx.primaryId);
      setEdit3DId(ctx.primaryId);
      setTransformMode("translate");

      toast.success(
        shelfCount > 0
          ? `${shelfCount} evenly spaced shelf level${shelfCount !== 1 ? "s" : ""} applied across ${bays.length} bay${bays.length !== 1 ? "s" : ""}.`
          : "Cabinet shelves cleared.",
      );
    },
    [
      editorMode,
      getCabinetBuilderContext3D,
      isLocked,
      components,
      pushHistory,
    ],
  );

  const buildCabinetInteriorPreset3D = useCallback(
    (options = {}) => {
      if (editorMode !== "editable") {
        toast.error("Reference mode ito. Lumipat muna sa editable mode.");
        return;
      }

      const ctx = getCabinetBuilderContext3D();
      if (!ctx) return;

      const preset =
        options.preset === "three-column" ? "three-column" : "two-column";
      const columnCount = preset === "three-column" ? 3 : 2;
      const dividerCount = columnCount - 1;

      const openingWidth = snap(
        (ctx.overallRect.width - ctx.thickness * dividerCount) / columnCount,
      );

      if (openingWidth < GRID_SIZE) {
        toast.error("Cabinet is too small for the selected interior preset.");
        return;
      }

      const sourceShelfLevels = [
        ...new Set(
          ctx.shelfParts
            .map((part) => snap(Number(part.y) || 0))
            .filter(
              (value) => value > ctx.inner.minY && value < ctx.inner.maxY,
            ),
        ),
      ].sort((a, b) => a - b);

      const shelfThickness = snap(
        Math.max(
          GRID_SIZE,
          ctx.shelfParts.length
            ? Math.min(
                ...ctx.shelfParts.map(
                  (part) => Number(part.height) || GRID_SIZE,
                ),
              )
            : ctx.thickness,
        ),
      );

      const newParts = [];
      const newBayRects = [];
      let cursorX = ctx.inner.minX;

      for (let bayIndex = 1; bayIndex <= columnCount; bayIndex += 1) {
        newBayRects.push({
          bayIndex,
          x: snap(cursorX),
          y: ctx.inner.minY,
          z: ctx.inner.minZ,
          width: openingWidth,
          height: ctx.overallRect.height,
          depth: ctx.overallRect.depth,
        });

        cursorX = snap(cursorX + openingWidth);

        if (bayIndex < columnCount) {
          newParts.push(
            ctx.buildPart({
              type: "wr_divider",
              partRole: "divider",
              label: `Center Divider ${bayIndex}`,
              partCode: `CB-DIV-${bayIndex}`,
              x: cursorX,
              y: ctx.inner.minY,
              z: ctx.inner.minZ,
              width: ctx.thickness,
              height: ctx.overallRect.height,
              depth: ctx.overallRect.depth,
            }),
          );

          cursorX = snap(cursorX + ctx.thickness);
        }
      }

      sourceShelfLevels.forEach((shelfY, shelfIndex) => {
        newBayRects.forEach((bay) => {
          newParts.push(
            ctx.buildPart({
              type: "wr_shelf",
              partRole: "shelf",
              label: `Fixed Shelf ${shelfIndex + 1} Bay ${bay.bayIndex}`,
              partCode: `CB-SH-${bay.bayIndex}-${String(shelfIndex + 1).padStart(2, "0")}`,
              x: bay.x,
              y: shelfY,
              z: ctx.inner.minZ,
              width: bay.width,
              height: shelfThickness,
              depth: ctx.overallRect.depth,
            }),
          );
        });
      });

      pushHistory(
        Array.isArray(components)
          ? components.map((item) => normalizeComponent(item))
          : [],
      );

      const nextComponents = components
        .filter((item) => !ctx.removeInteriorAndFrontIds.has(item.id))
        .concat(newParts);

      setComponents(nextComponents);

      const newSelectionIds = [
        ...ctx.shellParts.map((item) => item.id),
        ...newParts.map((item) => item.id),
      ];

      setSelectedIds(newSelectionIds);
      setSelectedId(ctx.primaryId);
      setEdit3DId(ctx.primaryId);
      setTransformMode("translate");

      toast.success(
        preset === "three-column"
          ? "3 Column cabinet interior applied."
          : "2 Column cabinet interior applied.",
      );
    },
    [editorMode, getCabinetBuilderContext3D, components, pushHistory],
  );


  const buildCabinetDoorLayout3D = useCallback(
    (options = {}) => {
      if (editorMode !== "editable") {
        toast.error("Reference mode ito. Lumipat muna sa editable mode.");
        return;
      }

      if (view !== "3d") {
        toast.error("Sa 3D view lang puwede gamitin ang Door Builder.");
        return;
      }

      const ctx = getCabinetBuilderContext3D();
      if (!ctx) return;

      const lockedAssemblyPart = (ctx.assemblyItems || []).find((item) =>
        isLocked?.(item),
      );

      if (lockedAssemblyPart) {
        toast.error(
          "Cannot apply Door Builder. Unlock all parts in the cabinet assembly first.",
        );
        return;
      }

      const isDrawerFrontPart = (item) => {
        const itemType = String(item?.type || "").trim().toLowerCase();
        const itemRole = String(item?.partRole || "").trim().toLowerCase();
        const itemCode = String(
          item?.partCode || item?.technicalId || "",
        ).trim();
        const itemLabel = String(item?.label || "").trim().toLowerCase();

        return (
          itemType === "drawer_front_panel" ||
          itemType === "wr_drawer_front" ||
          itemRole === "drawer_front" ||
          itemRole === "drawer_front_panel" ||
          /^WR-DF\d+/i.test(itemCode) ||
          itemLabel.includes("drawer front")
        );
      };

      // Important: legacy Wardrobe drawer fronts (WR-DF1/2/3) are not part
      // of ctx.frontParts, so scan the complete selected assembly instead.
      const existingDrawerFronts = (ctx.assemblyItems || []).filter(
        isDrawerFrontPart,
      );

      if (existingDrawerFronts.length) {
        const sampleDrawer =
          existingDrawerFronts[0]?.partCode ||
          existingDrawerFronts[0]?.label ||
          "Drawer Front";

        toast.error(
          `Door Builder blocked: this cabinet already contains drawer fronts (${sampleDrawer}). Use a cabinet opening without drawers, or clear/change the drawer layout first.`,
        );
        return;
      }

      const doorMode =
        String(options.doorMode || "pair").toLowerCase() === "single"
          ? "single"
          : "pair";

      const requestedScope = String(options.scope || "whole").toLowerCase();
      const scope = ["whole", "bay", "opening"].includes(requestedScope)
        ? requestedScope
        : "whole";

      const reveal = Math.max(0, Number(options.reveal) || 0);
      const frontGap = Math.max(0, Number(options.frontGap) || 0);
      const frontThickness = Math.max(
        1,
        Number(options.frontThickness) || Number(ctx.thickness) || GRID_SIZE,
      );

      const roundMm = (value) =>
        Number.isFinite(Number(value))
          ? Number(Number(value).toFixed(3))
          : 0;

      const fullBayRects = (ctx.bayRects || []).map((bay, index) => ({
        ...bay,
        bayIndex: bay.bayIndex || index + 1,
        y: ctx.overallRect.y,
        height: ctx.overallRect.height,
      }));

      let targets = [];

      if (scope === "opening") {
        targets = [...(ctx.openingRects || [])]
          .sort(
            (a, b) =>
              (a.rowIndex || 0) - (b.rowIndex || 0) ||
              (a.bayIndex || 0) - (b.bayIndex || 0),
          )
          .map((opening, index) => ({
            ...opening,
            targetIndex: index + 1,
          }));

        if (!targets.length) {
          toast.error(
            "No cabinet openings found. Build a shelf/interior layout first or use Whole / Per Bay scope.",
          );
          return;
        }
      } else if (scope === "bay") {
        targets = fullBayRects.length
          ? fullBayRects
          : [
              {
                ...ctx.overallRect,
                bayIndex: 1,
              },
            ];
      } else {
        targets = [
          {
            ...ctx.overallRect,
            bayIndex: 1,
          },
        ];
      }

      const buildDoorPartsForTarget = (rect, index) => {
        const usableWidth = roundMm(Number(rect.width) - reveal * 2);
        const usableHeight = roundMm(Number(rect.height) - reveal * 2);

        if (usableWidth <= 0 || usableHeight <= 0) {
          return {
            supported: false,
            reason:
              "Door reveal is too large for one or more selected cabinet openings.",
            parts: [],
          };
        }

        const baseX = roundMm(Number(rect.x) + reveal);
        const baseY = roundMm(Number(rect.y) + reveal);
        const baseZ = roundMm(Number(ctx.frontZ) - frontThickness);

        const bayIndex = Number(rect.bayIndex) || 1;
        const rowIndex = Number(rect.rowIndex) || 1;

        const prefix =
          scope === "whole"
            ? "CAB-DOOR"
            : scope === "bay"
              ? `CAB-B${bayIndex}-DOOR`
              : `CAB-B${bayIndex}-R${rowIndex}-DOOR`;

        const labelPrefix =
          scope === "whole"
            ? "Cabinet"
            : scope === "bay"
              ? `Bay ${bayIndex}`
              : `Bay ${bayIndex} Row ${rowIndex}`;

        const common = {
          type: "door_front_panel",
          partRole: "door",
          doorLayoutMode: doorMode,
          doorLayoutScope: scope,
          doorReveal: roundMm(reveal),
          doorGap: roundMm(frontGap),
          x: baseX,
          y: baseY,
          z: baseZ,
          height: usableHeight,
          depth: roundMm(frontThickness),
          unitPrice: 0,
          groupUnitPrice: 0,
          qty: 1,
          locked: false,
        };

        if (doorMode === "single") {
          return {
            supported: true,
            parts: [
              ctx.buildPart({
                ...common,
                doorLeaf: "single",
                label: `${labelPrefix} Door`,
                partCode: prefix,
                width: usableWidth,
              }),
            ],
          };
        }

        if (frontGap >= usableWidth) {
          return {
            supported: false,
            reason:
              "Door gap must be smaller than the available opening width.",
            parts: [],
          };
        }

        const eachWidth = roundMm((usableWidth - frontGap) / 2);

        if (eachWidth <= 0) {
          return {
            supported: false,
            reason: "Door opening is too narrow for a double-door pair.",
            parts: [],
          };
        }

        return {
          supported: true,
          parts: [
            ctx.buildPart({
              ...common,
              doorLeaf: "left",
              label: `${labelPrefix} Left Door`,
              partCode: `${prefix}-L`,
              width: eachWidth,
            }),
            ctx.buildPart({
              ...common,
              doorLeaf: "right",
              label: `${labelPrefix} Right Door`,
              partCode: `${prefix}-R`,
              x: roundMm(baseX + eachWidth + frontGap),
              width: eachWidth,
            }),
          ],
        };
      };

      const nextDoorParts = [];

      for (let index = 0; index < targets.length; index += 1) {
        const result = buildDoorPartsForTarget(targets[index], index);

        if (!result.supported) {
          toast.error(result.reason || "Door layout is not valid.");
          return;
        }

        nextDoorParts.push(...result.parts);
      }

      const currentDoorParts = (ctx.frontParts || []).filter(
        (item) =>
          item?.type === "door_front_panel" ||
          String(item?.partRole || "").toLowerCase() === "door",
      );

      const signature = (item) =>
        JSON.stringify({
          type: item?.type || "",
          partRole: item?.partRole || "",
          label: item?.label || "",
          partCode: item?.partCode || "",
          doorLeaf: item?.doorLeaf || "",
          doorLayoutMode: item?.doorLayoutMode || "",
          doorLayoutScope: item?.doorLayoutScope || "",
          doorReveal: roundMm(item?.doorReveal || 0),
          doorGap: roundMm(item?.doorGap || 0),
          x: roundMm(item?.x || 0),
          y: roundMm(item?.y || 0),
          z: roundMm(item?.z || 0),
          width: roundMm(item?.width || 0),
          height: roundMm(item?.height || 0),
          depth: roundMm(item?.depth || 0),
        });

      const currentSignatures = currentDoorParts
        .map(signature)
        .sort()
        .join("|");
      const nextSignatures = nextDoorParts.map(signature).sort().join("|");

      if (
        currentDoorParts.length === nextDoorParts.length &&
        currentSignatures === nextSignatures
      ) {
        toast.success("Door layout already matches the current settings.");
        return;
      }

      const removeDoorIds = new Set(currentDoorParts.map((item) => item.id));

      pushHistory(
        Array.isArray(components)
          ? components.map((item) => normalizeComponent(item))
          : [],
      );

      const nextComponents = components
        .filter((item) => !removeDoorIds.has(item.id))
        .concat(nextDoorParts);

      setComponents(nextComponents);
      setSelectedIds(nextDoorParts.map((item) => item.id));
      setSelectedId(nextDoorParts[0]?.id || ctx.primaryId);
      setEdit3DId(nextDoorParts[0]?.id || ctx.primaryId);
      setTransformMode("translate");

      const scopeLabel =
        scope === "opening"
          ? "per opening"
          : scope === "bay"
            ? "per bay"
            : "whole opening";

      toast.success(
        `${doorMode === "single" ? "Single-door" : "Double-door"} layout applied ${scopeLabel} (${nextDoorParts.length} door${nextDoorParts.length !== 1 ? "s" : ""}).`,
      );
    },
    [
      editorMode,
      view,
      getCabinetBuilderContext3D,
      isLocked,
      components,
      pushHistory,
    ],
  );


  const buildCabinetDrawerLayout3D = useCallback(
    (options = {}) => {
      if (editorMode !== "editable") {
        toast.error("Reference mode ito. Lumipat muna sa editable mode.");
        return;
      }

      if (view !== "3d") {
        toast.error("Sa 3D view lang puwede gamitin ang Drawer Builder.");
        return;
      }

      const ctx = getCabinetBuilderContext3D();
      if (!ctx) return;

      const lockedAssemblyPart = (ctx.assemblyItems || []).find((item) =>
        isLocked?.(item),
      );

      if (lockedAssemblyPart) {
        toast.error(
          "Cannot apply Drawer Builder. Unlock all parts in the cabinet assembly first.",
        );
        return;
      }

      const textOf = (item) =>
        `${item?.label || ""} ${item?.partCode || ""} ${item?.type || ""} ${
          item?.partRole || ""
        }`
          .toLowerCase()
          .trim();

      const isDoorPart = (item) => {
        const type = String(item?.type || "").toLowerCase();
        const role = String(item?.partRole || "").toLowerCase();
        return type === "door_front_panel" || role === "door";
      };

      const isGeneratedDrawerPart = (item) => {
        const code = String(item?.partCode || item?.technicalId || "");
        const role = String(item?.partRole || "").toLowerCase();

        return (
          item?.drawerBuilderGenerated === true ||
          Number(item?.drawerBuilderVersion) === 1 ||
          (/^CAB-(?:B\d+(?:-R\d+)?-)?DRW-/i.test(code) &&
            [
              "drawer_front",
              "drawer_side",
              "drawer_back",
              "drawer_bottom",
              "drawer_handle",
              "drawer_slide",
            ].includes(role))
        );
      };

      const isDrawerRelatedPart = (item) => {
        const type = String(item?.type || "").toLowerCase();
        const role = String(item?.partRole || "").toLowerCase();
        const text = textOf(item);

        return (
          type === "drawer_front_panel" ||
          type.startsWith("wr_drawer_") ||
          role.startsWith("drawer_") ||
          text.includes("drawer front") ||
          text.includes("drawer side") ||
          text.includes("drawer back") ||
          text.includes("drawer bottom") ||
          text.includes("drawer slide")
        );
      };

      const currentGeneratedDrawerParts = (ctx.assemblyItems || []).filter(
        isGeneratedDrawerPart,
      );

      const existingDoors = (ctx.assemblyItems || []).filter(isDoorPart);
      if (existingDoors.length) {
        toast.error(
          "Drawer Builder blocked: this cabinet already contains doors. Clear/change the door layout first.",
        );
        return;
      }

      const unmanagedDrawerParts = (ctx.assemblyItems || []).filter(
        (item) =>
          isDrawerRelatedPart(item) &&
          !isGeneratedDrawerPart(item) &&
          !isDoorPart(item),
      );

      if (unmanagedDrawerParts.length) {
        const sample =
          unmanagedDrawerParts[0]?.partCode ||
          unmanagedDrawerParts[0]?.label ||
          "existing drawer";

        toast.error(
          `Drawer Builder blocked: this cabinet already contains an existing drawer assembly (${sample}). Use a clean opening or clear/change that drawer layout first.`,
        );
        return;
      }

      const requestedScope = String(options.scope || "whole").toLowerCase();
      const scope = ["whole", "bay", "opening"].includes(requestedScope)
        ? requestedScope
        : "whole";

      const drawerCount = Math.max(
        1,
        Math.min(8, Math.round(Number(options.drawerCount) || 3)),
      );
      const drawerDepth = Math.max(80, Number(options.drawerDepth) || 450);
      const leftClearance = Math.max(
        0,
        Number(options.leftClearance) || 12.5,
      );
      const rightClearance = Math.max(
        0,
        Number(options.rightClearance) || 12.5,
      );
      const bottomClearance = Math.max(
        0,
        Number(options.bottomClearance) || 12,
      );
      const frontOverlay = Math.max(0, Number(options.frontOverlay) || 0);
      const drawerGap = Math.max(0, Number(options.drawerGap) || 0);
      const frontThickness = Math.max(
        1,
        Number(options.frontThickness) || Number(ctx.thickness) || 20,
      );

      const roundMm = (value) =>
        Number.isFinite(Number(value))
          ? Number(Number(value).toFixed(3))
          : 0;

      const fullBayRects = (ctx.bayRects || []).map((bay, index) => ({
        ...bay,
        bayIndex: bay.bayIndex || index + 1,
        y: ctx.overallRect.y,
        height: ctx.overallRect.height,
      }));

      let targets = [];

      if (scope === "opening") {
        targets = [...(ctx.openingRects || [])]
          .sort(
            (a, b) =>
              (a.rowIndex || 0) - (b.rowIndex || 0) ||
              (a.bayIndex || 0) - (b.bayIndex || 0),
          )
          .map((opening, index) => ({
            ...opening,
            targetIndex: index + 1,
          }));

        if (!targets.length) {
          toast.error(
            "No cabinet openings found. Build a shelf/interior layout first or use Whole / Per Bay scope.",
          );
          return;
        }
      } else if (scope === "bay") {
        targets = fullBayRects.length
          ? fullBayRects
          : [
              {
                ...ctx.overallRect,
                bayIndex: 1,
              },
            ];
      } else {
        targets = [
          {
            ...ctx.overallRect,
            bayIndex: 1,
          },
        ];
      }

      const sideThickness = roundMm(
        Math.max(12, Math.min(20, Number(ctx.thickness) || 18)),
      );
      const bottomThickness = roundMm(
        Math.max(6, Math.min(12, sideThickness)),
      );
      const slideWidth = 10;
      const slideHeight = 12;
      const slideDepthInset = 10;
      const handleHeight = 12;
      const handleDepth = 20;

      const nextDrawerParts = [];
      let drawerAssemblyCount = 0;

      const buildTargetDrawers = (rect) => {
        const rectWidth = roundMm(Number(rect.width) || 0);
        const rectHeight = roundMm(Number(rect.height) || 0);
        const rectDepth = roundMm(Number(rect.depth) || 0);

        const boxWidth = roundMm(
          rectWidth - leftClearance - rightClearance,
        );

        if (boxWidth <= sideThickness * 2 + 20) {
          return {
            supported: false,
            reason:
              "Drawer opening is too narrow after left/right slide clearance.",
          };
        }

        const totalGap = drawerGap * Math.max(0, drawerCount - 1);
        const slotHeight = roundMm(
          (rectHeight - totalGap) / drawerCount,
        );

        if (slotHeight < 80) {
          return {
            supported: false,
            reason:
              "Not enough opening height for the requested drawer count and gap.",
          };
        }

        const sideHeight = roundMm(slotHeight - bottomClearance);

        if (sideHeight <= bottomThickness + 20) {
          return {
            supported: false,
            reason:
              "Bottom clearance is too large for the available drawer opening height.",
          };
        }

        const boxFrontZ = roundMm(Number(ctx.frontZ) - frontThickness);
        const availableDepth = roundMm(boxFrontZ - Number(rect.z || 0));
        const safeDrawerDepth = roundMm(
          Math.min(drawerDepth, rectDepth, availableDepth),
        );

        if (safeDrawerDepth < 80) {
          return {
            supported: false,
            reason:
              "Drawer depth does not fit inside this cabinet opening.",
          };
        }

        const boxX = roundMm(Number(rect.x) + leftClearance);
        const boxZ = roundMm(boxFrontZ - safeDrawerDepth);
        const innerBoxWidth = roundMm(boxWidth - sideThickness * 2);
        const innerBoxDepth = roundMm(safeDrawerDepth - sideThickness);

        if (innerBoxWidth <= 20 || innerBoxDepth <= 20) {
          return {
            supported: false,
            reason: "Drawer box is too small for the selected settings.",
          };
        }

        const frontTotalHeight = roundMm(rectHeight + frontOverlay * 2);
        const frontEachHeight = roundMm(
          (frontTotalHeight - totalGap) / drawerCount,
        );
        const frontWidth = roundMm(rectWidth + frontOverlay * 2);
        const frontX = roundMm(Number(rect.x) - frontOverlay);
        const firstFrontY = roundMm(Number(rect.y) - frontOverlay);

        if (frontEachHeight <= 20 || frontWidth <= 20) {
          return {
            supported: false,
            reason: "Drawer front overlay/gap settings are not valid.",
          };
        }

        const bayIndex = Number(rect.bayIndex) || 1;
        const rowIndex = Number(rect.rowIndex) || 1;
        const targetPrefix =
          scope === "whole"
            ? "CAB-DRW"
            : scope === "bay"
              ? `CAB-B${bayIndex}-DRW`
              : `CAB-B${bayIndex}-R${rowIndex}-DRW`;

        for (let index = 0; index < drawerCount; index += 1) {
          const drawerNumber = index + 1;
          const drawerSuffix = String(drawerNumber).padStart(2, "0");
          const drawerAssemblyId = makeGroupId();
          const slotY = roundMm(
            Number(rect.y) + index * (slotHeight + drawerGap),
          );
          const frontY = roundMm(
            firstFrontY + index * (frontEachHeight + drawerGap),
          );

          const common = {
            drawerBuilderGenerated: true,
            drawerBuilderVersion: 1,
            drawerAssemblyId,
            drawerIndex: drawerNumber,
            drawerTargetScope: scope,
            drawerTargetBayIndex: bayIndex,
            drawerTargetRowIndex: rowIndex,
            drawerDepth: safeDrawerDepth,
            drawerLeftClearance: roundMm(leftClearance),
            drawerRightClearance: roundMm(rightClearance),
            drawerBottomClearance: roundMm(bottomClearance),
            drawerFrontOverlay: roundMm(frontOverlay),
            drawerGap: roundMm(drawerGap),
            unitPrice: 0,
            groupUnitPrice: 0,
            qty: 1,
            locked: false,
          };

          const front = ctx.buildPart({
            ...common,
            type: "drawer_front_panel",
            partRole: "drawer_front",
            label: `Drawer Front ${drawerNumber}`,
            partCode: `${targetPrefix}-${drawerSuffix}-F`,
            x: frontX,
            y: frontY,
            z: boxFrontZ,
            width: frontWidth,
            height: frontEachHeight,
            depth: roundMm(frontThickness),
          });

          const leftSide = ctx.buildPart({
            ...common,
            type: "drawer_side_panel",
            partRole: "drawer_side",
            drawerSide: "left",
            label: `Drawer Side L ${drawerNumber}`,
            partCode: `${targetPrefix}-${drawerSuffix}-SL`,
            x: boxX,
            y: slotY,
            z: boxZ,
            width: sideThickness,
            height: sideHeight,
            depth: safeDrawerDepth,
          });

          const rightSide = ctx.buildPart({
            ...common,
            type: "drawer_side_panel",
            partRole: "drawer_side",
            drawerSide: "right",
            label: `Drawer Side R ${drawerNumber}`,
            partCode: `${targetPrefix}-${drawerSuffix}-SR`,
            x: roundMm(boxX + boxWidth - sideThickness),
            y: slotY,
            z: boxZ,
            width: sideThickness,
            height: sideHeight,
            depth: safeDrawerDepth,
          });

          const back = ctx.buildPart({
            ...common,
            type: "drawer_back_panel",
            partRole: "drawer_back",
            label: `Drawer Back ${drawerNumber}`,
            partCode: `${targetPrefix}-${drawerSuffix}-B`,
            x: roundMm(boxX + sideThickness),
            y: slotY,
            z: boxZ,
            width: innerBoxWidth,
            height: sideHeight,
            depth: sideThickness,
          });

          const bottom = ctx.buildPart({
            ...common,
            type: "drawer_bottom_panel",
            partRole: "drawer_bottom",
            label: `Drawer Bottom ${drawerNumber}`,
            partCode: `${targetPrefix}-${drawerSuffix}-BT`,
            x: roundMm(boxX + sideThickness),
            y: roundMm(slotY + sideHeight - bottomThickness),
            z: roundMm(boxZ + sideThickness),
            width: innerBoxWidth,
            height: bottomThickness,
            depth: innerBoxDepth,
          });

          const handleWidth = roundMm(
            Math.min(128, Math.max(64, frontWidth * 0.25)),
          );

          const handle = ctx.buildPart({
            ...common,
            type: "drawer_handle",
            partRole: "drawer_handle",
            parentPartId: front.id,
            label: `Drawer Handle ${drawerNumber}`,
            partCode: `${targetPrefix}-${drawerSuffix}-HDL`,
            x: roundMm(frontX + (frontWidth - handleWidth) / 2),
            y: roundMm(frontY + frontEachHeight * 0.42),
            z: roundMm(Number(ctx.frontZ)),
            width: handleWidth,
            height: handleHeight,
            depth: handleDepth,
            material: "Metal",
            fill: "#64748b",
          });

          const slideDepth = roundMm(
            Math.max(40, safeDrawerDepth - slideDepthInset),
          );
          const slideY = roundMm(slotY + Math.max(12, sideHeight * 0.55));

          const leftSlide = ctx.buildPart({
            ...common,
            type: "drawer_slide",
            partRole: "drawer_slide",
            drawerSide: "left",
            parentDrawerId: drawerAssemblyId,
            label: `Drawer Slide L ${drawerNumber}`,
            partCode: `${targetPrefix}-${drawerSuffix}-SDL`,
            x: roundMm(Number(rect.x)),
            y: slideY,
            z: boxZ,
            width: slideWidth,
            height: slideHeight,
            depth: slideDepth,
            material: "Metal",
            fill: "#64748b",
          });

          const rightSlide = ctx.buildPart({
            ...common,
            type: "drawer_slide",
            partRole: "drawer_slide",
            drawerSide: "right",
            parentDrawerId: drawerAssemblyId,
            label: `Drawer Slide R ${drawerNumber}`,
            partCode: `${targetPrefix}-${drawerSuffix}-SDR`,
            x: roundMm(Number(rect.x) + rectWidth - slideWidth),
            y: slideY,
            z: boxZ,
            width: slideWidth,
            height: slideHeight,
            depth: slideDepth,
            material: "Metal",
            fill: "#64748b",
          });

          nextDrawerParts.push(
            front,
            leftSide,
            rightSide,
            back,
            bottom,
            handle,
            leftSlide,
            rightSlide,
          );
          drawerAssemblyCount += 1;
        }

        return { supported: true };
      };

      for (let index = 0; index < targets.length; index += 1) {
        const result = buildTargetDrawers(targets[index]);

        if (!result.supported) {
          toast.error(result.reason || "Drawer layout is not valid.");
          return;
        }
      }

      const signature = (item) =>
        JSON.stringify({
          type: item?.type || "",
          partRole: item?.partRole || "",
          label: item?.label || "",
          partCode: item?.partCode || "",
          drawerIndex: Number(item?.drawerIndex) || 0,
          drawerTargetScope: item?.drawerTargetScope || "",
          drawerTargetBayIndex: Number(item?.drawerTargetBayIndex) || 0,
          drawerTargetRowIndex: Number(item?.drawerTargetRowIndex) || 0,
          drawerDepth: roundMm(item?.drawerDepth || 0),
          drawerLeftClearance: roundMm(item?.drawerLeftClearance || 0),
          drawerRightClearance: roundMm(item?.drawerRightClearance || 0),
          drawerBottomClearance: roundMm(item?.drawerBottomClearance || 0),
          drawerFrontOverlay: roundMm(item?.drawerFrontOverlay || 0),
          drawerGap: roundMm(item?.drawerGap || 0),
          drawerSide: item?.drawerSide || "",
          material: item?.material || "",
          x: roundMm(item?.x || 0),
          y: roundMm(item?.y || 0),
          z: roundMm(item?.z || 0),
          width: roundMm(item?.width || 0),
          height: roundMm(item?.height || 0),
          depth: roundMm(item?.depth || 0),
        });

      const currentSignatures = currentGeneratedDrawerParts
        .map(signature)
        .sort()
        .join("|");
      const nextSignatures = nextDrawerParts.map(signature).sort().join("|");

      if (
        currentGeneratedDrawerParts.length === nextDrawerParts.length &&
        currentSignatures === nextSignatures
      ) {
        toast.success("Drawer layout already matches the current settings.");
        return;
      }

      const removeDrawerIds = new Set(
        currentGeneratedDrawerParts.map((item) => item.id),
      );

      pushHistory(
        Array.isArray(components)
          ? components.map((item) => normalizeComponent(item))
          : [],
      );

      const nextComponents = components
        .filter((item) => !removeDrawerIds.has(item.id))
        .concat(nextDrawerParts);

      setComponents(nextComponents);
      setSelectedIds(nextDrawerParts.map((item) => item.id));
      setSelectedId(nextDrawerParts[0]?.id || ctx.primaryId);
      setEdit3DId(nextDrawerParts[0]?.id || ctx.primaryId);
      setTransformMode("translate");

      const scopeLabel =
        scope === "opening"
          ? "per opening"
          : scope === "bay"
            ? "per bay"
            : "whole opening";

      toast.success(
        `${drawerAssemblyCount} drawer assembl${drawerAssemblyCount === 1 ? "y" : "ies"} applied ${scopeLabel} (${nextDrawerParts.length} parts).`,
      );
    },
    [
      editorMode,
      view,
      getCabinetBuilderContext3D,
      isLocked,
      components,
      pushHistory,
    ],
  );
  const buildCabinetFrontPreset3D = useCallback(
    (options = {}) => {
      if (editorMode !== "editable") {
        toast.error("Reference mode ito. Lumipat muna sa editable mode.");
        return;
      }

      const ctx = getCabinetBuilderContext3D();
      if (!ctx) return;

      const preset = String(options.preset || "double-door");
      const targetBayIndex = Math.max(1, Number(options.targetBayIndex) || 1);
      const nextFrontParts = [];

      const bayFullRects = ctx.bayRects.map((bay) => ({
        ...bay,
        y: ctx.overallRect.y,
        height: ctx.overallRect.height,
      }));

      const orderedOpenings = [...ctx.openingRects].sort(
        (a, b) => a.rowIndex - b.rowIndex || a.bayIndex - b.bayIndex,
      );

      if (preset === "double-door") {
        nextFrontParts.push(
          ...createDoorPairFrontParts3D(
            ctx,
            ctx.overallRect,
            options,
            "CAB-FRONT",
            "Cabinet",
          ),
        );
      } else if (preset === "drawer-stack") {
        nextFrontParts.push(
          ...createDrawerStackFrontParts3D(
            ctx,
            ctx.overallRect,
            options,
            "CAB-DRW",
            "Cabinet Drawer",
          ),
        );
      } else if (preset === "split-double-doors") {
        orderedOpenings.forEach((opening) => {
          nextFrontParts.push(
            ...createDoorPairFrontParts3D(
              ctx,
              opening,
              options,
              `B${opening.bayIndex}-R${opening.rowIndex}`,
              `Bay ${opening.bayIndex} Row ${opening.rowIndex}`,
            ),
          );
        });
      } else if (preset === "left-doors-right-drawers") {
        bayFullRects.forEach((bay) => {
          if (bay.bayIndex === 1) {
            nextFrontParts.push(
              ...createDoorPairFrontParts3D(
                ctx,
                bay,
                options,
                `B${bay.bayIndex}-FRONT`,
                `Bay ${bay.bayIndex}`,
              ),
            );
          } else {
            nextFrontParts.push(
              ...createDrawerStackFrontParts3D(
                ctx,
                bay,
                options,
                `B${bay.bayIndex}-DRW`,
                `Bay ${bay.bayIndex} Drawer`,
              ),
            );
          }
        });
      } else if (preset === "top-drawers-bottom-doors") {
        const topRow = orderedOpenings.length
          ? Math.min(...orderedOpenings.map((opening) => opening.rowIndex))
          : 1;

        orderedOpenings.forEach((opening) => {
          if (opening.rowIndex === topRow) {
            nextFrontParts.push(
              ...createDrawerStackFrontParts3D(
                ctx,
                opening,
                options,
                `B${opening.bayIndex}-R${opening.rowIndex}-DRW`,
                `Bay ${opening.bayIndex} Row ${opening.rowIndex} Drawer`,
              ),
            );
          } else {
            nextFrontParts.push(
              ...createDoorPairFrontParts3D(
                ctx,
                opening,
                options,
                `B${opening.bayIndex}-R${opening.rowIndex}-DOOR`,
                `Bay ${opening.bayIndex} Row ${opening.rowIndex}`,
              ),
            );
          }
        });
      } else if (preset === "single-bay-drawer-stack") {
        bayFullRects.forEach((bay) => {
          if (bay.bayIndex === targetBayIndex) {
            nextFrontParts.push(
              ...createDrawerStackFrontParts3D(
                ctx,
                bay,
                options,
                `B${bay.bayIndex}-DRW`,
                `Bay ${bay.bayIndex} Drawer`,
              ),
            );
          } else {
            nextFrontParts.push(
              ...createDoorPairFrontParts3D(
                ctx,
                bay,
                options,
                `B${bay.bayIndex}-DOOR`,
                `Bay ${bay.bayIndex}`,
              ),
            );
          }
        });
      } else {
        nextFrontParts.push(
          ...createDoorPairFrontParts3D(
            ctx,
            ctx.overallRect,
            options,
            "CAB-FRONT",
            "Cabinet",
          ),
        );
      }

      pushHistory(
        Array.isArray(components)
          ? components.map((item) => normalizeComponent(item))
          : [],
      );

      const nextComponents = components
        .filter((item) => !ctx.removeFrontIds.has(item.id))
        .concat(nextFrontParts);

      setComponents(nextComponents);
      setSelectedIds(nextFrontParts.map((item) => item.id));
      setSelectedId(nextFrontParts[0]?.id || ctx.primaryId);
      setEdit3DId(nextFrontParts[0]?.id || ctx.primaryId);
      setTransformMode("translate");

      toast.success("Cabinet front preset applied.");
    },
    [
      editorMode,
      getCabinetBuilderContext3D,
      createDoorPairFrontParts3D,
      createDrawerStackFrontParts3D,
      components,
      pushHistory,
    ],
  );

  const buildCabinetCustomBayFronts3D = useCallback(
    (options = {}) => {
      if (editorMode !== "editable") {
        toast.error("Reference mode ito. Lumipat muna sa editable mode.");
        return;
      }

      const ctx = getCabinetBuilderContext3D();
      if (!ctx) return;

      const assignments = Array.isArray(options.assignments)
        ? options.assignments
        : [options.bay1Type, options.bay2Type, options.bay3Type].filter(
            Boolean,
          );

      const bayFullRects = ctx.bayRects.map((bay) => ({
        ...bay,
        y: ctx.overallRect.y,
        height: ctx.overallRect.height,
      }));

      const nextFrontParts = [];

      bayFullRects.forEach((bay, index) => {
        const type = assignments[index] || "door";

        if (type === "open") return;

        if (type === "drawer") {
          nextFrontParts.push(
            ...createDrawerStackFrontParts3D(
              ctx,
              bay,
              options,
              `B${bay.bayIndex}-DRW`,
              `Bay ${bay.bayIndex} Drawer`,
            ),
          );
        } else {
          nextFrontParts.push(
            ...createDoorPairFrontParts3D(
              ctx,
              bay,
              options,
              `B${bay.bayIndex}-DOOR`,
              `Bay ${bay.bayIndex}`,
            ),
          );
        }
      });

      pushHistory(
        Array.isArray(components)
          ? components.map((item) => normalizeComponent(item))
          : [],
      );

      const nextComponents = components
        .filter((item) => !ctx.removeFrontIds.has(item.id))
        .concat(nextFrontParts);

      setComponents(nextComponents);
      setSelectedIds(nextFrontParts.map((item) => item.id));
      setSelectedId(nextFrontParts[0]?.id || ctx.primaryId);
      setEdit3DId(nextFrontParts[0]?.id || ctx.primaryId);
      setTransformMode("translate");

      toast.success("Custom per-bay fronts applied.");
    },
    [
      editorMode,
      getCabinetBuilderContext3D,
      createDoorPairFrontParts3D,
      createDrawerStackFrontParts3D,
      components,
      pushHistory,
    ],
  );

  const buildCabinetCustomCellFronts3D = useCallback(
    (options = {}) => {
      if (editorMode !== "editable") {
        toast.error("Reference mode ito. Lumipat muna sa editable mode.");
        return;
      }

      const ctx = getCabinetBuilderContext3D();
      if (!ctx) return;

      if (!ctx.openingRects.length) {
        toast.error(
          "No cabinet openings found. Build the interior layout first.",
        );
        return;
      }

      const assignments = Array.isArray(options.assignments)
        ? options.assignments
        : [
            options.cell1Type,
            options.cell2Type,
            options.cell3Type,
            options.cell4Type,
            options.cell5Type,
            options.cell6Type,
            options.cell7Type,
            options.cell8Type,
            options.cell9Type,
          ];

      const orderedOpenings = [...ctx.openingRects].sort(
        (a, b) => a.rowIndex - b.rowIndex || a.bayIndex - b.bayIndex,
      );

      const nextFrontParts = [];

      orderedOpenings.forEach((opening, index) => {
        const type = assignments[index] || "door";

        if (type === "open") return;

        if (type === "drawer") {
          nextFrontParts.push(
            ...createDrawerStackFrontParts3D(
              ctx,
              opening,
              options,
              `CELL-${index + 1}-DRW`,
              `Cell ${index + 1} Drawer`,
            ),
          );
        } else {
          nextFrontParts.push(
            ...createDoorPairFrontParts3D(
              ctx,
              opening,
              options,
              `CELL-${index + 1}-DOOR`,
              `Cell ${index + 1}`,
            ),
          );
        }
      });

      pushHistory(
        Array.isArray(components)
          ? components.map((item) => normalizeComponent(item))
          : [],
      );

      const nextComponents = components
        .filter((item) => !ctx.removeFrontIds.has(item.id))
        .concat(nextFrontParts);

      setComponents(nextComponents);
      setSelectedIds(nextFrontParts.map((item) => item.id));
      setSelectedId(nextFrontParts[0]?.id || ctx.primaryId);
      setEdit3DId(nextFrontParts[0]?.id || ctx.primaryId);
      setTransformMode("translate");

      toast.success("Custom per-opening fronts applied.");
    },
    [
      editorMode,
      getCabinetBuilderContext3D,
      createDoorPairFrontParts3D,
      createDrawerStackFrontParts3D,
      components,
      pushHistory,
    ],
  );

  return {
    buildSimpleTable3D,
    buildCabinetBox3D,
    buildCabinetShelfLayout3D,
    buildCabinetInteriorPreset3D,
    buildCabinetDoorLayout3D,
    buildCabinetDrawerLayout3D,
    buildCabinetFrontPreset3D,
    buildCabinetCustomBayFronts3D,
    buildCabinetCustomCellFronts3D,
  };
}
