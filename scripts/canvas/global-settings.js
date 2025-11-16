// Handles global device settings and zoom controls
import { setTextVisibility } from "../sidebar/sidebar-utils.js";
import { applyLabelPosition, attachLabelBehavior, setGroupLabelDragState } from "./device-label-utils.js";

export function initGlobalSettings(fabricCanvas) {
  // Global settings state
  let globalIconSize = 30;
  let globalIconTextVisible = true;
  let globalDeviceColor = "#f8794b";
  let globalTextColor = "#FFFFFF";
  let globalFont = "Poppins, sans-serif";
  let globalTextBackground = true;
  let globalBoldText = false;
  let globalCompleteDeviceIndicator = true;
  let globalLabelDragEnabled = false;

  // Set initial global defaults
  const globalDefaults = {
    defaultDeviceIconSize: globalIconSize,
    globalIconTextVisible,
    globalDeviceColor,
    globalTextColor,
    globalFont,
    globalTextBackground,
    globalBoldText,
    globalCompleteDeviceIndicator,
    globalLabelDragEnabled,
  };
  Object.assign(window, globalDefaults);

  // Helper functions
  const updateSliderTrack = (slider, value, min, max) => {
    const percentage = ((value - min) / (max - min)) * 100;
    slider.style.background = `linear-gradient(to right, var(--orange-ip2, #f8794b) ${percentage}%, #e9ecef ${percentage}%)`;
  };

  const getAllDeviceGroups = () => fabricCanvas.getObjects().filter((obj) => obj.type === "group" && obj.deviceType);

  const updateDeviceIconSize = (group, size) => {
    if (!group || !group.getObjects) return;

    ensureGroupLabelBehavior(group);

    const clampedSize = Math.max(1, Math.min(100, parseInt(size) || 30));
    const scaleFactor = clampedSize / 30;
    group.scaleFactor = scaleFactor;

    const imageObj = group.getObjects().find((obj) => obj.type === "image");
    const circleObj = group.getObjects().find((obj) => obj.type === "circle");

    if (imageObj && circleObj) {
      const baseCircleRadius = 20;

      imageObj.set({
        scaleX: scaleFactor * (30 / imageObj.width),
        scaleY: scaleFactor * (30 / imageObj.height),
      });

      circleObj.set({
        radius: baseCircleRadius * scaleFactor,
        scaleX: 1,
        scaleY: 1,
      });

      group.set({
        scaleX: 1,
        scaleY: 1,
        width: circleObj.radius * 2,
        height: circleObj.radius * 2,
      });

      // Update text position and size
      if (group.textObject) {
        const fontSize = 12 * scaleFactor;

        group.textObject.set({
          fontSize: fontSize,
        });
        applyLabelPosition(group);
      }

      // Update coverage if exists
      if (group.coverageConfig && group.createOrUpdateCoverageArea) {
        group.createOrUpdateCoverageArea();
      }

      group.setCoords();
    }
  };

  const updateDeviceColor = (group, color) => {
    if (!group || !group.getObjects) return;
    const circleObj = group.getObjects().find((obj) => obj.type === "circle");
    if (circleObj) {
      circleObj.set({ fill: color });
      group.originalCircleColor = color;
    }
  };

  const updateDeviceTextColor = (group, color) => {
    if (!group || !group.textObject) return;
    group.textObject.set({ fill: color });
  };

  const updateDeviceFont = (group, font) => {
    if (!group || !group.textObject) return;
    group.textObject.set({ fontFamily: font });
  };

  const updateDeviceTextBackground = (group, showBackground) => {
    if (!group || !group.textObject) return;
    group.textObject.set({ backgroundColor: showBackground ? "rgba(20, 18, 18, 0.8)" : "transparent" });
  };

  const updateDeviceBoldText = (group, isBold) => {
    if (!group || !group.textObject) return;
    group.textObject.set({ fontWeight: isBold ? "bold" : "normal" });
  };

  const isDeviceComplete = (group) => {
    if (!group) return false;
    const deviceName = group.textObject?.text || "";
    const mounted = group.mountedPosition || "";
    const location = group.location || "";
    const partNumber = group.partNumber || "";
    const stockNumber = group.stockNumber || "";

    return deviceName.trim() !== "" && mounted.trim() !== "" && location.trim() !== "" && partNumber.trim() !== "" && stockNumber.trim() !== "";
  };

  const updateDeviceCompleteIndicator = (group) => {
    if (!group || !group.getObjects) return;

    const circleObj = group.getObjects().find((obj) => obj.type === "circle");
    if (!circleObj) return;

    if (!group.originalCircleColor) {
      group.originalCircleColor = circleObj.fill;
    }

    if (globalCompleteDeviceIndicator && isDeviceComplete(group)) {
      circleObj.set({ fill: "#00ff00" });
    } else {
      circleObj.set({ fill: group.originalCircleColor || window.globalDeviceColor || "#f8794b" });
    }

    fabricCanvas.renderAll();
  };

  const handleDeviceHover = (group, isHover) => {
    if (globalIconTextVisible || !group.textObject) return;
    if (group.deviceType === "text-device") return;

    if (isHover) {
      if (!fabricCanvas.getObjects().includes(group.textObject)) {
        fabricCanvas.add(group.textObject);
      }
      group.textObject.set({ visible: true });
      group.textObject.bringToFront();
    } else {
      group.textObject.set({ visible: false });
      fabricCanvas.remove(group.textObject);
    }
    fabricCanvas.renderAll();
  };

  const ensureGroupLabelBehavior = (group) => {
    if (!group || !group.textObject) return;
    attachLabelBehavior(group, group.textObject, fabricCanvas);
  };

  // Global update functions
  const updateAllIconSizes = (size) => {
    globalIconSize = size;
    window.defaultDeviceIconSize = size;
    getAllDeviceGroups().forEach((group) => updateDeviceIconSize(group, size));
    fabricCanvas.renderAll();
  };

  const updateAllIconTextVisibility = (visible) => {
    globalIconTextVisible = visible;
    window.globalIconTextVisible = visible;
    getAllDeviceGroups().forEach((group) => {
      if (group.textObject) {
        ensureGroupLabelBehavior(group);
        setTextVisibility(group.textObject, visible, fabricCanvas);
        setGroupLabelDragState(group, globalLabelDragEnabled);
        applyLabelPosition(group);
        group.labelHidden = !visible;
      }
    });
    fabricCanvas.renderAll();
  };

  const updateAllDeviceColors = (color) => {
    globalDeviceColor = color;
    window.globalDeviceColor = color;
    getAllDeviceGroups().forEach((group) => updateDeviceColor(group, color));
    fabricCanvas.renderAll();
  };

  const updateAllTextColors = (color) => {
    globalTextColor = color;
    window.globalTextColor = color;
    getAllDeviceGroups().forEach((group) => updateDeviceTextColor(group, color));
    fabricCanvas.renderAll();
  };

  const updateAllFonts = (font) => {
    globalFont = font;
    window.globalFont = font;
    getAllDeviceGroups().forEach((group) => updateDeviceFont(group, font));
    fabricCanvas.renderAll();
  };

  const updateAllTextBackgrounds = (showBackground) => {
    globalTextBackground = showBackground;
    window.globalTextBackground = showBackground;
    getAllDeviceGroups().forEach((group) => updateDeviceTextBackground(group, showBackground));
    fabricCanvas.renderAll();
  };

  const updateAllBoldText = (isBold) => {
    globalBoldText = isBold;
    window.globalBoldText = isBold;
    getAllDeviceGroups().forEach((group) => updateDeviceBoldText(group, isBold));
    fabricCanvas.renderAll();
  };

  const updateAllLabelDrag = (enabled) => {
    globalLabelDragEnabled = enabled;
    window.globalLabelDragEnabled = enabled;
    getAllDeviceGroups().forEach((group) => {
      if (group.textObject) {
        ensureGroupLabelBehavior(group);
        setGroupLabelDragState(group, enabled);
      }
    });
    fabricCanvas.renderAll();
  };

  const updateAllCompleteIndicators = () => {
    getAllDeviceGroups().forEach((group) => updateDeviceCompleteIndicator(group));
  };

  // Expose function for other modules
  window.updateDeviceCompleteIndicator = updateDeviceCompleteIndicator;

  // Zoom controls
  const clampZoom = (z) => Math.min(10, Math.max(0.25, z));

  const setZoomAndCenter = (newZoom, centerPoint) => {
    const vpt = fabricCanvas.viewportTransform;
    if (!centerPoint) {
      const center = fabricCanvas.getCenter();
      centerPoint = new fabric.Point(center.left, center.top);
    }
    fabricCanvas.zoomToPoint(centerPoint, newZoom);
    fabricCanvas.requestRenderAll();
    updateZoomDisplay();
  };

  const updateZoomDisplay = () => {
    const zoomPctEl = document.getElementById("zoom-percentage");
    if (!zoomPctEl) return;
    const pct = Math.round(fabricCanvas.getZoom() * 100);
    zoomPctEl.textContent = pct + "%";
  };

  window.updateZoomDisplay = updateZoomDisplay;

  // Initialize settings listeners
  const initializeSettingsListeners = () => {
    // Zoom controls
    const zoomOutBtn = document.getElementById("zoom-out-btn");
    const zoomInBtn = document.getElementById("zoom-in-btn");

    if (zoomOutBtn) {
      zoomOutBtn.addEventListener("click", () => {
        const current = fabricCanvas.getZoom();
        setZoomAndCenter(clampZoom(current - 0.1));
      });
    }

    if (zoomInBtn) {
      zoomInBtn.addEventListener("click", () => {
        const current = fabricCanvas.getZoom();
        setZoomAndCenter(clampZoom(current + 0.1));
      });
    }

    updateZoomDisplay();

    // Global settings elements
    const elements = {
      globalIconSizeSlider: document.getElementById("global-icon-size-slider"),
      globalIconSizeInput: document.getElementById("global-icon-size-input"),
      globalIconTextToggle: document.getElementById("global-icon-text-toggle"),
      globalDeviceColorPicker: document.getElementById("global-device-color-picker"),
      globalDeviceColorIcons: document.querySelectorAll(".global-device-colour .colour-icon"),
      globalTextColorPicker: document.getElementById("global-text-color-picker"),
      globalTextColorIcons: document.querySelectorAll(".global-text-colour .colour-icon"),
      globalFontSelect: document.getElementById("global-font-select"),
      globalTextBackgroundToggle: document.getElementById("global-text-background-toggle"),
      globalBoldTextToggle: document.getElementById("global-bold-text-toggle"),
      globalCompleteDeviceIndicatorToggle: document.getElementById("global-complete-device-indicator-toggle"),
      globalLabelDragToggle: document.getElementById("global-label-drag-toggle"),
    };

    // Icon size slider
    if (elements.globalIconSizeSlider) {
      elements.globalIconSizeSlider.addEventListener("input", (e) => {
        const size = parseInt(e.target.value);
        globalIconSize = size;
        if (elements.globalIconSizeInput) {
          elements.globalIconSizeInput.textContent = size + "px";
        }
        updateSliderTrack(elements.globalIconSizeSlider, size, 1, 100);
        updateAllIconSizes(size);
      });
    }

    // Icon text toggle
    if (elements.globalIconTextToggle) {
      elements.globalIconTextToggle.addEventListener("change", (e) => {
        updateAllIconTextVisibility(e.target.checked);
      });
    }

    // Device color controls
    if (elements.globalDeviceColorPicker) {
      elements.globalDeviceColorPicker.addEventListener("input", (e) => {
        updateAllDeviceColors(e.target.value);
      });
    }

    elements.globalDeviceColorIcons.forEach((icon) => {
      icon.addEventListener("click", (e) => {
        const color = icon.getAttribute("data-color");
        if (color) updateAllDeviceColors(color);
      });
    });

    // Text color controls
    if (elements.globalTextColorPicker) {
      elements.globalTextColorPicker.addEventListener("input", (e) => {
        updateAllTextColors(e.target.value);
      });
    }

    elements.globalTextColorIcons.forEach((icon) => {
      icon.addEventListener("click", (e) => {
        const color = icon.getAttribute("data-color");
        if (color) updateAllTextColors(color);
      });
    });

    // Font selection
    if (elements.globalFontSelect) {
      elements.globalFontSelect.addEventListener("change", (e) => {
        updateAllFonts(e.target.value);
      });
    }

    // Text background toggle
    if (elements.globalTextBackgroundToggle) {
      elements.globalTextBackgroundToggle.addEventListener("change", (e) => {
        updateAllTextBackgrounds(e.target.checked);
      });
    }

    // Bold text toggle
    if (elements.globalBoldTextToggle) {
      elements.globalBoldTextToggle.addEventListener("change", (e) => {
        updateAllBoldText(e.target.checked);
      });
    }

    // Complete device indicator toggle
    if (elements.globalCompleteDeviceIndicatorToggle) {
      elements.globalCompleteDeviceIndicatorToggle.addEventListener("change", (e) => {
        globalCompleteDeviceIndicator = e.target.checked;
        window.globalCompleteDeviceIndicator = e.target.checked;
        updateAllCompleteIndicators();
      });
    }

    if (elements.globalLabelDragToggle) {
      elements.globalLabelDragToggle.addEventListener("change", (e) => {
        updateAllLabelDrag(e.target.checked);
      });
    }

    // Set initial values
    if (elements.globalIconSizeSlider) {
      elements.globalIconSizeSlider.value = globalIconSize;
      updateSliderTrack(elements.globalIconSizeSlider, globalIconSize, 1, 100);
      if (elements.globalIconSizeInput) {
        elements.globalIconSizeInput.textContent = globalIconSize + "px";
      }
    }

    if (elements.globalIconTextToggle) elements.globalIconTextToggle.checked = globalIconTextVisible;
    if (elements.globalDeviceColorPicker) elements.globalDeviceColorPicker.value = globalDeviceColor;
    if (elements.globalTextColorPicker) elements.globalTextColorPicker.value = globalTextColor;
    if (elements.globalFontSelect) elements.globalFontSelect.value = globalFont;
    if (elements.globalTextBackgroundToggle) elements.globalTextBackgroundToggle.checked = globalTextBackground;
    if (elements.globalBoldTextToggle) elements.globalBoldTextToggle.checked = globalBoldText;
    if (elements.globalCompleteDeviceIndicatorToggle) elements.globalCompleteDeviceIndicatorToggle.checked = globalCompleteDeviceIndicator;
    if (elements.globalLabelDragToggle) elements.globalLabelDragToggle.checked = globalLabelDragEnabled;
  };

  const applySettingsFromSave = (savedSettings = {}) => {
    if (!savedSettings || typeof savedSettings !== "object") {
      updateAllCompleteIndicators();
      return;
    }

    const { defaultDeviceIconSize, globalIconTextVisible: savedTextVisible, globalDeviceColor: savedDeviceColor, globalTextColor: savedTextColor, globalFont: savedFont, globalTextBackground: savedTextBackground, globalBoldText: savedBoldText, globalCompleteDeviceIndicator: savedCompleteIndicator, globalLabelDragEnabled: savedLabelDragEnabled } = savedSettings;

    const elements = {
      slider: document.getElementById("global-icon-size-slider"),
      sliderLabel: document.getElementById("global-icon-size-input"),
      textToggle: document.getElementById("global-icon-text-toggle"),
      deviceColorPicker: document.getElementById("global-device-color-picker"),
      textColorPicker: document.getElementById("global-text-color-picker"),
      fontSelect: document.getElementById("global-font-select"),
      textBackgroundToggle: document.getElementById("global-text-background-toggle"),
      boldToggle: document.getElementById("global-bold-text-toggle"),
      completeIndicatorToggle: document.getElementById("global-complete-device-indicator-toggle"),
      labelDragToggle: document.getElementById("global-label-drag-toggle"),
    };

    if (typeof defaultDeviceIconSize === "number" && !Number.isNaN(defaultDeviceIconSize)) {
      updateAllIconSizes(defaultDeviceIconSize);
      if (elements.slider) {
        elements.slider.value = defaultDeviceIconSize;
        const sliderMin = Number(elements.slider.min) || 1;
        const sliderMax = Number(elements.slider.max) || 100;
        updateSliderTrack(elements.slider, defaultDeviceIconSize, sliderMin, sliderMax);
      }
      if (elements.sliderLabel) {
        elements.sliderLabel.textContent = `${defaultDeviceIconSize}px`;
      }
    }

    if (typeof savedTextVisible === "boolean") {
      updateAllIconTextVisibility(savedTextVisible);
      if (elements.textToggle) elements.textToggle.checked = savedTextVisible;
    }

    if (typeof savedDeviceColor === "string" && savedDeviceColor) {
      updateAllDeviceColors(savedDeviceColor);
      if (elements.deviceColorPicker) elements.deviceColorPicker.value = savedDeviceColor;
    }

    if (typeof savedTextColor === "string" && savedTextColor) {
      updateAllTextColors(savedTextColor);
      if (elements.textColorPicker) elements.textColorPicker.value = savedTextColor;
    }

    if (typeof savedFont === "string" && savedFont) {
      updateAllFonts(savedFont);
      if (elements.fontSelect) elements.fontSelect.value = savedFont;
    }

    if (typeof savedTextBackground === "boolean") {
      updateAllTextBackgrounds(savedTextBackground);
      if (elements.textBackgroundToggle) elements.textBackgroundToggle.checked = savedTextBackground;
    }

    if (typeof savedBoldText === "boolean") {
      updateAllBoldText(savedBoldText);
      if (elements.boldToggle) elements.boldToggle.checked = savedBoldText;
    }

    if (typeof savedCompleteIndicator === "boolean") {
      globalCompleteDeviceIndicator = savedCompleteIndicator;
      window.globalCompleteDeviceIndicator = savedCompleteIndicator;
      updateAllCompleteIndicators();
      if (elements.completeIndicatorToggle) elements.completeIndicatorToggle.checked = savedCompleteIndicator;
    } else {
      updateAllCompleteIndicators();
    }

    if (typeof savedLabelDragEnabled === "boolean") {
      updateAllLabelDrag(savedLabelDragEnabled);
      if (elements.labelDragToggle) elements.labelDragToggle.checked = savedLabelDragEnabled;
    }
  };

  // Setup device hover events
  const setupDeviceHoverEvents = () => {
    fabricCanvas.on("mouse:over", (e) => {
      const target = e.target;
      if (target && target.type === "group" && target.deviceType) {
        handleDeviceHover(target, true);
      }
    });

    fabricCanvas.on("mouse:out", (e) => {
      const target = e.target;
      if (target && target.type === "group" && target.deviceType) {
        handleDeviceHover(target, false);
      }
    });
  };

  // Initialize everything
  initializeSettingsListeners();
  setupDeviceHoverEvents();

  updateAllLabelDrag(globalLabelDragEnabled);

  if (window.pendingGlobalSettings) {
    try {
      applySettingsFromSave(window.pendingGlobalSettings);
    } finally {
      window.pendingGlobalSettings = null;
    }
  }

  // Return API for external use
  const api = {
    updateAllIconSizes,
    updateAllIconTextVisibility,
    updateAllDeviceColors,
    updateAllTextColors,
    updateAllFonts,
    updateAllTextBackgrounds,
    updateAllBoldText,
    updateAllLabelDrag,
    updateAllCompleteIndicators,
    getGlobalIconSize: () => globalIconSize,
    getGlobalIconTextVisible: () => globalIconTextVisible,
    getGlobalDeviceColor: () => globalDeviceColor,
    getGlobalTextColor: () => globalTextColor,
    getGlobalFont: () => globalFont,
    getGlobalTextBackground: () => globalTextBackground,
    getGlobalBoldText: () => globalBoldText,
    getGlobalCompleteDeviceIndicator: () => globalCompleteDeviceIndicator,
    getGlobalLabelDragEnabled: () => globalLabelDragEnabled,
    applySettingsFromSave,
  };

  window.globalSettingsAPI = api;
  return api;
}
