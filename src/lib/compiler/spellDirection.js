import { clamp, degreesToRadians, radiansToDegrees, roundedDegrees } from "../utils/geometry.js";

const MAX_COMPONENT_TILT_DEG = 82;
const FORCE_TILT_MAX_DEG = 76;
const MIN_SURFACE_DIRECTION_MAGNITUDE = 0.001;

export function directionFromTiltAngles(xTiltDeg = 0, yTiltDeg = 0) {
  const xTilt = clamp(xTiltDeg, -MAX_COMPONENT_TILT_DEG, MAX_COMPONENT_TILT_DEG);
  const yTilt = clamp(yTiltDeg, -MAX_COMPONENT_TILT_DEG, MAX_COMPONENT_TILT_DEG);
  const xSlope = Math.tan(degreesToRadians(xTilt));
  const ySlope = Math.tan(degreesToRadians(yTilt));
  const magnitude = Math.hypot(xSlope, ySlope, 1);
  const x = xSlope / magnitude;
  const y = ySlope / magnitude;
  const z = 1 / magnitude;

  return {
    x,
    y,
    z,
    xTiltDeg: roundedDegrees(xTilt),
    yTiltDeg: roundedDegrees(yTilt),
    tiltFromZDeg: roundedDegrees(radiansToDegrees(Math.acos(z)))
  };
}

export function directionFromSurfaceVector(surfaceDirection, force) {
  const surfaceMagnitude = Math.hypot(surfaceDirection?.x ?? 0, surfaceDirection?.y ?? 0);
  if (surfaceMagnitude < MIN_SURFACE_DIRECTION_MAGNITUDE) {
    return directionFromTiltAngles(0, 0);
  }

  const tiltFromZDeg = clamp(force ?? 0) * FORCE_TILT_MAX_DEG;
  const tiltRadians = degreesToRadians(tiltFromZDeg);
  const surfaceScale = Math.sin(tiltRadians) / surfaceMagnitude;
  const x = surfaceDirection.x * surfaceScale;
  const y = surfaceDirection.y * surfaceScale;
  const z = Math.cos(tiltRadians);

  return {
    x,
    y,
    z,
    xTiltDeg: roundedDegrees(radiansToDegrees(Math.atan2(x, z))),
    yTiltDeg: roundedDegrees(radiansToDegrees(Math.atan2(y, z))),
    tiltFromZDeg: roundedDegrees(tiltFromZDeg)
  };
}
