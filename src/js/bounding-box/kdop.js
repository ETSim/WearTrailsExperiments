// KDOP (K-Discrete Oriented Polytope) Algorithm

import { projectBBox } from './utils.js';

export function computeKDOP(pts, k, CFG, computeAABB) {
  if (pts.length < 2) return computeAABB(pts, CFG);
  
  let bestArea = Infinity;
  let bestBox = null;
  
  for (let i = 0; i < k; i++) {
    const theta = Math.PI * i / k;
    const bbox = projectBBox(pts, theta);
    
    if (bbox.area < bestArea) {
      bestArea = bbox.area;
      bestBox = {
        width: bbox.width,
        height: bbox.height,
        centerX: bbox.centerX,
        centerZ: bbox.centerZ,
        theta: theta
      };
    }
  }
  
  if (!bestBox) return computeAABB(pts, CFG);
  
  return {
    width: Math.max(CFG.MIN_CONTACT_SIZE, bestBox.width),
    height: Math.max(CFG.MIN_CONTACT_SIZE, bestBox.height),
    centerX: bestBox.centerX,
    centerZ: bestBox.centerZ,
    theta: bestBox.theta
  };
}
