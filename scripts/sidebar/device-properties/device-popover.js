import { createPopoverBase } from "../popover-utils.js";
import "./details-panel.js";
import "./camera-coverage-panel.js";

// Sets up the device popover that shows when a device is selected
(function () {
  const popover = document.getElementById("device-popover");
  if (!popover) return;

  const popoverTitle = document.getElementById("device-popover-title");

  const DEVICE_NAME_MAP = {
    "bullet-camera.png": "Camera Properties",
    "box-camera.png": "Camera Properties",
    "ptz-camera.png": "Camera Properties",
    "dome-camera.png": "Camera Properties",
    "fixed-camera.png": "Camera Properties",
    "thermal-camera.png": "Camera Properties",
    "custom-camera-icon.png": "Camera Properties",
    "text-device": "Placeholder Text Properties",
  };

  // Shows or hides a tab in the popover
  function setTabVisibility(panelKey, visible) {
    const tab = popover.querySelector(`.panel-navigation .nav-item[data-panel="${panelKey}"]`);
    const panel = popover.querySelector(`.slide-panel[data-panel="${panelKey}"]`);
    if (tab) tab.style.display = visible ? "" : "none";
    if (panel) panel.style.display = visible ? "" : "none";
  }

  // Creates the popover with custom behavior
  const basePopover = createPopoverBase("device-popover", {
    shouldPreventClose: (e) => {
      // Don't close when clicking on device icon
      return e.target.closest(".device-icon") !== null;
    },
    onClose: () => {
      basePopover.currentTarget = null;
    },
    customOpenPopover: function(group, deviceTypeLabel = "Device Properties", deviceType = null, baseOpen) {
      if (this.isDragging) return;
      
      if (popoverTitle) popoverTitle.textContent = deviceTypeLabel;
      this.setActivePanel("details");

      ["details", "spec", "style", "coverage"].forEach((k) => setTabVisibility(k, true));

      const typeString = typeof deviceType === "string" ? deviceType : group && typeof group.deviceType === "string" ? group.deviceType : "";
      const isCamera = !!typeString && typeString.includes("camera");
      const isPlaceholderText = typeString === "text-device";

      // Hide tabs that don't apply to placeholder text
      if (isPlaceholderText) {
        setTabVisibility("coverage", false);
        setTabVisibility("style", false);
        setTabVisibility("spec", false);
        this.setActivePanel("details");
      } else {
        setTabVisibility("coverage", isCamera);
        setTabVisibility("style", true);
        setTabVisibility("spec", isCamera);

        // Switch to details tab if on a camera-only tab for non-camera
        if (!isCamera && popover.querySelector('.panel-navigation .nav-item[data-panel="coverage"].active')) {
          this.setActivePanel("details");
        }
        if (!isCamera && popover.querySelector('.panel-navigation .nav-item[data-panel="spec"].active')) {
          this.setActivePanel("details");
        }
      }

      // Show the right icon section based on device type
      const cameraIconsSection = popover.querySelector(".camera-icons-section");
      const deviceIconsSection = popover.querySelector(".device-icons-section");

      if (isCamera) {
        if (cameraIconsSection) cameraIconsSection.style.display = "";
        if (deviceIconsSection) deviceIconsSection.style.display = "none";
      } else {
        if (cameraIconsSection) cameraIconsSection.style.display = "none";
        if (deviceIconsSection) deviceIconsSection.style.display = "";
      }

      ["camera-properties", "generic-properties"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.style.display = "";
      });

      baseOpen.call(this, group);
      
      window.requestAnimationFrame(() => this.positionPopover());
    },
    installIntercepts: {
      installKey: "__devicePopoverInterceptInstalled",
      shouldIntercept: (deviceType) => {
        // Don't intercept zone/room polygons - let polygon popover handle those
        return deviceType !== "zone-polygon" && deviceType !== "room-polygon";
      },
      onShowDeviceProperties: function(deviceType, textObject, group, fourth, originalShow) {
        // Let polygon popover handle zone/room polygons
        if (deviceType === "zone-polygon" || deviceType === "room-polygon") {
          basePopover.closePopover();
          return originalShow.apply(this, arguments);
        }

        try {
          originalShow.apply(this, arguments);
        } catch (_) {}

        // Initialize camera controls if needed
        if (group && group.canvas && typeof window.initCameraControls === "function") {
          try {
            window.initCameraControls(group.canvas);
          } catch (_) {}
        }

        const label = DEVICE_NAME_MAP[deviceType] || "Device Properties";
        if (deviceType === "text-device") {
          basePopover.closePopover();
          return;
        }
        basePopover.openPopover(group, label, deviceType);
      },
      onHideDeviceProperties: () => {
        basePopover.closePopover();
      }
    }
  });

  if (!basePopover) return;
})();
