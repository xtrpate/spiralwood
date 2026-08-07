import { useCallback, useMemo } from "react";
import toast from "react-hot-toast";

import { normalizeComponent } from "../data/componentUtils";
import { clamp, makeGroupId, snap } from "../data/utils";
import { createObjectId, deepClone } from "../data/editorUtils";
import { getSelectionBoundsXYZ } from "../data/selectionUtils";
import {
  analyzeSmartAssemblyResize,
  buildSmartAssemblyResizePlan,
} from "../data/smartAssemblyResize";

export function useBlueprintArrangementActions({
  components,
  setComponents,
  selectedId,
  selectedIds,
  setSelectedId,
  setSelectedIds,
  setEdit3DId,
  setTransformMode,
  editorMode,
  isLocked,
  pushHistory,
  updateManyComps,
  getAssemblyItemsFromComponent,
  activeSelectionIds3D,
  activeSelectedComponents3D,
  hasLockedSmartSelection3D,
  worldHeight,
  floorOffset = 40,
  gridSize = 20,
}) {
  const GRID_SIZE = gridSize;
  const WORLD_H = Number(worldHeight) || 3200;
  const FLOOR_OFFSET = Number(floorOffset) || 40;

  const getSmartWidthResizeAssembly3D = useCallback(() => {
    const primaryId =
      selectedId || selectedIds?.[0] || activeSelectionIds3D?.[0] || null;

    if (!primaryId) return [];
    return getAssemblyItemsFromComponent(primaryId)
      .map((item) => normalizeComponent(item))
      .filter((item) => item?.id);
  }, [
    selectedId,
    selectedIds,
    activeSelectionIds3D,
    getAssemblyItemsFromComponent,
  ]);

  const smartWidthResizeContext3D = useMemo(() => {
    const assemblyItems = getSmartWidthResizeAssembly3D();
    return {
      ...analyzeSmartAssemblyResize(assemblyItems),
      hasLockedAssemblyPart: assemblyItems.some((item) => isLocked(item)),
    };
  }, [getSmartWidthResizeAssembly3D, isLocked]);

  const previewSmartWidthResize3D = useCallback(
    (dimension = "width", newValue, anchor = "center") => {
      return buildSmartAssemblyResizePlan(getSmartWidthResizeAssembly3D(), {
        dimension,
        newValue,
        anchor,
      });
    },
    [getSmartWidthResizeAssembly3D],
  );

  const applySmartWidthResize3D = useCallback(
    (dimension = "width", newValue, anchor = "center") => {
      if (editorMode !== "editable") {
        toast.error("Reference mode ito. Lumipat muna sa editable mode.");
        return null;
      }

      const assemblyItems = getSmartWidthResizeAssembly3D();
      const hasLockedAssemblyPart = assemblyItems.some((item) => isLocked(item));

      if (hasLockedAssemblyPart) {
        toast.error(
          "Cannot resize. One or more parts in the assembly are locked.",
        );
        return null;
      }

      const plan = buildSmartAssemblyResizePlan(assemblyItems, {
        dimension,
        newValue,
        anchor,
      });

      if (!plan.supported) {
        toast.error(plan.reason || "Controlled assembly resize is not available.");
        return plan;
      }

      updateManyComps(plan.changesById);

      const nextPrimaryId = plan.assemblyIds.includes(selectedId)
        ? selectedId
        : plan.assemblyIds[0] || null;

      setSelectedIds(plan.assemblyIds);
      setSelectedId(nextPrimaryId);
      setEdit3DId(nextPrimaryId);
      setTransformMode("translate");

      toast.success(
        `${plan.assemblyLabel} ${plan.dimensionLabel.toLowerCase()} resized from ${Math.round(
          plan.previousValue,
        )} mm to ${Math.round(plan.requestedValue)} mm.`,
      );

      return plan;
    },
    [
      editorMode,
      getSmartWidthResizeAssembly3D,
      isLocked,
      updateManyComps,
      selectedId,
    ],
  );

  const getSmartAxisMeta = useCallback((axis) => {
    if (axis === "x") return { posKey: "x", sizeKey: "width", label: "X" };
    if (axis === "y") return { posKey: "y", sizeKey: "height", label: "Y" };
    return { posKey: "z", sizeKey: "depth", label: "Z" };
  }, []);

  const applySelectionGap3D = useCallback(
    (axis, gap = 0, anchorMode = "preserve-first") => {
      if (editorMode !== "editable") {
        toast.error("Reference mode ito. Lumipat muna sa editable mode.");
        return;
      }

      if (hasLockedSmartSelection3D) {
        toast.error(
          "Cannot apply equal gap. One or more selected components are locked.",
        );
        return;
      }

      if (activeSelectedComponents3D.length < 2) {
        toast.error("Select at least 2 objects to apply gap.");
        return;
      }

      const safeGap = snap(Math.max(0, Number(gap) || 0));
      const { posKey, sizeKey, label } = getSmartAxisMeta(axis);

      const sorted = [...activeSelectedComponents3D].sort(
        (a, b) =>
          (Number(a[posKey]) || 0) - (Number(b[posKey]) || 0) ||
          (Number(a[sizeKey]) || 0) - (Number(b[sizeKey]) || 0),
      );

      const bounds = getSelectionBoundsXYZ(sorted);
      if (!bounds) return;

      const totalSpan =
        sorted.reduce((sum, comp) => sum + (Number(comp[sizeKey]) || 0), 0) +
        safeGap * Math.max(0, sorted.length - 1);

      const first = sorted[0];
      const last = sorted[sorted.length - 1];

      let cursor = Number(first[posKey]) || 0;

      if (anchorMode === "preserve-last") {
        const lastEnd =
          (Number(last[posKey]) || 0) + (Number(last[sizeKey]) || 0);
        cursor = snap(lastEnd - totalSpan);
      } else if (anchorMode === "center") {
        const axisCenter =
          axis === "x"
            ? bounds.centerX
            : axis === "y"
              ? bounds.centerY
              : bounds.centerZ;

        cursor = snap(axisCenter - totalSpan / 2);
      }

      const changesById = {};

      sorted.forEach((comp) => {
        changesById[comp.id] = {
          [posKey]: snap(cursor),
        };

        cursor += (Number(comp[sizeKey]) || 0) + safeGap;
      });

      updateManyComps(changesById);
      setTransformMode("translate");

      const modeLabel =
        anchorMode === "preserve-last"
          ? "Preserve Last"
          : anchorMode === "center"
            ? "Center"
            : "Preserve First";

      toast.success(
        `Applied ${safeGap}mm equal gap on ${label} axis (${modeLabel}).`,
      );
    },
    [
      editorMode,
      hasLockedSmartSelection3D,
      activeSelectedComponents3D,
      getSmartAxisMeta,
      getSelectionBoundsXYZ,
      updateManyComps,
    ],
  );

  const distributeSelection3D = useCallback(
    (axis, anchorMode = "preserve-first") => {
      if (editorMode !== "editable") {
        toast.error("Reference mode ito. Lumipat muna sa editable mode.");
        return;
      }

      if (hasLockedSmartSelection3D) {
        toast.error(
          "Cannot distribute. One or more selected components are locked.",
        );
        return;
      }

      if (activeSelectedComponents3D.length < 3) {
        toast.error("Select at least 3 objects to distribute.");
        return;
      }

      const { posKey, sizeKey, label } = getSmartAxisMeta(axis);

      const sorted = [...activeSelectedComponents3D].sort(
        (a, b) =>
          (Number(a[posKey]) || 0) - (Number(b[posKey]) || 0) ||
          (Number(a[sizeKey]) || 0) - (Number(b[sizeKey]) || 0),
      );

      const bounds = getSelectionBoundsXYZ(sorted);
      if (!bounds) return;

      const first = sorted[0];
      const last = sorted[sorted.length - 1];

      const minStart = Number(first[posKey]) || 0;
      const maxEnd = (Number(last[posKey]) || 0) + (Number(last[sizeKey]) || 0);

      const totalSize = sorted.reduce(
        (sum, comp) => sum + (Number(comp[sizeKey]) || 0),
        0,
      );

      const gapCount = sorted.length - 1;
      const totalGap = maxEnd - minStart - totalSize;

      if (gapCount <= 0) return;

      if (totalGap < 0) {
        toast.error(
          "Selection span is too tight to distribute without overlap.",
        );
        return;
      }

      const evenGap = snap(totalGap / gapCount);
      const totalLineSpan = totalSize + evenGap * gapCount;

      let cursor = minStart;

      if (anchorMode === "preserve-last") {
        cursor = snap(maxEnd - totalLineSpan);
      } else if (anchorMode === "center") {
        const axisCenter =
          axis === "x"
            ? bounds.centerX
            : axis === "y"
              ? bounds.centerY
              : bounds.centerZ;

        cursor = snap(axisCenter - totalLineSpan / 2);
      }

      const changesById = {};

      sorted.forEach((comp) => {
        changesById[comp.id] = {
          [posKey]: snap(cursor),
        };

        cursor += (Number(comp[sizeKey]) || 0) + evenGap;
      });

      updateManyComps(changesById);
      setTransformMode("translate");

      const modeLabel =
        anchorMode === "preserve-last"
          ? "Preserve Last"
          : anchorMode === "center"
            ? "Center"
            : "Preserve First";

      toast.success(
        `Distributed ${sorted.length} object(s) on ${label} axis (${modeLabel}).`,
      );
    },
    [
      editorMode,
      hasLockedSmartSelection3D,
      activeSelectedComponents3D,
      getSmartAxisMeta,
      getSelectionBoundsXYZ,
      updateManyComps,
    ],
  );


  const autoLegLayout3D = useCallback(
    (inset = 40, legSize = 50) => {
      if (editorMode !== "editable") {
        toast.error("Reference mode ito. Lumipat muna sa editable mode.");
        return;
      }

      const primaryId =
        selectedId || selectedIds?.[0] || activeSelectionIds3D?.[0] || null;

      if (!primaryId) {
        toast.error("Select a table/furniture assembly first.");
        return;
      }

      const assemblyItems = getAssemblyItemsFromComponent(primaryId)
        .map((item) => normalizeComponent(item))
        .filter((item) => item?.id);

      if (assemblyItems.length < 2) {
        toast.error(
          "Leg Layout needs a furniture assembly. Create/select an assembly first.",
        );
        return;
      }

      const lockedAssemblyPart = assemblyItems.find((item) => isLocked(item));

      if (lockedAssemblyPart) {
        toast.error(
          "Cannot apply Leg Layout. Unlock all parts in the assembly first.",
        );
        return;
      }

      const textOf = (item) =>
        `${item?.label || ""} ${item?.partCode || ""} ${item?.type || ""} ${
          item?.partRole || ""
        }`
          .toLowerCase()
          .trim();

      const isLegLike = (item) => {
        const role = String(item?.partRole || "").toLowerCase();
        const text = textOf(item);
        return (
          role === "leg" ||
          item?.type === "furniture_leg" ||
          /(^|[\s_-])leg([\s_-]|$)/i.test(text)
        );
      };

      const isApronLike = (item) => {
        const role = String(item?.partRole || "").toLowerCase();
        const text = textOf(item);
        return role === "apron_rail" || text.includes("apron") || text.includes("rail");
      };

      const isCabinetShellLike = (item) => {
        const role = String(item?.partRole || "").toLowerCase();
        const text = textOf(item);
        return (
          ["side_panel", "back_panel", "bottom_panel", "divider"].includes(role) ||
          text.includes("cabinet") ||
          text.includes("wardrobe") ||
          text.includes("closet")
        );
      };

      const legParts = assemblyItems.filter(isLegLike);
      const nonLegParts = assemblyItems.filter((item) => !isLegLike(item));

      if (![0, 4].includes(legParts.length)) {
        toast.error(
          `Leg Layout found ${legParts.length} leg parts. Use an assembly with exactly 0 or 4 legs.`,
        );
        return;
      }

      if (!nonLegParts.length) {
        toast.error("No tabletop/body was found in the selected assembly.");
        return;
      }

      const assemblyText = [
        assemblyItems[0]?.assemblyName,
        assemblyItems[0]?.assemblyType,
        assemblyItems[0]?.groupLabel,
        assemblyItems[0]?.groupType,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const explicitlyTableLike =
        assemblyText.includes("table") ||
        assemblyText.includes("desk") ||
        assemblyText.includes("coffee");

      const cabinetLike =
        assemblyText.includes("cabinet") ||
        assemblyText.includes("wardrobe") ||
        assemblyText.includes("closet") ||
        (!explicitlyTableLike &&
          assemblyItems.filter(isCabinetShellLike).length >= 3);

      if (cabinetLike) {
        toast.error(
          "Leg Layout is for table/furniture assemblies, not cabinet/wardrobe assemblies.",
        );
        return;
      }

      const scoreHost = (item) => {
        const role = String(item?.partRole || "").toLowerCase();
        const text = textOf(item);
        const width = Math.max(0, Number(item?.width) || 0);
        const depth = Math.max(0, Number(item?.depth) || 0);
        const area = width * depth;

        let score = area;

        if (
          role === "top_panel" ||
          text.includes("tabletop") ||
          text.includes("table top") ||
          text.includes("top panel")
        ) {
          score += 1_000_000_000;
        }

        if (role === "shelf" || text.includes("shelf")) {
          score -= 100_000_000;
        }

        if (isApronLike(item)) {
          score -= 100_000_000;
        }

        // For similar footprints, prefer the physically higher part.
        score -= Number(item?.y) || 0;

        return score;
      };

      const host = [...nonLegParts].sort(
        (a, b) => scoreHost(b) - scoreHost(a),
      )[0];

      if (!host) {
        toast.error("No tabletop/body was found in the selected assembly.");
        return;
      }

      const hostRotationY = Math.abs(Number(host.rotationY) || 0) % 360;
      if (hostRotationY > 0.001 && Math.abs(hostRotationY - 360) > 0.001) {
        toast.error(
          "Leg Layout currently requires an unrotated tabletop/body (Rotation Y = 0°).",
        );
        return;
      }

      const hostX = Number(host.x) || 0;
      const hostY = Number(host.y) || 0;
      const hostZ = Number(host.z) || 0;
      const hostWidth = Number(host.width) || 0;
      const hostHeight = Number(host.height) || 0;
      const hostDepth = Number(host.depth) || 0;

      if (hostWidth <= 0 || hostDepth <= 0 || hostHeight <= 0) {
        toast.error("Tabletop/body dimensions are invalid for Leg Layout.");
        return;
      }

      const safeInset = Math.max(0, Number(inset) || 0);
      const safeLegSize = Math.max(
        1,
        Number(legSize) ||
          (legParts.length
            ? Math.min(
                ...legParts.flatMap((leg) => [
                  Number(leg.width) || 50,
                  Number(leg.depth) || 50,
                ]),
              )
            : 50),
      );

      if (
        safeInset * 2 + safeLegSize >= hostWidth ||
        safeInset * 2 + safeLegSize >= hostDepth
      ) {
        toast.error(
          "Inset/leg size is too large for the selected tabletop/body.",
        );
        return;
      }

      const roundMm = (value) =>
        Number.isFinite(Number(value))
          ? Number(Number(value).toFixed(3))
          : 0;

      const undersideY = roundMm(hostY + hostHeight);
      const floorY = roundMm(WORLD_H - FLOOR_OFFSET);
      const generatedLegHeight = roundMm(
        Math.max(GRID_SIZE, floorY - undersideY),
      );

      if (!legParts.length && generatedLegHeight <= 0) {
        toast.error(
          "Cannot infer leg height from the current tabletop/body position.",
        );
        return;
      }

      const slotMeta = [
        {
          key: "front-left",
          label: "Front Left Leg",
          code: "LEG-FL",
          x: roundMm(hostX + safeInset),
          z: roundMm(hostZ + safeInset),
        },
        {
          key: "front-right",
          label: "Front Right Leg",
          code: "LEG-FR",
          x: roundMm(hostX + hostWidth - safeInset - safeLegSize),
          z: roundMm(hostZ + safeInset),
        },
        {
          key: "back-left",
          label: "Back Left Leg",
          code: "LEG-BL",
          x: roundMm(hostX + safeInset),
          z: roundMm(hostZ + hostDepth - safeInset - safeLegSize),
        },
        {
          key: "back-right",
          label: "Back Right Leg",
          code: "LEG-BR",
          x: roundMm(hostX + hostWidth - safeInset - safeLegSize),
          z: roundMm(hostZ + hostDepth - safeInset - safeLegSize),
        },
      ];

      let nextLegIds = [];

      if (legParts.length === 4) {
        const sortedLegs = [...legParts].sort(
          (a, b) =>
            (Number(a.z) || 0) - (Number(b.z) || 0) ||
            (Number(a.x) || 0) - (Number(b.x) || 0),
        );

        const changesById = {};

        sortedLegs.forEach((leg, index) => {
          const slot = slotMeta[index];
          changesById[leg.id] = {
            x: slot.x,
            y: undersideY,
            z: slot.z,
            width: safeLegSize,
            depth: safeLegSize,
            partRole: "leg",
            locked: false,
          };
        });

        const hasChanges = sortedLegs.some((leg) => {
          const attrs = changesById[leg.id];
          return Object.entries(attrs).some(
            ([key, value]) => !Object.is(leg?.[key], value),
          );
        });

        if (!hasChanges) {
          toast.success("4-leg layout already matches the current settings.");
          return;
        }

        pushHistory(
          Array.isArray(components)
            ? components.map((item) => normalizeComponent(item))
            : [],
        );

        const changeMap = new Map(Object.entries(changesById));

        setComponents((prev) =>
          prev.map((item) => {
            const attrs = changeMap.get(item.id);
            return attrs
              ? normalizeComponent({
                  ...item,
                  ...attrs,
                })
              : item;
          }),
        );

        nextLegIds = sortedLegs.map((leg) => leg.id);
      } else {
        const source = host;

        const generatedLegs = slotMeta.map((slot) =>
          normalizeComponent({
            ...deepClone(source),
            id: createObjectId(),
            type: "furniture_leg",
            category: "Furniture Parts",
            blueprintStyle: "part",
            label: slot.label,
            partCode: slot.code,
            partRole: "leg",
            x: slot.x,
            y: undersideY,
            z: slot.z,
            width: safeLegSize,
            height: generatedLegHeight,
            depth: safeLegSize,
            rotationX: 0,
            rotationY: 0,
            rotationZ: 0,
            unitPrice: 0,
            groupUnitPrice: 0,
            qty: 1,
            locked: false,
          }),
        );

        pushHistory(
          Array.isArray(components)
            ? components.map((item) => normalizeComponent(item))
            : [],
        );

        setComponents((prev) => [...prev, ...generatedLegs]);
        nextLegIds = generatedLegs.map((leg) => leg.id);
      }

      setSelectedIds(nextLegIds);
      setSelectedId(nextLegIds[0] || host.id);
      setEdit3DId(nextLegIds[0] || host.id);
      setTransformMode("translate");

      toast.success(
        legParts.length === 4
          ? `4-leg layout updated (${safeLegSize} mm legs, ${safeInset} mm inset).`
          : `4 legs created (${safeLegSize} mm, ${safeInset} mm inset).`,
      );
    },
    [
      editorMode,
      selectedId,
      selectedIds,
      activeSelectionIds3D,
      components,
      getAssemblyItemsFromComponent,
      isLocked,
      pushHistory,
      WORLD_H,
      FLOOR_OFFSET,
    ],
  );

  const getSmartBuilderHostAndTargets3D = useCallback(() => {
    if (!activeSelectedComponents3D.length) {
      return { host: null, targets: [] };
    }

    const getHostScore = (comp) => {
      const text =
        `${comp?.label || ""} ${comp?.partCode || ""} ${comp?.type || ""}`
          .toLowerCase()
          .trim();

      let score = 0;

      if (
        text.includes("body") ||
        text.includes("core") ||
        text.includes("cabinet") ||
        text.includes("carcass") ||
        text.includes("case") ||
        text.includes("box")
      ) {
        score += 5000;
      }

      if (
        text.includes("panel") ||
        text.includes("shelf") ||
        text.includes("door") ||
        text.includes("drawer") ||
        text.includes("leg")
      ) {
        score -= 1000;
      }

      const volume =
        (Number(comp?.width) || 0) *
        (Number(comp?.height) || 0) *
        (Number(comp?.depth) || 0);

      return score + volume;
    };

    const sorted = [...activeSelectedComponents3D].sort((a, b) => {
      const scoreDiff = getHostScore(b) - getHostScore(a);
      if (scoreDiff !== 0) return scoreDiff;

      if (b.id === selectedId) return 1;
      if (a.id === selectedId) return -1;
      return 0;
    });

    const host = sorted[0] || null;
    const targets = sorted.filter((item) => item.id !== host?.id);

    return { host, targets };
  }, [activeSelectedComponents3D, selectedId]);

  const getCabinetBuilderContext3D = useCallback(() => {
    const primaryId = selectedId || selectedIds[0] || null;

    if (!primaryId) {
      toast.error("Select a cabinet part first.");
      return null;
    }

    const assemblyItems = getAssemblyItemsFromComponent(primaryId)
      .map((item) => normalizeComponent(item))
      .filter((item) => item?.id);

    if (!assemblyItems.length) {
      toast.error("No cabinet assembly found from the current selection.");
      return null;
    }

    const textOf = (item) =>
      `${item?.label || ""} ${item?.partCode || ""} ${item?.type || ""}`
        .toLowerCase()
        .trim();

    const isFrontLike = (item) => {
      const text = textOf(item);
      return (
        item?.type === "door_front_panel" ||
        item?.type === "drawer_front_panel" ||
        item?.type === "body_front_panel" ||
        text.includes("front") ||
        text.includes("door") ||
        text.includes("drawer")
      );
    };

    const isDividerLike = (item) => {
      const text = textOf(item);
      return item?.type === "wr_divider" || text.includes("divider");
    };

    const isShelfLike = (item) => {
      const text = textOf(item);
      return item?.type === "wr_shelf" || text.includes("shelf");
    };

    const isBackLike = (item) => {
      const text = textOf(item);
      return item?.type === "wr_back_panel" || text.includes("back");
    };

    const isSideLike = (item) => {
      const text = textOf(item);
      return item?.type === "wr_side_panel" || text.includes("side");
    };

    const isTopLike = (item) => {
      const text = textOf(item);
      return item?.type === "wr_top_panel" || text.includes("top");
    };

    const isBottomLike = (item) => {
      const text = textOf(item);
      return item?.type === "wr_bottom_panel" || text.includes("bottom");
    };

    const frontParts = assemblyItems.filter(isFrontLike);
    const dividerParts = assemblyItems.filter(isDividerLike);
    const shelfParts = assemblyItems.filter(isShelfLike);
    const backParts = assemblyItems.filter(isBackLike);
    const sideParts = assemblyItems.filter(isSideLike);
    const topParts = assemblyItems.filter(isTopLike);
    const bottomParts = assemblyItems.filter(isBottomLike);

    const bodyParts = assemblyItems.filter(
      (item) => !frontParts.some((f) => f.id === item.id),
    );
    const shellParts = bodyParts.filter(
      (item) =>
        sideParts.some((p) => p.id === item.id) ||
        topParts.some((p) => p.id === item.id) ||
        bottomParts.some((p) => p.id === item.id) ||
        backParts.some((p) => p.id === item.id),
    );

    const shellBounds = getSelectionBoundsXYZ(
      bodyParts.length ? bodyParts : assemblyItems,
    );
    if (!shellBounds) {
      toast.error("Unable to compute cabinet bounds.");
      return null;
    }

    const thicknessSamples = [
      ...sideParts.map((p) => Number(p.width) || 0),
      ...topParts.map((p) => Number(p.height) || 0),
      ...bottomParts.map((p) => Number(p.height) || 0),
      ...dividerParts.map((p) => Number(p.width) || 0),
      ...shelfParts.map((p) => Number(p.height) || 0),
    ].filter((value) => value > 0);

    const thickness = snap(
      Math.max(
        GRID_SIZE,
        thicknessSamples.length ? Math.min(...thicknessSamples) : 20,
      ),
    );

    const backThicknessSamples = backParts
      .map((p) => Number(p.depth) || 0)
      .filter((value) => value > 0);

    const backThickness = snap(
      Math.max(
        GRID_SIZE,
        backThicknessSamples.length
          ? Math.min(...backThicknessSamples)
          : thickness,
      ),
    );

    const inner = {
      minX: snap(shellBounds.minX + thickness),
      maxX: snap(shellBounds.maxX - thickness),
      minY: snap(shellBounds.minY + thickness),
      maxY: snap(shellBounds.maxY - thickness),
      minZ: snap(shellBounds.minZ + backThickness),
      maxZ: snap(shellBounds.maxZ),
    };

    const innerWidth = snap(Math.max(GRID_SIZE, inner.maxX - inner.minX));
    const innerHeight = snap(Math.max(GRID_SIZE, inner.maxY - inner.minY));
    const innerDepth = snap(Math.max(GRID_SIZE, inner.maxZ - inner.minZ));

    if (
      innerWidth < GRID_SIZE ||
      innerHeight < GRID_SIZE ||
      innerDepth < GRID_SIZE
    ) {
      toast.error("Cabinet interior is too small.");
      return null;
    }

    const sortedDividers = [...dividerParts].sort(
      (a, b) => (Number(a.x) || 0) - (Number(b.x) || 0),
    );

    const bayRects = [];
    let currentBayX = inner.minX;

    sortedDividers.forEach((divider, index) => {
      const dividerX = snap(Number(divider.x) || currentBayX);
      const bayWidth = snap(dividerX - currentBayX);

      if (bayWidth > GRID_SIZE) {
        bayRects.push({
          bayIndex: index + 1,
          x: currentBayX,
          y: inner.minY,
          z: inner.minZ,
          width: bayWidth,
          height: innerHeight,
          depth: innerDepth,
        });
      }

      currentBayX = snap(dividerX + (Number(divider.width) || thickness));
    });

    const lastBayWidth = snap(inner.maxX - currentBayX);
    if (lastBayWidth > GRID_SIZE) {
      bayRects.push({
        bayIndex: bayRects.length + 1,
        x: currentBayX,
        y: inner.minY,
        z: inner.minZ,
        width: lastBayWidth,
        height: innerHeight,
        depth: innerDepth,
      });
    }

    if (!bayRects.length) {
      bayRects.push({
        bayIndex: 1,
        x: inner.minX,
        y: inner.minY,
        z: inner.minZ,
        width: innerWidth,
        height: innerHeight,
        depth: innerDepth,
      });
    }

    const overlapsBay = (part, bay) => {
      const partMinX = Number(part.x) || 0;
      const partMaxX = partMinX + (Number(part.width) || 0);
      const bayMinX = Number(bay.x) || 0;
      const bayMaxX = bayMinX + (Number(bay.width) || 0);
      const overlap = Math.min(partMaxX, bayMaxX) - Math.max(partMinX, bayMinX);
      return (
        overlap >
        Math.max(
          GRID_SIZE,
          Math.min(Number(part.width) || 0, Number(bay.width) || 0) * 0.25,
        )
      );
    };

    const openingRects = [];

    bayRects.forEach((bay) => {
      const bayShelves = shelfParts
        .filter((shelf) => overlapsBay(shelf, bay))
        .sort((a, b) => (Number(a.y) || 0) - (Number(b.y) || 0));

      let cursorY = bay.y;
      let rowIndex = 1;

      bayShelves.forEach((shelf) => {
        const shelfY = snap(Number(shelf.y) || cursorY);
        const openingHeight = snap(shelfY - cursorY);

        if (openingHeight > GRID_SIZE) {
          openingRects.push({
            bayIndex: bay.bayIndex,
            rowIndex,
            x: bay.x,
            y: cursorY,
            z: bay.z,
            width: bay.width,
            height: openingHeight,
            depth: bay.depth,
          });
          rowIndex += 1;
        }

        cursorY = snap(shelfY + (Number(shelf.height) || thickness));
      });

      const finalOpeningHeight = snap(bay.y + bay.height - cursorY);
      if (finalOpeningHeight > GRID_SIZE) {
        openingRects.push({
          bayIndex: bay.bayIndex,
          rowIndex,
          x: bay.x,
          y: cursorY,
          z: bay.z,
          width: bay.width,
          height: finalOpeningHeight,
          depth: bay.depth,
        });
      }
    });

    const overallRect = {
      x: inner.minX,
      y: inner.minY,
      z: inner.minZ,
      width: innerWidth,
      height: innerHeight,
      depth: innerDepth,
    };

    const styleSource = shellParts[0] ||
      bodyParts[0] ||
      assemblyItems[0] || {
        material: "Marine Plywood",
        fill: "#d9c2a5",
        finish: "",
        groupType: "assembly",
        groupLabel: "Cabinet Box",
      };

    const buildPart = (overrides = {}) =>
      normalizeComponent({
        ...deepClone(styleSource),
        id: createObjectId(),
        groupId: styleSource.groupId || makeGroupId(),
        groupLabel: styleSource.groupLabel || "Cabinet Box",
        groupType: styleSource.groupType || "assembly",
        qty: 1,
        locked: false,
        blueprintStyle: "box",
        rotationY: 0,
        material:
          overrides.material ?? styleSource.material ?? "Marine Plywood",
        finish: overrides.finish ?? styleSource.finish ?? "",
        fill: overrides.fill ?? styleSource.fill ?? "#d9c2a5",
        unitPrice: overrides.unitPrice ?? styleSource.unitPrice ?? 0,
        ...overrides,
      });

    return {
      primaryId,
      assemblyItems,
      shellParts,
      bodyParts,
      frontParts,
      dividerParts: sortedDividers,
      shelfParts,
      backParts,
      sideParts,
      topParts,
      bottomParts,
      shellBounds,
      inner,
      overallRect,
      bayRects,
      openingRects,
      thickness,
      backThickness,
      frontZ: snap(shellBounds.maxZ),
      buildPart,
      removeInteriorAndFrontIds: new Set([
        ...sortedDividers.map((p) => p.id),
        ...shelfParts.map((p) => p.id),
        ...frontParts.map((p) => p.id),
      ]),
      removeFrontIds: new Set(frontParts.map((p) => p.id)),
    };
  }, [
    selectedId,
    selectedIds,
    getAssemblyItemsFromComponent,
    getSelectionBoundsXYZ,
  ]);

  const getSmartHelperSelection3D = useCallback(
    (mode = "front") => {
      const explicit = getSmartBuilderHostAndTargets3D();

      if (explicit.host && explicit.targets.length) {
        return {
          ...explicit,
          ctx: null,
          sourceMode: "explicit",
        };
      }

      const ctx = getCabinetBuilderContext3D();
      if (!ctx) {
        return {
          host: null,
          targets: [],
          ctx: null,
          sourceMode: "none",
        };
      }

      const host =
        ctx.shellParts?.[0] ||
        ctx.bodyParts?.[0] ||
        ctx.assemblyItems?.[0] ||
        null;

      if (!host) {
        return {
          host: null,
          targets: [],
          ctx,
          sourceMode: "none",
        };
      }

      const uniqueById = (items = []) => {
        const map = new Map();
        (items || []).forEach((item) => {
          if (item?.id && !map.has(item.id)) {
            map.set(item.id, item);
          }
        });
        return Array.from(map.values());
      };

      let targets = [];

      if (mode === "shelf") {
        targets = uniqueById(ctx.shelfParts || []);
      } else if (mode === "panel") {
        targets = uniqueById([
          ...(ctx.dividerParts || []),
          ...(ctx.sideParts || []),
          ...(ctx.backParts || []),
        ]);
      } else {
        targets = uniqueById(ctx.frontParts || []);
      }

      return {
        host,
        targets,
        ctx,
        sourceMode: "auto",
      };
    },
    [getSmartBuilderHostAndTargets3D, getCabinetBuilderContext3D],
  );

  const buildSelectionLine3D = useCallback(
    (axis = "x", gap = 0, anchorMode = "preserve-first") => {
      if (editorMode !== "editable") {
        toast.error("Reference mode ito. Lumipat muna sa editable mode.");
        return;
      }

      if (hasLockedSmartSelection3D) {
        toast.error(
          "Cannot build line. One or more selected components are locked.",
        );
        return;
      }

      if (activeSelectedComponents3D.length < 2) {
        toast.error("Select at least 2 objects to build a line.");
        return;
      }

      const safeGap = snap(Math.max(0, Number(gap) || 0));
      const { posKey, sizeKey, label } = getSmartAxisMeta(axis);

      const crossAxes = ["x", "y", "z"].filter((key) => key !== axis);
      const crossSizeMap = {
        x: "width",
        y: "height",
        z: "depth",
      };

      const sorted = [...activeSelectedComponents3D].sort(
        (a, b) =>
          (Number(a[posKey]) || 0) - (Number(b[posKey]) || 0) ||
          (Number(a[sizeKey]) || 0) - (Number(b[sizeKey]) || 0),
      );

      const anchor = sorted[0];
      const last = sorted[sorted.length - 1];
      if (!anchor || !last) return;

      const bounds = getSelectionBoundsXYZ(sorted);
      if (!bounds) return;

      const totalSpan =
        sorted.reduce((sum, comp) => sum + (Number(comp[sizeKey]) || 0), 0) +
        safeGap * Math.max(0, sorted.length - 1);

      let cursor = Number(anchor[posKey]) || 0;

      if (anchorMode === "preserve-last") {
        const lastEnd =
          (Number(last[posKey]) || 0) + (Number(last[sizeKey]) || 0);
        cursor = snap(lastEnd - totalSpan);
      } else if (anchorMode === "center") {
        const axisCenter =
          axis === "x"
            ? bounds.centerX
            : axis === "y"
              ? bounds.centerY
              : bounds.centerZ;

        cursor = snap(axisCenter - totalSpan / 2);
      }

      const anchorCenters = {
        x: (Number(anchor.x) || 0) + (Number(anchor.width) || 0) / 2,
        y: (Number(anchor.y) || 0) + (Number(anchor.height) || 0) / 2,
        z: (Number(anchor.z) || 0) + (Number(anchor.depth) || 0) / 2,
      };

      const changesById = {};

      sorted.forEach((comp) => {
        const nextAttrs = {
          [posKey]: snap(cursor),
        };

        crossAxes.forEach((crossAxis) => {
          const sizeKeyForAxis = crossSizeMap[crossAxis];
          const size = Number(comp[sizeKeyForAxis]) || 0;
          nextAttrs[crossAxis] = snap(anchorCenters[crossAxis] - size / 2);
        });

        changesById[comp.id] = nextAttrs;
        cursor += (Number(comp[sizeKey]) || 0) + safeGap;
      });

      updateManyComps(changesById);
      setTransformMode("translate");

      const modeLabel =
        anchorMode === "preserve-last"
          ? "Preserve Last"
          : anchorMode === "center"
            ? "Center"
            : "Preserve First";

      toast.success(`Built clean line on ${label} axis (${modeLabel}).`);
    },
    [
      editorMode,
      hasLockedSmartSelection3D,
      activeSelectedComponents3D,
      getSmartAxisMeta,
      getSelectionBoundsXYZ,
      updateManyComps,
    ],
  );

  const autoShelfStack3D = useCallback(
    (inset = 40, gap = null) => {
      if (editorMode !== "editable") {
        toast.error("Reference mode ito. Lumipat muna sa editable mode.");
        return;
      }

      if (hasLockedSmartSelection3D) {
        toast.error(
          "Cannot auto-stack shelves. One or more selected components are locked.",
        );
        return;
      }

      const { host, targets, sourceMode } = getSmartHelperSelection3D("shelf");

      if (!host || !targets.length) {
        toast.error(
          sourceMode === "auto"
            ? "No shelf parts found in this cabinet assembly. Build shelves first or select shelf parts."
            : "Select 1 host body and 1 or more shelf parts.",
        );
        return;
      }

      const safeInset = snap(Math.max(0, Number(inset) || 0));
      const inner = {
        minX: snap((Number(host.x) || 0) + safeInset),
        minY: snap((Number(host.y) || 0) + safeInset),
        minZ: snap((Number(host.z) || 0) + safeInset),
        maxX: snap(
          (Number(host.x) || 0) + (Number(host.width) || 0) - safeInset,
        ),
        maxY: snap(
          (Number(host.y) || 0) + (Number(host.height) || 0) - safeInset,
        ),
        maxZ: snap(
          (Number(host.z) || 0) + (Number(host.depth) || 0) - safeInset,
        ),
      };

      const innerWidth = snap(Math.max(GRID_SIZE, inner.maxX - inner.minX));
      const innerHeight = snap(Math.max(GRID_SIZE, inner.maxY - inner.minY));
      const innerDepth = snap(Math.max(GRID_SIZE, inner.maxZ - inner.minZ));

      if (
        innerWidth < GRID_SIZE ||
        innerHeight < GRID_SIZE ||
        innerDepth < GRID_SIZE
      ) {
        toast.error("Host interior is too small for shelf stack.");
        return;
      }

      const shelves = [...targets].sort(
        (a, b) =>
          (Number(a.y) || 0) - (Number(b.y) || 0) ||
          (Number(a.height) || 0) - (Number(b.height) || 0),
      );

      const totalShelfThickness = shelves.reduce(
        (sum, shelf) =>
          sum + Math.max(GRID_SIZE, snap(Number(shelf.height) || GRID_SIZE)),
        0,
      );

      const gapCount = shelves.length + 1;
      const computedGap =
        gap === null || gap === undefined || gap === ""
          ? snap(Math.max(0, (innerHeight - totalShelfThickness) / gapCount))
          : snap(Math.max(0, Number(gap) || 0));

      const requiredHeight = totalShelfThickness + computedGap * gapCount;

      if (requiredHeight > innerHeight + 0.001) {
        toast.error("Not enough vertical space for the selected shelves.");
        return;
      }

      const changesById = {};
      let cursorY = inner.minY + computedGap;

      shelves.forEach((shelf) => {
        const shelfThickness = Math.max(
          GRID_SIZE,
          snap(Math.min(Number(shelf.height) || GRID_SIZE, innerHeight)),
        );

        changesById[shelf.id] = {
          x: inner.minX,
          y: snap(cursorY),
          z: inner.minZ,
          width: innerWidth,
          height: shelfThickness,
          depth: innerDepth,
        };

        cursorY += shelfThickness + computedGap;
      });

      updateManyComps(changesById);
      setSelectedId(host.id);
      setEdit3DId(host.id);
      setTransformMode("translate");
      toast.success(
        `Auto Shelf Stack applied (${shelves.length} shelf${shelves.length !== 1 ? "ves" : ""}).`,
      );
    },
    [
      editorMode,
      hasLockedSmartSelection3D,
      activeSelectedComponents3D,
      getSmartHelperSelection3D,
      updateManyComps,
    ],
  );

  const panelPairSelection3D = useCallback(
    (inset = 40) => {
      if (editorMode !== "editable") {
        toast.error("Reference mode ito. Lumipat muna sa editable mode.");
        return;
      }

      if (hasLockedSmartSelection3D) {
        toast.error(
          "Cannot build panel pair. One or more selected components are locked.",
        );
        return;
      }

      const { host, targets, sourceMode } = getSmartHelperSelection3D("panel");
      const source = targets?.[0] || null;

      if (!host || !source) {
        toast.error(
          sourceMode === "auto"
            ? "No panel-like parts found in this cabinet assembly. Select a divider, side panel, or back panel."
            : "Select 1 host body and 1 panel part.",
        );
        return;
      }

      const safeInset = snap(Math.max(0, Number(inset) || 0));
      const hostWidth = Number(host.width) || 0;
      const hostHeight = Number(host.height) || 0;
      const hostDepth = Number(host.depth) || 0;

      const innerHeight = snap(Math.max(GRID_SIZE, hostHeight - safeInset * 2));
      const innerDepth = snap(Math.max(GRID_SIZE, hostDepth - safeInset * 2));
      const maxPanelThickness = Math.max(
        GRID_SIZE,
        Math.floor((hostWidth - safeInset * 2) / 2),
      );

      const panelThickness = snap(
        Math.max(
          GRID_SIZE,
          Math.min(Number(source.width) || GRID_SIZE, maxPanelThickness),
        ),
      );

      if (innerHeight < GRID_SIZE || innerDepth < GRID_SIZE) {
        toast.error("Host interior is too small for panel pair.");
        return;
      }

      const baseLabel = String(source.label || "Panel")
        .replace(/left/gi, "")
        .replace(/right/gi, "")
        .replace(/\s{2,}/g, " ")
        .trim();

      const basePartCode = String(source.partCode || "PANEL")
        .replace(/[-_ ]?(L|R)$/i, "")
        .trim();

      const leftPanelAttrs = {
        x: snap((Number(host.x) || 0) + safeInset),
        y: snap((Number(host.y) || 0) + safeInset),
        z: snap((Number(host.z) || 0) + safeInset),
        width: panelThickness,
        height: innerHeight,
        depth: innerDepth,
        label: `${baseLabel || "Panel"} Left`,
        partCode: `${basePartCode || "PANEL"}-L`,
      };

      const rightPanelId = createObjectId();
      const rightPanel = normalizeComponent({
        ...deepClone(source),
        id: rightPanelId,
        x: snap((Number(host.x) || 0) + hostWidth - safeInset - panelThickness),
        y: snap((Number(host.y) || 0) + safeInset),
        z: snap((Number(host.z) || 0) + safeInset),
        width: panelThickness,
        height: innerHeight,
        depth: innerDepth,
        label: `${baseLabel || "Panel"} Right`,
        partCode: `${basePartCode || "PANEL"}-R`,
        locked: false,
      });

      pushHistory(
        Array.isArray(components)
          ? components.map((c) => normalizeComponent(c))
          : [],
      );

      setComponents((prev) =>
        prev
          .map((item) =>
            item.id === source.id
              ? normalizeComponent({
                  ...item,
                  ...leftPanelAttrs,
                })
              : item,
          )
          .concat(rightPanel),
      );

      setSelectedIds([source.id, rightPanelId]);
      setSelectedId(source.id);
      setEdit3DId(source.id);
      setTransformMode("translate");

      toast.success("Panel Pair applied.");
    },
    [
      editorMode,
      hasLockedSmartSelection3D,

      getSmartHelperSelection3D,
      components,
      pushHistory,
    ],
  );

  const frontPairSelection3D = useCallback(
    (inset = 40) => {
      if (editorMode !== "editable") {
        toast.error("Reference mode ito. Lumipat muna sa editable mode.");
        return;
      }

      if (hasLockedSmartSelection3D) {
        toast.error(
          "Cannot build front pair. One or more selected components are locked.",
        );
        return;
      }

      const { host, targets, sourceMode } = getSmartHelperSelection3D("front");

      if (!host || !targets.length) {
        toast.error(
          sourceMode === "auto"
            ? "No front parts found in this cabinet assembly. Create cabinet fronts first or select a front part."
            : "Select 1 host body and 1 front part.",
        );
        return;
      }

      const getFrontSourceScore = (comp) => {
        const text =
          `${comp?.label || ""} ${comp?.partCode || ""} ${comp?.type || ""}`
            .toLowerCase()
            .trim();

        const width = Math.max(GRID_SIZE, Number(comp?.width) || GRID_SIZE);
        const height = Math.max(GRID_SIZE, Number(comp?.height) || GRID_SIZE);
        const depth = Math.max(GRID_SIZE, Number(comp?.depth) || GRID_SIZE);
        const volume = width * height * depth;
        const frontArea = width * height;
        const thinRatio = depth / Math.max(width, height);

        let score = 0;

        if (text.includes("front")) score += 6000;
        if (text.includes("door")) score += 5000;
        if (text.includes("panel")) score += 4000;
        if (text.includes("drawer")) score += 1500;
        if (text.includes("shelf") || text.includes("leg")) score -= 2500;
        if (
          text.includes("body") ||
          text.includes("cabinet") ||
          text.includes("core")
        )
          score -= 4000;

        score += frontArea * 0.2;
        score -= volume * 0.0005;
        score -= thinRatio * 1000;

        return score;
      };

      const sortedTargets = [...targets].sort((a, b) => {
        const scoreDiff = getFrontSourceScore(b) - getFrontSourceScore(a);
        if (scoreDiff !== 0) return scoreDiff;
        if (a.id === selectedId) return -1;
        if (b.id === selectedId) return 1;
        return 0;
      });

      const source = sortedTargets[0] || null;
      const extraTargetIds = new Set(
        sortedTargets.slice(1).map((item) => item.id),
      );

      if (!source) {
        toast.error("Select 1 host body and 1 front part.");
        return;
      }

      const safeInset = snap(Math.max(0, Number(inset) || 0));
      const hostX = Number(host.x) || 0;
      const hostY = Number(host.y) || 0;
      const hostZ = Number(host.z) || 0;
      const hostWidth = Number(host.width) || 0;
      const hostHeight = Number(host.height) || 0;
      const hostDepth = Number(host.depth) || 0;

      const usableWidth = snap(
        Math.max(GRID_SIZE * 2, hostWidth - safeInset * 2),
      );
      const usableHeight = snap(
        Math.max(GRID_SIZE, hostHeight - safeInset * 2),
      );

      if (usableWidth < GRID_SIZE * 2 || usableHeight < GRID_SIZE) {
        toast.error("Host front face is too small for front pair.");
        return;
      }

      const pairGap = snap(
        Math.max(0, Math.min(20, usableWidth - GRID_SIZE * 2)),
      );
      const frontWidth = snap(Math.max(GRID_SIZE, (usableWidth - pairGap) / 2));

      const sourceDepth = Math.max(
        GRID_SIZE,
        Number(source.depth) || GRID_SIZE,
      );
      const maxFaceThickness = Math.max(GRID_SIZE, hostDepth - safeInset);
      const faceThickness = snap(
        Math.max(GRID_SIZE, Math.min(sourceDepth, maxFaceThickness)),
      );

      const sourceText =
        `${source.label || ""} ${source.partCode || ""} ${source.type || ""}`
          .toLowerCase()
          .trim();

      const isDoorLike = sourceText.includes("door");
      const isPanelLike = sourceText.includes("panel") || !isDoorLike;

      const leftLabel = isDoorLike
        ? "Left Front Door"
        : isPanelLike
          ? "Left Front Panel"
          : "Left Front";

      const rightLabel = isDoorLike
        ? "Right Front Door"
        : isPanelLike
          ? "Right Front Panel"
          : "Right Front";

      const leftCode = isDoorLike ? "FRONT-L" : "FRONT-PANEL-L";
      const rightCode = isDoorLike ? "FRONT-R" : "FRONT-PANEL-R";

      const faceX = snap(hostX + safeInset);
      const faceY = snap(hostY + safeInset);
      const faceZ = snap(hostZ + hostDepth - faceThickness);

      const leftFrontAttrs = {
        x: faceX,
        y: faceY,
        z: faceZ,
        width: frontWidth,
        height: usableHeight,
        depth: faceThickness,
        label: leftLabel,
        partCode: leftCode,
        locked: false,
      };

      const rightFrontId = createObjectId();
      const rightFront = normalizeComponent({
        ...deepClone(source),
        id: rightFrontId,
        x: snap(faceX + frontWidth + pairGap),
        y: faceY,
        z: faceZ,
        width: frontWidth,
        height: usableHeight,
        depth: faceThickness,
        label: rightLabel,
        partCode: rightCode,
        locked: false,
      });

      pushHistory(
        Array.isArray(components)
          ? components.map((c) => normalizeComponent(c))
          : [],
      );

      setComponents((prev) =>
        prev
          .filter((item) => !extraTargetIds.has(item.id))
          .map((item) =>
            item.id === source.id
              ? normalizeComponent({
                  ...item,
                  ...leftFrontAttrs,
                })
              : item,
          )
          .concat(rightFront),
      );

      setSelectedIds([source.id, rightFrontId]);
      setSelectedId(source.id);
      setEdit3DId(source.id);
      setTransformMode("translate");

      toast.success(
        extraTargetIds.size
          ? `Front Pair applied. Extra selected front part(s) replaced: ${extraTargetIds.size}.`
          : "Front Pair applied.",
      );
    },
    [
      editorMode,
      hasLockedSmartSelection3D,
      activeSelectedComponents3D,
      getSmartHelperSelection3D,
      components,
      pushHistory,
      selectedId,
    ],
  );

  const doorSplitSelection3D = useCallback(
    (inset = 40) => {
      if (editorMode !== "editable") {
        toast.error("Reference mode ito. Lumipat muna sa editable mode.");
        return;
      }

      if (hasLockedSmartSelection3D) {
        toast.error(
          "Cannot build door split. One or more selected components are locked.",
        );
        return;
      }

      const { host, targets, sourceMode } = getSmartHelperSelection3D("front");

      if (!host || !targets.length) {
        toast.error(
          sourceMode === "auto"
            ? "No door/front parts found in this cabinet assembly. Create cabinet fronts first or select a door/front part."
            : "Select 1 host body and 1 door/front part.",
        );
        return;
      }

      const getDoorSourceScore = (comp) => {
        const text =
          `${comp?.label || ""} ${comp?.partCode || ""} ${comp?.type || ""}`
            .toLowerCase()
            .trim();

        const width = Math.max(GRID_SIZE, Number(comp?.width) || GRID_SIZE);
        const height = Math.max(GRID_SIZE, Number(comp?.height) || GRID_SIZE);
        const depth = Math.max(GRID_SIZE, Number(comp?.depth) || GRID_SIZE);
        const frontArea = width * height;
        const volume = width * height * depth;

        let score = 0;
        if (text.includes("door")) score += 8000;
        if (text.includes("front")) score += 5000;
        if (text.includes("panel")) score += 2000;
        if (text.includes("drawer")) score -= 3000;
        if (text.includes("shelf") || text.includes("leg")) score -= 4000;
        if (
          text.includes("body") ||
          text.includes("cabinet") ||
          text.includes("core")
        )
          score -= 5000;

        score += frontArea * 0.2;
        score -= volume * 0.0005;
        return score;
      };

      const sortedTargets = [...targets].sort((a, b) => {
        const scoreDiff = getDoorSourceScore(b) - getDoorSourceScore(a);
        if (scoreDiff !== 0) return scoreDiff;
        if (a.id === selectedId) return -1;
        if (b.id === selectedId) return 1;
        return 0;
      });

      const source = sortedTargets[0] || null;
      const extraTargetIds = new Set(
        sortedTargets.slice(1).map((item) => item.id),
      );

      if (!source) {
        toast.error("Select 1 host body and 1 door/front part.");
        return;
      }

      const safeInset = snap(Math.max(0, Number(inset) || 0));
      const hostX = Number(host.x) || 0;
      const hostY = Number(host.y) || 0;
      const hostZ = Number(host.z) || 0;
      const hostWidth = Number(host.width) || 0;
      const hostHeight = Number(host.height) || 0;
      const hostDepth = Number(host.depth) || 0;

      const usableWidth = snap(
        Math.max(GRID_SIZE * 2, hostWidth - safeInset * 2),
      );
      const usableHeight = snap(
        Math.max(GRID_SIZE, hostHeight - safeInset * 2),
      );

      if (usableWidth < GRID_SIZE * 2 || usableHeight < GRID_SIZE) {
        toast.error("Host front face is too small for door split.");
        return;
      }

      const centerGap = snap(Math.max(8, Math.min(24, usableWidth * 0.02)));
      const eachWidth = snap(Math.floor((usableWidth - centerGap) / 2));

      if (eachWidth < GRID_SIZE) {
        toast.error("Not enough width for split doors.");
        return;
      }

      const sourceDepth = Math.max(
        GRID_SIZE,
        Number(source.depth) || GRID_SIZE,
      );
      const maxFaceThickness = Math.max(GRID_SIZE, hostDepth - safeInset);
      const faceThickness = snap(
        Math.max(GRID_SIZE, Math.min(sourceDepth, maxFaceThickness)),
      );

      const faceX = snap(hostX + safeInset);
      const faceY = snap(hostY + safeInset);
      const faceZ = snap(hostZ + hostDepth - faceThickness);

      const leftDoorAttrs = {
        x: faceX,
        y: faceY,
        z: faceZ,
        width: eachWidth,
        height: usableHeight,
        depth: faceThickness,
        label: "Left Door",
        partCode: "DOOR-L",
        locked: false,
      };

      const rightDoorId = createObjectId();
      const rightDoor = normalizeComponent({
        ...deepClone(source),
        id: rightDoorId,
        x: snap(faceX + eachWidth + centerGap),
        y: faceY,
        z: faceZ,
        width: eachWidth,
        height: usableHeight,
        depth: faceThickness,
        label: "Right Door",
        partCode: "DOOR-R",
        locked: false,
      });

      pushHistory(
        Array.isArray(components)
          ? components.map((c) => normalizeComponent(c))
          : [],
      );

      setComponents((prev) =>
        prev
          .filter((item) => !extraTargetIds.has(item.id))
          .map((item) =>
            item.id === source.id
              ? normalizeComponent({
                  ...item,
                  ...leftDoorAttrs,
                })
              : item,
          )
          .concat(rightDoor),
      );

      setSelectedIds([source.id, rightDoorId]);
      setSelectedId(source.id);
      setEdit3DId(source.id);
      setTransformMode("translate");

      toast.success(
        extraTargetIds.size
          ? `Door Split applied. Extra selected front part(s) removed: ${extraTargetIds.size}.`
          : "Door Split applied.",
      );
    },
    [
      editorMode,
      hasLockedSmartSelection3D,
      activeSelectedComponents3D,
      getSmartHelperSelection3D,
      components,
      pushHistory,
      selectedId,
    ],
  );

  const drawerStackSelection3D = useCallback(
    (inset = 40, desiredCount = 3) => {
      if (editorMode !== "editable") {
        toast.error("Reference mode ito. Lumipat muna sa editable mode.");
        return;
      }

      if (hasLockedSmartSelection3D) {
        toast.error(
          "Cannot build drawer stack. One or more selected components are locked.",
        );
        return;
      }

      const { host, targets, sourceMode } = getSmartHelperSelection3D("front");

      if (!host || !targets.length) {
        toast.error(
          sourceMode === "auto"
            ? "No drawer/front parts found in this cabinet assembly. Create cabinet fronts first or select a drawer/front part."
            : "Select 1 host body and 1 drawer/front part.",
        );
        return;
      }

      const safeInset = snap(Math.max(0, Number(inset) || 0));
      const safeCount = Math.max(
        2,
        Math.min(
          8,
          Number(desiredCount) || (targets.length > 1 ? targets.length : 3),
        ),
      );

      const getDrawerSourceScore = (comp) => {
        const text =
          `${comp?.label || ""} ${comp?.partCode || ""} ${comp?.type || ""}`
            .toLowerCase()
            .trim();

        const width = Math.max(GRID_SIZE, Number(comp?.width) || GRID_SIZE);
        const height = Math.max(GRID_SIZE, Number(comp?.height) || GRID_SIZE);
        const depth = Math.max(GRID_SIZE, Number(comp?.depth) || GRID_SIZE);
        const frontArea = width * height;
        const volume = width * height * depth;

        let score = 0;
        if (text.includes("drawer")) score += 7000;
        if (text.includes("front")) score += 4500;
        if (text.includes("panel")) score += 2500;
        if (text.includes("door")) score -= 2500;
        if (text.includes("shelf") || text.includes("leg")) score -= 4000;
        if (
          text.includes("body") ||
          text.includes("cabinet") ||
          text.includes("core")
        )
          score -= 5000;

        score += frontArea * 0.2;
        score -= volume * 0.0005;

        return score;
      };

      const sortedTargets = [...targets].sort((a, b) => {
        const scoreDiff = getDrawerSourceScore(b) - getDrawerSourceScore(a);
        if (scoreDiff !== 0) return scoreDiff;
        if (a.id === selectedId) return -1;
        if (b.id === selectedId) return 1;
        return 0;
      });

      const source = sortedTargets[0] || null;
      if (!source) {
        toast.error("Select 1 host body and 1 drawer/front part.");
        return;
      }

      const templateTargets = sortedTargets.slice(0, safeCount);
      const extraTargetIds = new Set(
        sortedTargets.slice(safeCount).map((item) => item.id),
      );

      const hostX = Number(host.x) || 0;
      const hostY = Number(host.y) || 0;
      const hostZ = Number(host.z) || 0;
      const hostWidth = Number(host.width) || 0;
      const hostHeight = Number(host.height) || 0;
      const hostDepth = Number(host.depth) || 0;

      const usableWidth = snap(Math.max(GRID_SIZE, hostWidth - safeInset * 2));
      const usableHeight = snap(
        Math.max(GRID_SIZE * 2, hostHeight - safeInset * 2),
      );

      if (usableWidth < GRID_SIZE || usableHeight < GRID_SIZE * 2) {
        toast.error("Host front face is too small for drawer stack.");
        return;
      }

      const templateDepth = Math.max(
        GRID_SIZE,
        Number(source.depth) || GRID_SIZE,
      );
      const maxFaceThickness = Math.max(GRID_SIZE, hostDepth - safeInset);
      const faceThickness = snap(
        Math.max(GRID_SIZE, Math.min(templateDepth, maxFaceThickness)),
      );

      const preferredGap = Math.max(8, Math.min(20, snap(usableHeight * 0.02)));
      const maxGap = Math.max(0, usableHeight - GRID_SIZE * 2 * safeCount);
      const drawerGap = snap(
        Math.min(preferredGap, maxGap / Math.max(1, safeCount - 1)),
      );
      const eachHeight = snap(
        Math.floor(
          (usableHeight - drawerGap * Math.max(0, safeCount - 1)) / safeCount,
        ),
      );

      if (eachHeight < GRID_SIZE * 2) {
        toast.error(
          "Not enough vertical space for the requested drawer count.",
        );
        return;
      }

      const totalStackHeight =
        eachHeight * safeCount + drawerGap * Math.max(0, safeCount - 1);
      const stackOffsetY = snap(
        Math.max(0, (usableHeight - totalStackHeight) / 2),
      );

      const faceX = snap(hostX + safeInset);
      const faceY = snap(hostY + safeInset + stackOffsetY);
      const faceZ = snap(hostZ + hostDepth - faceThickness);

      const resultIds = [];
      const createdParts = [];
      const updateMap = new Map();

      for (let index = 0; index < safeCount; index += 1) {
        const target = templateTargets[index] || null;
        const nextId = target?.id || createObjectId();
        const y = snap(faceY + index * (eachHeight + drawerGap));
        const label = `Drawer Front ${index + 1}`;
        const partCode = `DRAWER-${String(index + 1).padStart(2, "0")}`;

        const nextAttrs = {
          x: faceX,
          y,
          z: faceZ,
          width: usableWidth,
          height: eachHeight,
          depth: faceThickness,
          label,
          partCode,
          locked: false,
        };

        resultIds.push(nextId);

        if (target) {
          updateMap.set(target.id, nextAttrs);
        } else {
          createdParts.push(
            normalizeComponent({
              ...deepClone(source),
              id: nextId,
              ...nextAttrs,
            }),
          );
        }
      }

      pushHistory(
        Array.isArray(components)
          ? components.map((c) => normalizeComponent(c))
          : [],
      );

      setComponents((prev) =>
        prev
          .filter((item) => !extraTargetIds.has(item.id))
          .map((item) => {
            const attrs = updateMap.get(item.id);
            return attrs
              ? normalizeComponent({
                  ...item,
                  ...attrs,
                })
              : item;
          })
          .concat(createdParts),
      );

      setSelectedIds(resultIds);
      setSelectedId(resultIds[0] || null);
      setEdit3DId(resultIds[0] || null);
      setTransformMode("translate");

      toast.success(
        extraTargetIds.size
          ? `Drawer Stack applied (${safeCount} drawers). Extra selected part(s) removed: ${extraTargetIds.size}.`
          : `Drawer Stack applied (${safeCount} drawers).`,
      );
    },
    [
      editorMode,
      hasLockedSmartSelection3D,
      activeSelectedComponents3D,
      getSmartHelperSelection3D,
      components,
      pushHistory,
      selectedId,
    ],
  );

  const faceFitSelection3D = useCallback(
    (inset = 40) => {
      if (editorMode !== "editable") {
        toast.error("Reference mode ito. Lumipat muna sa editable mode.");
        return;
      }

      if (hasLockedSmartSelection3D) {
        toast.error(
          "Cannot face-fit. One or more selected components are locked.",
        );
        return;
      }

      const { host, targets, sourceMode } = getSmartHelperSelection3D("front");

      if (!host || !targets.length) {
        toast.error(
          sourceMode === "auto"
            ? "No front parts found in this cabinet assembly. Create cabinet fronts first or select a front part."
            : "Select 1 host body and 1 front part.",
        );
        return;
      }

      const getFaceSourceScore = (comp) => {
        const text =
          `${comp?.label || ""} ${comp?.partCode || ""} ${comp?.type || ""}`
            .toLowerCase()
            .trim();

        const width = Math.max(GRID_SIZE, Number(comp?.width) || GRID_SIZE);
        const height = Math.max(GRID_SIZE, Number(comp?.height) || GRID_SIZE);
        const depth = Math.max(GRID_SIZE, Number(comp?.depth) || GRID_SIZE);
        const frontArea = width * height;
        const volume = width * height * depth;

        let score = 0;
        if (text.includes("front")) score += 7000;
        if (text.includes("door")) score += 5000;
        if (text.includes("panel")) score += 4500;
        if (text.includes("drawer")) score += 3000;
        if (text.includes("shelf") || text.includes("leg")) score -= 3500;
        if (
          text.includes("body") ||
          text.includes("cabinet") ||
          text.includes("core")
        )
          score -= 5000;

        score += frontArea * 0.2;
        score -= volume * 0.0005;
        return score;
      };

      const sortedTargets = [...targets].sort((a, b) => {
        const scoreDiff = getFaceSourceScore(b) - getFaceSourceScore(a);
        if (scoreDiff !== 0) return scoreDiff;
        if (a.id === selectedId) return -1;
        if (b.id === selectedId) return 1;
        return 0;
      });

      const source = sortedTargets[0] || null;
      const extraTargetIds = new Set(
        sortedTargets.slice(1).map((item) => item.id),
      );

      if (!source) {
        toast.error("Select 1 host body and 1 front part.");
        return;
      }

      const safeInset = snap(Math.max(0, Number(inset) || 0));
      const hostX = Number(host.x) || 0;
      const hostY = Number(host.y) || 0;
      const hostZ = Number(host.z) || 0;
      const hostWidth = Number(host.width) || 0;
      const hostHeight = Number(host.height) || 0;
      const hostDepth = Number(host.depth) || 0;

      const usableWidth = snap(Math.max(GRID_SIZE, hostWidth - safeInset * 2));
      const usableHeight = snap(
        Math.max(GRID_SIZE, hostHeight - safeInset * 2),
      );

      if (usableWidth < GRID_SIZE || usableHeight < GRID_SIZE) {
        toast.error("Host front face is too small for face fit.");
        return;
      }

      const sourceDepth = Math.max(
        GRID_SIZE,
        Number(source.depth) || GRID_SIZE,
      );
      const maxFaceThickness = Math.max(GRID_SIZE, hostDepth - safeInset);
      const faceThickness = snap(
        Math.max(GRID_SIZE, Math.min(sourceDepth, maxFaceThickness)),
      );

      const sourceText =
        `${source.label || ""} ${source.partCode || ""} ${source.type || ""}`
          .toLowerCase()
          .trim();

      const isDoorLike = sourceText.includes("door");
      const isDrawerLike = sourceText.includes("drawer");
      const isPanelLike =
        sourceText.includes("panel") || (!isDoorLike && !isDrawerLike);

      const faceLabel = isDoorLike
        ? "Front Door"
        : isDrawerLike
          ? "Front Drawer"
          : isPanelLike
            ? "Front Panel"
            : "Front Face";

      const faceCode = isDoorLike
        ? "DOOR-F"
        : isDrawerLike
          ? "DRAWER-F"
          : isPanelLike
            ? "FRONT-PANEL"
            : "FRONT-FIT";

      const faceAttrs = {
        x: snap(hostX + safeInset),
        y: snap(hostY + safeInset),
        z: snap(hostZ + hostDepth - faceThickness),
        width: usableWidth,
        height: usableHeight,
        depth: faceThickness,
        label: faceLabel,
        partCode: faceCode,
        locked: false,
      };

      pushHistory(
        Array.isArray(components)
          ? components.map((c) => normalizeComponent(c))
          : [],
      );

      setComponents((prev) =>
        prev
          .filter((item) => !extraTargetIds.has(item.id))
          .map((item) =>
            item.id === source.id
              ? normalizeComponent({
                  ...item,
                  ...faceAttrs,
                })
              : item,
          ),
      );

      setSelectedIds([source.id]);
      setSelectedId(source.id);
      setEdit3DId(source.id);
      setTransformMode("translate");

      toast.success(
        extraTargetIds.size
          ? `Face Fit applied. Extra selected front part(s) removed: ${extraTargetIds.size}.`
          : "Face Fit applied.",
      );
    },
    [
      editorMode,
      hasLockedSmartSelection3D,
      activeSelectedComponents3D,
      getSmartHelperSelection3D,
      components,
      pushHistory,
      selectedId,
    ],
  );

  const insideFitSelection3D = useCallback(
    (inset = 40) => {
      if (editorMode !== "editable") {
        toast.error("Reference mode ito. Lumipat muna sa editable mode.");
        return;
      }

      if (hasLockedSmartSelection3D) {
        toast.error(
          "Cannot inside-fit. One or more selected components are locked.",
        );
        return;
      }

      if (activeSelectedComponents3D.length < 2) {
        toast.error("Select 1 host body and 1 or more parts to fit inside.");
        return;
      }

      const { host, targets } = getSmartBuilderHostAndTargets3D();

      if (!host || !targets.length) {
        toast.error("Select 1 host body and 1 or more parts to fit inside.");
        return;
      }

      const safeInset = snap(Math.max(0, Number(inset) || 0));

      const inner = {
        minX: snap((Number(host.x) || 0) + safeInset),
        minY: snap((Number(host.y) || 0) + safeInset),
        minZ: snap((Number(host.z) || 0) + safeInset),
        maxX: snap(
          (Number(host.x) || 0) + (Number(host.width) || 0) - safeInset,
        ),
        maxY: snap(
          (Number(host.y) || 0) + (Number(host.height) || 0) - safeInset,
        ),
        maxZ: snap(
          (Number(host.z) || 0) + (Number(host.depth) || 0) - safeInset,
        ),
      };

      const innerWidth = snap(Math.max(GRID_SIZE, inner.maxX - inner.minX));
      const innerHeight = snap(Math.max(GRID_SIZE, inner.maxY - inner.minY));
      const innerDepth = snap(Math.max(GRID_SIZE, inner.maxZ - inner.minZ));

      if (
        innerWidth < GRID_SIZE ||
        innerHeight < GRID_SIZE ||
        innerDepth < GRID_SIZE
      ) {
        toast.error("Host interior is too small for inside fit.");
        return;
      }

      const hostCenterZ = (Number(host.z) || 0) + (Number(host.depth) || 0) / 2;
      const changesById = {};

      targets.forEach((target) => {
        const width = Math.max(GRID_SIZE, Number(target.width) || GRID_SIZE);
        const height = Math.max(GRID_SIZE, Number(target.height) || GRID_SIZE);
        const depth = Math.max(GRID_SIZE, Number(target.depth) || GRID_SIZE);

        const axisOrder = [
          { axis: "x", value: width },
          { axis: "y", value: height },
          { axis: "z", value: depth },
        ].sort((a, b) => a.value - b.value);

        const thinAxis = axisOrder[0]?.axis || "y";

        if (thinAxis === "x") {
          const panelWidth = snap(Math.min(width, innerWidth));
          const currentCenterX = (Number(target.x) || 0) + width / 2;
          const clampedCenterX = clamp(
            currentCenterX,
            inner.minX + panelWidth / 2,
            inner.maxX - panelWidth / 2,
          );

          changesById[target.id] = {
            x: snap(clampedCenterX - panelWidth / 2),
            y: inner.minY,
            z: inner.minZ,
            width: panelWidth,
            height: innerHeight,
            depth: innerDepth,
          };

          return;
        }

        if (thinAxis === "y") {
          const panelHeight = snap(Math.min(height, innerHeight));
          const currentCenterY = (Number(target.y) || 0) + height / 2;
          const clampedCenterY = clamp(
            currentCenterY,
            inner.minY + panelHeight / 2,
            inner.maxY - panelHeight / 2,
          );

          changesById[target.id] = {
            x: inner.minX,
            y: snap(clampedCenterY - panelHeight / 2),
            z: inner.minZ,
            width: innerWidth,
            height: panelHeight,
            depth: innerDepth,
          };

          return;
        }

        const panelDepth = snap(Math.min(depth, innerDepth));
        const currentCenterZ = (Number(target.z) || 0) + depth / 2;
        const stickToBack = currentCenterZ >= hostCenterZ;

        changesById[target.id] = {
          x: inner.minX,
          y: inner.minY,
          z: stickToBack ? snap(inner.maxZ - panelDepth) : inner.minZ,
          width: innerWidth,
          height: innerHeight,
          depth: panelDepth,
        };
      });

      updateManyComps(changesById);
      setTransformMode("translate");
      toast.success(
        `Inside Fit applied (${targets.length} part${targets.length !== 1 ? "s" : ""}).`,
      );
    },
    [
      editorMode,
      hasLockedSmartSelection3D,
      activeSelectedComponents3D,
      getSmartBuilderHostAndTargets3D,
      updateManyComps,
    ],
  );

  const alignSelection3D = useCallback(
    (axis, mode) => {
      if (editorMode !== "editable") {
        toast.error("Reference mode ito. Lumipat muna sa editable mode.");
        return;
      }

      if (hasLockedSmartSelection3D) {
        toast.error(
          "Cannot align. One or more selected components are locked.",
        );
        return;
      }

      if (activeSelectedComponents3D.length < 2) {
        toast.error("Select at least 2 objects to align.");
        return;
      }

      const bounds = getSelectionBoundsXYZ(activeSelectedComponents3D);
      if (!bounds) return;

      const changesById = {};

      activeSelectedComponents3D.forEach((comp) => {
        const width = Number(comp.width) || 0;
        const height = Number(comp.height) || 0;
        const depth = Number(comp.depth) || 0;

        const nextAttrs = {};

        if (axis === "x") {
          if (mode === "min") nextAttrs.x = snap(bounds.minX);
          if (mode === "center") nextAttrs.x = snap(bounds.centerX - width / 2);
          if (mode === "max") nextAttrs.x = snap(bounds.maxX - width);
        }

        if (axis === "y") {
          if (mode === "min") nextAttrs.y = snap(bounds.minY);
          if (mode === "center")
            nextAttrs.y = snap(bounds.centerY - height / 2);
          if (mode === "max") nextAttrs.y = snap(bounds.maxY - height);
        }

        if (axis === "z") {
          if (mode === "min") nextAttrs.z = snap(bounds.minZ);
          if (mode === "center") nextAttrs.z = snap(bounds.centerZ - depth / 2);
          if (mode === "max") nextAttrs.z = snap(bounds.maxZ - depth);
        }

        changesById[comp.id] = nextAttrs;
      });

      updateManyComps(changesById);
      setTransformMode("translate");
      toast.success(`Aligned ${activeSelectedComponents3D.length} object(s).`);
    },
    [
      editorMode,
      hasLockedSmartSelection3D,
      activeSelectedComponents3D,
      getSelectionBoundsXYZ,
      updateManyComps,
    ],
  );

  const flushSelection3D = useCallback(
    (axis, direction) => {
      if (editorMode !== "editable") {
        toast.error("Reference mode ito. Lumipat muna sa editable mode.");
        return;
      }

      if (hasLockedSmartSelection3D) {
        toast.error(
          "Cannot flush snap. One or more selected components are locked.",
        );
        return;
      }

      if (activeSelectedComponents3D.length < 2) {
        toast.error(
          "Select at least 2 objects. The active object will snap against the others.",
        );
        return;
      }

      const movingId = activeSelectionIds3D.includes(selectedId)
        ? selectedId
        : activeSelectionIds3D[0];

      const movingComp =
        activeSelectedComponents3D.find((c) => c.id === movingId) ||
        activeSelectedComponents3D[0];

      const anchorItems = activeSelectedComponents3D.filter(
        (c) => c.id !== movingComp.id,
      );

      if (!movingComp || !anchorItems.length) {
        toast.error(
          "Flush snap needs one active object and at least one anchor.",
        );
        return;
      }

      const anchorBounds = getSelectionBoundsXYZ(anchorItems);
      if (!anchorBounds) return;

      const nextAttrs = {};

      if (axis === "x") {
        nextAttrs.x = snap(
          direction === "negative"
            ? anchorBounds.minX - (Number(movingComp.width) || 0)
            : anchorBounds.maxX,
        );
      }

      if (axis === "y") {
        nextAttrs.y = snap(
          direction === "negative"
            ? anchorBounds.minY - (Number(movingComp.height) || 0)
            : anchorBounds.maxY,
        );
      }

      if (axis === "z") {
        nextAttrs.z = snap(
          direction === "negative"
            ? anchorBounds.minZ - (Number(movingComp.depth) || 0)
            : anchorBounds.maxZ,
        );
      }

      updateManyComps({
        [movingComp.id]: nextAttrs,
      });

      setTransformMode("translate");
      toast.success(`${movingComp.label || "Object"} snapped flush.`);
    },
    [
      editorMode,
      hasLockedSmartSelection3D,
      activeSelectedComponents3D,
      activeSelectionIds3D,
      selectedId,
      getSelectionBoundsXYZ,
      updateManyComps,
    ],
  );

  const mirrorDuplicateSelection3D = useCallback(
    (axis) => {
      if (editorMode !== "editable") {
        toast.error("Reference mode ito. Lumipat muna sa editable mode.");
        return;
      }

      if (hasLockedSmartSelection3D) {
        toast.error(
          "Cannot mirror duplicate. One or more selected components are locked.",
        );
        return;
      }

      if (!activeSelectedComponents3D.length) {
        toast.error("Select at least 1 object to mirror duplicate.");
        return;
      }

      const sourceItems = activeSelectedComponents3D.map((item) =>
        deepClone(item),
      );
      const bounds = getSelectionBoundsXYZ(sourceItems);
      if (!bounds) return;

      const GAP = GRID_SIZE * 2;
      const mirrorPlane =
        axis === "x" ? bounds.maxX + GAP / 2 : bounds.maxZ + GAP / 2;

      const groupIdMap = new Map();

      const duplicated = sourceItems.map((item) => {
        let nextGroupId = item.groupId || null;

        if (item.groupId) {
          if (!groupIdMap.has(item.groupId)) {
            groupIdMap.set(item.groupId, makeGroupId());
          }
          nextGroupId = groupIdMap.get(item.groupId);
        }

        const width = Number(item.width) || 0;
        const depth = Number(item.depth) || 0;

        const next = {
          ...deepClone(item),
          id: createObjectId(),
          groupId: nextGroupId,
          locked: false,
          label: item.label ? `${item.label} Mirror` : "Mirrored Object",
        };

        if (axis === "x") {
          const centerX = (Number(item.x) || 0) + width / 2;
          const mirroredCenterX = 2 * mirrorPlane - centerX;
          next.x = snap(mirroredCenterX - width / 2);
        }

        if (axis === "z") {
          const centerZ = (Number(item.z) || 0) + depth / 2;
          const mirroredCenterZ = 2 * mirrorPlane - centerZ;
          next.z = snap(mirroredCenterZ - depth / 2);
        }

        return normalizeComponent(next);
      });

      pushHistory(components);
      setComponents((prev) => [...prev, ...duplicated]);
      setSelectedIds(duplicated.map((item) => item.id));
      setSelectedId(duplicated[0]?.id || null);
      setEdit3DId(duplicated[0]?.id || null);
      setTransformMode("translate");

      toast.success(`Created ${duplicated.length} mirrored duplicate(s).`);
    },
    [
      editorMode,
      hasLockedSmartSelection3D,
      activeSelectedComponents3D,
      getSelectionBoundsXYZ,
      components,
      pushHistory,
    ],
  );

  return {
    smartWidthResizeContext3D,
    previewSmartWidthResize3D,
    applySmartWidthResize3D,
    applySelectionGap3D,
    distributeSelection3D,
    autoLegLayout3D,
    buildSelectionLine3D,
    autoShelfStack3D,
    panelPairSelection3D,
    frontPairSelection3D,
    doorSplitSelection3D,
    drawerStackSelection3D,
    faceFitSelection3D,
    insideFitSelection3D,
    alignSelection3D,
    flushSelection3D,
    mirrorDuplicateSelection3D,
    getCabinetBuilderContext3D,
  };
}
