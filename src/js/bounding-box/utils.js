// Utility functions for bounding box calculations

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
