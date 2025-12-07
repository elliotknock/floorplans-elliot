import { layers } from "../../canvas/canvas-layers.js";
import { updateSliderTrack, createSliderInputSync, setupColorControls, hexToRgba, setObjectProperty, setMultipleObjectProperties, safeCanvasRender, DEFAULT_PIXELS_PER_METER, wrapGlobalFunction, CAMERA_TYPES, createPanelBase } from "../sidebar-utils.js";
import { initCameraSpecPanel } from "./camera-spec-panel.js";
import { drawSideView } from "../../devices/camera/camera-diagram.js";
import { calculateCameraPhysics, applyCameraPhysics } from "../../devices/camera/camera-calculations.js";

// Sets up the camera coverage panel with controls for angle, distance, opacity, and color
export function initCameraCoveragePanel() {
  const coverageColorIcons = document.querySelectorAll(".change-coverage-colour .colour-icon");
  const coverageColorPicker = document.getElementById("coverage-color-picker");
  const coverageToggle = document.getElementById("camera-coverage-toggle");
  const doriToggle = document.getElementById("camera-dori-toggle");
  const angleSlider = document.getElementById("camera-angle-slider");
  const angleInput = document.getElementById("camera-angle-input");

  // Create warning element for angle
  let angleWarning = document.getElementById("camera-angle-warning");
  if (!angleWarning && angleSlider) {
    angleWarning = document.createElement("div");
    angleWarning.id = "camera-angle-warning";
    angleWarning.style.color = "#ff9800"; // Orange warning
    angleWarning.style.fontSize = "0.75rem";
    angleWarning.style.marginTop = "4px";
    angleWarning.style.display = "none";
    angleWarning.innerText = "Warning: Outside camera specific dimensions.";

    // Insert after the slider group
    if (angleSlider.parentElement && angleSlider.parentElement.parentElement) {
      angleSlider.parentElement.parentElement.appendChild(angleWarning);
    }
  }
  const opacitySlider = document.getElementById("camera-opacity-slider");
  const opacityInput = document.getElementById("camera-opacity-input");
  const distanceSlider = document.getElementById("camera-distance-slider");
  const distanceInput = document.getElementById("camera-distance-input");
  const heightSlider = document.getElementById("camera-height-slider");
  const heightInput = document.getElementById("camera-height-input");
  const tiltSlider = document.getElementById("camera-tilt-slider");
  const tiltInput = document.getElementById("camera-tilt-input");
  const edgeStyleSelect = document.getElementById("camera-edge-style");
  const projectionModeSelect = document.getElementById("camera-projection-mode");
  const sideViewCanvas = document.getElementById("camera-side-view");

  // Create panel instance
  const panel = createPanelBase();
  panel.isInitializing = true;
  panel.controlsInitialized = false;

  // Calculates coverage radius based on height and tilt
  panel.updateRadiusFromHeightAndTilt = function(activeObject) {
    if (!activeObject || !activeObject.coverageConfig) return;

    const result = applyCameraPhysics(activeObject);
    if (!result) return;

    const { minRangeMeters, clampedRadiusMeters } = result;

    if (activeObject.createOrUpdateCoverageArea) activeObject.createOrUpdateCoverageArea();

    // Draw the side view
    const height = activeObject.coverageConfig.cameraHeight || 3;
    const tilt = activeObject.coverageConfig.cameraTilt ?? 25;
    const fov = activeObject.coverageConfig.sideFOV || (activeObject.angleDiff ? activeObject.angleDiff(activeObject.coverageConfig.startAngle, activeObject.coverageConfig.endAngle) : 60);

    // Pass minRange as deadZone (can be negative)
    drawSideView(sideViewCanvas, height, tilt, clampedRadiusMeters, minRangeMeters, fov);
  };

  // Updates how see-through the coverage area is
  panel.updateCoverageOpacity = function(activeObject, cameraOpacity) {
      // Extract RGB values from the current fill color
      const rgbMatch = activeObject.coverageConfig.fillColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      const devicesLayerOpacity = layers.devices.opacity;
      // Combine camera opacity with the layer opacity
      const finalOpacity = cameraOpacity * devicesLayerOpacity;

      activeObject.coverageConfig.opacity = cameraOpacity;

      // Use existing color if found RGB values
      if (rgbMatch) {
        const [, r, g, b] = rgbMatch;
        const newFill = `rgba(${r}, ${g}, ${b}, ${finalOpacity})`;
        if (activeObject.coverageArea) setMultipleObjectProperties(activeObject.coverageArea, { fill: newFill });
        activeObject.coverageConfig.fillColor = newFill;
      } else {
        // Use default gray color if no RGB found
        const newFill = `rgba(165, 155, 155, ${finalOpacity})`;
        if (activeObject.coverageArea) setMultipleObjectProperties(activeObject.coverageArea, { fill: newFill });
        activeObject.coverageConfig.fillColor = newFill;
      }
    };

  // Updates how wide the camera coverage angle is
  panel.updateAngle = function(activeObject, angleSpan) {
      // Calculate the middle of the current angle range
      const midAngle = (activeObject.coverageConfig.startAngle + activeObject.angleDiff(activeObject.coverageConfig.startAngle, activeObject.coverageConfig.endAngle) / 2) % 360;
      // Set new start and end angles centered around the middle
      activeObject.coverageConfig.startAngle = (midAngle - angleSpan / 2 + 360) % 360;
      activeObject.coverageConfig.endAngle = (midAngle + angleSpan / 2) % 360;

      // Full circle if angle is large enough
      if (angleSpan >= 359) {
        activeObject.coverageConfig.startAngle = 0;
        activeObject.coverageConfig.endAngle = 360;
      }

    activeObject.coverageConfig.isInitialized = true;
    // Update the visual coverage area
    if (activeObject.createOrUpdateCoverageArea) activeObject.createOrUpdateCoverageArea();
  };

  // Sets up all the camera coverage controls
  panel.initCameraControls = function(fabricCanvas) {
    // Only initialize once
    if (panel.controlsInitialized) return;
    panel.controlsInitialized = true;

      // Set default angle to 90 degrees
      if (angleSlider) {
        angleSlider.value = 90;
        if (angleInput) angleInput.value = "90";
      }

      // Set default height to 3 meters
      if (heightSlider) {
        heightSlider.value = 3;
        if (heightInput) heightInput.value = "3.0";
      }

      // Set default tilt to 25 degrees
      if (tiltSlider) {
        tiltSlider.value = 25;
        if (tiltInput) tiltInput.value = "25";
      }

      // Set default distance to 10 meters
      if (distanceSlider) {
        distanceSlider.min = 1;
        distanceSlider.max = 500;
        distanceSlider.step = 0.1;
        distanceSlider.value = 10;
        if (distanceInput) distanceInput.value = "10";
      }

      // Handle coverage visibility toggle
      if (coverageToggle) {
        coverageToggle.addEventListener("change", () => {
          const activeObject = fabricCanvas.getActiveObject();
          // Only update if there's a coverage config
          if (activeObject && activeObject.coverageConfig) {
            // Coverage is visible only if toggle is checked AND layer is visible
            const visible = coverageToggle.checked && layers.devices.visible;
            activeObject.coverageConfig.visible = coverageToggle.checked;

            setObjectProperty(activeObject.coverageArea, "visible", visible);
            // Show or hide the resize handles
            ["leftResizeIcon", "rightResizeIcon", "rotateResizeIcon"].forEach((prop) => {
              if (activeObject[prop]) setObjectProperty(activeObject[prop], "visible", visible);
            });
          }
        });
      }

      // Handle DORI toggle
      if (doriToggle) {
        doriToggle.addEventListener("change", () => {
          const activeObject = fabricCanvas.getActiveObject();
          if (activeObject && activeObject.coverageConfig) {
            activeObject.coverageConfig.doriEnabled = doriToggle.checked;
            if (activeObject.createOrUpdateCoverageArea) {
              activeObject.createOrUpdateCoverageArea();
            }
          }
        });
      }

      // Handle lock distance on rotate toggle
      const lockDistanceOnRotateToggle = document.getElementById("camera-lock-distance-on-rotate");
      if (lockDistanceOnRotateToggle) {
        lockDistanceOnRotateToggle.addEventListener("change", () => {
          const activeObject = fabricCanvas.getActiveObject();
          if (activeObject && activeObject.coverageConfig) {
            activeObject.coverageConfig.lockDistanceOnRotate = lockDistanceOnRotateToggle.checked;
          }
        });
      }

      // Set up angle slider and input sync
      createSliderInputSync(
        angleSlider,
        angleInput,
        (value) => {
          // Don't update during initialization
          if (panel.isInitializing) return;
          const activeObject = fabricCanvas.getActiveObject();
          // Only update if camera has angle calculation function
          if (activeObject && activeObject.coverageConfig && activeObject.angleDiff) {
            panel.updateAngle(activeObject, Math.round(value));

            // Show warning if focal length is set
            if (activeObject.focalLength && angleWarning) {
              const calculatedAngle = activeObject.coverageConfig.calculatedAngle;
              if (calculatedAngle !== undefined && Math.abs(Math.round(value) - calculatedAngle) > 1) {
                angleWarning.style.display = "block";
              } else {
                angleWarning.style.display = "none";
              }
            }
          }
        },
        { min: 1, max: 360, step: 1 }
      );

      // Set up height slider and input sync
      createSliderInputSync(
        heightSlider,
        heightInput,
        (value) => {
          const activeObject = fabricCanvas.getActiveObject();
          if (activeObject && activeObject.coverageConfig) {
            activeObject.coverageConfig.cameraHeight = value;
            panel.updateRadiusFromHeightAndTilt(activeObject);
          }
        },
        { min: 1, max: 20, step: 0.1, precision: 2 }
      );

      // Set up tilt slider and input sync
      createSliderInputSync(
        tiltSlider,
        tiltInput,
        (value) => {
          const activeObject = fabricCanvas.getActiveObject();
          if (activeObject && activeObject.coverageConfig) {
            activeObject.coverageConfig.cameraTilt = value;
            panel.updateRadiusFromHeightAndTilt(activeObject);
          }
        },
        { min: 0, max: 90, step: 0.1, precision: 2 }
      );

      // Set up opacity slider and input sync (special handling for percentage)
      if (opacitySlider && opacityInput) {
        opacitySlider.addEventListener("input", () => {
          const value = parseFloat(opacitySlider.value);
          // Update the input to show percentage (1-100)
          if (document.activeElement !== opacityInput) {
            opacityInput.value = Math.round(value * 100);
          }
          updateSliderTrack(opacitySlider, value, 0, 1);

          const activeObject = fabricCanvas.getActiveObject();
          if (activeObject && activeObject.coverageConfig) {
            panel.updateCoverageOpacity(activeObject, value);
          }
        });

        // Prevent backspace/delete from propagating
        opacityInput.addEventListener("keydown", (e) => {
          if (e.key === "Backspace" || e.key === "Delete") {
            e.stopPropagation();
          }
        });

        // Handle typing in the opacity input (percentage)
        opacityInput.addEventListener("input", () => {
          let percentValue = parseFloat(opacityInput.value);
          if (!isNaN(percentValue)) {
            // Clamp percentage between 1 and 100
            percentValue = Math.max(1, Math.min(100, percentValue));
            const decimalValue = percentValue / 100;

            opacitySlider.value = decimalValue;
            updateSliderTrack(opacitySlider, decimalValue, 0, 1);

            const activeObject = fabricCanvas.getActiveObject();
            if (activeObject && activeObject.coverageConfig) {
              panel.updateCoverageOpacity(activeObject, decimalValue);
            }
          }
        });

        // Format on blur
        opacityInput.addEventListener("change", () => {
          let percentValue = parseFloat(opacityInput.value);
          if (isNaN(percentValue)) percentValue = 25;
          percentValue = Math.max(1, Math.min(100, percentValue));
          opacityInput.value = Math.round(percentValue);

          const decimalValue = percentValue / 100;
          opacitySlider.value = decimalValue;
          updateSliderTrack(opacitySlider, decimalValue, 0, 1);

          const activeObject = fabricCanvas.getActiveObject();
          if (activeObject && activeObject.coverageConfig) {
            panel.updateCoverageOpacity(activeObject, decimalValue);
          }
        });
      }

      // Set up distance slider and input sync
      createSliderInputSync(
        distanceSlider,
        distanceInput,
        (value) => {
          const activeObject = fabricCanvas.getActiveObject();
          // Update config even if coverage area is currently invalid/hidden
          if (activeObject && activeObject.coverageConfig) {
            // Update maxRange
            activeObject.coverageConfig.maxRange = value;

            // Auto-adjust tilt if distance is limited by physics
            const height = activeObject.coverageConfig.cameraHeight || 3;
            const tilt = activeObject.coverageConfig.cameraTilt || 0;
            const alpha = (activeObject.coverageConfig.sideFOV || (activeObject.angleDiff ? activeObject.angleDiff(activeObject.coverageConfig.startAngle, activeObject.coverageConfig.endAngle) : 60)) / 2;

            // Calculate max possible distance with current tilt
            let maxDist = 10000;
            if (tilt > alpha) {
              maxDist = height / Math.tan(((tilt - alpha) * Math.PI) / 180);
            }

            // If requested distance is greater than max physics distance, adjust tilt
            if (value > maxDist) {
              // Calculate required tilt
              // value = h / tan(newTilt - alpha)
              // tan(newTilt - alpha) = h / value
              const angleFromHorizontal = (Math.atan(height / value) * 180) / Math.PI;
              const newTilt = alpha + angleFromHorizontal;

              // Update tilt
              activeObject.coverageConfig.cameraTilt = Math.max(0, Math.min(90, newTilt));

              // Update tilt slider UI
              if (tiltSlider && tiltInput) {
                tiltSlider.value = activeObject.coverageConfig.cameraTilt;
                tiltInput.value = activeObject.coverageConfig.cameraTilt.toFixed(2);
                updateSliderTrack(tiltSlider, activeObject.coverageConfig.cameraTilt, 0, 90);
              }
            }

            // Recalculate radius based on new maxRange and existing height/tilt
            panel.updateRadiusFromHeightAndTilt(activeObject);
          }
        },
        { min: 1, max: 500, step: 0.1, precision: 2 }
      );

      // Handle edge style dropdown changes
      if (edgeStyleSelect) {
        edgeStyleSelect.addEventListener("change", () => {
          const activeObject = fabricCanvas.getActiveObject();
          // Update config even if coverage area is currently invalid/hidden
          if (activeObject && activeObject.coverageConfig) {
            const edgeStyle = edgeStyleSelect.value;
            activeObject.coverageConfig.edgeStyle = edgeStyle;

            // Set the dash pattern based on edge style
            let strokeDashArray = null;
            switch (edgeStyle) {
              case "dashed":
                strokeDashArray = [10, 5];
                break;
              case "dotted":
                strokeDashArray = [2, 2];
                break;
            }

            if (activeObject.coverageArea) {
              setMultipleObjectProperties(activeObject.coverageArea, { strokeDashArray });
            }
          }
        });
      }

      // Handle projection mode dropdown changes
      if (projectionModeSelect) {
        projectionModeSelect.addEventListener("change", () => {
          const activeObject = fabricCanvas.getActiveObject();
          // Update config even if coverage area is currently invalid/hidden
          if (activeObject && activeObject.coverageConfig) {
            const projectionMode = projectionModeSelect.value;
            activeObject.coverageConfig.projectionMode = projectionMode;

            // Recreate coverage area with new projection mode
            if (activeObject.createOrUpdateCoverageArea) {
              activeObject.createOrUpdateCoverageArea();
            }
          }
        });
      }

      // Listen for spec changes from the other panel
      document.addEventListener("camera-specs-changed", (e) => {
        if (panel.currentGroup && panel.currentGroup === e.detail.group) {
          panel.updateRadiusFromHeightAndTilt(panel.currentGroup);
          if (angleWarning) angleWarning.style.display = "none";
        }
      });

      // Set initial slider track appearance
      updateSliderTrack(angleSlider, 90, 1, 360);
      updateSliderTrack(heightSlider, 3, 1, 20);
      updateSliderTrack(tiltSlider, 25, 0, 90);
      updateSliderTrack(opacitySlider, 0.3, 0, 1);
      updateSliderTrack(distanceSlider, 10, 1, 500);

      panel.isInitializing = false;
    };

  // Override setCurrentGroup
  const originalSetCurrentGroup = panel.setCurrentGroup;
  panel.setCurrentGroup = function(group) {
    originalSetCurrentGroup.call(panel, group);
    // Initialize controls if this is the first time
    if (group && group.canvas && !panel.controlsInitialized) {
      panel.initCameraControls(group.canvas);
    }
  };

  // Override updatePanel
  panel.updatePanel = function(group) {
    panel.currentGroup = group;

      if (angleWarning) angleWarning.style.display = "none";

      // Update coverage visibility toggle
      if (group && group.coverageConfig !== undefined && coverageToggle) {
        coverageToggle.checked = group.coverageConfig.visible !== false;
      }

      // Update DORI toggle - auto-enable if resolution is set
      if (group && group.coverageConfig !== undefined && doriToggle) {
        // Auto-enable DORI if resolution is set and doriEnabled hasn't been explicitly set to false
        if (group.resolution && group.coverageConfig.doriEnabled === undefined) {
          group.coverageConfig.doriEnabled = true;
        }
        doriToggle.checked = group.coverageConfig.doriEnabled || false;
      }

      // Update lock distance on rotate toggle
      const lockDistanceOnRotateToggle = document.getElementById("camera-lock-distance-on-rotate");
      if (group && group.coverageConfig !== undefined && lockDistanceOnRotateToggle) {
        lockDistanceOnRotateToggle.checked = group.coverageConfig.lockDistanceOnRotate || false;
      }

      // Update opacity controls
      if (group && group.coverageConfig && opacitySlider && opacityInput) {
        const cameraOpacity = group.coverageConfig.opacity || 0.3;
        opacitySlider.value = cameraOpacity;
        opacityInput.value = Math.round(cameraOpacity * 100);
        updateSliderTrack(opacitySlider, cameraOpacity, 0, 1);
      }

      // Update height controls
      if (group && group.coverageConfig && heightSlider && heightInput) {
        const height = group.coverageConfig.cameraHeight || 3;
        heightSlider.value = height;
        heightInput.value = height.toFixed(2);
        updateSliderTrack(heightSlider, height, 1, 20);
      }

      // Update tilt controls
      if (group && group.coverageConfig && tiltSlider && tiltInput) {
        const tilt = group.coverageConfig.cameraTilt ?? 25;
        tiltSlider.value = tilt;
        tiltInput.value = tilt.toFixed(2);
        updateSliderTrack(tiltSlider, tilt, 0, 90);
      }

      // Update distance controls
      if (group && group.coverageConfig && distanceSlider && distanceInput) {
        const fabricCanvas = group.canvas;
        const pixelsPerMeter = fabricCanvas?.pixelsPerMeter || DEFAULT_PIXELS_PER_METER;

        // Set default radius if not set
        if (!group.coverageConfig.radius) {
          group.coverageConfig.radius = 10 * pixelsPerMeter;
        }

        // Ensure maxRange is set
        if (!group.coverageConfig.maxRange) {
          // If no maxRange, assume current radius is the desired max range
          group.coverageConfig.maxRange = group.coverageConfig.radius / pixelsPerMeter;
        }

        // Use maxRange for the slider value, not the calculated radius
        const maxRange = group.coverageConfig.maxRange;

        // Keep distance between 1 and 500 meters
        const clampedDistance = Math.max(1, Math.min(500, maxRange));

        distanceSlider.value = clampedDistance;
        distanceInput.value = clampedDistance.toFixed(2);
        updateSliderTrack(distanceSlider, clampedDistance, 1, 500);
      }

      // Update angle controls
      if (group && group.coverageConfig && group.angleDiff && angleSlider && angleInput) {
        // Calculate current angle span from start and end angles
        const currentAngleSpan = Math.round(group.angleDiff(group.coverageConfig.startAngle, group.coverageConfig.endAngle));
        angleSlider.value = currentAngleSpan;
        angleInput.value = currentAngleSpan;
        updateSliderTrack(angleSlider, currentAngleSpan, 1, 360);
      }

      // Update edge style dropdown
      if (group && group.coverageConfig && edgeStyleSelect) {
        edgeStyleSelect.value = group.coverageConfig.edgeStyle || "solid";
      }

      // Update projection mode dropdown
      if (group && group.coverageConfig && projectionModeSelect) {
        projectionModeSelect.value = group.coverageConfig.projectionMode || "circular";
      }

      // Update side view diagram
      if (group && group.coverageConfig) {
        const height = group.coverageConfig.cameraHeight || 3;
        const tilt = group.coverageConfig.cameraTilt ?? 25;
        const fov = group.coverageConfig.sideFOV || group.coverageConfig.verticalFOV || 60;

        // Recalculate physics to get actual minRangeMeters for diagram (not clamped)
        const physics = calculateCameraPhysics(group);
        const pixelsPerMeter = group.canvas?.pixelsPerMeter || DEFAULT_PIXELS_PER_METER;
        const distance = (group.coverageConfig.radius || 10 * pixelsPerMeter) / pixelsPerMeter;
        const deadZone = physics ? physics.minRangeMeters : (group.coverageConfig.minRange || 0) / pixelsPerMeter;

        drawSideView(sideViewCanvas, height, tilt, distance, deadZone, fov);
      }
    };

  // Sets up color picker for coverage area
  setupColorControls(coverageColorPicker, coverageColorIcons, (color) => {
    // Only update if it has a valid group and coverage area
    const currentGroup = panel.getCurrentGroup();
    if (currentGroup && currentGroup.canvas && currentGroup.coverageArea && currentGroup.coverageConfig) {
      // Get current opacity from slider or config
      const logicalOpacity = parseFloat(opacitySlider?.value) || currentGroup.coverageConfig.opacity || 0.3;
      const rgbaColorTemp = hexToRgba(color, logicalOpacity);
      // Extract RGB values to store base color without opacity
      const match = rgbaColorTemp.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
      if (match) {
        const [, r, g, b] = match;
        // Store the base color without opacity
        currentGroup.coverageConfig.baseColor = `rgb(${r}, ${g}, ${b})`;
      }
      currentGroup.coverageConfig.opacity = logicalOpacity;
      // Use update function if available, otherwise update directly
      if (typeof currentGroup.createOrUpdateCoverageArea === "function") {
        currentGroup.createOrUpdateCoverageArea();
      } else {
        setMultipleObjectProperties(currentGroup.coverageArea, { fill: rgbaColorTemp });
        currentGroup.coverageConfig.fillColor = rgbaColorTemp;
      }
      currentGroup.canvas.requestRenderAll();
    }
  });

  // Return object with same interface as before for backward compatibility
  return {
    initCameraControls: (fabricCanvas) => panel.initCameraControls(fabricCanvas),
    setCurrentGroup: (group) => panel.setCurrentGroup(group),
    updateCameraCoveragePanel: (group) => panel.updatePanel(group),
  };
}

// Connects camera panels to the device selection system
document.addEventListener("DOMContentLoaded", () => {
  const cameraCoveragePanel = initCameraCoveragePanel();
  const cameraSpecPanel = initCameraSpecPanel();

  // Hook into device selection to update camera panels
  wrapGlobalFunction("showDeviceProperties", (deviceType, textObject, group) => {
    const isCamera = CAMERA_TYPES.includes(deviceType);

    // Update both panels when a camera is selected
    if (isCamera && group) {
      cameraSpecPanel.setCurrentGroup(group);
      cameraSpecPanel.updateCameraSpecPanel(group);
      cameraCoveragePanel.setCurrentGroup(group);
      cameraCoveragePanel.updateCameraCoveragePanel(group);
    }
  });

  // Clear panels when device is deselected
  wrapGlobalFunction("hideDeviceProperties", () => {
    cameraSpecPanel.clearCameraSpecPanel();
    cameraCoveragePanel.setCurrentGroup(null);
  });

  // Make initCameraControls available globally
  window.initCameraControls = cameraCoveragePanel.initCameraControls;
});
