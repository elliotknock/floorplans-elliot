// Handles canvas interactions, panning, zooming, and clearing
import { initCanvasLayers } from "./canvas-layers.js";
import { initCanvasCrop } from "../export/canvas-crop.js";

export function initCanvasOperations(fabricCanvas) {
  // State variables
  let isPanning = false;
  let lastPosX = 0;
  let lastPosY = 0;

  fabricCanvas.defaultCursor = "move";

  // DOM elements
  const elements = {
    clearButton: document.getElementById("clear-canvas-btn"),
    clearWarningPopup: document.getElementById("clear-warning-popup"),
    cancelClearWarning: document.getElementById("cancel-clear-warning"),
    closeClearWarning: document.getElementById("close-clear-warning"),
    confirmClearWarning: document.getElementById("confirm-clear-warning"),
    subSidebar: document.getElementById("sub-sidebar"),
    downloadButton: document.getElementById("download-background-btn"),
  };

  // Handles mouse down events
  const handleMouseDown = (opt) => {
    fabricCanvas.selection = false;
    const evt = opt.e;
    if (evt.button === 0 && !opt.target) {
      isPanning = true;
      lastPosX = evt.clientX;
      lastPosY = evt.clientY;
      evt.preventDefault();
      evt.stopPropagation();
    }
  };

  // Handles mouse move events
  const handleMouseMove = (opt) => {
    if (!isPanning) return;

    const evt = opt.e;
    const deltaX = evt.clientX - lastPosX;
    const deltaY = evt.clientY - lastPosY;
    lastPosX = evt.clientX;
    lastPosY = evt.clientY;

    const vpt = fabricCanvas.viewportTransform;
    vpt[4] += deltaX;
    vpt[5] += deltaY;
    fabricCanvas.setViewportTransform(vpt);
    fabricCanvas.requestRenderAll();

    evt.preventDefault();
    evt.stopPropagation();
  };

  // Handles mouse up events
  const handleMouseUp = (opt) => {
    if (isPanning) {
      isPanning = false;
      fabricCanvas.selection = true;
      opt.e.preventDefault();
      opt.e.stopPropagation();
    } else {
      fabricCanvas.selection = true;
    }
  };

  // Handles mouse wheel events for zooming
  const handleMouseWheel = (opt) => {
    opt.e.preventDefault();
    opt.e.stopPropagation();

    const delta = opt.e.deltaY;
    let zoom = fabricCanvas.getZoom();
    const zoomFactor = 0.1;
    const minZoom = 0.25;
    const maxZoom = 10;

    zoom = delta > 0 ? Math.max(minZoom, zoom - zoomFactor) : Math.min(maxZoom, zoom + zoomFactor);

    const pointer = fabricCanvas.getPointer(opt.e, true);
    const zoomPoint = new fabric.Point(pointer.x, pointer.y);

    fabricCanvas.zoomToPoint(zoomPoint, zoom);
    fabricCanvas.requestRenderAll();
    if (window.updateZoomDisplay) window.updateZoomDisplay();
  };

  // Add event listeners
  fabricCanvas.on("mouse:down", handleMouseDown);
  fabricCanvas.on("mouse:move", handleMouseMove);
  fabricCanvas.on("mouse:up", handleMouseUp);
  fabricCanvas.on("mouse:wheel", handleMouseWheel);

  // Clears the entire canvas
  const clearCanvas = () => {
    elements.subSidebar.classList.add("hidden");
    if (window.hideDeviceProperties) window.hideDeviceProperties();

    // Remove all objects and their related elements
    fabricCanvas.getObjects().forEach((obj) => {
      if (obj.type === "group" && obj.deviceType) {
        ["textObject", "coverageArea", "leftResizeIcon", "rightResizeIcon", "rotateResizeIcon"].forEach((prop) => {
          if (obj[prop]) fabricCanvas.remove(obj[prop]);
        });
      }
      if (obj.type === "polygon" && obj.class === "zone-polygon" && obj.associatedText) {
        fabricCanvas.remove(obj.associatedText);
      }
      fabricCanvas.remove(obj);
    });

    fabricCanvas.clear();

    // Reset global state
    window.cameraCounter = 1;
    window.deviceCounter = 1;
    window.zones = [];

    // Reinitialize layers and canvas state
    initCanvasLayers(fabricCanvas);
    if (window.resetCanvasState) window.resetCanvasState();

    // Reset canvas properties
    fabricCanvas.pixelsPerMeter = 17.5;
    fabricCanvas.setZoom(1);
    fabricCanvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    fabricCanvas.requestRenderAll();
    if (window.updateZoomDisplay) window.updateZoomDisplay();
  };

  // Set up clear warning modal
  const clearWarningModal = bootstrap.Modal.getOrCreateInstance(elements.clearWarningPopup, {
    backdrop: "static",
    keyboard: false,
  });

  // Set up clear button events
  elements.clearButton.addEventListener("click", () => {
    elements.subSidebar.classList.add("hidden");
    clearWarningModal.show();
  });

  [elements.cancelClearWarning, elements.closeClearWarning].forEach((btn) => {
    btn.addEventListener("click", () => clearWarningModal.hide());
  });

  elements.confirmClearWarning.addEventListener("click", () => {
    clearWarningModal.hide();
    clearCanvas();
  });

  // Initialize cropping and download
  const canvasCrop = initCanvasCrop(fabricCanvas, elements.subSidebar, document.querySelector(".canvas-container"));
  elements.downloadButton.addEventListener("click", () => canvasCrop.startCropForDownload());

  return fabricCanvas;
}
