import { updateSliderTrack } from "./sidebar-utils.js";

// Creates a reusable popover system with drag, tabs, and keyboard shortcuts
export function createPopoverBase(popoverId, callbacks = {}) {
  const popover = document.getElementById(popoverId);
  if (!popover) {
    console.error(`Popover element not found: ${popoverId}`);
    return null;
  }

  const titleEl = popover.querySelector(`#${popoverId}-title`);
  const closeBtn = popover.querySelector(`#${popoverId}-close`);
  let currentTarget = null;
  let lastOpenedTs = 0;
  let isDragging = false;
  let wasVisibleBeforeDrag = false;

  // Drag state
  let dragOffset = { x: 0, y: 0 };
  let dragActive = false;
  let dragStartPos = { x: 0, y: 0 };

  // Updates the visual appearance of slider tracks
  function initializeSliderAppearance(slider) {
    if (!slider) return;
    const value = parseFloat(slider.value);
    const min = parseFloat(slider.min) || 0;
    const max = parseFloat(slider.max) || 100;
    updateSliderTrack(slider, value, min, max);
  }

  function initializeAllSliders() {
    popover.querySelectorAll(".form-range, .slider").forEach(initializeSliderAppearance);
  }

  // Hook callbacks - slider initialization is automatically added
  const onOpened = (...args) => {
    setTimeout(initializeAllSliders, 10);
    if (callbacks.onOpened) callbacks.onOpened(...args);
  };
  const onPanelChanged = (...args) => {
    setTimeout(initializeAllSliders, 10);
    if (callbacks.onPanelChanged) callbacks.onPanelChanged(...args);
  };
  const shouldPreventClose = callbacks.shouldPreventClose || (() => false);
  const onClose = callbacks.onClose || (() => {});
  const customOpenPopover = callbacks.customOpenPopover;

  // Public API
  const api = {
    popover,
    get currentTarget() {
      return currentTarget;
    },
    set currentTarget(value) {
      currentTarget = value;
    },
    get isDragging() {
      return isDragging;
    },
    get lastOpenedTs() {
      return lastOpenedTs;
    },
    set lastOpenedTs(value) {
      lastOpenedTs = value;
    },

    // Shared position for all popovers in this session
    getSharedPopoverPosition() {
      return window.__sharedPopoverPosition || null;
    },

    setSharedPopoverPosition(pos) {
      window.__sharedPopoverPosition = pos;
    },

    // Gets all navigation tab items
    navItems() {
      return Array.from(popover.querySelectorAll(".panel-navigation .nav-item"));
    },

    // Gets all panel sections
    panels() {
      return Array.from(popover.querySelectorAll(".slide-panel"));
    },

    // Switches to a different panel tab
    setActivePanel(key) {
      api.navItems().forEach((item) => item.classList.toggle("active", item.dataset.panel === key));
      api.panels().forEach((p) => p.classList.toggle("active", p.dataset.panel === key));
    },

    // Positions the popover in the top-right corner
    positionPopover() {
      if (isDragging) return;

      const sharedPos = api.getSharedPopoverPosition();
      if (sharedPos) {
        popover.style.left = `${sharedPos.left}px`;
        popover.style.top = `${sharedPos.top}px`;
        popover.style.right = "auto";
        return;
      }

      try {
        // Position in top-right corner to avoid blocking canvas
        const popoverWidth = popover.offsetWidth || 360;
        const padding = 20;
        const left = window.innerWidth - popoverWidth - padding;
        const top = padding;
        popover.style.left = `${left}px`;
        popover.style.top = `${top}px`;
        popover.style.right = "auto";
      } catch (e) {
        // Fallback positioning
        popover.style.right = `20px`;
        popover.style.top = `20px`;
        popover.style.left = `auto`;
      }
    },

    // Hides popover temporarily during drag
    hidePopoverForDrag() {
      if (popover.style.display === "block") {
        wasVisibleBeforeDrag = true;
        popover.style.display = "none";
      } else {
        wasVisibleBeforeDrag = false;
      }
    },

    showPopoverAfterDrag() {
      if (wasVisibleBeforeDrag && currentTarget) {
        popover.style.display = "block";
        api.positionPopover();
        onOpened();
      }
      wasVisibleBeforeDrag = false;
    },

    // Opens the popover and shows it
    openPopover(target, ...args) {
      if (isDragging) return;

      // If custom open handler exists, use it; otherwise use default
      if (customOpenPopover) {
        return customOpenPopover.call(this, target, ...args, api._baseOpenPopover);
      }

      // Default open behavior
      api._baseOpenPopover(target, ...args);
    },

    // Internal base implementation that can be called by custom handlers
    _baseOpenPopover(target, ...args) {
      currentTarget = target;
      lastOpenedTs = Date.now();
      popover.style.display = "block";
      api.positionPopover();
      onOpened(...args);
    },

    // Closes the popover
    closePopover() {
      popover.style.display = "none";
      onClose();
      currentTarget = null;
    },
  };

  // Drag handling
  function onDragStart(e) {
    const target = e.target;
    const titleId = titleEl?.id;
    if (!titleId || (!target.closest(`#${titleId}`) && !target.classList.contains("popover-drag-handle"))) {
      return;
    }

    dragActive = true;
    isDragging = true;
    dragStartPos = {
      x: e.type === "touchstart" ? e.touches[0].clientX : e.clientX,
      y: e.type === "touchstart" ? e.touches[0].clientY : e.clientY,
    };

    const rect = popover.getBoundingClientRect();
    dragOffset = {
      x: dragStartPos.x - rect.left,
      y: dragStartPos.y - rect.top,
    };

    document.body.style.userSelect = "none";
  }

  // Handles moving the popover while dragging
  function onDragMove(e) {
    if (!dragActive) return;

    const clientX = e.type === "touchmove" ? e.touches[0].clientX : e.clientX;
    const clientY = e.type === "touchmove" ? e.touches[0].clientY : e.clientY;

    let left = clientX - dragOffset.x;
    let top = clientY - dragOffset.y;

    // Keep popover within window bounds
    left = Math.max(0, Math.min(window.innerWidth - popover.offsetWidth, left));
    top = Math.max(0, Math.min(window.innerHeight - popover.offsetHeight, top));

    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
    popover.style.right = "auto";
  }

  // Handles ending the drag
  function onDragEnd(e) {
    if (!dragActive) return;

    dragActive = false;
    isDragging = false;
    document.body.style.userSelect = "";

    // Save position for all popovers in session
    const rect = popover.getBoundingClientRect();
    api.setSharedPopoverPosition({ left: rect.left, top: rect.top });
  }

  // Sets up drag handling on the title bar
  function setupDragHandling() {
    if (!titleEl) return;

    titleEl.classList.add("popover-drag-handle");
    titleEl.style.cursor = "move";

    titleEl.addEventListener("mousedown", onDragStart);
    titleEl.addEventListener("touchstart", onDragStart);
    document.addEventListener("mousemove", onDragMove);
    document.addEventListener("touchmove", onDragMove);
    document.addEventListener("mouseup", onDragEnd);
    document.addEventListener("touchend", onDragEnd);
  }

  // Sets up all event listeners for the popover
  function setupEventListeners() {
    // Panel navigation
    popover.addEventListener("click", (e) => {
      const item = e.target.closest(".nav-item");
      if (item) {
        api.setActivePanel(item.dataset.panel);
        onPanelChanged(item.dataset.panel);
      }
    });

    // Close button
    if (closeBtn) {
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        api.closePopover();
      });
    }

    // Close when clicking outside
    document.addEventListener("click", (e) => {
      if (popover.style.display !== "block") return;
      if (Date.now() - lastOpenedTs < 150) return;

      if (!popover.contains(e.target) && e.target !== popover && !shouldPreventClose(e)) {
        api.closePopover();
      }
    });

    // Disable Tab key globally when this popover is open
    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Tab" && popover.style.display === "block") {
          e.preventDefault();
          e.stopPropagation();
        }
      },
      true
    );

    // Reposition when window resizes
    window.addEventListener("resize", () => {
      if (popover.style.display === "block" && currentTarget && !isDragging && !api.getSharedPopoverPosition()) {
        api.positionPopover();
      }
    });
  }

  // Hooks into canvas events to hide popover during object movement
  function hookCanvasEvents() {
    window.addEventListener("load", () => {
      setTimeout(() => {
        const fabricCanvas = window.fabricCanvas;
        if (!fabricCanvas) return;

        fabricCanvas.on("object:moving", () => {
          if (!isDragging) {
            isDragging = true;
            api.hidePopoverForDrag();
          }
        });

        fabricCanvas.on("object:modified", () => {
          if (isDragging) {
            isDragging = false;
            setTimeout(() => api.showPopoverAfterDrag(), 50);
          }
        });

        fabricCanvas.on("mouse:up", () => {
          if (isDragging) {
            isDragging = false;
            setTimeout(() => api.showPopoverAfterDrag(), 50);
          }
        });

        fabricCanvas.on("mouse:wheel", () => {
          if (popover.style.display === "block" && currentTarget && !isDragging) {
            api.positionPopover();
          }
        });

        fabricCanvas.on("after:render", () => {
          if (popover.style.display === "block" && currentTarget && !isDragging) {
            api.positionPopover();
          }
        });
      }, 200);
    });
  }

  // Installs intercepts to hook into showDeviceProperties and hideDeviceProperties
  function installIntercepts(interceptConfig = {}) {
    const {
      installKey, // Unique key to prevent double installation (e.g., "__devicePopoverInterceptInstalled")
      shouldIntercept, // Function that determines if this popover should handle the call
      onShowDeviceProperties, // Handler for showDeviceProperties
      onHideDeviceProperties, // Handler for hideDeviceProperties
      waitFor = () => true, // Function that returns true when ready to install
      maxAttempts = 40,
      attemptInterval = 50,
    } = interceptConfig;

    if (!installKey || !shouldIntercept || !onShowDeviceProperties) {
      console.warn("installIntercepts: Missing required configuration");
      return;
    }

    function tryInstall() {
      // Get the current function (might already be wrapped by another intercept)
      const currentShow = window.showDeviceProperties;
      const currentHide = window.hideDeviceProperties;

      if (!currentShow) return false; // Function doesn't exist yet
      if (window[installKey]) return true; // Already installed
      if (!waitFor()) return false; // Not ready yet

      window[installKey] = true;

      // Wrap the current function - this chains intercepts properly
      window.showDeviceProperties = function (deviceType, textObject, target, fourth) {
        if (shouldIntercept(deviceType, textObject, target, fourth)) {
          // This popover should handle it - call the handler with the next in chain
          return onShowDeviceProperties.call(this, deviceType, textObject, target, fourth, currentShow);
        }
        // Not for this popover - pass through to next in chain
        if (typeof currentShow === "function") {
          return currentShow.apply(this, arguments);
        }
      };

      // Wrap hideDeviceProperties - chain this intercept
      window.hideDeviceProperties = function () {
        if (onHideDeviceProperties) {
          onHideDeviceProperties();
        }
        if (typeof currentHide === "function") {
          return currentHide.apply(this, arguments);
        }
      };

      return true;
    }

    // Try to install immediately
    if (tryInstall()) return;

    // Retry with interval if not ready yet
    let attempts = 0;
    const timer = setInterval(() => {
      attempts++;
      if (tryInstall() || attempts > maxAttempts) {
        clearInterval(timer);
      }
    }, attemptInterval);
  }

  // Install intercepts if config provided
  if (callbacks.installIntercepts) {
    installIntercepts(callbacks.installIntercepts);
  }

  // Initialize everything
  setupDragHandling();
  setupEventListeners();
  hookCanvasEvents();

  return api;
}
