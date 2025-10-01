// Body Manager Module
// Handles body lifecycle (create, destroy, reset)

import { makeCube } from './bodies/cube.js';
import { makeCubeSoft } from './bodies/cube-soft.js';
import { makeSphere } from './bodies/sphere.js';
import { makePuck } from './bodies/puck.js';
import { makeCone } from './bodies/cone.js';
import { makeCustomBody } from './bodies/custom.js';
import { makeConvexTriangleMeshShapeFromGeometry } from './bodies/utils.js';

export class BodyManager {
  constructor(THREE, A, scene, world, mass, CFG, loader, generateRandomCubeTexture) {
    this.THREE = THREE;
    this.A = A;
    this.scene = scene;
    this.world = world;
    this.mass = mass;
    this.CFG = CFG;
    this.loader = loader;
    this.generateRandomCubeTexture = generateRandomCubeTexture;
    
    this.dynMesh = null;
    this.dynBody = null;
    this.shapeType = 'cube10';
    this.customBodyURL = null;
    this.friction = 0.0;
    this.restitution = 0.6; // Higher default restitution for more elastic behavior
    this.linearDamping = 0.01;
    this.angularDamping = 0.03;
    this.speedX = 1;
    this.speedZ = 0;
  }
  
  setShapeType(type) {
    this.shapeType = type;
  }
  
  setCustomBodyURL(url) {
    // Revoke previous URL to prevent memory leak
    if (this.customBodyURL) {
      URL.revokeObjectURL(this.customBodyURL);
    }
    this.customBodyURL = url;
  }
  
  setFriction(friction) {
    this.friction = friction;
    if (this.dynBody) {
      this.dynBody.setFriction(friction);
      this.dynBody.activate();
    }
  }
  
  setRestitution(restitution) {
    this.restitution = restitution;
    if (this.dynBody) {
      this.dynBody.setRestitution(restitution);
      this.dynBody.activate();
    }
  }
  
  setLinearDamping(linearDamping) {
    if (this.dynBody && !this.dynMesh.userData.isSoftBody) {
      // Get current angular damping to preserve it
      const angularDamping = this.angularDamping || 0.03;
      this.linearDamping = linearDamping;
      this.dynBody.setDamping(linearDamping, angularDamping);
      this.dynBody.activate();
    }
  }
  
  setAngularDamping(angularDamping) {
    if (this.dynBody && !this.dynMesh.userData.isSoftBody) {
      // Get current linear damping to preserve it
      const linearDamping = this.linearDamping || 0.01;
      this.angularDamping = angularDamping;
      this.dynBody.setDamping(linearDamping, angularDamping);
      this.dynBody.activate();
    }
  }
  
  setSpeed(speedX, speedZ) {
    this.speedX = speedX;
    this.speedZ = speedZ;
  }
  
  setMass(mass) {
    this.mass = mass;
    // If body exists, need to recreate with new mass
    if (this.dynBody) {
      // Mass can't be changed on existing body, needs recreation
      // This will be handled by calling start() after setMass()
    }
  }
  
  setSoftStiffness(stiffness) {
    if (this.dynMesh && this.dynMesh.userData.isSoftBody && this.dynBody) {
      const materials = this.dynBody.get_m_materials();
      const physMat0 = materials.at(0);
      physMat0.set_m_kLST(stiffness); // Linear stiffness
      physMat0.set_m_kAST(stiffness); // Angular stiffness
      physMat0.set_m_kVST(stiffness); // Volume stiffness
      this.dynBody.setActivationState(4); // Keep active
    }
  }
  
  setSoftDamping(damping) {
    if (this.dynMesh && this.dynMesh.userData.isSoftBody && this.dynBody) {
      const cfg = this.dynBody.get_m_cfg();
      cfg.set_kDP(damping);
      this.dynBody.setActivationState(4);
    }
  }
  
  setSoftPressure(pressure) {
    if (this.dynMesh && this.dynMesh.userData.isSoftBody && this.dynBody) {
      const cfg = this.dynBody.get_m_cfg();
      cfg.set_kPR(pressure);
      this.dynBody.setActivationState(4);
    }
  }
  
  setSoftIterations(iterations) {
    if (this.dynMesh && this.dynMesh.userData.isSoftBody && this.dynBody) {
      const cfg = this.dynBody.get_m_cfg();
      cfg.set_viterations(iterations);
      cfg.set_piterations(iterations);
      this.dynBody.setActivationState(4);
    }
  }
  
  setSoftContactHardness(hardness) {
    if (this.dynMesh && this.dynMesh.userData.isSoftBody && this.dynBody) {
      const cfg = this.dynBody.get_m_cfg();
      cfg.set_kCHR(hardness);  // Contact hardness rigid
      cfg.set_kKHR(hardness * 0.9);  // Kinetic hardness rigid
      cfg.set_kSHR(hardness);  // Soft-rigid hardness
      this.dynBody.setActivationState(4);
    }
  }
  
  destroy() {
    if (this.dynMesh) {
      this.scene.remove(this.dynMesh);
      
      // Dispose of geometry
      if (this.dynMesh.geometry) {
        this.dynMesh.geometry.dispose();
      }
      
      // Dispose of material(s)
      if (this.dynMesh.material) {
        if (Array.isArray(this.dynMesh.material)) {
          this.dynMesh.material.forEach(mat => {
            if (mat.map) mat.map.dispose();
            if (mat.normalMap) mat.normalMap.dispose();
            if (mat.roughnessMap) mat.roughnessMap.dispose();
            if (mat.metalnessMap) mat.metalnessMap.dispose();
            mat.dispose();
          });
        } else {
          if (this.dynMesh.material.map) this.dynMesh.material.map.dispose();
          if (this.dynMesh.material.normalMap) this.dynMesh.material.normalMap.dispose();
          if (this.dynMesh.material.roughnessMap) this.dynMesh.material.roughnessMap.dispose();
          if (this.dynMesh.material.metalnessMap) this.dynMesh.material.metalnessMap.dispose();
          this.dynMesh.material.dispose();
        }
      }
      
      // Traverse and dispose children (for GLB models with multiple meshes)
      this.dynMesh.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach(mat => mat.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
    }
    
    if (this.dynBody) {
      // Check if it's a soft body
      if (this.dynMesh && this.dynMesh.userData.isSoftBody) {
        this.A.castObject(this.world, this.A.btSoftRigidDynamicsWorld).removeSoftBody(this.dynBody);
      } else {
        this.world.removeRigidBody(this.dynBody);
      }
      this.A.destroy(this.dynBody);
    }
    
    this.dynMesh = null;
    this.dynBody = null;
  }
  
  async start() {
    this.destroy();
    let made;
    
    const params = [
      this.THREE,
      this.A,
      this.scene,
      this.mass,
      this.friction,
      this.restitution,
      this.world
    ];
    
    if (this.shapeType === 'cubeSoft') {
      // Increased subdivision from 4 to 8 for more contact points and better OBB
      made = makeCubeSoft(...params, this.generateRandomCubeTexture, 2, 8);
    } else if (this.shapeType === 'sphere') {
      made = makeSphere(...params, this.generateRandomCubeTexture);
    } else if (this.shapeType === 'puck') {
      made = makePuck(...params, (geom) => makeConvexTriangleMeshShapeFromGeometry(geom, this.A), this.generateRandomCubeTexture);
    } else if (this.shapeType === 'cone') {
      made = makeCone(...params, (geom) => makeConvexTriangleMeshShapeFromGeometry(geom, this.A), this.generateRandomCubeTexture);
    } else if (this.shapeType === 'cube10') {
      made = makeCube(...params, this.generateRandomCubeTexture, 2, 10);
    } else if (this.shapeType === 'custom' && this.customBodyURL) {
      made = await makeCustomBody(...params, this.loader, (geom) => makeConvexTriangleMeshShapeFromGeometry(geom, this.A), this.customBodyURL);
    } else {
      made = makeCube(...params, this.generateRandomCubeTexture, 2, 10);
    }
    
    if (!made) {
      // Fallback to default cube
      made = makeCube(...params, this.generateRandomCubeTexture, 2, 10);
    }
    
    this.dynMesh = made.mesh;
    this.dynBody = made.body;
    this.reset();
  }
  
  reset() {
    if (!this.dynMesh || !this.dynBody) return;
    
    const x = -this.CFG.PLANE_SIZE/2 + 2, y = 4.5, z = 0;
    
    // Check if it's a soft body
    if (this.dynMesh.userData.isSoftBody) {
      // For soft bodies, reset all nodes
      const nodes = this.dynBody.get_m_nodes();
      const nodeCount = nodes.size();
      
      // Get initial positions from stored userData
      const initialPositions = this.dynMesh.userData.initialPositions;
      
      if (initialPositions) {
        // Reset nodes to initial positions with offset
        for (let i = 0; i < nodeCount; i++) {
          const node = nodes.at(i);
          const i3 = i * 3;
          
          // Set position (offset by target position)
          const nodePos = new this.A.btVector3(
            initialPositions[i3] + x,
            initialPositions[i3 + 1] + y,
            initialPositions[i3 + 2] + z
          );
          node.set_m_x(nodePos);
          
          // Set velocity
          const nodeVel = new this.A.btVector3(this.speedX, 0, this.speedZ);
          node.set_m_v(nodeVel);
          
          // Clear forces
          const zeroForce = new this.A.btVector3(0, 0, 0);
          node.set_m_f(zeroForce);
          
          // Also set previous position to current position (to avoid stretching)
          node.set_m_q(nodePos);
        }
        
        // Reset soft body's bounding box and internal state
        try {
          this.dynBody.initializeFaceTree();
        } catch (e) {
          // Method might not be available in all builds
        }
        
        // Reset pose to clear any accumulated deformation
        try {
          this.dynBody.resetLinkRestLengths();
        } catch (e) {
          // Method might not be available
        }
        
        // Activate soft body
        this.dynBody.setActivationState(4);
        
        // Update mesh visually
        if (this.dynMesh.userData.updateSoftBodyMesh) {
          this.dynMesh.userData.updateSoftBodyMesh();
        }
      }
    } else {
      // Regular rigid body
      const tr = new this.A.btTransform();
      tr.setIdentity();
      tr.setOrigin(new this.A.btVector3(x, y, z));
      this.dynBody.setWorldTransform(tr);
      this.dynBody.getMotionState().setWorldTransform(tr);
      this.dynBody.setLinearVelocity(new this.A.btVector3(this.speedX, 0, this.speedZ));
      this.dynBody.setAngularVelocity(new this.A.btVector3(0, 0, 0));
      this.dynBody.clearForces();
      this.dynBody.activate();
      this.dynMesh.position.set(x, y, z);
      this.dynMesh.quaternion.set(0, 0, 0, 1);
    }
  }
  
  getBody() {
    return this.dynBody;
  }
  
  getMesh() {
    return this.dynMesh;
  }
}
