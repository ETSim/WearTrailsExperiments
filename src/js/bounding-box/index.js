// Bounding Box Algorithms Module
// Exports all bounding box computation functions

import { computeAABB } from './aabb.js';
import { computePCAOBB } from './obb.js';
import { computeOMBB } from './ombb.js';
import { computeKDOP } from './kdop.js';
import { computeHybrid } from './hybrid.js';
import { rotatePoints2D, angleDifference, wrapToPi } from './utils.js';

export function computeBoundingBox(contactPts, contactPoint, contactNormal, algorithm, CFG, THREE, dynBody, A, lastOBB, previousVelocity, previousAngle, ANGLE_STABILITY_THRESHOLD, isSoftBody = false) {
  if (!contactPts || contactPts.length === 0) return null;
  
  // Calculate geometric center (centroid) of contact points first
  let centroidX = 0, centroidZ = 0;
  for (const p of contactPts) {
    centroidX += p.x;
    centroidZ += p.z;
  }
  centroidX /= contactPts.length;
  centroidZ /= contactPts.length;
  
  // Get current velocity
  let currentVelocity = new THREE.Vector3(0, 0, 0);
  let velocityMag = 0;
  
  if (dynBody) {
    if (isSoftBody) {
      // For soft bodies, calculate average velocity from all nodes
      const nodes = dynBody.get_m_nodes();
      const nodeCount = nodes.size();
      let avgVx = 0, avgVy = 0, avgVz = 0;
      
      for (let i = 0; i < nodeCount; i++) {
        const node = nodes.at(i);
        const nodeVel = node.get_m_v();
        avgVx += nodeVel.x();
        avgVy += nodeVel.y();
        avgVz += nodeVel.z();
      }
      
      if (nodeCount > 0) {
        avgVx /= nodeCount;
        avgVy /= nodeCount;
        avgVz /= nodeCount;
        currentVelocity.set(avgVx, avgVy, avgVz);
        velocityMag = Math.sqrt(avgVx * avgVx + avgVz * avgVz); // XZ plane magnitude
      }
    } else {
      // For rigid bodies, use getLinearVelocity
      const lv = dynBody.getLinearVelocity();
      currentVelocity.set(lv.x(), lv.y(), lv.z());
      velocityMag = Math.sqrt(lv.x() * lv.x() + lv.z() * lv.z()); // XZ plane magnitude
      A.destroy(lv);
    }
  }
  
  // Translate points relative to centroid for consistent box centering
  const pts2D = contactPts.map(p => ({ x: p.x - centroidX, z: p.z - centroidZ }));
  let bbox2D;
  let finalTheta;
  
  // If velocity is significant, align box with velocity direction
  if (velocityMag > 0.5) {
    // Use velocity direction as box orientation (wrapped to [-π, π])
    finalTheta = wrapToPi(Math.atan2(currentVelocity.z, currentVelocity.x));
    
    // Project all points along velocity direction and compute bounds
    const rotated = rotatePoints2D(pts2D, -finalTheta);
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
    const c = Math.cos(finalTheta), s = Math.sin(finalTheta);
    
    // Transform local center back to world coordinates relative to centroid
    const localCenterX = c * cx - s * cz;
    const localCenterZ = s * cx + c * cz;
    
    bbox2D = {
      width: Math.max(CFG.MIN_CONTACT_SIZE, w),
      height: Math.max(CFG.MIN_CONTACT_SIZE, h),
      centerX: centroidX + localCenterX,
      centerZ: centroidZ + localCenterZ,
      theta: finalTheta
    };
  } else {
    // Low velocity - use traditional algorithm
    switch (algorithm) {
      case 'aabb':
        bbox2D = computeAABB(pts2D, CFG);
        break;
      case 'obb':
        bbox2D = computePCAOBB(pts2D, CFG, computeAABB);
        break;
      case 'ombb':
        bbox2D = computeOMBB(pts2D, CFG, computeAABB);
        break;
      case 'kdop8':
        bbox2D = computeKDOP(pts2D, 8, CFG, computeAABB);
        break;
      case 'hybrid':
        bbox2D = computeHybrid(pts2D, 16, 0.05, CFG, computeAABB);
        break;
      default:
        bbox2D = computeOMBB(pts2D, CFG, computeAABB);
    }
    finalTheta = bbox2D.theta;
    
    // Transform bbox center back to world coordinates (add centroid offset)
    bbox2D.centerX += centroidX;
    bbox2D.centerZ += centroidZ;
  }
  
  // Check velocity consistency for angle smoothing (only when velocity-based)
  const prevVelocityMag = previousVelocity.length();
  let velocityConsistent = false;
  
  if (velocityMag > 0.5 && prevVelocityMag > 0.5) {
    const velDot = currentVelocity.dot(previousVelocity) / (velocityMag * prevVelocityMag);
    velocityConsistent = velDot > 0.8;
  }
  
  // Apply angle stability if velocity is consistent
  if (lastOBB && velocityConsistent && velocityMag > 0.5) {
    // Calculate shortest angular difference (properly wrapped)
    const angleDiff = Math.abs(angleDifference(finalTheta, previousAngle));

    if (angleDiff > ANGLE_STABILITY_THRESHOLD) {
      finalTheta = previousAngle;
      const stableBBox = projectBBox(pts2D, finalTheta);
      bbox2D.width = stableBBox.width;
      bbox2D.height = stableBBox.height;
      // Keep centered on centroid
      bbox2D.centerX = centroidX + stableBBox.centerX;
      bbox2D.centerZ = centroidZ + stableBBox.centerZ;
      bbox2D.theta = finalTheta;
    }
  }
  
  // Update previous values
  previousVelocity.copy(currentVelocity);
  previousAngle = finalTheta;
  
  const n = new THREE.Vector3(contactNormal.x, contactNormal.y, contactNormal.z).normalize();
  const t1 = new THREE.Vector3(Math.cos(finalTheta), 0, Math.sin(finalTheta));
  const t2 = new THREE.Vector3().crossVectors(n, t1).normalize();
  
  return {
    center: { x: bbox2D.centerX, y: contactPoint.y, z: bbox2D.centerZ },
    n: { x: n.x, y: n.y, z: n.z },
    e1: { x: t1.x, y: t1.y, z: t1.z },
    e2: { x: t2.x, y: t2.y, z: t2.z },
    width: bbox2D.width,
    height: bbox2D.height,
    depth: CFG.OBB_DEPTH,
    theta: finalTheta
  };
}

function projectBBox(pts, theta) {
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
