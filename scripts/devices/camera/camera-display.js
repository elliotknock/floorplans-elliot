// ============================================================================
// CAMERA DISPLAY - All visual rendering for cameras
// ============================================================================
// This file handles:
// - Coverage area drawing and icon positioning
// Note: Side view diagram is in camera-diagram.js

import { layers } from "../../canvas/canvas-layers.js";
import { angleDiff, createCoveragePoints } from "./camera-calculations.js";
import { createDoriZones } from "./camera-dori.js";

// ============================================================================
// SLIDER UTILITIES
// ============================================================================

// Keeps a slider and input showing the same value
export const updateSlider = (sliderId, inputId, value, min, max) => {
  const slider = document.getElementById(sliderId);
  const input = document.getElementById(inputId);
  if (slider) {
    slider.value = value;
    const percentage = ((value - min) / (max - min)) * 100;
    slider.style.background = `linear-gradient(to right, var(--orange-ip2) ${percentage}%, var(--white-ip2) ${percentage}%)`;
  }
  if (input) input.value = typeof value === "number" ? value.toFixed(2) : value;
};

// ============================================================================
// ICON POSITIONING
// ============================================================================

// Chooses the right dash pattern for the coverage edge
const getStrokeDashArray = (edgeStyle) => (edgeStyle === "dashed" ? [10, 5] : edgeStyle === "dotted" ? [2, 2] : null);

// Figures out where the resize icons should sit around the camera
const calculateIconPositions = (camera, angleSpan, isFullCircle, center) => {
  const isSmallAngle = angleSpan <= 5;
  const start = camera.coverageConfig.startAngle;
  const end = camera.coverageConfig.endAngle;

  return {
    leftRad: fabric.util.degreesToRadians(isFullCircle || isSmallAngle ? (start - 5 + 360) % 360 : start),
    rightRad: fabric.util.degreesToRadians(isFullCircle || isSmallAngle ? (start + 5) % 360 : end),
    midRad: fabric.util.degreesToRadians((start + angleSpan / 2) % 360),
  };
};

// Moves and turns a resize icon so it lines up with the camera
export const updateIconPosition = (icon, camera, center, angle, radius, iconScale, shouldShow, iconType) => {
  if (!icon) return;

  let adjustedRadius = radius;
  const { startAngle, endAngle, projectionMode } = camera.coverageConfig;

  if (projectionMode === "rectangular") {
    // Push icons outward when the view is stretched into a rectangle
    const angleSpan = angleDiff(startAngle, endAngle);
    const midAngle = startAngle + angleSpan / 2;
    let diff = ((fabric.util.radiansToDegrees(angle) + 360) % 360) - midAngle;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;

    const diffRad = fabric.util.degreesToRadians(diff);
    if (angleSpan < 170 && Math.abs(diffRad) < 1.4 && Math.abs(Math.cos(diffRad)) > 0.1) {
      adjustedRadius = radius / Math.cos(diffRad);
    }
  }

  let iconAngle = angle + 90; // Default
  if (iconType === "left") iconAngle = startAngle + 90;
  else if (iconType === "right") {
    const span = angleDiff(startAngle, endAngle);
    iconAngle = (span >= 359.9 || span <= 5 ? startAngle + 5 + 90 : endAngle + 90) % 360;
  } else if (iconType === "rotate") {
    iconAngle = ((startAngle + angleDiff(startAngle, endAngle) / 2) % 360) + 90;
  }

  icon
    .set({
      left: center.x + adjustedRadius * Math.cos(angle),
      top: center.y + adjustedRadius * Math.sin(angle),
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

// ============================================================================
// COVERAGE AREA DISPLAY
// ============================================================================

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
  excludeFromExport: true,
};

// Draws or refreshes the camera coverage shape and helper icons
export function updateCoverageDisplay(fabricCanvas, cameraIcon) {
  if (!cameraIcon.createCoveragePoints) return;

  const center = cameraIcon.getCenterPoint();
  // Use imported angleDiff
  const angleSpan = angleDiff(cameraIcon.coverageConfig.startAngle, cameraIcon.coverageConfig.endAngle);

  if (cameraIcon.coverageArea) {
    // Clear the old coverage drawing before adding the new one
    fabricCanvas.remove(cameraIcon.coverageArea);
    cameraIcon.coverageArea = null;
  }

  const opacitySlider = document.getElementById("camera-opacity-slider");
  let opacity = cameraIcon.coverageConfig.opacity ?? (opacitySlider ? parseFloat(opacitySlider.value) : 0.3);
  if (isNaN(opacity) || opacity < 0) opacity = 0.3;
  cameraIcon.coverageConfig.opacity = opacity;

  const baseColor = cameraIcon.coverageConfig.baseColor || "rgb(165, 155, 155)";
  const fillColor = baseColor.replace(/rgb\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)\)/i, (_, r, g, b) => `rgba(${r}, ${g}, ${b}, ${opacity * layers.devices.opacity})`);
  cameraIcon.coverageConfig.fillColor = fillColor;

  const { radius, minRange = 0, doriEnabled, visible, edgeStyle } = cameraIcon.coverageConfig;
  const isInvalid = minRange >= radius;

  if (!isInvalid) {
    let coverageArea;
    const doriZones = doriEnabled ? createDoriZones(cameraIcon, fabricCanvas, commonProps) : [];

    if (doriZones.length > 0) {
      coverageArea = new fabric.Group(doriZones, { ...commonProps, visible: visible && layers.devices.visible, isCoverage: true });
    } else {
      // Block coverage lines with walls so the shape hugs barriers
      const walls = fabricCanvas.getObjects("line").filter((l) => l.isWallLine || l.startCircle || l.endCircle);
      const points = createCoveragePoints(walls, cameraIcon, cameraIcon.coverageConfig.startAngle, cameraIcon.coverageConfig.endAngle, center.x, center.y);

      coverageArea = new fabric.Polygon(points, {
        ...commonProps,
        strokeWidth: 2,
        strokeDashArray: getStrokeDashArray(edgeStyle),
        visible: visible && layers.devices.visible,
        fill: fillColor,
        isCoverage: true,
      });
    }

    const camIndex = fabricCanvas.getObjects().indexOf(cameraIcon);
    if (camIndex !== -1) fabricCanvas.insertAt(coverageArea, camIndex);
    else {
      fabricCanvas.add(coverageArea);
      coverageArea.sendToBack();
      cameraIcon.bringToFront();
    }
    cameraIcon.coverageArea = coverageArea;
    coverageArea.setCoords();
  }

  const { leftRad, rightRad, midRad } = calculateIconPositions(cameraIcon, angleSpan, angleSpan >= 359.9, center);
  const shouldShow = fabricCanvas.getActiveObject() === cameraIcon && visible && layers.devices.visible;

  updateIconPosition(cameraIcon.leftResizeIcon, cameraIcon, center, leftRad, radius, 0.03, shouldShow, "left");
  updateIconPosition(cameraIcon.rightResizeIcon, cameraIcon, center, rightRad, radius, 0.03, shouldShow, "right");
  updateIconPosition(cameraIcon.rotateResizeIcon, cameraIcon, center, midRad, radius, 0.06, shouldShow, "rotate");

  cameraIcon.bringToFront();
  if (cameraIcon.textObject?.visible) cameraIcon.textObject.bringToFront();
  [cameraIcon.leftResizeIcon, cameraIcon.rightResizeIcon, cameraIcon.rotateResizeIcon].forEach((i) => i?.visible && i.bringToFront());
  fabricCanvas.requestRenderAll();
}
