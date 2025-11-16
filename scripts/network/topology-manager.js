const DEVICE_TYPES_BY_CATEGORY = {
  cctv: ["fixed-camera.png", "box-camera.png", "dome-camera.png", "ptz-camera.png", "bullet-camera.png", "thermal-camera.png", "custom-camera-icon.png"],
  access: ["access-system.png", "door-entry.png", "gates.png", "vehicle-entry.png", "turnstiles.png", "mobile-entry.png", "pir-icon.png", "card-reader.png", "lock-icon.png"],
  intruder: ["intruder-alarm.png", "panic-alarm.png", "motion-detector.png", "infrared-sensors.png", "pressure-mat.png", "glass-contact.png"],
  fire: ["fire-alarm.png", "fire-extinguisher.png", "fire-blanket.png", "emergency-exit.png", "assembly-point.png", "emergency-telephone.png"],
  networks: ["Series.png", "panel-control.png", "Sensor.png", "interface-unit.png", "access-panel.png", "expander-connection.png", "dvr.png", "nvr.png"],
  custom: ["custom-device-icon.png", "text-device"],
};

const DEVICE_TYPE_LOOKUP = new Map(Object.entries(DEVICE_TYPES_BY_CATEGORY).flatMap(([category, types]) => types.map((type) => [type.toLowerCase(), category])));

const UNIVERSAL_CONNECTION_CATEGORIES = new Set(["custom", "networks"]);

const CATEGORY_LABELS = {
  cctv: "CCTV",
  access: "Access",
  intruder: "Intruder",
  fire: "Fire",
  networks: "Network",
  custom: "Custom",
};

// Panel device types that require channel numbering
const PANEL_DEVICE_TYPES = ["panel-control.png", "access-panel.png", "interface-unit.png", "dvr.png", "nvr.png"];

// Manages network connections between devices
export class TopologyManager {
  constructor(fabricCanvas) {
    this.fabricCanvas = fabricCanvas;
    // Stores all connections
    this.connections = new Map();
    this.updatingSegments = false; // Prevents loops when updating
    this.trackedDevices = new WeakSet(); // Devices with move listeners
    this.deviceIndex = new Map(); // Maps device IDs to device objects
    this._bulkRemovingConnectionIds = new Set(); // Prevents duplicate removals
    this._suppressAllRemovalHandling = false; // Prevents removal during bulk clear
    this._recentConnectionKeys = new Set(); // Prevents duplicate connections
    this.activeHighlight = null; // Tracks what should be highlighted
    this.panelChannels = new Map(); // Tracks channel numbers for each panel device

    // Visual styles for connections
    this.styles = {
      line: { stroke: "#2196F3", strokeWidth: 3 },
      lineHighlight: { stroke: "#FF6B35", strokeWidth: 4 },
      split: { radius: 8, fill: "#FF6B35", stroke: "#fff", strokeWidth: 2 },
      splitHighlight: { radius: 10, fill: "#FFD700" },
    };

    this.initializeTopologySystem();
  }

  // Sets up the topology system
  initializeTopologySystem() {
    // Track device movements
    this.setupDeviceConnectionTracking();
    this.setupDeletionHandling();

    // Handle double-click to add split points
    this.fabricCanvas.on("mouse:down", (e) => {
      // Clicking empty space clears highlights
      if (!e || !e.target) {
        this.activeHighlight = null;
        this.clearConnectionHighlights();
        return;
      }
      if (!e.e) return;
      // Handle double-click on connection segments
      if (e.target.isConnectionSegment && e.e.detail === 2) {
        const pointer = this.fabricCanvas.getPointer(e.e);
        this.addSplitPointAtSegment(e.target, pointer);
        // Keep connection highlighted
        if (e.target.connectionId) {
          this.activeHighlight = { type: "connection", id: e.target.connectionId };
          this.highlightConnectionById(e.target.connectionId);
        }
      }
    });

    // Track new devices
    this.fabricCanvas.on("object:added", (e) => {
      const obj = e.target;
      if (obj && obj.type === "group" && obj.deviceType) {
        this.indexDevice(obj);
        this.rebindConnectionsForDevice(obj);
      }
    });

    // Index existing devices
    try {
      this.fabricCanvas.getObjects().forEach((obj) => {
        if (obj.type === "group" && obj.deviceType) this.indexDevice(obj);
      });
    } catch (_) {}
  }

  // Sets up device movement tracking
  setupDeviceConnectionTracking() {
    // Update connections when devices move
    this.fabricCanvas.on("object:moving", (e) => {
      if (e.target && e.target.type === "group" && e.target.deviceType) {
        this.updateConnectionsForDevice(e.target);
        // Show all splits while dragging
        this.activeHighlight = { type: "all" };
        this.showAllSplitPoints(e.target);
      }
    });

    // Handle other device changes
    const updateOnEvent = (e) => {
      if (e && e.target && e.target.type === "group" && e.target.deviceType) {
        this.updateConnectionsForDevice(e.target);
        // Show splits during scaling/rotating
        this.activeHighlight = { type: "all" };
        this.showAllSplitPoints(e.target);
      }
    };
    this.fabricCanvas.on("object:modified", updateOnEvent);
    this.fabricCanvas.on("object:scaling", updateOnEvent);
    this.fabricCanvas.on("object:rotating", updateOnEvent);

    // Handle selection changes
    const onSelection = (e) => {
      const obj = e && e.selected && e.selected.length ? e.selected[0] : this.fabricCanvas.getActiveObject();
      if (!obj) return;
      // Device selected: show its connections
      if (obj.type === "group" && obj.deviceType) {
        const deviceId = this.getDeviceId(obj);
        this.activeHighlight = { type: "device", id: deviceId };
        this.highlightDeviceConnections(obj);
        return;
      }
      // Connection segment selected: show that connection
      if (obj.isConnectionSegment) {
        this.activeHighlight = { type: "connection", id: obj.connectionId };
        this.highlightConnectionById(obj.connectionId);
        return;
      }
      // Split handle selected: show its connection
      if (obj.isNetworkSplitPoint) {
        this.activeHighlight = { type: "connection", id: obj.connectionId };
        this.highlightConnectionById(obj.connectionId);
        return;
      }
      // Clear highlights for other selections
      this.activeHighlight = null;
      this.clearConnectionHighlights();
    };
    // Set up selection listeners
    this.fabricCanvas.on("selection:created", onSelection);
    this.fabricCanvas.on("selection:updated", onSelection);

    this.fabricCanvas.on("selection:cleared", () => {
      this.activeHighlight = null;
      this.clearConnectionHighlights();
    });
  }

  // Sets up deletion handling
  setupDeletionHandling() {
    // Handle deletion of connections and split points
    this.fabricCanvas.on("object:removed", (e) => {
      const target = e.target;
      if (!target || this.updatingSegments || this._suppressAllRemovalHandling) return;
      if (target.connectionId && this._bulkRemovingConnectionIds.has(target.connectionId)) return;

      if (target.isConnectionSegment) {
        const connection = this.connections.get(target.connectionId);
        if (!connection) return;
        // Remove entire connection when any segment is deleted
        this.removeConnection(connection.id);
        return;
      }

      if (target.isSegmentDistanceLabel || target.isConnectionCustomLabel || target.isChannelLabel) {
        // Handle deletion of custom text labels
        if (target.isConnectionCustomLabel && target.customTextId) {
          const connection = this.connections.get(target.connectionId);
          if (connection && connection.properties.customTextLabels) {
            // Remove the text label from stored data
            connection.properties.customTextLabels = connection.properties.customTextLabels.filter((t) => t.id !== target.customTextId);
          }
        }
        // Don't remove connection when label is deleted, just remove the label
        return;
      }

      if (target.isNetworkSplitPoint) {
        const connection = this.connections.get(target.connectionId);
        if (!connection) return;
        // Remove split point
        let removed = false;
        if (typeof target.nodeIndex === "number" && connection.nodes[target.nodeIndex]) {
          connection.nodes.splice(target.nodeIndex, 1);
          removed = true;
        }
        if (!removed) {
          const idx = this.findClosestNodeIndex(connection, { x: target.left, y: target.top });
          if (idx > -1) connection.nodes.splice(idx, 1);
        }
        if (connection.nodes.length === 0) {
          // Keep direct line between devices
          this.renderConnection(connection);
        } else {
          this.renderConnection(connection);
        }
      }

      // Remove all connections when device is deleted
      if (target.type === "group" && target.deviceType) {
        this.removeConnectionsForDevice(target);
      }
    });
  }

  // Creates a connection between two devices
  createConnection(device1, device2, connectionType = "network", options = {}) {
    const opts = options || {};
    const device1Id = this.getDeviceId(device1);
    const device2Id = this.getDeviceId(device2);

    if (!opts.skipValidation) {
      const category1 = this.getDeviceCategory(device1);
      const category2 = this.getDeviceCategory(device2);
      if (!this.areCategoriesCompatible(category1, category2)) {
        this.emitConnectionBlocked(category1, category2);
        return false;
      }
    }

    // Create consistent connection ID
    const connectionId = device1Id < device2Id ? `${device1Id}_${device2Id}` : `${device2Id}_${device1Id}`;
    const pairKey = device1Id < device2Id ? `${device1Id}__${device2Id}` : `${device2Id}__${device1Id}`;

    // Check if connection already exists
    if (this.connections.has(connectionId)) return false;

    // Check for any existing connection between these devices
    for (const [, conn] of this.connections) {
      if (!conn) continue;
      const k = conn.device1Id < conn.device2Id ? `${conn.device1Id}__${conn.device2Id}` : `${conn.device2Id}__${conn.device1Id}`;
      if (k === pairKey) return false;
    }

    // Prevent duplicate connections
    if (this._recentConnectionKeys.has(pairKey)) return false;
    this._recentConnectionKeys.add(pairKey);
    setTimeout(() => this._recentConnectionKeys.delete(pairKey), 600);

    // Create connection object
    const connection = {
      id: connectionId,
      device1: device1,
      device2: device2,
      device1Id,
      device2Id,
      type: connectionType,
      nodes: [], // Split points
      properties: {
        bandwidth: "1Gbps",
        protocol: "Ethernet",
        status: "active",
        // Connection color
        color: this.styles.line.stroke,
        // Custom text label
        label: "",
        // Show distance
        showDistance: true,
      },
    };

    this.connections.set(connectionId, connection);

    // Assign channel number if connected to a panel
    this.assignChannelToConnection(connection);

    // Set up device tracking
    this.attachTrackingForDevice(device1);
    this.attachTrackingForDevice(device2);
    // Index devices
    this.indexDevice(device1);
    this.indexDevice(device2);
    this.renderConnection(connection);

    // Notify other systems
    document.dispatchEvent(
      new CustomEvent("topology:connection-created", {
        detail: { connection },
      })
    );
    return true;
  }
  getDeviceCategory(device) {
    if (!device) return "custom";
    if (device.coverageConfig) return "cctv";
    const rawType = typeof device.deviceType === "string" ? device.deviceType : "";
    const cleanedType = rawType.split(/[/\\]/).pop()?.toLowerCase() || "";
    return DEVICE_TYPE_LOOKUP.get(cleanedType) || "custom";
  }

  // Checks if a device is a panel that requires channel numbering
  isPanelDevice(device) {
    if (!device || !device.deviceType) return false;
    const rawType = typeof device.deviceType === "string" ? device.deviceType : "";
    const cleanedType = rawType.split(/[/\\]/).pop() || "";
    return PANEL_DEVICE_TYPES.includes(cleanedType);
  }

  // Gets or assigns the next channel number for a panel device
  getNextChannelNumber(panelDeviceId) {
    const currentChannels = this.panelChannels.get(panelDeviceId) || [];
    const nextChannel = currentChannels.length + 1;
    return nextChannel;
  }

  // Assigns a channel number to a connection
  assignChannelToConnection(connection) {
    const device1IsPanel = this.isPanelDevice(connection.device1);
    const device2IsPanel = this.isPanelDevice(connection.device2);

    if (!device1IsPanel && !device2IsPanel) {
      connection.properties.channel = null;
      connection.properties.panelDeviceId = null;
      return;
    }

    // Determine which device is the panel
    const panelDevice = device1IsPanel ? connection.device1 : connection.device2;
    const panelDeviceId = this.getDeviceId(panelDevice);

    // Get or assign channel number
    if (!this.panelChannels.has(panelDeviceId)) {
      this.panelChannels.set(panelDeviceId, []);
    }
    const channels = this.panelChannels.get(panelDeviceId);

    // Assign next available channel
    connection.properties.channel = channels.length + 1;
    connection.properties.panelDeviceId = panelDeviceId;
    channels.push(connection.id);
  }

  areCategoriesCompatible(categoryA, categoryB) {
    if (!categoryA || !categoryB) return true;
    if (categoryA === categoryB) return true;
    if (UNIVERSAL_CONNECTION_CATEGORIES.has(categoryA)) return true;
    if (UNIVERSAL_CONNECTION_CATEGORIES.has(categoryB)) return true;
    return false;
  }

  emitConnectionBlocked(categoryA, categoryB) {
    const labelA = CATEGORY_LABELS[categoryA] || "Device";
    const labelB = CATEGORY_LABELS[categoryB] || "Device";
    const message = `Cannot connect ${labelA} devices to ${labelB} devices. Connect within the same category, or bridge through Custom or Network devices.`;
    document.dispatchEvent(
      new CustomEvent("topology:connection-blocked", {
        detail: { categoryA, categoryB, message },
      })
    );
  }

  // Draws a connection with lines and split points
  renderConnection(connection) {
    this.updatingSegments = true;

    // Store styling of existing labels before removing them
    const existingLabels = this.fabricCanvas.getObjects().filter((obj) => (obj.isSegmentDistanceLabel || obj.isConnectionCustomLabel || obj.isChannelLabel) && obj.connectionId === connection.id);

    const labelStyles = new Map();
    existingLabels.forEach((label) => {
      const key = label.isSegmentDistanceLabel ? `distance_${label.segmentIndex}` : label.isConnectionCustomLabel ? `custom_${label.customTextId || "main"}` : "unknown";
      labelStyles.set(key, {
        fill: label.fill,
        backgroundColor: label.backgroundColor,
        fontSize: label.fontSize,
        fontFamily: label.fontFamily,
        fontWeight: label.fontWeight,
        fontStyle: label.fontStyle,
      });
    });

    // Remove old connection visuals
    const toRemove = this.fabricCanvas.getObjects().filter((obj) => (obj.isConnectionSegment || obj.isNetworkSplitPoint || obj.isSegmentDistanceLabel || obj.isConnectionCustomLabel || obj.isChannelLabel) && obj.connectionId === connection.id);
    toRemove.forEach((obj) => this.fabricCanvas.remove(obj));

    const d1 = this.getDeviceCenter(connection.device1);
    const d2 = this.getDeviceCenter(connection.device2);

    // Build path: device1 -> split points -> device2
    const points = [d1, ...connection.nodes.map((n) => ({ x: n.x, y: n.y })), d2];

    // Calculate total distance for the connection
    let totalDistance = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const dx = points[i + 1].x - points[i].x;
      const dy = points[i + 1].y - points[i].y;
      totalDistance += Math.hypot(dx, dy);
    }

    // Convert to meters using pixelsPerMeter
    const pixelsPerMeter = this.fabricCanvas.pixelsPerMeter || 17.5;
    const distanceInMeters = (totalDistance / pixelsPerMeter).toFixed(2);

    // Create line segments
    for (let i = 0; i < points.length - 1; i++) {
      const segment = new fabric.Line([points[i].x, points[i].y, points[i + 1].x, points[i + 1].y], {
        // Use connection color
        ...this.styles.line,
        stroke: connection && connection.properties && connection.properties.color ? connection.properties.color : this.styles.line.stroke,
        strokeWidth: this.styles.line.strokeWidth,
        selectable: true,
        hasControls: false,
        hasBorders: false,
        evented: true,
        hoverCursor: "pointer",
        moveCursor: "default",
        lockMovementX: true,
        lockMovementY: true,
        isConnectionSegment: true,
        connectionId: connection.id,
        segmentIndex: i, // 0..nodes.length
        perPixelTargetFind: true,
        targetFindTolerance: 8,
      });
      this.fabricCanvas.add(segment);

      // Create individual distance label for each segment
      this.createSegmentDistanceLabel(connection, points[i], points[i + 1], i, labelStyles);
    }

    // Create custom text label (only if there's custom text, not distance)
    if (connection.properties.label) {
      this.createConnectionCustomLabel(connection, points, labelStyles);
    }

    // Create custom text labels from stored data
    if (connection.properties.customTextLabels && connection.properties.customTextLabels.length > 0) {
      connection.properties.customTextLabels.forEach((textData) => {
        this.createCustomTextLabelAtPosition(connection, textData, labelStyles);
      });
    }

    // Create channel label if this connection is to a panel
    if (connection.properties.channel) {
      this.createChannelLabel(connection, points);
    }

    // Create draggable split point handles
    connection.nodes.forEach((node, idx) => {
      const splitPoint = new fabric.Circle({
        left: node.x,
        top: node.y,
        originX: "center",
        originY: "center",
        ...this.styles.split,
        selectable: true,
        hasControls: false,
        evented: true,
        hoverCursor: "move",
        moveCursor: "move",
        isNetworkSplitPoint: true,
        connectionId: connection.id,
        nodeIndex: idx,
        visible: this.shouldShowSplitPointsForConnection(connection.id),
      });

      // Update split point position when moved
      splitPoint.on("moving", () => {
        node.x = splitPoint.left;
        node.y = splitPoint.top;
        this.renderConnection(connection);
      });

      this.fabricCanvas.add(splitPoint);
    });

    // Keep devices above lines
    this.bringDevicesToFront();
    this.fabricCanvas.requestRenderAll();
    this.updatingSegments = false;
  }

  // Creates a distance label for an individual segment
  createSegmentDistanceLabel(connection, point1, point2, segmentIndex, labelStyles = null) {
    if (!connection.properties.showDistance) return;

    // Calculate distance for this segment
    const dx = point2.x - point1.x;
    const dy = point2.y - point1.y;
    const distance = Math.hypot(dx, dy);
    const pixelsPerMeter = this.fabricCanvas.pixelsPerMeter || 17.5;
    const distanceInMeters = (distance / pixelsPerMeter).toFixed(2);

    // Find the middle point of this segment
    const midX = (point1.x + point2.x) / 2;
    const midY = (point1.y + point2.y) / 2;

    // Get preserved styles if available
    const styleKey = `distance_${segmentIndex}`;
    const preservedStyles = labelStyles && labelStyles.has(styleKey) ? labelStyles.get(styleKey) : null;

    // Create the distance label with preserved or default styles
    const label = new fabric.Text(`${distanceInMeters} m`, {
      left: midX,
      top: midY - 15,
      fontSize: preservedStyles?.fontSize || 10,
      fill: preservedStyles?.fill || "#000000",
      fontFamily: preservedStyles?.fontFamily || "Poppins, sans-serif",
      backgroundColor: preservedStyles?.backgroundColor || "rgba(255, 255, 255, 0.8)",
      fontWeight: preservedStyles?.fontWeight || "normal",
      fontStyle: preservedStyles?.fontStyle || "normal",
      originX: "center",
      originY: "center",
      selectable: false,
      evented: false,
      hasControls: false,
      hasBorders: false,
      textAlign: "center",
      isSegmentDistanceLabel: true,
      connectionId: connection.id,
      segmentIndex: segmentIndex,
      hoverCursor: "default",
      moveCursor: "default",
    });

    this.fabricCanvas.add(label);
  }

  // Creates a custom text label for the entire connection
  createConnectionCustomLabel(connection, points, labelStyles = null) {
    if (!connection.properties.label) return;

    // Find the middle point of the connection path
    const midPoint = this.findMidPointOfPath(points);

    // Get preserved styles if available
    const styleKey = "custom_main";
    const preservedStyles = labelStyles && labelStyles.has(styleKey) ? labelStyles.get(styleKey) : null;

    // Create the custom text label with preserved or default styles
    const label = new fabric.IText(connection.properties.label, {
      left: midPoint.x,
      top: midPoint.y - 25, // Position above distance labels
      fontSize: preservedStyles?.fontSize || 12,
      fill: preservedStyles?.fill || "#000000",
      fontFamily: preservedStyles?.fontFamily || "Poppins, sans-serif",
      backgroundColor: preservedStyles?.backgroundColor || "rgba(255, 255, 255, 0.8)",
      fontWeight: preservedStyles?.fontWeight || "normal",
      fontStyle: preservedStyles?.fontStyle || "normal",
      originX: "center",
      originY: "center",
      selectable: true,
      evented: true,
      hasControls: false,
      hasBorders: false,
      hoverCursor: "move",
      moveCursor: "move",
      isConnectionCustomLabel: true,
      connectionId: connection.id,
      textAlign: "center",
    });

    // Handle label movement
    label.on("moving", () => {
      // Keep label position updated
      label.setCoords();
    });

    // Handle double-click to edit text
    label.on("mousedown", (e) => {
      if (e.e && e.e.detail === 2) {
        this.editConnectionLabel(connection);
      }
    });

    this.fabricCanvas.add(label);
  }

  // Creates a custom text label at a specific position
  createCustomTextLabelAtPosition(connection, textData, labelStyles = null) {
    // Calculate the actual position based on the path ratio
    const position = this.getPositionFromPathRatio(connection, textData.pathRatio);

    // Get preserved styles if available
    const styleKey = `custom_${textData.id}`;
    const preservedStyles = labelStyles && labelStyles.has(styleKey) ? labelStyles.get(styleKey) : null;

    const label = new fabric.IText(textData.text, {
      left: position.x,
      top: position.y - 15, // Position slightly above the line
      fontSize: preservedStyles?.fontSize || 12,
      fill: preservedStyles?.fill || "#000000",
      fontFamily: preservedStyles?.fontFamily || "Poppins, sans-serif",
      backgroundColor: preservedStyles?.backgroundColor || "rgba(255, 255, 255, 0.8)",
      fontWeight: preservedStyles?.fontWeight || "normal",
      fontStyle: preservedStyles?.fontStyle || "normal",
      originX: "center",
      originY: "center",
      selectable: true,
      evented: true,
      hasControls: false,
      hasBorders: false,
      hoverCursor: "text",
      moveCursor: "move",
      isConnectionCustomLabel: true,
      connectionId: connection.id,
      textAlign: "center",
      customTextId: textData.id,
      lockMovementX: false,
      lockMovementY: false,
    });

    // Flag to prevent movement updates during text editing
    let isEditingText = false;

    // Handle label movement - update stored path ratio
    label.on("moving", () => {
      if (isEditingText || label.isEditing) return;

      label.setCoords();
      // Calculate new path ratio based on current position
      const newRatio = this.calculatePositionRatioOnPath(connection, { x: label.left, y: label.top });
      // Update the stored path ratio in connection properties
      const textLabel = connection.properties.customTextLabels.find((t) => t.id === textData.id);
      if (textLabel) {
        textLabel.pathRatio = newRatio;
      }
    });

    // Handle when movement ends to ensure position is locked
    label.on("moved", () => {
      if (isEditingText || label.isEditing) return;
      label.setCoords();
    });

    // Handle when editing starts
    label.on("editing:entered", () => {
      isEditingText = true;
      // Temporarily disable movement during editing
      label.set({
        selectable: false,
        evented: false,
        hoverCursor: "text",
      });
    });

    // Handle when editing ends
    label.on("editing:exited", () => {
      isEditingText = false;

      // Re-enable movement after editing
      label.set({
        selectable: true,
        evented: true,
        hoverCursor: "text",
        moveCursor: "move",
      });

      // Update the stored text in connection properties
      const textLabel = connection.properties.customTextLabels.find((t) => t.id === textData.id);
      if (textLabel) {
        textLabel.text = label.text;
      }

      this.fabricCanvas.requestRenderAll();
    });

    // Handle double-click to edit text
    label.on("mousedown", (e) => {
      if (e.e && e.e.detail === 2) {
        e.e.preventDefault();
        e.e.stopPropagation();

        // Enter text editing mode
        label.enterEditing();
      }
    });

    this.fabricCanvas.add(label);
  }

  // Creates a channel label near the panel for panel connections
  createChannelLabel(connection, points) {
    if (!connection.properties.channel) return;

    // Determine which device is the panel
    const panelDevice = connection.properties.panelDeviceId === connection.device1Id ? connection.device1 : connection.device2;
    const otherDevice = connection.properties.panelDeviceId === connection.device1Id ? connection.device2 : connection.device1;

    const panelCenter = this.getDeviceCenter(panelDevice);
    const otherCenter = this.getDeviceCenter(otherDevice);

    // Calculate a position near the panel (about 30 pixels along the line from the panel)
    const angle = Math.atan2(otherCenter.y - panelCenter.y, otherCenter.x - panelCenter.x);
    const offsetDistance = 30; // pixels from the panel center
    const labelX = panelCenter.x + Math.cos(angle) * offsetDistance;
    const labelY = panelCenter.y + Math.sin(angle) * offsetDistance;

    // Create the channel label with same styling as distance labels but bolded
    const label = new fabric.Text(`${connection.properties.channel}`, {
      left: labelX,
      top: labelY,
      fontSize: 15,
      fill: "#000000",
      fontFamily: "Poppins, sans-serif",
      backgroundColor: "rgba(255, 255, 255, 0.8)",
      fontWeight: "bold",
      fontStyle: "normal",
      originX: "center",
      originY: "center",
      selectable: false,
      evented: false,
      hasControls: false,
      hasBorders: false,
      textAlign: "center",
      isChannelLabel: true,
      connectionId: connection.id,
      hoverCursor: "default",
      moveCursor: "default",
    });

    this.fabricCanvas.add(label);
  }

  // Finds the middle point of a path
  findMidPointOfPath(points) {
    if (points.length === 0) return { x: 0, y: 0 };
    if (points.length === 1) return points[0];

    // Calculate total path length
    let totalLength = 0;
    const segmentLengths = [];

    for (let i = 0; i < points.length - 1; i++) {
      const dx = points[i + 1].x - points[i].x;
      const dy = points[i + 1].y - points[i].y;
      const length = Math.hypot(dx, dy);
      segmentLengths.push(length);
      totalLength += length;
    }

    // Find the middle point
    const targetLength = totalLength / 2;
    let currentLength = 0;

    for (let i = 0; i < segmentLengths.length; i++) {
      const segmentLength = segmentLengths[i];
      if (currentLength + segmentLength >= targetLength) {
        // Middle point is in this segment
        const ratio = (targetLength - currentLength) / segmentLength;
        const dx = points[i + 1].x - points[i].x;
        const dy = points[i + 1].y - points[i].y;

        return {
          x: points[i].x + dx * ratio,
          y: points[i].y + dy * ratio,
        };
      }
      currentLength += segmentLength;
    }

    // Fallback to last point
    return points[points.length - 1];
  }

  // Calculates the ratio (0-1) of a point along the connection path
  calculatePositionRatioOnPath(connection, point) {
    const d1 = this.getDeviceCenter(connection.device1);
    const d2 = this.getDeviceCenter(connection.device2);
    const points = [d1, ...connection.nodes.map((n) => ({ x: n.x, y: n.y })), d2];

    if (points.length < 2) return 0;

    // Calculate total path length
    let totalLength = 0;
    const segmentLengths = [];

    for (let i = 0; i < points.length - 1; i++) {
      const dx = points[i + 1].x - points[i].x;
      const dy = points[i + 1].y - points[i].y;
      const length = Math.hypot(dx, dy);
      segmentLengths.push(length);
      totalLength += length;
    }

    if (totalLength === 0) return 0;

    // Find which segment the point is closest to
    let minDistance = Infinity;
    let closestRatio = 0;

    for (let i = 0; i < points.length - 1; i++) {
      const segmentStart = points[i];
      const segmentEnd = points[i + 1];
      const distance = this.distanceToLineSegment(point, segmentStart, segmentEnd);

      if (distance < minDistance) {
        minDistance = distance;

        // Calculate the ratio along this segment
        const dx = segmentEnd.x - segmentStart.x;
        const dy = segmentEnd.y - segmentStart.y;
        const segmentLength = Math.hypot(dx, dy);

        if (segmentLength > 0) {
          const t = Math.max(0, Math.min(1, ((point.x - segmentStart.x) * dx + (point.y - segmentStart.y) * dy) / (segmentLength * segmentLength)));

          // Calculate total ratio along the entire path
          let lengthBeforeSegment = 0;
          for (let j = 0; j < i; j++) {
            lengthBeforeSegment += segmentLengths[j];
          }

          closestRatio = (lengthBeforeSegment + t * segmentLength) / totalLength;
        }
      }
    }

    return Math.max(0, Math.min(1, closestRatio));
  }

  // Gets the position along the connection path based on a ratio (0-1)
  getPositionFromPathRatio(connection, ratio) {
    const d1 = this.getDeviceCenter(connection.device1);
    const d2 = this.getDeviceCenter(connection.device2);
    const points = [d1, ...connection.nodes.map((n) => ({ x: n.x, y: n.y })), d2];

    if (points.length < 2) return d1;

    // Calculate total path length
    let totalLength = 0;
    const segmentLengths = [];

    for (let i = 0; i < points.length - 1; i++) {
      const dx = points[i + 1].x - points[i].x;
      const dy = points[i + 1].y - points[i].y;
      const length = Math.hypot(dx, dy);
      segmentLengths.push(length);
      totalLength += length;
    }

    if (totalLength === 0) return d1;

    // Find the target position
    const targetLength = ratio * totalLength;
    let currentLength = 0;

    for (let i = 0; i < segmentLengths.length; i++) {
      const segmentLength = segmentLengths[i];
      if (currentLength + segmentLength >= targetLength) {
        // Target position is in this segment
        const segmentRatio = (targetLength - currentLength) / segmentLength;
        const dx = points[i + 1].x - points[i].x;
        const dy = points[i + 1].y - points[i].y;

        return {
          x: points[i].x + dx * segmentRatio,
          y: points[i].y + dy * segmentRatio,
        };
      }
      currentLength += segmentLength;
    }

    // Fallback to last point
    return points[points.length - 1];
  }

  // Edits connection label text
  editConnectionLabel(connection) {
    const currentLabel = connection.properties.label || "";
    const newLabel = prompt("Enter connection label:", currentLabel);

    if (newLabel !== null) {
      connection.properties.label = newLabel;
      this.renderConnection(connection);
    }
  }

  // Checks if split points should be visible
  shouldShowSplitPointsForConnection(connectionId) {
    if (!this.activeHighlight) return false;
    // Show all splits when dragging
    if (this.activeHighlight.type === "all") return true;
    if (this.activeHighlight.type === "connection") return this.activeHighlight.id === connectionId;
    if (this.activeHighlight.type === "device") {
      // Show if connection involves the active device
      const conn = this.connections.get(connectionId);
      if (!conn) return false;
      const did = this.activeHighlight.id;
      return conn.device1Id === did || conn.device2Id === did;
    }
    return false;
  }

  // Adds a split point to a connection
  splitConnection(connectionLineOrSegment, pointer) {
    const connectionId = connectionLineOrSegment.connectionId;
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    // Find where to insert the split point
    let insertIndex;
    if (typeof connectionLineOrSegment.segmentIndex === "number") {
      insertIndex = connectionLineOrSegment.segmentIndex;
    } else {
      insertIndex = this.findInsertPosition(connection, pointer);
    }

    connection.nodes.splice(insertIndex, 0, { x: pointer.x, y: pointer.y });
    this.renderConnection(connection);
    this.fabricCanvas.requestRenderAll();
  }

  // Adds split point at double-click location
  addSplitPointAtSegment(segment, pointer) {
    const connection = this.connections.get(segment.connectionId);
    if (!connection) return;
    const insertIndex = segment.segmentIndex ?? this.findInsertPosition(connection, pointer);
    connection.nodes.splice(insertIndex, 0, { x: pointer.x, y: pointer.y });
    this.renderConnection(connection);
  }

  // Finds the best place to insert a split point
  findInsertPosition(connection, splitPoint) {
    const device1Center = this.getDeviceCenter(connection.device1);
    const device2Center = this.getDeviceCenter(connection.device2);

    if (!connection.nodes || connection.nodes.length === 0) return 0;

    const pathPoints = [device1Center, ...connection.nodes.map((n) => ({ x: n.x, y: n.y })), device2Center];

    // Find closest segment
    let minDistance = Infinity;
    let bestSegmentIndex = 0;
    for (let i = 0; i < pathPoints.length - 1; i++) {
      const segmentStart = pathPoints[i];
      const segmentEnd = pathPoints[i + 1];
      const distance = this.distanceToLineSegment(splitPoint, segmentStart, segmentEnd);
      if (distance < minDistance) {
        minDistance = distance;
        bestSegmentIndex = i;
      }
    }
    // Insert before the next point
    return Math.min(bestSegmentIndex, connection.nodes?.length ?? 0);
  }

  // Calculates distance from point to line segment
  distanceToLineSegment(point, lineStart, lineEnd) {
    const A = point.x - lineStart.x;
    const B = point.y - lineStart.y;
    const C = lineEnd.x - lineStart.x;
    const D = lineEnd.y - lineStart.y;

    const dot = A * C + B * D;
    const lenSq = C * C + D * D;

    if (lenSq === 0) {
      // Line segment is actually a point
      return Math.sqrt(A * A + B * B);
    }

    const param = dot / lenSq;

    let xx, yy;

    if (param < 0) {
      xx = lineStart.x;
      yy = lineStart.y;
    } else if (param > 1) {
      xx = lineEnd.x;
      yy = lineEnd.y;
    } else {
      xx = lineStart.x + param * C;
      yy = lineStart.y + param * D;
    }

    const dx = point.x - xx;
    const dy = point.y - yy;

    return Math.sqrt(dx * dx + dy * dy);
  }

  // Keeps devices and labels above connection lines
  bringDevicesToFront() {
    const allDevices = this.fabricCanvas.getObjects().filter((obj) => obj.type === "group" && obj.deviceType);
    allDevices.forEach((device) => {
      this.fabricCanvas.bringToFront(device);
      // Bring text labels above devices
      if (device.textObject && !device.textObject._isHidden && this.fabricCanvas.getObjects().includes(device.textObject)) {
        this.fabricCanvas.bringToFront(device.textObject);
      }
    });
    const allSplitPoints = this.fabricCanvas.getObjects().filter((obj) => obj.isNetworkSplitPoint);
    allSplitPoints.forEach((point) => this.fabricCanvas.bringToFront(point));
  }

  // Updates connections when a device moves
  updateConnectionsForDevice(device) {
    // Update all connections involving this device
    const id = this.getDeviceId(device);
    this.connections.forEach((connection) => {
      if (connection.device1Id === id) {
        if (connection.device1 !== device) connection.device1 = device; // Rebind if needed
        this.renderConnection(connection);
      } else if (connection.device2Id === id) {
        if (connection.device2 !== device) connection.device2 = device; // Rebind if needed
        this.renderConnection(connection);
      }
    });
    this.fabricCanvas.requestRenderAll();
  }

  // Gets the center point of a device
  getDeviceCenter(device) {
    // Get the actual center point of the device
    const center = device.getCenterPoint
      ? device.getCenterPoint()
      : {
          x: device.left,
          y: device.top,
        };

    return {
      x: center.x,
      y: center.y,
    };
  }

  // Highlights connections for a specific device
  highlightDeviceConnections(device) {
    // Clear existing highlights
    this.clearConnectionHighlights();
    const deviceId = this.getDeviceId(device);
    // Hide all split points first
    const allSplits = this.fabricCanvas.getObjects().filter((obj) => obj.isNetworkSplitPoint);
    allSplits.forEach((p) => p.set({ visible: false, ...this.styles.split }));
    this.connections.forEach((connection) => {
      if (connection.device1Id === deviceId || connection.device2Id === deviceId) {
        const segments = this.fabricCanvas.getObjects().filter((obj) => obj.isConnectionSegment && obj.connectionId === connection.id);
        segments.forEach((segment) => segment.set({ ...this.styles.lineHighlight }));
        const splitPoints = this.fabricCanvas.getObjects().filter((obj) => obj.isNetworkSplitPoint && obj.connectionId === connection.id);
        splitPoints.forEach((point) => point.set({ visible: true, ...this.styles.split }));
      }
    });
    this.fabricCanvas.requestRenderAll();
  }

  // Shows all split points on the canvas
  showAllSplitPoints(draggedDevice = null) {
    // Reset line colors
    const segments = this.fabricCanvas.getObjects().filter((obj) => obj.isConnectionSegment);
    segments.forEach((segment) => {
      const conn = this.connections.get(segment.connectionId);
      segment.set({
        stroke: conn && conn.properties && conn.properties.color ? conn.properties.color : this.styles.line.stroke,
        strokeWidth: this.styles.line.strokeWidth,
      });
    });
    // Show every split point
    const splitPoints = this.fabricCanvas.getObjects().filter((obj) => obj.isNetworkSplitPoint);
    splitPoints.forEach((point) => point.set({ visible: true, ...this.styles.split }));
    // Highlight connections for dragged device
    if (draggedDevice) {
      const did = this.getDeviceId(draggedDevice);
      this.connections.forEach((connection) => {
        if (connection.device1Id === did || connection.device2Id === did) {
          const segs = this.fabricCanvas.getObjects().filter((obj) => obj.isConnectionSegment && obj.connectionId === connection.id);
          segs.forEach((seg) => seg.set({ ...this.styles.lineHighlight }));
        }
      });
    }
    this.fabricCanvas.requestRenderAll();
  }

  // Clears all connection highlights
  clearConnectionHighlights() {
    // Reset connection colors
    const segments = this.fabricCanvas.getObjects().filter((obj) => obj.isConnectionSegment);
    segments.forEach((segment) => {
      const conn = this.connections.get(segment.connectionId);
      segment.set({
        stroke: conn && conn.properties && conn.properties.color ? conn.properties.color : this.styles.line.stroke,
        strokeWidth: this.styles.line.strokeWidth,
        shadow: null,
      });
    });
    // Hide all split points
    const splitPoints = this.fabricCanvas.getObjects().filter((obj) => obj.isNetworkSplitPoint);
    splitPoints.forEach((point) => point.set({ ...this.styles.split, visible: false }));
    this.fabricCanvas.requestRenderAll();
  }

  // Highlights a single connection
  highlightConnectionById(connectionId) {
    this.clearConnectionHighlights();
    const segments = this.fabricCanvas.getObjects().filter((obj) => obj.isConnectionSegment && obj.connectionId === connectionId);
    segments.forEach((segment) => segment.set({ ...this.styles.lineHighlight }));
    // Show only this connection's split points
    const splitPoints = this.fabricCanvas.getObjects().filter((obj) => obj.isNetworkSplitPoint && obj.connectionId === connectionId);
    splitPoints.forEach((point) => point.set({ visible: true, ...this.styles.split }));
    this.fabricCanvas.requestRenderAll();
  }

  // Removes all connections from the canvas
  clearAllConnections() {
    // Remove connection visuals from canvas
    const objectsToRemove = this.fabricCanvas.getObjects().filter((obj) => obj.isConnectionSegment || obj.isNetworkSplitPoint || obj.isSegmentDistanceLabel || obj.isConnectionCustomLabel || obj.isChannelLabel);
    this._suppressAllRemovalHandling = true;
    try {
      objectsToRemove.forEach((obj) => this.fabricCanvas.remove(obj));
    } finally {
      this._suppressAllRemovalHandling = false;
    }

    // Clear internal data
    this.connections.clear();
    this.panelChannels.clear();
    this._recentConnectionKeys.clear();
    this.fabricCanvas.requestRenderAll();
  }

  // Removes a single connection
  removeConnection(connectionId) {
    const connection = this.connections.get(connectionId);
    if (!connection) return;
    const toRemove = this.fabricCanvas.getObjects().filter((obj) => (obj.isConnectionSegment || obj.isNetworkSplitPoint || obj.isSegmentDistanceLabel || obj.isConnectionCustomLabel || obj.isChannelLabel) && obj.connectionId === connectionId);
    this._bulkRemovingConnectionIds.add(connectionId);
    try {
      toRemove.forEach((obj) => this.fabricCanvas.remove(obj));
    } finally {
      this._bulkRemovingConnectionIds.delete(connectionId);
    }

    // Clean up channel tracking
    if (connection.properties && connection.properties.panelDeviceId) {
      const channels = this.panelChannels.get(connection.properties.panelDeviceId);
      if (channels) {
        const index = channels.indexOf(connectionId);
        if (index > -1) {
          channels.splice(index, 1);
        }
      }
    }

    this.connections.delete(connectionId);
    this.fabricCanvas.requestRenderAll();
  }

  // Removes connection by ID (for compatibility)
  removeConnectionById(connectionId) {
    this.removeConnection(connectionId);
  }

  // Removes all connections for a device
  removeConnectionsForDevice(device) {
    const deviceId = this.getDeviceId(device);
    const connectionsToRemove = [];
    this.connections.forEach((connection, id) => {
      if (connection.device1Id === deviceId || connection.device2Id === deviceId) {
        connectionsToRemove.push(id);
      }
    });
    connectionsToRemove.forEach((id) => this.removeConnection(id));
  }

  // Removes a split point handle
  removeSplitPoint(splitPointObj) {
    if (!splitPointObj || !splitPointObj.connectionId) return;
    const connection = this.connections.get(splitPointObj.connectionId);
    if (!connection) return;
    const idx = typeof splitPointObj.nodeIndex === "number" ? splitPointObj.nodeIndex : this.findClosestNodeIndex(connection, { x: splitPointObj.left, y: splitPointObj.top });
    if (idx > -1 && connection.nodes[idx]) {
      connection.nodes.splice(idx, 1);
      this.renderConnection(connection);
    }
  }

  // Debug helper to show connection data
  debugConnections() {
    try {
      const data = this.getConnectionsData();
      console.table(data.map((d) => ({ id: d.id, d1: d.device1Id, d2: d.device2Id, nodes: d.splitPoints.length })));
      return data;
    } catch (e) {
      console.warn("debugConnections failed", e);
      return [];
    }
  }

  // Gets all connection data for saving
  getConnectionsData() {
    const connectionsData = [];
    this.connections.forEach((connection) => {
      try {
        // Deep clone properties to ensure it's serializable
        let serializedProperties = {};
        if (connection.properties) {
          try {
            // Use JSON parse/stringify to ensure only serializable data
            serializedProperties = JSON.parse(JSON.stringify(connection.properties));
          } catch (e) {
            // If that fails, manually copy only safe properties
            serializedProperties = {
              bandwidth: connection.properties.bandwidth,
              protocol: connection.properties.protocol,
              status: connection.properties.status,
              label: connection.properties.label,
              channel: connection.properties.channel,
              panelDeviceId: connection.properties.panelDeviceId,
              showDistance: connection.properties.showDistance,
              color: connection.properties.color,
              customTextLabels: connection.properties.customTextLabels,
            };
            // Filter out undefined/null values
            Object.keys(serializedProperties).forEach((key) => {
              if (serializedProperties[key] === undefined || serializedProperties[key] === null) {
                delete serializedProperties[key];
              }
            });
          }
        }

        const data = {
          id: connection.id,
          device1Id: connection.device1Id || this.getDeviceId(connection.device1),
          device2Id: connection.device2Id || this.getDeviceId(connection.device2),
          type: connection.type || "network",
          properties: serializedProperties,
          splitPoints: (connection.nodes || []).map((n) => ({ x: n.x, y: n.y })),
        };

        // Ensure customTextLabels is properly serialized
        if (data.properties.customTextLabels && Array.isArray(data.properties.customTextLabels)) {
          data.properties.customTextLabels = data.properties.customTextLabels.map((label) => ({
            id: label.id,
            text: label.text,
            pathRatio: label.pathRatio,
            customTextId: label.customTextId,
          }));
        }

        connectionsData.push(data);
      } catch (e) {
        console.error("Error serializing connection:", e, connection);
        // Skip this connection if it can't be serialized
      }
    });
    return connectionsData;
  }

  // Loads connection data from saved state
  loadConnectionsData(connectionsData) {
    // Clear current connections
    this.clearAllConnections();
    // Remove old connection lines
    this.removeLegacyConnectionLines();
    connectionsData.forEach((connData) => {
      const device1 = this.findDeviceById(connData.device1Id);
      const device2 = this.findDeviceById(connData.device2Id);
      if (!device1 || !device2) return;
      this.createConnection(device1, device2, connData.type, { skipValidation: true });
      const normalizedId = this.makeNormalizedConnectionId(device1, device2);
      const connection = this.connections.get(connData.id) || this.connections.get(normalizedId);
      if (!connection) return;
      const previousPanelId = connection.properties?.panelDeviceId || null;

      // Build a safe set of connection properties using saved values where available
      const rawProperties = connData.properties || {};
      const clonedProperties = (() => {
        try {
          return JSON.parse(JSON.stringify(rawProperties));
        } catch (_) {
          return { ...rawProperties };
        }
      })();

      const normalizedProperties = clonedProperties && typeof clonedProperties === "object" ? clonedProperties : {};

      const restoredProperties = {
        bandwidth: connection.properties?.bandwidth || "1Gbps",
        protocol: connection.properties?.protocol || "Ethernet",
        status: connection.properties?.status || "active",
        color: connection.properties?.color || this.styles.line.stroke,
        label: connection.properties?.label || "",
        showDistance: typeof connection.properties?.showDistance === "boolean" ? connection.properties.showDistance : true,
        customTextLabels: [],
        channel: connection.properties?.channel,
        panelDeviceId: connection.properties?.panelDeviceId,
        ...normalizedProperties,
      };

      if (typeof restoredProperties.label !== "string") restoredProperties.label = "";
      if (typeof restoredProperties.bandwidth !== "string" || !restoredProperties.bandwidth.trim()) restoredProperties.bandwidth = "1Gbps";
      if (typeof restoredProperties.protocol !== "string" || !restoredProperties.protocol.trim()) restoredProperties.protocol = "Ethernet";
      if (typeof restoredProperties.status !== "string" || !restoredProperties.status.trim()) restoredProperties.status = "active";
      if (typeof restoredProperties.color !== "string" || !restoredProperties.color.trim()) restoredProperties.color = this.styles.line.stroke;
      if (typeof restoredProperties.showDistance === "string") {
        restoredProperties.showDistance = restoredProperties.showDistance.toLowerCase() !== "false";
      } else {
        restoredProperties.showDistance = typeof restoredProperties.showDistance === "boolean" ? restoredProperties.showDistance : true;
      }

      if (Array.isArray(normalizedProperties.customTextLabels)) {
        restoredProperties.customTextLabels = normalizedProperties.customTextLabels.map((label) => {
          const ratio = Number(label?.pathRatio);
          return {
            id: label?.id || `text_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            text: label?.text || "",
            pathRatio: Number.isFinite(ratio) ? ratio : 0.5,
            customTextId: label?.customTextId || label?.id || null,
          };
        });
      } else {
        delete restoredProperties.customTextLabels;
      }

      const channelNumber = Number(restoredProperties.channel);
      restoredProperties.channel = Number.isFinite(channelNumber) && channelNumber > 0 ? channelNumber : null;

      if (typeof restoredProperties.panelDeviceId !== "string") {
        restoredProperties.panelDeviceId = null;
      } else {
        restoredProperties.panelDeviceId = restoredProperties.panelDeviceId.trim();
        if (!restoredProperties.panelDeviceId) restoredProperties.panelDeviceId = null;
      }
      if (!restoredProperties.panelDeviceId) {
        restoredProperties.channel = null;
      }

      connection.properties = restoredProperties;
      connection.nodes = (connData.splitPoints || []).map((p) => ({ x: p.x, y: p.y }));

      if (previousPanelId && previousPanelId !== restoredProperties.panelDeviceId) {
        const previousEntries = this.panelChannels.get(previousPanelId);
        if (previousEntries) {
          const idx = previousEntries.indexOf(connection.id);
          if (idx > -1) previousEntries.splice(idx, 1);
          if (previousEntries.length === 0) this.panelChannels.delete(previousPanelId);
        }
      }

      // Reconcile channel tracking for panels using saved data
      if (restoredProperties.panelDeviceId && restoredProperties.channel) {
        if (!this.panelChannels.has(restoredProperties.panelDeviceId)) {
          this.panelChannels.set(restoredProperties.panelDeviceId, []);
        }
        const channelEntries = this.panelChannels.get(restoredProperties.panelDeviceId);
        if (!channelEntries.includes(connection.id)) channelEntries.push(connection.id);
      }

      // Re-attach device tracking
      this.attachTrackingForDevice(connection.device1);
      this.attachTrackingForDevice(connection.device2);
      this.renderConnection(connection);
    });
  }

  // Removes old connection lines from previous versions
  removeLegacyConnectionLines() {
    const isConnectionColor = (stroke) => {
      if (!stroke || typeof stroke !== "string") return false;
      const s = stroke.toLowerCase();
      return s === "#2196f3" || (s.includes("rgb(33") && s.includes("150") && s.includes("243"));
    };
    const candidates = this.fabricCanvas.getObjects().filter((obj) => {
      if (obj.type !== "line") return false;
      // Skip walls and measuring lines
      if (obj.stroke === "red" || obj.stroke === "grey" || obj.stroke === "blue") return false;
      if (obj.deviceType || obj.isResizeIcon || obj.isConnectionSegment || obj.isNetworkSplitPoint) return false;
      // Check if it looks like an old connection
      const locked = obj.lockMovementX === true && obj.lockMovementY === true;
      return isConnectionColor(obj.stroke) && locked;
    });
    candidates.forEach((obj) => {
      try {
        this.fabricCanvas.remove(obj);
      } catch (_) {}
    });
    if (candidates.length) this.fabricCanvas.requestRenderAll();
  }

  // Creates a consistent connection ID from two devices
  makeNormalizedConnectionId(device1, device2) {
    const d1 = this.getDeviceId(device1);
    const d2 = this.getDeviceId(device2);
    return d1 < d2 ? `${d1}_${d2}` : `${d2}_${d1}`;
  }

  // Gets or creates a stable ID for a device
  getDeviceId(device) {
    if (!device) return undefined;
    // Use existing ID if available
    if (device.id) return device.id;
    // Use topology ID if available
    if (device._topologyId) return device._topologyId;
    // Create new stable ID
    const newId = `device_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    device.id = newId;
    device._topologyId = newId;
    return newId;
  }

  // Finds a device by its ID
  findDeviceById(deviceId) {
    return this.fabricCanvas.getObjects().find((obj) => obj.type === "group" && obj.deviceType && this.getDeviceId(obj) === deviceId);
  }

  // Attaches move tracking to a device
  attachTrackingForDevice(device) {
    if (!device || this.trackedDevices.has(device)) return;
    const handler = () => {
      this.updateConnectionsForDevice(device);
      // Keep device highlighted while dragging
      const deviceId = this.getDeviceId(device);
      this.activeHighlight = { type: "device", id: deviceId };
      this.highlightDeviceConnections(device);
    };
    // Store handler for cleanup
    device._topologyMoveHandler = handler;
    device.on("moving", handler);
    // Clean up on removal
    device.on("removed", () => {
      try {
        device.off("moving", handler);
      } catch (_) {}
      this.trackedDevices.delete(device);
    });
    this.trackedDevices.add(device);
  }

  // Indexes a device for ID lookup
  indexDevice(device) {
    try {
      const id = this.getDeviceId(device);
      if (id) this.deviceIndex.set(id, device);
    } catch (_) {}
  }

  // Rebinds connections when a device is re-added
  rebindConnectionsForDevice(device) {
    const deviceId = this.getDeviceId(device);
    this.connections.forEach((conn) => {
      if (conn.device1Id === deviceId && conn.device1 !== device) {
        conn.device1 = device;
        this.attachTrackingForDevice(device);
        this.renderConnection(conn);
      }
      if (conn.device2Id === deviceId && conn.device2 !== device) {
        conn.device2 = device;
        this.attachTrackingForDevice(device);
        this.renderConnection(conn);
      }
    });
  }

  // Finds the closest split point to a given location
  findClosestNodeIndex(connection, point) {
    if (!connection.nodes || connection.nodes.length === 0) return -1;
    let minD = Infinity;
    let idx = -1;
    connection.nodes.forEach((n, i) => {
      const dx = point.x - n.x;
      const dy = point.y - n.y;
      const d = dx * dx + dy * dy;
      if (d < minD) {
        minD = d;
        idx = i;
      }
    });
    return idx;
  }

  // Updates all connection distance labels when scale changes
  updateConnectionLabelsForScaleChange(newPixelsPerMeter) {
    if (!newPixelsPerMeter || newPixelsPerMeter <= 0) return;

    // Update all segment distance labels
    const segmentLabels = this.fabricCanvas.getObjects().filter((obj) => obj.isSegmentDistanceLabel);
    segmentLabels.forEach((label) => {
      const connection = this.connections.get(label.connectionId);
      if (!connection) return;

      // Find the corresponding segment
      const segmentIndex = label.segmentIndex;
      const d1 = this.getDeviceCenter(connection.device1);
      const d2 = this.getDeviceCenter(connection.device2);
      const points = [d1, ...connection.nodes.map((n) => ({ x: n.x, y: n.y })), d2];

      if (segmentIndex >= 0 && segmentIndex < points.length - 1) {
        const point1 = points[segmentIndex];
        const point2 = points[segmentIndex + 1];
        const dx = point2.x - point1.x;
        const dy = point2.y - point1.y;
        const distance = Math.hypot(dx, dy);
        const distanceInMeters = (distance / newPixelsPerMeter).toFixed(2);

        label.set({ text: `${distanceInMeters} m` });
        label.setCoords();
      }
    });

    this.fabricCanvas.requestRenderAll();
  }

  // Gets the channel information for a device if it's connected to a panel
  getDeviceChannelInfo(device) {
    const deviceId = this.getDeviceId(device);
    if (!deviceId) return null;

    // Find the connection for this device
    for (const [connectionId, connection] of this.connections) {
      if (connection.device1Id === deviceId || connection.device2Id === deviceId) {
        // Check if this connection has a channel assigned
        if (connection.properties && connection.properties.channel) {
          // Find the panel device
          const panelDeviceId = connection.properties.panelDeviceId;
          const panelDevice = panelDeviceId === connection.device1Id ? connection.device1 : connection.device2;

          // Get panel label
          const panelLabel = panelDevice && panelDevice.textObject ? panelDevice.textObject.text : "Panel";

          return {
            channel: connection.properties.channel,
            panelDeviceId: panelDeviceId,
            panelLabel: panelLabel,
          };
        }
      }
    }

    return null;
  }

  // Gets all connected devices and their channels for a panel device
  getPanelConnections(panelDevice) {
    const panelDeviceId = this.getDeviceId(panelDevice);
    if (!panelDeviceId) return [];

    const connectedDevices = [];

    // Find all connections for this panel
    for (const [connectionId, connection] of this.connections) {
      if (connection.properties && connection.properties.panelDeviceId === panelDeviceId) {
        // This connection is to the panel
        const otherDeviceId = connection.device1Id === panelDeviceId ? connection.device2Id : connection.device1Id;
        const otherDevice = connection.device1Id === panelDeviceId ? connection.device2 : connection.device1;

        // Get device label
        const deviceLabel = otherDevice && otherDevice.textObject ? otherDevice.textObject.text : "Device";

        connectedDevices.push({
          channel: connection.properties.channel,
          deviceLabel: deviceLabel,
          deviceId: otherDeviceId,
        });
      }
    }

    // Sort by channel number
    connectedDevices.sort((a, b) => a.channel - b.channel);

    return connectedDevices;
  }
}
