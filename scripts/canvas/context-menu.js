// Handles right-click context menu for canvas objects
import { addCameraCoverage } from "../devices/camera/camera-core.js";
import { handleObjectDeletion } from "../drawing/drawing-utils.js";

export function initContextMenu(fabricCanvas) {
  const canvasEl = fabricCanvas.getElement();
  const container = canvasEl.parentElement || document.body;

  // Create context menu
  const menu = document.createElement("div");
  menu.id = "fabric-context-menu";
  Object.assign(menu.style, {
    position: "fixed",
    background: "#e0e0e0",
    color: "#000",
    border: "1px solid rgba(0,0,0,0.2)",
    borderRadius: "6px",
    padding: "6px",
    display: "none",
    zIndex: 3000,
    boxShadow: "0 6px 18px rgba(0,0,0,0.4)",
  });

  const btnStyle = "display:block;padding:6px 10px;cursor:pointer;border-radius:4px;margin:2px 0;text-align:left;background:transparent;color:inherit;font-size:13px;border:none;";

  // Create buttons
  const copyBtn = document.createElement("button");
  copyBtn.innerText = "Clone";
  copyBtn.setAttribute("style", btnStyle);

  const deleteBtn = document.createElement("button");
  deleteBtn.innerText = "Delete";
  deleteBtn.setAttribute("style", btnStyle + "color:#ff6b6b;");

  const splitBtn = document.createElement("button");
  splitBtn.innerText = "Split Connection";
  splitBtn.setAttribute("style", btnStyle);

  const addTextBtn = document.createElement("button");
  addTextBtn.innerText = "Add Text";
  addTextBtn.setAttribute("style", btnStyle);

  menu.appendChild(copyBtn);
  menu.appendChild(splitBtn);
  menu.appendChild(addTextBtn);
  menu.appendChild(deleteBtn);
  document.body.appendChild(menu);

  // Add hover effects
  const addHoverEffect = (btn, defaultColor = "inherit") => {
    btn.addEventListener("mouseenter", () => {
      btn.style.background = "#f8794b";
      btn.style.color = "white";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.background = "transparent";
      btn.style.color = defaultColor;
    });
  };

  addHoverEffect(copyBtn);
  addHoverEffect(splitBtn);
  addHoverEffect(addTextBtn);
  addHoverEffect(deleteBtn, "#ff6b6b");

  let currentTarget = null;

  // Helper functions
  const hideMenu = () => {
    menu.style.display = "none";
    currentTarget = null;
  };

  const showMenuForTarget = (target, x, y) => {
    if (!target) return;

    // Show/hide buttons based on target type
    if (target.type === "group" && target.deviceType && target.deviceType !== "title-block") {
      copyBtn.style.display = "block";
      splitBtn.style.display = "none";
      addTextBtn.style.display = "none";
    } else if (target.type === "line" && (target.isNetworkConnection || target.isConnectionSegment)) {
      copyBtn.style.display = "none";
      splitBtn.style.display = "block";
      addTextBtn.style.display = "block";
    } else {
      copyBtn.style.display = "none";
      splitBtn.style.display = "none";
      addTextBtn.style.display = "none";
    }

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.style.display = "block";
  };

  const deleteObject = (target) => {
    if (!target) return;

    // Use centralized deletion handler if available
    if (typeof handleObjectDeletion === "function") {
      try {
        const handled = handleObjectDeletion(fabricCanvas, target);
        if (handled) return;
      } catch (e) {
        // fall back to built-in behaviour
      }
    }

    // Device groups
    if (target.type === "group" && target.deviceType) {
      if (target.textObject) fabricCanvas.remove(target.textObject);
      if (target.coverageArea) fabricCanvas.remove(target.coverageArea);
      fabricCanvas.remove(target);
      fabricCanvas.discardActiveObject();
      fabricCanvas.requestRenderAll();
      return;
    }

    // Zone or room polygons
    if (target.type === "polygon" && (target.class === "zone-polygon" || target.class === "room-polygon")) {
      if (target.class === "zone-polygon" && window.deleteZone) {
        window.deleteZone(target);
        return;
      }
      if (target.class === "room-polygon" && window.deleteRoom) {
        window.deleteRoom(target);
        return;
      }

      // Fallback
      if (target.associatedText) fabricCanvas.remove(target.associatedText);
      fabricCanvas.remove(target);
      try {
        if (target.class === "zone-polygon" && Array.isArray(window.zones)) {
          window.zones = window.zones.filter((z) => z.polygon !== target);
        }
        if (target.class === "room-polygon" && Array.isArray(window.rooms)) {
          window.rooms = window.rooms.filter((r) => r.polygon !== target);
        }
        document.dispatchEvent(new Event("layers:items-changed"));
      } catch (e) {}
      fabricCanvas.requestRenderAll();
      return;
    }

    // IText (zone/room text)
    if (target.type === "i-text" && (target.class === "zone-text" || target.class === "room-text")) {
      if (target.class === "zone-text" && window.deleteZone) {
        window.deleteZone(target);
        return;
      }
      if (target.class === "room-text" && window.deleteRoom) {
        window.deleteRoom(target);
        return;
      }

      // Fallback
      if (target.associatedPolygon) fabricCanvas.remove(target.associatedPolygon);
      fabricCanvas.remove(target);
      try {
        if (target.class === "zone-text" && Array.isArray(window.zones)) {
          window.zones = window.zones.filter((z) => z.text !== target && z.polygon !== target.associatedPolygon);
        }
        if (target.class === "room-text" && Array.isArray(window.rooms)) {
          window.rooms = window.rooms.filter((r) => r.text !== target && r.polygon !== target.associatedPolygon);
        }
        document.dispatchEvent(new Event("layers:items-changed"));
      } catch (e) {}
      fabricCanvas.requestRenderAll();
      return;
    }

    // Generic fallback
    fabricCanvas.remove(target);
    fabricCanvas.requestRenderAll();
  };

  const copyObject = (target) => {
    if (!target || target.type !== "group" || !target.deviceType) return;

    try {
      target.clone((cloned) => {
        const selectable = typeof target.selectable !== "undefined" ? target.selectable : true;
        const evented = typeof target.evented !== "undefined" ? target.evented : true;

        cloned.set({
          left: (cloned.left || 0) + 20,
          top: (cloned.top || 0) + 20,
          selectable,
          hasControls: false,
          hasBorders: true,
          evented,
        });

        // Copy device properties
        cloned.deviceType = target.deviceType;
        cloned.coverageConfig = target.coverageConfig ? JSON.parse(JSON.stringify(target.coverageConfig)) : null;
        cloned.labelHidden = target.labelHidden !== undefined ? target.labelHidden : undefined;
        cloned.borderColor = target.borderColor || "#000000";
        cloned.borderScaleFactor = target.borderScaleFactor || 2;
        cloned.location = target.location || "";
        cloned.mountedPosition = target.mountedPosition || "";
        cloned.partNumber = target.partNumber || "";
        cloned.stockNumber = target.stockNumber || "";
        cloned.ipAddress = target.ipAddress || "";
        cloned.subnetMask = target.subnetMask || "";
        cloned.gatewayAddress = target.gatewayAddress || "";
        cloned.macAddress = target.macAddress || "";
        cloned.focalLength = target.focalLength || "";
        cloned.sensorSize = target.sensorSize || "";
        cloned.resolution = target.resolution || "";
        cloned.scaleFactor = target.scaleFactor || 1;
        cloned.hoverCursor = target.hoverCursor;

        // Normalize coverage config
        if (cloned.coverageConfig) {
          if (!cloned.coverageConfig.baseColor && cloned.coverageConfig.fillColor) {
            const m = cloned.coverageConfig.fillColor.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
            if (m) {
              const [, r, g, b] = m;
              cloned.coverageConfig.baseColor = `rgb(${r}, ${g}, ${b})`;
            }
          }
          if (typeof cloned.coverageConfig.opacity !== "number") {
            let logical = 0.3;
            const alphaMatch = (cloned.coverageConfig.fillColor || "").match(/rgba\([^,]+,[^,]+,[^,]+,\s*([0-9.]+)\)/i);
            if (alphaMatch) {
              const alpha = parseFloat(alphaMatch[1]);
              const layerOpacity = (window.layers && window.layers.devices && window.layers.devices.opacity) || 1;
              if (layerOpacity > 0) logical = Math.min(1, Math.max(0, alpha / layerOpacity));
            }
            cloned.coverageConfig.opacity = logical;
          }
        }

        // Preserve initial label text
        if (target.textObject) {
          cloned.initialLabelText = target.textObject.text;
        }

        fabricCanvas.add(cloned);

        try {
          cloned.setCoords();
        } catch (e) {}

        // Recreate text label
        let textClone = null;
        if (target.textObject) {
          const orig = target.textObject;
          try {
            if (typeof orig.clone === "function") {
              orig.clone((tc) => {
                textClone = tc;
                textClone.set({ selectable: false, evented: false });
                textClone.isDeviceLabel = orig.isDeviceLabel !== undefined ? orig.isDeviceLabel : true;
                const hidden = cloned.labelHidden !== undefined ? cloned.labelHidden : orig._isHidden !== undefined ? orig._isHidden : false;
                textClone._isHidden = hidden;
                textClone.visible = !hidden;
                if (hidden) {
                  try {
                    fabricCanvas.remove(textClone);
                  } catch (e) {}
                }
                fabricCanvas.add(textClone);
                const groupCenter = cloned.getCenterPoint();
                const currentScaleFactor = cloned.scaleFactor || 1;
                textClone.set({ left: groupCenter.x, top: groupCenter.y + 20 * currentScaleFactor + 10 });
                textClone.setCoords();
                cloned.textObject = textClone;
                if (!cloned.initialLabelText) cloned.initialLabelText = textClone.text;

                // Link to undo command
                if (window.undoSystem) {
                  const stack = window.undoSystem.undoStack;
                  const last = stack[stack.length - 1];
                  if (last && last.object === cloned && !last.relatedObjects.includes(textClone)) {
                    last.relatedObjects.push(textClone);
                  }
                }
              });
            }
          } catch (e) {
            const label = orig.text || "";
            textClone = new fabric.Text(label, {
              left: cloned.left + 20,
              top: cloned.top + 40,
              fontFamily: orig.fontFamily || "Poppins, sans-serif",
              fontSize: orig.fontSize || 12,
              fill: orig.fill || "#FFFFFF",
              selectable: false,
              evented: false,
              backgroundColor: orig.backgroundColor || "rgba(20,18,18,0.8)",
              originX: "center",
              originY: "top",
            });
            textClone.isDeviceLabel = orig.isDeviceLabel !== undefined ? orig.isDeviceLabel : true;
            const hidden = cloned.labelHidden !== undefined ? cloned.labelHidden : orig._isHidden !== undefined ? orig._isHidden : false;
            textClone._isHidden = hidden;
            textClone.visible = !hidden;
            if (hidden) {
              try {
                fabricCanvas.remove(textClone);
              } catch (e) {}
            }
            fabricCanvas.add(textClone);
            cloned.textObject = textClone;
            if (!cloned.initialLabelText) cloned.initialLabelText = textClone.text;

            // Link to undo command
            if (window.undoSystem) {
              const stack = window.undoSystem.undoStack;
              const last = stack[stack.length - 1];
              if (last && last.object === cloned && !last.relatedObjects.includes(textClone)) {
                last.relatedObjects.push(textClone);
              }
            }
          }
        }

        // Preserve device-level metadata
        cloned.location = target.location || cloned.location || "";

        // Add event listeners
        cloned.on("moving", () => {
          if (cloned.textObject && fabricCanvas.getObjects().includes(cloned.textObject)) {
            const groupCenter = cloned.getCenterPoint();
            const currentScaleFactor = cloned.scaleFactor || 1;
            cloned.textObject.set({ left: groupCenter.x, top: groupCenter.y + 20 * currentScaleFactor + 10 });
            cloned.textObject.setCoords();
          }
          cloned.bringToFront();
          if (cloned.textObject && cloned.textObject.visible !== false) cloned.textObject.bringToFront();
          fabricCanvas.requestRenderAll();
        });

        cloned.on("selected", () => {
          window.showDeviceProperties && window.showDeviceProperties(cloned.deviceType, cloned.textObject, cloned);
          cloned.bringToFront();
          if (cloned.textObject && cloned.textObject.visible !== false) cloned.textObject.bringToFront();
          fabricCanvas.requestRenderAll();
        });

        cloned.on("deselected", () => {
          window.hideDeviceProperties && window.hideDeviceProperties();
        });

        cloned.on("removed", () => {
          if (cloned.textObject) fabricCanvas.remove(cloned.textObject);
          if (cloned.coverageArea) fabricCanvas.remove(cloned.coverageArea);
          fabricCanvas.renderAll();
        });

        // Add camera coverage if needed
        if (cloned.coverageConfig && cloned.deviceType && cloned.deviceType.includes("camera")) {
          setTimeout(() => {
            try {
              addCameraCoverage(fabricCanvas, cloned);
            } catch (err) {
              console.warn("Failed to add camera coverage for cloned camera", err);
            }
          }, 50);
        }

        fabricCanvas.setActiveObject(cloned);
        fabricCanvas.requestRenderAll();
      });
    } catch (err) {
      console.warn("Failed to clone device group", err);
    }
  };

  // Event handlers
  const canvasContainer = container;
  canvasContainer.addEventListener("contextmenu", (e) => {
    window.lastContextMenuEvent = e;

    const rect = canvasEl.getBoundingClientRect();
    if (e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom) {
      e.preventDefault();
      e.stopPropagation();

      let target = null;
      try {
        if (typeof fabricCanvas.findTarget === "function") {
          target = fabricCanvas.findTarget(e);
        }
      } catch (err) {
        // ignore
      }

      if (!target && fabricCanvas._hoveredTarget) target = fabricCanvas._hoveredTarget;

      if (target) {
        currentTarget = target;
        showMenuForTarget(target, e.clientX, e.clientY);
      } else {
        hideMenu();
      }
    }
  });

  fabricCanvas.on("mouse:down", (opt) => {
    const e = opt.e;
    if (!e) return;

    if (e.button === 2 && opt.target) {
      currentTarget = opt.target;
      showMenuForTarget(opt.target, e.clientX, e.clientY);
      e.preventDefault();
      e.stopPropagation();
    } else {
      hideMenu();
    }
  });

  // Hide menu on global click
  document.addEventListener("mousedown", (ev) => {
    if (!menu.contains(ev.target)) hideMenu();
  });

  // Button event listeners
  copyBtn.addEventListener("click", () => {
    if (!currentTarget) return;
    if (currentTarget.type === "group" && currentTarget.deviceType === "title-block") return;
    copyObject(currentTarget);
    hideMenu();
  });

  splitBtn.addEventListener("click", () => {
    if (!currentTarget || !window.topologyManager) return;

    let pointer;
    if (window.lastContextMenuEvent) {
      pointer = fabricCanvas.getPointer(window.lastContextMenuEvent);
    } else {
      const coords = currentTarget.calcLinePoints ? currentTarget.calcLinePoints() : null;
      if (coords) {
        pointer = {
          x: (coords.x1 + coords.x2) / 2,
          y: (coords.y1 + coords.y2) / 2,
        };
      } else {
        pointer = { x: currentTarget.left || 0, y: currentTarget.top || 0 };
      }
    }

    if (currentTarget.type === "line" && (currentTarget.isNetworkConnection || currentTarget.isConnectionSegment)) {
      window.topologyManager.splitConnection(currentTarget, pointer);
    }

    hideMenu();
  });

  addTextBtn.addEventListener("click", () => {
    if (!currentTarget || !window.topologyManager) return;

    if (currentTarget.type === "line" && (currentTarget.isNetworkConnection || currentTarget.isConnectionSegment)) {
      // Get the connection from the topology manager
      const connection = window.topologyManager.connections.get(currentTarget.connectionId);
      if (connection) {
        // Get the click position from the context menu event
        let clickPosition;
        if (window.lastContextMenuEvent) {
          clickPosition = fabricCanvas.getPointer(window.lastContextMenuEvent);
        } else {
          // Fallback to middle of the line if no event available
          const coords = currentTarget.calcLinePoints ? currentTarget.calcLinePoints() : null;
          if (coords) {
            clickPosition = {
              x: (coords.x1 + coords.x2) / 2,
              y: (coords.y1 + coords.y2) / 2,
            };
          } else {
            clickPosition = { x: currentTarget.left || 0, y: currentTarget.top || 0 };
          }
        }

        // Prompt for text input
        const currentLabel = connection.properties.label || "";
        const newLabel = prompt("Enter text for this network connection:", currentLabel);

        if (newLabel !== null) {
          // Store the text label data in the connection properties
          if (!connection.properties.customTextLabels) {
            connection.properties.customTextLabels = [];
          }

          // Calculate the position ratio along the connection path
          const pathRatio = window.topologyManager.calculatePositionRatioOnPath(connection, clickPosition);

          // Add the new text label data
          connection.properties.customTextLabels.push({
            text: newLabel,
            pathRatio: pathRatio, // Store as ratio along the path instead of absolute position
            id: `text_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          });

          // Re-render the connection to show the new text
          window.topologyManager.renderConnection(connection);
        }
      }
    }

    hideMenu();
  });

  deleteBtn.addEventListener("click", () => {
    if (!currentTarget) return;
    deleteObject(currentTarget);
    hideMenu();
  });

  fabricCanvas.on("selection:cleared", () => hideMenu());

  // Expose helpers for other modules
  window._fabricContextMenu = {
    showMenu: (t, x, y) => {
      currentTarget = t;
      showMenuForTarget(t, x, y);
    },
    hideMenu,
  };
}

export default initContextMenu;
