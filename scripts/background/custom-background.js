// Sets up the custom background modal for creating solid color backgrounds
export function initCustomBackground(fabricCanvas, mainModal, updateStepIndicators, handleCrop, setBackgroundSource) {
  const elements = {
    customBackgroundModal: document.getElementById("customBackgroundModal"),
    customBackBtn: document.getElementById("custom-back-btn"),
    customNextBtn: document.getElementById("custom-next-btn"),
    customWidthInput: document.getElementById("custom-width"),
    customHeightInput: document.getElementById("custom-height"),
    customColorSelect: document.getElementById("custom-colour"),
    customPreviewWrapper: document.getElementById("custom-style-container"),
    customPreviewCanvas: document.getElementById("custom-preview-canvas"),
  };

  let previewCanvas, customBackgroundRect, resizeObserver;

  // Cleans up the preview canvas and observers
  const cleanup = () => {
    if (resizeObserver) {
      resizeObserver.disconnect();
      resizeObserver = null;
    }
    if (previewCanvas) {
      previewCanvas.clear();
      previewCanvas.dispose();
      previewCanvas = null;
    }
    customBackgroundRect = null;
    if (window.customCanvasResizeTimeout) {
      clearTimeout(window.customCanvasResizeTimeout);
      window.customCanvasResizeTimeout = null;
    }
  };

  // Creates the preview canvas inside the modal
  const initPreviewCanvas = () => {
    cleanup();
    if (!elements.customPreviewWrapper || !elements.customPreviewCanvas) return;

    setTimeout(() => {
      const containerRect = elements.customPreviewWrapper.getBoundingClientRect();
      const containerWidth = containerRect.width || 600;
      const containerHeight = containerRect.height || 400;
      const canvasWidth = Math.max(containerWidth - 20, 300);
      const canvasHeight = Math.max(containerHeight - 20, 200);

      elements.customPreviewCanvas.width = canvasWidth;
      elements.customPreviewCanvas.height = canvasHeight;
      elements.customPreviewCanvas.style.width = canvasWidth + "px";
      elements.customPreviewCanvas.style.height = canvasHeight + "px";

      previewCanvas = new fabric.Canvas("custom-preview-canvas", { width: canvasWidth, height: canvasHeight, backgroundColor: "#f5f5f5" });
      setupResizeObserver();
      updatePreviewCanvas();
    }, 100);
  };

  // Resizes the preview canvas to match the container
  const resizeCanvas = () => {
    if (!previewCanvas || !elements.customPreviewWrapper) return;

    const containerRect = elements.customPreviewWrapper.getBoundingClientRect();
    if (containerRect.width === 0 || containerRect.height === 0) return;

    const canvasWidth = Math.max(containerRect.width - 20, 300);
    const canvasHeight = Math.max(containerRect.height - 20, 200);

    elements.customPreviewCanvas.width = canvasWidth;
    elements.customPreviewCanvas.height = canvasHeight;
    elements.customPreviewCanvas.style.width = canvasWidth + "px";
    elements.customPreviewCanvas.style.height = canvasHeight + "px";

    previewCanvas.setDimensions({ width: canvasWidth, height: canvasHeight });
    updatePreviewCanvas();
  };

  // Updates the preview canvas with the current settings
  const updatePreviewCanvas = () => {
    if (!previewCanvas || !elements.customWidthInput || !elements.customHeightInput || !elements.customColorSelect) return;

    const width = parseInt(elements.customWidthInput.value) || 800;
    const height = parseInt(elements.customHeightInput.value) || 600;
    const color = elements.customColorSelect.value;
    const canvasWidth = previewCanvas.getWidth();
    const canvasHeight = previewCanvas.getHeight();
    const scale = Math.min(canvasWidth / width, canvasHeight / height, 1);
    const scaledWidth = width * scale;
    const scaledHeight = height * scale;
    const left = (canvasWidth - scaledWidth) / 2;
    const top = (canvasHeight - scaledHeight) / 2;

    if (customBackgroundRect) previewCanvas.remove(customBackgroundRect);
    customBackgroundRect = new fabric.Rect({
      left,
      top,
      width,
      height,
      scaleX: scale,
      scaleY: scale,
      fill: color,
      selectable: false,
      evented: false,
      hoverCursor: "default",
    });

    previewCanvas.add(customBackgroundRect);
    previewCanvas.sendToBack(customBackgroundRect);
    previewCanvas.requestRenderAll();
  };

  // Sets up the resize observer for the preview wrapper
  const setupResizeObserver = () => {
    if (!elements.customPreviewWrapper || resizeObserver) return;
    resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        if (entry.target === elements.customPreviewWrapper && previewCanvas) {
          clearTimeout(window.customCanvasResizeTimeout);
          window.customCanvasResizeTimeout = setTimeout(resizeCanvas, 100);
        }
      }
    });
    resizeObserver.observe(elements.customPreviewWrapper);
  };

  // Opens the custom background modal
  const handleCustomBackgroundSelection = () => {
    bootstrap.Modal.getInstance(mainModal)?.hide();
    setTimeout(() => {
      (bootstrap.Modal.getInstance(elements.customBackgroundModal) || new bootstrap.Modal(elements.customBackgroundModal)).show();
      setTimeout(() => {
        initPreviewCanvas();
        updateStepIndicators(1);
      }, 100);
    }, 200);
  };

  // Handles the back button
  const handleCustomBack = () => {
    bootstrap.Modal.getInstance(elements.customBackgroundModal)?.hide();
    cleanup();
    (bootstrap.Modal.getInstance(mainModal) || new bootstrap.Modal(mainModal)).show();
    updateStepIndicators(1);
  };

  // Handles the next button to create the background
  const handleCustomNext = () => {
    const width = parseInt(elements.customWidthInput.value) || 800;
    const height = parseInt(elements.customHeightInput.value) || 600;
    const color = elements.customColorSelect.value;
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = width;
    tempCanvas.height = height;
    const ctx = tempCanvas.getContext("2d");
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, width, height);
    const dataUrl = tempCanvas.toDataURL("image/png");
    bootstrap.Modal.getInstance(elements.customBackgroundModal)?.hide();
    setBackgroundSource("custom");
    handleCrop(dataUrl);
    updateStepIndicators(2);
  };

  elements.customWidthInput?.addEventListener("input", updatePreviewCanvas);
  elements.customHeightInput?.addEventListener("input", updatePreviewCanvas);
  elements.customColorSelect?.addEventListener("change", updatePreviewCanvas);
  elements.customBackBtn?.addEventListener("click", handleCustomBack);
  elements.customNextBtn?.addEventListener("click", handleCustomNext);

  elements.customBackgroundModal?.addEventListener("hidden.bs.modal", cleanup);
  elements.customBackgroundModal?.addEventListener("shown.bs.modal", () => setTimeout(initPreviewCanvas, 100));

  window.addEventListener("resize", () => {
    if (previewCanvas && elements.customBackgroundModal?.classList.contains("show")) {
      clearTimeout(window.customCanvasResizeTimeout);
      window.customCanvasResizeTimeout = setTimeout(resizeCanvas, 100);
    }
  });

  return { initPreviewCanvas, handleCustomBackgroundSelection };
}
