import { closeSidebar, startTool, stopCurrentTool, setupDeletion, registerToolCleanup } from "./drawing-utils.js";

// Sets up line, connection, and arrow drawing tools
export function setupLineTools(fabricCanvas) {
  const lineBtn = document.getElementById("add-line-btn");
  const connectionBtn = document.getElementById("add-connection-btn");
  const arrowBtn = document.getElementById("add-arrow-btn");

  let startPoint = null;
  let tempObject = null;

  setupDeletion(fabricCanvas, (obj) => obj.type === "line" || obj.type === "arrow" || (obj.type === "group" && obj.isArrow));

  // Cleans up temporary objects
  function cleanupTempObjects() {
    if (tempObject) {
      fabricCanvas.remove(tempObject);
      tempObject = null;
    }
    startPoint = null;
    fabricCanvas.requestRenderAll();
  }

  // Activates line tool
  lineBtn.addEventListener("click", () => {
    closeSidebar();
    cleanupTempObjects();
    registerToolCleanup(cleanupTempObjects);
    startTool(fabricCanvas, "line", handleLineClick, handleLineMove);
  });

  // Activates connection tool
  connectionBtn.addEventListener("click", () => {
    closeSidebar();
    cleanupTempObjects();
    registerToolCleanup(cleanupTempObjects);
    startTool(fabricCanvas, "connection", handleConnectionClick, handleConnectionMove);
  });

  // Activates arrow tool
  arrowBtn.addEventListener("click", () => {
    closeSidebar();
    cleanupTempObjects();
    registerToolCleanup(cleanupTempObjects);
    startTool(fabricCanvas, "arrow", handleArrowClick, handleArrowMove);
  });

  // Handles line click events
  function handleLineClick(e) {
    lineClick(e, "green", false);
  }

  // Handles connection click events
  function handleConnectionClick(e) {
    lineClick(e, "grey", true);
  }

  // Handles arrow click events
  function handleArrowClick(e) {
    arrowClick(e);
  }

  // Handles line movement
  function handleLineMove(e) {
    lineMove(e, "green", false);
  }

  // Handles connection movement
  function handleConnectionMove(e) {
    lineMove(e, "grey", true);
  }

  // Handles arrow movement
  function handleArrowMove(e) {
    arrowMove(e);
  }

  // Creates line or connection on click
  function lineClick(e, color, dashed) {
    e.e.preventDefault();
    e.e.stopPropagation();

    const pointer = fabricCanvas.getPointer(e.e);

    if (!startPoint) {
      startPoint = { x: pointer.x, y: pointer.y };
    } else {
      if (tempObject) fabricCanvas.remove(tempObject);

      const line = new fabric.Line([startPoint.x, startPoint.y, pointer.x, pointer.y], {
        stroke: color,
        strokeWidth: 2,
        strokeDashArray: dashed ? [5, 5] : null,
        selectable: true,
        hasControls: false,
        borderColor: "#f8794b",
        cornerColor: "#f8794b",
        isConnectionLine: dashed,
      });

      const wasExecuting = window.undoSystem ? window.undoSystem.isExecutingCommand : false;
      if (window.undoSystem) window.undoSystem.isExecutingCommand = true;

      fabricCanvas.add(line);
      fabricCanvas.setActiveObject(line);

      if (window.undoSystem) {
        window.undoSystem.isExecutingCommand = wasExecuting;
        const command = new window.UndoCommands.AddCommand(fabricCanvas, line, []);
        window.undoSystem.addToStack(command);
      }

      startPoint = null;
      tempObject = null;
      stopCurrentTool();
    }
  }

  // Previews line or connection during movement
  function lineMove(e, color, dashed) {
    if (!startPoint) return;

    const pointer = fabricCanvas.getPointer(e.e);

    if (tempObject) fabricCanvas.remove(tempObject);

    tempObject = new fabric.Line([startPoint.x, startPoint.y, pointer.x, pointer.y], {
      stroke: color,
      strokeWidth: 3,
      strokeDashArray: [5, 5],
      selectable: false,
      evented: false,
    });

    fabricCanvas.add(tempObject);
    fabricCanvas.requestRenderAll();
  }

  // Creates arrow on click
  function arrowClick(e) {
    e.e.preventDefault();
    e.e.stopPropagation();

    const pointer = fabricCanvas.getPointer(e.e);

    if (!startPoint) {
      startPoint = { x: pointer.x, y: pointer.y };
    } else {
      if (tempObject) fabricCanvas.remove(tempObject);

      const arrow = createArrow(startPoint, pointer);

      const wasExecuting = window.undoSystem ? window.undoSystem.isExecutingCommand : false;
      if (window.undoSystem) window.undoSystem.isExecutingCommand = true;

      fabricCanvas.add(arrow);
      fabricCanvas.setActiveObject(arrow);

      if (window.undoSystem) {
        window.undoSystem.isExecutingCommand = wasExecuting;
        const command = new window.UndoCommands.AddCommand(fabricCanvas, arrow, []);
        window.undoSystem.addToStack(command);
      }

      startPoint = null;
      tempObject = null;
      stopCurrentTool();
    }
  }

  // Previews arrow during movement
  function arrowMove(e) {
    if (!startPoint) return;

    const pointer = fabricCanvas.getPointer(e.e);

    if (tempObject) fabricCanvas.remove(tempObject);

    tempObject = createArrow(startPoint, pointer, true);
    fabricCanvas.add(tempObject);
    fabricCanvas.requestRenderAll();
  }

  // Creates arrow group with line and arrowhead
  function createArrow(start, end, isPreview = false) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const angle = Math.atan2(dy, dx);

    const line = new fabric.Line([start.x, start.y, end.x, end.y], {
      stroke: "blue",
      strokeWidth: isPreview ? 3 : 2,
      strokeDashArray: isPreview ? [5, 5] : null,
      selectable: !isPreview,
      evented: !isPreview,
    });

    const arrowHead = new fabric.Triangle({
      left: end.x,
      top: end.y,
      originX: "center",
      originY: "center",
      width: 10,
      height: 10,
      fill: "blue",
      angle: (angle * 180) / Math.PI + 90,
      selectable: false,
      evented: false,
    });

    const group = new fabric.Group([line, arrowHead], {
      selectable: !isPreview,
      hasControls: false,
      borderColor: "#f8794b",
      cornerColor: "#f8794b",
      isArrow: true,
    });

    return group;
  }

  // Exposes cleanup function for external use
  window.cleanupLinesTempObjects = cleanupTempObjects;
}
