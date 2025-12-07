// Handles touch drag-drop for devices and pinch-to-zoom/pan for Fabric canvas
import { addCameraCoverage } from "../devices/camera/camera-core.js";

(function () {
  // Waits until window.fabricCanvas is available
  function waitForCanvas(maxWaitMs = 5000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        if (window.fabricCanvas && window.fabric) return resolve(window.fabricCanvas);
        if (Date.now() - start > maxWaitMs) return reject(new Error("Fabric canvas not ready"));
        requestAnimationFrame(check);
      };
      check();
    });
  }

  // Creates device on canvas at client coordinates
  function createDeviceOnCanvas(fabricCanvas, imgSrc, clientX, clientY, options = {}) {
    const canvasElement = fabricCanvas.getElement();
    const rect = canvasElement.getBoundingClientRect();

    const localX = clientX - rect.left;
    const localY = clientY - rect.top;

    const vpt = fabricCanvas.viewportTransform;
    const zoom = fabricCanvas.getZoom();
    const canvasX = (localX - vpt[4]) / zoom;
    const canvasY = (localY - vpt[5]) / zoom;

    const isCamera = options.isCamera === true || imgSrc.includes("camera");
    window.cameraCounter = window.cameraCounter || 1;
    window.deviceCounter = window.deviceCounter || 1;
    const labelText = isCamera ? `Camera ${window.cameraCounter++}` : `Device ${window.deviceCounter++}`;

    window.fabric.Image.fromURL(
      imgSrc,
      (img) => {
        const defaultIconSize = Math.max(1, Math.min(100, window.defaultDeviceIconSize || 30));
        const scaleFactor = defaultIconSize / 30;

        img.set({
          scaleX: defaultIconSize / img.width,
          scaleY: defaultIconSize / img.height,
          originX: "center",
          originY: "center",
          deviceType: options.deviceType || imgSrc.split("/").pop(),
          coverageConfig: isCamera
            ? {
                startAngle: 270,
                endAngle: 0,
                fillColor: "rgba(165, 155, 155, 0.3)",
                visible: true,
                radius: 175,
                isInitialized: true,
                opacity: 0.3,
              }
            : null,
        });

        const circleRadius = 20 * scaleFactor;
        const circle = new window.fabric.Circle({
          radius: circleRadius,
          fill: "#f8794b",
          originX: "center",
          originY: "center",
        });

        const group = new window.fabric.Group([circle, img], {
          left: canvasX,
          top: canvasY,
          originX: "center",
          originY: "center",
          selectable: true,
          hasControls: false,
          borderColor: "#000000",
          borderScaleFactor: 2,
          hoverCursor: isCamera ? "move" : "default",
          scaleFactor: scaleFactor,
        });

        // Ensure device has a stable id for topology
        if (!group.id) {
          group.id = `device_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        }

        group.initialLabelText = labelText;
        group.deviceType = img.deviceType;
        group.coverageConfig = img.coverageConfig;
        group.location = "";
        group.mountedPosition = "";
        group.partNumber = "";
        group.stockNumber = "";
        group.ipAddress = "";
        group.subnetMask = "";
        group.gatewayAddress = "";
        group.macAddress = "";

        const fontSize = 12 * scaleFactor;
        const text = new window.fabric.Text(labelText, {
          left: canvasX,
          top: canvasY + circleRadius + 10,
          fontFamily: "Poppins, sans-serif",
          fontSize: fontSize,
          fill: "#FFFFFF",
          selectable: false,
          backgroundColor: "rgba(20, 18, 18, 0.8)",
          originX: "center",
          originY: "top",
          isDeviceLabel: true,
          visible: true,
        });

        group.textObject = text;

        group.on("moving", () => {
          const center = group.getCenterPoint();
          const sf = group.scaleFactor || 1;
          text.set({ left: center.x, top: center.y + 20 * sf + 10 });
          text.setCoords();
          group.bringToFront();
          if (text.visible !== false) text.bringToFront();
          fabricCanvas.requestRenderAll();
        });

        text.on("changed", () => {
          const center = group.getCenterPoint();
          const sf = group.scaleFactor || 1;
          text.set({ left: center.x, top: center.y + 20 * sf + 10 });
          text.setCoords();
          fabricCanvas.renderAll();
        });

        group.on("selected", () => {
          if (window.suppressDeviceProperties) return;
          window.showDeviceProperties(group.deviceType, group.textObject, group);
          group.bringToFront();
          if (text.visible !== false) text.bringToFront();
          fabricCanvas.renderAll();
        });

        group.on("deselected", () => window.hideDeviceProperties && window.hideDeviceProperties());

        group.on("removed", () => {
          if (text) fabricCanvas.remove(text);
          if (group.coverageArea) fabricCanvas.remove(group.coverageArea);
          if (group.leftResizeIcon) fabricCanvas.remove(group.leftResizeIcon);
          if (group.rightResizeIcon) fabricCanvas.remove(group.rightResizeIcon);
          if (group.rotateResizeIcon) fabricCanvas.remove(group.rotateResizeIcon);
          fabricCanvas.renderAll();
        });

        fabricCanvas.add(group);
        fabricCanvas.add(text);
        group.bringToFront();
        if (text.visible !== false) text.bringToFront();
        fabricCanvas.setActiveObject(group);

        if (isCamera) {
          addCameraCoverage(fabricCanvas, group);
        }

        fabricCanvas.renderAll();
      },
      { crossOrigin: "anonymous" }
    );
  }

  // Setup touch-based device dragging from sidebar
  function setupDeviceTouchDrag(fabricCanvas) {
    const deviceItems = document.querySelectorAll("#add-devices-submenu .device-item");
    if (!deviceItems.length) return;

    let dragState = null;

    function endDrag(commitEvent) {
      if (!dragState) return;
      const { ghost } = dragState;
      if (ghost && ghost.parentNode) ghost.parentNode.removeChild(ghost);

      if (commitEvent) {
        const canvasElement = fabricCanvas.getElement();
        const canvasRect = canvasElement.getBoundingClientRect();
        const x = commitEvent.changedTouches[0].clientX;
        const y = commitEvent.changedTouches[0].clientY;
        const overCanvas = x >= canvasRect.left && x <= canvasRect.right && y >= canvasRect.top && y <= canvasRect.bottom;
        if (overCanvas) {
          createDeviceOnCanvas(fabricCanvas, dragState.imgSrc, x, y, dragState.options || {});
        }
      }
      dragState = null;
      document.removeEventListener("touchmove", onMove, { passive: false });
      document.removeEventListener("touchend", onEnd, { passive: false });
      document.removeEventListener("touchcancel", onEnd, { passive: false });
    }

    function onMove(e) {
      if (!dragState) return;
      const t = e.touches[0];
      dragState.lastX = t.clientX;
      dragState.lastY = t.clientY;
      const ghost = dragState.ghost;
      if (ghost) {
        ghost.style.transform = `translate(${dragState.lastX - dragState.offsetX}px, ${dragState.lastY - dragState.offsetY}px)`;
      }
      e.preventDefault();
    }

    function onEnd(e) {
      e.preventDefault();
      endDrag(e);
    }

    deviceItems.forEach((deviceItem) => {
      deviceItem.style.touchAction = "none";
      deviceItem.addEventListener(
        "touchstart",
        (e) => {
          if (e.touches.length !== 1) return;
          const t = e.touches[0];
          const imgEl = deviceItem.querySelector("img");
          const imgSrc = imgEl ? imgEl.src : "";
          const isCustom = !!deviceItem.closest("#custom-icons-list");
          const dragOptions = isCustom
            ? {
                isCamera: deviceItem.dataset.isCamera === "1",
                deviceType: deviceItem.dataset.isCamera === "1" ? "custom-camera-icon.png" : "custom-device-icon.png",
              }
            : {};

          // Create a floating ghost preview under finger
          const ghost = document.createElement("div");
          Object.assign(ghost.style, {
            position: "fixed",
            left: "0px",
            top: "0px",
            width: "48px",
            height: "48px",
            pointerEvents: "none",
            zIndex: "10000",
            transform: `translate(${t.clientX - 24}px, ${t.clientY - 24}px)`,
            boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
            borderRadius: "6px",
            background: `url('${imgSrc}') center/contain no-repeat, rgba(0,0,0,0.05)`,
          });
          document.body.appendChild(ghost);

          dragState = {
            imgSrc,
            ghost,
            lastX: t.clientX,
            lastY: t.clientY,
            offsetX: 24,
            offsetY: 24,
            options: dragOptions,
          };

          document.addEventListener("touchmove", onMove, { passive: false });
          document.addEventListener("touchend", onEnd, { passive: false });
          document.addEventListener("touchcancel", onEnd, { passive: false });
          e.preventDefault();
        },
        { passive: false }
      );
    });
  }

  // Setup pinch-to-zoom and one-finger panning
  function setupCanvasTouchGestures(fabricCanvas) {
    const canvasEl = fabricCanvas.getElement();
    const container = canvasEl.parentElement;
    if (!container) return;

    container.style.touchAction = "none";

    let isTouchPanning = false;
    let startOnObject = false;
    let lastX = 0;
    let lastY = 0;

    // Long press variables
    let longPressTimer = null;
    let longPressTarget = null;
    let longPressStartX = 0;
    let longPressStartY = 0;
    const LONG_PRESS_DURATION = 250;
    const LONG_PRESS_TOLERANCE = 10;

    let pinchActive = false;
    let pinchStartDist = 0;
    let pinchStartZoom = 1;

    const getTouchDist = (t1, t2) => {
      const dx = t2.clientX - t1.clientX;
      const dy = t2.clientY - t1.clientY;
      return Math.hypot(dx, dy);
    };

    const startLongPressTimer = (touch) => {
      if (longPressTimer) clearTimeout(longPressTimer);
      longPressTarget = null;
      longPressStartX = touch.clientX;
      longPressStartY = touch.clientY;

      longPressTimer = setTimeout(() => {
        try {
          const pointer = fabricCanvas.getPointer({ clientX: touch.clientX, clientY: touch.clientY }, true);
          longPressTarget = fabricCanvas.findTarget({ clientX: touch.clientX, clientY: touch.clientY });

          if (longPressTarget && window._fabricContextMenu && typeof window._fabricContextMenu.showMenu === "function") {
            window._fabricContextMenu.showMenu(longPressTarget, touch.clientX, touch.clientY);
          }
        } catch (err) {
          console.warn("Failed to detect long press target:", err);
        }
      }, LONG_PRESS_DURATION);
    };

    const cancelLongPressTimer = () => {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
        longPressTarget = null;
      }
    };

    const isTouchMoved = (touch) => {
      const dx = Math.abs(touch.clientX - longPressStartX);
      const dy = Math.abs(touch.clientY - longPressStartY);
      return dx > LONG_PRESS_TOLERANCE || dy > LONG_PRESS_TOLERANCE;
    };

    container.addEventListener(
      "touchstart",
      (e) => {
        if (e.touches.length === 1) {
          startOnObject = false;
          try {
            if (typeof fabricCanvas.findTarget === "function") {
              const target = fabricCanvas.findTarget(e);
              startOnObject = !!target;
            }
          } catch (_) {}

          isTouchPanning = !startOnObject;
          lastX = e.touches[0].clientX;
          lastY = e.touches[0].clientY;

          if (startOnObject) {
            startLongPressTimer(e.touches[0]);
          }
        } else if (e.touches.length === 2) {
          pinchActive = true;
          pinchStartDist = getTouchDist(e.touches[0], e.touches[1]);
          pinchStartZoom = fabricCanvas.getZoom();
          cancelLongPressTimer();
        }
        e.preventDefault();
      },
      { passive: false }
    );

    container.addEventListener(
      "touchmove",
      (e) => {
        if (longPressTimer && e.touches.length === 1) {
          if (isTouchMoved(e.touches[0])) {
            cancelLongPressTimer();
          }
        }

        if (pinchActive && e.touches.length === 2) {
          const minZoom = 0.25;
          const maxZoom = 10;
          const dist = getTouchDist(e.touches[0], e.touches[1]);
          let zoom = pinchStartZoom * (dist / pinchStartDist);
          zoom = Math.max(minZoom, Math.min(maxZoom, zoom));

          const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
          const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
          const fakeEvt = { clientX: centerX, clientY: centerY };
          const pointer = fabricCanvas.getPointer(fakeEvt, true);
          const zoomPoint = new window.fabric.Point(pointer.x, pointer.y);
          fabricCanvas.zoomToPoint(zoomPoint, zoom);
          fabricCanvas.requestRenderAll();
          e.preventDefault();
          return;
        }

        if (isTouchPanning && e.touches.length === 1) {
          const t = e.touches[0];
          const dx = t.clientX - lastX;
          const dy = t.clientY - lastY;
          lastX = t.clientX;
          lastY = t.clientY;

          const vpt = fabricCanvas.viewportTransform;
          vpt[4] += dx;
          vpt[5] += dy;
          fabricCanvas.setViewportTransform(vpt);
          fabricCanvas.requestRenderAll();
          e.preventDefault();
        }
      },
      { passive: false }
    );

    container.addEventListener(
      "touchend",
      (e) => {
        cancelLongPressTimer();
        if (e.touches.length === 0) {
          isTouchPanning = false;
          pinchActive = false;
          startOnObject = false;
        }
        e.preventDefault();
      },
      { passive: false }
    );

    container.addEventListener(
      "touchcancel",
      (e) => {
        cancelLongPressTimer();
        isTouchPanning = false;
        pinchActive = false;
        e.preventDefault();
      },
      { passive: false }
    );
  }

  function init() {
    waitForCanvas()
      .then((fabricCanvas) => {
        try {
          setupDeviceTouchDrag(fabricCanvas);
          setupCanvasTouchGestures(fabricCanvas);
        } catch (err) {
          console.error("Failed to initialize mobile compatibility:", err);
        }
      })
      .catch((err) => console.warn("Mobile compatibility skipped:", err));
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

