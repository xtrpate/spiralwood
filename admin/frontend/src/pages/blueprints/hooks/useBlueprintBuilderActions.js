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
    buildCabinetBox3D,
    buildCabinetInteriorPreset3D,
    buildCabinetFrontPreset3D,
    buildCabinetCustomBayFronts3D,
    buildCabinetCustomCellFronts3D,
  };
}
