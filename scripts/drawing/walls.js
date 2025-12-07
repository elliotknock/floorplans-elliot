import { closeSidebar, startTool, stopCurrentTool, registerToolCleanup } from "./drawing-utils.js";

export function setupWallTool(fabricCanvas) {
  const addLineButton = document.getElementById("add-wall-btn");
  let isAddingLine = false;
  let currentLine = null;
  let lastPoint = null;
  let pointCircle = null;
  let startPointCircle = null;
  let selectedWallCircle = null;
  let justCompleted = false;
  const lineSegments = [];
  const tempSegments = [];
  const tempCircles = [];

  const CLOSE_DISTANCE_THRESHOLD = 25;
  const MIN_POINTS_FOR_COMPLETION = 2;

  // Constants for wall styling
  const WALL_LINE_PROPS = {
    stroke: "red",
    strokeWidth: 2,
    selectable: false,
    evented: true,
    hasControls: false,
    hasBorders: false,
    lockMovementX: true,
    lockMovementY: true,
    perPixelTargetFind: true,
    borderColor: "#f8794b",
    isWallLine: true,
    strokeLineCap: "round",
    strokeLineJoin: "round",
    strokeMiterLimit: 2,
  };

  const WALL_CIRCLE_PROPS = {
    radius: 4,
    fill: "black",
    originX: "center",
    originY: "center",
    selectable: false,
    evented: true,
    hasControls: false,
    isWallCircle: true,
    borderColor: "#f8794b",
    deletable: false,
  };

  const PREVIEW_LINE_PROPS = {
    stroke: "red",
    strokeWidth: 3,
    strokeDashArray: [5, 5],
    selectable: false,
    evented: false,
    perPixelTargetFind: true,
    strokeLineCap: "round",
    strokeLineJoin: "round",
    strokeMiterLimit: 2,
  };

  // Helpers
  const calculateDistance = (p1, p2) => Math.sqrt((p1.x - p2.x) ** 2 + (p1.y - p2.y) ** 2);
  const isCloseToStart = (pointer) => tempSegments.length >= MIN_POINTS_FOR_COMPLETION && startPointCircle && calculateDistance(pointer, startPointCircle.getCenterPoint()) <= CLOSE_DISTANCE_THRESHOLD;
  const disableUndo = () => window.undoSystem && (window.undoSystem.isExecutingCommand = true);
  const enableUndo = () => window.undoSystem && (window.undoSystem.isExecutingCommand = false);

  const createWallLine = (x1, y1, x2, y2, startCircle, endCircle) => {
    const line = new fabric.Line([x1, y1, x2, y2], WALL_LINE_PROPS);
    line.startCircle = startCircle;
    line.endCircle = endCircle;
    return line;
  };

  const createWallCircle = (x, y) => {
    const circle = new fabric.Circle({ ...WALL_CIRCLE_PROPS, left: x, top: y });
    circle.on("moving", () => updateConnectedLines(circle));
    return circle;
  };

  // Cleanup function for temporary objects
  function cleanupTempObjects() {
    tempSegments.forEach(({ line }) => fabricCanvas.remove(line));
    tempSegments.length = 0;
    tempCircles.forEach((circle) => fabricCanvas.remove(circle));
    tempCircles.length = 0;
    if (currentLine) fabricCanvas.remove(currentLine), (currentLine = null);
    lastPoint = null;
    pointCircle = null;
    startPointCircle = null;
    isAddingLine = false;
    fabricCanvas.requestRenderAll();
    setTimeout(() => {
      fabricCanvas.getObjects("group").forEach((obj) => obj.type === "group" && obj.deviceType && obj.coverageConfig && obj.createOrUpdateCoverageArea && obj.createOrUpdateCoverageArea());
      fabricCanvas.requestRenderAll();
    }, 50);
  }

  // Helpers to show/hide wall control circles when not actively drawing
  const showCirclesForWallLine = (line) => {
    if (!line || !line.isWallLine) return;
    [line.startCircle, line.endCircle].filter(Boolean).forEach((c) => {
      c.set({ visible: true, selectable: true, evented: true });
      c.bringToFront();
    });
    fabricCanvas.requestRenderAll();
  };

  const hideAllWallCircles = () => {
    if (isAddingLine) return;
    const temps = new Set(tempCircles);
    fabricCanvas.getObjects("circle").forEach((c) => {
      if (c.isWallCircle && !temps.has(c)) c.set({ visible: false });
    });
    fabricCanvas.requestRenderAll();
  };

  const showCirclesForConnectedSegments = (circle) => {
    if (!circle || !circle.isWallCircle) return;
    const revealed = new Set();
    [...lineSegments, ...tempSegments].forEach(({ startCircle, endCircle }) => {
      if (startCircle === circle || endCircle === circle) {
        if (startCircle) revealed.add(startCircle);
        if (endCircle) revealed.add(endCircle);
      }
    });
    revealed.forEach((c) => {
      c.set({ visible: true, selectable: true, evented: true });
      c.bringToFront();
    });
    fabricCanvas.requestRenderAll();
  };

  // Styling for selected vs default wall circle
  const setCircleSelected = (circle, selected) => {
    if (!circle || !circle.isWallCircle) return;
    circle.set(selected ? { stroke: "#f8794b", strokeWidth: 3, radius: 7 } : { stroke: undefined, strokeWidth: 0, radius: 4 });
  };

  // Ensure circles stay on top
  fabricCanvas.on("object:added", () => fabricCanvas.getObjects("circle").forEach((circle) => circle.bringToFront()), fabricCanvas.requestRenderAll());

  // Update lines when a circle moves
  const updateConnectedLines = (circle) => {
    const center = circle.getCenterPoint();
    [...lineSegments, ...tempSegments].forEach(({ line }) => {
      if (line.startCircle === circle) line.set({ x1: center.x, y1: center.y }), line.setCoords();
      if (line.endCircle === circle) line.set({ x2: center.x, y2: center.y }), line.setCoords();
    });
    fabricCanvas.requestRenderAll();
  };

  // Complete the wall loop by connecting to start point
  const completeWallLoop = () => {
    if (currentLine) fabricCanvas.remove(currentLine), (currentLine = null);
    if (lastPoint && startPointCircle) {
      const startCenter = startPointCircle.getCenterPoint();
      const closingLine = createWallLine(lastPoint.x, lastPoint.y, startCenter.x, startCenter.y, pointCircle, startPointCircle);
      fabricCanvas.add(closingLine);
      tempSegments.push({ line: closingLine, startCircle: pointCircle, endCircle: startPointCircle });
    }
    finalizeTempSegments();
    justCompleted = true;
  };

  // Finalize temporary segments and reset state
  const finalizeTempSegments = () => {
    const newLines = tempSegments.map((s) => s.line);
    const newCircles = [...tempCircles];
    tempSegments.forEach((s) => lineSegments.push(s));
    tempSegments.length = 0;
    tempCircles.forEach((c) =>
      c.set({
        selectable: true,
        hoverCursor: "pointer",
        fill: "black",
        stroke: undefined,
        strokeWidth: 0,
        strokeDashArray: undefined,
        radius: 4,
        deletable: false,
        hasControls: false,
        hasBorders: false,
        visible: false,
      })
    );
    tempCircles.length = 0;

    if (window.undoSystem && (newLines.length || newCircles.length) && !window.undoSystem.isExecutingCommand) {
      const wasExecuting = window.undoSystem.isExecutingCommand;
      window.undoSystem.isExecutingCommand = true;
      try {
        const commands = [...newLines.map((l) => new window.UndoCommands.AddCommand(fabricCanvas, l, [])), ...newCircles.map((c) => new window.UndoCommands.AddCommand(fabricCanvas, c, []))];
        window.undoSystem.addToStack(new window.UndoCommands.MultipleCommand(commands));
      } finally {
        window.undoSystem.isExecutingCommand = wasExecuting;
      }
    }

    resetDrawingState();
    fabricCanvas.getObjects("group").forEach((obj) => obj.coverageConfig && obj.createOrUpdateCoverageArea && obj.createOrUpdateCoverageArea());
    fabricCanvas.discardActiveObject();
    fabricCanvas.requestRenderAll();
  };

  // Reset drawing state
  const resetDrawingState = () => {
    cleanupTempObjects();
    stopCurrentTool();
  };

  // Handle mouse down to place points and draw lines
  const handleMouseDown = (o) => {
    o.e.preventDefault();
    o.e.stopPropagation();
    fabricCanvas.discardActiveObject();
    const pointer = fabricCanvas.getPointer(o.e);
    if (isCloseToStart(pointer)) return completeWallLoop();

    const newCircle = createWallCircle(pointer.x, pointer.y);
    const wasExecuting = window.undoSystem ? window.undoSystem.isExecutingCommand : false;
    disableUndo();
    fabricCanvas.add(newCircle);
    enableUndo();
    tempCircles.push(newCircle);
    newCircle.bringToFront();

    if (!lastPoint) {
      lastPoint = { x: pointer.x, y: pointer.y };
      pointCircle = newCircle;
      startPointCircle = newCircle;
      startPointCircle.set({ stroke: "#00ff00", strokeWidth: 3, strokeDashArray: [4, 4], radius: 7 });
    } else {
      if (currentLine) fabricCanvas.remove(currentLine), (currentLine = null);
      const newLine = createWallLine(lastPoint.x, lastPoint.y, pointer.x, pointer.y, pointCircle, newCircle);
      disableUndo();
      fabricCanvas.add(newLine);
      enableUndo();
      tempSegments.push({ line: newLine, startCircle: pointCircle, endCircle: newCircle });
      lastPoint = { x: pointer.x, y: pointer.y };
      pointCircle = newCircle;
    }
    fabricCanvas.requestRenderAll();
  };

  // Handle mouse movement to preview lines
  const handleMouseMove = (o) => {
    if (!lastPoint) return;
    const pointer = fabricCanvas.getPointer(o.e);
    if (!currentLine) {
      currentLine = new fabric.Line([lastPoint.x, lastPoint.y, pointer.x, pointer.y], PREVIEW_LINE_PROPS);
      disableUndo();
      fabricCanvas.add(currentLine);
      enableUndo();
    } else {
      currentLine.set({ x2: pointer.x, y2: pointer.y });
    }
    const isNearStart = isCloseToStart(pointer);
    currentLine.set({ stroke: isNearStart ? "#00ff00" : "red", strokeWidth: isNearStart ? 4 : 3 });
    fabricCanvas.setCursor(isNearStart ? "pointer" : "crosshair");
    if (startPointCircle) startPointCircle.set({ stroke: "#00ff00", strokeWidth: isNearStart ? 4 : 3, radius: isNearStart ? 9 : 7 });
    fabricCanvas.requestRenderAll();
  };

  // Activate wall tool on button click
  addLineButton.addEventListener("click", () => {
    if (isAddingLine) return;
    hideAllWallCircles();
    if (selectedWallCircle) setCircleSelected(selectedWallCircle, false), (selectedWallCircle = null);
    isAddingLine = true;
    closeSidebar();
    cleanupTempObjects();
    registerToolCleanup(cleanupTempObjects);
    startTool(fabricCanvas, "wall", handleMouseDown, handleMouseMove);
  });

  // Global canvas click handler to toggle visibility of wall circles when not drawing
  fabricCanvas.on("mouse:down", (opt) => {
    if (justCompleted) {
      justCompleted = false;
      return;
    }
    if (isAddingLine) return;
    const target = opt.target;
    const isLineWithWallRefs = target && target.type === "line" && (target.startCircle || target.endCircle);
    if (target && (target.isWallLine || isLineWithWallRefs)) {
      if (selectedWallCircle) setCircleSelected(selectedWallCircle, false), (selectedWallCircle = null);
      showCirclesForWallLine(target);
    } else if (target && target.isWallCircle) {
      if (selectedWallCircle && selectedWallCircle !== target) setCircleSelected(selectedWallCircle, false);
      selectedWallCircle = target;
      setCircleSelected(target, true);
      showCirclesForConnectedSegments(target);
    } else {
      if (selectedWallCircle) setCircleSelected(selectedWallCircle, false), (selectedWallCircle = null);
      hideAllWallCircles();
    }
  });

  // Ensure any pre-existing wall circles start hidden and existing wall lines use rounded caps/joins on init
  setTimeout(() => {
    hideAllWallCircles();
    fabricCanvas.getObjects("line").forEach((ln) => {
      if (ln.isWallLine || ln.startCircle || ln.endCircle) ln.set({ strokeLineCap: "round", strokeLineJoin: "round", strokeMiterLimit: 2, hasBorders: false, hasControls: false });
    });
    fabricCanvas.requestRenderAll();
  }, 0);
}
