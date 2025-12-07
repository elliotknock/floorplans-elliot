// Layer system for organizing canvas objects
export let layers = {
  zones: { objects: [], visible: true, opacity: 1 },
  rooms: { objects: [], visible: true, opacity: 1 },
  drawings: { objects: [], visible: true, opacity: 1 },
  devices: { objects: [], visible: true, opacity: 1 },
  custom: { objects: [], visible: true, opacity: 1 },
  background: { objects: [], visible: true, opacity: 1 },
  cctv: { objects: [], visible: true, opacity: 1 },
  intruder: { objects: [], visible: true, opacity: 1 },
  fire: { objects: [], visible: true, opacity: 1 },
  access: { objects: [], visible: true, opacity: 1 },
  networks: { objects: [], visible: true, opacity: 1 },
  networkLinks: { objects: [], visible: true, opacity: 1 },
  textDevices: { objects: [], visible: true, opacity: 1 },
};

// Maps device types to layer categories
const DEVICE_CATEGORIES = {
  cctv: ["fixed-camera.png", "box-camera.png", "dome-camera.png", "ptz-camera.png", "bullet-camera.png", "thermal-camera.png", "custom-camera-icon.png"],
  access: ["access-system.png", "door-entry.png", "gates.png", "vehicle-entry.png", "turnstiles.png", "mobile-entry.png", "pir-icon.png", "card-reader.png", "lock-icon.png"],
  intruder: ["intruder-alarm.png", "panic-alarm.png", "motion-detector.png", "infrared-sensors.png", "pressure-mat.png", "glass-contact.png"],
  fire: ["fire-alarm.png", "fire-extinguisher.png", "fire-blanket.png", "emergency-exit.png", "assembly-point.png", "emergency-telephone.png"],
  networks: ["Series.png", "panel-control.png", "Sensor.png", "interface-unit.png", "access-panel.png", "expander-connection.png", "dvr.png", "nvr.png"],
  custom: ["custom-device-icon.png", "text-device"],
};

// Layers that depend on devices layer
const SYSTEM_LAYERS = ["cctv", "intruder", "fire", "access", "networks", "networkLinks", "custom"];

// Internal state
let fabricCanvas = null;
let isInitialized = false;
let eventListeners = new Map();
let domItemsChangedHandler = null;
const perItemContainers = { zones: null, rooms: null };

// Initializes the layer system
export function initCanvasLayers(canvas) {
  fabricCanvas = canvas;

  if (isInitialized) {
    reinitializeCanvasLayers();
    return;
  }

  // Clear existing layer objects
  Object.keys(layers).forEach((layerName) => (layers[layerName].objects = []));

  setupLayerSystem();
  isInitialized = true;
}

// Rebuilds layer lists and reattaches listeners
function reinitializeCanvasLayers() {
  Object.keys(layers).forEach((layerName) => (layers[layerName].objects = []));
  removeCanvasEventListeners();
  categorizeAllObjects();
  setupLayerControls();
  setupCanvasEventListeners();
  updateLayerVisibility();
  updateLayerOpacity();
}

// Sets up the layer system
function setupLayerSystem() {
  categorizeAllObjects();
  setupLayerControls();
  setupCanvasEventListeners();
  ensurePerItemContainers();
  renderLayerItems("zones");
  renderLayerItems("rooms");
  updateLayerVisibility();
  updateLayerOpacity();
}

// Puts each object into the right layer
function categorizeAllObjects() {
  if (!fabricCanvas) return;

  fabricCanvas.getObjects().forEach((obj) => {
    if (obj.type === "image" && (obj.isBackground || (obj.selectable === false && obj.evented === false))) {
      obj.isBackground = true;
      fabricCanvas.sendToBack(obj);
    }
    categorizeObject(obj);
  });
}

// Removes event listeners
function removeCanvasEventListeners() {
  if (!fabricCanvas) return;

  eventListeners.forEach((handler, eventName) => fabricCanvas.off(eventName, handler));
  eventListeners.clear();

  if (domItemsChangedHandler) {
    document.removeEventListener("layers:items-changed", domItemsChangedHandler);
    domItemsChangedHandler = null;
  }
}

// Sets up event listeners to keep layers in sync
function setupCanvasEventListeners() {
  if (!fabricCanvas) return;

  const onObjectAdded = (e) => {
    categorizeObject(e.target);
    updateLayerVisibility();
    updateLayerOpacity();

    if (e.target?.class === "zone-polygon" || e.target?.class === "zone-text") {
      renderLayerItems("zones");
    }
    if (e.target?.class === "room-polygon" || e.target?.class === "room-text") {
      renderLayerItems("rooms");
    }
  };

  const onObjectRemoved = (e) => {
    const obj = e.target;
    Object.keys(layers).forEach((layerName) => {
      layers[layerName].objects = layers[layerName].objects.filter((item) => item !== obj);
    });

    if (obj?.class === "zone-polygon" || obj?.class === "zone-text") {
      renderLayerItems("zones");
    }
    if (obj?.class === "room-polygon" || obj?.class === "room-text") {
      renderLayerItems("rooms");
    }
  };

  const onSelectionChanged = () => {
    updateLayerVisibility();
    updateLayerOpacity();
  };

  // Add event listeners
  const events = ["object:added", "object:removed", "selection:created", "selection:updated", "selection:cleared"];
  const handlers = [onObjectAdded, onObjectRemoved, onSelectionChanged, onSelectionChanged, onSelectionChanged];

  events.forEach((event, i) => {
    fabricCanvas.on(event, handlers[i]);
    eventListeners.set(event, handlers[i]);
  });

  // DOM listener for external refresh requests
  const onItemsChanged = () => {
    renderLayerItems("zones");
    renderLayerItems("rooms");
  };
  document.addEventListener("layers:items-changed", onItemsChanged);
  domItemsChangedHandler = onItemsChanged;
}

// Get toggle and slider DOM elements for a layer
const getLayerElements = (layerName) => {
  const toggle = document.getElementById(`${layerName}-layer-toggle`);
  const slider = document.getElementById(`${layerName}-layer-opacity-slider`);
  if (!toggle || !slider) {
    console.warn(`Layer controls not found for ${layerName}. Toggle: ${!!toggle}, Slider: ${!!slider}`);
  }
  return { toggle, slider };
};

// Update range input track gradient to reflect current value
const updateSliderTrack = (slider, value, min = 0, max = 100) => {
  if (!slider) return;
  const percentage = ((value - min) / (max - min)) * 100;
  slider.style.background = `linear-gradient(to right, var(--orange-ip2, #f8794b) ${percentage}%, #ffffff ${percentage}%)`;
};

// Guess a device category based on a device's type/filename
const findDeviceCategory = (deviceType) => {
  return Object.keys(DEVICE_CATEGORIES).find((cat) => DEVICE_CATEGORIES[cat].includes(deviceType)) || "devices";
};

// Assign a single canvas object into the appropriate layer buckets
const categorizeObject = (obj) => {
  if (!obj) return;

  // Background images
  if (obj.isBackground || (obj.type === "image" && obj.selectable === false && obj.evented === false)) {
    layers.background.objects.push(obj);
    return;
  }

  // Network connections
  if (obj.isNetworkConnection || obj.isConnectionSegment || obj.isNetworkSplitPoint || obj.isSegmentDistanceLabel || obj.isConnectionCustomLabel || obj.isConnectionLine || obj.isChannelLabel) {
    layers.networkLinks.objects.push(obj);
    return;
  }

  // Title blocks
  if (obj.deviceType === "title-block") {
    layers.drawings.objects.push(obj);
    return;
  }

  // Device groups
  if (obj.type === "group" && obj.deviceType) {
    const category = obj.coverageConfig ? "cctv" : obj.deviceType === "text-device" ? "textDevices" : findDeviceCategory(obj.deviceType);
    layers[category].objects.push(obj);

    // Add related objects
    ["coverageArea", "leftResizeIcon", "rightResizeIcon", "rotateResizeIcon"].forEach((prop) => {
      if (obj[prop]) layers[category].objects.push(obj[prop]);
    });

    if (obj.textObject) layers[category].objects.push(obj.textObject);
    return;
  }

  // Device text labels
  if (obj.type === "text" && obj.isDeviceLabel) {
    const parentDevice = fabricCanvas?.getObjects().find((device) => device.type === "group" && device.deviceType && device.textObject === obj);

    if (parentDevice) {
      const category = parentDevice.coverageConfig ? "cctv" : findDeviceCategory(parentDevice.deviceType);
      layers[category].objects.push(obj);
    } else {
      layers.devices.objects.push(obj);
    }
    return;
  }

  // Other object types
  if ((obj.type === "polygon" && obj.class === "zone-polygon") || (obj.type === "i-text" && obj.class === "zone-text")) {
    layers.zones.objects.push(obj);
  } else if ((obj.type === "polygon" && obj.class === "room-polygon") || (obj.type === "i-text" && obj.class === "room-text")) {
    layers.rooms.objects.push(obj);
  } else if (["line", "rect", "circle", "group", "path", "arrow", "textbox"].includes(obj.type) || (obj.type === "i-text" && obj.class !== "zone-text" && obj.class !== "room-text")) {
    layers.drawings.objects.push(obj);
  } else if (obj.type === "image") {
    const isResizeIcon = fabricCanvas?.getObjects().some((o) => o.type === "group" && o.deviceType && [o.leftResizeIcon, o.rightResizeIcon, o.rotateResizeIcon].includes(obj));
    if (!isResizeIcon) {
      layers.drawings.objects.push(obj);
    }
  }
};

// Apply visibility flags from layers and per-item overrides to canvas objects
const updateLayerVisibility = () => {
  if (!fabricCanvas) return;

  const activeObject = fabricCanvas.getActiveObject();

  Object.keys(layers).forEach((layerName) => {
    layers[layerName].objects.forEach((obj) => {
      if (!obj?.set) return;

      let isVisible = layers[layerName].visible && layers[layerName].opacity > 0;
      if (SYSTEM_LAYERS.includes(layerName)) {
        isVisible = isVisible && layers.devices.visible && layers.devices.opacity > 0;
      }

      if (obj._individualVisible === false) isVisible = false;

      // Background images
      if (layerName === "background" && obj.type === "image") {
        fabricCanvas.sendToBack(obj);
        obj.set({ visible: isVisible, selectable: false, evented: false });
      } else {
        obj.set({ visible: isVisible });
      }

      // Coverage areas
      if (obj.coverageArea?.set) {
        obj.coverageArea.set({ visible: isVisible && obj.coverageConfig?.visible });
      }

      // CCTV resize icons
      if (layerName === "cctv" && activeObject === obj) {
        ["leftResizeIcon", "rightResizeIcon", "rotateResizeIcon"].forEach((iconType) => {
          if (obj[iconType]) {
            obj[iconType].set({ visible: isVisible && obj.coverageConfig?.visible });
          }
        });
      }
    });
  });
  fabricCanvas.requestRenderAll();
};

// Color and opacity utilities
const setColorAlpha = (colorStr, alpha) => {
  if (!colorStr) return colorStr;

  const rgbaMatch = colorStr.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
  if (rgbaMatch) return `rgba(${rgbaMatch[1]},${rgbaMatch[2]},${rgbaMatch[3]},${alpha})`;

  const rgbMatch = colorStr.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (rgbMatch) return `rgba(${rgbMatch[1]},${rgbMatch[2]},${rgbMatch[3]},${alpha})`;

  const hslaMatch = colorStr.match(/hsla\((\d+),\s*(\d+)%,\s*(\d+)%,\s*([\d.]+)\)/);
  if (hslaMatch) return `hsla(${hslaMatch[1]},${hslaMatch[2]}%,${hslaMatch[3]}%,${alpha})`;

  const hslMatch = colorStr.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
  if (hslMatch) return `hsla(${hslMatch[1]},${hslMatch[2]}%,${hslMatch[3]}%,${alpha})`;

  return colorStr;
};

// Combine base color with a multiplier to compute effective color opacity
const updateColorOpacity = (colorStr, newOpacity, isZone = false) => {
  const rgbaMatch = colorStr?.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
  const hslaMatch = colorStr?.match(/hsla\((\d+),\s*(\d+)%,\s*(\d+)%,\s*([\d.]+)\)/);

  if (rgbaMatch) {
    const baseOpacity = isZone ? 0.2 : parseFloat(rgbaMatch[4]);
    return `rgba(${rgbaMatch[1]},${rgbaMatch[2]},${rgbaMatch[3]},${baseOpacity * newOpacity})`;
  }
  if (hslaMatch) {
    const baseOpacity = isZone ? 0.2 : parseFloat(hslaMatch[4]);
    return `hsla(${hslaMatch[1]},${hslaMatch[2]}%,${hslaMatch[3]}%,${baseOpacity * newOpacity})`;
  }
  return colorStr;
};

// Compute and apply effective opacity for each object based on layer and per-item settings
const updateLayerOpacity = () => {
  if (!fabricCanvas) return;

  const activeObject = fabricCanvas.getActiveObject();

  Object.keys(layers).forEach((layerName) => {
    const effectiveOpacity = SYSTEM_LAYERS.includes(layerName) ? layers[layerName].opacity * layers.devices.opacity : layers[layerName].opacity;

    layers[layerName].objects.forEach((obj) => {
      if (!obj?.set) return;

      const objectOpacityFactor = typeof obj._individualOpacity === "number" ? obj._individualOpacity : 1;
      const objectEffectiveOpacity = effectiveOpacity * objectOpacityFactor;

      if (layerName === "zones" && obj.type === "polygon") {
        obj.set({
          fill: setColorAlpha(obj.fill, 0.2 * objectEffectiveOpacity),
          stroke: setColorAlpha(obj.stroke, objectEffectiveOpacity),
        });
      } else if (SYSTEM_LAYERS.includes(layerName) && obj.type === "polygon") {
        obj.set({
          fill: updateColorOpacity(obj.fill, objectEffectiveOpacity),
          stroke: updateColorOpacity(obj.stroke, objectEffectiveOpacity) || obj.stroke,
        });
        if (!updateColorOpacity(obj.stroke, objectEffectiveOpacity)) {
          obj.set({ opacity: objectEffectiveOpacity });
        }
      } else {
        obj.set({ opacity: objectEffectiveOpacity });

        // Coverage areas
        if (SYSTEM_LAYERS.includes(layerName) && obj.coverageArea?.set) {
          const fill = obj.coverageConfig?.fillColor || obj.coverageArea.fill;
          obj.coverageArea.set({
            fill: updateColorOpacity(fill, objectEffectiveOpacity),
            stroke: `rgba(0, 0, 0, ${objectEffectiveOpacity})`,
            visible: layers[layerName].visible && layers.devices.visible && objectEffectiveOpacity > 0 && obj.coverageConfig?.visible,
          });
        }

        // CCTV resize icons
        if (layerName === "cctv") {
          const isCameraSelected = activeObject === obj;
          ["leftResizeIcon", "rightResizeIcon", "rotateResizeIcon"].forEach((iconType) => {
            if (obj[iconType]) {
              obj[iconType].set({
                opacity: objectEffectiveOpacity,
                visible: layers[layerName].visible && layers.devices.visible && objectEffectiveOpacity > 0 && obj.coverageConfig?.visible && isCameraSelected,
              });
            }
          });
        }
      }
    });
  });
  fabricCanvas.requestRenderAll();
};

// Initialize DOM controls for toggling layers and adjusting opacity sliders
const setupLayerControls = () => {
  Object.keys(layers).forEach((layerName) => {
    const { toggle, slider } = getLayerElements(layerName);

    // Slider setup
    if (slider) {
      const newSlider = slider.cloneNode(true);
      slider.parentNode.replaceChild(newSlider, slider);
      updateSliderTrack(newSlider, newSlider.value, newSlider.min || 0, newSlider.max || 100);

      newSlider.addEventListener("input", () => {
        layers[layerName].opacity = newSlider.value / 100;
        updateLayerOpacity();
        updateSliderTrack(newSlider, newSlider.value, newSlider.min || 0, newSlider.max || 100);
      });
    }

    // Toggle setup
    if (toggle) {
      const newToggle = toggle.cloneNode(true);
      toggle.parentNode.replaceChild(newToggle, toggle);

      newToggle.addEventListener("change", () => {
        layers[layerName].visible = newToggle.checked;

        // Devices layer affects system layers
        if (layerName === "devices") {
          SYSTEM_LAYERS.forEach((sysLayer) => {
            const sysToggle = getLayerElements(sysLayer).toggle;
            layers[sysLayer].visible = newToggle.checked && (sysToggle?.checked ?? true);
          });
        }

        // System layers depend on devices layer
        if (SYSTEM_LAYERS.includes(layerName)) {
          layers[layerName].visible = newToggle.checked && layers.devices.visible;
        }

        updateLayerVisibility();
      });
    }
  });

  ensurePerItemContainers();
  renderLayerItems("zones");
  renderLayerItems("rooms");
};

// Ensure the per-item UI containers for zones and rooms exist in the layer menu
const ensurePerItemContainers = () => {
  const layerControlsSubmenu = document.getElementById("layer-controls-submenu");
  if (!layerControlsSubmenu) return;

  ["zones", "rooms"].forEach((name) => {
    if (perItemContainers[name] && document.body.contains(perItemContainers[name])) return;

    const container = document.createElement("div");
    container.id = `${name}-layer-items`;
    container.className = "mb-3";
    container.style.cssText = "border-top: 1px solid #e9ecef; padding-top: 12px; margin-top: 12px; max-height: 180px; overflow-y: auto; font-size: 0.9rem;";

    const label = document.createElement("div");
    label.textContent = name === "zones" ? "Individual Zone Controls" : "Individual Room Controls";
    label.style.cssText = "font-weight: 500; margin-bottom: 8px; color: #495057;";
    container.appendChild(label);

    const list = document.createElement("div");
    list.className = "layer-item-list";
    container.appendChild(list);

    layerControlsSubmenu.appendChild(container);
    perItemContainers[name] = container;
  });
};

// Render list of individual zones or rooms with visibility/opacity controls
const renderLayerItems = (layerName) => {
  ensurePerItemContainers();
  const container = perItemContainers[layerName];
  if (!container) return;

  const list = container.querySelector(".layer-item-list");
  if (!list) return;

  const isZones = layerName === "zones";
  const items = (isZones ? window.zones : window.rooms) || [];

  const frag = document.createDocumentFragment();

  items.forEach((item, idx) => {
    const polygon = item?.polygon || item;
    const text = item?.text;
    if (!polygon) return;

    if (!polygon._layerItemId) polygon._layerItemId = `layer-${layerName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const name = isZones ? polygon.zoneName || `Zone ${idx + 1}` : polygon.roomName || item?.roomName || `Room ${idx + 1}`;

    const row = document.createElement("div");
    row.style.cssText = "display: flex; align-items: center; gap: 8px; margin: 4px 0;";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = `${polygon._layerItemId}-checkbox`;
    checkbox.className = "form-check-input";
    checkbox.style.marginTop = "0";
    checkbox.checked = polygon._individualVisible !== false;

    checkbox.addEventListener("change", () => {
      const checked = checkbox.checked;
      polygon._individualVisible = checked;
      if (text) text._individualVisible = checked;
      updateLayerVisibility();
    });

    const span = document.createElement("label");
    span.setAttribute("for", `${polygon._layerItemId}-checkbox`);
    span.textContent = name;
    span.style.cssText = "flex: 1 1 50%; min-width: 0; cursor: pointer; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;";

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "100";
    slider.step = "1";
    slider.value = Math.round((typeof polygon._individualOpacity === "number" ? polygon._individualOpacity : 1) * 100).toString();
    slider.style.cssText = "flex: 1 1 50%; width: auto; min-width: 80px;";
    slider.className = "form-range";

    updateSliderTrack(slider, Number(slider.value), Number(slider.min), Number(slider.max));
    slider.addEventListener("input", () => {
      const v = Number(slider.value) / 100;
      polygon._individualOpacity = v;
      if (text) text._individualOpacity = v;
      updateLayerOpacity();
      updateSliderTrack(slider, Number(slider.value), Number(slider.min), Number(slider.max));
    });

    row.appendChild(checkbox);
    row.appendChild(span);
    row.appendChild(slider);
    frag.appendChild(row);
  });

  const prevScroll = list.scrollTop;
  list.innerHTML = "";
  list.appendChild(frag);
  list.scrollTop = prevScroll;
};

// Public: trigger a full refresh of the layer system
export function refreshLayers() {
  if (isInitialized && fabricCanvas) {
    reinitializeCanvasLayers();
  }
}

// Return snapshot of current layers state for diagnostics
export function getLayersState() {
  return {
    layers: { ...layers },
    isInitialized,
    objectCounts: Object.keys(layers).map((key) => ({ layer: key, count: layers[key].objects.length })),
  };
}

// Global functions
window.initCanvasLayers = initCanvasLayers;
window.refreshLayers = refreshLayers;
window.getLayersState = getLayersState;
window.requestLayerItemsRefresh = () => {
  renderLayerItems("zones");
  renderLayerItems("rooms");
};
