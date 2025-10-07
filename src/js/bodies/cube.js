// Cube Body Creation Module

export function makeCube(THREE, A, scene, mass, friction, restitution, world, generateRandomCubeTexture, size = 2, seg = 10) {
  const geom = new THREE.BoxGeometry(size, size, size, seg, seg, seg);
  
  // Generate new random texture for cube
  const cubeTexture = new THREE.CanvasTexture(generateRandomCubeTexture(512, false));
  cubeTexture.wrapS = THREE.RepeatWrapping;
  cubeTexture.wrapT = THREE.RepeatWrapping;
  
  // Generate normal map for sandpaper surface detail
  const cubeNormalMap = new THREE.CanvasTexture(generateRandomCubeTexture(512, true));
  cubeNormalMap.wrapS = THREE.RepeatWrapping;
  cubeNormalMap.wrapT = THREE.RepeatWrapping;
  
  const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({
    map: cubeTexture,
    normalMap: cubeNormalMap,
    normalScale: new THREE.Vector2(0.5, 0.5), // Adjust normal intensity
    color: 0xffffff, 
    metalness: 0.2, 
    roughness: 0.8, // Increased roughness for sandpaper effect
    side: THREE.FrontSide
  }));
  scene.add(mesh);
  
  const shape = new A.btBoxShape(new A.btVector3(size/2, size/2, size/2));
  const tr = new A.btTransform();
  tr.setIdentity();
  const motion = new A.btDefaultMotionState(tr);
  const inertia = new A.btVector3(0, 0, 0);
  shape.calculateLocalInertia(mass, inertia);
  const info = new A.btRigidBodyConstructionInfo(mass, motion, shape, inertia);
  const body = new A.btRigidBody(info);
  
  // Surface friction (for rolling/sliding contact)
  body.setFriction(friction);
  
  // Rolling friction (resistance to rolling motion) - if supported
  try {
    body.setRollingFriction(0.03); // Lower than sphere for easier rolling
  } catch (e) {
    // Rolling friction not supported in this Ammo.js build
  }
  
  // Restitution (bounciness)
  body.setRestitution(restitution);
  
  // Damping: linear (translational) and angular (rotational)
  body.setDamping(0.01, 0.03); // Lower angular damping for rotation
  
  // CCD for continuous collision detection
  body.setCcdSweptSphereRadius(size * 0.25);
  body.setCcdMotionThreshold(0.001);
  
  // Disable deactivation to prevent body from sleeping
  body.setActivationState(4); // DISABLE_DEACTIVATION
  
  world.addRigidBody(body);
  
  return { mesh, body, texture: cubeTexture, normalMap: cubeNormalMap };
}
