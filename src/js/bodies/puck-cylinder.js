// Hockey Puck (Cylinder) Body Creation Module
// Realistic hockey puck with low friction and high spin potential

/**
 * Creates a cylinder-shaped hockey puck
 * @param {number} radius - Puck radius (default: 0.5m)
 * @param {number} height - Puck height/thickness (default: 0.15m)
 * @param {number} radialSegments - Mesh detail (default: 32)
 */
export function makePuckCylinder(THREE, A, scene, mass, friction, restitution, world, makeConvexTriangleMeshShapeFromGeometry, generateRandomCubeTexture, radius = 0.5, height = 0.15, radialSegments = 32) {
  // Create cylinder geometry (oriented on Y-axis by default)
  const geom = new THREE.CylinderGeometry(radius, radius, height, radialSegments);

  // Generate texture for puck (dark, ice-worn appearance)
  const puckTexture = new THREE.CanvasTexture(generateRandomCubeTexture(512, false));

  // Generate normal map for surface detail (scratches, wear marks)
  const puckNormalMap = new THREE.CanvasTexture(generateRandomCubeTexture(512, true));

  // Create mesh with hockey puck-like material
  const mesh = new THREE.Mesh(geom, new THREE.MeshStandardMaterial({
    map: puckTexture,
    normalMap: puckNormalMap,
    normalScale: new THREE.Vector2(0.8, 0.8),  // Prominent surface detail
    color: 0x2a2a2a,     // Dark gray/black (hockey puck color)
    metalness: 0.1,      // Slightly metallic (rubber composite)
    roughness: 0.7,      // Fairly rough (worn rubber)
    side: THREE.FrontSide
  }));
  scene.add(mesh);

  // Create physics shape from geometry
  const shape = makeConvexTriangleMeshShapeFromGeometry(geom, A);

  // Set up rigid body
  const tr = new A.btTransform();
  tr.setIdentity();
  const motion = new A.btDefaultMotionState(tr);

  // Calculate inertia (Ammo will compute proper tensor for cylinder)
  const inertia = new A.btVector3(0, 0, 0);
  shape.calculateLocalInertia(mass, inertia);

  const info = new A.btRigidBodyConstructionInfo(mass, motion, shape, inertia);
  const body = new A.btRigidBody(info);

  // Hockey puck properties
  body.setFriction(friction);       // Can be overridden (ice has very low friction ~0.05)
  body.setRestitution(restitution); // High bounce on hard surfaces
  body.setDamping(0.005, 0.01);     // Very low damping (slides far, spins long)

  // CCD for high-speed rotation/translation
  body.setCcdSweptSphereRadius(radius * 0.8);
  body.setCcdMotionThreshold(0.01);

  // Disable deactivation to prevent sleeping during spin
  body.setActivationState(4); // DISABLE_DEACTIVATION

  world.addRigidBody(body);

  // Store puck-specific data for angular momentum calculations
  const userData = {
    bodyType: 'puck-cylinder',
    radius: radius,
    height: height,
    // Moment of inertia for disk about central axis: I_z = 0.5 * m * r²
    // (This is analytical - Ammo calculates full tensor automatically)
    momentOfInertiaZ: 0.5 * mass * radius * radius
  };
  mesh.userData = userData;

  return {
    mesh,
    body,
    texture: puckTexture,
    normalMap: puckNormalMap,
    userData
  };
}
