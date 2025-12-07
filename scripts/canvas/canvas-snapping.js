// Handles object snapping to background image points and zones/rooms
export function initCanvasSnapping(fabricCanvas) {
  // Configuration
  let snapThreshold = 10;
  let snapLines = [];
  let isSnapping = false;
  let ZONE_SNAP_THRESHOLD = 25;
  let ROOM_SNAP_THRESHOLD = 25;

  const SNAP_TYPES = {
    corner: ["topLeft", "topRight", "bottomLeft", "bottomRight"],
    centerPoint: ["centerTop", "centerBottom", "centerLeft", "centerRight"],
    edge: ["left", "right", "centerV", "top", "bottom", "centerH"],
  };

  // Helper functions
  const isDeviceSnappingEnabled = () => {
    const snapToggle = document.getElementById("snap-device-toggle");
    return !snapToggle || !snapToggle.checked;
  };

  const hasBackgroundImage = () => {
    const bg = fabricCanvas.getObjects().find((obj) => obj.isBackground === true);
    return bg && bg.width && bg.height;
  };

  const isDeviceObject = (obj) => obj.type === "group" && obj.deviceType && obj.deviceType !== "title-block";
  const calculateDistance = (point1, point2) => Math.sqrt(Math.pow(point1.x - point2.x, 2) + Math.pow(point1.y - point2.y, 2));

  // Get background image snap points
  const getSnapPoints = () => {
    const bg = fabricCanvas.getObjects().find((obj) => obj.isBackground === true);
    if (!bg?.width || !bg?.height) return null;

    const left = bg.left;
    const top = bg.top;
    const width = bg.getScaledWidth();
    const height = bg.getScaledHeight();
    const right = left + width;
    const bottom = top + height;
    const centerX = left + width / 2;
    const centerY = top + height / 2;

    return {
      // Corner points
      topLeft: { x: left, y: top },
      topRight: { x: right, y: top },
      bottomLeft: { x: left, y: bottom },
      bottomRight: { x: right, y: bottom },

      // Center points
      center: { x: centerX, y: centerY },
      centerTop: { x: centerX, y: top },
      centerBottom: { x: centerX, y: bottom },
      centerLeft: { x: left, y: centerY },
      centerRight: { x: right, y: centerY },

      // Edge values
      edges: { top, bottom, left, right, centerH: centerY, centerV: centerX },
      bounds: { left, top, right, bottom },
    };
  };

  // Snap line management
  const createSnapLine = (x1, y1, x2, y2) =>
    new fabric.Line([x1, y1, x2, y2], {
      stroke: "#FF6B35",
      strokeWidth: 1,
      strokeDashArray: [5, 5],
      selectable: false,
      evented: false,
      excludeFromExport: true,
      isSnapLine: true,
      opacity: 0.8,
    });

  const clearSnapLines = () => {
    snapLines.forEach((line) => fabricCanvas.remove(line));
    snapLines = [];
    fabricCanvas.renderAll();
  };

  const addSnapLine = (line) => {
    snapLines.push(line);
    fabricCanvas.add(line);
  };

  const showSnapLines = (snapPoint, type, bounds) => {
    clearSnapLines();
    const { left, right, top, bottom } = bounds;

    const lineConfigs = {
      corner: [
        [left, snapPoint.y, right, snapPoint.y],
        [snapPoint.x, top, snapPoint.x, bottom],
      ],
      center: [
        [left, snapPoint.y, right, snapPoint.y],
        [snapPoint.x, top, snapPoint.x, bottom],
      ],
      centerH: [[left, snapPoint.y, right, snapPoint.y]],
      centerV: [[snapPoint.x, top, snapPoint.x, bottom]],
      edge: [snapPoint.isVertical ? [snapPoint.x, top, snapPoint.x, bottom] : [left, snapPoint.y, right, snapPoint.y]],
    };

    lineConfigs[type]?.forEach((coords) => addSnapLine(createSnapLine(...coords)));

    // Position snap lines correctly
    snapLines.forEach((line) => line.moveTo(fabricCanvas.getObjects().length - 2));
    fabricCanvas.renderAll();
  };

  // Snapping checks
  const checkSnapPoints = (obj, objCenter, snapData, pointType, threshold = snapThreshold) => {
    const points = SNAP_TYPES[pointType];
    if (!points) return null;

    for (const pointName of points) {
      const point = snapData[pointName];
      if (!point) continue;

      const distance = calculateDistance(objCenter, point);
      if (distance <= threshold) {
        obj.set({ left: point.x, top: point.y });
        obj.setCoords();

        const displayType = pointType === "centerPoint" ? (pointName.includes("Top") || pointName.includes("Bottom") ? "centerV" : "centerH") : pointType;

        showSnapLines(point, displayType, snapData.bounds);
        return { snapped: true, point, type: displayType };
      }
    }
    return null;
  };

  const checkEdgeAlignment = (obj, objCenter, edges, bounds) => {
    const edgeChecks = [
      { edge: "left", isVertical: true },
      { edge: "right", isVertical: true },
      { edge: "centerV", isVertical: true },
      { edge: "top", isVertical: false },
      { edge: "bottom", isVertical: false },
      { edge: "centerH", isVertical: false },
    ];

    for (const { edge, isVertical } of edgeChecks) {
      const edgeValue = edges[edge];
      const objValue = isVertical ? objCenter.x : objCenter.y;

      if (Math.abs(objValue - edgeValue) <= snapThreshold) {
        const newPos = isVertical ? { left: edgeValue } : { top: edgeValue };
        obj.set(newPos);
        obj.setCoords();

        const snapPoint = isVertical ? { x: edgeValue, y: objCenter.y, isVertical: true } : { x: objCenter.x, y: edgeValue, isVertical: false };

        showSnapLines(snapPoint, "edge", bounds);
        return { snapped: true, point: snapPoint, type: "edge" };
      }
    }
    return null;
  };

  const checkSnapping = (obj) => {
    if (!hasBackgroundImage()) return { snapped: false };

    const objCenter = obj.getCenterPoint();
    const snapData = getSnapPoints();
    if (!snapData) return { snapped: false };

    // Check different snap types in order of priority
    const snapChecks = [
      () => checkSnapPoints(obj, objCenter, snapData, "corner"),
      () => {
        const centerDistance = calculateDistance(objCenter, snapData.center);
        if (centerDistance <= snapThreshold) {
          obj.set({ left: snapData.center.x, top: snapData.center.y });
          obj.setCoords();
          showSnapLines(snapData.center, "center", snapData.bounds);
          return { snapped: true, point: snapData.center, type: "center" };
        }
        return null;
      },
      () => checkSnapPoints(obj, objCenter, snapData, "centerPoint"),
      () => checkEdgeAlignment(obj, objCenter, snapData.edges, snapData.bounds),
    ];

    for (const check of snapChecks) {
      const result = check();
      if (result?.snapped) return result;
    }

    return { snapped: false };
  };

  // Zone/Room snapping
  const isNearOriginal = (currentCenter, originalCenter, threshold) => calculateDistance(currentCenter, originalCenter) <= threshold;

  const handleZoneSnapping = (obj) => {
    if (!obj.originalCenter) return false;

    const currentCenter = obj.getCenterPoint();
    if (!isNearOriginal(currentCenter, obj.originalCenter, ZONE_SNAP_THRESHOLD)) return false;

    const deltaX = obj.originalCenter.x - currentCenter.x;
    const deltaY = obj.originalCenter.y - currentCenter.y;

    obj.set({ left: obj.left + deltaX, top: obj.top + deltaY });

    // Update associated text
    const zone = window.zones?.find((z) => z.polygon === obj);
    if (zone?.text && fabricCanvas.getObjects().includes(zone.text)) {
      const newCenter = obj.getCenterPoint();
      zone.text.set({
        left: newCenter.x + (zone.text.offsetX || 0),
        top: newCenter.y + (zone.text.offsetY || 0),
      });
      zone.text.setCoords();
    }

    obj.setCoords();
    return true;
  };

  const handleRoomSnapping = (obj) => {
    if (!obj.originalCenter) return false;

    const currentCenter = obj.getCenterPoint();
    if (!isNearOriginal(currentCenter, obj.originalCenter, ROOM_SNAP_THRESHOLD)) return false;

    const deltaX = obj.originalCenter.x - currentCenter.x;
    const deltaY = obj.originalCenter.y - currentCenter.y;

    obj.set({ left: obj.left + deltaX, top: obj.top + deltaY });

    // Update associated text
    const room = window.rooms?.find((r) => r.polygon === obj);
    if (room?.text && fabricCanvas.getObjects().includes(room.text)) {
      const newCenter = obj.getCenterPoint();
      room.text.set({
        left: newCenter.x + (room.text.offsetX || 0),
        top: newCenter.y + (room.text.offsetY || 0),
      });
      room.text.setCoords();
    }

    obj.setCoords();
    return true;
  };

  // Event handlers
  const setupEventHandlers = () => {
    fabricCanvas.on("object:moving", (e) => {
      const obj = e.target;

      // Suppress snapping visuals while loading
      if (window.isLoadingProject || window.isLoadingFloor) {
        if (snapLines.length > 0) clearSnapLines();
        return;
      }

      // Device snapping (if enabled)
      if (isDeviceSnappingEnabled() && hasBackgroundImage() && isDeviceObject(obj)) {
        const snapResult = checkSnapping(obj);
        isSnapping = snapResult.snapped;
        return;
      }

      // Zone snapping (always enabled)
      if (obj?.type === "polygon" && obj.class === "zone-polygon") {
        handleZoneSnapping(obj);
        return;
      }

      // Room snapping (always enabled)
      if (obj?.type === "polygon" && obj.class === "room-polygon") {
        handleRoomSnapping(obj);
        return;
      }

      // Clear snap lines for non-snappable objects
      if (snapLines.length > 0) {
        clearSnapLines();
        isSnapping = false;
      }
    });

    fabricCanvas.on("object:moved", () => {
      setTimeout(() => {
        clearSnapLines();
        isSnapping = false;
      }, 100);
    });

    fabricCanvas.on("selection:cleared", () => {
      clearSnapLines();
      isSnapping = false;
    });

    fabricCanvas.on("canvas:cleared", () => {
      snapLines = [];
      isSnapping = false;
    });
  };

  // Initialize snap toggle
  const initializeSnapToggle = () => {
    const snapToggle = document.getElementById("snap-device-toggle");
    if (!snapToggle) return;

    snapToggle.addEventListener("change", () => {
      if (!isDeviceSnappingEnabled()) {
        clearSnapLines();
        isSnapping = false;
      }
    });
  };

  // Initialize everything
  setupEventHandlers();
  initializeSnapToggle();

  return {
    setSnapThreshold: (threshold) => {
      snapThreshold = threshold;
    },
    getSnapThreshold: () => snapThreshold,
    setZoneSnapThreshold: (threshold) => {
      ZONE_SNAP_THRESHOLD = Math.max(10, Math.min(100, threshold));
    },
    setRoomSnapThreshold: (threshold) => {
      ROOM_SNAP_THRESHOLD = Math.max(10, Math.min(100, threshold));
    },
    isDeviceSnappingEnabled,
    clearSnapLines,
    isSnapping: () => isSnapping,
    hasBackgroundImage,
  };
}
