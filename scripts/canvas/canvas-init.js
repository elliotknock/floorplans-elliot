// Main canvas initialization and module setup
import { initCanvasOperations } from "./canvas-operations.js";
import { initDragDropDevices } from "../devices/drag-drop-devices.js";
import { initSelectBackground } from "../background/select-background.js";
import { initCanvasLayers } from "./canvas-layers.js";
import { initCanvasPrint } from "../export/canvas-print.js";
import { initCanvasCrop } from "../export/canvas-crop.js";
import { initCanvasSnapping } from "./canvas-snapping.js";
import { initContextMenu } from "./context-menu.js";

// Drawing tools
import { setupTextTools } from "../drawing/text-tools.js";
import { setupShapeTools } from "../drawing/shapes.js";
import { setupMeasurementTools } from "../drawing/measurements.js";
import { setupWallTool } from "../drawing/walls.js";
import { setupZoneTool, setupRoomTool } from "../drawing/polygon-drawer.js";
import { setupNorthArrowTool } from "../drawing/north-arrow.js";
import { setupTitleBlockTool } from "../drawing/titleblock.js";
import { setupLineTools } from "../drawing/lines.js";
import { setupBuildingFrontTool } from "../drawing/building-front.js";
import { setupImageUploadTool } from "../drawing/upload-image.js";
import { setupNetworkLinkTool } from "../drawing/network-link.js";

// Device and system modules
import { initTakeoffFeature } from "../devices/device-takeoff.js";
import { SaveSystem } from "../save/save-system.js";
import { addCameraCoverage } from "../devices/camera/camera-core.js";
import { initFloorManager } from "../floor/floor-manager.js";
import { CanvasUndoSystem } from "./canvas-undo.js";
import { TopologyManager } from "../network/topology-manager.js";
import { initTopologyBuilder } from "../network/topology-builder.js";
import { initGlobalSettings } from "../devices/device-settings.js";

// Fixes browser compatibility issues
(function () {
  // Fix textBaseline typo
  const ctxProto = CanvasRenderingContext2D.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(ctxProto, "textBaseline");
  if (descriptor?.set) {
    const originalSetter = descriptor.set;
    Object.defineProperty(ctxProto, "textBaseline", {
      set: function (value) {
        if (value === "alphabetical") value = "alphabetic";
        originalSetter.call(this, value);
      },
    });
  }

  // Fix canvas context warning
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (contextType, contextAttributes) {
    if (["2d", "webgl", "webgl2"].includes(contextType)) {
      contextAttributes = contextAttributes || {};
      if (contextType === "2d") {
        contextAttributes.willReadFrequently = true;
      }
    }
    return originalGetContext.call(this, contextType, contextAttributes);
  };
})();

// Fix Bootstrap modal focus issues
document.addEventListener("hide.bs.modal", (event) => {
  if (document.activeElement?.blur) {
    document.activeElement.blur();
  }
});

// Sets up the main canvas and all modules
window.onload = function () {
  const container = document.querySelector(".canvas-container");
  const fabricCanvas = new fabric.Canvas("canvas-layout", {
    width: container.clientWidth,
    height: container.clientHeight,
  });

  // Make canvas available globally
  window.fabricCanvas = fabricCanvas;

  // Initialize core canvas features
  const coreModules = [() => initCanvasOperations(fabricCanvas), () => initDragDropDevices(fabricCanvas), () => initSelectBackground(fabricCanvas), () => initCanvasLayers(fabricCanvas), () => initCanvasPrint(fabricCanvas), () => initCanvasCrop(fabricCanvas), () => initContextMenu(fabricCanvas)];

  coreModules.forEach((init) => init());

  // Initialize snapping and expose API
  const snappingAPI = initCanvasSnapping(fabricCanvas);
  window.canvasSnapping = snappingAPI;

  // Initialize drawing tools
  const drawingTools = [() => setupTextTools(fabricCanvas), () => setupShapeTools(fabricCanvas), () => setupMeasurementTools(fabricCanvas), () => setupWallTool(fabricCanvas), () => setupZoneTool(fabricCanvas), () => setupRoomTool(fabricCanvas), () => setupNorthArrowTool(fabricCanvas), () => setupTitleBlockTool(fabricCanvas), () => setupLineTools(fabricCanvas), () => setupBuildingFrontTool(fabricCanvas), () => setupImageUploadTool(fabricCanvas), () => setupNetworkLinkTool(fabricCanvas)];

  drawingTools.forEach((setup) => setup());

  // Set up camera coverage
  window.addCameraCoverage = addCameraCoverage;

  // Create save system
  const enhancedSaveSystem = new SaveSystem(fabricCanvas);
  enhancedSaveSystem.setupButtonIntegration();

  // Initialize floor manager
  const floorManager = initFloorManager(fabricCanvas, enhancedSaveSystem);

  // Initialize undo system
  const undoSystem = new CanvasUndoSystem(fabricCanvas);

  // Initialize takeoff feature
  const takeoffGenerator = initTakeoffFeature(fabricCanvas);

  // Initialize network topology
  const topologyManager = new TopologyManager(fabricCanvas);
  initTopologyBuilder(fabricCanvas);

  // Initialize global settings
  initGlobalSettings(fabricCanvas);

  // Expose global APIs
  const globalAPIs = {
    enhancedSaveSystem,
    cameraSerializer: enhancedSaveSystem.getCameraSerializer(),
    floorManager,
    undoSystem,
    takeoffGenerator,
    topologyManager,
    UndoCommands: {
      AddCommand: CanvasUndoSystem.AddCommand,
      RemoveCommand: CanvasUndoSystem.RemoveCommand,
      MultipleCommand: CanvasUndoSystem.MultipleCommand,
    },
    debugTopology: () => topologyManager.debugConnections(),
  };

  Object.assign(window, globalAPIs);

  // Notify modules that canvas is ready
  document.dispatchEvent(
    new CustomEvent("canvas:initialized", {
      detail: { canvas: fabricCanvas },
    })
  );

  // Handle window resize
  const handleResize = () => {
    fabricCanvas.setDimensions({
      width: container.clientWidth,
      height: container.clientHeight,
    });

    const vpt = fabricCanvas.viewportTransform;
    const zoom = fabricCanvas.getZoom();
    vpt[4] = (container.clientWidth - fabricCanvas.getWidth() * zoom) / 2;
    vpt[5] = (container.clientHeight - fabricCanvas.getHeight() * zoom) / 2;
    fabricCanvas.setViewportTransform(vpt);
    fabricCanvas.requestRenderAll();
  };

  window.addEventListener("resize", handleResize);

  // Check layers initialization
  setTimeout(() => {
    if (window.refreshLayers) {
      window.refreshLayers();
    }
  }, 100);

  setTimeout(() => {
    if (window.getLayersState) {
      const layersState = window.getLayersState();
      if (!layersState.isInitialized) {
        console.warn("Layers not properly initialized, forcing refresh...");
        if (window.initCanvasLayers) {
          window.initCanvasLayers(fabricCanvas);
        }
      }
    }
  }, 500);
};
