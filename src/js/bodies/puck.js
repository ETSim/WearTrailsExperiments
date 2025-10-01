// Puck (Torus) Body Creation Module

export function makePuck(THREE, A, scene, mass, friction, restitution, world, makeConvexTriangleMeshShapeFromGeometry, generateRandomCubeTexture, R = 1.2, r = 0.4, radialSeg = 96, tubularSeg = 192) {
  const geom = new THREE.TorusGeometry(R, r, radialSeg, tubularSeg);
  geom.rotateX(Math.PI/2);
  
  // Generate texture for puck
  const puckTexture = new THREE.CanvasTexture(generateRandomCubeTexture(512));
  
  const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({
    map: puckTexture,
    color: 0xffffff, 
    metalness: 0.3, 
    roughness: 0.4,
    side: THREE.FrontSide
  }));
  scene.add(mesh);
  
  const shape = makeConvexTriangleMeshShapeFromGeometry(geom, A);
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
  body.setCcdSweptSphereRadius(r * 0.8);
  body.setCcdMotionThreshold(0.005);
  
  // Disable deactivation to prevent body from sleeping
  body.setActivationState(4); // DISABLE_DEACTIVATION
  
  world.addRigidBody(body);
  
  return { mesh, body };
}
