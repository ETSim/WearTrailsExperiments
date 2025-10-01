// Contact Sampling and Geometric Center Calculation

export function getMeshConvexHullOnPlane(mesh, planeY, THREE) {
  if (!mesh || !mesh.geometry) return [];
  
  // Project mesh vertices onto the XZ plane at given Y height
  const pos = mesh.geometry.attributes.position;
  const matrixWorld = mesh.matrixWorld;
  const points2D = [];
  const tempVec = new THREE.Vector3();
  
  for (let i = 0; i < pos.count; i++) {
    tempVec.set(pos.getX(i), pos.getY(i), pos.getZ(i));
    tempVec.applyMatrix4(matrixWorld);
    
    // Only consider vertices near the contact plane (within 0.5 units)
    if (Math.abs(tempVec.y - planeY) < 0.5) {
      points2D.push({ x: tempVec.x, z: tempVec.z });
    }
  }
  
  if (points2D.length < 3) return [];
  
  // Compute 2D convex hull using Graham scan
  const sorted = [...points2D].sort((a, b) => a.x === b.x ? a.z - b.z : a.x - b.x);
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
  
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

export function augmentContactsWithHull(contacts, mesh, planeY, gc, THREE) {
  let augmented = [...contacts];
  
  // Get convex hull of mesh projected onto contact plane
  const hull = getMeshConvexHullOnPlane(mesh, planeY, THREE);
  
  if (hull.length >= 3) {
    // Sample points along hull perimeter
    const samplesPerEdge = 2;
    for (let i = 0; i < hull.length; i++) {
      const p1 = hull[i];
      const p2 = hull[(i + 1) % hull.length];
      
      for (let j = 0; j <= samplesPerEdge; j++) {
        const t = j / samplesPerEdge;
        augmented.push({
          x: p1.x * (1 - t) + p2.x * t,
          y: planeY,
          z: p1.z * (1 - t) + p2.z * t
        });
      }
    }
  }
  
  // Also add geometric center ring for stability
  const ringRadius = 0.12;
  const ringCount = 6;
  for (let i = 0; i < ringCount; i++) {
    const angle = (Math.PI * 2 * i) / ringCount;
    augmented.push({
      x: gc.x + Math.cos(angle) * ringRadius,
      y: planeY,
      z: gc.z + Math.sin(angle) * ringRadius
    });
  }
  
  return augmented;
}

export function sampleContacts(dispatcher, THREE, dynMesh, MIN_CONTACTS_FOR_STABLE_BOX, softGroundThreshold = 0.15) {
  const contactSamples = [];
  const manifolds = dispatcher.getNumManifolds();
  let count = 0;
  const nAccum = new THREE.Vector3(0, 0, 0);
  const pAccum = new THREE.Vector3(0, 0, 0);
  
  // Check if this is a soft body
  const isSoftBody = dynMesh && dynMesh.userData.isSoftBody;
  
  if (isSoftBody && dynMesh.userData.physicsBody) {
    // For soft bodies, sample nodes that are near the ground
    const softBody = dynMesh.userData.physicsBody;
    const nodes = softBody.get_m_nodes();
    const nodeCount = nodes.size();
    const groundThreshold = softGroundThreshold; // Use passed threshold parameter
    
    for (let i = 0; i < nodeCount; i++) {
      const node = nodes.at(i);
      const nodePos = node.get_m_x();
      const nodeNormal = node.get_m_n();
      
      // Check if node is near the ground (y close to 0)
      if (nodePos.y() < groundThreshold) {
        contactSamples.push({ 
          x: nodePos.x(), 
          y: nodePos.y(), 
          z: nodePos.z() 
        });
        
        // Accumulate position and normal
        pAccum.x += nodePos.x();
        pAccum.y += nodePos.y();
        pAccum.z += nodePos.z();
        
        nAccum.x += nodeNormal.x();
        nAccum.y += nodeNormal.y();
        nAccum.z += nodeNormal.z();
        
        count++;
      }
    }
  } else {
    // Regular rigid body contact detection
    for (let i = 0; i < manifolds; i++) {
      const m = dispatcher.getManifoldByIndexInternal(i);
      const n = m.getNumContacts();
      for (let j = 0; j < n; j++) {
        const p = m.getContactPoint(j);
        const nB = p.get_m_normalWorldOnB && p.get_m_normalWorldOnB();
        if (nB) {
          nAccum.x += nB.x();
          nAccum.y += nB.y();
          nAccum.z += nB.z();
        }
        const pwB = p.get_m_positionWorldOnB && p.get_m_positionWorldOnB();
        if (pwB) {
          pAccum.x += pwB.x();
          pAccum.y += pwB.y();
          pAccum.z += pwB.z();
          contactSamples.push({ x: pwB.x(), y: pwB.y(), z: pwB.z() });
        }
        count++;
      }
    }
  }
  
  let avgContactNormal = new THREE.Vector3(0, 1, 0);
  let avgContactPoint = new THREE.Vector3(0, 0, 0);
  let geometricCenter = { x: 0, y: 0, z: 0 };
  
  if (count > 0) {
    nAccum.multiplyScalar(1/Math.max(1, count));
    if (nAccum.y < 0) nAccum.multiplyScalar(-1);
    avgContactNormal.copy(nAccum.lengthSq() > 1e-12 ? nAccum.normalize() : new THREE.Vector3(0, 1, 0));
    pAccum.multiplyScalar(1/Math.max(1, count));
    avgContactPoint.copy(pAccum);
    
    // Calculate geometric center (centroid)
    if (contactSamples.length > 0) {
      let sumx = 0, sumy = 0, sumz = 0;
      for (const p of contactSamples) {
        sumx += p.x;
        sumy += p.y;
        sumz += p.z;
      }
      geometricCenter.x = sumx / contactSamples.length;
      geometricCenter.y = sumy / contactSamples.length;
      geometricCenter.z = sumz / contactSamples.length;
      
      // Augment contacts if count is too low - use hull + geometric center
      if (contactSamples.length <= MIN_CONTACTS_FOR_STABLE_BOX && dynMesh) {
        const augmented = augmentContactsWithHull(
          contactSamples, 
          dynMesh, 
          avgContactPoint.y,
          geometricCenter,
          THREE
        );
        return {
          contactSamples: augmented,
          count,
          avgContactNormal,
          avgContactPoint,
          geometricCenter
        };
      }
    }
  }
  
  return {
    contactSamples,
    count,
    avgContactNormal,
    avgContactPoint,
    geometricCenter
  };
}
