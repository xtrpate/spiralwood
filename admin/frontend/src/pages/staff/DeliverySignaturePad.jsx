import { useEffect, useRef, useState } from "react";

const MAX_CANVAS_WIDTH = 1600;
const MAX_CANVAS_HEIGHT = 800;
const MIN_CANVAS_WIDTH = 320;
const MIN_CANVAS_HEIGHT = 140;

const fillCanvasWhite = (canvas) => {
  const ctx = canvas?.getContext?.("2d");
  if (!canvas || !ctx) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
};

const drawImageContained = (canvas, image) => {
  const ctx = canvas?.getContext?.("2d");
  if (!canvas || !ctx || !image?.width || !image?.height) return;

  const padding = Math.max(10, Math.round(Math.min(canvas.width, canvas.height) * 0.035));
  const maxWidth = Math.max(1, canvas.width - padding * 2);
  const maxHeight = Math.max(1, canvas.height - padding * 2);
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  const x = (canvas.width - width) / 2;
  const y = (canvas.height - height) / 2;

  fillCanvasWhite(canvas);
  ctx.drawImage(image, x, y, width, height);
};

const loadSignatureIntoCanvas = (canvas, dataUrl) => {
  fillCanvasWhite(canvas);
  if (!canvas || !dataUrl) return Promise.resolve(false);

  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      drawImageContained(canvas, image);
      resolve(true);
    };
    image.onerror = () => {
      fillCanvasWhite(canvas);
      resolve(false);
    };
    image.src = dataUrl;
  });
};

const getBackingSize = (surface) => {
  const rect = surface?.getBoundingClientRect?.();
  const cssWidth = Math.max(1, Number(rect?.width || 0));
  const cssHeight = Math.max(1, Number(rect?.height || 0));

  const scale = Math.min(
    1.5,
    MAX_CANVAS_WIDTH / cssWidth,
    MAX_CANVAS_HEIGHT / cssHeight,
  );

  return {
    width: Math.max(
      MIN_CANVAS_WIDTH,
      Math.min(MAX_CANVAS_WIDTH, Math.round(cssWidth * Math.max(scale, 0.5))),
    ),
    height: Math.max(
      MIN_CANVAS_HEIGHT,
      Math.min(MAX_CANVAS_HEIGHT, Math.round(cssHeight * Math.max(scale, 0.5))),
    ),
  };
};

const resizeCanvasPreservingDraft = (canvas, surface, preserve = true) => {
  if (!canvas || !surface) return false;
  const { width, height } = getBackingSize(surface);

  if (canvas.width === width && canvas.height === height) {
    return false;
  }

  let oldCopy = null;
  if (preserve && canvas.width > 0 && canvas.height > 0) {
    oldCopy = document.createElement("canvas");
    oldCopy.width = canvas.width;
    oldCopy.height = canvas.height;
    oldCopy.getContext("2d")?.drawImage(canvas, 0, 0);
  }

  canvas.width = width;
  canvas.height = height;
  fillCanvasWhite(canvas);

  if (oldCopy) drawImageContained(canvas, oldCopy);
  return true;
};

export default function DeliverySignaturePad({
  value = "",
  onChange,
  disabled = false,
}) {
  const surfaceRef = useRef(null);
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const activePointerRef = useRef(null);
  const initializedRef = useRef(false);
  const draftHasInkRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [canvasReady, setCanvasReady] = useState(false);
  const [draftHasInk, setDraftHasInk] = useState(false);

  const setInkState = (next) => {
    draftHasInkRef.current = Boolean(next);
    setDraftHasInk(Boolean(next));
  };

  useEffect(() => {
    if (!open) return undefined;

    let cancelled = false;
    let frameId = null;
    let resizeObserver = null;
    initializedRef.current = false;
    drawingRef.current = false;
    activePointerRef.current = null;
    setCanvasReady(false);
    setInkState(false);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const initialize = async () => {
      const surface = surfaceRef.current;
      const canvas = canvasRef.current;
      if (!surface || !canvas || cancelled) return;

      resizeCanvasPreservingDraft(canvas, surface, false);
      const loadedExisting = await loadSignatureIntoCanvas(canvas, value || "");
      if (cancelled) return;

      setInkState(Boolean(value) && loadedExisting);
      initializedRef.current = true;
      setCanvasReady(true);

      if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(() => {
          if (!initializedRef.current || drawingRef.current) return;
          resizeCanvasPreservingDraft(
            canvasRef.current,
            surfaceRef.current,
            draftHasInkRef.current,
          );
        });
        resizeObserver.observe(surface);
      }
    };

    frameId = window.requestAnimationFrame(initialize);

    const handleResize = () => {
      if (!initializedRef.current || drawingRef.current) return;
      resizeCanvasPreservingDraft(
        canvasRef.current,
        surfaceRef.current,
        draftHasInkRef.current,
      );
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("resize", handleResize);
    document.addEventListener("keydown", handleKeyDown);

    if (window.screen?.orientation?.lock) {
      try {
        const lockResult = window.screen.orientation.lock("landscape");
        lockResult?.catch?.(() => {
          // Full-screen signing remains responsive when orientation locking
          // is unsupported or blocked by the browser.
        });
      } catch {
        // Some browsers expose the API but reject synchronously.
      }
    }

    return () => {
      cancelled = true;
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      resizeObserver?.disconnect?.();
      drawingRef.current = false;
      activePointerRef.current = null;
      initializedRef.current = false;
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("resize", handleResize);
      document.removeEventListener("keydown", handleKeyDown);
      try {
        window.screen?.orientation?.unlock?.();
      } catch {
        // Safe fallback for browsers that reject orientation unlock.
      }
    };
  }, [open, value]);

  const getPoint = (event) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const safeWidth = Math.max(1, rect.width);
    const safeHeight = Math.max(1, rect.height);

    return {
      x: ((event.clientX - rect.left) / safeWidth) * canvas.width,
      y: ((event.clientY - rect.top) / safeHeight) * canvas.height,
    };
  };

  const startDrawing = (event) => {
    if (disabled || !open || !canvasReady) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext?.("2d");
    if (!canvas || !ctx) return;

    const point = getPoint(event);
    drawingRef.current = true;
    activePointerRef.current = event.pointerId;
    canvas.setPointerCapture?.(event.pointerId);

    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    ctx.lineTo(point.x + 0.01, point.y + 0.01);
    ctx.strokeStyle = "#111111";
    ctx.lineWidth = Math.max(3, Math.min(6, canvas.width / 260));
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();

    setInkState(true);
    event.preventDefault();
  };

  const continueDrawing = (event) => {
    if (
      disabled ||
      !canvasReady ||
      !drawingRef.current ||
      activePointerRef.current !== event.pointerId
    ) {
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext?.("2d");
    if (!canvas || !ctx) return;

    const point = getPoint(event);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    event.preventDefault();
  };

  const finishDrawing = (event) => {
    if (
      !drawingRef.current ||
      activePointerRef.current !== event.pointerId
    ) {
      return;
    }

    const canvas = canvasRef.current;
    drawingRef.current = false;
    activePointerRef.current = null;

    try {
      canvas?.releasePointerCapture?.(event.pointerId);
    } catch {
      // Browser may already have released the pointer.
    }

    resizeCanvasPreservingDraft(
      canvasRef.current,
      surfaceRef.current,
      draftHasInkRef.current,
    );

    event.preventDefault();
  };

  const clearDraft = () => {
    if (disabled || !canvasReady) return;
    fillCanvasWhite(canvasRef.current);
    setInkState(false);
  };

  const cancelDraft = () => {
    if (disabled) return;
    setOpen(false);
  };

  const confirmDraft = () => {
    if (disabled || !canvasReady) return;
    const canvas = canvasRef.current;
    const nextValue = draftHasInkRef.current && canvas
      ? canvas.toDataURL("image/png")
      : "";
    onChange?.(nextValue);
    setOpen(false);
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          minHeight: 72,
          padding: "10px 12px",
          border: "1px solid #d4d4d8",
          background: "#ffffff",
          boxSizing: "border-box",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#18181b" }}>
            {value ? "E-signature captured" : "No e-signature captured"}
          </div>
          <div
            style={{
              marginTop: 3,
              fontSize: 11,
              lineHeight: 1.45,
              color: "#71717a",
            }}
          >
            Optional. Delivery can be acknowledged without an e-signature.
          </div>
        </div>

        <button
          type="button"
          className="rider-btn rider-btn-secondary"
          disabled={disabled}
          onClick={() => setOpen(true)}
          style={{ minHeight: 34, padding: "0 12px", flex: "0 0 auto" }}
        >
          {value ? "Edit Signature" : "Open Signature Pad"}
        </button>
      </div>

      {value ? (
        <div
          style={{
            marginTop: 8,
            padding: 10,
            border: "1px solid #e4e4e7",
            background: "#fafafa",
          }}
        >
          <img
            src={value}
            alt="Captured recipient e-signature"
            style={{
              display: "block",
              width: "100%",
              maxWidth: 420,
              height: 72,
              objectFit: "contain",
              objectPosition: "left center",
            }}
          />
        </div>
      ) : null}

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Recipient signature pad"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2000,
            display: "flex",
            flexDirection: "column",
            background: "#f4f4f5",
            padding: 14,
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 16,
              padding: "4px 2px 10px",
            }}
          >
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#18181b" }}>
                Recipient E-Signature (optional)
              </div>
              <div style={{ marginTop: 3, fontSize: 11, color: "#71717a" }}>
                Sign anywhere inside the entire white area. Landscape gives the widest space.
              </div>
            </div>
            <div style={{ fontSize: 11, color: "#71717a", textAlign: "right" }}>
              Clear removes this draft. Cancel keeps the previously saved signature.
            </div>
          </div>

          <div
            ref={surfaceRef}
            style={{
              flex: "1 1 auto",
              minHeight: 140,
              position: "relative",
              overflow: "hidden",
              background: "#ffffff",
              border: "1px solid #a1a1aa",
            }}
          >
            <canvas
              ref={canvasRef}
              onPointerDown={startDrawing}
              onPointerMove={continueDrawing}
              onPointerUp={finishDrawing}
              onPointerCancel={finishDrawing}
              style={{
                position: "absolute",
                inset: 0,
                display: "block",
                width: "100%",
                height: "100%",
                background: "#ffffff",
                cursor: disabled || !canvasReady ? "wait" : "crosshair",
                touchAction: "none",
              }}
            />
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              flexWrap: "wrap",
              gap: 8,
              paddingTop: 10,
            }}
          >
            <button
              type="button"
              className="rider-btn rider-btn-secondary"
              onClick={clearDraft}
              disabled={disabled || !canvasReady || !draftHasInk}
            >
              Clear
            </button>
            <button
              type="button"
              className="rider-btn rider-btn-secondary"
              onClick={cancelDraft}
              disabled={disabled}
            >
              Cancel
            </button>
            <button
              type="button"
              className="rider-btn rider-btn-primary"
              onClick={confirmDraft}
              disabled={disabled || !canvasReady}
            >
              Confirm Signature
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
