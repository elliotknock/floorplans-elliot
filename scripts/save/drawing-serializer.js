import { ObjectTypeUtils, SerializationUtils, StyleConfig, NotificationSystem, ProjectUI, DrawingUtils } from "./utils-save.js";

class OptimizedDrawingObjectSerializer {
  constructor(fabricCanvas) {
    this.fabricCanvas = fabricCanvas;
  }

  // Type check helpers
  isDrawingObject = ObjectTypeUtils.isDrawingObject;
  isZoneObject = ObjectTypeUtils.isZoneObject;
  isRoomObject = ObjectTypeUtils.isRoomObject;
  isWallObject = ObjectTypeUtils.isWallObject;
  isTitleBlockObject = ObjectTypeUtils.isTitleBlockObject;

  // Applies standard styling to objects
  applyStandardStyling(obj, customControls = null) {
    obj.set(StyleConfig.standard);
    if (customControls !== null) obj.set({ hasControls: customControls });
    return obj;
  }

  // Saves all drawing objects to a JSON format
  serializeDrawingObjects() {
    return {
      drawingObjects: this.fabricCanvas
        .getObjects()
        .filter((obj) => this.isDrawingObject(obj))
        .map((obj) => this.serializeDrawingObject(obj))
        .filter(Boolean),
      zones: this.serializeZones(),
      rooms: this.serializeRooms(),
      walls: DrawingUtils.serializeWalls(this.fabricCanvas),
      titleblocks: DrawingUtils.serializeTitleBlocks(this.fabricCanvas),
      canvasSettings: DrawingUtils.getCanvasSettings(this.fabricCanvas),
      globalState: { zonesArray: window.zones || [], roomsArray: window.rooms || [] },
      topology: window.topologyManager?.getConnectionsData?.() || [],
    };
  }

  // Saves one drawing object's data
  serializeDrawingObject(obj) {
    try {
      // Skip zones, rooms, walls, and titleblocks
      if (this.isZoneObject(obj) || this.isRoomObject(obj) || this.isWallObject(obj) || this.isTitleBlockObject(obj)) return null;

      const baseData = SerializationUtils.extractBaseData(obj);

      // Special handling for uploaded images
      if (obj.type === "image" && obj.isUploadedImage) {
        return {
          ...baseData,
          drawingType: "uploadedImage",
          properties: {
            width: obj.width,
            height: obj.height,
            src: obj._element?.src,
            scaleX: obj.scaleX,
            scaleY: obj.scaleY,
          },
          lockState: {
            isLocked: obj.isLocked || false,
            lockMovementX: obj.lockMovementX || false,
            lockMovementY: obj.lockMovementY || false,
            lockRotation: obj.lockRotation || false,
            lockScalingX: obj.lockScalingX || false,
            lockScalingY: obj.lockScalingY || false,
          },
          isUploadedImage: true,
        };
      }

      // Handle different object types
      if (obj.type === "group") return this.serializeGroup(obj, baseData);
      if (obj.type === "circle")
        return {
          ...baseData,
          drawingType: "circle",
          properties: DrawingUtils.extractProps(obj, ["radius", "fill", "stroke", "strokeWidth", "strokeDashArray", "strokeUniform"]),
        };
      if (obj.type === "rect")
        return {
          ...baseData,
          drawingType: "rectangle",
          properties: DrawingUtils.extractProps(obj, ["width", "height", "fill", "stroke", "strokeWidth", "strokeDashArray", "strokeUniform"]),
        };
      if (obj.type === "line") {
        const props = DrawingUtils.extractProps(obj, ["x1", "y1", "x2", "y2", "stroke", "strokeWidth", "strokeDashArray"]);
        // Save the isConnectionLine property for connection lines
        if (obj.isConnectionLine) {
          props.isConnectionLine = true;
        }
        return {
          ...baseData,
          drawingType: "line",
          properties: props,
        };
      }
      if (obj.type === "triangle")
        return {
          ...baseData,
          drawingType: "triangle",
          properties: DrawingUtils.extractProps(obj, ["width", "height", "fill", "stroke", "strokeWidth"]),
        };
      if (obj.type === "i-text" || obj.type === "textbox")
        return {
          ...baseData,
          drawingType: "text",
          properties: DrawingUtils.extractProps(obj, ["text", "fontSize", "fontFamily", "fontWeight", "fontStyle", "fill", "backgroundColor", "stroke", "strokeWidth", "width", "height", "textAlign", "lineHeight", "charSpacing", "cursorColor"]),
        };
      if (obj.type === "image")
        return {
          ...baseData,
          drawingType: "image",
          properties: DrawingUtils.extractProps(obj, ["width", "height"], {
            src: obj._element?.src,
          }),
        };

      return { ...baseData, drawingType: "generic", fabricObject: obj.toObject() };
    } catch (error) {
      console.error("Error serializing drawing object:", error);
      return null;
    }
  }

  // Saves a group object's data
  serializeGroup(obj, baseData) {
    const groupType = DrawingUtils.getGroupType(obj);
    const objects = obj.getObjects();

    if (groupType === "buildingFront") {
      const [tri, txt] = [objects.find((o) => o.type === "triangle"), objects.find((o) => o.type === "text")];
      return {
        ...baseData,
        drawingType: "group",
        groupType: "buildingFront",
        properties: { width: obj.width, height: obj.height },
        buildingFrontData: {
          triangle: tri ? DrawingUtils.getTriangleData(tri, obj) : null,
          text: txt ? DrawingUtils.getTextData(txt, obj) : null,
        },
        isBuildingFront: true,
      };
    }

    if (groupType === "arrow") {
      const [line, triangle] = [objects.find((o) => o.type === "line"), objects.find((o) => o.type === "triangle")];
      return {
        ...baseData,
        drawingType: "arrow",
        properties: { width: obj.width, height: obj.height },
        arrowData: {
          line: DrawingUtils.getLineData(line),
          triangle: DrawingUtils.getTriangleData(triangle, obj),
          endPoint: { x: line.x2, y: line.y2 },
        },
      };
    }

    if (groupType === "measurement") {
      const [line, text] = objects;
      return {
        ...baseData,
        drawingType: "group",
        groupType: "measurement",
        properties: { width: obj.width, height: obj.height },
        measurementData: {
          line: DrawingUtils.getLineData(line),
          text: DrawingUtils.getTextData(text, obj),
          groupCenter: obj.getCenterPoint(),
        },
      };
    }

    return {
      ...baseData,
      drawingType: "group",
      groupType,
      properties: { width: obj.width, height: obj.height },
      objects: objects.map((o) => this.serializeDrawingObject(o)),
    };
  }

  // Saves all zone polygons to JSON
  serializeZones() {
    if (!window.zones?.length) return [];
    return window.zones
      .filter((z) => z.polygon && this.fabricCanvas.getObjects().includes(z.polygon) && z.text && this.fabricCanvas.getObjects().includes(z.text))
      .map((z, i) => {
        try {
          const p = z.polygon;
          return {
            id: `zone_${i}`,
            zoneName: p.zoneName || `Zone ${i + 1}`,
            zoneNumber: p.zoneNumber || z.zoneNumber || "",
            zoneResistanceValue: p.zoneResistanceValue || z.zoneResistanceValue || "",
            zoneNotes: p.zoneNotes || "",
            area: p.area || 0,
            height: p.height || 2.4,
            volume: p.volume || 0,
            polygon: DrawingUtils.extractProps(p, ["points", "fill", "stroke", "strokeWidth", "left", "top", "scaleX", "scaleY", "angle", "class", "selectable", "evented", "hasControls", "hasBorders", "hoverCursor", "perPixelTargetFind"]),
            text: this.getTextObjectData(z.text),
          };
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean);
  }

  // Saves all room polygons to JSON
  serializeRooms() {
    if (!window.rooms?.length) return [];
    return window.rooms
      .filter((r) => r.polygon && this.fabricCanvas.getObjects().includes(r.polygon) && r.text && this.fabricCanvas.getObjects().includes(r.text))
      .map((r, i) => {
        try {
          const p = r.polygon;
          return {
            id: `room_${i}`,
            roomName: r.roomName || p.roomName || `Room ${i + 1}`,
            roomNotes: r.roomNotes || p.roomNotes || "",
            roomColor: r.roomColor || p.stroke || "#0066cc",
            area: r.area || p.area || 0,
            height: r.height || p.height || 2.4,
            volume: r.volume || p.volume || 0,
            devices: r.devices || [],
            polygon: DrawingUtils.extractProps(p, ["points", "fill", "stroke", "strokeWidth", "left", "top", "scaleX", "scaleY", "angle", "class", "selectable", "evented", "hasControls", "hasBorders", "hoverCursor", "perPixelTargetFind"]),
            text: this.getTextObjectData(r.text),
          };
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean);
  }

  getTextObjectData(text) {
    return {
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
    };
  }

  // ===== LOADING METHODS =====

  // Loads saved drawing objects back onto canvas
  async loadDrawingObjects(serializedData) {
    try {
      // Restore canvas settings
      if (serializedData.canvasSettings) {
        Object.assign(this.fabricCanvas, {
          pixelsPerMeter: serializedData.canvasSettings.pixelsPerMeter || 17.5,
        });
        if (serializedData.canvasSettings.zoom) this.fabricCanvas.setZoom(serializedData.canvasSettings.zoom);
        if (serializedData.canvasSettings.viewportTransform) this.fabricCanvas.setViewportTransform(serializedData.canvasSettings.viewportTransform);
      }

      // Restore global state
      if (serializedData.globalState) {
        window.zones = serializedData.globalState.zonesArray || [];
        window.rooms = serializedData.globalState.roomsArray || [];
      }

      // Clean up potential conflicts
      this.fabricCanvas
        .getObjects()
        .filter((obj) => (obj.type === "polygon" && obj.fill?.includes("165, 155, 155")) || (obj.type === "circle" && obj.fill === "#f8794b" && !obj.isWallCircle && obj.radius < 30))
        .forEach((obj) => this.fabricCanvas.remove(obj));

      // Load objects
      if (serializedData.drawingObjects?.length) {
        for (let i = 0; i < serializedData.drawingObjects.length; i++) {
          try {
            await this.loadDrawingObject(serializedData.drawingObjects[i]);
            // Add small delay between objects to prevent overload
            if (i < serializedData.drawingObjects.length - 1) await new Promise((r) => setTimeout(r, 10));
          } catch (e) {
            console.error(`Failed to load drawing object ${i + 1}:`, e);
          }
        }
      }

      // Load zones, rooms, walls, and title blocks in order
      if (serializedData.zones?.length) await this.loadZones(serializedData.zones);
      if (serializedData.rooms?.length) await this.loadRooms(serializedData.rooms);
      if (serializedData.walls?.circles?.length || serializedData.walls?.lines?.length) {
        await new Promise((r) => setTimeout(r, 200));
        await this.loadWalls(serializedData.walls);
      }
      if (serializedData.titleblocks?.length) await this.loadTitleBlocks(serializedData.titleblocks);

      this.fabricCanvas.requestRenderAll();
      setTimeout(() => this.reinitializeDrawingTools(), 300);
      return true;
    } catch (error) {
      console.error("Error loading drawing objects:", error);
      return false;
    }
  }

  // Loads one saved drawing object
  async loadDrawingObject(objectData) {
    return new Promise((resolve, reject) => {
      try {
        // Filter out legacy blue network topology lines, but keep drawing connection lines
        const stroke = objectData.properties?.stroke;
        const isTopologyLine = typeof stroke === "string" && (stroke.toLowerCase() === "#2196f3" || /rgba?\(\s*33\s*,\s*150\s*,\s*243/i.test(stroke)) && objectData.properties?.selectable === false && objectData.properties?.evented === false;
        if (isTopologyLine) return resolve(null);

        // For connection lines, only check ID to avoid position-based false duplicates
        const isConnectionLine = objectData.properties?.isConnectionLine === true;
        const duplicate = isConnectionLine ? this.fabricCanvas.getObjects().find((o) => o.id === objectData.id) : this.fabricCanvas.getObjects().find((o) => o.id === objectData.id || (o.type === objectData.type && Math.abs(o.left - objectData.position.left) < 1 && Math.abs(o.top - objectData.position.top) < 1));

        if (duplicate) {
          // Don't apply standard styling to connection lines - they need special properties preserved
          if (!duplicate.isConnectionLine) {
            this.applyStandardStyling(duplicate);
          }
          return resolve(duplicate);
        }

        const creator = this.getObjectCreator(objectData);
        if (creator) {
          creator((obj) => {
            if (!obj) return reject(new Error("Failed to create object"));
            Object.assign(obj, { id: objectData.id });
            // Don't apply standard styling to connection lines - they need special properties preserved
            if (!obj.isConnectionLine) {
              this.applyStandardStyling(obj);
            }
            this.fabricCanvas.add(obj);
            resolve(obj);
          }, reject);
        } else {
          fabric.util.enlivenObjects([objectData.fabricObject], (objects) => {
            if (objects?.[0]) {
              Object.assign(objects[0], { id: objectData.id });
              // Don't apply standard styling to connection lines - they need special properties preserved
              if (!objects[0].isConnectionLine) {
                this.applyStandardStyling(objects[0]);
              }
              this.fabricCanvas.add(objects[0]);
              resolve(objects[0]);
            } else reject(new Error("Failed to create generic object"));
          });
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  isConnectionLine(objectData) {
    // Check if the object has the isConnectionLine property set
    if (objectData.properties?.isConnectionLine === true) return true;
    // Also check for legacy blue network topology lines
    const stroke = objectData.properties?.stroke;
    return typeof stroke === "string" && (stroke.toLowerCase() === "#2196f3" || /rgba?\(\s*33\s*,\s*150\s*,\s*243/i.test(stroke)) && objectData.properties?.selectable === false && objectData.properties?.evented === false;
  }

  // Creates the right type of object from saved data
  getObjectCreator(objectData) {
    const { position, transform, visual, properties } = objectData;
    const props = { ...position, ...transform, ...visual, ...properties };

    // Simple creators
    const simpleCreators = {
      circle: () => new fabric.Circle(props),
      rectangle: () => new fabric.Rect(props),
      text: () => new (objectData.type === "textbox" ? fabric.Textbox : fabric.IText)(properties.text, props),
      line: () => {
        const lineProps = {
          ...props,
          stroke: properties.stroke,
          strokeWidth: properties.strokeWidth,
          strokeDashArray: properties.strokeDashArray,
        };
        // Restore isConnectionLine property for connection lines
        if (properties.isConnectionLine) {
          lineProps.isConnectionLine = true;
        }
        return new fabric.Line([properties.x1, properties.y1, properties.x2, properties.y2], lineProps);
      },
      triangle: () => new fabric.Triangle(props),
    };

    if (simpleCreators[objectData.drawingType]) return (callback) => callback(simpleCreators[objectData.drawingType]());

    // Complex creators (image, uploadedImage, arrow, measurement, buildingFront)
    return (callback, reject) => {
      if (objectData.drawingType === "image" || objectData.drawingType === "uploadedImage") {
        if (!properties.src) return reject(new Error("No image source"));
        fabric.Image.fromURL(
          properties.src,
          (img) => {
            if (!img) return reject(new Error(`Failed to load image: ${properties.src}`));
            img.set({
              ...props,
              isUploadedImage: objectData.drawingType === "uploadedImage",
              ...(objectData.lockState || {}),
            });
            // Apply lock control visibility for locked uploaded images
            if (objectData.drawingType === "uploadedImage" && objectData.lockState?.isLocked) {
              img.setControlsVisibility({
                lockControl: true,
                mtr: false,
                ml: false,
                mr: false,
                mt: false,
                mb: false,
                tl: false,
                tr: false,
                bl: false,
                br: false,
              });
            }
            callback(img);
          },
          { crossOrigin: "anonymous" }
        );
      } else if (objectData.drawingType === "arrow") {
        callback(this.createArrowGroup(objectData, props));
      } else if (objectData.groupType === "measurement") {
        callback(this.createMeasurementGroup(objectData, props));
      } else if (objectData.groupType === "buildingFront") {
        callback(this.createBuildingFrontGroup(objectData, props));
      }
    };
  }

  // Creates an arrow group from saved data
  createArrowGroup(objectData, props) {
    const { arrowData } = objectData;
    const line = new fabric.Line([arrowData.line.x1, arrowData.line.y1, arrowData.line.x2, arrowData.line.y2], {
      stroke: arrowData.line.stroke || "blue",
      strokeWidth: arrowData.line.strokeWidth || 2,
      strokeDashArray: arrowData.line.strokeDashArray || null,
      selectable: arrowData.line.selectable ?? false,
      evented: arrowData.line.evented ?? false,
      hasControls: arrowData.line.hasControls ?? false,
      hasBorders: arrowData.line.hasBorders ?? false,
    });
    const triangle = new fabric.Triangle({
      left: arrowData.triangle.absoluteLeft ?? arrowData.triangle.left ?? arrowData.endPoint.x,
      top: arrowData.triangle.absoluteTop ?? arrowData.triangle.top ?? arrowData.endPoint.y,
      originX: arrowData.triangle.originX || "center",
      originY: arrowData.triangle.originY || "center",
      width: arrowData.triangle.width || 10,
      height: arrowData.triangle.height || 10,
      fill: arrowData.triangle.fill || arrowData.line.stroke || "blue",
      angle: arrowData.triangle.angle || 0,
      selectable: false,
      evented: false,
    });
    const group = new fabric.Group([line, triangle], {
      ...props,
      hasControls: false,
      borderColor: "#f8794b",
      cornerColor: "#f8794b",
      isArrow: true,
    });
    this.applyStandardStyling(group, false);
    group.set({ borderScaleFactor: 1 });
    return group;
  }

  // Creates a measurement group from saved data
  createMeasurementGroup(objectData, props) {
    const { line: ld, text: td } = objectData.measurementData;
    const line = new fabric.Line([ld.x1, ld.y1, ld.x2, ld.y2], {
      stroke: ld.stroke || "purple",
      strokeWidth: ld.strokeWidth || 3,
      strokeDashArray: ld.strokeDashArray || null,
      selectable: ld.selectable ?? false,
      evented: ld.evented ?? false,
      hasControls: ld.hasControls ?? false,
      hasBorders: ld.hasBorders ?? false,
    });
    const text = new fabric.IText(td.text || "", {
      left: td.absoluteLeft ?? td.left,
      top: td.absoluteTop ?? td.top,
      fontSize: td.fontSize || 16,
      fontFamily: td.fontFamily || "Poppins, sans-serif",
      fontWeight: td.fontWeight,
      fontStyle: td.fontStyle,
      fill: td.fill || "#000000",
      backgroundColor: td.backgroundColor,
      stroke: td.stroke,
      strokeWidth: td.strokeWidth,
      originX: td.originX || "center",
      originY: td.originY || "center",
      angle: td.angle || 0,
      selectable: td.selectable ?? false,
      evented: td.evented ?? false,
    });
    const group = new fabric.Group([line, text], { ...props, hasControls: false });
    this.applyStandardStyling(group, false);
    group.set({ borderScaleFactor: 1 });
    return group;
  }

  // Creates a building front group from saved data
  createBuildingFrontGroup(objectData, props) {
    const { triangle: tri, text: txt } = objectData.buildingFrontData;
    const triangle = new fabric.Triangle({
      left: tri.absoluteLeft ?? tri.left,
      top: tri.absoluteTop ?? tri.top,
      width: tri.width || 30,
      height: tri.height || 50,
      fill: tri.fill || "grey",
      originX: tri.originX || "center",
      originY: tri.originY || "center",
      angle: tri.angle || 0,
      selectable: false,
      evented: false,
    });
    const text = new fabric.Text(txt.text || "Front", {
      left: txt.absoluteLeft ?? txt.left,
      top: txt.absoluteTop ?? txt.top,
      fontSize: txt.fontSize || 18,
      fontWeight: txt.fontWeight,
      fontStyle: txt.fontStyle,
      fill: txt.fill || "black",
      originX: txt.originX || "center",
      originY: txt.originY || "center",
      angle: txt.angle || 0,
      selectable: false,
      evented: false,
    });
    const group = new fabric.Group([triangle, text], {
      ...props,
      groupType: "buildingFront",
      isBuildingFront: true,
    });
    this.applyStandardStyling(group);
    return group;
  }

  // Loads saved zones onto canvas
  async loadZones(zonesData) {
    await this.loadPolygonTextData("zones", zonesData);
    setTimeout(() => window.maintainZoneLayerOrder?.(), 100);
  }

  // Loads saved rooms onto canvas
  async loadRooms(roomsData) {
    await this.loadPolygonTextData("rooms", roomsData);
    setTimeout(() => window.maintainRoomLayerOrder?.(), 100);
  }

  // Loads zones or rooms polygons with their text labels
  async loadPolygonTextData(type, dataArray) {
    const arrayName = window[type];
    if (arrayName?.length > 0) {
      arrayName.forEach((item) => {
        if (item.polygon && this.fabricCanvas.getObjects().includes(item.polygon)) {
          item.polygon.off();
          this.fabricCanvas.remove(item.polygon);
        }
        if (item.text && this.fabricCanvas.getObjects().includes(item.text)) {
          item.text.off();
          this.fabricCanvas.remove(item.text);
        }
      });
    }
    window[type] = [];

    for (const itemData of dataArray) {
      try {
        const props =
          type === "zones"
            ? {
                zoneName: itemData.zoneName,
                zoneNotes: itemData.zoneNotes,
                zoneNumber: itemData.zoneNumber ?? itemData.polygon.zoneNumber ?? undefined,
                zoneResistanceValue: itemData.zoneResistanceValue ?? itemData.polygon.zoneResistanceValue ?? undefined,
              }
            : { roomName: itemData.roomName, roomNotes: itemData.roomNotes };
        const polygon = new fabric.Polygon(itemData.polygon.points, {
          ...itemData.polygon,
          ...props,
          area: itemData.area,
          height: itemData.height,
          volume: itemData.volume,
        });
        const text = new fabric.IText(itemData.text.text, { ...itemData.text });
        polygon.associatedText = text;
        text.associatedPolygon = polygon;
        this.fabricCanvas.add(polygon);
        this.fabricCanvas.add(text);
        window[type].push(
          type === "zones"
            ? { polygon, text }
            : {
                polygon,
                text,
                roomName: itemData.roomName,
                roomNotes: itemData.roomNotes,
                roomColor: itemData.roomColor,
                area: itemData.area,
                height: itemData.height,
                volume: itemData.volume,
                devices: itemData.devices || [],
              }
        );
        this[type === "zones" ? "addZoneEventHandlers" : "addRoomEventHandlers"](polygon, text);
        await new Promise((r) => setTimeout(r, 50));
      } catch (e) {
        console.error(`Failed to load ${type.slice(0, -1)}:`, e);
      }
    }
  }

  // Loads saved walls onto canvas
  async loadWalls(wallsData) {
    if (!wallsData?.circles || !wallsData?.lines) return;
    const { circles: circleData, lines: lineData } = wallsData;

    // Remove existing walls
    this.fabricCanvas
      .getObjects()
      .filter((obj) => (obj.type === "circle" && obj.isWallCircle) || (obj.type === "line" && !obj.deviceType && !obj.isResizeIcon && !obj.isConnectionLine))
      .forEach((obj) => {
        if (obj._wallUpdateHandler) obj.off("moving", obj._wallUpdateHandler);
        this.fabricCanvas.remove(obj);
      });

    // Load circles
    const loadedCircles = [];
    for (let i = 0; i < circleData.length; i++) {
      try {
        const ci = circleData[i];
        const circle = new fabric.Circle({
          left: ci.left,
          top: ci.top,
          radius: ci.radius || 3,
          fill: ci.fill || "black",
          stroke: ci.stroke,
          strokeWidth: ci.strokeWidth || 0,
          strokeDashArray: ci.strokeDashArray,
          originX: ci.originX || "center",
          originY: ci.originY || "center",
          selectable: ci.selectable !== false,
          evented: ci.evented !== false,
          hasControls: ci.hasControls || false,
          hasBorders: ci.hasBorders || false,
          borderColor: ci.borderColor || "#f8794b",
          hoverCursor: "pointer",
          moveCursor: "move",
          isWallCircle: true,
          deletable: ci.deletable !== undefined ? ci.deletable : false,
        });
        circle._wallUpdateHandler = () => this.updateConnectedWallLines(circle);
        circle.on("moving", circle._wallUpdateHandler);
        this.fabricCanvas.add(circle);
        loadedCircles.push(circle);
      } catch (e) {
        loadedCircles.push(null);
      }
    }

    await new Promise((r) => setTimeout(r, 100));

    // Load lines
    for (const li of lineData) {
      try {
        const line = new fabric.Line([li.x1, li.y1, li.x2, li.y2], {
          stroke: li.stroke || "red",
          strokeWidth: li.strokeWidth || 2,
          selectable: li.selectable !== false,
          evented: li.evented !== false,
          hasControls: li.hasControls || false,
          hasBorders: li.hasBorders !== false,
          lockMovementX: li.lockMovementX !== false,
          lockMovementY: li.lockMovementY !== false,
          perPixelTargetFind: li.perPixelTargetFind !== false,
          borderColor: li.borderColor || "#f8794b",
        });
        if (li.startCircleIndex !== null && li.startCircleIndex >= 0 && loadedCircles[li.startCircleIndex]) line.startCircle = loadedCircles[li.startCircleIndex];
        if (li.endCircleIndex !== null && li.endCircleIndex >= 0 && loadedCircles[li.endCircleIndex]) line.endCircle = loadedCircles[li.endCircleIndex];
        line.on("removed", () => this.handleWallLineDeletion(line));
        this.fabricCanvas.add(line);
      } catch (e) {
        console.error("Failed to load wall line:", e);
      }
    }

    await new Promise((r) => setTimeout(r, 50));
    setTimeout(() => {
      this.organizeWallLayers();
      this.ensureCameraResizeIconsOnTop();
      this.fabricCanvas.requestRenderAll();
    }, 200);
  }

  // Loads saved title blocks onto canvas
  async loadTitleBlocks(titleblocksData) {
    for (const titleblockData of titleblocksData) {
      try {
        const objects = [];
        for (const objData of titleblockData.objects) {
          if (objData.type === "rect") {
            objects.push(new fabric.Rect({ ...objData }));
          } else if (objData.type === "textbox") {
            const textbox = new fabric.Textbox(objData.text, {
              left: objData.left,
              top: objData.top,
              width: objData.width,
              height: objData.height,
              fontSize: objData.fontSize,
              fontFamily: objData.fontFamily,
              fill: objData.fill,
              textAlign: objData.textAlign,
              angle: objData.angle,
              scaleX: objData.scaleX,
              scaleY: objData.scaleY,
              originX: objData.originX,
              originY: objData.originY,
              visible: objData.visible,
              isHeader: objData.isHeader,
              isDateField: objData.isDateField,
              isClientName: objData.isClientName,
              isClientAddress: objData.isClientAddress,
              isReportTitle: objData.isReportTitle,
              isRev1: objData.isRev1,
              isRev2: objData.isRev2,
              isRev3: objData.isRev3,
              isClientLogo: objData.isClientLogo,
              editable: objData.editable,
            });
            objects.push(textbox);
          } else if (objData.type === "image" && objData.isClientLogo && objData.src) {
            await new Promise((resolve, reject) => {
              fabric.Image.fromURL(
                objData.src,
                (img) => {
                  if (img) {
                    img.set({
                      left: objData.left,
                      top: objData.top,
                      width: objData.width,
                      height: objData.height,
                      scaleX: objData.scaleX,
                      scaleY: objData.scaleY,
                      angle: objData.angle,
                      originX: objData.originX,
                      originY: objData.originY,
                      visible: objData.visible,
                      isClientLogo: true,
                      containerBounds: objData.containerBounds,
                    });
                    objects.push(img);
                    resolve();
                  } else reject(new Error("Failed to load client logo"));
                },
                { crossOrigin: "anonymous" }
              );
            });
          }
        }

        const titleblockGroup = new fabric.Group(objects, {
          left: titleblockData.position.left,
          top: titleblockData.position.top,
          scaleX: titleblockData.transform.scaleX,
          scaleY: titleblockData.transform.scaleY,
          angle: titleblockData.transform.angle,
          originX: titleblockData.transform.originX,
          originY: titleblockData.transform.originY,
          selectable: titleblockData.visual.selectable,
          hasControls: titleblockData.visual.hasControls,
          hasBorders: titleblockData.visual.hasBorders,
          deviceType: "title-block",
          cursorColor: "#f8794b",
          borderColor: titleblockData.visual.borderColor || "#f8794b",
          borderScaleFactor: titleblockData.visual.borderScaleFactor || 2,
          cornerSize: titleblockData.visual.cornerSize || 8,
          cornerColor: titleblockData.visual.cornerColor || "#f8794b",
          cornerStrokeColor: titleblockData.visual.cornerStrokeColor || "#000000",
          cornerStyle: titleblockData.visual.cornerStyle || "circle",
          transparentCorners: titleblockData.visual.transparentCorners || false,
        });
        titleblockGroup.id = titleblockData.id;
        this.fabricCanvas.add(titleblockGroup);
        if (window.activeTitleBlocks && Array.isArray(window.activeTitleBlocks)) window.activeTitleBlocks.push(titleblockGroup);
        await new Promise((r) => setTimeout(r, 50));
      } catch (e) {
        console.error("Failed to load titleblock:", e);
      }
    }
  }

  updateConnectedWallLines(movedCircle) {
    const center = movedCircle.getCenterPoint();
    this.fabricCanvas
      .getObjects()
      .filter((obj) => obj.type === "line" && !obj.deviceType && !obj.isResizeIcon && !obj.isConnectionLine)
      .forEach((line) => {
        if (line.startCircle === movedCircle) {
          line.set({ x1: center.x, y1: center.y });
          line.setCoords();
        }
        if (line.endCircle === movedCircle) {
          line.set({ x2: center.x, y2: center.y });
          line.setCoords();
        }
        const bgs = this.fabricCanvas.getObjects().filter((o) => o.isBackground);
        if (bgs.length > 0) line.moveTo(bgs.length);
      });
    movedCircle.bringToFront();
    this.fabricCanvas.requestRenderAll();
  }

  handleWallLineDeletion(deletedLine) {
    const remaining = this.fabricCanvas.getObjects().filter((obj) => obj.type === "line" && !obj.deviceType && !obj.isResizeIcon && !obj.isConnectionLine && obj !== deletedLine);
    [deletedLine.startCircle, deletedLine.endCircle]
      .filter((c) => c && this.fabricCanvas.getObjects().includes(c))
      .forEach((c) => {
        if (!remaining.some((l) => l.startCircle === c || l.endCircle === c)) this.fabricCanvas.remove(c);
      });
    this.fabricCanvas
      .getObjects("group")
      .filter((obj) => obj.coverageConfig)
      .forEach((obj) => obj.createOrUpdateCoverageArea?.());
    this.fabricCanvas.renderAll();
  }

  organizeWallLayers() {}
  ensureCameraResizeIconsOnTop() {}

  addZoneEventHandlers(polygon, text) {
    this.addPolygonTextEventHandlers(
      polygon,
      text,
      "zone",
      (p) => {
        if (window.showDeviceProperties) window.showDeviceProperties("zone-polygon", text, p, p.height);
      },
      () => window.maintainZoneLayerOrder?.()
    );
  }

  addRoomEventHandlers(polygon, text) {
    this.addPolygonTextEventHandlers(
      polygon,
      text,
      "room",
      (p) => {
        const r = window.rooms.find((r) => r.polygon === p);
        if (r && window.showRoomProperties) window.showRoomProperties(p, text, r);
      },
      () => window.maintainRoomLayerOrder?.()
    );
  }

  addPolygonTextEventHandlers(polygon, text, type, showProps, maintainOrder) {
    polygon.off();
    text.off();
    setTimeout(() => {
      if (polygon && this.fabricCanvas.getObjects().includes(polygon)) polygon.originalCenter = polygon.getCenterPoint();
    }, 100);

    const textMovingHandler = () => {
      if (!text || !polygon || !this.fabricCanvas.getObjects().includes(text) || !this.fabricCanvas.getObjects().includes(polygon)) return;
      const center = polygon.getCenterPoint();
      text.offsetX = text.left - center.x;
      text.offsetY = text.top - center.y;
      text.setCoords();
      this.fabricCanvas.requestRenderAll();
    };

    const polygonMovingHandler = () => {
      if (!polygon || !this.fabricCanvas.getObjects().includes(polygon)) return;
      // Don't update originalCenter on move - this is what enables snapping
      // The canvas-snapping.js handles the snapping logic separately
      if (text && this.fabricCanvas.getObjects().includes(text)) {
        const center = polygon.getCenterPoint();
        text.set({ left: center.x + (text.offsetX || 0), top: center.y + (text.offsetY || 0) });
        text.setCoords();
      }
      this.fabricCanvas.requestRenderAll();
    };

    const polygonMouseDown = (e) => {
      const pointer = this.fabricCanvas.getPointer(e.e);
      polygon.set("evented", false);
      const devices = this.fabricCanvas.getObjects().filter((o) => o !== polygon && o !== text && o.type === "group" && o.deviceType && o.containsPoint(pointer));
      polygon.set("evented", true);
      e.e.preventDefault();
      e.e.stopPropagation();
      this.fabricCanvas.setActiveObject(devices.length > 0 ? devices[0] : type === "zone" ? text : polygon);
      this.fabricCanvas.requestRenderAll();
    };

    polygon.on("moving", polygonMovingHandler);
    polygon.on("moved", () => {
      // Update originalCenter after room is moved to its new position
      if (type === "room" && polygon.originalCenter) {
        polygon.originalCenter = polygon.getCenterPoint();
      }
      setTimeout(maintainOrder, 10);
    });
    polygon.on("selected", () => {
      showProps(polygon);
      this.fabricCanvas.requestRenderAll();
    });
    polygon.on("deselected", () => window.hideDeviceProperties?.());
    polygon.on("mousedown", polygonMouseDown);
    text.on("moving", textMovingHandler);
    text.on("selected", () => {
      showProps(polygon);
      this.fabricCanvas.requestRenderAll();
    });
    text.on("deselected", () => window.hideDeviceProperties?.());
  }

  reinitializeDrawingTools() {
    const tools = ["setupShapeTools", "setupTextTools", "setupLineTools", "setupNetworkLinkTool", "setupMeasurementTools", "setupImageUploadTool", "setupNorthArrowTool", "setupColorPicker", "setupTextColorPicker", "setupBackgroundColorPicker", "setupTitleBlockTool"];
    tools.forEach((tool) => {
      if (typeof window[tool] === "function") window[tool](this.fabricCanvas);
    });

    if (typeof setupDeletion === "function") {
      setupDeletion(this.fabricCanvas, (obj) => this.isDrawingObject(obj));
      this.fabricCanvas.getObjects().forEach((obj) => {
        if (this.isDrawingObject(obj)) {
          if (!obj.borderColor || obj.borderColor !== "#f8794b") this.applyStandardStyling(obj);
          const shouldHaveControls = !(obj.type === "group" && (obj.isArrow || obj.groupType === "measurement"));
          obj.set({
            selectable: true,
            evented: true,
            hasControls: shouldHaveControls,
            hasBorders: true,
          });
        }
      });
    }

    ["setupZoneTool", "setupRoomTool", "setupWallTool"].forEach((tool) => {
      if (window[tool]) {
        try {
          window[tool](this.fabricCanvas);
        } catch (e) {
          console.warn(`Could not reinitialize ${tool}:`, e);
        }
      }
    });

    this.fabricCanvas.requestRenderAll();
    setTimeout(() => {
      const wallCircles = this.fabricCanvas.getObjects().filter((obj) => obj.type === "circle" && obj.isWallCircle);
      wallCircles.forEach((circle) => {
        circle.set({ selectable: true, evented: true, hoverCursor: "pointer", moveCursor: "move" });
        circle.bringToFront();
        if (!circle._wallUpdateHandler) {
          circle._wallUpdateHandler = () => this.updateConnectedWallLines(circle);
          circle.on("moving", circle._wallUpdateHandler);
        }
      });
      if (window.maintainZoneLayerOrder) window.maintainZoneLayerOrder();
      if (window.maintainRoomLayerOrder) window.maintainRoomLayerOrder();
      this.fabricCanvas.requestRenderAll();
    }, 200);
  }
}

export { OptimizedDrawingObjectSerializer as DrawingObjectSerializer };
