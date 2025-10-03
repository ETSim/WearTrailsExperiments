// OMBB (Optimal Minimum Bounding Box) - Rotating Calipers Algorithm

import { projectBBox } from './utils.js';

export function computeOMBB(pts, CFG, computeAABB) {
  if (pts.length < 3) return computeAABB(pts, CFG);
  
  const sorted = [...pts].sort((a, b) => a.x === b.x ? a.z - b.z : a.x - b.x);
  const cross = (o, a, b) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
  
  const lower = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length-2], lower[lower.length-1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  
  const upper = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length-2], upper[upper.length-1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  
  const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
  if (hull.length < 2) return computeAABB(pts, CFG);
  
  let bestArea = Infinity;
  let bestBox = null;
  
  for (let i = 0; i < hull.length; i++) {
    const p1 = hull[i];
    const p2 = hull[(i + 1) % hull.length];
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    const theta = Math.atan2(dz, dx);
    
    const bbox = projectBBox(hull, theta);
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
