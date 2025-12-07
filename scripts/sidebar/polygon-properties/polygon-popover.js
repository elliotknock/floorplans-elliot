import { createPopoverBase } from "../popover-utils.js";
import "../device-properties/details-panel.js";
import "./details-panel.js";

// Sets up the polygon popover that shows when a zone or room is selected
(function () {
  const popover = document.getElementById("polygon-popover");
  if (!popover) return;

  const titleEl = document.getElementById("polygon-popover-title");
  let currentPolygonType = "zone";

  // Shows zone or room properties section based on type
  function showPropertiesForType(type) {
    currentPolygonType = type;
    const zoneProps = document.getElementById("zone-properties");
    const roomProps = document.getElementById("room-properties");
    const zoneAppearanceProps = document.getElementById("zone-appearance-properties");
    const roomAppearanceProps = document.getElementById("room-appearance-properties");

    if (type === "zone") {
      if (zoneProps) zoneProps.style.display = "block";
      if (roomProps) roomProps.style.display = "none";
      if (zoneAppearanceProps) zoneAppearanceProps.style.display = "block";
      if (roomAppearanceProps) roomAppearanceProps.style.display = "none";
    } else {
      if (zoneProps) zoneProps.style.display = "none";
      if (roomProps) roomProps.style.display = "block";
      if (zoneAppearanceProps) zoneAppearanceProps.style.display = "none";
      if (roomAppearanceProps) roomAppearanceProps.style.display = "block";
    }
  }

  // Creates the popover with custom behavior
  const basePopover = createPopoverBase("polygon-popover", {
    onClose: () => {
      basePopover.currentTarget = null;
    },
    customOpenPopover: function(kind, polygon, baseOpen) {
      if (this.isDragging) return;
      
      if (titleEl) titleEl.textContent = kind === "room" ? "Room Properties" : "Zone Properties";
      this.setActivePanel("details");
      showPropertiesForType(kind);
      
      baseOpen.call(this, polygon);
      
      requestAnimationFrame(() => this.positionPopover());
    },
    installIntercepts: {
      installKey: "__polygonPopoverInterceptInstalled",
      shouldIntercept: (deviceType) => {
        return deviceType === "zone-polygon" || deviceType === "room-polygon";
      },
      waitFor: () => {
        // Wait for polygon properties to finish setting up
        return window.__polygonPropertiesInitialized || false;
      },
      onShowDeviceProperties: function(deviceType, textObject, polygon, fourth, originalShow) {
        if (deviceType === "zone-polygon" || deviceType === "room-polygon") {
          // Call original first (which includes polygon-sidebar handlers)
          if (typeof originalShow === "function") {
            try {
              originalShow.apply(this, arguments);
            } catch (e) {
              console.error("Error in polygon showDeviceProperties:", e);
            }
          }
          // Then open the popover
          basePopover.openPopover(deviceType === "room-polygon" ? "room" : "zone", polygon);
          return;
        }
      },
      onHideDeviceProperties: () => {
        basePopover.closePopover();
      }
    }
  });

  if (!basePopover) return;
})();
