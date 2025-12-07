// Drag and drop device creation system
import { addCameraCoverage } from "./camera/camera-core.js";
import { attachLabelBehavior } from "./device-label-utils.js";

// Device type to image path mapping
export const DEVICE_TYPE_TO_IMAGE = {
  // CCTV devices
  "fixed-camera": "./images/devices/fixed-camera.png",
  "ptz-camera": "./images/devices/ptz-camera.png",
  "box-camera": "./images/devices/box-camera.png",
  "dome-camera": "./images/devices/dome-camera.png",
  "bullet-camera": "./images/devices/bullet-camera.png",
  "thermal-camera": "./images/devices/thermal-camera.png",

  // Access control devices
  "access-system": "./images/devices/access-system.png",
  "door-entry": "./images/devices/door-entry.png",
  gates: "./images/devices/gates.png",
  "vehicle-entry": "./images/devices/vehicle-entry.png",
  turnstiles: "./images/devices/turnstiles.png",
  "mobile-entry": "./images/devices/mobile-entry.png",
  pir: "./images/devices/pir-icon.png",
  "card-reader": "./images/devices/card-reader.png",
  lock: "./images/devices/lock-icon.png",

  // Intruder detection devices
  "intruder-alarm": "./images/devices/intruder-alarm.png",
  "panic-alarm": "./images/devices/panic-alarm.png",
  "motion-detector": "./images/devices/motion-detector.png",
  "infrared-sensors": "./images/devices/infrared-sensors.png",
  "pressure-mat": "./images/devices/pressure-mat.png",
  "glass-contact": "./images/devices/glass-contact.png",

  // Fire evacuation devices
  "fire-alarm": "./images/devices/fire-alarm.png",
  "fire-extinguisher": "./images/devices/fire-extinguisher.png",
  "fire-blanket": "./images/devices/fire-blanket.png",
  "emergency-exit": "./images/devices/emergency-exit.png",
  "assembly-point": "./images/devices/assembly-point.png",
  "emergency-telephone": "./images/devices/emergency-telephone.png",

  // Network devices
  Series: "./images/devices/Series.png",
  "panel-control": "./images/devices/panel-control.png",
  Sensor: "./images/devices/Sensor.png",
  "interface-unit": "./images/devices/interface-unit.png",
  "access-panel": "./images/devices/access-panel.png",
  "expander-connection": "./images/devices/expander-connection.png",
  dvr: "./images/devices/dvr.png",
  nvr: "./images/devices/nvr.png",
};

export function setupDeviceItemDrag() {
  // Add drag event listeners to all device items
  document.querySelectorAll(".device-item").forEach((item) => {
    item.addEventListener("dragstart", function (e) {
      const deviceType = this.dataset.device;
      const imagePath = DEVICE_TYPE_TO_IMAGE[deviceType];

      if (imagePath) {
        // Set the image path as drag data to maintain compatibility with existing drop handler
        e.dataTransfer.setData("text/plain", imagePath);
        e.dataTransfer.effectAllowed = "copy";

        // Add dragging class for visual feedback
        this.classList.add("dragging");
        document.body.classList.add("dragging");
      }
    });

    item.addEventListener("dragend", function (e) {
      // Remove dragging class
      this.classList.remove("dragging");
      document.body.classList.remove("dragging");
    });
  });
}

// Initializes drag and drop functionality for devices
export function initDragDropDevices(fabricCanvas) {
  window.cameraCounter = window.cameraCounter || 1;
  window.deviceCounter = window.deviceCounter || 1;

  // Checks if icon is a camera type
  const isCameraIcon = (imgSrc, customPayload) => {
    if (customPayload?.isCamera) return true;
    return imgSrc.includes("camera");
  };

  const canvasElement = fabricCanvas.getElement();
  const canvasContainer = canvasElement.parentElement;

  Object.assign(canvasContainer.style, {
    position: "relative",
    zIndex: "10",
  });

  canvasContainer.addEventListener("dragover", (e) => e.preventDefault());

  // Handles device drop on canvas
  canvasContainer.addEventListener("drop", (e) => {
    e.preventDefault();

    const customPayload = typeof window.__getCustomDropPayload === "function" ? window.__getCustomDropPayload(e.dataTransfer) : null;
    const imgSrc = customPayload?.dataUrl || e.dataTransfer.getData("text/plain");
    const rect = canvasElement.getBoundingClientRect();

    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;
    const vpt = fabricCanvas.viewportTransform;
    const zoom = fabricCanvas.getZoom();

    const canvasX = (clientX - vpt[4]) / zoom;
    const canvasY = (clientY - vpt[5]) / zoom;

    const isCamera = isCameraIcon(imgSrc, customPayload);
    const labelText = isCamera ? `Camera ${window.cameraCounter++}` : `Device ${window.deviceCounter++}`;

    fabric.Image.fromURL(
      imgSrc,
      (img) => {
        const defaultIconSize = Math.max(1, Math.min(100, window.defaultDeviceIconSize || 30));
        const scaleFactor = defaultIconSize / 30;

        img.set({
          scaleX: defaultIconSize / img.width,
          scaleY: defaultIconSize / img.height,
          originX: "center",
          originY: "center",
          deviceType: customPayload ? (customPayload.isCamera ? "custom-camera-icon.png" : "custom-device-icon.png") : imgSrc.split("/").pop(),
          coverageConfig: isCamera
            ? {
                startAngle: 270,
                endAngle: 0,
                fillColor: "rgba(165, 155, 155, 0.3)",
                visible: true,
                radius: 175,
                isInitialized: true,
                opacity: 0.3,
              }
            : null,
        });

        const circleRadius = 20 * scaleFactor;
        const circle = new fabric.Circle({
          radius: circleRadius,
          fill: window.globalDeviceColor || "#f8794b",
          originX: "center",
          originY: "center",
        });

        const group = new fabric.Group([circle, img], {
          left: canvasX,
          top: canvasY,
          originX: "center",
          originY: "center",
          selectable: true,
          hasControls: false,
          borderColor: "#000000",
          borderScaleFactor: 2,
          hoverCursor: isCamera ? "move" : "default",
          scaleFactor,
        });

        if (!group.id) {
          group.id = `device_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        }

        group.initialLabelText = labelText;
        group.deviceType = img.deviceType;
        group.coverageConfig = img.coverageConfig;

        // Initialize device properties
        ["location", "mountedPosition", "partNumber", "stockNumber", "ipAddress", "subnetMask", "gatewayAddress", "macAddress", "focalLength", "sensorSize", "resolution"].forEach((prop) => (group[prop] = ""));

        const fontSize = 12 * scaleFactor;
        const text = new fabric.Text(labelText, {
          left: canvasX,
          top: canvasY + circleRadius + 10,
          fontFamily: window.globalFont || "Poppins, sans-serif",
          fontSize,
          fontWeight: window.globalBoldText ? "bold" : "normal",
          fill: window.globalTextColor || "#FFFFFF",
          selectable: false,
          backgroundColor: window.globalTextBackground !== false ? "rgba(20, 18, 18, 0.8)" : "transparent",
          originX: "center",
          originY: "top",
          isDeviceLabel: true,
          visible: window.globalIconTextVisible !== false,
        });

        group.textObject = text;
        attachLabelBehavior(group, text, fabricCanvas);

        group.isFirstSelectionAfterDrop = true;
        group.on("selected", () => {
          if (window.suppressDeviceProperties) return;
          if (group.isFirstSelectionAfterDrop) {
            group.isFirstSelectionAfterDrop = false;
            return;
          }
          if (window.showDeviceProperties) {
            window.showDeviceProperties(group.deviceType, group.textObject, group);
          }
          group.bringToFront();
          if (text.visible !== false) text.bringToFront();
          fabricCanvas.renderAll();
        });

        group.on("deselected", () => window.hideDeviceProperties());

        group.on("removed", () => {
          if (text) fabricCanvas.remove(text);
          if (group.coverageArea) fabricCanvas.remove(group.coverageArea);
          if (group.leftResizeIcon) fabricCanvas.remove(group.leftResizeIcon);
          if (group.rightResizeIcon) fabricCanvas.remove(group.rightResizeIcon);
          if (group.rotateResizeIcon) fabricCanvas.remove(group.rotateResizeIcon);
          fabricCanvas.renderAll();
        });

        fabricCanvas.add(group);
        fabricCanvas.add(text);
        group.bringToFront();
        if (text.visible !== false) text.bringToFront();
        fabricCanvas.setActiveObject(group);

        if (isCamera) {
          addCameraCoverage(fabricCanvas, group);
        }

        setTimeout(() => {
          if (typeof window.updateDeviceCompleteIndicator === "function") {
            window.updateDeviceCompleteIndicator(group);
          }
        }, 100);

        fabricCanvas.renderAll();
      },
      { crossOrigin: "anonymous" }
    );
  });

  // Handles keyboard deletion
  document.addEventListener("keydown", (e) => {
    const activeElement = document.activeElement;
    const isInputFocused = activeElement && (activeElement.tagName === "INPUT" || activeElement.tagName === "TEXTAREA" || activeElement.tagName === "SELECT" || activeElement.isContentEditable);

    if (isInputFocused) return;

    if ((e.key === "Delete" || e.key === "Backspace") && fabricCanvas.getActiveObject()) {
      const activeObj = fabricCanvas.getActiveObject();
      if (activeObj.type === "group") {
        e.preventDefault();
        activeObj.fire("removed");
        fabricCanvas.remove(activeObj);
        fabricCanvas.discardActiveObject();
        window.hideDeviceProperties();
        fabricCanvas.renderAll();
      }
    }
  });
}
