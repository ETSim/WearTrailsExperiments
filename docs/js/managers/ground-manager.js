// GroundManager - Handles ground plane and wall obstacles
import * as THREE from 'three';
import { generateRandomGroundTexture } from '../textures.js';

export class GroundManager {
  constructor(scene, world, A, CFG) {
    this.scene = scene;
    this.world = world;
    this.A = A;
    this.CFG = CFG;
    
    this.ground = null;
    this.groundBody = null;
    this.wallObstacleMesh = null;
    this.wallObstacleBody = null;
  }

  // Initialize ground and obstacles
  init() {
    this.createGround();
    this.createWallObstacle();
    
    return {
      ground: this.ground,
      groundBody: this.groundBody,
      wallObstacleMesh: this.wallObstacleMesh,
      wallObstacleBody: this.wallObstacleBody
    };
  }

  createGround() {
    // Generate ground texture
    const groundTextureCanvas = generateRandomGroundTexture(2048);
    const groundTexture = new THREE.CanvasTexture(groundTextureCanvas);
    groundTexture.wrapS = THREE.RepeatWrapping;
    groundTexture.wrapT = THREE.RepeatWrapping;
    groundTexture.repeat.set(2, 2); // Tile 2x2 for more detail

    // Ground geometry and material
    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(this.CFG.PLANE_SIZE, this.CFG.PLANE_SIZE, 100, 100),
      new THREE.MeshStandardMaterial({
        map: groundTexture,
        roughness: 0.9,
        metalness: 0.1,
        side: THREE.FrontSide
      })
    );
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = 0.00;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    // Ground physics body - SINGLE GROUND PLANE
    const groundShape = new this.A.btBoxShape(new this.A.btVector3(
      this.CFG.PLANE_SIZE / 2, 0.5, this.CFG.PLANE_SIZE / 2
    ));
    const gTr = new this.A.btTransform();
    gTr.setIdentity();
    gTr.setOrigin(new this.A.btVector3(0, -0.5, 0));
    const gMotion = new this.A.btDefaultMotionState(gTr);
    const gInfo = new this.A.btRigidBodyConstructionInfo(0, gMotion, groundShape, new this.A.btVector3(0, 0, 0));
    this.groundBody = new this.A.btRigidBody(gInfo);
    this.groundBody.setFriction(0.5); // Lower friction to prevent sticking
    this.groundBody.setRestitution(0.6); // Moderate restitution
    this.groundBody.setRollingFriction(0.1); // Reduce rolling friction
    this.world.addRigidBody(this.groundBody);
  }

  createWallObstacle() {
    const wallObstacleWidth = 8;
    const wallObstacleHeight = 3;
    const wallObstacleDepth = 0.5;

    // Wall obstacle mesh
    this.wallObstacleMesh = new THREE.Mesh(
      new THREE.BoxGeometry(wallObstacleWidth, wallObstacleHeight, wallObstacleDepth),
      new THREE.MeshStandardMaterial({
        color: 0x888888,
        roughness: 0.8,
        metalness: 0.2,
        side: THREE.FrontSide
      })
    );
    this.wallObstacleMesh.position.set(0, wallObstacleHeight / 2, 0);
    this.wallObstacleMesh.castShadow = true;
    this.wallObstacleMesh.receiveShadow = true;
    this.wallObstacleMesh.visible = false;
    this.scene.add(this.wallObstacleMesh);

    // Wall obstacle physics body
    const wallObstacleShape = new this.A.btBoxShape(new this.A.btVector3(
      wallObstacleWidth / 2, wallObstacleHeight / 2, wallObstacleDepth / 2
    ));
    const wallObstacleTr = new this.A.btTransform();
    wallObstacleTr.setIdentity();
    wallObstacleTr.setOrigin(new this.A.btVector3(0, wallObstacleHeight / 2, 0));
    const wallObstacleMotion = new this.A.btDefaultMotionState(wallObstacleTr);
    const wallObstacleInfo = new this.A.btRigidBodyConstructionInfo(0, wallObstacleMotion, wallObstacleShape, new this.A.btVector3(0, 0, 0));
    this.wallObstacleBody = new this.A.btRigidBody(wallObstacleInfo);
    this.wallObstacleBody.setFriction(0.8);
    this.wallObstacleBody.setRestitution(0.7); // Higher restitution for more elastic bouncing
    // Don't add to world yet - will be added when checkbox is enabled
  }

  // Toggle wall obstacle visibility and physics
  toggleWallObstacle(show) {
    this.wallObstacleMesh.visible = show;
    
    if (show) {
      this.world.addRigidBody(this.wallObstacleBody);
    } else {
      this.world.removeRigidBody(this.wallObstacleBody);
    }
  }

  // Get reset boundary configuration
  getResetBoundary() {
    return {
      boundary: this.CFG.PLANE_SIZE / 2, // Objects reset when exceeding this distance
      yThreshold: -5 // Objects reset when falling below this Y position
    };
  }

  // Check if position is within reset boundaries
  isWithinBounds(x, y, z) {
    const resetBounds = this.getResetBoundary();
    return Math.abs(x) <= resetBounds.boundary && 
           Math.abs(z) <= resetBounds.boundary && 
           y >= resetBounds.yThreshold;
  }

  // Get ground reference
  getGround() {
    return this.ground;
  }

  // Get ground body reference
  getGroundBody() {
    return this.groundBody;
  }

  // Get wall obstacle mesh
  getWallObstacleMesh() {
    return this.wallObstacleMesh;
  }

  // Get wall obstacle body
  getWallObstacleBody() {
    return this.wallObstacleBody;
  }

  // Cleanup method
  dispose() {
    if (this.ground) {
      this.scene.remove(this.ground);
      this.ground = null;
    }
    
    if (this.groundBody) {
      this.world.removeRigidBody(this.groundBody);
      this.groundBody = null;
    }
    
    if (this.wallObstacleMesh) {
      this.scene.remove(this.wallObstacleMesh);
      this.wallObstacleMesh = null;
    }
    
    if (this.wallObstacleBody) {
      this.world.removeRigidBody(this.wallObstacleBody);
      this.wallObstacleBody = null;
    }
  }
}
