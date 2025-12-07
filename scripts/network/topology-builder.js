// Topology Builder modal logic: builds a separate canvas for arranging topology
// Requires Fabric.js loaded globally and window.topologyManager available

import { getPrintInputs, proceedWithPrint } from "../export/canvas-print.js";

// Sets up the topology builder modal and canvas
function initTopologyBuilder(mainCanvas) {
  const openBtn = document.getElementById("open-topology-builder-btn");
  const modalEl = document.getElementById("topologyModal");
  const dlBtn = document.getElementById("topology-download");
  const printBtn = document.getElementById("topology-print");
  const addShotBtn = document.getElementById("topology-add-screenshot");
  const autolayoutBtn = document.getElementById("topology-autolayout");
  const wrapper = document.getElementById("topology-canvas-wrapper");
  const canvasEl = document.getElementById("topology-canvas");

  if (!openBtn || !modalEl || !wrapper || !canvasEl) return;

  let modal = null;
  let topoCanvas = null;
  let nodeMap = new Map(); // Maps device IDs to their canvas clones
  let tempConnections = []; // Stores connection lines and split points
  let workingConnections = new Map(); // Maps connection IDs to connection data
  let fixedConnectionDistances = new Map(); // Stores fixed distance text per connection id
  let baselinePixelsPerMeter = null; // Pixels-per-meter captured at open time
  let toModalPoint = (pt) => pt; // Converts main canvas points to modal points
  let lastSelectedSegment = null; // Tracks which connection segment was clicked
  let activeHighlight = null; // Tracks what should be highlighted
  let currentMargins = { SAFE_MARGIN_X: 24, SAFE_MARGIN_TOP: 24, SAFE_MARGIN_BOTTOM: 48 };
  let initialNodePositions = new Map(); // Stores original device positions
  let initialConnectionNodes = new Map(); // Stores original split point positions

  // Storage key for topology positions
  const STORAGE_KEY = "topologyMapPositions";

  // Saves device positions to localStorage
  function saveTopologyPositions() {
    if (!topoCanvas || !nodeMap.size) return;
    const positions = {};
    nodeMap.forEach((node, deviceId) => {
      const center = node.getCenterPoint();
      positions[deviceId] = { x: center.x, y: center.y };
    });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
    } catch (e) {
      console.warn("Failed to save topology positions:", e);
    }
    return positions;
  }

  // Loads device positions from localStorage
  function loadTopologyPositions() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch (e) {
      console.warn("Failed to load topology positions:", e);
      return {};
    }
  }

  // Gets topology positions for saving (can be called even when modal is closed)
  function getTopologyPositions() {
    // Try to get from localStorage first
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? JSON.parse(stored) : {};
    } catch (e) {
      // If modal is open, get from current positions
      if (topoCanvas && nodeMap.size) {
        const positions = {};
        nodeMap.forEach((node, deviceId) => {
          const center = node.getCenterPoint();
          positions[deviceId] = { x: center.x, y: center.y };
        });
        return positions;
      }
      return {};
    }
  }

  // Sets topology positions (for loading saved projects)
  function setTopologyPositions(positions) {
    if (!positions || typeof positions !== "object") return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
    } catch (e) {
      console.warn("Failed to set topology positions:", e);
    }
  }

  // Clears saved topology positions
  function clearTopologyPositions() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn("Failed to clear topology positions:", e);
    }
  }

  const styles = {
    line: { stroke: "#2196F3", strokeWidth: 2 },
    lineHighlight: { stroke: "#FF6B35", strokeWidth: 3 },
    split: { radius: 6, fill: "#FF6B35", stroke: "#fff", strokeWidth: 2 },
    splitHighlight: { radius: 7, fill: "#FFD700" },
  };

  // Creates the modal if it doesn't exist
  function ensureModal() {
    if (!modal && typeof bootstrap !== "undefined") {
      modal = new bootstrap.Modal(modalEl);
    }
  }

  // Creates the topology canvas and places devices
  function buildTopology() {
    // Clear any existing canvas
    if (topoCanvas) {
      try {
        topoCanvas.dispose();
      } catch (_) {}
      topoCanvas = null;
    }

    // Make canvas fit the modal wrapper
    const w = wrapper.clientWidth;
    const h = wrapper.clientHeight;
    canvasEl.width = w;
    canvasEl.height = h;
    topoCanvas = new fabric.Canvas(canvasEl, { width: w, height: h, backgroundColor: "#ffffff" });

    // Clear all stored data
    nodeMap.clear();
    tempConnections.length = 0;
    workingConnections.clear();
    initialNodePositions.clear();
    initialConnectionNodes.clear();

    // Get all devices from the main canvas
    const allDevices = mainCanvas.getObjects().filter((o) => o.type === "group" && o.deviceType);

    // Get connections first to determine which devices have links
    const topologyMgr = window.topologyManager;
    const connectedDeviceIds = new Set();
    let connectionsData = [];

    if (topologyMgr) {
      connectionsData = topologyMgr.getConnectionsData();
      connectionsData.forEach((conn) => {
        if (conn.device1Id) connectedDeviceIds.add(conn.device1Id);
        if (conn.device2Id) connectedDeviceIds.add(conn.device2Id);
      });
    }

    // Filter devices to only include those with connections
    // Use topology manager's getDeviceId to ensure consistent ID matching
    const devices = allDevices.filter((dev) => {
      const deviceId = topologyMgr && typeof topologyMgr.getDeviceId === "function" ? topologyMgr.getDeviceId(dev) : getStableId(dev);
      const hasConnection = connectedDeviceIds.has(deviceId);
      // Debug: log filtered devices
      if (!hasConnection && dev.deviceType) {
        console.debug(`[Topology] Filtering out device: ${deviceId} (${dev.textObject?.text || dev.deviceType || "unknown"}) - no connections`);
      }
      return hasConnection;
    });

    // Debug: log summary
    if (connectedDeviceIds.size > 0) {
      console.debug(`[Topology] Showing ${devices.length} connected devices out of ${allDevices.length} total. Connected IDs:`, Array.from(connectedDeviceIds).slice(0, 5));
    }

    // Early return if no connections exist - don't show any devices
    if (connectionsData.length === 0 || connectedDeviceIds.size === 0) {
      topoCanvas.requestRenderAll();
      return;
    }

    // Set up spacing and margins for the modal
    const NODE_RADIUS = 18;
    const LABEL_OFFSET = 28;
    const LABEL_HEIGHT = 16;
    const SAFE_MARGIN_X = Math.max(20, NODE_RADIUS + 8);
    const SAFE_MARGIN_TOP = Math.max(20, NODE_RADIUS + 8);
    const SAFE_MARGIN_BOTTOM = Math.max(24, NODE_RADIUS + LABEL_OFFSET + LABEL_HEIGHT + 8);
    currentMargins = { SAFE_MARGIN_X, SAFE_MARGIN_TOP, SAFE_MARGIN_BOTTOM };

    // Map main canvas device positions into the modal while preserving relative layout
    const bounds = computeDeviceBounds(devices);
    // Use inner padding so topology does not hug the edges
    const PADDING_FACTOR = 0.9; // 90% of the available space
    const fullAvailableWidth = w - SAFE_MARGIN_X * 2;
    const fullAvailableHeight = h - (SAFE_MARGIN_TOP + SAFE_MARGIN_BOTTOM);
    const availableWidth = fullAvailableWidth * PADDING_FACTOR;
    const availableHeight = fullAvailableHeight * PADDING_FACTOR;
    const sourceWidth = Math.max(1, bounds.maxX - bounds.minX);
    const sourceHeight = Math.max(1, bounds.maxY - bounds.minY);
    const uniformScale = Math.min(availableWidth / sourceWidth, availableHeight / sourceHeight);
    // Center the mapped area within the safe margins
    const centerOffsetX = SAFE_MARGIN_X + (fullAvailableWidth - availableWidth) / 2;
    const centerOffsetY = SAFE_MARGIN_TOP + (fullAvailableHeight - availableHeight) / 2;

    // Converter from main canvas point to modal point (scaled + centered within margins)
    toModalPoint = (pt) => {
      const sx = (pt.x - bounds.minX) * uniformScale + centerOffsetX;
      const sy = (pt.y - bounds.minY) * uniformScale + centerOffsetY;
      return clampToCanvas({ x: sx, y: sy }, SAFE_MARGIN_X, SAFE_MARGIN_TOP, SAFE_MARGIN_BOTTOM);
    };

    // Load saved positions if they exist
    const savedPositions = loadTopologyPositions();

    // Create device clones at mapped positions
    devices.forEach((dev) => {
      const id = topologyMgr && typeof topologyMgr.getDeviceId === "function" ? topologyMgr.getDeviceId(dev) : getStableId(dev);
      const c = getCenter(dev);
      let pos;

      // Use saved position if available, otherwise use mapped position
      if (savedPositions[id]) {
        // Validate saved position is within canvas bounds
        const saved = savedPositions[id];
        pos = clampToCanvas({ x: saved.x, y: saved.y }, SAFE_MARGIN_X, SAFE_MARGIN_TOP, SAFE_MARGIN_BOTTOM);
      } else {
        pos = toModalPoint(c);
      }

      const clone = makeNodeClone(dev, pos.x, pos.y, { SAFE_MARGIN_X, SAFE_MARGIN_TOP, SAFE_MARGIN_BOTTOM });
      topoCanvas.add(clone);
      if (clone.textObject) topoCanvas.add(clone.textObject);
      nodeMap.set(id, clone);
      initialNodePositions.set(id, { x: pos.x, y: pos.y });
    });

    // Load connections from the main canvas - simplified straight-line representation
    if (topologyMgr && connectionsData.length > 0) {
      // Capture baseline scale and precompute fixed distances from MAIN canvas geometry
      baselinePixelsPerMeter = mainCanvas.pixelsPerMeter || 17.5;
      fixedConnectionDistances.clear();
      // Helper to get device center from main canvas by id
      const getMainDeviceCenterById = (devId) => {
        const dev = typeof topologyMgr.findDeviceById === "function" ? topologyMgr.findDeviceById(devId) : null;
        if (dev) {
          const c = dev.getCenterPoint ? dev.getCenterPoint() : { x: dev.left, y: dev.top };
          return { x: c.x, y: c.y };
        }
        // Fallback: try to find by id in objects
        const candidate = mainCanvas.getObjects().find((o) => o.type === "group" && getStableId(o) === devId);
        if (candidate) {
          const c = candidate.getCenterPoint ? candidate.getCenterPoint() : { x: candidate.left, y: candidate.top };
          return { x: c.x, y: c.y };
        }
        return { x: 0, y: 0 };
      };

      connectionsData.forEach((conn) => {
        // Build the full path using split points from MAIN canvas data
        const d1 = getMainDeviceCenterById(conn.device1Id);
        const d2 = getMainDeviceCenterById(conn.device2Id);
        const points = [d1, ...(conn.splitPoints || []).map((p) => ({ x: p.x, y: p.y })), d2];
        let total = 0;
        for (let i = 0; i < points.length - 1; i++) {
          const dx = points[i + 1].x - points[i].x;
          const dy = points[i + 1].y - points[i].y;
          total += Math.hypot(dx, dy);
        }
        const distMeters = (total / baselinePixelsPerMeter).toFixed(2);
        fixedConnectionDistances.set(conn.id, distMeters);
      });
      connectionsData.forEach((conn) => {
        const id = normalizeId(conn.device1Id, conn.device2Id);
        workingConnections.set(id, {
          id,
          device1Id: conn.device1Id,
          device2Id: conn.device2Id,
          nodes: [], // No split points in simplified vertical layout
        });
        // Save original positions for reset button (empty for vertical layout)
        initialConnectionNodes.set(id, []);
      });
    }

    // Draw all connections and set up layering
    renderAllFromWorking();
    enforceZOrder();

    // Update connections when devices move
    topoCanvas.on("object:moving", () => {
      rerenderAllConnections();
    });

    // Save positions when device movement ends
    topoCanvas.on("object:modified", () => {
      saveTopologyPositions();
    });

    // Handle clicking empty space to clear highlights
    topoCanvas.on("mouse:down", (e) => {
      if (!e.target) {
        activeHighlight = null;
        topoCanvas.discardActiveObject();
        clearAllSegmentHighlights();
        topoCanvas.requestRenderAll();
      }
    });

    // Handle selection changes
    const onSelectionChange = (e) => {
      const sel = e && e.selected ? e.selected[0] : topoCanvas.getActiveObject();
      if (sel && sel._deviceId) {
        activeHighlight = { type: "device", id: sel._deviceId };
        highlightConnectionsForDevice(sel);
      } else {
        clearAllSegmentHighlights();
        activeHighlight = null;
        topoCanvas.requestRenderAll();
      }
    };
    // Set up selection event listeners
    topoCanvas.on("selection:created", onSelectionChange);
    topoCanvas.on("selection:updated", onSelectionChange);
    topoCanvas.on("selection:cleared", () => {
      activeHighlight = null;
      clearAllSegmentHighlights();
      topoCanvas.requestRenderAll();
    });
    // Refresh canvas
    setTimeout(() => topoCanvas.requestRenderAll(), 50);
  }

  // Redraws all connections when something changes
  function rerenderAllConnections() {
    // Remove old connection lines and labels
    const toRemove = topoCanvas.getObjects().filter((o) => o._isTopoSegment || o._isTopoLabel);
    toRemove.forEach((o) => topoCanvas.remove(o));
    tempConnections.length = 0;

    // Draw all connections again
    renderAllFromWorking();
    enforceZOrder();
    // Re-highlight based on current selection
    const active = topoCanvas.getActiveObject();
    if (active && active._deviceId) {
      highlightConnectionsForDevice(active);
    }
    topoCanvas.requestRenderAll();
  }

  // Draws all connections from the working data with simplified rendering
  function renderAllFromWorking() {
    // Group connections by device pairs
    const connectionGroups = new Map();

    workingConnections.forEach((wc) => {
      const n1 = nodeMap.get(wc.device1Id);
      const n2 = nodeMap.get(wc.device2Id);
      if (!n1 || !n2) return;

      // Create a key for the device pair (order independent)
      const pairKey = wc.device1Id < wc.device2Id ? `${wc.device1Id}_${wc.device2Id}` : `${wc.device2Id}_${wc.device1Id}`;

      if (!connectionGroups.has(pairKey)) {
        connectionGroups.set(pairKey, []);
      }

      connectionGroups.get(pairKey).push({
        id: wc.id,
        device1: n1,
        device2: n2,
        device1Id: wc.device1Id,
        device2Id: wc.device2Id,
        nodes: wc.nodes,
      });
    });

    // Render each group of connections
    connectionGroups.forEach((connections) => {
      if (connections.length === 1) {
        // Single connection - draw one line
        renderConnectionStandalone(topoCanvas, connections[0], tempConnections, null);
      } else {
        // Multiple connections - draw multiple parallel lines
        renderMultipleConnections(topoCanvas, connections, tempConnections);
      }
    });
  }

  // Keeps devices above lines
  function enforceZOrder() {
    if (!topoCanvas) return;
    const objs = topoCanvas.getObjects();
    const lines = objs.filter((o) => o._isTopoSegment);
    const devices = objs.filter((o) => o.type === "group" && o._deviceId);
    const labels = objs.filter((o) => o.type === "text" && o.isDeviceLabel !== true && !o._isTopoSegment);

    // Put lines at the back
    lines.forEach((l) => topoCanvas.sendToBack(l));

    // Put devices and labels above lines
    devices.forEach((d) => topoCanvas.bringToFront(d));
    labels.forEach((t) => topoCanvas.bringToFront(t));
  }

  // Gets device ID, preferring topology manager's method for consistency
  function getDeviceIdConsistent(device) {
    if (!device) return null;
    const topologyMgr = window.topologyManager;
    if (topologyMgr && typeof topologyMgr.getDeviceId === "function") {
      return topologyMgr.getDeviceId(device);
    }
    return getStableId(device);
  }

  // Creates a device clone for the topology view
  function makeNodeClone(device, x, y, margins) {
    const circle = new fabric.Circle({ radius: 18, fill: "#f8794b", originX: "center", originY: "center" });
    const img = getGroupImage(device);
    const groupChildren = [circle];
    if (img) groupChildren.push(img);
    const g = new fabric.Group(groupChildren, {
      left: x,
      top: y,
      originX: "center",
      originY: "center",
      hasControls: false,
      selectable: true,
      hoverCursor: "move",
      _deviceId: getStableId(device),
    });

    // Create device label
    const text = new fabric.Text(getGroupLabel(device) || "Device", {
      fontFamily: "Poppins, sans-serif",
      fontSize: 12,
      fill: "#FFFFFF",
      backgroundColor: "rgba(20,18,18,0.8)",
      originX: "center",
      originY: "top",
      left: x,
      top: y + 28,
      selectable: false,
      _isDeviceLabel: true,
    });
    g.textObject = text;

    // Handle device movement
    g.on("moving", () => {
      // Keep device inside canvas bounds
      const clamped = clampToCanvas(g.getCenterPoint(), margins?.SAFE_MARGIN_X || 24, margins?.SAFE_MARGIN_TOP || 24, margins?.SAFE_MARGIN_BOTTOM || 48);
      g.set({ left: clamped.x, top: clamped.y });
      const c = g.getCenterPoint();
      text.set({ left: c.x, top: c.y + 28 });
      text.setCoords();
      // Keep proper layering
      g.bringToFront();
      text.bringToFront();
    });
    g.on("removed", () => {
      if (text) topoCanvas.remove(text);
    });

    return g;
  }

  // Gets the device icon from a device group
  function getGroupImage(group) {
    try {
      const childImg = (group._objects || []).find((o) => o.type === "image");
      if (childImg && childImg._element) {
        // Copy the existing icon
        const el = childImg._element.cloneNode(true);
        const img = new fabric.Image(el, { originX: "center", originY: "center" });
        // Make it the right size
        const target = 24;
        const scaleX = target / img.width;
        const scaleY = target / img.height;
        img.set({ scaleX, scaleY });
        return img;
      }
      // Try to load from filename
      if (group.deviceType && group.deviceType.endsWith(".png")) {
        const src = `./images/devices/${group.deviceType}`;
        const imgObj = new fabric.Image(document.createElement("img"), { originX: "center", originY: "center" });
        imgObj._element.src = src;
        imgObj._element.onload = () => {
          const target = 24;
          const scaleX = target / imgObj._element.naturalWidth;
          const scaleY = target / imgObj._element.naturalHeight;
          imgObj.set({ scaleX, scaleY });
          topoCanvas && topoCanvas.requestRenderAll();
        };
        return imgObj;
      }
    } catch (_) {}
    // Use a simple square if no icon found
    const size = 24;
    return new fabric.Rect({ width: size, height: size, fill: "#fff", originX: "center", originY: "center" });
  }

  // Gets the center point of a device
  function getCenter(device) {
    const c = device.getCenterPoint ? device.getCenterPoint() : { x: device.left, y: device.top };
    return { x: c.x, y: c.y };
  }

  // Finds the bounds of all devices
  function computeDeviceBounds(devices) {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    devices.forEach((d) => {
      const c = getCenter(d);
      if (typeof c.x === "number" && typeof c.y === "number") {
        if (c.x < minX) minX = c.x;
        if (c.y < minY) minY = c.y;
        if (c.x > maxX) maxX = c.x;
        if (c.y > maxY) maxY = c.y;
      }
    });
    if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
      // Use default bounds if no devices
      return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
    }
    return { minX, minY, maxX, maxY };
  }

  // Keeps a point inside the canvas bounds
  function clampToCanvas(point, marginX, marginTop, marginBottom) {
    const w = topoCanvas ? topoCanvas.getWidth() : wrapper ? wrapper.clientWidth : 0;
    const h = topoCanvas ? topoCanvas.getHeight() : wrapper ? wrapper.clientHeight : 0;
    const x = Math.max(marginX, Math.min(w - marginX, point.x));
    const y = Math.max(marginTop, Math.min(h - marginBottom, point.y));
    return { x, y };
  }

  // Gets the text label from a device group
  function getGroupLabel(group) {
    return group?.textObject?.text || group?.initialLabelText || "";
  }

  // Creates a stable ID for a device
  function getStableId(group) {
    return group?.id || group?._topologyId || (group.id = `device_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`);
  }

  // Calculates grid position for devices
  function gridPos(i, cols, cellW, cellH, w, h) {
    const rows = Math.ceil((i + 1) / cols);
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = (col + 0.5) * cellW;
    const y = (row + 0.5) * cellH + 20;
    return { x: Math.min(x, w - 40), y: Math.min(y, h - 60) };
  }

  // Draws a simplified connection with a single line between device centers
  function renderConnectionStandalone(canvas, connection, registry, workingRef) {
    const getCenter = (dev) => (dev.getCenterPoint ? dev.getCenterPoint() : { x: dev.left, y: dev.top });
    const d1 = getCenter(connection.device1);
    const d2 = getCenter(connection.device2);

    // Calculate distance
    // Use precomputed fixed distance captured at open time
    const distanceInMeters = fixedConnectionDistances.get(connection.id) || "";

    // Check if there's custom text to extend the line
    const topologyMgr = window.topologyManager;
    let connectionProperties = null;
    if (topologyMgr) {
      const connectionsData = topologyMgr.getConnectionsData();
      connectionProperties = connectionsData.find((c) => c.id === connection.id)?.properties;
    }

    const hasCustomText = connectionProperties?.label || (connectionProperties?.customTextLabels && connectionProperties.customTextLabels.length > 0);

    // Extend line endpoints if there's custom text for better visibility
    let lineStart = d1;
    let lineEnd = d2;
    if (hasCustomText) {
      const extension = 20; // pixels to extend the line
      const angle = Math.atan2(d2.y - d1.y, d2.x - d1.x);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      lineStart = {
        x: d1.x - cos * extension,
        y: d1.y - sin * extension,
      };
      lineEnd = {
        x: d2.x + cos * extension,
        y: d2.y + sin * extension,
      };
    }

    // Create a single line between device centers (extended if needed)
    const line = new fabric.Line([lineStart.x, lineStart.y, lineEnd.x, lineEnd.y], {
      ...styles.line,
      selectable: false,
      hasControls: false,
      hasBorders: false,
      evented: false,
      _isTopoSegment: true,
      connectionId: connection.id,
      segmentIndex: 0,
    });
    canvas.add(line);
    registry.push(line);

    // Create custom text label (no distance)
    createTopologyConnectionLabel(canvas, connection, d1, d2, distanceInMeters, registry);
  }

  // Draws multiple parallel lines for multiple connections between the same devices
  function renderMultipleConnections(canvas, connections, registry) {
    const getCenter = (dev) => (dev.getCenterPoint ? dev.getCenterPoint() : { x: dev.left, y: dev.top });
    const d1 = getCenter(connections[0].device1);
    const d2 = getCenter(connections[0].device2);

    // Calculate distance
    // Use precomputed fixed distance captured at open time
    const distanceInMeters = fixedConnectionDistances.get(connections[0].id) || "";

    // Check if there's custom text to extend the lines
    const topologyMgr = window.topologyManager;
    let connectionProperties = null;
    if (topologyMgr) {
      const connectionsData = topologyMgr.getConnectionsData();
      connectionProperties = connectionsData.find((c) => c.id === connections[0].id)?.properties;
    }

    const hasCustomText = connectionProperties?.label || (connectionProperties?.customTextLabels && connectionProperties.customTextLabels.length > 0);

    // Extend line endpoints if there's custom text for better visibility
    let lineStart = d1;
    let lineEnd = d2;
    if (hasCustomText) {
      const extension = 20; // pixels to extend the line
      const angle = Math.atan2(d2.y - d1.y, d2.x - d1.x);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);

      lineStart = {
        x: d1.x - cos * extension,
        y: d1.y - sin * extension,
      };
      lineEnd = {
        x: d2.x + cos * extension,
        y: d2.y + sin * extension,
      };
    }

    // For vertical layout, create horizontal parallel lines
    const spacing = 6; // pixels between lines
    const totalWidth = (connections.length - 1) * spacing;
    const startOffset = -totalWidth / 2;

    connections.forEach((connection, index) => {
      const offset = startOffset + index * spacing;

      const line = new fabric.Line([lineStart.x + offset, lineStart.y, lineEnd.x + offset, lineEnd.y], {
        ...styles.line,
        selectable: false,
        hasControls: false,
        hasBorders: false,
        evented: false,
        _isTopoSegment: true,
        connectionId: connection.id,
        segmentIndex: 0,
      });
      canvas.add(line);
      registry.push(line);
    });

    // Create custom text label for the first connection (representing all)
    createTopologyConnectionLabel(canvas, connections[0], d1, d2, distanceInMeters, registry);
  }

  // Creates a text label for a topology connection showing custom text and scale/distance
  function createTopologyConnectionLabel(canvas, connection, d1, d2, distanceInMeters, registry) {
    // Get connection properties from topology manager
    const topologyMgr = window.topologyManager;
    let connectionProperties = null;
    if (topologyMgr) {
      const connectionsData = topologyMgr.getConnectionsData();
      connectionProperties = connectionsData.find((c) => c.id === connection.id)?.properties;
    }

    // Show custom text and scale/distance
    const label = connectionProperties?.label || "";
    const customTextLabels = connectionProperties?.customTextLabels || [];
    const showDistance = true;
    const distanceText = showDistance ? `${distanceInMeters} m` : "";

    // Check if there's any custom text to show
    const hasCustomText = label || (customTextLabels && customTextLabels.length > 0);
    const shouldShowMain = hasCustomText || distanceText;
    if (!shouldShowMain) return;

    // Find the middle point of the connection
    const midX = (d1.x + d2.x) / 2;
    const midY = (d1.y + d2.y) / 2;

    // Show main label: combine scale and custom label if present
    if (shouldShowMain) {
      const mainText = label ? `${distanceText}${distanceText ? " | " : ""}${label}` : distanceText;
      const textLabel = new fabric.Text(mainText, {
        left: midX,
        top: midY - 15,
        fontSize: 12,
        fill: "#000000",
        fontFamily: "Poppins, sans-serif",
        backgroundColor: "rgba(255, 255, 255, 0.8)",
        originX: "center",
        originY: "center",
        selectable: false,
        evented: false,
        textAlign: "center",
        _isTopoLabel: true,
        connectionId: connection.id,
      });

      canvas.add(textLabel);
      registry.push(textLabel);
    }

    // Show additional custom text labels if they exist
    if (customTextLabels && customTextLabels.length > 0) {
      customTextLabels.forEach((textData, index) => {
        // Calculate position along the connection line
        const ratio = textData.pathRatio || 0.5; // Default to middle if no ratio
        const textX = d1.x + (d2.x - d1.x) * ratio;
        const textY = d1.y + (d2.y - d1.y) * ratio;

        const customLabel = new fabric.Text(textData.text, {
          left: textX,
          top: textY - 15 - index * 20, // Offset multiple labels vertically
          fontSize: 12,
          fill: "#000000",
          fontFamily: "Poppins, sans-serif",
          backgroundColor: "rgba(255, 255, 255, 0.8)",
          originX: "center",
          originY: "center",
          selectable: false,
          evented: false,
          textAlign: "center",
          _isTopoLabel: true,
          connectionId: connection.id,
        });

        canvas.add(customLabel);
        registry.push(customLabel);
      });
    }
  }

  // Removes highlights from all connection lines
  function clearAllSegmentHighlights() {
    const segs = topoCanvas.getObjects().filter((o) => o._isTopoSegment);
    segs.forEach((s) => s.set({ ...styles.line }));
  }

  // Highlights connections for a specific device
  function highlightConnectionsForDevice(deviceGroup) {
    clearAllSegmentHighlights();
    const deviceId = deviceGroup && deviceGroup._deviceId;
    if (!deviceId) return;
    workingConnections.forEach((wc) => {
      if (wc.device1Id === deviceId || wc.device2Id === deviceId) {
        const segs = topoCanvas.getObjects().filter((o) => o._isTopoSegment && o.connectionId === wc.id);
        segs.forEach((s) => s.set({ ...styles.lineHighlight }));
      }
    });
    topoCanvas.requestRenderAll();
  }

  // Gets the working connection data
  function getWorkingRef(connection) {
    const id = normalizeId(connection.device1Id, connection.device2Id);
    return workingConnections.get(id);
  }

  // Creates a consistent connection ID from two device IDs
  function normalizeId(d1, d2) {
    return d1 < d2 ? `${d1}_${d2}` : `${d2}_${d1}`;
  }

  // Exports the canvas as a PNG image
  function toPngDataUrl(multiplier = 2) {
    topoCanvas.discardActiveObject();
    topoCanvas.requestRenderAll();
    return topoCanvas.toDataURL({ format: "png", multiplier, quality: 1.0 });
  }

  // Sets up button click handlers
  openBtn.addEventListener("click", () => {
    ensureModal();
    if (!modal) return;
    modal.show();
    setTimeout(buildTopology, 200);
  });

  // Reset button re-applies mapped positions from main canvas
  autolayoutBtn?.addEventListener("click", () => {
    if (!topoCanvas) return;
    // Gather current main canvas devices and recompute mapping
    const allDevicesMain = mainCanvas.getObjects().filter((o) => o.type === "group" && o.deviceType);

    // Filter to only devices with connections
    const topologyMgr = window.topologyManager;
    const connectedDeviceIds = new Set();
    if (topologyMgr) {
      const connectionsData = topologyMgr.getConnectionsData();
      connectionsData.forEach((conn) => {
        if (conn.device1Id) connectedDeviceIds.add(conn.device1Id);
        if (conn.device2Id) connectedDeviceIds.add(conn.device2Id);
      });
    }
    const devicesMain = allDevicesMain.filter((dev) => {
      const deviceId = topologyMgr && typeof topologyMgr.getDeviceId === "function" ? topologyMgr.getDeviceId(dev) : getStableId(dev);
      return connectedDeviceIds.has(deviceId);
    });

    const w = topoCanvas.getWidth();
    const h = topoCanvas.getHeight();
    const SAFE_MARGIN_X = currentMargins.SAFE_MARGIN_X;
    const SAFE_MARGIN_TOP = currentMargins.SAFE_MARGIN_TOP;
    const SAFE_MARGIN_BOTTOM = currentMargins.SAFE_MARGIN_BOTTOM;

    const bounds = computeDeviceBounds(devicesMain);
    // Use same inner padding approach as initial build
    const PADDING_FACTOR = 0.9;
    const fullAvailableWidth = w - SAFE_MARGIN_X * 2;
    const fullAvailableHeight = h - (SAFE_MARGIN_TOP + SAFE_MARGIN_BOTTOM);
    const availableWidth = fullAvailableWidth * PADDING_FACTOR;
    const availableHeight = fullAvailableHeight * PADDING_FACTOR;
    const sourceWidth = Math.max(1, bounds.maxX - bounds.minX);
    const sourceHeight = Math.max(1, bounds.maxY - bounds.minY);
    const uniformScale = Math.min(availableWidth / sourceWidth, availableHeight / sourceHeight);

    const centerOffsetX = SAFE_MARGIN_X + (fullAvailableWidth - availableWidth) / 2;
    const centerOffsetY = SAFE_MARGIN_TOP + (fullAvailableHeight - availableHeight) / 2;

    const mapPoint = (pt) => {
      const sx = (pt.x - bounds.minX) * uniformScale + centerOffsetX;
      const sy = (pt.y - bounds.minY) * uniformScale + centerOffsetY;
      return clampToCanvas({ x: sx, y: sy }, SAFE_MARGIN_X, SAFE_MARGIN_TOP, SAFE_MARGIN_BOTTOM);
    };

    // Apply mapped positions
    nodeMap.forEach((node, id) => {
      const sourceDev = devicesMain.find((d) => getStableId(d) === id);
      if (!sourceDev) return;
      const c = getCenter(sourceDev);
      const pos = mapPoint(c);
      node.set({ left: pos.x, top: pos.y });
      if (node.textObject) {
        node.textObject.set({ left: pos.x, top: pos.y + 28 });
        node.textObject.setCoords();
      }
      node.setCoords();
    });

    // Clear saved positions when auto-layout is used
    clearTopologyPositions();

    rerenderAllConnections();
    enforceZOrder();
  });

  // Download button saves the topology as PNG
  dlBtn?.addEventListener("click", () => {
    if (!topoCanvas) return;
    const url = toPngDataUrl(3);
    const a = document.createElement("a");
    a.href = url;
    a.download = "topology-map.png";
    a.click();
  });

  // Add screenshot button adds topology to screenshot list
  addShotBtn?.addEventListener("click", () => {
    if (!topoCanvas) return;
    const url = toPngDataUrl(3);
    // Add to screenshot list
    const screenshot = { dataURL: url, includeInPrint: false, id: Date.now() + Math.random(), title: "Topology Map" };
    try {
      // Try to add via crop module if available
      if (window.canvasCrop && typeof window.canvasCrop.getScreenshots === "function") {
        const shots = window.canvasCrop.getScreenshots();
        shots.push(screenshot);
        // Create preview UI
        const previews = document.getElementById("screenshot-previews");
        if (previews) {
          const item = document.createElement("div");
          item.className = "screenshot-preview-item";
          item.innerHTML = `
            <img class="screenshot-image" src="${url}" alt="Topology Screenshot" />
            <div class="screenshot-controls">
              <label class="screenshot-checkbox-label">
                <input type="checkbox" class="screenshot-checkbox" />
                <span>Include in print</span>
              </label>
              <textarea class="screenshot-title" placeholder="Title or Description" maxlength="74">Topology Map</textarea>
              <button class="screenshot-delete-btn">Delete</button>
            </div>`;
          // Set up delete and checkbox handlers
          const checkbox = item.querySelector(".screenshot-checkbox");
          if (checkbox)
            checkbox.addEventListener("change", () => {
              screenshot.includeInPrint = checkbox.checked;
            });
          const del = item.querySelector(".screenshot-delete-btn");
          if (del)
            del.addEventListener("click", () => {
              const list = window.canvasCrop.getScreenshots();
              const i = list.indexOf(screenshot);
              if (i > -1) list.splice(i, 1);
              item.remove();
              if (window.updateScreenshotStatus) window.updateScreenshotStatus();
            });
          previews.appendChild(item);
          if (window.updateScreenshotStatus) window.updateScreenshotStatus();
        }
      } else {
        // Fallback storage
        window.loadedScreenshots = window.loadedScreenshots || [];
        window.loadedScreenshots.push(screenshot);
        if (window.updateScreenshotStatus) window.updateScreenshotStatus();
      }
    } catch (e) {
      console.warn("Could not add screenshot to list", e);
    }
  });

  // Print button prints the topology
  printBtn?.addEventListener("click", () => {
    if (!topoCanvas) return;
    const url = toPngDataUrl(3);
    // Create screenshot for printing
    const screenshot = { dataURL: url, includeInPrint: true, id: Date.now(), title: "Topology Map" };

    const canvasContainer = document.querySelector(".canvas-container");
    const subSidebar = document.getElementById("sub-sidebar");

    // Use existing print system
    proceedWithPrint(canvasContainer, subSidebar, mainCanvas, getPrintInputs(), [screenshot]);
  });

  // Handle modal resize
  modalEl.addEventListener("shown.bs.modal", () => {
    if (topoCanvas) {
      const w = wrapper.clientWidth;
      const h = wrapper.clientHeight;
      topoCanvas.setDimensions({ width: w, height: h });
      topoCanvas.calcOffset();
      topoCanvas.requestRenderAll();
    }
  });

  // Save positions when modal is hidden
  modalEl.addEventListener("hidden.bs.modal", () => {
    saveTopologyPositions();
  });

  // Expose API for save/load system
  const topologyBuilderAPI = {
    getTopologyPositions,
    setTopologyPositions,
    rebuild: buildTopology,
  };

  // Store on window for save system access
  window.topologyBuilderAPI = topologyBuilderAPI;

  return topologyBuilderAPI;
}

// Export the function for use in other modules
export { initTopologyBuilder };
