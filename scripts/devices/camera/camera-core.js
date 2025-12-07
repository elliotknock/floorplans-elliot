// ============================================================================
// CAMERA CORE - Setup, initialization, and event handling
// ============================================================================
// This file consolidates:
// - camera-management.js (setup/initialization)
// - camera-interaction.js (event handlers)

import { layers } from "../../canvas/canvas-layers.js";
import { angleDiff, createCoveragePoints } from "./camera-calculations.js";
import { updateCoverageDisplay, updateSlider } from "./camera-display.js";

// ============================================================================
// INITIALIZATION & CONFIGURATION
// ============================================================================

// Initializes the camera configuration with default values
export function initConfig(camera, pixelsPerMeter) {
  const config = camera.coverageConfig || {};
  config.radius = config.radius || 10 * pixelsPerMeter;
  config.fillColor = config.fillColor || "rgba(165, 155, 155, 0.3)";

  // Extract base color from fill color
  if (!config.baseColor) {
    const match = config.fillColor.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    config.baseColor = match ? `rgb(${match[1]}, ${match[2]}, ${match[3]})` : "rgb(165, 155, 155)";
  }

  config.startAngle = config.startAngle ?? 270;
  config.endAngle = config.endAngle ?? 0;
  config.visible = config.visible ?? true;
  config.edgeStyle = config.edgeStyle || "solid";
  config.cameraHeight = config.cameraHeight || 3;
  config.cameraTilt = config.cameraTilt ?? 25;
  config.cameraFov = config.cameraFov || 60;
  config.projectionMode = config.projectionMode || "circular";
  // Initialize maxRange with current radius or default 50m
  config.maxRange = config.maxRange !== undefined ? config.maxRange : config.radius ? config.radius / pixelsPerMeter : 50;
  // Auto-enable DORI if resolution is set and doriEnabled hasn't been explicitly set
  if (camera.resolution && config.doriEnabled === undefined) {
    config.doriEnabled = true;
  }
  config.isInitialized = true;

  camera.coverageConfig = config;
}

// Normalizes coverage configuration for all cameras on the canvas
export function normalizeAllCameraCoverage(fabricCanvas) {
  fabricCanvas
    .getObjects()
    .filter((obj) => obj.type === "group" && obj.deviceType && obj.coverageConfig)
    .forEach((camera) => {
      if (!camera.coverageConfig) return;

      // Extract base color from fill color
      const match = (camera.coverageConfig.fillColor || "").match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
      if (match) camera.coverageConfig.baseColor = `rgb(${match[1]}, ${match[2]}, ${match[3]})`;

      // Set opacity if not defined
      if (camera.coverageConfig.opacity === undefined) {
        const alphaMatch = (camera.coverageConfig.fillColor || "").match(/rgba\([^,]+,[^,]+,[^,]+,\s*([0-9.]+)\)/i);
        camera.coverageConfig.opacity = alphaMatch ? Math.min(1, Math.max(0, parseFloat(alphaMatch[1]))) : 0.3;
      }

      if (camera.createOrUpdateCoverageArea) camera.createOrUpdateCoverageArea();
    });

  fabricCanvas.requestRenderAll();
}

// Adds camera coverage area to a camera device
export function addCameraCoverage(fabricCanvas, cameraIcon) {
  const pixelsPerMeter = fabricCanvas.pixelsPerMeter || 17.5;

  // Initialize configuration
  initConfig(cameraIcon, pixelsPerMeter);

  // Attach utility functions to the camera icon
  cameraIcon.angleDiff = angleDiff;
  cameraIcon.createCoveragePoints = (start, end, x, y, r) => {
    const walls = fabricCanvas.getObjects("line").filter((line) => line.isWallLine || line.startCircle || line.endCircle);
    return createCoveragePoints(walls, cameraIcon, start, end, x, y, r);
  };

  // Define the update function
  const updateCoverage = () => {
    updateCoverageDisplay(fabricCanvas, cameraIcon);
  };

  // Attach the update function to the camera icon
  cameraIcon.createOrUpdateCoverageArea = updateCoverage;

  // Initial update
  updateCoverage();

  // Setup event handlers
  setupCameraEvents(fabricCanvas, cameraIcon, updateCoverage);

  return { coverageArea: cameraIcon.coverageArea };
}

// ============================================================================
// EVENT HANDLING & INTERACTION
// ============================================================================

// Connects drag behavior to a resize icon so users can adjust the camera view
function handleIconInteraction(icon, cameraIcon, fabricCanvas, propertyName, updateCoverage) {
  icon.on("mousedown", (options) => {
    options.e.preventDefault();
    options.e.stopPropagation();

    // Hide property panels while dragging
    window.suppressDeviceProperties = true;
    window.hideDeviceProperties?.();

    // Turn off walls temporarily so they don't interfere with dragging
    const walls = fabricCanvas.getObjects().filter((object) => (object.type === "line" && !object.deviceType && !object.isResizeIcon) || (object.type === "circle" && object.isWallCircle));
    walls.forEach((wall) => {
      wall.origEvented = wall.evented;
      wall.origSelectable = wall.selectable;
      wall.set({ evented: false, selectable: false });
    });

    // Track which icon is being dragged
    if (propertyName === "leftResizeIcon") cameraIcon.isResizingLeft = true;
    else if (propertyName === "rightResizeIcon") cameraIcon.isResizingRight = true;
    else {
      cameraIcon.isRotating = true;
      const pointer = fabricCanvas.getPointer(options.e);
      const centerPoint = cameraIcon.getCenterPoint();
      // Save starting angle to calculate how far it rotates
      cameraIcon.initialMouseAngle = (Math.round(fabric.util.radiansToDegrees(Math.atan2(pointer.y - centerPoint.y, pointer.x - centerPoint.x))) + 360) % 360;
      cameraIcon.initialStart = cameraIcon.coverageConfig.startAngle;
      cameraIcon.initialEnd = cameraIcon.coverageConfig.endAngle;
    }

    fabricCanvas.setActiveObject(cameraIcon);
    fabricCanvas.selection = false;

    // Cleanup when user releases the mouse
    const stopResizing = (event) => {
      if (event?.e) {
        event.e.preventDefault();
        event.e.stopPropagation();
      }

      cameraIcon.isResizingLeft = cameraIcon.isResizingRight = cameraIcon.isRotating = false;
      fabricCanvas.selection = true;

      // Turn walls back on after a short delay
      setTimeout(
        () =>
          walls.forEach((wall) => {
            wall.set({ evented: wall.origEvented ?? true, selectable: wall.origSelectable ?? true });
            delete wall.origEvented;
            delete wall.origSelectable;
          }),
        150
      );

      // Show resize icons only if camera is selected and visible
      const active = fabricCanvas.getActiveObject() === cameraIcon;
      const show = active && cameraIcon.coverageConfig.visible && layers.devices.visible;

      [cameraIcon.leftResizeIcon, cameraIcon.rightResizeIcon, cameraIcon.rotateResizeIcon].forEach((resizeIcon) => resizeIcon && resizeIcon.set({ visible: show }).bringToFront());
      if (cameraIcon.textObject) cameraIcon.textObject.bringToFront();

      window.suppressDeviceProperties = false;
      if (active) window.showDeviceProperties?.(cameraIcon.deviceType, cameraIcon.textObject, cameraIcon);

      document.removeEventListener("mouseup", stopResizing);
      fabricCanvas.off("mouse:up", stopResizing);
      fabricCanvas.renderAll();
    };

    document.addEventListener("mouseup", stopResizing, { once: true });
    fabricCanvas.on("mouse:up", stopResizing);
  });

  icon.on("mouseover", () => {
    icon.bringToFront();
    fabricCanvas.renderAll();
  });
}

// Creates the three drag icons that let users resize and rotate the camera view
function setupResizeIcons(cameraIcon, fabricCanvas, updateCoverage) {
  if (cameraIcon.leftResizeIcon) return;

  // Load images for left, right, and rotate icons
  const icons = [
    { url: "./images/icons/left-resize.png", cursor: "col-resize", prop: "leftResizeIcon" },
    { url: "./images/icons/right-resize.png", cursor: "col-resize", prop: "rightResizeIcon" },
    { url: "./images/icons/four-arrows.png", cursor: "pointer", prop: "rotateResizeIcon" },
  ];

  let loaded = 0;
  icons.forEach(({ url, cursor, prop }) => {
    fabric.Image.fromURL(url, (image) => {
      if (!image) return;
      image.set({
        scaleX: 0.05,
        scaleY: 0.05,
        originX: "center",
        originY: "center",
        hasControls: false,
        hasBorders: false,
        selectable: false,
        evented: true,
        visible: false,
        opacity: layers.devices.opacity,
        isResizeIcon: true,
        hoverCursor: cursor,
      });

      cameraIcon[prop] = image;
      fabricCanvas.add(image);
      handleIconInteraction(image, cameraIcon, fabricCanvas, prop, updateCoverage);

      if (++loaded === 3) {
        // Handle mouse movement while dragging any of the three icons
        const moveHandler = (options) => {
          if (!cameraIcon.isResizingLeft && !cameraIcon.isResizingRight && !cameraIcon.isRotating) return;
          if (options.e) {
            options.e.preventDefault();
            options.e.stopPropagation();
          }

          const pointer = fabricCanvas.getPointer(options.e);
          const centerPoint = cameraIcon.getCenterPoint();
          let curAngle = (Math.round(fabric.util.radiansToDegrees(Math.atan2(pointer.y - centerPoint.y, pointer.x - centerPoint.x))) + 360) % 360;
          const dist = Math.hypot(pointer.x - centerPoint.x, pointer.y - centerPoint.y);
          const pixelsPerMeter = fabricCanvas.pixelsPerMeter || 17.5;

          if (cameraIcon.isRotating) {
            // Calculate how much to rotate based on mouse movement
            const delta = (curAngle - cameraIcon.initialMouseAngle + 360) % 360;
            cameraIcon.coverageConfig.startAngle = Math.round((cameraIcon.initialStart + delta) % 360);
            cameraIcon.coverageConfig.endAngle = Math.round((cameraIcon.initialEnd + delta) % 360);
            
            // Only update distance if lock distance on rotate is not enabled
            if (!cameraIcon.coverageConfig.lockDistanceOnRotate) {
              cameraIcon.coverageConfig.radius = Math.max(pixelsPerMeter, Math.min(dist, 500 * pixelsPerMeter));
              cameraIcon.coverageConfig.maxRange = cameraIcon.coverageConfig.radius / pixelsPerMeter;
              updateSlider("camera-distance-slider", "camera-distance-input", cameraIcon.coverageConfig.maxRange, 1, 500);
            }
          } else {
            const isLeft = cameraIcon.isResizingLeft;
            const other = isLeft ? cameraIcon.coverageConfig.endAngle : cameraIcon.coverageConfig.startAngle;
            const span = angleDiff(isLeft ? curAngle : other, isLeft ? other : curAngle);

            // Prevent the two sides from overlapping
            if (span < 1) {
              if (angleDiff(cameraIcon.coverageConfig.startAngle, cameraIcon.coverageConfig.endAngle) > 180) {
                cameraIcon.coverageConfig.startAngle = cameraIcon.coverageConfig.endAngle = (Math.round(curAngle + (isLeft ? 5 : -5)) + 360) % 360;
              } else {
                const newAngle = (other + (isLeft ? -1 : 1) + 360) % 360;
                if (isLeft) cameraIcon.coverageConfig.startAngle = newAngle;
                else cameraIcon.coverageConfig.endAngle = newAngle;
              }
            } else {
              if (isLeft) cameraIcon.coverageConfig.startAngle = Math.round(curAngle);
              else cameraIcon.coverageConfig.endAngle = Math.round(curAngle);
            }
          }

          cameraIcon.coverageConfig.isInitialized = true;
          updateSlider("camera-angle-slider", "camera-angle-input", Math.round(angleDiff(cameraIcon.coverageConfig.startAngle, cameraIcon.coverageConfig.endAngle)), 1, 360);
          updateCoverage();

          [cameraIcon.rotateResizeIcon, cameraIcon.leftResizeIcon, cameraIcon.rightResizeIcon, cameraIcon.textObject].forEach((object) => object?.bringToFront());
        };

        if (cameraIcon.moveHandler) fabricCanvas.off("mouse:move", cameraIcon.moveHandler);
        cameraIcon.moveHandler = moveHandler;
        fabricCanvas.on("mouse:move", moveHandler);

        updateCoverage();
      }
    });
  });
}

// Connects camera to canvas events so the view updates when things change
export function setupCameraEvents(fabricCanvas, cameraIcon, updateCoverageCallback) {
  // Update view when walls are added, changed, or moved
  const handlers = {
    added: (options) => options.target?.type === "line" && options.target.stroke === "red" && updateCoverageCallback(),
    modified: (options) => options.target?.type === "line" && options.target.stroke === "red" && updateCoverageCallback(),
    moving: (options) => options.target?.type === "circle" && updateCoverageCallback(),
  };

  Object.entries(handlers).forEach(([event, handler]) => {
    if (cameraIcon[`${event}H`]) fabricCanvas.off(`object:${event}`, cameraIcon[`${event}H`]);
    cameraIcon[`${event}H`] = handler;
    fabricCanvas.on(`object:${event}`, handler);
  });

  // Remove old event listeners before adding new ones
  const cleanup = () => {
    ["selected", "deselected", "moving", "removed"].forEach((eventName) => {
      const handler = cameraIcon[`onCov${eventName}`];
      if (handler) cameraIcon.off(eventName, handler);
    });
  };
  cleanup();

  // Update sliders and show icons when camera is selected
  cameraIcon.onCovselected = () => {
    const pixelsPerMeter = fabricCanvas.pixelsPerMeter || 17.5;
    updateSlider("camera-angle-slider", "camera-angle-input", Math.round(angleDiff(cameraIcon.coverageConfig.startAngle, cameraIcon.coverageConfig.endAngle)), 1, 360);
    updateSlider("camera-opacity-slider", "camera-opacity-input", cameraIcon.coverageConfig.opacity || 0.3, 0, 1);
    updateSlider("camera-distance-slider", "camera-distance-input", cameraIcon.coverageConfig.radius / pixelsPerMeter, 1, 500);

    const toggle = document.getElementById("camera-coverage-toggle");
    if (toggle) toggle.checked = cameraIcon.coverageConfig.visible !== false;

    const show = cameraIcon.coverageConfig.visible && layers.devices.visible;
    [cameraIcon.leftResizeIcon, cameraIcon.rightResizeIcon, cameraIcon.rotateResizeIcon].forEach((icon) => icon && icon.set({ visible: show }).bringToFront());
    fabricCanvas.renderAll();
  };

  // Hide icons when camera is deselected
  cameraIcon.onCovdeselected = () => {
    if (!cameraIcon.isResizingLeft && !cameraIcon.isResizingRight && !cameraIcon.isRotating) {
      [cameraIcon.leftResizeIcon, cameraIcon.rightResizeIcon, cameraIcon.rotateResizeIcon].forEach((icon) => icon && icon.set({ visible: false }));
      fabricCanvas.renderAll();
    }
  };

  // Update view and keep label on top when camera is moved
  cameraIcon.onCovmoving = () => {
    updateCoverageCallback();
    cameraIcon.textObject?.bringToFront();
  };

  // Clean up all related objects when camera is deleted
  cameraIcon.onCovremoved = () => {
    Object.keys(handlers).forEach((event) => fabricCanvas.off(`object:${event}`, cameraIcon[`${event}H`]));
    [cameraIcon.coverageArea, cameraIcon.leftResizeIcon, cameraIcon.rightResizeIcon, cameraIcon.rotateResizeIcon].forEach((item) => item && fabricCanvas.remove(item));
  };

  cameraIcon.on("selected", cameraIcon.onCovselected);
  cameraIcon.on("deselected", cameraIcon.onCovdeselected);
  cameraIcon.on("moving", cameraIcon.onCovmoving);
  cameraIcon.on("removed", cameraIcon.onCovremoved);

  setupResizeIcons(cameraIcon, fabricCanvas, updateCoverageCallback);
}

