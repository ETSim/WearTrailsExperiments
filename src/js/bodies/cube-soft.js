// Soft Body Cube Creation - Volumetric with Tetrahedrons (kripken/ammo.js)
// Based on Ammo.js soft body volume demo approach
// - Creates a volumetric soft body using tetrahedrons for better physics
// - More realistic deformation and collision response
// - Uses surface mesh for rendering with internal tetrahedral structure

export function makeCubeSoft(
  THREE,
  A,
  scene,
  mass,
  friction,
  restitution,
  world,
  generateRandomCubeTexture,
  size = 2,
  seg = 4
) {
  // Parameters for volumetric soft body
  const sizeX = size;
  const sizeY = size;
  const sizeZ = size;
  
  // Number of internal points (higher = more detailed but slower)
  const numPointsX = seg + 1;
  const numPointsY = seg + 1;
  const numPointsZ = seg + 1;
  
  const tX = 0, tY = 0, tZ = 0; // Translation offset

  if (numPointsX < 2 || numPointsY < 2 || numPointsZ < 2) {
    return;
  }

  // Offset is the numbers assigned to 8 vertices of the cube in ascending Z, Y, X
  const indexFromOffset = [];
  for (let offset = 0; offset < 8; offset++) {
    const a = offset & 1 ? 1 : 0;
    const b = offset & 2 ? 1 : 0;
    const c = offset & 4 ? 1 : 0;
    const index = a + b * numPointsX + c * numPointsX * numPointsY;
    indexFromOffset[offset] = index;
  }

  // Construct BufferGeometry for rendering
  const numVertices = numPointsX * numPointsY * numPointsZ;
  const numFaces = 4 * ((numPointsX - 1) * (numPointsY - 1) + 
                        (numPointsX - 1) * (numPointsZ - 1) + 
                        (numPointsY - 1) * (numPointsZ - 1));

  const bufferGeom = new THREE.BufferGeometry();
  const vertices = new Float32Array(numVertices * 3);
  const normals = new Float32Array(numVertices * 3);
  const indices = new (numFaces * 3 > 65535 ? Uint32Array : Uint16Array)(numFaces * 3);

  // Create vertices and surface faces
  const sx = sizeX / (numPointsX - 1);
  const sy = sizeY / (numPointsY - 1);
  const sz = sizeZ / (numPointsZ - 1);
  let numFacesAdded = 0;

  for (let p = 0, k = 0; k < numPointsZ; k++) {
    for (let j = 0; j < numPointsY; j++) {
      for (let i = 0; i < numPointsX; i++) {
        // Vertex and normal
        const p3 = p * 3;
        vertices[p3] = i * sx - sizeX * 0.5;
        normals[p3] = 0;
        vertices[p3 + 1] = j * sy - sizeY * 0.5;
        normals[p3 + 1] = 0;
        vertices[p3 + 2] = k * sz - sizeZ * 0.5;
        normals[p3 + 2] = 0;

        // XY faces (front and back)
        if (k === 0 && i < numPointsX - 1 && j < numPointsY - 1) {
          const faceIndex = numFacesAdded * 3;
          indices[faceIndex] = p + indexFromOffset[0];
          indices[faceIndex + 1] = p + indexFromOffset[3];
          indices[faceIndex + 2] = p + indexFromOffset[1];
          indices[faceIndex + 3] = p + indexFromOffset[0];
          indices[faceIndex + 4] = p + indexFromOffset[2];
          indices[faceIndex + 5] = p + indexFromOffset[3];
          numFacesAdded += 2;
        }
        if (k === numPointsZ - 2 && i < numPointsX - 1 && j < numPointsY - 1) {
          const faceIndex = numFacesAdded * 3;
          indices[faceIndex] = p + indexFromOffset[7];
          indices[faceIndex + 1] = p + indexFromOffset[6];
          indices[faceIndex + 2] = p + indexFromOffset[5];
          indices[faceIndex + 3] = p + indexFromOffset[5];
          indices[faceIndex + 4] = p + indexFromOffset[6];
          indices[faceIndex + 5] = p + indexFromOffset[4];
          numFacesAdded += 2;
        }

        // XZ faces (bottom and top)
        if (j === 0 && i < numPointsX - 1 && k < numPointsZ - 1) {
          const faceIndex = numFacesAdded * 3;
          indices[faceIndex] = p + indexFromOffset[0];
          indices[faceIndex + 1] = p + indexFromOffset[5];
          indices[faceIndex + 2] = p + indexFromOffset[4];
          indices[faceIndex + 3] = p + indexFromOffset[0];
          indices[faceIndex + 4] = p + indexFromOffset[1];
          indices[faceIndex + 5] = p + indexFromOffset[5];
          numFacesAdded += 2;
        }
        if (j === numPointsY - 2 && i < numPointsX - 1 && k < numPointsZ - 1) {
          const faceIndex = numFacesAdded * 3;
          indices[faceIndex] = p + indexFromOffset[3];
          indices[faceIndex + 1] = p + indexFromOffset[2];
          indices[faceIndex + 2] = p + indexFromOffset[6];
          indices[faceIndex + 3] = p + indexFromOffset[3];
          indices[faceIndex + 4] = p + indexFromOffset[6];
          indices[faceIndex + 5] = p + indexFromOffset[7];
          numFacesAdded += 2;
        }

        // YZ faces (left and right)
        if (i === 0 && j < numPointsY - 1 && k < numPointsZ - 1) {
          const faceIndex = numFacesAdded * 3;
          indices[faceIndex] = p + indexFromOffset[0];
          indices[faceIndex + 1] = p + indexFromOffset[6];
          indices[faceIndex + 2] = p + indexFromOffset[2];
          indices[faceIndex + 3] = p + indexFromOffset[0];
          indices[faceIndex + 4] = p + indexFromOffset[4];
          indices[faceIndex + 5] = p + indexFromOffset[6];
          numFacesAdded += 2;
        }
        if (i === numPointsX - 2 && j < numPointsY - 1 && k < numPointsZ - 1) {
          const faceIndex = numFacesAdded * 3;
          indices[faceIndex] = p + indexFromOffset[1];
          indices[faceIndex + 1] = p + indexFromOffset[3];
          indices[faceIndex + 2] = p + indexFromOffset[5];
          indices[faceIndex + 3] = p + indexFromOffset[3];
          indices[faceIndex + 4] = p + indexFromOffset[7];
          indices[faceIndex + 5] = p + indexFromOffset[5];
          numFacesAdded += 2;
        }

        p++;
      }
    }
  }

  bufferGeom.setIndex(new THREE.BufferAttribute(indices, 1));
  bufferGeom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  bufferGeom.setAttribute('normal', new THREE.BufferAttribute(normals, 3));

  // Apply translation
  bufferGeom.translate(tX, tY, tZ);

  // Create texture
  const tex = new THREE.CanvasTexture(generateRandomCubeTexture(512, false));
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  
  // Generate normal map for surface detail
  const normalTex = new THREE.CanvasTexture(generateRandomCubeTexture(512, true));
  normalTex.wrapS = normalTex.wrapT = THREE.RepeatWrapping;

  // Create mesh
  const mesh = new THREE.Mesh(
    bufferGeom,
    new THREE.MeshStandardMaterial({
      map: tex,
      normalMap: normalTex,
      normalScale: new THREE.Vector2(0.5, 0.5),
      color: 0xffffff,
      metalness: 0.1,
      roughness: 0.8,
      side: THREE.DoubleSide,
      wireframe: false,
    })
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  scene.add(mesh);

  // Create soft body with volumetric structure
  const vectorTemp = new A.btVector3(0, 0, 0);
  vectorTemp.setValue(vertices[0], vertices[1], vertices[2]);

  const volumeSoftBody = new A.btSoftBody(world.getWorldInfo(), 1, vectorTemp, [1.0]);
  const physMat0 = volumeSoftBody.get_m_materials().at(0);

  // Append all nodes
  for (let i = 1, il = vertices.length / 3; i < il; i++) {
    const i3 = i * 3;
    vectorTemp.setValue(vertices[i3], vertices[i3 + 1], vertices[i3 + 2]);
    volumeSoftBody.appendNode(vectorTemp, 1.0);
  }

  // Append all surface faces
  for (let i = 0, il = indices.length / 3; i < il; i++) {
    const i3 = i * 3;
    volumeSoftBody.appendFace(indices[i3], indices[i3 + 1], indices[i3 + 2]);
  }

  // Create tetrahedrons for internal structure
  let p = 0;

  function newTetra(i0, i1, i2, i3) {
    const v0 = p + indexFromOffset[i0];
    const v1 = p + indexFromOffset[i1];
    const v2 = p + indexFromOffset[i2];
    const v3 = p + indexFromOffset[i3];

    volumeSoftBody.appendTetra(v0, v1, v2, v3);

    // Create links between tetrahedron vertices
    volumeSoftBody.appendLink(v0, v1, physMat0, true);
    volumeSoftBody.appendLink(v0, v2, physMat0, true);
    volumeSoftBody.appendLink(v0, v3, physMat0, true);
    volumeSoftBody.appendLink(v1, v2, physMat0, true);
    volumeSoftBody.appendLink(v2, v3, physMat0, true);
    volumeSoftBody.appendLink(v3, v1, physMat0, true);
  }

  // Create 5 tetrahedrons for each cube cell
  for (let k = 0; k < numPointsZ; k++) {
    for (let j = 0; j < numPointsY; j++) {
      for (let i = 0; i < numPointsX; i++) {
        if (i < numPointsX - 1 && j < numPointsY - 1 && k < numPointsZ - 1) {
          // 5 tetrahedrons decomposition of a cube
          newTetra(0, 4, 5, 6);
          newTetra(0, 2, 3, 6);
          newTetra(0, 1, 3, 5);
          newTetra(3, 5, 6, 7);
          newTetra(0, 3, 5, 6);
        }
        p++;
      }
    }
  }

  // Configure soft body parameters
  const sbConfig = volumeSoftBody.get_m_cfg();
  
  // Increase solver iterations for better stability
  sbConfig.set_viterations(40); // Velocity solver iterations
  sbConfig.set_piterations(40); // Position solver iterations
  
  // Collision flags: VF_SS (Vertex-Face soft-soft) + CL_SS (Cluster soft-soft) + CL_RS (Cluster rigid-soft)
  // 0x11 = VF_SS + CL_RS (most common for soft-rigid interaction)
  sbConfig.set_collisions(0x11);
  
  // Dynamic friction (0-1 range)
  sbConfig.set_kDF(Math.max(0, Math.min(1, friction)));
  
  // Damping coefficient (helps with stability)
  sbConfig.set_kDP(0.01);
  
  // Drag coefficient
  sbConfig.set_kDG(0.0);
  
  // Pressure (0 = no inflation)
  const pressure = 0.0;
  sbConfig.set_kPR(pressure);
  
  // Contact hardness (0-1): higher = harder contact response
  sbConfig.set_kCHR(1.0);  // Hard contact with rigid bodies
  sbConfig.set_kKHR(0.9);  // Kinetic hardness
  sbConfig.set_kSHR(1.0);  // Soft-rigid hardness
  
  // Anchors hardness (if using anchors)
  sbConfig.set_kAHR(0.7);
  
  // Cluster hardness (for cluster collisions)
  sbConfig.set_kSRHR_CL(1.0);
  sbConfig.set_kSKHR_CL(0.9);
  sbConfig.set_kSSHR_CL(0.5);
  sbConfig.set_kSR_SPLT_CL(0.5);

  // Stiffness coefficients (0-1): lower = more deformable
  const stiffness = 0.05;
  physMat0.set_m_kLST(stiffness); // Linear stiffness (stretching)
  physMat0.set_m_kAST(stiffness); // Angular stiffness (bending)
  physMat0.set_m_kVST(stiffness); // Volume stiffness (volume preservation)

  // Set total mass
  volumeSoftBody.setTotalMass(mass, false);
  
  // Set collision margin (smaller = more precise collisions)
  const margin = 0.05;
  try {
    A.castObject(volumeSoftBody, A.btCollisionObject).getCollisionShape().setMargin(margin);
  } catch (e) {
  }

  // Set restitution (bounciness)
  volumeSoftBody.setRestitution(restitution);
  
  // Set friction
  volumeSoftBody.setFriction(friction);
  
  // Enable Continuous Collision Detection (CCD) for soft body
  try {
    // Set CCD swept sphere radius (for each node)
    const ccdRadius = size * 0.15; // 15% of body size
    A.castObject(volumeSoftBody, A.btCollisionObject).setCcdSweptSphereRadius(ccdRadius);
    
    // Set CCD motion threshold (minimum velocity to trigger CCD)
    const ccdThreshold = 0.001;
    A.castObject(volumeSoftBody, A.btCollisionObject).setCcdMotionThreshold(ccdThreshold);
  } catch (e) {
  }

  // Add to physics world
  A.castObject(world, A.btSoftRigidDynamicsWorld).addSoftBody(volumeSoftBody, 1, -1);

  // Disable deactivation (always active)
  volumeSoftBody.setActivationState(4);

  // Update function to sync mesh with physics
  const nodeCount = volumeSoftBody.get_m_nodes().size();
  const triPosArr = bufferGeom.getAttribute('position').array;
  const triNormArr = bufferGeom.getAttribute('normal').array;

  const update = () => {
    const nodes = volumeSoftBody.get_m_nodes();
    for (let i = 0, v = 0; i < nodeCount; ++i) {
      const node = nodes.at(i);
      const p = node.get_m_x();
      const n = node.get_m_n();
      
      triPosArr[v] = p.x();
      triNormArr[v++] = n.x();
      triPosArr[v] = p.y();
      triNormArr[v++] = n.y();
      triPosArr[v] = p.z();
      triNormArr[v++] = n.z();
    }
    
    bufferGeom.getAttribute('position').needsUpdate = true;
    bufferGeom.getAttribute('normal').needsUpdate = true;
  };

  // Store initial positions for reset
  const initialPositions = new Float32Array(vertices);
  
  // Attach metadata for external access
  mesh.userData.physicsBody = volumeSoftBody;
  mesh.userData.isSoftBody = true;
  mesh.userData.updateSoftBodyMesh = update;
  mesh.userData.initialPositions = initialPositions;

  return { mesh, body: volumeSoftBody, isSoftBody: true, update, texture: tex, normalMap: normalTex };
}
