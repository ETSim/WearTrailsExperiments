// Hybrid Algorithm (Quantized + Quantile)

import { rotatePoints2D, projectBBox, wrapToPi } from './utils.js';

export function computeHybrid(pts, k = 16, quantile = 0.05, CFG, computeAABB) {
  if (pts.length < 2) return computeAABB(pts, CFG);
  
  let bestTheta = 0;
  let bestArea = Infinity;
  
  for (let i = 0; i < k; i++) {
    const theta = wrapToPi(Math.PI * i / k);
    const bbox = projectBBox(pts, theta);
    if (bbox.area < bestArea) {
      bestArea = bbox.area;
      bestTheta = theta;
    }
  }
  
  const rotated = rotatePoints2D(pts, -bestTheta);
  rotated.sort((a, b) => a.x - b.x);
  
  const nPts = rotated.length;
  const lowIdx = Math.floor(nPts * quantile);
  const highIdx = Math.ceil(nPts * (1 - quantile)) - 1;
  
  const xVals = rotated.map(p => p.x);
  const zVals = rotated.map(p => p.z);
  
  xVals.sort((a, b) => a - b);
  zVals.sort((a, b) => a - b);
  
  const minX = xVals[Math.max(0, lowIdx)];
  const maxX = xVals[Math.min(nPts - 1, highIdx)];
  const minZ = zVals[Math.max(0, lowIdx)];
  const maxZ = zVals[Math.min(nPts - 1, highIdx)];
  
  const w = maxX - minX;
  const h = maxZ - minZ;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  
  const c = Math.cos(bestTheta), s = Math.sin(bestTheta);
  
  return {
    width: Math.max(CFG.MIN_CONTACT_SIZE, w),
    height: Math.max(CFG.MIN_CONTACT_SIZE, h),
    centerX: c * cx - s * cz,
    centerZ: s * cx + c * cz,
    theta: bestTheta
  };
}
