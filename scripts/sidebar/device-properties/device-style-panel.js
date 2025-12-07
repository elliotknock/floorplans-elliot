import { setupColorControls, setMultipleObjectProperties, safeCanvasRender, getHexFromFill, updateSliderTrack, createSliderInputSync, CAMERA_TYPES, DEFAULT_DEVICE_ICON_SIZE, updateTextPosition, hexToRgba, createToggleHandler, setTextVisibility, createPanelBase } from "../sidebar-utils.js";
import { addCameraCoverage } from "../../devices/camera/camera-core.js";

// Sets up the device style panel for icons, colors, sizing, labels, text, and rotation
export function initDeviceStylePanel() {
  // Icon panel elements
  const colorIcons = document.querySelectorAll(".change-icon-colour .colour-icon");
  const iconColorPicker = document.getElementById("icon-color-picker");
  const iconSizeSlider = document.getElementById("icon-size-slider");
  const iconSizeInput = document.getElementById("icon-size-input");

  // Device label panel elements
  const deviceLabelInput = document.getElementById("device-label-input");
  const deviceLabelToggle = document.getElementById("device-label-toggle");
  const deviceTextColorPicker = document.getElementById("device-text-color-picker");
  const deviceTextColorIcons = document.querySelectorAll(".device-text-colour .colour-icon");
  const deviceTextBgColorPicker = document.getElementById("device-background-text-color-picker");
  const deviceTextBgColorIcons = document.querySelectorAll(".device-background-text-colour .colour-icon");
  const iconRotationSlider = document.getElementById("icon-rotation-slider");
  const iconRotationInput = document.getElementById("icon-rotation-input");

  // Create panel instance
  const panel = createPanelBase();
  panel.currentTextObject = null;

  // Finds the first object in a group that matches a condition
  panel.findInGroup = function(predicate) {
    return panel.currentGroup && typeof panel.currentGroup.getObjects === "function" ? panel.currentGroup.getObjects().find(predicate) : null;
  };

  // Keeps a value between min and max
  panel.clamp = function(value, min, max) {
    return Math.max(min, Math.min(max, value));
  };

  // Updates the color picker to match the current icon color
  panel.syncPickerFromFill = function(picker, fill, fallback = "#000000") {
    if (!picker) return;
    picker.value = fill ? getHexFromFill(fill) : fallback;
  };

  // Updates the size of a device icon
  panel.updateIconSize = function(size) {
    if (!panel.currentGroup || !panel.currentGroup.canvas || !panel.currentGroup.getObjects) return;

    const clampedSize = panel.clamp(parseInt(size) || DEFAULT_DEVICE_ICON_SIZE, 1, 100);
    const scaleFactor = clampedSize / DEFAULT_DEVICE_ICON_SIZE;
    panel.currentGroup.scaleFactor = scaleFactor;

    const imageObj = panel.findInGroup((o) => o.type === "image");
    const circleObj = panel.findInGroup((o) => o.type === "circle");

      if (imageObj && circleObj) {
        const baseCircleRadius = 20;

        setMultipleObjectProperties(imageObj, {
          scaleX: scaleFactor * (DEFAULT_DEVICE_ICON_SIZE / imageObj.width),
          scaleY: scaleFactor * (DEFAULT_DEVICE_ICON_SIZE / imageObj.height),
        });

        setMultipleObjectProperties(circleObj, {
          radius: baseCircleRadius * scaleFactor,
          scaleX: 1,
          scaleY: 1,
        });

        setMultipleObjectProperties(panel.currentGroup, {
          scaleX: 1,
          scaleY: 1,
          width: circleObj.radius * 2,
          height: circleObj.radius * 2,
        });

        if (panel.currentTextObject && !panel.currentTextObject._isHidden) {
          // Reposition and scale label font with icon size
          updateTextPosition(panel.currentGroup, panel.currentTextObject);
          setMultipleObjectProperties(panel.currentTextObject, { fontSize: 12 * scaleFactor });
        }

        if (panel.currentGroup.coverageConfig && panel.currentGroup.createOrUpdateCoverageArea) {
          panel.currentGroup.createOrUpdateCoverageArea();
        }

        panel.currentGroup.setCoords();
        safeCanvasRender(panel.currentGroup.canvas);
      }
    };

  // Updates the color of a device icon
  panel.updateIconColor = function(color) {
    if (panel.currentGroup && panel.currentGroup.canvas && typeof panel.currentGroup.getObjects === "function") {
      const isTextDevice = panel.currentGroup.deviceType === "text-device";

      if (isTextDevice) {
        // For text devices, update the shape background color
        const shapeObj = panel.findInGroup((obj) => obj.type === "rect" || obj.type === "circle");
        if (shapeObj) {
          setMultipleObjectProperties(shapeObj, { fill: color }, panel.currentGroup.canvas);
          if (panel.currentGroup.textDeviceConfig) {
            panel.currentGroup.textDeviceConfig.bgColor = color;
          }
        }
      } else {
        // For regular devices, update the circle behind the icon
        const circle = panel.currentGroup.getObjects()[0];
        if (circle && circle.type === "circle") {
          setMultipleObjectProperties(circle, { fill: color }, panel.currentGroup.canvas);
        }
      }
    }
  };

  // Safe set text and reflect background (always shown when text exists)
  panel.setLabelTextSafely = function(textObj, newText) {
    if (!textObj) return;
    textObj.set({ text: newText });
    if (!textObj._isHidden && textObj.canvas) {
      const bgColor = newText.trim() === "" ? "transparent" : textObj.backgroundColor === "transparent" ? "rgba(20, 18, 18, 0.8)" : textObj.backgroundColor;
      setMultipleObjectProperties(textObj, { text: newText, backgroundColor: bgColor }, textObj.canvas);
    }
  };

  // Updates the text color of a device label
  panel.updateDeviceTextColor = function(color) {
    if (panel.currentTextObject && panel.currentTextObject.canvas && !panel.currentTextObject._isHidden) {
      setMultipleObjectProperties(panel.currentTextObject, { fill: color }, panel.currentTextObject.canvas);
    }

    // For text devices, also update the main text (not the label)
    if (panel.currentGroup && panel.currentGroup.deviceType === "text-device" && panel.currentGroup.canvas) {
      const objects = panel.currentGroup.getObjects ? panel.currentGroup.getObjects() : [];
      const mainTextObj = objects.find((obj) => obj.type === "text" && !obj.isDeviceLabel);
      if (mainTextObj) {
        setMultipleObjectProperties(mainTextObj, { fill: color }, panel.currentGroup.canvas);
        // Store the updated config
        if (panel.currentGroup.textDeviceConfig) {
          panel.currentGroup.textDeviceConfig.textColor = color;
        }
      }
    }
  };

  // Updates the background color behind the text
  panel.updateDeviceTextBackgroundColor = function(color) {
    if (panel.currentTextObject && panel.currentTextObject.canvas && !panel.currentTextObject._isHidden) {
      const rgbaColor = hexToRgba(color, 0.8);
      setMultipleObjectProperties(panel.currentTextObject, { backgroundColor: rgbaColor }, panel.currentTextObject.canvas);
    }
  };

  // Rotates the device icon
  panel.updateIconRotation = function(rotationAngle) {
    if (!panel.currentGroup || !panel.currentGroup.canvas || typeof panel.currentGroup.getObjects !== "function") return;

    const imageObj = panel.findInGroup((o) => o.type === "image");
    const circleObj = panel.findInGroup((o) => o.type === "circle");

      if (imageObj && circleObj) {
        setMultipleObjectProperties(imageObj, { angle: rotationAngle });
        setMultipleObjectProperties(circleObj, { angle: rotationAngle });
        panel.currentGroup.setCoords();
        if (panel.currentGroup.canvas && typeof panel.currentGroup.canvas.renderAll === "function") {
          panel.currentGroup.canvas.renderAll();
        }
      }
    };

  // Setup controls
  (function setupControls() {
    // Setup icon panel controls
    createSliderInputSync(iconSizeSlider, iconSizeInput, (size) => panel.updateIconSize(size), { min: 10, max: 100, step: 1, format: (v) => v.toFixed(0) + "px" });
    setupColorControls(iconColorPicker, colorIcons, (color) => panel.updateIconColor(color));

    // Setup device label panel controls
    setupColorControls(deviceTextColorPicker, deviceTextColorIcons, (color) => panel.updateDeviceTextColor(color));
    setupColorControls(deviceTextBgColorPicker, deviceTextBgColorIcons, (color) => panel.updateDeviceTextBackgroundColor(color));
    createSliderInputSync(iconRotationSlider, iconRotationInput, (angle) => panel.updateIconRotation(angle), { min: 0, max: 360, step: 1, format: (v) => v.toFixed(0) + "°" });

    // Shows or hides the device label text
    createToggleHandler(deviceLabelToggle, (checked) => {
      if (panel.currentTextObject && panel.currentGroup && panel.currentGroup.canvas) {
        setTextVisibility(panel.currentTextObject, checked, panel.currentGroup.canvas);
        panel.currentGroup.labelHidden = !checked;
      }
    });

    // Handles clicking on camera icons to change them
    document.querySelectorAll(".change-camera-icons img").forEach((img) => {
      img.addEventListener("click", (e) => {
        e.stopPropagation();
        if (!panel.currentGroup || !panel.currentGroup.canvas) return;

        const newSrc = img.getAttribute("src");
        const imageObj = panel.findInGroup((o) => o.type === "image");
        const circleObj = panel.findInGroup((o) => o.type === "circle");

          if (imageObj && circleObj) {
            fabric.Image.fromURL(
              newSrc,
              (newImg) => {
                const scaleFactor = panel.currentGroup.scaleFactor || 1;
                const iconSize = DEFAULT_DEVICE_ICON_SIZE * scaleFactor;

                setMultipleObjectProperties(newImg, {
                  scaleX: iconSize / newImg.width,
                  scaleY: iconSize / newImg.height,
                  angle: imageObj.angle,
                  left: imageObj.left,
                  top: imageObj.top,
                  originX: imageObj.originX,
                  originY: imageObj.originY,
                });

                const index = panel.currentGroup._objects.indexOf(imageObj);
                panel.currentGroup.remove(imageObj);
                panel.currentGroup.insertAt(newImg, index, false);

                panel.currentGroup.deviceType = newImg._element.src.split("/").pop();
                const isCamera = CAMERA_TYPES.includes(panel.currentGroup.deviceType);

                // Add coverage if switching to camera, remove if switching away
                if (isCamera && !panel.currentGroup.coverageConfig) {
                  panel.currentGroup.coverageConfig = {
                    startAngle: 270,
                    endAngle: 0,
                    fillColor: "rgba(165, 155, 155, 0.3)",
                    visible: true,
                  };
                  addCameraCoverage(panel.currentGroup.canvas, panel.currentGroup);
                } else if (!isCamera && panel.currentGroup.coverageConfig) {
                  // Remove coverage area when switching away from camera
                  ["coverageArea", "leftResizeIcon", "rightResizeIcon", "rotateResizeIcon"].forEach((prop) => {
                    if (panel.currentGroup[prop]) {
                      panel.currentGroup.canvas.remove(panel.currentGroup[prop]);
                      panel.currentGroup[prop] = null;
                    }
                  });
                  panel.currentGroup.coverageConfig = null;
                }

                panel.currentGroup.setCoords();
                safeCanvasRender(panel.currentGroup.canvas);
              },
              { crossOrigin: "anonymous" }
            );
          }
        });
      });

      // Handles clicking on device icons to change them
      document.querySelectorAll(".change-device-icons img").forEach((img) => {
        img.addEventListener("click", (e) => {
          e.stopPropagation();
          if (!panel.currentGroup || !panel.currentGroup.canvas) return;

          const newSrc = img.getAttribute("src");
          const imageObj = panel.findInGroup((o) => o.type === "image");
          const circleObj = panel.findInGroup((o) => o.type === "circle");

          if (imageObj && circleObj) {
            fabric.Image.fromURL(
              newSrc,
              (newImg) => {
                const scaleFactor = panel.currentGroup.scaleFactor || 1;
                const iconSize = DEFAULT_DEVICE_ICON_SIZE * scaleFactor;

                setMultipleObjectProperties(newImg, {
                  scaleX: iconSize / newImg.width,
                  scaleY: iconSize / newImg.height,
                  angle: imageObj.angle,
                  left: imageObj.left,
                  top: imageObj.top,
                  originX: imageObj.originX,
                  originY: imageObj.originY,
                });

                const index = panel.currentGroup._objects.indexOf(imageObj);
                panel.currentGroup.remove(imageObj);
                panel.currentGroup.insertAt(newImg, index, false);

                panel.currentGroup.deviceType = newImg._element.src.split("/").pop();

                // Remove coverage if switching away from camera
                if (panel.currentGroup.coverageConfig) {
                  ["coverageArea", "leftResizeIcon", "rightResizeIcon", "rotateResizeIcon"].forEach((prop) => {
                    if (panel.currentGroup[prop]) {
                      panel.currentGroup.canvas.remove(panel.currentGroup[prop]);
                      panel.currentGroup[prop] = null;
                    }
                  });
                  panel.currentGroup.coverageConfig = null;
                }

                panel.currentGroup.setCoords();
                safeCanvasRender(panel.currentGroup.canvas);
              },
              { crossOrigin: "anonymous" }
            );
          }
        });
      });

      // Handles typing in the device label input
      if (deviceLabelInput) {
        deviceLabelInput.addEventListener("keydown", (e) => {
          if (e.key === "Backspace" || e.key === "Delete") {
            e.stopPropagation();
          }
          if (e.key === "Enter") {
            e.preventDefault();
            const start = deviceLabelInput.selectionStart;
            const end = deviceLabelInput.selectionEnd;
            const value = deviceLabelInput.value;
            deviceLabelInput.value = value.substring(0, start) + "\n" + value.substring(end);
            deviceLabelInput.selectionStart = deviceLabelInput.selectionEnd = start + 1;
            const inputEvent = new Event("input", { bubbles: true });
            deviceLabelInput.dispatchEvent(inputEvent);
          }
        });

        deviceLabelInput.addEventListener("input", (e) => {
          if (panel.currentTextObject) {
            const newText = e.target.value;

            // Check if this is a text device
            const isTextDevice = panel.currentGroup && panel.currentGroup.deviceType === "text-device";

            if (isTextDevice && panel.currentGroup) {
              // Rebuilds the entire text device group to match new text
              const rebuildTextDeviceGroup = (textValue) => {
                const canvas = panel.currentGroup.canvas;
                const config = panel.currentGroup.textDeviceConfig;
                if (!config || !canvas) return;

                const { left, top, angle, id, deviceProperties } = panel.currentGroup;
                const scaleFactor = panel.currentGroup.scaleFactor || 1;
                const labelTextObj = panel.currentGroup.textObject;

                config.text = textValue;
                canvas.remove(panel.currentGroup);

                const objects = [];
                const fontSize = 14 * scaleFactor;

                if (config.shape === "rectangle") {
                  const tempText = new fabric.Text(textValue, { fontSize, fontFamily: "Poppins, sans-serif", fontWeight: "normal" });
                  const padding = 8 * scaleFactor;
                  const width = tempText.width + padding * 2;
                  const height = tempText.height + padding * 2;
                  objects.push(new fabric.Rect({ width, height, fill: config.bgColor, rx: 4 * scaleFactor, ry: 4 * scaleFactor, originX: "center", originY: "center" }));
                } else if (config.shape === "circle") {
                  objects.push(new fabric.Circle({ radius: 20 * scaleFactor, fill: config.bgColor, originX: "center", originY: "center" }));
                }

                const textObj = new fabric.Text(textValue, { fontSize, fontFamily: "Poppins, sans-serif", fontWeight: "normal", fill: config.textColor, originX: "center", originY: "center" });
                objects.push(textObj);

                const newGroup = new fabric.Group(objects, { left, top, angle, originX: "center", originY: "center", selectable: true, hasControls: false, borderColor: "#000000", borderScaleFactor: 2, scaleFactor });
                newGroup.id = id;
                newGroup.deviceType = "text-device";
                newGroup.textDeviceConfig = config;
                newGroup.initialLabelText = textValue;
                newGroup.labelHidden = true;
                newGroup.deviceProperties = deviceProperties;
                newGroup.textObject = labelTextObj;

                if (labelTextObj) {
                  labelTextObj.set({ text: textValue });
                  labelTextObj._parentGroup = newGroup;
                }

                newGroup.on("selected", () => {
                  if (window.suppressDeviceProperties) return;
                  window.showDeviceProperties && window.showDeviceProperties("text-device", newGroup.textObject, newGroup);
                });
                newGroup.on("deselected", () => window.hideDeviceProperties && window.hideDeviceProperties());

                canvas.add(newGroup);
                newGroup.setCoords();
                canvas.setActiveObject(newGroup);
                panel.currentGroup = newGroup;
                panel.currentTextObject = newGroup.textObject;
                canvas.requestRenderAll();
              };

              rebuildTextDeviceGroup(newText);
              panel.currentTextObject.set({ text: newText });
            } else {
              // Regular devices: just update the label text
              panel.setLabelTextSafely(panel.currentTextObject, newText);
            }

            if (panel.currentGroup && typeof window.updateDeviceCompleteIndicator === "function") {
              window.updateDeviceCompleteIndicator(panel.currentGroup);
            }
          }
        });
      }
    })();

  panel.setCurrentTextObject = function(textObj) {
    panel.currentTextObject = textObj;
  };

  panel.updateIconPanel = function(group, textObject, isTextDevice) {
    panel.currentGroup = group;
    panel.currentTextObject = textObject;

      // For text devices, update controls based on the shape
      if (isTextDevice && group) {
        const objects = group.getObjects ? group.getObjects() : [];
        const shapeObj = objects.find((obj) => obj.type === "rect" || obj.type === "circle");

        if (shapeObj && iconColorPicker) panel.syncPickerFromFill(iconColorPicker, shapeObj.fill, "#000000");

        // Disable size slider for text devices
        if (iconSizeSlider) {
          iconSizeSlider.disabled = true;
          if (iconSizeInput) iconSizeInput.textContent = "N/A";
        }
      } else {
        // Re-enable controls for normal devices
        if (iconSizeSlider) {
          iconSizeSlider.disabled = false;
        }

        // Update icon color from circle
        if (panel.currentGroup && typeof panel.currentGroup.getObjects === "function") {
          const circleObj = panel.currentGroup.getObjects().find((obj) => obj.type === "circle");
          if (circleObj && iconColorPicker) panel.syncPickerFromFill(iconColorPicker, circleObj.fill, "#000000");
        }

        if (group && typeof group.getObjects === "function" && !isTextDevice) {
          if (iconSizeSlider && iconSizeInput && group.scaleFactor !== undefined) {
            const currentSize = Math.max(1, Math.min(100, Math.round(group.scaleFactor * DEFAULT_DEVICE_ICON_SIZE)));
            iconSizeSlider.value = currentSize;
            iconSizeInput.textContent = currentSize.toFixed(0) + "px";
            updateSliderTrack(iconSizeSlider, currentSize, 1, 100);
          } else if (iconSizeSlider && iconSizeInput) {
            const circleObj = group.getObjects().find((obj) => obj.type === "circle");
            if (circleObj) {
              const currentSize = Math.max(1, Math.min(100, Math.round((circleObj.radius / 20) * DEFAULT_DEVICE_ICON_SIZE)));
              iconSizeSlider.value = currentSize;
              iconSizeInput.textContent = currentSize.toFixed(0) + "px";
              updateSliderTrack(iconSizeSlider, currentSize, 1, 100);
            } else {
              const defaultSize = Math.max(1, Math.min(100, window.defaultDeviceIconSize || DEFAULT_DEVICE_ICON_SIZE));
              iconSizeSlider.value = defaultSize;
              iconSizeInput.textContent = defaultSize.toFixed(0) + "px";
              updateSliderTrack(iconSizeSlider, defaultSize, 1, 100);
            }
          }
        }
      }
    };

  panel.updateDeviceLabelPanel = function(textObject, group, isTextDevice) {
    panel.currentTextObject = textObject;
    panel.currentGroup = group;

      if (textObject && deviceLabelInput) {
        // For text devices, use the device text itself as the label
        if (isTextDevice && group && group.textDeviceConfig) {
          deviceLabelInput.value = group.textDeviceConfig.text;
        } else {
          deviceLabelInput.value = textObject.text;
        }

        if (deviceLabelToggle) {
          const isVisible = !textObject._isHidden;
          deviceLabelToggle.checked = isVisible;
        }

        if (deviceTextColorPicker && textObject.fill && !textObject._isHidden) deviceTextColorPicker.value = getHexFromFill(textObject.fill);
        if (deviceTextBgColorPicker && textObject.backgroundColor && !textObject._isHidden) deviceTextBgColorPicker.value = getHexFromFill(textObject.backgroundColor) || "#141212";
        else if (deviceTextBgColorPicker) deviceTextBgColorPicker.value = "#141212";

        // If label is hidden, make sure it stays off the canvas
        if (textObject._isHidden && textObject.canvas && textObject.canvas.getObjects().includes(textObject)) {
          try {
            textObject.canvas.remove(textObject);
          } catch (e) {}
        }
      } else {
        if (deviceLabelInput) deviceLabelInput.value = "";
        if (deviceLabelToggle) {
          deviceLabelToggle.checked = true;
        }
        panel.currentTextObject = null;
      }

      // For text devices, update controls based on the text device itself
      if (isTextDevice && group) {
        const objects = group.getObjects ? group.getObjects() : [];
        const shapeObj = objects.find((obj) => obj.type === "rect" || obj.type === "circle");
        const textObj = objects.find((obj) => obj.type === "text" && !obj.isDeviceLabel);

        // Update text color to match the main text in the text device
        if (textObj && deviceTextColorPicker) panel.syncPickerFromFill(deviceTextColorPicker, textObj.fill, "#ffffff");

        // Disable rotation for text devices
        if (iconRotationSlider) {
          iconRotationSlider.disabled = true;
          iconRotationSlider.value = 0;
          if (iconRotationInput) iconRotationInput.textContent = "0°";
        }
      } else {
        // Re-enable controls for normal devices
        if (iconRotationSlider) {
          iconRotationSlider.disabled = false;
        }

        if (group && typeof group.getObjects === "function") {
          const imageObj = group.getObjects().find((obj) => obj.type === "image");
          if (imageObj && iconRotationSlider && iconRotationInput) {
            const currentAngle = imageObj.angle || 0;
            iconRotationSlider.value = currentAngle;
            iconRotationInput.textContent = currentAngle.toFixed(0) + "°";
            updateSliderTrack(iconRotationSlider, currentAngle, 0, 360);
          }
        }
      }
    };

  panel.clearDeviceLabelPanel = function() {
    panel.currentTextObject = null;
    panel.currentGroup = null;
  };

  // Return object with same interface as before for backward compatibility
  return {
    setCurrentGroup: (group) => panel.setCurrentGroup(group),
    setCurrentTextObject: (textObj) => panel.setCurrentTextObject(textObj),
    updateIconPanel: (group, textObject, isTextDevice) => panel.updateIconPanel(group, textObject, isTextDevice),
    updateDeviceLabelPanel: (textObject, group, isTextDevice) => panel.updateDeviceLabelPanel(textObject, group, isTextDevice),
    clearDeviceLabelPanel: () => panel.clearDeviceLabelPanel(),
  };
}
