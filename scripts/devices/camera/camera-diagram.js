// ============================================================================
// CAMERA DIAGRAM - Side view diagram rendering
// ============================================================================

// Draws the side view diagram
export function drawSideView(canvas, height, tilt, distance, deadZone, fov) {
  if (!canvas) return;
  const context = canvas.getContext("2d");
  const width = canvas.width;
  const canvasHeight = canvas.height;

  // Clear canvas
  context.clearRect(0, 0, width, canvasHeight);

  // Settings for drawing
  const margin = 40;
  const groundY = canvasHeight - margin;

  // Calculate ranges
  const backDistance = deadZone && deadZone < 0 ? Math.abs(deadZone) : 0;
  const forwardDistance = Math.max(distance || 0, deadZone > 0 ? deadZone : 0, 10);

  // Total meters to show
  const totalMeters = backDistance + forwardDistance;
  const maxDistanceShown = Math.max(totalMeters * 1.2, 30);

  // The full width between margins to draw
  const availableWidth = width - 2 * margin;
  const scaleX = availableWidth / maxDistanceShown;

  // Position camera to accommodate back distance
  const cameraX = margin + 40 + backDistance * scaleX;

  // Limit vertical scale to keep camera visible but not too small
  const maxHeightShown = Math.max(height * 1.5, 6); // Show at least 6m height
  const scaleY = (canvasHeight - 2 * margin) / maxHeightShown;

  // Draw ground
  context.beginPath();
  context.moveTo(margin, groundY);
  context.lineTo(width - margin, groundY);
  context.strokeStyle = "#333";
  context.lineWidth = 2;
  context.stroke();

  // Draw camera pole
  const cameraY = groundY - height * scaleY;

  context.beginPath();
  context.moveTo(cameraX, groundY);
  context.lineTo(cameraX, cameraY);
  context.strokeStyle = "#666";
  context.lineWidth = 1;
  context.stroke();

  // Height label on pole
  context.fillStyle = "#333";
  context.font = "11px Arial";
  context.fontWeight = "500";
  context.textAlign = "center";
  context.fillText(`${height.toFixed(2)}m`, cameraX - 18, groundY - (height * scaleY) / 2);

  // Draw camera icon (simplified)
  context.save();
  context.translate(cameraX, cameraY);
  context.rotate((tilt * Math.PI) / 180);

  // Camera body (rectangle)
  context.fillStyle = "#f8794b"; // Orange
  context.beginPath();
  context.rect(-8, -4, 16, 8);
  context.fill();
  context.strokeStyle = "#ea6036";
  context.lineWidth = 1;
  context.stroke();

  // Lens (circle at the front)
  context.fillStyle = "#ea6036";
  context.beginPath();
  context.arc(8, 0, 3, 0, Math.PI * 2);
  context.fill();
  context.restore();

  // Calculate lens position for FOV rays
  // The lens is at position (8, 0) relative to camera center when not rotated
  const lensOffsetX = 8 * Math.cos((tilt * Math.PI) / 180);
  const lensOffsetY = 8 * Math.sin((tilt * Math.PI) / 180);
  const lensX = cameraX + lensOffsetX;
  const lensY = cameraY + lensOffsetY;

  // Draw FOV Cone
  const halfFov = (fov || 60) / 2;

  // Bottom ray (closest point on ground)
  const bottomRayAngleRad = ((tilt + halfFov) * Math.PI) / 180;

  // Top ray (furthest point)
  const topRayAngleRad = ((tilt - halfFov) * Math.PI) / 180;

  const bottomDirX = Math.cos(bottomRayAngleRad);
  const bottomDirY = Math.sin(bottomRayAngleRad);
  const topDirX = Math.cos(topRayAngleRad);
  const topDirY = Math.sin(topRayAngleRad);

  const deltaY = groundY - lensY;
  let bottomPoint = null;
  if (bottomDirY > 0.001) {
    const tGround = deltaY / bottomDirY;
    bottomPoint = {
      x: lensX + bottomDirX * tGround,
      y: groundY,
    };
  }

  if (!bottomPoint) {
    const targetX = bottomDirX >= 0 ? width - margin : margin;
    if (Math.abs(bottomDirX) > 0.001) {
      const tEdge = (targetX - lensX) / bottomDirX;
      if (tEdge > 0) {
        bottomPoint = {
          x: targetX,
          y: lensY + bottomDirY * tEdge,
        };
      }
    }
  }

  if (!bottomPoint) {
    bottomPoint = { x: width - margin, y: lensY };
  }

  let topGroundPoint = null;
  let topGroundMeters = null;
  if (topDirY > 0.001) {
    const tGround = deltaY / topDirY;
    if (tGround > 0) {
      const xGround = lensX + topDirX * tGround;
      topGroundPoint = { x: xGround, y: groundY };
      topGroundMeters = (xGround - cameraX) / scaleX;
    }
  }

  // Calculate the top ray endpoint - extend it fully to show accurate FOV
  let topPoint;

  // First check if the top ray hits the ground
  if (topGroundPoint && topGroundPoint.x <= width - margin) {
    topPoint = topGroundPoint;
  } else {
    // Ray doesn't hit ground within canvas, extend it to edge of canvas
    // Project the ray as far as needed to reach canvas edge
    const maxProjectionDistance = maxDistanceShown * 2; // Allow ray to extend far
    const projectedX = lensX + topDirX * maxProjectionDistance;
    const projectedY = lensY + topDirY * maxProjectionDistance;

    // Find where ray intersects canvas boundaries
    const rightEdge = width - margin;
    const topEdge = margin;

    let finalX = projectedX;
    let finalY = projectedY;

    // Check intersection with right edge
    if (topDirX > 0.001) {
      const tRight = (rightEdge - lensX) / topDirX;
      if (tRight > 0) {
        const yAtRight = lensY + topDirY * tRight;
        if (yAtRight >= topEdge && yAtRight <= groundY) {
          finalX = rightEdge;
          finalY = yAtRight;
        }
      }
    }

    // Check intersection with top edge if ray goes upward
    if (topDirY < -0.001 && Math.abs(topDirX) > 0.001) {
      const tTop = (topEdge - lensY) / topDirY;
      if (tTop > 0) {
        const xAtTop = lensX + topDirX * tTop;
        if (xAtTop >= margin && xAtTop <= rightEdge) {
          finalX = xAtTop;
          finalY = topEdge;
        }
      }
    }

    topPoint = { x: finalX, y: Math.max(topEdge, Math.min(finalY, groundY)) };
  }

  // Draw rays
  context.beginPath();
  context.setLineDash([4, 4]);
  context.strokeStyle = "#4a90e2"; // Blue for FOV rays
  context.lineWidth = 1.5;

  // Bottom ray
  context.moveTo(lensX, lensY);
  context.lineTo(bottomPoint.x, bottomPoint.y);

  // Top ray
  context.moveTo(lensX, lensY);
  context.lineTo(topPoint.x, topPoint.y);
  context.stroke();
  context.setLineDash([]);

  // Draw measurements
  context.fillStyle = "#333";
  context.font = "11px Arial";
  context.fontWeight = "500";
  context.textAlign = "center";

  // Dead zone label
  const bottomDistanceMeters = typeof deadZone === "number" && !Number.isNaN(deadZone) ? deadZone : (bottomPoint.x - cameraX) / scaleX;

  // Draw positive dead zone (forward)
  if (bottomDistanceMeters > 0.05) {
    const deadZoneMeters = bottomDistanceMeters;
    const deadZoneStartX = cameraX;
    const deadZoneEndX = bottomPoint.x; // Extend to where bottom ray hits ground

    if (deadZoneEndX < width - margin + 1) {
      context.fillStyle = "#e74c3c"; // Red for dead zone
      context.fillText(`Dead: ${deadZoneMeters.toFixed(2)}m`, deadZoneStartX + (deadZoneEndX - deadZoneStartX) / 2, groundY + 15);
      context.beginPath();
      context.moveTo(deadZoneStartX, groundY + 5);
      context.lineTo(deadZoneEndX, groundY + 5);
      context.strokeStyle = "#e74c3c";
      context.lineWidth = 2;
      context.stroke();
    }
  }
  // Draw negative dead zone (backward)
  else if (bottomDistanceMeters < -0.05) {
    const absDist = Math.abs(bottomDistanceMeters);
    const backStartX = bottomPoint.x; // Extend to where bottom ray hits ground
    const backEndX = cameraX;

    // Draw backward measurement (on lower line to avoid overlap)
    if (backStartX > margin - 1) {
      context.fillStyle = "#9b59b6"; // Purple for backward
      context.fillText(`Back: ${absDist.toFixed(2)}m`, backStartX + (backEndX - backStartX) / 2, groundY + 15);
      context.beginPath();
      context.moveTo(backStartX, groundY + 5);
      context.lineTo(backEndX, groundY + 5);
      context.strokeStyle = "#9b59b6";
      context.lineWidth = 2;
      context.stroke();
    }

    // Also draw forward measurement if split coverage (on higher line)
    const forwardDist = distance;
    if (forwardDist > 0.05 && topGroundPoint) {
      const rangeStartX = cameraX;
      const rangeEndX = topGroundPoint.x; // Extend to where top ray hits ground
      if (rangeEndX < width - margin + 1) {
        context.fillStyle = "#27ae60"; // Green for forward coverage
        context.fillText(`Range: ${forwardDist.toFixed(2)}m`, rangeStartX + (rangeEndX - rangeStartX) / 2, groundY + 30);
        context.beginPath();
        context.moveTo(rangeStartX, groundY + 20);
        context.lineTo(rangeEndX, groundY + 20);
        context.strokeStyle = "#27ae60";
        context.lineWidth = 2;
        context.stroke();
      }
    }
  }
}

