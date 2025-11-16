import { closeSidebar, startTool, stopCurrentTool, setupDeletion, applyStandardStyling } from "./drawing-utils.js";

// Sets up shape drawing tools
export function setupShapeTools(fabricCanvas) {
  const circleBtn = document.getElementById("add-circle-btn");
  const squareBtn = document.getElementById("add-square-btn");

  setupDeletion(fabricCanvas, (obj) => obj.type === "circle" || obj.type === "rect");

  // Activates circle tool
  circleBtn.addEventListener("click", () => {
    closeSidebar();
    startTool(fabricCanvas, "circle", handleCircleClick);
  });

  // Activates square tool
  squareBtn.addEventListener("click", () => {
    closeSidebar();
    startTool(fabricCanvas, "square", handleSquareClick);
  });

  // Places circle on canvas
  function handleCircleClick(e) {
    e.e.preventDefault();
    e.e.stopPropagation();

    const pointer = fabricCanvas.getPointer(e.e);
    const circle = new fabric.Circle({
      left: pointer.x,
      top: pointer.y,
      radius: 50,
      fill: "rgba(255, 0, 0, 0.3)",
      stroke: "red",
      strokeWidth: 1,
      originX: "center",
      originY: "center",
      strokeUniform: true,
    });

    applyStandardStyling(circle);
    fabricCanvas.add(circle);
    fabricCanvas.setActiveObject(circle);
    stopCurrentTool();
  }

  // Places square on canvas
  function handleSquareClick(e) {
    e.e.preventDefault();
    e.e.stopPropagation();

    const pointer = fabricCanvas.getPointer(e.e);
    const square = new fabric.Rect({
      left: pointer.x - 50,
      top: pointer.y - 50,
      width: 100,
      height: 100,
      fill: "rgba(0, 0, 255, 0.3)",
      stroke: "blue",
      strokeWidth: 1,
      strokeUniform: true,
    });

    applyStandardStyling(square);
    fabricCanvas.add(square);
    fabricCanvas.setActiveObject(square);
    stopCurrentTool();
  }
}
