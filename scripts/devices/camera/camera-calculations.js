// ============================================================================
// CAMERA CALCULATIONS
// ============================================================================

import { layers } from "../../canvas/canvas-layers.js";
import { DEFAULT_PIXELS_PER_METER } from "../../sidebar/sidebar-utils.js";

// ============================================================================
// GEOMETRY CALCULATIONS
// ============================================================================

// Calculates angle difference between two angles
export const angleDiff = (start, end) => (end - start + 360) % 360 || 360;

// Calculates distance between two points
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Normalizes a vector to unit length
export const normalize = (x, y) => {
  const len = Math.hypot(x, y) || 1;
  return { x: x / len, y: y / len };
};

// Finds intersection point between two lines
export const lineIntersect = (p1, p2, p3, p4) => {
  const denom = (p4.y - p3.y) * (p2.x - p1.x) - (p4.x - p3.x) * (p2.y - p1.y);
  if (Math.abs(denom) < 1e-10) return null;
  const uA = ((p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)) / denom;
  const uB = ((p2.x - p1.x) * (p1.y - p3.y) - (p2.y - p1.y) * (p1.x - p3.x)) / denom;
  return uA >= 0 && uA <= 1 && uB >= 0 && uB <= 1 ? { x: p1.x + uA * (p2.x - p1.x), y: p1.y + uA * (p2.y - p1.y) } : null;
};

// Helper for degrees to radians to avoid fabric dependency in pure math file
const toRad = (deg) => deg * (Math.PI / 180);

// Creates coverage area points with wall collision detection
export function createCoveragePoints(walls, camera, startAngle, endAngle, centerX, centerY, overrideRadius) {
  const span = angleDiff(startAngle, endAngle);
  const isFullCircle = span >= 359.9;
  const points = [];
  const center = { x: centerX, y: centerY };

  const maxRadius = overrideRadius !== undefined ? overrideRadius : camera.coverageConfig.radius;
  let minRadius = camera.coverageConfig.minRange || 0; // Can be negative

  const projectionMode = camera.coverageConfig.projectionMode || "circular";
  const midAngle = startAngle + span / 2;

  // Determine number of rays for smoothness
  // Full circle needs more rays (180), partial arcs use fewer but at least 20
  const numRays = Math.max(isFullCircle ? 180 : Math.ceil(span / 2), 20);
  const step = (isFullCircle ? 360 : span) / numRays;

  const rayDistances = [];

  // 1. Generate Outer Arc (Forward View)
  for (let i = 0; i <= numRays; i++) {
    const angle = (isFullCircle ? 0 : startAngle) + i * step;
    const radians = toRad(angle % 360);

    let radius = maxRadius;

    // --- Rectangular Projection Logic ---
    // If mode is rectangular, stretch the radius for rays further from the center
    // to create a flat edge instead of a curved arc.
    if (!isFullCircle && projectionMode === "rectangular" && span < 170 && Math.abs(maxRadius) > 0.01) {
      const diffRad = toRad(angle - midAngle);

      // Only apply correction within reasonable angular bounds (< 80 degrees from center)
      if (Math.abs(diffRad) < 1.4) {
        const cosVal = Math.cos(diffRad);
        if (Math.abs(cosVal) > 0.1) {
          // Radius = Distance to flat plane / cos(angle)
          radius = maxRadius / cosVal;
        }
      }
    }

    // Calculate the theoretical end point of the ray
    const rayEnd = {
      x: centerX + radius * Math.cos(radians),
      y: centerY + radius * Math.sin(radians),
    };

    // --- Wall Intersection (Ray Casting) ---
    let closest = null;
    let minDist = Infinity;

    // Check for wall intersections from Center to RayEnd
    for (const wall of walls) {
      const intersection = lineIntersect(center, rayEnd, { x: wall.x1, y: wall.y1 }, { x: wall.x2, y: wall.y2 });

      if (intersection) {
        const dist = distance(center, intersection);
        // If this wall is closer than the current closest wall (and within the ray's length)
        if (dist < minDist && dist <= Math.abs(radius)) {
          minDist = dist;
          closest = intersection;
        }
      }
    }

    // Use the intersection point if a wall was hit, otherwise use the full ray length
    points.push(closest || rayEnd);
    rayDistances.push(closest ? minDist : radius);
  }

  // 2. Generate Inner Arc (Backward / Dead Zone)
  // Draw backwards from EndAngle to StartAngle to close the polygon shape.
  if (!isFullCircle) {
    // If minRadius is negative or very small, there's no dead zone
    // Negative minRadius indicates camera is looking straight down (beyond 90°)
    if (minRadius <= 0 || Math.abs(minRadius) < 0.1) {
      // No dead zone, just return to center
      points.push(center);
    } else {
      // --- Inner Arc (Circular or Rectangular) ---
      // Generate arc points from End to Start for a curved or flat dead zone
      for (let i = numRays; i >= 0; i--) {
        const angle = startAngle + i * step;
        const radians = toRad(angle % 360);
        let radius = minRadius;

        // --- Rectangular Dead Zone Logic ---
        if (projectionMode === "rectangular" && span < 170) {
          const diffRad = toRad(angle - midAngle);
          // Only apply correction within reasonable angular bounds
          if (Math.abs(diffRad) < 1.4) {
            const cosVal = Math.cos(diffRad);
            if (Math.abs(cosVal) > 0.1) {
              radius = minRadius / cosVal;
            }
          }
        }

        // Clamp inner radius to outer radius (wall distance)
        // This prevents the dead zone from extending past walls
        if (radius > 0 && radius > rayDistances[i]) {
          radius = rayDistances[i];
        }

        points.push({
          x: centerX + radius * Math.cos(radians),
          y: centerY + radius * Math.sin(radians),
        });
      }
    }
  }

  return points;
}

// ============================================================================
// PHYSICS CALCULATIONS
// ============================================================================

// Calculates camera physics parameters (min range, max distance) based on height, tilt, and FOV
export function calculateCameraPhysics(activeObject) {
  if (!activeObject || !activeObject.coverageConfig) return null;

  const height = activeObject.coverageConfig.cameraHeight || 3;
  const tilt = activeObject.coverageConfig.cameraTilt ?? 25;
  const fabricCanvas = activeObject.canvas;
  const pixelsPerMeter = fabricCanvas?.pixelsPerMeter || DEFAULT_PIXELS_PER_METER;

  // Use sideFOV if available (calculated by spec panel), otherwise fallback to Plan Angle
  const horizontalFov = activeObject.coverageConfig.sideFOV || (activeObject.angleDiff ? activeObject.angleDiff(activeObject.coverageConfig.startAngle, activeObject.coverageConfig.endAngle) : 60);
  const fov = horizontalFov;
  const halfFov = fov / 2;

  // 1. Calculate Max Distance (Horizon)
  // This is where the TOP ray of the camera view hits the ground.
  // Angle from horizontal = tilt - halfFov
  let maxDist = 10000; // Default large value for infinite range
  const topAngleDeg = tilt - halfFov;

  if (topAngleDeg > 0) {
    // If looking down, calculate intersection with ground
    // Distance = Height / tan(angle)
    maxDist = height / Math.tan((topAngleDeg * Math.PI) / 180);
  }
  // If topAngleDeg <= 0, the camera is looking parallel to ground or up, so range is "infinite"

  // 2. Calculate Dead Zone (Min Range)
  // This is where the BOTTOM ray of the camera view hits the ground.
  // Angle from horizontal = tilt + halfFov
  const bottomRayAngleDeg = tilt + halfFov;
  const bottomRayAngleRad = (bottomRayAngleDeg * Math.PI) / 180;

  let minRange = 0;
  // Handle tan near zero (horizontal ray) to avoid infinity
  const tanVal = Math.tan(bottomRayAngleRad);

  if (Math.abs(tanVal) < 1e-10) {
    minRange = tanVal >= 0 ? 10000 : -10000; // Infinite positive or negative distance
  } else {
    minRange = height / tanVal;
  }

  return {
    minRangeMeters: minRange,
    maxDistMeters: maxDist,
    pixelsPerMeter,
  };
}

// Applies calculated physics to the camera object
export function applyCameraPhysics(activeObject) {
  const physics = calculateCameraPhysics(activeObject);
  if (!physics) return null;

  const { minRangeMeters, maxDistMeters, pixelsPerMeter } = physics;

  // When camera is facing straight down (bottom ray angle >= 90°), clamp minRange to 0
  // for the coverage area (to prevent second wedge), but diagram still shows actual value
  const height = activeObject.coverageConfig.cameraHeight || 3;
  const tilt = activeObject.coverageConfig.cameraTilt ?? 25;
  const horizontalFov = activeObject.coverageConfig.sideFOV || (activeObject.angleDiff ? activeObject.angleDiff(activeObject.coverageConfig.startAngle, activeObject.coverageConfig.endAngle) : 60);
  const halfFov = horizontalFov / 2;
  const bottomRayAngleDeg = tilt + halfFov;

  // Clamp minRange to 0 for coverage area when facing straight down
  const clampedMinRangeMeters = bottomRayAngleDeg >= 90 ? 0 : minRangeMeters;

  // Store minRange in pixels (clamped for coverage area)
  activeObject.coverageConfig.minRange = clampedMinRangeMeters * pixelsPerMeter;

  // Clamp to max distance (e.g. 500m) or user's maxRange setting
  const maxRange = activeObject.coverageConfig.maxRange || 50;
  const clampedRadiusMeters = Math.min(maxDistMeters, maxRange);

  activeObject.coverageConfig.radius = clampedRadiusMeters * pixelsPerMeter;

  return {
    minRangeMeters,
    clampedRadiusMeters,
  };
}

// ============================================================================
// SPEC CALCULATIONS (FOV from focal length and sensor)
// ============================================================================

// Maps sensor sizes to their actual dimensions in millimeters
export const sensorDimensions = {
  "1/1.1": { width: 12.68, height: 7.13 },
  "1/1.2": { width: 11.62, height: 6.54 },
  "2/3": { width: 9.35, height: 23 },
  "1/1.6": { width: 8.72, height: 4.9 },
  "1/1.7": { width: 8.2, height: 4.61 },
  "1/1.8": { width: 7.75, height: 4.36 },
  "1/1.9": { width: 7.34, height: 4.13 },
  "1/2.0": { width: 6.97, height: 3.92 },
  "1/2.3": { width: 6.82, height: 3.84 },
  "1/2.5": { width: 6.28, height: 3.53 },
  "1/2.7": { width: 5.81, height: 3.27 },
  "1/2.8": { width: 5.6, height: 3.15 },
  "1/2.9": { width: 5.41, height: 3.04 },
  "1/3.0": { width: 5.23, height: 2.94 },
  "1/3.2": { width: 4.9, height: 2.76 },
  "1/3.4": { width: 4.61, height: 2.6 },
  "1/3.6": { width: 4.36, height: 2.45 },
  "1/4.0": { width: 3.92, height: 2.21 },
  "1/5.0": { width: 3.14, height: 1.76 },
  "1/6.0": { width: 2.61, height: 1.47 },
  "1/7.5": { width: 2.09, height: 1.18 },
};

// Figures out how wide and tall the camera can see based on focal length and sensor size
export const calculateFOV = (focalLength, sensorSize) => {
  // Remove "mm" text if present
  const focal = parseFloat(focalLength.toString().replace("mm", "").trim());
  if (!focal || focal <= 0) return null;

  const sensor = sensorDimensions[sensorSize];
  if (!sensor) return null;

  // Calculate how wide and tall the view is
  const horizontalFOV = 2 * Math.atan(sensor.width / (2 * focal)) * (180 / Math.PI);
  const verticalFOV = 2 * Math.atan(sensor.height / (2 * focal)) * (180 / Math.PI);

  return { horizontal: horizontalFOV, vertical: verticalFOV };
};

// Calculates camera angles (plan and side) based on specs
export const calculateCameraAngles = (focalLength, sensorSize, isAspectRatio) => {
  const fov = calculateFOV(focalLength, sensorSize);
  if (!fov) return null;

  let planAngle, sideAngle;

  if (isAspectRatio) {
    // Aspect Ratio Mode: Sensor rotated 90 degrees
    // Plan View (Horizontal on map) uses the sensor's Vertical dimension (narrower)
    planAngle = Math.round(fov.vertical);
    // Side View (Vertical on map) uses the sensor's Horizontal dimension (taller)
    sideAngle = fov.horizontal;
  } else {
    // Standard Mode
    // Plan View uses sensor's Horizontal dimension
    planAngle = Math.round(fov.horizontal);
    // Side View: Standard physics uses Vertical dimension (narrower)
    sideAngle = fov.vertical;
  }

  return {
    planAngle,
    sideAngle,
    verticalFOV: fov.vertical,
    horizontalFOV: fov.horizontal,
  };
};

// Updates the camera coverage angle when focal length or sensor size changes
export const updateCameraFromSpecs = (camera) => {
  if (!camera || !camera.coverageConfig) return null;

  const focalLength = camera.focalLength || "";
  const sensorSize = camera.sensorSize || "1/2.0";
  const isAspectRatio = camera.coverageConfig.aspectRatioMode || false;

  if (!focalLength) return null;

  const angles = calculateCameraAngles(focalLength, sensorSize, isAspectRatio);
  if (!angles) return null;

  const { planAngle, sideAngle, verticalFOV } = angles;

  // Store sideFOV for the coverage panel to use
  camera.coverageConfig.sideFOV = sideAngle;
  // Also store verticalFOV for backward compatibility or reference
  camera.coverageConfig.verticalFOV = verticalFOV;
  // Store the calculated plan angle for warning comparison
  camera.coverageConfig.calculatedAngle = planAngle;

  const midAngle = (camera.coverageConfig.startAngle + camera.angleDiff(camera.coverageConfig.startAngle, camera.coverageConfig.endAngle) / 2) % 360;

  camera.coverageConfig.startAngle = (midAngle - planAngle / 2 + 360) % 360;
  camera.coverageConfig.endAngle = (midAngle + planAngle / 2) % 360;

  // Full circle if angle is large enough
  if (planAngle >= 359) {
    camera.coverageConfig.startAngle = 0;
    camera.coverageConfig.endAngle = 360;
  }

  camera.coverageConfig.isInitialized = true;
  if (camera.createOrUpdateCoverageArea) camera.createOrUpdateCoverageArea();

  return planAngle;
};
