import { preventEventPropagation } from "../sidebar-utils.js";

// Sets up the camera spec panel for focal length, sensor size, resolution, and network settings
export function initCameraSpecPanel() {
  const deviceFocalLengthInput = document.getElementById("device-focal-length-input");
  const deviceSensorSizeInput = document.getElementById("device-sensor-size-input");
  const deviceResolutionInput = document.getElementById("device-resolution-input");
  const deviceIpAddressInput = document.getElementById("device-ip-address-input");
  const deviceSubnetInput = document.getElementById("device-subnet-input");
  const deviceGatewayInput = document.getElementById("device-gateway-input");
  const deviceMacAddressInput = document.getElementById("device-mac-address-input");

  let currentGroup = null;
  let updateCameraCoverageFromFOV = null;

  // Maps sensor sizes to their actual dimensions in millimeters
  const sensorDimensions = {
    "1/1.1": { width: 12.68, height: 7.13 },
    "1/1.2": { width: 11.62, height: 6.54 },
    "2/3": { width: 9.35, height: 23 },
    "1/1.6": { width: 8.72, height: 4.9 },
    "1/1.7": { width: 8.2, height: 4.61 },
    "1/1.8": { width: 7.75, height: 4.36 },
    "1/1.9": { width: 7.34, height: 4.13 },
    "1/2.0": { width: 6.97, height: 3.92 },
    "1/2.3": { width: 6.82, height: 3.84 },
    "1/2.5": { width: 6.28, height: 3.53 },
    "1/2.7": { width: 5.81, height: 3.27 },
    "1/2.8": { width: 5.6, height: 3.15 },
    "1/2.9": { width: 5.41, height: 3.04 },
    "1/3.0": { width: 5.23, height: 2.94 },
    "1/3.2": { width: 4.9, height: 2.76 },
    "1/3.4": { width: 4.61, height: 2.6 },
    "1/3.6": { width: 4.36, height: 2.45 },
    "1/4.0": { width: 3.92, height: 2.21 },
    "1/5.0": { width: 3.14, height: 1.76 },
    "1/6.0": { width: 2.61, height: 1.47 },
    "1/7.5": { width: 2.09, height: 1.18 },
  };

  // Figures out how wide and tall the camera can see based on focal length and sensor size
  const calculateFOV = (focalLength, sensorSize) => {
    // Remove "mm" text if present
    const focal = parseFloat(focalLength.toString().replace("mm", "").trim());
    if (!focal || focal <= 0) return null;

    const sensor = sensorDimensions[sensorSize];
    if (!sensor) return null;

    // Calculate how wide and tall the view is
    const horizontalFOV = 2 * Math.atan(sensor.width / (2 * focal)) * (180 / Math.PI);
    const verticalFOV = 2 * Math.atan(sensor.height / (2 * focal)) * (180 / Math.PI);

    return { horizontal: horizontalFOV, vertical: verticalFOV };
  };

  // Updates the camera coverage angle when focal length or sensor size changes
  updateCameraCoverageFromFOV = () => {
    if (!currentGroup || !currentGroup.coverageConfig) return;

    const focalLength = currentGroup.focalLength || "";
    const sensorSize = currentGroup.sensorSize || "1/2.0";

    if (!focalLength) return;

    const fov = calculateFOV(focalLength, sensorSize);
    if (!fov) return;

    // Use horizontal view width for the coverage angle
    const calculatedAngle = Math.round(fov.horizontal);

    const midAngle = (currentGroup.coverageConfig.startAngle + currentGroup.angleDiff(currentGroup.coverageConfig.startAngle, currentGroup.coverageConfig.endAngle) / 2) % 360;

    currentGroup.coverageConfig.startAngle = (midAngle - calculatedAngle / 2 + 360) % 360;
    currentGroup.coverageConfig.endAngle = (midAngle + calculatedAngle / 2) % 360;

    // Full circle if angle is large enough
    if (calculatedAngle >= 359) {
      currentGroup.coverageConfig.startAngle = 0;
      currentGroup.coverageConfig.endAngle = 360;
    }

    currentGroup.coverageConfig.isInitialized = true;
    if (currentGroup.createOrUpdateCoverageArea) currentGroup.createOrUpdateCoverageArea();

    // Update the slider to match the calculated angle
    const angleSlider = document.getElementById("camera-angle-slider");
    const angleInput = document.getElementById("camera-angle-input");
    if (angleSlider && angleInput) {
      angleSlider.value = calculatedAngle;
      angleInput.textContent = calculatedAngle + "°";
      if (typeof window.updateSliderTrack === "function") {
        window.updateSliderTrack(angleSlider, calculatedAngle, 1, 360);
      }
    }
  };

  // Handles changes to focal length input
  if (deviceFocalLengthInput) {
    deviceFocalLengthInput.addEventListener("input", (e) => {
      if (!currentGroup) return;
      currentGroup.focalLength = e.target.value;
      if (typeof window.updateDeviceCompleteIndicator === "function") {
        window.updateDeviceCompleteIndicator(currentGroup);
      }
      updateCameraCoverageFromFOV();
    });
    preventEventPropagation(deviceFocalLengthInput, ["mousedown", "keydown", "keyup"]);
  }

  // Handles changes to sensor size dropdown
  if (deviceSensorSizeInput) {
    deviceSensorSizeInput.addEventListener("change", (e) => {
      if (!currentGroup) return;
      currentGroup.sensorSize = e.target.value;
      if (typeof window.updateDeviceCompleteIndicator === "function") {
        window.updateDeviceCompleteIndicator(currentGroup);
      }
      updateCameraCoverageFromFOV();
    });
    preventEventPropagation(deviceSensorSizeInput, ["mousedown", "keydown", "keyup"]);
  }

  // Handles changes to resolution input
  if (deviceResolutionInput) {
    deviceResolutionInput.addEventListener("input", (e) => {
      if (!currentGroup) return;
      currentGroup.resolution = e.target.value;
      if (typeof window.updateDeviceCompleteIndicator === "function") {
        window.updateDeviceCompleteIndicator(currentGroup);
      }
    });
    preventEventPropagation(deviceResolutionInput, ["mousedown", "keydown", "keyup"]);
  }

  // Handles network settings like IP address, subnet, gateway, and MAC address
  const bindGroupInput = (inputEl, propName) => {
    if (!inputEl) return;
    inputEl.addEventListener("input", (e) => {
      if (!currentGroup) return;
      currentGroup[propName] = e.target.value;
      if (typeof window.updateDeviceCompleteIndicator === "function") {
        window.updateDeviceCompleteIndicator(currentGroup);
      }
    });
    preventEventPropagation(inputEl, ["mousedown", "keydown", "keyup"]);
  };

  if (deviceIpAddressInput) bindGroupInput(deviceIpAddressInput, "ipAddress");
  if (deviceSubnetInput) bindGroupInput(deviceSubnetInput, "subnetMask");
  if (deviceGatewayInput) bindGroupInput(deviceGatewayInput, "gatewayAddress");
  if (deviceMacAddressInput) bindGroupInput(deviceMacAddressInput, "macAddress");

  return {
    setCurrentGroup: (group) => {
      currentGroup = group;
    },
    updateCameraSpecPanel: (group) => {
      currentGroup = group;
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
    },
    // Clears all input fields
    clearCameraSpecPanel: () => {
      currentGroup = null;
      if (deviceFocalLengthInput) deviceFocalLengthInput.value = "";
      if (deviceSensorSizeInput) deviceSensorSizeInput.value = "1/2.0";
      if (deviceResolutionInput) deviceResolutionInput.value = "";
      if (deviceIpAddressInput) deviceIpAddressInput.value = "";
      if (deviceSubnetInput) deviceSubnetInput.value = "";
      if (deviceGatewayInput) deviceGatewayInput.value = "";
      if (deviceMacAddressInput) deviceMacAddressInput.value = "";
    }
  };
}

