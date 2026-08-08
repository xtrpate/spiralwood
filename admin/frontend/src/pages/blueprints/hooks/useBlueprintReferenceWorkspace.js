import { useCallback, useEffect, useMemo } from "react";
import {
  REFERENCE_TRACE_VIEWS,
  createEmptyReferenceCalibrationByView,
  createEmptyTraceObjectsByView,
  flattenTraceObjectsByView,
  normalizeReferenceCalibration,
  normalizeTraceObjects,
} from "../data/referenceTraceUtils";

export function useBlueprintReferenceWorkspace({
  view,
  referenceFiles,
  referenceCalibrationByView,
  setReferenceCalibrationByView,
  traceObjectsByView,
  setTraceObjectsByView,
  setSelectedTraceId,
}) {
  const activeReferenceView = useMemo(() => {
    return REFERENCE_TRACE_VIEWS.includes(view) ? view : "front";
  }, [view]);

  const activeReferenceCalibration = useMemo(() => {
    return (
      referenceCalibrationByView?.[activeReferenceView] ||
      normalizeReferenceCalibration()
    );
  }, [referenceCalibrationByView, activeReferenceView]);

  const activeTraceObjects = useMemo(() => {
    return Array.isArray(traceObjectsByView?.[activeReferenceView])
      ? traceObjectsByView[activeReferenceView]
      : [];
  }, [traceObjectsByView, activeReferenceView]);

  const allTraceObjects = useMemo(() => {
    return flattenTraceObjectsByView(traceObjectsByView);
  }, [traceObjectsByView]);

  const setActiveReferenceCalibration = useCallback(
    (nextValue) => {
      setReferenceCalibrationByView((previous) => {
        const current =
          previous?.[activeReferenceView] || normalizeReferenceCalibration();
        const resolved =
          typeof nextValue === "function" ? nextValue(current) : nextValue;

        return {
          ...createEmptyReferenceCalibrationByView(),
          ...previous,
          [activeReferenceView]: normalizeReferenceCalibration(resolved),
        };
      });
    },
    [activeReferenceView, setReferenceCalibrationByView],
  );

  const setActiveTraceObjects = useCallback(
    (nextValue) => {
      setTraceObjectsByView((previous) => {
        const current = Array.isArray(previous?.[activeReferenceView])
          ? previous[activeReferenceView]
          : [];
        const resolved =
          typeof nextValue === "function" ? nextValue(current) : nextValue;

        return {
          ...createEmptyTraceObjectsByView(),
          ...previous,
          [activeReferenceView]: normalizeTraceObjects(
            resolved,
            activeReferenceView,
          ),
        };
      });
    },
    [activeReferenceView, setTraceObjectsByView],
  );

  useEffect(() => {
    setSelectedTraceId(null);
  }, [activeReferenceView, setSelectedTraceId]);

  const hasAnyReferenceFile = useMemo(() => {
    return Object.values(referenceFiles || {}).some((file) => file?.url);
  }, [referenceFiles]);

  const activeReferenceLoaded = useMemo(() => {
    return Boolean(referenceFiles?.[activeReferenceView]?.url);
  }, [referenceFiles, activeReferenceView]);

  const totalTraceCount = useMemo(() => {
    return Array.isArray(allTraceObjects) ? allTraceObjects.length : 0;
  }, [allTraceObjects]);

  const referenceViewSummaries = useMemo(() => {
    return REFERENCE_TRACE_VIEWS.map((viewKey) => {
      const traceCount = Array.isArray(traceObjectsByView?.[viewKey])
        ? traceObjectsByView[viewKey].length
        : 0;
      const hasFile = Boolean(referenceFiles?.[viewKey]?.url);
      const isCalibrated = Boolean(
        referenceCalibrationByView?.[viewKey]?.isCalibrated,
      );

      return {
        key: viewKey,
        label: viewKey.toUpperCase(),
        hasFile,
        traceCount,
        isCalibrated,
        hasTrace: traceCount > 0,
      };
    });
  }, [referenceFiles, traceObjectsByView, referenceCalibrationByView]);

  const loadedButUntracedViews = useMemo(() => {
    return referenceViewSummaries.filter(
      (item) => item.hasFile && !item.hasTrace,
    );
  }, [referenceViewSummaries]);

  const tracedWithoutFileViews = useMemo(() => {
    return referenceViewSummaries.filter(
      (item) => !item.hasFile && item.hasTrace,
    );
  }, [referenceViewSummaries]);

  const usableTraceObjectsByView = useMemo(() => {
    return REFERENCE_TRACE_VIEWS.reduce((accumulator, viewKey) => {
      const rawList = Array.isArray(traceObjectsByView?.[viewKey])
        ? traceObjectsByView[viewKey]
        : [];

      accumulator[viewKey] = normalizeTraceObjects(rawList, viewKey).filter(
        (object) => Number(object?.width) > 5 && Number(object?.height) > 5,
      );

      return accumulator;
    }, createEmptyTraceObjectsByView());
  }, [traceObjectsByView]);

  const usableFrontBackTraceCount = useMemo(() => {
    return (
      (usableTraceObjectsByView.front?.length || 0) +
      (usableTraceObjectsByView.back?.length || 0)
    );
  }, [usableTraceObjectsByView]);

  const usableSideTraceCount = useMemo(() => {
    return (
      (usableTraceObjectsByView.left?.length || 0) +
      (usableTraceObjectsByView.right?.length || 0)
    );
  }, [usableTraceObjectsByView]);

  const usableTopTraceCount = useMemo(() => {
    return usableTraceObjectsByView.top?.length || 0;
  }, [usableTraceObjectsByView]);

  const hasUsableFrontOrBackTrace = useMemo(() => {
    return usableFrontBackTraceCount > 0;
  }, [usableFrontBackTraceCount]);

  const loadedViewsWithoutUsableTrace = useMemo(() => {
    return referenceViewSummaries.filter(
      (item) =>
        item.hasFile &&
        (usableTraceObjectsByView?.[item.key]?.length || 0) === 0,
    );
  }, [referenceViewSummaries, usableTraceObjectsByView]);

  const optionalLoadedViewsWithoutUsableTrace = useMemo(() => {
    return loadedViewsWithoutUsableTrace.filter((item) =>
      ["left", "right", "top"].includes(item.key),
    );
  }, [loadedViewsWithoutUsableTrace]);

  const canConvertReference = useMemo(() => {
    return Boolean(hasAnyReferenceFile && hasUsableFrontOrBackTrace);
  }, [hasAnyReferenceFile, hasUsableFrontOrBackTrace]);

  const convertReadinessTone = useMemo(() => {
    if (!hasAnyReferenceFile || !hasUsableFrontOrBackTrace) return "warning";
    if (
      optionalLoadedViewsWithoutUsableTrace.length ||
      tracedWithoutFileViews.length
    ) {
      return "partial";
    }
    return "ready";
  }, [
    hasAnyReferenceFile,
    hasUsableFrontOrBackTrace,
    optionalLoadedViewsWithoutUsableTrace,
    tracedWithoutFileViews,
  ]);

  const convertRequirementFeedback = useMemo(() => {
    if (!hasAnyReferenceFile) {
      return "No reference view uploaded yet.";
    }

    if (!hasUsableFrontOrBackTrace) {
      if (!activeReferenceLoaded && !totalTraceCount) {
        return `No reference file loaded in active ${activeReferenceView.toUpperCase()} view.`;
      }

      if (usableSideTraceCount || usableTopTraceCount) {
        return `Front or Back trace is required. Current usable traces: ${[
          usableSideTraceCount ? "SIDE" : null,
          usableTopTraceCount ? "TOP" : null,
        ]
          .filter(Boolean)
          .join(" + ")} only.`;
      }

      if (totalTraceCount) {
        return "Front or Back trace is required before convert. Current traces are not usable yet.";
      }

      if (activeReferenceLoaded) {
        return `No traced cabinet section yet in active ${activeReferenceView.toUpperCase()} view. Front or Back trace is required.`;
      }

      return "No traced cabinet section yet in FRONT or BACK view.";
    }

    if (tracedWithoutFileViews.length) {
      return `Warning: may traces sa ${tracedWithoutFileViews
        .map((item) => item.label)
        .join(", ")} pero walang matching reference file.`;
    }

    if (optionalLoadedViewsWithoutUsableTrace.length) {
      return `Ready to convert using FRONT/BACK. ${optionalLoadedViewsWithoutUsableTrace
        .map((item) => item.label)
        .join(
          ", ",
        )} has no usable trace, so the converter will match nearest TOP/SIDE sections first and use fallback depth only when needed.`;
    }

    return `Ready to convert using ${[
      usableFrontBackTraceCount ? "FRONT/BACK" : null,
      usableSideTraceCount ? "SIDE" : null,
      usableTopTraceCount ? "TOP" : null,
    ]
      .filter(Boolean)
      .join(" + ")} trace data.`;
  }, [
    hasAnyReferenceFile,
    activeReferenceLoaded,
    activeReferenceView,
    hasUsableFrontOrBackTrace,
    usableSideTraceCount,
    usableTopTraceCount,
    totalTraceCount,
    tracedWithoutFileViews,
    optionalLoadedViewsWithoutUsableTrace,
    usableFrontBackTraceCount,
  ]);

  return {
    activeReferenceView,
    activeReferenceCalibration,
    activeTraceObjects,
    allTraceObjects,
    setActiveReferenceCalibration,
    setActiveTraceObjects,
    hasAnyReferenceFile,
    totalTraceCount,
    referenceViewSummaries,
    loadedButUntracedViews,
    tracedWithoutFileViews,
    hasUsableFrontOrBackTrace,
    optionalLoadedViewsWithoutUsableTrace,
    canConvertReference,
    convertReadinessTone,
    convertRequirementFeedback,
  };
}
