const OFFSET_MARGIN = 10;
const CUSTOM_OFFSET_THRESHOLD = 1;

export function getDefaultLabelOffset(group) {
  if (!group) {
    return { x: 0, y: OFFSET_MARGIN + 20 };
  }
  const scaleFactor = typeof group.scaleFactor === "number" && !Number.isNaN(group.scaleFactor) ? group.scaleFactor : 1;
  return { x: 0, y: 20 * scaleFactor + OFFSET_MARGIN };
}

export function setLabelDragState(text, enabled) {
  if (!text) return;

  text.selectable = enabled;
  text.evented = enabled;
  text.lockMovementX = !enabled;
  text.lockMovementY = !enabled;
  text.lockScalingX = true;
  text.lockScalingY = true;
  text.lockRotation = true;
  text.hasControls = false;
  text.hasBorders = false;
  text.hoverCursor = enabled ? "move" : "default";
  text.moveCursor = enabled ? "move" : "default";

  if (!enabled && text.canvas && typeof text.canvas.getActiveObject === "function") {
    const active = text.canvas.getActiveObject();
    if (active === text && typeof text.canvas.discardActiveObject === "function") {
      text.canvas.discardActiveObject();
    }
  }
}

export function applyLabelPosition(group) {
  if (!group || !group.textObject) return;
  const text = group.textObject;
  const canvas = group.canvas || text.canvas;
  const center = typeof group.getCenterPoint === "function" ? group.getCenterPoint() : { x: group.left || 0, y: group.top || 0 };
  const defaultOffset = getDefaultLabelOffset(group);

  if (!group.labelOffset) {
    group.labelOffset = { ...defaultOffset };
    group.hasCustomLabelOffset = false;
  } else if (!group.hasCustomLabelOffset) {
    group.labelOffset = { x: 0, y: defaultOffset.y };
  }

  const offset = group.labelOffset || defaultOffset;
  const left = center.x + (offset.x || 0);
  const top = center.y + (typeof offset.y === "number" ? offset.y : defaultOffset.y);

  text.set({ left, top });
  if (typeof text.setCoords === "function") text.setCoords();

  if (!text._isHidden && canvas && typeof text.bringToFront === "function") {
    text.bringToFront();
  }
}

export function attachLabelBehavior(group, text, fabricCanvas = null) {
  if (!group || !text) return;
  const canvas = fabricCanvas || group.canvas || text.canvas;

  group.textObject = text;
  text._parentGroup = group;

  applyLabelPosition(group);
  setLabelDragState(text, !!window.globalLabelDragEnabled);

  const updatePosition = () => {
    applyLabelPosition(group);
    if (typeof group.bringToFront === "function") group.bringToFront();
    if (!text._isHidden && typeof text.bringToFront === "function") text.bringToFront();
    if (canvas && typeof canvas.requestRenderAll === "function") canvas.requestRenderAll();
  };

  if (group._labelMoveHandler) {
    group.off("moving", group._labelMoveHandler);
  }
  group._labelMoveHandler = updatePosition;
  group.on("moving", group._labelMoveHandler);

  if (text._labelChangedHandler) {
    text.off("changed", text._labelChangedHandler);
  }
  text._labelChangedHandler = () => {
    if (!group.hasCustomLabelOffset) {
      const defaultOffset = getDefaultLabelOffset(group);
      group.labelOffset = { x: 0, y: defaultOffset.y };
    }
    applyLabelPosition(group);
    if (canvas && typeof canvas.renderAll === "function") canvas.renderAll();
  };
  text.on("changed", text._labelChangedHandler);

  if (text._labelMovingHandler) {
    text.off("moving", text._labelMovingHandler);
  }
  text._labelMovingHandler = () => {
    if (!window.globalLabelDragEnabled) {
      applyLabelPosition(group);
      if (canvas && typeof canvas.renderAll === "function") canvas.renderAll();
      return;
    }

    const center = typeof group.getCenterPoint === "function" ? group.getCenterPoint() : { x: group.left || 0, y: group.top || 0 };
    group.labelOffset = {
      x: (text.left || 0) - center.x,
      y: (text.top || 0) - center.y,
    };

    const defaultOffset = getDefaultLabelOffset(group);
    group.hasCustomLabelOffset = Math.abs(group.labelOffset.x || 0) > CUSTOM_OFFSET_THRESHOLD || Math.abs((group.labelOffset.y || 0) - defaultOffset.y) > CUSTOM_OFFSET_THRESHOLD;

    if (typeof text.setCoords === "function") text.setCoords();
    if (canvas && typeof canvas.requestRenderAll === "function") canvas.requestRenderAll();
  };
  text.on("moving", text._labelMovingHandler);

  if (typeof text.on === "function" && !text._labelMouseUpHandler) {
    text._labelMouseUpHandler = () => {
      if (canvas && typeof canvas.renderAll === "function") canvas.renderAll();
    };
    text.on("mouseup", text._labelMouseUpHandler);
  }

  if (!group.updateLabelPosition) {
    group.updateLabelPosition = () => applyLabelPosition(group);
  }

  updatePosition();
}

export function setGroupLabelDragState(group, enabled) {
  if (!group || !group.textObject) return;
  setLabelDragState(group.textObject, enabled);
}
