import { createPanelBase, bindInputToProperty, bindSelectToProperty } from "../sidebar-utils.js";

// Sets up the details panel for device name, location, part number, and other info
export function initDetailsPanel() {
  const deviceLocationInput = document.getElementById("device-location-input");
  const partNumberInput = document.getElementById("device-part-number-input");
  const fittingPositionsInput = document.getElementById("fitting-positions");
  const stockNumberInput = document.getElementById("device-stock-number-input");

  // Create panel instance
  const panel = createPanelBase();
  
  // Setup controls
  if (partNumberInput) {
    bindInputToProperty(partNumberInput, "partNumber", () => panel.currentGroup);
  }
  if (deviceLocationInput) {
    bindInputToProperty(deviceLocationInput, "location", () => panel.currentGroup);
  }
  if (stockNumberInput) {
    bindInputToProperty(stockNumberInput, "stockNumber", () => panel.currentGroup);
  }

  // Handles mounted position dropdown - converts "Select" to empty string
  if (fittingPositionsInput) {
    bindSelectToProperty(fittingPositionsInput, "mountedPosition", () => window.__currentDeviceGroup || panel.currentGroup, {
      transformValue: (value) => (value === "Select" ? "" : value),
    });
  }

  // Override updatePanel
  panel.updatePanel = function(group) {
    panel.currentGroup = group;
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
  };

  // Override clearPanel
  panel.clearPanel = function() {
    panel.currentGroup = null;
    if (partNumberInput) partNumberInput.value = "";
    if (deviceLocationInput) deviceLocationInput.value = "";
    if (fittingPositionsInput) fittingPositionsInput.value = "Select";
    if (stockNumberInput) stockNumberInput.value = "";
  };

  // Add updateChannelInfo method
  panel.updateChannelInfo = function(group) {
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
  };

  // Return object with same interface as before for backward compatibility
  return {
    updateDetailsPanel: (group) => panel.updatePanel(group),
    clearDetailsPanel: () => panel.clearPanel(),
    updateChannelInfo: (group) => panel.updateChannelInfo(group),
  };
}

// Import coordinator to initialize panels
import "./panel-coordinator.js";
