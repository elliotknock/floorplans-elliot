import { closeSidebar, startTool, stopCurrentTool, registerToolCleanup } from "./drawing-utils.js";

// Sets up network link drawing tool for connecting devices
export function setupNetworkLinkTool(fabricCanvas) {
  const networkLinkBtn = document.getElementById("network-link-btn");
  
  let sourceDevice = null;
  let sourceDeviceId = null; // Store device ID for reliable comparison
  let tempConnectionLine = null;
  let isConnecting = false;
  let isActiveConnecting = false; // Tracks if we're actively drawing a connection line
  let createCooldown = false;
  let restrictionTimeout = null;

  if (!window.__networkLinkRestrictionListener) {
    window.__networkLinkRestrictionListener = (event) => {
      const message = event?.detail?.message;
      showRestrictionWarning(message);
    };
    document.addEventListener('topology:connection-blocked', window.__networkLinkRestrictionListener);
  }

  // Activates network link tool
  networkLinkBtn.addEventListener("click", () => {
    closeSidebar();
    cleanupTempObjects();
    registerToolCleanup(cleanupTempObjects);
    startTool(fabricCanvas, "network-link", handleNetworkLinkClick, handleNetworkLinkMove, handleNetworkLinkKey);
  });

  // Cleans up temporary objects
  function cleanupTempObjects() {
    if (tempConnectionLine) {
      fabricCanvas.remove(tempConnectionLine);
      tempConnectionLine = null;
    }
    if (restrictionTimeout) {
      clearTimeout(restrictionTimeout);
      restrictionTimeout = null;
    }
    sourceDevice = null;
    sourceDeviceId = null;
    isConnecting = false;
    isActiveConnecting = false;
    fabricCanvas.defaultCursor = 'default';
    fabricCanvas.hoverCursor = 'move';
    hideConnectionInstruction();
    fabricCanvas.requestRenderAll();
  }

  // Handles network link click events
  function handleNetworkLinkClick(e) {
    e.e.preventDefault();
    e.e.stopPropagation();

    const pointer = fabricCanvas.getPointer(e.e);
    let target = fabricCanvas.findTarget(e.e);
    
    // If target is a connection segment, try to find the device underneath
    if (target && (target.isConnectionSegment || target.isNetworkSplitPoint)) {
      target = findDeviceAtPoint(pointer);
    }
    
    // If still no device found, try to find device at pointer location
    if (!target || target.type !== 'group' || !target.deviceType) {
      target = findDeviceAtPoint(pointer);
    }
    
    if (!target || target.type !== 'group' || !target.deviceType) {
      return;
    }

    if (!isConnecting) {
      // First click - select source device
      sourceDevice = target;
      sourceDeviceId = getDeviceId(target);
      isConnecting = true;
      isActiveConnecting = true; // Start actively drawing line
      
      fabricCanvas.defaultCursor = 'crosshair';
      fabricCanvas.hoverCursor = 'crosshair';
      
      showConnectionInstruction();
      
    } else {
      const targetDeviceId = getDeviceId(target);
      // If clicking the same source device again, re-activate connection mode
      if (targetDeviceId && targetDeviceId === sourceDeviceId) {
        // Update sourceDevice reference in case object changed
        sourceDevice = target;
        // Clear any temp line
        if (tempConnectionLine) {
          fabricCanvas.remove(tempConnectionLine);
          tempConnectionLine = null;
        }
        // Re-activate connection drawing
        isActiveConnecting = true;
        // Clear cooldown so we can immediately connect to another device
        createCooldown = false;
        // Reset cursor
        fabricCanvas.defaultCursor = 'crosshair';
        fabricCanvas.hoverCursor = 'crosshair';
        // Reset and show instruction ready for next connection
        showConnectionInstruction();
        return;
      }
      
      // If clicking a different device while not actively connecting, make it the new source
      if (!isActiveConnecting && targetDeviceId !== sourceDeviceId) {
        sourceDevice = target;
        sourceDeviceId = targetDeviceId;
        isActiveConnecting = true;
        createCooldown = false;
        fabricCanvas.defaultCursor = 'crosshair';
        fabricCanvas.hoverCursor = 'crosshair';
        showConnectionInstruction();
        return;
      }
      
      let connectionCreated = false;
      if (window.topologyManager && !createCooldown) {
        const created = window.topologyManager.createConnection(sourceDevice, target);
        if (created) {
          connectionCreated = true;
          createCooldown = true;
          setTimeout(() => (createCooldown = false), 300);
        }
      }
      
      if (tempConnectionLine) {
        fabricCanvas.remove(tempConnectionLine);
        tempConnectionLine = null;
      }
      
      if (connectionCreated) {
        // Keep the same source device so user can continue connecting from it
        // Don't change sourceDevice to target - this allows continuous connections from same source
        // Stop line drawing after connection is created
        isActiveConnecting = false;
        // Reset cursor (no sticky line)
        fabricCanvas.defaultCursor = 'default';
        fabricCanvas.hoverCursor = 'move';
        
        updateConnectionInstruction();
      }
    }
  }

  // Shows temporary connection line during movement
  function handleNetworkLinkMove(e) {
    // Only draw line when actively connecting (not after a connection is created)
    if (!isConnecting || !isActiveConnecting || !sourceDevice) return;

    const pointer = fabricCanvas.getPointer(e.e);
    const sourceCenter = getDeviceCenter(sourceDevice);

    if (tempConnectionLine) {
      fabricCanvas.remove(tempConnectionLine);
    }

    tempConnectionLine = new fabric.Line([
      sourceCenter.x, sourceCenter.y,
      pointer.x, pointer.y
    ], {
      stroke: '#2196F3',
      strokeWidth: 2,
      selectable: false,
      evented: false,
      opacity: 0.7
    });

    fabricCanvas.add(tempConnectionLine);
    fabricCanvas.requestRenderAll();
  }

  // Handles keyboard events (ESC to cancel)
  function handleNetworkLinkKey(e) {
    if (e.key === 'Escape') {
      cleanupTempObjects();
      stopCurrentTool();
    }
  }

  // Gets device center point
  function getDeviceCenter(device) {
    const center = device.getCenterPoint ? device.getCenterPoint() : {
      x: device.left,
      y: device.top
    };
    
    return {
      x: center.x,
      y: center.y
    };
  }

  // Finds a device at the given point, even if connection lines are on top
  function findDeviceAtPoint(pointer) {
    // Try to find device using containsPoint first (more accurate)
    const devices = fabricCanvas.getObjects().filter(obj => obj.type === 'group' && obj.deviceType);
    
    for (const device of devices) {
      try {
        // Check if pointer is within device bounds
        const bounds = device.getBoundingRect();
        if (pointer.x >= bounds.left && pointer.x <= bounds.left + bounds.width &&
            pointer.y >= bounds.top && pointer.y <= bounds.top + bounds.height) {
          // Use containsPoint for more accurate detection
          if (device.containsPoint && device.containsPoint(pointer)) {
            return device;
          }
          // Fallback: check if pointer is near device center (within device radius)
          const center = device.getCenterPoint ? device.getCenterPoint() : { x: device.left, y: device.top };
          const distance = Math.hypot(pointer.x - center.x, pointer.y - center.y);
          // Devices are typically around 30-40px radius
          if (distance < 50) {
            return device;
          }
        }
      } catch (e) {
        // Continue to next device if error
      }
    }
    
    return null;
  }

  // Gets device ID for comparison
  function getDeviceId(device) {
    if (!device) return null;
    if (window.topologyManager && typeof window.topologyManager.getDeviceId === 'function') {
      return window.topologyManager.getDeviceId(device);
    }
    return device.id || device._topologyId || null;
  }

  function ensureInstructionDiv() {
    let instructionDiv = document.getElementById('network-link-instruction');
    if (!instructionDiv) {
      instructionDiv = document.createElement('div');
      instructionDiv.id = 'network-link-instruction';
      instructionDiv.style.cssText = `
        position: fixed;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(33, 150, 243, 0.95);
        color: white;
        padding: 10px 20px;
        border-radius: 5px;
        z-index: 9999;
        font-family: Poppins, sans-serif;
        font-size: 14px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      `;
      document.body.appendChild(instructionDiv);
    }
    return instructionDiv;
  }

  // Shows connection instruction
  function showConnectionInstruction() {
    if (restrictionTimeout) {
      clearTimeout(restrictionTimeout);
      restrictionTimeout = null;
    }
    const instructionDiv = ensureInstructionDiv();
    instructionDiv.style.background = 'rgba(33, 150, 243, 0.95)';
    instructionDiv.textContent = 'Click on another device to create network connection. Click the source device again to connect it to another device.';
    instructionDiv.style.display = 'block';
  }

  // Updates connection instruction for continuous mode
  function updateConnectionInstruction() {
    const instructionDiv = ensureInstructionDiv();
    if (instructionDiv) {
      instructionDiv.style.background = 'rgba(33, 150, 243, 0.95)';
      instructionDiv.textContent = 'Connection created! Click on another device to continue connecting from the same source, or press ESC to stop.';
      setTimeout(() => {
        if (instructionDiv.style.display === 'block') {
          instructionDiv.textContent = 'Click on another device to create network connection from the same source.';
        }
      }, 2000);
    }
  }

  // Hides connection instruction
  function hideConnectionInstruction() {
    if (restrictionTimeout) {
      clearTimeout(restrictionTimeout);
      restrictionTimeout = null;
    }
    const instructionDiv = document.getElementById('network-link-instruction');
    if (instructionDiv) {
      instructionDiv.style.display = 'none';
    }
  }

  function showRestrictionWarning(message) {
    const instructionDiv = ensureInstructionDiv();
    instructionDiv.style.background = 'rgba(220, 53, 69, 0.95)';
    instructionDiv.textContent = message || 'These devices cannot be linked. Use the same category or connect via Custom/Network devices.';
    instructionDiv.style.display = 'block';
    if (restrictionTimeout) {
      clearTimeout(restrictionTimeout);
    }
    restrictionTimeout = setTimeout(() => {
      restrictionTimeout = null;
      if (isConnecting) {
        showConnectionInstruction();
      } else {
        hideConnectionInstruction();
      }
    }, 2200);
  }

  // Exposes cleanup function for external use
  window.cleanupNetworkLinkTempObjects = cleanupTempObjects;
}