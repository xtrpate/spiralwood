// Shared lifecycle helpers for the Blueprint Three.js viewer.

export function resizeViewerToMount({
  mount,
  renderer,
  camera,
  restoreCameraView,
  cameraView,
}) {
  if (!mount || !renderer || !camera) return;

  const width = mount.clientWidth || 1000;
  const height = mount.clientHeight || 700;

  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  restoreCameraView?.(cameraView);
}

export function bindBlueprintViewerEvents({
  windowTarget,
  canvas,
  rendererElement,
  transform,
  orbit,
  handlers,
}) {
  const bindings = [
    [transform, "dragging-changed", handlers.onDraggingChanged],
    [transform, "objectChange", handlers.onTransformObjectChange],
    [orbit, "change", handlers.onOrbitChange],
    [rendererElement, "pointerdown", handlers.onPointerDown],
    [windowTarget, "pointermove", handlers.onPointerMove],
    [windowTarget, "pointerup", handlers.onPointerUp],
    [windowTarget, "mouseup", handlers.onPointerUp],
    [windowTarget, "pointercancel", handlers.onPointerCancel],
    [rendererElement, "dblclick", handlers.onDoubleClick],
    [rendererElement, "contextmenu", handlers.onContextMenu],
    [windowTarget, "resize", handlers.onResize],
    [windowTarget, "keydown", handlers.onKeyDown],
    [windowTarget, "keyup", handlers.onKeyUp],
    [windowTarget, "blur", handlers.onWindowBlur],
    [canvas, "mouseenter", handlers.onCanvasEnter],
    [canvas, "mouseleave", handlers.onCanvasLeave],
    [canvas, "click", handlers.onCanvasClick],
  ];

  bindings.forEach(([target, type, handler]) => {
    target?.addEventListener?.(type, handler);
  });

  return () => {
    [...bindings].reverse().forEach(([target, type, handler]) => {
      target?.removeEventListener?.(type, handler);
    });
  };
}

export function startBlueprintViewerRenderLoop({
  renderer,
  scene,
  camera,
  orbit,
  onFrame,
  lastFrameRef,
}) {
  let animationFrameId = 0;
  lastFrameRef.current = performance.now();

  const animate = () => {
    animationFrameId = requestAnimationFrame(animate);

    const now = performance.now();
    const delta = Math.min((now - lastFrameRef.current) / 1000, 0.05);
    lastFrameRef.current = now;

    onFrame?.(delta);
    orbit.update();
    renderer.render(scene, camera);
  };

  animate();

  return () => {
    cancelAnimationFrame(animationFrameId);
  };
}
