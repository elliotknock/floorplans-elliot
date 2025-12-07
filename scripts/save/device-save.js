import { addCameraCoverage } from "../devices/camera/camera-core.js";
import { attachLabelBehavior, getDefaultLabelOffset } from "../devices/device-label-utils.js";

// List of all camera types supported
const CAMERA_TYPES = ["fixed-camera.png", "box-camera.png", "dome-camera.png", "ptz-camera.png", "bullet-camera.png", "thermal-camera.png"];
// Maps camera type names to their image file paths
const IMAGE_MAP = Object.fromEntries(CAMERA_TYPES.map((type) => [type, `./images/devices/${type}`]));

class CameraDeviceSerializer {
  constructor(fabricCanvas) {
    this.fabricCanvas = fabricCanvas;
  }

  // Checks if a device type is a camera
  isCameraDevice = (deviceType) => CAMERA_TYPES.includes(deviceType);
  // Checks if an object is a device
  isDevice = (obj) => obj.type === "group" && obj.deviceType;

  // Converts all devices on canvas into a saveable format
  serializeCameraDevices() {
    const devices = this.fabricCanvas
      .getObjects()
      .filter(this.isDevice)
      .map((group) => this.serializeDevice(group))
      .filter(Boolean);

    return {
      cameraDevices: devices,
      counters: {
        cameraCounter: window.cameraCounter || 1,
        deviceCounter: window.deviceCounter || 1,
      },
      canvasSettings: {
        pixelsPerMeter: this.fabricCanvas.pixelsPerMeter || 17.5,
        zoom: this.fabricCanvas.getZoom(),
        viewportTransform: [...this.fabricCanvas.viewportTransform],
      },
    };
  }

  // Saves one device's data to a JSON format
  serializeDevice(group) {
    try {
      const groupCenter = group.getCenterPoint();
      const isCamera = this.isCameraDevice(group.deviceType);
      // Find the image and circle parts of the device
      const [imageObj, circleObj] = [group.getObjects().find((obj) => obj.type === "image"), group.getObjects().find((obj) => obj.type === "circle")];

      const deviceData = {
        id: group.id || `device_${Date.now()}_${Math.random()}`,
        deviceType: group.deviceType,
        isCamera: isCamera || !!group.coverageConfig,
        position: {
          left: group.left,
          top: group.top,
          centerX: groupCenter.x,
          centerY: groupCenter.y,
        },
        transform: {
          scaleX: group.scaleX || 1,
          scaleY: group.scaleY || 1,
          angle: group.angle || 0,
          originX: group.originX || "center",
          originY: group.originY || "center",
        },
        scaleFactor: group.scaleFactor || 1,
        deviceProperties: {
          mountedPosition: group.mountedPosition || "",
          location: group.location || "",
          partNumber: group.partNumber || "",
          stockNumber: group.stockNumber || "",
          ipAddress: group.ipAddress || "",
          subnetMask: group.subnetMask || "",
          gatewayAddress: group.gatewayAddress || "",
          macAddress: group.macAddress || "",
          focalLength: group.focalLength || "",
          sensorSize: group.sensorSize || "",
          resolution: group.resolution || "",
          // Check if label is hidden by checking group or text object
          labelHidden: group.labelHidden !== undefined ? !!group.labelHidden : group.textObject ? !!group.textObject._isHidden : false,
        },
        individualObjects: {
          image: imageObj
            ? {
                scaleX: imageObj.scaleX,
                scaleY: imageObj.scaleY,
                angle: imageObj.angle || 0,
                width: imageObj.width,
                height: imageObj.height,
              }
            : null,
          circle: circleObj
            ? {
                scaleX: circleObj.scaleX,
                scaleY: circleObj.scaleY,
                angle: circleObj.angle || 0,
                radius: circleObj.radius,
                fill: circleObj.fill,
              }
            : null,
        },
        textLabel: null,
        coverageConfig: null,
        textDeviceConfig: null,
        visual: {
          borderColor: group.borderColor || "#000000",
          borderScaleFactor: group.borderScaleFactor || 2,
          selectable: group.selectable !== false,
          hasControls: group.hasControls || false,
          hoverCursor: group.hoverCursor || (isCamera ? "move" : "default"),
        },
      };

      if (group.deviceType === "text-device" && group.textDeviceConfig) {
        deviceData.textDeviceConfig = {
          text: group.textDeviceConfig.text,
          shape: group.textDeviceConfig.shape,
          bgColor: group.textDeviceConfig.bgColor,
          textColor: group.textDeviceConfig.textColor,
        };
        const objects = group.getObjects ? group.getObjects() : [];
        const shapeObj = objects.find((obj) => obj.type === "rect" || obj.type === "circle");
        const textObj = objects.find((obj) => obj.type === "text" && !obj.isDeviceLabel);
        if (shapeObj) {
          deviceData.textDeviceConfig.shapeData = {
            type: shapeObj.type,
            fill: shapeObj.fill,
            width: shapeObj.width,
            height: shapeObj.height,
            radius: shapeObj.radius,
            rx: shapeObj.rx,
            ry: shapeObj.ry,
          };
        }
        if (textObj) {
          deviceData.textDeviceConfig.textData = {
            text: textObj.text,
            fontSize: textObj.fontSize,
            fontFamily: textObj.fontFamily,
            fontWeight: textObj.fontWeight,
            fill: textObj.fill,
          };
        }
      }

      // Save custom uploaded images
      if (imageObj && imageObj._element && imageObj._element.src.startsWith("data:")) {
        deviceData.customImageSrc = imageObj._element.src;
      }

      if (group.textObject && group.deviceType !== "text-device") {
        const isTextVisible = !group.textObject._isHidden && group.textObject.visible !== false && (!group.textObject.canvas || group.textObject.canvas.getObjects().includes(group.textObject));
        const scaleFactor = group.scaleFactor || 1;
        const defaultOffset = getDefaultLabelOffset(group);
        const labelOffset = group.labelOffset
          ? {
              x: Number.isFinite(group.labelOffset.x) ? group.labelOffset.x : 0,
              y: Number.isFinite(group.labelOffset.y) ? group.labelOffset.y : defaultOffset.y,
            }
          : null;
        deviceData.textLabel = {
          text: group.textObject.text || "",
          position: { left: group.textObject.left, top: group.textObject.top },
          style: {
            fontFamily: group.textObject.fontFamily || "Poppins, sans-serif",
            fontSize: group.textObject.fontSize || 12,
            fontWeight: group.textObject.fontWeight || "normal",
            fill: group.textObject.fill || "#FFFFFF",
            backgroundColor: group.textObject.backgroundColor || "rgba(20, 18, 18, 0.8)",
            originX: group.textObject.originX || "center",
            originY: group.textObject.originY || "top",
          },
          properties: {
            selectable: group.textObject.selectable || false,
            isDeviceLabel: group.textObject.isDeviceLabel || true,
            visible: isTextVisible,
            _isHidden: group.textObject._isHidden || false,
          },
          scaleRelation: { baseFontSize: 12, currentScaleFactor: scaleFactor },
          offset: labelOffset,
          hasCustomOffset: !!group.hasCustomLabelOffset,
        };
      }

      if (group.coverageConfig) {
        // Calculate base opacity, accounting for layer opacity
        let baseOpacity = 0.3;
        if (group.coverageConfig.opacity !== undefined) {
          baseOpacity = group.coverageConfig.opacity;
        } else if (group.coverageArea && group.coverageArea.fill) {
          const rgbaMatch = group.coverageArea.fill.match(/rgba?\(\d+,\s*\d+,\s*\d+,\s*([\d.]+)\)/);
          if (rgbaMatch) {
            const layers = window.layers || { devices: { opacity: 1 } };
            const deviceLayerOpacity = layers.devices ? layers.devices.opacity : 1;
            baseOpacity = parseFloat(rgbaMatch[1]) / deviceLayerOpacity;
          }
        }
        deviceData.coverageConfig = {
          startAngle: group.coverageConfig.startAngle || 270,
          endAngle: group.coverageConfig.endAngle || 0,
          radius: group.coverageConfig.radius || 175,
          fillColor: group.coverageConfig.fillColor || "rgba(165, 155, 155, 0.3)",
          visible: group.coverageConfig.visible !== false,
          isInitialized: group.coverageConfig.isInitialized || true,
          opacity: baseOpacity,
          baseColor: group.coverageConfig.baseColor || null,
          edgeStyle: group.coverageConfig.edgeStyle || "solid",
          projectionMode: group.coverageConfig.projectionMode || "circular",
          aspectRatioMode: group.coverageConfig.aspectRatioMode || false,
          cameraHeight: group.coverageConfig.cameraHeight,
          cameraTilt: group.coverageConfig.cameraTilt,
          sideFOV: group.coverageConfig.sideFOV,
          verticalFOV: group.coverageConfig.verticalFOV,
          minRange: group.coverageConfig.minRange,
          maxRange: group.coverageConfig.maxRange,
          calculatedAngle: group.coverageConfig.calculatedAngle,
        };
      }

      if (circleObj) deviceData.circleColor = circleObj.fill || "#f8794b";
      return deviceData;
    } catch (error) {
      console.error("Error serializing device:", error);
      return null;
    }
  }

  // Loads saved devices back onto the canvas
  async loadCameraDevices(serializedData) {
    try {
      Object.assign(window, serializedData.counters || {});
      // Restore canvas settings like zoom level
      if (serializedData.canvasSettings) {
        const { pixelsPerMeter, zoom, viewportTransform } = serializedData.canvasSettings;
        this.fabricCanvas.pixelsPerMeter = pixelsPerMeter || 17.5;
        if (zoom) this.fabricCanvas.setZoom(zoom);
        if (viewportTransform) this.fabricCanvas.setViewportTransform(viewportTransform);
      }
      if (serializedData.cameraDevices?.length) {
        for (let i = 0; i < serializedData.cameraDevices.length; i++) {
          try {
            await this.loadCameraDevice(serializedData.cameraDevices[i], true);
            // Add small delay between loading devices to prevent overload
            if (i < serializedData.cameraDevices.length - 1) await new Promise((resolve) => setTimeout(resolve, 50));
          } catch (error) {
            console.error(`Failed to load device ${i + 1}:`, error);
          }
        }
        this.fabricCanvas.requestRenderAll();
      }
      return true;
    } catch (error) {
      console.error("Error loading devices:", error);
      return false;
    }
  }

  // Loads one device from saved data
  async loadCameraDevice(deviceData, skipSelection = false) {
    return new Promise((resolve, reject) => {
      try {
        // Skip if device already exists at this position
        const duplicate = this.fabricCanvas.getObjects().find((obj) => this.isDevice(obj) && obj.deviceType === deviceData.deviceType && Math.abs(obj.left - deviceData.position.left) < 1 && Math.abs(obj.top - deviceData.position.top) < 1);
        if (duplicate) return resolve(duplicate);

        if (deviceData.deviceType === "text-device" && deviceData.textDeviceConfig) {
          const config = deviceData.textDeviceConfig;
          const objects = [];
          if (config.shape === "rectangle" && config.shapeData) {
            const rect = new fabric.Rect({
              width: config.shapeData.width || 60,
              height: config.shapeData.height || 30,
              fill: config.shapeData.fill || config.bgColor,
              rx: config.shapeData.rx || 5,
              ry: config.shapeData.ry || 5,
              originX: "center",
              originY: "center",
            });
            objects.push(rect);
          } else if (config.shape === "circle" && config.shapeData) {
            const circle = new fabric.Circle({
              radius: config.shapeData.radius || 20,
              fill: config.shapeData.fill || config.bgColor,
              originX: "center",
              originY: "center",
            });
            objects.push(circle);
          }
          if (config.textData) {
            const text = new fabric.Text(config.textData.text || config.text, {
              fontSize: config.textData.fontSize || 16,
              fontFamily: config.textData.fontFamily || "Arial",
              fontWeight: config.textData.fontWeight || "normal",
              fill: config.textData.fill || config.textColor,
              originX: "center",
              originY: "center",
            });
            objects.push(text);
          }
          const group = new fabric.Group(objects, {
            ...deviceData.position,
            ...deviceData.transform,
            ...deviceData.visual,
          });
          group.deviceType = "text-device";
          group.id = deviceData.id || `device_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          group.textDeviceConfig = config;
          group.initialLabelText = config.text;
          group.scaleFactor = deviceData.scaleFactor || 1;
          group.labelHidden = true;
          group.deviceProperties = { ...(deviceData.deviceProperties || {}), labelHidden: true };
          const labelText = new fabric.Text(config.text, {
            left: group.left,
            top: group.top + 30,
            fontFamily: window.globalFont || "Poppins, sans-serif",
            fontSize: 12,
            fontWeight: window.globalBoldText ? "bold" : "normal",
            fill: window.globalTextColor || "#FFFFFF",
            selectable: false,
            backgroundColor: window.globalTextBackground !== false ? "rgba(20, 18, 18, 0.8)" : "transparent",
            originX: "center",
            originY: "top",
            isDeviceLabel: true,
            visible: false,
            _isHidden: true,
          });
          labelText._parentGroup = group;
          group.textObject = labelText;
          group.on("selected", () => {
            if (window.suppressDeviceProperties) return;
            if (window.showDeviceProperties) window.showDeviceProperties("text-device", labelText, group);
          });
          group.on("deselected", () => {
            if (window.hideDeviceProperties) window.hideDeviceProperties();
          });
          this.fabricCanvas.add(group);
          group.setCoords();
          if (!skipSelection) this.fabricCanvas.setActiveObject(group);
          this.fabricCanvas.requestRenderAll();
          return resolve(group);
        }

        let imgSrc = IMAGE_MAP[deviceData.deviceType] || `./images/devices/${deviceData.deviceType}`;
        if (deviceData.customImageSrc) imgSrc = deviceData.customImageSrc;

        fabric.Image.fromURL(
          imgSrc,
          (img) => {
            try {
              if (!img) throw new Error(`Failed to load image: ${imgSrc}`);
              const defaultIconSize = window.defaultDeviceIconSize || 30;
              const scaleFactor = defaultIconSize / 30;
              const savedImageData = deviceData.individualObjects?.image;
              if (savedImageData) {
                img.set({
                  ...savedImageData,
                  originX: "center",
                  originY: "center",
                  deviceType: deviceData.deviceType,
                });
              } else {
                img.set({
                  scaleX: scaleFactor * (defaultIconSize / img.width),
                  scaleY: scaleFactor * (defaultIconSize / img.height),
                  angle: deviceData.transform.angle || 0,
                  originX: "center",
                  originY: "center",
                  deviceType: deviceData.deviceType,
                });
              }
              const savedCircleData = deviceData.individualObjects?.circle;
              const circleRadius = savedCircleData?.radius || 20;
              const circle = new fabric.Circle({
                radius: circleRadius,
                fill: savedCircleData?.fill || deviceData.circleColor || "#f8794b",
                originX: "center",
                originY: "center",
                scaleX: savedCircleData?.scaleX || scaleFactor,
                scaleY: savedCircleData?.scaleY || scaleFactor,
                angle: savedCircleData?.angle || 0,
              });
              // Normalize circle scaleX/scaleY before setting group dimensions
              const finalCircleRadius = circleRadius * (savedCircleData?.scaleX || scaleFactor);
              const group = new fabric.Group([circle, img], {
                ...deviceData.position,
                ...deviceData.transform,
                ...deviceData.visual,
                scaleFactor: deviceData.scaleFactor || scaleFactor,
                // Set group dimensions based on circle radius to fix select box gap
                width: finalCircleRadius * 2,
                height: finalCircleRadius * 2,
                scaleX: 1,
                scaleY: 1,
              });
              // Ensure circle scaleX/scaleY are normalized after group creation
              circle.set({
                scaleX: 1,
                scaleY: 1,
                radius: finalCircleRadius,
              });
              group.deviceType = deviceData.deviceType;
              group.id = deviceData.id || group.id || `device_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
              if (deviceData.customImageSrc) group.hasCustomIcon = true;
              Object.assign(group, deviceData.deviceProperties || {});
              // Ensure group coordinates are recalculated after setting dimensions
              group.setCoords();
              if (group.textObject && group.deviceProperties && typeof group.deviceProperties.labelHidden === "boolean") {
                const hidden = !!group.deviceProperties.labelHidden;
                group.labelHidden = hidden;
                group.textObject._isHidden = hidden;
                group.textObject.visible = !hidden;
                if (hidden) {
                  try {
                    this.fabricCanvas.remove(group.textObject);
                  } catch (e) {}
                }
              }
              if (deviceData.coverageConfig) {
                group.coverageConfig = {
                  ...deviceData.coverageConfig,
                  opacity: deviceData.coverageConfig.opacity || 0.3,
                };
                delete group.coverageConfig.currentCoverage;
                if (!group.coverageConfig.baseColor && group.coverageConfig.fillColor) {
                  const match = group.coverageConfig.fillColor.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
                  if (match) {
                    const [, r, g, b] = match;
                    group.coverageConfig.baseColor = `rgb(${r}, ${g}, ${b})`;
                  }
                }
              }
              this.fabricCanvas.add(group);
              if (deviceData.textLabel) this.createTextLabel(group, deviceData.textLabel, group.scaleFactor || scaleFactor);
              if (!skipSelection) this.addDeviceEventHandlers(group);
              else group._deferEventHandlers = true;
              if (deviceData.coverageConfig) this.addCameraCoverageDelayed(group, deviceData.coverageConfig);
              group.bringToFront();
              if (group.textObject && !group.textObject._isHidden) group.textObject.bringToFront();
              if (!skipSelection) this.fabricCanvas.setActiveObject(group);
              setTimeout(() => {
                if (typeof window.updateDeviceCompleteIndicator === "function") window.updateDeviceCompleteIndicator(group);
              }, 100);
              resolve(group);
            } catch (error) {
              reject(error);
            }
          },
          { crossOrigin: "anonymous" }
        );
      } catch (error) {
        reject(error);
      }
    });
  }

  // Creates the text label for a device
  createTextLabel(group, textData, scaleFactor) {
    // Adjust font size based on zoom level
    let fontSize = textData.style.fontSize;
    if (textData.scaleRelation) {
      const baseFontSize = textData.scaleRelation.baseFontSize || 12;
      fontSize = baseFontSize * scaleFactor;
    } else {
      const expectedScaledSize = 12 * scaleFactor;
      fontSize = Math.abs(fontSize - expectedScaledSize) > 1 ? fontSize : expectedScaledSize;
    }
    const groupCenter = group.getCenterPoint();
    const defaultTop = groupCenter.y + 20 * scaleFactor + 10;
    const initialLeft = typeof textData.position?.left === "number" ? textData.position.left : groupCenter.x;
    const initialTop = typeof textData.position?.top === "number" ? textData.position.top : defaultTop;

    const text = new fabric.Text(textData.text, {
      left: initialLeft,
      top: initialTop,
      ...textData.style,
      fontSize,
      ...textData.properties,
      visible: true,
    });
    const shouldBeVisible = textData.properties.visible !== false;
    const wasHidden = textData.properties._isHidden === true;
    const isTextDevice = group.deviceType === "text-device";
    text._isHidden = wasHidden || !shouldBeVisible;
    group.textObject = text;

    const defaultOffset = getDefaultLabelOffset(group);
    if (textData.offset && typeof textData.offset.y === "number") {
      group.labelOffset = {
        x: Number.isFinite(textData.offset.x) ? textData.offset.x : 0,
        y: Number.isFinite(textData.offset.y) ? textData.offset.y : defaultOffset.y,
      };
      group.hasCustomLabelOffset = !!textData.hasCustomOffset;
    } else if (typeof textData.position?.left === "number" && typeof textData.position?.top === "number") {
      group.labelOffset = {
        x: textData.position.left - groupCenter.x,
        y: textData.position.top - groupCenter.y,
      };
      const threshold = 1;
      group.hasCustomLabelOffset = Math.abs(group.labelOffset.x) > threshold || Math.abs(group.labelOffset.y - defaultOffset.y) > threshold;
    } else {
      group.labelOffset = { ...defaultOffset };
      group.hasCustomLabelOffset = false;
    }
    if (isTextDevice) {
      text._isHidden = true;
      text.visible = false;
      group.labelHidden = true;
    } else if (shouldBeVisible) {
      this.fabricCanvas.add(text);
      text._isHidden = false;
      text.bringToFront();
    } else {
      text._isHidden = true;
      text.visible = false;
    }
    this.bindTextToGroup(group, text);
    if (!isTextDevice) {
      setTimeout(() => {
        if (window.initCanvasLayers && shouldBeVisible && this.fabricCanvas.getObjects().includes(text)) {
          this.fabricCanvas.fire("object:added", { target: text });
        }
        this.fabricCanvas.renderAll();
      }, 20);
    }
  }

  // Adds camera coverage area with a short delay
  addCameraCoverageDelayed(group, coverageConfig) {
    if (group.coverageArea && this.fabricCanvas.getObjects().includes(group.coverageArea)) return;
    setTimeout(() => {
      if (group.coverageArea && this.fabricCanvas.getObjects().includes(group.coverageArea)) return;
      // Clean up any old coverage areas left behind
      const allObjects = this.fabricCanvas.getObjects();
      const orphanedCoverage = allObjects.filter((obj) => (obj.isCoverage || obj.isResizeIcon === true) && !obj.parentGroup);
      orphanedCoverage.forEach((obj) => {
        this.fabricCanvas.remove(obj);
      });
      const addCoverage = window.addCameraCoverage || addCameraCoverage;
      if (addCoverage) addCoverage(this.fabricCanvas, group);
      // Retry to restore coverage visibility if not ready yet
      const restoreCoverageVisibility = (attempts = 0) => {
        if (attempts > 10) return;
        if (group.coverageArea && this.fabricCanvas.getObjects().includes(group.coverageArea)) {
          const shouldBeVisible = coverageConfig.visible !== false;
          group.coverageConfig.visible = shouldBeVisible;
          group.coverageArea.visible = shouldBeVisible;
          group.coverageArea.set({ visible: shouldBeVisible });
          if (coverageConfig.opacity !== undefined && group.coverageArea.fill) {
            const layers = window.layers || { devices: { opacity: 1 } };
            const deviceLayerOpacity = layers.devices ? layers.devices.opacity : 1;
            const finalOpacity = coverageConfig.opacity * deviceLayerOpacity;
            const rgbMatch = group.coverageArea.fill.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
            if (rgbMatch) {
              const [, r, g, b] = rgbMatch;
              const newFill = `rgba(${r}, ${g}, ${b}, ${finalOpacity})`;
              group.coverageArea.set({ fill: newFill });
              group.coverageConfig.fillColor = newFill;
            }
          }
          ["leftResizeIcon", "rightResizeIcon", "rotateResizeIcon"].forEach((iconName) => {
            if (group[iconName] && this.fabricCanvas.getObjects().includes(group[iconName])) {
              group[iconName].visible = false;
              group[iconName].set({ visible: false });
              group[iconName].parentGroup = group;
            }
          });
          if (group.coverageArea) group.coverageArea.parentGroup = group;
          this.fabricCanvas.renderAll();
          if (!shouldBeVisible) {
            setTimeout(() => {
              if (group.coverageArea && this.fabricCanvas.getObjects().includes(group.coverageArea)) {
                group.coverageArea.visible = false;
                group.coverageArea.set({ visible: false });
                this.fabricCanvas.renderAll();
              }
            }, 50);
          }
        } else {
          setTimeout(() => restoreCoverageVisibility(attempts + 1), 100);
        }
      };
      setTimeout(() => restoreCoverageVisibility(), 100);
    }, 10);
  }

  // Links text label to move with the device
  bindTextToGroup(group, text) {
    attachLabelBehavior(group, text, this.fabricCanvas);
  }

  // Sets up click handlers for device selection
  addDeviceEventHandlers(group) {
    if (group._deviceSelectedHandler) group.off("selected", group._deviceSelectedHandler);
    if (group._deviceDeselectedHandler) group.off("deselected", group._deviceDeselectedHandler);
    group._deviceSelectedHandler = () => {
      if (window.suppressDeviceProperties) return;
      if (window.showDeviceProperties) window.showDeviceProperties(group.deviceType, group.textObject, group);
      group.bringToFront();
      if (group.textObject && !group.textObject._isHidden) group.textObject.bringToFront();
      this.fabricCanvas.renderAll();
    };
    group._deviceDeselectedHandler = () => {
      if (window.hideDeviceProperties) window.hideDeviceProperties();
    };
    group.on("selected", group._deviceSelectedHandler);
    group.on("deselected", group._deviceDeselectedHandler);
    group.on("removed", () => {
      ["textObject", "coverageArea", "leftResizeIcon", "rightResizeIcon", "rotateResizeIcon"].forEach((prop) => {
        if (group[prop]) this.fabricCanvas.remove(group[prop]);
      });
      this.fabricCanvas.renderAll();
    });
  }

  // Saves all devices to browser storage
  saveToLocalStorage(key = "cameraDevicesData") {
    try {
      const data = this.serializeCameraDevices();
      localStorage.setItem(key, JSON.stringify(data, null, 2));
      return true;
    } catch (error) {
      console.error("Error saving to localStorage:", error);
      return false;
    }
  }

  // Loads all devices from browser storage
  async loadFromLocalStorage(key = "cameraDevicesData") {
    try {
      const jsonString = localStorage.getItem(key);
      if (!jsonString) return false;
      return await this.loadCameraDevices(JSON.parse(jsonString));
    } catch (error) {
      console.error("Error loading from localStorage:", error);
      return false;
    }
  }

  // Downloads devices as a JSON file
  exportAsFile(filename = "camera_devices_export.json") {
    try {
      const data = this.serializeCameraDevices();
      // Create download link
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement("a"), { href: url, download: filename });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return true;
    } catch (error) {
      console.error("Error exporting camera devices:", error);
      return false;
    }
  }

  // Loads devices from an uploaded JSON file
  async importFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = JSON.parse(e.target.result);
          const success = await this.loadCameraDevices(data);
          success ? resolve(true) : reject(new Error("Failed to load camera devices"));
        } catch (error) {
          reject(error);
        }
      };
      reader.onerror = () => reject(new Error("Error reading file"));
      reader.readAsText(file);
    });
  }
}

export { CameraDeviceSerializer };
