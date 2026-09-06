import { useEffect, useRef } from "react";

const CANVAS_WIDTH = 720;
const CANVAS_HEIGHT = 220;

export default function DeliverySignaturePad({
  value = "",
  onChange,
  disabled = false,
}) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const activePointerRef = useRef(null);

  const resetCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
  };

  useEffect(() => {
    if (!value) resetCanvas();
  }, [value]);

  const getPoint = (event) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();

    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const startDrawing = (event) => {
    if (disabled) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const point = getPoint(event);

    drawingRef.current = true;
    activePointerRef.current = event.pointerId;
    canvas.setPointerCapture?.(event.pointerId);

    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    ctx.lineTo(point.x + 0.01, point.y + 0.01);
    ctx.strokeStyle = "#111111";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();

    event.preventDefault();
  };

  const continueDrawing = (event) => {
    if (
      disabled ||
      !drawingRef.current ||
      activePointerRef.current !== event.pointerId
    ) {
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
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
      canvas.releasePointerCapture?.(event.pointerId);
    } catch {
      // Pointer may already have been released by the browser.
    }

    onChange?.(canvas.toDataURL("image/png"));
    event.preventDefault();
  };

  const clearSignature = () => {
    if (disabled) return;
    resetCanvas();
    onChange?.("");
  };

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        aria-label="Recipient signature pad"
        onPointerDown={startDrawing}
        onPointerMove={continueDrawing}
        onPointerUp={finishDrawing}
        onPointerCancel={finishDrawing}
        style={{
          display: "block",
          width: "100%",
          height: "180px",
          background: "#ffffff",
          border: "1px solid #d4d4d8",
          borderRadius: 0,
          cursor: disabled ? "not-allowed" : "crosshair",
          touchAction: "none",
          boxSizing: "border-box",
        }}
      />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          marginTop: "8px",
        }}
      >
        <span style={{ fontSize: "11px", color: "#71717a" }}>
          Sign using a finger, stylus, or mouse.
        </span>

        <button
          type="button"
          onClick={clearSignature}
          disabled={disabled || !value}
          className="rider-btn rider-btn-secondary"
          style={{ minHeight: 32, padding: "0 12px" }}
        >
          Clear Signature
        </button>
      </div>
    </div>
  );
}
