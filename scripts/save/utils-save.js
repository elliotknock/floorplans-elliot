export const ObjectTypeUtils = {
  // Checks if an object is a device
  isDevice: (obj) => obj.type === "group" && obj.deviceType,
  // Checks if a device type is a camera
  isCameraDevice: (deviceType) => ["fixed-camera.png", "box-camera.png", "dome-camera.png", "ptz-camera.png", "bullet-camera.png", "thermal-camera.png"].includes(deviceType),
  // Checks if an object is a drawing object
  isDrawingObject: (obj) => {
    if (obj.isCoverage || obj.isBackground) return false;
    if (obj.type === "group" && obj.deviceType && obj.deviceType !== "title-block") return false;
    if (obj.type === "text" && obj.isDeviceLabel) return false;
    if (obj.type === "polygon" && obj.fill?.includes("165, 155, 155")) return false;
    if (obj.isResizeIcon === true) return false;
    if (obj.isConnectionSegment || obj.isNetworkSplitPoint || obj.isNetworkConnection || obj.isSegmentDistanceLabel || obj.isConnectionCustomLabel || obj.isChannelLabel) return false;
    if (obj.type === "circle" && obj.fill === "#f8794b" && obj.radius < 30 && !obj.isWallCircle) return false;
    return true;
  },
  // Checks if an object is a managed object
  isManagedObject: (obj) => {
    return ObjectTypeUtils.isDevice(obj) || (obj.type === "text" && obj.isDeviceLabel) || (obj.type === "polygon" && obj.fill?.includes("165, 155, 155")) || obj.isResizeIcon === true || (obj.type === "circle" && obj.fill === "#f8794b" && obj.radius < 30 && !obj.isWallCircle) || obj.isCoverage === true || obj.isSegmentDistanceLabel || obj.isConnectionCustomLabel || obj.isChannelLabel;
  },
  // Checks if an object is a zone object
  isZoneObject: (obj) => (obj.type === "polygon" && obj.class === "zone-polygon") || (obj.type === "i-text" && obj.class === "zone-text"),
  // Checks if an object is a room object
  isRoomObject: (obj) => (obj.type === "polygon" && obj.class === "room-polygon") || (obj.type === "i-text" && obj.class === "room-text"),
  // Checks if an object is a wall object
  isWallObject: (obj) => (obj.type === "line" && !obj.deviceType && !obj.isResizeIcon && !obj.isConnectionLine && obj.stroke !== "grey" && obj.stroke !== "blue") || (obj.type === "circle" && obj.isWallCircle === true),
  // Checks if an object is a title block
  isTitleBlockObject: (obj) => obj.type === "group" && obj.deviceType === "title-block",
};

export const StyleConfig = {
  standard: {
    borderColor: "#f8794b",
    borderScaleFactor: 2,
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
  },
  line: {
    borderColor: "#f8794b",
    borderScaleFactor: 2,
    cornerSize: 8,
    cornerColor: "#f8794b",
    cornerStrokeColor: "#000000",
    cornerStyle: "circle",
    transparentCorners: false,
    hasControls: false,
    hasBorders: true,
    selectable: true,
    evented: true,
  },
};

export const SerializationUtils = {
  // Extracts basic object data for saving
  extractBaseData: (obj) => ({
    id: obj.id || `obj_${Date.now()}_${Math.random()}`,
    type: obj.type,
    position: { left: obj.left, top: obj.top, originX: obj.originX, originY: obj.originY },
    transform: {
      scaleX: obj.scaleX || 1,
      scaleY: obj.scaleY || 1,
      angle: obj.angle || 0,
      skewX: obj.skewX || 0,
      skewY: obj.skewY || 0,
    },
    visual: {
      opacity: obj.opacity || 1,
      visible: obj.visible !== false,
      selectable: obj.selectable !== false,
      evented: obj.evented !== false,
      hasControls: obj.hasControls || false,
      hasBorders: obj.hasBorders !== false,
      borderColor: obj.borderColor || "#f8794b",
      borderScaleFactor: obj.borderScaleFactor || 2,
      cornerSize: obj.cornerSize || 8,
      cornerColor: obj.cornerColor || "#f8794b",
      cornerStrokeColor: obj.cornerStrokeColor || "#000000",
      cornerStyle: obj.cornerStyle || "circle",
      transparentCorners: obj.transparentCorners !== undefined ? obj.transparentCorners : false,
    },
    customProperties: SerializationUtils.extractCustomProperties(obj),
  }),

  // Extracts custom properties from an object
  extractCustomProperties: (obj) => {
    const customProps = {};
    const customKeys = ["isUploadedImage", "isLocked", "northArrowImage", "lockUniScaling", "strokeUniform", "cursorColor", "isConnectionLine", "isArrow"];
    customKeys.forEach((key) => {
      if (obj[key]) customProps[key] = obj[key];
    });
    return customProps;
  },

  // Applies standard styling to an object
  applyStandardStyling: (obj, styleType = "standard") => {
    const style = StyleConfig[styleType] || StyleConfig.standard;
    obj.set(style);
    return obj;
  },

  // Downloads a file with the given data and filename
  downloadFile: (data, filename) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement("a"), { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
};

export const FormUtils = {
  // Gets a form field value by ID
  getValue: (id) => document.getElementById(id)?.value || "",
  // Sets a form field value by ID
  setValue: (id, value) => {
    const element = document.getElementById(id);
    if (element && value !== undefined && value !== null) {
      element.value = value;
      element.dispatchEvent(new Event("change", { bubbles: true }));
      element.dispatchEvent(new Event("input", { bubbles: true }));
    }
  },
};

export const NotificationSystem = {
  // Shows a notification message to the user
  show: (message, isSuccess = true) => {
    const notification = Object.assign(document.createElement("div"), { textContent: message });
    notification.style.cssText = `
      position: fixed; top: 20px; right: 20px; padding: 12px 24px;
      background: ${isSuccess ? "#ff6f42" : "#dc3545"}; color: white;
      border-radius: 4px; z-index: 10000; font-size: 14px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2); transition: opacity 0.3s ease;
    `;
    document.body.appendChild(notification);
    setTimeout(() => {
      notification.style.opacity = "0";
      setTimeout(() => {
        if (document.body.contains(notification)) {
          document.body.removeChild(notification);
        }
      }, 300);
    }, 3000);
  },
};

export const ProjectUI = {
  // Saves client details from form fields
  serializeClientDetails: () => ({
    date: FormUtils.getValue("client-date-input"),
    clientName: FormUtils.getValue("client-name-test-input"),
    address: FormUtils.getValue("address-input"),
    reportTitle: FormUtils.getValue("report-title-input"),
    rev1: FormUtils.getValue("rev-one-input"),
    rev2: FormUtils.getValue("rev-two-input"),
    rev3: FormUtils.getValue("rev-three-input"),
    logoFile: ProjectUI.getLogoData(),
  }),

  // Gets client logo data
  getLogoData: () => {
    const logoImg = document.querySelector("#client-logo-preview img");
    return logoImg ? { present: true, src: logoImg.src, alt: logoImg.alt || "Client Logo" } : null;
  },

  // Saves screenshot data
  serializeScreenshots: () => {
    const screenshots = [];
    const screenshotPreviews = document.querySelectorAll(".screenshot-preview-item");
    screenshotPreviews.forEach((preview, index) => {
      const img = preview.querySelector(".screenshot-image");
      const checkbox = preview.querySelector(".screenshot-checkbox");
      const titleTextarea = preview.querySelector(".screenshot-title");
      if (img && img.src) {
        screenshots.push({
          id: Date.now() + index,
          dataURL: img.src,
          includeInPrint: checkbox ? checkbox.checked : false,
          title: titleTextarea ? titleTextarea.value.trim() : `Screenshot ${index + 1}`,
          order: index,
        });
      }
    });
    return screenshots;
  },

  // Loads client details into sidebar form fields
  loadClientDetailsToSidebar: async (clientDetails) => {
    try {
      const fieldMappings = {
        "client-date-input": clientDetails.date,
        "client-name-test-input": clientDetails.clientName,
        "address-input": clientDetails.address,
        "report-title-input": clientDetails.reportTitle,
        "rev-one-input": clientDetails.rev1,
        "rev-two-input": clientDetails.rev2,
        "rev-three-input": clientDetails.rev3,
      };
      Object.entries(fieldMappings).forEach(([id, value]) => FormUtils.setValue(id, value));
      const logoPreview = document.getElementById("client-logo-preview");
      if (logoPreview && clientDetails.logoFile && clientDetails.logoFile.present) {
        logoPreview.innerHTML = `<img src="${clientDetails.logoFile.src}" alt="${clientDetails.logoFile.alt}" style="max-width: 100%; max-height: 100px;">`;
        try {
          localStorage.setItem("clientLogoDataUrl", clientDetails.logoFile.src);
        } catch (_) {}
        const logoChangeEvent = new CustomEvent("logoChanged", {
          detail: { src: clientDetails.logoFile.src },
        });
        logoPreview.dispatchEvent(logoChangeEvent);
      } else if (logoPreview) {
        logoPreview.innerHTML = '<span style="color: #999">No logo selected</span>';
        try {
          localStorage.removeItem("clientLogoDataUrl");
        } catch (_) {}
      }
      if (typeof window.updateAllTitleBlocks === "function") setTimeout(() => window.updateAllTitleBlocks(), 100);
    } catch (error) {
      console.error("Error loading client details to sidebar:", error);
    }
  },

  // Loads screenshots into the sidebar
  loadScreenshotsToSidebar: async (screenshots) => {
    try {
      if (!screenshots || !Array.isArray(screenshots) || screenshots.length === 0) return;
      const screenshotPreviews = document.getElementById("screenshot-previews");
      const template = document.getElementById("screenshot-preview-template");
      if (!screenshotPreviews || !template) return;
      screenshotPreviews.innerHTML = "";
      const sortedScreenshots = screenshots.sort((a, b) => (a.order || 0) - (b.order || 0));
      const tempScreenshots = [];
      for (const screenshot of sortedScreenshots) {
        try {
          const screenshotObj = {
            dataURL: screenshot.dataURL,
            includeInPrint: screenshot.includeInPrint || false,
            id: screenshot.id || Date.now() + Math.random(),
          };
          tempScreenshots.push(screenshotObj);
          const previewContainer = template.content.cloneNode(true);
          const previewItem = previewContainer.querySelector(".screenshot-preview-item");
          const img = previewItem.querySelector(".screenshot-image");
          img.src = screenshot.dataURL;
          img.alt = screenshot.title || `Screenshot ${tempScreenshots.length}`;
          const checkbox = previewItem.querySelector(".screenshot-checkbox");
          checkbox.id = `screenshot-${screenshotObj.id}`;
          checkbox.checked = screenshot.includeInPrint || false;
          const label = previewItem.querySelector(".screenshot-checkbox-label");
          label.setAttribute("for", checkbox.id);
          const titleTextarea = previewItem.querySelector(".screenshot-title");
          if (titleTextarea && screenshot.title) titleTextarea.value = screenshot.title;
          checkbox.addEventListener("change", () => {
            screenshotObj.includeInPrint = checkbox.checked;
            if (window.canvasCrop?.getScreenshots) {
              const canvasCropScreenshots = window.canvasCrop.getScreenshots();
              const match = canvasCropScreenshots.find((s) => s.dataURL === screenshotObj.dataURL);
              if (match) match.includeInPrint = checkbox.checked;
            }
          });
          const deleteBtn = previewItem.querySelector(".screenshot-delete-btn");
          deleteBtn.addEventListener("click", () => {
            const index = tempScreenshots.indexOf(screenshotObj);
            if (index > -1) tempScreenshots.splice(index, 1);
            if (window.canvasCrop?.getScreenshots) {
              const canvasCropScreenshots = window.canvasCrop.getScreenshots();
              const canvasCropIndex = canvasCropScreenshots.findIndex((s) => s.dataURL === screenshotObj.dataURL);
              if (canvasCropIndex > -1) canvasCropScreenshots.splice(canvasCropIndex, 1);
            }
            previewItem.remove();
          });
          screenshotPreviews.appendChild(previewContainer);
        } catch (error) {
          console.error("Error loading individual screenshot:", error, screenshot);
        }
      }
      setTimeout(() => {
        try {
          if (window.canvasCrop?.getScreenshots) {
            const canvasCropScreenshots = window.canvasCrop.getScreenshots();
            canvasCropScreenshots.length = 0;
            canvasCropScreenshots.push(...tempScreenshots);
          } else {
            window.loadedScreenshots = tempScreenshots;
          }
          setTimeout(() => {
            const noScreenshotElement = document.getElementById("no-screenshot-taken");
            if (noScreenshotElement) noScreenshotElement.style.display = tempScreenshots.length > 0 ? "none" : "block";
            if (window.updateScreenshotStatus) window.updateScreenshotStatus();
            const screenshotContainer = document.getElementById("screenshot-previews");
            if (screenshotContainer) {
              const tempDiv = document.createElement("div");
              tempDiv.style.display = "none";
              screenshotContainer.appendChild(tempDiv);
              setTimeout(() => {
                if (screenshotContainer.contains(tempDiv)) screenshotContainer.removeChild(tempDiv);
              }, 10);
            }
          }, 100);
        } catch (error) {
          console.error("Error integrating with canvasCrop:", error);
          window.loadedScreenshots = tempScreenshots;
        }
      }, 500);
    } catch (error) {
      console.error("Error loading screenshots to sidebar:", error);
    }
  },
};

export const DrawingUtils = {
  // Extracts specified properties from an object
  extractProps: (obj, keys, extras = {}) => {
    const props = {};
    keys.forEach((key) => {
      if (obj[key] !== undefined && obj[key] !== null) props[key] = obj[key];
    });
    return { ...props, ...extras };
  },
  // Gets absolute position of an object
  getAbsPos: (obj, group) => {
    if (!group) return { x: obj.left, y: obj.top };
    const center = group.getCenterPoint();
    return { x: center.x + obj.left, y: center.y + obj.top };
  },
  // Gets triangle object data for saving
  getTriangleData: (triangleObj, group = null) => {
    const abs = DrawingUtils.getAbsPos(triangleObj, group);
    return {
      width: triangleObj.width,
      height: triangleObj.height,
      fill: triangleObj.fill,
      angle: triangleObj.angle,
      left: triangleObj.left,
      top: triangleObj.top,
      absoluteLeft: abs.x,
      absoluteTop: abs.y,
      originX: triangleObj.originX,
      originY: triangleObj.originY,
    };
  },
  // Gets text object data for saving
  getTextData: (textObj, group = null) => {
    const abs = DrawingUtils.getAbsPos(textObj, group);
    return {
      text: textObj.text,
      fontSize: textObj.fontSize,
      fontFamily: textObj.fontFamily,
      fontWeight: textObj.fontWeight,
      fontStyle: textObj.fontStyle,
      fill: textObj.fill,
      backgroundColor: textObj.backgroundColor,
      stroke: textObj.stroke,
      strokeWidth: textObj.strokeWidth,
      left: textObj.left,
      top: textObj.top,
      absoluteLeft: abs.x,
      absoluteTop: abs.y,
      angle: textObj.angle,
      originX: textObj.originX,
      originY: textObj.originY,
      selectable: textObj.selectable,
      evented: textObj.evented,
    };
  },
  // Gets line object data for saving
  getLineData: (lineObj) => ({
    x1: lineObj.x1,
    y1: lineObj.y1,
    x2: lineObj.x2,
    y2: lineObj.y2,
    stroke: lineObj.stroke,
    strokeWidth: lineObj.strokeWidth,
    strokeDashArray: lineObj.strokeDashArray,
    selectable: lineObj.selectable,
    evented: lineObj.evented,
    hasControls: lineObj.hasControls,
    hasBorders: lineObj.hasBorders,
  }),
  // Determines the type of group object
  getGroupType: (group) => {
    if (group.isBuildingFront || group.groupType === "buildingFront") return "buildingFront";
    if (group.isArrow) return "arrow";
    const objects = group.getObjects();
    if (objects.length === 2) {
      const types = objects.map((o) => o.type).sort();
      if (types.includes("triangle") && types.includes("text")) return "buildingFront";
      if (types.includes("line") && types.includes("triangle")) return "arrow";
      if (types.includes("line") && (types.includes("i-text") || types.includes("text"))) return "measurement";
    }
    return "generic";
  },
  getTitleBlockObjectData: (obj) => {
    const base = {
      type: obj.type,
      left: obj.left,
      top: obj.top,
      width: obj.width,
      height: obj.height,
      angle: obj.angle || 0,
      scaleX: obj.scaleX || 1,
      scaleY: obj.scaleY || 1,
      originX: obj.originX,
      originY: obj.originY,
      visible: obj.visible !== false,
    };
    if (obj.type === "rect") return { ...base, fill: obj.fill, stroke: obj.stroke, strokeWidth: obj.strokeWidth };
    if (obj.type === "textbox")
      return {
        ...base,
        text: obj.text,
        fontSize: obj.fontSize,
        fontFamily: obj.fontFamily,
        fill: obj.fill,
        textAlign: obj.textAlign,
        isHeader: obj.isHeader || false,
        isDateField: obj.isDateField || false,
        isClientName: obj.isClientName || false,
        isClientAddress: obj.isClientAddress || false,
        isReportTitle: obj.isReportTitle || false,
        isRev1: obj.isRev1 || false,
        isRev2: obj.isRev2 || false,
        isRev3: obj.isRev3 || false,
        isClientLogo: obj.isClientLogo || false,
        editable: obj.editable || false,
      };
    if (obj.type === "image" && obj.isClientLogo) {
      return {
        ...base,
        src: obj._element ? obj._element.src : null,
        isClientLogo: true,
        containerBounds: obj.containerBounds || null,
      };
    }
    return base;
  },
  getVisualProps: (obj) => ({
    selectable: obj.selectable !== false,
    hasControls: obj.hasControls || false,
    hasBorders: obj.hasBorders !== false,
    borderColor: obj.borderColor,
    borderScaleFactor: obj.borderScaleFactor,
    cornerSize: obj.cornerSize,
    cornerColor: obj.cornerColor,
    cornerStrokeColor: obj.cornerStrokeColor,
    cornerStyle: obj.cornerStyle,
    transparentCorners: obj.transparentCorners,
  }),
  getCanvasSettings: (fabricCanvas) => ({
    pixelsPerMeter: fabricCanvas.pixelsPerMeter || 17.5,
    zoom: fabricCanvas.getZoom(),
    viewportTransform: [...fabricCanvas.viewportTransform],
  }),
  calculateDistance: (p1, p2) => Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2),
  getTextObjectData: (text) => ({
    text: text.text,
    left: text.left,
    top: text.top,
    fontSize: text.fontSize,
    fontFamily: text.fontFamily,
    fill: text.fill,
    class: text.class,
    selectable: text.selectable,
    evented: text.evented,
    editable: text.editable,
    hasControls: text.hasControls,
    hasBorders: text.hasBorders,
    hoverCursor: text.hoverCursor,
    originX: text.originX,
    originY: text.originY,
    cursorColor: text.cursorColor,
    offsetX: text.offsetX || 0,
    offsetY: text.offsetY || 0,
    displayHeight: text.displayHeight || 2.4,
    borderColor: text.borderColor,
    borderScaleFactor: text.borderScaleFactor,
    cornerSize: text.cornerSize,
    cornerColor: text.cornerColor,
    cornerStrokeColor: text.cornerStrokeColor,
    cornerStyle: text.cornerStyle,
    transparentCorners: text.transparentCorners,
    padding: text.padding,
    controlsVisibility: text.__controlsVisibility || {},
  }),
  // Saves walls data from the canvas
  serializeWalls: (fabricCanvas) => {
    const circles = fabricCanvas.getObjects().filter((obj) => obj.type === "circle" && obj.isWallCircle);
    const lines = fabricCanvas.getObjects().filter((obj) => obj.type === "line" && !obj.deviceType && !obj.isResizeIcon && !obj.isConnectionLine && obj.stroke !== "grey" && obj.stroke !== "blue");
    return {
      circles: circles.map((c, i) => ({
        id: `wall_circle_${i}`,
        left: c.left,
        top: c.top,
        radius: c.radius,
        fill: c.fill,
        stroke: c.stroke,
        strokeWidth: c.strokeWidth,
        strokeDashArray: c.strokeDashArray,
        originX: c.originX,
        originY: c.originY,
        selectable: c.selectable,
        evented: c.evented,
        hasControls: c.hasControls,
        hasBorders: c.hasBorders,
        hoverCursor: c.hoverCursor,
        isWallCircle: true,
        borderColor: c.borderColor,
        deletable: c.deletable,
      })),
      lines: lines.map((l, i) => {
        const findCircle = (x, y) =>
          circles.findIndex((c) => {
            const pt = c.getCenterPoint();
            return Math.abs(pt.x - x) < 10 && Math.abs(pt.y - y) < 10;
          });
        const startIdx = findCircle(l.x1, l.y1);
        const endIdx = findCircle(l.x2, l.y2);
        return {
          id: `wall_line_${i}`,
          x1: l.x1,
          y1: l.y1,
          x2: l.x2,
          y2: l.y2,
          stroke: l.stroke,
          strokeWidth: l.strokeWidth,
          selectable: l.selectable,
          evented: l.evented,
          hasControls: l.hasControls,
          hasBorders: l.hasBorders,
          lockMovementX: l.lockMovementX,
          lockMovementY: l.lockMovementY,
          perPixelTargetFind: l.perPixelTargetFind,
          borderColor: l.borderColor,
          startCircleIndex: startIdx >= 0 ? startIdx : null,
          endCircleIndex: endIdx >= 0 ? endIdx : null,
        };
      }),
    };
  },
  serializeTitleBlocks: (fabricCanvas) =>
    fabricCanvas
      .getObjects()
      .filter((obj) => ObjectTypeUtils.isTitleBlockObject(obj))
      .map((titleblock, i) => {
        try {
          return {
            id: `titleblock_${i}`,
            position: { left: titleblock.left, top: titleblock.top },
            transform: {
              scaleX: titleblock.scaleX || 1,
              scaleY: titleblock.scaleY || 1,
              angle: titleblock.angle || 0,
              originX: titleblock.originX,
              originY: titleblock.originY,
            },
            visual: DrawingUtils.getVisualProps(titleblock),
            objects: titleblock.getObjects().map((obj) => DrawingUtils.getTitleBlockObjectData(obj)),
            deviceType: "title-block",
          };
        } catch (_) {
          return null;
        }
      })
      .filter(Boolean),
};
