// Custom GLB Body Creation Module

export async function makeCustomBody(THREE, A, scene, mass, friction, restitution, world, loader, makeConvexTriangleMeshShapeFromGeometry, url) {
  try {
    const gltf = await new Promise((res, rej) => loader.load(url, res, undefined, rej));
    let srcMesh = null;
    gltf.scene.traverse(o => { if (o.isMesh && !srcMesh) srcMesh = o; });
    if (!srcMesh) throw new Error('No mesh found in GLB');
    
    const mesh = srcMesh.clone();
    const bbox = new THREE.Box3().setFromObject(mesh);
    const size = bbox.getSize(new THREE.Vector3());
    const scale = 2.5 / Math.max(size.x, size.y, size.z);
    mesh.scale.setScalar(scale);
    
    if (srcMesh.material) {
      mesh.material = srcMesh.material.clone();
      mesh.material.needsUpdate = true;
      mesh.material.side = THREE.FrontSide;
      if (mesh.material.metalness !== undefined) mesh.material.metalness = 0.3;
      if (mesh.material.roughness !== undefined) mesh.material.roughness = 0.5;
    } else {
      mesh.material = new THREE.MeshStandardMaterial({ 
        color: 0xff9900, 
        metalness: 0.3, 
        roughness: 0.5,
        side: THREE.FrontSide
      });
    }
    
    scene.add(mesh);
    const shape = makeConvexTriangleMeshShapeFromGeometry(mesh.geometry, A);
    const tr = new A.btTransform();
    tr.setIdentity();
    const motion = new A.btDefaultMotionState(tr);
    const inertia = new A.btVector3(0, 0, 0);
    shape.calculateLocalInertia(mass, inertia);
    const info = new A.btRigidBodyConstructionInfo(mass, motion, shape, inertia);
    const body = new A.btRigidBody(info);
    body.setFriction(friction);
    body.setRestitution(restitution);
    body.setDamping(0.01, 0.01);
    body.setCcdSweptSphereRadius(0.3);
    body.setCcdMotionThreshold(0.002);
    
    // Disable deactivation to prevent body from sleeping
    body.setActivationState(4); // DISABLE_DEACTIVATION
    
    world.addRigidBody(body);
    return { mesh, body };
  } catch(e) {
    console.error('Failed to load custom body:', e);
    return null;
  }
}
