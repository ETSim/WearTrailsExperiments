// Sphere Body Creation Module

export function makeSphere(THREE, A, scene, mass, friction, restitution, world, generateRandomCubeTexture, radius = 1.0, widthSegments = 32, heightSegments = 32) {
  const geom = new THREE.SphereGeometry(radius, widthSegments, heightSegments);
  
  // Generate texture for sphere
  const sphereTexture = new THREE.CanvasTexture(generateRandomCubeTexture(512));
  
  const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({
    map: sphereTexture,
    color: 0xffffff, 
    metalness: 0.2, 
    roughness: 0.5,
    side: THREE.FrontSide
  }));
  scene.add(mesh);
  
  // Use sphere shape for physics (more accurate than convex hull for sphere)
  const shape = new A.btSphereShape(radius);
  const tr = new A.btTransform();
  tr.setIdentity();
  const motion = new A.btDefaultMotionState(tr);
  const inertia = new A.btVector3(0, 0, 0);
  shape.calculateLocalInertia(mass, inertia);
  const info = new A.btRigidBodyConstructionInfo(mass, motion, shape, inertia);
  const body = new A.btRigidBody(info);
  
  // Surface friction (for rolling contact)
  body.setFriction(friction);
  
  // Rolling friction (resistance to rolling motion) - if supported
  try {
    body.setRollingFriction(0.05); // Small rolling resistance for realistic rolling
  } catch (e) {
    console.log('Rolling friction not supported in this Ammo.js build');
  }
  
  // Restitution (bounciness)
  body.setRestitution(restitution);
  
  // Damping: linear (translational) and angular (rotational)
  body.setDamping(0.01, 0.05); // Lower angular damping for better rolling
  
  // CCD for continuous collision detection
  body.setCcdSweptSphereRadius(radius * 0.8);
  body.setCcdMotionThreshold(0.005);
  
  // Disable deactivation to prevent body from sleeping
  body.setActivationState(4); // DISABLE_DEACTIVATION
  
  world.addRigidBody(body);
  
  return { mesh, body };
}

