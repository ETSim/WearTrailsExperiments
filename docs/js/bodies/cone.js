// Cone Body Creation Module

export function makeCone(THREE, A, scene, mass, friction, restitution, world, makeConvexTriangleMeshShapeFromGeometry, generateRandomCubeTexture, radius = 1.0, height = 2.0, radialSegments = 32) {
  const geom = new THREE.ConeGeometry(radius, height, radialSegments);
  
  // Generate texture for cone
  const coneTexture = new THREE.CanvasTexture(generateRandomCubeTexture(512, false));
  
  // Generate normal map for surface detail
  const coneNormalMap = new THREE.CanvasTexture(generateRandomCubeTexture(512, true));
  
  const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({
    map: coneTexture,
    normalMap: coneNormalMap,
    normalScale: new THREE.Vector2(0.5, 0.5),
    color: 0xffffff, 
    metalness: 0.2, 
    roughness: 0.8,
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
  
  // CCD for continuous collision detection
  body.setCcdSweptSphereRadius(radius * 0.5);
  body.setCcdMotionThreshold(0.005);
  
  // Disable deactivation to prevent body from sleeping
  body.setActivationState(4); // DISABLE_DEACTIVATION
  
  world.addRigidBody(body);
  
  return { mesh, body, texture: coneTexture, normalMap: coneNormalMap };
}
