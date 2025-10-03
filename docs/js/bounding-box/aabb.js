// AABB (Axis-Aligned Bounding Box) Algorithm

export function computeAABB(pts, CFG) {
  let minX = Infinity, maxX = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  const w = maxX - minX;
  const h = maxZ - minZ;
  return {
    width: Math.max(CFG.MIN_CONTACT_SIZE, w),
    height: Math.max(CFG.MIN_CONTACT_SIZE, h),
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
    theta: 0
  };
}
