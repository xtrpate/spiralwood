import {
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";

import api from "../../../services/api";
import { createARModelFiles } from "./arModelExport";

const nextPaint = () =>
  new Promise((resolve) => {
    if (
      typeof window !== "undefined" &&
      typeof window.requestAnimationFrame === "function"
    ) {
      window.requestAnimationFrame(() => resolve());
      return;
    }

    setTimeout(resolve, 0);
  });

export default function useFurnitureAR({
  components,
  dimensionsMm,
}) {
  const [state, setState] = useState({
    open: false,
    status: "idle",
    sessionUrl: "",
    error: "",
  });

  const requestSequenceRef = useRef(0);

  const prepare = useCallback(async () => {
    const sequence = requestSequenceRef.current + 1;
    requestSequenceRef.current = sequence;

    setState({
      open: true,
      status: "preparing",
      sessionUrl: "",
      error: "",
    });

    try {
      await nextPaint();

      const exported = await createARModelFiles(
        components,
        dimensionsMm,
      );

      if (requestSequenceRef.current !== sequence) return;

      setState((current) => ({
        ...current,
        status: "uploading",
      }));

      await nextPaint();

      const form = new FormData();
      form.append("glb", exported.glb);
      form.append("usdz", exported.usdz);
      form.append(
        "dimensions",
        JSON.stringify(exported.dimensionsMm),
      );

      const response = await api.post(
        "/public/ar/sessions",
        form,
        {
          timeout: 120000,
          headers: {
            "Content-Type": "multipart/form-data",
          },
        },
      );

      if (requestSequenceRef.current !== sequence) return;

      const sessionId = String(response.data?.id || "").trim();

      if (!sessionId) {
        throw new Error("The AR preview link was not created.");
      }

      const sessionUrl = new URL(
        `/ar/${encodeURIComponent(sessionId)}`,
        window.location.origin,
      ).href;

      setState({
        open: true,
        status: "ready",
        sessionUrl,
        error: "",
      });
    } catch (error) {
      if (requestSequenceRef.current !== sequence) return;

      console.error("WISDOM AR preparation failed:", error);

      setState({
        open: true,
        status: "error",
        sessionUrl: "",
        error:
          error?.response?.data?.message ||
          error?.message ||
          "The AR preview could not be prepared.",
      });
    }
  }, [components, dimensionsMm]);

  const close = useCallback(() => {
    requestSequenceRef.current += 1;

    setState({
      open: false,
      status: "idle",
      sessionUrl: "",
      error: "",
    });
  }, []);

  const modalProps = useMemo(
    () => ({
      open: state.open,
      status: state.status,
      sessionUrl: state.sessionUrl,
      error: state.error,
      dimensionsMm,
      onClose: close,
      onRetry: prepare,
    }),
    [
      state,
      dimensionsMm,
      close,
      prepare,
    ],
  );

  return {
    open: prepare,
    busy:
      state.status === "preparing" ||
      state.status === "uploading",
    modalProps,
  };
}
