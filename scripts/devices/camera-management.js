import { layers } from "../canvas/canvas-layers.js";

// Calculates angle difference between two angles
const angleDiff = (start, end) => (end - start + 360) % 360 || 360;

// Calculates distance between two points
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Normalizes a vector to unit length
const normalize = (x, y) => {
  const len = Math.hypot(x, y) || 1;
  return { x: x / len, y: y / len };
};

// Finds intersection point between two lines
const lineIntersect = (p1, p2, p3, p4) => {
  const denom = (p4.y - p3.y) * (p2.x - p1.x) - (p4.x - p3.x) * (p2.y - p1.y);
  if (Math.abs(denom) < 1e-10) return null;
  const ua = ((p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)) / denom;
  const ub = ((p2.x - p1.x) * (p1.y - p3.y) - (p2.y - p1.y) * (p1.x - p3.x)) / denom;
  return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1 ? { x: p1.x + ua * (p2.x - p1.x), y: p1.y + ua * (p2.y - p1.y) } : null;
};

// Sets up camera coverage settings with default values
function initConfig(camera, pixelsPerMeter) {
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
  config.isInitialized = true;

  camera.coverageConfig = config;
}

// Creates coverage area points with wall collision detection
function createCoveragePoints(canvas, camera, startAngle, endAngle, centerX, centerY) {
  const span = angleDiff(startAngle, endAngle);
  const isFullCircle = span >= 359.9;
  const points = [];
  const center = { x: centerX, y: centerY };

  if (!isFullCircle) points.push(center);

  const numRays = Math.max(isFullCircle ? 180 : Math.ceil(span / 2), 20);
  const step = (isFullCircle ? 360 : span) / numRays;
  const walls = canvas.getObjects("line").filter((line) => line.isWallLine || line.startCircle || line.endCircle);

  for (let i = 0; i <= numRays; i++) {
    const angle = (isFullCircle ? 0 : startAngle) + i * step;
    const rad = fabric.util.degreesToRadians(angle % 360);
    const rayEnd = {
      x: centerX + camera.coverageConfig.radius * 2 * Math.cos(rad),
      y: centerY + camera.coverageConfig.radius * 2 * Math.sin(rad),
    };

    let closest = null;
    let minDist = Infinity;

    // Check for wall intersections
    for (const wall of walls) {
      const intersection = lineIntersect(center, rayEnd, { x: wall.x1, y: wall.y1 }, { x: wall.x2, y: wall.y2 });
      if (intersection) {
        const dist = distance(center, intersection);
        if (dist < minDist && dist <= camera.coverageConfig.radius) {
          minDist = dist;
          closest = intersection;
        }
      }
    }

    points.push(
      closest || {
        x: centerX + camera.coverageConfig.radius * Math.cos(rad),
        y: centerY + camera.coverageConfig.radius * Math.sin(rad),
      }
    );
  }

  return points;
}

// Updates slider and input values with visual feedback
const updateSlider = (sliderId, inputId, value, min, max) => {
  const slider = document.getElementById(sliderId);
  const input = document.getElementById(inputId);
  if (slider) {
    slider.value = value;
    const percentage = ((value - min) / (max - min)) * 100;
    slider.style.background = `linear-gradient(to right, var(--orange-ip2) ${percentage}%, var(--white-ip2) ${percentage}%)`;
  }
  if (input) input.value = typeof value === "number" ? value.toFixed(value >= 10 ? 1 : 2) : value;
};

// Returns dash pattern for different edge styles
const getStrokeDashArray = (edgeStyle) => {
  switch (edgeStyle) {
    case "dashed":
      return [10, 5];
    case "dotted":
      return [2, 2];
    default:
      return null;
  }
};

// Calculates positions for resize icons
const calculateIconPositions = (camera, angleSpan, isFullCircle, center) => {
  const isSmallAngle = angleSpan <= 5;
  const leftRad = fabric.util.degreesToRadians(isFullCircle || isSmallAngle ? (camera.coverageConfig.startAngle - 5 + 360) % 360 : camera.coverageConfig.startAngle);
  const rightRad = fabric.util.degreesToRadians(isFullCircle || isSmallAngle ? (camera.coverageConfig.startAngle + 5) % 360 : camera.coverageConfig.endAngle);
  const midRad = fabric.util.degreesToRadians((camera.coverageConfig.startAngle + angleSpan / 2) % 360);

  return { leftRad, rightRad, midRad };
};

// Updates position and visibility of resize icons
const updateIconPosition = (icon, camera, center, angle, radius, iconScale, shouldShow, iconType) => {
  if (!icon) return;

  // Calculate angle for each icon type
  let iconAngle;
  if (iconType === "left") {
    iconAngle = camera.coverageConfig.startAngle + 90;
  } else if (iconType === "right") {
    const angleSpan = camera.angleDiff(camera.coverageConfig.startAngle, camera.coverageConfig.endAngle);
    const isFullCircle = angleSpan >= 359.9;
    const isSmallAngle = angleSpan <= 5;
    iconAngle = isFullCircle || isSmallAngle ? (camera.coverageConfig.startAngle + 5 + 90) % 360 : camera.coverageConfig.endAngle + 90;
  } else if (iconType === "rotate") {
    const angleSpan = camera.angleDiff(camera.coverageConfig.startAngle, camera.coverageConfig.endAngle);
    iconAngle = ((camera.coverageConfig.startAngle + angleSpan / 2) % 360) + 90;
  } else {
    iconAngle = angle + 90;
  }

  icon
    .set({
      left: center.x + radius * Math.cos(angle),
      top: center.y + radius * Math.sin(angle),
      angle: iconAngle,
      scaleX: iconScale,
      scaleY: iconScale,
      opacity: layers.devices.opacity,
      visible: shouldShow,
      evented: true,
      selectable: false,
    })
    .setCoords();
  if (shouldShow) icon.bringToFront();
};

// Creates or updates camera coverage area and resize controls
function createOrUpdateCoverageArea(fabricCanvas, cameraIcon) {
  // Quick update if already initialized
  if (cameraIcon._coverageInitialized && cameraIcon.coverageArea && cameraIcon.createCoveragePoints && cameraIcon.angleDiff) {
    const center = cameraIcon.getCenterPoint();
    const angleSpan = cameraIcon.angleDiff(cameraIcon.coverageConfig.startAngle, cameraIcon.coverageConfig.endAngle);
    const isFullCircle = angleSpan >= 359.9;
    const newPoints = cameraIcon.createCoveragePoints(cameraIcon.coverageConfig.startAngle, cameraIcon.coverageConfig.endAngle, center.x, center.y);

    const opacitySlider = document.getElementById("camera-opacity-slider");
    let opacity = cameraIcon.coverageConfig.opacity ?? (opacitySlider ? parseFloat(opacitySlider.value) : 0.3);
    if (isNaN(opacity) || opacity < 0) opacity = 0.3;
    cameraIcon.coverageConfig.opacity = opacity;

    const baseColor = cameraIcon.coverageConfig.baseColor || "rgb(165, 155, 155)";
    const finalOpacity = opacity * layers.devices.opacity;
    const fillColor = baseColor.replace(/rgb\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)\)/i, (m, r, g, b) => `rgba(${r}, ${g}, ${b}, ${finalOpacity})`);
    cameraIcon.coverageConfig.fillColor = fillColor;

    if (cameraIcon.coverageArea.type === "polygon") {
      cameraIcon.coverageArea.set({
        points: newPoints,
        fill: fillColor,
        strokeDashArray: getStrokeDashArray(cameraIcon.coverageConfig.edgeStyle),
        visible: cameraIcon.coverageConfig.visible && layers.devices.visible,
      });
      cameraIcon.coverageArea.dirty = true;
      cameraIcon.coverageArea.setCoords();
    }

    const { leftRad, rightRad, midRad } = calculateIconPositions(cameraIcon, angleSpan, isFullCircle, center);
    const shouldShowIcons = fabricCanvas.getActiveObject() === cameraIcon && cameraIcon.coverageConfig.visible && layers.devices.visible;
    const iconScale = 0.03;

    updateIconPosition(cameraIcon.leftResizeIcon, cameraIcon, center, leftRad, cameraIcon.coverageConfig.radius, iconScale, shouldShowIcons, "left");
    updateIconPosition(cameraIcon.rightResizeIcon, cameraIcon, center, rightRad, cameraIcon.coverageConfig.radius, iconScale, shouldShowIcons, "right");
    updateIconPosition(cameraIcon.rotateResizeIcon, cameraIcon, center, midRad, cameraIcon.coverageConfig.radius, iconScale * 2, shouldShowIcons, "rotate");

    if (cameraIcon.textObject?.visible) cameraIcon.textObject.bringToFront();
    [cameraIcon.leftResizeIcon, cameraIcon.rightResizeIcon, cameraIcon.rotateResizeIcon].forEach((icon) => icon?.visible && icon.bringToFront());
    cameraIcon.bringToFront();
    fabricCanvas.requestRenderAll();
    return;
  }

  // Full initialization
  let isResizingLeft = false,
    isResizingRight = false,
    isRotating = false;
  let initialMouseAngle = 0,
    initialStartAngle = 0,
    initialEndAngle = 0;

  // Remove old coverage elements
  ["coverageArea", "leftResizeIcon", "rightResizeIcon", "rotateResizeIcon"].forEach((prop) => {
    const existing = cameraIcon[prop];
    if (existing && fabricCanvas.getObjects().includes(existing)) {
      fabricCanvas.remove(existing);
    }
    cameraIcon[prop] = null;
  });

  let leftResizeIcon = null,
    rightResizeIcon = null,
    rotateResizeIcon = null,
    coverageArea = null;

  const commonProps = {
    stroke: "black",
    strokeWidth: 1,
    originX: "left",
    originY: "top",
    hasControls: false,
    hasBorders: false,
    selectable: false,
    evented: false,
    hoverCursor: "default",
    lockMovementX: true,
    lockMovementY: true,
    lockScalingX: true,
    lockScalingY: true,
  };

  // Updates coverage area and icons
  const updateCoverage = () => {
    if (!cameraIcon.createCoveragePoints) return;

    const center = cameraIcon.getCenterPoint();
    const angleSpan = cameraIcon.angleDiff(cameraIcon.coverageConfig.startAngle, cameraIcon.coverageConfig.endAngle);
    const isFullCircle = angleSpan >= 359.9;
    const newPoints = cameraIcon.createCoveragePoints(cameraIcon.coverageConfig.startAngle, cameraIcon.coverageConfig.endAngle, center.x, center.y);

    if (coverageArea) fabricCanvas.remove(coverageArea);

    const opacitySlider = document.getElementById("camera-opacity-slider");
    let opacity = cameraIcon.coverageConfig.opacity ?? (opacitySlider ? parseFloat(opacitySlider.value) : 0.3);
    if (isNaN(opacity) || opacity < 0) opacity = 0.3;
    cameraIcon.coverageConfig.opacity = opacity;

    const baseColor = cameraIcon.coverageConfig.baseColor || "rgb(165, 155, 155)";
    const finalOpacity = opacity * layers.devices.opacity;
    const fillColor = baseColor.replace(/rgb\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)\)/i, (m, r, g, b) => `rgba(${r}, ${g}, ${b}, ${finalOpacity})`);
    cameraIcon.coverageConfig.fillColor = fillColor;

    coverageArea = new fabric.Polygon(newPoints, {
      ...commonProps,
      strokeWidth: 2,
      strokeDashArray: getStrokeDashArray(cameraIcon.coverageConfig.edgeStyle),
      visible: cameraIcon.coverageConfig.visible && layers.devices.visible,
      fill: fillColor,
      isCoverage: true,
      evented: false,
      selectable: false,
    });

    const camIndex = fabricCanvas.getObjects().indexOf(cameraIcon);
    if (camIndex !== -1) {
      fabricCanvas.insertAt(coverageArea, camIndex);
    } else {
      fabricCanvas.add(coverageArea);
      coverageArea.sendToBack();
      cameraIcon.bringToFront();
    }

    cameraIcon.coverageArea = coverageArea;

    const { leftRad, rightRad, midRad } = calculateIconPositions(cameraIcon, angleSpan, isFullCircle, center);
    const shouldShowIcons = fabricCanvas.getActiveObject() === cameraIcon && cameraIcon.coverageConfig.visible && layers.devices.visible;
    const iconScale = 0.03;

    updateIconPosition(leftResizeIcon, cameraIcon, center, leftRad, cameraIcon.coverageConfig.radius, iconScale, shouldShowIcons, "left");
    updateIconPosition(rightResizeIcon, cameraIcon, center, rightRad, cameraIcon.coverageConfig.radius, iconScale, shouldShowIcons, "right");
    updateIconPosition(rotateResizeIcon, cameraIcon, center, midRad, cameraIcon.coverageConfig.radius, iconScale * 2, shouldShowIcons, "rotate");

    coverageArea.setCoords();
    cameraIcon.bringToFront();
    if (cameraIcon.textObject?.visible) cameraIcon.textObject.bringToFront();
    [leftResizeIcon, rightResizeIcon, rotateResizeIcon].forEach((icon) => icon?.visible && icon.bringToFront());
    fabricCanvas.requestRenderAll();
  };

  cameraIcon.createOrUpdateCoverageArea = updateCoverage;

  // Set up canvas event handlers
  const handlers = {
    added: (opt) => opt.target?.type === "line" && opt.target.stroke === "red" && updateCoverage(),
    modified: (opt) => opt.target?.type === "line" && opt.target.stroke === "red" && updateCoverage(),
    moving: (opt) => opt.target?.type === "circle" && updateCoverage(),
  };

  // Remove old handlers
  Object.keys(handlers).forEach((event) => {
    const existing = cameraIcon[`${event}Handler`];
    if (existing) {
      fabricCanvas.off(`object:${event}`, existing);
      delete cameraIcon[`${event}Handler`];
    }
  });

  // Add new handlers
  Object.entries(handlers).forEach(([event, handler]) => {
    cameraIcon[`${event}Handler`] = handler;
    fabricCanvas.on(`object:${event}`, handler);
  });

  // Remove old camera event handlers
  const removeHandlers = () => {
    ["selected", "deselected", "moving", "removed"].forEach((event) => {
      if (cameraIcon[`_onCoverage${event.charAt(0).toUpperCase() + event.slice(1)}`]) {
        cameraIcon.off(event, cameraIcon[`_onCoverage${event.charAt(0).toUpperCase() + event.slice(1)}`]);
      }
    });
  };

  removeHandlers();

  // Shows resize controls when camera is selected
  cameraIcon._onCoverageSelected = () => {
    const pixelsPerMeter = fabricCanvas.pixelsPerMeter || 17.5;
    const currentAngleSpan = Math.round(cameraIcon.angleDiff(cameraIcon.coverageConfig.startAngle, cameraIcon.coverageConfig.endAngle));
    const currentOpacity = cameraIcon.coverageConfig.opacity || 0.3;
    const currentDistance = cameraIcon.coverageConfig.radius / pixelsPerMeter;

    updateSlider("camera-angle-slider", "camera-angle-input", currentAngleSpan, 1, 360);
    updateSlider("camera-opacity-slider", "camera-opacity-input", currentOpacity, 0, 1);
    updateSlider("camera-distance-slider", "camera-distance-input", currentDistance, 1, 500);

    const coverageToggle = document.getElementById("camera-coverage-toggle");
    if (coverageToggle) coverageToggle.checked = cameraIcon.coverageConfig.visible !== false;

    const shouldShowResizeIcons = cameraIcon.coverageConfig.visible && layers.devices.visible;
    [leftResizeIcon, rightResizeIcon, rotateResizeIcon].forEach((icon) => {
      if (icon) icon.set({ visible: shouldShowResizeIcons }).bringToFront();
    });

    fabricCanvas.renderAll();
  };

  // Hides resize controls when camera is deselected
  cameraIcon._onCoverageDeselected = () => {
    if (!isResizingLeft && !isResizingRight && !isRotating) {
      [leftResizeIcon, rightResizeIcon, rotateResizeIcon].forEach((icon) => {
        if (icon) icon.set({ visible: false });
      });
      fabricCanvas.renderAll();
    }
  };

  // Updates coverage when camera moves
  cameraIcon._onCoverageMoving = () => {
    updateCoverage();
    if (cameraIcon.textObject) cameraIcon.textObject.bringToFront();
  };

  // Cleans up when camera is removed
  cameraIcon._onCoverageRemoved = () => {
    Object.keys(handlers).forEach((event) => {
      if (cameraIcon[`${event}Handler`]) fabricCanvas.off(`object:${event}`, cameraIcon[`${event}Handler`]);
    });
    [coverageArea, leftResizeIcon, rightResizeIcon, rotateResizeIcon].forEach((item) => {
      if (item) fabricCanvas.remove(item);
    });
  };

  cameraIcon.on("selected", cameraIcon._onCoverageSelected);
  cameraIcon.on("deselected", cameraIcon._onCoverageDeselected);
  cameraIcon.on("moving", cameraIcon._onCoverageMoving);
  cameraIcon.on("removed", cameraIcon._onCoverageRemoved);

  // Load resize icons if not already loaded
  if (!leftResizeIcon || !rightResizeIcon || !rotateResizeIcon) {
    const iconConfig = {
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
      perPixelTargetFind: false,
      hoverCursor: "pointer",
    };

    const iconUrls = [
      { url: "./images/icons/left-resize.png", cursor: "col-resize", prop: "leftResizeIcon" },
      { url: "./images/icons/right-resize.png", cursor: "col-resize", prop: "rightResizeIcon" },
      { url: "./images/icons/four-arrows.png", cursor: "pointer", prop: "rotateResizeIcon" },
    ];

    let loadedCount = 0;
    iconUrls.forEach(({ url, cursor, prop }) => {
      fabric.Image.fromURL(url, (icon) => {
        if (!icon) return;
        icon.set({ ...iconConfig, hoverCursor: cursor });
        cameraIcon[prop] = icon;
        if (prop === "leftResizeIcon") leftResizeIcon = icon;
        else if (prop === "rightResizeIcon") rightResizeIcon = icon;
        else rotateResizeIcon = icon;

        fabricCanvas.add(icon);

        icon.on("mousedown", (opt) => {
          opt.e.preventDefault();
          opt.e.stopPropagation();
          opt.e.stopImmediatePropagation();

          window.suppressDeviceProperties = true;
          if (typeof window.hideDeviceProperties === "function") window.hideDeviceProperties();

          const wallObjects = fabricCanvas.getObjects().filter((obj) => (obj.type === "line" && !obj.deviceType && !obj.isResizeIcon && !obj.isConnectionLine) || (obj.type === "circle" && obj.isWallCircle));

          wallObjects.forEach((wall) => {
            wall._originalEvented = wall.evented;
            wall._originalSelectable = wall.selectable;
            wall.set({ evented: false, selectable: false });
          });

          if (prop === "leftResizeIcon") isResizingLeft = true;
          else if (prop === "rightResizeIcon") isResizingRight = true;
          else {
            isRotating = true;
            const pointer = fabricCanvas.getPointer(opt.e);
            const camCenter = cameraIcon.getCenterPoint();
            const dx = pointer.x - camCenter.x;
            const dy = pointer.y - camCenter.y;
            initialMouseAngle = Math.round(fabric.util.radiansToDegrees(Math.atan2(dy, dx)));
            if (initialMouseAngle < 0) initialMouseAngle += 360;
            initialStartAngle = cameraIcon.coverageConfig.startAngle;
            initialEndAngle = cameraIcon.coverageConfig.endAngle;
          }

          fabricCanvas.setActiveObject(cameraIcon);
          fabricCanvas.selection = false;

          const stopResizing = (e) => {
            if (e?.e) {
              e.e.preventDefault();
              e.e.stopPropagation();
              e.e.stopImmediatePropagation();
            }

            isResizingLeft = isResizingRight = isRotating = false;
            fabricCanvas.selection = true;

            setTimeout(() => {
              wallObjects.forEach((wall) => {
                wall.set({
                  evented: wall._originalEvented ?? true,
                  selectable: wall._originalSelectable ?? true,
                });
                delete wall._originalEvented;
                delete wall._originalSelectable;
              });
            }, 150);

            const active = fabricCanvas.getActiveObject() === cameraIcon;
            const shouldShowResizeIcons = active && cameraIcon.coverageConfig.visible && layers.devices.visible;

            [leftResizeIcon, rightResizeIcon, rotateResizeIcon].forEach((icon) => {
              if (icon) {
                icon.set({ visible: shouldShowResizeIcons });
                if (shouldShowResizeIcons) icon.bringToFront();
              }
            });

            if (cameraIcon.textObject) cameraIcon.textObject.bringToFront();
            fabricCanvas.renderAll();

            window.suppressDeviceProperties = false;
            const activeObj = fabricCanvas.getActiveObject();
            if (activeObj === cameraIcon && typeof window.showDeviceProperties === "function") {
              window.showDeviceProperties(cameraIcon.deviceType, cameraIcon.textObject, cameraIcon);
            }

            document.removeEventListener("mouseup", stopResizing);
            fabricCanvas.off("mouse:up", stopResizing);
          };

          document.addEventListener("mouseup", stopResizing, { once: true });
          fabricCanvas.on("mouse:up", stopResizing);

          return false;
        });

        icon.on("mouseover", () => {
          icon.bringToFront();
          fabricCanvas.renderAll();
        });

        loadedCount++;
        if (loadedCount === 3) {
          if (cameraIcon._coverageMouseMoveHandler) {
            fabricCanvas.off("mouse:move", cameraIcon._coverageMouseMoveHandler);
            delete cameraIcon._coverageMouseMoveHandler;
          }
          if (cameraIcon._coverageMouseUpHandler) {
            fabricCanvas.off("mouse:up", cameraIcon._coverageMouseUpHandler);
            delete cameraIcon._coverageMouseUpHandler;
          }

          const mouseMoveHandler = (opt) => {
            if (!isResizingLeft && !isResizingRight && !isRotating) return;

            if (opt.e) {
              opt.e.preventDefault();
              opt.e.stopPropagation();
            }

            const pointer = fabricCanvas.getPointer(opt.e);
            const camCenter = cameraIcon.getCenterPoint();
            const dx = pointer.x - camCenter.x;
            const dy = pointer.y - camCenter.y;
            let currentAngle = Math.round(fabric.util.radiansToDegrees(Math.atan2(dy, dx)));
            if (currentAngle < 0) currentAngle += 360;

            const pixelsPerMeter = fabricCanvas.pixelsPerMeter || 17.5;
            const dist = Math.hypot(dx, dy);
            const maxRadius = 500 * pixelsPerMeter;

            if (isResizingLeft || isResizingRight) {
              const previousSpan = cameraIcon.angleDiff(cameraIcon.coverageConfig.startAngle, cameraIcon.coverageConfig.endAngle);
              const isLeft = isResizingLeft;
              const otherAngle = isLeft ? cameraIcon.coverageConfig.endAngle : cameraIcon.coverageConfig.startAngle;
              const tentativeSpan = cameraIcon.angleDiff(isLeft ? currentAngle : otherAngle, isLeft ? otherAngle : currentAngle);

              if (tentativeSpan < 1) {
                const offset = 5;
                if (previousSpan > 180) {
                  cameraIcon.coverageConfig.startAngle = (Math.round(currentAngle + (isLeft ? offset : -offset)) + 360) % 360;
                  cameraIcon.coverageConfig.endAngle = cameraIcon.coverageConfig.startAngle;
                } else {
                  const newAngle = (otherAngle + (isLeft ? -1 : 1) + 360) % 360;
                  if (isLeft) cameraIcon.coverageConfig.startAngle = newAngle;
                  else cameraIcon.coverageConfig.endAngle = newAngle;
                }
              } else {
                if (isLeft) cameraIcon.coverageConfig.startAngle = Math.round(currentAngle);
                else cameraIcon.coverageConfig.endAngle = Math.round(currentAngle);
              }
            } else if (isRotating) {
              const delta = (currentAngle - initialMouseAngle + 360) % 360;
              cameraIcon.coverageConfig.startAngle = Math.round((initialStartAngle + delta) % 360);
              cameraIcon.coverageConfig.endAngle = Math.round((initialEndAngle + delta) % 360);
              cameraIcon.coverageConfig.radius = Math.max(pixelsPerMeter, Math.min(dist, maxRadius));

              const currentDistance = cameraIcon.coverageConfig.radius / pixelsPerMeter;
              updateSlider("camera-distance-slider", "camera-distance-input", currentDistance, 1, 500);
            }

            cameraIcon.coverageConfig.isInitialized = true;
            const currentAngleSpan = Math.round(cameraIcon.angleDiff(cameraIcon.coverageConfig.startAngle, cameraIcon.coverageConfig.endAngle));
            updateSlider("camera-angle-slider", "camera-angle-input", currentAngleSpan, 1, 360);

            updateCoverage();

            if (rotateResizeIcon && isRotating) rotateResizeIcon.bringToFront();
            if (leftResizeIcon && isResizingLeft) leftResizeIcon.bringToFront();
            if (rightResizeIcon && isResizingRight) rightResizeIcon.bringToFront();
            if (cameraIcon.textObject) cameraIcon.textObject.bringToFront();
          };

          cameraIcon._coverageMouseMoveHandler = mouseMoveHandler;
          fabricCanvas.on("mouse:move", mouseMoveHandler);

          const mouseUpHandler = (opt) => {
            if (isResizingLeft || isResizingRight || isRotating) {
              if (opt.e) {
                opt.e.preventDefault();
                opt.e.stopPropagation();
                opt.e.stopImmediatePropagation();
              }
            }
          };

          cameraIcon._coverageMouseUpHandler = mouseUpHandler;
          fabricCanvas.on("mouse:up", mouseUpHandler);

          updateCoverage();
          fabricCanvas.setActiveObject(cameraIcon);
          const shouldShowResizeIcons = cameraIcon.coverageConfig.visible && layers.devices.visible;
          [leftResizeIcon, rightResizeIcon, rotateResizeIcon].forEach((icon) => {
            if (icon) icon.set({ visible: shouldShowResizeIcons }).bringToFront();
          });
          fabricCanvas.renderAll();
          cameraIcon._coverageInitialized = true;
        }
      });
    });
  }
}

// Adds camera coverage area to a camera device
export function addCameraCoverage(fabricCanvas, cameraIcon) {
  const pixelsPerMeter = fabricCanvas.pixelsPerMeter || 17.5;
  initConfig(cameraIcon, pixelsPerMeter);

  cameraIcon.angleDiff = angleDiff;
  cameraIcon.createCoveragePoints = (start, end, x, y) => createCoveragePoints(fabricCanvas, cameraIcon, start, end, x, y);

  createOrUpdateCoverageArea(fabricCanvas, cameraIcon);
  return { coverageArea: cameraIcon.coverageArea };
}

// Normalizes coverage settings for all cameras
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
