import { updateSliderTrack, createToggleHandler, createPanelBase, bindInputToProperty, bindSelectToProperty } from "../sidebar-utils.js";
import { calculateFOV, updateCameraFromSpecs } from "../../devices/camera/camera-calculations.js";

// Sets up the camera specification panel with controls for resolution, sensor size, focal length, and aspect ratio
export function initCameraSpecPanel() {
  const deviceFocalLengthInput = document.getElementById("device-focal-length-input");
  const deviceSensorSizeInput = document.getElementById("device-sensor-size-input");
  const deviceResolutionInput = document.getElementById("device-resolution-input");
  const deviceIpAddressInput = document.getElementById("device-ip-address-input");
  const deviceSubnetInput = document.getElementById("device-subnet-input");
  const deviceGatewayInput = document.getElementById("device-gateway-input");
  const deviceMacAddressInput = document.getElementById("device-mac-address-input");
  const aspectRatioToggle = document.getElementById("camera-aspect-ratio-toggle");

  // Create panel instance
  const panel = createPanelBase();

  // Updates the camera coverage angle when focal length or sensor size changes
  const updateCameraCoverageFromFOV = () => {
    const currentGroup = panel.getCurrentGroup();
    if (!currentGroup || !currentGroup.coverageConfig) return;

    const planAngle = updateCameraFromSpecs(currentGroup);
    if (planAngle === null) return;

    // Update the slider to match the calculated angle
    const angleSlider = document.getElementById("camera-angle-slider");
    const angleInput = document.getElementById("camera-angle-input");
    if (angleSlider && angleInput) {
      angleSlider.value = planAngle;
      angleInput.value = planAngle;
      // Always update the slider track using the imported helper so the
      // visual track color stays in sync immediately when FOV/angle changes.
      try {
        updateSliderTrack(angleSlider, planAngle, 1, 360);
      } catch (err) {
        // If anything goes wrong, fallback silently - not fatal for the app.
        // (This avoids breaking in environments where DOM or style isn't available.)
      }
    }

    // Notify coverage panel to update physics (dead zone, side view)
    const event = new CustomEvent("camera-specs-changed", { detail: { group: currentGroup } });
    document.dispatchEvent(event);
  };

  // Setup controls
  if (deviceFocalLengthInput) {
    bindInputToProperty(deviceFocalLengthInput, "focalLength", () => panel.currentGroup, {
      onUpdate: () => updateCameraCoverageFromFOV(),
    });
  }

  if (deviceSensorSizeInput) {
    bindSelectToProperty(deviceSensorSizeInput, "sensorSize", () => panel.currentGroup, {
      onUpdate: () => updateCameraCoverageFromFOV(),
    });
  }

  if (deviceResolutionInput) {
    bindInputToProperty(deviceResolutionInput, "resolution", () => panel.currentGroup, {
      onUpdate: (group, value) => {
        // Auto-enable DORI if resolution is set
        if (group.coverageConfig && value) {
          group.coverageConfig.doriEnabled = true;
          const doriToggle = document.getElementById("camera-dori-toggle");
          if (doriToggle) doriToggle.checked = true;
          if (group.createOrUpdateCoverageArea) {
            group.createOrUpdateCoverageArea();
          }
        }
        updateCameraCoverageFromFOV();
      },
    });
  }

  // Network settings
  if (deviceIpAddressInput) bindInputToProperty(deviceIpAddressInput, "ipAddress", () => panel.currentGroup);
  if (deviceSubnetInput) bindInputToProperty(deviceSubnetInput, "subnetMask", () => panel.currentGroup);
  if (deviceGatewayInput) bindInputToProperty(deviceGatewayInput, "gatewayAddress", () => panel.currentGroup);
  if (deviceMacAddressInput) bindInputToProperty(deviceMacAddressInput, "macAddress", () => panel.currentGroup);

  // Handle Aspect Ratio Toggle
  if (aspectRatioToggle) {
    createToggleHandler(aspectRatioToggle, (checked) => {
      const group = panel.currentGroup;
      if (!group || !group.coverageConfig) return;
      group.coverageConfig.aspectRatioMode = checked;
      updateCameraCoverageFromFOV();
    });
  }

  // Override updatePanel
  panel.updatePanel = function(group) {
    panel.currentGroup = group;
    if (aspectRatioToggle) {
      aspectRatioToggle.checked = group?.coverageConfig?.aspectRatioMode || false;
    }
    if (deviceFocalLengthInput) {
      deviceFocalLengthInput.value = group?.focalLength || "";
    }
    if (deviceSensorSizeInput) {
      deviceSensorSizeInput.value = group?.sensorSize || "1/2.0";
    }
    if (deviceResolutionInput) {
      deviceResolutionInput.value = group?.resolution || "";
    }
    if (deviceIpAddressInput) {
      deviceIpAddressInput.value = group?.ipAddress || "";
    }
    if (deviceSubnetInput) {
      deviceSubnetInput.value = group?.subnetMask || "";
    }
    if (deviceGatewayInput) {
      deviceGatewayInput.value = group?.gatewayAddress || "";
    }
    if (deviceMacAddressInput) {
      deviceMacAddressInput.value = group?.macAddress || "";
    }

    // Calculate and store the theoretical angle for warning comparison
    if (group && group.focalLength && group.sensorSize) {
      const fov = calculateFOV(group.focalLength, group.sensorSize);
      if (fov) {
        const isAspectRatio = group.coverageConfig?.aspectRatioMode || false;
        let planAngle;
        if (isAspectRatio) {
          planAngle = Math.round(fov.vertical);
        } else {
          planAngle = Math.round(fov.horizontal);
        }
        if (group.coverageConfig) {
          group.coverageConfig.calculatedAngle = planAngle;
        }
      }
    }
  };

  // Override clearPanel
  panel.clearPanel = function() {
    panel.currentGroup = null;
    if (deviceFocalLengthInput) deviceFocalLengthInput.value = "";
    if (deviceSensorSizeInput) deviceSensorSizeInput.value = "1/2.0";
    if (deviceResolutionInput) deviceResolutionInput.value = "";
    if (deviceIpAddressInput) deviceIpAddressInput.value = "";
    if (deviceSubnetInput) deviceSubnetInput.value = "";
    if (deviceGatewayInput) deviceGatewayInput.value = "";
    if (deviceMacAddressInput) deviceMacAddressInput.value = "";
  };

  // Return object with same interface as before for backward compatibility
  return {
    setCurrentGroup: (group) => panel.setCurrentGroup(group),
    updateCameraSpecPanel: (group) => panel.updatePanel(group),
    clearCameraSpecPanel: () => panel.clearPanel(),
  };
}
