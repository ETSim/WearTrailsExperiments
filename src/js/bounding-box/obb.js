// OBB (Oriented Bounding Box) - PCA-based Algorithm

import { projectBBox, wrapToPi } from './utils.js';

/**
 * Compute OBB with temporal filtering for high rotation stability
 * Maintains a sliding window of recent OBB calculations and averages them
 * when high angular velocity is detected
 */
export function computePCAOBB(pts, CFG, computeAABB) {
  // Calculate current OBB
  const currentOBB = computePCAOBBCore(pts, CFG, computeAABB);
  
  // Initialize history if not present
  if (!computePCAOBB.history) {
    computePCAOBB.history = [];
  }
  
  // Add to history
  computePCAOBB.history.push(currentOBB);
  const windowSize = 5; // Keep last 5 frames
  if (computePCAOBB.history.length > windowSize) {
    computePCAOBB.history.shift();
  }
  
  // Check angular velocity for high rotation
  let rotationSpeed = 0;
  if (typeof window !== 'undefined' && window.bodyManager) {
    const body = window.bodyManager.getBody();
    if (body) {
      try {
        const av = body.getAngularVelocity();
        rotationSpeed = Math.sqrt(av.x()**2 + av.y()**2 + av.z()**2);
      } catch (e) {
        // Unable to get angular velocity
      }
    }
  }
  
  // High rotation: smooth OBB by averaging last N frames
  if (rotationSpeed > 5.0 && computePCAOBB.history.length > 1) {
    return averageOBBs(computePCAOBB.history);
  }
  
  return currentOBB;
}

/**
 * Average multiple OBBs for temporal smoothing
 */
function averageOBBs(obbList) {
  let avgCenterX = 0, avgCenterZ = 0;
  let avgWidth = 0, avgHeight = 0;
  let avgTheta = 0;
  
  for (const obb of obbList) {
    avgCenterX += obb.centerX;
    avgCenterZ += obb.centerZ;
    avgWidth += obb.width;
    avgHeight += obb.height;
    avgTheta += obb.theta;
  }
  
  const count = obbList.length;
  return {
    centerX: avgCenterX / count,
    centerZ: avgCenterZ / count,
    width: avgWidth / count,
    height: avgHeight / count,
    theta: avgTheta / count
  };
}

/**
 * Core OBB computation using PCA
 */
function computePCAOBBCore(pts, CFG, computeAABB) {
  if (pts.length < 2) return computeAABB(pts, CFG);
  
  // Calculate mean using Kahan summation for numerical stability
  let mx = 0, mz = 0;
  let cx = 0, cz = 0; // Kahan compensation
  
  for (const p of pts) {
    // Kahan sum for x
    const yx = p.x - cx;
    const tx = mx + yx;
    cx = (tx - mx) - yx;
    mx = tx;
    
    // Kahan sum for z
    const yz = p.z - cz;
    const tz = mz + yz;
    cz = (tz - mz) - yz;
    mz = tz;
  }
  mx /= pts.length;
  mz /= pts.length;
  
  // Calculate covariance using Kahan summation and unbiased estimator
  let cxx = 0, czz = 0, cxz = 0;
  let cxx_c = 0, czz_c = 0, cxz_c = 0; // Kahan compensation
  
  for (const p of pts) {
    const dx = p.x - mx;
    const dz = p.z - mz;
    
    // Kahan sum for cxx
    const y_cxx = dx * dx - cxx_c;
    const t_cxx = cxx + y_cxx;
    cxx_c = (t_cxx - cxx) - y_cxx;
    cxx = t_cxx;
    
    // Kahan sum for czz
    const y_czz = dz * dz - czz_c;
    const t_czz = czz + y_czz;
    czz_c = (t_czz - czz) - y_czz;
    czz = t_czz;
    
    // Kahan sum for cxz
    const y_cxz = dx * dz - cxz_c;
    const t_cxz = cxz + y_cxz;
    cxz_c = (t_cxz - cxz) - y_cxz;
    cxz = t_cxz;
  }
  
  // Use unbiased estimator (n-1) when n > 2
  const divisor = pts.length > 2 ? (pts.length - 1) : pts.length;
  cxx /= divisor;
  czz /= divisor;
  cxz /= divisor;
  
  const trace = cxx + czz;
  const det = cxx * czz - cxz * cxz;
  const lambda1 = trace/2 + Math.sqrt(Math.max(0, trace*trace/4 - det));

  let vx, vz;

  // Improved PCA degeneracy handling
  // When cxz ≈ 0, check if covariance is near-isotropic (cxx ≈ czz)
  const EPSILON = 1e-9;
  const covarianceRatio = Math.abs(cxx - czz) / (trace + EPSILON);

  if (Math.abs(cxz) > EPSILON) {
    // Normal case: use eigenvector from covariance matrix
    vx = lambda1 - czz;
    vz = cxz;
  } else if (covarianceRatio < 0.01) {
    // Near-isotropic covariance (cxx ≈ czz, cxz ≈ 0)
    // PCA is degenerate - any orientation is equally valid
    // Default to axis-aligned orientation
    vx = 1;
    vz = 0;
  } else {
    // Off-diagonal is zero but cxx ≠ czz
    // Use principal axis along larger variance
    if (cxx > czz) {
      vx = 1;
      vz = 0;
    } else {
      vx = 0;
      vz = 1;
    }
  }

  // Normalize eigenvector
  const len = Math.sqrt(vx*vx + vz*vz);
  if (len > EPSILON) {
    vx /= len;
    vz /= len;
  } else {
    // Fallback if normalization fails
    vx = 1;
    vz = 0;
  }

  // Compute angle and wrap to [-π, π]
  const theta = wrapToPi(Math.atan2(vz, vx));
  const bbox = projectBBox(pts, theta);
  
  return {
    width: Math.max(CFG.MIN_CONTACT_SIZE, bbox.width),
    height: Math.max(CFG.MIN_CONTACT_SIZE, bbox.height),
    centerX: bbox.centerX,
    centerZ: bbox.centerZ,
    theta: theta
  };
}
