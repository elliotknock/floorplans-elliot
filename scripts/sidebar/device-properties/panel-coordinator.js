// ============================================================================
// PANEL COORDINATOR - Coordinates all device property panels
// ============================================================================
// This file manages the coordination between all device property panels
// and provides a single entry point for showing/hiding device properties

import { setTextVisibility, updateTextPosition, bindInputToProperty } from "../sidebar-utils.js";
import { initDeviceStylePanel } from "./device-style-panel.js";
import { initCameraSpecPanel } from "./camera-spec-panel.js";
import { initDetailsPanel } from "./details-panel.js";

// Sets up all device panels and connects them together
export function initPanelCoordinator() {
  const partNumberInput = document.getElementById("device-part-number-input");
  const deviceLocationInput = document.getElementById("device-location-input");
  const stockNumberInput = document.getElementById("device-stock-number-input");

  // Use shared input binder instead of duplicate code
  bindInputToProperty(partNumberInput, "partNumber", () => window.__currentDeviceGroup);
  bindInputToProperty(deviceLocationInput, "location", () => window.__currentDeviceGroup);
  bindInputToProperty(stockNumberInput, "stockNumber", () => window.__currentDeviceGroup);

  const deviceStylePanel = initDeviceStylePanel();
  const cameraSpecPanel = initCameraSpecPanel();
  const detailsPanelInstance = initDetailsPanel();

  window.setDeviceTextVisibility = setTextVisibility;
  window.updateDeviceTextPosition = updateTextPosition;

  // Shows device properties and updates all panels
  window.showDeviceProperties = function (deviceType, textObject, group) {
    const isTextDevice = deviceType === "text-device";

    window.__currentDeviceGroup = group;

    detailsPanelInstance.updateChannelInfo(group);
    detailsPanelInstance.updateDetailsPanel(group);
    cameraSpecPanel.setCurrentGroup(group);
    cameraSpecPanel.updateCameraSpecPanel(group);
    deviceStylePanel.setCurrentGroup(group);
    deviceStylePanel.setCurrentTextObject(textObject);
    deviceStylePanel.updateDeviceLabelPanel(textObject, group, isTextDevice);
    deviceStylePanel.updateIconPanel(group, textObject, isTextDevice);
  };

  // Hides device properties and clears all panels
  window.hideDeviceProperties = function () {
    window.__currentDeviceGroup = null;

    detailsPanelInstance.clearDetailsPanel();
    cameraSpecPanel.clearCameraSpecPanel();
    deviceStylePanel.clearDeviceLabelPanel();
    deviceStylePanel.setCurrentGroup(null);
    deviceStylePanel.setCurrentTextObject(null);
  };
}

// Initialize when DOM is ready
if (document.readyState === "complete" || document.readyState === "interactive") {
  initPanelCoordinator();
} else {
  document.addEventListener("DOMContentLoaded", initPanelCoordinator);
}

