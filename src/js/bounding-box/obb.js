// OBB (Oriented Bounding Box) - PCA-based Algorithm

import { projectBBox } from './utils.js';

export function computePCAOBB(pts, CFG, computeAABB) {
  if (pts.length < 2) return computeAABB(pts, CFG);
  
  let mx = 0, mz = 0;
  for (const p of pts) {
    mx += p.x;
    mz += p.z;
  }
  mx /= pts.length;
  mz /= pts.length;
  
  let cxx = 0, czz = 0, cxz = 0;
  for (const p of pts) {
    const dx = p.x - mx;
    const dz = p.z - mz;
    cxx += dx * dx;
    czz += dz * dz;
    cxz += dx * dz;
  }
  cxx /= pts.length;
  czz /= pts.length;
  cxz /= pts.length;
  
  const trace = cxx + czz;
  const det = cxx * czz - cxz * cxz;
  const lambda1 = trace/2 + Math.sqrt(Math.max(0, trace*trace/4 - det));
  
  let vx, vz;
  if (Math.abs(cxz) > 1e-9) {
    vx = lambda1 - czz;
    vz = cxz;
  } else {
    vx = 1;
    vz = 0;
  }
  const len = Math.sqrt(vx*vx + vz*vz);
  if (len > 1e-9) {
    vx /= len;
    vz /= len;
  }
  
  const theta = Math.atan2(vz, vx);
  const bbox = projectBBox(pts, theta);
  
  return {
    width: Math.max(CFG.MIN_CONTACT_SIZE, bbox.width),
    height: Math.max(CFG.MIN_CONTACT_SIZE, bbox.height),
    centerX: bbox.centerX,
    centerZ: bbox.centerZ,
    theta: theta
  };
}
