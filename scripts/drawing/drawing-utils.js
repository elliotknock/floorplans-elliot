// Global state for drawing tools
let currentTool = null;
let currentCanvas = null;
let keyHandler = null;
let toolCleanupFunction = null;

// Shows the drawing mode popup
export function showDrawingPopup() {
  const popup = document.getElementById("drawing-mode-popup");
  if (popup) popup.style.display = "block";
}

// Hides the drawing mode popup
export function hideDrawingPopup() {
  const popup = document.getElementById("drawing-mode-popup");
  if (popup) popup.style.display = "none";
}

// Changes cursor to crosshair for drawing
export function setCrosshairCursor(fabricCanvas) {
  fabricCanvas.defaultCursor = "crosshair";
  fabricCanvas.hoverCursor = "crosshair";
  fabricCanvas.selection = false;
  fabricCanvas.getObjects().forEach((obj) => {
    if (!obj.isBackground) obj.set({ selectable: false });
  });
  fabricCanvas.requestRenderAll();
}

// Returns cursor to normal and enables selection
export function setDefaultCursor(fabricCanvas) {
  fabricCanvas.defaultCursor = "move";
  fabricCanvas.hoverCursor = "default";
  fabricCanvas.selection = true;
  fabricCanvas.getObjects().forEach((obj) => {
    if (!obj.isBackground && !obj.isWallCircle && !obj.isDeviceLabel) {
      obj.set({ selectable: true });
    }
  });
  fabricCanvas.requestRenderAll();
}

// Saves a cleanup function for the current tool
export function registerToolCleanup(cleanupFn) {
  toolCleanupFunction = cleanupFn;
}

// Removes the saved cleanup function
export function clearToolCleanup() {
  toolCleanupFunction = null;
}

// Returns the standard style settings for objects
export function getStandardObjectStyle() {
  return {
    borderColor: "#f8794b",
    borderScaleFactor: 1,
    cornerSize: 8,
    cornerColor: "#f8794b",
    cornerStrokeColor: "#000000",
    cornerStyle: "circle",
    padding: 5,
    transparentCorners: false,
    hasControls: true,
    hasBorders: true,
    selectable: true,
    evented: true,
  };
}

// Applies standard styling to an object
export function applyStandardStyling(obj) {
  const standardStyle = getStandardObjectStyle();
  obj.set(standardStyle);
  return obj;
}

// Starts a drawing tool with mouse and keyboard handlers
export function startTool(fabricCanvas, toolName, clickHandler, moveHandler = null, customKeyHandler = null, skipPopup = false) {
  stopCurrentTool();

  currentTool = { name: toolName, clickHandler, moveHandler, customKeyHandler };
  currentCanvas = fabricCanvas;

  if (!skipPopup) {
    showDrawingPopup();
  }

  setCrosshairCursor(fabricCanvas);

  fabricCanvas.on("mouse:down", clickHandler);
  if (moveHandler) fabricCanvas.on("mouse:move", moveHandler);

  keyHandler = (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();

      if (toolCleanupFunction) {
        toolCleanupFunction();
      }

      stopCurrentTool();
      return false;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      return false;
    }
  };

  document.addEventListener("keydown", keyHandler, true);

  if (!skipPopup) {
    setupPopupButtons();
  }
}

// Stops the current drawing tool and cleans up
export function stopCurrentTool() {
  if (!currentCanvas || !currentTool) return;

  // Remove focus from buttons and focus canvas
  try {
    const activeEl = document.activeElement;
    if (activeEl && (activeEl.tagName === "BUTTON" || (activeEl.getAttribute && activeEl.getAttribute("role") === "button"))) {
      try {
        activeEl.blur();
      } catch (e) {}
    }
    const canvasEl = currentCanvas && (currentCanvas.upperCanvasEl || currentCanvas.lowerCanvasEl);
    if (canvasEl) {
      if (!canvasEl.hasAttribute || !canvasEl.hasAttribute("tabindex")) {
        canvasEl.setAttribute("tabindex", "-1");
      }
      try {
        canvasEl.style.outline = "none";
        canvasEl.style.boxShadow = "none";
      } catch (err) {}
      canvasEl.focus && canvasEl.focus();
    }
  } catch (err) {}

  hideDrawingPopup();
  setDefaultCursor(currentCanvas);

  currentCanvas.off("mouse:down", currentTool.clickHandler);
  if (currentTool.moveHandler) {
    currentCanvas.off("mouse:move", currentTool.moveHandler);
  }

  if (keyHandler) {
    document.removeEventListener("keydown", keyHandler, true);
    keyHandler = null;
  }

  cleanupPopupButtons();
  clearToolCleanup();

  currentTool = null;
  currentCanvas = null;
}

// Sets up the escape button in the drawing popup
function setupPopupButtons() {
  const escBtn = document.getElementById("drawing-esc-btn");

  if (escBtn) {
    escBtn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();

      if (toolCleanupFunction) {
        toolCleanupFunction();
      }

      stopCurrentTool();
    };
  }
}

// Checks if an object can be deleted
function canDeleteObject(activeObject, fabricCanvas) {
  if (!activeObject) return false;

  // Don't delete while editing text
  if (activeObject.type === "i-text" && activeObject.isEditing) return false;
  if (fabricCanvas.getObjects().some((obj) => obj.type === "i-text" && obj.isEditing)) return false;

  // Don't delete protected objects
  if (activeObject.type === "group" && activeObject.deviceType) return false;
  if (activeObject.type === "text" && activeObject.isDeviceLabel) return false;
  if (activeObject.isCoverage === true) return false;
  if (activeObject.isResizeIcon === true) return false;
  if (activeObject.isBackground === true) return false;

  return true;
}

// Removes an object from canvas
function removeObject(fabricCanvas, obj) {
  fabricCanvas.remove(obj);
  fabricCanvas.discardActiveObject();
  fabricCanvas.requestRenderAll();
  return true;
}

// Handles deletion of different object types
export function handleObjectDeletion(fabricCanvas, activeObject) {
  if (!canDeleteObject(activeObject, fabricCanvas)) return false;

  // Handle zones
  if (activeObject.type === "polygon" && activeObject.class === "zone-polygon") {
    return deleteZone(fabricCanvas, activeObject);
  }
  if (activeObject.type === "i-text" && activeObject.class === "zone-text") {
    const associatedPolygon = activeObject.associatedPolygon;
    if (associatedPolygon) {
      return deleteZone(fabricCanvas, associatedPolygon);
    }
    return false;
  }

  // Handle rooms
  if (activeObject.type === "polygon" && activeObject.class === "room-polygon") {
    return deleteRoom(fabricCanvas, activeObject);
  }
  if (activeObject.type === "i-text" && activeObject.class === "room-text") {
    const associatedPolygon = activeObject.associatedPolygon;
    if (associatedPolygon) {
      return deleteRoom(fabricCanvas, associatedPolygon);
    }
    return false;
  }

  // Handle walls
  if (activeObject.type === "circle" && activeObject.isWallCircle) {
    return deleteWallCircle(fabricCanvas, activeObject);
  }
  if (activeObject.type === "line" && activeObject.stroke === "red") {
    return deleteWallLine(fabricCanvas, activeObject);
  }

  // Handle building fronts and arrows
  if (activeObject.type === "group" && (activeObject.groupType === "buildingFront" || activeObject.isBuildingFront || (activeObject._objects && activeObject._objects.length === 2 && activeObject._objects.some((subObj) => subObj.type === "triangle") && activeObject._objects.some((subObj) => subObj.type === "text")))) {
    return removeObject(fabricCanvas, activeObject);
  }
  if (activeObject.type === "group" && (activeObject.isArrow || activeObject.type === "arrow" || activeObject.groupType === "buildingFront")) {
    return removeObject(fabricCanvas, activeObject);
  }

  // Handle images
  if (activeObject.type === "image" && (activeObject.northArrowImage || activeObject.isUploadedImage)) {
    return removeObject(fabricCanvas, activeObject);
  }

  // Handle basic shapes
  if (activeObject.type === "circle" || activeObject.type === "rect" || activeObject.type === "triangle") {
    if (activeObject.type === "circle" && activeObject.fill === "#f8794b" && activeObject.radius < 30 && !activeObject.isWallCircle) {
      return false;
    }
    return removeObject(fabricCanvas, activeObject);
  }

  // Handle text
  if (activeObject.type === "i-text" || activeObject.type === "textbox") {
    if (!activeObject.class && !activeObject.isDeviceLabel && !activeObject.isHeader) {
      return removeObject(fabricCanvas, activeObject);
    }
  }

  // Handle lines
  if (activeObject.type === "line") {
    if (activeObject.stroke !== "red" && activeObject.stroke !== "grey" && activeObject.stroke !== "blue" && !activeObject.deviceType && !activeObject.isResizeIcon && !activeObject.isNetworkConnection && !activeObject.isConnectionSegment) {
      return removeObject(fabricCanvas, activeObject);
    }
  }

  // Handle network connections
  if (activeObject.isNetworkConnection || activeObject.isConnectionSegment || activeObject.isNetworkSplitPoint) {
    if (window.topologyManager) {
      if (activeObject.isNetworkConnection || activeObject.isConnectionSegment) {
        window.topologyManager.removeConnectionById(activeObject.connectionId);
      } else if (activeObject.isNetworkSplitPoint) {
        window.topologyManager.removeSplitPoint(activeObject);
      }
      
      fabricCanvas.discardActiveObject();
      fabricCanvas.requestRenderAll();
      return true;
    }
  }

  // Handle drawing objects
  if (window.drawingSerializer && window.drawingSerializer.isDrawingObject && window.drawingSerializer.isDrawingObject(activeObject)) {
    return removeObject(fabricCanvas, activeObject);
  }

  return false;
}

// Deletes a zone and its text
function deleteZone(fabricCanvas, zoneToDelete) {
  const zoneIndex = window.zones ? window.zones.findIndex((zone) => zone.polygon === zoneToDelete || zone.text === zoneToDelete) : -1;
  if (zoneIndex === -1) return false;

  const zone = window.zones[zoneIndex];

  [zone.polygon, zone.text].forEach((obj) => {
    if (obj) {
      obj.off();
      fabricCanvas.remove(obj);
    }
  });

  window.zones.splice(zoneIndex, 1);

  fabricCanvas.discardActiveObject();
  window.hideDeviceProperties?.();
  fabricCanvas.requestRenderAll();
  try {
    document.dispatchEvent(new Event("layers:items-changed"));
  } catch (e) {}
  return true;
}

// Deletes a room and its text
function deleteRoom(fabricCanvas, roomToDelete) {
  const roomIndex = window.rooms ? window.rooms.findIndex((room) => room.polygon === roomToDelete || room.text === roomToDelete) : -1;
  if (roomIndex === -1) return false;

  const room = window.rooms[roomIndex];

  [room.polygon, room.text].forEach((obj) => {
    if (obj) {
      obj.off();
      fabricCanvas.remove(obj);
    }
  });

  window.rooms.splice(roomIndex, 1);

  fabricCanvas.discardActiveObject();
  window.hideDeviceProperties?.();
  fabricCanvas.requestRenderAll();
  try {
    document.dispatchEvent(new Event("layers:items-changed"));
  } catch (e) {}
  return true;
}

// Sets up global delete functions
try {
  if (!window.deleteZone) {
    window.deleteZone = (target) => {
      if (!target) return false;
      const canvas = target.canvas || (target.associatedPolygon && target.associatedPolygon.canvas) || null;
      if (!canvas) return false;
      return deleteZone(canvas, target);
    };
  }
  if (!window.deleteRoom) {
    window.deleteRoom = (target) => {
      if (!target) return false;
      const canvas = target.canvas || (target.associatedPolygon && target.associatedPolygon.canvas) || null;
      if (!canvas) return false;
      return deleteRoom(canvas, target);
    };
  }
} catch (e) {}

// Finds circles that are no longer connected to any lines
function findOrphanedCircles(fabricCanvas, connectedLines, deletedCircle) {
  const orphanedCircles = [];

  connectedLines.forEach((line) => {
    const otherCircle = line.startCircle === deletedCircle ? line.endCircle : line.startCircle;
    if (otherCircle && !orphanedCircles.includes(otherCircle)) {
      const remainingConnections = fabricCanvas.getObjects().filter((obj) => 
        obj.type === "line" && 
        obj.stroke === "red" && 
        !connectedLines.includes(obj) && 
        (obj.startCircle === otherCircle || obj.endCircle === otherCircle)
      );
      if (remainingConnections.length === 0) {
        orphanedCircles.push(otherCircle);
      }
    }
  });

  return orphanedCircles;
}

// Deletes a wall circle and all connected lines
function deleteWallCircle(fabricCanvas, circle) {
  const connectedLines = fabricCanvas.getObjects().filter((obj) => 
    obj.type === "line" && 
    obj.stroke === "red" && 
    (obj.startCircle === circle || obj.endCircle === circle)
  );

  const allObjectsToDelete = [circle, ...connectedLines];
  const orphanedCircles = findOrphanedCircles(fabricCanvas, connectedLines, circle);
  allObjectsToDelete.push(...orphanedCircles);

  allObjectsToDelete.forEach((obj) => fabricCanvas.remove(obj));
  fabricCanvas.discardActiveObject();

  // Update coverage areas
  fabricCanvas.getObjects("group").forEach((obj) => {
    if (obj.coverageConfig && obj.createOrUpdateCoverageArea) {
      obj.createOrUpdateCoverageArea();
    }
  });

  fabricCanvas.requestRenderAll();
  return true;
}

// Gets the center point of a circle safely
function getCircleCenter(circle) {
  try {
    return circle.getCenterPoint();
  } catch (e) {
    return { x: circle.left || 0, y: circle.top || 0 };
  }
}

// Gets the endpoints of a line safely
function getLineEndpoints(line) {
  try {
    const x1 = typeof line.x1 === "number" ? line.x1 : 0;
    const y1 = typeof line.y1 === "number" ? line.y1 : 0;
    const x2 = typeof line.x2 === "number" ? line.x2 : 0;
    const y2 = typeof line.y2 === "number" ? line.y2 : 0;
    const left = typeof line.left === "number" ? line.left : 0;
    const top = typeof line.top === "number" ? line.top : 0;
    return [
      { x: left + x1, y: top + y1 },
      { x: left + x2, y: top + y2 },
    ];
  } catch (e) {
    return [
      { x: line.x1 || line.left || 0, y: line.y1 || line.top || 0 },
      { x: line.x2 || (line.left || 0) + (line.width || 0), y: line.y2 || (line.top || 0) + (line.height || 0) },
    ];
  }
}

// Checks if a line endpoint is near a circle
function isLineEndpointNearCircle(line, circle, tolerance = 12) {
  try {
    const circleCenter = getCircleCenter(circle);
    const [p1, p2] = getLineEndpoints(line);
    const d1 = Math.hypot(circleCenter.x - p1.x, circleCenter.y - p1.y);
    const d2 = Math.hypot(circleCenter.x - p2.x, circleCenter.y - p2.y);
    return d1 <= tolerance || d2 <= tolerance;
  } catch (e) {
    return false;
  }
}

// Finds circles connected to a line
function findConnectedCircles(fabricCanvas, line) {
  const candidateCircles = [];
  
  if (line.startCircle) candidateCircles.push(line.startCircle);
  if (line.endCircle) candidateCircles.push(line.endCircle);

  try {
    const endpoints = getLineEndpoints(line);
    endpoints.forEach((pt) => {
      if (pt.x == null || pt.y == null) return;
      const nearby = fabricCanvas
        .getObjects()
        .filter((o) => o.type === "circle" && o.isWallCircle)
        .find((c) => {
          const cp = getCircleCenter(c);
          return Math.hypot(cp.x - pt.x, cp.y - pt.y) <= 12;
        });
      if (nearby && !candidateCircles.includes(nearby)) candidateCircles.push(nearby);
    });
  } catch (e) {}

  return candidateCircles.filter((c, i) => c && candidateCircles.indexOf(c) === i);
}

// Deletes a wall line and any orphaned circles
function deleteWallLine(fabricCanvas, line) {
  try {
    fabricCanvas.remove(line);
  } catch (e) {}

  const uniqueCircles = findConnectedCircles(fabricCanvas, line);

  uniqueCircles.forEach((circle) => {
    if (!circle) return;

    const otherLines = fabricCanvas.getObjects().filter((obj) => {
      if (obj.type !== "line" || obj === line || obj.stroke !== "red") return false;
      if (obj.startCircle === circle || obj.endCircle === circle) return true;
      if (isLineEndpointNearCircle(obj, circle)) return true;
      return false;
    });

    if (otherLines.length === 0) {
      try {
        fabricCanvas.remove(circle);
      } catch (e) {}
    }
  });

  fabricCanvas.discardActiveObject();

  // Update coverage areas
  fabricCanvas.getObjects("group").forEach((obj) => {
    if (obj.coverageConfig && obj.createOrUpdateCoverageArea) {
      obj.createOrUpdateCoverageArea();
    }
  });

  fabricCanvas.requestRenderAll();
  return true;
}

// Removes popup button event handlers
function cleanupPopupButtons() {
  const escBtn = document.getElementById("drawing-esc-btn");
  if (escBtn) escBtn.onclick = null;
}

// Closes the sidebar and all submenus
export function closeSidebar() {
  const sidebar = document.getElementById("sub-sidebar");
  if (sidebar) sidebar.classList.add("hidden");

  document.querySelectorAll(".submenu").forEach((menu) => {
    menu.classList.add("hidden");
    menu.classList.remove("show");
  });
}

// Sets up deletion handling for objects
export function setupDeletion(fabricCanvas, condition = () => true) {
  window._deletionConditions = window._deletionConditions || [];

  try {
    const fnSource = condition.toString();
    const exists = window._deletionConditions.some((c) => c._fnSource === fnSource);
    if (!exists) window._deletionConditions.push({ fn: condition, _fnSource: fnSource });
  } catch (err) {
    if (!window._deletionConditions.includes(condition)) window._deletionConditions.push({ fn: condition, _fnSource: null });
  }

  if (!window._deletionHandler) {
    window._deletionHandler = (e) => {
      if (currentTool) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        const active = fabricCanvas.getActiveObject();
        if (!active) return;

        const allowed = window._deletionConditions.some(({ fn }) => {
          try {
            return !!fn(active);
          } catch (err) {
            return false;
          }
        });

        if (allowed) {
          const wasDeleted = handleObjectDeletion(fabricCanvas, active);
          if (wasDeleted) {
            e.preventDefault();
            e.stopPropagation();
          }
        }
      }
    };

    document.addEventListener("keydown", window._deletionHandler);
  }
}

// Sets up color picker for shapes and text
export function setupColorPicker(fabricCanvas) {
  const picker = document.getElementById("shapes-text-color-picker");
  if (!picker) return;

  fabricCanvas.on("selection:created", updateColorPicker);
  fabricCanvas.on("selection:updated", updateColorPicker);
  fabricCanvas.on("selection:cleared", () => (picker.value = "#ffffff"));

  function updateColorPicker(e) {
    const obj = e.selected[0];
    if (!obj) return;

    let color = "#000000";

    try {
      if (obj.isConnectionSegment || obj.isNetworkSplitPoint) {
        const tm = window.topologyManager;
        if (tm && obj.connectionId && tm.connections && tm.connections.get) {
          const conn = tm.connections.get(obj.connectionId);
          const base = conn && conn.properties && conn.properties.color;
          if (base && typeof base === 'string') {
            color = base;
            color = normalizeColorForPicker(color);
            picker.value = color;
            return;
          }
        }
      }
    } catch (_) {}

    if (obj.type === "arrow" || (obj.type === "group" && obj._objects?.some((subObj) => subObj.type === "line" || subObj.type === "triangle"))) {
      const lineOrTriangle = obj._objects.find((subObj) => subObj.type === "line" || subObj.type === "triangle");
      if (lineOrTriangle && (lineOrTriangle.fill || lineOrTriangle.stroke)) {
        color = lineOrTriangle.fill || lineOrTriangle.stroke;
      }
    } else if (obj.fill && typeof obj.fill === "string") {
      color = obj.fill;
    } else if (obj.stroke && typeof obj.stroke === "string") {
      color = obj.stroke;
    }

    color = normalizeColorForPicker(color);
    picker.value = color;
  }

  picker.addEventListener("input", () => {
    const active = fabricCanvas.getActiveObject();
    if (!active) return;

    const newColor = picker.value;

    try {
      if (active.isConnectionSegment || active.isNetworkSplitPoint) {
        const tm = window.topologyManager;
        if (tm && active.connectionId && tm.connections && tm.connections.get) {
          const conn = tm.connections.get(active.connectionId);
          if (conn) {
            conn.properties = conn.properties || {};
            conn.properties.color = newColor;
            if (typeof tm.renderConnection === 'function') tm.renderConnection(conn);
            fabricCanvas.requestRenderAll();
            return;
          }
        }
      }
    } catch (_) {}

    if (active.type === "i-text") {
      active.set({ fill: newColor });
    } else if (active.type === "arrow" || (active.type === "group" && active._objects?.some((subObj) => subObj.type === "line" || subObj.type === "triangle"))) {
      active._objects.forEach((subObj) => {
        if (subObj.type === "line" || subObj.type === "triangle") {
          if (subObj.fill !== undefined) subObj.set({ fill: newColor });
          if (subObj.stroke !== undefined) subObj.set({ stroke: newColor });
        }
      });
      active.dirty = true;
    } else {
      if (active.fill !== undefined) {
        const currentFill = active.fill || "rgba(0, 0, 0, 1)";
        const alpha = currentFill.match(/rgba?\(\d+,\s*\d+,\s*\d+,\s*([\d.]+)\)/)?.[1] || 1;
        active.set({ fill: `rgba(${parseInt(newColor.slice(1, 3), 16)}, ${parseInt(newColor.slice(3, 5), 16)}, ${parseInt(newColor.slice(5, 7), 16)}, ${alpha})` });
      }
      if (active.stroke !== undefined) {
        active.set({ stroke: newColor });
      }
    }

    fabricCanvas.requestRenderAll();
  });
}

// Normalizes colors for color picker
function normalizeColorForPicker(color) {
  if (!color || typeof color !== "string") {
    return "#000000";
  }

  if (/^#[0-9A-Fa-f]{6}$/.test(color)) {
    return color;
  }

  if (/^#[0-9A-Fa-f]{8}$/.test(color)) {
    return color.substring(0, 7);
  }

  const rgbaMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/);
  if (rgbaMatch) {
    const r = parseInt(rgbaMatch[1]).toString(16).padStart(2, "0");
    const g = parseInt(rgbaMatch[2]).toString(16).padStart(2, "0");
    const b = parseInt(rgbaMatch[3]).toString(16).padStart(2, "0");
    return `#${r}${g}${b}`;
  }

  return "#000000";
}

// Sets up text color picker
export function setupTextColorPicker(fabricCanvas) {
  const picker = document.getElementById("drawing-text-color-picker");
  if (!picker) return;

  const colorIcons = Array.from(document.querySelectorAll(".drawing-text-colour .colour-icon"));

  function updateTextPicker(e) {
    const obj = e.selected?.[0];
    if (!obj) return;

    let textObj = null;

    if (obj.type === "i-text" || obj.type === "textbox" || obj.type === "text") {
      textObj = obj;
    } else if (obj.type === "group") {
      const possible = obj._objects?.find((o) => o && (o.type === "i-text" || o.type === "textbox" || o.type === "text"));
      if (possible) textObj = possible;
    }

    if (textObj && typeof textObj.fill === "string") {
      picker.value = normalizeColorForPicker(textObj.fill);
    }
  }

  fabricCanvas.on("selection:created", updateTextPicker);
  fabricCanvas.on("selection:updated", updateTextPicker);
  fabricCanvas.on("selection:cleared", () => {
    picker.value = "#000000";
  });

  const applyTextColor = (hex) => {
    const active = fabricCanvas.getActiveObject();
    if (!active) return;

    const setFill = (t) => t && t.set && t.set({ fill: hex });

    if (active.type === "i-text" || active.type === "textbox" || active.type === "text") {
      setFill(active);
    } else if (active.type === "group") {
      const tChild = active._objects?.find((o) => o && (o.type === "i-text" || o.type === "textbox" || o.type === "text"));
      if (tChild) {
        setFill(tChild);
        active.dirty = true;
        active.setCoords();
      }
    }

    fabricCanvas.requestRenderAll();
  };

  picker.addEventListener("input", () => applyTextColor(picker.value));

  colorIcons.forEach((icon) => {
    const color = icon.getAttribute("data-color");
    icon.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!color) return;
      picker.value = color;
      applyTextColor(color);
      colorIcons.forEach((i) => (i.classList && i.classList.remove("selected")));
      icon.classList && icon.classList.add("selected");
    });
  });
}

// Sets up background color picker for text objects including network text
export function setupBackgroundColorPicker(fabricCanvas) {
  const picker = document.getElementById("drawing-text-background-color-picker");
  if (!picker) return;

  const colorIcons = Array.from(document.querySelectorAll(".drawing-text-background-colour .colour-icon"));

  function updateBackgroundPicker(e) {
    const obj = e.selected?.[0];
    if (!obj) return;

    let textObj = null;

    // Handle network text labels
    if (obj.isSegmentDistanceLabel || obj.isConnectionCustomLabel) {
      textObj = obj;
    } else if (obj.type === "i-text" || obj.type === "textbox" || obj.type === "text") {
      textObj = obj;
    } else if (obj.type === "group") {
      const possible = obj._objects?.find((o) => o && (o.type === "i-text" || o.type === "textbox" || o.type === "text"));
      if (possible) textObj = possible;
    }

    if (textObj && typeof textObj.backgroundColor === "string") {
      picker.value = normalizeColorForPicker(textObj.backgroundColor);
    }
  }

  fabricCanvas.on("selection:created", updateBackgroundPicker);
  fabricCanvas.on("selection:updated", updateBackgroundPicker);
  fabricCanvas.on("selection:cleared", () => {
    picker.value = "#ffffff";
  });

  const applyBackgroundColor = (hex) => {
    const active = fabricCanvas.getActiveObject();
    if (!active) return;

    const setBackground = (t) => {
      if (t && t.set) {
        const rgbaColor = hexToRgba(hex, 0.8);
        t.set({ backgroundColor: rgbaColor });
      }
    };

    // Handle network text labels
    if (active.isSegmentDistanceLabel || active.isConnectionCustomLabel) {
      setBackground(active);
    } else if (active.type === "i-text" || active.type === "textbox" || active.type === "text") {
      setBackground(active);
    } else if (active.type === "group") {
      const tChild = active._objects?.find((o) => o && (o.type === "i-text" || o.type === "textbox" || o.type === "text"));
      if (tChild) {
        setBackground(tChild);
        active.dirty = true;
        active.setCoords();
      }
    }

    fabricCanvas.requestRenderAll();
  };

  picker.addEventListener("input", () => applyBackgroundColor(picker.value));

  colorIcons.forEach((icon) => {
    const color = icon.getAttribute("data-color");
    icon.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!color) return;
      picker.value = color;
      applyBackgroundColor(color);
      colorIcons.forEach((i) => (i.classList && i.classList.remove("selected")));
      icon.classList && icon.classList.add("selected");
    });
  });
}

// Helper function to convert hex to rgba
function hexToRgba(hex, alpha = 1) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Drawing Tools Grid Functionality
let selectedTool = null;
let selectedColor = "#f8794b";

// Tool selection functionality
export function selectTool(element, toolId) {
  // Just log the selection without visual changes
  selectedTool = toolId;
  console.log(`Selected tool: ${toolId}`);
}

// Get the currently selected tool
export function getSelectedTool() {
  return selectedTool;
}

// Color selection functionality for Drawing Tools main colour (icons + mini picker)
export function selectColor(element, color) {
  document.querySelectorAll(".drawing-main-colour .colour-icon").forEach((icon) => {
    icon.classList.remove("selected");
    icon.style.outline = "none";
  });

  if (element) {
    element.classList.add("selected");
    element.style.outline = "2px solid #f8794b";
  }

  selectedColor = color;

  // Update hidden/compact color input and trigger the input event drawing tools listen for
  const colorPicker = document.querySelector("#shapes-text-color-picker");
  if (colorPicker) {
    colorPicker.value = color;
    const inputEvent = new Event("input", { bubbles: true });
    colorPicker.dispatchEvent(inputEvent);
  }
}

// Get the currently selected color
export function getSelectedColor() {
  return selectedColor;
}

// Initialize drawing tools functionality
export function initializeDrawingTools() {
  // Add hover effects for tool items
  document.querySelectorAll(".tool-item").forEach((item) => {
    item.addEventListener("mouseenter", function () {
      // Apply active/selected styling on hover
      this.style.background = "#fff3f0";
      this.style.borderColor = "#f8794b";
      this.style.color = "#f8794b";
      this.style.transform = "translateY(-1px)";
      this.style.boxShadow = "0 2px 12px rgba(255, 107, 61, 0.15)";

      const icon = this.querySelector(".tool-icon");
      const label = this.querySelector(".tool-label");
      if (icon) {
        icon.style.background = "#f8794b";
        icon.style.borderColor = "#f8794b";
        icon.style.color = "white";
      }
      if (label) {
        label.style.color = "#f8794b";
        label.style.fontWeight = "600";
      }
    });

    item.addEventListener("mouseleave", function () {
      // Reset to default styling when not hovering
      this.style.background = "#f8f9fa";
      this.style.borderColor = "#e9ecef";
      this.style.color = "#495057";
      this.style.transform = "translateY(0)";
      this.style.boxShadow = "none";

      const icon = this.querySelector(".tool-icon");
      const label = this.querySelector(".tool-label");
      if (icon) {
        icon.style.background = "#f8794b";
        icon.style.borderColor = "#f8794b";
        icon.style.color = "white";
      }
      if (label) {
        label.style.color = "#495057";
        label.style.fontWeight = "500";
      }
    });

    // Add click handler
    item.addEventListener("click", function () {
      const toolType = this.getAttribute("data-tool") || this.id.replace("-btn", "").replace("add-", "").replace("create-", "");
      selectTool(this, toolType);
    });
  });

  // Hook main drawing colour icons
  document.querySelectorAll(".drawing-main-colour .colour-icon").forEach((icon) => {
    icon.addEventListener("click", function (e) {
      e.preventDefault();
      const color = this.getAttribute("data-color");
      if (color) selectColor(this, color);
    });
  });

  // Hook mini color input for main drawing colour
  const colorPicker = document.querySelector("#shapes-text-color-picker");
  if (colorPicker) {
    colorPicker.addEventListener("input", function () {
      selectedColor = this.value;
      // Clear icon highlight; user picked a custom colour
      document.querySelectorAll(".drawing-main-colour .colour-icon").forEach((icon) => {
        icon.classList.remove("selected");
        icon.style.outline = "none";
      });
    });
  }

  // Initialize with first tool selected (Wall Boundaries) - just set the variable, no visual changes
  selectedTool = "wall-boundaries";
  console.log(`Initialized with tool: ${selectedTool}`);
}