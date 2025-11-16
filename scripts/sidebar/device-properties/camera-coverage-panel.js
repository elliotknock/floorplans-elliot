import { layers } from "../../canvas/canvas-layers.js";
import { updateSliderTrack, createSliderInputSync, setupColorControls, hexToRgba, setObjectProperty, setMultipleObjectProperties, safeCanvasRender, DEFAULT_PIXELS_PER_METER, wrapGlobalFunction, CAMERA_TYPES } from "../sidebar-utils.js";
import { initCameraSpecPanel } from "./camera-spec-panel.js";

// Sets up the camera coverage panel with controls for angle, distance, opacity, and color
export function initCameraCoveragePanel() {
  const coverageColorIcons = document.querySelectorAll(".change-coverage-colour .colour-icon");
  const coverageColorPicker = document.getElementById("coverage-color-picker");
  const coverageToggle = document.getElementById("camera-coverage-toggle");
  const angleSlider = document.getElementById("camera-angle-slider");
  const angleInput = document.getElementById("camera-angle-input");
  const opacitySlider = document.getElementById("camera-opacity-slider");
  const opacityInput = document.getElementById("camera-opacity-input");
  const distanceSlider = document.getElementById("camera-distance-slider");
  const distanceInput = document.getElementById("camera-distance-input");
  const edgeStyleSelect = document.getElementById("camera-edge-style");

  let currentGroup = null;
  let isInitializing = true;
  let controlsInitialized = false;

  // Updates how see-through the coverage area is
  function updateCoverageOpacity(activeObject, cameraOpacity) {
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
      setMultipleObjectProperties(activeObject.coverageArea, { fill: newFill });
      activeObject.coverageConfig.fillColor = newFill;
    } else {
      // Use default gray color if no RGB found
      const newFill = `rgba(165, 155, 155, ${finalOpacity})`;
      setMultipleObjectProperties(activeObject.coverageArea, { fill: newFill });
      activeObject.coverageConfig.fillColor = newFill;
    }
  }

  // Updates how wide the camera coverage angle is
  function updateAngle(activeObject, angleSpan) {
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
  }

  // Sets up all the camera coverage controls
  function initCameraControls(fabricCanvas) {
    // Only initialize once
    if (controlsInitialized) return;
    controlsInitialized = true;

    // Set default angle to 90 degrees
    if (angleSlider) {
      angleSlider.value = 90;
      if (angleInput) angleInput.textContent = "90°";
    }

    // Set default distance to 10 meters
    if (distanceSlider) {
      distanceSlider.min = 1;
      distanceSlider.max = 500;
      distanceSlider.step = 0.1;
      distanceSlider.value = 10;
      if (distanceInput) distanceInput.textContent = "10m";
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

    // Set up angle slider and input sync
    createSliderInputSync(
      angleSlider,
      angleInput,
      (value) => {
        // Don't update during initialization
        if (isInitializing) return;
        const activeObject = fabricCanvas.getActiveObject();
        // Only update if camera has angle calculation function
        if (activeObject && activeObject.coverageConfig && activeObject.angleDiff) {
          updateAngle(activeObject, Math.round(value));
        }
      },
      { min: 1, max: 360, step: 1, format: (v) => v.toFixed(0) + "°" }
    );

    // Set up opacity slider and input sync
    createSliderInputSync(
      opacitySlider,
      opacityInput,
      (value) => {
        const activeObject = fabricCanvas.getActiveObject();
        // Only update if coverage area exists
        if (activeObject && activeObject.coverageConfig && activeObject.coverageArea) {
          updateCoverageOpacity(activeObject, value);
        }
      },
      { min: 0, max: 1, step: 0.01, precision: 2, format: (v) => (v * 100).toFixed(0) + "%" }
    );

    // Set up distance slider and input sync
    createSliderInputSync(
      distanceSlider,
      distanceInput,
      (value) => {
        const activeObject = fabricCanvas.getActiveObject();
        // Only update if coverage area exists
        if (activeObject && activeObject.coverageConfig && activeObject.coverageArea) {
          // Convert meters to pixels
          const pixelsPerMeter = fabricCanvas.pixelsPerMeter || DEFAULT_PIXELS_PER_METER;
          activeObject.coverageConfig.radius = Math.min(value, 500) * pixelsPerMeter;
          // Update the visual coverage area
          if (activeObject.createOrUpdateCoverageArea) activeObject.createOrUpdateCoverageArea();
        }
      },
      { min: 1, max: 500, step: 0.1, precision: 1, format: (v) => v.toFixed(1) + "m" }
    );

    // Handle edge style dropdown changes
    if (edgeStyleSelect) {
      edgeStyleSelect.addEventListener("change", () => {
        const activeObject = fabricCanvas.getActiveObject();
        // Only update if coverage area exists
        if (activeObject && activeObject.coverageConfig && activeObject.coverageArea) {
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

          setMultipleObjectProperties(activeObject.coverageArea, { strokeDashArray });
        }
      });
    }

    // Set initial slider track appearance
    updateSliderTrack(angleSlider, 90, 1, 360);
    updateSliderTrack(opacitySlider, 0.3, 0, 1);
    updateSliderTrack(distanceSlider, 10, 1, 500);

    isInitializing = false;
  }

  // Sets up color picker for coverage area
  setupColorControls(coverageColorPicker, coverageColorIcons, (color) => {
    // Only update if it has a valid group and coverage area
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

  return {
    initCameraControls,
    // Stores the currently selected camera group
    setCurrentGroup: (group) => {
      currentGroup = group;
      // Initialize controls if this is the first time
      if (group && group.canvas && !controlsInitialized) {
        initCameraControls(group.canvas);
      }
    },
    // Updates all controls to match the selected camera
    updateCameraCoveragePanel: (group) => {
      currentGroup = group;
      // Update coverage visibility toggle
      if (group && group.coverageConfig !== undefined && coverageToggle) {
        coverageToggle.checked = group.coverageConfig.visible !== false;
      }

      // Update opacity controls
      if (group && group.coverageConfig && opacitySlider && opacityInput) {
        const cameraOpacity = group.coverageConfig.opacity || 0.3;
        opacitySlider.value = cameraOpacity;
        opacityInput.textContent = (cameraOpacity * 100).toFixed(0) + "%";
        updateSliderTrack(opacitySlider, cameraOpacity, 0, 1);
      }

      // Update distance controls
      if (group && group.coverageConfig && distanceSlider && distanceInput) {
        const fabricCanvas = group.canvas;
        const pixelsPerMeter = fabricCanvas?.pixelsPerMeter || DEFAULT_PIXELS_PER_METER;

        // Set default radius if not set
        if (!group.coverageConfig.radius) {
          group.coverageConfig.radius = 10 * pixelsPerMeter;
        }

        // Convert from pixels to meters
        const currentDistanceInMeters = group.coverageConfig.radius / pixelsPerMeter;
        // Keep distance between 1 and 500 meters
        const clampedDistance = Math.max(1, Math.min(500, currentDistanceInMeters));

        distanceSlider.value = clampedDistance;
        distanceInput.textContent = clampedDistance.toFixed(1) + "m";
        updateSliderTrack(distanceSlider, clampedDistance, 1, 500);
      }

      // Update angle controls
      if (group && group.coverageConfig && group.angleDiff && angleSlider && angleInput) {
        // Calculate current angle span from start and end angles
        const currentAngleSpan = Math.round(group.angleDiff(group.coverageConfig.startAngle, group.coverageConfig.endAngle));
        angleSlider.value = currentAngleSpan;
        angleInput.textContent = currentAngleSpan + "°";
        updateSliderTrack(angleSlider, currentAngleSpan, 1, 360);
      }

      // Update edge style dropdown
      if (group && group.coverageConfig && edgeStyleSelect) {
        edgeStyleSelect.value = group.coverageConfig.edgeStyle || "solid";
      }
    }
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
