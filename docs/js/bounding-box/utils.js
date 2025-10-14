// Utility functions for bounding box calculations

/**
 * Wrap angle to [-π, π] range
 * @param {number} angle - Angle in radians
 * @returns {number} Wrapped angle in [-π, π]
 */
export function wrapToPi(angle) {
  while (angle > Math.PI) angle -= 2 * Math.PI;
  while (angle < -Math.PI) angle += 2 * Math.PI;
  return angle;
}

/**
 * Calculate shortest angular difference between two angles
 * Handles wrapping across ±π boundary
 * @param {number} a - First angle in radians
 * @param {number} b - Second angle in radians
 * @returns {number} Signed difference in [-π, π] range
 */
export function angleDifference(a, b) {
  return wrapToPi(a - b);
}

export function rotatePoints2D(pts, theta) {
  const c = Math.cos(theta), s = Math.sin(theta);
  return pts.map(p => ({
    x: c * p.x - s * p.z,
    z: s * p.x + c * p.z
  }));
}

export function projectBBox(pts, theta) {
  const rotated = rotatePoints2D(pts, -theta);
  let minX = Infinity, maxX = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  for (const p of rotated) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  const w = maxX - minX;
  const h = maxZ - minZ;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const c = Math.cos(theta), s = Math.sin(theta);
  return {
    width: w,
    height: h,
    centerX: c * cx - s * cz,
    centerZ: s * cx + c * cz,
    area: w * h
  };
}
