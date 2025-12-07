import { applyLabelPosition } from "../devices/device-label-utils.js";

// Updates the visual appearance of a slider track based on its value
export function updateSliderTrack(slider, value, min, max) {
  const percentage = ((value - min) / (max - min)) * 100;
  slider.style.background = `linear-gradient(to right, var(--orange-ip2, #f8794b) ${percentage}%, #e9ecef ${percentage}%)`;
}

// Prevents event propagation for specified events on an element
export function preventEventPropagation(element, events = ["click", "keydown"]) {
  events.forEach((eventType) => {
    element.addEventListener(eventType, (e) => {
      e.stopPropagation();
      // For keydown events, allow default behavior for input fields
      // This ensures Backspace/Delete work normally for text editing
      if (eventType === "keydown" && (e.key === "Backspace" || e.key === "Delete")) {
        // Don't prevent default - let the browser handle text deletion
        e.stopPropagation();
      }
    });
  });
}

// Synchronizes slider and input elements, with optional callback
export function createSliderInputSync(slider, input, callback, options = {}) {
  const { min = 0, max = 100, step = 1, precision = 0, format } = options;

  if (slider) {
    slider.addEventListener("input", () => {
      const value = parseFloat(slider.value);
      if (input) {
        if (input.tagName === "INPUT") {
          // Only update input value if it's not the active element to avoid interrupting typing
          if (document.activeElement !== input) {
            input.value = precision > 0 ? value.toFixed(precision) : value;
          }
        } else {
          input.textContent = format ? format(value) : (value * 100).toFixed(0) + "%";
        }
      }
      updateSliderTrack(slider, value, slider.min || min, slider.max || max);
      if (callback) callback(value);
    });
  }

  if (input && input.tagName === "INPUT") {
    // Prevent backspace/delete from propagating to canvas (which would delete devices)
    input.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" || e.key === "Delete") {
        e.stopPropagation();
      }
    });

    // Handle input event for real-time updates without clamping/formatting immediately
    input.addEventListener("input", () => {
      let value = parseFloat(input.value);

      // If value is valid number, update slider and callback
      if (!isNaN(value)) {
        // Clamp for slider visual only, but let user type freely
        let sliderValue = value;
        if (sliderValue < min) sliderValue = min;
        if (sliderValue > max) sliderValue = max;

        if (slider) {
          slider.value = sliderValue;
          updateSliderTrack(slider, sliderValue, slider.min || min, slider.max || max);
        }

        let callbackValue = value;
        if (callbackValue < min) callbackValue = min;
        if (callbackValue > max) callbackValue = max;

        if (callback) callback(callbackValue);
      }
    });

    // Handle change event (blur/enter) to strictly format and clamp the input value
    input.addEventListener("change", () => {
      let value = parseFloat(input.value);
      if (isNaN(value)) value = parseFloat(slider ? slider.value : min);

      if (value < min) value = min;
      if (value > max) value = max;

      input.value = precision > 0 ? value.toFixed(precision) : value;

      if (slider) {
        slider.value = value;
        updateSliderTrack(slider, value, slider.min || min, slider.max || max);
      }
      if (callback) callback(value);
    });
  }
}

// Converts RGB values to hexadecimal color code
export function rgbToHex(r, g, b) {
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`;
}

// Converts HSL values to hexadecimal color code
export function hslToHex(h, s, l) {
  l /= 100;
  const a = (s * Math.min(l, 1 - l)) / 100;
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

// Converts hex color to RGBA format
export function hexToRgba(hex, alpha = 1) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Retrieves the color of an icon element
export function getIconColor(icon) {
  const color = icon.getAttribute("data-color") || getComputedStyle(icon).backgroundColor;
  if (color.startsWith("rgb")) {
    const rgb = color.match(/\d+/g).map(Number);
    return rgbToHex(rgb[0], rgb[1], rgb[2]);
  }
  return color;
}

// Sets up color controls for color picker and icons
export function setupColorControls(colorPicker, colorIcons, callback) {
  if (colorPicker) {
    colorPicker.addEventListener("input", (e) => {
      e.stopPropagation();
      callback(e.target.value);
    });
    colorPicker.addEventListener("click", (e) => e.stopPropagation());
  }

  colorIcons.forEach((icon) => {
    icon.addEventListener("click", (e) => {
      e.stopPropagation();
      const hexColor = getIconColor(icon);
      callback(hexColor);
      if (colorPicker) colorPicker.value = hexColor;
    });
  });
}

// Wraps a global function with a custom wrapper
export function wrapGlobalFunction(funcName, wrapper) {
  const original = window[funcName];
  if (original) {
    // Function exists, wrap it
    window[funcName] = function (...args) {
      wrapper(...args);
      if (original) original.apply(this, args);
    };
  } else {
    // Function doesn't exist yet, create a stub that will be replaced later
    window[funcName] = function (...args) {
      wrapper(...args);
      // If original gets defined later, it won't be called here, but that's okay
      // because the intercepts will handle it
    };
  }
  return original;
}

// Creates a toggle handler for checkbox elements
export function createToggleHandler(toggle, callback) {
  if (toggle) {
    toggle.addEventListener("change", () => callback(toggle.checked));
  }
}

// Validates and clamps a value within a specified range
export function validateAndClamp(value, min, max, defaultValue = min) {
  const parsed = parseFloat(value);
  if (isNaN(parsed)) return defaultValue;
  return Math.max(min, Math.min(max, parsed));
}

// Safely renders a canvas if it exists
export function safeCanvasRender(canvas) {
  if (canvas && typeof canvas.renderAll === "function") {
    canvas.renderAll();
  }
}

// Sets a single property on an object and updates canvas
export function setObjectProperty(obj, property, value, canvas = null) {
  if (obj && obj.set) {
    obj.set({ [property]: value });
    if (obj.setCoords) obj.setCoords();
    safeCanvasRender(canvas || obj.canvas);
  }
}

// Sets multiple properties on an object and updates canvas
export function setMultipleObjectProperties(obj, properties, canvas = null) {
  if (obj && obj.set) {
    obj.set(properties);
    if (obj.setCoords) obj.setCoords();
    safeCanvasRender(canvas || obj.canvas);
  }
}

// Constants
export const CAMERA_TYPES = ["bullet-camera.png", "box-camera.png", "ptz-camera.png", "dome-camera.png", "fixed-camera.png", "thermal-camera.png", "custom-camera-icon.png"];
export const DEFAULT_DEVICE_ICON_SIZE = 30;
export const DEFAULT_PIXELS_PER_METER = 17.5;

// Utility: point-in-polygon
export function isPointInPolygon(point, polygon) {
  const vertices = polygon.points;
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    if (vertices[i].y > point.y !== vertices[j].y > point.y && point.x < ((vertices[j].x - vertices[i].x) * (point.y - vertices[i].y)) / (vertices[j].y - vertices[i].y) + vertices[i].x) {
      inside = !inside;
    }
  }
  return inside;
}

// Utility: area calc from points and canvas scale
export function calculateArea(points, canvas) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y - points[j].x * points[i].y;
  }
  const pixelsPerMeter = canvas?.pixelsPerMeter || DEFAULT_PIXELS_PER_METER;
  return Math.abs(area) / (2 * pixelsPerMeter * pixelsPerMeter);
}

// Utility: color to hex
export function getHexFromFill(fill) {
  if (!fill || typeof fill !== "string") return "#ffffff";
  if (fill.startsWith("hsla")) {
    const m = fill.match(/hsla\((\d+),\s*(\d+)%,\s*(\d+)%,\s*([\d.]+)\)/);
    if (m) {
      const [, h, s, l] = m.map(Number);
      return hslToHex(h, s, l);
    }
  } else if (fill.startsWith("hsl")) {
    const m = fill.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
    if (m) {
      const [, h, s, l] = m.map(Number);
      return hslToHex(h, s, l);
    }
  } else if (fill.startsWith("rgba")) {
    const m = fill.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
    if (m) {
      const [, r, g, b] = m.map(Number);
      return rgbToHex(r, g, b);
    }
  } else if (fill.startsWith("rgb")) {
    const m = fill.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (m) {
      const [, r, g, b] = m.map(Number);
      return rgbToHex(r, g, b);
    }
  } else if (fill.startsWith("#")) {
    return fill;
  }
  return "#ffffff";
}

// === Polygon utility functions ===

// Get devices in a polygon
export function getDevicesInPolygon(polygon, fabricCanvas, isZone = true) {
  const devices = [];
  const allObjects = fabricCanvas.getObjects();
  allObjects.forEach((obj) => {
    if (obj.type === "group" && obj.deviceType) {
      const deviceCenter = obj.getCenterPoint();
      if (isPointInPolygon(deviceCenter, polygon)) {
        let info = "";
        if (isZone && window.rooms && window.rooms.length > 0) {
          const deviceInRoom = window.rooms.find((room) => room.polygon && isPointInPolygon(deviceCenter, room.polygon));
          if (deviceInRoom) {
            info = ` (in ${deviceInRoom.polygon.roomName || deviceInRoom.roomName || "Room"})`;
          }
        } else if (!isZone && window.zones && window.zones.length > 0) {
          const deviceInZone = window.zones.find((zone) => zone.polygon && isPointInPolygon(deviceCenter, zone.polygon));
          if (deviceInZone) {
            info = ` (in ${deviceInZone.polygon.zoneName || "Zone"})`;
          }
        }
        devices.push({ type: "device", name: obj.textObject ? obj.textObject.text : obj.deviceType.replace(".png", "").replace("-", " "), deviceType: obj.deviceType, object: obj, info });
      }
    } else if (["rect", "circle", "triangle"].includes(obj.type) || (obj.type === "image" && obj.isUploadedImage)) {
      const objCenter = obj.getCenterPoint();
      if (isPointInPolygon(objCenter, polygon)) {
        devices.push({ type: "object", name: obj.type === "image" ? "Uploaded Image" : obj.type.charAt(0).toUpperCase() + obj.type.slice(1), deviceType: obj.type, object: obj, info: "" });
      }
    }
  });
  return devices;
}

// Update devices list display
export function updateDevicesList(container, polygon, fabricCanvas, isZone = true) {
  if (!container || !polygon || !fabricCanvas) return;
  const devices = getDevicesInPolygon(polygon, fabricCanvas, isZone);
  if (devices.length === 0) {
    container.innerHTML = '<span class="text-muted">No devices in this ' + (isZone ? "zone" : "room") + "</span>";
  } else {
    const deviceNames = devices.map((d) => d.name + d.info);
    const deviceCountMap = {};
    deviceNames.forEach((name) => (deviceCountMap[name] = (deviceCountMap[name] || 0) + 1));
    container.innerHTML = Object.entries(deviceCountMap)
      .map(([name, count]) => `<div class="text-dark d-flex align-items-center gap-2"><span class="badge bg-orange">${count}</span><span>${name}</span></div>`)
      .join("");
  }
}

// Update polygon text (name, area, volume, notes)
export function updatePolygonText(polygon, textObject, canvas, toggles, name, notes, height, isZone = true) {
  if (!polygon || !textObject || !canvas) return;
  const area = calculateArea(polygon.points, canvas);
  const displayHeight = textObject.displayHeight || polygon.height || 2.4;
  const volume = area * displayHeight;
  const lines = [];
  if (toggles.name?.checked) lines.push(name);
  if (toggles.area?.checked) lines.push(`Area: ${area.toFixed(2)} m²`);
  if (toggles.volume?.checked) lines.push(`Volume: ${volume.toFixed(2)} m³`);
  if (toggles.notes?.checked && notes) lines.push(`Notes: ${notes}`);

  if (lines.length === 0) {
    if (canvas.getObjects().includes(textObject)) {
      try {
        canvas.remove(textObject);
      } catch (_) {}
    }
    textObject.visible = false;
    textObject._isHidden = true;
    safeCanvasRender(canvas);
    return;
  }

  if (!canvas.getObjects().includes(textObject)) {
    try {
      canvas.add(textObject);
    } catch (_) {}
  }
  textObject.visible = true;
  textObject._isHidden = false;
  setMultipleObjectProperties(textObject, { text: lines.join("\n"), visible: true }, canvas);
  try {
    textObject.bringToFront && textObject.bringToFront();
  } catch (_) {}
}

// Update polygon color
export function updatePolygonColor(polygon, textObject, color, isZone = true) {
  if (!polygon || !textObject) return;
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  if (isZone) {
    const fillColor = `rgba(${r}, ${g}, ${b}, 0.2)`;
    const strokeColor = `rgba(${r}, ${g}, ${b}, 1)`;
    setMultipleObjectProperties(polygon, { fill: fillColor, stroke: strokeColor });
    setMultipleObjectProperties(textObject, { fill: strokeColor, cursorColor: strokeColor });
  } else {
    setMultipleObjectProperties(polygon, { stroke: color });
    setMultipleObjectProperties(textObject, { fill: color, cursorColor: color });
  }
}

// Utility: warning text
export function updateWarningText(targetEl, height) {
  if (!targetEl) return;
  if (height > 2 && height <= 4) {
    targetEl.textContent = "Scaffold or Step Ladders recommended.";
  } else if (height > 4 && height <= 7) {
    targetEl.textContent = "Cherry Picker or Scissor Lift recommended.";
  } else if (height > 7) {
    targetEl.textContent = "Fall Arrest System recommended.";
  } else {
    targetEl.textContent = "";
  }
}

// Text visibility management
export function setTextVisibility(textObject, visible, canvas = null) {
  if (!textObject) return;

  const targetCanvas = canvas || textObject.canvas;
  if (!targetCanvas) return;

  // Don't manage visibility for text device labels - they should never be visible
  if (textObject.isDeviceLabel && textObject._parentGroup && textObject._parentGroup.deviceType === "text-device") {
    textObject._isHidden = true;
    textObject.visible = false;
    return;
  }

  if (visible) {
    if (!targetCanvas.getObjects().includes(textObject)) {
      targetCanvas.add(textObject);
      textObject.bringToFront();
    }
    textObject.set({ visible: true });
    textObject._isHidden = false;
  } else {
    if (targetCanvas.getObjects().includes(textObject)) {
      targetCanvas.remove(textObject);
    }
    textObject.set({ visible: false });
    textObject._isHidden = true;
  }

  targetCanvas.renderAll();
}

// Update text position only if it's visible and on canvas
export function updateTextPosition(group, textObject) {
  if (!group || !textObject || textObject._isHidden) return;

  const canvas = group.canvas || textObject.canvas;
  if (!canvas || !canvas.getObjects().includes(textObject)) return;

  applyLabelPosition(group);
}

// ============================================================================
// PANEL BASE UTILITIES - Common functionality for device property panels
// ============================================================================

// Creates a base panel object with common state management
// Returns an object with currentGroup and helper methods
export function createPanelBase() {
  const base = {
    currentGroup: null,

    // Sets the currently active device group
    setCurrentGroup(group) {
      base.currentGroup = group;
    },

    // Gets the current device group
    getCurrentGroup() {
      return base.currentGroup;
    },

    // Updates the panel UI to reflect the current device group
    // Override this in panel implementations
    updatePanel(group) {
      base.currentGroup = group;
    },

    // Clears the panel and resets state
    // Override this in panel implementations
    clearPanel() {
      base.currentGroup = null;
    },
  };

  return base;
}

// ============================================================================
// INPUT BINDING UTILITIES - Bind inputs/selects to device properties
// ============================================================================

// Binds an input element to a device property with common event handling
// This eliminates the need to duplicate input binding code across panels
export function bindInputToProperty(inputEl, propName, getCurrentGroup, options = {}) {
  if (!inputEl) return;

  const {
    onUpdate = null, // Optional callback after property is updated
    preventPropagation = true, // Whether to prevent event propagation
    events = ["keydown", "mousedown", "keyup"], // Events to prevent propagation for
  } = options;

  // Prevent backspace/delete from propagating to canvas (which would delete devices)
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Backspace" || e.key === "Delete") {
      e.stopPropagation();
    }
  });

  // Handle input changes
  inputEl.addEventListener("input", (e) => {
    const group = getCurrentGroup();
    if (!group) return;

    // Update the property
    group[propName] = e.target.value;

    // Update device complete indicator if available
    if (typeof window.updateDeviceCompleteIndicator === "function") {
      window.updateDeviceCompleteIndicator(group);
    }

    // Call optional update callback
    if (onUpdate) {
      onUpdate(group, e.target.value);
    }
  });

  // Prevent event propagation if requested
  if (preventPropagation) {
    preventEventPropagation(inputEl, events);
  }
}

// Binds a dropdown/select element to a device property
export function bindSelectToProperty(selectEl, propName, getCurrentGroup, options = {}) {
  if (!selectEl) return;

  const {
    onUpdate = null,
    transformValue = null, // Optional function to transform the value before setting
  } = options;

  selectEl.addEventListener("change", (e) => {
    const group = getCurrentGroup();
    if (!group) return;

    let value = e.target.value;

    // Apply transform if provided (e.g., convert "Select" to empty string)
    if (transformValue) {
      value = transformValue(value);
    }

    // Update the property
    group[propName] = value;

    // Update device complete indicator if available
    if (typeof window.updateDeviceCompleteIndicator === "function") {
      window.updateDeviceCompleteIndicator(group);
    }

    // Call optional update callback
    if (onUpdate) {
      onUpdate(group, value);
    }
  });

  preventEventPropagation(selectEl, ["mousedown", "keydown", "keyup"]);
}
