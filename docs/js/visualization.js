// Visualization Module
// Handles OBB mesh and contact point visualization

export function createOBBVisualization(THREE, scene) {
  const obbGroup = new THREE.Group();
  
  const fillGeo = new THREE.BoxGeometry(1, 1, 1);
  const fillMat = new THREE.MeshStandardMaterial({ 
    color: 0x22c55e, 
    transparent: true, 
    opacity: 0.25, 
    metalness: 0.1, 
    roughness: 0.7,
    side: THREE.DoubleSide
  });
  const obbFill = new THREE.Mesh(fillGeo, fillMat);
  obbFill.renderOrder = 1;
  
  const edgesGeo = new THREE.EdgesGeometry(fillGeo);
  const edgesMat = new THREE.LineBasicMaterial({ color: 0x22c55e, linewidth: 3 });
  const obbEdges = new THREE.LineSegments(edgesGeo, edgesMat);
  obbEdges.renderOrder = 2;
  
  obbGroup.add(obbFill);
  obbGroup.add(obbEdges);
  scene.add(obbGroup);
  
  return { obbGroup, obbFill, obbEdges };
}

export function updateOBBVisualization(obbGroup, obb, paddingWidthScale, paddingHeightScale, paddingDepthTopScale, paddingDepthBottomScale, CFG, THREE) {
  if (!obbGroup || !obb) return;
  
  const w = Math.max(0.01, obb.width) * paddingWidthScale;
  const h = Math.max(0.01, obb.height) * paddingHeightScale;
  const baseDepth = Math.max(0.01, obb.depth || CFG.OBB_DEPTH);
  
  // Calculate top and bottom depths separately
  const depthTop = baseDepth * paddingDepthTopScale;
  const depthBottom = baseDepth * paddingDepthBottomScale;
  const totalDepth = depthTop + depthBottom;
  
  const e1 = new THREE.Vector3(obb.e1.x, obb.e1.y, obb.e1.z).normalize();
  const n = new THREE.Vector3(obb.n.x, obb.n.y, obb.n.z).normalize();
  const e2 = new THREE.Vector3(obb.e2.x, obb.e2.y, obb.e2.z).normalize();
  
  // Offset center based on depth difference (shift towards larger padding)
  const depthOffset = (depthTop - depthBottom) / 2;
  const offsetCenter = new THREE.Vector3(
    obb.center.x + n.x * depthOffset,
    obb.center.y + n.y * depthOffset,
    obb.center.z + n.z * depthOffset
  );
  
  const R = new THREE.Matrix4();
  R.makeBasis(e1, n, e2);
  const S = new THREE.Matrix4().makeScale(w, totalDepth, h);
  const T = new THREE.Matrix4().makeTranslation(offsetCenter.x, offsetCenter.y, offsetCenter.z);
  
  const M = new THREE.Matrix4().multiply(T).multiply(R).multiply(S);
  obbGroup.matrixAutoUpdate = false;
  obbGroup.matrix.copy(M);
  obbGroup.updateMatrixWorld(true);
}

export function createContactVisualization(THREE, CFG) {
  const contactPointsGroup = new THREE.Group();
  
  const geomMeanMarker = new THREE.Mesh(
    new THREE.SphereGeometry(CFG.GEOM_MEAN_SIZE, 16, 16),
    new THREE.MeshStandardMaterial({ 
      color: 0xfbbf24, 
      emissive: 0xfbbf24,
      emissiveIntensity: 0.3,
      metalness: 0.3,
      roughness: 0.4
    })
  );
  geomMeanMarker.visible = false;
  
  return { contactPointsGroup, geomMeanMarker };
}

export function updateContactPoints(contactPointsGroup, samples, showContacts, CFG, THREE) {
  // Clear old markers
  while (contactPointsGroup.children.length > 0) {
    contactPointsGroup.remove(contactPointsGroup.children[0]);
  }

  if (!showContacts || samples.length === 0) return;

  // Check if synthetic augmentation is enabled
  const enableSynthetic = (typeof window !== 'undefined') ?
    (window.state?.enableSynthetic !== false) : true;

  // Filter samples based on synthetic flag
  const filteredSamples = enableSynthetic ? samples : samples.filter(pt => !pt.isSynthetic);

  if (filteredSamples.length === 0) return;

  // Separate geometry for real and synthetic contacts
  const realGeom = new THREE.SphereGeometry(CFG.CONTACT_POINT_SIZE, 12, 12);
  const syntheticGeom = new THREE.SphereGeometry(CFG.CONTACT_POINT_SIZE * 0.8, 8, 8); // Slightly smaller

  // Real contacts: RED with strong glow
  const realMat = new THREE.MeshStandardMaterial({
    color: 0xff0000,
    emissive: 0xff0000,
    emissiveIntensity: 0.5,
    metalness: 0.2,
    roughness: 0.3
  });

  // Synthetic/augmented contacts: ORANGE with subtle glow
  const syntheticMat = new THREE.MeshStandardMaterial({
    color: 0xff8800,      // Orange color
    emissive: 0xff6600,
    emissiveIntensity: 0.3,
    metalness: 0.1,
    roughness: 0.5,
    transparent: true,
    opacity: 0.7         // Semi-transparent to distinguish
  });

  for (const pt of filteredSamples) {
    // Choose geometry and material based on whether contact is synthetic
    const isSynthetic = pt.isSynthetic === true;
    const geom = isSynthetic ? syntheticGeom : realGeom;
    const mat = isSynthetic ? syntheticMat : realMat;

    const sphere = new THREE.Mesh(geom, mat);
    sphere.position.set(pt.x, pt.y, pt.z);
    sphere.userData.isSynthetic = isSynthetic; // Store for debugging
    contactPointsGroup.add(sphere);
  }
}

export function updateGeomMeanMarker(geomMeanMarker, gm, showGeomMean) {
  if (!showGeomMean || !gm) {
    geomMeanMarker.visible = false;
    return;
  }
  geomMeanMarker.visible = true;
  geomMeanMarker.position.set(gm.x, gm.y + 0.1, gm.z);
}
