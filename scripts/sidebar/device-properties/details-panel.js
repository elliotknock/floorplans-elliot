import { setTextVisibility, updateTextPosition } from "../sidebar-utils.js";
import { initDeviceStylePanel } from "./device-style-panel.js";
import { initCameraSpecPanel } from "./camera-spec-panel.js";

// Sets up the details panel for device name, location, part number, and other info
export function initDetailsPanel() {
  const deviceLocationInput = document.getElementById("device-location-input");
  const partNumberInput = document.getElementById("device-part-number-input");
  const fittingPositionsInput = document.getElementById("fitting-positions");
  const stockNumberInput = document.getElementById("device-stock-number-input");

  // Connects an input field to a device property
  const bindGroupInput = (inputEl, propName, currentGroupRef) => {
    if (!inputEl) return;
    inputEl.addEventListener("input", (e) => {
      const currentGroup = currentGroupRef.current;
      if (!currentGroup) return;
      currentGroup[propName] = e.target.value;
      if (typeof window.updateDeviceCompleteIndicator === "function") {
        window.updateDeviceCompleteIndicator(currentGroup);
      }
    });
  };

  // Handles mounted position dropdown - converts "Select" to empty string
  if (fittingPositionsInput) {
    fittingPositionsInput.addEventListener("change", (e) => {
      const currentGroup = window.__currentDeviceGroup;
      if (!currentGroup) return;
      currentGroup.mountedPosition = e.target.value === "Select" ? "" : e.target.value;
      if (typeof window.updateDeviceCompleteIndicator === "function") window.updateDeviceCompleteIndicator(currentGroup);
    });
  }

  return {
    updateDetailsPanel: (group) => {
      // Update part number, mounted position, and stock number
      if (partNumberInput) {
        partNumberInput.value = group?.partNumber || "";
      }
      if (deviceLocationInput) {
        deviceLocationInput.value = group?.location || "";
      }
      if (fittingPositionsInput) {
        fittingPositionsInput.value = group?.mountedPosition || "Select";
      }
      if (stockNumberInput) {
        stockNumberInput.value = group?.stockNumber || "";
      }
    },
    clearDetailsPanel: () => {
      if (partNumberInput) partNumberInput.value = "";
      if (deviceLocationInput) deviceLocationInput.value = "";
      if (fittingPositionsInput) fittingPositionsInput.value = "Select";
      if (stockNumberInput) stockNumberInput.value = "";
    },
    updateChannelInfo: (group) => {
      const channelInfoGroup = document.getElementById("device-channel-info-group");
      const channelInfoText = document.getElementById("device-channel-info");
      if (channelInfoGroup && channelInfoText && window.topologyManager && group) {
        const isPanel = window.topologyManager.isPanelDevice(group);

        if (isPanel) {
          const connections = window.topologyManager.getPanelConnections(group);
          if (connections && connections.length > 0) {
            const connectionText = connections.map((conn) => `${conn.deviceLabel} (Channel ${conn.channel})`).join(", ");
            channelInfoText.textContent = `Connected Devices: ${connectionText}`;
            channelInfoGroup.style.display = "block";
          } else {
            channelInfoGroup.style.display = "none";
          }
        } else {
          const channelInfo = window.topologyManager.getDeviceChannelInfo(group);
          if (channelInfo) {
            channelInfoText.textContent = `Channel ${channelInfo.channel} on ${channelInfo.panelLabel}`;
            channelInfoGroup.style.display = "block";
          } else {
            channelInfoGroup.style.display = "none";
          }
        }
      }
    }
  };
}

// Sets up all device panels and connects them together
const initDetailsPanelCoordinator = () => {
  const partNumberInput = document.getElementById("device-part-number-input");
  const deviceLocationInput = document.getElementById("device-location-input");
  const stockNumberInput = document.getElementById("device-stock-number-input");
  
  // Connects an input field to a device property
  const bindGroupInput = (inputEl, propName) => {
    if (!inputEl) return;
    inputEl.addEventListener("input", (e) => {
      const currentGroup = window.__currentDeviceGroup;
      if (!currentGroup) return;
      currentGroup[propName] = e.target.value;
      if (typeof window.updateDeviceCompleteIndicator === "function") {
        window.updateDeviceCompleteIndicator(currentGroup);
      }
    });
  };

  bindGroupInput(partNumberInput, "partNumber");
  bindGroupInput(deviceLocationInput, "location");
  bindGroupInput(stockNumberInput, "stockNumber");

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
};

// Waits for the page to load before setting up
if (document.readyState === "complete" || document.readyState === "interactive") {
  initDetailsPanelCoordinator();
} else {
  document.addEventListener("DOMContentLoaded", initDetailsPanelCoordinator);
}

